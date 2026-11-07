// Autoscooter am Beamer (Vorschlag 145, Nico 07.11.2026 "dann baue den Rest noch fertig").
//
// Jeder steuert seinen Wagen am Handy (Links / Gerade / Rechts, dazu Turbo), die Wagen fahren auf der Wand (und klein am
// Handy, falls kein Beamer laeuft). Wer einen anderen rammt, punktet: 1 Punkt, von der Seite oder von hinten 2. Die Runde
// endet nach AS_ZEIT. Computer-Mitspieler fahren mit (jagen den naechsten Wagen, weichen der Bande aus).
// Stand und Rechnung nur beim Gastgeber. Den Takt liefern zugFrist/zugAuto (app.js, Spieler 0) und - sitzt dort ein
// Computer - die Computer-Zuege (botPause = AS_TAKT). Handys senden nur ihre Lenk-Stellung, nie Positionen.
// Ansicht fuer den Beamer: asAuszug/asHTML (beamer_spiele.js haengt sie ein).
import { esc, knopf, name } from "./hilfe.js";

export const AS_B = 100, AS_H = 60, AS_R = 4;            // Flaeche und Wagen-Radius (Rechen-Einheiten)
export const AS_TAKT = 200, AS_ZEIT = 90000;             // Rechentakt und Rundenzeit (ms)
export const AS_TEMPO = 16, AS_TURBO = 30, AS_DREH = 2.6; // Einheiten/s, Drehung rad/s
export const AS_TURBO_DAUER = 1200, AS_TURBO_PAUSE = 6000, AS_SPERRE = 900;
export const AS_FARBEN = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#e11d48", "#6366f1"];
const FARBNAME = ["Rot", "Blau", "Grün", "Gelb", "Lila", "Pink", "Türkis", "Orange", "Hellgrün", "Hellblau", "Kirschrot", "Indigo"];
const r1 = (v) => Math.round(v * 10) / 10;
// Restzeit: der Sekundentakt der App zaehlt data-countdown weiter, vorher steht schon die grobe Zahl da
const restUhr = (bis) => `<b data-countdown="${bis}">${Math.max(0, Math.ceil((bis - Date.now()) / 1000))} s</b>`;
const winkel = (w) => { while (w > Math.PI) w -= 2 * Math.PI; while (w <= -Math.PI) w += 2 * Math.PI; return w; };

function aufstellen(n) {
  return Array.from({ length: n }, (_, j) => {
    const a = (j / Math.max(1, n)) * Math.PI * 2;
    return { x: r1(AS_B / 2 + Math.cos(a) * AS_B * 0.35), y: r1(AS_H / 2 + Math.sin(a) * AS_H * 0.32), w: r1(winkel(a + Math.PI + 0.6)), l: 0, turbo: 0, pause: 0 };
  });
}
// Wie sehr faehrt Wagen c in Richtung (nx, ny)? 1 = genau drauf zu, 0 = quer, < 0 = weg
const drauf = (c, nx, ny) => Math.cos(c.w) * nx + Math.sin(c.w) * ny;

// Ein Rechenschritt bis "jetzt": fahren, Bande, Zusammenstoesse, Punkte, Zeitende
export function asSchritt(s, jetzt) {
  const dt = Math.min(0.5, Math.max(0, (jetzt - s.zuletzt) / 1000));
  s.zuletzt = jetzt; s.naechster = jetzt + AS_TAKT;
  s.wagen.forEach((c) => {
    c.w = winkel(c.w + c.l * AS_DREH * dt);
    const v = c.turbo > jetzt ? AS_TURBO : AS_TEMPO;
    c.x += Math.cos(c.w) * v * dt; c.y += Math.sin(c.w) * v * dt;
    if (c.x < AS_R) { c.x = AS_R; c.w = winkel(Math.PI - c.w); }
    if (c.x > AS_B - AS_R) { c.x = AS_B - AS_R; c.w = winkel(Math.PI - c.w); }
    if (c.y < AS_R) { c.y = AS_R; c.w = winkel(-c.w); }
    if (c.y > AS_H - AS_R) { c.y = AS_H - AS_R; c.w = winkel(-c.w); }
  });
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
        if (ta > 0.35) s.punkte[i] += tb > 0.35 ? 1 : 2;
        if (tb > 0.35) s.punkte[j] += ta > 0.35 ? 1 : 2;
        s.stoesse++;
        s.knall = { x: r1((a.x + b.x) / 2), y: r1((a.y + b.y) / 2), t: jetzt, nr: s.stoesse };
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
  Object.assign(s, { phase: "fahrt", bis: jetzt + AS_ZEIT, zuletzt: jetzt, naechster: jetzt + AS_TAKT, sperre: {}, stoesse: 0, knall: null });
}

