// Fragespiele mit Kategorien: Ich hab noch nie, Wer wuerde eher, Wahrheit oder Pflicht, Lieber ... oder ..., Paranoia.
// Zu Beginn waehlt der Gastgeber die Kategorien; Spicy und 18+ nur, wenn in der Lobby "alle ueber 18" bestaetigt ist.
import { esc, knopf, zufall, mischen, name, schlucke } from "./hilfe.js";
import { KATEGORIEN } from "./fragen.js";

const katInfo = (id) => KATEGORIEN.find((k) => k.id === id);
// vorgewaehlt: Klassiker und Party, im Halloween-Aussehen dazu die Halloween-Karten
const startKats = (raum) => (raum && raum.look === "halloween" ? ["klassiker", "party", "halloween"] : ["klassiker", "party"]);

// Pflicht-Karten, die ans Trinken gebunden sind (Exen, Schlucke, Shot ...): ohne Trinken (s.ohne) kommen sie nicht
export const TRINKKARTE = /trink|getrunken|schluck|\bex(e|en)?\b|\bexe\b|shot/i;
const trinkfrei = (s, feld, t) => !(s.ohne && feld === "pflicht" && TRINKKARTE.test(t));
function pool(s, feld) {
  const liste = [];
  for (const id of s.kats) (katInfo(id)[feld] || []).forEach((t, i) => { if (trinkfrei(s, feld, t)) liste.push([id, t, i]); });
  return liste;
}
// Ohne Wiederholung am ganzen Abend: der Raum merkt sich je Kategorie und Kartenart die gezogenen Nummern (stapel.js).
// Ohne raum (alte Aufrufe, Tests): je Partie ueber s.gesehen.
function ziehen(s, feld, raum) {
  s.gesehen = s.gesehen || {};
  const alle = pool(s, feld);
  if (!alle.length) return ["klassiker", "Keine Karten in diesen Kategorien – wählt weitere aus!"];
  const schluessel = (k) => `${feld}.${k}`;
  if (raum && (!raum.gezogen || typeof raum.gezogen !== "object")) raum.gezogen = {};
  const schon = (k, i, t) => (raum ? (raum.gezogen[schluessel(k)] || []).includes(i) : !!s.gesehen[t]);
  let frei = alle.filter(([k, t, i]) => !schon(k, i, t));
  if (!frei.length) {
    if (raum) s.kats.forEach((k) => { delete raum.gezogen[schluessel(k)]; }); else s.gesehen = {};
    frei = alle;
  }
  const w = frei[zufall(frei.length)];
  if (raum) raum.gezogen[schluessel(w[0])] = [...(raum.gezogen[schluessel(w[0])] || []), w[2]];
  else s.gesehen[w[1]] = 1;
  // Kartennummer (frueher s.zaehler - der Name gehoert seit dem Schluck-Zaehler dessen Daten: "#[object Object]" auf der Karte)
  s.kartenNr = (s.kartenNr || 0) + 1;
  return [w[0], w[1]];
}

function katWahl(s, ich, namen, feld, ab18) {
  const verfuegbar = KATEGORIEN.filter((k) => (k[feld] || []).length);
  const anzahl = pool(s, feld).length;
  return `<div class="frage">Welche Kategorien spielt ihr?</div>
    <div class="kategorien">${verfuegbar.map((k) => {
      const gesperrt = k.ab18 && !ab18;
      const an = s.kats.includes(k.id);
      return `<button class="katknopf ${an ? "an" : ""} ${gesperrt ? "gesperrt" : ""}" style="--k1:${k.farben[0]};--k2:${k.farben[1]}"
        ${ich === 0 && !gesperrt ? `data-a='${JSON.stringify({ typ: "_kat", id: k.id })}'` : ""}>
        <span class="emo">${k.emoji}</span><b>${esc(k.name)}</b><small>${gesperrt ? "🔒 erst „Alle über 18“ in der Lobby" : `${(k[feld] || []).length} Karten · ${esc(k.kurz)}`}</small></button>`;
    }).join("")}</div>
    <p class="mitte leise">${anzahl} Karten ausgewählt</p>
    ${ich === 0 ? knopf("Los geht's! 🚀", { typ: "_katfertig" }, "gross gruen", anzahl ? "" : "disabled") : `<div class="hinweisbox warten">${esc(namen[0])} wählt die Kategorien …</div>`}`;
}

function katAktion(s, i, a, ab18) {
  if (i !== 0) return false;
  if (a.typ === "_kat") {
    const k = katInfo(a.id);
    if (!k || (k.ab18 && !ab18)) return true;
    s.kats = s.kats.includes(a.id) ? s.kats.filter((x) => x !== a.id) : [...s.kats, a.id];
    return true;
  }
  if (a.typ === "_katfertig" && s.kats.length) { s.phase = "spiel"; return "start"; }
  if (a.typ === "_kats") { s.phase = "kats"; return true; }
  return false;
}

