// Controller (Gamepads) in den Partyspielen (Nico 30.10.2026: Bluetooth-Controller am Geraet am Fernseher spielen
// gemischt mit Handys in derselben Runde). Jeder Controller ist ein eigener Spieler im Raum: er meldet sich wie ein Handy
// (_hallo) und schickt seine Aktionen ueber dieselbe Schiene - nur eben vom Geraet, an dem er haengt (app.js).
//
// Hier: Tasten abfragen (Gamepad-Schnittstelle des Browsers, "standard"-Belegung), Tastenschilder je Controller-Art,
// Fokus-Steuerung fuer Knoepfe (Steuerkreuz bewegt, A drueckt) und die Minispiele des Partybretts fuer Controller.
// Belegung "standard": 0 = A/Kreuz (unten), 1 = B/Kreis (rechts), 2 = X/Quadrat (links), 3 = Y/Dreieck (oben),
// 9 = Start/Options, 12-15 Steuerkreuz, Achsen 0/1 linker Stick. Der Browser zeigt einen Controller erst nach dem
// ersten Tastendruck - genau der Druck meldet ihn als Mitspieler an.
import { esc } from "./hilfe.js";
import * as R from "./brett_minis.js";

const TOTZONE = 0.5;

// ---------------------------------------------------------------- Art und Tastenschilder
// "kreuz" = Controller mit Kreuz/Kreis/Quadrat/Dreieck, sonst Buchstaben A/B/X/Y (gleiche Lage der Tasten)
export function art(id) {
  const t = String(id || "").toLowerCase();
  if (/xbox|045e|xinput/.test(t)) return "buchstaben";   // zuerst: heisst auch "Wireless Controller"
  return /054c|sony|playstation|dualshock|dualsense|wireless controller/.test(t) ? "kreuz" : "buchstaben";
}
const SCHILD = {
  buchstaben: { a: "A", b: "B", x: "X", y: "Y", start: "☰", select: "⧉" },
  kreuz: { a: "✕", b: "○", x: "□", y: "△", start: "Options", select: "Share" },
};
export const schildText = (a, t) => (SCHILD[a] || SCHILD.buchstaben)[t] || t;
// Tastenhinweis als kleines Schild (beide Beschriftungen, wenn die Art offen ist)
export function taste(a, t) {
  if (t === "kreuz") return `<kbd class="taste taste-kreuz">✚</kbd>`;
  const beide = a === "beide";
  const text = beide ? `${SCHILD.buchstaben[t]}/${SCHILD.kreuz[t]}` : schildText(a, t);
  return `<kbd class="taste taste-${t} ${a === "kreuz" ? "ps" : ""}">${esc(text)}</kbd>`;
}

// ---------------------------------------------------------------- Abfrage je Bild, nur Flanken (frisch gedrueckt)
let hoerer = null;
let laeuft = false;
const vorher = {};
export const moeglich = () => typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";

