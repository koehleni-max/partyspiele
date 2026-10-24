// Fiesbau - eigenes Bau-und-Lauf-Spiel in der Art von Hindernis-Partyspielen:
// Jeder baut reihum ein Teil in die Strecke, dann laeuft jeder auf seinem Handy. Nur wer es ins Ziel schafft, punktet -
// schaffen es alle, ist die Strecke zu leicht und keiner punktet.
import { esc, knopf, zufall, mischen, name } from "./hilfe.js";
import { spiele as klang } from "./ton.js";

const B = 22, H = 12; // Raster
const KARTE = [
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
  "....................Z.",
  "S..................###",
  "####...######...######",
  "####...######...######",
];
const TEILE = {
  block: ["🧱", "Block"], stachel: ["🔺", "Stacheln"], feder: ["🌀", "Sprungfeder"], saege: ["⚙️", "Säge"],
  brett: ["➖", "Brücke (3 breit)"], eis: ["🧊", "Eis"], bombe: ["💣", "Bombe (räumt weg)"],
};
const ZIELPUNKTE = 10;

function angebot() { return mischen(Object.keys(TEILE)).slice(0, 3); }

function belegt(s, x, y) { return s.teile.some((t) => t.x === x && t.y === y) || "S#Z".includes(KARTE[y][x]); }

