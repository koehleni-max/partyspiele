// Autoscooter am Beamer (Vorschlag 145, Nico 07.11.2026 "dann baue den Rest noch fertig"), seit 08.11.2026 in 3D
// (Partyspiele-Kritik Schritt 3, Nico: "Trash", "soll in 3D sein", "darf nicht ruckeln", "deutlich hochwertiger").
//
// Jeder steuert seinen Wagen am Handy (links / rechts halten, loslassen = geradeaus, dazu Turbo), die Wagen fahren in einer
// 3D-Halle auf der Wand (autoscooter3d.js; klein auch am Handy). Wer einen anderen rammt, punktet: 1 Punkt, von der Seite
// oder von hinten 2. Nach dem Countdown (AS_START) laeuft die Runde AS_ZEIT lang. Computer-Mitspieler fahren mit (jagen den
// naechsten Wagen, weichen der Bande aus).
// Stand und Rechnung nur beim Gastgeber. Den Takt liefern zugFrist/zugAuto (app.js, Spieler 0) und - sitzt dort ein
// Computer - die Computer-Zuege (botPause = AS_TAKT). Handys senden nur ihre Lenk-Stellung, nie Positionen.
//
// Ruckeln (gemessen 08.11.2026, test_autoscooter3d.py): vorher kamen die Positionen 5-mal pro Sekunde und wurden so gezeigt,
// wie sie ankamen - dazu baute jedes Geraet bei jedem Takt die ganze Seite neu auf. Jetzt: Takt 10-mal pro Sekunde, die
// 3D-Ansicht zieht die Wagen zwischen den Staenden weich nach (autoscooter3d.js), das eigene Auto am Handy faehrt sofort
// los (lokal vorausgerechnet mit asFahren, dann sanft angeglichen), und die Seite wird nur neu gebaut, wenn sich wirklich
// etwas Sichtbares aendert (ruhig, app.js).
// Ansicht fuer den Beamer: asAuszug/asHTML/asNach (beamer_spiele.js haengt sie ein). Ohne WebGL bleibt das flache Bild (SVG).
import { esc, knopf, name } from "./hilfe.js";
import { as3dGeht, as3dZeigen, as3dEingabe } from "./autoscooter3d.js";

export const AS_B = 100, AS_H = 60, AS_R = 4;            // Flaeche und Wagen-Radius (Rechen-Einheiten)
export const AS_TAKT = 100, AS_ZEIT = 90000;             // Rechentakt und Rundenzeit (ms); Takt vorher 200
export const AS_START = 3000;                            // Countdown 3-2-1 vor der Fahrt (ms, zaehlt nicht zur Rundenzeit)
export const AS_TEMPO = 16, AS_TURBO = 30, AS_DREH = 2.6; // Einheiten/s, Drehung rad/s
export const AS_TURBO_DAUER = 1200, AS_TURBO_PAUSE = 6000, AS_SPERRE = 900;
export const AS_FARBEN = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#e11d48", "#6366f1"];
const FARBNAME = ["Rot", "Blau", "Grün", "Gelb", "Lila", "Pink", "Türkis", "Orange", "Hellgrün", "Hellblau", "Kirschrot", "Indigo"];
const r1 = (v) => Math.round(v * 10) / 10;
// Restzeit: der Sekundentakt der App zaehlt data-countdown weiter, vorher steht schon die grobe Zahl da
const restUhr = (bis) => `<b data-countdown="${bis}">${Math.max(0, Math.ceil((bis - Date.now()) / 1000))} s</b>`;
export const winkel = (w) => { while (w > Math.PI) w -= 2 * Math.PI; while (w <= -Math.PI) w += 2 * Math.PI; return w; };

function aufstellen(n) {
  return Array.from({ length: n }, (_, j) => {
    const a = (j / Math.max(1, n)) * Math.PI * 2;
    return { x: r1(AS_B / 2 + Math.cos(a) * AS_B * 0.35), y: r1(AS_H / 2 + Math.sin(a) * AS_H * 0.32), w: r1(winkel(a + Math.PI + 0.6)), l: 0, turbo: 0, pause: 0 };
  });
}
// Wie sehr faehrt Wagen c in Richtung (nx, ny)? 1 = genau drauf zu, 0 = quer, < 0 = weg
const drauf = (c, nx, ny) => Math.cos(c.w) * nx + Math.sin(c.w) * ny;

