<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Curso de Inglés con Emma</title>
<style>
  :root { --azul:#2f6fed; --verde:#1fa463; --rojo:#e5484d; --texto:#1d2330; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:linear-gradient(180deg,#eaf1ff,#fff 40%); color:var(--texto); }
  .app { max-width:640px; margin:0 auto; padding:14px 16px 190px; }
  h1 { font-size:1.3rem; margin:4px 0 10px; text-align:center; }
  .controles { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; margin-bottom:10px; }
  select, button { font-size:1rem; border-radius:12px; border:1px solid #cfd6e4; padding:10px 12px; background:#fff; }
  button { cursor:pointer; }
  .interruptor { display:flex; align-items:center; gap:6px; font-size:.95rem; background:#fff; border:1px solid #cfd6e4; border-radius:12px; padding:9px 12px; cursor:pointer; }
  .btn-principal { background:var(--azul); color:#fff; border:none; font-weight:600; }
  .avatar-caja { display:flex; flex-direction:column; align-items:center; margin:6px 0 10px; }
  #avatar { width:170px; height:170px; }
  .estado { font-size:.95rem; color:#5a6478; min-height:1.3em; margin-top:4px; text-align:center; }
  #boca { transform-origin:100px 132px; }
  #avatar.hablando #boca { animation:hablar .22s infinite alternate; }
  @keyframes hablar { from { transform:scaleY(.4); } to { transform:scaleY(1.6); } }
  .ojo { transform-origin:center; animation:parpadeo 4s infinite; }
  @keyframes parpadeo { 0%,92%,100% { transform:scaleY(1); } 95% { transform:scaleY(.1); } }
  #chat { display:flex; flex-direction:column; gap:8px; }
  .burbuja { padding:10px 13px; border-radius:16px; max-width:88%; line-height:1.4; }
  .profe { background:#fff; border:1px solid #dfe5f0; align-self:flex-start; }
  .corrige { background:#fff7e6; border:1px solid #ffd27a; align-self:flex-start; }
  .corrige .titulo { font-size:.85rem; color:#8a6100; font-weight:600; }
  .corrige .frase { font-size:1.05rem; font-weight:600; color:#4a3300; margin:2px 0; }
  .alumno { background:var(--azul); color:#fff; align-self:flex-end; }
  .alumno.eval { background:#fff; color:var(--texto); border:1px solid #dfe5f0; }
  .es { font-size:.9rem; font-style:italic; color:#5a6478; margin-top:4px; }
  .alumno .es { color:#dce7ff; }
  body.sin-es .es { display:none; }
  .tip { margin-top:4px; font-size:.88rem; color:#4d5a70; }
  .acciones { display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; }
  .mini { font-size:.82rem; padding:5px 9px; border-radius:10px; }
  .ok { color:var(--verde); font-weight:600; }
  .mal { color:var(--rojo); font-weight:600; text-decoration:underline wavy; }
  .nota { font-size:.85rem; margin-top:4px; color:#4d5a70; }
  #practica { display:none; background:#eef9f2; border:1px solid #a7e3bf; border-radius:12px; padding:8px 12px; margin-bottom:8px; font-size:.95rem; }
  #practica b { color:#14653d; }
  #intentosTxt { font-size:.85rem; color:#4d5a70; }
  .barra { position:fixed; left:0; right:0; bottom:0; background:#fff; border-top:1px solid #e3e7ef; padding:10px 16px 14px; }
  .barra-int { max-width:640px; margin:0 auto; }
  .fila { display:flex; gap:8px; align-items:center; }
  #texto { flex:1; font-size:1rem; padding:12px; border-radius:12px; border:1px solid #cfd6e4; min-width:0; }
  #mic { width:58px; height:58px; border-radius:50%; border:none; background:var(--verde); color:#fff; font-size:1.6rem; flex-shrink:0; }
  #mic.activo { background:var(--rojo); animation:pulso 1s infinite; }
  @keyframes pulso { 50% { box-shadow:0 0 0 10px rgba(229,72,77,.15); } }
  #enviar { flex-shrink:0; }
  .aviso { text-align:center; color:var(--rojo); font-size:.92rem; margin:6px 0; min-height:1em; }
  .pequeno { font-size:.85rem; padding:7px 10px; }
</style>
</head>
<body>
<div class="app">
  <h1>🇬🇧 Habla inglés con Emma</h1>

  <div class="controles">
    <select id="nivel">
      <option value="A1">A1 · Principiante</option>
      <option value="A2">A2 · Básico</option>
      <option value="B1">B1 · Intermedio</option>
      <option value="B2">B2 · Intermedio alto</option>
      <option value="C1">C1 · Avanzado</option>
    </select>
    <select id="tema">
      <option value="free conversation">Conversación libre</option>
      <option value="introducing yourself">Presentarse</option>
      <option value="ordering food at a restaurant">En el restaurante</option>
      <option value="travel and airports">Viajes y aeropuerto</option>
      <option value="shopping">De compras</option>
      <option value="job interview">Entrevista de trabajo</option>
      <option value="business meetings and sales">Reuniones y ventas</option>
    </select>
    <select id="velocidad">
      <option value="0.75">🐢 Lento</option>
      <option value="0.9" selected>Normal</option>
      <option value="1.05">🐇 Rápido</option>
    </select>
    <label class="interruptor"><input type="checkbox" id="verEs" checked> 🇪🇸 Ver traducción</label>
  </div>

  <div class="controles">
    <button class="btn-principal" id="empezar">▶ Empezar clase</button>
    <button class="pequeno" id="repetir">🔁 Repetir</button>
  </div>

  <div class="avatar-caja">
    <svg id="avatar" viewBox="0 0 200 200" aria-label="Profesora Emma">
      <circle cx="100" cy="100" r="96" fill="#dbe7ff"/>
      <path d="M38 110 Q36 40 100 36 Q164 40 162 110 L162 170 Q130 150 100 150 Q70 150 38 170 Z" fill="#7a4a2a"/>
      <rect x="84" y="140" width="32" height="26" fill="#f2c7a5"/>
      <path d="M50 200 Q52 162 100 158 Q148 162 150 200 Z" fill="#2f6fed"/>
      <ellipse cx="100" cy="102" rx="48" ry="54" fill="#f6d3b6"/>
      <path d="M52 92 Q60 48 100 50 Q140 48 148 92 Q128 68 100 70 Q72 68 52 92 Z" fill="#7a4a2a"/>
      <g class="ojo"><ellipse cx="81" cy="104" rx="6" ry="7" fill="#2b2b2b"/></g>
      <g class="ojo"><ellipse cx="119" cy="104" rx="6" ry="7" fill="#2b2b2b"/></g>
      <path d="M72 92 Q81 87 90 92" stroke="#5a3a22" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M110 92 Q119 87 128 92" stroke="#5a3a22" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="70" cy="122" r="7" fill="#f4a6a0" opacity=".55"/>
      <circle cx="130" cy="122" r="7" fill="#f4a6a0" opacity=".55"/>
      <ellipse id="boca" cx="100" cy="132" rx="11" ry="5" fill="#c4474f"/>
    </svg>
    <div class="estado" id="estado">Elige tu nivel y toca "Empezar clase"</div>
  </div>

  <div class="aviso" id="aviso"></div>
  <div id="chat"></div>
</div>

<div class="barra">
  <div class="barra-int">
    <div id="practica">🎯 Repite en voz alta: <b id="objetivoTxt"></b> <span id="intentosTxt"></span>
      <div class="acciones">
        <button class="mini" id="oirObjetivo">🔊 Escuchar lento</button>
        <button class="mini" id="saltar">⏭ Continuar</button>
      </div>
    </div>
    <div class="fila">
      <input id="texto" placeholder="Habla con 🎤 o escribe aquí..." autocomplete="off">
      <button id="enviar" class="pequeno">Enviar</button>
      <button id="mic" title="Hablar">🎤</button>
    </div>
  </div>
</div>

<script>
const $ = s => document.querySelector(s);
const avatar = $("#avatar");
const MAX_INTENTOS = 3;
let historial = [];
let ultimaRespuesta = "";
let ocupado = false;
let escuchando = false;
let voz = null;
let rec = null;
let objetivo = "";     // frase que el alumno debe repetir
let pendiente = null;  // respuesta de Emma que espera hasta que repitas bien
let intentos = 0;

// Interruptor de traducción (se recuerda en este navegador)
try { if (localStorage.getItem("verEs") === "no") $("#verEs").checked = false; } catch {}
function aplicarVerEs() {
  document.body.classList.toggle("sin-es", !$("#verEs").checked);
  try { localStorage.setItem("verEs", $("#verEs").checked ? "si" : "no"); } catch {}
}
$("#verEs").onchange = aplicarVerEs;
aplicarVerEs();

function cargarVoz() {
  const voces = speechSynthesis.getVoices();
  voz = voces.find(v => /en[-_]US/i.test(v.lang) && /female|samantha|google us english|zira|aria|jenny/i.test(v.name))
     || voces.find(v => /en[-_]US/i.test(v.lang))
     || voces.find(v => /^en/i.test(v.lang)) || null;
}
if ("speechSynthesis" in window) { cargarVoz(); speechSynthesis.onvoiceschanged = cargarVoz; }

function estado(t) { $("#estado").textContent = t; }
function aviso(t) { $("#aviso").textContent = t || ""; }
function turnoAlumno() {
  estado(objetivo ? "Tu turno: toca 🎤 y repite la frase" : "Tu turno: toca 🎤 y habla en inglés");
}
function bajar(el) {
