// Gluecksrad mit Joker (Nico 26.10.2026, Huettenplan 16.4 und 18.8; Halloween-Fassung Schritt C).
//
// Ein Gast tippt "Drehen". Das Ergebnis entscheidet EINMAL der Gastgeber (aktion -> drehen) und schreibt es in den Raum
// (raum.glueck.lauf): Feld, Zielwinkel, Startzeit. Beamer und Handys spielen daraus dieselbe Drehung ab (zeitgleich ueber
// die Gastgeber-Uhr) - niemand wuerfelt selbst. Kein eigenes alkoholfreies Rad (Nicos Vorgabe): Wortlaut bleibt "Shot".
//
// Joker: wer einen hat, darf ein Ergebnis, das ihn trifft, einmal an einen anderen Gast weiterschieben (JOKER_ZEIT lang,
// danach gilt es fuer ihn). Joker gibt es als Feld, fuer Sieger von Spielen (jokerFuerSieger, z. B. Blitzreaktion) und
// von der Spielleitung. Hoechstens JOKER_MAX je Gast. Das Rad bringt keine Wertungspunkte; gezaehlt wird nur, wer wie oft
// getroffen wurde (erwischt, fuer ein spaeteres Abzeichen) - Testkonten zaehlen nicht.
//
// Stand im Raum (raum.glueck, wandert mit der Lobby):
//   frei      Rad freigegeben (Spielleitung)        aus       abgeschaltete Standardfelder (ids)
//   eigene    [{id, name, text}] eigene Felder      nr        Zaehler der Drehungen     schub   Zaehler "weitergeschoben"
//   lauf      die aktuelle/letzte Drehung           zuletzt   {id: Zeit} letzter Dreh je Gast (Sperrzeit)
//   nochmal   id, die sofort wieder drehen darf     joker     {id: Anzahl}      erwischt   {Name: Anzahl}
//   verlauf   letzte Drehungen (neueste zuerst)     letzter   {name, preis} fuer die Diashow
//   jokerNr + jokerNeu {nr, ids, grund}            letzte Joker-Vergabe (Meldung am Handy)
import { esc } from "./hilfe.js";
import * as K from "./konten.js";

export const SPERRE = 2 * 60000;     // je Gast, damit niemand das Rad zuspammt
export const DREH = 6500;            // Drehdauer in ms (an allen Geraeten gleich)
export const JOKER_ZEIT = 15000;     // so lange darf der Getroffene ueberlegen
export const JOKER_MAX = 2;
export const EIGENE_MAX = 8;
export const NAME_MAX = 16;
export const TEXT_MAX = 60;
export const VERLAUF_MAX = 5;
export const MIN_FELDER = 2;
export const JOKER_SPIELE = ["reaktion"];   // Sieger dieser App-Spiele bekommen automatisch einen Joker

// trifft = das Ergebnis trifft den Drehenden (darf mit Joker weitergeschoben werden)
export const FELDER = [
  { id: "shot", emo: "🥃", name: "Shot", rad: "Shot", kurz: "SHOT!", text: "trinkt einen Shot", schub: "den SHOT", trifft: true },
  { id: "exen", emo: "🍺", name: "Exen", rad: "Exen", kurz: "EXEN!", text: "trinkt das Glas leer", schub: "das EXEN", trifft: true },
  { id: "verteilen", emo: "🎁", name: "Drei Schlucke verteilen", rad: "3 verteilen", kurz: "3 SCHLUCKE VERTEILEN!", text: "darf drei Schlucke verteilen" },
  { id: "wop", emo: "🎭", name: "Wahrheit oder Pflicht", rad: "Wahrheit/Pflicht", kurz: "WAHRHEIT ODER PFLICHT!", text: "", schub: "WAHRHEIT ODER PFLICHT", trifft: true },
  { id: "zwei", emo: "🍻", name: "Zwei Schlucke trinken", rad: "2 Schlucke", kurz: "2 SCHLUCKE!", text: "trinkt zwei Schlucke", schub: "die 2 SCHLUCKE", trifft: true },
  { id: "glueck", emo: "🍀", name: "Glück gehabt", rad: "Glück gehabt", kurz: "GLÜCK GEHABT!", text: "kommt diesmal ungeschoren davon" },
  { id: "nochmal", emo: "🔁", name: "Nochmal drehen", rad: "Nochmal", kurz: "NOCHMAL DREHEN!", text: "darf gleich nochmal drehen" },
  { id: "joker", emo: "🃏", name: "Joker gewonnen", rad: "Joker", kurz: "JOKER!", text: "bekommt einen Joker" },
];

