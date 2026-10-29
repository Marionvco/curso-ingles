// Intermediario: guarda la clave de Gemini escondida y habla con la IA (Interactions API)
const MODELOS = [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.5-flash"].filter(Boolean);
const ESPERA_MAX = 25000; // 25 segundos por modelo

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

function armarConversacion(historial) {
  const lineas = (Array.isArray(historial) ? historial : []).slice(-16).map(m =>
    (m.rol === "profe" ? "Emma: " : "Student: ") + String(m.texto || "").slice(0, 1000)
  );
  if (!lineas.length) return "The class is starting now. Greet the student warmly and ask your first question.";
  return "Conversation so far:\n" + lineas.join("\n") + "\n\nWrite Emma's next turn as JSON.";
}

function extraerTexto(data) {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text) return data.output_text;
  const listas = [data.steps, data.outputs].filter(Array.isArray);
  for (const lista of listas) {
    for (let i = lista.length - 1; i >= 0; i--) {
      const paso = lista[i] || {};
      if (paso.type === "thought") continue;
      if (typeof paso.text === "string" && paso.text) return paso.text;
      const partes = Array.isArray(paso.content) ? paso.content : [];
      const texto = partes.filter(p => p && p.type !== "thought" && typeof p.text === "string").map(p => p.text).join("");
      if (texto) return texto;
    }
  }
  return "";
}

function leerJSON(texto) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(limpio); } catch {}
  const m = limpio.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { reply: limpio, correction: "", tip_es: "" };
}

async function llamarGemini(modelo, key, nivel, tema, historial) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MAX);
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": "2026-05-20" },
      body: JSON.stringify({
        model: modelo,
        system_instruction: instrucciones(nivel, tema),
        input: armarConversacion(historial),
        generation_config: { thinking_level: "low", temperature: 0.8 }
      }),
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
  if (!key) return res.status(500).json({ error: "Falta la clave GEMINI_API_KEY en Vercel" });

  let datos = req.body || {};
  if (typeof datos === "string") { try { datos = JSON.parse(datos); } catch { datos = {}; } }
  const { nivel = "A1", tema = "", historial = [] } = datos;

  let ultimoError = "";
  for (const modelo of MODELOS) {
    console.log("Probando modelo:", modelo);
    try {
      const { ok, status, data } = await llamarGemini(modelo, key, nivel, tema, historial);
      if (!ok) {
        ultimoError = (data && data.error && data.error.message) || `Error ${status}`;
        console.error(`Modelo ${modelo} falló (${status}):`, ultimoError);
        continue;
      }
      const texto = extraerTexto(data);
      if (!texto) {
        ultimoError = "Gemini respondió vacío";
        console.error("Respuesta sin texto:", JSON.stringify(data).slice(0, 800));
        continue;
      }
      const out = leerJSON(texto);
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
