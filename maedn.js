// Mensch ärgere dich nicht fuer bis zu 8 Spieler (Vorschlag 147, Nico 07.11.2026 "dann baue den Rest noch fertig").
//
//   Brett     bis 4 Spieler das klassische Brett (4 Arme, 40 Felder), ab 5 Spielern ein grosses Brett mit 8 Armen
//             (80 Felder). Je Arm 10 Felder, 4 Figuren im Haus, 4 Zielfelder. Mehr als 8 Leute: die ersten 8 spielen,
//             der Rest schaut zu.
//   Regeln    Mit einer 6 raus aufs Startfeld, nach einer 6 nochmal wuerfeln. Steht keine Figur auf der Bahn, gibt es
//             drei Versuche fuer die 6. Wer auf einer fremden Figur landet, wirft sie raus (zurueck ins Haus).
//             Schlagzwang: kann der Wurf eine fremde Figur schlagen, muss ein Schlag-Zug gewaehlt werden (maednZuege).
//             Eigene Figuren blockieren, im Ziel wird nicht uebersprungen. Wer zuerst alle 4 im Ziel hat, gewinnt.
//   Handy     Wuerfeln und Figur waehlen (Knopf je ziehbarer Figur, dazu ein kleines Brett).
//   Beamer    das ganze Brett gross (maednAuszug/maednHTML, beamer_spiele.js haengt sie ein) - alles daran ist oeffentlich.
//   Computer  Computer-Mitspieler fuellen auf (Knopf in der Spielerliste); sie werfen gern raus und bringen Figuren heim.
// Zustand und Zufall nur beim Gastgeber.
import { esc, knopf, zufall, name } from "./hilfe.js";

export const MAEDN_MAX = 8, FIGUREN = 4, ARM = 10;
export const MAEDN_FARBEN = ["#dc2626", "#2563eb", "#16a34a", "#eab308", "#9333ea", "#ea580c", "#0891b2", "#db2777"];
export const MAEDN_FARBNAMEN = ["Rot", "Blau", "Grün", "Gelb", "Lila", "Orange", "Türkis", "Pink"];
const WUERFEL = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// Brettgroesse und Sitz je Spieler (Spieler gleichmaessig auf die Arme verteilt)
export const maednArme = (n) => (n <= 4 ? 4 : 8);
export const maednSitz = (j, n) => Math.floor((j * maednArme(n)) / n);
export const maednLaenge = (n) => maednArme(n) * ARM;
// rel: -1 Haus, 0..L-1 Bahn (0 = eigenes Startfeld), L..L+3 Ziel. Absolute Bahnnummer:
export const maednAbs = (j, rel, n) => (maednSitz(j, n) * ARM + rel) % maednLaenge(n);

// Wohin kommt Figur f von Spieler j mit Wurf w? -> neues rel oder null (nicht moeglich)
export function maednZiel(s, j, f, w) {
  const n = s.n, L = maednLaenge(n), eig = s.fig[j], r = eig[f];
  if (r === -1) return w === 6 && !eig.includes(0) ? 0 : null;
  const nr = r + w;
  if (nr > L + FIGUREN - 1) return null;
  if (nr >= L) {   // ins Ziel: kein eigenes Feld dazwischen ueberspringen und kein besetztes Feld
    for (let k = Math.max(r + 1, L); k <= nr; k++) if (eig.includes(k)) return null;
    return nr;
  }
  return eig.includes(nr) ? null : nr;
}
const maednMoeglich = (s, j, w) => Array.from({ length: FIGUREN }, (_, f) => f).filter((f) => maednZiel(s, j, f, w) !== null);
// Schlagzwang (Nico 07.11.2026 "Rauswerfen Pflicht"): Zuege, die eine fremde Figur schlagen
export function maednSchlaege(s, j, w) {
  const L = maednLaenge(s.n);
  return maednMoeglich(s, j, w).filter((f) => {
    const nr = maednZiel(s, j, f, w);
    if (nr >= L) return false;
    const b = besetzt(s, maednAbs(j, nr, s.n));
    return !!b && b[0] !== j;
  });
}
// Erlaubte Zuege: kann man schlagen, nur die Schlag-Zuege, sonst alle moeglichen
export const maednZuege = (s, j, w) => { const sch = maednSchlaege(s, j, w); return sch.length ? sch : maednMoeglich(s, j, w); };
export const maednZwang = (s) => s.phase === "ziehen" && !!s.wurf && s.dran < s.n && maednSchlaege(s, s.dran, s.wurf).length > 0;
// Darf dreimal wuerfeln: keine Figur auf der Bahn, und alles im Ziel steht schon ganz hinten (nichts mehr aufzuruecken)
export function maednDreiVersuche(s, j) {
  const L = maednLaenge(s.n), eig = s.fig[j];
  if (eig.some((r) => r >= 0 && r < L)) return false;
  const imZiel = eig.filter((r) => r >= L).sort((a, b) => b - a);
  return imZiel.every((r, k) => r === L + FIGUREN - 1 - k);
}
// Welche fremde Figur steht auf diesem Bahnfeld? -> [k, g] oder null
function besetzt(s, abs) {
  const L = maednLaenge(s.n);
  for (let k = 0; k < s.n; k++) for (let g = 0; g < FIGUREN; g++) {
    const r = s.fig[k][g];
    if (r >= 0 && r < L && maednAbs(k, r, s.n) === abs) return [k, g];
  }
  return null;
}
function naechster(s) { s.dran = (s.dran + 1) % s.n; s.wurf = null; s.versuche = 0; s.phase = "wuerfeln"; }