// Fahren eines Wagens ueber dt Sekunden: lenken, fahren, an der Bande abprallen. Eine Quelle fuer den Gastgeber (asSchritt)
// und fuer das Vorausrechnen des eigenen Autos am Handy (autoscooter3d.js)
export function asFahren(c, dt, turboAn) {
  c.w = winkel(c.w + c.l * AS_DREH * dt);
  const v = turboAn ? AS_TURBO : AS_TEMPO;
  c.x += Math.cos(c.w) * v * dt; c.y += Math.sin(c.w) * v * dt;
  if (c.x < AS_R) { c.x = AS_R; c.w = winkel(Math.PI - c.w); }
  if (c.x > AS_B - AS_R) { c.x = AS_B - AS_R; c.w = winkel(Math.PI - c.w); }
  if (c.y < AS_R) { c.y = AS_R; c.w = winkel(-c.w); }
  if (c.y > AS_H - AS_R) { c.y = AS_H - AS_R; c.w = winkel(-c.w); }
}

// Ein Rechenschritt bis "jetzt": fahren, Bande, Zusammenstoesse, Punkte, Zeitende. Vor s.start (Countdown) steht alles.
export function asSchritt(s, jetzt) {
  const von = Math.max(s.zuletzt || 0, s.start || 0);
  const dt = Math.min(0.5, Math.max(0, (jetzt - von) / 1000));
  s.zuletzt = jetzt; s.naechster = jetzt + AS_TAKT;
  s.wagen.forEach((c) => asFahren(c, dt, c.turbo > jetzt));
  const n = s.wagen.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = s.wagen[i], b = s.wagen[j];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 2 * AS_R) continue;
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }
      const nx = dx / d, ny = dy / d, ueber = (2 * AS_R - d) / 2;
      a.x -= nx * ueber; a.y -= ny * ueber; b.x += nx * ueber; b.y += ny * ueber;
      const ta = drauf(a, nx, ny), tb = drauf(b, -nx, -ny), k = `${i}-${j}`;
      if (!(s.sperre[k] > jetzt)) {
        s.sperre[k] = jetzt + AS_SPERRE;
        // wer drauf zu faehrt, punktet; trifft er den anderen von der Seite oder von hinten, doppelt
        const pa = ta > 0.35 ? (tb > 0.35 ? 1 : 2) : 0, pb = tb > 0.35 ? (ta > 0.35 ? 1 : 2) : 0;
        s.punkte[i] += pa; s.punkte[j] += pb;
        s.stoesse++;
        // fuer die Anzeige: wer mit wem, wer wie viel bekam, wie heftig (0..1, beide Wagen auf den Stoss zu)
        const va = a.turbo > jetzt ? AS_TURBO : AS_TEMPO, vb = b.turbo > jetzt ? AS_TURBO : AS_TEMPO;
        const wucht = Math.round(Math.min(1, (Math.max(0, ta) * va + Math.max(0, tb) * vb) / (AS_TURBO * 1.4)) * 100) / 100;
        s.knall = { x: r1((a.x + b.x) / 2), y: r1((a.y + b.y) / 2), t: jetzt, nr: s.stoesse, a: i, b: j, pa, pb, wucht, nx: Math.round(nx * 100) / 100, ny: Math.round(ny * 100) / 100 };
        s.knalle = (s.knalle || []).filter((x) => jetzt - x.t < 1500).concat([s.knall]).slice(-8);
      }
      // abprallen: die Fahrtrichtung am Stoss spiegeln (nur wer drauf zu faehrt)
      if (ta > 0) a.w = winkel(Math.atan2(Math.sin(a.w) - 2 * ta * ny, Math.cos(a.w) - 2 * ta * nx));
      if (tb > 0) b.w = winkel(Math.atan2(Math.sin(b.w) + 2 * tb * ny, Math.cos(b.w) + 2 * tb * nx));
    }
  }
  s.wagen.forEach((c) => {
    c.x = r1(Math.max(AS_R, Math.min(AS_B - AS_R, c.x))); c.y = r1(Math.max(AS_R, Math.min(AS_H - AS_R, c.y))); c.w = Math.round(c.w * 100) / 100;
  });
  if (jetzt >= s.bis) s.phase = "ende";
}

