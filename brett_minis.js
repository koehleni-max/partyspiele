// Neue Minispiele des Partybretts (Nico 31.10.2026, Punkt 8a: "viel mehr Minispiele, viele Arten, am Handy spielbar,
// mit Controller bedienbar"). Jedes Minispiel ist eine kleine Zustandsmaschine mit abstrakten Tasten
//   a b x y hoch runter links rechts   (Controller: gleiche Tasten; Handy: Knoepfe mit data-mt, die genau diese Tasten senden)
// So laeuft dieselbe Logik am Handy und am Controller. Jedes Handy/jeder Controller misst selbst (wie bisher) und schickt am
// Ende EINEN Wert; brett.js wertet. Jedes Spiel endet spaetestens nach "dauer" von selbst - keiner kann die Runde blockieren.
// Gemeinsame Aufgaben (gleiche Zahlenkette, gleicher Knall-Zeitpunkt ...) wuerfelt der Gastgeber einmal aus (daten -> m.d).
//
// Def: { id, titel, emo, typ, regel, gut: "hoch" | "tief", dauer, einheit(w), daten?(), neu(m), taste(st, t, m, ms),
//        tick?(st, m, ms), bild(st, m, ms), knoepfe?(st, m, ms, ctrl) -> [[taste, text, klasse]], raster, ende(st, m), bot(m),
//        punkte?(werte, j, teil) }   taste/tick -> undefined oder { wert } (= fertig)
import { esc } from "./hilfe.js";
import { DEFS2 } from "./brett_minis2.js";   // zweiter Satz (Teil 4b): Arenen, Rennen, Zielen, Wischen, Neigen, Team, Duelle

const VORLAUF = 3000;   // "3 - 2 - 1" mit der Regel, bevor gemessen wird
const r = (n) => Math.floor(Math.random() * n);
const mischen = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const komma = (x, n = 1) => x.toFixed(n).replace(".", ",");
const FARBE = { a: ["Grün", "#16a34a"], b: ["Rot", "#e11d48"], x: ["Blau", "#2563eb"], y: ["Gelb", "#ca8a04"] };
const PFEIL = { hoch: "⬆️", rechts: "➡️", runter: "⬇️", links: "⬅️" };
const RICHTUNGEN = ["hoch", "rechts", "runter", "links"];
const VIER = ["a", "b", "x", "y"];
const kreuzKnoepfe = () => [["hoch", "⬆️"], ["links", "⬅️"], ["rechts", "➡️"], ["runter", "⬇️"]];
// vier Antworten (Zahlen) rund um die richtige, alle verschieden und nicht negativ
function antworten(richtig, streu = 4) {
  const s = new Set([richtig]);
  while (s.size < 4) { const d = 1 + r(streu); const v = richtig + (r(2) ? d : -d); if (v >= 0) s.add(v); }
  return mischen([...s]);
}
const wuerfelBild = (z) => ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][z - 1];