const karte = (s, katId, vor, text) => {
  const k = katInfo(katId);
  // Schritt 4b: die Karte wird vom Stapel gezogen (Auftritt einmal je Karte, weich.js) - mit Kartengeraeusch
  return `<div class="fragekarte fk-zieh" data-key="${esc(text).slice(0, 60)}" data-ton="karte" style="--k1:${k.farben[0]};--k2:${k.farben[1]}">
    <span class="kat">${k.emoji} ${esc(k.name)}</span>${vor ? `<div class="vor">${vor}</div>` : ""}<div class="text">${esc(text)}</div><span class="nr">#${s.kartenNr || 1}</span></div>`;
};
// Spieler-Chip (Farbe des Spielers); data-key je Runde und Spieler: springt genau einmal herein
const chip = (namen, j, key, ton, vor = "") => `<span class="st-chip" data-key="${key}"${ton ? ` data-ton="${ton}"` : ""}><span class="farbe f${j}"></span>${vor}${esc(namen[j])}</span>`;
const katKnopf = (ich) => (ich === 0 ? knopf("⚙️ Kategorien ändern", { typ: "_kats" }, "zweit") : "");

// ================================================================ Ich hab noch nie
export const nochNie = {
  id: "nochnie", name: "Ich hab noch nie …", emoji: "🙈", kurz: "Wer es schon gemacht hat, trinkt", farben: ["#ff5fae", "#7b2ff7"],
  start: (namen, raum) => ({ phase: "kats", kats: startKats(raum), hab: {} }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "nochnie", raum); s.hab = {}; return; }
    if (r) return;
    if (a.typ === "hab") s.hab[i] = !s.hab[i];
    if (a.typ === "weiter") { s.hab = {}; s.karte = ziehen(s, "nochnie", raum); }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "nochnie", raum.ab18);
    const wer = namen.map((n, j) => (s.hab[j] ? j : -1)).filter((j) => j >= 0);
    return `${karte(s, s.karte[0], "Ich hab noch nie …", s.karte[1])}
      ${knopf(s.hab[ich] ? "🍺 Erwischt – ich trinke!" : "🙋 Hab ich schon gemacht", { typ: "hab" }, `gross ${s.hab[ich] ? "rot" : "pink"}`)}
      <div class="nn-gestaendnis"><div class="nn-zahl"><b data-zahl="${wer.length}">${wer.length}</b><small>von ${namen.length} haben's getan</small></div>
        <div class="nn-chips">${wer.length ? wer.map((j) => chip(namen, j, `nn${s.kartenNr}-${j}`, "pop", "🍺 ")).join("") : "<span class='leise'>Noch hat niemand gestanden …</span>"}</div></div>
      ${knopf("Nächste Karte ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
  },
};

// ================================================================ Wer wuerde eher
export const werWuerde = {
  id: "werwuerde", name: "Wer würde eher …", emoji: "👉", kurz: "Alle zeigen auf jemanden – Mehrheit trinkt", farben: ["#1cb0f6", "#3b2fbf"],
  start: (namen, raum) => ({ phase: "kats", kats: startKats(raum), stimmen: {} }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "wer", raum); s.stimmen = {}; s.ergebnis = false; return; }
    if (r) return;
    if (a.typ === "stimme" && !s.ergebnis) { s.stimmen[i] = a.ziel; if (Object.keys(s.stimmen).length >= namen.length) s.ergebnis = true; }
    if (a.typ === "weiter") { s.stimmen = {}; s.ergebnis = false; s.karte = ziehen(s, "wer", raum); }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "wer", raum.ab18);
    if (!s.ergebnis) return `${karte(s, s.karte[0], "Wer würde eher …", s.karte[1])}
      <div class="raster">${namen.map((n, j) => knopf(esc(n), { typ: "stimme", ziel: j }, `wahl ${s.stimmen[ich] === j ? "gewaehlt" : ""}`)).join("")}</div>
      <p class="mitte leise">${s.stimmen[ich] !== undefined ? "Gewählt – warte auf die anderen" : "Tippe auf eine Person"} (<b data-zahl="${Object.keys(s.stimmen).length}">${Object.keys(s.stimmen).length}</b>/${namen.length})</p>
      <div class="ww-stimmen">${namen.map((_, j) => (s.stimmen[j] !== undefined ? `<i class="da" data-key="wwv${s.kartenNr}-${j}" data-ton="klick" title="${esc(namen[j])}"><span class="farbe f${j}"></span></i>` : `<i title="${esc(namen[j])}"><span class="farbe f${j}"></span></i>`)).join("")}</div>`;
    const zaehl = namen.map((_, j) => Object.values(s.stimmen).filter((z) => z === j).length);
    const max = Math.max(...zaehl);
    const verl = zaehl.map((z, j) => (z === max ? j : -1)).filter((j) => j >= 0);
    // Aufloesung: Balken wachsen nacheinander (Reihenfolge ueber --i), Stimmen zaehlen hoch, die Meisten bekommen die Krone
    return `<div class="frage klein3">${esc(s.karte[1])}</div>
      <div class="balken ww-ergebnis" data-key="wb${s.kartenNr}" data-ton="wirbel">${namen.map((n, j) => `<div class="zeile ${zaehl[j] === max && max > 0 ? "top" : ""}" style="--i:${j}"><span>${zaehl[j] === max && max > 0 ? "👑 " : ""}${esc(n)}</span><div class="b" style="width:${(zaehl[j] / namen.length) * 100}%"></div><b>${zaehl[j]}</b></div>`).join("")}</div>
      <div class="urteil" data-key="u${s.kartenNr}">🍺 ${verl.map((j) => name(namen, j)).join(" & ")} ${verl.length > 1 ? "trinken" : "trinkt"} ${schlucke(max)}</div>
      ${knopf("Nächste Karte ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
  },
};