function zustand(g) {
  const b = (i) => !!(g.buttons && g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
  const ax = g.axes || [];
  return {
    a: b(0), b: b(1), x: b(2), y: b(3), start: b(9), select: b(8),
    hoch: b(12) || ax[1] < -TOTZONE, runter: b(13) || ax[1] > TOTZONE,
    links: b(14) || ax[0] < -TOTZONE, rechts: b(15) || ax[0] > TOTZONE,
  };
}
function takt() {
  let liste = [];
  try { liste = [...(navigator.getGamepads() || [])]; } catch (e) { liste = []; }
  liste.forEach((g) => {
    if (!g || g.connected === false) return;
    const alt = vorher[g.index] || {};
    const jetzt = zustand(g);
    vorher[g.index] = jetzt;
    Object.keys(jetzt).forEach((t) => {
      if (jetzt[t] && !alt[t] && hoerer) { try { hoerer(g, t); } catch (e) { console.error(e); } }
    });
  });
  requestAnimationFrame(takt);
}
export function starten(cb) {
  hoerer = cb;
  if (laeuft || !moeglich()) return;
  laeuft = true;
  requestAnimationFrame(takt);
}

// ---------------------------------------------------------------- Fokus: Steuerkreuz waehlt einen Knopf, A drueckt ihn
let fokusKey = null;
const ZIELE = "#ansage button, #app button:not([disabled]), #app .schalter, #app a.knopf-link";
const schluessel = (el) => el.dataset.a || (el.dataset.ansicht !== undefined ? "ansicht:" + el.dataset.ansicht : "") || el.id || el.textContent.trim().slice(0, 40);
function sichtbar(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; }
// Minispiel-Knoepfe (data-mt) gehoeren dem Handy - Controller spielen in ihrem eigenen Feld (brett_minis.js)
export function ziele() { return [...document.querySelectorAll(ZIELE)].filter((el) => !el.closest(".padbox") && !el.matches("[data-mt]") && sichtbar(el)); }
export function fokus() { const el = document.querySelector(".pad-fokus"); return el && document.contains(el) ? el : null; }
export function fokusSetzen(el) {
  document.querySelectorAll(".pad-fokus").forEach((x) => x.classList.remove("pad-fokus"));
  if (!el) { fokusKey = null; return; }
  el.classList.add("pad-fokus");
  fokusKey = schluessel(el);
  try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* alt */ }
}
// Nach dem Neuzeichnen: derselbe Knopf, sonst der erste Knopf im Spielfeld (nie von selbst Tafel/Uebersicht/Beenden)
export function fokusWiederherstellen() {
  const z = ziele();
  const alt = fokusKey && z.find((el) => schluessel(el) === fokusKey);
  if (alt) return fokusSetzen(alt);
  const feld = z.filter((el) => el.closest(".spielflaeche") && !String(el.dataset.a || "").includes('"_los"'));
  fokusSetzen(feld[0] || z.find((el) => el.matches("#ansage [data-ansage-mit], #ansage [data-ansicht]")) || null);
}
// naechster Knopf in Richtung (Abstand in Laufrichtung zaehlt einfach, quer doppelt)
export function fokusBewegen(richtung) {
  const z = ziele();
  if (!z.length) return;
  const jetzt = fokus();
  if (!jetzt) return fokusSetzen(z.find((el) => el.closest(".spielflaeche")) || z[0]);
  const m = (r) => [r.left + r.width / 2, r.top + r.height / 2];
  const [x0, y0] = m(jetzt.getBoundingClientRect());
  const d = { hoch: [0, -1], runter: [0, 1], links: [-1, 0], rechts: [1, 0] }[richtung];
  let best = null, bestWert = Infinity;
  z.forEach((el) => {
    if (el === jetzt) return;
    const [x, y] = m(el.getBoundingClientRect());
    const vor = (x - x0) * d[0] + (y - y0) * d[1];
    if (vor <= 4) return;
    const quer = Math.abs((x - x0) * d[1]) + Math.abs((y - y0) * d[0]);
    const wert = vor + quer * 2;
    if (wert < bestWert) { bestWert = wert; best = el; }
  });
  if (best) fokusSetzen(best);
}

// ---------------------------------------------------------------- Minispiele des Partybretts mit Controller
// Jeder Controller bekommt ein eigenes Feld; gemessen wird am Geraet selbst (wie am Handy). Gleiche Werte wie die
// Handy-Fassung: Taps in 5 s, Treffer in 12 s, Reaktionszeit in ms (-1 = zu frueh), richtige Ziffern, Schaetzwert.
const FARBEN = { a: ["Grün", "#16a34a"], b: ["Rot", "#e11d48"], x: ["Blau", "#2563eb"], y: ["Gelb", "#ca8a04"] };
const lokal = {};       // padId -> Stand im laufenden Minispiel
let aktiv = null;       // { m, pads: [{pad, j}], schaetz: [frage, loesung] | null, senden(padId, wert) }

const st = (pad, m) => {
  const k = `${m.runde}-${m.art}`;
  if (!lokal[pad.id] || lokal[pad.id].k !== k) {
    lokal[pad.id] = { k, zaehl: 0, start: 0, gesendet: false, punkte: 0, wort: null, ziffern: m.art === "gedaechtnis" ? Array(m.zahl.length).fill(0) : [0], pos: 0 };
  }
  return lokal[pad.id];
};

