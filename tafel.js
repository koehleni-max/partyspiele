// Turniertafel fuer den ganzen Abend (Nico 26.10.2026, Huettenparty): Stationen mit Ergebnissen, die neben jedem
// anderen Spiel weiterlaufen. Der Stand liegt NICHT in raum.s (das gehoert dem gerade gewaehlten Spiel), sondern in
// raum.tafel - so blockiert die Tafel kein Spiel und kein Spiel die Tafel. Der Gastgeber haelt ihn und merkt ihn sich
// im Browser-Speicher (pa_tafel), damit ein Neuladen nichts loescht.
// Arten: "pong" (K.-o.-Baum fuer Zweierteams, Freilos bei ungerader Zahl), "punkte" (Dart oder freie Station),
// "rennen" (zwei Zeiten je Fahrer: zuerst / spaeter, Unterschied = wer am meisten nachgelassen hat).
//
// Datenform: jede Station ist eine Kategorie {id, art, name}. Jedes Ergebnis traegt einen Vermerk
// `info = {von, status, zeit}`: wer es eingetragen hat, "offen" oder "bestaetigt", wann. Die Stationstabellen zaehlen
// alles, was nicht "offen" ist (gilt()): punkte -> eintraege[{name, punkte, info}], rennen -> zeiten[{name, n, s,
// info:{n, s}}], pong -> baum[r][m]{a, b, sieger, info} mit teams[{id, a, b}], dazu platz3 {a, b, sieger, info}
// (Spiel um Platz 3 der beiden Halbfinal-Verlierer, Nico 26.10.).
// Die Gesamtwertung mit Runden und Wanderpokal liegt in t.wertung (wertung.js): Bierpong-Siege werden dort als
// Buchung angelegt und zaehlen erst nach "Stimmt" des Gegners; Duelle und App-Spiele kommen ueber wertung.js dazu.
import { esc, knopf, mischen, nameSauber } from "./hilfe.js";
import * as W from "./wertung.js";

const NAME_MAX = 24;
export const SPEICHER = "pa_tafel";
export const STAND = 3;
export { nameSauber };
export const anzeigeName = W.anzeigeName;

export function neu() { return { stand: STAND, stationen: [], nr: 1, ehrung: 0, wertung: W.neu() }; }

// Vermerk an jedem Ergebnis; ein Eintrag ohne Vermerk (aelterer Stand) gilt als bestaetigt
export const vermerk = (von, status = "bestaetigt") => ({ von: nameSauber(von), status, zeit: Date.now() });
export const gilt = (info) => !info || info.status !== "offen";

export function laden(text) {
  try {
    const t = JSON.parse(text);
    if (t && Array.isArray(t.stationen) && Number.isFinite(t.nr)) return { ehrung: 0, ...t, stand: STAND, wertung: W.laden(t.wertung) };
  } catch (e) { /* kaputter Speicher: neu anfangen */ }
  return neu();
}

// ---------------------------------------------------------------- Hilfen
const schluessel = (n) => nameSauber(n).toLocaleLowerCase("de");

export function zahlLesen(t) {
  const s = String(t ?? "").trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const z = Number(s);
  return Number.isFinite(z) && Math.abs(z) <= 100000 ? z : null;
}

// "1:23,45" | "83,45" | "83.4" | "1:23" -> Millisekunden
export function zeitLesen(t) {
  const s = String(t ?? "").trim().replace(",", ".");
  const m = s.match(/^(?:(\d{1,2}):)?(\d{1,4}(?:\.\d{1,3})?)$/);
  if (!m) return null;
  const sek = Number(m[2]);
  if (m[1] !== undefined && sek >= 60) return null;
  const ms = Math.round((Number(m[1] || 0) * 60 + sek) * 1000);
  return ms > 0 && ms < 3600000 ? ms : null;
}

export function zeitText(ms) {
  if (ms == null) return "–";
  const s = ms / 1000;
  if (s < 60) return s.toFixed(2).replace(".", ",") + " s";
  const min = Math.floor(s / 60);
  return `${min}:${(s - min * 60).toFixed(2).padStart(5, "0").replace(".", ",")}`;
}
export const diffText = (ms) => `${ms > 0 ? "+" : ms < 0 ? "−" : "±"}${(Math.abs(ms) / 1000).toFixed(2).replace(".", ",")} s`;
const zahlText = (z) => String(Math.round(z * 100) / 100).replace(".", ",");