function losFahren(s, n, jetzt) {
  if (s.wagen.length !== n) { s.wagen = aufstellen(n); s.punkte = Array.from({ length: n }, () => 0); }
  Object.assign(s, { phase: "fahrt", start: jetzt + AS_START, bis: jetzt + AS_START + AS_ZEIT, zuletzt: jetzt, naechster: jetzt + AS_TAKT, sperre: {}, stoesse: 0, knall: null, knalle: [] });
}

// ---------------------------------------------------------------- Lenken am Handy
// Links oder rechts HALTEN lenkt, loslassen faehrt geradeaus; zwei Daumen gehen (einer lenkt, einer gibt Turbo).
// Die Knoepfe tragen data-asl (-1 / 1) bzw. data-ast (Turbo); das Festhalten merkt sich das Dokument je Finger, darum
// uebersteht es auch ein Neuzeichnen der Seite. Am PC gehen auch die Pfeiltasten (Pfeil hoch oder Leertaste = Turbo).
const lenkung = { senden: null, l: 0, finger: new Map(), tasten: new Set(), turboLokal: 0, stand: null, ankunft: 0, ich: -1 };
function lenkJetzt() {
  const alle = [...lenkung.finger.values(), ...lenkung.tasten];
  return alle.length ? alle[alle.length - 1] : 0;   // der zuletzt gedrueckte gilt
}
function lenkSenden(turbo = false) {
  const l = lenkJetzt();
  if (l === lenkung.l && !turbo) return;
  lenkung.l = l;
  as3dEingabe(l, turbo);
  document.querySelectorAll("[data-asl]").forEach((k) => k.classList.toggle("an", Number(k.dataset.asl) === l && l !== 0));
  if (lenkung.senden) lenkung.senden(turbo ? { typ: "lenk", l, turbo: true } : { typ: "lenk", l });
}
function turboDruecken() {
  const st = lenkung.stand;
  if (asTurboRest() > 0 || !st || st.phase !== "fahrt" || (st.start || 0) > (st.zuletzt || 0) + (Date.now() - lenkung.ankunft)) return;   // erst nach dem Countdown
  lenkung.turboLokal = Date.now();
  try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* egal */ }
  lenkSenden(true);
}
// Restliche Ladezeit des eigenen Turbos (ms) nach dem letzten Stand, ein eigener Druck zaehlt sofort
export function asTurboRest() {
  const st = lenkung.stand, c = st && st.wagen && st.wagen[lenkung.ich];
  const lokal = lenkung.turboLokal ? lenkung.turboLokal + AS_TURBO_PAUSE - Date.now() : 0;
  if (!c) return Math.max(0, lokal);
  const hostJetzt = (st.zuletzt || 0) + (Date.now() - lenkung.ankunft);
  const rest = (c.pause || 0) - hostJetzt;
  // hat der Gastgeber den Druck schon gesehen, gilt seine Zeit; sonst die eigene Schaetzung
  return Math.max(0, lokal > 0 && rest < lokal - 900 ? lokal : rest);
}
let turboUhr = 0;
function turboAnzeige() {
  turboUhr = 0;
  const k = document.querySelector("#app [data-ast]");
  if (!k) return;
  const rest = asTurboRest(), voll = rest <= 0;
  k.classList.toggle("laedt", !voll);
  k.style.setProperty("--as-laden", `${Math.round((1 - Math.min(1, rest / AS_TURBO_PAUSE)) * 100)}%`);
  const t = voll ? "🚀 TURBO" : "🔋 lädt …";
  const b = k.querySelector("b");
  if (b && b.textContent !== t) b.textContent = t;
  turboUhr = requestAnimationFrame(turboAnzeige);
}
if (typeof document !== "undefined") {
  const lenkKnopf = (ev) => ev.target.closest && ev.target.closest("#app [data-asl], #app [data-ast]");
  document.addEventListener("pointerdown", (ev) => {
    const k = lenkKnopf(ev);
    if (!k) return;
    ev.preventDefault();
    if (k.dataset.ast !== undefined) { turboDruecken(); return; }
    lenkung.finger.delete(ev.pointerId); lenkung.finger.set(ev.pointerId, Number(k.dataset.asl));
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* egal */ }
    lenkSenden();
  }, { capture: true, passive: false });
  const los = (ev) => { if (lenkung.finger.delete(ev.pointerId)) lenkSenden(); };
  ["pointerup", "pointercancel"].forEach((art) => document.addEventListener(art, los, true));
  // kein Kontextmenue / keine Lupe beim langen Druecken
  document.addEventListener("contextmenu", (ev) => { if (lenkKnopf(ev)) ev.preventDefault(); }, true);
  const TASTE = { ArrowLeft: -1, ArrowRight: 1, a: -1, d: 1 };
  document.addEventListener("keydown", (ev) => {
    if (!document.querySelector("#app [data-asl]") || /INPUT|TEXTAREA/.test((ev.target && ev.target.tagName) || "")) return;
    if (TASTE[ev.key] !== undefined) { ev.preventDefault(); if (!ev.repeat) { lenkung.tasten.delete(TASTE[ev.key]); lenkung.tasten.add(TASTE[ev.key]); lenkSenden(); } }
    else if (ev.key === "ArrowUp" || ev.key === " " || ev.key === "w") { ev.preventDefault(); if (!ev.repeat) turboDruecken(); }
  });
  document.addEventListener("keyup", (ev) => { if (TASTE[ev.key] !== undefined && lenkung.tasten.delete(TASTE[ev.key])) lenkSenden(); });
  window.addEventListener("blur", () => { if (lenkung.finger.size || lenkung.tasten.size) { lenkung.finger.clear(); lenkung.tasten.clear(); lenkSenden(); } });
}

