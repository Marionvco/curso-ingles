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
- In "reply_es" write a natural Spanish (Chile) translation of your reply.
- In "student_es" write a Spanish translation of the student's last message. Leave it empty if there is no student message yet.
- If the student's last message had a grammar or vocabulary mistake, write the corrected sentence in "correction". If there was no mistake, leave it empty.
- In "tip_es" write a very short explanation in Spanish of the correction, or a useful tip. It can be empty.
- If the student writes in Spanish, help them say it in English.
Answer ONLY with JSON like this, nothing else: {"reply": "...", "reply_es": "...", "student_es": "...", "correction": "...", "tip_es": "..."}`;
}

function leerJSON(texto) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch {}
  const m = limpio.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { reply: limpio };
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