const DEFS = [
  {
    id: "sekunde", titel: "Sekundengefühl", emo: "⏱️", typ: "Timing", gut: "tief", dauer: 16000,
    regel: "Die Uhr läuft los und wird nach 2 Sekunden unsichtbar. Drück STOPP genau bei 10,00 Sekunden!",
    einheit: (w) => `${komma(w / 1000, 2)} s daneben`,
    neu: () => ({}),
    taste: (st, t, m, ms) => (t === "a" ? { wert: Math.abs(Math.round(ms) - 10000) } : undefined),
    bild: (st, m, ms) => `<div class="mn-gross">${ms < 2000 ? komma(ms / 1000, 2) : "?,??"}</div><small>Ziel: 10,00 Sekunden</small>`,
    knoepfe: () => [["a", "⏹️ STOPP"]], raster: "1",
    ende: () => 9999, bot: () => 80 + r(1500),
  },
  {
    id: "ballon", titel: "Ballon-Mut", emo: "🎈", typ: "Risiko", gut: "hoch", dauer: 15000,
    regel: "Jeder Pumpstoß ist ein Punkt. Platzt der Ballon, hast du 0. Rechtzeitig „Behalten“ drücken!",
    einheit: (w) => (w ? `${w} ${w === 1 ? "Pumpstoß" : "Pumpstöße"}` : "💥 geplatzt"),
    neu: () => ({ pumpen: 0, grenze: 4 + r(13), knall: false }),
    taste(st, t) {
      if (t === "a") { st.pumpen++; if (st.pumpen >= st.grenze) { st.knall = true; return { wert: 0 }; } }
      if (t === "b") return { wert: st.pumpen };
    },
    bild: (st) => `<div class="mn-ballon" style="font-size:${Math.min(130, 44 + st.pumpen * 6)}px">${st.knall ? "💥" : "🎈"}</div><small>${st.pumpen} Pumpstöße</small>`,
    knoepfe: () => [["a", "💨 Pumpen"], ["b", "✋ Behalten", "gruen"]], raster: "2",
    ende: (st) => (st.knall ? 0 : st.pumpen),
    bot: () => { const g = 4 + r(13), z = 3 + r(12); return z >= g ? 0 : z; },
  },
  {
    id: "pfeile", titel: "Pfeil-Folge", emo: "🏹", typ: "Geschick", gut: "tief", dauer: 20000,
    regel: "Drück die zehn Pfeile in der gezeigten Reihenfolge – so schnell du kannst. Falsch kostet 1 Sekunde.",
    einheit: (w) => (w >= 30000 ? `nicht geschafft (${10 - Math.floor((w - 30000) / 1000)}/10)` : `${komma(w / 1000)} s`),
    daten: () => ({ folge: Array.from({ length: 10 }, () => RICHTUNGEN[r(4)]) }),
    neu: () => ({ pos: 0, strafe: 0, falsch: 0 }),
    taste(st, t, m, ms) {
      if (!PFEIL[t]) return;
      if (t === m.d.folge[st.pos]) { st.pos++; if (st.pos >= m.d.folge.length) return { wert: Math.round(ms) + st.strafe }; }
      else { st.strafe += 1000; st.falsch++; }
    },
    bild: (st, m) => `<div class="mn-folge">${m.d.folge.map((p, k) => `<span class="${k < st.pos ? "ok" : k === st.pos ? "an" : ""}">${PFEIL[p]}</span>`).join("")}</div><small>${st.pos}/${m.d.folge.length}${st.falsch ? ` · ${st.falsch}× daneben` : ""}</small>`,
    knoepfe: kreuzKnoepfe, raster: "kreuz",
    ende: (st, m) => 30000 + (m.d.folge.length - st.pos) * 1000 + Math.min(999, st.falsch), bot: () => 4000 + r(6000),
  },
  {
    id: "farbfolge", titel: "Farbfolge merken", emo: "🌈", typ: "Gedächtnis", gut: "hoch", dauer: 22000,
    regel: "Merk dir die sechs Farben (5 Sekunden) und tipp sie danach in derselben Reihenfolge. Ein Fehler beendet die Runde.",
    einheit: (w) => `${Math.floor(w / 100)} von 6`,
    daten: () => ({ folge: Array.from({ length: 6 }, () => VIER[r(4)]) }),
    neu: () => ({ pos: 0 }),
    taste(st, t, m, ms) {
      if (ms < 5000 || !FARBE[t]) return;
      if (t !== m.d.folge[st.pos]) return { wert: st.pos * 100 };
      st.pos++;
      if (st.pos >= m.d.folge.length) return { wert: st.pos * 100 + Math.max(0, 99 - Math.floor((ms - 5000) / 150)) };
    },
    bild: (st, m, ms) => (ms < 5000
      ? `<div class="mn-punkte">${m.d.folge.map((f) => `<i style="background:${FARBE[f][1]}"></i>`).join("")}</div><small>Merken! Noch ${Math.ceil((5000 - ms) / 1000)} s</small>`
      : `<div class="mn-punkte">${m.d.folge.map((f, k) => (k < st.pos ? `<i style="background:${FARBE[f][1]}"></i>` : `<i class="leer">?</i>`)).join("")}</div><small>Jetzt nachtippen: ${st.pos}/6</small>`),
    knoepfe: (st, m, ms) => (ms < 5000 ? [] : VIER.map((t) => [t, FARBE[t][0], `farbe-${t}`])), raster: "22",
    ende: (st) => st.pos * 100, bot: () => { const k = 2 + r(5); return k * 100 + (k === 6 ? r(60) : 0); },
  },
  {
    id: "hochtief", titel: "Höher oder tiefer", emo: "🃏", typ: "Glück", gut: "hoch", dauer: 20000,
    regel: "Ist die nächste Karte höher oder tiefer? Jeder Treffer zählt, ein Fehler beendet die Serie. Gleich zählt als Treffer.",
    einheit: (w) => `${w} Treffer`,
    neu: () => ({ karte: 1 + r(13), serie: 0, zuletzt: null }),
    taste(st, t) {
      if (t !== "hoch" && t !== "runter") return;
      const neu = 1 + r(13), ok = t === "hoch" ? neu >= st.karte : neu <= st.karte;
      st.zuletzt = ok; st.karte = neu;
      if (!ok) return { wert: st.serie };
      st.serie++;
      if (st.serie >= 10) return { wert: st.serie };
    },
    bild: (st) => `<div class="mn-karte">${["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K"][st.karte - 1]}</div><small>${st.serie} Treffer${st.zuletzt ? " · ✔️" : ""}</small>`,
    knoepfe: () => [["hoch", "⬆️ Höher"], ["runter", "⬇️ Tiefer"]], raster: "2",
    ende: (st) => st.serie, bot: () => { let k = 0; while (k < 10 && Math.random() < 0.6) k++; return k; },
  },
  {
    id: "truhe", titel: "Schatztruhen", emo: "💰", typ: "Glück", gut: "hoch", dauer: 15000,
    regel: "Drei Runden, je drei Truhen: eine mit 10 Gold, eine mit 3, eine leer. Wähl klug – oder glücklich.",
    einheit: (w) => `${w} Gold`,
    neu: () => ({ runde: 0, summe: 0, auf: null }),
    taste(st, t) {
      const k = { a: 0, b: 1, x: 2 }[t];
      if (k === undefined) return;
      const inhalt = mischen([10, 3, 0]);
      st.auf = { inhalt, k }; st.summe += inhalt[k]; st.runde++;
      if (st.runde >= 3) return { wert: st.summe };
    },
    bild: (st) => `<div class="mn-truhen">${[0, 1, 2].map((k) => `<span class="${st.auf && st.auf.k === k ? "an" : ""}">🧰<small>${st.auf ? st.auf.inhalt[k] : "?"}</small></span>`).join("")}</div><small>Runde ${Math.min(3, st.runde + 1)}/3 · ${st.summe} Gold</small>`,
    knoepfe: () => [["a", "Truhe 1"], ["b", "Truhe 2"], ["x", "Truhe 3"]], raster: "3",
    ende: (st) => st.summe, bot: () => [0, 1, 2].reduce((s) => s + [10, 3, 0][r(3)], 0),
  },
  {
    id: "mathe", titel: "Mathe-Blitz", emo: "➗", typ: "Kopf", gut: "hoch", dauer: 15000,
    regel: "Löse so viele Aufgaben wie möglich in 15 Sekunden. Falsch zieht einen Punkt ab.",
    einheit: (w) => `${w} Punkte`,
    neu: () => ({ punkte: 0, f: matheAufgabe() }),
    taste(st, t) {
      const k = VIER.indexOf(t); if (k < 0) return;
      if (st.f.opts[k] === st.f.richtig) st.punkte++; else st.punkte = Math.max(0, st.punkte - 1);
      st.f = matheAufgabe();
    },
    bild: (st) => `<div class="mn-gross">${st.f.text} = ?</div><small>${st.punkte} Punkte</small>`,
    knoepfe: (st) => VIER.map((t, k) => [t, String(st.f.opts[k])]), raster: "22",
    ende: (st) => st.punkte, bot: () => 3 + r(7),
  },
  {
    id: "zaehlen", titel: "Zähl genau", emo: "🔢", typ: "Gedächtnis", gut: "hoch", dauer: 16000,
    regel: "Ein Gewimmel erscheint 4 Sekunden lang. Wie oft war das gesuchte Zeichen dabei? Schnell und richtig gewinnt.",
    einheit: (w) => (w ? `richtig in ${komma((20000 - w) / 1000)} s` : "falsch"),
    daten() {
      const pool = mischen(["⭐", "🍀", "🐸", "🍕", "🎈", "🍩", "🐝", "🍓", "🦊", "🌵"]);
      const ziel = pool[0], anzahl = 5 + r(7);
      const feld = mischen([...Array(anzahl).fill(ziel), ...Array.from({ length: 30 - anzahl }, () => pool[1 + r(4)])]);
      return { ziel, anzahl, feld, opts: antworten(anzahl, 3) };
    },
    neu: () => ({}),
    taste(st, t, m, ms) { const k = VIER.indexOf(t); if (ms < 4000 || k < 0) return; return { wert: m.d.opts[k] === m.d.anzahl ? Math.max(1, 20000 - Math.round(ms - 4000)) : 0 }; },
    bild: (st, m, ms) => (ms < 4000 ? `<small>Zähl: <b class="mn-ziel">${m.d.ziel}</b></small><div class="mn-gewimmel">${m.d.feld.map((x) => `<span>${x}</span>`).join("")}</div>`
      : `<div class="mn-gross">Wie viele ${m.d.ziel}?</div>`),
    knoepfe: (st, m, ms) => (ms < 4000 ? [] : VIER.map((t, k) => [t, String(m.d.opts[k])])), raster: "22",
    ende: () => 0, bot: () => (Math.random() < 0.75 ? 20000 - (1500 + r(6000)) : 0),
  },
  {
    id: "anders", titel: "Finde den Anderen", emo: "🔍", typ: "Wahrnehmung", gut: "hoch", dauer: 15000,
    regel: "Vier Zeichen – eins ist anders. Tipp es so schnell du kannst! Falsch kostet einen Punkt.",
    einheit: (w) => `${w} Punkte`,
    neu: () => ({ punkte: 0, f: andersFrage() }),
    taste(st, t) {
      const k = VIER.indexOf(t); if (k < 0) return;
      if (k === st.f.k) st.punkte++; else st.punkte = Math.max(0, st.punkte - 1);
      st.f = andersFrage();
    },
    bild: (st) => `<small>${st.punkte} Punkte</small>`,
    knoepfe: (st) => VIER.map((t, k) => [t, `<span class="mn-emo">${k === st.f.k ? st.f.anders : st.f.gleich}</span>`]), raster: "22",
    ende: (st) => st.punkte, bot: () => 4 + r(8),
  },
  {
    id: "pendel", titel: "Zielzone", emo: "🎯", typ: "Timing", gut: "hoch", dauer: 20000,
    regel: "Der Zeiger saust hin und her – und wird immer schneller. Drück, wenn er in der Mitte ist. Drei Versuche, je bis zu 100 Punkte.",
    einheit: (w) => `${w} Punkte`,
    neu: () => ({ versuch: 0, summe: 0, t0: 0, letzte: null }),
    taste(st, t, m, ms) {
      if (t !== "a") return;
      const p = pendelPos(st, ms);
      const pts = Math.max(0, Math.round(100 - Math.abs(p - 50) * 2.5));
      st.summe += pts; st.letzte = pts; st.versuch++; st.t0 = ms;
      if (st.versuch >= 3) return { wert: st.summe };
    },
    bild: (st, m, ms) => `<div class="mn-balken"><i class="mn-zone"></i><b class="mn-zeiger" style="left:${pendelPos(st, ms).toFixed(1)}%"></b></div>
      <small>Versuch ${Math.min(3, st.versuch + 1)}/3 · ${st.summe} Punkte${st.letzte !== null ? ` (zuletzt ${st.letzte})` : ""}</small>`,
    knoepfe: () => [["a", "🎯 Jetzt!"]], raster: "1",
    ende: (st) => st.summe, bot: () => 100 + r(190),
  },
  {
    id: "turm", titel: "Turmbau", emo: "🏗️", typ: "Geschick", gut: "hoch", dauer: 25000,
    regel: "Der Block schwebt hin und her. Lass ihn fallen, wenn er über dem Turm ist – was übersteht, fällt ab. Wie hoch kommst du?",
    einheit: (w) => `${w} Stockwerke`,
    neu: () => ({ boden: [{ l: 20, b: 60 }], b: 60, t0: 0, stock: 0, aus: false }),
    taste(st, t, m, ms) {
      if (t !== "a" || st.aus) return;
      const x = turmPos(st, ms), oben = st.boden[st.boden.length - 1];
      const l = Math.max(x, oben.l), re = Math.min(x + st.b, oben.l + oben.b), w = re - l;
      if (w <= 2) { st.aus = true; return { wert: st.stock }; }
      st.boden.push({ l, b: w }); st.b = w; st.stock++; st.t0 = ms;
    },
    bild(st, m, ms) {
      const zeig = st.boden.slice(-6), unten = st.boden.length - zeig.length;
      const b = zeig.map((x, k) => `<i style="left:${x.l}%;width:${x.b}%;bottom:${k * 20}px;background:hsl(${(unten + k) * 37},70%,55%)"></i>`).join("");
      return `<div class="mn-turm">${b}<i class="schwebt" style="left:${turmPos(st, ms).toFixed(1)}%;width:${st.b}%;bottom:${zeig.length * 20 + 14}px"></i></div><small>${st.stock} Stockwerke</small>`;
    },
    knoepfe: () => [["a", "⬇️ Fallen lassen"]], raster: "1",
    ende: (st) => st.stock, bot: () => 3 + r(9),
  },
  {
    id: "wechsel", titel: "Links-Rechts-Sprint", emo: "🏃", typ: "Geschick", gut: "hoch", dauer: 7000,
    regel: "Tipp abwechselnd LINKS und RECHTS – nur Wechsel zählen. 7 Sekunden Vollgas!",
    einheit: (w) => `${w} Schritte`,
    neu: () => ({ zahl: 0, letzte: null }),
    taste(st, t) {
      const s = t === "links" ? "x" : t === "rechts" ? "b" : t;
      if ((s === "x" || s === "b") && s !== st.letzte) { st.zahl++; st.letzte = s; }
    },
    bild: (st) => `<div class="mn-bahn"><span style="left:${Math.min(88, st.zahl * 1.7)}%">🏃</span><i>🏁</i></div><small>${st.zahl} Schritte</small>`,
    knoepfe: () => [["x", "⬅️ Links"], ["b", "Rechts ➡️"]], raster: "2",
    ende: (st) => st.zahl, bot: () => 20 + r(26),
  },
  {
    id: "bombe", titel: "Zündschnur", emo: "💣", typ: "Risiko", gut: "hoch", dauer: 15000,
    regel: "Die Zündschnur brennt. Wer am längsten wartet, gewinnt – explodiert sie vorher, hast du 0. Wann sie hochgeht, weiß keiner (4 bis 14 Sekunden).",
    einheit: (w) => (w ? `${komma(w / 1000)} s ausgehalten` : "💥 explodiert"),
    daten: () => ({ knall: 4000 + r(10000) }),
    neu: () => ({ knall: false }),
    tick(st, m, ms) { if (ms >= m.d.knall) { st.knall = true; return { wert: 0 }; } },
    taste: (st, t, m, ms) => (t === "a" ? { wert: Math.round(ms) } : undefined),
    bild: (st, m, ms) => `<div class="mn-gross">${st.knall ? "💥" : "💣"}</div><div class="mn-schnur"><i style="width:${Math.max(0, 100 - ms / 150).toFixed(1)}%"></i></div><small>${komma(Math.max(0, ms) / 1000)} s</small>`,
    knoepfe: () => [["a", "🏃 Raus!"]], raster: "1",
    ende: () => 0, bot: (m) => { const w = 2000 + r(11000); return w < m.d.knall ? w : 0; },
  },
  {
    id: "wuerfelpoker", titel: "Würfelglück", emo: "🎲", typ: "Glück", gut: "hoch", dauer: 15000,
    regel: "Drei Würfel. Du darfst bis zu zweimal alle neu werfen. Augensumme zählt – Pasch doppelt, Drilling dreifach.",
    einheit: (w) => `${w} Punkte`,
    neu: () => ({ w: [1 + r(6), 1 + r(6), 1 + r(6)], neu: 2 }),
    taste(st, t) {
      if (t === "a" && st.neu > 0) { st.w = [1 + r(6), 1 + r(6), 1 + r(6)]; st.neu--; }
      if (t === "b") return { wert: pokerWert(st.w) };
    },
    bild: (st) => `<div class="mn-wuerfel">${st.w.map(wuerfelBild).join("")}</div><small>${pokerWert(st.w)} Punkte · noch ${st.neu}× neu werfen</small>`,
    knoepfe: () => [["a", "🔁 Neu werfen"], ["b", "✋ Behalten", "gruen"]], raster: "2",
    ende: (st) => pokerWert(st.w), bot: () => pokerWert([1 + r(6), 1 + r(6), 1 + r(6)]),
  },
  {
    id: "rechenkette", titel: "Zahlenkette", emo: "🧮", typ: "Gedächtnis", gut: "hoch", dauer: 16000,
    regel: "Fünf Zahlen blitzen nacheinander auf. Rechne mit: wie lautet die Summe? Schnell und richtig gewinnt.",
    einheit: (w) => (w ? `richtig in ${komma((20000 - w) / 1000)} s` : "falsch"),
    daten() { const z = Array.from({ length: 5 }, () => 1 + r(9)); const summe = z.reduce((a, b) => a + b, 0); return { z, summe, opts: antworten(summe, 4) }; },
    neu: () => ({}),
    taste(st, t, m, ms) { const k = VIER.indexOf(t); if (ms < 4500 || k < 0) return; return { wert: m.d.opts[k] === m.d.summe ? Math.max(1, 20000 - Math.round(ms - 4500)) : 0 }; },
    bild: (st, m, ms) => (ms < 4500 ? `<div class="mn-gross mn-blitz">${ms % 900 < 700 ? `${Math.floor(ms / 900) ? "+ " : ""}${m.d.z[Math.floor(ms / 900)]}` : ""}</div><small>Zahl ${Math.floor(ms / 900) + 1} von 5</small>`
      : `<div class="mn-gross">Summe?</div>`),
    knoepfe: (st, m, ms) => (ms < 4500 ? [] : VIER.map((t, k) => [t, String(m.d.opts[k])])), raster: "22",
    ende: () => 0, bot: () => (Math.random() < 0.7 ? 20000 - (1200 + r(6000)) : 0),
  },
  {
    id: "ampel", titel: "Nur bei Grün", emo: "🚦", typ: "Reaktion", gut: "hoch", dauer: 15000,
    regel: "Tipp nur, wenn es GRÜN leuchtet – bei Rot und Grau nicht! Grün erwischt: +1, sonst −1.",
    einheit: (w) => `${w} Punkte`,
    daten() { const s = []; let t = 700; for (let k = 0; k < 11; k++) { s.push({ at: t, g: r(10) < 6 }); t += 950 + r(400); } return { s }; },
    neu: () => ({ punkte: 0, done: {} }),
    taste(st, t, m, ms) {
      if (t !== "a") return;
      const k = m.d.s.findIndex((x) => ms >= x.at && ms < x.at + 800);
      if (k < 0 || st.done[k]) { st.punkte = Math.max(0, st.punkte - 1); return; }
      st.done[k] = true;
      st.punkte = m.d.s[k].g ? st.punkte + 1 : Math.max(0, st.punkte - 1);
    },
    tick: (st, m, ms) => (ms > m.d.s[m.d.s.length - 1].at + 900 ? { wert: st.punkte } : undefined),
    bild(st, m, ms) {
      const k = m.d.s.findIndex((x) => ms >= x.at && ms < x.at + 800);
      const f = k < 0 ? "grau" : m.d.s[k].g ? "gruen" : "rot";
      return `<div class="mn-ampel ${f}" data-mt="a">${f === "gruen" ? "JETZT!" : f === "rot" ? "NICHT!" : "…"}</div><small>${st.punkte} Punkte</small>`;
    },
    knoepfe: (st, m, ms, ctrl) => (ctrl ? [["a", "Tippen"]] : []), raster: "1",
    ende: (st) => st.punkte, bot: () => 2 + r(5),
  },
  {
    id: "richtung", titel: "Pfeil-Chaos", emo: "🧭", typ: "Reaktion", gut: "hoch", dauer: 15000,
    regel: "Folge dem PFEIL, nicht dem Wort! Jeder Treffer zählt, ein Fehler kostet einen Punkt.",
    einheit: (w) => `${w} Punkte`,
    neu: () => ({ punkte: 0, wort: r(4), pfeil: r(4) }),
    taste(st, t) {
      if (!PFEIL[t]) return;
      if (t === RICHTUNGEN[st.pfeil]) st.punkte++; else st.punkte = Math.max(0, st.punkte - 1);
      st.wort = r(4); st.pfeil = r(4);
    },
    bild: (st) => `<div class="mn-gross">${["OBEN", "RECHTS", "UNTEN", "LINKS"][st.wort]}</div><div class="mn-pfeil">${PFEIL[RICHTUNGEN[st.pfeil]]}</div><small>${st.punkte} Punkte</small>`,
    knoepfe: kreuzKnoepfe, raster: "kreuz",
    ende: (st) => st.punkte, bot: () => 5 + r(8),
  },
  {
    id: "huerden", titel: "Hürdenlauf", emo: "🦘", typ: "Geschick", gut: "hoch", dauer: 16000,
    regel: "Hürden rollen auf dich zu. Spring rechtzeitig! Wer eine Hürde reißt, ist raus. Gezählt werden die übersprungenen.",
    einheit: (w) => `${w} Hürden`,
    daten() { const h = []; let t = 1800; while (t < 14000) { h.push(t); t += 900 + r(800); } return { h }; },
    neu: () => ({ sprung: -9999, geschafft: 0, idx: 0 }),
    taste(st, t, m, ms) { if (t === "a" && ms - st.sprung > 650) st.sprung = ms; },
    tick(st, m, ms) {
      while (st.idx < m.d.h.length && m.d.h[st.idx] <= ms) {
        const d = m.d.h[st.idx] - st.sprung;
        if (d < 60 || d > 650) return { wert: st.geschafft };
        st.geschafft++; st.idx++;
      }
      if (st.idx >= m.d.h.length) return { wert: st.geschafft };
    },
    bild(st, m, ms) {
      const luft = ms - st.sprung, hoch = luft >= 0 && luft < 650 ? Math.sin((luft / 650) * Math.PI) * 52 : 0;
      const h = m.d.h.filter((x) => x > ms - 150 && x < ms + 1900).map((x) => `<i style="left:${(12 + ((x - ms) / 2200) * 86).toFixed(1)}%">🧱</i>`).join("");
      return `<div class="mn-lauf">${h}<span style="bottom:${hoch.toFixed(0)}px">🦘</span></div><small>${st.geschafft} Hürden</small>`;
    },
    knoepfe: () => [["a", "⤴️ Springen"]], raster: "1",
    ende: (st) => st.geschafft, bot: (m) => r(m.d.h.length + 1),
  },
  {
    id: "muenzregen", titel: "Münzregen", emo: "🪙", typ: "Geschick", gut: "hoch", dauer: 15000,
    regel: "Fang die Münzen mit dem Korb – weich den Bomben aus (−2). Links und rechts bewegen.",
    einheit: (w) => `${w} Münzen`,
    daten() { const z = []; let t = 500; while (t < 12000) { z.push({ at: t, bahn: r(3), bombe: r(5) === 0 }); t += 420 + r(380); } return { z }; },
    neu: () => ({ bahn: 1, punkte: 0, idx: 0 }),
    taste(st, t) {
      if (t === "links" || t === "x") st.bahn = Math.max(0, st.bahn - 1);
      if (t === "rechts" || t === "b") st.bahn = Math.min(2, st.bahn + 1);
    },
    tick(st, m, ms) {
      while (st.idx < m.d.z.length && m.d.z[st.idx].at + 1500 <= ms) {
        const x = m.d.z[st.idx];
        if (x.bahn === st.bahn) st.punkte = x.bombe ? Math.max(0, st.punkte - 2) : st.punkte + 1;
        st.idx++;
      }
      if (st.idx >= m.d.z.length) return { wert: st.punkte };
    },
    bild(st, m, ms) {
      const fall = m.d.z.filter((x) => ms >= x.at && ms < x.at + 1500).map((x) => `<i style="left:${x.bahn * 33.3 + 8}%;top:${(((ms - x.at) / 1500) * 78).toFixed(1)}%">${x.bombe ? "💣" : "🪙"}</i>`).join("");
      return `<div class="mn-regen">${fall}<span style="left:${st.bahn * 33.3 + 6}%">🧺</span></div><small>${st.punkte} Münzen</small>`;
    },
    knoepfe: () => [["links", "⬅️"], ["rechts", "➡️"]], raster: "2",
    ende: (st) => st.punkte, bot: () => 4 + r(10),
  },
  {
    id: "bieten", titel: "Einzigartige Zahl", emo: "🤫", typ: "Risiko", gut: "hoch", dauer: 12000,
    regel: "Wähl heimlich eine Zahl von 1 bis 6. Die höchste Zahl, die NUR EINER gewählt hat, gewinnt. Doppelte zählen nichts!",
    einheit: (w) => `Zahl ${w}`,
    neu: () => ({ wahl: 3 }),
    taste(st, t) {
      const z = /^z([1-6])$/.exec(t);
      if (z) return { wert: Number(z[1]) };
      if (t === "links" || t === "runter") st.wahl = Math.max(1, st.wahl - 1);
      if (t === "rechts" || t === "hoch") st.wahl = Math.min(6, st.wahl + 1);
      if (t === "a") return { wert: st.wahl };
    },
    bild: (st, m, ms, ctrl) => (ctrl ? `<div class="mn-zahlen">${[1, 2, 3, 4, 5, 6].map((z) => `<span class="${z === st.wahl ? "an" : ""}">${z}</span>`).join("")}</div>` : `<small>Wähle – keiner sieht es.</small>`),
    knoepfe: (st, m, ms, ctrl) => (ctrl ? [["links", "◀ kleiner"], ["rechts", "größer ▶"], ["a", "✅ Abgeben"]] : [1, 2, 3, 4, 5, 6].map((z) => [`z${z}`, String(z)])), raster: "3",
    punkte(werte, j, teil) { const v = werte[j]; if (v === null || v === undefined) return -1; return teil.filter((k) => werte[k] === v).length > 1 ? 0 : v; },
    ende: (st) => st.wahl, bot: () => 1 + r(6),
  },
];