export const hindernis = {
  id: "fiesbau", name: "Fiesbau", emoji: "🏗️", farben: ["#00b3a4","#13406e"], kurz: "Strecke reihum fies bebauen, dann laufen – nur wer ins Ziel kommt, punktet",
  start: (namen) => ({ runde: 1, phase: "bauen", teile: [], angebote: namen.map(() => angebot()), wahl: {}, gebaut: {}, ergebnis: {}, punkte: namen.map(() => 0), meldung: "" }),
  // Computer-Mitspieler: baut etwas Fieses in die Laufbahn und "laeuft" mit einer Chance, die von der Strecke abhaengt
  botPause: (s) => (s.phase === "laufen" ? 7000 : 2200),
  bot(s, i) {
    if (s.phase === "bauen" && !s.gebaut[i]) {
      if (!s.wahl[i]) {
        const vorlieben = ["stachel", "saege", "feder", "block", "eis", "brett", "bombe"];
        return { typ: "wahl", teil: vorlieben.find((t) => s.angebote[i].includes(t)) };
      }
      for (let v = 0; v < 60; v++) {
        const x = 3 + zufall(16), y = 6 + zufall(4);
        if (s.wahl[i] === "bombe" || !belegt(s, x, y)) return { typ: "setzen", x, y };
      }
      return null;
    }
    if (s.phase === "laufen" && !s.ergebnis[i]) {
      const gefahr = s.teile.filter((t) => t.typ === "stachel" || t.typ === "saege").length;
      const hilfe = s.teile.filter((t) => t.typ === "block" || t.typ === "brett" || t.typ === "feder").length;
      const chance = Math.max(0.15, Math.min(0.9, 0.8 - gefahr * 0.07 + hilfe * 0.03));
      return { typ: "ergebnis", ziel: Math.random() < chance, zeit: 6000 + zufall(9000) };
    }
    return null;
  },
  aktion(s, i, a, namen) {
    const n = s.punkte.length;
    if (a.typ === "neustart") return Object.assign(s, hindernis.start(namen));
    if (s.phase === "bauen") {
      if (a.typ === "wahl" && s.angebote[i].includes(a.teil) && !s.gebaut[i]) s.wahl[i] = a.teil;
      if (a.typ === "setzen" && s.wahl[i] && !s.gebaut[i]) {
        const x = Math.max(0, Math.min(B - 1, a.x | 0)), y = Math.max(0, Math.min(H - 1, a.y | 0));
        const typ = s.wahl[i];
        if (typ === "bombe") s.teile = s.teile.filter((t) => Math.abs(t.x - x) > 1 || Math.abs(t.y - y) > 1);
        else if (typ === "brett") { for (let k = 0; k < 3; k++) if (x + k < B && !belegt(s, x + k, y)) s.teile.push({ x: x + k, y, typ: "brett", von: i }); }
        else if (!belegt(s, x, y)) s.teile.push({ x, y, typ, von: i });
        else return;
        s.gebaut[i] = true;
        if (Object.keys(s.gebaut).length >= n) { s.phase = "laufen"; s.ergebnis = {}; s.laufId = `${s.runde}-${Date.now()}`; }
      }
    } else if (s.phase === "laufen" && a.typ === "ergebnis" && !s.ergebnis[i]) {
      s.ergebnis[i] = { ziel: !!a.ziel, zeit: Number(a.zeit) || 0 };
      if (Object.keys(s.ergebnis).length >= n) {
        const im = Object.entries(s.ergebnis).filter(([, e]) => e.ziel).map(([j, e]) => [Number(j), e.zeit]).sort((x, y) => x[1] - y[1]);
        s.gewinne = {};
        if (im.length && im.length < n) {
          im.forEach(([j], p) => { s.gewinne[j] = p === 0 ? 3 : 2; s.punkte[j] += s.gewinne[j]; });
          s.meldung = "Punkte für alle, die es geschafft haben!";
        } else s.meldung = im.length ? "Alle im Ziel – zu leicht! Keine Punkte, baut fieser!" : "Keiner im Ziel – zu schwer! Keine Punkte.";
        s.phase = Math.max(...s.punkte) >= ZIELPUNKTE ? "ende" : "ergebnis";
      }
    } else if (s.phase === "ergebnis" && a.typ === "weiter") {
      s.runde++; s.phase = "bauen"; s.wahl = {}; s.gebaut = {}; s.angebote = s.punkte.map(() => angebot());
    }
  },
  render(s, ich, namen) {
    const tafel = `<div class="tafel">${namen.map((nm, j) => `<div><span class="farbe f${j}"></span><b>${esc(nm)}</b><span>🏁 ${s.punkte[j]}/${ZIELPUNKTE}</span></div>`).join("")}</div>`;
    const lw = `<canvas id="fiesbau" class="fiesbau" width="${B * 40}" height="${H * 40}"></canvas>`;
    if (s.phase === "bauen") {
      const fertig = s.gebaut[ich];
      const auswahl = s.angebote[ich].map((t) => knopf(`${TEILE[t][0]} ${TEILE[t][1]}`, { typ: "wahl", teil: t }, `${s.wahl[ich] === t ? "gewaehlt" : ""}`)).join("");
      return `${tafel}<div class="frage">Runde ${s.runde}: Baue ein Teil ein</div>${lw}
        ${fertig ? `<p class="mitte leise">Gebaut – warte auf die anderen (${Object.keys(s.gebaut).length}/${namen.length})</p>`
                 : `<div class="raster3">${auswahl}</div><p class="mitte leise">${s.wahl[ich] ? "Jetzt auf die Strecke tippen, wo es hin soll." : "Wähle ein Teil."}</p>`}`;
    }
    if (s.phase === "laufen") {
      const fertig = s.ergebnis[ich];
      return `${tafel}${lw}${fertig ? `<p class="mitte">${fertig.ziel ? `🏁 Im Ziel nach ${(fertig.zeit / 1000).toFixed(1)} s!` : "💀 Erwischt!"} Warte auf die anderen (${Object.keys(s.ergebnis).length}/${namen.length})</p>`
        : `<div class="steuer"><button id="fb-links">◀</button><button id="fb-rechts">▶</button><button id="fb-sprung">⤒</button></div>
           <p class="mitte leise klein">Lauf von links nach rechts zur Flagge. 30 Sekunden.</p>`}`;
    }
    const zeilen = namen.map((nm, j) => { const e = s.ergebnis[j] || {}; return `<li>${name(namen, j)}: ${e.ziel ? `🏁 ${(e.zeit / 1000).toFixed(1)} s` : "💀"} ${s.gewinne && s.gewinne[j] ? `+${s.gewinne[j]}` : ""}</li>`; }).join("");
    if (s.phase === "ende") {
      const sieger = s.punkte.indexOf(Math.max(...s.punkte));
      return `${tafel}<div class="urteil">🏆 ${name(namen, sieger)} gewinnt Fiesbau!</div><ul class="rangliste">${zeilen}</ul>${knopf("Neues Spiel", { typ: "neustart" }, "gross")}`;
    }
    return `${tafel}<div class="frage">${esc(s.meldung)}</div><ul class="rangliste">${zeilen}</ul>
      <p class="mitte">Wer nicht ins Ziel kam, trinkt 1 🍺</p>${knopf("Nächste Runde bauen", { typ: "weiter" }, "gross")}`;
  },
  musik(s) { return s.phase === "laufen" ? "fiesbau" : s.phase === "ende" ? null : "brett"; },
  nach(s, ich, senden) {
    const c = document.getElementById("fiesbau");
    if (!c) return;
    if (s.phase === "bauen") {
      zeichneStrecke(c.getContext("2d"), s);
      c.onclick = (ev) => {
        if (s.gebaut[ich] || !s.wahl[ich]) return;
        const r = c.getBoundingClientRect();
        senden({ typ: "setzen", x: Math.floor(((ev.clientX - r.left) / r.width) * B), y: Math.floor(((ev.clientY - r.top) / r.height) * H) });
      };
      return;
    }
    if (s.phase === "laufen" && !s.ergebnis[ich]) starteLauf(s, senden);
    else if (s.phase !== "laufen") zeichneStrecke(c.getContext("2d"), s);
    else zeichneStrecke(c.getContext("2d"), s);
  },
};

