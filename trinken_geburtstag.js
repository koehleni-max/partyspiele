// Geburtstags-Runde E: Trinken (Nico 06.11.2026, Vorschlaege 71, 72, 76, 80; Werwolf-Teil steht in werwolf.js).
//
//   Schluck-Zaehler (71)  zaehlt je Person, was ihr die Spiele zuteilen - nur bei "mit Trinken", nur fuer die Person
//                         selbst sichtbar (unten auf dem eigenen Handy). Der Gastgeber haelt den Abend-Stand (ueber alle
//                         Partien des Abends, nach Namen) in seinem Browser; jede Partie bekommt davon eine Kopie mit.
//   Wasser-Joker (72)     einmal pro Stunde: die gerade zugeteilten Schlucke als Wasser trinken (zaehlt als Wasser).
//   Maexchen (76)         Handy wuerfelt verdeckt, ansagen (auch luegen), der Naechste glaubt oder deckt auf.
//   Busfahrer (80)        Auszug + Ansicht fuer den Beamer (beamer_spiele.js haengt sie ein).
// Keine Computer-Mitspieler in Trinkspielen (Nico): Maexchen hat kein bot().
import * as K from "./karten.js";
import { esc, knopf, zufall, name, schlucke, nameSauber } from "./hilfe.js";