// ---------------------------------------------------------------- Stand fuer die Anzeige (Handy und Wand gleich)
// t = Uhr des Gastgebers beim Rechnen (fuer das weiche Nachziehen), wagen: [x, y, w, turbo, l, Turbo-Restladezeit in 0,1 s]
export function asDaten(s) {
  const t = s.zuletzt || 0;
  return { phase: s.phase, runde: s.runde || 1, t, start: s.start || 0, bis: s.bis || 0, stoesse: s.stoesse || 0, punkte: (s.punkte || []).slice(),
    wagen: (s.wagen || []).map((c) => [c.x, c.y, c.w, c.turbo > t ? 1 : 0, c.l || 0, Math.max(0, Math.round(((c.pause || 0) - t) / 100))]),
    knalle: (s.knalle || []).filter((k) => t - k.t < 1500).map((k) => ({ ...k })) };
}

export const autoscooter = {
  id: "autoscooter", weich: false, name: "Autoscooter", emoji: "🚗", farben: ["#f43f5e", "#1e40af"], kurz: "Am Handy lenken, an der Wand rammen – jeder Stoß gibt Punkte",
  start: (namen) => ({ phase: "bereit", dran: 0, wagen: aufstellen(namen.length), punkte: namen.map(() => 0), sperre: {}, stoesse: 0, knall: null, knalle: [], runde: 1 }),
  ergebnis(s) {
    if (s.phase !== "ende") return null;
    const max = Math.max(...s.punkte);
    return max > 0 ? { nr: String(s.runde), sieger: s.punkte.map((p, j) => (p === max ? j : -1)).filter((j) => j >= 0) } : null;
  },
  // Takt: der Gastgeber rechnet alle AS_TAKT ms weiter (Spieler 0 traegt die Frist; ist er ein Computer, takten die Computer-Zuege)
  zugFrist: (s) => (s.phase === "fahrt" ? s.naechster : null),
  zugAuto: () => ({ typ: "takt" }),
  botPause: (s) => (s.phase === "fahrt" ? AS_TAKT : 2000),
  botNochmal: (s) => (s.phase === "fahrt" ? AS_TAKT : 1500),
  // Seite nur neu aufbauen, wenn sich ihr Inhalt aendert (app.js): die Fahrt selbst zeichnet die 3D-Ansicht in nach()
  ruhig: () => as3dGeht(),
  // Computer: auf den naechsten Wagen zu, vor der Bande zur Mitte drehen, Turbo wenn er gerade auf jemanden zielt
  bot(s, i) {
    if (s.phase !== "fahrt") return null;
    const c = s.wagen[i];
    if (!c) return { typ: "takt" };
    const ziel = s.wagen.map((o, j) => [j, Math.hypot(o.x - c.x, o.y - c.y)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1])[0];
    const vx = c.x + Math.cos(c.w) * 10, vy = c.y + Math.sin(c.w) * 10;
    const bande = vx < AS_R * 2 || vx > AS_B - AS_R * 2 || vy < AS_R * 2 || vy > AS_H - AS_R * 2;
    const zx = bande || !ziel ? AS_B / 2 : s.wagen[ziel[0]].x, zy = bande || !ziel ? AS_H / 2 : s.wagen[ziel[0]].y;
    const diff = winkel(Math.atan2(zy - c.y, zx - c.x) - c.w);
    const l = diff > 0.2 ? 1 : diff < -0.2 ? -1 : 0;
    const turbo = !bande && ziel && ziel[1] < 35 && Math.abs(diff) < 0.25 && Date.now() >= c.pause && Date.now() >= (s.start || 0) && Math.random() < 0.5;
    return { typ: "lenk", l, turbo: !!turbo };
  },
  aktion(s, i, a, namen) {
    const n = namen.length, jetzt = Date.now();
    if (s.phase === "bereit") {
      if (a.typ === "los") losFahren(s, n, jetzt);
      return;
    }
    if (s.phase === "fahrt") {
      while (s.wagen.length < n) { s.wagen.push(aufstellen(n)[s.wagen.length]); s.punkte.push(0); }   // Einsteiger mittendrin
      const c = s.wagen[i];
      if (a.typ === "lenk" && c) {
        if ([-1, 0, 1].includes(a.l)) c.l = a.l;
        if (a.turbo && jetzt >= c.pause && jetzt >= (s.start || 0)) { c.turbo = jetzt + AS_TURBO_DAUER; c.pause = jetzt + AS_TURBO_PAUSE; }
      }
      if (jetzt >= (s.naechster || 0) - 30 || jetzt >= s.bis) asSchritt(s, jetzt);
      return;
    }
    if (a.typ === "neustart" && s.phase === "ende") Object.assign(s, autoscooter.start(namen), { runde: (s.runde || 1) + 1 });
  },
  // nach dem Einsetzen (Handy): 3D-Halle in den Kasten (bleibt ueber Neuzeichnungen erhalten), Lenken anbinden
  nach(s, ich, senden) {
    if (lenkung.stand !== s || lenkung.standT !== s.zuletzt) { lenkung.ankunft = Date.now(); lenkung.standT = s.zuletzt; }   // nur ein neuer Stand zaehlt als Ankunft
    lenkung.senden = senden; lenkung.stand = s; lenkung.ich = ich;
    if (s.phase !== "fahrt") { lenkung.turboLokal = 0; lenkung.l = 0; }
    const c = document.querySelector("#app [data-as3d]");
    if (c) {
      const ok = as3dZeigen(c, asDaten(s), { namen: handyNamen, farben: AS_FARBEN, ich, beamer: false });
      if (!ok) c.classList.add("ohne-3d");
    }
    if (!turboUhr && document.querySelector("#app [data-ast]")) turboUhr = requestAnimationFrame(turboAnzeige);
    const st = document.querySelector("#app [data-as-stand]"), h = standHTML(s, ich, handyNamen);
    if (st && st.__h !== h) { st.innerHTML = h; st.__h = h; }
  },
  render(s, ich, namen) {
    handyNamen = namen.slice();
    const farbe = AS_FARBEN[ich % AS_FARBEN.length], drei = as3dGeht();
    // Punktestand: waehrend der Fahrt fuellt ihn nach() (sonst wuerde jeder Stoss die ganze Seite neu bauen)
    const stand = `<div class="punkte as-stand" data-as-stand>${drei && s.phase === "fahrt" ? "" : standHTML(s, ich, namen)}</div>`;
    const regel = `<details class="grundregeln"><summary>📜 So geht's</summary><ul><li>Dein Wagen fährt von selbst – halte ◀ oder ▶ gedrückt zum Lenken, loslassen fährt geradeaus.</li>
      <li>Rammst du jemanden, gibt's 1 Punkt – von der Seite oder von hinten 2.</li><li>🚀 Turbo macht kurz schneller, dann muss er ${AS_TURBO_PAUSE / 1000} Sekunden laden.</li>
      <li>Nach ${AS_ZEIT / 1000} Sekunden ist Schluss, die meisten Punkte gewinnen.</li></ul></details>`;
    const ich_ = `<p class="mitte as-meiner">Dein Wagen: <b style="color:${farbe}">● ${FARBNAME[ich % FARBNAME.length]}</b></p>`;
    // 3D-Kasten: ohne WebGL steht dort das flache Bild (und die Seite wird wie frueher bei jedem Stand neu gebaut)
    const feld = drei ? `<div class="as3d" data-as3d><div class="as3d-warte">🚗</div></div>` : asBild(asAuszug(s), namen, ich);
    if (s.phase === "bereit") {
      return `<div class="frage">🚗 Autoscooter</div>${ich_}${feld}
        <p class="mitte leise">Schaut auf die Wand – dort fahren alle Wagen.</p>${knopf("🏁 Los geht's!", { typ: "los" }, "gross")}${stand}${regel}`;
    }
    if (s.phase === "ende") {
      const max = Math.max(...s.punkte), sieger = namen.map((_, j) => j).filter((j) => s.punkte[j] === max && max > 0);
      return `<div class="urteil gut">🏆 ${sieger.length ? sieger.map((j) => name(namen, j)).join(" & ") : "Niemand"} ${sieger.length > 1 ? "gewinnen" : "gewinnt"}!</div>
        ${feld}<p class="mitte leise">${s.stoesse} Zusammenstöße in dieser Runde.</p>${stand}<i hidden data-ergebnis="as${s.runde}"></i>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    }
    // Fahrt: Uhr und Turbo-Ladung zeichnen 3D-Ansicht und turboAnzeige selbst - die Seite bleibt dabei stehen
    const uhr = drei ? "" : `<p class="mitte">⏱️ ${restUhr(s.bis)} · Dein Wagen: <b style="color:${farbe}">● ${FARBNAME[ich % FARBNAME.length]}</b></p>`;
    const lenk = (l, pfeil, text) => `<button class="as-lenk" data-asl="${l}" aria-label="${text}"><span>${pfeil}</span><small>${text}</small></button>`;
    return `${uhr}${feld}
      <div class="as-pult" style="--as-farbe:${farbe}">${lenk(-1, "◀", "links")}${lenk(1, "▶", "rechts")}
        <button class="as-turbo" data-ast aria-label="Turbo"><i></i><b>🚀 TURBO</b></button></div>${stand}${regel}`;
  },
};
let handyNamen = [];
function standHTML(s, ich, namen) {
  const rang = namen.map((nm, j) => [j, s.punkte[j] || 0]).sort((x, y) => y[1] - x[1]);
  return rang.map(([j, p]) => `<span class="${j === ich ? "as-ich" : ""}"><i class="as-punkt" style="background:${AS_FARBEN[j % AS_FARBEN.length]}"></i>${esc(namen[j])}: <b>${p}</b></span>`).join("");
}

// Beamer: alles am Autoscooter ist oeffentlich - nur das Noetige, gerundet (knall: der letzte Stoss, fuer das flache Bild)
export function asAuszug(s) {
  const d = asDaten(s), jetzt = Date.now();
  d.knall = s.knall && jetzt - s.knall.t < 700 ? s.knall : null;
  return d;
}
// Fahrflaeche als SVG (Rueckfallweg ohne WebGL, Wand und Handy). ich = eigener Wagen hervorgehoben (-1 = keiner)
export function asBild(d, nm, ich = -1, gross = false) {
  const wagen = (d.wagen || []).map(([x, y, w, turbo], j) => {
    const f = AS_FARBEN[j % AS_FARBEN.length], grad = Math.round((w * 180) / Math.PI);
    // Namensschild bleibt in der Halle: am Rand buendig statt mittig, lange Namen gekuerzt
    const roh = String(nm[j] || ""), txt = roh.length > (gross ? 16 : 11) ? `${roh.slice(0, gross ? 15 : 10)}…` : roh;
    const anker = x < 14 ? "start" : x > AS_B - 14 ? "end" : "middle", tx = anker === "start" ? -AS_R : anker === "end" ? AS_R : 0;
    const ty = y < 10 ? AS_R + 3.6 : -AS_R - 1;
    return `<g transform="translate(${x} ${y})"><g transform="rotate(${grad})">
      ${turbo ? `<path d="M-6 -1.6 L-9.5 0 L-6 1.6 Z" fill="#facc15"/>` : ""}
      <circle r="${AS_R}" fill="#111827" stroke="${j === ich ? "#fff" : "#9ca3af"}" stroke-width="${j === ich ? 0.9 : 0.5}"/>
      <rect x="-2.8" y="-2.3" width="5.6" height="4.6" rx="1.4" fill="${f}"/><rect x="0.6" y="-1.6" width="1.6" height="3.2" rx=".5" fill="#e0f2fe"/></g>
      <text x="${tx}" y="${ty}" text-anchor="${anker}" font-size="${gross ? 2.8 : 3.4}" font-weight="700" fill="#fff" stroke="#000" stroke-width=".35" paint-order="stroke">${esc(txt)}</text></g>`;
  }).join("");
  const knall = d.knall ? `<g transform="translate(${d.knall.x} ${d.knall.y})"><path d="M0 -6 L1.5 -2 L6 -2.5 L2.5 0.5 L4.5 5 L0 2.5 L-4.5 5 L-2.5 0.5 L-6 -2.5 L-1.5 -2 Z" fill="#fde047" stroke="#f97316" stroke-width=".6" opacity=".95"/></g>` : "";
  return `<svg class="as-feld ${gross ? "gross" : ""}" viewBox="0 0 ${AS_B} ${AS_H}" preserveAspectRatio="xMidYMid meet">
    <defs><pattern id="as-gitter" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#ffffff14" stroke-width=".4"/></pattern></defs>
    <rect width="${AS_B}" height="${AS_H}" rx="3" fill="#1f2937"/><rect width="${AS_B}" height="${AS_H}" rx="3" fill="url(#as-gitter)"/>
    <rect x=".6" y=".6" width="${AS_B - 1.2}" height="${AS_H - 1.2}" rx="2.6" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="4 2"/>${wagen}${knall}</svg>`;
}
let asStilDa = false;
function asStil() {
  if (asStilDa || typeof document === "undefined") return;
  asStilDa = true;
  document.head.insertAdjacentHTML("beforeend", `<style id="as-stil">
    .as-feld{display:block;width:100%;max-height:42vh;margin:.4em auto;border-radius:10px}
    .as-feld.gross{max-height:72vh}
    .as-punkt{display:inline-block;width:.8em;height:.8em;border-radius:50%;margin-right:4px;vertical-align:-1px}
    .as-stand .as-ich{font-weight:900;outline:2px solid #fff6;border-radius:99px;padding:0 6px}
    .as-meiner{margin:.2em 0}
    .bsas .as-tafel{display:flex;flex-wrap:wrap;gap:1vw;justify-content:center;margin-top:1vh;font-size:1.8vw}
    .as3d{position:relative;width:100%;height:min(66vw,40vh);min-height:190px;margin:.3em 0;border-radius:14px;overflow:hidden;
      background:radial-gradient(ellipse at 50% 35%,#2b1d4d,#0b0716 70%);box-shadow:0 0 0 2px #ffffff1a,0 8px 24px #0008}
    .as3d canvas{display:block;width:100%!important;height:100%!important;touch-action:none}
    .as3d-warte{position:absolute;inset:0;display:grid;place-items:center;font-size:44px;opacity:.5}.as3d.hat-3d .as3d-warte{display:none}
    .as-wand .as3d{height:74vh;max-height:none;margin:0;border-radius:1vw}
    .as-pult{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:.5em 0;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
    .as-lenk,.as-turbo{touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;min-width:0;margin:0;border:0;color:#fff;cursor:pointer}
    .as-lenk{height:min(26vh,150px);border-radius:22px;background:linear-gradient(#3a3f5c,#22253a);box-shadow:inset 0 2px 0 #ffffff26,0 6px 0 #0007;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:transform .06s,background .06s}
    .as-lenk span{font-size:min(15vw,64px);line-height:1;filter:drop-shadow(0 3px 0 #0006)}.as-lenk small{font-size:13px;font-weight:800;opacity:.75;text-transform:uppercase;letter-spacing:.08em}
    .as-lenk.an{background:linear-gradient(var(--as-farbe),#22253a 140%);transform:translateY(4px) scale(.98);box-shadow:inset 0 2px 0 #ffffff40,0 2px 0 #0007,0 0 22px var(--as-farbe)}
    .as-turbo{grid-column:1/3;position:relative;overflow:hidden;height:64px;border-radius:18px;background:#3b1020;box-shadow:inset 0 2px 0 #ffffff26,0 6px 0 #0007}
    .as-turbo i{position:absolute;inset:0;width:var(--as-laden,100%);background:linear-gradient(90deg,#f97316,#ef4444 60%,#facc15);transition:width .1s linear}
    .as-turbo.laedt i{background:linear-gradient(90deg,#334155,#64748b)}
    .as-turbo b{position:relative;font-size:24px;font-weight:900;letter-spacing:.06em;text-shadow:0 2px 0 #0008}
    .as-turbo:not(.laedt){animation:as-turbo-bereit 1s ease-in-out infinite alternate}
    @keyframes as-turbo-bereit{to{box-shadow:inset 0 2px 0 #ffffff40,0 6px 0 #0007,0 0 22px #f97316}}
    .as-turbo:active:not(.laedt){transform:translateY(3px)}
  </style>`);
}
// Beamer: waehrend der Fahrt bleibt das HTML gleich (die Wand baut es dann nicht neu), Uhr, Rangliste und Stoesse zeichnet
// die 3D-Ansicht selbst. Jeder neue Stand geht hier direkt an die laufende 3D-Halle.
let wandNamen = [];
export function asHTML(d, nm, sp, kopf) {
  asStil();
  wandNamen = nm.slice();
  const tafel = nm.map((n, j) => [j, (d.punkte || [])[j] || 0]).sort((x, y) => y[1] - x[1]);
  const max = tafel.length ? tafel[0][1] : 0, sieger = tafel.filter(([, p]) => p === max && max > 0).map(([j]) => esc(nm[j] || ""));
  if (as3dGeht()) {
    as3dZeigen(null, d, { namen: wandNamen, farben: AS_FARBEN, ich: -1, beamer: true });   // nur fuettern, falls die Halle schon steht
    const zeile = d.phase === "ende" ? `🏆 ${sieger.length ? sieger.join(" & ") : "Niemand"} – ${d.stoesse} Zusammenstöße`
      : d.phase === "bereit" ? "Gleich geht's los – am Handy auf „Los geht's!“" : "Rammen, was das Zeug hält – jeder Stoß gibt Punkte!";
    return `<div class="bsas as-wand">${kopf(sp, zeile)}<div class="as3d" data-as3d data-runde="${d.runde || 1}"><div class="as3d-warte">🚗</div></div></div>`;
  }
  const pillen = `<div class="as-tafel">${tafel.map(([j, p]) => `<span class="bm-pille"><i class="as-punkt" style="background:${AS_FARBEN[j % AS_FARBEN.length]}"></i>${esc(nm[j] || "")}: <b>${p}</b></span>`).join("")}</div>`;
  if (d.phase === "ende") return `<div class="bsas">${kopf(sp, `🏆 ${sieger.length ? sieger.join(" & ") : "Niemand"} – ${d.stoesse} Zusammenstöße`)}${asBild(d, nm, -1, true)}${pillen}</div>`;
  const zeile = d.phase === "bereit" ? "Gleich geht's los – am Handy auf „Los geht's!“" : `⏱️ ${restUhr(d.bis)} · ${d.stoesse} Zusammenstöße`;
  return `<div class="bsas">${kopf(sp, zeile)}${asBild(d, nm, -1, true)}${pillen}</div>`;
}
// nach dem Einsetzen an der Wand (beamer_spiele.js): 3D-Halle in den Kasten
export function asNach(el, d) {
  const c = el && el.querySelector("[data-as3d]");
  if (!c || !d) return;
  try { if (!as3dZeigen(c, d, { namen: wandNamen, farben: AS_FARBEN, ich: -1, beamer: true })) c.classList.add("ohne-3d"); } catch (e) { console.error(e); }
}
asStil();
