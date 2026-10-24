// Fragespiele mit Kategorien: Ich hab noch nie, Wer wuerde eher, Wahrheit oder Pflicht, Lieber ... oder ..., Paranoia.
// Zu Beginn waehlt der Gastgeber die Kategorien; Spicy und 18+ nur, wenn in der Lobby "alle ueber 18" bestaetigt ist.
import { esc, knopf, zufall, mischen, name, schlucke } from "./hilfe.js";
import { KATEGORIEN } from "./fragen.js";

const katInfo = (id) => KATEGORIEN.find((k) => k.id === id);

function pool(s, feld) {
  const liste = [];
  for (const id of s.kats) for (const t of katInfo(id)[feld] || []) liste.push([id, t]);
  return liste;
}
function ziehen(s, feld) {
  s.gesehen = s.gesehen || {};
  const alle = pool(s, feld);
  if (!alle.length) return ["klassiker", "Keine Karten in diesen Kategorien – wählt weitere aus!"];
  let frei = alle.filter(([k, t]) => !s.gesehen[t]);
  if (!frei.length) { s.gesehen = {}; frei = alle; }
  const w = frei[zufall(frei.length)];
  s.gesehen[w[1]] = 1;
  s.zaehler = (s.zaehler || 0) + 1;
  return w;
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
  return `<div class="fragekarte" data-key="${esc(text).slice(0, 60)}" style="--k1:${k.farben[0]};--k2:${k.farben[1]}">
    <span class="kat">${k.emoji} ${esc(k.name)}</span>${vor ? `<div class="vor">${vor}</div>` : ""}<div class="text">${esc(text)}</div><span class="nr">#${s.zaehler || 1}</span></div>`;
};
const katKnopf = (ich) => (ich === 0 ? knopf("⚙️ Kategorien ändern", { typ: "_kats" }, "zweit") : "");

// ================================================================ Ich hab noch nie
export const nochNie = {
  id: "nochnie", name: "Ich hab noch nie …", emoji: "🙈", kurz: "Wer es schon gemacht hat, trinkt", farben: ["#ff5fae", "#7b2ff7"],
  start: () => ({ phase: "kats", kats: ["klassiker", "party"], hab: {} }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "nochnie"); s.hab = {}; return; }
    if (r) return;
    if (a.typ === "hab") s.hab[i] = !s.hab[i];
    if (a.typ === "weiter") { s.hab = {}; s.karte = ziehen(s, "nochnie"); }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "nochnie", raum.ab18);
    const wer = namen.map((n, j) => (s.hab[j] ? j : -1)).filter((j) => j >= 0);
    return `${karte(s, s.karte[0], "Ich hab noch nie …", s.karte[1])}
      ${knopf(s.hab[ich] ? "🍺 Erwischt – ich trinke!" : "🙋 Hab ich schon gemacht", { typ: "hab" }, `gross ${s.hab[ich] ? "rot" : "pink"}`)}
      <p class="mitte">${wer.length ? `Trinken: ${wer.map((j) => name(namen, j)).join(", ")}` : "<span class='leise'>Noch hat niemand gestanden …</span>"}</p>
      ${knopf("Nächste Karte ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
  },
};

// ================================================================ Wer wuerde eher
export const werWuerde = {
  id: "werwuerde", name: "Wer würde eher …", emoji: "👉", kurz: "Alle zeigen auf jemanden – Mehrheit trinkt", farben: ["#1cb0f6", "#3b2fbf"],
  start: () => ({ phase: "kats", kats: ["klassiker", "party"], stimmen: {} }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "wer"); s.stimmen = {}; s.ergebnis = false; return; }
    if (r) return;
    if (a.typ === "stimme" && !s.ergebnis) { s.stimmen[i] = a.ziel; if (Object.keys(s.stimmen).length >= namen.length) s.ergebnis = true; }
    if (a.typ === "weiter") { s.stimmen = {}; s.ergebnis = false; s.karte = ziehen(s, "wer"); }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "wer", raum.ab18);
    if (!s.ergebnis) return `${karte(s, s.karte[0], "Wer würde eher …", s.karte[1])}
      <div class="raster">${namen.map((n, j) => knopf(esc(n), { typ: "stimme", ziel: j }, `wahl ${s.stimmen[ich] === j ? "gewaehlt" : ""}`)).join("")}</div>
      <p class="mitte leise">${s.stimmen[ich] !== undefined ? "Gewählt – warte auf die anderen" : "Tippe auf eine Person"} (${Object.keys(s.stimmen).length}/${namen.length})</p>`;
    const zaehl = namen.map((_, j) => Object.values(s.stimmen).filter((z) => z === j).length);
    const max = Math.max(...zaehl);
    const verl = zaehl.map((z, j) => (z === max ? j : -1)).filter((j) => j >= 0);
    return `<div class="frage klein3">${esc(s.karte[1])}</div>
      <div class="balken">${namen.map((n, j) => `<div class="zeile"><span>${esc(n)}</span><div class="b" style="width:${(zaehl[j] / namen.length) * 100}%"></div><b>${zaehl[j]}</b></div>`).join("")}</div>
      <div class="urteil" data-key="u${s.zaehler}">🍺 ${verl.map((j) => name(namen, j)).join(" & ")} ${verl.length > 1 ? "trinken" : "trinkt"} ${schlucke(max)}</div>
      ${knopf("Nächste Karte ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
  },
};

