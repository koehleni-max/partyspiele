// Fragen-Gedaechtnis: keine Wiederholungen ueber Spiele und Abende hinweg (Nico 09.11.2026: "kommen immer wieder dieselben
// Fragen ... wenn ich das oft genug spiele, kann ich alles auswendig").
//
// Laeuft nur beim Gastgeber. Merkt sich in localStorage je Fragen-Gruppe, welche Fragen schon gestellt wurden - als kurze
// Kennung aus dem Fragetext, nicht als Nummer. Darum teilen sich Quizshow, Millionaer, Damals und Quizduell ein Gedaechtnis:
// steht dieselbe Frage in zwei Listen, kommt sie trotzdem nur einmal dran. Erst wenn ALLE Fragen einer Liste durch sind,
// faengt diese Liste von vorn an (Rueckgabe vonVorn: true plus Hinweistext fuer die Anzeige).
// Anders als stapel.js (je Raum, nur ein Abend) haelt dieses Gedaechtnis ueber Neustarts und Abende hinweg.
//
//   import * as FG from "./fragen_gedaechtnis.js";
//   const { eintrag, vonVorn, hinweis } = FG.naechste("quiz", QUIZ_POOL);
//   const fuenf = FG.mehrere("duell", QUIZ_POOL, 5);
//
// Fehlt localStorage (privates Fenster, Tests), merkt es sich die Fragen nur im Speicher dieser Seite.

const SCHLUESSEL = "partyspiele.fragen_gedaechtnis.v1";
const GRUPPEN = { quiz: "wissen", millionaer: "wissen", damals: "wissen", duell: "wissen", quizshow: "wissen",
  schaetzen: "schaetzen", bilder: "bilder" };
export const gruppeVon = (art) => GRUPPEN[art] || String(art);

// ---------------------------------------------------------------- Kennung aus dem Fragetext
const ERSATZ = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };
export function normalisiere(text) {
  return String(text == null ? "" : text).toLowerCase()
    .replace(/[äöüß]/g, (z) => ERSATZ[z])
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\u0080-￿]+/g, " ")   // Satzzeichen, Anfuehrungszeichen, Klammern weg; Emojis bleiben
    .trim().replace(/\s+/g, " ");
}
const textVon = (eintrag) => (Array.isArray(eintrag) ? eintrag[0] : eintrag && typeof eintrag === "object" ? (eintrag.f || eintrag.frage) : eintrag);

// cyrb53: kurze, gut streuende Pruefsumme (53 Bit) - Kollisionen bei einigen tausend Fragen praktisch ausgeschlossen
function pruefsumme(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const kennung = (eintrag) => pruefsumme(normalisiere(textVon(eintrag)));

// ---------------------------------------------------------------- Ablage
const fluechtig = new Map();
const ersatzSpeicher = { getItem: (k) => (fluechtig.has(k) ? fluechtig.get(k) : null), setItem: (k, v) => fluechtig.set(k, String(v)), removeItem: (k) => fluechtig.delete(k) };
function standardSpeicher() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return ersatzSpeicher;
    const probe = SCHLUESSEL + ".probe";
    ls.setItem(probe, "1"); ls.removeItem(probe);
    return ls;
  } catch (e) { return ersatzSpeicher; }
}
function laden(sp) {
  try {
    const d = JSON.parse(sp.getItem(SCHLUESSEL) || "null");
    if (d && typeof d === "object" && d.g && typeof d.g === "object") return d;
  } catch (e) { /* kaputte Ablage: neu anfangen */ }
  return { v: 1, g: {} };
}
function sichern(sp, d) {
  try { sp.setItem(SCHLUESSEL, JSON.stringify(d)); } catch (e) { /* voll oder gesperrt: dann nur fuer diese Sitzung */ }
}
const liste = (d, g) => (Array.isArray(d.g[g]) ? d.g[g] : (d.g[g] = []));

