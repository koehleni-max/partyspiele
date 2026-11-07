// Echte Duelle (Grossumbau Runde 1, Nico 01.11.2026 - Plan alltag/partyspiele/GROSSUMBAU-PLAN-2026-11.md, 3.1 A/B und 3.2).
// Vorher entschied am Duellfeld ein Wuerfel (brett.js, "1 + zufall(6)") - das hatte Nico schon am 26.10. abgelehnt.
// Jetzt spielen zwei Leute wirklich gegeneinander, jeder am eigenen Handy oder Controller, und sehen den anderen dabei.
//
// Ablauf (Stand du, liegt im Spiel: brett.js s.duell, Gluecksrad-Duell s.duell):
//   wahl      der Herausgeforderte (b) waehlt eines von zwei Duellspielen - eine Entscheidung, kein Los. Angeboten wird
//             reihum aus POOL (duellNr), also auch ohne Los.
//   spiel     Start fuer beide gleichzeitig ueber die Gastgeber-Uhr (du.start; vorher Titelkarte und 3-2-1). Gemeinsame
//             Aufgaben (Ziehzeitpunkt, Korbbahn, Fragen, Farbfolge) wuerfelt der Gastgeber EINMAL aus (du.d) - beide
//             spielen genau dasselbe. Gemessen wird am eigenen Geraet; am Ende schickt jedes Geraet seinen Verlauf
//             (Zeitpunkte), der Gastgeber prueft ihn (sauber) und vergleicht (vergleich). Kein Zufall im Ausgang.
//   Gleichstand: einmal Stechen mit "Duell um zwoelf"; steht es dann noch gleich, gewinnt, wer weniger Muenzen hat
//             (feste Aufholregel); sind auch die Muenzen gleich (oder gibt es keine), gewinnt der Herausgeforderte.
//   ende      Sieger steht fest; was daraus folgt (Muenzen, Trinken, Aufgabe), macht das Spiel, das das Duell nutzt.
//
// Live-Leitung: waehrend des Spiels schreibt jedes Duellanten-Geraet hoechstens 10-mal pro Sekunde seinen Fortschritt nach
// stand/live/<pid>/<spieler> ({k: Duell-Kennung, v: JSON}). Gegner, Zuschauer-Handys und Beamer zeigen ihn an; gewertet wird
// nur der Verlauf, den jedes Geraet am Ende schickt. Bots (Computer-Mitspieler) schicken ihren Verlauf sofort - er ergibt
// sich fest aus Staerke (leicht/mittel/stark, am Bot-Namen) und den gemeinsamen Daten; angezeigt wird er im Takt der Uhr.
import { esc, knopf } from "./hilfe.js";
import * as TON from "./ton.js";
import { QUIZ, QUIZ_HALLOWEEN } from "./inhalte2.js";
import { BOTNAMEN } from "./partien.js";

export const EINSATZ = 5;            // Nico 01.11.2026: fest 5 Muenzen, keine Wahl, kein Stern
export const TITEL_ZEIT = 2600;      // Titelkarte vor dem Countdown
export const COUNTDOWN = 3000;       // 3 - 2 - 1
export const VORLAUF = TITEL_ZEIT + COUNTDOWN;
export const LIVE_ABSTAND = 100;     // hoechstens 10 Schreibvorgaenge je Sekunde und Spieler
export const WARTEN_AB = 12000;      // so lange nach Spielende auf ein fehlendes Ergebnis warten, dann darf jeder weiter
export const WAHL_WARTEN = 20000;    // so lange auf die Spielwahl warten, dann darf jeder das erste Angebot nehmen
export const STECHEN_SPIEL = "mittag";
export const POOL = ["mittag", "tauziehen", "korb", "quiz", "folgen"];
export const STUFEN = ["leicht", "mittel", "stark"];