function matheAufgabe() {
  const art = r(3);
  let a, b, richtig, text;
  if (art === 0) { a = 2 + r(19); b = 2 + r(19); richtig = a + b; text = `${a} + ${b}`; }
  else if (art === 1) { a = 10 + r(21); b = 1 + r(a); richtig = a - b; text = `${a} − ${b}`; }
  else { a = 2 + r(8); b = 2 + r(8); richtig = a * b; text = `${a} × ${b}`; }
  return { text, richtig, opts: antworten(richtig, 5) };
}
const PAARE = [["🙂", "🙃"], ["🐶", "🐱"], ["🍏", "🍎"], ["⏰", "⌚"], ["😀", "😃"], ["🔵", "🟣"], ["🍋", "🍊"], ["🐢", "🦎"], ["❄️", "💧"],
  ["🌕", "🌝"], ["🐝", "🪲"], ["🎃", "🍊"], ["⭐", "🌟"], ["🐸", "🐢"], ["🚗", "🚕"], ["🌲", "🌳"], ["🍩", "🥯"], ["🐭", "🐹"]];
function andersFrage() {
  const p = PAARE[r(PAARE.length)], dreh = r(2);
  return { gleich: p[dreh], anders: p[1 - dreh], k: r(4) };
}
function pendelPos(st, ms) {
  const periode = [1500, 1150, 880][Math.min(2, st.versuch)];
  const ph = (((ms - st.t0) % periode) + periode) % periode / periode;
  return (ph < 0.5 ? ph * 2 : 2 - ph * 2) * 100;
}
function turmPos(st, ms) {
  const periode = Math.max(700, 1700 - st.stock * 90);
  const ph = (((ms - st.t0) % periode) + periode) % periode / periode;
  return (ph < 0.5 ? ph * 2 : 2 - ph * 2) * (100 - st.b);
}
function pokerWert(w) {
  const sum = w.reduce((a, b) => a + b, 0);
  const gleich = Math.max(...w.map((x) => w.filter((y) => y === x).length));
  return sum * (gleich === 3 ? 3 : gleich === 2 ? 2 : 1);
}