// ================================================================ Schluck-Zaehler und Wasser-Joker
export const JOKER_PAUSE = 60 * 60 * 1000;   // Nico 06.11.: "einmal pro Stunde"
// ein Abend geht ueber Mitternacht: Tageswechsel erst mittags
const abendSchluessel = (jetzt = Date.now()) => { const d = new Date(jetzt - 12 * 3600 * 1000); return `pg-schluck-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let abendSpeicher = null;   // ohne localStorage (Tests, privates Fenster): nur im Speicher
function abendLesen() {
  try { const x = JSON.parse(localStorage.getItem(abendSchluessel()) || "{}"); if (x && typeof x === "object") return x; } catch (e) { /* weiter */ }
  return abendSpeicher || {};
}
function abendSchreiben(x) {
  abendSpeicher = x;
  try { localStorage.setItem(abendSchluessel(), JSON.stringify(x)); } catch (e) { /* nur im Speicher */ }
}
const leer = () => ({ n: 0, w: 0, joker: 0 });
const z = (s) => {
  s.zaehler = s.zaehler && typeof s.zaehler === "object" ? s.zaehler : {};
  if (!s.zaehler.letzt || typeof s.zaehler.letzt !== "object") s.zaehler.letzt = {};
  return s.zaehler;
};

// Kopie des Abend-Stands in die Partie (die Handys sehen nur den Spielstand, nicht den Browser des Gastgebers)
export function spiegeln(s, namen) {
  const ab = abendLesen();
  z(s).ab = namen.map((n) => ({ ...leer(), ...(ab[nameSauber(n)] || {}) }));
}
// neuer Moment (neue Karte, neuer Wurf): der Joker gilt nur fuer das, was gerade zugeteilt wurde
export function momentNeu(s) { z(s).letzt = {}; }

// n Schlucke fuer Spieler i (negativ = zuruecknehmen, z. B. "Hab ich doch nicht"). Ohne Trinken zaehlt nichts.
export function zaehlen(s, i, n, namen) {
  if (s.ohne || !n || !namen || namen[i] === undefined) return;
  const zz = z(s), offen = Number(zz.letzt[i]) || 0;
  if (n < 0) n = -Math.min(-n, offen);   // nur zuruecknehmen, was noch nicht als Wasser getrunken ist
  if (!n) return;
  const ab = abendLesen(), k = nameSauber(namen[i]);
  ab[k] = { ...leer(), ...(ab[k] || {}) };
  ab[k].n = Math.max(0, ab[k].n + n);
  abendSchreiben(ab);
  zz.letzt[i] = offen + n;
  spiegeln(s, namen);
}

export function jokerFrei(s, i, jetzt = Date.now()) {
  const e = ((s.zaehler || {}).ab || [])[i] || leer();
  return jetzt - (Number(e.joker) || 0) >= JOKER_PAUSE;
}
// Wasser-Joker: die gerade zugeteilten Schlucke werden Wasser
export function joker(s, i, namen, jetzt = Date.now()) {
  if (s.ohne || !namen || namen[i] === undefined) return false;
  spiegeln(s, namen);
  const zz = z(s), offen = Number(zz.letzt[i]) || 0;
  if (offen <= 0 || !jokerFrei(s, i, jetzt)) return false;
  const ab = abendLesen(), k = nameSauber(namen[i]);
  ab[k] = { ...leer(), ...(ab[k] || {}) };
  ab[k].n = Math.max(0, ab[k].n - offen); ab[k].w += offen; ab[k].joker = jetzt;
  abendSchreiben(ab);
  zz.letzt[i] = 0;
  spiegeln(s, namen);
  return true;
}

const uhrzeit = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
// Leiste unten auf dem eigenen Handy - nur die eigenen Zahlen
export function zaehlerHTML(s, ich, jetzt = Date.now()) {
  if (s.ohne || ich === undefined || ich < 0) return "";
  const e = ((s.zaehler || {}).ab || [])[ich] || leer();
  const offen = Number(((s.zaehler || {}).letzt || {})[ich]) || 0;
  const frei = jetzt - (Number(e.joker) || 0) >= JOKER_PAUSE;
  const jk = offen > 0 && frei ? knopf(`💧 Wasser-Joker: ${schlucke(offen)} als Wasser`, { typ: "wasserjoker" }, "zweit tg-joker")
    : !frei ? `<small class="leise">💧 Joker wieder ab ${uhrzeit(Number(e.joker) + JOKER_PAUSE)}</small>`
    : `<small class="leise">💧 Wasser-Joker: einmal pro Stunde, wenn du trinken musst</small>`;
  return `<div class="tg-zaehler" data-tg-zaehler><span>🍺 Deine Schlucke heute: <b>${e.n}</b>${e.w ? ` · 💧 ${e.w} als Wasser` : ""}</span>${jk}</div>`;
}

// Was je Spiel als "dir zugeteilt" zaehlt (nur, was das Spiel selbst eindeutig einer Person zuschreibt)
const REGELN = {
  nochnie(s, i, a, namen, vorher) {
    if (a.typ === "weiter" || a.typ === "_katfertig") return momentNeu(s);
    if (a.typ === "hab" && s.phase !== "kats") {
      if (!vorher.hab && s.hab && s.hab[i]) zaehlen(s, i, 1, namen);
      if (vorher.hab && !(s.hab && s.hab[i])) zaehlen(s, i, -1, namen);
    }
  },
  busfahrer(s, i, a, namen, vorher) {
    if (a.typ === "tipp" && !vorher.letzt && s.letzt) { momentNeu(s); if (!s.letzt.richtig) zaehlen(s, i, s.letzt.schlucke, namen); }
  },
};
const VORHER = {
  nochnie: (s, i) => ({ hab: !!(s.hab && s.hab[i]) }),
  busfahrer: (s) => ({ letzt: !!s.letzt }),
};

// Spiel mit Zaehler umhuellen: gleiche Regeln, dazu Zaehlen, Joker und die eigene Leiste
export function mitZaehler(sp, regel = REGELN[sp.id], vorher = VORHER[sp.id] || (() => ({}))) {
  return { ...sp,
    aktion(s, i, a, namen, raum) {
      if (a && a.typ === "wasserjoker") { joker(s, i, namen); return; }
      const v = vorher(s, i);
      const r = sp.aktion.call(this, s, i, a, namen, raum);
      try { if (regel) regel(s, i, a, namen, v); if (namen) spiegeln(s, namen); } catch (e) { console.error(e); }
      return r;
    },
    render(s, ich, namen, raum) { return sp.render.call(this, s, ich, namen, raum) + zaehlerHTML(s, ich); },
  };
}
// Liste aller Spiele: die Trinkspiele mit Zaehler bekommen ihn, alles andere bleibt unberuehrt
export const MIT_ZAEHLER = ["nochnie", "busfahrer", "maexchen"];
export const zaehlerDran = (liste) => liste.map((sp) => (sp && MIT_ZAEHLER.includes(sp.id) && sp.id !== "maexchen" ? mitZaehler(sp) : sp));

// ================================================================ Maexchen
// Rangfolge von klein nach gross: normale Wuerfe (hoehere Zahl vorn), dann Paschs, ganz oben 21 = Maexchen
export const MAEX_WERTE = ["31", "32", "41", "42", "43", "51", "52", "53", "54", "61", "62", "63", "64", "65", "11", "22", "33", "44", "55", "66", "21"];
export const maexRang = (w) => MAEX_WERTE.indexOf(String(w));
export const wurfWert = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b); return hi === 2 && lo === 1 ? "21" : `${hi}${lo}`; };
const AUGE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const wName = (w) => (w === "21" ? "Mäxchen (21)" : w[0] === w[1] ? `${w[0]}er-Pasch` : w);
const wuerfelBild = (w) => `<span class="tg-wuerfel" style="display:block;font-size:4em;line-height:1.1">${AUGE[Number(w[0])]}${AUGE[Number(w[1])]}</span>`;

export const maexchen = {
  id: "maexchen", name: "Mäxchen", emoji: "🎲", farben: ["#0ea5e9", "#1e3a8a"], kurz: "Verdeckt würfeln, ansagen, lügen – glauben oder aufdecken?",
  start: (namen) => ({ phase: "wuerfeln", dran: 0, wurf: null, ansage: null, vorher: null, ansager: null, ergebnis: null, runde: 1, verloren: namen.map(() => 0) }),
  aktion(s, i, a, namen) {
    const n = namen.length;
    if (!s.verloren || s.verloren.length < n) s.verloren = namen.map((_, j) => (s.verloren || [])[j] || 0);
    if (a.typ === "wasserjoker") { joker(s, i, namen); return; }
    if (a.typ === "wuerfeln" && s.phase === "wuerfeln" && i === s.dran) {
      s.wurf = wurfWert(1 + zufall(6), 1 + zufall(6)); s.phase = "ansagen";
    } else if (a.typ === "ansage" && s.phase === "ansagen" && i === s.dran && maexRang(a.w) >= 0 && (s.vorher === null || maexRang(a.w) > maexRang(s.vorher))) {
      s.ansage = String(a.w); s.ansager = i; s.phase = "entscheiden"; s.dran = (i + 1) % n;
    } else if (a.typ === "glauben" && s.phase === "entscheiden" && i === s.dran) {
      if (s.ansage === "21") {   // Maexchen kann man nicht schlagen: wer glaubt, verliert sofort (2 Schlucke)
        s.ergebnis = { verlierer: i, schlucke: 2, echt: null, grund: "glaubt das Mäxchen" };
        s.verloren[i]++; momentNeu(s); zaehlen(s, i, 2, namen); s.phase = "aufgedeckt";
      } else { s.vorher = s.ansage; s.wurf = null; s.ansage = null; s.phase = "wuerfeln"; }
    } else if (a.typ === "aufdecken" && s.phase === "entscheiden" && i === s.dran) {
      const ehrlich = maexRang(s.wurf) >= maexRang(s.ansage);
      const verlierer = ehrlich ? i : s.ansager, sl = s.ansage === "21" ? 2 : 1;
      s.ergebnis = { verlierer, schlucke: sl, echt: s.wurf, ehrlich, grund: ehrlich ? "hat zu Unrecht gezweifelt" : "wurde beim Lügen erwischt" };
      s.verloren[verlierer]++; momentNeu(s); zaehlen(s, verlierer, sl, namen); s.phase = "aufgedeckt";
    } else if (a.typ === "neuerunde" && s.phase === "aufgedeckt") {
      s.dran = s.ergebnis ? s.ergebnis.verlierer : s.dran;   // wer verloren hat, faengt neu an
      Object.assign(s, { phase: "wuerfeln", wurf: null, ansage: null, vorher: null, ansager: null, ergebnis: null, runde: (s.runde || 1) + 1 });
    }
    spiegeln(s, namen);
  },
  render(s, ich, namen) {
    const n = namen.length;
    const stand = `<div class="punkte">${namen.map((nm, j) => `<span>${esc(nm)}: ${(s.verloren || [])[j] || 0}× verloren</span>`).join("")}</div>`;
    const regel = `<details class="grundregeln"><summary>📜 So geht Mäxchen</summary><ul><li>Du würfelst verdeckt – nur du siehst den Wurf.</li>
      <li>Sag einen Wert an, der höher ist als der vorige. Lügen ist erlaubt!</li><li>Der Nächste glaubt (und muss dann selbst höher kommen) oder deckt auf.</li>
      <li>Aufgedeckt: gelogen = Ansager trinkt 1 Schluck, ehrlich = Zweifler trinkt 1 Schluck. Beim Mäxchen 2.</li>
      <li>Rangfolge: 31 ist am kleinsten, dann bis 65, dann die Paschs (11 bis 66), ganz oben 21 = Mäxchen.</li></ul></details>`;
    const unten = `${stand}${regel}${zaehlerHTML(s, ich)}`;
    const vorher = s.vorher ? `<p class="mitte">Zu schlagen: <b>${esc(wName(s.vorher))}</b></p>` : `<p class="mitte leise">Neue Runde – jeder Wert gilt.</p>`;
    if (s.phase === "wuerfeln") {
      return `<div class="frage">${name(namen, s.dran)} würfelt</div>${vorher}
        ${ich === s.dran ? knopf("🎲 Verdeckt würfeln", { typ: "wuerfeln" }, "gross") : `<p class="mitte leise">Warte auf ${esc(namen[s.dran])} …</p>`}${unten}`;
    }
    if (s.phase === "ansagen") {
      if (ich !== s.dran) return `<div class="frage">${name(namen, s.dran)} schaut heimlich auf den Wurf …</div>${vorher}${unten}`;
      const ab = s.vorher === null ? 0 : maexRang(s.vorher) + 1;
      return `<div class="frage">Dein Wurf (nur du siehst ihn):</div><div class="mitte tg-wurf" data-key="m${s.runde}-${s.vorher || 0}">${wuerfelBild(s.wurf)}<b>${esc(wName(s.wurf))}</b></div>
        ${vorher}<p class="mitte">Was sagst du an? Die Wahrheit – oder geschwindelt.</p>
        <div class="raster">${MAEX_WERTE.slice(ab).map((w) => knopf(esc(wName(w)), { typ: "ansage", w }, `wahl ${w === s.wurf ? "gewaehlt" : ""}`)).join("")}</div>${unten}`;
    }
    if (s.phase === "entscheiden") {
      const kopf = `<div class="frage">${name(namen, s.ansager)} sagt an:<br><span class="gross2">${esc(wName(s.ansage))}</span></div>`;
      if (ich !== s.dran) return `${kopf}<p class="mitte leise">${esc(namen[s.dran])} überlegt: glauben oder aufdecken?</p>${unten}`;
      return `${kopf}<div class="raster2">${knopf(s.ansage === "21" ? "🤝 Glauben (2 Schlucke)" : "🤝 Glauben – ich würfle", { typ: "glauben" }, "gross blau")}${knopf("🔍 Aufdecken!", { typ: "aufdecken" }, "gross rot")}</div>${unten}`;
    }
    const e = s.ergebnis || {};
    return `<i hidden data-ergebnis="m${s.runde}"></i>${e.echt ? `<div class="mitte tg-wurf">${wuerfelBild(e.echt)}<b>Wirklich: ${esc(wName(e.echt))}</b></div>` : ""}
      <div class="urteil">🍺 ${name(namen, e.verlierer)} ${esc(e.grund || "")} und trinkt ${schlucke(e.schlucke || 1)}</div>
      ${knopf("Neue Runde", { typ: "neuerunde" }, "gross")}${unten}`;
  },
};

// ================================================================ Busfahrer am Beamer
const BUS_KURZ = ["Rot/Schwarz", "Höher/Tiefer", "Dazwischen/Außerhalb", "Farbe"];
const BUS_TITEL = ["Rot oder Schwarz?", "Höher oder tiefer als die erste Karte?", "Zwischen den beiden Karten oder außerhalb?", "Welche Farbe?"];
export function busAuszug(s) {
  return { dran: s.dran, stufe: s.stufe, hand: (s.hand[s.dran] || []).slice(), letzt: s.letzt ? { ...s.letzt } : null, fehler: (s.fehler || []).slice(), rest: (s.stapel || []).length };
}
let stilDa = false;
function busStil() {
  if (stilDa || typeof document === "undefined") return;
  stilDa = true;
  document.head.insertAdjacentHTML("beforeend", `<style id="tg-bus-stil">
    .tgb-hand{display:flex;gap:2vw;justify-content:center;margin:2vh 0;min-height:22vh}
    .tgb-karte{width:13vw;height:19vw;max-height:30vh;max-width:20vh;border-radius:1.2vw;background:#fffdf8;color:#1b1f2a;display:flex;align-items:center;justify-content:center;font-size:5vw;font-weight:800;box-shadow:0 .6vw 2vw #0008}
    .tgb-karte.rotk{color:#d61f3c}.tgb-karte.leer{background:#ffffff14;color:#fff6;border:.3vw dashed #fff5;box-shadow:none}
    .tgb-stufen{display:flex;gap:1vw;justify-content:center;margin:1vh 0}.tgb-stufen span{padding:.5vh 1.2vw;border-radius:99px;background:#ffffff1a;font-size:1.6vw}
    .tgb-stufen span.an{background:#facc15;color:#1b1f2a;font-weight:800}.tgb-stufen span.fertig{background:#16a34a}
    .tgb-urteil{text-align:center;font-size:3.4vw;font-weight:800;color:#fff;margin:1vh 0;padding:1vh 2vw;border-radius:1vw;background:#b91c1c}
    .tgb-urteil.gut{background:#15803d}.tgb-frage{text-align:center;font-size:3vw;font-weight:800;color:#fff;margin:1vh 0}
    .tgb-stand-titel{text-align:center;font-size:2vw;font-weight:700;opacity:.85;margin:2.5vh 0 1vh}
    .tgb-stand{display:grid;grid-template-columns:repeat(auto-fit,minmax(15vw,1fr));gap:1.2vw;max-width:94vw;margin:0 auto;padding:0 2vw;box-sizing:border-box}
    .tgb-platz{background:#ffffff14;border-radius:1.2vw;padding:1.2vh 1vw;text-align:center;min-width:0;border:.25vw solid transparent}
    .tgb-platz.da{border-color:#facc15;background:#facc1526}
    .tgb-platz b{display:block;font-size:2.6vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tgb-platz span{display:block;font-size:4.6vw;font-weight:900;line-height:1.1}
    .tgb-platz small{display:block;font-size:1.4vw;opacity:.75}
  </style>`);
}
export function busHTML(d, nm, sp, kopf) {
  busStil();
  const karten = Array.from({ length: 4 }, (_, k) => {
    const c = d.hand[k];
    return c ? `<div class="tgb-karte ${K.rot(c) ? "rotk" : ""}">${esc(K.zeige(c))}</div>` : `<div class="tgb-karte leer">${k + 1}</div>`;
  }).join("");
  const stufen = BUS_KURZ.map((t, k) => `<span class="${k === d.stufe ? "an" : k < d.stufe ? "fertig" : ""}">${k + 1}. ${esc(t)}</span>`).join("");
  const wer = esc(nm[d.dran] || "");
  const zeile = d.letzt ? `<div class="tgb-urteil ${d.letzt.richtig ? "gut" : ""}">${d.letzt.richtig ? `✅ Richtig! ${wer} verteilt ${schlucke(d.letzt.schlucke)}` : `❌ Falsch! ${wer} trinkt ${schlucke(d.letzt.schlucke)}`}</div>`
    : `<p class="tgb-frage">${wer}: ${esc(BUS_TITEL[d.stufe] || "")}</p>`;
  const tafel = nm.map((n, j) => [j, (d.fehler || [])[j] || 0]).sort((x, y) => y[1] - x[1]);
  return `<div class="bsbus">${kopf(sp, `${wer} ist dran – am Handy tippen`)}<div class="tgb-stufen">${stufen}</div>
    <div class="tgb-hand">${karten}</div>${zeile}
    <div class="tgb-stand-titel">Spielstand – getrunkene Schlucke${d.rest ? ` · noch ${d.rest} Karten im Stapel` : ""}</div>
    <div class="tgb-stand">${tafel.map(([j, x]) => `<div class="tgb-platz ${j === d.dran ? "da" : ""}"><b>${esc(nm[j] || "")}</b><span>${x} 🍺</span><small>${j === d.dran ? "ist dran" : "&nbsp;"}</small></div>`).join("")}</div></div>`;
}
