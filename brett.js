// Partybrett - eigenes Brettspiel mit Wuerfeln, Feldern, Sternen und Minispielen nach jeder Runde
// (in der Art bekannter Party-Brettspiele, eigene Umsetzung).
// Ausbau Nico 31.10.2026 (Punkt 8, alle vier Richtungen): groesseres Brett mit zwei Abzweigungen, Laden mit Gegenstaenden,
// Fallen, Schild, Ereignisfeld mit ~100 Zufaellen (brett_ereignisse.js, streichbar), wandernder Stern, Aufholhilfe,
// Schlussrunden-Ereignis, Bonussterne am Ende; Minispiele in den Spielarten alle gegen alle, Team gegen Team, 1 gegen alle, Duell.
// Teil 4b (Nico 31.10.2026 abends: "doppelte Menge und Komplexitaet, so nah wie moeglich am Original"):
// - 53 Minispiele (5 alte hier, 48 in brett_minis.js/brett_minis2.js), einzeln streichbar wie die Ereignisse
// - Lebenspunkte (30): Stachelfelder, Waffen-Gegenstaende, Bomben, Gift, Duelle und der Vulkan ziehen ab; bei 0 ist man K.O.:
//   die Haelfte der Muenzen (hoechstens 15) bleibt als Haufen auf dem Feld liegen (wer vorbeikommt, sammelt sie ein),
//   zurueck zum Start mit vollen Lebenspunkten
// - 19 Gegenstaende (Laden zeigt je Besuch 6 davon), Truhenfelder, Heilquellen, Stachelfelder, Portale, Glutfelder
// - Rundenzahl beim Start waehlbar (6/8/12/20), zweites Brett "Vulkaninsel" mit Portalen, Lavapfad und Ausbruch alle 3 Runden
import { esc, knopf, zufall, ziehe, mischen, name, schlucke } from "./hilfe.js";
import * as T from "./texte.js";
import * as BE from "./brett_ereignisse.js";
import * as R from "./brett_minis.js";
import * as STAPEL from "./stapel.js";
import { brett3dZeigen } from "./brett3d.js";

const RUNDEN = 8;                       // Vorgabe
export const RUNDEN_WAHL = [6, 8, 12, 20];
const STERNPREIS = 10;
const AUFGABE_STRAFE = 2;
const BEUTEL = 3;   // hoechstens so viele Gegenstaende
export const LP = 30;                   // Lebenspunkte
const ANGEBOT = 6;  // so viele Gegenstaende zeigt der Laden je Besuch