// Harmlose, eigene Fragen und Aufgaben fuer "Wahrheit oder Pflicht" (nichts Intimes, nichts Gefaehrliches, fuer alle Alter)
export const WAHRHEIT = [
  "Was war dein peinlichstes Kostüm?", "Welchen Film hast du am öftesten gesehen?", "Was isst du heimlich am liebsten?",
  "Welches Lied singst du laut, wenn keiner zuhört?", "Wovor hattest du als Kind Angst?", "Was war dein lustigster Versprecher?",
  "Welche App öffnest du am häufigsten?", "Welcher Promi wärst du gern für einen Tag?", "Was war dein erster Berufswunsch?",
  "Welches Gericht kannst du überhaupt nicht kochen?", "Was ist dein seltsamstes Hobby?", "Wen hier würdest du ins Gruselhaus mitnehmen?",
  "Was war das Albernste, das du dir je gekauft hast?", "Welcher Spitzname hängt dir nach?",
];
export const PFLICHT = [
  "Mach 30 Sekunden lang ein Gespenst nach.", "Sing den Refrain eines Kinderlieds.", "Erzähl einen Witz – lacht keiner, nochmal.",
  "Sprich die nächsten zwei Minuten wie ein Nachrichtensprecher.", "Mach dein bestes Monster-Gebrüll.", "Tanz 20 Sekunden ohne Musik.",
  "Stell pantomimisch einen Kürbis dar.", "Mach jemandem hier ein ehrliches Kompliment.", "Imitiere die Person links von dir – die anderen raten.",
  "Erfinde einen Trinkspruch und sag ihn laut.", "Lauf einmal wie ein Zombie um den Tisch.", "Sag das Alphabet rückwärts bis M.",
  "Halte 30 Sekunden ernst Blickkontakt mit jemandem.", "Zeig deinen besten Tanzschritt.",
];

const zahl = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const sauber = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const spielerVon = (raum, id) => ((raum && raum.spieler) || []).find((x) => x.id === id);

// ---------------------------------------------------------------- Stand
// Fehlende Teile ergaenzen - immer am selben Objekt (wer g schon in der Hand hat, behaelt es)
export function sicher(raum) {
  if (!raum.glueck || typeof raum.glueck !== "object") raum.glueck = {};
  const g = raum.glueck;
  g.frei = g.frei !== false;
  g.aus = Array.isArray(g.aus) ? g.aus.filter((id) => FELDER.some((f) => f.id === id)) : [];
  g.eigene = Array.isArray(g.eigene) ? g.eigene.slice(0, EIGENE_MAX) : [];
  ["eNr", "nr", "schub", "jokerNr"].forEach((k) => { g[k] = zahl(g[k]); });
  ["zuletzt", "joker", "erwischt"].forEach((k) => { if (!g[k] || typeof g[k] !== "object") g[k] = {}; });
  g.verlauf = Array.isArray(g.verlauf) ? g.verlauf.slice(0, VERLAUF_MAX) : [];
  if (g.lauf === undefined) g.lauf = null;
  if (g.nochmal === undefined) g.nochmal = null;
  if (g.letzter === undefined) g.letzter = null;
  if (g.jokerNeu === undefined) g.jokerNeu = null;
  return g;
}
const lesen = (raum) => (raum && raum.glueck) || {};

