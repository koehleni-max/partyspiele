// Spielansichten am Beamer (Halloween-Fassung Schritt D, Nico 26.10.2026; Huettenplan 18.1/2/3/5/6/11).
//
// Die Spiele selbst bleiben, wie sie sind (Logik und Stand nur beim Gastgeber, Handys sind Fernbedienung). Neu ist nur,
// was die Wand zeigt:
//   auszug(raum)        Gastgeber: Kurzfassung aller Spiele fuer stand/beamer. Je Spiel nur, was ohnehin alle sehen
//                       duerfen - keine Werwolf-Rolle, kein Nachtziel, kein Mal-Begriff vor dem Erraten, keine Schaetz-Tipps
//                       vor der Aufloesung. Der Beamer liest nur diesen Auszug, nie den vollen Spielstand.
//   gezeigt(raum, t)    welches Spiel die Wand gerade zeigt (neuestes laufendes Beamer-Spiel; ein fertiges Ergebnis bleibt
//                       ENDE_ZEIT stehen, danach wieder Diashow). Gleiche Rechnung am Handy (Handy bleibt dann still).
//   html / nach         Ansicht je Spiel; vergleichen(): Klaenge und Effekte bei Aenderungen (nur am Beamer).
import { SPIELE, pferdeAbrechnung, ZIEL } from "./spiele.js";
import * as P from "./partien.js";
import * as T from "./texte.js";
import { werbinich, figurVon, QUIZ_ALLE, QUIZ_ZEIT } from "./elternspiele.js";
import * as WW from "./werwolf.js";
import { esc, schlucke, ohneAlkohol } from "./hilfe.js";

// Zuschauen (Nico 31.10.2026): die fertigen Zweier-Spiele laufen auch an der Wand mit - auch gegen den Computer.
// Geheimes bleibt geheim: bei Schiffe versenken nur die Schuesse (Treffer/Wasser), nie wo die Schiffe liegen.
export const FREMD_ZUSCHAUEN = ["f-ttt", "f-vier", "f-dame", "f-schiffe", "f-wuerfel"];
export const BEAMER_SPIELE = ["werwolf", "werbinich", "malen", "reaktion", "pferde", "schaetzen", "quiz", ...FREMD_ZUSCHAUEN];
// so lange bleibt ein fertiges Ergebnis (Spielende bzw. Rundenergebnis ohne neue Runde) an der Wand
export const ENDE_ZEIT = { werwolf: 30000, werbinich: 30000, pferde: 30000, reaktion: 120000, schaetzen: 120000, malen: 120000, quiz: 120000,
  ...Object.fromEntries(FREMD_ZUSCHAUEN.map((id) => [id, 30000])) };
export const NACHLAUF = 10000;   // beendetes Spiel (Beenden-Knopf): Ergebnis noch so lange, dann Diashow
export const REAKTION_PUFFER = 600;   // Beamer wird etwas NACH den Handys gruen - wer auf die Wand schaut, ist nie "zu frueh"
const MED = { 1: "🥇", 2: "🥈", 3: "🥉" };
const spiel = (id) => SPIELE.find((x) => x.id === id);

// ---------------------------------------------------------------- Auszug (beim Gastgeber)
const AUSZUG = {
  werwolf(s, namen) {
    const n = namen.length;
    if (!s.rolle) return { phase: s.phase || "einstellen", n, stimme: !!s.stimme };
    const d = { ...WW.oeffentlich(s), n, nacht: s.nacht || 0, lebt: namen.map((_, j) => !(s.tot || []).includes(j)), stimme: !!s.stimme };
    if (s.phase === "rollen") d.bereit = Object.keys(s.bereit || {}).length;
    if (s.phase === "tag") {
      const l = WW.lebende(s), zaehl = {};
      l.forEach((j) => { const z = (s.stimmen || {})[j]; if (z !== undefined) zaehl[z] = (zaehl[z] || 0) + 1; });
      d.stimmen = zaehl; d.abgestimmt = l.filter((j) => (s.stimmen || {})[j] !== undefined).length; d.waehler = l.length;
    }
    // erst nach dem Spielende: alle Rollen (Aufloesung)
    if (s.gewinner) { d.rollen = s.rolle.slice(); d.liebe = s.liebe ? s.liebe.slice() : null; }
    return d;
  },
  werbinich(s) {
    const alle = s.erraten.every((x) => x) || !!s.beendet;
    return { dran: s.dran, beendet: !!s.beendet && !s.erraten.every((x) => x), figur: figurVon(s, s.dran), erraten: s.erraten.slice(), fragen: (s.fragen || []).slice(), seit: s.seit || 0,
      zeit: werbinich.zeit, alle, figuren: alle ? s.figur.map((_, j) => figurVon(s, j)) : null };
  },
  malen(s) {
    const fertig = s.geloest !== null;
    return { maler: s.maler, runde: s.runde, striche: s.striche, tipps: s.tipps.slice(-6), geloest: s.geloest,
      wort: fertig ? s.wort : null, muster: fertig ? null : String(s.wort).replace(/[^\s-]/g, "_"), wertung: s.wertung || {} };
  },
  reaktion(s, namen, p) {
    const d = { runde: s.runde, phase: s.phase, warte: s.warte, zeiten: s.zeiten };
    if (p && p.joker && p.joker.key && p.joker.key === p.zuletzt) d.joker = p.joker;
    return d;
  },
  pferde(s) {
    return { phase: s.phase, pos: s.pos, wetten: s.wetten, aufgedeckt: s.aufgedeckt || 0, seite: (s.seite || []).slice(0, s.aufgedeckt || 0).map((k) => k.f),
      seiteN: ZIEL - 1, letzte: s.letzte, sieger: s.sieger, rest: s.stapel ? s.stapel.length : null };
  },
  schaetzen(s) {
    const [frage, loesung] = T.SCHAETZ[s.nr];
    const auf = s.phase === "aufloesung";
    return { nr: s.nr, rest: (s.rest || []).length, frage, phase: s.phase, abgegeben: Object.keys(s.tipps).map(Number),
      tipps: auf ? s.tipps : null, loesung: auf ? loesung : null };
  },
};

