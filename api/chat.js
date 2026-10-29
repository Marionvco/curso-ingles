// Intermediario: guarda la clave de Gemini escondida y habla con la IA
const MODELOS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean);
const ESPERA_MAX = 20000; // 20 segundos por modelo

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
- If the student made a grammar or vocabulary mistake, write the corrected sentence in "correction". If there was no mistake, leave it empty.
- In "tip_es" write a very short explanation in Spanish of the correction, or a useful tip. It can be empty.
- If the student writes in Spanish, help them say it in English.
Answer ONLY with JSON like this: {"reply": "...", "correction": "...", "tip_es": "..."}`;
}

async function llamarGemini(modelo, key, body) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MAX);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: control.signal
    });
    const data = await r.json();
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(reloj);
  }
}

module.exports = async (req, res) => {
  console.log("Llegó una pregunta a /api/chat");
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });

  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) {
    console.error("No encuentro GEMINI_API_KEY");
    return res.status(500).json({ error: "Falta la clave GEMINI_API_KEY en Vercel" });
  }

  let datos = req.body || {};
  if (typeof datos === "string") { try { datos = JSON.parse(datos); } catch { datos = {}; } }
  const { nivel = "A1", tema = "", historial = [] } = datos;

  const contents = (Array.isArray(historial) ? historial : []).slice(-16).map(m => ({
    role: m.rol === "profe" ? "model" : "user",
    parts: [{ text: String(m.texto || "").slice(0, 1000) }]
  }));
  if (!contents.length || contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Hello! Please start the class." }] });
  }

  const body = {
    system_instruction: { parts: [{ text: instrucciones(nivel, tema) }] },
    contents,
    generationConfig: { temperature: 0.8, responseMimeType: "application/json" }
  };

  let ultimoError = "";
  for (const modelo of MODELOS) {
    console.log("Probando modelo:", modelo);
    try {
      const { ok, status, data } = await llamarGemini(modelo, key, body);
      if (!ok) {
        ultimoError = (data && data.error && data.error.message) || `Error ${status}`;
        console.error(`Modelo ${modelo} falló (${status}):`, ultimoError);
        continue;
      }
      let texto = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
        .map(p => p.text || "").join("");
      texto = texto.replace(/```json|```/g, "").trim();
      let out;
      try { out = JSON.parse(texto); } catch { out = { reply: texto, correction: "", tip_es: "" }; }
      console.log("Respuesta OK con", modelo);
      return res.status(200).json({
        reply: out.reply || "", correction: out.correction || "", tip_es: out.tip_es || "", modelo
      });
    } catch (e) {
      ultimoError = e.name === "AbortError" ? `El modelo ${modelo} tardó demasiado` : e.message;
      console.error(`Modelo ${modelo} error:`, ultimoError);
    }
  }
  return res.status(502).json({ error: ultimoError || "No se pudo conectar con Gemini" });
};
