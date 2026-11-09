// Die fertigen Spiele (LAN Games) in 3D (Nico 09.11.2026, "Ja, in 3D"): uebersetzt den Stand des Regelwerks in die Eingaben der
// 3D-Ansichten (vier3d.js, dame3d.js, wuerfel3d.js, schiffe3d.js) - am Handy (fremd.js, nach dem Zeichnen) und an der Wand
// (beamer_spiele.js, aus dem Auszug). Bedient wird ueber dieselben Aktionen wie bisher (senden) bzw. ueber die Knoepfe des
// Regelwerks (Wuerfel behalten, Wuerfeln) - Regeln, Computer und Netz-Nachrichten bleiben unveraendert.
// Ohne 3D (kein WebGL) bleibt die bisherige flache Ansicht stehen.
import { vier3dZeigen } from "./vier3d.js";
import { dame3dZeigen } from "./dame3d.js";
import { wuerfel3dZeigen } from "./wuerfel3d.js";
import { schiffe3dZeigen } from "./schiffe3d.js";
import { stil } from "./tisch3d.js";

const OBEN = ["ones", "twos", "threes", "fours", "fives", "sixes"];
function wuerfelSumme(blatt) {
  const v = Object.entries(blatt || {}).filter(([, x]) => typeof x === "number");
  const oben = v.filter(([k]) => OBEN.includes(k)).reduce((n, [, x]) => n + x, 0);
  return v.reduce((n, [, x]) => n + x, 0) + (oben >= 63 ? 35 : 0);
}
function kopf(st, ich) {
  const pl = st.players || [], ts = st.turnState || {}, w = st.winner;
  const sieger = w === null || w === undefined ? [] : [w].flat().map(Number).filter((j) => Number.isInteger(j));
  const vorbei = st.status === "finished" || st.phase === "finished" || !!st.gameOver || sieger.length > 0;
  const dran = Number.isInteger(ts.currentPlayerIndex) && !vorbei ? ts.currentPlayerIndex : null;
  const spielt = ich < pl.length && st.status === "playing" && !vorbei;
  return { farben: pl.map((p) => p.colorHex || "#888"), dran, vorbei, sieger, ich, n: pl.length, darf: spielt && dran === ich };
}
const senderFuer = (senden, action) => (payload) => senden({ typ: "fremd", action, payload });

// ---------------------------------------------------------------- Handy: aus der Spieler-Ansicht des Regelwerks
const HANDY = {
  "f-vier": (box, st, ich, namen, senden) => vier3dZeigen(box, { ...kopf(st, ich), namen, brett: st.board.map((r) => r.map((c) => (c === null || c === undefined ? null : Number(c)))),
    senden: (c) => senderFuer(senden, "dropPiece")({ column: c }), ton: true }),
  "f-dame": (box, st, ich, namen, senden) => {
    const pl = st.players || [], farbe = pl.map((p) => p.color);
    const k = kopf(st, ich);
    const wahl = k.darf ? (st.validActions || []).filter((x) => String(x).startsWith("move:")).map((x) => {
      const [a, b, c, e] = String(x).split(":")[1].split(",").map(Number);
      return { von: [a, b], nach: [c, e], schlag: Math.abs(c - a) === 2 };
    }) : [];
    const kette = st.pendingChainPiece ? [st.pendingChainPiece.row, st.pendingChainPiece.col] : null;
    return dame3dZeigen(box, { ...k, namen, brett: st.board.map((r) => r.map((c) => (c ? { i: Math.max(0, farbe.indexOf(c.color)), k: !!c.king } : null))), wahl, kette,
      senden: (von, nach) => senderFuer(senden, "move")({ from: { row: von[0], col: von[1] }, to: { row: nach[0], col: nach[1] } }), ton: true });
  },
  "f-wuerfel": (box, st, ich, namen, senden, buehne) => {
    const ts = st.turnState || {}, pl = st.players || [], k = kopf(st, ich), cfg = (st.config && st.config.settings) || {};
    const knopf = buehne.querySelector("#yz-roll-btn"), die = (i) => buehne.querySelector(`#yz-die-${i}`);
    const max = cfg.rollsPerTurn || 3, wurf = ts.rollsUsed || 0;
    return wuerfel3dZeigen(box, { ...k, namen, wuerfel: (ts.dice || []).slice(), halten: (ts.held || []).slice(), lokal: [0, 1, 2, 3, 4].map((i) => !!(die(i) && die(i).classList.contains("yz-die-held"))),
      wurf, wuerfe: max, wurfKey: `${ts.currentPlayerIndex}:${ts.roundsCompleted || 0}:${wurf}`, punkte: pl.map((p) => wuerfelSumme(p.scoreSheet)),
      felder: pl.map((p) => Object.values(p.scoreSheet || {}).filter((v) => v !== null).length), kannHalten: k.darf && wurf >= 1 && wurf < max,
      kannWuerfeln: k.darf && !!knopf && !knopf.disabled, halte: (i) => { const el = die(i); if (el && !el.disabled) el.click(); }, wuerfeln: () => { if (knopf && !knopf.disabled) knopf.click(); }, ton: true });
  },
  "f-schiffe": (box, st, ich, namen, senden) => {
    const pl = st.players || [], k = kopf(st, ich), ts = st.turnState || {}, cfg = (st.config && st.config.settings) || {};
    const me = pl[ich] || pl[0] || {}, r = (z) => [z.cell.x, z.cell.y, z.result === "miss" ? 0 : z.result === "sunk" ? 2 : 1];
    const versenkt = new Set(me.shipsSunk || []);
    return schiffe3dZeigen(box, { ...k, ich: ich < pl.length ? ich : 0, namen, phase: ts.phase || "", b: cfg.gridWidth || 10, h: cfg.gridHeight || 10,
      darf: k.darf && ts.phase === "firing",
      meineSchiffe: ich < pl.length ? (me.ships || []).map((s) => ({ zellen: s.cells || [], waagerecht: s.orientation === "horizontal", versenkt: versenkt.has(s.id) })) : [],
      aufMich: (me.shotsReceived || []).map(r), vonMir: (me.shotsFired || []).map(r), senden: (x, y) => senderFuer(senden, "fireShot")({ cell: { x, y } }), ton: true });
  },
};
export const HAT_3D = (id) => Object.prototype.hasOwnProperty.call(HANDY, id);

