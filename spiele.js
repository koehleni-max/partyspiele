// Die Spiele. Jedes Spiel: start(namen) -> Zustand, aktion(zustand, spielerIdx, aktion), render(zustand, ich, namen) -> HTML.
// Zustand und Zufall liegen nur beim Gastgeber; die Gaeste zeichnen, was er schickt.
import * as K from "./karten.js";
import * as T from "./texte.js";

import { esc, knopf, zufall, ziehe, mischen, name, schlucke } from "./hilfe.js";
export { esc, knopf };

// Fragenstapel ohne Wiederholung
function naechsteFrage(s, liste) {
  if (!s.rest || !s.rest.length) s.rest = mischen(liste.map((_, i) => i));
  return liste[s.rest.pop()];
}

// ================================================================ Wer wuerde eher
const werWuerde = {
  id: "werwuerde", name: "Wer würde eher …", emoji: "👉", kurz: "Alle stimmen ab, wer am ehesten …",
  start: (namen) => { const s = { phase: "frage", stimmen: {} }; s.frage = naechsteFrage(s, T.WER_WUERDE); return s; },
  aktion(s, i, a, namen) {
    if (a.typ === "stimme" && s.phase === "frage") {
      s.stimmen[i] = a.ziel;
      if (Object.keys(s.stimmen).length >= s.anzahl) s.phase = "ergebnis";
    } else if (a.typ === "weiter") { s.phase = "frage"; s.stimmen = {}; s.frage = naechsteFrage(s, T.WER_WUERDE); }
  },
  render(s, ich, namen) {
    s.anzahl = namen.length;
    if (s.phase === "frage") {
      const hab = s.stimmen[ich] !== undefined;
      return `<div class="frage">Wer würde eher …<br><span class="gross2">${esc(s.frage)}</span></div>
        <div class="raster">${namen.map((n, j) => knopf(esc(n), { typ: "stimme", ziel: j }, `wahl ${s.stimmen[ich] === j ? "gewaehlt" : ""}`)).join("")}</div>
        <p class="leise mitte">${hab ? "Gewählt – warte auf die anderen" : "Tippe auf eine Person"} (${Object.keys(s.stimmen).length}/${namen.length})</p>`;
    }
    const zaehl = namen.map((_, j) => Object.values(s.stimmen).filter((z) => z === j).length);
    const max = Math.max(...zaehl);
    const verlierer = zaehl.map((z, j) => (z === max ? j : -1)).filter((j) => j >= 0);
    return `<div class="frage klein3">${esc(s.frage)}</div>
      <div class="balken">${namen.map((n, j) => `<div class="zeile"><span>${esc(n)}</span><div class="b" style="width:${(zaehl[j] / namen.length) * 100}%"></div><b>${zaehl[j]}</b></div>`).join("")}</div>
      <div class="urteil">🍺 ${verlierer.map((j) => name(namen, j)).join(" & ")} ${verlierer.length > 1 ? "trinken" : "trinkt"} ${schlucke(max)}</div>
      ${knopf("Nächste Frage", { typ: "weiter" }, "gross")}`;
  },
};

// ================================================================ Ich hab noch nie
const nochNie = {
  id: "nochnie", name: "Ich hab noch nie …", emoji: "🙈", kurz: "Wer es schon gemacht hat, trinkt",
  start: () => { const s = { hab: {} }; s.frage = naechsteFrage(s, T.NOCH_NIE); return s; },
  aktion(s, i, a) {
    if (a.typ === "hab") s.hab[i] = !s.hab[i];
    if (a.typ === "weiter") { s.hab = {}; s.frage = naechsteFrage(s, T.NOCH_NIE); }
  },
  render(s, ich, namen) {
    const wer = namen.map((n, j) => (s.hab[j] ? j : -1)).filter((j) => j >= 0);
    return `<div class="frage">Ich hab noch nie …<br><span class="gross2">${esc(s.frage)}</span></div>
      ${knopf(s.hab[ich] ? "🍺 Ja, hab ich – ich trinke" : "Hab ich schon gemacht", { typ: "hab" }, `gross ${s.hab[ich] ? "rot" : ""}`)}
      <p class="mitte">${wer.length ? `Trinken: ${wer.map((j) => name(namen, j)).join(", ")}` : "<span class='leise'>Noch hat niemand gestanden …</span>"}</p>
      ${knopf("Nächste Frage", { typ: "weiter" }, "zweit")}`;
  },
};