// Plaetze mit Gleichstand (1, 1, 3, ...)
function plaetze(liste, wert, kleinerBesser) {
  const s = [...liste].sort((x, y) => (kleinerBesser ? wert(x) - wert(y) : wert(y) - wert(x)));
  return s.map((x, i) => ({ ...x, platz: i > 0 && wert(x) === wert(s[i - 1]) ? null : i + 1 }))
    .map((x, i, a) => { if (x.platz === null) { let k = i; while (a[k].platz === null) k--; x.platz = a[k].platz; } return x; });
}

function station(t, id) { return t.stationen.find((s) => s.id === id); }

// ---------------------------------------------------------------- Turnierbaum
export function rundenName(r, anzahl) {
  const rest = anzahl - r;
  return rest === 1 ? "Finale" : rest === 2 ? "Halbfinale" : rest === 3 ? "Viertelfinale" : `Runde ${r + 1}`;
}

export function baumBauen(teamIds) {
  const ids = mischen([...teamIds]);
  let P = 2; while (P < ids.length) P *= 2;
  const spiele = P / 2, frei = P - ids.length;
  // Freilose verteilen: erst jedes zweite Spiel, dann die Luecken - so treffen sich Freilos-Teams moeglichst spaet
  const reihe = [...Array(spiele).keys()].filter((m) => m % 2 === 0).concat([...Array(spiele).keys()].filter((m) => m % 2 === 1));
  const freiAn = new Set(reihe.slice(0, frei));
  let k = 0;
  const r0 = Array.from({ length: spiele }, (_, m) => (freiAn.has(m) ? { a: ids[k++], b: null, frei: true, sieger: null } : { a: ids[k++], b: ids[k++], sieger: null }));
  const runden = [r0];
  for (let n = spiele / 2; n >= 1; n /= 2) runden.push(Array.from({ length: n }, () => ({ a: null, b: null, sieger: null })));
  fortschreiben(runden);
  return runden;
}

// Sieger nach oben tragen; aendert sich ein frueheres Ergebnis, fallen die davon abhaengigen Sieger weg
export const siegerVon = (s) => (s.sieger != null && gilt(s.info) ? s.sieger : null);
export function fortschreiben(runden) {
  runden[0].forEach((s) => { if (s.frei) s.sieger = s.a; });
  for (let r = 1; r < runden.length; r++) {
    runden[r].forEach((s, m) => {
      const a = siegerVon(runden[r - 1][2 * m]), b = siegerVon(runden[r - 1][2 * m + 1]);
      s.a = a; s.b = b;
      if (s.sieger != null && (a == null || b == null || (s.sieger !== a && s.sieger !== b))) { s.sieger = null; delete s.info; }
    });
  }
}

// Spiel um Platz 3: die beiden Halbfinal-Verlierer. Gibt es nur einen (Halbfinale mit Freilos, z. B. drei Teams),
// ist er allein Dritter und es gibt kein Spiel. Aendert sich ein Halbfinale, faellt ein schon getippter Sieger weg.
const verliererVon = (s) => { const g = siegerVon(s); return g == null || s.frei || s.a == null || s.b == null ? null : g === s.a ? s.b : s.a; };
export function platz3Fortschreiben(st) {
  const runden = st.baum;
  const halb = runden && runden.length >= 2 ? runden[runden.length - 2] : null;
  if (!halb || halb.length !== 2 || halb.some((s) => s.frei)) { st.platz3 = null; return; }
  const p = st.platz3 || { a: null, b: null, sieger: null };
  p.a = verliererVon(halb[0]); p.b = verliererVon(halb[1]);
  if (p.sieger != null && (p.a == null || p.b == null || (p.sieger !== p.a && p.sieger !== p.b))) { p.sieger = null; delete p.info; }
  st.platz3 = p;
}

