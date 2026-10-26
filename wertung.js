// Gesamtwertung mit Runden und Wanderpokal (Nico 26.10.2026, Huettenparty). Teil der Turniertafel: der Stand liegt in
// raum.tafel.wertung, wird vom Gastgeber gehalten und mit der Tafel gesichert (tafel_ablage.js).
//
// Ablauf fuer die Gaeste:
//  - App-Spiele vergeben Punkte von selbst, sobald ein Spiel einen Sieger kennt (app.js fragt spiel.ergebnis()).
//  - Bierpong-Spiele aus dem Turnierbaum und Duelle ("Sieg eintragen") zaehlen erst, wenn der Gegner am eigenen Handy
//    "Stimmt" tippt. Traegt der Gegner selbst ein, zaehlt es sofort. Hat der Gegner kein Handy, bestaetigt der Gastgeber.
//  - Der Gastgeber startet Runden (Dauer oder Endzeit). Am Rundenende bekommt der Punktbeste den Pokal, alle beginnen
//    wieder bei null. Die Abendwertung (Summe aller Runden + Pokaltraeger) zeigt der Gastgeber am Ende des Abends.
//
// Buchung: {id, namen[], gegner[], punkte, kat, kname, emo, text, quelle?, sig?, runde, info:{von, status, zeit}}
//   kat = "app:<spiel>" | "st:<station>" | "duell" | "hand";  status = "offen" | "bestaetigt" | "abgelehnt"
//   runde = Nummer der Runde, in der die Buchung bestaetigt wurde (offen: null) - dort zaehlt sie.
//   Testkonten (konten.js): steht w.ohneTest (Raum-Schalter "Testkonten erlaubt", setzt app.js vor jeder Aktion), wird fuer
//   sie nie gebucht - App-Siege nur fuer die echten Mitsieger, Duelle/Bierpong mit Testkonto gar nicht, Rennen-Bestzeit
//   nur unter echten Fahrern. So landet nichts davon in Runden, Pokal oder Abendwertung.
import { esc, knopf, nameSauber } from "./hilfe.js";
import { istTestName } from "./konten.js";

const schluessel = (n) => nameSauber(n).toLocaleLowerCase("de");
const gleich = (x, y) => schluessel(x) === schluessel(y);
const tt = (was, mehr = {}) => ({ typ: "_tafel", was, ...mehr });
const MEDAILLE = { 1: "🥇", 2: "🥈", 3: "🥉" };
const EMOJI_ST = { pong: "🏓", punkte: "🎯", rennen: "🏁" };

// ---------------------------------------------------------------- Punktwerte (Vorbelegung)
// Faustregel: lange Spiele mit vielen Leuten und viel Koennen bringen am meisten (Werwolf, Partybrett 5), mittlere
// Spiele 3-4, kurze Zweier-Spiele 1-2, reines Glueck (Pferderennen) 1. Spiele, die Frage um Frage oder Runde um Runde
// werten (Quiz, Schaetzen, Blitzreaktion ...), geben je Stueck wenig, damit eine Quiz-Stunde nicht alles ueberrollt.
// Genug Spiele ohne Alkohol bringen Punkte (Werwolf, Quiz, Spion, Wer bin ich, Begriffe, Dart ...). Alles Annahmen -
// nach dem ersten Abend nachjustieren; der Gastgeber aendert sie unter "Punkte einstellen".
export const APP_WERTE = [
  ["werwolf", "Werwolf", "🐺", 5, "Siegerseite"], ["brett", "Partybrett", "🎲", 5, "je Sieg"], ["fiesbau", "Fiesbau", "🏗️", 4, "je Sieg"],
  ["farbchaos", "Farbchaos Extrem", "🌈", 3, "je Sieg"], ["f-wuerfel", "Würfelpoker", "🎲", 3, "je Sieg"], ["f-schiffe", "Schiffe versenken", "🚢", 3, "je Sieg"],
  ["f-dame", "Dame", "⚫", 3, "je Sieg"], ["spion", "Der Spion", "🕵️", 3, "Siegerseite"], ["werbinich", "Wer bin ich?", "🎭", 2, "wer zuerst errät"],
  ["f-vier", "Vier in einer Reihe", "🔴", 2, "je Sieg"], ["slf", "Stadt-Land-Fluss", "✏️", 2, "je Runde"], ["begriffe", "Begriffe-Rallye", "🗣️", 2, "je Durchgang"],
  ["pantomime", "Pantomime", "🤹", 2, "je Durchgang"], ["f-ttt", "Tic-Tac-Toe", "❌", 1, "je Sieg"], ["quiz", "Quiz-Duell", "🧠", 1, "je Frage"],
  ["reaktion", "Blitzreaktion", "⚡", 1, "je Runde"], ["schaetzen", "Schätzmeister", "🎯", 1, "je Frage"], ["malen", "Malen & Raten", "🎨", 1, "Maler und Rater"],
  ["pferde", "Pferderennen", "🏇", 1, "richtige Wette"],
];
const ST_WERT = { pong: 3, punkte: 3, rennen: 3 };
const RENN_BEST = 4;
const DUELL_WERT = 2;