// ================================================================ Wahrheit oder Pflicht
const wop = {
  id: "wop", name: "Wahrheit oder Pflicht", emoji: "🎭", kurz: "Reihum: Wahrheit, Pflicht oder 2 Schlucke",
  start: () => ({ dran: 0, karte: null, art: null }),
  aktion(s, i, a, namen) {
    if (i !== s.dran && a.typ !== "weiter") return;
    if (a.typ === "wahl") { s.art = a.art; s.karte = ziehe(a.art === "w" ? T.WAHRHEIT : T.PFLICHT); }
    if (a.typ === "weiter") { s.dran = (s.dran + 1) % s.anzahl; s.karte = null; s.art = null; }
  },
  render(s, ich, namen) {
    s.anzahl = namen.length;
    const istDran = ich === s.dran;
    if (!s.karte) return `<div class="frage">${name(namen, s.dran)} ist dran</div>
      ${istDran ? `<div class="raster2">${knopf("🗣️ Wahrheit", { typ: "wahl", art: "w" }, "gross blau")}${knopf("🔥 Pflicht", { typ: "wahl", art: "p" }, "gross rot")}</div>`
                : `<p class="mitte leise">${esc(namen[s.dran])} wählt gerade …</p>`}`;
    return `<div class="karte-gross ${s.art === "w" ? "blau" : "rot"}"><small>${s.art === "w" ? "WAHRHEIT" : "PFLICHT"} für ${esc(namen[s.dran])}</small><div>${esc(s.karte)}</div></div>
      <p class="mitte leise">Kneifen? Dann ${schlucke(2)}.</p>
      ${knopf("Fertig – nächster Spieler", { typ: "weiter" }, "gross")}`;
  },
};