// Felder, die gerade auf dem Rad sind (Standardfelder ohne die abgeschalteten, dann die eigenen)
export function felder(g) {
  const aus = new Set(g.aus || []);
  return [...FELDER.filter((f) => !aus.has(f.id)), ...(g.eigene || []).map((e) => ({ id: e.id, emo: "✏️", name: e.name, rad: e.name,
    kurz: `${e.name.toLocaleUpperCase("de")}!`, text: e.text || "", schub: `„${e.name}“`, trifft: true, eigen: true }))];
}

export const jokerVon = (raum, id) => Math.max(0, zahl(lesen(raum).joker && lesen(raum).joker[id]));
export const laeuft = (raum) => { const l = lesen(raum).lauf; return !!(l && !l.fertig); };
// "drehen" bis zum Stopp, danach "joker" (der Getroffene darf schieben), dann "fertig"
export function phase(l, jetzt) {
  if (!l) return null;
  if (jetzt < l.ende) return "drehen";   // auch wenn schon entschieden: erst nach dem Stopp verraten
  if (l.fertig) return "fertig";
  return l.frist && jetzt < l.frist ? "joker" : "warten";
}

// Darf dieser Gast jetzt drehen? -> {ok, grund, bis}
export function darfDrehen(raum, id, jetzt, fuer = false) {
  const g = lesen(raum);
  if (!spielerVon(raum, id)) return { ok: false, grund: "Unbekannter Gast" };
  if (g.lauf && !g.lauf.fertig) return { ok: false, grund: "Das Rad dreht gerade" };
  if (felder(g).length < MIN_FELDER) return { ok: false, grund: "Zu wenige Felder auf dem Rad" };
  if (fuer) return { ok: true };
  if (g.frei === false) return { ok: false, grund: "Das Rad ist gerade gesperrt" };
  if (g.nochmal === id) return { ok: true, nochmal: true };
  const t = zahl(g.zuletzt && g.zuletzt[id]);
  if (t && jetzt - t < SPERRE) return { ok: false, grund: "Kurz warten", bis: t + SPERRE };
  return { ok: true };
}

// Zielwinkel: Feld ziel landet unter dem Zeiger oben, nach mehreren vollen Umdrehungen (Versatz im Feld je Drehung fest)
export function winkel(n, ziel, nr) {
  const s = 360 / n;
  const versatz = (((nr * 7919) % 100) / 100 - 0.5) * s * 0.6;
  return 360 * 6 - (ziel + 0.5) * s + versatz;
}
// Drehung bei Fortschritt p (0..1): erst schnell, dann immer langsamer
export const ease = (p) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
export function stellung(l, jetzt) { return l ? l.winkel * ease((jetzt - l.t) / (l.ende - l.t)) : 0; }

// Der Gastgeber dreht (zufall gibt Werte in [0, 1)). -> true bei Erfolg
export function drehen(raum, id, jetzt, zufall = Math.random, fuer = false) {
  const d = darfDrehen(raum, id, jetzt, fuer);
  if (!d.ok) return false;
  const g = sicher(raum);
  const liste = felder(g);
  const ziel = Math.min(liste.length - 1, Math.floor(zufall() * liste.length));
  const f = liste[ziel];
  const sp = spielerVon(raum, id);
  g.nr += 1;
  let zusatz = "";
  if (f.id === "wop") zusatz = zufall() < 0.5 ? `Wahrheit: ${WAHRHEIT[Math.floor(zufall() * WAHRHEIT.length)]}` : `Pflicht: ${PFLICHT[Math.floor(zufall() * PFLICHT.length)]}`;
  if (f.id === "joker" && jokerVon(raum, id) >= JOKER_MAX) zusatz = `Du hast schon ${JOKER_MAX} Joker – mehr geht nicht.`;
  const ende = jetzt + DREH;
  const trifft = !!f.trifft;
  g.lauf = {
    nr: g.nr, wer: id, name: sp.name, fuer: !!fuer, felder: liste.map((x) => ({ id: x.id, emo: x.emo, rad: x.rad })), ziel,
    feld: f.id, emo: f.emo, kurz: f.kurz, text: f.text, schubText: f.schub || "", zusatz, trifft, winkel: winkel(liste.length, ziel, g.nr),
    t: jetzt, ende, frist: trifft && jokerVon(raum, id) > 0 ? ende + JOKER_ZEIT : 0, getroffen: trifft ? id : null,
    getroffenName: trifft ? sp.name : null, schub: null, fertig: false,
  };
  if (g.nochmal === id) g.nochmal = null;
  if (!fuer) g.zuletzt = { ...g.zuletzt, [id]: jetzt };
  return true;
}