// Alle entschiedenen Bierpong-Spiele an die Gesamtwertung geben (Sieger-Team bekommt Punkte, Verlierer bestaetigen)
function pongWertung(t, st, wer) {
  const team = (id) => st.teams.find((x) => x.id === id);
  const leute = (id) => { const x = team(id); return x ? [x.a, x.b].filter(Boolean) : []; };
  const liste = [];
  const dazu = (s, key, titel) => { if (siegerVon(s) != null && !s.frei && s.a != null && s.b != null) liste.push({ key, titel, sieger: leute(s.sieger), verlierer: leute(s.sieger === s.a ? s.b : s.a) }); };
  (st.baum || []).forEach((runde, r) => runde.forEach((s, m) => dazu(s, `p${st.id}:${r}:${m}`, `${rundenName(r, st.baum.length)} gewonnen`)));
  if (st.platz3) dazu(st.platz3, `p${st.id}:p3`, "Spiel um Platz 3 gewonnen");
  W.stationsSpiele(t, st, liste, wer);
}

export function pongPodest(st) {
  const name = (id) => { const x = st.teams.find((tm) => tm.id === id); return x ? teamName(x) : "?"; };
  if (!st.baum) return [];
  const runden = st.baum, fin = runden[runden.length - 1][0];
  const p = [];
  if (siegerVon(fin) != null) {
    p.push({ platz: 1, namen: [name(fin.sieger)] });
    p.push({ platz: 2, namen: [name(fin.sieger === fin.a ? fin.b : fin.a)] });
  }
  if (st.platz3 && siegerVon(st.platz3) != null) {
    p.push({ platz: 3, namen: [name(st.platz3.sieger)] });
  } else if (runden.length >= 2) {
    const dritte = runden[runden.length - 2].filter((s) => siegerVon(s) != null && !s.frei && s.a != null && s.b != null)
      .map((s) => name(s.sieger === s.a ? s.b : s.a));
    if (dritte.length) p.push({ platz: 3, namen: dritte });
  }
  return p;
}
export const teamName = (tm) => [tm.a, tm.b].filter(Boolean).join(" & ");

// ---------------------------------------------------------------- Auswertung
function punkteTabelle(st) {
  const je = new Map();
  st.eintraege.filter((e) => gilt(e.info)).forEach((e) => {
    const k = schluessel(e.name);
    const x = je.get(k) || { name: e.name, summe: 0, beste: -Infinity, anzahl: 0 };
    x.summe += e.punkte; x.beste = Math.max(x.beste, e.punkte); x.anzahl++;
    je.set(k, x);
  });
  const wert = st.wertung === "beste" ? (x) => x.beste : (x) => x.summe;
  return plaetze([...je.values()], wert, false).map((x) => ({ ...x, wert: wert(x) }));
}

// eine Zeit zaehlt, wenn sie da ist und nicht noch "offen" auf Bestaetigung wartet
const zeitGilt = (z, feld) => z[feld] != null && gilt(z.info && z.info[feld]);
export function rennenTabellen(st) {
  const schnell = plaetze(st.zeiten.filter((z) => zeitGilt(z, "n")), (z) => z.n, true);
  const nach = plaetze(st.zeiten.filter((z) => zeitGilt(z, "n") && zeitGilt(z, "s")), (z) => z.s - z.n, false);
  return { schnell, nach };
}

function podestAus(tabelle, nameVon) {
  const p = [];
  for (const platz of [1, 2, 3]) {
    const namen = tabelle.filter((x) => x.platz === platz).map(nameVon);
    if (namen.length) p.push({ platz, namen });
  }
  return p;
}

// Siegerehrung je Station: [{titel, podest:[{platz, namen}]}]
export function ehrungen(st, ohneAlkohol) {
  if (st.art === "pong") return [{ titel: anzeigeName(st, ohneAlkohol), podest: pongPodest(st) }];
  if (st.art === "punkte") {
    const tab = punkteTabelle(st);
    return [{ titel: anzeigeName(st, ohneAlkohol), podest: podestAus(tab, (x) => `${x.name} (${zahlText(x.wert)})`) }];
  }
  const { schnell, nach } = rennenTabellen(st);
  return [
    { titel: `${anzeigeName(st, ohneAlkohol)}: schnellste Zeit ${ohneAlkohol ? "im 1. Lauf" : "nüchtern"}`, podest: podestAus(schnell, (z) => `${z.name} (${zeitText(z.n)})`) },
    { titel: `${anzeigeName(st, ohneAlkohol)}: am meisten nachgelassen`, podest: podestAus(nach, (z) => `${z.name} (${diffText(z.s - z.n)})`) },
  ];
}