AUSZUG.quiz = (s) => {
  const q = QUIZ_ALLE[s.frage] || ["", "", "", "", ""];
  const auf = s.phase === "aufloesung";
  return { nr: s.nr, phase: s.phase, frage: q[0], antworten: s.reihe.map((k) => q[1 + k]), richtig: auf ? s.reihe.indexOf(0) : null,
    seit: s.seit || 0, zeit: QUIZ_ZEIT, abgegeben: Object.keys(s.antworten || {}).map(Number), punkte: (s.punkte || []).slice(),
    wahl: auf ? Object.fromEntries(Object.entries(s.antworten).map(([j, x]) => [j, s.reihe.indexOf(x.w)])) : null,
    schnellste: auf ? (Object.entries(s.antworten).filter(([, x]) => x.w === 0).sort((x, y) => x[1].ms - y[1].ms)[0] || [null])[0] : null };
};

// Fertige Spiele: gemeinsamer Kopf (wer ist dran, wer hat gewonnen) und je Spiel nur das offene Spielfeld
function fremdKopf(s) {
  const st = s.st || {};
  const w = st.winner;
  const sieger = w === null || w === undefined ? [] : [w].flat().map(Number).filter((j) => Number.isInteger(j));
  const vorbei = st.status === "finished" || st.phase === "finished" || !!st.gameOver || sieger.length > 0;
  const ts = st.turnState || {};
  return { nr: s.nr || 0, partie: s.partie || 0, dran: Number.isInteger(ts.currentPlayerIndex) ? ts.currentPlayerIndex : null, vorbei, sieger,
    farben: (st.players || []).map((x) => x.colorHex || ""), zeichen: (st.players || []).map((x) => x.token || ""), n: (st.players || []).length };
}
const nr = (c) => (c === null || c === undefined ? null : Number(c));
AUSZUG["f-ttt"] = (s) => ({ ...fremdKopf(s), brett: s.st.board.map((r) => r.map(nr)) });
AUSZUG["f-vier"] = (s) => ({ ...fremdKopf(s), brett: s.st.board.map((r) => r.map(nr)) });
AUSZUG["f-dame"] = (s) => {
  const farbe = (s.st.players || []).map((x) => x.color);
  return { ...fremdKopf(s), brett: s.st.board.map((r) => r.map((c) => (c ? { i: Math.max(0, farbe.indexOf(c.color)), k: !!c.king } : null))) };
};
AUSZUG["f-schiffe"] = (s) => {
  const st = s.st, cfg = (st.config && st.config.settings) || {};
  const pl = st.players || [];
  // je Spieler: seine Schuesse auf den Gegner [x, y, 0 Wasser | 1 Treffer | 2 versenkt] - Schiffspositionen bleiben weg
  return { ...fremdKopf(s), phase: (st.turnState && st.turnState.phase) || "", b: cfg.gridWidth || 10, h: cfg.gridHeight || 10, schiffe: (cfg.ships || []).length,
    bereit: pl.map((x) => !!x.ready), schuesse: pl.map((x) => (x.shotsFired || []).map((z) => [z.cell.x, z.cell.y, z.result === "miss" ? 0 : z.result === "sunk" ? 2 : 1])),
    versenkt: pl.map((x, j) => ((pl[1 - j] || {}).shipsSunk || []).length) };
};
const OBEN = ["ones", "twos", "threes", "fours", "fives", "sixes"];
function wuerfelSumme(blatt) {
  const v = Object.entries(blatt || {}).filter(([, x]) => typeof x === "number");
  const oben = v.filter(([k]) => OBEN.includes(k)).reduce((n, [, x]) => n + x, 0);
  return v.reduce((n, [, x]) => n + x, 0) + (oben >= 63 ? 35 : 0);
}
AUSZUG["f-wuerfel"] = (s) => {
  const st = s.st, ts = st.turnState || {};
  const pl = st.players || [];
  return { ...fremdKopf(s), wuerfel: (ts.dice || []).slice(), halten: (ts.held || []).slice(), wurf: ts.rollsUsed || 0, wuerfe: (st.config && st.config.settings && st.config.settings.rollsPerTurn) || 3,
    punkte: pl.map((x) => wuerfelSumme(x.scoreSheet)), felder: pl.map((x) => Object.values(x.scoreSheet || {}).filter((v) => v !== null).length), alle: pl.length ? Object.keys(pl[0].scoreSheet || {}).length : 13 };
};

export function auszug(raum) {
  const partien = {};
  Object.values((raum && raum.partien) || {}).forEach((p) => {
    const k = { pid: p.pid, spiel: p.spiel, phase: p.phase, mit: p.mit, bots: p.bots || {}, von: p.von, start: p.start, runde: p.runde || 1, t: p.t || 0, ohne: typeof p.ohne === "boolean" ? p.ohne : undefined };
    if (p.phase === "laeuft" && p.s && AUSZUG[p.spiel]) {
      try { k.bm = AUSZUG[p.spiel](p.s, P.namen(raum, p), p, raum); } catch (e) { k.bm = null; }
    }
    partien[p.pid] = k;
  });
  return { partien };
}

// Auszug einer Partie: am Beamer steht er schon drin (bm), am Handy wird er aus dem vollen Stand gerechnet
function bmVon(p, raum) {
  if (p.bm !== undefined) return p.bm;
  if (p.phase !== "laeuft" || !p.s || !AUSZUG[p.spiel]) return null;
  try { return AUSZUG[p.spiel](p.s, P.namen(raum, p), p, raum); } catch (e) { return null; }
}

