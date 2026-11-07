// Kurze Erklaer-Einblendung vor jedem Spiel (Restpaket 3a, Nico 07.11.2026; Vorschlag 4 aus Runde G).
// Nach "Los geht's" steht ERKL_ZEIT lang ein grosses Bild (Spiel-Zeichen auf den Spielfarben) mit drei kurzen Saetzen -
// am Handy oben ueber dem Spiel, am Beamer gross ueber der Buehne. Die Spielleitung kann ueberspringen ("_erklweg").
// Partybrett nicht: das hat eigene Regeln.
// Keine Spieluhr laeuft waehrend der Erklaerung (Nico 07.11.2026 abends: "in der Zeit soll natuerlich kein Zeitlimit schon
// laufen") - zentral fuer alle Spiele, wie bei der Pause der Spielleitung:
//  - Gastgeber: beim Start ruecken alle Fristen im Spielstand um die Erklaerzeit nach hinten (uhrenNachHinten), beim
//    Ueberspringen um die Restzeit wieder vor (uhrenVorziehen). Spielzuege und Computer warten, bis die Erklaerung vorbei ist.
//  - Handys: sp.nach (startet die Uhren, die jedes Handy selbst zaehlt) laeuft erst danach; sichtbare Restzeiten im Spiel
//    stehen solange auf der vollen Zeit (haltZeit).
import { esc } from "./hilfe.js";
import { zeitenSchieben } from "./partien.js";

export const ERKL_ZEIT = 15000;
export const OHNE = new Set(["brett"]);   // eigene Regeltafel im Hauptmenue

// je Spiel hoechstens drei kurze Saetze; fehlt eines, gilt die Kurzbeschreibung des Spiels
export const TEXTE = {
  werwuerde: ["Eine Frage erscheint: Wer würde eher …?", "Alle tippen gleichzeitig auf eine Person.", "Wer die meisten Stimmen hat, trinkt."],
  nochnie: ["Ein Satz erscheint: Ich hab noch nie …", "Wer es doch schon gemacht hat, gibt das zu.", "Und trinkt."],
  wop: ["Reihum: Wahrheit oder Pflicht wählen.", "Frage ehrlich beantworten oder Aufgabe erledigen.", "Wer kneift, trinkt."],
  lieber: ["Zwei Möglichkeiten erscheinen.", "Alle wählen gleichzeitig eine Seite.", "Die kleinere Gruppe trinkt."],
  paranoia: ["Einer bekommt heimlich eine Frage und nennt laut einen Namen.", "Nur wer trinkt, darf die Frage erfahren.", "Sonst bleibt sie geheim."],
  klatschen: ["Karte für Karte aufdecken.", "Bei der richtigen Karte schnell klatschen.", "Wer zuletzt klatscht, trinkt."],
  busfahrer: ["Karte für Karte raten: Farbe, höher/tiefer, dazwischen, Zeichen.", "Falsch geraten heißt trinken.", "Wer am Ende verliert, fährt Bus."],
  pferde: ["Jeder setzt auf ein Pferd (eine Kartenfarbe).", "Karten werden aufgedeckt, die Pferde laufen vor.", "Wer verliert, trinkt seinen Einsatz."],
  maexchen: ["Heimlich würfeln und eine Zahl ansagen – gern geflunkert.", "Der Nächste glaubt oder deckt auf.", "Wer erwischt wird oder falsch zweifelt, trinkt."],
  werwolf: ["Jeder bekommt heimlich eine Rolle aufs Handy.", "Nachts schlagen die Werwölfe zu, tags stimmt das Dorf ab.", "Dorf gewinnt, wenn alle Wölfe raus sind."],
  werbinich: ["Jeder bekommt eine Figur, die alle sehen außer ihm selbst.", "Nur Ja/Nein-Fragen stellen.", "Wer seine Figur zuerst errät, gewinnt."],
  spion: ["Alle kennen denselben Ort – nur der Spion nicht.", "Reihum Fragen stellen, ohne zu viel zu verraten.", "Findet den Spion, bevor er den Ort errät."],
  slf: ["Ein Buchstabe wird gezogen.", "Zu jeder Spalte ein Wort mit diesem Buchstaben eintragen.", "Eigene Ideen geben die meisten Punkte."],
  quiz: ["Eine Frage, vier Antworten an der Wand.", "Am Handy schnell tippen.", "Richtig und schnell gibt die meisten Punkte."],
  reaktion: ["Warten, bis das Bild grün wird.", "Dann so schnell wie möglich tippen.", "Wer zu früh tippt, verliert die Runde."],
  schaetzen: ["Eine Schätzfrage erscheint.", "Jeder tippt seine Zahl ein.", "Wer am nächsten dran ist, gewinnt."],
  malen: ["Einer malt ein geheimes Wort am Handy.", "Die anderen sehen das Bild live und raten.", "Schnell raten gibt Punkte – für beide."],
  millionaer: ["Eine Person spielt, alle anderen raten mit.", "Fünfzehn Fragen, drei Joker.", "Je weiter, desto mehr Punkte."],
  wortkette: ["Reihum ein Wort sagen.", "Es muss mit dem letzten Buchstaben des Worts davor beginnen.", "Wer zu lange braucht, fliegt raus."],
  activity: ["Zwei Teams, reihum stellt einer dar.", "Erklären, Zeichnen oder Pantomime – ohne das Wort zu sagen.", "Das eigene Team rät, richtig gibt Punkte."],
  bilder: ["Ein Bilderrätsel erscheint.", "Wer die Lösung weiß, tippt sie ein.", "Wer zuerst richtig liegt, punktet."],
  damals: ["Fragen über früher.", "Alle tippen ihre Antwort.", "Richtig gibt Punkte."],
  fiesbau: ["Jeder baut ein fieses Hindernis auf die Strecke.", "Dann laufen alle los.", "Wer ins Ziel kommt, punktet."],
  farbchaos: ["Ein Farbwort erscheint – in falscher Farbe.", "Tippe die Farbe, nicht das Wort.", "Schnell und richtig gewinnt."],
  gduell: ["Zwei treten gegeneinander an.", "Kurzes Minispiel am Handy.", "Wer gewinnt, entscheidet das Rad."],
};