export const anzeigeName = (st, ohneAlkohol) => (ohneAlkohol && st.name === "Bierpong" ? "Becher-Pong" : st.name);
const duellName = (oa) => (oa ? "Duell" : "Trinkspiel-Duell");

// Liste aller einstellbaren Werte, in der Reihenfolge des Einstell-Formulars
export function werteListe(t, oa) {
  const l = APP_WERTE.map(([id, name, emo, def, wofuer]) => ({ k: `app:${id}`, name: `${emo} ${name}`, wofuer, def }));
  (t.stationen || []).forEach((st) => {
    const n = `${EMOJI_ST[st.art]} ${anzeigeName(st, oa)}`;
    l.push({ k: `st:${st.id}`, name: n, wofuer: st.art === "pong" ? "je gewonnenes Spiel" : "Sieg im Duell", def: ST_WERT[st.art] });
    if (st.art === "rennen") l.push({ k: `st:${st.id}:best`, name: n, wofuer: "Bestzeit der Runde", def: RENN_BEST });
  });
  l.push({ k: "duell", name: `⚔️ ${duellName(oa)}`, wofuer: "Sieg", def: DUELL_WERT });
  return l;
}
export function wert(w, k, def) { const x = w.werte && w.werte[k]; return Number.isFinite(x) ? x : def; }

// ---------------------------------------------------------------- Stand
export function neu(jetzt = Date.now()) {
  return { werte: {}, buchungen: [], bNr: 1, runde: { nr: 1, seit: jetzt, start: null, ende: null, dauer: null },
    auto: false, runden: [], pokal: null, uebergabe: 0, abend: 0 };
}
export function laden(w) {
  if (!w || !Array.isArray(w.buchungen) || !w.runde) return neu();
  return { ...neu(), ...w };
}
export function sicher(t) { if (!t.wertung || !Array.isArray(t.wertung.buchungen)) t.wertung = laden(t.wertung); return t.wertung; }

const zaehlt = (b) => b.info && b.info.status === "bestaetigt" && b.runde != null;

// Punkte je Spieler: nr = Rundennummer, null = ganzer Abend. namen = alle Gaeste (erscheinen auch mit 0).
export function stand(w, nr, namen = []) {
  const je = new Map();
  const dazu = (n) => { const k = schluessel(n); if (!k) return null; if (!je.has(k)) je.set(k, { name: nameSauber(n), summe: 0, kats: {} }); return je.get(k); };
  namen.forEach(dazu);
  w.buchungen.filter((b) => zaehlt(b) && (nr == null || b.runde === nr)).forEach((b) => b.namen.forEach((n) => {
    const x = dazu(n); if (!x) return;
    x.summe += b.punkte;
    const g = b.kat.startsWith("app:") ? "app" : b.kat;
    const c = x.kats[g] || (x.kats[g] = { emo: g === "app" ? "🎮" : b.emo, punkte: 0 });
    c.punkte += b.punkte;
  }));
  const liste = [...je.values()].sort((x, y) => y.summe - x.summe || x.name.localeCompare(y.name, "de"));
  liste.forEach((x, i) => { x.platz = i > 0 && x.summe === liste[i - 1].summe ? liste[i - 1].platz : i + 1; });
  return liste;
}