export function fertig(id, d) {
  if (!d) return true;
  if (id === "werwolf") return !!d.gewinner;
  if (id === "werbinich") return !!d.alle;
  if (id === "pferde") return d.phase === "ende";
  if (id === "reaktion") return d.phase !== "laeuft";
  if (id === "schaetzen") return d.phase === "aufloesung";
  if (id === "malen") return d.geloest !== null;
  if (id === "quiz") return d.phase === "aufloesung";
  if (FREMD_ZUSCHAUEN.includes(id)) return !!d.vorbei;
  return true;
}

export const ausgeblendet = (raum) => ((raum && raum.beamer && Array.isArray(raum.beamer.aus)) ? raum.beamer.aus : []);

// Welches Spiel zeigt die Wand? -> {p, d} oder null (Uhr des Gastgebers)
export function gezeigt(raum, jetzt) {
  if (!raum) return null;
  const aus = ausgeblendet(raum);
  for (const p of P.liste(raum)) {
    if (p.phase !== "laeuft" || !BEAMER_SPIELE.includes(p.spiel) || aus.includes(p.pid)) continue;
    const d = bmVon(p, raum);
    if (!d) continue;
    if (fertig(p.spiel, d) && jetzt - (p.t || p.start || 0) > ENDE_ZEIT[p.spiel]) continue;
    return { p, d };
  }
  return null;
}

// ---------------------------------------------------------------- Klaenge und Effekte (nur am Beamer)
// alt/neu = Auszug derselben Partie vorher/jetzt -> {toene: [...], effekt: Anzahl Konfetti, musik}
export function vergleichen(id, alt, neu) {
  const r = { toene: [], effekt: 0, musik: musik(id, neu) };
  if (!alt || !neu) return r;
  const t = (x) => r.toene.push(x);
  if (id === "werwolf") {
    if (neu.phase === "nacht" && (alt.phase !== "nacht" || alt.zug !== neu.zug)) t("gong");
    if (neu.phase === "nacht" && neu.wach && neu.wach !== alt.wach) t(neu.wach === "wolf" ? "heulen" : neu.wach === "amor" ? "herz" : "magie");
    if (neu.phase === "morgen" && alt.phase !== "morgen") t(neu.tode.length ? "tod" : "morgen");
    if (neu.phase === "hinrichtung" && alt.phase !== "hinrichtung") t(neu.unentschieden ? "falsch" : "tod");
    if (neu.phase === alt.phase && (neu.tode || []).length > (alt.tode || []).length && alt.schuss) t("schuss");
    if (neu.phase === "tag" && neu.abgestimmt > (alt.abgestimmt || 0)) t("klick");
    if (neu.gewinner && !alt.gewinner) { t("sieg"); r.effekt = 160; }
  } else if (id === "werbinich") {
    if (neu.dran !== alt.dran) t("dran");
    if (neu.erraten.filter(Boolean).length > alt.erraten.filter(Boolean).length) { t("richtig"); r.effekt = 50; }
    if (neu.alle && !alt.alle) { t("sieg"); r.effekt = 160; }
  } else if (id === "malen") {
    if (neu.runde !== alt.runde) t("dran");
    else if (neu.striche.length > alt.striche.length) t("schritt");
    if (neu.tipps.length && JSON.stringify(neu.tipps) !== JSON.stringify(alt.tipps) && neu.geloest === null) t("klick");
    if (neu.geloest !== null && alt.geloest === null) { if (neu.geloest >= 0) { t("tada"); r.effekt = 120; } else t("falsch"); }
  } else if (id === "reaktion") {
    if (neu.phase === "laeuft" && (alt.phase !== "laeuft" || alt.runde !== neu.runde)) t("spannung");
    if (neu.phase === "laeuft" && Object.values(neu.zeiten).filter((x) => x < 0).length > Object.values(alt.zeiten || {}).filter((x) => x < 0).length) t("falsch");
    if (neu.phase === "ergebnis" && (alt.phase !== "ergebnis" || alt.runde !== neu.runde)) { t("fanfare"); r.effekt = 120; }
  } else if (id === "pferde") {
    if (neu.phase === "rennen" && alt.phase === "wetten") t("los");
    if (neu.rest !== null && alt.rest !== null && neu.rest < alt.rest) { t("karte"); t(neu.letzte && neu.letzte.rueck ? "aua" : "schritt"); }
    if (Object.keys(neu.wetten).length > Object.keys(alt.wetten).length) t("klick");
    if (neu.phase === "ende" && alt.phase !== "ende") { t("ziel"); t("sieg"); r.effekt = 180; }
  } else if (id === "quiz") {
    if (neu.nr !== alt.nr) t("dran");
    else if (neu.abgegeben.length > alt.abgegeben.length) t("klick");
    if (neu.phase === "aufloesung" && alt.phase !== "aufloesung") { t("tada"); r.effekt = 90; }
  } else if (id === "schaetzen") {
    if (neu.nr !== alt.nr || neu.rest !== alt.rest) t("dran");
    else if (neu.abgegeben.length > alt.abgegeben.length) t("klick");
    if (neu.phase === "aufloesung" && alt.phase !== "aufloesung") { t("tada"); r.effekt = 100; }
  } else if (FREMD_ZUSCHAUEN.includes(id)) {
    if (neu.nr > alt.nr && !neu.vorbei) t(id === "f-schiffe" && treffer(neu) > treffer(alt) ? "aua" : id === "f-wuerfel" ? "wuerfel" : "klick");
    if (neu.vorbei && !alt.vorbei) { t(neu.sieger.length ? "sieg" : "falsch"); r.effekt = neu.sieger.length ? 140 : 0; }
  }
  return r;
}
export function musik(id, d) {
  if (!d) return null;
  if (id === "werwolf") return d.phase === "nacht" ? "nacht" : ["morgen", "tag", "hinrichtung"].includes(d.phase) && !d.gewinner ? "dorf" : null;
  if (id === "pferde") return d.phase === "rennen" ? "spannung" : null;
  if (id === "quiz") return d.phase === "frage" ? "spannung" : null;
  return null;
}