// Getroffener schiebt mit Joker weiter (einmal je Drehung; danach gilt es fuer den Neuen)
export function schieben(raum, von, an, jetzt) {
  const g = sicher(raum), l = g.lauf;
  if (!l || l.fertig || !l.trifft || l.schub || l.getroffen !== von || von === an) return false;
  if (!l.frist || jetzt >= l.frist || jetzt < l.ende - 500 || jokerVon(raum, von) < 1) return false;
  const ziel = spielerVon(raum, an), ich = spielerVon(raum, von);
  if (!ziel || !ich) return false;
  g.joker = { ...g.joker, [von]: jokerVon(raum, von) - 1 };
  l.schub = { von, vonName: ich.name, an, anName: ziel.name };
  l.getroffen = an; l.getroffenName = ziel.name;
  g.schub += 1;
  abschliessen(raum, jetzt);
  return true;
}
// Getroffener nimmt es selbst (Joker bleibt)
export function behalten(raum, von, jetzt) {
  const l = lesen(raum).lauf;
  if (!l || l.fertig || l.getroffen !== von || !l.frist) return false;
  abschliessen(raum, jetzt);
  return true;
}

// Ende einer Drehung: Joker-Feld auszahlen, Treffer zaehlen, Verlauf und Diashow fuellen
export function abschliessen(raum, jetzt = Date.now()) {
  const g = sicher(raum), l = g.lauf;
  if (!l || l.fertig) return false;
  l.fertig = true;
  l.zu = Math.max(jetzt, l.ende);
  if (l.feld === "joker") jokerGeben(raum, l.wer);
  if (l.feld === "nochmal") g.nochmal = l.wer;
  const wer = l.trifft ? l.getroffenName : l.name;
  if (l.trifft && !K.istTestkonto(raum, wer)) g.erwischt = { ...g.erwischt, [wer]: zahl(g.erwischt[wer]) + 1 };
  const preis = `${l.emo} ${l.kurz.replace(/!$/, "")}`;
  g.letzter = { name: wer, preis, aufgabe: l.feld === "wop" ? l.zusatz : l.eigen ? l.text : "", schub: l.schub ? l.schub.vonName : null, nr: l.nr };
  g.verlauf = [{ nr: l.nr, name: wer, preis, schub: l.schub ? l.schub.vonName : null }, ...g.verlauf.filter((x) => x.nr !== l.nr)].slice(0, VERLAUF_MAX);
  return true;
}

// Sekundentakt beim Gastgeber: Drehung zu Ende und keine Joker-Entscheidung mehr offen -> abschliessen
export function pruefen(raum, jetzt) {
  const l = lesen(raum).lauf;
  if (!l || l.fertig || jetzt < Math.max(l.ende, l.frist || 0)) return false;
  return abschliessen(raum, jetzt);
}

// Joker vergeben (hoechstens JOKER_MAX). -> true, wenn einer dazukam
export function jokerGeben(raum, id) {
  const g = sicher(raum);
  if (!spielerVon(raum, id) || jokerVon(raum, id) >= JOKER_MAX) return false;
  g.joker = { ...g.joker, [id]: jokerVon(raum, id) + 1 };
  return true;
}
// Fuer Spiele: Sieger bekommen je einen Joker (Blitzreaktion jetzt, spaeter Quiz und Bingo). grund = Spielname fuer die Meldung
export function jokerFuerSieger(raum, ids, grund = "") {
  const neu = (ids || []).filter((id) => jokerGeben(raum, id));
  if (!neu.length) return [];
  const g = sicher(raum);
  g.jokerNr += 1;
  g.jokerNeu = { nr: g.jokerNr, ids: neu, grund: sauber(grund, 40) };
  return neu;
}