// "Bierpong" heisst ohne Alkohol "Becher-Pong" (anzeigeName aus wertung.js); eigene Namen bleiben, wie eingegeben
const EMOJI = { pong: "🏓", punkte: "🎯", rennen: "🏁" };
const laufName = (feld, ohneAlkohol) => (feld === "n" ? (ohneAlkohol ? "1. Lauf" : "nüchtern") : (ohneAlkohol ? "2. Lauf" : "später"));

// ---------------------------------------------------------------- Eingaben pruefen (am eigenen Handy, vor dem Senden)
export function pruefen(a) {
  if (String(a.was).startsWith("w_")) return W.pruefen(a);
  const w = a.werte || [];
  if (a.was === "neu" && a.art === "punkte" && a.eigen && !nameSauber(w[0])) return "Bitte einen Namen für die Station eingeben";
  if (a.was === "team" && !nameSauber(w[0]) && !nameSauber(w[1])) return "Bitte mindestens einen Namen eingeben";
  if (a.was === "punkte") {
    if (!nameSauber(w[0])) return "Bitte einen Namen eingeben";
    if (zahlLesen(w[1]) === null) return "Bitte die Punkte als Zahl eingeben, z. B. 60";
  }
  if (a.was === "zeit") {
    if (!nameSauber(w[0])) return "Bitte einen Namen eingeben";
    if (zeitLesen(w[1]) === null) return "Bitte die Zeit so eingeben: 1:23,45 oder 83,45";
  }
  return "";
}

// ---------------------------------------------------------------- Aktionen (nur beim Gastgeber)
export function aktion(t, a, ctx) {
  const { gastgeber, wer = "" } = ctx;
  if (String(a.was).startsWith("w_")) return W.aktion(t, a, ctx);
  W.sicher(t);
  const w = a.werte || [];
  const st = a.id != null ? station(t, a.id) : null;
  if (a.was === "neu" && gastgeber) {
    const name = a.eigen ? nameSauber(w[0]) : a.art === "pong" ? "Bierpong" : a.art === "rennen" ? "Rennen" : "Dart";
    if (!name || !EMOJI[a.art]) return;
    neueStation(t, a.art, name);
  } else if (a.was === "vorlage" && gastgeber) {
    [["pong", "Bierpong"], ["punkte", "Dart"], ["rennen", "Rennen"]].forEach(([art, name]) => neueStation(t, art, name));
  } else if (a.was === "weg" && gastgeber && st) {
    t.stationen = t.stationen.filter((x) => x !== st);
  } else if (a.was === "ehrung" && gastgeber) {
    t.ehrung = (t.ehrung || 0) + 1;
  } else if (a.was === "leeren" && gastgeber) {
    Object.assign(t, { stationen: [], ehrung: t.ehrung || 0 });
  } else if (!st) {
    return;
  } else if (st.art === "pong") {
    if (a.was === "team" && !st.baum) {
      const x = nameSauber(w[0]), y = nameSauber(w[1]);
      if (!x && !y) return;
      st.teams.push({ id: st.teamNr++, a: x || y, b: x ? y : "" });
    } else if (a.was === "teamweg" && !st.baum) {
      st.teams = st.teams.filter((x) => x.id !== a.team);
    } else if (a.was === "auslosen" && gastgeber && st.teams.length >= 2) {
      st.baum = baumBauen(st.teams.map((x) => x.id)); st.platz3 = null;
      platz3Fortschreiben(st); pongWertung(t, st, wer);
    } else if (a.was === "baumweg" && gastgeber) {
      st.baum = null; st.platz3 = null;
      pongWertung(t, st, wer);
    } else if (a.was === "sieg" && st.baum) {
      const s = a.r === "p3" ? st.platz3 : st.baum[a.r] && st.baum[a.r][a.m];
      if (!s || s.frei || s.a == null || s.b == null || (a.team !== s.a && a.team !== s.b)) return;
      if (s.sieger === a.team) { s.sieger = null; delete s.info; }
      else { s.sieger = a.team; s.info = vermerk(wer); }
      fortschreiben(st.baum); platz3Fortschreiben(st); pongWertung(t, st, wer);
    }
  } else if (st.art === "punkte") {
    if (a.was === "punkte") {
      const name = nameSauber(w[0]), p = zahlLesen(w[1]);
      if (!name || p === null) return;
      st.eintraege.push({ id: st.eNr++, name, punkte: p, info: vermerk(wer) });
    } else if (a.was === "eintragweg") {
      st.eintraege = st.eintraege.filter((e) => e.id !== a.e);
    } else if (a.was === "wertung" && gastgeber) {
      st.wertung = st.wertung === "beste" ? "summe" : "beste";
    }
  } else if (st.art === "rennen") {
    if (a.was === "zeit" && (a.feld === "n" || a.feld === "s")) {
      const name = nameSauber(w[0]), ms = zeitLesen(w[1]);
      if (!name || ms === null) return;
      let z = st.zeiten.find((x) => schluessel(x.name) === schluessel(name));
      if (!z) { z = { id: st.eNr++, name, n: null, s: null, info: {} }; st.zeiten.push(z); }
      z[a.feld] = ms;
      z.info = { ...(z.info || {}), [a.feld]: vermerk(wer) };
    } else if (a.was === "zeitweg") {
      st.zeiten = st.zeiten.filter((z) => z.id !== a.e);
    }
  }
}