// Werwolf-Erzaehler an der Wand (gleiche Saetze wie am Gastgeber-Handy, ohne Namen und Rollen)
const wwMerk = {};
export function erzaehlerFolge(d) {
  if (!d || !d.stimme || ["einstellen", "rollen"].includes(d.phase) || d.zug === undefined) return null;
  return WW.erzaehlerFolge({ phase: d.phase, zug: d.zug, wach: d.wach, tode: d.tode || [], schuss: !!d.schuss, unentschieden: !!d.unentschieden, gewinner: d.gewinner || null }, wwMerk);
}

// ---------------------------------------------------------------- Ansichten (HTML)
const WACH = { amor: "💘 Amor ist wach …", wolf: "🐺 Die Werwölfe sind wach …", seherin: "🔮 Die Seherin ist wach …", waechter: "🛡️ Der Wächter ist wach …", hexe: "🧪 Die Hexe ist wach …" };
const SIEG = { dorf: "🏡 Das Dorf hat gewonnen! Alle Wölfe sind tot.", wolf: "🐺 Die Werwölfe haben gewonnen!", liebe: "💘 Das Liebespaar hat gewonnen!" };
const kopf = (sp, text) => `<div class="bs-kopf"><span class="bs-emo">${sp.emoji}</span><span><b>${esc(sp.name)}</b>${text ? `<small>${text}</small>` : ""}</span></div>`;

function htmlWerwolf(d, nm, sp) {
  const nacht = d.phase === "nacht";
  const lebt = (j) => !d.lebt || d.lebt[j];
  if (d.phase === "einstellen" || d.phase === "rollen") {
    return `<div class="bsw nacht">${kopf(sp, "automatischer Spielleiter")}
      <div class="bsw-mitte"><div class="bs-riesig">${d.phase === "rollen" ? "🃏" : "🐺"}</div>
      <p class="bm-gross">${d.phase === "rollen" ? "Schaut heimlich aufs Handy – das ist eure Rolle!" : "Die Rollen werden eingestellt …"}</p>
      <p class="bm-zeile">${d.phase === "rollen" ? `${d.bereit || 0} von ${d.n} sind bereit` : `${d.n} Spieler · gleich bekommt jeder seine geheime Rolle`}</p></div></div>`;
  }
  let titel, zeile = "";
  if (nacht) { titel = `🌙 Nacht ${d.nacht}`; zeile = `Das Dorf schläft. ${WACH[d.wach] || ""}`; }
  else if (d.phase === "morgen") { titel = `☀️ Tag ${d.nacht}`; zeile = d.tode.length ? "" : "🌅 Ein Wunder – heute Nacht ist niemand gestorben."; }
  else if (d.phase === "tag") { titel = "⚖️ Abstimmung"; zeile = `Wer ist ein Werwolf? ${d.abgestimmt || 0} von ${d.waehler || 0} haben abgestimmt.`; }
  else { titel = "🪢 Urteil"; zeile = d.unentschieden ? "⚖️ Unentschieden – heute wird niemand gehängt." : ""; }
  const stimmen = d.stimmen || {};
  const max = Math.max(1, ...Object.values(stimmen));
  const haus = (n, j) => {
    const tot = !lebt(j), st = stimmen[j] || 0;
    const rolle = d.rollen ? WW.ROLLEN[d.rollen[j]] : null;
    return `<div class="bsw-haus ${tot ? "tot" : ""} ${d.phase === "tag" && st === max && st > 0 ? "vorn" : ""}">
      <span class="bsw-h">${rolle ? rolle.emoji : tot ? "🪦" : nacht ? "🏚️" : "🏠"}</span><b>${esc(n)}</b>
      ${rolle ? `<small>${esc(rolle.name)}${d.liebe && d.liebe.includes(j) ? " 💘" : ""}</small>` : ""}
      ${d.phase === "tag" && !tot ? `<em class="bsw-st">${st ? "🗳️ " + st : ""}</em>` : ""}</div>`;
  };
  const tode = (d.phase === "morgen" || d.phase === "hinrichtung") && !d.gewinner ? d.tode.map((x) => `<div class="bsw-tod">✝ <b>${esc(nm[x.j])}</b> ${esc(x.grund)}.</div>`).join("") : "";
  const ende = d.gewinner ? `<div class="bs-sieg">🏆 ${SIEG[d.gewinner]}</div><p class="bm-leise mitte">Alle Rollen aufgedeckt:</p>` : "";
  return `<div class="bsw ${nacht ? "nacht" : "tag"}">${kopf(sp, nacht ? "" : "")}
      <div class="bsw-himmel"><span class="bsw-gestirn">${nacht ? "🌕" : "☀️"}</span><span class="bsw-titel">${titel}</span></div>
      ${zeile ? `<p class="bm-zeile mitte">${zeile}</p>` : ""}${tode}${ende}
      ${d.schuss && !d.gewinner ? `<p class="bm-zeile mitte bsw-schuss">🏹 Ein letzter Schuss steht noch aus …</p>` : ""}
      <div class="bsw-dorf ${nm.length > 10 ? "viele" : ""}">${nm.map(haus).join("")}</div></div>`;
}