export const offenFuer = (w, name) => (name ? w.buchungen.filter((b) => b.info.status === "offen" && b.gegner.some((g) => gleich(g, name))) : []);
const wartetVon = (w, name) => (name ? w.buchungen.filter((b) => b.info.status === "offen" && gleich(b.info.von, name) && !b.gegner.some((g) => gleich(g, name))) : []);

function buchen(w, b, wer, status) {
  if (w.ohneTest) {
    if ((b.gegner || []).some(istTestName)) return null;
    b = { ...b, namen: (b.namen || []).filter((n) => !istTestName(n)) };
    if (!b.namen.length) return null;
  }
  const neuB = { id: w.bNr++, gegner: [], ...b, info: { von: nameSauber(wer), status, zeit: Date.now() }, runde: status === "bestaetigt" ? w.runde.nr : null };
  w.buchungen.push(neuB);
  return neuB;
}

// ---------------------------------------------------------------- Runden
export const faellig = (w, jetzt) => !!(w && w.runde && w.runde.ende && jetzt >= w.runde.ende);

export function endzeitLesen(text, jetzt) {
  const m = String(text ?? "").trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const d = new Date(jetzt); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() <= jetzt) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function minutenLesen(text) {
  const s = String(text ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const z = Number(s);
  return z > 0 && z <= 600 ? Math.round(z * 60000) : null;
}

export function rundeBeenden(t, jetzt) {
  const w = sicher(t), r = w.runde;
  // Rennen: schnellste gueltige Zeit, die in dieser Runde gefahren wurde
  (t.stationen || []).filter((st) => st.art === "rennen").forEach((st) => {
    const zeiten = (st.zeiten || []).filter((z) => z.n != null && z.info && z.info.n && z.info.n.status !== "offen" && z.info.n.zeit >= r.seit && z.info.n.zeit <= jetzt
      && !(w.ohneTest && istTestName(z.name)));
    if (!zeiten.length) return;
    const best = Math.min(...zeiten.map((z) => z.n));
    buchen(w, { namen: zeiten.filter((z) => z.n === best).map((z) => z.name), punkte: wert(w, `st:${st.id}:best`, RENN_BEST), kat: `st:${st.id}`,
      kname: st.name, emo: EMOJI_ST.rennen, text: "Bestzeit der Runde" }, "", "bestaetigt");
  });
  const tab = stand(w, r.nr).filter((x) => x.summe > 0);
  const max = tab.length ? tab[0].summe : 0;
  const sieger = tab.filter((x) => x.summe === max).map((x) => x.name);
  w.runden.push({ nr: r.nr, sieger, punkte: max, vorher: w.pokal ? [...w.pokal] : null, top: tab.filter((x) => x.platz <= 3).map((x) => ({ name: x.name, punkte: x.summe, platz: x.platz })), ende: jetzt });
  if (sieger.length) w.pokal = sieger;
  w.uebergabe = (w.uebergabe || 0) + 1;
  w.runde = { nr: r.nr + 1, seit: jetzt, start: null, ende: null, dauer: r.dauer };
  if (w.auto && r.dauer) Object.assign(w.runde, { start: jetzt, ende: jetzt + r.dauer });
}

// ---------------------------------------------------------------- Eingaben pruefen (am eigenen Handy)
export function pruefen(a, jetzt = Date.now()) {
  const w = a.werte || [];
  if (a.was === "w_duell") {
    if (!nameSauber(w[1])) return "Bitte eintragen, wer gewonnen hat";
    if (!nameSauber(w[2])) return "Bitte den Gegner eintragen";
    if (gleich(w[1], w[2])) return "Sieger und Gegner müssen verschiedene Leute sein";
  }
  if (a.was === "w_start") {
    if (!String(w[0] ?? "").trim() && !String(w[1] ?? "").trim()) return "Bitte eine Dauer (z. B. 60) oder eine Endzeit (z. B. 22:30) eingeben";
    if (String(w[0] ?? "").trim() && minutenLesen(w[0]) === null) return "Dauer bitte in Minuten, z. B. 60";
    if (!String(w[0] ?? "").trim() && endzeitLesen(w[1], jetzt) === null) return "Endzeit bitte so: 22:30";
  }
  if (a.was === "w_hand") {
    if (!nameSauber(w[0])) return "Bitte einen Namen eingeben";
    if (!/^-?\d{1,3}$/.test(String(w[1] ?? "").trim())) return "Bitte die Punkte als ganze Zahl eingeben, z. B. 3 oder -2";
  }
  if (a.was === "w_werte" && w.some((x) => String(x ?? "").trim() && !/^\d{1,3}$/.test(String(x).trim()))) return "Punkte bitte als ganze Zahlen von 0 bis 999";
  return "";
}

// ---------------------------------------------------------------- Aktionen (nur beim Gastgeber ausgefuehrt)
export function aktion(t, a, { gastgeber, wer = "", jetzt = Date.now(), intern = false, ohneAlkohol = false }) {
  const w = sicher(t), x = a.werte || [];
  const b = a.b != null ? w.buchungen.find((y) => y.id === a.b) : null;
  const darfUrteilen = (y) => gastgeber || y.gegner.some((g) => gleich(g, wer));
  if (a.was === "w_app" && intern) {
    const namen = (a.namen || []).map(nameSauber).filter(Boolean);
    if (!namen.length) return;
    buchen(w, { namen, punkte: wert(w, `app:${a.spiel}`, (APP_WERTE.find((z) => z[0] === a.spiel) || [])[3] ?? 2), kat: `app:${a.spiel}`,
      kname: a.titel || a.spiel, emo: a.emo || "🎮", text: "gewonnen" }, "", "bestaetigt");
  } else if (a.was === "w_duell") {
    const sieger = nameSauber(x[1]), gegner = nameSauber(x[2]);
    if (!sieger || !gegner || gleich(sieger, gegner)) return;
    const st = String(x[0]) === "duell" ? null : (t.stationen || []).find((s) => String(s.id) === String(x[0]) && s.art !== "pong");
    if (String(x[0]) !== "duell" && !st) return;
    buchen(w, { namen: [sieger], gegner: [gegner], punkte: st ? wert(w, `st:${st.id}`, ST_WERT[st.art]) : wert(w, "duell", DUELL_WERT),
      kat: st ? `st:${st.id}` : "duell", kname: st ? st.name : duellName(ohneAlkohol), emo: st ? EMOJI_ST[st.art] : "⚔️", text: "gewonnen" },
      wer, gleich(wer, gegner) ? "bestaetigt" : "offen");
  } else if (a.was === "w_ok" && b && b.info.status !== "bestaetigt" && darfUrteilen(b)) {
    b.info = { ...b.info, status: "bestaetigt", ok: nameSauber(wer) }; b.runde = w.runde.nr;
  } else if (a.was === "w_nein" && b && b.info.status === "offen" && darfUrteilen(b)) {
    b.info = { ...b.info, status: "abgelehnt", ok: nameSauber(wer) }; b.runde = null;
  } else if (a.was === "w_weg" && b && (gastgeber || (gleich(b.info.von, wer) && b.info.status !== "bestaetigt"))) {
    w.buchungen = w.buchungen.filter((y) => y !== b);
  } else if (!gastgeber) {
    return;
  } else if (a.was === "w_hand") {
    const name = nameSauber(x[0]), p = Number(String(x[1] ?? "").trim());
    if (!name || !Number.isInteger(p)) return;
    buchen(w, { namen: [name], punkte: p, kat: "hand", kname: nameSauber(x[2]) || "von der Spielleitung", emo: "✍️", text: "von der Spielleitung" }, wer, "bestaetigt");
  } else if (a.was === "w_werte") {
    werteListe(t, ohneAlkohol).forEach((e, i) => {
      const s = String(x[i] ?? "").trim();
      if (/^\d{1,3}$/.test(s) && Number(s) !== e.def) w.werte[e.k] = Number(s); else delete w.werte[e.k];
    });
  } else if (a.was === "w_start") {
    const dauer = minutenLesen(x[0]), ende = dauer ? jetzt + dauer : endzeitLesen(x[1], jetzt) ?? (w.runde.dauer ? jetzt + w.runde.dauer : null);
    if (!ende) return;
    if (!w.runde.start) w.runde.start = jetzt;
    w.runde.ende = ende;
    w.runde.dauer = dauer || ende - jetzt;
  } else if (a.was === "w_auto") {
    w.auto = !w.auto;
  } else if (a.was === "w_ende" || (a.was === "w_ablauf" && faellig(w, jetzt))) {
    rundeBeenden(t, jetzt);
  } else if (a.was === "w_abend") {
    w.abend = (w.abend || 0) + 1;
  } else if (a.was === "w_reset") {
    t.wertung = neu(jetzt);
  }
}

// Ergebnisse aus einer Station (Bierpong-Baum) mit den Buchungen abgleichen: neue Siege anlegen, zurueckgenommene oder
// geaenderte entfernen. liste = [{key, sieger[], verlierer[]}]; wer = wer gerade getippt hat.
export function stationsSpiele(t, st, liste, wer) {
  const w = sicher(t), vorn = `p${st.id}:`;
  const soll = new Map(liste.map((e) => [e.key, e]));
  const sig = (e) => e.sieger.map(schluessel).join("|");
  w.buchungen = w.buchungen.filter((b) => !b.quelle || !b.quelle.startsWith(vorn) || (soll.has(b.quelle) && sig(soll.get(b.quelle)) === b.sig));
  liste.forEach((e) => {
    if (w.buchungen.some((b) => b.quelle === e.key)) return;
    buchen(w, { namen: e.sieger, gegner: e.verlierer, punkte: wert(w, `st:${st.id}`, ST_WERT.pong), kat: `st:${st.id}`, kname: st.name, emo: EMOJI_ST.pong,
      text: e.titel || "Spiel gewonnen", quelle: e.key, sig: sig(e) }, wer, e.verlierer.some((g) => gleich(g, wer)) ? "bestaetigt" : "offen");
  });
}

// ---------------------------------------------------------------- Anzeige
export function uhrText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sek).padStart(2, "0")}` : `${m}:${String(sek).padStart(2, "0")}`;
}
const uhr = (w, jetzt) => `<span class="tw-uhr" data-countdown="${w.runde.ende}">${uhrText(w.runde.ende - jetzt)}</span>`;
const namenText = (l) => l.map((n) => `<b>${esc(n)}</b>`).join(" & ");
const kname = (b, oa) => (b.kat === "duell" ? duellName(oa) : anzeigeName({ name: b.kname }, oa));

function rundeZeile(w, jetzt) {
  const r = w.runde;
  return r.ende ? `Runde ${r.nr} · ⏱️ ${uhr(w, jetzt)}` : `Runde ${r.nr} · ${r.start ? "läuft" : "noch ohne Zeit"}`;
}

function stimmtBox(w, info) {
  return offenFuer(w, info.meinName).map((b) => `<div class="tw-frage" data-key="tw-f${b.id}" data-ton="dran">
      <p>${namenText(b.namen)} ${b.namen.length > 1 ? "sagen" : "sagt"}: gewonnen gegen dich bei <b>${esc(kname(b, info.ohneAlkohol))}</b> (+${b.punkte})</p>
      <div class="raster2">${knopf("👍 Stimmt", tt("w_ok", { b: b.id }), "gruen", `data-klang="richtig"`)}${knopf("👎 Stimmt nicht", tt("w_nein", { b: b.id }), "rot")}</div></div>`).join("");
}

// Karte oben in der Tafel-Uebersicht
export function renderKarte(t, info, jetzt = Date.now()) {
  const w = sicher(t);
  const tab = stand(w, w.runde.nr).filter((x) => x.summe > 0).slice(0, 3);
  const offen = w.buchungen.filter((b) => b.info.status === "offen").length;
  return `<button class="tw-karte" data-tt-zeige="wertung">
      <span class="tw-kopf"><b>🏅 Gesamtwertung</b><small>${rundeZeile(w, jetzt)}</small></span>
      <span class="tw-top">${tab.length ? tab.map((x) => `${MEDAILLE[x.platz]} ${esc(x.name)} ${x.summe}`).join(" · ") : "Noch keine Punkte in dieser Runde"}</span>
      ${w.pokal ? `<small>🏆 Pokal: ${esc(w.pokal.join(" & "))}</small>` : ""}
      ${info.gastgeber && offen ? `<small>⏳ ${offen} ${offen === 1 ? "Eintrag wartet" : "Einträge warten"} auf Bestätigung</small>` : ""}
    </button>${stimmtBox(w, info)}`;
}

function rangliste(w, nr, info, mitPokal) {
  const tab = stand(w, nr, info.namen);
  const pokal = (n) => mitPokal && w.pokal && w.pokal.some((p) => gleich(p, n));
  return tab.length ? tab.map((x) => `<li class="tt-zeile tw-zeile"><span class="tt-platz">${x.summe > 0 ? MEDAILLE[x.platz] || x.platz + "." : "–"}</span>
      <span class="tt-name">${pokal(x.name) ? "🏆 " : ""}${esc(x.name)}${Object.keys(x.kats).length ? `<small class="tw-kats">${Object.values(x.kats).map((c) => `${c.emo} ${c.punkte}`).join(" · ")}</small>` : ""}</span>
      <b class="tt-wert">${x.summe}</b></li>`).join("") : `<li class="leise">Noch keine Punkte.</li>`;
}

function eintragZeile(b, info, mitKnoepfen) {
  const st = b.info.status;
  const zeichen = st === "bestaetigt" ? "✅" : st === "offen" ? "⏳" : "❌";
  const darfWeg = info.gastgeber || (gleich(b.info.von, info.meinName) && st !== "bestaetigt");
  return `<li class="tt-zeile klein tw-eintrag ${st}"><span class="tt-name">${zeichen} ${esc(b.namen.join(" & "))} <b>${b.punkte >= 0 ? "+" : ""}${b.punkte}</b>
      <small>${b.emo} ${esc(kname(b, info.ohneAlkohol))}${b.gegner.length ? ` gegen ${esc(b.gegner.join(" & "))}` : ""}${b.text && b.kat !== "hand" ? ` · ${esc(b.text)}` : ""}${b.runde ? ` · Runde ${b.runde}` : ""}</small></span>
      ${mitKnoepfen && info.gastgeber && st !== "bestaetigt" ? knopf("✓", tt("w_ok", { b: b.id }), "klein2 gruen") : ""}${mitKnoepfen && darfWeg ? knopf("✕", tt("w_weg", { b: b.id }), "klein2") : ""}</li>`;
}

export function renderWertung(t, ansicht, info, jetzt = Date.now()) {
  const w = sicher(t), r = w.runde, oa = info.ohneAlkohol;
  const orte = (t.stationen || []).filter((st) => st.art !== "pong");
  const meine = wartetVon(w, info.meinName);
  const runden = w.runden.slice().reverse().map((x) => `<li class="tt-zeile klein"><span class="tt-name">Runde ${x.nr}: ${x.sieger.length ? esc(x.sieger.join(" & ")) : "keine Punkte"}</span><b class="tt-wert">${x.punkte}</b></li>`).join("");
  const datalist = `<datalist id="tw-namen">${[...new Set([...(info.namen || []), ...w.buchungen.flatMap((b) => [...b.namen, ...b.gegner])])].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`;
  const status = r.ende ? `endet in ${uhr(w, jetzt)}` : r.start ? "läuft ohne Zeitlimit" : "noch ohne Zeit – Punkte zählen schon";
  const steuer = info.gastgeber ? `
    <div class="tt-form tw-steuer">
      <h3 class="tt-unter">Runde steuern</h3>
      <div class="raster2"><label>Dauer (Minuten)<input id="tt-dauer" inputmode="decimal" maxlength="5" placeholder="60"></label>
        <label>oder Endzeit<input id="tt-endzeit" maxlength="5" placeholder="22:30"></label></div>
      ${knopf(r.ende ? "⏱️ Zeit neu setzen" : `▶️ Runde ${r.nr} starten`, tt("w_start"), "gruen", `data-felder="tt-dauer,tt-endzeit" data-leeren="tt-dauer,tt-endzeit" data-klang="los"`)}
      <div class="schalter tw-auto" data-a='${JSON.stringify(tt("w_auto"))}'><input type="checkbox" ${w.auto ? "checked" : ""} tabindex="-1">
        <span>Nächste Runde startet von selbst<br><small class="leise">sonst per Knopf hier</small></span></div>
      ${knopf(`⏹️ Runde ${r.nr} jetzt beenden`, tt("w_ende"), "zweit", `data-klang="los"`)}
    </div>
    <details class="tt-verlauf"><summary>⚙️ Punkte einstellen</summary>
      <div class="tw-werte">${werteListe(t, oa).map((e, i) => `<label>${esc(e.name)} <small>${esc(e.wofuer)}</small><input id="tt-pw-${i}" inputmode="numeric" maxlength="3" value="${wert(w, e.k, e.def)}"></label>`).join("")}</div>
      ${knopf("💾 Punkte speichern", tt("w_werte"), "zweit blau", `data-felder="${werteListe(t, oa).map((_, i) => `tt-pw-${i}`).join(",")}"`)}
    </details>
    <details class="tt-verlauf"><summary>✍️ Punkte von Hand (Korrektur)</summary>
      <div class="tt-form"><label>Name<input id="tt-hname" maxlength="24" list="tw-namen" placeholder="Name"></label>
        <div class="raster2"><label>Punkte<input id="tt-hpunkte" inputmode="numeric" maxlength="4" placeholder="z. B. 3"></label><label>Wofür<input id="tt-hgrund" maxlength="24" placeholder="z. B. Flunkyball"></label></div>
        ${knopf("➕ Punkte buchen", tt("w_hand"), "zweit", `data-felder="tt-hname,tt-hpunkte,tt-hgrund" data-leeren="tt-hname,tt-hpunkte,tt-hgrund"`)}</div>
    </details>
    ${knopf("🌙 Abendwertung zeigen (an alle)", tt("w_abend"), "gross gelb", `data-klang="los"`)}
    ${ansicht.leeren ? `<div class="raster2">${knopf("Ja, Wertung löschen", tt("w_reset"), "rot")}<button data-tt-leeren-frage>Doch nicht</button></div>`
      : `<button class="zweit" data-tt-leeren-frage>🗑️ Ganze Wertung zurücksetzen</button>`}` : "";
  const nochmal = `${w.runden.length ? `<button class="zweit" data-tt-zeige="pokal">🏆 Letzte Pokal-Übergabe ansehen</button>` : ""}${w.abend ? `<button class="zweit" data-tt-zeige="abend">🌙 Abendwertung ansehen</button>` : ""}`;
  return `${datalist}<div class="tt-kopf"><button class="klein2" data-tt-zeige="">‹ Alle Stationen</button></div>
    <h2 class="tt-titel">🏅 Gesamtwertung</h2>
    <div class="tw-runde"><b>Runde ${r.nr}</b><span>${status}</span>${w.pokal ? `<span>🏆 Pokal: ${esc(w.pokal.join(" & "))}</span>` : ""}</div>
    ${stimmtBox(w, info)}
    <ul class="tt-tabelle">${rangliste(w, r.nr, info, true)}</ul>
    <p class="leise klein">Jede Runde startet bei null. Siege in App-Spielen zählen von selbst. Duelle zählen, sobald der Gegner „Stimmt“ tippt.</p>
    <div class="tt-form">
      <h3 class="tt-unter">⚔️ Sieg eintragen</h3>
      <label>Wo?<select id="tt-wo">${orte.map((st) => `<option value="${st.id}">${EMOJI_ST[st.art]} ${esc(anzeigeName(st, oa))}</option>`).join("")}<option value="duell">⚔️ ${duellName(oa)}</option></select></label>
      <div class="raster2"><label>Gewonnen hat<input id="tt-sieger" maxlength="24" list="tw-namen" value="${esc(info.meinName)}" placeholder="Name"></label>
        <label>gegen<input id="tt-gegner" maxlength="24" list="tw-namen" placeholder="Name"></label></div>
      ${knopf("⚔️ Sieg eintragen", tt("w_duell"), "zweit blau", `data-felder="tt-wo,tt-sieger,tt-gegner" data-leeren="tt-gegner"`)}
      <p class="leise klein">Der Gegner bestätigt am eigenen Handy. Hat er keins, bestätigt die Spielleitung.</p>
    </div>
    ${meine.length ? `<h3 class="tt-unter">Wartet auf Bestätigung</h3><ul class="tt-tabelle">${meine.map((b) => eintragZeile(b, info, true)).join("")}</ul>` : ""}
    ${runden ? `<h3 class="tt-unter">Pokalträger</h3><ul class="tt-tabelle">${runden}</ul>` : ""}
    ${nochmal}${steuer}
    ${w.buchungen.length ? `<details class="tt-verlauf"><summary>Alle Einträge${info.gastgeber ? " (zum Korrigieren)" : ""}</summary><ul class="tt-tabelle">${w.buchungen.slice().reverse().slice(0, 80).map((b) => eintragZeile(b, info, info.gastgeber)).join("")}</ul></details>` : ""}`;
}

// Der grosse Moment am Rundenende: "X uebernimmt den Pokal von Y"
export function renderPokal(t, info) {
  const w = sicher(t), x = w.runden[w.runden.length - 1];
  if (!x) return `<p class="leise mitte">Noch keine Runde beendet.</p><button class="zweit" data-tt-zeige="wertung">‹ Zur Wertung</button>`;
  const vorher = x.vorher && x.vorher.length ? x.vorher : null;
  const gleicheHand = vorher && x.sieger.length && x.sieger.every((n) => vorher.some((v) => gleich(v, n))) && vorher.length === x.sieger.length;
  const mehr = x.sieger.length > 1;
  let satz;
  if (!x.sieger.length) satz = `Keine Punkte in dieser Runde – ${vorher ? `${namenText(vorher)} ${vorher.length > 1 ? "behalten" : "behält"} den Pokal` : "der Pokal bleibt im Schrank"}.`;
  else if (gleicheHand) satz = `${namenText(x.sieger)} ${mehr ? "verteidigen" : "verteidigt"} den Pokal!`;
  else if (vorher) satz = `${namenText(x.sieger)} ${mehr ? "übernehmen" : "übernimmt"} den Pokal von ${namenText(vorher)}!`;
  else satz = `${namenText(x.sieger)} ${mehr ? "holen" : "holt"} sich den Pokal!`;
  const r = w.runde;
  return `<div class="tw-pokal" data-key="tw-pokal-${x.nr}">
      <div class="tw-pokalbild">🏆</div>
      <div class="tt-ehrungtitel">Runde ${x.nr} ist vorbei!</div>
      <p class="tw-uebergabe">${satz}</p>
      ${x.sieger.length ? `<p class="mitte leise">${x.punkte} ${x.punkte === 1 ? "Punkt" : "Punkte"} in dieser Runde</p>` : ""}
      ${x.top.length ? `<div class="tt-podest">${x.top.map((p) => `<div class="tt-rang r${p.platz}"><span>${MEDAILLE[p.platz]}</span><span class="tt-rangnamen"><b>${esc(p.name)} (${p.punkte})</b></span></div>`).join("")}</div>` : ""}
      <div class="hinweisbox warten">${r.ende ? `Runde ${r.nr} läuft schon – alle starten wieder bei null.` : `Gleich geht es mit Runde ${r.nr} weiter – alle starten wieder bei null.`}</div>
    </div>
    <button class="zweit" data-tt-zeige="wertung">‹ Zur Wertung</button>`;
}

export function renderAbend(t, info) {
  const w = sicher(t);
  const tab = stand(w, null).filter((x) => x.summe > 0);
  const traeger = w.runden.filter((x) => x.sieger.length);
  return `<div class="tt-ehrungtitel" data-key="tw-abend-${w.abend}">🌙 Abendwertung</div>
    <p class="mitte leise">Alle Runden zusammengezählt</p>
    ${tab.length ? `<div class="tt-podest">${tab.filter((x) => x.platz <= 3).map((x) => `<div class="tt-rang r${x.platz}"><span>${MEDAILLE[x.platz]}</span><span class="tt-rangnamen"><b>${esc(x.name)} (${x.summe})</b></span></div>`).join("")}</div>` : ""}
    <ul class="tt-tabelle">${rangliste(w, null, info, false)}</ul>
    ${traeger.length ? `<h3 class="tt-unter">🏆 Pokalträger des Abends</h3><ul class="tt-tabelle">${traeger.map((x) => `<li class="tt-zeile klein"><span class="tt-name">Runde ${x.nr}: ${esc(x.sieger.join(" & "))}</span><b class="tt-wert">${x.punkte}</b></li>`).join("")}</ul>` : ""}
    <button class="zweit" data-tt-zeige="wertung">‹ Zur Wertung</button>`;
}