const ALLE = [...DEFS, ...DEFS2];
export const NEU = Object.fromEntries(ALLE.map((d) => [d.id, d]));
export const NEU_IDS = ALLE.map((d) => d.id);
// die fuenf ersten Minispiele (eigener Code in brett.js/controller.js) - fuer die Streichliste
export const ALT_IDS = ["tappen", "farbwort", "reaktion", "gedaechtnis", "schaetzen"];
export const istNeu = (art) => Object.prototype.hasOwnProperty.call(NEU, art);
export const daten = (art) => (NEU[art] && NEU[art].daten ? NEU[art].daten() : null);
// i = Spielernummer (Team-Spiele), m mit Teams/Werten - beides darf fehlen
export function botWert(art, m, i) { try { const w = NEU[art].bot(m, i); return typeof w === "number" && !isNaN(w) ? w : 0; } catch (e) { return 0; } }
export const einheit = (art, w, m, j) => (w === null || w === undefined ? "—" : NEU[art].einheit(w, m, j));
// Vergleichswert: hoeher = besser (tief: kleine Werte gut; fehlend = ganz hinten). m: Teams fuer Team-/Duellspiele
export function punkte(art, werte, j, teil, m) {
  const d = NEU[art], w = werte[j];
  if (d.punkte) return d.punkte(werte, j, teil, m);
  if (w === null || w === undefined) return -1e9;
  return d.gut === "tief" ? -w : w;
}