// ---------------------------------------------------------------- Bretter
// Feldarten: m = +3 Muenzen, v = -3 Muenzen, t = Trinkfeld (ohne Trinken: a = Aufgabenfeld), e = Ereignis, d = Duell, l = Laden,
// s = Stachelfeld (-10 Lebenspunkte), h = Heilquelle (+8), k = Truhe, p = Portal (zum Partnerportal), g = Glutfeld (-5, +5 Muenzen)
function hauptXY(i, n) {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.cos(a) * 9.6 * (1 + 0.07 * Math.sin(a * 3)), z: Math.sin(a) * 7.6 * (1 + 0.07 * Math.cos(a * 2)) };
}
function vulkanXY(i, n) {
  const a = (i / n) * Math.PI * 2 + 0.25, w = 1 + 0.09 * Math.cos(a * 3 + 0.6);
  return { x: Math.cos(a) * 9.7 * w, z: Math.sin(a) * 7.9 * w };
}
// Hauptrunde + Abkuerzung (+ Umweg). Abzweigungen: an "von" geht es geradeaus oder auf den Nebenweg, der bei "nach" endet.
function brettBauen(b) {
  const nh = b.haupt.length, a0 = nh, u0 = nh + b.abk.length;
  const mus = b.haupt + b.abk + (b.umweg || "");
  const n = mus.length;
  const next = Array.from({ length: n }, (_, i) => (i < nh ? [(i + 1) % nh] : [i + 1]));
  next[b.abkVon] = [b.abkVon + 1, a0]; next[a0 + b.abk.length - 1] = [b.abkNach];
  if (b.umweg) { next[b.umVon] = [b.umVon + 1, u0]; next[u0 + b.umweg.length - 1] = [b.umNach]; }
  const prev = Array.from({ length: n }, () => []);
  next.forEach((nx, i) => nx.forEach((j) => prev[j].push(i)));
  prev.forEach((p) => p.sort((x, y) => (x < nh ? 0 : 1) - (y < nh ? 0 : 1)));   // zurueck immer ueber die Hauptrunde
  const lage = Array.from({ length: nh }, (_, i) => b.xy(i, nh));
  const zwischen = (p, q, k, m, f) => { const t = k / m, x = { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, w = 1 + f * Math.sin(Math.PI * t); return { x: x.x * w, z: x.z * w }; };
  for (let k = 1; k <= b.abk.length; k++) lage.push(zwischen(lage[b.abkVon], lage[b.abkNach], k, b.abk.length + 1, b.abkBogen));
  if (b.umweg) for (let k = 1; k <= b.umweg.length; k++) lage.push(zwischen(lage[b.umVon], lage[b.umNach], k, b.umweg.length + 1, b.umBogen));
  const wegname = { [b.abkVon + 1]: "➡️ Hauptweg", [a0]: b.abkName };
  if (b.umweg) Object.assign(wegname, { [b.umVon + 1]: "➡️ Hauptweg", [u0]: b.umName });
  return { nr: b.nr, name: b.name, emo: b.emo, welt: b.welt, text: b.text, muster: mus, ohne: mus.replace(/t/g, "a"), next, prev, lage, nh, felder: n, wegname, portale: b.portale || {} };
}
export const BRETTER = {
  1: brettBauen({ nr: 1, name: "Inselbrett", emo: "🏝️", welt: "insel", text: "Abkürzung, Umweg mit Laden und Heilquelle",
    haupt: "mmtemvlmemdtkevslmetmvhemdktemslmedm", xy: hauptXY,
    abk: "vsdkm", abkVon: 8, abkNach: 17, abkBogen: -0.42, abkName: "⚡ Abkürzung – kurz, aber gefährlich",
    umweg: "mlhm", umVon: 24, umNach: 29, umBogen: 0.2, umName: "🌿 Umweg – mit Laden und Heilquelle" }),
  2: brettBauen({ nr: 2, name: "Vulkaninsel", emo: "🌋", welt: "vulkan", text: "Portale, heißer Lavapfad, alle 3 Runden bricht der Vulkan aus",
    haupt: "mmedmvsmlepmtkmehvmdemltgmepmskehm", xy: vulkanXY,
    abk: "ggkgm", abkVon: 3, abkNach: 13, abkBogen: -0.45, abkName: "🔥 Lavapfad – kurz, heiß, mit Truhe",
    portale: { 10: 27, 27: 10 } }),
};
const B = (s) => BRETTER[s && s.brettNr === 2 ? 2 : 1];
// Brett 1 wie bisher (Tests, 3D-Pruefungen)
export const NEXT = BRETTER[1].next;
export const LAGE = BRETTER[1].lage;
const muster = (s) => (s && s.ohne ? B(s).ohne : B(s).muster);
export const ART = { m: ["🪙", "+3 Münzen"], v: ["💸", "−3 Münzen"], t: ["🍺", "Trinkfeld"], a: ["🎯", "Aufgabenfeld"], e: ["❓", "Ereignis"], d: ["⚔️", "Duell"], l: ["🛒", "Laden"],
  s: ["🌵", "Stachelfeld"], h: ["💖", "Heilquelle"], k: ["🧰", "Truhe"], p: ["🌀", "Portal"], g: ["🔥", "Glutfeld"] };
const VULKAN_ALLE = 3;   // Ausbruch zu Beginn jeder dritten Runde (Brett 2)

// ---------------------------------------------------------------- Gegenstaende (Laden, Truhen, Ereignisse)
// ziel = braucht ein Opfer (Phase "ziel")
export const WAREN = [
  { id: "doppel", emo: "🎲", name: "Doppelwürfel", preis: 5, text: "zwei Würfel in diesem Zug" },
  { id: "dreifach", emo: "🎰", name: "Dreifachwürfel", preis: 9, text: "drei Würfel in diesem Zug" },
  { id: "mini", emo: "🐢", name: "Mini-Würfel", preis: 2, text: "würfelt nur 1 bis 3 – zum gezielten Landen" },
  { id: "tausch", emo: "🔄", name: "Tauschtrank", preis: 7, text: "tausch den Platz mit jemandem", ziel: true },
  { id: "dieb", emo: "🧲", name: "Münzmagnet", preis: 6, text: "klau jemandem bis zu 5 Münzen", ziel: true },
  { id: "falle", emo: "🪤", name: "Falle", preis: 4, text: "auf dein Feld: wer dort landet, zahlt dir 5" },
  { id: "schild", emo: "🛡️", name: "Schutzschild", preis: 5, text: "fängt das nächste Unglück oder den nächsten Treffer ab (wirkt von selbst)" },
  { id: "rohr", emo: "🌟", name: "Sternenrohr", preis: 14, text: "bringt dich direkt vor den Stern" },
  { id: "heil", emo: "💖", name: "Heiltrank", preis: 4, text: "+15 Lebenspunkte" },
  { id: "faust", emo: "🥊", name: "Boxhandschuh", preis: 8, text: "15 Schaden an jemandem bis 4 Felder entfernt", ziel: true },
  { id: "bogen", emo: "🏹", name: "Pfeil und Bogen", preis: 6, text: "8 Schaden an jemandem, egal wo", ziel: true },
  { id: "blitz", emo: "⚡", name: "Gewitterwolke", preis: 10, text: "alle anderen verlieren 6 Lebenspunkte" },
  { id: "bombe", emo: "💣", name: "Zeitbombe", preis: 6, text: "auf dein Feld: knallt zu Rundenbeginn – 12 Schaden dort und daneben" },
  { id: "gift", emo: "🧪", name: "Gifttrank", preis: 7, text: "Ziel verliert 3 Runden lang je 4 Lebenspunkte", ziel: true },
  { id: "rakete", emo: "🚀", name: "Rakete", preis: 9, text: "fliegt 8 Felder vor – wer überflogen wird, bekommt 6 Schaden" },
  { id: "fluch", emo: "🐌", name: "Schneckenfluch", preis: 5, text: "Ziel würfelt beim nächsten Mal nur 1 oder 2", ziel: true },
  { id: "sperre", emo: "🚧", name: "Absperrung", preis: 4, text: "auf dein Feld: wer vorbeiläuft, muss dort anhalten" },
  { id: "wunder", emo: "🎁", name: "Wundertüte", preis: 5, text: "irgendwas passiert – meistens Gutes" },
  { id: "handschuh", emo: "🧤", name: "Langfinger", preis: 6, text: "klau jemandem einen Gegenstand", ziel: true },
];
const ware = (id) => WAREN.find((w) => w.id === id);
const LADEN = WAREN.map((w) => w.id);

// ---------------------------------------------------------------- Minispiele
// Die fuenf ersten (alte Fassung, eigener Code weiter unten und in controller.js) + 48 neue (brett_minis.js, brett_minis2.js)
const ALT = {
  tappen: { titel: "Tipp-Marathon", emo: "👆", typ: "Geschick", regel: "Tippe so oft du kannst auf die Fläche – 5 Sekunden!" },
  farbwort: { titel: "Farbwort-Chaos", emo: "🎨", typ: "Kopf", regel: "Tippe die FARBE, in der das Wort geschrieben ist – nicht das Wort! 12 Sekunden." },
  reaktion: { titel: "Blitzreaktion", emo: "⚡", typ: "Reaktion", regel: "Tippe, sobald die Fläche grün wird. Zu früh = letzter Platz." },
  gedaechtnis: { titel: "Zahlen-Gedächtnis", emo: "🧠", typ: "Gedächtnis", regel: "Merk dir die Zahl – sie verschwindet nach 3 Sekunden." },
  schaetzen: { titel: "Schätzfrage", emo: "🎯", typ: "Wissen", regel: "Wer am nächsten dran ist, gewinnt." },
};
export const MINI_IDS = [...Object.keys(ALT), ...R.NEU_IDS];
export const miniInfo = (art) => (ALT[art] || R.NEU[art]);
const MODI = { alle: "Alle gegen alle", team: "Team gegen Team", eins: "Einer gegen alle", duell: "Duell" };

const testVorgabe = () => (typeof globalThis !== "undefined" && globalThis.__brettTest) || null;

function neuerStern(s) {
  const mu = B(s).muster;
  const frei = [...mu].map((f, i) => (f === "m" && i !== s.stern && !(s.pos || []).includes(i) ? i : -1)).filter((i) => i >= 0);
  return frei[zufall(frei.length)];
}
// vor dem ersten Wurf darf der Erste Runden und Brett waehlen
const einstellbar = (s) => s.runde === 1 && s.dran === 0 && s.phase === "wuerfeln" && !s.spurNr && !s.wareBenutzt;

export const brett = {
  id: "brett", name: "Partybrett", emoji: "🎲", farben: ["#ff9600","#b4231f"], kurz: "Würfeln, Lebenspunkte, Laden, Sterne kaufen, 53 Minispiele – 2 Bretter, 6 bis 20 Runden",
  start(namen) {
    const n = namen.length, je = (v) => namen.map(() => (typeof v === "function" ? v() : v));
    const s = { runde: 1, dran: 0, pos: je(0), muenzen: je(5), sterne: je(0), phase: "wuerfeln", wurf: null, wuerfe: null,
      meldung: "Wer zuerst würfelt, fängt an!", stern: 0, mini: null, ende: false,
      waren: je(() => []), fallen: {}, rabatt: je(false), stat: { mini: je(0), gesammelt: je(0), ereignis: je(0), ko: je(0) },
      rest: 0, wahl: null, spur: null, spurNr: 0, sternVorbei: false, wuerfelArt: null, wareBenutzt: false, zielWare: null,
      extra: false, schluss: null, bonus: null, miniNr: 0, sternSeit: 1, gezogen: [], effekt: null,
      runden: RUNDEN, brettNr: 1, lp: je(LP), gift: je(0), fluch: je(false), bomben: {}, sperren: {}, haufen: {}, angebot: null, unterwegs: null };
    s.stern = neuerStern(s);
    return s;
  },
  // Gesamtwertung: wer am Ende vorne liegt (Sterne, dann Muenzen - wie die Rangliste)
  ergebnis(s) {
    if (!s.ende) return null;
    const best = (j) => s.sterne[j] * 10000 + s.muenzen[j];
    const max = Math.max(...s.pos.map((_, j) => best(j)));
    return { nr: "1", sieger: s.pos.map((_, j) => j).filter((j) => best(j) === max) };
  },
  aktion(s, i, a, namen, raum) {
    if (a.typ === "neustart") {
      const wahl = { runden: s.runden, brettNr: s.brettNr };
      Object.assign(s, brett.start(namen));
      if (RUNDEN_WAHL.includes(wahl.runden)) s.runden = wahl.runden;
      if (wahl.brettNr === 2) { s.brettNr = 2; s.stern = neuerStern(s); }
      return s;
    }
    if (s.ende) return;
    sicher(s);
    const dran = i === s.dran;
    if (s.phase === "wuerfeln" && dran && a.typ === "einstellung" && einstellbar(s)) einstellen(s, a, namen);
    else if (s.phase === "wuerfeln" && dran && a.typ === "wuerfeln") wuerfeln(s, i, namen, raum);
    else if (s.phase === "wuerfeln" && dran && a.typ === "ware") wareEinsetzen(s, i, a.ware, namen);
    else if (s.phase === "ziel" && dran && a.typ === "ziel" && zielListe(s, i, s.zielWare).includes(a.ziel)) zielWirkung(s, i, a.ziel, namen);
    else if (s.phase === "ziel" && dran && a.typ === "nein") { if (s.zielWare) s.waren[i].push(s.zielWare); s.zielWare = null; s.wareBenutzt = false; s.phase = "wuerfeln"; s.meldung = `${namen[i]} steckt den Gegenstand wieder ein.`; }
    else if (s.phase === "weg" && dran && a.typ === "weg" && B(s).next[s.pos[i]].includes(a.ziel)) { s.wahl = a.ziel; if (laufen(s, i)) nachLauf(s, i, namen, raum); }
    else if (s.phase === "stern" && dran && (a.typ === "kaufen" || a.typ === "nein")) {
      if (a.typ === "kaufen" && s.muenzen[i] >= sternPreis(s, i)) {
        const p = sternPreis(s, i);
        s.muenzen[i] -= p; s.sterne[i]++; s.rabatt[i] = false;
        s.meldung = `⭐ ${namen[i]} kauft einen Stern${p < STERNPREIS ? ` für nur ${p}` : ""}! Alle anderen trinken 1 Schluck.`;
        s.stern = neuerStern(s); s.sternSeit = s.runde;
        effekt(s, "stern", i);
      }
      feldWirkung(s, i, muster(s)[s.pos[i]], namen, raum);
    } else if (s.phase === "laden" && dran && a.typ === "kaufware") {
      const w = ware(a.ware);
      if (!w || !angebot(s).includes(w.id) || s.muenzen[i] < w.preis || s.waren[i].length >= BEUTEL) return;
      s.muenzen[i] -= w.preis; s.waren[i].push(w.id);
      s.meldung = `🛒 ${namen[i]} kauft: ${w.emo} ${w.name}.`;
      s.phase = "weiter"; s.angebot = null;
    } else if (s.phase === "laden" && dran && a.typ === "nein") { s.meldung = `🛒 ${namen[i]} kauft nichts.`; s.phase = "weiter"; s.angebot = null; }
    else if (s.phase === "duell" && dran && a.typ === "duell" && a.ziel !== i && a.ziel >= 0 && a.ziel < s.pos.length) {
      const ich = 1 + zufall(6), du = 1 + zufall(6);
      const sieger = ich >= du ? i : a.ziel, verl = sieger === i ? a.ziel : i;
      const beute = Math.min(4, s.muenzen[verl]);
      s.muenzen[verl] -= beute; geben(s, sieger, beute);
      s.meldung = `⚔️ Duell: ${namen[i]} ${ich} gegen ${namen[a.ziel]} ${du} – ${namen[sieger]} gewinnt ${beute} Münzen, ${namen[verl]} trinkt 2 Schlucke! `;
      s.meldung += schaden(s, verl, 5, namen);
      zugEnde(s, namen, raum);
    } else if (s.phase === "weiter" && a.typ === "weiter") zugEnde(s, namen, raum);
    else if (s.phase === "aufgabe" && a.typ === "aufgabe" && dran) {
      if (!a.ok) { s.muenzen[i] = Math.max(0, s.muenzen[i] - AUFGABE_STRAFE); s.meldung = `🙅 ${namen[i]} kneift – −${AUFGABE_STRAFE} Münzen.`; }
      else s.meldung = `✅ ${namen[i]} hat die Aufgabe erledigt.`;
      zugEnde(s, namen, raum);
    } else if (s.phase === "bonus" && a.typ === "weiter") { s.ende = true; s.phase = "ende"; }
    else if (s.phase === "mini") miniAktion(s, i, a, namen, raum);
  },
  render(s, ich, namen, raum) {
    sicher(s);
    const tafel = `<div class="tafel">${namen.map((nm, j) => `<div class="${j === s.dran && s.phase !== "mini" ? "dran" : ""}"><span class="farbe f${j}"></span><b>${esc(nm)}</b>
      <span>⭐${s.sterne[j]}</span><span>🪙${s.muenzen[j]}</span><span class="lp ${s.lp[j] <= 10 ? "niedrig" : ""}" title="Lebenspunkte">❤️${s.lp[j]}</span>${s.gift[j] ? `<span title="vergiftet">🧪</span>` : ""}${s.fluch[j] ? `<span title="Schneckenfluch">🐌</span>` : ""}${s.waren[j].length ? `<span class="beutel" title="Gegenstände">${s.waren[j].map((w) => ware(w).emo).join("")}</span>` : ""}</div>`).join("")}</div>`;
    const m = s.meldung || "";
    const klang = /kauft einen Stern/.test(m) ? "stern" : /K\.O\.|Vulkan bricht aus|BUMM/.test(m) ? "falsch" : /\+3 Münzen|\+6 Münzen|Truhe/.test(m) ? "richtig" : /−3 Münzen|−6 Münzen|−\d+ ❤️/.test(m) ? "falsch" : /❓/.test(m) ? "magie" : /Duell/.test(m) ? "spannung" : /Trinkfeld|Aufgabenfeld|🛒|Portal/.test(m) ? "pop" : "";
    const meldung = `<div class="meldung">${esc(m)}</div>${klang ? `<i hidden data-key="bt-${s.runde}-${s.dran}-${m.length}-${klang}" data-ton="${klang}" data-ton-nach="${s.wurf && klang !== "stern" ? 1000 + Math.min(12, s.wurf) * 290 : 0}"></i>` : ""}`;   // 3D: erst Wuerfelblock anspringen (~1 s), dann ~0,3 s je Feld
    const schluss = s.schluss && !s.ende ? `<div class="schlussband">🔥 Schlussrunden: ${esc(SCHLUSS[s.schluss].text)}</div>` : "";
    if (s.ende) {
      const rang = rangfolge(s);
      return `${tafel}<div class="urteil">🏆 ${name(namen, rang[0])} gewinnt das Partybrett!</div>
        <div id="brett3d" class="brett3d sieger"></div>
        <ol class="rangliste">${rang.map((j) => `<li>${name(namen, j)}: ⭐${s.sterne[j]} 🪙${s.muenzen[j]}${s.stat.ko[j] ? ` · 💫${s.stat.ko[j]}× K.O.` : ""}</li>`).join("")}</ol>
        ${bonusListe(s, namen)}
        <p class="mitte">${s.ohne ? `🎯 Letzter Platz: ${esc(T.AUFGABEN[(s.pos.length * 7 + s.muenzen.reduce((x, y) => x + y, 0)) % T.AUFGABEN.length])}` : "Letzter Platz trinkt 3 Schlucke 🍺"}</p>${knopf("Neues Spiel", { typ: "neustart" }, "gross")}`;
    }
    if (s.phase === "bonus") {
      return `${tafel}<div class="frage">🌟 Bonussterne!</div><p class="mitte leise">Nach ${s.runden} Runden gibt es noch Sterne für besondere Leistungen.</p>${bonusListe(s, namen)}
        <i hidden data-key="btbonus-${s.runde}" data-ton="stern"></i><i hidden data-ergebnis="bw-bonus"></i>${knopf("Weiter", { typ: "weiter" }, "gross")}`;
    }
    if (s.phase === "mini") return `${tafel}<i hidden data-key="btmini-${s.runde}-${s.mini && s.mini.art}" data-ton="los"></i>${miniRender(s, ich, namen)}`;
    const bb = B(s);
    const brettHtml = `<div id="brett3d" class="brett3d welt-${bb.welt}">${brett2d(s, namen)}<div class="brett3d-info">${bb.emo} Runde ${Math.min(s.runde, s.runden)}/${s.runden}${s.wurf ? ` · 🎲 ${s.wuerfe && s.wuerfe.length > 1 ? `${s.wuerfe.join("+")} = ` : ""}${s.wurf}` : ""}</div></div>`;
    const istDran = ich === s.dran;
    const wer = esc(namen[s.dran]);
    let steuer = "";
    if (s.phase === "wuerfeln") {
      if (istDran) {
        const art = s.wuerfelArt ? ware(s.wuerfelArt) : null;
        const nutzbar = nutzbareWaren(s, ich);
        steuer = `<i hidden data-key="btdran-${s.runde}-${s.dran}" data-ton="dran"></i>` + knopf("🎲 Würfeln", { typ: "wuerfeln" }, "gross")
          + (s.fluch[ich] ? `<p class="mitte leise">🐌 Schneckenfluch: dieser Wurf zeigt nur 1 oder 2.</p>` : "")
          + (art ? `<p class="mitte leise">Aktiv: ${art.emo} ${esc(art.name)}</p>` : "")
          + (nutzbar.length ? `<p class="mitte leise klein">Oder vorher einen Gegenstand einsetzen:</p><div class="raster2 waren">${nutzbar.map((w) => knopf(`${ware(w).emo} ${esc(ware(w).name)}<small>${esc(ware(w).text)}</small>`, { typ: "ware", ware: w }, "zweit")).join("")}</div>` : "")
          + (einstellbar(s) ? einstellungHTML(s) : "");
      } else steuer = `<p class="mitte leise">${wer} würfelt …${einstellbar(s) ? " (und kann vorher Runden und Brett wählen)" : ""}</p>`;
    }
    if (s.phase === "ziel") steuer = istDran ? `<p class="mitte">${esc(ware(s.zielWare).emo + " " + ware(s.zielWare).name)}: gegen wen?</p><div class="raster">${zielListe(s, ich, s.zielWare).map((j) => knopf(`${esc(namen[j])}<small>🪙${s.muenzen[j]} ❤️${s.lp[j]}${s.waren[j].length ? ` · ${s.waren[j].map((w) => ware(w).emo).join("")}` : ""}</small>`, { typ: "ziel", ziel: j }, "gross")).join("")}</div>${knopf("Doch nicht", { typ: "nein" }, "zweit")}`
      : `<p class="mitte leise">${wer} setzt einen Gegenstand ein …</p>`;
    if (s.phase === "weg") steuer = istDran ? `<p class="mitte">Abzweigung! Welcher Weg?</p><div class="raster wege">${bb.next[s.pos[ich]].map((z) => knopf(`${bb.wegname[z] || "➡️ Weiter"}<small>⭐ in ${sternAbstand(s, z) + 1} Feldern · noch ${s.rest} Schritte</small>`, { typ: "weg", ziel: z }, "gross")).join("")}</div>`
      : `<p class="mitte leise">${wer} wählt einen Weg …</p>`;
    if (s.phase === "stern") steuer = istDran ? `<div class="raster2">${knopf(`⭐ Kaufen (${sternPreis(s, ich)})`, { typ: "kaufen" }, "gross gelb")}${knopf("Nein", { typ: "nein" }, "gross")}</div>` : `<p class="mitte leise">${wer} überlegt …</p>`;
    if (s.phase === "laden") steuer = istDran ? `<p class="mitte">🛒 Laden – ${s.waren[ich].length}/${BEUTEL} im Beutel, du hast 🪙${s.muenzen[ich]}</p><div class="laden">${angebot(s).map((id) => { const w = ware(id); const geht = s.muenzen[ich] >= w.preis && s.waren[ich].length < BEUTEL;
        return knopf(`<span>${w.emo} ${esc(w.name)} <b>${w.preis} 🪙</b></span><small>${esc(w.text)}</small>`, { typ: "kaufware", ware: id }, "ware-knopf", geht ? "" : "disabled"); }).join("")}</div>${knopf("🚪 Nichts kaufen", { typ: "nein" }, "zweit")}`
      : `<p class="mitte leise">${wer} stöbert im Laden …</p>`;
    if (s.phase === "duell") steuer = istDran ? `<p class="mitte">Wen forderst du heraus? Der Verlierer gibt Münzen ab und verliert 5 ❤️.</p><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "duell", ziel: j }, "gross"))).join("")}</div>` : `<p class="mitte leise">${wer} wählt einen Gegner …</p>`;
    if (s.phase === "weiter") steuer = knopf("Weiter", { typ: "weiter" }, "gross");
    if (s.phase === "aufgabe") steuer = istDran ? `<div class="raster2">${knopf("✅ Erledigt", { typ: "aufgabe", ok: true }, "gross gruen")}${knopf(`🙅 Keine Lust (−${AUFGABE_STRAFE} 🪙)`, { typ: "aufgabe", ok: false }, "gross")}</div>`
      : `<p class="mitte leise">${wer} ist mit der Aufgabe dran …</p>`;
    // nach dem Wurf steht das Feld erst eine Weile: Weiter, Kaufen/Nein, Wegwahl, Laden und die Duell-Wahl sind kurz gesperrt
    // (app.js), damit ein zweiter Tipp auf "Wuerfeln" nicht gleich das Ergebnis wegtippt
    const nachWurf = ["weiter", "stern", "duell", "aufgabe", "weg", "laden"].includes(s.phase) ? `<i hidden data-ergebnis="bw-${s.runde}-${s.dran}-${s.phase}-${m.length}"></i>` : "";
    return `${tafel}${schluss}${brettHtml}${meldung}${nachWurf}${steuer}`;
  },
  musik(s) { return s.ende ? null : "brett"; },
  // Computer-Mitspieler: wuerfeln, Wege, Laden, Gegenstaende, kaufen, duellieren und spielen die Minispiele mit glaubwuerdigen Werten
  botPause: (s) => (s.phase === "weiter" || s.phase === "bonus" ? 2800 : s.phase === "mini" ? 4500 : 1400),
  bot(s, i) {
    if (s.ende) return null;
    sicher(s);
    const n = s.pos.length;
    if (s.phase === "mini") {
      const m = s.mini;
      if (!m || m.fertig || m.werte[i] !== undefined || !teilVon(s, m).includes(i)) return null;
      if (R.istNeu(m.art)) return { typ: "mini", wert: R.botWert(m.art, m, i) };
      const r = (a, b) => a + zufall(b - a + 1);
      const wert = m.art === "tappen" ? r(18, 36) : m.art === "farbwort" ? r(4, 11) : m.art === "gedaechtnis" ? r(4, 8)
        : m.art === "reaktion" ? (Math.random() < 0.08 ? -1 : r(240, 470)) : Math.round(T.SCHAETZ[m.frage][1] * (0.55 + Math.random() * 0.9));
      return { typ: "mini", wert };
    }
    if (s.phase === "bonus") return { typ: "weiter" };
    if (s.dran !== i) return null;
    if (s.phase === "wuerfeln") {
      const nutz = nutzbareWaren(s, i);
      if (nutz.length && Math.random() < 0.6) return { typ: "ware", ware: nutz[0] };
      return { typ: "wuerfeln" };
    }
    if (s.phase === "ziel") { const z = zielListe(s, i, s.zielWare).sort((a, b) => s.muenzen[b] - s.muenzen[a]); return z.length ? { typ: "ziel", ziel: z[0] } : { typ: "nein" }; }
    if (s.phase === "weg") { const nx = B(s).next[s.pos[i]]; const d = nx.map((z) => sternAbstand(s, z)); return { typ: "weg", ziel: nx[d[0] <= d[1] ? 0 : 1] }; }
    if (s.phase === "stern") return { typ: "kaufen" };
    if (s.phase === "laden") { const geht = angebot(s).filter((id) => s.muenzen[i] - ware(id).preis >= 5 && s.waren[i].length < BEUTEL); return geht.length ? { typ: "kaufware", ware: geht[zufall(geht.length)] } : { typ: "nein" }; }
    if (s.phase === "duell") { const andere = [...Array(n).keys()].filter((j) => j !== i).sort((a, b) => s.muenzen[b] - s.muenzen[a]); return { typ: "duell", ziel: andere[0] }; }
    if (s.phase === "weiter") return { typ: "weiter" };
    if (s.phase === "aufgabe") return { typ: "aufgabe", ok: true };
    return null;
  },
  nach(s, ich, senden) {
    const c = document.getElementById("brett3d");
    const bb = B(s), opt = { lage: bb.lage, next: bb.next, waren: WAREN, nh: bb.nh, welt: bb.welt };
    // Siegerehrung in 3D: am Ende das Treppchen nach der Rangliste, nach einem Minispiel die Gewinner oben
    if (c && c.classList.contains("sieger")) {
      const sg = s.ende ? endSieger(s) : s.phase === "mini" && s.mini && s.mini.fertig ? miniSieger(s, s.mini) : null;
      if (!sg || !brett3dZeigen(c, s, muster(s), opt, sg)) c.remove();
    }
    if (s.phase === "mini") return miniNach(s, ich, senden);
    if (c && !s.ende && s.phase !== "bonus") {
      const zweiD = c.querySelector(".brett2d");
      if (brett3dZeigen(c, s, muster(s), opt) && zweiD) zweiD.remove();
    }
  },
};

// alte Staende (vor dem Ausbau) bekommen die neuen Felder
function sicher(s) {
  const je = (v) => s.pos.map(() => (typeof v === "function" ? v() : v));
  if (!Array.isArray(s.waren)) s.waren = je(() => []);
  if (!s.fallen || typeof s.fallen !== "object") s.fallen = {};
  if (!Array.isArray(s.rabatt)) s.rabatt = je(false);
  if (!s.stat) s.stat = { mini: je(0), gesammelt: je(0), ereignis: je(0) };
  if (!Array.isArray(s.stat.ko)) s.stat.ko = je(0);
  if (!Array.isArray(s.gezogen)) s.gezogen = [];
  if (!RUNDEN_WAHL.includes(s.runden)) s.runden = RUNDEN;
  if (s.brettNr !== 2) s.brettNr = 1;
  if (!Array.isArray(s.lp)) s.lp = je(LP);
  if (!Array.isArray(s.gift)) s.gift = je(0);
  if (!Array.isArray(s.fluch)) s.fluch = je(false);
  ["bomben", "sperren", "haufen"].forEach((k) => { if (!s[k] || typeof s[k] !== "object") s[k] = {}; });
}
function geben(s, j, d) {
  if (d > 0) { s.muenzen[j] += d; s.stat.gesammelt[j] += d; return d; }
  const weg = Math.min(s.muenzen[j], -d);
  s.muenzen[j] -= weg;
  return -weg;
}
function rangfolge(s) { return s.pos.map((_, j) => j).sort((a, b) => s.sterne[b] - s.sterne[a] || s.muenzen[b] - s.muenzen[a]); }
const sternPreis = (s, i) => (s.rabatt[i] || s.schluss === "rabatt" ? 5 : STERNPREIS);
// fuer die 3D-Ansicht (brett3d.js): was gerade passiert ist; mehr = { von } beim Muenzmagnet, { ziel } beim Tausch,
// { ziele: [{ j, wert, ko }] } bei Flaechenschaden, { feld } beim K.O., { inhalt } bei der Truhe
function effekt(s, art, j, wert = 0, mehr = null) { s.effekt = { nr: ((s.effekt && s.effekt.nr) || 0) + 1, art, j, wert, ...(mehr || {}) }; }
// Felder bis zum Stern (Breitensuche ueber die Wege)
function sternAbstand(s, von) {
  const nx = B(s).next, weit = new Map([[von, 0]]), q = [von];
  while (q.length) { const x = q.shift(); if (x === s.stern) return weit.get(x); nx[x].forEach((y) => { if (!weit.has(y)) { weit.set(y, weit.get(x) + 1); q.push(y); } }); }
  return 99;
}
// Abstand ohne Richtung (fuer den Boxhandschuh)
function feldAbstand(s, a, b) {
  const bb = B(s), weit = new Map([[a, 0]]), q = [a];
  while (q.length) { const x = q.shift(); if (x === b) return weit.get(x); [...bb.next[x], ...bb.prev[x]].forEach((y) => { if (!weit.has(y)) { weit.set(y, weit.get(x) + 1); q.push(y); } }); }
  return 99;
}
function nachbarn(s, f) { const bb = B(s); return [f, ...bb.next[f], ...bb.prev[f]]; }

// ---------------------------------------------------------------- Einstellungen vor dem ersten Wurf
function einstellungHTML(s) {
  return `<div class="brett-einst"><p class="leise klein">⚙️ Vor dem ersten Wurf kannst du noch wählen:</p>
    <div class="einst-zeile"><span>Runden</span>${RUNDEN_WAHL.map((r) => knopf(String(r), { typ: "einstellung", runden: r }, `klein2 ${s.runden === r ? "an" : "zweit"}`)).join("")}</div>
    <div class="einst-zeile">${Object.values(BRETTER).map((b) => knopf(`${b.emo} ${esc(b.name)}<small>${esc(b.text)}</small>`, { typ: "einstellung", brett: b.nr }, `brett-wahl ${s.brettNr === b.nr ? "an" : "zweit"}`)).join("")}</div></div>`;
}
function einstellen(s, a, namen) {
  if (RUNDEN_WAHL.includes(a.runden)) s.runden = a.runden;
  if ((a.brett === 1 || a.brett === 2) && a.brett !== s.brettNr) {
    s.brettNr = a.brett;
    s.pos = s.pos.map(() => 0); s.fallen = {}; s.bomben = {}; s.sperren = {}; s.haufen = {};
    s.stern = neuerStern(s); s.sternSeit = 1; s.spur = null;
  }
  s.meldung = `⚙️ ${s.runden} Runden auf der ${B(s).name} ${B(s).emo} – ${namen[s.dran]} würfelt.`;
}

// ---------------------------------------------------------------- Lebenspunkte, K.O.
// d Schaden an j; sammel = Liste fuer Flaechenschaden (dann ein gemeinsamer Effekt), sonst eigener Effekt -> Meldungstext
function schaden(s, j, d, namen, sammel = null) {
  if (d <= 0 || j < 0 || j >= s.pos.length) return "";
  if (schildFaengt(s, j, !!sammel)) { if (sammel) sammel.push({ j, wert: 0, schild: true }); return `🛡️ ${namen[j]}s Schild fängt den Treffer ab. `; }
  s.lp[j] -= d;
  if (s.lp[j] > 0) {
    if (sammel) sammel.push({ j, wert: -d }); else effekt(s, "schaden", j, -d);
    return `💔 ${namen[j]} −${d} ❤️ (${s.lp[j]} übrig). `;
  }
  return ko(s, j, namen, sammel, d);
}
function ko(s, j, namen, sammel, d) {
  const feld = s.pos[j], verlust = Math.min(15, Math.ceil(s.muenzen[j] / 2));
  s.muenzen[j] -= verlust;
  if (verlust) s.haufen[feld] = (s.haufen[feld] || 0) + verlust;
  s.pos[j] = 0; s.lp[j] = LP; s.gift[j] = 0; s.stat.ko[j]++;
  if (sammel) sammel.push({ j, wert: -d, ko: true, feld }); else effekt(s, "ko", j, -verlust, { feld });
  return `💫 ${namen[j]} ist K.O.! ${verlust ? `${verlust} Münzen bleiben auf dem Feld liegen – ` : ""}zurück zum Start mit vollen ❤️. `;
}
function heilen(s, j, d) { const vor = s.lp[j]; s.lp[j] = Math.min(LP, s.lp[j] + d); return s.lp[j] - vor; }

// ---------------------------------------------------------------- Zug
function wuerfeln(s, i, namen, raum) {
  let zahl = s.wuerfelArt === "dreifach" ? 3 : s.wuerfelArt === "doppel" ? 2 : 1;
  let seiten = s.wuerfelArt === "mini" ? 3 : 6;
  const verflucht = s.fluch[i];
  if (verflucht) { zahl = 1; seiten = 2; s.fluch[i] = false; }
  s.wuerfe = Array.from({ length: zahl }, () => 1 + zufall(seiten));
  s.wurf = s.wuerfe.reduce((a, b) => a + b, 0);
  s.rest = s.wurf; s.wahl = null; s.sternVorbei = false; s.unterwegs = { muenzen: 0, sperre: -1 };
  s.spur = { j: i, nr: ++s.spurNr, felder: [s.pos[i]] };
  s.meldung = `${verflucht ? "🐌 " : ""}${namen[i]} würfelt ${zahl > 1 ? `${s.wuerfe.join(" + ")} = ` : "eine "}${s.wurf}.`;
  s.wuerfelArt = null;
  if (laufen(s, i)) nachLauf(s, i, namen, raum);
}
// Schritt fuer Schritt; an einer Abzweigung anhalten (Phase "weg") -> false. Unterwegs: Muenzhaufen einsammeln,
// an fremden Absperrungen stehen bleiben.
function laufen(s, i) {
  const nxAlle = B(s).next;
  if (!s.unterwegs) s.unterwegs = { muenzen: 0, sperre: -1 };
  while (s.rest > 0) {
    const nx = nxAlle[s.pos[i]];
    if (nx.length > 1 && s.wahl === null) { s.phase = "weg"; return false; }
    const ziel = s.wahl !== null ? s.wahl : nx[0];
    s.wahl = null;
    s.pos[i] = ziel; s.rest--;
    if (s.spur) s.spur.felder.push(ziel);
    if (ziel === s.stern) s.sternVorbei = true;
    if (s.haufen[ziel]) { s.unterwegs.muenzen += s.haufen[ziel]; geben(s, i, s.haufen[ziel]); delete s.haufen[ziel]; }
    if (s.sperren[ziel] !== undefined && s.sperren[ziel] !== i) { s.unterwegs.sperre = s.sperren[ziel]; delete s.sperren[ziel]; s.rest = 0; }
  }
  return true;
}
function nachLauf(s, i, namen, raum) {
  const u = s.unterwegs || {};
  if (u.muenzen) { s.meldung += ` 🪙 Unterwegs ${u.muenzen} liegengebliebene Münzen eingesammelt!`; effekt(s, "muenzen", i, u.muenzen); }
  if (u.sperre >= 0) s.meldung += ` 🚧 Absperrung von ${namen[u.sperre]} – hier ist Schluss!`;
  s.unterwegs = null;
  const preis = sternPreis(s, i);
  if (s.sternVorbei && s.muenzen[i] >= preis) { s.phase = "stern"; s.meldung += " Am Stern vorbei – kaufen?"; return; }
  if (s.sternVorbei) s.meldung += ` Am Stern vorbei, aber zu wenig Münzen (${preis} nötig).`;
  feldWirkung(s, i, muster(s)[s.pos[i]], namen, raum);
}

// welche Gegenstaende jetzt einsetzbar sind (der Schild wirkt von selbst)
function nutzbareWaren(s, i) {
  if (s.wareBenutzt || s.phase !== "wuerfeln") return [];
  return [...new Set(s.waren[i])].filter((w) => {
    if (w === "schild") return false;
    if (w === "heil") return s.lp[i] < LP;
    if (ware(w).ziel) return zielListe(s, i, w).length > 0;
    return true;
  });
}
// moegliche Opfer eines Gegenstands
function zielListe(s, i, id) {
  const andere = s.pos.map((_, j) => j).filter((j) => j !== i);
  if (id === "faust") return andere.filter((j) => feldAbstand(s, s.pos[i], s.pos[j]) <= 4);
  if (id === "handschuh") return andere.filter((j) => s.waren[j].length);
  if (id === "gift") return andere.filter((j) => !s.gift[j]);
  if (id === "fluch") return andere.filter((j) => !s.fluch[j]);
  return andere;
}
function zumStern(s, i, art) {
  const vor = B(s).prev[s.stern][0];
  s.pos[i] = vor; s.spur = { j: i, nr: ++s.spurNr, felder: [vor], sprung: true };
  effekt(s, art, i);
}
function wareEinsetzen(s, i, id, namen) {
  const k = s.waren[i].indexOf(id);
  if (k < 0 || !nutzbareWaren(s, i).includes(id)) return;
  s.waren[i].splice(k, 1);
  s.wareBenutzt = true;
  const w = ware(id);
  if (id === "doppel" || id === "dreifach" || id === "mini") { s.wuerfelArt = id; s.meldung = `${namen[i]} nimmt den ${w.emo} ${w.name}.`; }
  else if (w.ziel) { s.zielWare = id; s.phase = "ziel"; s.meldung = `${namen[i]} holt ${w.emo} ${w.name} heraus …`; }
  else if (id === "falle") { s.fallen[s.pos[i]] = i; s.meldung = `🪤 ${namen[i]} stellt eine Falle auf.`; effekt(s, "falle", i); }
  else if (id === "rohr") { zumStern(s, i, "rohr"); s.meldung = `🌟 ${namen[i]} rauscht durchs Sternenrohr direkt vor den Stern!`; }
  else if (id === "heil") { const d = heilen(s, i, 15); s.meldung = `💖 ${namen[i]} trinkt den Heiltrank: +${d} ❤️.`; effekt(s, "heilen", i, d); }
  else if (id === "blitz") {
    const ziele = [], text = s.pos.map((_, j) => (j === i ? "" : schaden(s, j, 6, namen, ziele))).join("");
    s.meldung = `⚡ ${namen[i]} ruft die Gewitterwolke! ${text}`; effekt(s, "flaeche", i, 0, { ziele, quelle: "blitz" });
  } else if (id === "bombe") { s.bomben[s.pos[i]] = i; s.meldung = `💣 ${namen[i]} legt eine Zeitbombe ab – sie knallt zu Beginn der nächsten Runde!`; effekt(s, "bombe", i); }
  else if (id === "sperre") { s.sperren[s.pos[i]] = i; s.meldung = `🚧 ${namen[i]} stellt eine Absperrung auf.`; effekt(s, "sperre", i); }
  else if (id === "rakete") {
    const bb = B(s), felder = [s.pos[i]], ziele = [];
    let x = s.pos[i], muenzen = 0, text = "";
    for (let k = 0; k < 8; k++) {
      x = bb.next[x][0]; felder.push(x);
      if (s.haufen[x]) { muenzen += s.haufen[x]; geben(s, i, s.haufen[x]); delete s.haufen[x]; }
      s.pos.forEach((p, j) => { if (j !== i && p === x && !ziele.some((z) => z.j === j)) text += schaden(s, j, 6, namen, ziele); });
    }
    s.pos[i] = x; s.spur = { j: i, nr: ++s.spurNr, felder, sprung: true };
    s.meldung = `🚀 ${namen[i]} zündet die Rakete und fliegt 8 Felder weit! ${text}${muenzen ? `🪙 ${muenzen} Münzen im Flug geschnappt. ` : ""}`;
    effekt(s, "rakete", i, 0, { ziele });
  } else if (id === "wunder") s.meldung = `🎁 ${namen[i]} öffnet die Wundertüte: ${wundertuete(s, i, namen)}`;
}
function wundertuete(s, i, namen) {
  const x = zufall(6);
  if (x === 0) { geben(s, i, 10); effekt(s, "muenzen", i, 10); return "10 Münzen!"; }
  if (x === 1) { s.extra = true; effekt(s, "wunder", i); return "Nach diesem Zug darfst du noch einmal würfeln!"; }
  if (x === 2) {
    const rein = [];
    [LADEN[zufall(LADEN.length)], LADEN[zufall(LADEN.length)]].forEach((w) => { if (s.waren[i].length < BEUTEL) { s.waren[i].push(w); rein.push(w); } });
    effekt(s, "wunder", i);
    return rein.length ? `${rein.map((w) => `${ware(w).emo} ${ware(w).name}`).join(" und ")}!` : "zwei Gegenstände – aber der Beutel ist voll.";
  }
  if (x === 3) { zumStern(s, i, "rohr"); return "ein Wirbel trägt dich direkt vor den Stern!"; }
  if (x === 4) return `ein Knallfrosch! ${schaden(s, i, 5, namen)}`;
  const d = heilen(s, i, 15); geben(s, i, 3); effekt(s, "heilen", i, d); return `+${d} ❤️ und 3 Münzen.`;
}
function zielWirkung(s, i, j, namen) {
  const id = s.zielWare; s.zielWare = null; s.phase = "wuerfeln";
  const w = ware(id);
  if (schildFaengt(s, j)) { s.meldung = `${w.emo} 🛡️ ${namen[j]} hält den Schild hoch – nichts passiert.`; return; }
  if (id === "tausch") { [s.pos[i], s.pos[j]] = [s.pos[j], s.pos[i]]; s.spur = { j: i, nr: ++s.spurNr, felder: [s.pos[i]], sprung: true }; s.meldung = `🔄 ${namen[i]} und ${namen[j]} tauschen die Plätze!`; effekt(s, "tausch", i, 0, { ziel: j }); }
  else if (id === "dieb") { const d = -geben(s, j, -5); geben(s, i, d); s.meldung = `🧲 ${namen[i]} zieht ${d} Münzen von ${namen[j]} ab!`; effekt(s, "muenzen", i, d, { von: j }); }
  else if (id === "faust") { s.meldung = `🥊 ${namen[i]} boxt ${namen[j]}! ${schaden(s, j, 15, namen)}`; if (s.effekt && s.effekt.j === j) s.effekt.quelle = { art: "faust", von: i }; }
  else if (id === "bogen") { s.meldung = `🏹 ${namen[i]} schießt auf ${namen[j]}! ${schaden(s, j, 8, namen)}`; if (s.effekt && s.effekt.j === j) s.effekt.quelle = { art: "bogen", von: i }; }
  else if (id === "gift") { s.gift[j] = 3; s.meldung = `🧪 ${namen[j]} ist vergiftet – 3 Runden lang je 4 ❤️ weniger.`; effekt(s, "gift", j); }
  else if (id === "fluch") { s.fluch[j] = true; s.meldung = `🐌 ${namen[j]} ist verflucht – der nächste Wurf zeigt nur 1 oder 2.`; effekt(s, "fluch", j); }
  else if (id === "handschuh") {
    const k = zufall(s.waren[j].length), g = s.waren[j].splice(k, 1)[0];
    if (s.waren[i].length < BEUTEL) s.waren[i].push(g);
    s.meldung = `🧤 ${namen[i]} klaut ${namen[j]} ${ware(g).emo} ${ware(g).name}${s.waren[i].includes(g) ? "" : " – kein Platz im Beutel, er fällt weg"}!`;
    effekt(s, "handschuh", i, 0, { von: j });
  }
}
// leise = kein eigener Effekt (Flaechenschaden zeigt den Schild selbst)
function schildFaengt(s, j, leise = false) {
  const k = s.waren[j].indexOf("schild");
  if (k < 0) return false;
  s.waren[j].splice(k, 1);
  if (!leise) effekt(s, "schild", j);
  return true;
}
// Truhe: Gegenstand, Muenzen, Heilung - oder eine bissige Truhe
function truhe(s, i, namen) {
  const x = Math.random();
  if (x < 0.45 && s.waren[i].length < BEUTEL) { const w = LADEN[zufall(LADEN.length)]; s.waren[i].push(w); effekt(s, "truhe", i, 0, { inhalt: ware(w).emo }); return `Drin: ${ware(w).emo} ${ware(w).name}!`; }
  if (x < 0.8) { const d = 4 + zufall(9); geben(s, i, d); effekt(s, "truhe", i, d, { inhalt: "🪙" }); return `${d} Münzen!`; }
  if (x < 0.88) { const d = heilen(s, i, 12); effekt(s, "truhe", i, 0, { inhalt: "💖" }); return `ein Heiltrank – +${d} ❤️.`; }
  const t = schaden(s, i, 8, namen);
  if (s.effekt && s.effekt.j === i) s.effekt.quelle = { art: "truhe" };
  return `Die Truhe beißt zu! ${t}`;
}

function feldWirkung(s, i, feld, namen, raum) {
  const pre = s.meldung + " ";
  let falle = "";
  const f = s.fallen[s.pos[i]];
  if (f !== undefined && f !== i && f < s.pos.length) {
    delete s.fallen[s.pos[i]];
    if (schildFaengt(s, i)) falle = `🪤 Falle von ${namen[f]} – aber der Schild hält! `;
    else { const d = -geben(s, i, -5); geben(s, f, d); falle = `🪤 In die Falle von ${namen[f]} getappt: ${d} Münzen an ${namen[f]}! `; effekt(s, "muenzen", i, -d); }
  }
  const mal = s.schluss === "doppelt" ? 2 : 1;
  s.phase = "weiter";
  if (feld === "m") { geben(s, i, 3 * mal); s.meldung = pre + falle + `+${3 * mal} Münzen.`; effekt(s, "muenzen", i, 3 * mal); }
  else if (feld === "v") { geben(s, i, -3 * mal); s.meldung = pre + falle + `−${3 * mal} Münzen.`; effekt(s, "muenzen", i, -3 * mal); }
  else if (feld === "t") s.meldung = pre + falle + `🍺 Trinkfeld: ${namen[i]} trinkt ${schlucke(1 + zufall(3))}.`;
  // Aufgabenfeld (ohne Trinken): kleine Aufgabe; wer nicht will, gibt Muenzen ab
  else if (feld === "a") { s.meldung = pre + falle + `🎯 Aufgabenfeld: ${namen[i]} – ${ziehe(T.AUFGABEN)}`; s.phase = "aufgabe"; }
  else if (feld === "e") { s.stat.ereignis[i]++; s.meldung = pre + falle + "❓ " + ereignis(s, i, namen, raum); effekt(s, "ereignis", i); }
  else if (feld === "d") { s.meldung = pre + falle + "⚔️ Duellfeld!"; s.phase = "duell"; }
  else if (feld === "l") { s.meldung = pre + falle + "🛒 Laden!"; s.phase = "laden"; s.angebot = mischen([...LADEN]).slice(0, ANGEBOT); }
  else if (feld === "s") s.meldung = pre + falle + `🌵 Stachelfeld! ${schaden(s, i, 10, namen)}`;
  else if (feld === "h") { const d = heilen(s, i, 8); s.meldung = pre + falle + `💖 Heilquelle: +${d} ❤️.`; effekt(s, "heilen", i, d); }
  else if (feld === "k") s.meldung = pre + falle + `🧰 Truhe! ${truhe(s, i, namen)}`;
  else if (feld === "g") { geben(s, i, 5); s.meldung = pre + falle + `🔥 Glutfeld: +5 heiße Münzen, aber ${schaden(s, i, 5, namen)}`; }
  else if (feld === "p") {
    const ziel = B(s).portale[s.pos[i]];
    if (ziel !== undefined) { s.pos[i] = ziel; s.meldung = pre + falle + `🌀 Portal! ${namen[i]} wird auf die andere Seite der Insel gezogen.`; effekt(s, "portal", i); }
    else s.meldung = pre + falle;
  } else s.meldung = pre + falle;
}

// ---------------------------------------------------------------- Ereignisfeld
function ereignis(s, i, namen, raum) {
  let pool = BE.ziehbar(raum && raum.brettWeg, s.ohne);
  const t = testVorgabe();
  if (t && Array.isArray(t.ereignisse)) pool = pool.filter((x) => t.ereignisse.includes(x.id));
  if (!pool.length) { geben(s, i, 2); return "Ruhiges Feld: +2 Münzen."; }
  let frei = pool.filter((x) => !s.gezogen.includes(x.id));
  if (!frei.length) { s.gezogen = []; frei = pool; }
  const ev = frei[zufall(frei.length)];
  s.gezogen.push(ev.id);
  if (ev.boese && schildFaengt(s, i)) return `${ev.text} 🛡️ Der Schild fängt es ab!`;
  let extra;
  try { extra = ev.f(s, i, helfer(s, namen)); } catch (e) { console.error(e); }
  return extra ? `${ev.text} ${extra}` : ev.text;
}
function helfer(s, namen) {
  const n = s.pos.length, alle = [...Array(n).keys()], bb = B(s);
  const rang = () => rangfolge(s);
  const schritt = (j, k, rueck) => { for (let x = 0; x < k; x++) s.pos[j] = rueck ? bb.prev[s.pos[j]][0] : bb.next[s.pos[j]][0]; };
  return {
    n, nm: namen, rnd: (k) => zufall(k),
    muenzen: (j, d) => geben(s, j, d),
    sterne: (j, d) => { s.sterne[j] = Math.max(0, s.sterne[j] + d); if (d > 0) effekt(s, "stern", j); },
    vor: (j, k) => schritt(j, k, false), zurueck: (j, k) => schritt(j, k, true),
    tausch: (j, k) => { [s.pos[j], s.pos[k]] = [s.pos[k], s.pos[j]]; },
    gib: (j, id) => { if (s.waren[j].length < BEUTEL) s.waren[j].push(id); },
    zufallWare: () => LADEN[zufall(LADEN.length)], wareName: (id) => `${ware(id).emo} ${ware(id).name}`,
    stern: () => { s.stern = neuerStern(s); s.sternSeit = s.runde; },
    sternVor: (k) => { for (let x = 0; x < k; x++) s.stern = bb.next[s.stern][0]; },
    zuStern: (j) => { s.pos[j] = bb.prev[s.stern][0]; },
    irgendwo: (j) => { s.pos[j] = zufall(bb.felder); },
    nachStart: (j) => { s.pos[j] = 0; },
    extraWurf: () => { s.extra = true; },
    erster: () => rang()[0], letzter: () => rang()[n - 1],
    vorMir: (i) => { const r = rang(), p = r.indexOf(i); return p > 0 ? r[p - 1] : -1; },
    hinterMir: (i) => { const r = rang(), p = r.indexOf(i); return p < n - 1 ? r[p + 1] : -1; },
    hinterAllen: (i) => { const r = rang(); return r.slice(r.indexOf(i) + 1); },
    reichster: (aus) => { const k = alle.filter((j) => j !== aus).sort((a, b) => s.muenzen[b] - s.muenzen[a]); return k.length && (aus < 0 || s.muenzen[k[0]] > 0) ? k[0] : -1; },
    aermster: (i) => { const k = alle.filter((j) => j !== i && s.muenzen[j] < s.muenzen[i]).sort((a, b) => s.muenzen[a] - s.muenzen[b]); return k.length ? k[0] : -1; },
    anderer: (i) => { const k = alle.filter((j) => j !== i); return k.length ? k[zufall(k.length)] : -1; },
    geschuetzt: (j) => schildFaengt(s, j),
    // Teil 4b: Lebenspunkte
    schaden: (j, d) => schaden(s, j, d, namen).trim(),
    heilen: (j, d) => { const x = heilen(s, j, d); if (x) effekt(s, "heilen", j, x); return x; },
    lp: (j) => s.lp[j],
  };
}

// ---------------------------------------------------------------- Rundenende, Schlussrunden, Bonussterne
const SCHLUSS = {
  doppelt: { text: "Münzfelder zählen doppelt!" },
  rabatt: { text: "Sterne kosten nur 5 Münzen!" },
  minis: { text: "Minispiele bringen doppelte Münzen!" },
};
function zugEnde(s, namen, raum) {
  const n = s.pos.length;
  s.wurf = null; s.wuerfe = null; s.wareBenutzt = false; s.wuerfelArt = null;
  if (s.extra) { s.extra = false; s.phase = "wuerfeln"; s.meldung = `🎲 ${namen[s.dran]} darf noch einmal würfeln!`; return; }
  s.dran = (s.dran + 1) % n;
  if (s.dran === 0) miniStart(s, raum);
  else s.phase = "wuerfeln";
}
function rundeBeginnt(s, namen) {
  const teile = [`Runde ${s.runde}`];
  const n = s.pos.length, bb = B(s), ziele = [];
  let quelle = null;
  // Aufholhilfe: wer hinten liegt, bekommt jede Runde etwas Rueckenwind
  if (n > 1) { const l = rangfolge(s)[n - 1]; geben(s, l, 3); teile.push(`🤝 Aufholhilfe: ${namen[l]} bekommt 3 Münzen`); }
  // Gift wirkt
  s.gift.forEach((g, j) => { if (g > 0) { s.gift[j]--; teile.push(`🧪 ${schaden(s, j, 4, namen, ziele).trim()}`); quelle = quelle || "gift"; } });
  // Zeitbomben knallen: 12 Schaden auf dem Feld und den Nachbarfeldern
  Object.keys(s.bomben).forEach((f) => {
    const feld = Number(f), von = s.bomben[f], zone = nachbarn(s, feld);
    delete s.bomben[f];
    const opfer = s.pos.map((p, j) => (zone.includes(p) ? j : -1)).filter((j) => j >= 0);
    teile.push(`💣 BUMM! Die Bombe von ${namen[von] || "jemandem"} explodiert${opfer.length ? `: ${opfer.map((j) => schaden(s, j, 12, namen, ziele).trim()).join(" ")}` : " – niemand in der Nähe"}`);
    quelle = "bombe";
  });
  // Vulkaninsel: Ausbruch zu Beginn jeder dritten Runde - wer auf oder neben einem Glutfeld steht, bekommt 10 Schaden
  if (bb.welt === "vulkan" && s.runde % VULKAN_ALLE === 0) {
    const zone = new Set();
    [...bb.muster].forEach((f, k) => { if (f === "g") nachbarn(s, k).forEach((x) => zone.add(x)); });
    const opfer = s.pos.map((p, j) => (zone.has(p) ? j : -1)).filter((j) => j >= 0);
    teile.push(`🌋 Der Vulkan bricht aus!${opfer.length ? ` ${opfer.map((j) => schaden(s, j, 10, namen, ziele).trim()).join(" ")}` : " Zum Glück steht niemand in der Glut."}`);
    quelle = "ausbruch";
  } else if (bb.welt === "vulkan" && s.runde % VULKAN_ALLE === VULKAN_ALLE - 1) teile.push("🌋 Der Vulkan grollt – nächste Runde bricht er aus!");
  if (quelle) effekt(s, "flaeche", s.dran, 0, { ziele, quelle });
  // wandernder Stern: drei Runden nicht gekauft -> er sucht sich einen neuen Platz
  if (s.runde - s.sternSeit >= 3) { s.stern = neuerStern(s); s.sternSeit = s.runde; teile.push("⭐ Der Stern ist weitergewandert"); }
  // Schlussrunden: die letzten drei Runden mit einer Besonderheit und einem Schub fuer den Letzten
  if (s.runde === s.runden - 2 && !s.schluss) {
    s.schluss = Object.keys(SCHLUSS)[zufall(3)];
    const l = rangfolge(s)[n - 1];
    if (n > 1) geben(s, l, 10);
    teile.push(`🔥 Die letzten 3 Runden! ${SCHLUSS[s.schluss].text}${n > 1 ? ` ${namen[l]} bekommt 10 Münzen Schub` : ""}`);
  }
  s.meldung = `${teile.join(" · ")} – ${namen[0]} würfelt.`;
}
function bonusVergeben(s) {
  const kat = [["mini", "🎮", "Minispiel-Ass", "Minispiel-Siege"], ["gesammelt", "🪙", "Münzsammler", "Münzen eingesammelt"], ["ereignis", "❓", "Ereignis-Jäger", "Ereignisfelder"]];
  s.bonus = kat.map(([k, emo, titel, was]) => {
    const w = s.stat[k], max = Math.max(...w);
    const wer = max > 0 ? w.map((x, j) => (x === max ? j : -1)).filter((j) => j >= 0) : [];
    wer.forEach((j) => { s.sterne[j]++; });
    return { emo, titel, was, wert: max, wer };
  });
}
function bonusListe(s, namen) {
  if (!s.bonus) return "";
  return `<div class="bonusliste">${s.bonus.map((b) => `<div class="bonus"><span class="emo">${b.emo}</span><span><b>${esc(b.titel)}</b><small>${b.wer.length ? `${b.wer.map((j) => esc(namen[j])).join(" & ")} · ${b.wert} ${esc(b.was)} · +1 ⭐` : "keiner"}</small></span></div>`).join("")}</div>`;
}
const angebot = (s) => (Array.isArray(s.angebot) && s.angebot.length ? s.angebot.filter((id) => ware(id)) : LADEN.slice(0, ANGEBOT));

// ---------------------------------------------------------------- Minispiel nach jeder Runde
// gestrichene Minispiele stehen als "m:<Kennung>" in raum.brettWeg (brett_ereignisse.js, gleiche Liste wie die Ereignisse)
export function miniPool(raum) {
  const weg = new Set((raum && Array.isArray(raum.brettWeg) && raum.brettWeg) || []);
  const pool = MINI_IDS.filter((id) => !weg.has(`m:${id}`));
  return pool.length ? pool : MINI_IDS;
}
function naechstesMini(s, raum) {
  const t = testVorgabe();
  if (t && Array.isArray(t.minis) && t.minis.length) return t.minis[s.miniNr % t.minis.length];
  const pool = miniPool(raum);
  if (raum) return MINI_IDS[STAPEL.eins(raum, "brettminis", MINI_IDS.length, Math.random, (k) => pool.includes(MINI_IDS[k]))];
  return pool[zufall(pool.length)];
}
function modusWahl(n, s) {
  const t = testVorgabe();
  if (t && Array.isArray(t.modi) && t.modi.length) { const m = t.modi[s.miniNr % t.modi.length]; if (m === "alle" || n >= (m === "team" ? 4 : m === "eins" ? 3 : 2)) return m; return "alle"; }
  const x = Math.random();
  if (n <= 2) return "alle";
  if (n === 3) return x < 0.6 ? "alle" : x < 0.85 ? "eins" : "duell";
  return x < 0.4 ? "alle" : x < 0.65 ? "team" : x < 0.85 ? "eins" : "duell";
}
function miniStart(s, raum) {
  const n = s.pos.length;
  const art = naechstesMini(s, raum);
  const modus = modusWahl(n, s);
  s.miniNr++;
  const reihe = mischen([...Array(n).keys()]);
  let teams = null, teil = [...Array(n).keys()];
  if (modus === "team") { const h = Math.ceil(n / 2); teams = [reihe.slice(0, h).sort(), reihe.slice(h).sort()]; }
  else if (modus === "eins") teams = [[reihe[0]], reihe.slice(1).sort()];
  else if (modus === "duell") teil = reihe.slice(0, 2).sort();
  s.mini = { art, runde: s.runde, werte: {}, warte: 1500 + zufall(3500), frage: zufall(T.SCHAETZ.length), zahl: String(10000000 + zufall(89999999)),
    d: R.daten(art), modus, teams, teil, t0: Date.now() };
  s.phase = "mini";
  s.meldung = "";
}
const teilVon = (s, m) => (Array.isArray(m.teil) ? m.teil : s.pos.map((_, j) => j));
const ABBRUCH_AB = 25000;   // ab dann darf jeder "Nicht mehr warten" druecken (Handy gesperrt, Spieler weg)

function miniAktion(s, i, a, namen, raum) {
  const m = s.mini;
  const teil = teilVon(s, m);
  if (a.typ === "mini" && teil.includes(i) && m.werte[i] === undefined && !m.fertig && (!a.mk || a.mk === `${m.runde}-${m.art}`)) {
    m.werte[i] = a.wert === null || a.wert === undefined || isNaN(Number(a.wert)) ? null : Number(a.wert);
    if (teil.every((j) => m.werte[j] !== undefined)) auswerten(s, m, namen);
  } else if (a.typ === "miniabbruch" && !m.fertig && Date.now() - (m.t0 || 0) >= ABBRUCH_AB) {
    teil.forEach((j) => { if (m.werte[j] === undefined) m.werte[j] = null; });
    auswerten(s, m, namen);
  } else if (a.typ === "miniweiter" && m.fertig) {
    s.mini = null;
    s.runde++;
    if (s.runde > s.runden) { bonusVergeben(s); s.phase = "bonus"; s.meldung = ""; return; }
    s.phase = "wuerfeln";
    rundeBeginnt(s, namen);
  }
}
// Vergleichswert je Spieler: hoeher = besser
function wertVon(s, m, j, teil) {
  if (R.istNeu(m.art)) return R.punkte(m.art, m.werte, j, teil, m);
  const w = m.werte[j];
  if (w === null || w === undefined) return -1e9;
  if (m.art === "reaktion") return w < 0 ? -1e8 : -w;
  if (m.art === "schaetzen") return -Math.abs(w - T.SCHAETZ[m.frage][1]);
  return w;
}
function auswerten(s, m, namen) {
  const teil = teilVon(s, m);
  const w = Object.fromEntries(teil.map((j) => [j, wertVon(s, m, j, teil)]));
  const rang = [...teil].sort((x, y) => w[y] - w[x]);
  // Platz mit Gleichstand: gleiche Werte teilen sich den besten Platz; mittlerer Platz fuer die Teams
  const platz = {}, mittel = {};
  rang.forEach((j, p) => {
    const gleich = rang.filter((k) => w[k] === w[j]);
    platz[j] = rang.indexOf(gleich[0]);
    mittel[j] = gleich.reduce((a, k) => a + rang.indexOf(k), 0) / gleich.length;
  });
  const mal = s.schluss === "minis" ? 2 : 1;
  const preise = {};
  let sieger = [], verlierer = [], kopf = "";
  if (m.modus === "team" || m.modus === "eins") {
    const [ta, tb] = m.teams;
    const schnitt = (t) => t.reduce((a, j) => a + mittel[j], 0) / t.length;
    // Einer gegen alle: der Einzelne gewinnt, wenn er besser als die Haelfte der anderen ist
    let gewinner;
    if (m.modus === "eins") gewinner = mittel[ta[0]] <= Math.floor((teil.length - 1) / 2) ? 0 : 1;
    else gewinner = schnitt(ta) < schnitt(tb) ? 0 : schnitt(tb) < schnitt(ta) ? 1 : -1;
    if (gewinner < 0) { teil.forEach((j) => { preise[j] = 2 * mal; }); kopf = "Unentschieden – alle bekommen 2 Münzen"; }
    else {
      const gw = m.teams[gewinner], vl = m.teams[1 - gewinner];
      const je = m.modus === "eins" ? (gewinner === 0 ? 10 : 4) : 6;
      gw.forEach((j) => { preise[j] = je * mal; });
      sieger = gw; verlierer = vl;
      kopf = `${m.modus === "eins" && gewinner === 0 ? "Der Einzelkämpfer" : "Team"} ${gw.map((j) => namen[j]).join(" & ")} gewinnt`;
    }
  } else if (m.modus === "duell") {
    const [x, y] = rang;
    if (w[x] === w[y]) { preise[x] = preise[y] = 3 * mal; kopf = "Unentschieden – beide bekommen 3 Münzen"; }
    else { preise[x] = 8 * mal; sieger = [x]; verlierer = [y]; kopf = `${namen[x]} gewinnt das Duell`; }
  } else {
    const tabelle = [8, 4, 2, 0];
    rang.forEach((j) => { preise[j] = (tabelle[platz[j]] || 0) * mal; });
    sieger = rang.filter((j) => platz[j] === 0);
    const letzt = platz[rang[rang.length - 1]];
    verlierer = rang.length > 1 && letzt > 0 ? rang.filter((j) => platz[j] === letzt) : [];
  }
  Object.entries(preise).forEach(([j, d]) => { if (d) geben(s, Number(j), d); });
  sieger.forEach((j) => { s.stat.mini[j]++; });
  Object.assign(m, { fertig: true, rang, preise, sieger, verlierer, kopf });
}

function modusZeile(m, namen) {
  const nm = (l) => l.map((j) => esc(namen[j])).join(" & ");
  if (m.modus === "team") return `🤝 ${m.teams[0].length} gegen ${m.teams[1].length}: <b>${nm(m.teams[0])}</b> gegen <b>${nm(m.teams[1])}</b>`;
  if (m.modus === "eins") return `🦸 1 gegen ${m.teams[1].length}: <b>${nm(m.teams[0])}</b> gegen alle anderen`;
  if (m.modus === "duell") return `⚔️ Duell: <b>${nm(m.teil)}</b> – die anderen schauen zu`;
  return "👥 Alle gegen alle";
}
function miniRender(s, ich, namen) {
  const m = s.mini;
  const info = miniInfo(m.art);
  const teil = teilVon(s, m);
  const modus = `<div class="mini-modus">${modusZeile(m, namen)}</div>`;
  if (m.fertig) {
    const fmt = (j) => (m.werte[j] === null || m.werte[j] === undefined ? "nicht mitgemacht" : R.istNeu(m.art) ? esc(R.einheit(m.art, m.werte[j], m, j))
      : m.art === "farbwort" ? `${m.werte[j]} richtig` : m.art === "gedaechtnis" ? `${m.werte[j]} Ziffern` : m.art === "tappen" ? `${m.werte[j]} Taps`
      : m.art === "reaktion" ? (m.werte[j] < 0 ? "zu früh" : `${m.werte[j]} ms`) : m.werte[j]);
    const verl = m.verlierer || [];
    return `<div class="frage">${info.emo} ${esc(info.titel)} – Ergebnis${m.art === "schaetzen" ? `<br><small>${esc(T.SCHAETZ[m.frage][0])} → <b>${T.SCHAETZ[m.frage][1]}</b></small>` : ""}</div>${modus}
      ${m.kopf ? `<div class="mini-kopf">🏅 ${esc(m.kopf)}</div>` : ""}
      <div id="brett3d" class="brett3d sieger"></div>
      <ol class="rangliste">${m.rang.map((j) => `<li>${name(namen, j)}: ${fmt(j)} → +${(m.preise || {})[j] || 0} 🪙</li>`).join("")}</ol>
      ${verl.length ? `<div class="urteil">${verl.map((j) => name(namen, j)).join(" & ")} ${verl.length > 1 ? "trinken" : "trinkt"} ${schlucke(m.modus === "alle" || m.modus === "duell" ? 2 : 1)}</div>` : ""}
      ${knopf("Weiter zur nächsten Runde", { typ: "miniweiter" }, "gross")}`;
  }
  const zaehler = `${teil.filter((j) => m.werte[j] !== undefined).length}/${teil.length} fertig`;
  const abbruch = `<div class="mini-abbruch" hidden data-mini-abbruch="${m.runde}-${m.art}"><p class="leise klein mitte">Jemand hängt fest? Nach einer Weile geht es auch ohne ihn weiter.</p>${knopf("⏭️ Nicht mehr warten", { typ: "miniabbruch" }, "zweit")}</div>`;
  // Titelkarte (brett3d-Umbau 31.10.2026 abends): grosses Symbol, Name, Spielart - fliegt beim ersten Anblick herein
  const kopf = `<div class="frage mini-titelkarte"><span class="mtk-emo" aria-hidden="true">${info.emo}</span><span class="mtk-text"><small class="mtk-vor">Minispiel</small><b>${esc(info.titel)}</b><small class="mini-typ">${esc(info.typ)}</small></span></div>${modus}`;
  let inhalt = "";
  // ich < 0: dieses Geraet spielt nur mit Controllern mit (app.js zeigt deren Felder darunter, controller.js)
  if (ich < 0) inhalt = `<p class="mitte leise">${esc(info.regel)}</p>${m.art === "schaetzen" ? `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div>` : ""}<p class="mitte">${zaehler}</p>`;
  else if (!teil.includes(ich)) inhalt = `<p class="mitte leise">${esc(info.regel)}</p><div class="hinweisbox warten">👀 Du schaust diesmal zu – ${zaehler}</div>`;
  else if (m.werte[ich] !== undefined) inhalt = `<p class="mitte">Erledigt – warte auf die anderen (${zaehler})</p>`;
  else if (R.istNeu(m.art)) inhalt = R.html(m, `h${ich}`, null, ich);
  else inhalt = `<p class="mitte leise">${esc(info.regel)}</p>${altInhalt(s, m, ich)}`;
  return `${kopf}${inhalt}${abbruch}`;
}
function altInhalt(s, m, ich) {
  if (m.art === "schaetzen") return `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div><input id="minitipp" data-rk="${m.runde}" type="number" inputmode="decimal" placeholder="Schätzung">${knopf("Abgeben", { typ: "mini" }, "gross", `data-feld="minitipp"`)}`;
  if (m.art === "farbwort") return `<div id="farbwort" class="farbwort">Tippe zum Starten</div><div class="raster farbknoepfe">${FW.map(([n, c]) => `<button class="gross" style="background:${c};box-shadow:0 5px 0 #0008" data-fw="${n}">${n}</button>`).join("")}</div>`;
  if (m.art === "gedaechtnis") {
    // ist die Zahl schon verdeckt, gleich mit Feld zeichnen - sonst verschwindet das Feld beim Neuzeichnen kurz (Fokus weg)
    const zu = gedLokal.schluessel === `ged-${m.runde}` && gedLokal.versteckt;
    return `<div id="gedzahl" class="reaktion fertig" style="font-size:44px;letter-spacing:6px">${zu ? "? ? ? ?" : m.zahl}</div><input id="gedtipp" data-rk="${m.runde}" inputmode="numeric" placeholder="Zahl eintippen" style="display:${zu ? "block" : "none"}"><button id="gedknopf" class="gross" style="display:${zu ? "block" : "none"}">Abgeben</button>`;
  }
  return `<div id="minifeld" class="reaktion rot">${m.art === "tappen" ? "Tippen zum Starten!" : "Warte …"}</div>`;
}

// "Nicht mehr warten" erst nach einer Weile zeigen (eigene Uhr ab dem ersten Anblick des Minispiels)
const abbruchSeit = {};
function abbruchZeigen(m) {
  const k = `${m.runde}-${m.art}`;
  if (!abbruchSeit[k]) abbruchSeit[k] = performance.now();
  const zeig = () => { const el = document.querySelector(`[data-mini-abbruch="${k}"]`); if (el) el.hidden = false; };
  const rest = abbruchSeit[k] + ABBRUCH_AB + 3000 - performance.now();
  if (rest <= 0) zeig(); else setTimeout(zeig, rest);
}

let miniLokal = { schluessel: null };
const FW = [["Rot", "#e11d48"], ["Blau", "#2563eb"], ["Grün", "#16a34a"], ["Gelb", "#ca8a04"]];
// Titelkarte des Minispiels: beim ersten Anblick einmal hereinfliegen lassen (spaetere Neuzeichnungen stehen still)
const titelGesehen = new Set();
function miniTitelkarte(m) {
  const el = document.querySelector(".mini-titelkarte");
  const k = `${m.runde}-${m.art}-${m.t0 || 0}`;
  if (!el || titelGesehen.has(k)) return;
  titelGesehen.add(k);
  el.classList.add("ankunft");
}
// nach dem Minispiel: wer oben aufs Treppchen kommt
function miniSieger(s, m) {
  const teil = teilVon(s, m), sieger = m.sieger || [], verl = m.verlierer || [];
  let plaetze;
  if (m.modus === "team" || m.modus === "eins" || sieger.length > 1) plaetze = teil.map((j) => [j, sieger.includes(j) ? 1 : 0]);
  else plaetze = (m.rang || teil).map((j, r) => [j, r < 3 ? r + 1 : 0]);
  return { plaetze, jubel: sieger, trauer: verl };
}
function endSieger(s) {
  const rang = rangfolge(s);
  return { plaetze: rang.map((j, r) => [j, r < 3 ? r + 1 : 0]), jubel: [rang[0]], trauer: rang.length > 1 ? [rang[rang.length - 1]] : [] };
}
function miniNach(s, ich, senden) {
  const m = s.mini;
  if (!m || m.fertig) return;
  miniTitelkarte(m);
  abbruchZeigen(m);
  if (ich < 0 || m.werte[ich] !== undefined || !teilVon(s, m).includes(ich)) return;
  if (R.istNeu(m.art)) return R.anmelden(m, `h${ich}`, (wert, mk) => senden({ typ: "mini", wert, mk }), null, ich);
  if (m.art === "schaetzen") return;
  if (m.art === "farbwort") return farbwortNach(m, senden);
  if (m.art === "gedaechtnis") return gedaechtnisNach(m, senden);
  const fl = document.getElementById("minifeld");
  if (!fl) return;
  const schluessel = `${m.runde}-${m.art}`;
  if (miniLokal.schluessel !== schluessel) {
    clearTimeout(miniLokal.timer);
    miniLokal = { schluessel, zaehl: 0, start: 0, gruen: 0, gesendet: false };
    if (m.art === "reaktion") miniLokal.timer = setTimeout(() => {
      miniLokal.gruen = performance.now();
      const f = document.getElementById("minifeld"); if (f) { f.className = "reaktion gruen"; f.textContent = "JETZT!"; }
    }, m.warte);
  }
  if (m.art === "reaktion") {
    if (miniLokal.gruen) { fl.className = "reaktion gruen"; fl.textContent = "JETZT!"; }
    fl.onpointerdown = () => {
      if (miniLokal.gesendet) return; miniLokal.gesendet = true; clearTimeout(miniLokal.timer);
      senden({ typ: "mini", wert: miniLokal.gruen ? Math.round(performance.now() - miniLokal.gruen) : -1 });
    };
  } else {
    if (miniLokal.start) { fl.className = "reaktion gruen"; fl.textContent = `${miniLokal.zaehl} Taps`; }
    fl.onpointerdown = () => {
      if (miniLokal.gesendet) return;
      if (!miniLokal.start) {
        miniLokal.start = performance.now();
        miniLokal.timer = setTimeout(() => { miniLokal.gesendet = true; senden({ typ: "mini", wert: miniLokal.zaehl }); }, 5000);
        fl.className = "reaktion gruen";
      }
      miniLokal.zaehl++;
      fl.textContent = `${miniLokal.zaehl} Taps`;
    };
  }
}

// flache Ersatzansicht, falls 3D am Geraet nicht geht (wird sonst sofort durch die 3D-Ansicht ersetzt)
function brett2d(s, namen) {
  const bb = B(s), L = bb.lage;
  const xs = L.map((p) => p.x), zs = L.map((p) => p.z);
  const x0 = Math.min(...xs) - 1.4, z0 = Math.min(...zs) - 1.4, w = Math.max(...xs) + 1.4 - x0, h = Math.max(...zs) + 1.4 - z0;
  const mu = muster(s);
  const linien = bb.next.flatMap((nx, i) => nx.map((j) => `<line x1="${L[i].x}" y1="${L[i].z}" x2="${L[j].x}" y2="${L[j].z}"/>`)).join("");
  const felder = L.map((p, i) => `<g class="f2 art-${mu[i] === "a" ? "t" : mu[i]}${i === s.stern ? " sternfeld" : ""}"><circle cx="${p.x}" cy="${p.z}" r="0.72"/><text x="${p.x}" y="${p.z + 0.3}">${i === s.stern ? "⭐" : ART[mu[i]][0]}</text></g>`).join("");
  const figuren = s.pos.map((f, j) => `<circle class="fig2 f${j}" cx="${L[f].x + Math.cos(j * 1.57) * 0.45}" cy="${L[f].z + Math.sin(j * 1.57) * 0.45}" r="0.36"/>`).join("");
  return `<svg class="brett2d" viewBox="${x0.toFixed(1)} ${z0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Spielbrett"><g class="wege">${linien}</g>${felder}${figuren}</svg>`;
}

let fwLokal = { schluessel: null };
function farbwortNach(m, senden) {
  const schluessel = `fw-${m.runde}`;
  const anzeige = document.getElementById("farbwort");
  if (!anzeige) return;
  const neu = () => { const w = FW[Math.floor(Math.random() * 4)], f = FW[Math.floor(Math.random() * 4)]; fwLokal.richtig = f[0]; return [w[0], f[1]]; };
  const zeige = () => { const a = document.getElementById("farbwort"); if (a && fwLokal.wort) { a.textContent = fwLokal.wort[0]; a.style.color = fwLokal.wort[1]; } };
  if (fwLokal.schluessel !== schluessel) fwLokal = { schluessel, start: 0, punkte: 0, gesendet: false };
  if (fwLokal.start) zeige();
  anzeige.onclick = () => { if (fwLokal.start) return; fwLokal.start = performance.now(); fwLokal.wort = neu(); zeige();
    setTimeout(() => { fwLokal.gesendet = true; senden({ typ: "mini", wert: fwLokal.punkte }); }, 12000); };
  document.querySelectorAll("[data-fw]").forEach((b) => (b.onclick = () => {
    if (!fwLokal.start || fwLokal.gesendet) return;
    if (b.dataset.fw === fwLokal.richtig) fwLokal.punkte++; else fwLokal.punkte = Math.max(0, fwLokal.punkte - 1);
    fwLokal.wort = neu(); zeige();
    const a = document.getElementById("farbwort"); if (a) a.dataset.punkte = fwLokal.punkte;
  }));
}
let gedLokal = { schluessel: null };
function gedaechtnisNach(m, senden) {
  const schluessel = `ged-${m.runde}`;
  if (gedLokal.schluessel !== schluessel) { gedLokal = { schluessel, versteckt: false }; setTimeout(() => { gedLokal.versteckt = true; gedaechtnisNach(m, senden); }, 3000); }
  if (!gedLokal.versteckt) return;
  const z = document.getElementById("gedzahl"), i = document.getElementById("gedtipp"), k = document.getElementById("gedknopf");
  if (!z) return;
  z.textContent = "? ? ? ?"; i.style.display = "block"; k.style.display = "block";
  k.onclick = () => { const e = i.value.replace(/\D/g, ""); let r = 0; for (let x = 0; x < m.zahl.length; x++) if (e[x] === m.zahl[x]) r++; senden({ typ: "mini", wert: r }); };
}