// ================================================================ Klatschen (Kartenkreis)
const KLATSCH_REGELN = {
  A: ["Wasserfall", "Alle trinken gleichzeitig. Keiner darf aufhören, bevor die Person rechts von ihm aufgehört hat. Wer gezogen hat, fängt an."],
  2: ["Du", "Such dir jemanden aus – der klatscht 2 Schlucke."],
  3: ["Ich", "Du klatschst selbst 3 Schlucke."],
  4: ["Boden", "Alle fassen den Boden an – wer zuletzt, klatscht. Tippt auf den Knopf!"],
  5: ["Männer", "Alle Männer klatschen."],
  6: ["Frauen", "Alle Frauen klatschen."],
  7: ["Himmel", "Alle zeigen nach oben – wer zuletzt, klatscht. Tippt auf den Knopf!"],
  8: ["Partner", "Such dir einen Partner – er klatscht ab jetzt immer mit dir mit."],
  9: ["Reim", "Sag ein Wort, reihum wird gereimt. Wer stockt, klatscht."],
  10: ["Kategorie", "Nenn eine Kategorie (z. B. Automarken), reihum Begriffe. Wer nichts weiß, klatscht."],
  B: ["Regel", "Stell eine neue Regel auf – sie gilt bis zum Spielende."],
  D: ["Fragenmeister", "Du bist Fragenmeister. Wer dir eine Frage beantwortet, klatscht."],
  K: ["Klatschglas", "Kipp einen Schluck ins Glas in der Mitte. Wer den vierten König zieht, trinkt das Glas aus!"],
};
const klatschen = {
  id: "klatschen", name: "Klatschen", emoji: "🃏", farben: ["#8b5cf6","#4c1d95"], kurz: "Kartenkreis mit Regeln – ohne echte Karten",
  start: () => ({ stapel: K.deck52(), dran: 0, karte: null, koenige: 0, regeln: [], partner: {}, reaktion: null, gezogen: 0 }),
  aktion(s, i, a, namen) {
    if (a.typ === "ziehen" && i === s.dran && s.stapel.length && !s.karte) {
      s.karte = s.stapel.pop(); s.gezogen++;
      if (s.karte.w === "K") s.koenige++;
      s.reaktion = ["4", "7"].includes(String(s.karte.w)) ? { reihenfolge: [] } : null;
    } else if (a.typ === "reaktion" && s.reaktion && !s.reaktion.reihenfolge.includes(i)) {
      s.reaktion.reihenfolge.push(i);
    } else if (a.typ === "regel" && a.wert && a.wert.trim()) {
      s.regeln.push({ von: i, text: a.wert.trim().slice(0, 120) });
    } else if (a.typ === "weiter" && s.karte) {
      s.karte = null; s.reaktion = null; s.dran = (s.dran + 1) % s.anzahl;
    } else if (a.typ === "neustart") Object.assign(s, klatschen.start());
  },
  render(s, ich, namen) {
    s.anzahl = namen.length;
    const grund = `<details class="grundregeln"><summary>📜 Grundregeln (immer gültig)</summary>
      <ul><li>Das Wort „trinken“ ist verboten – es heißt <b>klatschen</b>.</li><li>Getrunken wird nur mit links.</li>
      <li>Nicht fluchen, nicht mit dem Finger zeigen.</li><li>Wer patzt: 1 Schluck klatschen.</li></ul>
      ${s.regeln.length ? `<b>Eigene Regeln:</b><ol>${s.regeln.map((r) => `<li>${esc(r.text)} <small class="leise">(${esc(namen[r.von])})</small></li>`).join("")}</ol>` : ""}</details>`;
    const kreis = `<div class="kreis"><div class="glas" title="Klatschglas">🥃<small>${s.koenige}/4 ♔</small></div><div class="rest">${s.stapel.length} Karten</div></div>`;
    if (!s.stapel.length && !s.karte) return `${grund}<div class="frage">Alle Karten gezogen! 🎉</div>${knopf("Neue Runde", { typ: "neustart" }, "gross")}`;
    if (!s.karte) return `${grund}${kreis}<div class="frage">${name(namen, s.dran)} zieht</div>
      ${ich === s.dran ? knopf("Karte ziehen", { typ: "ziehen" }, "gross") : `<p class="mitte leise">Warte auf ${esc(namen[s.dran])} …</p>`}`;
    const [titel, text] = KLATSCH_REGELN[s.karte.w];
    let zusatz = "";
    if (s.karte.w === "K" && s.koenige === 4) zusatz = `<div class="urteil">👑 Vierter König! ${name(namen, s.dran)} trinkt das Klatschglas aus!</div>`;
    if (s.reaktion) {
      const r = s.reaktion.reihenfolge;
      const fertig = r.length >= namen.length;
      zusatz = `${r.includes(ich) ? `<p class="mitte">Du warst Nr. ${r.indexOf(ich) + 1}</p>` : knopf(s.karte.w === "4" ? "👇 BODEN!" : "☝️ HIMMEL!", { typ: "reaktion" }, "gross rot")}
        ${fertig ? `<div class="urteil">Zu langsam: ${name(namen, r[r.length - 1])} klatscht!</div>` : `<p class="leise mitte">${r.length}/${namen.length}</p>`}`;
    }
    if (s.karte.w === "B" && ich === s.dran) zusatz = `<input id="regelfeld" maxlength="120" placeholder="Neue Regel eintippen">${knopf("Regel festlegen", { typ: "regel" }, "", `data-feld="regelfeld" data-leeren`)}`;
    return `${grund}<div class="spielkarte ${K.rot(s.karte) ? "rotk" : ""}">${K.zeige(s.karte)}</div>
      <div class="karte-gross"><small>${esc(namen[s.dran])} zieht</small><div><b>${titel}</b><br>${text}</div></div>${zusatz}
      ${knopf("Weiter", { typ: "weiter" }, "zweit")}`;
  },
};