// ---------------------------------------------------------------- Zeichnen
function zeichneStrecke(g, s, figur) {
  const z = 40;
  g.fillStyle = "#1a1438"; g.fillRect(0, 0, B * z, H * z);
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const ch = KARTE[y][x];
    if (ch === "#") { g.fillStyle = "#4b3f8a"; g.fillRect(x * z, y * z, z, z); g.fillStyle = "#6d5fc0"; g.fillRect(x * z, y * z, z, 6); }
    if (ch === "Z") { g.font = "34px sans-serif"; g.fillText("🏁", x * z + 2, y * z + 34); }
    if (ch === "S") { g.fillStyle = "#2f6f4f"; g.fillRect(x * z, y * z + 30, z, 10); }
  }
  for (const t of s.teile) {
    const px = t.x * z, py = t.y * z;
    if (t.typ === "block") { g.fillStyle = "#b45309"; g.fillRect(px, py, z, z); g.strokeStyle = "#7c2d12"; g.strokeRect(px + 2, py + 2, z - 4, z - 4); }
    else if (t.typ === "brett") { g.fillStyle = "#a16207"; g.fillRect(px, py, z, 12); }
    else if (t.typ === "eis") { g.fillStyle = "#7dd3fc"; g.fillRect(px, py, z, z); }
    else if (t.typ === "stachel") { g.fillStyle = "#e5e7eb"; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(px + k * 13, py + z); g.lineTo(px + k * 13 + 6.5, py + 12); g.lineTo(px + k * 13 + 13, py + z); g.fill(); } }
    else if (t.typ === "feder") { g.fillStyle = "#22c55e"; g.fillRect(px + 4, py + 26, z - 8, 14); g.fillStyle = "#86efac"; g.fillRect(px + 2, py + 22, z - 4, 5); }
    else if (t.typ === "saege") { g.fillStyle = "#ef4444"; g.beginPath(); g.arc(px + z / 2, py + z / 2, z / 2 - 2, 0, 7); g.fill(); g.fillStyle = "#fecaca"; g.beginPath(); g.arc(px + z / 2, py + z / 2, 6, 0, 7); g.fill(); }
  }
  if (figur) { g.fillStyle = "#ff4fa3"; g.fillRect(figur.x * z, figur.y * z, 0.7 * z, 0.9 * z); g.fillStyle = "#fff"; g.fillRect(figur.x * z + (figur.blick > 0 ? 18 : 6), figur.y * z + 8, 5, 5); }
}

// ---------------------------------------------------------------- Laufen (lokal auf jedem Handy)
let lauf = { id: null };
const tasten = { l: false, r: false, sprung: false };
window.addEventListener("pointerup", () => { tasten.l = tasten.r = tasten.sprung = false; });
window.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") tasten.l = true; if (e.key === "ArrowRight") tasten.r = true; if (e.key === "ArrowUp" || e.key === " ") tasten.sprung = true; });
window.addEventListener("keyup", (e) => { if (e.key === "ArrowLeft") tasten.l = false; if (e.key === "ArrowRight") tasten.r = false; if (e.key === "ArrowUp" || e.key === " ") tasten.sprung = false; });

