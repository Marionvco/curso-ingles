// Intermediario: Groq (rápido y gratis) primero, Gemini de respaldo.
// Dos trabajos en paralelo: Emma conversa y un "revisor" corrige al alumno.
const GROQ_MODELOS = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "llama-3.1-8b-instant"].filter(Boolean);
const GEMINI_MODELOS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.5-flash"].filter(Boolean);

const NIVELES = {
  A1: "Beginner (A1). Use very short, simple sentences, present tense and very common words.",
  A2: "Elementary (A2). Use short sentences, simple past and future, everyday vocabulary.",
  B1: "Intermediate (B1). Use natural everyday English, some phrasal verbs, ask for opinions.",
  B2: "Upper intermediate (B2). Use fluent natural English, idioms sometimes, discuss ideas.",
  C1: "Advanced (C1). Speak like a native, rich vocabulary, debate and nuance."
};

function instruccionesEmma(nivel, tema) {
  return `You are "Emma", a friendly English teacher talking by voice with a Spanish-speaking student from Chile.
Student level: ${NIVELES[nivel] || NIVELES.A1}
Conversation topic: ${tema || "free conversation"}.
Rules:
- Reply in English in 1 to 3 short sentences and always end with a question for the student.
- Your reply will be read aloud, so never use emojis, lists or markdown.
- Do not correct the student here (another teacher does that). Just continue the conversation naturally.
- In "reply_es" write a natural Spanish (Chile) translation of your reply.
Answer ONLY with JSON like this, nothing else: {"reply": "...", "reply_es": "..."}`;
}

function instruccionesRevisor(nivel) {
  return `You are a strict but kind English teacher checking ONE answer from a Spanish-speaking student.
Student level: ${NIVELES[nivel] || NIVELES.A1}
You receive the teacher's question and the student's answer (captured by speech recognition, so ignore capital letters and punctuation).
Decide if the answer is a COMPLETE, grammatically correct and natural English sentence that answers the question.
Mark it as NOT ok ("ok": false) when:
- it is one word or a fragment, for example "yes", "no", "fine", "I like", "one sandwich", "pizza"
- it has grammar mistakes: verb tense, third person "s", plurals, articles, prepositions, word order
- it uses a wrong word, or a word that makes no sense in context (probably mispronounced)
- it does not really answer the question
- it is written in Spanish
When NOT ok, write in "correction" the best complete and natural sentence the student should say, short and at the student's level.
Examples:
Q "Do you like to fly?" A "yes" -> "Yes, I like to fly."
Q "What would you like to eat?" A "one sandwich" -> "I would like a sandwich, please."
Q "How are you?" A "fine" -> "I am fine, thank you."
A "I has two sons" -> "I have two sons."
A "I like summer" when talking about food -> "I like soup." (tip: maybe "soup" was not pronounced clearly)
In "tip_es" explain very briefly in Spanish what was wrong and the rule.
In "student_es" translate the student's answer to Spanish.
If the answer is complete and correct, use "ok": true and leave "correction" and "tip_es" empty.
Answer ONLY with JSON like this, nothing else: {"ok": true, "correction": "", "tip_es": "", "student_es": "..."}`;
}

function leerJSON(texto) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch {}
  const m = limpio.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function conEspera(ms, fn) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ms);
  try { return await fn(control.signal); } finally { clearTimeout(reloj); }
}

// ---------- GROQ ----------
async function llamarGroq(modelo, key, sistema, mensajes, temperatura) {
  const cuerpo = {
    model: modelo,
    messages: [{ role: "system", content: sistema }, ...mensajes],
    temperature: temperatura,
    response_format: { type: "json_object" }
  };
  if (modelo.startsWith("openai/gpt-oss")) cuerpo.reasoning_effort = "low";
  return conEspera(15000, async signal => {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify(cuerpo),
      signal
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data && data.error && data.error.message) || `Error ${r.status}`);
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  });
}

// ---------- GEMINI (respaldo) ----------
function extraerTextoGemini(data) {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text) return data.output_text;
  for (const lista of [data.steps, data.outputs].filter(Array.isArray)) {
    for (let i = lista.length - 1; i >= 0; i--) {
      const paso = lista[i] || {};
      if (paso.type === "thought") continue;
      if (typeof paso.text === "string" && paso.text) return paso.text;
      const partes = Array.isArray(paso.content) ? paso.content : [];
      const t = partes.filter(p => p && p.type !== "thought" && typeof p.text === "string").map(p => p.text).join("");
      if (t) return t;
    }
  }
  return "";
}