// ---------------------------------------------------------------- Ablauf am Geraet (Handy oder Controller)
const lokal = new Map();   // key ("h<ich>" am Handy, Controller-Kennung) -> Eintrag
const mk = (m) => `${m.runde}-${m.art}`;
function eintrag(m, key, j) {
  const k = mk(m);
  let e = lokal.get(key);
  if (!e || e.k !== k) {
    e = { k, def: NEU[m.art], m, j, t0: performance.now(), st: NEU[m.art].neu(m, j), gesendet: false, wert: null, senden: null, zuletzt: "" };
    lokal.set(key, e);
    // Altes aufraeumen (andere Minispiele)
    for (const [k2, x] of lokal) if (x.k !== k && (x.gesendet || performance.now() - x.t0 > 60000)) lokal.delete(k2);
  }
  e.m = m;
  return e;
}
const zeit = (e) => performance.now() - e.t0 - VORLAUF;
function uhrText(e) {
  const ms = zeit(e);
  if (e.gesendet) return "";
  if (ms < 0) return `<b class="mn-los">${Math.ceil(-ms / 1000)}</b>`;
  return `⏱️ ${Math.max(0, Math.ceil((e.def.dauer - ms) / 1000))} s`;
}
const PAD_PFEIL = { hoch: "↑", runter: "↓", links: "←", rechts: "→" };
function knoepfeHTML(e, ms, schild) {
  const d = e.def;
  if (e.gesendet || ms < 0) return "";
  const liste = d.knoepfe ? d.knoepfe(e.st, e.m, ms, !!schild) : [];
  if (!liste.length) return "";
  if (schild) return `<div class="mn-chips">${liste.map(([t, text]) => `<span class="mn-chip">${PAD_PFEIL[t] ? `<kbd class="taste">✚${PAD_PFEIL[t]}</kbd>` : schild(t)} ${text}</span>`).join("")}</div>`;
  return `<div class="mn-knoepfe mn-r${d.raster || "2"}">${liste.map(([t, text, kl]) => `<button type="button" class="mn-k mn-t-${t} ${kl || ""}" data-mt="${t}">${text}</button>`).join("")}</div>`;
}
function bildHTML(e, ms, schild) {
  if (e.gesendet) return `<div class="mn-fertig">✓ Erledigt<small>${esc(einheit(e.m.art, e.wert))}</small></div>`;
  if (ms < 0) return `<div class="mn-regel">${esc(e.def.regel)}</div>`;
  return e.def.bild(e.st, e.m, ms, !!schild);
}
// HTML fuer eine Spielflaeche. schild = null (Handy) oder (taste) -> Tastenschild (Controller); j = Spielernummer
export function html(m, key, schild = null, j) {
  const e = eintrag(m, key, j);
  const ms = zeit(e);
  const d = e.def, hinweis = !schild && (d.wisch || d.neigen) ? `<small class="mn-hinweis">${d.neigen ? "📱 Handy neigen oder Knöpfe" : "👆 Auf dem Bild wischen oder Knöpfe"}</small>` : "";
  return `<div class="mn ${schild ? "mn-pad" : ""}" data-mn="${esc(key)}"><div class="mn-uhr">${uhrText(e)}</div>
    <div class="mn-bild ${!schild && d.wisch ? "mn-wisch" : ""}">${bildHTML(e, ms, schild)}</div><div class="mn-unten">${knoepfeHTML(e, ms, schild)}</div>${hinweis}</div>`;
}
// wohin der Wert geht; am Handy zusaetzlich die Knoepfe anbinden (und Wischen/Neigen, wo das Spiel es kennt)
export function anmelden(m, key, senden, schild = null, j) {
  const e = eintrag(m, key, j);
  e.senden = senden; e.schild = schild;
  starteTakt();
  const box = finde(key);
  if (box && !schild) {
    let wisch = null;
    box.onpointerdown = (ev) => {
      const k = ev.target.closest("[data-mt]");
      if (k && box.contains(k)) { ev.preventDefault(); taste(key, k.dataset.mt); return; }
      if (e.def.wisch && ev.target.closest(".mn-bild")) { ev.preventDefault(); wisch = { x: ev.clientX, y: ev.clientY }; }
    };
    // Wischen: Richtung aus Start- und Endpunkt (ab 24 px), ergibt dieselben Tasten wie die Pfeile
    box.onpointerup = box.onpointercancel = (ev) => {
      if (!wisch) return;
      const dx = ev.clientX - wisch.x, dy = ev.clientY - wisch.y;
      wisch = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      taste(key, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "rechts" : "links") : dy > 0 ? "runter" : "hoch");
    };
    if (e.def.neigen) neigenAn(key);
  }
}
// Neigen: Seitenneigung (gamma, Grad) an das laufende Neige-Spiel dieses Handys, hoechstens alle 60 ms
let neigKey = null, neigZuletzt = 0, neigHoerer = false;
function neigenAn(key) {
  neigKey = key;
  if (neigHoerer || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
  neigHoerer = true;
  window.addEventListener("deviceorientation", (ev) => {
    if (!neigKey || ev.gamma === null || ev.gamma === undefined) return;
    const e = lokal.get(neigKey);
    if (!e || e.gesendet || !e.def.neigen) return;
    const jetzt = performance.now();
    if (jetzt - neigZuletzt < 60) return;
    neigZuletzt = jetzt;
    taste(neigKey, `neig:${Math.round(ev.gamma)}`);
  });
}
export const fertigBei = (key) => { const e = lokal.get(key); return !!(e && e.gesendet); };
// -> true, wenn die Taste verbraucht wurde
export function taste(key, t) {
  const e = lokal.get(key);
  if (!e) return false;
  if (e.gesendet) return true;
  const ms = zeit(e);
  if (ms < 0) return true;
  let x;
  try { x = e.def.taste(e.st, t, e.m, ms); } catch (err) { console.error(err); }
  if (x) fertig(key, e, x.wert); else zeichne(key, e);
  return true;
}
function fertig(key, e, wert) {
  if (e.gesendet) return;
  e.gesendet = true; e.wert = wert;
  zeichne(key, e);
  if (e.senden) e.senden(wert, e.k);
}
function finde(key) { try { return document.querySelector(`[data-mn="${CSS.escape(key)}"]`); } catch (x) { return null; } }
function zeichne(key, e) {
  const box = finde(key);
  if (!box) return;
  const ms = zeit(e);
  const teile = [[".mn-uhr", uhrText(e)], [".mn-bild", bildHTML(e, ms, e.schild)], [".mn-unten", knoepfeHTML(e, ms, e.schild)]];
  teile.forEach(([sel, h]) => { const el = box.querySelector(sel); if (el && el.__h !== h) { el.innerHTML = h; el.__h = h; } });
}
let taktAn = false;
function starteTakt() {
  if (taktAn) return;
  taktAn = true;
  setInterval(() => {
    for (const [key, e] of lokal) {
      if (e.gesendet) continue;
      const ms = zeit(e);
      if (ms >= 0) {
        let x;
        try { x = e.def.tick ? e.def.tick(e.st, e.m, ms) : undefined; } catch (err) { console.error(err); }
        if (x) { fertig(key, e, x.wert); continue; }
        if (ms >= e.def.dauer) { let w = 0; try { w = e.def.ende(e.st, e.m); } catch (err) { console.error(err); } fertig(key, e, w); continue; }
      }
      zeichne(key, e);
    }
  }, 50);
}