// ================================================================ Wahrheit oder Pflicht
export const wop = {
  id: "wop", name: "Wahrheit oder Pflicht", emoji: "🎭", kurz: "Reihum – wer kneift, trinkt doppelt", farben: ["#ff4b4b", "#7a1fa2"],
  start: () => ({ phase: "kats", kats: ["klassiker", "party"], dran: 0, karte: null, art: null }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = null; return; }
    if (r) return;
    if (a.typ === "wahl" && i === s.dran && !s.karte) { s.art = a.art; s.karte = ziehen(s, a.art === "w" ? "wahrheit" : "pflicht"); }
    if (a.typ === "weiter") { s.dran = (s.dran + 1) % namen.length; s.karte = null; s.art = null; }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "pflicht", raum.ab18);
    if (!s.karte) return `<div class="frage">${name(namen, s.dran)} ist dran</div>
      ${ich === s.dran ? `<div class="raster2">${knopf("🗣️ Wahrheit", { typ: "wahl", art: "w" }, "gross blau")}${knopf("🔥 Pflicht", { typ: "wahl", art: "p" }, "gross rot")}</div>`
                       : `<div class="hinweisbox warten">${esc(namen[s.dran])} wählt gerade …</div>`}${katKnopf(ich)}`;
    return `${karte(s, s.karte[0], `${s.art === "w" ? "🗣️ WAHRHEIT" : "🔥 PFLICHT"} für ${esc(namen[s.dran])}`, s.karte[1])}
      <p class="mitte leise">Kneifen? Dann ${schlucke(2)}.</p>${knopf("Erledigt – nächster ➜", { typ: "weiter" }, "gross")}`;
  },
};