// ================================================================ Busfahrer (Runde 1: vier Fragen)
const BUS_FRAGEN = [
  { titel: "Rot oder Schwarz?", wahl: [["rot", "🟥 Rot"], ["schwarz", "⬛ Schwarz"]] },
  { titel: "Höher oder tiefer als deine erste Karte?", wahl: [["hoeher", "⬆️ Höher"], ["tiefer", "⬇️ Tiefer"]] },
  { titel: "Zwischen deinen beiden Karten oder außerhalb?", wahl: [["innen", "↔️ Dazwischen"], ["aussen", "↕️ Außerhalb"]] },
  { titel: "Welche Farbe?", wahl: [["♠", "♠"], ["♥", "♥"], ["♦", "♦"], ["♣", "♣"]] },
];
const busfahrer = {
  id: "busfahrer", name: "Busfahrer", emoji: "🚌", farben: ["#facc15","#b45309"], kurz: "Vier Fragen pro Runde – falsch heißt trinken",
  start: (namen) => ({ stapel: K.deck52(), dran: 0, hand: namen.map(() => []), stufe: 0, letzt: null, fehler: namen.map(() => 0) }),
  aktion(s, i, a) {
    if (a.typ === "tipp" && i === s.dran && s.stufe < 4 && !s.letzt) {
      if (s.stapel.length < 1) s.stapel = K.deck52();
      const k = s.stapel.pop(); const h = s.hand[i]; const w = K.wert(k);
      let richtig;
      if (s.stufe === 0) richtig = (a.w === "rot") === K.rot(k);
      if (s.stufe === 1) richtig = a.w === "hoeher" ? w > K.wert(h[0]) : w < K.wert(h[0]);
      if (s.stufe === 2) { const lo = Math.min(K.wert(h[0]), K.wert(h[1])), hi = Math.max(K.wert(h[0]), K.wert(h[1])); richtig = a.w === "innen" ? w > lo && w < hi : w < lo || w > hi; }
      if (s.stufe === 3) richtig = a.w === k.f;
      h.push(k);
      if (!richtig) s.fehler[i] += s.stufe + 1;
      s.letzt = { richtig, schlucke: s.stufe + 1 };
    } else if (a.typ === "weiter" && s.letzt) {
      s.letzt = null; s.stufe++;
      if (s.stufe >= 4) { s.stufe = 0; s.dran = (s.dran + 1) % s.hand.length; s.hand[s.dran] = []; }
    } else if (a.typ === "neustart") Object.assign(s, busfahrer.start(s.hand.map(() => "")));
  },
  render(s, ich, namen) {
    const h = s.hand[s.dran];
    const karten = `<div class="hand">${h.map((k) => `<div class="spielkarte klein ${K.rot(k) ? "rotk" : ""}">${K.zeige(k)}</div>`).join("") || "<span class='leise'>noch keine Karten</span>"}</div>`;
    const tabelle = `<div class="punkte">${namen.map((n, j) => `<span>${esc(n)}: ${s.fehler[j]} 🍺</span>`).join("")}</div>`;
    if (s.letzt) return `<div class="frage">${name(namen, s.dran)}</div>${karten}
      <div class="urteil ${s.letzt.richtig ? "gut" : ""}">${s.letzt.richtig ? `Richtig! ${esc(namen[s.dran])} verteilt ${schlucke(s.letzt.schlucke)}` : `Falsch! ${esc(namen[s.dran])} trinkt ${schlucke(s.letzt.schlucke)}`}</div>
      ${knopf("Weiter", { typ: "weiter" }, "gross")}${tabelle}`;
    const f = BUS_FRAGEN[s.stufe];
    return `<div class="frage">${name(namen, s.dran)}: ${f.titel}</div>${karten}
      ${ich === s.dran ? `<div class="raster${f.wahl.length > 2 ? "" : "2"}">${f.wahl.map(([w, t]) => knopf(t, { typ: "tipp", w }, "gross")).join("")}</div>`
                       : `<p class="mitte leise">${esc(namen[s.dran])} rät gerade …</p>`}${tabelle}`;
  },
};