function neueStation(t, art, name) {
  const st = { id: t.nr++, art, name };
  if (art === "pong") Object.assign(st, { teams: [], teamNr: 1, baum: null });
  if (art === "punkte") Object.assign(st, { eintraege: [], eNr: 1, wertung: "summe" });
  if (art === "rennen") Object.assign(st, { zeiten: [], eNr: 1 });
  t.stationen.push(st);
}

// ---------------------------------------------------------------- Anzeige
const tt = (was, mehr = {}) => ({ typ: "_tafel", was, ...mehr });
const MEDAILLE = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Kurzzeile fuer die Lobby
export function kurz(t, ohneAlkohol) {
  if (!t || !t.stationen.length) return `${ohneAlkohol ? "Becher-Pong" : "Bierpong"}, Dart, Rennen – Ergebnisse für den ganzen Abend`;
  return t.stationen.map((s) => anzeigeName(s, ohneAlkohol)).join(" · ");
}

function stand(st, ohneAlkohol) {
  if (st.art === "pong") {
    if (!st.baum) return `${st.teams.length} ${st.teams.length === 1 ? "Team" : "Teams"} angemeldet`;
    const p = pongPodest(st);
    return p.length && p[0].platz === 1 ? `🏆 ${esc(p[0].namen[0])}` : `${st.teams.length} Teams · Turnier läuft`;
  }
  if (st.art === "punkte") {
    const tab = punkteTabelle(st);
    return tab.length ? `Vorne: ${esc(tab[0].name)} (${zahlText(tab[0].wert)})` : "Noch keine Punkte";
  }
  const { schnell, nach } = rennenTabellen(st);
  if (!schnell.length) return "Noch keine Zeiten";
  return `Schnellste: ${esc(schnell[0].name)} (${zeitText(schnell[0].n)})${nach.length ? ` · Nachgelassen: ${esc(nach[0].name)}` : ""}`;
}

function namensliste(t, info) {
  const n = new Map();
  info.namen.forEach((x) => n.set(schluessel(x), x));
  t.stationen.forEach((st) => {
    (st.eintraege || []).forEach((e) => n.set(schluessel(e.name), e.name));
    (st.zeiten || []).forEach((e) => n.set(schluessel(e.name), e.name));
    (st.teams || []).forEach((e) => [e.a, e.b].filter(Boolean).forEach((x) => n.set(schluessel(x), x)));
  });
  return `<datalist id="tt-namen">${[...n.values()].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`;
}

export function render(t, ansicht, info) {
  t = t || neu();
  if (ansicht.modus === "ehrung") return renderEhrung(t, info);
  if (ansicht.modus === "wertung") return W.renderWertung(t, ansicht, info, info.jetzt);
  if (ansicht.modus === "pokal") return W.renderPokal(t, info);
  if (ansicht.modus === "abend") return W.renderAbend(t, info);
  const st = ansicht.station != null ? station(t, ansicht.station) : null;
  if (st) return namensliste(t, info) + renderStation(st, info);
  return renderUebersicht(t, ansicht, info);
}