// ---------------------------------------------------------------- Ziehen
// -> { eintrag, nr, vonVorn, hinweis, rest, gesamt } oder null bei leerer Liste.
// opt: speicher (getItem/setItem), zufall (0..1), nur(eintrag, nr) = false schliesst aus, ausser = Set von Nummern, die
// diesmal nicht kommen sollen (z. B. schon in derselben Runde gezogen).
export function naechste(art, pool, opt = {}) {
  if (!Array.isArray(pool) || !pool.length) return null;
  const sp = opt.speicher || standardSpeicher(), zufall = opt.zufall || Math.random, ausser = opt.ausser || new Set();
  const g = gruppeVon(art), d = laden(sp), schon = new Set(liste(d, g));
  const alle = [];
  for (let i = 0; i < pool.length; i++) if (!opt.nur || opt.nur(pool[i], i)) alle.push(i);
  if (!alle.length) return null;
  const ids = alle.map((i) => kennung(pool[i]));
  let frei = alle.filter((i, k) => !schon.has(ids[k]) && !ausser.has(i));
  let vonVorn = false;
  if (!frei.length) {
    // alle dieser Liste waren dran: nur deren Kennungen vergessen (andere Listen derselben Gruppe behalten ihr Gedaechtnis)
    const dieseListe = new Set(ids);
    d.g[g] = liste(d, g).filter((k) => !dieseListe.has(k));
    vonVorn = true;
    frei = alle.filter((i) => !ausser.has(i));
    if (frei.length > 1 && d.letzte && d.letzte[g]) frei = frei.filter((i) => kennung(pool[i]) !== d.letzte[g]) ;
    if (!frei.length) frei = alle.slice();
  }
  const nr = frei[Math.min(frei.length - 1, Math.floor(zufall() * frei.length))];
  const id = kennung(pool[nr]);
  if (!liste(d, g).includes(id)) liste(d, g).push(id);
  d.letzte = d.letzte || {}; d.letzte[g] = id;
  sichern(sp, d);
  return { eintrag: pool[nr], nr, vonVorn, hinweis: vonVorn ? "Alle Fragen dieser Sorte waren schon einmal dran – es geht wieder von vorn los." : "",
    rest: frei.length - 1, gesamt: alle.length };
}

// n verschiedene Fragen auf einmal (z. B. fuenf fuers Quizduell). vonVorn ist true, wenn unterwegs neu begonnen wurde.
export function mehrere(art, pool, n, opt = {}) {
  const aus = [], nummern = new Set();
  let vonVorn = false;
  for (let k = 0; k < n; k++) {
    const z = naechste(art, pool, { ...opt, ausser: nummern });
    if (!z) break;
    nummern.add(z.nr); aus.push(z); vonVorn = vonVorn || z.vonVorn;
  }
  return { fragen: aus.map((z) => z.eintrag), nummern: aus.map((z) => z.nr), vonVorn,
    hinweis: vonVorn ? "Alle Fragen dieser Sorte waren schon einmal dran – es geht wieder von vorn los." : "" };
}

// Eine Frage von aussen als gestellt vermerken (z. B. wenn ein Spiel seine Frage selbst gewaehlt hat).
export function merken(art, eintrag, opt = {}) {
  const sp = opt.speicher || standardSpeicher(), g = gruppeVon(art), d = laden(sp), id = kennung(eintrag);
  if (!liste(d, g).includes(id)) liste(d, g).push(id);
  sichern(sp, d);
}
export function schonGestellt(art, eintrag, opt = {}) {
  const sp = opt.speicher || standardSpeicher();
  return liste(laden(sp), gruppeVon(art)).includes(kennung(eintrag));
}
// Wie viele aus dieser Liste waren schon dran? -> { gestellt, gesamt }
export function stand(art, pool, opt = {}) {
  const sp = opt.speicher || standardSpeicher(), schon = new Set(liste(laden(sp), gruppeVon(art)));
  const ids = new Set((pool || []).map(kennung));
  let gestellt = 0;
  ids.forEach((k) => { if (schon.has(k)) gestellt++; });
  return { gestellt, gesamt: ids.size };
}
// Gedaechtnis loeschen - eine Gruppe (art angeben) oder alles.
export function vergessen(art = null, opt = {}) {
  const sp = opt.speicher || standardSpeicher(), d = laden(sp);
  if (art == null) { d.g = {}; d.letzte = {}; } else { delete d.g[gruppeVon(art)]; if (d.letzte) delete d.letzte[gruppeVon(art)]; }
  sichern(sp, d);
}
