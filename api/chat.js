// Intermediario: Groq (rápido y gratis) primero, Gemini de respaldo
const GROQ_MODELOS = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "llama-3.1-8b-instant"].filter(Boolean);
const GEMINI_MODELOS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.5-flash"].filter(Boolean);

const NIVELES = {
  A1: "Beginner (A1). Use very short, simple sentences, present tense and very common words.",
  A2: "Elementary (A2). Use short sentences, simple past and future, everyday vocabulary.",
  B1: "Intermediate (B1). Use natural everyday English, some phrasal verbs, ask for opinions.",
  B2: "Upper intermediate (B2). Use fluent natural English, idioms sometimes, discuss ideas.",
  C1: "Advanced (C1). Speak like a native, rich vocabulary, debate and nuance."
};

function instrucciones(nivel, tema) {
  return `You are "Emma", a friendly and patient English teacher talking by voice with a Spanish-speaking student from Chile.
Student level: ${NIVELES[nivel] || NIVELES.A1}
Conversation topic: ${tema || "free conversation"}.
Rules:
- Keep the conversation going: reply in English in 1 to 3 short sentences and always end with a question for the student.
- Your reply will be read aloud, so never use emojis, lists or markdown.
- If the student's last message had a grammar or vocabulary mistake, write the corrected sentence in "correction". If there was no mistake, leave it empty.
- In "tip_es" write a very short explanation in Spanish of the correction, or a useful tip. It can be empty.
- If the student writes in Spanish, help them say it in English.
Answer ONLY with JSON like this, nothing else: {"reply": "...", "correction": "...", "tip_es": "..."}`;
}

function leerJSON(texto) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch {}
  const m = limpio.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { reply: limpio, correction: "", tip_es: "" };
}

async function conEspera(ms, fn) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ms);
  try { return await fn(control.signal); } finally { clearTimeout(reloj); }
}

// ---------- GROQ ----------
async function preguntarGroq(modelo, key, nivel, tema, historial) {
  const mensajes = [{ role: "system", content: instrucciones(nivel, tema) }];
  const previos = (Array.isArray(historial) ? historial : []).slice(-16);
  if (!previos.length) mensajes.push({ role: "user", content: "Hello! Please start the class." });
  for (const m of previos) {
    mensajes.push({ role: m.rol === "profe" ? "assistant" : "user", content: String(m.texto || "").slice(0, 1000) });
  }
  if (mensajes[mensajes.length - 1].role === "assistant") mensajes.push({ role: "user", content: "Please continue." });

  const cuerpo = { model: modelo, messages: mensajes, temperature: 0.8, response_format: { type: "json_object" } };
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

async function preguntarGemini(modelo, key, nivel, tema, historial) {
  const lineas = (Array.isArray(historial) ? historial : []).slice(-16).map(m =>
    (m.rol === "profe" ? "Emma: " : "Student: ") + String(m.texto || "").slice(0, 1000));
  const input = lineas.length
    ? "Conversation so far:\n" + lineas.join("\n") + "\n\nWrite Emma's next turn as JSON."
    : "The class is starting now. Greet the student warmly and ask your first question.";

  return conEspera(25000, async signal => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model: modelo,
        system_instruction: instrucciones(nivel, tema),
        input,
        generation_config: { thinking_level: "low", temperature: 0.8 }
      }),
      signal
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data && data.error && data.error.message) || `Error ${r.status}`);
    return extraerTextoGemini(data);
  });
}

// ---------- PRINCIPAL ----------
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });

  let datos = req.body || {};
  if (typeof datos === "string") { try { datos = JSON.parse(datos); } catch { datos = {}; } }
  const { nivel = "A1", tema = "", historial = [] } = datos;

  const groqKey = (process.env.GROQ_API_KEY || "").trim();
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

  const intentos = [];
  if (groqKey) for (const m of GROQ_MODELOS) intentos.push({ nombre: "groq:" + m, fn: () => preguntarGroq(m, groqKey, nivel, tema, historial) });
  if (geminiKey) for (const m of GEMINI_MODELOS) intentos.push({ nombre: "gemini:" + m, fn: () => preguntarGemini(m, geminiKey, nivel, tema, historial) });
  if (!intentos.length) return res.status(500).json({ error: "Faltan las claves GROQ_API_KEY o GEMINI_API_KEY en Vercel" });

  let ultimoError = "";
  for (const intento of intentos) {
    console.log("Probando", intento.nombre);
    try {
      const texto = await intento.fn();
      if (!texto) { ultimoError = "Respuesta vacía"; console.error(intento.nombre, "respondió vacío"); continue; }
      const out = leerJSON(texto);
      console.log("Respuesta OK con", intento.nombre);
      return res.status(200).json({
        reply: out.reply || "", correction: out.correction || "", tip_es: out.tip_es || "", modelo: intento.nombre
      });
    } catch (e) {
      ultimoError = e.name === "AbortError" ? `${intento.nombre} tardó demasiado` : e.message;
      console.error(intento.nombre, "falló:", ultimoError);
    }
  }
  return res.status(502).json({ error: ultimoError || "No se pudo conectar con la IA" });
};