function renderUebersicht(t, ansicht, info) {
  const karten = t.stationen.map((st) => `
    <button class="tt-station" data-tt-zeige="${st.id}">
      <span class="tt-emo">${EMOJI[st.art]}</span>
      <span class="tt-stext"><b>${esc(anzeigeName(st, info.ohneAlkohol))}</b><small>${stand(st, info.ohneAlkohol)}</small></span>
      <span class="tt-pfeil">›</span></button>`).join("");
  const leer = !t.stationen.length;
  return `${W.renderKarte(t, info, info.jetzt)}
    <p class="leise mitte tt-hinweis">Läuft den ganzen Abend neben den anderen Spielen. Jeder kann am eigenen Handy Ergebnisse eintragen.</p>
    ${leer ? `<div class="hinweisbox warten">Noch keine Stationen.${info.gastgeber ? "" : " Die Spielleitung legt sie an."}</div>` : `<div class="tt-liste">${karten}</div>`}
    ${info.gastgeber ? `
      ${leer ? knopf("✨ Bierpong, Dart und Rennen anlegen", tt("vorlage"), "gross gruen") : ""}
      <div class="tt-neu">
        <div class="raster3">
          ${knopf("🏓 Bierpong", tt("neu", { art: "pong" }))}${knopf("🎯 Dart", tt("neu", { art: "punkte" }))}${knopf("🏁 Rennen", tt("neu", { art: "rennen" }))}</div>
        <label>Eigene Station (Punkte)<input id="tt-neuname" maxlength="${NAME_MAX}" placeholder="z. B. Flunkyball"></label>
        ${knopf("➕ Station anlegen", tt("neu", { art: "punkte", eigen: true }), "zweit", `data-felder="tt-neuname" data-leeren="tt-neuname"`)}
      </div>
      ${t.stationen.length ? knopf("🏆 Siegerehrung starten", tt("ehrung"), "gross gelb", `data-klang="los"`) : ""}
      ${t.stationen.length ? (ansicht.leeren
        ? `<div class="raster2">${knopf("Ja, alles löschen", tt("leeren"), "rot")}<button data-tt-leeren-frage>Doch nicht</button></div>`
        : `<button class="zweit" data-tt-leeren-frage>🗑️ Tafel leeren</button>`) : ""}`
    : (t.ehrung ? `<button class="zweit" data-tt-zeige="ehrung">🏆 Siegerehrung ansehen</button>` : "")}`;
}

function kopfStation(st, info) {
  return `<div class="tt-kopf"><button class="klein2" data-tt-zeige="">‹ Alle Stationen</button>
    ${info.gastgeber ? knopf("Station löschen", tt("weg", { id: st.id }), "klein2") : ""}</div>
    <h2 class="tt-titel">${EMOJI[st.art]} ${esc(anzeigeName(st, info.ohneAlkohol))}</h2>`;
}

function renderStation(st, info) {
  const kopf = kopfStation(st, info);
  if (st.art === "pong") return kopf + renderPong(st, info);
  if (st.art === "punkte") return kopf + renderPunkte(st, info);
  return kopf + renderRennen(st, info);
}