// ================================================================ Lieber ... oder ...
export const lieber = {
  id: "lieber", name: "Lieber … oder …?", emoji: "⚖️", kurz: "Alle wählen – die Minderheit trinkt", farben: ["#ff9600", "#c2185b"],
  start: () => ({ phase: "kats", kats: ["klassiker", "party"], stimmen: {} }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "lieber"); s.stimmen = {}; return; }
    if (r) return;
    if (a.typ === "seite" && s.stimmen[i] === undefined) s.stimmen[i] = a.s;
    if (a.typ === "weiter") { s.karte = ziehen(s, "lieber"); s.stimmen = {}; }
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
      unten = `<div class="raster2"><div class="karte-gross blau"><small>${esc(a)}</small>${seiten[0].map((j) => name(namen, j)).join("<br>") || "–"}</div>
        <div class="karte-gross rot"><small>${esc(b)}</small>${seiten[1].map((j) => name(namen, j)).join("<br>") || "–"}</div></div>
        <div class="urteil" data-key="l${s.zaehler}">${minder.length ? `🍺 Minderheit trinkt: ${minder.map((j) => name(namen, j)).join(", ")}` : "Unentschieden – alle trinken einen! 🍻"}</div>
        ${knopf("Nächste Karte ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
    }
    return `<div class="fragekarte" data-key="${esc(s.karte[1]).slice(0, 60)}" style="--k1:${k.farben[0]};--k2:${k.farben[1]}"><span class="kat">${k.emoji} ${esc(k.name)}</span>
      <div class="vor">Was würdest du lieber?</div><div class="text">${esc(a)}<br><small style="opacity:.7">oder</small><br>${esc(b)}</div></div>${unten}`;
  },
};

// ================================================================ Paranoia
export const paranoia = {
  id: "paranoia", name: "Paranoia", emoji: "🤫", kurz: "Nur einer sieht die Frage – und nennt laut einen Namen", farben: ["#2b2d42", "#6d5dfc"],
  start: () => ({ phase: "kats", kats: ["klassiker", "party"], leser: 0, antwort: null, aufgedeckt: null }),
  aktion(s, i, a, namen, raum) {
    const r = katAktion(s, i, a, raum.ab18);
    if (r === "start") { s.karte = ziehen(s, "wer"); s.antwort = null; s.aufgedeckt = null; return; }
    if (r) return;
    if (a.typ === "nenne" && i === s.leser && s.antwort === null) s.antwort = a.ziel;
    if (a.typ === "muenze" && s.antwort !== null && s.aufgedeckt === null) s.aufgedeckt = zufall(2) === 0;
    if (a.typ === "weiter") { s.leser = (s.leser + 1) % namen.length; s.karte = ziehen(s, "wer"); s.antwort = null; s.aufgedeckt = null; }
  },
  render(s, ich, namen, raum) {
    if (s.phase === "kats") return katWahl(s, ich, namen, "wer", raum.ab18);
    const leser = s.leser;
    if (s.antwort === null) {
      if (ich === leser) return `<div class="frage">Psst – nur du siehst das!</div>${karte(s, s.karte[0], "Wer hier würde eher …", s.karte[1])}
        <p class="mitte">Wen nennst du? Sag den Namen gleich auch laut.</p>
        <div class="raster">${namen.map((n, j) => (j === ich ? "" : knopf(esc(n), { typ: "nenne", ziel: j }, "wahl"))).join("")}</div>`;
      return `<div class="frage">${name(namen, leser)} liest heimlich eine Frage …</div><div class="logo mitte" style="display:block">🤫</div>`;
    }
    const betroffen = s.antwort;
    if (s.aufgedeckt === null) return `<div class="urteil">${name(namen, leser)} hat ${name(namen, betroffen)} genannt!</div>
      <p class="mitte">${esc(namen[betroffen])} darf die Münze werfen: Bei Kopf wird die Frage verraten – dafür trinkt ${esc(namen[betroffen])} einen.</p>
      ${ich === betroffen ? knopf("🪙 Münze werfen", { typ: "muenze" }, "gross gelb") : `<div class="hinweisbox warten">${esc(namen[betroffen])} wirft die Münze …</div>`}`;
    return `${s.aufgedeckt ? karte(s, s.karte[0], "Die Frage war: Wer würde eher …", s.karte[1]) : `<div class="urteil">🪙 Zahl – die Frage bleibt geheim! 😈</div>`}
      ${knopf("Nächste Runde ➜", { typ: "weiter" }, "gross")}${katKnopf(ich)}`;
  },
};

export const FRAGESPIELE = [nochNie, werWuerde, wop, lieber, paranoia];