async function llamarGemini(modelo, key, sistema, mensajes, temperatura) {
  const input = mensajes.map(m => (m.role === "assistant" ? "Emma: " : "Student: ") + m.content).join("\n")
    + "\n\nAnswer only with the JSON.";
  return conEspera(25000, async signal => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model: modelo,
        system_instruction: sistema,
        input,
        generation_config: { thinking_level: "low", temperature: temperatura }
      }),
      signal
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data && data.error && data.error.message) || `Error ${r.status}`);
    return extraerTextoGemini(data);
  });
}

// Prueba Groq y luego Gemini hasta obtener un JSON válido
async function pedirJSON(nombreTarea, sistema, mensajes, temperatura) {
  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
  const intentos = [];
  if (groqKey) for (const m of GROQ_MODELOS) intentos.push({ nombre: "groq:" + m, fn: () => llamarGroq(m, groqKey, sistema, mensajes, temperatura) });
  if (geminiKey) for (const m of GEMINI_MODELOS) intentos.push({ nombre: "gemini:" + m, fn: () => llamarGemini(m, geminiKey, sistema, mensajes, temperatura) });
  if (!intentos.length) throw new Error("Faltan las claves GROQ_API_KEY o GEMINI_API_KEY en Vercel");

  let ultimoError = "";
  for (const intento of intentos) {
    try {
      const texto = await intento.fn();
      const json = leerJSON(texto);
      if (json) { console.log(nombreTarea, "OK con", intento.nombre); return json; }
      ultimoError = "Respuesta sin JSON";
      console.error(nombreTarea, intento.nombre, "respondió sin JSON");
    } catch (e) {
      ultimoError = e.name === "AbortError" ? `${intento.nombre} tardó demasiado` : e.message;
      console.error(nombreTarea, intento.nombre, "falló:", ultimoError);
    }
  }
  throw new Error(ultimoError || "No se pudo conectar con la IA");
}

function simple(t) {
  return String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// ---------- PRINCIPAL ----------
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });

  let datos = req.body || {};
  if (typeof datos === "string") { try { datos = JSON.parse(datos); } catch { datos = {}; } }
  const { nivel = "A1", tema = "" } = datos;
  const historial = (Array.isArray(datos.historial) ? datos.historial : []).slice(-16);

  // Conversación para Emma
  const mensajes = historial.map(m => ({
    role: m.rol === "profe" ? "assistant" : "user",
    content: String(m.texto || "").slice(0, 1000)
  }));
  if (!mensajes.length) mensajes.push({ role: "user", content: "Hello! Please start the class." });
  if (mensajes[mensajes.length - 1].role === "assistant") mensajes.push({ role: "user", content: "Please continue." });

  // Última respuesta del alumno y la pregunta de Emma anterior
  const ultimo = historial[historial.length - 1];
  const respuestaAlumno = ultimo && ultimo.rol !== "profe" ? String(ultimo.texto || "") : "";
  let preguntaEmma = "";
  for (let i = historial.length - 2; i >= 0; i--) {
    if (historial[i].rol === "profe") { preguntaEmma = String(historial[i].texto || ""); break; }
  }

  try {
    const tareaEmma = pedirJSON("Emma", instruccionesEmma(nivel, tema), mensajes, 0.8);
    const tareaRevisor = respuestaAlumno
      ? pedirJSON("Revisor", instruccionesRevisor(nivel), [{
          role: "user",
          content: `Teacher's question: "${preguntaEmma || "(start of class)"}"\nStudent's answer: "${respuestaAlumno}"`
        }], 0.2).catch(e => { console.error("Revisor falló:", e.message); return null; })
      : Promise.resolve(null);

    const [emma, revision] = await Promise.all([tareaEmma, tareaRevisor]);

    let correction = "";
    let tip_es = "";
    if (revision && revision.ok === false && revision.correction && simple(revision.correction) !== simple(respuestaAlumno)) {
      correction = revision.correction;
      tip_es = revision.tip_es || "";
    }

    return res.status(200).json({
      reply: emma.reply || "",
      reply_es: emma.reply_es || "",
      student_es: (revision && revision.student_es) || "",
      correction,
      tip_es
    });
  } catch (e) {
    return res.status(502).json({ error: e.message || "No se pudo conectar con la IA" });
  }
};