function renderPong(st, info) {
  const tname = (id) => { const x = st.teams.find((tm) => tm.id === id); return x ? esc(teamName(x)) : ""; };
  if (!st.baum) {
    const liste = st.teams.map((tm) => `<li class="tt-zeile"><span class="tt-name">${esc(teamName(tm))}</span>${knopf("✕", tt("teamweg", { id: st.id, team: tm.id }), "klein2")}</li>`).join("");
    return `
      <p class="leise">Zweierteams anmelden. Sind alle da, lost die Spielleitung den Turnierbaum aus. Bei ungerader Zahl gibt es Freilose.</p>
      <div class="tt-form">
        <label>Spieler 1<input id="tt-a" maxlength="${NAME_MAX}" list="tt-namen" placeholder="Name"></label>
        <label>Spieler 2<input id="tt-b" maxlength="${NAME_MAX}" list="tt-namen" placeholder="Name"></label>
        ${knopf("➕ Team anmelden", tt("team", { id: st.id }), "zweit blau", `data-felder="tt-a,tt-b" data-leeren="tt-a,tt-b"`)}
      </div>
      <h3 class="tt-unter">${st.teams.length} ${st.teams.length === 1 ? "Team" : "Teams"}</h3>
      <ul class="tt-tabelle">${liste || `<li class="leise">Noch keine Teams.</li>`}</ul>
      ${info.gastgeber ? (st.teams.length >= 2 ? knopf("🎲 Turnierbaum auslosen", tt("auslosen", { id: st.id }), "gross", `data-klang="wuerfel"`) : `<p class="leise mitte">Ab zwei Teams kann ausgelost werden.</p>`)
        : `<p class="leise mitte">Die Spielleitung lost aus, sobald alle angemeldet sind.</p>`}`;
  }
  const n = st.baum.length;
  const spiel = (s, r, m) => {
    if (s.frei) return `<div class="tt-spiel frei"><div class="tt-team sieger">${tname(s.a)}</div><small class="leise">Freilos – kommt direkt weiter</small></div>`;
    const seite = (id) => id == null
      ? `<div class="tt-team offen">wartet …</div>`
      : knopf(`${s.sieger === id ? "🏆 " : ""}${tname(id)}`, tt("sieg", { id: st.id, r, m, team: id }), `tt-team ${s.sieger === id ? "sieger" : s.sieger != null ? "raus" : ""}`, `data-klang="richtig"`);
    return `<div class="tt-spiel">${seite(s.a)}<span class="tt-gegen">gegen</span>${seite(s.b)}</div>`;
  };
  // Spiel um Platz 3 steht vor dem Finale
  const platz3 = st.platz3 ? `<h3 class="tt-unter">Spiel um Platz 3</h3>${spiel(st.platz3, "p3", 0)}` : "";
  const runden = st.baum.map((runde, r) => `${r === n - 1 ? platz3 : ""}
    <h3 class="tt-unter">${rundenName(r, n)}</h3>
    ${runde.map((s, m) => spiel(s, r, m)).join("")}`).join("");
  const p = pongPodest(st);
  const sieger = p.length && p[0].platz === 1 ? `<div class="urteil gut">🏆 ${esc(p[0].namen[0])} gewinnt das Turnier!</div>` : "";
  return `${sieger}<p class="leise">Siegerteam antippen. Nochmal antippen nimmt den Sieg zurück.</p>${runden}
    ${info.gastgeber ? knopf("Neu auslosen (Ergebnisse weg)", tt("baumweg", { id: st.id }), "zweit") : ""}`;
}

function renderPunkte(st, info) {
  const tab = punkteTabelle(st);
  const zeilen = tab.map((x) => `<li class="tt-zeile"><span class="tt-platz">${MEDAILLE[x.platz] || x.platz + "."}</span>
    <span class="tt-name">${esc(x.name)}</span><b class="tt-wert">${zahlText(x.wert)}</b></li>`).join("");
  const verlauf = [...st.eintraege].reverse().slice(0, 30).map((e) => `<li class="tt-zeile klein"><span class="tt-name">${esc(e.name)}</span>
    <span class="tt-wert">${zahlText(e.punkte)}</span>${knopf("✕", tt("eintragweg", { id: st.id, e: e.id }), "klein2")}</li>`).join("");
  return `
    <div class="tt-form">
      <label>Name<input id="tt-name" maxlength="${NAME_MAX}" list="tt-namen" value="${esc(info.meinName)}" placeholder="Name"></label>
      <label>Punkte<input id="tt-wert" inputmode="decimal" maxlength="8" placeholder="z. B. 60"></label>
      ${knopf("➕ Eintragen", tt("punkte", { id: st.id }), "zweit blau", `data-felder="tt-name,tt-wert" data-leeren="tt-wert"`)}
    </div>
    <div class="tt-unterzeile"><h3 class="tt-unter">Tabelle</h3>
      ${info.gastgeber ? knopf(st.wertung === "beste" ? "Wertung: bester Wurf" : "Wertung: alles zusammen", tt("wertung", { id: st.id }), "klein2")
        : `<small class="leise">${st.wertung === "beste" ? "bester Wurf zählt" : "alles zusammen"}</small>`}</div>
    <ul class="tt-tabelle">${zeilen || `<li class="leise">Noch keine Punkte.</li>`}</ul>
    ${verlauf ? `<details class="tt-verlauf"><summary>Letzte Einträge (zum Korrigieren)</summary><ul class="tt-tabelle">${verlauf}</ul></details>` : ""}`;
}