function htmlWerbinich(d, nm, sp) {
  const platz = (j) => (d.erraten[j] ? `${MED[d.erraten[j]] || d.erraten[j] + "."}` : "");
  const stand = `<div class="bsb-stand">${nm.map((n, j) => `<div class="bsb-sp ${j === d.dran ? "dran" : ""} ${d.erraten[j] ? "geschafft" : ""}">
      <b>${esc(n)}</b><span>${d.erraten[j] ? `✅ ${platz(j)}` : "❓"}</span><small>${d.fragen[j] || 0} ${(d.fragen[j] || 0) === 1 ? "Zug" : "Züge"}</small></div>`).join("")}</div>`;
  if (d.alle) {
    const sieger = d.erraten.indexOf(1);
    const punkt = nm.filter((_, j) => d.erraten[j]).map(esc).join(", ");
    return `<div class="bsb">${kopf(sp, d.beendet ? "Spiel beendet" : "alle haben sich erraten")}<div class="bs-sieg">🏆 ${esc(nm[sieger] || "")} war am schnellsten!</div>
      <p class="bm-leise">Je einen Punkt: ${punkt}</p>
      <div class="bsb-alle">${nm.map((n, j) => `<div><b>${esc(n)}</b><span>${esc((d.figuren || [])[j] || "")}</span><em>${platz(j)}</em></div>`).join("")}</div></div>`;
  }
  const ende = d.seit + d.zeit * 1000;
  return `<div class="bsb">${kopf(sp, "Spieler mit dem Rücken zur Wand – die anderen sehen hin")}
      <p class="bm-zeile mitte"><b>${esc(nm[d.dran] || "")}</b> fragt: „Bin ich …?“ – nur Ja oder Nein</p>
      <div class="bsb-figur">${esc(d.figur)}</div>
      <div class="bsb-uhr"><b data-bsek="${ende}">⏱️ ${mmss(d.zeit)}</b></div>
      ${d.erraten[d.dran] ? `<p class="bm-leise mitte">✅ ${esc(nm[d.dran])} hat sich schon erraten</p>` : ""}
      ${stand}</div>`;
}

function htmlMalen(d, nm, sp) {
  const maler = esc(nm[d.maler] || "");
  let info;
  if (d.geloest === null) info = `<p class="bm-gross">${maler} malt …</p><p class="bsm-muster">${esc(d.muster || "")}</p><p class="bm-leise">Ratet am Handy – wer es zuerst hat, bekommt einen Punkt, ${maler} auch.</p>`;
  else if (d.geloest >= 0) info = `<div class="bs-sieg">🎉 ${esc(nm[d.geloest] || "")} hat es!</div><p class="bm-gross">${esc(d.wort)}</p>
    <p class="bm-zeile">+1 Punkt für ${esc(nm[d.geloest] || "")} und ${maler} · alle anderen trinken 1 Schluck, ${maler} verteilt ${schlucke(2)}</p>`;
  else info = `<p class="bm-gross">Aufgegeben – es war: <b>${esc(d.wort)}</b></p><p class="bm-zeile">${maler} trinkt ${schlucke(2)}</p>`;
  const punkte = Object.entries(d.wertung || {}).map(([j, n]) => [Number(j), n]).filter(([j]) => nm[j] !== undefined).sort((x, y) => y[1] - x[1]);
  return `<div class="bsm">${kopf(sp, `Runde ${d.runde}`)}<div class="bsm-reihe">
      <div class="bsm-blatt"><canvas class="bsm-lw" width="900" height="900" data-bs-leinwand data-striche="${d.striche.length}"></canvas></div>
      <div class="bsm-text">${info}
        ${d.tipps.length ? `<div class="bsm-tipps">${d.tipps.map((x) => `<span><b>${esc(nm[x.von] || "")}:</b> ${esc(x.t)}</span>`).join("")}</div>` : ""}
        ${punkte.length ? `<p class="bm-leise">🏅 Punkte: ${punkte.map(([j, n]) => `${esc(nm[j])} ${n}`).join(" · ")}</p>` : ""}</div></div></div>`;
}

function reaktionsListe(d, nm) {
  return nm.map((n, j) => [j, d.zeiten[j]]).filter(([, ms]) => ms !== undefined).sort((x, y) => (x[1] < 0 ? 1e9 : x[1]) - (y[1] < 0 ? 1e9 : y[1]));
}
function htmlReaktion(d, nm, sp) {
  if (d.phase === "bereit") {
    return `<div class="bsr">${kopf(sp, "Reaktionstest")}<div class="bsr-flaeche bereit"><b>Gleich geht's los!</b><small>Am Handy tippen, sobald es <u>grün</u> wird – zu früh = raus</small></div></div>`;
  }
  if (d.phase === "laeuft") {
    const raus = nm.map((n, j) => (d.zeiten[j] !== undefined && d.zeiten[j] < 0 ? n : null)).filter(Boolean);
    const da = Object.keys(d.zeiten).length;
    return `<div class="bsr">${kopf(sp, `Runde ${d.runde}`)}<div class="bsr-flaeche rot" data-bs-reaktion><b>Warte …</b><small>Augen aufs Handy – tippen, sobald es grün wird!</small></div>
      <p class="bm-zeile mitte">${da} von ${nm.length} haben getippt</p>
      ${raus.length ? `<p class="bm-zeile mitte bsr-raus">😬 Zu früh – raus: ${raus.map((n) => `<b>${esc(n)}</b>`).join(", ")}</p>` : ""}</div>`;
  }
  const liste = reaktionsListe(d, nm);
  const letzter = liste[liste.length - 1], erster = liste[0];
  const joker = d.joker && d.joker.neu && d.joker.neu.length ? `<p class="bm-zeile mitte bsr-joker">🃏 Joker fürs Glücksrad: ${d.joker.neu.map((n) => `<b>${esc(n)}</b>`).join(" & ")}</p>`
    : d.joker && d.joker.alle && d.joker.alle.length ? `<p class="bm-leise mitte">🃏 ${d.joker.alle.map(esc).join(" & ")} hat schon die höchste Zahl Joker</p>` : "";
  return `<div class="bsr">${kopf(sp, `Runde ${d.runde} – Rangliste`)}
      <ol class="bm-rang bsr-rang">${liste.map(([j, ms], k) => `<li class="${ms >= 0 && k === 0 ? "p1" : ""} ${ms < 0 ? "raus" : ""}"><span class="bm-platz">${ms < 0 ? "😬" : MED[k + 1] || k + 1 + "."}</span>
        <span class="bm-name">${esc(nm[j])}</span><b class="bm-wert">${ms < 0 ? "zu früh – raus" : ms + " ms"}</b></li>`).join("")}</ol>
      ${letzter ? `<p class="bm-zeile mitte">${esc(nm[letzter[0]])} trinkt ${schlucke(letzter[1] < 0 ? 2 : 1)} · ${esc(nm[erster[0]])} verteilt 1</p>` : ""}${joker}</div>`;
}