// Zufall nur fuer gemeinsame Aufgaben (daten) - nie fuer einen Ausgang
const r = (n) => Math.floor(Math.random() * n);
// fester "Wuerfel" fuer Bots: gleiche Eingabe, gleiches Ergebnis (0 <= x < 1)
export function fest(a, b = 0) {
  let h = (Math.imul((a | 0) ^ 0x9e3779b9, 2654435761) ^ Math.imul((b | 0) + 0x7f4a7c15, 40503)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const komma = (x, n = 1) => Number(x).toFixed(n).replace(".", ",");
const begrenzt = (x, a, b) => Math.max(a, Math.min(b, x));
const zahl = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const links = (t) => t === "links" || t === "x";
const rechts = (t) => t === "rechts" || t === "b";
const VIER = ["a", "b", "x", "y"];
const arena = (kl, inhalt) => `<div class="mn-arena ${kl}">${inhalt}</div>`;
const ding = (x, y, inhalt, kl = "", stil = "") => `<i class="${kl}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;${stil}">${inhalt}</i>`;
const punkteReihe = (n, max, kl = "") => `<span class="du-punkte ${kl}">${Array.from({ length: max }, (_, k) => `<i class="${k < n ? "an" : ""}"></i>`).join("")}</span>`;

// ---------------------------------------------------------------- Uhr und Leitung (app.js / beamer.js setzen sie)
const LEITUNG = { jetzt: () => Date.now(), schreiben: null };
export function leitung(x) { Object.assign(LEITUNG, x || {}); }
const jetzt = () => LEITUNG.jetzt();

// ---------------------------------------------------------------- Die Duellspiele
// Def: { id, titel, emo, typ, dauer, regel, kurz, daten(), neu(d), taste(st, t, d, ms) -> true = fertig, tick(st, d, ms) -> true,
//        erg(st, d, ms), live(st, d, ms), ausErg(e, d, ms) -> Live-Stand aus einem fertigen Verlauf (Bots, Abgegebene),
//        sauber(e, d) -> geprueftes Ergebnis, vergleich(x, y, d) > 0: x gewinnt, < 0: y gewinnt, 0: Gleichstand,
//        text(e, d), bot(d, stufe, saat), bild(st, d, ms, g), knoepfe(st, d, ms), raster, zuschau(la, lb, d, ms, na, nb) }
const MITTAG_WORTE = ["ZIEGE!", "ZIMT!", "ZUG!", "ZIEL!", "ZIRKUS!", "ZIPFEL!", "ZIEGEL!"];
function mittagKlasse(e, d) {
  if (!e || e.t === null || e.t === undefined) return [1, 0];   // nicht gezogen
  if (e.t < d.zieh) return [2, 0];                               // Fehlstart
  return [0, e.t - d.zieh];
}
function mittagWort(d, ms) {
  if (ms >= d.zieh) return { w: "ZIEH!", kl: "zieh" };
  const f = d.fakes.find((x) => ms >= x.at && ms < x.at + 550);
  return f ? { w: f.w, kl: "falsch" } : { w: "…", kl: "" };
}
function mittagStatus(l, d) {
  if (!l || l.t === null || l.t === undefined) return { emo: "🤠", text: "Hand am Halfter …", kl: "" };
  return l.t < d.zieh ? { emo: "💥", text: "Fehlstart!", kl: "rot" } : { emo: "🔫", text: `gezogen – ${l.t - d.zieh} ms`, kl: "gruen" };
}

const KORB_FLUG = 650, KORB_TOL = 9, KORB_ZIEL = 5;
export function korbX(d, ms) { const s = ms / 1000; return 50 + Math.sin(s * (1.5 + s * 0.05) + d.ph) * 40; }

const QUIZ_N = 5, QUIZ_FRAGE = 9000, QUIZ_PAUSE = 1800, QUIZ_SLOT = QUIZ_FRAGE + QUIZ_PAUSE;
const QUIZ_VORRAT = QUIZ.concat(QUIZ_HALLOWEEN);
const BUCHST = ["A", "B", "C", "D"];
// Punkte im Quizduell: je Frage zaehlt die schnellere Antwort; ist sie falsch, darf der andere (seine Antwort zaehlt dann)
function quizPunkte(x, y, d) {
  let px = 0, py = 0;
  for (let k = 0; k < QUIZ_N; k++) {
    const q = d.q[k], ax = x && x.a ? x.a[k] : null, ay = y && y.a ? y.a[k] : null;
    const liste = [[ax, 0], [ay, 1]].filter(([v]) => v).sort((p, q2) => p[0].t - q2[0].t);
    if (!liste.length) continue;
    const gleichzeitig = liste.length === 2 && liste[0][0].t === liste[1][0].t;
    if (gleichzeitig) { liste.forEach(([v, wer]) => { if (v.w === q.r) { if (wer) py++; else px++; } }); continue; }
    const treffer = liste.find(([v]) => v.w === q.r);
    if (treffer) { if (treffer[1]) py++; else px++; }
  }
  return [px, py];
}

const FOLGE_START = 3, FOLGE_AN = 550, FOLGE_AUS = 200, FOLGE_PAUSE = 700, FOLGE_MIN_TIPP = 80;
const FARBE = { a: ["Grün", "#16a34a"], b: ["Rot", "#e11d48"], x: ["Blau", "#2563eb"], y: ["Gelb", "#ca8a04"] };
const folgeRunden = (e) => (e && Array.isArray(e.fertig) ? e.fertig.length : 0);

export const DEF = {
  // ------------------------------------------------------------ 1. Duell um zwoelf (Reaktion, auch das Stechen)
  mittag: {
    id: "mittag", titel: "Duell um zwölf", emo: "🤠", typ: "Reaktion", dauer: 12000,
    kurz: "Erst bei ZIEH! ziehen – zu früh verliert",
    regel: "Warte auf das Wort ZIEH! – dann sofort ziehen. Vorher kommen falsche Wörter wie ZIEGE oder ZUG: wer zu früh zieht, verliert.",
    daten() {
      const zieh = 3500 + r(4500), fakes = [];
      for (let t = 900 + r(700); t < zieh - 700; t += 850 + r(900)) fakes.push({ at: t, w: MITTAG_WORTE[r(MITTAG_WORTE.length)] });
      return { zieh, fakes };
    },
    neu: () => ({ t: null }),
    taste(st, t, d, ms) {
      if ((t !== "a" && t !== "hoch") || st.t !== null) return false;
      st.t = Math.max(0, Math.round(ms));
      TON.spiele(st.t >= d.zieh ? "schuss" : "falsch");
      return true;
    },
    tick: (st, d, ms) => ms > d.zieh + 2500,
    erg: (st) => ({ t: st.t }),
    live: (st) => ({ t: st.t }),
    ausErg: (e, d, ms) => ({ t: e && e.t !== null && e.t <= ms ? e.t : null }),
    sauber: (e) => { const t = zahl(e && e.t); return { t: t !== null && t >= 0 && t < 60000 ? Math.round(t) : null }; },
    vergleich(x, y, d) {
      const a = mittagKlasse(x, d), b = mittagKlasse(y, d);
      if (a[0] !== b[0]) return b[0] - a[0];
      return a[0] === 0 ? b[1] - a[1] : 0;
    },
    text(e, d) { const [k, z] = mittagKlasse(e, d); return k === 2 ? "💥 Fehlstart" : k === 1 ? "nicht gezogen" : `${z} ms`; },
    bot(d, stufe, saat) {
      // leicht faellt auf das vierte falsche Wort herein (wenn es so viele gibt) - fest aus den Daten, nicht gewuerfelt
      if (stufe === 0 && d.fakes.length >= 4) { const t = d.fakes[3].at + 180; return { t, fertig: t + 200 }; }
      const t = d.zieh + [420, 320, 245][stufe] + Math.round((fest(saat, 1) - 0.5) * 80);
      return { t, fertig: t + 200 };
    },
    bild(st, d, ms, g) {
      const w = mittagWort(d, ms), ich = mittagStatus(st, d), er = mittagStatus(g.live, d);
      return `<div class="du-mittag"><div class="du-cowboy ${ich.kl}"><span>${ich.emo}</span><small>Du</small></div>
          <div class="mn-wort ${w.kl}">${w.w}</div>
          <div class="du-cowboy gegner ${er.kl}"><span>${er.emo}</span><small>${esc(g.name)}</small></div></div>
        <small>${st.t !== null ? esc(ich.text) : er.kl ? `${esc(g.name)}: ${esc(er.text)}` : "🤠 Hand am Halfter …"}</small>`;
    },
    knoepfe: (st) => (st.t === null ? [["a", "✋ Ziehen!"]] : []), raster: "1",
    zuschau(la, lb, d, ms, na, nb) {
      const w = mittagWort(d, ms), a = mittagStatus(la, d), b = mittagStatus(lb, d);
      return `<div class="du-mittag gross"><div class="du-cowboy ${a.kl}"><span>${a.emo}</span><small>${esc(na)}</small><em>${esc(a.text)}</em></div>
        <div class="mn-wort ${w.kl}">${w.w}</div>
        <div class="du-cowboy gegner ${b.kl}"><span>${b.emo}</span><small>${esc(nb)}</small><em>${esc(b.text)}</em></div></div>`;
    },
  },
  // ------------------------------------------------------------ 2. Tauziehen live (Geschick)
  tauziehen: {
    id: "tauziehen", titel: "Tauziehen live", emo: "🪢", typ: "Geschick", dauer: 10000, linie: 22,
    kurz: "Abwechselnd ⬅️ ➡️ – das Seil zeigt live, wer vorn liegt",
    regel: "Tippt abwechselnd ⬅️ und ➡️ – jeder Wechsel ist ein Zug am Seil. Wer 22 Züge Vorsprung hat, zieht den anderen über die Linie. Sonst gewinnt nach 10 Sekunden, wer mehr Züge hat.",
    daten: () => ({}),
    neu: () => ({ z: [], letzte: null }),
    taste(st, t, d, ms) {
      const s = links(t) ? "l" : rechts(t) ? "r" : null;
      if (!s || s === st.letzte || st.z.length >= 400 || ms > this.dauer) return false;
      st.letzte = s; st.z.push(Math.round(ms));
      if (st.z.length % 3 === 0) TON.spiele("tack");
      return false;
    },
    tick(st, d, ms) { return ms >= this.dauer; },
    erg: (st) => ({ z: st.z.slice() }),
    live: (st) => ({ n: st.z.length }),
    ausErg: (e, d, ms) => ({ n: e && Array.isArray(e.z) ? e.z.filter((t) => t <= ms).length : 0 }),
    sauber(e) {
      const roh = Array.isArray(e && e.z) ? e.z.map(zahl).filter((t) => t !== null && t >= 0 && t <= this.dauer + 300).map(Math.round).sort((p, q) => p - q) : [];
      const z = [];
      roh.forEach((t) => { if (!z.length || t - z[z.length - 1] >= 40) z.push(t); });   // mehr als 25 Wechsel je Sekunde schafft niemand
      return { z: z.slice(0, 400) };
    },
    // Linie: wer zuerst (nach Zeit) 22 Zuege Vorsprung hat; sonst mehr Zuege
    entscheid(x, y) {
      const ev = [...x.z.map((t) => [t, 1]), ...y.z.map((t) => [t, -1])].sort((p, q) => p[0] - q[0]);
      let diff = 0, k = 0;
      while (k < ev.length) {
        const t = ev[k][0];
        while (k < ev.length && ev[k][0] === t) { diff += ev[k][1]; k++; }
        if (Math.abs(diff) >= this.linie) return { linie: true, v: Math.sign(diff), t };
      }
      return { linie: false, v: Math.sign(x.z.length - y.z.length), t: null };
    },
    vergleich(x, y) { return this.entscheid(x, y).v; },
    text: (e) => `${e.z.length} Züge`,
    erklaer(x, y) { const e = this.entscheid(x, y); return e.linie ? `über die Linie gezogen nach ${komma(e.t / 1000)} s` : "nach 10 Sekunden mehr Züge"; },
    bot(d, stufe, saat) {
      const takt = 1000 / [6.5, 8.5, 10.5][stufe], z = [];
      for (let k = 0; ; k++) { const t = Math.round(280 + k * takt + (fest(saat, k) - 0.5) * 36); if (t > this.dauer) break; z.push(t); }
      return { z, fertig: this.dauer };
    },
    seil(nA, nB, la = "Du", lb = "") {
      const diff = nA - nB, pos = begrenzt(50 - (diff / this.linie) * 42, 6, 94);
      return `<div class="du-tau"><i class="du-linie l"></i><i class="du-linie r"></i><div class="du-seil"></div><span class="du-knoten" style="left:${pos.toFixed(1)}%">🎀</span>
        <b class="du-zieher l">💪 ${esc(la)}</b><b class="du-zieher r">${esc(lb)} 💪</b></div>`;
    },
    bild(st, d, ms, g) {
      const er = g.live ? g.live.n : 0, diff = st.z.length - er;
      return `${this.seil(st.z.length, er, "Du", g.name)}<div class="du-stand"><b>${st.z.length}</b><span>Züge</span><b>${er}</b></div>
        <small>${Math.abs(diff) >= this.linie ? (diff > 0 ? "🎉 Über die Linie!" : "😱 Rübergezogen!") : diff > 0 ? `Du liegst ${diff} vorn` : diff < 0 ? `${esc(g.name)} liegt ${-diff} vorn` : "Gleichstand – zieh!"}</small>`;
    },
    knoepfe: () => [["links", "⬅️ Zieh"], ["rechts", "Zieh ➡️"]], raster: "2",
    zuschau(la, lb, d, ms, na, nb) {
      const a = la ? la.n : 0, b = lb ? lb.n : 0;
      return `${this.seil(a, b, na, nb)}<div class="du-stand gross"><b>${a}</b><span>Züge</span><b>${b}</b></div>`;
    },
  },
  // ------------------------------------------------------------ 3. Korbduell (Geschick)
  korb: {
    id: "korb", titel: "Korbduell", emo: "🏀", typ: "Geschick", dauer: 20000,
    kurz: "Derselbe fahrende Korb – wer zuerst 5 Körbe hat",
    regel: "Der Korb fährt hin und her – bei euch beiden genau gleich. Wirf, wenn er gleich über dir ist; der Ball braucht kurz bis oben. Wer zuerst 5 Körbe hat, gewinnt.",
    daten: () => ({ ph: Math.round(Math.random() * 628) / 100 }),
    neu: () => ({ wurf: null, k: [], zuletzt: null }),
    taste(st, t, d, ms) {
      if ((t !== "a" && t !== "hoch") || st.wurf !== null || ms < 0 || ms > this.dauer) return false;
      st.wurf = ms; TON.spiele("sprung");
      return false;
    },
    tick(st, d, ms) {
      if (st.wurf !== null && ms - st.wurf >= KORB_FLUG) {
        const land = st.wurf + KORB_FLUG;
        st.zuletzt = Math.abs(korbX(d, land) - 50) < KORB_TOL;
        if (st.zuletzt) { st.k.push(Math.round(land)); TON.spiele("richtig"); } else TON.spiele("pop");
        st.wurf = null;
      }
      return st.k.length >= KORB_ZIEL || ms >= this.dauer + KORB_FLUG;
    },
    erg: (st) => ({ k: st.k.slice() }),
    live: (st) => ({ n: st.k.length }),
    ausErg: (e, d, ms) => ({ n: e && Array.isArray(e.k) ? e.k.filter((t) => t <= ms).length : 0 }),
    // nur Koerbe, die zur gemeinsamen Korbbahn passen (Mitte getroffen) und mindestens eine Flugzeit auseinander liegen
    sauber(e, d) {
      const roh = Array.isArray(e && e.k) ? e.k.map(zahl).filter((t) => t !== null && t >= KORB_FLUG && t <= this.dauer + KORB_FLUG).sort((p, q) => p - q) : [];
      const k = [];
      roh.forEach((t) => { if (Math.abs(korbX(d, t) - 50) < KORB_TOL + 0.5 && (!k.length || t - k[k.length - 1] >= KORB_FLUG)) k.push(Math.round(t)); });
      return { k: k.slice(0, KORB_ZIEL) };
    },
    vergleich(x, y) {
      const tx = x.k.length >= KORB_ZIEL ? x.k[KORB_ZIEL - 1] : null, ty = y.k.length >= KORB_ZIEL ? y.k[KORB_ZIEL - 1] : null;
      if (tx !== null && ty !== null) return ty - tx;
      if (tx !== null || ty !== null) return tx !== null ? 1 : -1;
      if (x.k.length !== y.k.length) return x.k.length - y.k.length;
      return x.k.length ? y.k[y.k.length - 1] - x.k[x.k.length - 1] : 0;
    },
    text: (e) => `${e.k.length} ${e.k.length === 1 ? "Korb" : "Körbe"}${e.k.length >= KORB_ZIEL ? ` in ${komma(e.k[KORB_ZIEL - 1] / 1000)} s` : ""}`,
    erklaer(x, y) { const fx = x.k.length >= KORB_ZIEL, fy = y.k.length >= KORB_ZIEL; return fx || fy ? "zuerst 5 Körbe" : x.k.length !== y.k.length ? "mehr Körbe in 20 Sekunden" : "gleich viele – der letzte Korb kam früher"; },
    bot(d, stufe, saat) {
      const tol = [13, 7, 4][stufe], pause = [1100, 650, 330][stufe], k = [];
      let frei = 350 + Math.round(fest(saat, 2) * 200);
      for (let t = frei; t <= this.dauer && k.length < KORB_ZIEL; t += 20) {
        if (t < frei || Math.abs(korbX(d, t + KORB_FLUG) - 50) >= tol) continue;
        if (Math.abs(korbX(d, t + KORB_FLUG) - 50) < KORB_TOL) k.push(t + KORB_FLUG);
        frei = t + KORB_FLUG + pause;
      }
      return { k, fertig: k.length >= KORB_ZIEL ? k[KORB_ZIEL - 1] : this.dauer + KORB_FLUG };
    },
    bild(st, d, ms, g) {
      const ball = ding(50, st.wurf !== null ? 86 - ((ms - st.wurf) / KORB_FLUG) * 74 : 86, "🏀");
      const marke = st.zuletzt !== null && st.wurf === null ? ding(84, 50, st.zuletzt ? "✅" : "❌", "klein") : "";
      const er = g.live ? g.live.n : 0;
      return arena("halle", ding(korbX(d, Math.max(0, ms)), 12, "🧺", "gross") + `<i class="du-mitte"></i>` + ball + marke)
        + `<div class="du-zeile"><span>Du</span>${punkteReihe(st.k.length, KORB_ZIEL)}</div><div class="du-zeile gegner"><span>${esc(g.name)}</span>${punkteReihe(er, KORB_ZIEL, "gegner")}</div>`;
    },
    knoepfe: () => [["a", "🏀 Werfen"]], raster: "1",
    zuschau(la, lb, d, ms, na, nb) {
      return arena("halle", ding(korbX(d, Math.max(0, ms)), 12, "🧺", "gross") + `<i class="du-mitte"></i>`)
        + `<div class="du-zeile"><span>${esc(na)}</span>${punkteReihe(la ? la.n : 0, KORB_ZIEL)}</div><div class="du-zeile gegner"><span>${esc(nb)}</span>${punkteReihe(lb ? lb.n : 0, KORB_ZIEL, "gegner")}</div>`;
    },
  },
  // ------------------------------------------------------------ 4. Quizduell (Wissen, mit Buzzer)
  quiz: {
    id: "quiz", titel: "Quizduell", emo: "🧠", typ: "Wissen", dauer: QUIZ_N * QUIZ_SLOT,
    kurz: "5 Fragen mit Buzzer – wer zuerst richtig antwortet, punktet",
    regel: "Fünf Fragen. Wer zuerst richtig antwortet, bekommt den Punkt. Antwortet der Schnellere falsch, zählt die Antwort des anderen. Mehr Punkte gewinnen.",
    daten() {
      const idx = new Set();
      while (idx.size < QUIZ_N) idx.add(r(QUIZ_VORRAT.length));
      return { q: [...idx].map((i) => { const z = QUIZ_VORRAT[i], reihe = [0, 1, 2, 3].sort(() => Math.random() - 0.5); return { f: z[0], a: reihe.map((k) => z[1 + k]), r: reihe.indexOf(0) }; }) };
    },
    neu: () => ({ a: Array(QUIZ_N).fill(null) }),
    taste(st, t, d, ms) {
      const w = VIER.indexOf(t), k = Math.floor(ms / QUIZ_SLOT), in_ = ms - k * QUIZ_SLOT;
      if (w < 0 || k < 0 || k >= QUIZ_N || in_ >= QUIZ_FRAGE || st.a[k]) return false;
      st.a[k] = { w, t: Math.round(in_) };
      TON.spiele("klick");
      return false;
    },
    tick(st, d, ms) {
      const k = Math.floor(ms / QUIZ_SLOT), in_ = ms - k * QUIZ_SLOT;
      if (k >= 0 && k < QUIZ_N && in_ >= QUIZ_FRAGE && st.ton !== k) { st.ton = k; TON.spiele(st.a[k] && st.a[k].w === d.q[k].r ? "richtig" : "falsch"); }
      return ms >= this.dauer;
    },
    erg: (st) => ({ a: st.a.map((x) => (x ? { w: x.w, t: x.t } : null)) }),
    // Live: wann geantwortet wurde; WAS, erst wenn die Frage zu ist
    live(st, d, ms) { const k = Math.floor(ms / QUIZ_SLOT); return { a: st.a.map((x, j) => (x ? [x.t, j < k || ms - j * QUIZ_SLOT >= QUIZ_FRAGE ? x.w : -1] : null)) }; },
    ausErg(e, d, ms) {
      return { a: (e && e.a ? e.a : []).map((x, j) => { if (!x || j * QUIZ_SLOT + x.t > ms) return null; return [x.t, ms - j * QUIZ_SLOT >= QUIZ_FRAGE ? x.w : -1]; }) };
    },
    sauber(e) {
      const a = Array.from({ length: QUIZ_N }, (_, k) => {
        const x = e && Array.isArray(e.a) ? e.a[k] : null, w = zahl(x && x.w), t = zahl(x && x.t);
        return x && Number.isInteger(w) && w >= 0 && w < 4 && t !== null && t >= 0 && t < QUIZ_FRAGE ? { w, t: Math.round(t) } : null;
      });
      return { a };
    },
    vergleich(x, y, d) { const [px, py] = quizPunkte(x, y, d); return px - py; },
    text: () => "",
    punkteText(x, y, d) { const [px, py] = quizPunkte(x, y, d); return [`${px} ${px === 1 ? "Punkt" : "Punkte"}`, `${py} ${py === 1 ? "Punkt" : "Punkte"}`]; },
    bot(d, stufe, saat) {
      const quote = [0.45, 0.65, 0.85][stufe], basis = [4300, 3200, 2300][stufe];
      const a = d.q.map((q, k) => {
        const t = Math.round(begrenzt(basis + (fest(saat, 20 + k) - 0.5) * 1600, 700, QUIZ_FRAGE - 300));
        return { w: fest(saat, 10 + k) < quote ? q.r : (q.r + 1 + Math.floor(fest(saat, 30 + k) * 3)) % 4, t };
      });
      return { a, fertig: this.dauer };
    },
    frage(d, ms) { const k = Math.floor(Math.max(0, ms) / QUIZ_SLOT); return { k: Math.min(QUIZ_N - 1, k), offen: k < QUIZ_N && ms - k * QUIZ_SLOT < QUIZ_FRAGE, rest: QUIZ_FRAGE - (ms - k * QUIZ_SLOT) }; },
    // Zwischenstand aus eigenen Antworten und dem Live-Stand des anderen (nur geschlossene Fragen)
    stand(meins, seins, d, bis) {
      const x = { a: meins.map((v, j) => (j < bis && v ? v : null)) };
      const y = { a: (seins || []).map((v, j) => (j < bis && v && v[1] >= 0 ? { t: v[0], w: v[1] } : null)) };
      return quizPunkte(x, y, d);
    },
    bild(st, d, ms, g) {
      const f = this.frage(d, ms), q = d.q[f.k], meine = st.a[f.k], seine = g.live && g.live.a ? g.live.a[f.k] : null;
      const [p1, p2] = this.stand(st.a, g.live && g.live.a, d, f.offen ? f.k : f.k + 1);
      const kopf = `<div class="du-quizkopf"><span>Frage ${f.k + 1}/${QUIZ_N}</span><b>Du ${p1} : ${p2} ${esc(g.name)}</b></div>`;
      if (!f.offen) {
        const eigen = meine ? (meine.w === q.r ? "✅ richtig" : `❌ ${BUCHST[meine.w]}`) : "– keine Antwort";
        const fremd = seine ? (seine[1] < 0 ? "…" : seine[1] === q.r ? "✅ richtig" : `❌ ${BUCHST[seine[1]]}`) : "– keine Antwort";
        return `${kopf}<div class="du-frage">${esc(q.f)}</div><div class="du-loesung">✔️ ${BUCHST[q.r]}: ${esc(q.a[q.r])}</div>
          <div class="du-zeile"><span>Du</span><b>${eigen}</b></div><div class="du-zeile gegner"><span>${esc(g.name)}</span><b>${fremd}</b></div>`;
      }
      const buzz = seine && !meine ? `<div class="du-buzz">⚡ ${esc(g.name)} hat schon geantwortet (${komma(seine[0] / 1000)} s)!</div>`
        : seine && meine ? `<div class="du-buzz leise">⚡ ${seine[0] < meine.t ? `${esc(g.name)} war schneller` : "Du warst schneller"}</div>` : "";
      return `${kopf}<div class="du-frage">${esc(q.f)}</div><div class="du-uhrbalken"><i style="width:${begrenzt((f.rest / QUIZ_FRAGE) * 100, 0, 100).toFixed(1)}%"></i></div>
        ${meine ? `<div class="du-antwort">Deine Antwort: <b>${BUCHST[meine.w]}</b> – ${komma(meine.t / 1000)} s</div>` : ""}${buzz}`;
    },
    knoepfe(st, d, ms) {
      const f = this.frage(d, ms);
      if (!f.offen || st.a[f.k]) return [];
      return VIER.map((t, k) => [t, `${BUCHST[k]}: ${esc(d.q[f.k].a[k])}`, `farbe-${t} du-qk`]);
    },
    raster: "22",
    zuschau(la, lb, d, ms, na, nb) {
      const f = this.frage(d, ms), q = d.q[f.k];
      const [pa, pb] = this.stand((la && la.a ? la.a : []).map((v) => (v && v[1] >= 0 ? { t: v[0], w: v[1] } : null)), lb && lb.a, d, f.offen ? f.k : f.k + 1);
      const wer = (l, n) => { const v = l && l.a ? l.a[f.k] : null; return v ? (f.offen ? `⚡ ${esc(n)} ${komma(v[0] / 1000)} s` : v[1] === q.r ? `✅ ${esc(n)}` : `❌ ${esc(n)}`) : `⏳ ${esc(n)}`; };
      return `<div class="du-quizkopf"><span>Frage ${f.k + 1}/${QUIZ_N}</span><b>${esc(na)} ${pa} : ${pb} ${esc(nb)}</b></div><div class="du-frage">${esc(q.f)}</div>
        <div class="du-qraster">${q.a.map((a, k) => `<span class="${!f.offen && k === q.r ? "richtig" : ""}">${BUCHST[k]}: ${esc(a)}</span>`).join("")}</div>
        <div class="du-zeile"><b>${wer(la, na)}</b><b>${wer(lb, nb)}</b></div>`;
    },
  },
  // ------------------------------------------------------------ 5. Folgenduell (Gedaechtnis)
  folgen: {
    id: "folgen", titel: "Folgenduell", emo: "🎨", typ: "Gedächtnis", dauer: 75000,
    kurz: "Farbfolge nachtippen, jede Runde eine Farbe länger",
    regel: "Die Farben leuchten nacheinander auf – tippe sie danach in derselben Reihenfolge. Jede Runde kommt eine Farbe dazu. Wer sich zuerst vertut, verliert.",
    daten: () => ({ f: Array.from({ length: 16 }, () => VIER[r(4)]) }),
    neu: () => ({ n: FOLGE_START, phase: "zeigen", ab: 0, pos: 0, fertig: [], fehler: null, blitz: null }),
    zeigDauer: (n) => n * (FOLGE_AN + FOLGE_AUS),
    taste(st, t, d, ms) {
      if (st.phase !== "eingabe" || !VIER.includes(t)) return false;
      st.blitz = { t, ms };
      if (t !== d.f[st.pos]) { st.fehler = Math.round(ms); st.phase = "aus"; TON.spiele("falsch"); return true; }
      st.pos++; TON.spiele("klick");
      if (st.pos >= st.n) { st.fertig.push(Math.round(ms)); st.phase = "pause"; st.ab = ms; TON.spiele("richtig"); }
      return false;
    },
    tick(st, d, ms) {
      if (st.phase === "zeigen" && ms - st.ab >= this.zeigDauer(st.n)) { st.phase = "eingabe"; st.ab = ms; st.pos = 0; }
      if (st.phase === "pause" && ms - st.ab >= FOLGE_PAUSE) {
        if (st.n >= d.f.length) return true;
        st.n++; st.phase = "zeigen"; st.ab = ms;
      }
      return st.phase === "aus" || ms >= this.dauer;
    },
    erg: (st) => ({ fertig: st.fertig.slice(), fehler: st.fehler }),
    live: (st) => ({ r: st.fertig.length, f: st.fehler !== null ? 1 : 0, p: st.phase === "eingabe" ? st.pos : 0 }),
    ausErg: (e, d, ms) => ({ r: e && e.fertig ? e.fertig.filter((t) => t <= ms).length : 0, f: e && e.fehler !== null && e.fehler !== undefined && e.fehler <= ms ? 1 : 0, p: 0 }),
    // jede Runde braucht mindestens die Zeigezeit und je Farbe einen Tipp - schneller geht es nicht
    sauber(e, d) {
      const fertig = [];
      let frueh = 0;
      (Array.isArray(e && e.fertig) ? e.fertig : []).slice(0, d.f.length - FOLGE_START + 1).forEach((t0, k) => {
        const t = zahl(t0), n = FOLGE_START + k, min = frueh + this.zeigDauer(n) + n * FOLGE_MIN_TIPP;
        if (t === null || fertig.length !== k || t < min || t > this.dauer) return;
        fertig.push(Math.round(t)); frueh = t + FOLGE_PAUSE;
      });
      const f = zahl(e && e.fehler);
      return { fertig, fehler: f !== null && f >= frueh && f <= this.dauer ? Math.round(f) : null };
    },
    vergleich(x, y) {
      if (x.fertig.length !== y.fertig.length) return x.fertig.length - y.fertig.length;
      const fx = x.fehler, fy = y.fehler;
      if (fx === null && fy !== null) return 1;
      if (fy === null && fx !== null) return -1;
      if (fx !== null && fy !== null) return fx - fy;   // wer sich spaeter vertut, gewinnt
      return x.fertig.length ? y.fertig[y.fertig.length - 1] - x.fertig[x.fertig.length - 1] : 0;
    },
    text: (e) => `${e.fertig.length ? FOLGE_START + e.fertig.length - 1 : 0} Farben geschafft${e.fehler !== null ? "" : " ohne Fehler"}`,
    erklaer(x, y) { return x.fertig.length !== y.fertig.length ? "längere Folge geschafft" : "gleich lang – der andere hat sich zuerst vertan"; },
    bot(d, stufe, saat) {
      const max = [5, 7, 9][stufe] + (fest(saat, 3) < 0.5 ? 0 : 1), tipp = [640, 470, 360][stufe], fertig = [];
      let t = 0, fehler = null;
      for (let n = FOLGE_START; n <= d.f.length; n++) {
        t += this.zeigDauer(n);
        if (n > max) { fehler = Math.round(t + tipp * (1 + Math.floor(fest(saat, 40 + n) * Math.min(3, n - 1)))); break; }
        t += n * tipp + Math.round((fest(saat, 50 + n) - 0.5) * 200);
        if (t > this.dauer) break;
        fertig.push(Math.round(t)); t += FOLGE_PAUSE;
      }
      return { fertig, fehler, fertigZeit: fehler !== null ? fehler : t };
    },
    licht(st, d, ms) {
      if (st.phase === "zeigen") { const k = Math.floor((ms - st.ab) / (FOLGE_AN + FOLGE_AUS)), an = (ms - st.ab) % (FOLGE_AN + FOLGE_AUS) < FOLGE_AN; return an ? d.f[k] : null; }
      if (st.blitz && ms - st.blitz.ms < 220) return st.blitz.t;
      return null;
    },
    bild(st, d, ms, g) {
      const l = this.licht(st, d, ms), er = g.live || { r: 0, f: 0 };
      const text = st.phase === "zeigen" ? `👀 Merk dir ${st.n} Farben …` : st.phase === "eingabe" ? `👉 Jetzt du: ${st.pos}/${st.n}` : st.phase === "pause" ? "✅ Richtig! Gleich eine mehr …" : "❌ Vertan!";
      return `<div class="du-folge ${st.phase === "eingabe" ? "offen" : ""}">${VIER.map((t) => `<button type="button" class="du-farbe ${l === t ? "an" : ""}" style="--f:${FARBE[t][1]}" data-mt="${t}" aria-label="${FARBE[t][0]}"></button>`).join("")}</div>
        <small>${text}</small><div class="du-zeile gegner"><span>${esc(g.name)}</span><b>${er.f ? "❌ vertan" : `${er.r ? FOLGE_START + er.r - 1 : 0} Farben geschafft`}</b></div>`;
    },
    knoepfe: () => [], raster: "2",
    padKnoepfe: () => VIER.map((t) => [t, FARBE[t][0]]),
    zuschau(la, lb, d, ms, na, nb) {
      const z = (l, n) => `<div class="du-zeile"><span>${esc(n)}</span><b>${l && l.f ? "❌ vertan" : `${l && l.r ? FOLGE_START + l.r - 1 : 0} Farben`}</b>${l && !l.f && l.p ? `<small>tippt ${l.p} …</small>` : ""}</div>`;
      return `<div class="du-folge klein">${VIER.map((t) => `<span class="du-farbe" style="--f:${FARBE[t][1]}"></span>`).join("")}</div>${z(la, na)}${z(lb, nb)}`;
    },
  },
};
// ---------------------------------------------------------------- Stand eines Duells (laeuft beim Gastgeber)
const testVorgabe = () => (typeof globalThis !== "undefined" && globalThis.__brettTest) || null;
export function angebot(nr) {
  const t = testVorgabe();
  const pool = t && Array.isArray(t.duelle) && t.duelle.filter((id) => DEF[id]).length ? t.duelle.filter((id) => DEF[id]) : POOL;
  if (pool.length === 1) return [pool[0], pool[0]];
  const a = pool[nr % pool.length];
  let b = pool[(nr + 2) % pool.length];
  if (b === a) b = pool[(nr + 1) % pool.length];
  return [a, b];
}
// Bot-Staerke aus dem Bot-Namen (fest je Bot): Robo-Rudi mittel, Bot Berta stark, Cyber-Claus leicht, ...
export function stufeVon(name) {
  const i = BOTNAMEN.indexOf(String(name || ""));
  if (i >= 0) return [1, 2, 0][i % 3];
  return /^🤖/.test(String(name || "")) ? 1 : undefined;
}
export const istBotName = (name) => stufeVon(name) !== undefined;

// a = Herausforderer, b = Herausgeforderter (Spielernummern im Spiel), nr = laufende Duellnummer (Angebot reihum)
export function neu(a, b, nr, namen = []) {
  const stufe = {};
  [a, b].forEach((j) => { const s = stufeVon(namen[j]); if (s !== undefined) stufe[j] = s; });
  return { nr, a, b, angebot: angebot(nr), phase: "wahl", seit: jetzt(), spiel: null, runde: 0, start: 0, d: null, erg: {}, stufe,
    stechen: 0, verlauf: [], sieger: null, verlierer: null, grund: "", kanal: "" };
}
export const dk = (du) => `${du.nr}.${du.runde}.${du.spiel}`;
function spielStarten(du, id, vorlauf = VORLAUF) {
  du.spiel = id; du.runde++; du.d = DEF[id].daten(); du.start = jetzt() + vorlauf; du.erg = {}; du.phase = "spiel";
}
const dabei = (du, i) => i === du.a || i === du.b;
const gegnerVon = (du, i) => (i === du.a ? du.b : du.a);

// -> true, wenn sich etwas geaendert hat. ctx.muenzen = Muenzstand je Spieler (Aufholregel), sonst ohne
export function aktion(du, i, a, ctx = {}) {
  if (!du || !a || du.phase === "ende") return false;
  if (du.phase === "wahl" && a.typ === "dwahl") {
    const warten = !!a.warten && jetzt() - du.seit >= WAHL_WARTEN;
    if (!warten && i !== du.b) return false;
    const id = warten ? du.angebot[0] : a.spiel;
    if (!du.angebot.includes(id)) return false;
    du.gewaehlt = warten ? null : i;
    spielStarten(du, id);
    return true;
  }
  if (du.phase === "spiel" && a.typ === "derg" && dabei(du, i) && a.k === dk(du) && du.erg[i] === undefined) {
    du.erg[i] = DEF[du.spiel].sauber(a.e || {}, du.d);
    if (du.erg[du.a] !== undefined && du.erg[du.b] !== undefined) entscheiden(du, ctx);
    return true;
  }
  if (du.phase === "spiel" && a.typ === "dwarten" && jetzt() >= du.start + DEF[du.spiel].dauer + WARTEN_AB) {
    [du.a, du.b].forEach((j) => { if (du.erg[j] === undefined) du.erg[j] = null; });
    entscheiden(du, ctx);
    return true;
  }
  return false;
}
// Wer gewinnt? Nie Zufall: Spiel -> Stechen -> weniger Muenzen -> der Herausgeforderte
export function entscheiden(du, ctx = {}) {
  const def = DEF[du.spiel], ea = du.erg[du.a], eb = du.erg[du.b];
  const v = ea == null && eb == null ? 0 : ea == null ? -1 : eb == null ? 1 : Math.sign(def.vergleich(ea, eb, du.d));
  du.verlauf.push({ spiel: du.spiel, ea, eb, v, d: du.d });
  if (v) return abschluss(du, v > 0 ? du.a : du.b, ea == null || eb == null ? "fehlt" : du.stechen ? "stechen" : "spiel");
  if (!du.stechen) { du.stechen = 1; spielStarten(du, STECHEN_SPIEL); return; }
  const m = ctx.muenzen;
  if (Array.isArray(m) && Number.isFinite(m[du.a]) && Number.isFinite(m[du.b]) && m[du.a] !== m[du.b]) return abschluss(du, m[du.a] < m[du.b] ? du.a : du.b, "muenzen");
  return abschluss(du, du.b, "verteidiger");
}
function abschluss(du, sieger, grund) {
  du.sieger = sieger; du.verlierer = gegnerVon(du, sieger); du.grund = grund; du.phase = "ende"; du.ende = jetzt();
}
export function grundText(du, namen) {
  const v = du.verlauf[du.verlauf.length - 1], def = v && DEF[v.spiel];
  if (!v || du.phase !== "ende") return "";
  if (du.grund === "fehlt") return "der andere hat kein Ergebnis geschickt";
  if (du.grund === "muenzen") return "Gleichstand auch im Stechen – wer weniger Münzen hat, gewinnt (Aufholregel)";
  if (du.grund === "verteidiger") return `Gleichstand bei allem – ${namen[du.b] || "der Herausgeforderte"} behält recht`;
  const x = du.sieger === du.a ? v.ea : v.eb, y = du.sieger === du.a ? v.eb : v.ea;
  return `${du.grund === "stechen" ? "im Stechen: " : ""}${def.erklaer ? def.erklaer(x, y, v.d) : ""}`.replace(/: $/, "");
}

// Computer-Mitspieler: Spielwahl (Staerke entscheidet, kein Los) und der fertige Verlauf
export function bot(du, i) {
  if (!du || !dabei(du, i)) return null;
  const stufe = du.stufe && du.stufe[i] !== undefined ? du.stufe[i] : 1;
  if (du.phase === "wahl" && i === du.b) {
    const lieb = [["quiz", "folgen", "korb", "tauziehen", "mittag"], ["korb", "tauziehen", "quiz", "folgen", "mittag"], ["mittag", "tauziehen", "korb", "folgen", "quiz"]][stufe];
    const id = [...du.angebot].sort((x, y) => lieb.indexOf(x) - lieb.indexOf(y))[0];
    return { typ: "dwahl", spiel: id };
  }
  if (du.phase === "spiel" && du.erg[i] === undefined) return { typ: "derg", k: dk(du), e: botErg(du, i) };
  return null;
}
function botErg(du, i) {
  const stufe = du.stufe && du.stufe[i] !== undefined ? du.stufe[i] : 1;
  return DEF[du.spiel].bot(du.d, stufe, du.nr * 977 + du.runde * 131 + i * 17);
}

// ---------------------------------------------------------------- Live-Leitung
const LIVE = {};            // kanal -> { spieler: { k, v } }
const geschrieben = new Map();
export function liveEmpfangen(alle) {
  const neu = {};
  if (alle && typeof alle === "object") {
    Object.entries(alle).forEach(([kanal, je]) => {
      const m = {};
      if (je && typeof je === "object") Object.entries(je).forEach(([j, x]) => {
        if (!x || typeof x.k !== "string") return;
        try { m[j] = { k: x.k, v: typeof x.v === "string" ? JSON.parse(x.v) : x.v }; } catch (e) { /* kaputt: weglassen */ }
      });
      neu[kanal] = m;
    });
  }
  // eigene, noch nicht zurueckgekommene Werte behalten (sonst springt die eigene Anzeige kurz zurueck)
  Object.keys(LIVE).forEach((k) => delete LIVE[k]);
  Object.assign(LIVE, neu);
  geschrieben.forEach((x, key) => { const [kanal, j] = key.split("/"); if (performance.now() - x.t < 1500) (LIVE[kanal] = LIVE[kanal] || {})[j] = { k: x.k, v: x.v }; });
}
// andere Live-Kanaele auf derselben Leitung (Runde 3: Kamera des Spielers am Zug, stand/live/<pid>kam/<spieler>);
// die Taktung macht der Aufrufer (kamera_frei.js: hoechstens 8-mal pro Sekunde)
export function kanalSchreiben(kanal, j, k, v) { liveSchreiben(kanal, j, k, v, true); }
export function liveVon(kanal, j, k) { const x = LIVE[kanal] && LIVE[kanal][j]; return x && x.k === k ? x.v : null; }
function liveSchreiben(kanal, j, k, v, sofort = false) {
  if (!kanal) return;
  const key = `${kanal}/${j}`, txt = JSON.stringify(v), alt = geschrieben.get(key);
  if (alt && alt.txt === txt && alt.k === k) return;
  const t = performance.now();
  if (!sofort && alt && t - alt.t < LIVE_ABSTAND) return;
  geschrieben.set(key, { t, txt, k, v });
  (LIVE[kanal] = LIVE[kanal] || {})[j] = { k, v };
  if (LEITUNG.schreiben) { try { LEITUNG.schreiben(`${kanal}/${j}`, { k, v: txt }); } catch (e) { console.warn(e); } }
}
// Fortschritt eines Spielers fuer die Anzeige: abgegebener Verlauf (auch Bots) im Takt der Uhr, sonst die Live-Leitung
export function anzeigeLive(du, j, ms) {
  const def = DEF[du.spiel], e = du.erg && du.erg[j];
  if (e) return def.ausErg(e, du.d, ms);
  if (e === null) return null;
  if (du.stufe && du.stufe[j] !== undefined) return def.ausErg(botErg(du, j), du.d, ms);
  return liveVon(du.kanal, j, dk(du));
}

// ---------------------------------------------------------------- Anzeige
const versus = (du, namen, ich) => {
  const nm = (j) => `${esc(namen[j] || "")}${j === ich ? " (du)" : ""}${du.stufe && du.stufe[j] !== undefined ? ` <small>${STUFEN[du.stufe[j]]}</small>` : ""}`;
  return `<div class="du-versus"><span class="du-sp a"><span class="farbe f${du.a % 20}"></span>${nm(du.a)}</span><b>⚔️</b><span class="du-sp b">${nm(du.b)}<span class="farbe f${du.b % 20}"></span></span></div>`;
};
function titelkarte(def, stechen) {
  return `<div class="frage mini-titelkarte ankunft du-titel"><span class="mtk-emo" aria-hidden="true">${def.emo}</span><span class="mtk-text"><small class="mtk-vor">${stechen ? "⚖️ Stechen" : "Duell"}</small><b>${esc(def.titel)}</b><small class="mini-typ">${esc(def.typ)}</small></span></div>`;
}
function vorlaufHTML(def, ms, stechen) {
  if (ms < -COUNTDOWN) return `${titelkarte(def, stechen)}<div class="mn-regel">${esc(def.regel)}</div>`;
  return `<div class="du-count">${Math.ceil(-ms / 1000)}</div><div class="mn-regel klein">${esc(def.regel)}</div>`;
}
let zuschauNr = 0;
const ZUSCHAU = new Map();   // id -> { du, namen, gross }
// Zuschauer (Handy, Beamer): beide Spieler live nebeneinander
function zuschauInnen(du, namen, gross) {
  const def = DEF[du.spiel], ms = jetzt() - du.start;
  if (ms < 0) return vorlaufHTML(def, ms, du.stechen);
  const t = Math.min(ms, def.dauer + 2000);
  return `<div class="du-zuschau-feld ${gross ? "gross" : ""}">${def.zuschau(anzeigeLive(du, du.a, t), anzeigeLive(du, du.b, t), du.d, t, namen[du.a] || "", namen[du.b] || "")}</div>
    <p class="mitte leise klein">${[du.a, du.b].map((j) => (du.erg[j] !== undefined ? `✓ ${esc(namen[j] || "")} ist fertig` : "")).filter(Boolean).join(" · ")}</p>`;
}
function zuschauHTML(du, namen, gross = false) {
  const id = `z${++zuschauNr}`;
  ZUSCHAU.set(id, { du, namen, gross });
  if (ZUSCHAU.size > 40) ZUSCHAU.delete(ZUSCHAU.keys().next().value);
  starteTakt();
  return `<div class="du-zuschau" data-du-zuschau="${id}">${zuschauInnen(du, namen, gross)}</div>`;
}
const warteKnopf = (ab, a, text) => `<div class="du-spaeter" data-du-ab="${ab}" ${jetzt() >= ab ? "" : "hidden"}>${knopf(text, a, "zweit")}</div>`;

// ich = eigene Spielernummer (-1: nur zuschauen), namen = Namen im Spiel. opt.folgen = HTML unter dem Ergebnis (Muenzen,
// Trinken ...), opt.knopf = Knopf nach dem Ergebnis, opt.einsatz = Satz zum Einsatz in der Wahl
export function html(du, ich, namen, opt = {}) {
  if (!du) return "";
  const kopf = versus(du, namen, ich);
  if (du.phase === "wahl") {
    const wahlen = du.angebot.map((id) => { const d = DEF[id]; return [id, `${d.emo} ${esc(d.titel)}<small>${esc(d.typ)} – ${esc(d.kurz)}</small>`]; });
    const vorn = `<i hidden data-key="du-${du.nr}-wahl" data-ton="spannung"></i>${kopf}${opt.einsatz ? `<p class="mitte du-einsatz">${opt.einsatz}</p>` : ""}`;
    if (ich === du.b) return `${vorn}<div class="frage du-wahlfrage">Du wählst das Duellspiel:</div><div class="du-wahl">${wahlen.map(([id, t]) => knopf(t, { typ: "dwahl", spiel: id }, "gross duell-wahl")).join("")}</div>`;
    return `${vorn}<p class="mitte">${esc(namen[du.b] || "")} wählt das Duellspiel …</p><div class="du-wahl still">${wahlen.map(([, t]) => `<div class="du-angebot">${t}</div>`).join("")}</div>
      ${warteKnopf(du.seit + WAHL_WARTEN, { typ: "dwahl", warten: true }, "⏭️ Nicht mehr warten – erstes Spiel nehmen")}`;
  }
  const def = DEF[du.spiel];
  if (du.phase === "spiel") {
    const stech = du.stechen ? `<div class="du-stechen">⚖️ Gleichstand – Stechen mit „${esc(def.titel)}“!</div>` : "";
    const warten = warteKnopf(du.start + def.dauer + WARTEN_AB, { typ: "dwarten" }, "⏭️ Nicht mehr warten");
    const tonKey = `<i hidden data-key="du-${dk(du)}-start" data-ton="${du.stechen ? "spannung" : "los"}"></i>`;
    if (dabei(du, ich)) return `${tonKey}${kopf}${stech}${feldHTML(du, `h${ich}`, ich, namen)}${warten}`;
    return `${tonKey}${kopf}${stech}${zuschauHTML(du, namen)}${warten}`;
  }
  return ergebnisHTML(du, namen, ich) + (opt.folgen || "") + (opt.knopf || "");
}
function ergebnisHTML(du, namen, ich) {
  const zeilen = du.verlauf.map((v) => {
    const def = DEF[v.spiel];
    const t = (e) => (e == null ? "kein Ergebnis" : def.text(e, v.d));
    const [ta, tb] = def.punkteText && v.ea && v.eb ? def.punkteText(v.ea, v.eb, v.d) : [t(v.ea), t(v.eb)];
    return `<div class="du-erg"><span class="du-erg-spiel">${def.emo} ${esc(def.titel)}</span>
      <span class="${v.v > 0 ? "sieg" : ""}">${esc(namen[du.a] || "")}: <b>${esc(ta)}</b></span><span class="${v.v < 0 ? "sieg" : ""}">${esc(namen[du.b] || "")}: <b>${esc(tb)}</b></span>${v.v ? "" : `<small>Gleichstand</small>`}</div>`;
  }).join("");
  const ichSieg = ich === du.sieger, ichVerl = ich === du.verlierer;
  return `<i hidden data-key="du-${du.nr}-ende" data-ton="${ichVerl ? "falsch" : "sieg"}"></i>${versus(du, namen, ich)}
    <div class="urteil">🏆 ${esc(namen[du.sieger] || "")} gewinnt das Duell!</div>
    ${ichSieg ? `<p class="mitte du-du">🎉 Stark gespielt!</p>` : ichVerl ? `<p class="mitte du-du">😬 Knapp daneben …</p>` : ""}
    <div class="du-ergebnisse">${zeilen}</div><p class="mitte leise klein">${esc(grundText(du, namen))}</p>`;
}

// ---------------------------------------------------------------- Spielfeld am Geraet (Handy oder Controller)
const lok = new Map();   // Schluessel ("h<ich>" oder Controller-Kennung) -> Eintrag
function eintrag(du, schl, j) {
  const k = dk(du);
  let e = lok.get(schl);
  if (!e || e.k !== k || e.kanal !== du.kanal) {
    e = { k, kanal: du.kanal, j, def: DEF[du.spiel], st: DEF[du.spiel].neu(du.d), gesendet: false, senden: null, schild: null, ton: null, zuletzt: {} };
    lok.set(schl, e);
    for (const [k2, x] of lok) if (x !== e && x.gesendet && x.k !== k) lok.delete(k2);
  }
  e.du = du;
  if (du.erg && du.erg[j] !== undefined && !e.gesendet) { e.gesendet = true; e.wert = du.erg[j]; }
  return e;
}
const msVon = (e) => jetzt() - e.du.start;
// Pause der Spielleitung (Runde B): die Duell-Uhr steht. Der Gastgeber schiebt den Start selbst; bis der neue Stand da ist,
// rueckt hier die eigene Kopie nach, sonst waere das Duell im selben Augenblick abgelaufen.
let pauseSeit = 0;
export function pausieren(an) {
  if (an && !pauseSeit) pauseSeit = Date.now();
  if (!an && pauseSeit) { const um = Date.now() - pauseSeit; pauseSeit = 0; lok.forEach((e) => { if (e.du && e.du.start) e.du = { ...e.du, start: e.du.start + um }; }); }
}
function gegnerInfo(e, namen, ms) {
  const g = gegnerVon(e.du, e.j);
  return { name: (namen || e.namen || [])[g] || "Gegner", live: ms >= 0 ? anzeigeLive(e.du, g, ms) : null };
}
const PAD_PFEIL = { hoch: "↑", runter: "↓", links: "←", rechts: "→" };
function knoepfeHTML(e, ms) {
  if (e.gesendet || ms < 0) return "";
  const d = e.def;
  const liste = e.schild && d.padKnoepfe ? d.padKnoepfe(e.st, e.du.d, ms) : d.knoepfe(e.st, e.du.d, ms);
  if (!liste.length) return "";
  if (e.schild) return `<div class="mn-chips">${liste.map(([t, text]) => `<span class="mn-chip">${PAD_PFEIL[t] ? `<kbd class="taste">✚${PAD_PFEIL[t]}</kbd>` : e.schild(t)} ${text}</span>`).join("")}</div>`;
  return `<div class="mn-knoepfe mn-r${d.raster || "2"}">${liste.map(([t, text, kl]) => `<button type="button" class="mn-k mn-t-${t} ${kl || ""}" data-mt="${t}">${text}</button>`).join("")}</div>`;
}
function bildHTML(e, ms) {
  if (e.gesendet) {
    const text = e.wert ? (e.def.text(e.wert, e.du.d) || "abgegeben") : "abgegeben";
    return `<div class="mn-fertig">✓ Fertig<small>${esc(text)}</small></div><small>Warte auf ${esc(gegnerInfo(e, null, ms).name)} …</small>`;
  }
  if (ms < 0) return vorlaufHTML(e.def, ms, e.du.stechen);
  return e.def.bild(e.st, e.du.d, ms, gegnerInfo(e, null, ms));
}
const uhrText = (e, ms) => (e.gesendet || ms < 0 ? "" : `⏱️ ${Math.max(0, Math.ceil((e.def.dauer - ms) / 1000))} s`);
function feldHTML(du, schl, j, namen, schild = null) {
  const e = eintrag(du, schl, j);
  e.namen = namen; e.schild = schild;
  starteTakt();
  const ms = msVon(e);
  const h = { uhr: uhrText(e, ms), bild: bildHTML(e, ms), unten: knoepfeHTML(e, ms) };
  e.zuletzt = h;
  return `<div class="mn du-feld ${schild ? "mn-pad" : ""}" data-du="${esc(schl)}"><div class="mn-uhr">${h.uhr}</div>
    <div class="mn-bild">${h.bild}</div><div class="mn-unten">${h.unten}</div></div>`;
}
// nach dem Einsetzen (Handy): Knoepfe anbinden; senden(a) schickt an den Gastgeber
export function nach(du, ich, senden) {
  if (!du || du.phase !== "spiel" || !dabei(du, ich)) return;
  const schl = `h${ich}`, e = eintrag(du, schl, ich);
  e.senden = senden;
  const box = finde(schl);
  if (box) box.onpointerdown = (ev) => { const k = ev.target.closest("[data-mt]"); if (k && box.contains(k)) { ev.preventDefault(); taste(schl, k.dataset.mt); } };
  starteTakt();
}
// Controller: eigenes Feld je Controller (app.js haengt es unter das Spiel); senden(a) im Namen des Controllers
const padWahl = new Map();
export function padHTML(du, padId, j, namen, schild, senden) {
  if (!du || !dabei(du, j)) return "";
  if (du.phase !== "spiel") lok.delete(padId);   // Tasten gehoeren danach wieder der Fokus-Steuerung (Weiter ...)
  if (du.phase === "wahl") {
    if (j !== du.b) return "";
    padWahl.set(padId, { du, senden });
    return `<div class="mn mn-pad du-padwahl"><div class="mn-regel klein">Du wählst das Duellspiel:</div><div class="mn-chips">
      <span class="mn-chip"><kbd class="taste">✚←</kbd> ${DEF[du.angebot[0]].emo} ${esc(DEF[du.angebot[0]].titel)}</span>
      <span class="mn-chip"><kbd class="taste">✚→</kbd> ${DEF[du.angebot[1]].emo} ${esc(DEF[du.angebot[1]].titel)}</span></div></div>`;
  }
  padWahl.delete(padId);
  if (du.phase !== "spiel") return "";
  const h = feldHTML(du, padId, j, namen, schild);
  lok.get(padId).senden = senden;
  return h;
}
// Taste von Handy-Knopf oder Controller -> true, wenn verbraucht
export function taste(schl, t) {
  const w = padWahl.get(schl);
  if (w && w.du.phase === "wahl") {
    const k = links(t) ? 0 : rechts(t) ? 1 : -1;
    if (k >= 0) { padWahl.delete(schl); w.senden({ typ: "dwahl", spiel: w.du.angebot[k] }); }
    return true;
  }
  const e = lok.get(schl);
  // nur solange das Spielfeld wirklich zu sehen ist - danach gehoeren die Tasten wieder der Fokus-Steuerung (Weiter ...)
  if (!e || e.du.phase !== "spiel" || !finde(schl)) return false;
  if (e.gesendet) return true;
  const ms = msVon(e);
  if (ms < 0) return true;
  let fertig = false;
  try { fertig = !!e.def.taste(e.st, t, e.du.d, ms); } catch (err) { console.error(err); }
  if (fertig) abgeben(schl, e, ms); else zeichne(schl, e);
  return true;
}
function abgeben(schl, e, ms) {
  if (e.gesendet) return;
  e.gesendet = true;
  try { e.wert = e.def.erg(e.st, e.du.d, ms); } catch (err) { console.error(err); e.wert = {}; }
  try { liveSchreiben(e.kanal, e.j, e.k, e.def.live(e.st, e.du.d, ms), true); } catch (err) { console.error(err); }
  zeichne(schl, e);
  if (e.senden) e.senden({ typ: "derg", k: e.k, e: e.wert });
}
function finde(schl) { try { return document.querySelector(`[data-du="${CSS.escape(schl)}"]`); } catch (x) { return null; } }
function zeichne(schl, e) {
  const box = finde(schl);
  if (!box) return;
  const ms = msVon(e);
  const teile = [[".mn-uhr", uhrText(e, ms)], [".mn-bild", bildHTML(e, ms)], [".mn-unten", knoepfeHTML(e, ms)]];
  teile.forEach(([sel, h]) => { const el = box.querySelector(sel); if (el && el.__h !== h) { el.innerHTML = h; el.__h = h; } });
}
// Countdown-Klaenge: je Sekunde ein Tick, bei 0 "los"
function vorlaufTon(e, ms) {
  const s = ms < 0 && ms >= -COUNTDOWN ? Math.ceil(-ms / 1000) : ms >= 0 ? 0 : null;
  if (s === null || s === e.ton) return;
  if (e.ton === null && s === 0 && ms > 600) { e.ton = 0; return; }   // spaeter dazugekommen: kein "los" mehr
  e.ton = s;
  TON.spiele(s > 0 ? "tick" : "los");
}
let taktAn = false;
function starteTakt() {
  if (taktAn || typeof window === "undefined") return;
  taktAn = true;
  setInterval(() => {
    if (pauseSeit) return;
    for (const [schl, e] of lok) {
      if (e.du.phase !== "spiel" || !finde(schl) && !e.senden) continue;
      const ms = msVon(e);
      if (!e.gesendet) {
        vorlaufTon(e, ms);
        if (ms >= 0) {
          let fertig = false;
          try { fertig = !!e.def.tick(e.st, e.du.d, ms); } catch (err) { console.error(err); }
          if (fertig || ms >= e.def.dauer + 3000) { abgeben(schl, e, ms); continue; }
          try { liveSchreiben(e.kanal, e.j, e.k, e.def.live(e.st, e.du.d, ms)); } catch (err) { console.error(err); }
        }
      }
      zeichne(schl, e);
    }
    // Zuschauer und Beamer
    document.querySelectorAll("[data-du-zuschau]").forEach((el) => {
      const z = ZUSCHAU.get(el.dataset.duZuschau);
      if (!z || z.du.phase !== "spiel") return;
      const h = zuschauInnen(z.du, z.namen, z.gross);
      if (el.__h !== h) { el.innerHTML = h; el.__h = h; }
    });
    document.querySelectorAll("[data-du-ab][hidden]").forEach((el) => { if (jetzt() >= Number(el.dataset.duAb)) el.hidden = false; });
  }, 50);
}

// ---------------------------------------------------------------- Gluecksrad-Duell (Plan 3.2): eigenes kleines Spiel
// Landet das Rad auf "Duell", waehlt der Getroffene einen Gegner (gluecksrad.js, app.js legt dieses Spiel fuer genau die
// zwei an). Der Gegner waehlt das Duellspiel, beide spielen; der Verlierer trinkt 2 Schlucke (ohne Trinken: 10 Kniebeugen,
// wie auf dem Feld angesagt). Der Sieg zaehlt in der Gesamtwertung (wertung.js, "Glücksrad-Duell").
const duAktion = aktion, duHtml = html, duNach = nach, duBot = bot;
export const gduell = {
  id: "gduell", name: "Glücksrad-Duell", emoji: "⚔️", farben: ["#ff4b4b", "#7b2cbf"], kurz: "Vom Glücksrad: zwei spielen ein echtes Duell", versteckt: true,
  start(namen, raum) { const nr = Number(raum && raum.glueck && raum.glueck.nr) || 0; return { duell: neu(0, 1, nr, namen), weg: false }; },
  aktion(s, i, a) {
    if (!s.duell) return;
    if (a.typ === "fertig" && s.duell.phase === "ende") { s.weg = true; return; }
    duAktion(s.duell, i, a, {});
  },
  ergebnis(s) { const du = s.duell; return du && du.phase === "ende" ? { nr: `g${du.nr}`, sieger: [du.sieger] } : null; },
  render(s, ich, namen) {
    const du = s.duell;
    if (!du) return "";
    const strafe = s.ohne ? "macht 10 Kniebeugen" : "trinkt 2 Schlucke";
    if (du.phase !== "ende") return duHtml(du, ich, namen, { einsatz: `Wer verliert, ${strafe}.` });
    return duHtml(du, ich, namen, { folgen: `<div class="du-folgen"><span>${s.ohne ? "🏋️" : "🍺"} ${esc(namen[du.verlierer] || "")} ${strafe}</span></div>`,
      knopf: ich === du.a || ich === du.b ? knopf("✅ Fertig – zurück zur Übersicht", { typ: "fertig" }, "gross") : "" });
  },
  nach(s, ich, senden) { duNach(s.duell, ich, senden); },
  bot(s, i) { return duBot(s.duell, i); },
  botPause: () => 1500,
  musik: () => null,
};

// ---------------------------------------------------------------- Beamer
// Auszug: das Duell ist offen fuer alle (keine Geheimnisse), dazu der Kanal fuer die Live-Leitung
export const auszug = (du, kanal) => (du ? { ...JSON.parse(JSON.stringify(du)), kanal: du.kanal || kanal || "" } : null);
export const fertigAmBeamer = (d) => !d || d.phase === "ende";
export function beamerHTML(d, namen, titel = "") {
  if (!d) return "";
  const kopf = `<div class="bdu-kopf">${titel ? `<span class="bm-leise">${esc(titel)}</span>` : ""}${versus(d, namen, -1)}</div>`;
  if (d.phase === "wahl") {
    return `<div class="bdu">${kopf}<p class="bm-gross mitte">⚔️ ${esc(namen[d.a] || "")} fordert ${esc(namen[d.b] || "")} heraus!</p>
      <p class="bm-zeile mitte">${esc(namen[d.b] || "")} wählt das Duellspiel …</p>
      <div class="bdu-wahl">${d.angebot.map((id) => `<div><span>${DEF[id].emo}</span><b>${esc(DEF[id].titel)}</b><small>${esc(DEF[id].kurz)}</small></div>`).join("")}</div></div>`;
  }
  if (d.phase === "spiel") {
    const def = DEF[d.spiel];
    return `<div class="bdu">${kopf}${d.stechen ? `<div class="du-stechen">⚖️ Gleichstand – Stechen!</div>` : `<p class="bm-zeile mitte">${def.emo} ${esc(def.titel)}</p>`}${zuschauHTML(d, namen, true)}</div>`;
  }
  return `<div class="bdu">${ergebnisHTML(d, namen, -1)}</div>`;
}