// ================================================================ Wahrheit oder Pflicht
export const wop = {
  id: "wop", name: "Wahrheit oder Pflicht", emoji: "🎭", kurz: "Reihum – wer kneift, trinkt doppelt", farben: ["#ff4b4b", "#7a1fa2"],
  start: (namen, raum) => ({ phase: "kats", kats: startKats(raum), dran: 0, karte: null, art: null }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = null; return; }
    if (r) return;
    if (a.typ === "wahl" && i === s.dran && !s.karte) { s.art = a.art; s.karte = ziehen(s, a.art === "w" ? "wahrheit" : "pflicht", raum); }
    if (a.typ === "weiter") { s.dran = (s.dran + 1) % namen.length; s.karte = null; s.art = null; }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "pflicht", raum.ab18);
    // Schritt 4b: zwei grosse Karten zur Wahl (Wahrheit blau, Pflicht rot), wer dran ist, hoert den Dran-Klang
    if (!s.karte) return `<div class="frage">${name(namen, s.dran)} ist dran</div>${ich === s.dran ? `<i hidden data-key="wopd${s.kartenNr || 0}-${s.dran}" data-ton="dran"></i>` : ""}
      ${ich === s.dran ? `<div class="raster2 wop-wahl">${knopf("<span class='wop-emo'>🗣️</span>Wahrheit<small>ehrlich antworten</small>", { typ: "wahl", art: "w" }, "gross blau")}${knopf("<span class='wop-emo'>🔥</span>Pflicht<small>Aufgabe erledigen</small>", { typ: "wahl", art: "p" }, "gross rot")}</div>`
                       : `<div class="raster2 wop-wahl warten"><div class="wop-zu blau"><span class="wop-emo">🗣️</span>Wahrheit</div><div class="wop-zu rot"><span class="wop-emo">🔥</span>Pflicht</div></div><div class="hinweisbox warten">${esc(namen[s.dran])} wählt gerade …</div>`}${katKnopf(ich)}`;
    // data-ergebnis: die Karte steht erst eine Weile, bevor "Erledigt" geht (app.js, kein Wegtippen per Doppeltipp)
    return `<i hidden data-ergebnis="wop${s.kartenNr}"></i><div class="wop-karte ${s.art === "w" ? "w" : "p"}">${karte(s, s.karte[0], `${s.art === "w" ? "🗣️ WAHRHEIT" : "🔥 PFLICHT"} für ${esc(namen[s.dran])}`, s.karte[1])}</div>
      <p class="mitte leise">Kneifen? Dann ${schlucke(2)}.</p>${knopf("Erledigt – nächster ➜", { typ: "weiter" }, "gross")}`;
  },
};