// ================================================================ Pferderennen
const ZIEL = 7;
const pferderennen = {
  id: "pferde", name: "Pferderennen", emoji: "🏇", farben: ["#16a34a","#14532d"], kurz: "Wetten auf die Asse – Sieger verteilen",
  start: (namen) => ({ phase: "wetten", wetten: {}, pos: { "♠": 0, "♥": 0, "♦": 0, "♣": 0 }, stapel: null, seite: [], aufgedeckt: 0, letzte: null, sieger: null }),
  aktion(s, i, a) {
    if (a.typ === "wette" && s.phase === "wetten") s.wetten[i] = { f: a.f, n: Math.max(1, Math.min(10, Number(a.wert) || 1)) };
    if (a.typ === "los" && s.phase === "wetten" && Object.keys(s.wetten).length) {
      s.phase = "rennen";
      s.stapel = K.deck52().filter((k) => k.w !== "A");
      s.seite = s.stapel.splice(0, ZIEL - 1);
    }
    if (a.typ === "karte" && s.phase === "rennen" && s.stapel.length) {
      const k = s.stapel.pop(); s.letzte = k; s.pos[k.f]++;
      if (s.pos[k.f] >= ZIEL) { s.sieger = k.f; s.phase = "ende"; return; }
      // Seitenkarte aufdecken, wenn alle Pferde die naechste Stufe erreicht haben
      const min = Math.min(...Object.values(s.pos));
      if (s.aufgedeckt < s.seite.length && min > s.aufgedeckt) {
        const sk = s.seite[s.aufgedeckt]; s.aufgedeckt++;
        s.pos[sk.f] = Math.max(0, s.pos[sk.f] - 1);
        s.letzte = { ...k, rueck: sk.f };
      }
    }
    if (a.typ === "neustart") Object.assign(s, pferderennen.start());
  },
  render(s, ich, namen) {
    const bahn = ["♠", "♥", "♦", "♣"].map((f) => `<div class="bahn"><span class="${f === "♥" || f === "♦" ? "rotk" : ""}">${f}</span>
      ${Array.from({ length: ZIEL + 1 }, (_, j) => `<i class="${j === s.pos[f] ? "pferd" : ""} ${j === ZIEL ? "zielfeld" : ""}">${j === s.pos[f] ? "🐎" : ""}</i>`).join("")}</div>`).join("");
    const wetten = Object.entries(s.wetten).map(([j, w]) => `<span>${esc(namen[j])}: ${w.f} × ${w.n}</span>`).join("") || "<span class='leise'>noch keine Wetten</span>";
    if (s.phase === "wetten") {
      const meine = s.wetten[ich];
      return `<div class="frage">Setzt auf ein Ass!</div>
        <label>Wie viele Schlucke setzt du?<input id="einsatz" type="number" min="1" max="10" value="${meine ? meine.n : 2}"></label>
        <div class="raster">${["♠", "♥", "♦", "♣"].map((f) => knopf(f, { typ: "wette", f }, `gross ${meine && meine.f === f ? "gewaehlt" : ""} ${f === "♥" || f === "♦" ? "rotk" : ""}`, `data-feld="einsatz"`)).join("")}</div>
        <div class="punkte">${wetten}</div>
        ${ich === 0 ? knopf("Rennen starten", { typ: "los" }, "gross") : "<p class='leise mitte'>Der Gastgeber startet das Rennen.</p>"}`;
    }
    const letzte = s.letzte ? `<p class="mitte">Gezogen: <b class="${K.rot(s.letzte) ? "rotk" : ""}">${K.zeige(s.letzte)}</b>${s.letzte.rueck ? ` – Seitenkarte: ${s.letzte.rueck} muss einen Schritt zurück!` : ""}</p>` : "";
    if (s.phase === "ende") {
      const gew = Object.entries(s.wetten).filter(([, w]) => w.f === s.sieger).map(([j, w]) => `${name(namen, Number(j))} verteilt ${schlucke(w.n * 2)}`);
      const verl = Object.entries(s.wetten).filter(([, w]) => w.f !== s.sieger).map(([j, w]) => `${name(namen, Number(j))} trinkt ${schlucke(w.n)}`);
      return `<div class="rennbahn">${bahn}</div>${letzte}<div class="urteil">🏆 ${s.sieger} gewinnt!</div><p class="mitte">${[...gew, ...verl].join("<br>")}</p>
        ${knopf("Neues Rennen", { typ: "neustart" }, "gross")}`;
    }
    return `<div class="rennbahn">${bahn}</div>${letzte}<div class="punkte">${wetten}</div>
      ${knopf("Nächste Karte", { typ: "karte" }, "gross")}`;
  },
};

import { farbchaos } from "./farbchaos.js";
import { MINISPIELE } from "./minispiele.js";
import { brett } from "./brett.js";
import { hindernis } from "./hindernis.js";

import { FRAGESPIELE } from "./fragespiele.js";
import { ELTERNSPIELE } from "./elternspiele.js";
export const SPIELE = [brett, hindernis, ...FRAGESPIELE, ...ELTERNSPIELE, farbchaos, klatschen, busfahrer, pferderennen, ...MINISPIELE];
export const GRUPPEN = [
  { titel: "🎲 Große Partyspiele", ids: ["brett", "fiesbau"] },
  { titel: "🧩 Gemeinsam spielen – ohne Alkohol", ids: ["begriffe", "pantomime", "quiz", "werbinich", "spion", "slf", "malen", "schaetzen", "reaktion"] },
  { titel: "🍻 Fragen & Trinkspiele", ids: ["nochnie", "werwuerde", "wop", "lieber", "paranoia"] },
  { titel: "🃏 Kartenspiele", ids: ["farbchaos", "klatschen", "busfahrer", "pferde"] },
];