export const autoscooter = {
  id: "autoscooter", name: "Autoscooter", emoji: "🚗", farben: ["#f43f5e", "#1e40af"], kurz: "Am Handy lenken, an der Wand rammen – jeder Stoß gibt Punkte",
  start: (namen) => ({ phase: "bereit", dran: 0, wagen: aufstellen(namen.length), punkte: namen.map(() => 0), sperre: {}, stoesse: 0, knall: null, runde: 1 }),
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
    const turbo = !bande && ziel && ziel[1] < 35 && Math.abs(diff) < 0.25 && Date.now() >= c.pause && Math.random() < 0.5;
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
        if (a.turbo && jetzt >= c.pause) { c.turbo = jetzt + AS_TURBO_DAUER; c.pause = jetzt + AS_TURBO_PAUSE; }
      }
      if (jetzt >= (s.naechster || 0) - 30 || jetzt >= s.bis) asSchritt(s, jetzt);
      return;
    }
    if (a.typ === "neustart" && s.phase === "ende") Object.assign(s, autoscooter.start(namen), { runde: (s.runde || 1) + 1 });
  },
  render(s, ich, namen) {
    const d = asAuszug(s), farbe = AS_FARBEN[ich % AS_FARBEN.length];
    const stand = `<div class="punkte">${namen.map((nm, j) => `<span><i class="as-punkt" style="background:${AS_FARBEN[j % AS_FARBEN.length]}"></i>${esc(nm)}: <b>${s.punkte[j] || 0}</b></span>`).join("")}</div>`;
    const regel = `<details class="grundregeln"><summary>📜 So geht's</summary><ul><li>Dein Wagen fährt von selbst – du lenkst nur: ⬅️ links, ⬆️ geradeaus, ➡️ rechts.</li>
      <li>Rammst du jemanden, gibt's 1 Punkt – von der Seite oder von hinten 2.</li><li>🚀 Turbo macht kurz schneller, dann muss er ${AS_TURBO_PAUSE / 1000} Sekunden laden.</li>
      <li>Nach ${AS_ZEIT / 1000} Sekunden ist Schluss, die meisten Punkte gewinnen.</li></ul></details>`;
    const ich_ = `<p class="mitte">Dein Wagen: <b style="color:${farbe}">● ${FARBNAME[ich % FARBNAME.length]}</b></p>`;
    if (s.phase === "bereit") {
      return `<div class="frage">🚗 Autoscooter</div>${ich_}${asBild(d, namen, ich)}
        <p class="mitte leise">Schaut auf die Wand – dort fahren alle Wagen.</p>${knopf("🏁 Los geht's!", { typ: "los" }, "gross")}${stand}${regel}`;
    }
    if (s.phase === "ende") {
      const max = Math.max(...s.punkte), sieger = namen.map((_, j) => j).filter((j) => s.punkte[j] === max && max > 0);
      return `<div class="urteil gut">🏆 ${sieger.length ? sieger.map((j) => name(namen, j)).join(" & ") : "Niemand"} ${sieger.length > 1 ? "gewinnen" : "gewinnt"}!</div>
        <p class="mitte leise">${s.stoesse} Zusammenstöße in dieser Runde.</p>${stand}<i hidden data-ergebnis="as${s.runde}"></i>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    }
    const c = s.wagen[ich] || { l: 0, pause: 0 }, bereit = Date.now() >= c.pause;
    const lenk = (l, t) => knopf(t, { typ: "lenk", l }, `gross as-lenk ${c.l === l ? "gewaehlt" : ""}`, "data-as");
    return `<p class="mitte">⏱️ ${restUhr(s.bis)} · Dein Wagen: <b style="color:${farbe}">● ${FARBNAME[ich % FARBNAME.length]}</b></p>${asBild(d, namen, ich)}
      <div class="as-knoepfe">${lenk(-1, "⬅️")}${lenk(0, "⬆️")}${lenk(1, "➡️")}</div>
      ${knopf(bereit ? "🚀 Turbo" : "🔋 Turbo lädt …", { typ: "lenk", l: c.l, turbo: true }, `gross ${bereit ? "rot" : "zweit"}`, `data-as ${bereit ? "" : "disabled"}`)}${stand}${regel}`;
  },
};

// Beamer: alles am Autoscooter ist oeffentlich - nur das Noetige, gerundet
export function asAuszug(s) {
  const jetzt = Date.now();
  return { phase: s.phase, bis: s.bis || 0, stoesse: s.stoesse || 0, punkte: (s.punkte || []).slice(),
    wagen: (s.wagen || []).map((c) => [c.x, c.y, c.w, c.turbo > jetzt ? 1 : 0]), knall: s.knall && jetzt - s.knall.t < 700 ? s.knall : null };
}
// Fahrflaeche als SVG (Wand und Handy). ich = eigener Wagen hervorgehoben (-1 = keiner)
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
    .as-knoepfe{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:.4em 0}
    .as-knoepfe .as-lenk{font-size:2em;padding:.5em 0;min-width:0;touch-action:manipulation}
    .as-punkt{display:inline-block;width:.8em;height:.8em;border-radius:50%;margin-right:4px;vertical-align:-1px}
    .bsas .as-tafel{display:flex;flex-wrap:wrap;gap:1vw;justify-content:center;margin-top:1vh;font-size:1.8vw}
  </style>`);
}
export function asHTML(d, nm, sp, kopf) {
  asStil();
  const tafel = nm.map((n, j) => [j, (d.punkte || [])[j] || 0]).sort((x, y) => y[1] - x[1]);
  const pillen = `<div class="as-tafel">${tafel.map(([j, p]) => `<span class="bm-pille"><i class="as-punkt" style="background:${AS_FARBEN[j % AS_FARBEN.length]}"></i>${esc(nm[j] || "")}: <b>${p}</b></span>`).join("")}</div>`;
  if (d.phase === "ende") {
    const max = tafel.length ? tafel[0][1] : 0, sieger = tafel.filter(([, p]) => p === max && max > 0).map(([j]) => esc(nm[j] || ""));
    return `<div class="bsas">${kopf(sp, `🏆 ${sieger.length ? sieger.join(" & ") : "Niemand"} – ${d.stoesse} Zusammenstöße`)}${asBild(d, nm, -1, true)}${pillen}</div>`;
  }
  const zeile = d.phase === "bereit" ? "Gleich geht's los – am Handy auf „Los geht's!“" : `⏱️ ${restUhr(d.bis)} · ${d.stoesse} Zusammenstöße`;
  return `<div class="bsas">${kopf(sp, zeile)}${asBild(d, nm, -1, true)}${pillen}</div>`;
}

// Druecken statt Tippen: der Lenk-Knopf loest schon beim Herunterdruecken aus. Der Stand kommt mehrmals pro Sekunde neu,
// dabei wird das Handy-Bild ersetzt - ein normaler Klick (Druecken + Loslassen) ginge dann oft verloren. Doppelt
// ausgeloest schadet nicht: die Lenk-Stellung wird nur gesetzt, der Turbo hat eine Ladepause.
if (typeof document !== "undefined") {
  asStil();
  document.addEventListener("pointerdown", (ev) => {
    const el = ev.target.closest && ev.target.closest("button[data-as]");
    if (el && !el.disabled) el.click();
  }, true);
}