// HTML fuer alle Controller dieses Geraets im Minispiel (app.js haengt es unter das Spielfeld)
export function miniHTML(m, pads, schaetz, senden) {
  if (!m || m.fertig) { aktiv = null; return ""; }
  const offen = pads.filter(({ j }) => m.werte[j] === undefined);
  aktiv = { m, pads, schaetz, senden };
  if (!pads.length) return "";
  // neue Minispiele (Ausbau 31.10.2026): gleiche Logik wie am Handy, Tasten kommen von miniTaste
  if (R.istNeu(m.art)) pads.forEach(({ pad, j }) => R.anmelden(m, pad.id, (wert, mk) => aktiv && aktiv.senden(pad.id, wert, mk), (t) => taste(pad.art, t), j));
  if (m.art === "reaktion") planeGruen(m);
  if (m.art === "gedaechtnis") planeVerstecken(m);
  return `<div class="padminis ${offen.length ? "" : "alle-fertig"}">${pads.map(({ pad, j }) => `<div class="padbox" id="padbox-${pad.nr}" data-pad="${esc(pad.id)}">
      <div class="padkopf"><span class="farbe f${j % 20}"></span><b>${esc(pad.name)}</b><small>🎮</small></div>
      <div class="padinhalt">${inhalt(pad, j, m)}</div></div>`).join("")}</div>`;
}

let gruenTimer = null, gruenFuer = null, gruenAb = 0;
function planeGruen(m) {
  const k = `${m.runde}-${m.art}`;
  if (gruenFuer === k) return;
  gruenFuer = k; gruenAb = 0;
  clearTimeout(gruenTimer);
  gruenTimer = setTimeout(() => { gruenAb = performance.now(); zeigen(); }, m.warte);
}
let verstecktFuer = null, versteckt = false;
function planeVerstecken(m) {
  const k = `${m.runde}-${m.art}`;
  if (verstecktFuer === k) return;
  verstecktFuer = k; versteckt = false;
  setTimeout(() => { if (verstecktFuer === k) { versteckt = true; zeigen(); } }, 3000);
}

function zifferHTML(s) {
  return `<div class="padziffern">${s.ziffern.map((z, i) => `<span class="${i === s.pos ? "an" : ""}">${z}</span>`).join("")}</div>`;
}
function inhalt(pad, j, m) {
  const a = pad.art;
  if (R.istNeu(m.art)) return m.werte[j] !== undefined ? `<div class="padfertig">✓ Erledigt</div>` : R.html(m, pad.id, (t) => taste(a, t), j);
  const s = st(pad, m);
  if (m.werte[j] !== undefined || s.gesendet) return `<div class="padfertig">✓ Erledigt</div>`;
  if (m.art === "tappen") {
    return `<div class="padflaeche ${s.start ? "gruen" : "rot"}">${s.start ? `${s.zaehl} Taps` : "Los mit"} ${s.start ? "" : taste(a, "a")}</div>
      <small>${taste(a, "a")} so oft du kannst – 5 Sekunden</small>`;
  }
  if (m.art === "reaktion") {
    return `<div class="padflaeche ${gruenAb ? "gruen" : "rot"}">${gruenAb ? "JETZT!" : "Warte …"}</div>
      <small>${taste(a, "a")} drücken, sobald es grün wird. Zu früh = letzter Platz.</small>`;
  }
  if (m.art === "farbwort") {
    const chips = ["a", "b", "x", "y"].map((t) => `<span class="padfarbe" style="background:${FARBEN[t][1]}">${taste(a, t)} ${FARBEN[t][0]}</span>`).join("");
    if (!s.start) return `<div class="padwort">Start mit ${taste(a, "a")}</div><div class="padfarben">${chips}</div>`;
    return `<div class="padwort" style="color:${s.wort[1]}">${esc(s.wort[0])}</div><small>${s.punkte} richtig</small><div class="padfarben">${chips}</div>`;
  }
  if (m.art === "gedaechtnis") {
    if (!versteckt) return `<div class="padwort padzahl">${esc(m.zahl)}</div><small>Merk dir die Zahl!</small>`;
    return `${zifferHTML(s)}<small>${taste("x", "kreuz")} ↑↓ Ziffer · ←→ Stelle · ${taste(a, "a")} abgeben</small>`;
  }
  // Schaetzfrage (die Frage steht gross darueber, brett.js)
  return `${zifferHTML(s)}
    <small>${taste("x", "kreuz")} ↑↓ Ziffer · → Stelle dazu · ${taste(a, "b")} Stelle weg · ${taste(a, "a")} abgeben</small>`;
}