// in die Buehne des fertigen Spiels: 3D-Kasten oben, die flache Ansicht des Spielfelds wird ausgeblendet (CSS ueber mit-3d)
export function fremd3dHandy(id, buehne, st, ich, namen, senden) {
  if (!HANDY[id] || !buehne) return false;
  stil();
  let box = buehne.querySelector(":scope > .t3d");
  if (!box) { box = document.createElement("div"); box.className = "t3d"; box.dataset.t3d = id; buehne.insertBefore(box, buehne.firstChild); }
  let an = false;
  try { an = !!HANDY[id](box, st, ich, namen || [], senden, buehne); } catch (e) { console.error(e); an = false; }
  buehne.classList.toggle("mit-3d", an);
  buehne.dataset.d3 = id;
  return an;
}

// ---------------------------------------------------------------- Wand: aus dem Auszug (beamer_spiele.js)
const WAND = {
  "f-vier": (box, d, nm) => vier3dZeigen(box, { ...d, ich: -1, namen: nm, beamer: true, darf: false, ton: false }),
  "f-dame": (box, d, nm) => dame3dZeigen(box, { ...d, ich: -1, namen: nm, beamer: true, darf: false, wahl: [], kette: null, ton: false }),
  "f-wuerfel": (box, d, nm) => wuerfel3dZeigen(box, { ...d, ich: -1, namen: nm, beamer: true, darf: false, wurfKey: `${d.dran}:${(d.felder || []).reduce((a, b) => a + b, 0)}:${d.wurf}`, ton: false }),
  "f-schiffe": (box, d, nm) => schiffe3dZeigen(box, { ...d, ich: -1, namen: nm, beamer: true, darf: false, ton: false }),
};
export const WAND_3D = (id) => Object.prototype.hasOwnProperty.call(WAND, id);
const wandNamen = {};
export const fremd3dWandNamen = (id, nm) => { wandNamen[id] = nm; };
// Platzhalter fuer die Wand (beamer_spiele.js setzt ihn vor das flache Spielfeld)
export const fremd3dWandKasten = (id) => (WAND[id] ? `<div class="t3d t3-wand" data-t3d-wand="${id}"></div>` : "");
export function fremd3dWand(el, id, d) {
  const box = el && el.querySelector(`[data-t3d-wand="${id}"]`);
  if (!box || !d || !WAND[id]) return false;
  stil();
  // so hoch, wie unter dem Titel Platz ist (gemessen ohne die Verkleinerung von beamer.js), Breite nach dem Kasten
  const inhalt = box.closest(".bm-inhalt") || el, ri = inhalt.getBoundingClientRect(), skala = inhalt.offsetHeight ? ri.height / inhalt.offsetHeight || 1 : 1;
  const oben = (box.getBoundingClientRect().top - ri.top) / skala, unten = id === "f-schiffe" ? 40 : id === "f-wuerfel" ? 250 : 110;
  const h = Math.round(Math.max(window.innerHeight * 0.45, Math.min(window.innerHeight * 0.8, (inhalt.clientHeight || window.innerHeight) - oben - unten)));
  if (box.style.height !== `${h}px`) box.style.height = `${h}px`;
  let an = false;
  try { an = !!WAND[id](box, d, wandNamen[id] || []); } catch (e) { console.error(e); }
  box.closest(".bsf") && box.closest(".bsf").classList.toggle("mit-3d", an);
  return an;
}