export const saetze = (sp) => (sp && TEXTE[sp.id]) || [String((sp && sp.kurz) || "")].filter(Boolean);

// Laeuft die Einblendung fuer diese Partie noch? (Uhr des Gastgebers)
export const offen = (p, jetzt) => !!(p && p.phase === "laeuft" && p.erkl && jetzt < p.erkl && !OHNE.has(p.spiel));

// Gastgeber, direkt nach dem Start (p.erkl gesetzt): jede Frist/Startzeit im Stand beginnt erst nach der Erklaerung
export function uhrenNachHinten(p, jetzt) {
  if (p && p.s && p.erkl > jetzt) p.s = zeitenSchieben(p.s, jetzt, p.erkl - jetzt);
}
// Gastgeber, beim Ueberspringen: die nicht gebrauchte Erklaerzeit wieder abziehen, dann ist die Uhr sofort voll da
export function uhrenVorziehen(p, jetzt) {
  const rest = p && p.erkl ? p.erkl - jetzt : 0;
  if (p && p.s && rest > 0) p.s = zeitenSchieben(p.s, jetzt, -rest);
}
// Anzeige: solange die Erklaerung laeuft, rechnen Restzeiten im Spiel ab ihrem Ende (= volle Zeit steht still)
export const haltZeit = (p, jetzt) => (offen(p, jetzt) ? p.erkl : jetzt);

let stilDa = false;
function stil() {
  if (stilDa || typeof document === "undefined") return;
  stilDa = true;
  const s = document.createElement("style");
  s.textContent = `.erkl{border-radius:18px;padding:16px;margin:0 0 14px;color:#fff;box-shadow:0 6px 24px #0006;text-align:center;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere}
.erkl .erkl-bild{font-size:64px;line-height:1.1}
.erkl h3{margin:6px 0 10px;font-size:1.3em}
.erkl ol{margin:0 auto 12px;padding-left:1.4em;text-align:left;max-width:34em;font-size:1.05em;line-height:1.4}
.erkl ol li{margin:4px 0}
.erkl .erkl-uhr{opacity:.8;font-size:.9em}
.erkl button{margin-top:6px}
.erkl-sperre{position:relative;opacity:.45;filter:grayscale(.6);pointer-events:none;user-select:none}
.erkl-sperre-hinweis{text-align:center;font-weight:600;margin:0 0 10px;padding:8px 10px;border-radius:12px;background:#0006;color:#fff;overflow-wrap:anywhere}
.bm-erkl{position:fixed;inset:6vh 8vw;z-index:60;display:flex;flex-direction:column;justify-content:center;align-items:center;border-radius:3vh;color:#fff;text-align:center;padding:4vh 5vw;box-shadow:0 2vh 8vh #000a;box-sizing:border-box;overflow:hidden}
.bm-erkl[hidden]{display:none}
.bm-erkl .erkl-bild{font-size:22vh;line-height:1}
.bm-erkl h3{font-size:7vh;margin:2vh 0}
.bm-erkl ol{font-size:4.6vh;line-height:1.35;text-align:left;margin:0;padding-left:1.3em;max-width:80vw}
.bm-erkl .erkl-uhr{font-size:3vh;opacity:.8;margin-top:3vh}`;
  document.head.appendChild(s);
}

const hinter = (sp) => { const f = (sp && sp.farben) || ["#334155", "#0f172a"]; return `background:linear-gradient(135deg,${f[0]},${f[1] || f[0]})`; };

// Handy: Karte oben ueber dem Spiel; leitet = Ueberspringen-Knopf
export function handyHTML(sp, p, jetzt, leitet, knopf) {
  stil();
  return `<div class="erkl" style="${hinter(sp)}" data-erkl="${esc(p.pid)}"><div class="erkl-bild">${sp.emoji}</div><h3>So geht ${esc(sp.name)}</h3>
    <ol>${saetze(sp).map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
    ${leitet ? knopf("⏭️ Überspringen", { typ: "_erklweg" }, "klein2") : `<div class="erkl-uhr">verschwindet gleich von selbst</div>`}</div>`;
}

// Handy: das Spiel unter der Karte ist bis zum Ende der Erklaerung nicht bedienbar (inert) und sichtbar abgeblendet -
// sonst saehe ein Knopf tippbar aus, der Tipp wuerde aber verworfen (Spielzuege warten die Erklaerung ab)
export function gesperrt(inhalt) {
  stil();
  return `<div class="erkl-sperre" inert aria-disabled="true"><div class="erkl-sperre-hinweis">⏳ Gleich geht's los – nach der Erklärung kannst du tippen</div>${inhalt}</div>`;
}

// Beamer: Inhalt der grossen Einblendung
export function beamerHTML(sp, p, jetzt) {
  stil();
  const rest = Math.max(0, Math.ceil((p.erkl - jetzt) / 1000));
  return `<div class="erkl-bild">${sp.emoji}</div><h3>So geht ${esc(sp.name)}</h3>
    <ol>${saetze(sp).map((t) => `<li>${esc(t)}</li>`).join("")}</ol><div class="erkl-uhr">Gleich geht's los · noch ${rest} s</div>`;
}
export const beamerStil = (sp) => hinter(sp);