const ROT = (f) => f === "♥" || f === "♦";
function htmlPferde(d, nm, sp, merk) {
  const vorher = (merk && merk.pos) || d.pos;
  const bahn = ["♠", "♥", "♦", "♣"].map((f) => `<div class="bsp-bahn ${d.sieger === f ? "sieger" : ""}"><span class="bsp-ass ${ROT(f) ? "rotk" : ""}">A${f}</span>
      <div class="bsp-spur" style="--ziel:${ZIEL}">${Array.from({ length: ZIEL }, (_, k) => `<i class="${k + 1 <= d.aufgedeckt ? "auf" : ""}"></i>`).join("")}
        <span class="bsp-pferd" style="--von:${vorher[f] || 0};--nach:${d.pos[f] || 0}">🐎</span><span class="bsp-zielfahne">🏁</span></div></div>`).join("");
  const seite = `<div class="bsp-seite">${Array.from({ length: d.seiteN }, (_, k) => `<span class="${k < d.seite.length ? "auf" : ""} ${k < d.seite.length && ROT(d.seite[k]) ? "rotk" : ""}">${k < d.seite.length ? d.seite[k] : "🂠"}</span>`).join("")}</div>`;
  const wetten = Object.entries(d.wetten).map(([j, w]) => `<span class="bm-pille ${d.sieger && w.f === d.sieger ? "gewinnt" : ""}">${esc(nm[j] || "")}: <b class="${ROT(w.f) ? "rotk" : ""}">${w.f}</b> × ${w.n}</span>`).join("");
  if (d.phase === "wetten") {
    return `<div class="bsp">${kopf(sp, "Setzt am Handy auf ein Ass!")}${bahn}<div class="bm-pillen mitte bsp-wetten">${wetten || `<span class="bm-leise">Noch keine Wetten …</span>`}</div></div>`;
  }
  const l = d.letzte;
  const gezogen = l ? `<p class="bm-zeile mitte">Gezogen: <b class="${ROT(l.f) ? "rotk" : ""}">${esc(String(l.w))}${l.f}</b>${l.rueck ? ` – Seitenkarte: <b class="${ROT(l.rueck) ? "rotk" : ""}">${l.rueck}</b> muss einen Schritt zurück!` : ""}</p>` : "";
  let ende = "";
  if (d.phase === "ende") {
    // kurz, damit es auch mit vielen Wetten gross bleibt: Zahl in Klammern = Schlucke
    const { gew, verl } = pferdeAbrechnung(d.wetten, d.sieger);
    const liste = (l) => l.map(([j, n]) => `<b>${esc(nm[j] || "")}</b>&nbsp;(${n})`).join(" · ");
    ende = `<div class="bs-sieg">🏆 Ass <span class="${ROT(d.sieger) ? "rotk" : ""}">${d.sieger}</span> gewinnt!</div>
      ${gew.length ? `<p class="bm-zeile mitte bsp-ab gut">🏆 Gewinner verteilen: ${liste(gew)}</p>` : ""}
      ${verl.length ? `<p class="bm-zeile mitte bsp-ab">🍺 Verlierer trinken: ${liste(verl)}</p>` : ""}
      <p class="bm-leise mitte">${gew.length || verl.length ? "Zahl in Klammern = Schlucke" : "Niemand hatte gesetzt."}</p>`;
  }
  return `<div class="bsp">${kopf(sp, "Gewinner verteilen, Verlierer trinken")}${bahn}${seite}${gezogen}${ende}${d.phase === "ende" ? "" : `<div class="bm-pillen mitte bsp-wetten">${wetten}</div>`}</div>`;
}

function htmlSchaetzen(d, nm, sp) {
  if (d.phase === "tippen") {
    return `<div class="bss">${kopf(sp, "Zahl am Handy tippen – wer am nächsten dran ist, gewinnt")}<div class="bss-frage">${esc(d.frage)}</div>
      <div class="bm-pillen mitte bss-wer">${nm.map((n, j) => `<span class="bm-pille ${d.abgegeben.includes(j) ? "da" : "leise"}">${d.abgegeben.includes(j) ? "✅" : "⏳"} ${esc(n)}</span>`).join("")}</div>
      <p class="bm-zeile mitte">${d.abgegeben.length} von ${nm.length} haben getippt</p></div>`;
  }
  const abst = nm.map((_, j) => [j, (d.tipps || {})[j]]).filter(([, t]) => t !== undefined).map(([j, t]) => [j, t, t - d.loesung]).sort((x, y) => Math.abs(x[2]) - Math.abs(y[2]));
  const zahl = (x) => Number(x).toLocaleString("de-DE");
  const bestes = abst.length ? Math.abs(abst[0][2]) : null;
  return `<div class="bss">${kopf(sp, "Auflösung")}<div class="bss-frage klein">${esc(d.frage)}</div>
      <div class="bss-loesung">${zahl(d.loesung)}</div>
      <ol class="bm-rang bss-rang">${abst.map(([j, t, u]) => `<li class="${Math.abs(u) === bestes ? "p1" : ""}"><span class="bm-platz">${Math.abs(u) === bestes ? "🎯" : ""}</span>
        <span class="bm-name">${esc(nm[j])}</span><b class="bm-wert">${zahl(t)}</b><small class="bss-ab">${u === 0 ? "genau!" : (u > 0 ? "+" : "−") + zahl(Math.abs(u))}</small></li>`).join("")}</ol>
      ${abst.length ? `<p class="bm-zeile mitte">${esc(nm[abst[abst.length - 1][0]])} trinkt ${schlucke(2)} · ${esc(nm[abst[0][0]])} verteilt ${schlucke(2)}</p>` : ""}</div>`;
}