function knoepfeBinden() {
  const bind = (id, k) => { const el = document.getElementById(id); if (!el) return; el.onpointerdown = (e) => { e.preventDefault(); tasten[k] = true; }; el.onpointerleave = () => (tasten[k] = false); };
  bind("fb-links", "l"); bind("fb-rechts", "r"); bind("fb-sprung", "sprung");
}

function starteLauf(s, senden) {
  knoepfeBinden();
  if (lauf.id === s.laufId) return;
  lauf = { id: s.laufId, f: { x: 0.15, y: 9.1, vx: 0, vy: 0, boden: false, blick: 1 }, start: performance.now(), fertig: false, letzte: performance.now() };
  const fest = (x, y) => {
    if (x < 0 || x >= B) return true;
    if (y < 0) return false;
    if (y >= H) return false;
    if (KARTE[y][x] === "#") return true;
    return s.teile.some((t) => t.x === x && t.y === y && (t.typ === "block" || t.typ === "eis" || t.typ === "brett"));
  };
  const teilBei = (x, y) => s.teile.find((t) => t.x === x && t.y === y);
  const ende = (ziel) => {
    if (lauf.fertig) return;
    lauf.fertig = true;
    klang(ziel ? "ziel" : "aua");
    senden({ typ: "ergebnis", ziel, zeit: Math.round(performance.now() - lauf.start) });
  };
  const schritt = (jetzt) => {
    if (lauf.id !== s.laufId || lauf.fertig) return;
    const dt = Math.min(0.033, (jetzt - lauf.letzte) / 1000); lauf.letzte = jetzt;
    const f = lauf.f, W = 0.7, Hh = 0.9;
    const unten = teilBei(Math.floor(f.x + W / 2), Math.floor(f.y + Hh + 0.05));
    const glatt = unten && unten.typ === "eis";
    const ziel = (tasten.r ? 1 : 0) - (tasten.l ? 1 : 0);
    if (ziel) f.blick = ziel;
    const beschl = glatt ? 6 : 40;
    f.vx += (ziel * 6.5 - f.vx) * Math.min(1, beschl * dt);
    if (tasten.sprung && f.boden) { f.vy = -11.5; f.boden = false; klang("sprung"); }
    f.vy = Math.min(f.vy + 30 * dt, 18);
    // waagerecht
    f.x += f.vx * dt;
    for (const yy of [Math.floor(f.y), Math.floor(f.y + Hh - 0.01)]) {
      if (f.vx > 0 && fest(Math.floor(f.x + W), yy)) { f.x = Math.floor(f.x + W) - W - 0.001; f.vx = 0; }
      if (f.vx < 0 && fest(Math.floor(f.x), yy)) { f.x = Math.floor(f.x) + 1.001; f.vx = 0; }
    }
    // senkrecht
    f.y += f.vy * dt; f.boden = false;
    for (const xx of [Math.floor(f.x + 0.05), Math.floor(f.x + W - 0.05)]) {
      if (f.vy > 0 && fest(xx, Math.floor(f.y + Hh))) { f.y = Math.floor(f.y + Hh) - Hh; f.vy = 0; f.boden = true; }
      if (f.vy < 0 && fest(xx, Math.floor(f.y))) { f.y = Math.floor(f.y) + 1; f.vy = 0; }
    }
    // Gefahren und Feder
    for (const xx of [Math.floor(f.x + 0.1), Math.floor(f.x + W - 0.1)]) for (const yy of [Math.floor(f.y + 0.1), Math.floor(f.y + Hh - 0.05)]) {
      const t = teilBei(xx, yy);
      if (t && (t.typ === "stachel" || t.typ === "saege")) return ende(false);
      if (t && t.typ === "feder" && f.vy >= 0) { f.vy = -17; f.boden = false; klang("schritt"); }
      if (yy >= 0 && yy < H && xx >= 0 && xx < B && KARTE[yy][xx] === "Z") return ende(true);
    }
    if (f.y > H + 1) return ende(false);
    if (jetzt - lauf.start > 30000) return ende(false);
    const c = document.getElementById("fiesbau");
    if (c) {
      const g = c.getContext("2d"); zeichneStrecke(g, s, f);
      g.fillStyle = "#fff"; g.font = "22px sans-serif"; g.fillText(`${Math.max(0, 30 - (jetzt - lauf.start) / 1000).toFixed(0)} s`, 10, 28);
    }
    requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}