// ================================================================ Lieber ... oder ...
export const lieber = {
  id: "lieber", name: "Lieber … oder …?", emoji: "⚖️", kurz: "Alle wählen – die Minderheit trinkt", farben: ["#ff9600", "#c2185b"],
  start: (namen, raum) => ({ phase: "kats", kats: startKats(raum), stimmen: {} }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "lieber", raum); s.stimmen = {}; return; }
    if (r) return;
    if (a.typ === "seite" && s.stimmen[i] === undefined) s.stimmen[i] = a.s;
    if (a.typ === "weiter") { s.karte = ziehen(s, "lieber", raum); s.stimmen = {}; }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "lieber", raum.ab18);
    const [a, b] = s.karte[1].split(" ODER ");
    const alle = Object.keys(s.stimmen).length >= namen.length;
    const k = katInfo(s.karte[0]);
    let unten;
    if (!alle) unten = s.stimmen[ich] === undefined
      ? `<div class="raster2">${knopf(esc(a), { typ: "seite", s: 0 }, "gross blau wahl")}${knopf(esc(b), { typ: "seite", s: 1 }, "gross pink wahl")}</div>`
      : `<div class="hinweisbox warten">Gewählt – warte (${Object.keys(s.stimmen).length}/${namen.length})</div>`;
    else {
      const seiten = [0, 1].map((x) => namen.map((_, j) => j).filter((j) => s.stimmen[j] === x));
      const minder = seiten[0].length === seiten[1].length ? [] : seiten[0].length < seiten[1].length ? seiten[0] : seiten[1];
      // Aufloesung: zwei Lager, die Mehrheit hat die groessere Zahl; die Seiten fahren von links und rechts herein
      unten = `<div class="raster2 lb-lager" data-key="lr${s.kartenNr}" data-ton="tada"><div class="karte-gross blau lb-links"><small>${esc(a)}</small><b class="lb-zahl">${seiten[0].length}</b>${seiten[0].map((j) => name(namen, j)).join("<br>") || "–"}</div>
        <div class="karte-gross rot lb-rechts"><small>${esc(b)}</small><b class="lb-zahl">${seiten[1].length}</b>${seiten[1].map((j) => name(namen, j)).join("<br>") || "–"}</div></div>
        <div class="urteil" data-key="l${s.kartenNr}">${minder.length ? `🍺 Minderheit trinkt: ${minder.map((j) => name(namen, j)).join(", ")}` : "Unentschieden – alle trinken einen! 🍻"}</div>
        ${knopf("Nächste Karte ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
    }
    // Schritt 4b: die beiden Moeglichkeiten stehen sich gegenueber (blau gegen pink, VS in der Mitte)
    return `<div class="fragekarte fk-zieh lb-karte" data-key="${esc(s.karte[1]).slice(0, 60)}" data-ton="karte" style="--k1:${k.farben[0]};--k2:${k.farben[1]}"><span class="kat">${k.emoji} ${esc(k.name)}</span>
      <div class="vor">Was würdest du lieber?</div><div class="text lb-vs"><span class="lb-a">${esc(a)}</span><i>VS</i><span class="lb-b">${esc(b)}</span></div></div>${unten}`;
  },
};

// ================================================================ Paranoia
export const paranoia = {
  id: "paranoia", name: "Paranoia", emoji: "🤫", kurz: "Nur einer sieht die Frage – und nennt laut einen Namen", farben: ["#2b2d42", "#6d5dfc"],
  start: (namen, raum) => ({ phase: "kats", kats: startKats(raum), leser: 0, antwort: null, aufgedeckt: null }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "wer", raum); s.antwort = null; s.aufgedeckt = null; return; }
    if (r) return;
    // Kein Muenzwurf mehr (Nico 31.10.2026: "die Frage wurde eh immer erfragt") - nach dem Nennen sehen alle die Frage
    if (a.typ === "nenne" && i === s.leser && s.antwort === null && a.ziel !== i && namen[a.ziel] !== undefined) { s.antwort = a.ziel; s.aufgedeckt = true; }
    if (a.typ === "weiter" && s.antwort !== null) { s.leser = (s.leser + 1) % namen.length; s.karte = ziehen(s, "wer", raum); s.antwort = null; s.aufgedeckt = null; }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "wer", raum.ab18);
    const leser = s.leser;
    if (s.antwort === null) {
      if (ich === leser) return `<div class="frage">Psst – nur du siehst das!</div>${karte(s, s.karte[0], "Wer hier würde eher …", s.karte[1])}
        <p class="mitte">Wen nennst du? Sag den Namen gleich auch laut.</p>
        <div class="raster">${namen.map((n, j) => (j === ich ? "" : knopf(esc(n), { typ: "nenne", ziel: j }, "wahl"))).join("")}</div>`;
      return `<div class="frage">${name(namen, leser)} liest heimlich eine Frage …</div><div class="logo mitte pa-psst" style="display:block">🤫</div>`;
    }
    const betroffen = s.antwort;
    return `<div class="urteil pa-enthuellt" data-key="pa${s.kartenNr}" data-ton="spannung">${name(namen, leser)} hat ${name(namen, betroffen)} genannt!</div>
      ${karte(s, s.karte[0], "Die Frage war: Wer würde eher …", s.karte[1])}
      <p class="mitte">🍺 ${esc(namen[betroffen])} trinkt einen Schluck.</p>
      ${knopf("Nächste Runde ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
  },
};

export const FRAGESPIELE = [nochNie, werWuerde, wop, lieber, paranoia];