const BUCHST = ["A", "B", "C", "D"];
function htmlQuiz(d, nm, sp) {
  const auf = d.phase === "aufloesung";
  const ende = d.seit + d.zeit * 1000;
  const antw = d.antworten.map((a, k) => {
    const wer = auf ? nm.filter((_, j) => d.wahl && d.wahl[j] === k).map(esc).join(", ") : "";
    return `<div class="bsq-antwort ${auf ? (k === d.richtig ? "richtig" : "falsch") : ""}"><b>${BUCHST[k]}</b><span>${esc(a)}</span>${wer ? `<small>${wer}</small>` : ""}</div>`;
  }).join("");
  const stand = nm.map((n, j) => [n, d.punkte[j] || 0]).sort((x, y) => y[1] - x[1]);
  return `<div class="bsq">${kopf(sp, auf ? "Auflösung" : "Antwort am Handy tippen")}
    <div class="bsq-kopf"><span class="bm-leise">Frage ${d.nr + 1}</span>${auf ? "" : `<b class="bsq-uhr" data-bsek="${ende}" data-bende="⏰ Zeit um!">⏱️ ${d.zeit}</b>`}</div>
    <div class="bsq-frage">${esc(d.frage)}</div>
    <div class="bsq-raster">${antw}</div>
    ${auf ? `<p class="bm-zeile mitte">${d.schnellste !== null && nm[d.schnellste] !== undefined ? `⚡ Am schnellsten richtig: ${esc(nm[d.schnellste])}` : "Diesmal hatte niemand recht."}</p>`
      : `<div class="bm-pillen mitte">${nm.map((n, j) => `<span class="bm-pille ${d.abgegeben.includes(j) ? "da" : "leise"}">${d.abgegeben.includes(j) ? "✅" : "⏳"} ${esc(n)}</span>`).join("")}</div>`}
    <p class="bm-leise mitte">🏅 ${stand.map(([n, x]) => `${esc(n)} ${x}`).join(" · ")}</p></div>`;
}