// Kennung eines Gastes wechselt (anderes Geraet, Wiederverbinden): Joker, Sperrzeit und laufende Drehung mitnehmen
export function idErsetzen(raum, alt, neu) {
  const g = raum && raum.glueck;
  if (!g || !alt || alt === neu) return;
  const um = (o) => { if (o && alt in o) { o[neu] = o[alt]; delete o[alt]; } };
  um(g.joker); um(g.zuletzt);
  if (g.nochmal === alt) g.nochmal = neu;
  const l = g.lauf;
  if (l) {
    if (l.wer === alt) l.wer = neu;
    if (l.getroffen === alt) l.getroffen = neu;
    if (l.schub) { if (l.schub.von === alt) l.schub.von = neu; if (l.schub.an === alt) l.schub.an = neu; }
  }
  if (g.jokerNeu && Array.isArray(g.jokerNeu.ids)) g.jokerNeu.ids = g.jokerNeu.ids.map((x) => (x === alt ? neu : x));
}

// Aktion "_glueck" beim Gastgeber. -> true, wenn sich etwas geaendert hat
export function aktion(raum, von, a, jetzt, admin, zufall = Math.random) {
  if (!a || typeof a.was !== "string") return false;
  if (a.was === "drehen") return drehen(raum, von, jetzt, zufall, false);
  if (a.was === "schieben") return schieben(raum, von, String(a.an ?? a.wert ?? ""), jetzt);
  if (a.was === "behalten") return behalten(raum, von, jetzt);
  if (!admin) return false;
  const g = sicher(raum);
  if (a.was === "frei") { g.frei = !g.frei; return true; }
  if (a.was === "fuer") return drehen(raum, String(a.wert ?? a.id ?? ""), jetzt, zufall, true);
  if (a.was === "joker") return jokerFuerSieger(raum, [String(a.wert ?? a.id ?? "")], "von der Spielleitung").length > 0;
  if (a.was === "feld") {
    if (!FELDER.some((f) => f.id === a.id)) return false;
    if (g.aus.includes(a.id)) { g.aus = g.aus.filter((x) => x !== a.id); return true; }
    if (felder(g).length <= MIN_FELDER) return false;
    g.aus = [...g.aus, a.id];
    return true;
  }
  if (a.was === "eigen") {
    const w = Array.isArray(a.werte) ? a.werte : [];
    const name = sauber(w[0], NAME_MAX), text = sauber(w[1], TEXT_MAX);
    if (!name || g.eigene.length >= EIGENE_MAX) return false;
    g.eNr += 1;
    g.eigene = [...g.eigene, { id: `e${g.eNr}`, name, text }];
    return true;
  }
  if (a.was === "eigenweg") {
    if (!g.eigene.some((e) => e.id === a.id) || felder(g).length <= MIN_FELDER) return false;
    g.eigene = g.eigene.filter((e) => e.id !== a.id);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- Anzeige
const PALETTEN = {
  halloween: { felder: [["#ff7518", "#1a0d05"], ["#140c08", "#ff9a3c"]], mitte: "🎃", ring: "#ff7518", zeiger: "#ffd23f" },
  geburtstag: { felder: [["#ff5fae", "#fff"], ["#3fd0ff", "#06202b"], ["#ffd23f", "#2b2100"], ["#5ef08a", "#06260f"], ["#6d5dfc", "#fff"], ["#ff9600", "#2b1500"]], mitte: "🎉", ring: "#fff", zeiger: "#ff4b4b" },
  edel: { felder: [["#d8b56a", "#14120c"], ["#1d2029", "#e9d6a6"]], mitte: "✨", ring: "#d8b56a", zeiger: "#f3e3bd" },
};
export const palette = (look) => PALETTEN[look] || PALETTEN.geburtstag;

// Das Rad als SVG. beschriften = Feldnamen (sonst nur Zeichen); drehung = aktuelle Stellung in Grad
export function radSVG(liste, look, { beschriften = true, drehung = 0, nr = 0 } = {}) {
  const n = Math.max(1, liste.length), s = 360 / n, pal = palette(look), r = 470;
  const punkt = (w, rr) => { const b = ((w - 90) * Math.PI) / 180; return [500 + rr * Math.cos(b), 500 + rr * Math.sin(b)]; };
  const farben = (i) => {
    const f = pal.felder;
    // ungerade Anzahl bei zwei Farben: das letzte Feld bekommt die dritte Farbe, damit keine zwei gleichen nebeneinander liegen
    if (f.length === 2 && n % 2 === 1 && i === n - 1) return [pal.ring === "#ff7518" ? "#7a2fd0" : "#8a8f9e", "#fff"];
    return f[i % f.length];
  };
  const stuecke = liste.map((f, i) => {
    const [a1, a2] = [i * s, (i + 1) * s];
    const [x1, y1] = punkt(a1, r), [x2, y2] = punkt(a2, r);
    const [bg, vg] = farben(i);
    const mitte = a1 + s / 2;
    const text = beschriften ? String(f.rad || f.name || "") : "";
    const kurz = text.length > 16 ? `${text.slice(0, 15)}…` : text;
    const fs = Math.max(20, Math.min(46, 250 / Math.max(4, kurz.length * 0.58), s * 1.6));
    return `<path d="M500 500L${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${s > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="${bg}" stroke="${pal.ring}" stroke-width="4"/>
      <g transform="rotate(${mitte.toFixed(2)} 500 500)">
        <text x="500" y="${beschriften ? 98 : 120}" font-size="${beschriften ? Math.min(64, s * 2.4).toFixed(0) : Math.min(110, s * 3).toFixed(0)}" text-anchor="middle" dominant-baseline="middle">${f.emo || "✏️"}</text>
        ${kurz ? `<text x="500" y="150" font-size="${fs.toFixed(0)}" font-weight="900" fill="${vg}" text-anchor="start" dominant-baseline="middle" transform="rotate(90 500 150)">${esc(kurz)}</text>` : ""}
      </g>`;
  }).join("");
  return `<svg class="rad" viewBox="0 0 1000 1000" data-rad-nr="${nr}" aria-hidden="true">
    <circle cx="500" cy="500" r="${r + 18}" fill="#000" stroke="${pal.ring}" stroke-width="14"/>
    <g class="rad-scheibe" style="transform:rotate(${drehung.toFixed(2)}deg);transform-origin:500px 500px">${stuecke}</g>
    <circle cx="500" cy="500" r="92" fill="#0b0705" stroke="${pal.ring}" stroke-width="10"/>
    <text x="500" y="508" font-size="110" text-anchor="middle" dominant-baseline="middle">${pal.mitte}</text>
    <path d="M500 74L462 0H538Z" fill="${pal.zeiger}" stroke="#000" stroke-width="6"/>
  </svg>`;
}

// Ergebnis in Worten (Handy und Beamer). jetzt = Gastgeber-Zeit; ich = eigene id (fuer "du")
export function ergebnisText(l) {
  if (!l) return "";
  const name = l.trifft ? l.getroffenName : l.name;
  return `${name}: ${l.kurz}`;
}
export function schubText(l) {
  return l && l.schub ? `${l.schub.vonName} schiebt ${l.schubText || l.kurz} weiter an ${l.schub.anName}!` : "";
}

// Bereich unter/neben dem Rad: waehrend der Drehung "dreht …", danach Ergebnis, Joker-Frage, Weiterschieben
export function ergebnisHTML(l, jetzt, gross = false) {
  const ph = phase(l, jetzt);
  if (!ph) return "";
  if (ph === "drehen") return `<div class="rad-erg ${gross ? "gross" : ""}"><p class="rad-dreht">${l.fuer ? "Die Spielleitung dreht für" : "Es dreht:"} <b>${esc(l.name)}</b> …</p></div>`;
  const kopf = l.schub ? `<p class="rad-schub">🃏 ${esc(schubText(l))}</p>` : "";
  const name = l.trifft ? l.getroffenName : l.name;
  const erg = `<p class="rad-ergebnis"><span class="rad-name">${esc(name)}:</span> <b>${l.emo} ${esc(l.kurz)}</b></p>`;
  const text = l.feld === "wop" ? `<p class="rad-aufgabe">${esc(l.zusatz)}</p>` : `${l.text ? `<p class="rad-text">${esc(name)} ${esc(l.text)}</p>` : ""}${l.zusatz ? `<p class="rad-text">${esc(l.zusatz)}</p>` : ""}`;
  const joker = ph === "joker" ? `<p class="rad-joker">🃏 ${esc(l.getroffenName)} hat einen Joker – weiterschieben? <b data-gcd="${l.frist}" data-sek>${Math.max(0, Math.ceil((l.frist - jetzt) / 1000))}</b> s</p>` : "";
  return `<div class="rad-erg ${gross ? "gross" : ""}">${kopf}${erg}${text}${joker}</div>`;
}

// ---------------------------------------------------------------- Drehung abspielen (Handy und Beamer, ein gemeinsamer Takt)
// Jedes <svg data-rad-nr> mit data-rad-t/-ende/-winkel dreht sich nach der Gastgeber-Uhr. Beim Ueberqueren einer Feldgrenze
// ruft er tick(), beim Stopp stopp(nr) - je Drehung einmal.
let lauft = false, uhr = () => Date.now(), tick = null, stopp = null;
const gestoppt = new Set(), letzteGrenze = new Map();
let letzterTick = 0;
export function abspielen(jetztFn, { beiTick = null, beiStopp = null } = {}) {
  uhr = jetztFn; tick = beiTick; stopp = beiStopp;
  if (!lauft) { lauft = true; requestAnimationFrame(schritt); }
}
function schritt() {
  const jetzt = uhr();
  let weiter = false;
  document.querySelectorAll("svg.rad[data-rad-t]").forEach((svg) => {
    const t = Number(svg.dataset.radT), ende = Number(svg.dataset.radEnde), w = Number(svg.dataset.radWinkel), n = Number(svg.dataset.radN) || 1, nr = svg.dataset.radNr;
    const l = { t, ende, winkel: w };
    const d = stellung(l, jetzt);
    const scheibe = svg.querySelector(".rad-scheibe");
    if (scheibe) scheibe.style.transform = `rotate(${d.toFixed(2)}deg)`;
    if (jetzt < ende) {
      weiter = true;
      const grenze = Math.floor(d / (360 / n));
      if (letzteGrenze.get(nr) !== grenze) {
        letzteGrenze.set(nr, grenze);
        if (tick && performance.now() - letzterTick > 35) { letzterTick = performance.now(); tick(); }
      }
    } else if (!gestoppt.has(nr)) {
      gestoppt.add(nr);
      if (stopp) stopp(Number(nr));
    }
  });
  if (weiter) requestAnimationFrame(schritt);
  else lauft = false;
}
// Wurde diese Drehung hier schon zu Ende gespielt? (z. B. Seite neu geladen: dann nicht nochmal Tusch)
export const schonGestoppt = (nr) => gestoppt.has(String(nr));
export function alsGestopptMerken(nr) { gestoppt.add(String(nr)); }

// SVG mit allen Daten fuer abspielen()
export function radLaufSVG(l, look, jetzt, beschriften = true) {
  const svg = radSVG(l.felder, look, { beschriften, drehung: stellung(l, jetzt), nr: l.nr });
  return svg.replace('<svg class="rad"', `<svg class="rad" data-rad-t="${l.t}" data-rad-ende="${l.ende}" data-rad-winkel="${l.winkel}" data-rad-n="${l.felder.length}"`);
}