function renderRennen(st, info) {
  const oa = info.ohneAlkohol;
  const { schnell, nach } = rennenTabellen(st);
  const nachPlatz = new Map(nach.map((z) => [z.id, z.platz]));
  const sortiert = [...st.zeiten].sort((x, y) => {
    const dx = x.n != null && x.s != null ? x.s - x.n : null, dy = y.n != null && y.s != null ? y.s - y.n : null;
    if (dx != null && dy != null) return dy - dx;
    if (dx != null || dy != null) return dx != null ? -1 : 1;
    return (x.n ?? Infinity) - (y.n ?? Infinity);
  });
  const zeilen = sortiert.map((z) => {
    const d = z.n != null && z.s != null ? z.s - z.n : null;
    const pl = nachPlatz.get(z.id);
    return `<li class="tt-renn">
      <div class="tt-rennkopf"><span class="tt-name">${pl ? (MEDAILLE[pl] || pl + ".") + " " : ""}${esc(z.name)}</span>${knopf("✕", tt("zeitweg", { id: st.id, e: z.id }), "klein2")}</div>
      <div class="tt-drei"><span><small>${laufName("n", oa)}</small>${zeitText(z.n)}</span><span><small>${laufName("s", oa)}</small>${zeitText(z.s)}</span>
        <span class="${d > 0 ? "tt-schlechter" : d < 0 ? "tt-besser" : ""}"><small>Unterschied</small>${d == null ? "–" : diffText(d)}</span></div></li>`;
  }).join("");
  return `
    <p class="leise">Jeder fährt ${oa ? "zweimal" : "zu Beginn einmal nüchtern und später noch einmal"}. Zeit so eingeben: 1:23,45 oder 83,45.</p>
    <div class="tt-form">
      <label>Fahrer<input id="tt-name" maxlength="${NAME_MAX}" list="tt-namen" value="${esc(info.meinName)}" placeholder="Name"></label>
      <label>Zeit<input id="tt-wert" maxlength="9" placeholder="1:23,45"></label>
      <div class="raster2">${knopf(`⏱️ als ${laufName("n", oa)}`, tt("zeit", { id: st.id, feld: "n" }), "blau", `data-felder="tt-name,tt-wert" data-leeren="tt-wert"`)}${knopf(`⏱️ als ${laufName("s", oa)}`, tt("zeit", { id: st.id, feld: "s" }), "pink", `data-felder="tt-name,tt-wert" data-leeren="tt-wert"`)}</div>
    </div>
    ${schnell.length ? `<div class="tt-fuehrung"><div><small>Schnellste Zeit ${oa ? "im 1. Lauf" : "nüchtern"}</small><b>${esc(schnell[0].name)}</b> ${zeitText(schnell[0].n)}</div>
      ${nach.length ? `<div><small>Wer hat am meisten nachgelassen?</small><b>${esc(nach[0].name)}</b> ${diffText(nach[0].s - nach[0].n)}</div>` : ""}</div>` : ""}
    <h3 class="tt-unter">Alle Fahrer</h3>
    <ul class="tt-tabelle">${zeilen || `<li class="leise">Noch keine Zeiten.</li>`}</ul>`;
}

function renderEhrung(t, info) {
  const bloecke = t.stationen.flatMap((st) => ehrungen(st, info.ohneAlkohol).map((e) => ({ ...e, st })));
  const html = bloecke.map((e, k) => `
    <div class="tt-podest" data-key="tt-e${t.ehrung}-${k}" data-ton="stern" data-ton-nach="${900 + k * 700}" style="animation-delay:${0.4 + k * 0.7}s">
      <h3>${EMOJI[e.st.art]} ${esc(e.titel)}</h3>
      ${e.podest.length ? e.podest.map((p) => `<div class="tt-rang r${p.platz}"><span>${MEDAILLE[p.platz]}</span><span class="tt-rangnamen">${p.namen.map((n) => `<b>${esc(n)}</b>`).join("")}</span></div>`).join("")
        : `<p class="leise">Noch kein Ergebnis.</p>`}
    </div>`).join("");
  return `<div class="tt-ehrungtitel">🏆 Siegerehrung</div>${html || `<p class="leise mitte">Noch keine Stationen.</p>`}
    <button class="zweit" data-tt-zeige="">‹ Zur Tafel</button>`;
}