// ---------------------------------------------------------------- Zuschauen: fertige Spiele (Spielfeld, wer dran ist, Stand)
const treffer = (d) => (d && d.schuesse ? d.schuesse.flat().filter((z) => z[2] > 0).length : 0);
function fremdSpieler(d, nm) {
  return `<div class="bsf-spieler">${nm.slice(0, Math.max(d.n, 2)).map((n, j) => `<span class="bsf-sp ${d.dran === j && !d.vorbei ? "dran" : ""} ${d.sieger.includes(j) ? "sieger" : ""}" style="--f:${esc(d.farben[j] || "#888")}">
      <i>${esc(d.zeichen[j] || "●")}</i><b>${esc(n)}</b>${d.dran === j && !d.vorbei ? "<small>ist dran</small>" : ""}${d.sieger.includes(j) ? "<small>🏆 gewinnt</small>" : ""}</span>`).join("")}</div>`;
}
function fremdZeile(d, nm) {
  if (d.vorbei) return d.sieger.length ? `<div class="bs-sieg">🏆 ${d.sieger.map((j) => esc(nm[j] || "")).join(" & ")} ${d.sieger.length > 1 ? "gewinnen" : "gewinnt"}!</div>` : `<div class="bs-sieg">🤝 Unentschieden!</div>`;
  return d.dran !== null && nm[d.dran] !== undefined ? `<p class="bm-zeile mitte">Am Zug: <b>${esc(nm[d.dran])}</b></p>` : "";
}
function htmlRaster(d, nm, sp, zelle, kl) {
  const zeilen = d.brett.length, spalten = (d.brett[0] || []).length;
  return `<div class="bsf">${kopf(sp, "Zuschauen")}${fremdZeile(d, nm)}
      <div class="bsf-feld ${kl}" style="--sp:${spalten};--ze:${zeilen}">${d.brett.map((r, y) => r.map((c, x) => zelle(c, x, y)).join("")).join("")}</div>
      ${fremdSpieler(d, nm)}</div>`;
}
const fremdHTML = {
  "f-ttt": (d, nm, sp) => htmlRaster(d, nm, sp, (c) => `<span class="bsf-z">${c === null ? "" : `<b style="color:${esc(d.farben[c] || "#fff")}">${esc(d.zeichen[c] || "●")}</b>`}</span>`, "ttt"),
  "f-vier": (d, nm, sp) => htmlRaster(d, nm, sp, (c) => `<span class="bsf-z"><i style="${c === null ? "" : `background:${esc(d.farben[c] || "#fff")}`}" class="${c === null ? "leer" : ""}"></i></span>`, "vier"),
  "f-dame": (d, nm, sp) => htmlRaster(d, nm, sp, (c, x, y) => `<span class="bsf-z ${(x + y) % 2 ? "dunkel" : "hell"}">${c ? `<i class="stein s${c.i}">${c.k ? "♛" : ""}</i>` : ""}</span>`, "dame"),
  "f-schiffe": (d, nm, sp) => {
    if (d.phase === "setup") {
      return `<div class="bsf">${kopf(sp, "Zuschauen")}<div class="bsw-mitte"><div class="bs-riesig">🚢</div><p class="bm-gross">Die Flotten werden heimlich aufgestellt …</p></div>
        <div class="bsf-spieler">${nm.slice(0, 2).map((n, j) => `<span class="bsf-sp" style="--f:${esc(d.farben[j] || "#888")}"><i>${esc(d.zeichen[j] || "")}</i><b>${esc(n)}</b><small>${d.bereit[j] ? "✅ bereit" : "⏳ stellt auf"}</small></span>`).join("")}</div></div>`;
    }
    const meer = (j) => {
      const zellen = Array.from({ length: d.h }, () => Array(d.b).fill(-1));
      (d.schuesse[j] || []).forEach(([x, y, r]) => { if (zellen[y] && x >= 0 && x < d.b) zellen[y][x] = r; });
      const gegner = nm[1 - j] || "";
      return `<div class="bsf-meer ${d.dran === j && !d.vorbei ? "dran" : ""}"><h3>${esc(nm[j] || "")} schießt auf ${esc(gegner)}</h3>
        <div class="bsf-feld schiffe" style="--sp:${d.b};--ze:${d.h}">${zellen.map((r) => r.map((z) => `<span class="bsf-z ${z === 0 ? "wasser" : z === 1 ? "treffer" : z === 2 ? "versenkt" : ""}">${z === 0 ? "•" : z > 0 ? "✕" : ""}</span>`).join("")).join("")}</div>
        <p class="bm-leise mitte">${d.versenkt[j] || 0} von ${d.schiffe} Schiffen versenkt</p></div>`;
    };
    return `<div class="bsf">${kopf(sp, "Zuschauen – die Schiffe selbst bleiben geheim")}${fremdZeile(d, nm)}<div class="bsf-meere">${meer(0)}${meer(1)}</div></div>`;
  },
  "f-wuerfel": (d, nm, sp) => {
    const AUGEN = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const rang = nm.slice(0, d.n).map((n, j) => [j, d.punkte[j] || 0]).sort((x, y) => y[1] - x[1]);
    return `<div class="bsf">${kopf(sp, "Zuschauen")}${fremdZeile(d, nm)}
      ${d.vorbei ? "" : `${d.wuerfel.length ? `<div class="bsf-wuerfel">${d.wuerfel.map((w, k) => `<span class="${d.halten[k] ? "halten" : ""}">${AUGEN[w] || w}</span>`).join("")}</div>` : `<p class="bm-zeile mitte">🎲 Gleich wird gewürfelt …</p>`}
      <p class="bm-leise mitte">Wurf ${d.wurf} von ${d.wuerfe}${d.halten.some(Boolean) ? " · hell = behalten" : ""}</p>`}
      <ol class="bm-rang bsf-rang">${rang.map(([j, x], k) => `<li class="${k === 0 ? "p1" : ""} ${d.dran === j && !d.vorbei ? "dran" : ""}"><span class="bm-platz">${MED[k + 1] || k + 1 + "."}</span>
        <span class="bm-name">${esc(nm[j] || "")}${d.dran === j && !d.vorbei ? " 🎲" : ""}<small>${d.felder[j] || 0} von ${d.alle} Feldern</small></span><b class="bm-wert">${x}</b></li>`).join("")}</ol></div>`;
  },
};

const HTML = { quiz: htmlQuiz, werwolf: htmlWerwolf, werbinich: htmlWerbinich, malen: htmlMalen, reaktion: htmlReaktion, pferde: htmlPferde, schaetzen: htmlSchaetzen, ...fremdHTML };
export const HTML_DA = (id) => Object.prototype.hasOwnProperty.call(HTML, id);

// raum (Beamer-Stand), p (Kurzfassung der Partie), d (Auszug), merk (was der Beamer sich je Partie merkt), vorbei = beendet
export function html(raum, p, d, merk, vorbei = false) {
  const sp = spiel(p.spiel);
  if (!sp || !HTML[p.spiel]) return "";
  let h;
  try { h = HTML[p.spiel](d, P.namen(raum, p), sp, merk); } catch (e) { console.error(e); return ""; }
  if (vorbei) h = `<div class="bs-vorbei">⏹️ ${esc(sp.name)} ist beendet – gleich geht die Diashow weiter</div>${h}`;
  h = `<div class="bs bs-${p.spiel}" data-bs-spiel="${p.spiel}">${h}</div>`;
  return P.ohneTrinken(raum, p) ? ohneAlkohol(h) : h;   // je Partie (p.ohne), alte Partien: Raum-Schalter
}

// Nach dem Einsetzen: Leinwand zeichnen, Reaktions-Flaeche schalten. lokal = {gruen: {key: Zeitpunkt}} des Beamers
export function nach(el, p, d, lokal, beiGruen) {
  const c = el.querySelector("[data-bs-leinwand]");
  if (c && d.striche) {
    const g = c.getContext("2d");
    g.fillStyle = "#fffdf8"; g.fillRect(0, 0, c.width, c.height);
    g.lineCap = g.lineJoin = "round"; g.lineWidth = 11; g.strokeStyle = "#1b1f2a";
    d.striche.forEach((pf) => { if (!Array.isArray(pf) || pf.length < 2) return; g.beginPath(); g.moveTo(pf[0][0] * 9, pf[0][1] * 9); pf.forEach(([x, y]) => g.lineTo(x * 9, y * 9)); g.stroke(); });
  }
  const f = el.querySelector("[data-bs-reaktion]");
  if (f && d.phase === "laeuft") {
    const key = `${p.pid}:${d.runde}`;
    if (!lokal.gruen[key]) lokal.gruen[key] = performance.now() + (Number(d.warte) || 0) + REAKTION_PUFFER;
    const um = lokal.gruen[key];
    const gruen = () => { const x = document.querySelector("[data-bs-reaktion]"); if (x && !x.classList.contains("gruen")) { x.className = "bsr-flaeche gruen"; x.innerHTML = "<b>JETZT!</b>"; if (beiGruen) beiGruen(); } };
    clearTimeout(lokal.timer);
    if (performance.now() >= um) gruen(); else lokal.timer = setTimeout(gruen, um - performance.now());
  }
}

// Restzeit als m:ss (Wer bin ich laeuft seit 27.10. drei Minuten)
const mmss = (sek) => `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")}`;

// Sekunden-Uhren (Wer bin ich): -> Klaenge (tick in den letzten 5 s, Gong bei 0)
const gegongt = new Set();
export function uhren(root, jetzt) {
  const toene = [];
  (root || document).querySelectorAll("[data-bsek]").forEach((el) => {
    const ende = Number(el.dataset.bsek), rest = Math.ceil((ende - jetzt) / 1000);
    const t = rest > 0 ? `⏱️ ${mmss(rest)}` : (el.dataset.bende || "⏰ Zeit um – der Nächste fragt!");
    if (el.textContent === t) return;
    el.textContent = t;
    el.classList.toggle("knapp", rest <= 10);
    if (rest > 0 && rest <= 5) toene.push("tick");
    if (rest <= 0 && !gegongt.has(ende)) { gegongt.add(ende); toene.push("gong"); }
  });
  return toene;
}
