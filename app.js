// Partyspiele: Lobby, Verbindung, Spielablauf. Der Gastgeber haelt den Spielstand und verteilt ihn.
import { Gastgeber, Gast } from "./net.js";
import { SPIELE, GRUPPEN } from "./spiele.js";

const app = document.getElementById("app");
const BASIS = location.href.split("#")[0];
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const meinName = () => localStorage.getItem("pa_name") || "";

let rolle = null;          // "gastgeber" | "gast"
let netz = null;
let raum = null;           // {spieler:[{name, platz, online}], spiel, s}
let ich = 0;               // eigener Index in raum.spieler
let einladungen = {};      // platz -> {link, status}
let gastStatus = "";
let gastAntwort = "";

// ---------------------------------------------------------------- Hilfen
async function teilen(text, titel) {
  if (navigator.share) {
    try { await navigator.share({ title: titel, text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); hinweis("Kopiert – jetzt in WhatsApp einfügen"); }
  catch (e) { prompt("Zum Kopieren:", text); }
}

function hinweis(text) {
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

function vibriere(ms = 60) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ---------------------------------------------------------------- Startbild
function startBild() {
  const hash = location.hash;
  if (hash.startsWith("#a=")) return antwortUebergeben(hash.slice(3));
  const einladung = hash.startsWith("#j=") ? hash.slice(3) : null;
  app.innerHTML = `
    <div class="karte mitte titelbild">
      <div class="logo">🎉</div>
      <h1>Partyspiele</h1>
      <p class="leise">Vier Handys, ein WLAN, kein Server.</p>
      <label>Dein Name<input id="name" maxlength="14" value="${esc(meinName())}" placeholder="z. B. Nico"></label>
      ${einladung
        ? `<button class="gross" id="beitreten">Beitreten</button>`
        : `<button class="gross" id="oeffnen">Lobby öffnen</button>
           <p class="leise klein">Die anderen bekommen von dir einen Einladungslink per WhatsApp.</p>`}
    </div>`;
  const name = () => {
    const n = document.getElementById("name").value.trim();
    if (!n) { hinweis("Bitte zuerst einen Namen eingeben"); return null; }
    localStorage.setItem("pa_name", n);
    return n;
  };
  if (einladung) document.getElementById("beitreten").onclick = () => { const n = name(); if (n) alsGast(n, einladung); };
  else document.getElementById("oeffnen").onclick = () => { const n = name(); if (n) alsGastgeber(n); };
}

// Antwort-Link wurde auf dem Gastgeber-Handy geoeffnet: an den offenen Lobby-Tab weiterreichen
function antwortUebergeben(code) {
  localStorage.setItem("pa_antwort", JSON.stringify({ code, zeit: Date.now() }));
  history.replaceState(null, "", BASIS);
  app.innerHTML = `<div class="karte mitte"><div class="logo">✅</div><h2>Antwort übergeben</h2>
    <p>Wechsle zurück zum Tab mit deiner Lobby. Dieser Tab kann zu.</p>
    <p class="leise klein">Klappt es nicht? Den Antwort-Code in der Lobby unten einfügen.</p>
    <textarea readonly>${esc(code)}</textarea></div>`;
}

// ---------------------------------------------------------------- Gastgeber
function alsGastgeber(name) {
  rolle = "gastgeber";
  ich = 0;
  raum = { spieler: [{ name, platz: 0, online: true }], spiel: null, s: null };
  netz = new Gastgeber(gastNachricht, (platz, status) => {
    einladungen[platz] = { ...(einladungen[platz] || {}), status };
    const sp = raum.spieler.find((x) => x.platz === platz);
    if (sp) sp.online = status === "verbunden";
    if (status === "verbunden") vibriere(120);
    verteilen();
  });
  localStorage.removeItem("pa_antwort");
  window.addEventListener("storage", (ev) => {
    if (ev.key === "pa_antwort" && ev.newValue) antwortEinlesen(JSON.parse(ev.newValue).code);
  });
  history.replaceState(null, "", BASIS);
  zeichnen();
}

async function einladungErzeugen(platz) {
  einladungen[platz] = { status: "erzeuge" };
  zeichnen();
  const code = await netz.einladung(platz);
  einladungen[platz] = { link: `${BASIS}#j=${code}`, status: "wartet" };
  zeichnen();
}

async function antwortEinlesen(text) {
  try {
    const code = text.includes("#a=") ? text.split("#a=")[1] : text;
    const platz = await netz.antwortAnnehmen(code.trim());
    hinweis(`Antwort von Spieler ${platz + 1} angenommen – verbinde …`);
  } catch (e) { hinweis("Das war kein gültiger Antwort-Code"); }
}

function gastNachricht(platz, n) {
  if (n.t === "hallo") {
    let sp = raum.spieler.find((x) => x.platz === platz);
    if (sp) { sp.name = n.name; sp.online = true; }
    else raum.spieler.push({ name: n.name, platz, online: true });
    hinweis(`${n.name} ist dabei`);
    verteilen();
  } else if (n.t === "aktion") {
    const idx = raum.spieler.findIndex((x) => x.platz === platz);
    ausfuehren(idx, n.a);
  }
}

function ausfuehren(idx, a) {
  if (idx < 0) return;
  if (a.typ === "_spielwahl" && idx === 0) {
    const sp = SPIELE.find((x) => x.id === a.id);
    raum.spiel = sp.id;
    raum.s = sp.start(raum.spieler.map((x) => x.name));
    raum.s.anzahl = raum.spieler.length;
  } else if (a.typ === "_ab18" && idx === 0) {
    raum.ab18 = !raum.ab18;
  } else if (a.typ === "_trink" && idx === 0) {
    raum.ohneAlkohol = !raum.ohneAlkohol;
  } else if (a.typ === "_zurueck" && idx === 0) {
    raum.spiel = null; raum.s = null;
  } else if (raum.spiel) {
    const sp = SPIELE.find((x) => x.id === raum.spiel);
    raum.s.anzahl = raum.spieler.length;
    try { sp.aktion(raum.s, idx, a, raum.spieler.map((x) => x.name), raum); } catch (e) { console.error(e); }
  }
  verteilen();
}

function verteilen() {
  if (rolle !== "gastgeber") return;
  raum.spieler.forEach((sp, i) => { if (i > 0) netz.senden(sp.platz, { t: "raum", raum, ich: i }); });
  zeichnen();
}

// ---------------------------------------------------------------- Gast
async function alsGast(name, einladung) {
  rolle = "gast";
  gastStatus = "erzeuge";
  zeichnen();
  netz = new Gast((n) => {
    if (n.t === "raum") { raum = n.raum; ich = n.ich; zeichnen(); }
  }, (status) => {
    gastStatus = status;
    if (status === "verbunden") { netz.senden({ t: "hallo", name }); vibriere(120); }
    zeichnen();
  });
  try {
    gastAntwort = await netz.antwortZu(einladung);
    gastStatus = "antwort";
  } catch (e) { gastStatus = "kaputt"; }
  history.replaceState(null, "", BASIS);
  zeichnen();
}

// ---------------------------------------------------------------- Zeichnen
export function senden(a) {
  if (rolle === "gastgeber") ausfuehren(0, a);
  else netz.senden({ t: "aktion", a });
}

const gesehen = new Set();
function ohneAlkohol(h) {
  return h.replace(/trinkt das Klatschglas aus/g, "bekommt 5 Strafpunkte")
    .replace(/(\d+)\s*Schlucke/g, "$1 Strafpunkte").replace(/(\d+)\s*Schluck\b/g, "$1 Strafpunkt")
    .replace(/einen Schluck/g, "einen Strafpunkt").replace(/\btrinkt\b/g, "bekommt").replace(/\btrinken\b/g, "bekommen")
    .replace(/klatscht/g, "bekommt einen Strafpunkt").replace(/🍺|🍻|🥃/g, "⚡").replace(/Schlucke/g, "Strafpunkte").replace(/Schluck\b/g, "Strafpunkt");
}
function konfetti(n = 90) {
  const farben = ["#ff5fae", "#3fd0ff", "#ffd23f", "#5ef08a", "#6d5dfc", "#ff9600"];
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i");
    d.className = "konfetti";
    d.style.left = Math.random() * 100 + "vw";
    d.style.background = farben[i % farben.length];
    d.style.setProperty("--dx", (Math.random() * 40 - 20) + "vw");
    d.style.setProperty("--dreh", (Math.random() * 1440 - 720) + "deg");
    d.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    d.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }
  vibriere(200);
}

function zeichnen() {
  const fokus = document.activeElement && document.activeElement.id;
  if (rolle === "gast" && !raum) app.innerHTML = gastWarten();
  else if (raum && raum.spiel) {
    app.innerHTML = spielBild();
    const sp = SPIELE.find((x) => x.id === raum.spiel);
    if (sp.nach) try { sp.nach(raum.s, ich, senden, raum.spieler.map((x) => x.name), raum); } catch (e) { console.error(e); }
  }
  else if (raum) app.innerHTML = lobbyBild();
  // Animationen nur beim ersten Erscheinen, Konfetti bei Siegen
  document.querySelectorAll("[data-key]").forEach((el) => {
    const k = el.dataset.key;
    if (gesehen.has(k)) el.classList.add("still"); else gesehen.add(k);
  });
  document.querySelectorAll(".urteil").forEach((el) => {
    const k = "k:" + el.textContent.slice(0, 80);
    if (!gesehen.has(k)) { gesehen.add(k); if (/🏆|gewinnt/.test(el.textContent)) konfetti(); }
    else el.classList.add("still");
  });
  if (gesehen.size > 3000) gesehen.clear();
  if (fokus && document.getElementById(fokus) && document.getElementById(fokus).tagName === "INPUT") {
    document.getElementById(fokus).focus();
  }
}

function gastWarten() {
  if (gastStatus === "erzeuge") return `<div class="karte mitte"><div class="logo spin">⏳</div><p>Bereite die Antwort vor …</p></div>`;
  if (gastStatus === "kaputt") return `<div class="karte mitte"><h2>Einladung ungültig</h2><p>Bitte den Gastgeber um einen neuen Einladungslink.</p></div>`;
  if (gastStatus === "verbunden") return `<div class="karte mitte"><div class="logo spin">🔗</div><p>Verbunden – warte auf die Lobby …</p></div>`;
  if (gastStatus === "fehlgeschlagen" || gastStatus === "getrennt") return `<div class="karte mitte"><h2>Verbindung weg</h2>
      <p>Seid ihr im selben WLAN? Bitte den Gastgeber um einen neuen Einladungslink.</p></div>`;
  const link = `${BASIS}#a=${gastAntwort}`;
  return `<div class="karte mitte">
    <div class="logo">📨</div>
    <h2>Fast geschafft</h2>
    <p>Schick diese Antwort an den Gastgeber zurück. Er tippt sie an – dann seid ihr verbunden.</p>
    <button class="gross" data-teilen="${esc(link)}">Antwort an Gastgeber schicken</button>
    <details><summary>Code anzeigen</summary><textarea readonly>${esc(gastAntwort)}</textarea></details>
    <p class="leise klein">Bleib auf dieser Seite, bis „Verbunden“ erscheint.</p></div>`;
}

function lobbyBild() {
  const liste = [0, 1, 2, 3].map((platz) => {
    const sp = raum.spieler.find((x) => x.platz === platz);
    if (platz === 0) return `<li class="sp an"><span class="farbe f0"></span>${esc(sp.name)} <span class="leise">(Gastgeber${ich === 0 ? ", du" : ""})</span></li>`;
    if (rolle !== "gastgeber") {
      return sp ? `<li class="sp ${sp.online ? "an" : "aus"}"><span class="farbe f${platz}"></span>${esc(sp.name)}${raum.spieler.indexOf(sp) === ich ? " <span class='leise'>(du)</span>" : ""}</li>`
                : `<li class="sp leer">Platz ${platz + 1} frei</li>`;
    }
    const e = einladungen[platz] || {};
    const status = sp && sp.online ? "verbunden" : e.status;
    let knopf = "";
    if (status === "verbunden") knopf = `<span class="ok">✓ verbunden</span>`;
    else if (status === "erzeuge" || status === "verbinde") knopf = `<span class="leise">${status === "erzeuge" ? "erzeuge …" : "verbinde …"}</span>`;
    else if (e.link) knopf = `<button data-teilen="${esc(e.link)}">Einladung teilen</button><button class="klein2" data-neu="${platz}">neu</button>`;
    else knopf = `<button data-neu="${platz}">Einladen</button>`;
    if (status === "fehlgeschlagen" || status === "getrennt") knopf = `<span class="fehler">getrennt</span><button data-neu="${platz}">Neu einladen</button>`;
    return `<li class="sp ${sp ? "an" : "leer"}"><span class="farbe f${platz}"></span>${sp ? esc(sp.name) : `Spieler ${platz + 1}`}<span class="rechts">${knopf}</span></li>`;
  }).join("");
  const kachel = (sp, breit) => `
    <button class="spielkachel ${rolle === "gastgeber" ? "" : "aus"} ${breit ? "breit" : ""}" style="--k1:${(sp.farben || [])[0] || "#3b2f8f"};--k2:${(sp.farben || [])[1] || "#1f1b4d"}" ${rolle === "gastgeber" ? `data-a='${JSON.stringify({ typ: "_spielwahl", id: sp.id })}'` : ""}>
      <span class="emo">${sp.emoji}</span><b>${esc(sp.name)}</b><small>${esc(sp.kurz)}</small></button>`;
  const auswahl = GRUPPEN.map((g) => `<div class="gruppentitel" style="grid-column:span 2">${g.titel}</div>` +
    g.ids.map((id) => SPIELE.find((x) => x.id === id)).filter(Boolean).map((sp) => kachel(sp, g.ids.length < 3)).join("")).join("");
  return `
    <div class="karte">
      <h2>Lobby</h2>
      <ul class="spieler">${liste}</ul>
      ${rolle === "gastgeber" ? `
        <details class="antwort"><summary>Antwort-Code von Hand einfügen</summary>
          <textarea id="antwortfeld" placeholder="Antwort-Link oder Code hier einfügen"></textarea>
          <button id="antwortknopf">Übernehmen</button></details>` : ""}
      <div class="schalter" ${rolle === "gastgeber" ? `data-a='{"typ":"_ab18"}'` : ""}><input type="checkbox" ${raum.ab18 ? "checked" : ""} ${rolle === "gastgeber" ? "" : "disabled"} tabindex="-1">
        <span>🔞 Alle hier sind über 18<br><small class="leise">schaltet die Kategorien Spicy und 18+ frei</small></span></div>
      <div class="schalter" ${rolle === "gastgeber" ? `data-a='{"typ":"_trink"}'` : ""}><input type="checkbox" ${raum.ohneAlkohol ? "checked" : ""} ${rolle === "gastgeber" ? "" : "disabled"} tabindex="-1">
        <span>🧃 Ohne Alkohol spielen<br><small class="leise">statt Schlucken gibt es Strafpunkte</small></span></div>
    </div>
    <div class="karte">
      <h2>${rolle === "gastgeber" ? "Spiel wählen" : "Der Gastgeber wählt ein Spiel …"}</h2>
      <div class="kacheln">${auswahl}</div>
    </div>
    <p class="leise klein mitte">Trinkt verantwortungsvoll – Wasser zählt auch als Schluck. 💧</p>`;
}

function spielBild() {
  const sp = SPIELE.find((x) => x.id === raum.spiel);
  let inhalt;
  try { inhalt = sp.render(raum.s, ich, raum.spieler.map((x) => x.name), raum); if (raum.ohneAlkohol) inhalt = ohneAlkohol(inhalt); }
  catch (e) { console.error(e); inhalt = `<p class="fehler">Anzeigefehler: ${esc(e.message)}</p>`; }
  return `
    <div class="kopf"><span>${sp.emoji} ${esc(sp.name)}</span>
      ${rolle === "gastgeber" ? `<button class="klein2" data-a='{"typ":"_zurueck"}'>Andere Spiele</button>` : ""}</div>
    <div class="spielflaeche">${inhalt}</div>
    <div class="fuss">${raum.spieler.map((x, i) => `<span class="pille ${x.online ? "" : "aus"}"><span class="farbe f${x.platz}"></span>${esc(x.name)}${i === ich ? " (du)" : ""}</span>`).join("")}</div>`;
}

// ---------------------------------------------------------------- Klicks
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-a],[data-teilen],[data-neu],#antwortknopf");
  if (!el) return;
  if (el.dataset.teilen) return teilen(el.dataset.teilen, "Partyspiele");
  if (el.dataset.neu !== undefined) return einladungErzeugen(Number(el.dataset.neu));
  if (el.id === "antwortknopf") {
    const t = document.getElementById("antwortfeld").value;
    if (t.trim()) antwortEinlesen(t);
    return;
  }
  const a = JSON.parse(el.dataset.a);
  if (el.dataset.feld) {
    const f = document.getElementById(el.dataset.feld);
    a.wert = f ? f.value : "";
    if (f && el.dataset.leeren !== undefined) f.value = "";
  }
  vibriere(25);
  senden(a);
});

startBild();