function ziehen(s, j, f) {
  const w = s.wurf, nr = maednZiel(s, j, f, w), L = maednLaenge(s.n);
  if (nr === null || !maednZuege(s, j, w).includes(f)) return false;   // Schlagzwang: Nicht-Schlag-Zug abgelehnt
  const alt = s.fig[j][f];
  let raus = null;
  if (nr < L) {
    const b = besetzt(s, maednAbs(j, nr, s.n));
    if (b && b[0] !== j) { s.fig[b[0]][b[1]] = -1; raus = b[0]; s.rausgeworfen[j] = (s.rausgeworfen[j] || 0) + 1; }
  }
  s.fig[j][f] = nr;
  s.letzt = { j, f, von: alt, nach: nr, w, raus };
  if (s.fig[j].every((r) => r >= L)) { s.sieger = j; s.phase = "ende"; return true; }
  if (w === 6) { s.wurf = null; s.versuche = 0; s.phase = "wuerfeln"; } else naechster(s);
  return true;
}

export const maedn = {
  id: "maedn", name: "Mensch ärgere dich nicht", emoji: "🎲", farben: ["#dc2626", "#16a34a"], kurz: "Bis zu 8 Spieler – würfeln, rauswerfen, heimbringen",
  start(namen) {
    const n = Math.max(1, Math.min(MAEDN_MAX, namen.length));
    return { n, fig: Array.from({ length: n }, () => [-1, -1, -1, -1]), dran: 0, wurf: null, versuche: 0, phase: "wuerfeln",
      sieger: null, letzt: null, rausgeworfen: {}, wuerfe: 0, runde: 1 };
  },
  ergebnis: (s) => (s.sieger !== null ? { nr: String(s.runde), sieger: [s.sieger] } : null),
  aktion(s, i, a, namen) {
    if (a.typ === "neustart" && s.phase === "ende") { Object.assign(s, maedn.start(namen), { runde: (s.runde || 1) + 1 }); return; }
    if (i !== s.dran || s.phase === "ende" || i >= s.n) return;
    if (a.typ === "wurf" && s.phase === "wuerfeln") {
      const w = 1 + zufall(6);
      s.wurf = w; s.wuerfe++; s.letzt = null;
      const zuege = maednZuege(s, i, w);
      if (zuege.length) { s.phase = "ziehen"; return; }
      s.letzt = { j: i, w, nichts: true };
      if (w !== 6 && maednDreiVersuche(s, i) && s.versuche < 2) { s.versuche++; s.wurf = w; return; }   // gleich nochmal
      if (w === 6) { s.wurf = null; s.versuche = 0; return; }   // 6 ohne Zug: trotzdem nochmal
      naechster(s); s.letzt = { j: i, w, nichts: true };
    } else if (a.typ === "zug" && s.phase === "ziehen" && Number.isInteger(a.f)) ziehen(s, i, a.f);
  },
  // Computer-Mitspieler: rauswerfen > ins Ziel > raus aus dem Haus > der vorderste Laeufer
  botPause: (s) => (s.phase === "ziehen" ? 1200 : 1000),
  bot(s, i) {
    if (s.phase === "ende" || s.dran !== i) return null;
    if (s.phase === "wuerfeln") return { typ: "wurf" };
    return { typ: "zug", f: maednBotWahl(s, i) };
  },
  render(s, ich, namen) {
    const n = s.n, L = maednLaenge(n), dran = ich === s.dran;
    const brett = maednSvg(s, namen, dran && s.phase === "ziehen" ? maednZuege(s, ich, s.wurf) : [], ich);
    const leute = `<div class="punkte">${namen.slice(0, n).map((nm, j) => `<span class="${j === s.dran ? "md-dran" : ""}"><i class="md-punkt" style="background:${MAEDN_FARBEN[j]}"></i>${j === s.dran ? "👉 " : ""}${esc(nm)}: ${s.fig[j].filter((r) => r >= L).length}/4 🏠</span>`).join("")}</div>`;
    const regel = `<details class="grundregeln"><summary>📜 So geht's</summary><ul><li>Mit einer 6 kommt eine Figur aus dem Haus aufs Startfeld. Nach einer 6 darfst du nochmal.</li>
      <li>Steht keine Figur auf dem Weg, hast du drei Versuche für die 6.</li><li>Landest du auf einer fremden Figur, fliegt sie raus – zurück ins Haus.</li>
      <li>Schlagzwang: Kannst du eine fremde Figur rauswerfen, musst du das auch tun.</li>
      <li>Eigene Figuren kann man nicht schlagen, im Ziel wird nicht übersprungen. Wer zuerst alle 4 im Ziel hat, gewinnt.</li></ul></details>`;
    const letzt = s.letzt ? `<p class="mitte klein3">${maednLetztText(s, namen)}</p>` : "";
    if (s.phase === "ende") {
      return `<div class="urteil gut">🏆 ${name(namen, s.sieger)} hat alle Figuren im Ziel!</div>${brett}${leute}<i hidden data-ergebnis="maedn${s.runde}"></i>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    }
    if (ich >= n) return `<p class="mitte leise">Es spielen höchstens ${MAEDN_MAX} – du schaust zu.</p>${letzt}${brett}${leute}${regel}`;
    const farbe = `<span class="md-punkt" style="background:${MAEDN_FARBEN[ich]}"></span> ${MAEDN_FARBNAMEN[ich]}`;
    if (!dran) return `<div class="frage klein3">Du spielst ${farbe}. ${name(namen, s.dran)} ist dran.</div>${letzt}${brett}${leute}${regel}`;
    if (s.phase === "wuerfeln") {
      const nochmal = s.versuche ? ` (Versuch ${s.versuche + 1} von 3)` : s.letzt && s.letzt.j === ich && s.letzt.w === 6 ? " – nochmal, du hattest eine 6!" : "";
      return `<div class="frage">Du bist dran ${farbe}${nochmal}</div>${letzt}${knopf("🎲 Würfeln", { typ: "wurf" }, "gross md-wuerfeln")}${brett}${leute}${regel}`;
    }
    const zuege = maednZuege(s, ich, s.wurf);
    const kn = zuege.map((f) => {
      const r = s.fig[ich][f], nr = maednZiel(s, ich, f, s.wurf);
      const wo = (x) => (x === -1 ? "Haus" : x >= L ? `Ziel ${x - L + 1}` : `Feld ${x + 1}`);
      const schlag = nr < L && (() => { const b = besetzt(s, maednAbs(ich, nr, n)); return b && b[0] !== ich; })();
      return knopf(`Figur ${f + 1}: ${wo(r)} → ${wo(nr)}${schlag ? " 💥" : ""}`, { typ: "zug", f }, "wahl md-zug");
    }).join("");
    const zwang = maednZwang(s) ? `<div class="urteil md-zwang">💥 Schlagzwang! Du musst rauswerfen.</div>` : "";
    return `<div class="frage">Gewürfelt: <span class="md-wurf">${WUERFEL[s.wurf]}</span> ${s.wurf} – welche Figur?</div>${zwang}<div class="raster2">${kn}</div>${brett}${leute}${regel}`;
  },
};

export function maednBotWahl(s, i) {
  const L = maednLaenge(s.n), zuege = maednZuege(s, i, s.wurf);
  const wert = (f) => {
    const r = s.fig[i][f], nr = maednZiel(s, i, f, s.wurf);
    if (nr < L) { const b = besetzt(s, maednAbs(i, nr, s.n)); if (b && b[0] !== i) return 1000; }
    if (nr >= L && r < L) return 800;
    if (r === -1) return 600;
    if (r === 0) return 500;   // Startfeld frei machen
    return r;   // sonst der vorderste
  };
  return zuege.sort((x, y) => wert(y) - wert(x))[0];
}
function maednLetztText(s, namen) {
  const l = s.letzt, wer = name(namen, l.j);
  if (l.nichts) return `${wer} würfelt ${WUERFEL[l.w]} ${l.w} – kein Zug möglich.`;
  return `${wer} würfelt ${WUERFEL[l.w]} ${l.w}${l.von === -1 ? " und kommt raus" : ""}${l.raus !== null ? ` und wirft ${name(namen, l.raus)} raus! 💥` : ""}${l.nach >= maednLaenge(s.n) && l.von < maednLaenge(s.n) ? " – ab ins Ziel!" : ""}`;
}

// ---------------------------------------------------------------- Brett als SVG (Handy und Beamer)
// Bahn als Kreis; das Zielfeld-Paar zeigt vom Feld vor dem Start nach innen, das Haus liegt aussen neben dem Start.
export function maednPunkte(n) {
  const L = maednLaenge(n), R = n <= 4 ? 36 : 39, wi = (k) => (k / L) * Math.PI * 2 - Math.PI / 2;
  const auf = (k, rr) => [50 + rr * Math.cos(wi(k)), 50 + rr * Math.sin(wi(k))];
  const bahn = Array.from({ length: L }, (_, k) => auf(k, R));
  const schritt = n <= 4 ? 6 : 4.6;
  const ziel = (j) => Array.from({ length: FIGUREN }, (_, k) => auf(maednSitz(j, n) * ARM - 1, R - schritt * (k + 1)));
  const haus = (j) => Array.from({ length: FIGUREN }, (_, k) => { const a = maednSitz(j, n) * ARM + 1.6 + (k % 2) * 1.8, rr = R + 5 + Math.floor(k / 2) * 3.8; return auf(a, rr); });
  return { L, bahn, ziel, haus, feld: n <= 4 ? 2.6 : 1.4 };
}
export function maednSvg(s, namen, waehlbar = [], ich = -1) {
  const n = s.n, P = maednPunkte(n), L = P.L, rf = P.feld, k2 = (x) => x.toFixed(2);
  const kreis = (x, y, r, fill, extra = "") => `<circle cx="${k2(x)}" cy="${k2(y)}" r="${k2(r)}" fill="${fill}" ${extra}/>`;
  let h = "";
  // Bahn: Startfelder in Spielerfarbe
  const startVon = {};
  for (let j = 0; j < n; j++) startVon[maednSitz(j, n) * ARM] = j;
  P.bahn.forEach(([x, y], k) => { h += kreis(x, y, rf, startVon[k] !== undefined ? MAEDN_FARBEN[startVon[k]] : "#f8fafc", `stroke="#1e293b" stroke-width="0.3" opacity="${startVon[k] !== undefined ? 0.75 : 1}"`); });
  for (let j = 0; j < n; j++) {
    P.ziel(j).forEach(([x, y]) => { h += kreis(x, y, rf, MAEDN_FARBEN[j], `opacity="0.35" stroke="#1e293b" stroke-width="0.3"`); });
    P.haus(j).forEach(([x, y]) => { h += kreis(x, y, rf * 0.85, MAEDN_FARBEN[j], `opacity="0.25"`); });
  }
  // Figuren
  for (let j = 0; j < n; j++) s.fig[j].forEach((r, f) => {
    const [x, y] = r === -1 ? P.haus(j)[f] : r >= L ? P.ziel(j)[r - L] : P.bahn[maednAbs(j, r, n)];
    const an = j === ich && waehlbar.includes(f);
    const neu = s.letzt && !s.letzt.nichts && s.letzt.j === j && s.letzt.f === f;
    h += `<g class="md-fig${an ? " md-an" : ""}" data-md="${j}-${f}">${kreis(x, y, rf * 0.8, MAEDN_FARBEN[j], `stroke="${an ? "#facc15" : neu ? "#fff" : "#0f172a"}" stroke-width="${an || neu ? 0.8 : 0.4}"`)}
      <text x="${k2(x)}" y="${k2(y + rf * 0.35)}" font-size="${k2(rf)}" text-anchor="middle" fill="#fff" font-weight="800">${f + 1}</text></g>`;
  });
  const w = s.wurf ? `<text x="50" y="54" font-size="12" text-anchor="middle" fill="${MAEDN_FARBEN[s.dran] || "#fff"}">${WUERFEL[s.wurf]}</text>` : "";
  return `<div class="md-brett"><svg viewBox="-2 -2 104 104" role="img" aria-label="Spielbrett">${h}${w}</svg></div>`;
}

// ---------------------------------------------------------------- Beamer (alles oeffentlich)
export const maednAuszug = (s) => JSON.parse(JSON.stringify({ n: s.n, fig: s.fig, dran: s.dran, wurf: s.wurf, versuche: s.versuche, phase: s.phase, sieger: s.sieger, letzt: s.letzt, runde: s.runde, zwang: maednZwang(s) }));
export function maednHTML(d, nm, sp, kopf) {
  stil();
  const L = maednLaenge(d.n);
  const text = d.phase === "ende" ? `🏆 ${esc(nm[d.sieger] || "")} gewinnt!` : `${esc(nm[d.dran] || "")} ist dran${d.wurf ? ` · gewürfelt ${d.wurf}` : ""}`;
  const leute = nm.slice(0, d.n).map((x, j) => `<div class="mdb-sp ${j === d.dran ? "an" : ""}"><i style="background:${MAEDN_FARBEN[j]}"></i>${esc(x)}<b>${d.fig[j].filter((r) => r >= L).length}/4</b></div>`).join("");
  const letzt = d.letzt ? `<div class="mdb-letzt">${maednLetztText(d, nm).replace(/<b class="n\d+">/g, "<b>")}</div>` : "";
  const zwang = d.zwang && d.phase === "ziehen" ? `<div class="mdb-zwang">💥 Schlagzwang!</div>` : "";
  return `<div class="bsmaedn">${kopf(sp, text)}<div class="mdb">${maednSvg(d, nm)}<div class="mdb-liste">${zwang}${leute}${letzt}</div></div></div>`;
}

let stilDa = false;
function stil() {
  if (stilDa || typeof document === "undefined") return;
  stilDa = true;
  document.head.insertAdjacentHTML("beforeend", `<style id="md-stil">
    .md-brett{max-width:min(92vw,460px);margin:.6em auto}.md-brett svg{width:100%;height:auto;display:block;background:#7c2d12;border-radius:12px}
    .md-punkt{display:inline-block;width:.9em;height:.9em;border-radius:50%;vertical-align:-.1em;margin-right:.25em}
    .md-dran{font-weight:800}.md-wurf{font-size:1.6em;vertical-align:-.15em}.md-zug{overflow-wrap:anywhere}
    .md-an circle{animation:md-blink .8s ease-in-out infinite alternate}@keyframes md-blink{from{opacity:1}to{opacity:.45}}
    .mdb{display:grid;grid-template-columns:auto 1fr;gap:2vw;align-items:center}
    .mdb .md-brett{max-width:none;width:min(78vh,60vw);margin:0}
    .mdb-liste{display:flex;flex-direction:column;gap:.8vh;font-size:1.8vw;color:#fff}
    .mdb-sp{display:flex;align-items:center;gap:.8vw;padding:.4vh 1vw;border-radius:1vw;overflow-wrap:anywhere}.mdb-sp.an{background:#ffffff26;font-weight:800}
    .mdb-sp i{width:1.4vw;height:1.4vw;border-radius:50%;flex:none}.mdb-sp b{margin-left:auto}
    .mdb-letzt{margin-top:1.5vh;font-size:1.5vw;opacity:.9}
    .md-zwang{text-align:center}.mdb-zwang{font-size:2.6vw;font-weight:900;color:#fde047;text-align:center;padding:.6vh 1vw;border-radius:1vw;background:#dc262699;animation:md-blink .6s ease-in-out infinite alternate}
  </style>`);
}
stil();