function zeigen() {
  if (!aktiv || R.istNeu(aktiv.m.art)) return;   // neue Minispiele zeichnen ihr Feld selbst
  aktiv.pads.forEach(({ pad, j }) => {
    const box = document.querySelector(`#padbox-${pad.nr} .padinhalt`);
    if (box) { const h = inhalt(pad, j, aktiv.m); if (box.innerHTML !== h) box.innerHTML = h; }
  });
}
export const miniZeigen = zeigen;
export function miniAus() { aktiv = null; }

const neuesWort = (s) => {
  const nam = Object.values(FARBEN);
  const w = nam[Math.floor(Math.random() * 4)], f = nam[Math.floor(Math.random() * 4)];
  s.richtig = f[0]; s.wort = [w[0], f[1]];
};

// -> true, wenn die Taste im Minispiel verbraucht wurde
export function miniTaste(padId, t) {
  if (!aktiv) return false;
  const e = aktiv.pads.find(({ pad }) => pad.id === padId);
  if (!e) return false;
  const { pad, j } = e, m = aktiv.m;
  if (R.istNeu(m.art)) return m.werte[j] !== undefined ? true : R.taste(pad.id, t);
  const s = st(pad, m);
  if (m.werte[j] !== undefined || s.gesendet) return true;
  const fertig = (wert) => { s.gesendet = true; aktiv.senden(pad.id, wert); zeigen(); };
  if (m.art === "tappen") {
    if (t !== "a") return true;
    if (!s.start) { s.start = performance.now(); setTimeout(() => { if (!s.gesendet) fertig(s.zaehl); }, 5000); }
    s.zaehl++;
  } else if (m.art === "reaktion") {
    if (t !== "a") return true;
    fertig(gruenAb ? Math.round(performance.now() - gruenAb) : -1);
    return true;
  } else if (m.art === "farbwort") {
    if (!FARBEN[t]) return true;
    if (!s.start) {
      if (t !== "a") return true;
      s.start = performance.now(); neuesWort(s);
      setTimeout(() => { if (!s.gesendet) fertig(s.punkte); }, 12000);
    } else {
      if (FARBEN[t][0] === s.richtig) s.punkte++; else s.punkte = Math.max(0, s.punkte - 1);
      neuesWort(s);
    }
  } else if (m.art === "gedaechtnis" || m.art === "schaetzen") {
    if (m.art === "gedaechtnis" && !versteckt) return true;
    const z = s.ziffern;
    if (t === "hoch") z[s.pos] = (z[s.pos] + 1) % 10;
    else if (t === "runter") z[s.pos] = (z[s.pos] + 9) % 10;
    else if (t === "links") s.pos = Math.max(0, s.pos - 1);
    else if (t === "rechts") {
      if (s.pos < z.length - 1) s.pos++;
      else if (m.art === "schaetzen" && z.length < 9) { z.push(0); s.pos++; }
    } else if (t === "b" && m.art === "schaetzen" && z.length > 1) { z.splice(s.pos, 1); s.pos = Math.min(s.pos, z.length - 1); }
    else if (t === "a") {
      if (m.art === "gedaechtnis") { let r = 0; for (let x = 0; x < m.zahl.length; x++) if (String(z[x]) === m.zahl[x]) r++; fertig(r); }
      else fertig(Number(z.join("")));
      return true;
    }
  } else return false;
  zeigen();
  return true;
}
