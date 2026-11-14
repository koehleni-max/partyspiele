// Partyspiele: Raum, Spiele-Uebersicht, Meldungen, Spielablauf (Halloween-Fassung, Nico 26.10.2026).
// Ein Link fuer alle (Firebase, net.js). Das Gastgeber-Geraet haelt den Stand, fuehrt alle Aktionen aus und schreibt den
// neuen Stand in den Raum; alle anderen zeigen ihn an. Mehrere Spiele laufen gleichzeitig (partien.js) - jedes Handy
// zeigt eins davon, die Uebersicht oder die Turniertafel. Anlass und Aussehen: anlass.js. Konten: konten.js.
import { Verbindung, neuerCode, codeGueltig, zufallsText, standTeile, standAenderung, standLesen, EINGABE_GILT } from "./net.js";
import { SPIELE, GRUPPEN } from "./spiele.js";
import * as TON from "./ton.js";
import * as TAFEL from "./tafel.js";
import * as W from "./wertung.js";
import * as P from "./partien.js";
import * as K from "./konten.js";
import * as A from "./anlass.js";
import * as B from "./beamer.js";
import * as G from "./gluecksrad.js";
import { browserAblage, schluesselFuer, abgleich } from "./tafel_ablage.js";
import { knopf, ohneAlkohol } from "./hilfe.js";
import * as BS from "./beamer_spiele.js";
import * as C from "./controller.js";
import * as T from "./texte.js";
import * as BE from "./brett_ereignisse.js";
import * as BR from "./brett.js";
import * as DU from "./duell.js";
import * as KOPPLUNG from "./kopplung.js";
import * as HM from "./hauptmenue.js";
import * as M from "./brett_menue.js";
import { VORGABE_KARTE } from "./brett_karten.js";
import { Wache, akkuStarten, akkuWerte } from "./netzwache.js";
import * as SL from "./spielleitung.js";
import * as R from "./brett_minis.js";
import * as ER from "./erklaer.js";   // Erklaer-Einblendung nach "Los geht's" (Restpaket 3a)
import { einsetzenWeich } from "./weich.js";   // Spielseiten: nur Geaendertes austauschen (Schritt 4b, weiche Animationen)
import * as WAND from "./wand.js";   // Wand-Geraet haelt den Raum (Adresse #tv, Nico 13.11.2026)
import * as FG from "./fragen_gedaechtnis.js";   // Quizfragen ohne Wiederholung ueber Abende - Knopf "Fragen wieder von vorn"

const app = document.getElementById("app");
const BASIS = location.href.split("#")[0];
// Raumhalter (Nico 13.11.2026): das Wand-Geraet (Ally oder Tablet, Adresse #tv, wand.js) haelt den Raum. Dazu laeuft diese
// App dort in einem unsichtbaren Rahmen mit ...?halter=1: sie oeffnet den Raum (&auf=<anlass>) oder fuehrt ihn weiter und
// fuehrt alle Spiele aus. Ihr Eintrag in raum.spieler traegt halter: true - er spielt nirgends mit und taucht in keiner
// Liste der Gaeste auf. Faellt das Wand-Geraet aus (Seite nicht mehr vorn, Akku leer), holt eine Spielleitung den Raum auf
// ihr Geraet (raumHolen); ist die Wand zurueck, uebernimmt sie von selbst wieder (abgeloest).
const HALTER = new URLSearchParams(location.search).has("halter");
if (HALTER) TON.ganzStill(true);   // im unsichtbaren Rahmen klingt nichts - der Ton kommt von der Wand-Ansicht davor
const HOLEN_NACH = 15000;   // so lange muss das Gastgeber-Geraet weg sein, bevor "Raum hierher holen" erscheint
const HALTER_ZURUECK = 8000; // so lange nach dem Abloesen wartet das Wand-Geraet, bevor es den Raum wieder uebernimmt
const gaeste = (r = raum) => ((r && r.spieler) || []).filter((x) => !x.halter);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NAME_MAX = 14;
const MAX_SPIELER = 30;
const MAX_PARTIEN = 12;
const spiel = (id) => SPIELE.find((x) => x.id === id);
// Lange Spielnamen brechen am Handy an der Silbe um statt mitten im Wort ("Pferderenne-n", "Schätzmeist-er"): weiche
// Trennstellen (\u00AD) - sie zeigen nur dann einen Strich, wenn die Zeile wirklich zu kurz ist.
const TRENNEN = { Pferderennen: "Pferde\u00ADrennen", "Schätzmeister": "Schätz\u00ADmeister", Blitzreaktion: "Blitz\u00ADreaktion", "Bilderrätsel": "Bilder\u00ADrätsel",
  "Würfelpoker": "Würfel\u00ADpoker", Autoscooter: "Auto\u00ADscooter", Farbchaos: "Farb\u00ADchaos", "Millionär?": "Millio\u00ADnär?", Pantomime: "Panto\u00ADmime",
  Klatschen: "Klat\u00ADschen", Busfahrer: "Bus\u00ADfahrer", Partybrett: "Party\u00ADbrett", Wortkette: "Wort\u00ADkette", versenken: "ver\u00ADsenken" };
const nameHTML = (name) => String(name ?? "").split(" ").map((w) => esc(TRENNEN[w] || w)).join(" ");

let rolle = null;          // "gastgeber" | "gast"
let netz = null;           // Verbindung zum Raum
let code = null;           // Raumcode
let meineId = null;
let meinName = "";
let raum = null;           // {anlass, look, testkonten, ab18, ohneAlkohol, spieler, admins, gastgeber, partien, tafel, meldung, uhr, pNr}
let merker = {};           // Gast: zuletzt gelesene Texte (was hat sich geaendert)
let geschrieben = null;    // Gastgeber: zuletzt geschriebene Texte
let anwesend = {};         // da/<id>
let status = "";           // vor dem Raum: "lade" | "verbinde" | "beendet" | "abgeloest" | "fehler"
let statusText = "";
let ansicht = null;        // pid des angezeigten Spiels, sonst Uebersicht
let tafelAuf = false;
let steuerAuf = false;     // Steuerseite der Spielleitung (Beamer, Diashow, Aussehen, Testkonten ...)
let codeFehler = null;     // Feld, unter dem "Code falsch" steht (bleibt bis zum richtigen Code)
let tafelAnsicht = { station: null, modus: "liste", leeren: false };
let tafelMomenteGesehen = null;
let offenGemeldet = 0;
let tafelAblage = null;
const tafelAbgleich = abgleich((a) => senden(a));
let steuern = sessionStorage.getItem("pa_steuern") !== "aus";
let einladenOffen = false, codeOffen = false, endeFrage = false;
let adminWartend = {};     // Gastgeber: Beweise, die er noch nicht pruefen kann (hat selbst keinen Code)
let adminFehler = {};      // Gastgeber: falsche Beweise je Konto {n, bis}
let phasen = {};           // pid -> zuletzt gesehene Phase
let eigeneMeldung = 0, ansageNr = 0, ansageTimer = null, ersterStand = true;
let partieSig = "";
let eingesetzt = null;   // was einsetzen zuletzt gesetzt hat (sp.ruhig in zeichnen) - gilt nur, solange sein erster Knoten noch dasteht
let warVerbunden = false;
let radGesehen = -1, radGemeldet = -1, jokerGesehen = -1, meineJoker = -1;   // Gluecksrad: was dieses Handy schon gemeldet hat
// Controller an diesem Geraet (Nico 30.10.2026, controller.js): jeder ist ein eigener Spieler im Raum
let pads = {};             // gamepad.index -> {id, name, nr, art}
let sendeAls = null;       // waehrend ein Controller etwas ausloest: in seinem Namen senden
let anzeige = { pid: null, id: null };   // fuer wen das angezeigte Spiel gerade gezeichnet ist
// Verlaesslichkeit (Geburtstags-Runde A, Nico 06.11.2026)
let wache = null;          // Netzwache (netzwache.js): beim Gastgeber und bei der Spielleitung
let stvMein = [];          // Stellvertreter: Gaeste, fuer die dieses Geraet mitdrueckt (Vorschlag 10)
let stvWahl = null;        // ... und fuer wen gerade
let neuDabei = false;      // dieses Handy ist gerade frisch beigetreten: ein alter Platz wird gleich aufgemacht (Vorschlag 9)
let zurueckWunsch = false; // "Ja, das ist mein Platz": auch wenn das alte Handy noch als verbunden gilt
let doppelName = null;     // Beitreten: dieser Name ist im Raum schon vergeben, Rueckfrage steht
let uebergabeNr = 0, rettungNr = 0;   // zuletzt gemeldete Platz-Uebergabe und Spiel-Rettung
let platzAuf = null;       // Partie, bei der "Platz uebergeben" aufgeklappt ist
let verlassenFrage = null; // Partie, bei der "Du bist der Letzte - Spiel endet" gefragt wird (Verlassen, Nico 13.11.2026)
let alleEndeFrage = null;  // Partie, bei der die Spielleitung "Fuer alle beenden?" bestaetigen muss
let rausNr = 0;            // zuletzt gemeldetes Verlassen
let fuerAuto = null;       // {pid, id, neu}: dieses Geraet drueckt gerade fuer einen Spieler am Zug, der raus oder nicht verbunden ist
let rettenFrage = null;    // Partie, bei der die Sicherheitsfrage von "Spiel retten" steht
let gehtNichtZuletzt = 0;
// Spielleitung und Ablauf (Geburtstags-Runde B, spielleitung.js)
let pauseStau = [];        // Gastgeber: Eingaben, die in der Pause ankamen - sie laufen beim Weiter nach
let pauseWar = false;
let rueckDaten = {};       // Gastgeber: je Spielleitung, wie sich ihre letzte Aktion zuruecknehmen laesst
let rueckFrage = false;    // Sicherheitsfrage zu "Rueckgaengig" steht offen
let rueckMeldNr = 0;
let radProtokolliert = 0;
const dranWar = {};        // pid -> war dieses Handy zuletzt am Zug (Vorschlaege 15, 16)
let dranBereit = false;    // erster Stand: nichts Altes melden
// Fehlerjagd nach dem ersten Spieleabend (Nico 31.10.2026):
// - Ergebnis-Bildschirme stehen erst eine Weile: Weiter-Knoepfe sind die ersten Sekunden gesperrt ("die Rangliste wird
//   durch Weitertippen sofort weggetippt"). Ein Ergebnis erkennt app.js an .urteil, .rangliste oder [data-ergebnis].
// - "Weiter" zaehlt nur einmal: wer weiterblaettert, schickt mit, welchen Stand (p.v) er gesehen hat; hat seitdem schon
//   jemand weitergeblaettert (p.wv), verfaellt der zweite Tipp (Doppeltipp, zwei Handys gleichzeitig).
const ERGEBNIS_SPERRE = 2000;
const WEITER_TYPEN = new Set(["weiter", "naechster", "miniweiter", "neu", "neustart", "los", "start", "aufloesen"]);
const SPERR_TYPEN = new Set([...WEITER_TYPEN, "kaufen", "nein", "duell", "weg", "kaufware"]);
let ergebnisSperre = { key: "", bis: 0, timer: null };
// Zurueck-Knopf des Handys: aus Spiel, Tafel oder Steuerseite zur Uebersicht statt aus dem Raum
let zurueckEintrag = !!(history.state && history.state.pa === "unter");

// Fuer die automatischen Tests
window.__partyspiele = { code: () => code, id: () => meineId, raum: () => raum, rolle: () => rolle, ansicht: () => ansicht, pads: () => pads, netz: () => netz, wache: () => wache, senden: (a) => senden(a), absender: (a) => absender(a), protokoll: () => (wache ? wache.protokollListe() : []) };

// ---------------------------------------------------------------- Hilfen
async function teilen(text, titel) {
  if (navigator.share) {
    try { await navigator.share({ title: titel, text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); hinweis("Kopiert – jetzt in WhatsApp einfügen"); }
  catch (e) { prompt("Zum Kopieren:", text); }
}
function hinweis(text, art = "") {
  // Im Hauptmenue erscheint die Meldung im Kopf statt als Streifen ueber den Knoepfen
  if (document.querySelector("[data-hm-meldung]")) return HM.meldung(text);
  const d = document.createElement("div");
  d.className = "toast";
  if (art) d.dataset.art = art;
  d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
// Werwolf-Nacht: kein Brummen beim Tippen - im dunklen, stillen Raum hoert man sonst, wer gerade handelt
function vibriere(ms = 60) { if (TON.nachtLeise()) return; try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
function zeitVor(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 2 ? "gerade eben" : m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : `vor ${Math.round(m / 1440)} Tagen`;
}
function konfetti(n = 90) {
  const farben = raum && raum.look === "halloween" ? ["#ff7518", "#9b4dff", "#ffd23f", "#2b2b2b", "#ff9a3c"] : ["#ff5fae", "#3fd0ff", "#ffd23f", "#5ef08a", "#6d5dfc", "#ff9600"];
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i");
    d.className = "konfetti";
    d.style.left = Math.random() * 100 + "vw";
    d.style.background = farben[i % farben.length];
    d.style.setProperty("--dx", (Math.random() * 40 - 20) + "vw");
    d.style.setProperty("--dreh", (Math.random() * 1440 - 720) + "deg");
    d.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    d.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4200);
  }
  vibriere(200);
  TON.spiele("sieg");
}

// ---------------------------------------------------------------- Merken im Browser
const sitzKey = (c) => `pa_sitzung_${c}`;
function sitzung(c) { try { return JSON.parse(sessionStorage.getItem(sitzKey(c))); } catch (e) { return null; } }
function sitzungMerken() { sessionStorage.setItem(sitzKey(code), JSON.stringify({ id: meineId, name: meinName, rolle })); }
const EIGENE = "pa_eigene_raeume";   // Raeume, die dieser Browser geoeffnet hat (Gastgeber-Schluessel fuer den Wechsel)
function eigene() { try { return JSON.parse(localStorage.getItem(EIGENE)) || []; } catch (e) { return []; } }
function eigeneMerken(c, k, titel) {
  const alt = eigene().find((x) => x.code === c);
  const l = eigene().filter((x) => x.code !== c);
  l.unshift({ code: c, k: k || (alt && alt.k) || "", titel: titel || (alt && alt.titel) || "Raum", zeit: Date.now() });
  localStorage.setItem(EIGENE, JSON.stringify(l.slice(0, 5)));
}
function eigeneVergessen(c) { localStorage.setItem(EIGENE, JSON.stringify(eigene().filter((x) => x.code !== c))); }
function ansichtMerken() { if (code) sessionStorage.setItem(`pa_ansicht_${code}`, ansicht || ""); }

// ---------------------------------------------------------------- Startseite und Raum-Link
// Lesezeichen #beamer im selben Tab (z. B. noch der alte Raum offen): nur der Teil hinter # aendert sich, der Browser laedt
// dann nichts neu - ohne das hier bliebe das Lesezeichen wirkungslos
window.addEventListener("hashchange", () => { if (location.hash === "#beamer" || location.hash === "#tv") location.reload(); });
function startBild() {
  // Lesezeichen am Ally: #beamer zeigt eine Kopplungszahl, die Spielleitung koppelt vom Handy (kopplung.js, Runde 3)
  if (location.hash === "#beamer") return KOPPLUNG.beamerSeite(app, (c) => { history.replaceState(null, "", `${BASIS}#r=${c}&beamer`); B.start(c, app); });
  const m = location.hash.match(/^#r=([a-z0-9]{12,32})(&beamer)?$/);
  if (m && m[2]) return B.start(m[1], app);   // Beamer: kein Spieler, zeigt nur (beamer.js)
  // Wand-Geraet haelt den Raum: grosse Ansicht vorn, Raumhalter im unsichtbaren Rahmen dahinter (wand.js)
  if (location.hash === "#tv") return WAND.seite(app, (c) => B.start(c, app));
  if (m) return raumLink(m[1]);
  // Raumhalter im Rahmen der Wand-Seite: oeffnet den Raum ohne Zutun (den Code hat die Wand-Seite schon geprueft)
  if (HALTER) {
    const frage = new URLSearchParams(location.search), anlass = A.anlassNeu(frage.get("auf") || "", frage.get("text") || "");
    if (anlass) { meinName = WAND.NAME; return raumOeffnen(anlass); }
  }
  startseite();
}

function namensFeld() {
  return `<label>Dein Name<input id="rf-name" maxlength="${NAME_MAX}" value="${esc(meinName || localStorage.getItem("pa_name") || "")}" placeholder="z. B. Nico" autocomplete="nickname"></label>`;
}
function codeFeld() {
  return `<details class="codefeld"><summary>🔑 Ich bin Spielleitung</summary>
    <label>Freischaltcode<input id="rf-freischalt" type="password" inputmode="numeric" autocomplete="off" maxlength="40" placeholder="nur für die Spielleitung"></label>
    <p class="leise klein">Gäste brauchen keinen Code – nur ihren Namen.</p></details>`;
}

function startseite() {
  A.lookAnwenden(null);
  document.title = "Partyspiele";
  const zurueck = eigene().filter((x) => Date.now() - x.zeit < 4 * 86400000);
  app.innerHTML = `
    <div class="karte mitte titelbild">
      <div class="logo">🎉</div>
      <h1>Partyspiele</h1>
      <p class="leise">Ein Link für alle – jeder spielt am eigenen Handy.</p>
      ${namensFeld()}
      ${codeFeld()}
    </div>
    <div class="karte">
      <h2>Raum öffnen für …</h2>
      <div class="anlaesse">
        <button class="anlass a-halloween" data-anlass="halloween"><span class="emo">🎃</span><b>Halloween</b></button>
        <button class="anlass a-geburtstag" data-anlass="geburtstag"><span class="emo">🎂</span><b>Geburtstag</b></button>
      </div>
      <label>… oder eigener Anlass<input id="rf-anlass" maxlength="${A.TEXT_MAX}" placeholder="z. B. Hüttenabend"></label>
      <button class="zweit" data-anlass="frei">✨ Raum für eigenen Anlass öffnen</button>
      <p class="leise klein">Danach bekommst du einen Link und einen QR-Code – mehr brauchen die anderen nicht.</p>
    </div>
    ${zurueck.length ? `<div class="karte"><h2>Zurück in deinen Raum</h2>${zurueck.map((x) => `<button class="zweit zurueckknopf" data-zurueck="${esc(x.code)}">${esc(x.titel)} <small class="leise">· ${zeitVor(x.zeit)}</small></button>`).join("")}</div>` : ""}`;
}

function namenLesen() {
  const f = document.getElementById("rf-name");
  const n = f ? f.value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : meinName;
  if (!n) { hinweis("Bitte zuerst einen Namen eingeben"); return null; }
  meinName = n;
  localStorage.setItem("pa_name", n);
  return n;
}

function ladeBild(text) { status = "lade"; statusText = text; zeichnen(); }
// nochmal: kein Internet beim Betreten - von selbst wieder versuchen, statt auf "Neu laden" zu warten (Vorschlag 123)
let fehlerTimer = null;
function fehlerBild(text, nochmal) {
  status = "fehler"; statusText = text; zeichnen();
  clearTimeout(fehlerTimer);
  if (nochmal) fehlerTimer = setTimeout(() => { if (status === "fehler") nochmal(); }, 4000);
}

async function verbinden(c) {
  if (netz && netz.code === c) return netz;
  if (netz) netz.beenden();
  netz = await new Verbindung(c).start();
  return netz;
}

async function raumLink(c) {
  code = c;
  const s = sitzung(c);
  if (s && s.name) {
    meinName = s.name; meineId = s.id;
    return s.rolle === "gastgeber" ? gastgeberFortsetzen() : gastBeitreten();
  }
  ladeBild("Raum wird geladen …");
  let lobby = null, gg = null;
  try {
    await verbinden(c);
    const t = await netz.lesen("stand/lobby");
    lobby = t ? JSON.parse(t) : null;
    gg = await netz.lesen("gastgeber").catch(() => null);
  } catch (e) { return fehlerBild("Keine Verbindung zum Raum. Ist das Internet an? Es wird gleich von selbst noch einmal versucht.", () => raumLink(c)); }
  if (!lobby) { status = "beendet"; statusText = "Diesen Raum gibt es nicht (mehr)."; return zeichnen(); }
  status = "";
  A.lookAnwenden(lobby.look);
  document.title = `${A.titel(lobby.anlass)} – Partyspiele`;
  const eigen = eigene().find((x) => x.code === c);
  const online = gaeste(lobby).filter((x) => x.online).length;
  app.innerHTML = `
    <div class="karte mitte titelbild">
      <div class="logo">${A.logo(lobby.look)}</div>
      ${A.deko(lobby.look)}
      <h1 class="anlass-titel">${A.titelHTML(lobby.anlass)}</h1>
      <p class="leise">${online} ${online === 1 ? "ist" : "sind"} schon da${gg && gg.name ? ` · Gastgeber: ${esc(gg.name)}` : ""}</p>
      ${namensFeld()}
      ${codeFeld()}
      <button class="gross" id="beitreten">Beitreten</button>
      <div id="doppelname"></div>
      ${eigen ? `<button class="zweit" id="weitermachen">🏠 Als Gastgeber weitermachen</button>` : ""}
    </div>`;
}
// Wiedereinstieg (Vorschlag 9): gibt es den Namen schon und gilt das Handy noch als verbunden, kann das ein zweiter Gast mit
// gleichem Namen sein - oder ein Handy, dessen Akku gerade leer ging. Das weiss nur der Mensch. -> true, wenn gefragt wird
async function doppelNameFragen() {
  let lobby = null;
  try { const t = await netz.lesen("stand/lobby"); lobby = t ? JSON.parse(t) : null; } catch (e) { return false; }
  const gleich = (x) => x.name.toLocaleLowerCase("de") === meinName.toLocaleLowerCase("de");
  const treffer = lobby && (lobby.spieler || []).find((x) => gleich(x) && x.online && x.id !== lobby.gastgeber);
  const feld = document.getElementById("doppelname");
  if (!treffer || !feld) return false;
  doppelName = treffer.name;
  feld.innerHTML = `<div class="hinweisbox warten doppelname"><p><b>${esc(treffer.name)}</b> ist schon im Raum. Bist du das?</p>
    <button class="gruen" data-doppel="ja">Ja, das ist mein Platz</button><button class="zweit" data-doppel="nein">Nein, ich bin jemand anderes</button></div>`;
  return true;
}

// Freischaltcode aus einem Feld pruefen (vor dem Beitreten oder spaeter im Raum). -> true = weiter, false = abbrechen
async function freischalten(feldId) {
  const f = document.getElementById(feldId);
  const roh = f ? f.value : "";
  if (!K.codeSauber(roh)) return true;
  if (K.wartezeit() > 0) {
    if (f) f.value = "";
    codeFehlerZeigen(feldId, true);
    TON.spiele("falsch"); vibriere(120);
    return false;
  }
  hinweis("Code wird geprüft …");
  const k = await K.codePruefen(roh);
  if (f) f.value = "";
  if (!k) {
    K.fehlversuch();
    codeFehlerZeigen(feldId, false);
    TON.spiele("falsch"); vibriere(120);
    return false;
  }
  K.erfolg();
  K.schluesselMerken(k);
  codeFehlerWeg();
  return true;
}

// Deutliche Meldung unter dem Codefeld (Nico 26.10.: "Code falsch – du kannst auch ohne Code als Gast rein") mit der
// Wartezeit der Bremse; Beitreten ohne Code geht dabei immer (eigener Knopf, das Feld ist schon geleert).
function codeFehlerHTML(feldId, gebremst) {
  const imRaum = feldId === "rf-code";
  const beitreten = !imRaum && !!document.getElementById("beitreten");
  const weiter = imRaum ? "du spielst einfach als Gast weiter" : beitreten ? "du kannst auch ohne Code als Gast rein" : "du kannst den Raum auch ohne Code öffnen";
  return `<div class="codefehler" role="alert"><b>${gebremst ? "⏳ Zu viele falsche Codes" : "❌ Code falsch"} – ${weiter}.</b>
    <span class="bremse" data-bremse>${bremseText()}</span>
    ${beitreten ? `<button class="gruen" data-ohne-code>🙋 Ohne Code als Gast rein</button>` : ""}</div>`;
}
function bremseText() {
  const w = K.wartezeit();
  return w > 0 ? `Nächster Code-Versuch in ${W.uhrText(w)}` : "Den Code kannst du sofort noch einmal versuchen.";
}
function codeFehlerZeigen(feldId, gebremst) {
  codeFehler = { feld: feldId, gebremst };
  const f = document.getElementById(feldId);
  if (!f) return;
  const alt = f.closest("details, .karte") && f.closest("details, .karte").querySelector(".codefehler");
  if (alt) alt.remove();
  const label = f.closest("label") || f;
  label.insertAdjacentHTML("afterend", codeFehlerHTML(feldId, gebremst));
  const d = f.closest("details");
  if (d) d.open = true;
}
function codeFehlerWeg() { codeFehler = null; document.querySelectorAll(".codefehler").forEach((x) => x.remove()); }
function bremseAnzeigen() { document.querySelectorAll("[data-bremse]").forEach((el) => { const t = bremseText(); if (el.textContent !== t) el.textContent = t; }); }

// ---------------------------------------------------------------- Gastgeber
const neueAenderung = () => ({ lobby: false, tafel: false, partien: new Set() });
const ALLES = () => ({ lobby: true, tafel: true, partien: new Set(Object.keys((raum && raum.partien) || {})), alles: true });

async function raumOeffnen(anlass) {
  rolle = "gastgeber";
  ladeBild("Raum wird geöffnet …");
  code = neuerCode();
  try {
    await verbinden(code);
    meineId = netz.uid || zufallsText(16);
    const k = zufallsText(24);
    await netz.aendern({ gastgeber: { uid: meineId, name: meinName, t: netz.zeitstempel() }, [`gastgeberschluessel/${k}`]: true });
    eigeneMerken(code, k, A.titel(anlass));
  } catch (e) { console.warn(e); return fehlerBild("Der Raum ließ sich nicht anlegen. Ist das Internet an?"); }
  raum = { v: 1, anlass, look: A.lookZu(anlass), testkonten: true, ab18: false, ohneAlkohol: false, uhr: 0, pNr: 1, meldung: null,
    admins: [], gastgeber: meineId, spieler: [{ id: meineId, name: meinName, platz: 0, online: true, gast: 1, ...(HALTER ? { halter: true } : {}) }], partien: {}, tafel: TAFEL.neu(),
    gastNr: 1, gruesse: [], beamer: B.steuer(null), glueck: null };
  G.sicher(raum);
  glueckMerkenLesen();   // gestrichene Rad-Ergebnisse vom letzten Raum (Nico 31.10.2026: "wird gemerkt")
  brettMerkenLesen();    // gestrichene Partybrett-Ereignisse ebenso
  planMerkenLesen();     // Spielplan: vorher angelegt, Raum erst am Abend geoeffnet
  SL.speicherAbgleich(raum);   // gespeicherte Partybretter dieses Geraets (Runde C)
  geschrieben = null;
  gastgeberStart();
}

const PLAN_MERK = "pa_spielplan";
function planMerkenSchreiben() { try { localStorage.setItem(PLAN_MERK, JSON.stringify(SL.planMerkStand(raum))); } catch (e) { /* privater Modus */ } }
function planMerkenLesen() { try { SL.planUebernehmen(raum, JSON.parse(localStorage.getItem(PLAN_MERK) || "null"), Date.now()); } catch (e) { /* kaputt: ignorieren */ } }

// Gluecksrad-Auswahl (abgeschaltete Felder, gestrichene Ergebnisse) auf dem Gastgeber-Geraet merken
const GLUECK_MERK = "pa_glueck_auswahl";
const GLUECK_MERKEN = new Set(["feld", "streichen", "allestreichen", "alleauf", "trinkaus"]);
function glueckMerkenSchreiben() {
  try { localStorage.setItem(GLUECK_MERK, JSON.stringify(G.merkStand(raum.glueck))); } catch (e) { /* privater Modus */ }
}
function glueckMerkenLesen() {
  try { const m = JSON.parse(localStorage.getItem(GLUECK_MERK) || "null"); if (m) G.merkUebernehmen(raum, m); } catch (e) { /* kaputt: ignorieren */ }
}
// Partybrett: gestrichene Ereignisse (Nico 31.10.2026, Punkt 8: "wird gemerkt") - gleiche Art wie beim Gluecksrad
const BRETT_MERK = "pa_brett_ereignisse_weg";
function brettMerkenSchreiben() {
  try { localStorage.setItem(BRETT_MERK, JSON.stringify(raum.brettWeg || [])); } catch (e) { /* privater Modus */ }
}
function brettMerkenLesen() {
  try { const m = JSON.parse(localStorage.getItem(BRETT_MERK) || "null"); if (m) BE.merkUebernehmen(raum, m); } catch (e) { /* kaputt: ignorieren */ }
  try { raum.brettVorlagen = JSON.parse(localStorage.getItem(BRETT_VORLAGEN) || "null") || {}; } catch (e) { raum.brettVorlagen = {}; }
}
// Hauptmenue (Nico 06.11.2026): keine Standardkarte - es gilt, was zuletzt gewaehlt war; beim ersten Mal muss gewaehlt werden.
// Beides liegt beim Gastgeber im Browser; die eigenen Vorlagen stehen zusaetzlich im Raum, damit Pult und Spielleitung sie sehen.
const BRETT_VORLAGEN = "pa_brett_vorlagen", BRETT_ZULETZT = "pa_brett_zuletzt";
function brettZuletztMerken(p) {
  try { localStorage.setItem(BRETT_ZULETZT, JSON.stringify(M.vorlageAus(p, raum))); } catch (e) { /* privater Modus */ }
}
function brettVorbelegen(p) {
  const t = globalThis.__brettTest;
  // Testschalter: wer mit __brettTest spielt, hat sofort eine Karte (die Wahl selbst pruefen test_hauptmenue.py und test_runde4.py)
  if (t) p.karte = BR.BRETTER[t.karte] ? t.karte : VORGABE_KARTE;
  else {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(BRETT_ZULETZT) || "null"); } catch (e) { v = null; }
    if (v) { const { weg, ...rest } = v; M.vorlageAnwenden(p, raum, rest); }
  }
  M.abgleich(p, raum.look, P.istBot);
}
function brettVorlage(p, a) {
  const liste = raum.brettVorlagen || (raum.brettVorlagen = {}), merken = () => { try { localStorage.setItem(BRETT_VORLAGEN, JSON.stringify(liste)); } catch (e) { /* privater Modus */ } };
  if (a.was === "vorlage_speichern") {
    const name = M.vorlageName(liste);
    liste[name] = M.vorlageAus(p, raum); merken();
    M.stand(p).vorlage = name;
    hinweis(`Gespeichert als „${name}“`);
  } else if (a.was === "vorlage_laden") {
    const name = String(a.name || "");
    if (!M.vorlageAnwenden(p, raum, M.VORLAGEN[name] || liste[name], name)) return false;
    brettMerkenSchreiben();
  } else if (a.was === "vorlage_weg") {
    if (!liste[a.name]) return false;
    delete liste[a.name]; merken();
    M.stand(p).vorlage = null;
  } else return false;
  return true;
}

async function gastgeberFortsetzen() {
  rolle = "gastgeber";
  ladeBild("Raum wird geladen …");
  let l = null, gg = null;
  try {
    await verbinden(code);
    gg = await netz.lesen("gastgeber");
    l = standLesen(await netz.lesen("stand"));
  } catch (e) { return fehlerBild("Keine Verbindung zum Raum. Ist das Internet an? Es wird gleich von selbst noch einmal versucht.", gastgeberFortsetzen); }
  if (!l) { rolle = null; status = "beendet"; statusText = "Diesen Raum gibt es nicht (mehr)."; eigeneVergessen(code); return zeichnen(); }
  const neu = netz.uid || meineId || zufallsText(16);
  try {
    if (gg && gg.uid !== neu) {
      const eigen = eigene().find((x) => x.code === code);
      if (eigen && eigen.k) await netz.schreiben(`gastgeberwechsel/${neu}`, { k: eigen.k }).catch(() => {});
    }
    await netz.schreiben("gastgeber", { uid: neu, name: meinName || (l.raum.spieler[0] && l.raum.spieler[0].name) || "Gastgeber", t: netz.zeitstempel() });
  } catch (e) { rolle = null; return fehlerBild("Dieses Gerät darf den Raum nicht übernehmen."); }
  raum = l.raum;
  const alt = (gg && gg.uid) || raum.gastgeber || (raum.spieler[0] && raum.spieler[0].id);
  // Wer schon als Spieler im Raum ist (Spielleitung holt den Raum, Raumhalter kommt zurueck), behaelt seinen eigenen Platz -
  // der bisherige Gastgeber bleibt als Spieler stehen. Nur ein neuer Tab desselben Gastgebers uebernimmt dessen Kennung.
  const schonDa = raum.spieler.some((x) => x.id === neu);
  if (alt && alt !== neu && !schonDa) { P.idErsetzen(raum, alt, neu); G.idErsetzen(raum, alt, neu); }
  meineId = neu;
  raum.gastgeber = neu;
  if (!Array.isArray(raum.admins)) raum.admins = [];
  G.sicher(raum);
  const ich = raum.spieler.find((x) => x.id === meineId);
  meinName = ich ? ich.name : meinName;
  geschrieben = l.merker;
  eigeneMerken(code, "", A.titel(raum.anlass));
  gastgeberStart();
}

function gastgeberStart() {
  status = "";
  sitzungMerken();
  history.replaceState(history.state, "", `${BASIS}#r=${code}`);
  document.title = `${A.titel(raum.anlass)} – Partyspiele`;
  tafelAblage = browserAblage(schluesselFuer(code), { testFilter: () => K.testkontenAn(raum) });
  if (!raum.tafel || !Array.isArray(raum.tafel.stationen)) raum.tafel = tafelAblage.laden();
  raum.uhr = netz.versatz;
  netz.beiVersatz = (v) => { if (rolle === "gastgeber" && raum && raum.uhr !== v) { raum.uhr = v; schreiben(); } };
  netz.beiVerbindung = netzAnzeige;
  netz.beiPostfach = () => netzAnzeige(netz.verbunden);
  netz.beobachten("da", (d) => { const b = beamerZahl(); anwesend = d || {}; anwesenheitUebernehmen(); beamerGeaendert(b); });
  netz.beobachten("gastgeber", (gg) => { if (rolle === "gastgeber" && gg && gg.uid && gg.uid !== meineId) abgeloest(); });
  netz.beobachten("stand/live", DU.liveEmpfangen);   // Duelle: Fortschritt der Duellanten (Gaeste lesen ihn mit "stand")
  netz.anwesend(meineId, meinName);
  pulsStarten();
  wacheStarten();
  rettungLaden();
  rueckLaden();
  radProtokolliert = raum.glueck && raum.glueck.letzter ? Number(raum.glueck.letzter.nr) || 0 : 0;
  stvLaden();
  netz.aktionenEmpfangen((von, a, unterwegs) => {
    if (rolle !== "gastgeber") return;
    // lag zu lange im Funkloch: das Spiel ist weiter, die Eingabe passt nicht mehr (Raum-Aktionen gelten immer)
    if (unterwegs > EINGABE_GILT && a && !RAUM_TYPEN.has(a.typ)) return;
    ausfuehren(von, a);
  });
  ansicht = sessionStorage.getItem(`pa_ansicht_${code}`) || null;
  if (ansicht && !raum.partien[ansicht]) ansicht = null;
  Object.values(raum.partien).forEach((p) => { phasen[p.pid] = p.phase; });
  eigeneMeldung = ansageNr = raum.meldung ? raum.meldung.nr : 0;
  meldeNummernSetzen();
  const k = K.meinSchluessel();
  if (k) adminSelbst();
  verteilen(ALLES());
  eingangEinmal();
  padsLaden();
}

// ---------------------------------------------------------------- Verlaesslichkeit (Geburtstags-Runde A)
function pulsStarten() { akkuStarten(); netz.pulsStarten(meineId, akkuWerte); }
// Die Netzwache laeuft beim Gastgeber immer (Wiedereinstieg braucht den Puls), bei Gaesten erst mit Spielleitungs-Rechten
function wacheStarten() {
  if (wache && wache.netz === netz) return;
  wache = new Wache(netz, { beiNeu: wacheNeu, melden: (t) => { if (binAdmin()) { hinweis(t); vibriere([80, 60, 80]); TON.spiele("falsch"); } } });
  wache.namen = () => Object.fromEntries(((raum && raum.spieler) || []).map((x) => [x.id, x.name]));
}
function wacheNeu() { if (steuerAuf && zeigeSteuer() && !brettReiter && !glueckReiter && !status) zeichnen(); }
setInterval(() => { if (wache && steuerAuf) wache.auffrischen(app); }, 2000);
function meldeNummernSetzen() { uebergabeNr = raum.uebergabe ? raum.uebergabe.nr : 0; rettungNr = raum.rettung ? raum.rettung.nr : 0; rausNr = raum.raus ? raum.raus.nr : 0; }

// Stellvertreter (Vorschlag 10): die Spielleitung drueckt am eigenen Handy fuer Gaeste ohne Smartphone mit. Das Handy behandelt
// sie wie eigene Mitspieler; die Aktionen gehen in ihrem Namen raus, im Stand aendert sich nichts.
const stvKey = () => `pa_stv_${code}`;
function stvLaden() { try { stvMein = JSON.parse(sessionStorage.getItem(stvKey())) || []; } catch (e) { stvMein = []; } }
function stvMerken() { try { sessionStorage.setItem(stvKey(), JSON.stringify(stvMein)); } catch (e) { /* privater Modus */ } }
function stvUmschalten(id) {
  stvMein = stvMein.includes(id) ? stvMein.filter((x) => x !== id) : [...stvMein, id];
  if (stvWahl === id) stvWahl = null;
  stvMerken();
}
const stvHier = (p) => stvMein.filter((id) => p.mit.includes(id));
// wer auf diesem Geraet gerade spielt -> Nummer im Spiel, null = kein Stellvertreter in diesem Spiel
function stvIndex(p, eigen) {
  const hier = stvHier(p);
  if (!hier.length) return null;
  if (stvWahl && hier.includes(stvWahl)) return p.mit.indexOf(stvWahl);
  return eigen >= 0 ? eigen : p.mit.indexOf(hier[0]);
}
function stvLeiste(p, nm, ich) {
  const hier = stvHier(p);
  if (p.phase !== "laeuft" || !hier.length) return "";
  const leute = [...(p.mit.includes(meineId) ? [meineId] : []), ...hier];
  return `<div class="stvleiste"><small>🤝 Du drückst für:</small>${leute.map((id) => { const j = p.mit.indexOf(id); return `<button class="klein2 ${j === ich ? "gewaehlt" : ""}" data-stv-wahl="${esc(id)}">${esc(nm[j])}</button>`; }).join("")}</div>`;
}
// Beim Sammeln: Gaeste ohne Handy eintragen - sie sehen die Meldung "Mitmachen" ja nicht
function stvSammeln(p) {
  const frei = stvMein.filter((id) => !p.mit.includes(id) && raum.spieler.some((x) => x.id === id));
  if (p.phase !== "sammeln" || !frei.length) return "";
  return `<div class="stvleiste"><small>🤝 Ohne Handy:</small>${frei.map((id) => `<button class="klein2" data-stv-mit="${esc(id)}">🙋 ${esc(raum.spieler.find((x) => x.id === id).name)} macht mit</button>`).join("")}</div>`;
}

// Spiel retten (Vorschlag 124): der Gastgeber merkt sich je Spiel die letzten funktionierenden Staende. "Funktionierend" heisst:
// die Aktion davor lief ohne Fehler durch und das Spiel liess sich zeichnen. Jeder weitere Druck geht einen Stand weiter zurueck.
const RETTUNG_TIEFE = 6, RETTUNG_ABSTAND = 8000;
const rettungKey = () => `pa_rettung_${code}`;
let rettung = {};                  // pid -> [{t, text}], neuester zuletzt
const rettungKaputt = new Set();   // Spiele, deren letzte Aktion oder Anzeige fehlschlug: dieser Stand wird nicht gesichert
function rettungLaden() { try { rettung = JSON.parse(localStorage.getItem(rettungKey())) || {}; } catch (e) { rettung = {}; } }
function rettungAblegen() { try { localStorage.setItem(rettungKey(), JSON.stringify(rettung)); } catch (e) { /* Speicher voll: bleibt im Arbeitsspeicher */ } }
function rettungMerken(pid) {
  const p = raum.partien[pid];
  if (!p || p.phase !== "laeuft" || !p.s) return;
  if (rettungKaputt.delete(pid)) return;
  const l = rettung[pid] || (rettung[pid] = []), letzte = l[l.length - 1], jetzt = Date.now();
  if (letzte && jetzt - letzte.t < RETTUNG_ABSTAND) return;
  const text = JSON.stringify(P.rettungStand(p));
  if (letzte && letzte.text === text) return;
  l.push({ t: jetzt, text });
  if (l.length > RETTUNG_TIEFE) l.shift();
  rettungAblegen();
}
function spielRetten(p) {
  const l = rettung[p.pid] || [], jetzt = JSON.stringify(P.rettungStand(p));
  while (l.length && l[l.length - 1].text === jetzt) l.pop();
  const e = l.pop(), nr = (raum.rettung ? raum.rettung.nr : 0) + 1, sp = spiel(p.spiel);
  raum.rettung = { nr, pid: p.pid, name: sp ? `${sp.emoji} ${sp.name}` : "Das Spiel", leer: !e, rest: l.length, sek: e ? Math.round((Date.now() - e.t) / 1000) : 0 };
  if (!e) return;
  P.standZurueck(p, JSON.parse(e.text), e.t, Date.now());
  rettungAblegen();
  clearTimeout(botTimer[p.pid]); delete botTimer[p.pid];
}
// "Geht nicht" (Vorschlag 130)
function gehtNicht() {
  if (!netz || Date.now() - gehtNichtZuletzt < 20000) { hinweis("Ist schon gemeldet – die Spielleitung kümmert sich"); return; }
  gehtNichtZuletzt = Date.now();
  const p = ansicht && raum.partien[ansicht], sp = p && spiel(p.spiel);
  netz.meldungSenden({ von: meineId, name: meinTafelName(), pid: p ? p.pid : "", spiel: sp ? sp.name : "", phase: p ? String((p.s && p.s.phase) || p.phase) : "", v: p ? p.v || 0 : 0,
    verbunden: netz.verbunden, geraet: navigator.userAgent.slice(0, 160) }).catch((e) => console.warn(e));
  hinweis("✓ Die Spielleitung weiß Bescheid");
}

// ---------------------------------------------------------------- Spielleitung (Geburtstags-Runde B, spielleitung.js)
// Protokoll: nur der Gastgeber schreibt; es liegt neben dem Stand, Gaeste laden es nie
function logge(art, text, wer = "", mehr = {}) {
  if (rolle !== "gastgeber" || !netz) return;
  netz.protokollSchreiben({ t: Date.now(), wer: String(wer || ""), art, text, ...mehr }).catch((e) => console.warn("Protokoll:", e && e.code));
}
function radProtokoll() {
  const l = raum.glueck && raum.glueck.letzter, nr = l ? Number(l.nr) || 0 : 0;
  if (nr <= radProtokolliert) return;
  radProtokolliert = nr;
  logge("rad", `🎡 ${l.name}: ${l.preis}${l.schub ? ` (per Joker von ${l.schub})` : ""}`);
}

// Pause: Bots und Zuguhren stehen, Eingaben stauen sich; beim Weiter ruecken alle Fristen nach hinten
function pauseUmschalten(ich) {
  if (raum.pause) {
    const um = SL.pauseAus(raum, Date.now());
    logge("pause", `▶️ Weiter nach ${W.uhrText(um)}`, ich.name);
    verteilen(ALLES());
    const stau = pauseStau;
    pauseStau = [];
    stau.forEach(([von, a]) => ausfuehren(von, a));
    return;
  }
  if (!SL.pauseAn(raum, ich.name, Date.now())) return;
  Object.keys(botTimer).forEach((pid) => { clearTimeout(botTimer[pid]); delete botTimer[pid]; });
  Object.keys(zugTimer).forEach((pid) => { clearTimeout(zugTimer[pid].t); delete zugTimer[pid]; });
  logge("pause", "⏸️ Pause", ich.name);
  verteilen(ALLES());
}
// An jedem Stand: Pausenbild am Handy. Die Spielleitung behaelt die Steuerung, Gaeste sehen nur noch die Pause.
function pauseAbgleich() {
  const an = SL.pausiert(raum) && !status;
  if (an !== pauseWar) {
    pauseWar = an;
    DU.pausieren(an); R.pausieren(an);
    if (an) TON.musik(null);
    vibriere(60);
  }
  let el = document.getElementById("pause");
  if (!an) { if (el) el.remove(); return; }
  const leitet = binAdmin();   // auch wer gerade "Nur mitspielen" gewaehlt hat, muss weitermachen koennen
  if (!el) { el = document.createElement("div"); el.id = "pause"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.className = leitet ? "pausebild leitung" : "pausebild";
  const sig = leitet ? "leitung" : "gast";
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  el.innerHTML = leitet ? `<b>⏸️ Pause – alles steht</b>${knopf("▶️ Weiter", { typ: "_pause" }, "gruen")}`
    : `<div class="pausebox"><div class="logo">⏸️</div><h2>Pause</h2><p class="leise">Die Spielleitung hat das Spiel angehalten.<br>Gleich geht es weiter.</p></div>`;
}

// Rueckgaengig: je Spielleitung genau die letzte eigene Aktion
const rueckKey = () => `pa_rueck_${code}`;
function rueckLaden() { try { rueckDaten = JSON.parse(localStorage.getItem(rueckKey())) || {}; } catch (e) { rueckDaten = {}; } }
function rueckAblegen() { try { localStorage.setItem(rueckKey(), JSON.stringify(rueckDaten)); } catch (e) { /* Speicher voll */ } }
function rueckMerken(von, art, text, daten = {}) {
  rueckDaten[von] = { art, text, ...daten };
  raum.rueck = { ...(raum.rueck || {}), [von]: { text } };
  rueckAblegen();
}
function rueckVergessen(von) {
  delete rueckDaten[von];
  if (raum.rueck) { const { [von]: weg, ...rest } = raum.rueck; raum.rueck = rest; }
  rueckAblegen();
}
function rueckAusfuehren(von, ich) {
  const r = rueckDaten[von];
  if (!r) return false;
  rueckVergessen(von);
  let ok = false;
  if (r.art === "punkte") {
    const w = W.sicher(raum.tafel);
    ok = w.buchungen.some((b) => b.id === r.b);
    if (ok) tafelAusfuehren({ typ: "_tafel", was: "w_weg", b: r.b }, { gastgeber: true, wer: ich.name });
  } else if (r.art === "schreck") ok = B.steuerAktion(raum, { was: "schreckweg" }, Date.now());
  else if (r.art === "rad") {
    // nur solange niemand weitergedreht hat - sonst waere dessen Dreh mit weg
    ok = !!raum.glueck && raum.glueck.nr === r.nr;
    if (ok) {
      const d = raum.glueck.lauf && raum.glueck.lauf.duell;
      if (d && d.pid && raum.partien[d.pid]) partieWeg(d.pid);
      raum.glueck = JSON.parse(r.alt);
      radProtokolliert = raum.glueck.letzter ? Number(raum.glueck.letzter.nr) || 0 : 0;
      B.steuerAktion(raum, { was: "weg" }, Date.now());
    }
  } else if (r.art === "start") {
    const p = raum.partien[r.pid];
    ok = !!p;
    if (p && r.los) {
      ok = p.phase === "laeuft";
      if (ok) { clearTimeout(botTimer[p.pid]); delete botTimer[p.pid]; p.phase = "sammeln"; p.s = null; p.zuletzt = null; p.v = (p.v || 0) + 1; }
    } else if (p) partieWeg(p.pid);
  }
  logge("rueck", ok ? `↩️ Zurückgenommen: ${r.text}` : `↩️ Ging nicht mehr: ${r.text}`, ich.name);
  raum.rueckMeld = { nr: (raum.rueckMeld ? raum.rueckMeld.nr : 0) + 1, an: von, text: ok ? `↩️ Zurückgenommen: ${r.text}` : `Geht nicht mehr – inzwischen ist etwas anderes passiert` };
  return true;
}

// Am Zug (Vorschlaege 15, 16): beim Wechsel auf dieses Handy einmal Vibration und kurzer Ton. Der Ton laesst sich je Handy abschalten;
// iPhones vibrieren aus Webseiten heraus nicht (Safari kennt navigator.vibrate nicht) - dort bleibt nur der Ton.
const DRAN_TON = "pa_dran_ton";
const dranTonAn = () => localStorage.getItem(DRAN_TON) !== "aus";
function dranVon(p, sp) {
  const s = p.s;
  if (!s) return null;
  if (sp.dranVon) { try { return sp.dranVon(s); } catch (e) { return null; } }
  if (s.ende || ["mini", "dkampf", "bonus"].includes(s.phase)) return null;
  return typeof s.dran === "number" ? s.dran : null;
}
function dranPruefen() {
  if (!raum || status) return;
  const erst = !dranBereit;
  dranBereit = true;
  Object.values(raum.partien).forEach((p) => {
    const sp = spiel(p.spiel), ich = p.mit.indexOf(meineId);
    const jetzt = !!sp && p.phase === "laeuft" && ich >= 0 && dranVon(p, sp) === ich;
    const neu = jetzt && !dranWar[p.pid];
    dranWar[p.pid] = jetzt;
    if (!neu || erst || SL.pausiert(raum) || TON.nachtLeise()) return;
    vibriere([120, 60, 120]);
    if (dranTonAn()) TON.spiele("dran");
  });
}
function dranSchalter() {
  const v = "vibrate" in navigator;
  return `<button class="klein2" data-dran-ton aria-pressed="${dranTonAn()}">${dranTonAn() ? "🔔" : "🔕"} Ton, wenn ich dran bin: ${dranTonAn() ? "an" : "aus"}</button>
    ${v ? "" : `<p class="leise klein dran-hinweis">Dieses Handy kann aus dem Browser nicht vibrieren (bei iPhones geht das nicht) – dir bleibt der Ton.</p>`}`;
}

// Beamer kommt oder geht: nur die Steuerung neu zeigen (Steuerseite oder Uebersicht), kein laufendes Spiel stoeren
function beamerGeaendert(vorher) {
  if (!raum || status || beamerZahl() === vorher || !zeigeSteuer()) return;
  if (steuerAuf || (!tafelAuf && !ansicht)) zeichnen();
}

// Ein anderes Geraet haelt jetzt den Raum. Steht dieses Geraet danach weiter als Spieler im Raum (die Spielleitung hatte den
// Raum geholt und der Raumhalter ist zurueck), spielt es einfach als Gast weiter. Sonst (neuer Tab desselben Gastgebers hat
// die Kennung uebernommen) bleibt es beim Hinweis. Der Raumhalter selbst wartet: raumhalter.py entscheidet, wann er zurueckkommt.
async function abgeloest() {
  const altNetz = netz, id = meineId;
  rolle = null;
  raum = null;
  let bleibe = false;
  if (altNetz && !HALTER) {
    status = "lade"; statusText = "Der Raum zieht um …";
    zeichnen();
    // der neue Gastgeber schreibt erst "gastgeber", dann den Stand: warten, bis der neue Stand da ist
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const t = await altNetz.lesen("stand/lobby"), l = t ? JSON.parse(t) : null;
        if (l && l.gastgeber && l.gastgeber !== id) { bleibe = (l.spieler || []).some((x) => x.id === id); break; }
      } catch (e) { /* gleich noch einmal */ }
    }
  }
  if (altNetz) { altNetz.beenden(); if (netz === altNetz) netz = null; }
  if (bleibe) {
    sessionStorage.setItem(sitzKey(code), JSON.stringify({ id, name: meinName, rolle: "gast" }));
    return location.reload();
  }
  status = "abgeloest";
  statusText = "Ein anderes Gerät hält jetzt den Raum (ist jetzt Gastgeber).";
  zeichnen();
  // Wand-Geraet: war die Seite eine Weile nicht vorn und eine Spielleitung hat den Raum solange geholt, uebernimmt die Wand
  // wieder, sobald sie laeuft - das Handy der Spielleitung spielt dann von selbst als Gast weiter
  if (HALTER) setTimeout(() => { if (status === "abgeloest" && code) gastgeberFortsetzen(); }, HALTER_ZURUECK);
}

// Spielleitung holt den Raum auf dieses Geraet (das Gastgeber-Geraet ist ausgefallen): als Gastgeber neu laden - der Stand
// kommt aus der Datenbank, der eigene Platz und die Spielleitungs-Rechte bleiben (gastgeberFortsetzen, "schonDa").
function raumHolen() {
  if (rolle !== "gast" || !raum || !binAdmin() || gastgeberDa()) return;
  sessionStorage.setItem(sitzKey(code), JSON.stringify({ id: meineId, name: meinName, rolle: "gastgeber" }));
  location.reload();
}

function anwesenheitUebernehmen() {
  if (!raum) return;
  let neu = false;
  raum.spieler.forEach((sp) => {
    const da = sp.id === meineId || !!anwesend[sp.id] || !!sp.stv;   // Gaeste ohne Handy sind immer da
    if (sp.online !== da) { sp.online = da; neu = true; }
  });
  if (neu) { const aend = neueAenderung(); aend.lobby = true; verteilen(aend); }
}

const RAUM_TYPEN = new Set(["_hallo", "_spielwahl", "_ab18", "_trink", "_look", "_testkonten", "_tafel", "_admin", "_adminweg", "_raumende", "_beamer", "_alle", "_glueck", "_brettweg", "_koppeln", "_stvneu", "_stvweg", "_pause", "_party", "_plan", "_rueck", "_brettladen", "_fragenneu"]);

function ausfuehren(von, a) {
  if (!raum || !a || typeof a !== "object" || typeof a.typ !== "string") return;
  const aend = neueAenderung();
  if (a.typ === "_hallo") { if (hallo(von, a.name, !!a.zurueck)) aend.lobby = true; return verteilen(aend); }
  let ich = raum.spieler.find((x) => x.id === von);
  // Steuerpult am Beamer (Nico 31.10.2026): das Beamer-Geraet ist KEIN Spieler. Es darf sich mit dem Freischaltcode als
  // Spielleitung ausweisen und danach steuern (Raum, Beamer, Spiele starten/leiten) - nie mitspielen.
  const pult = !ich && B.istPult(von);
  if (!ich && !pult) return;
  const admin = K.istAdmin(raum, von);
  if (pult) {
    if (a.typ === "_admin") { adminPruefen(von, a.beweis); return; }
    if (!admin || !B.pultErlaubt(a)) return;
    if (a.typ === "_spielwahl") a = { ...a, typ: "_alle", wert: a.id };   // ein Spiel vom Pult startet immer fuer alle
    ich = { id: von, name: "📽️ Beamer" };
  }
  // Pause: Glücksrad-Drehungen warten wie Spielzuege (ihre Zeiten stehen ja auch)
  if (raum.pause && a.typ === "_glueck" && SL.wartetInPause(a)) { if (pauseStau.length < 300) pauseStau.push([von, a]); return; }
  if (RAUM_TYPEN.has(a.typ)) {
    if (a.typ === "_spielwahl") {
      const sp = spiel(a.id);
      if (!sp || sp.versteckt || Object.keys(raum.partien).length >= MAX_PARTIEN) return;
      const pid = `p${raum.pNr++}`;
      raum.partien[pid] = P.neu(pid, sp.id, von, Date.now(), raum.ohneAlkohol);
      if (sp.id === "brett") brettVorbelegen(raum.partien[pid]);
      raum.meldung = { nr: (raum.meldung ? raum.meldung.nr : 0) + 1, pid, von };
      aend.lobby = true; aend.partien.add(pid);
      logge("spiel", `${sp.emoji} ${sp.name} geöffnet`, ich.name);
      if (admin) rueckMerken(von, "start", `${sp.name} geöffnet`, { pid });
    }
    // Spielleitung und Ablauf (Runde B)
    else if (a.typ === "_pause") { if (admin) pauseUmschalten(ich); return; }
    else if (a.typ === "_rueck") { if (!admin || !rueckAusfuehren(von, ich)) return; return verteilen(ALLES()); }
    else if (a.typ === "_party" && admin) {
      if (!B.steuerAktion(raum, { was: "party", aus: !!a.aus }, Date.now())) return;
      if (!a.aus) { tafelAusfuehren({ typ: "_tafel", was: "w_party" }, { gastgeber: true, wer: ich.name }); aend.tafel = true; }
      aend.lobby = true;
      logge("ablauf", a.aus ? "🎉 Partymodus beendet" : "🎉 Partymodus gestartet", ich.name);
    } else if (a.typ === "_plan" && admin) {
      const x = Array.isArray(a.werte) ? a.werte : [];
      if (a.was === "dazu") { if (!SL.planDazu(raum, x[0], spiel(x[1]) ? x[1] : "", x[2], Date.now())) return; }
      else if (a.was !== "weg" || !SL.planWeg(raum, Number(a.id))) return;
      planMerkenSchreiben();
      aend.lobby = true;
      logge("ablauf", a.was === "dazu" ? `⏰ Spielplan: ${x[0]} ${spiel(x[1]) ? spiel(x[1]).name : x[2]}` : "⏰ Punkt aus dem Spielplan entfernt", ich.name);
    }
    // gespeichertes Partybrett weiterspielen oder loeschen (Runde C, Punkt 40)
    else if (a.typ === "_brettladen" && admin) {
      const nr = Number(a.nr);
      if (a.weg) { if (!SL.speicherWeg(raum, nr)) return; }
      else {
        if (Object.keys(raum.partien).length >= MAX_PARTIEN) return;
        const pid = `p${raum.pNr++}`, p = SL.laden(raum, nr, pid, von, Date.now());
        if (!p) return;
        raum.partien[pid] = p; aend.partien.add(pid);
        logge("spiel", `💾 Partybrett von ${(raum.speicher || []).find((e) => e.nr === nr)?.zeit || "vorhin"} geht weiter`, ich.name);
      }
      aend.lobby = true;
    }
    else if (a.typ === "_ab18" && admin) { raum.ab18 = !raum.ab18; aend.lobby = true; }
    else if (a.typ === "_trink" && admin) { raum.ohneAlkohol = !raum.ohneAlkohol; aend.lobby = true; }
    // Gast ohne Smartphone (Vorschlag 10): die Spielleitung legt ihn an, die Kennung kommt von ihrem Handy
    else if (a.typ === "_stvneu" && admin) {
      const name = String(a.name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
      if (!/^stv-[a-z0-9]{6,20}$/.test(String(a.id)) || !name || raum.spieler.some((x) => x.id === a.id) || !spielerDazu(a.id, name, { stv: true })) return;
      aend.lobby = true;
    } else if (a.typ === "_stvweg" && admin) {
      const sp = raum.spieler.find((x) => x.id === a.id);
      if (!sp || !sp.stv || Object.values(raum.partien).some((x) => x.mit.includes(a.id))) return;
      raum.spieler = raum.spieler.filter((x) => x !== sp);
      aend.lobby = true;
    }
    else if (a.typ === "_look" && admin && A.lookGueltig(a.look)) { raum.look = a.look; aend.lobby = true; }
    else if (a.typ === "_testkonten" && admin) { raum.testkonten = !K.testkontenAn(raum); aend.lobby = true; }
    // Fragen-Gedaechtnis (fragen_gedaechtnis.js) liegt beim Gastgeber - vor dem Partyabend einmal loeschen, damit Testrunden
    // nicht als "schon gestellt" zaehlen (DUM-E 09.11.2026, Punkt 6)
    else if (a.typ === "_fragenneu" && admin) { FG.vergessen(); raum.fragenNeuAm = Date.now(); aend.lobby = true; logge("raum", "Fragen-Gedächtnis gelöscht", ich.name); }
    else if (a.typ === "_beamer" && admin) {
      if (!B.steuerAktion(raum, a, Date.now())) return;
      aend.lobby = true;
      if (a.was === "schreck") { rueckMerken(von, "schreck", "Schreckmoment"); logge("ablauf", "😱 Schreckmoment", ich.name); }
    }
    // Beamer koppeln (Runde 3, Plan 3.16): die Spielleitung hat am Handy die Zahl vom Beamer eingetippt - dessen Kennung
    // bekommt sofort Steuerrechte (am Ally kein Code mehr)
    else if (a.typ === "_koppeln" && admin && !pult) {
      if (!B.istPult(a.beamer)) return;
      if (!raum.admins.includes(a.beamer)) raum.admins.push(a.beamer);
      aend.lobby = true;
    }
    // Gluecksrad: das Ergebnis entscheidet nur der Gastgeber (Rechte fuer Steuer-Aktionen prueft gluecksrad.js)
    else if (a.typ === "_glueck") {
      if (a.was === "duell" && a.art === "app" && Object.keys(raum.partien).length >= MAX_PARTIEN) return;
      const radVorher = admin && (a.was === "fuer" || a.was === "drehen") ? JSON.stringify(raum.glueck) : null;
      if (!G.aktion(raum, von, a, Date.now(), admin)) return;
      aend.lobby = true;
      if (radVorher) { rueckMerken(von, "rad", `Glücksrad für ${raum.glueck.lauf.name}`, { alt: radVorher, nr: raum.glueck.nr }); logge("rad", `🎡 Rad gedreht für ${raum.glueck.lauf.name}`, ich.name); }
      if (admin && GLUECK_MERKEN.has(a.was)) glueckMerkenSchreiben();
      if (a.was === "duell") glueckDuellStarten(aend);
      // Duell in echt (Daumencatchen ...): ueber den Bestaetigungsweg der Gesamtwertung - meldet der Verlierer, zaehlt es sofort
      if (a.was === "duellerg") {
        const e = raum.glueck.lauf.duell.erg;
        tafelAusfuehren({ typ: "_tafel", was: "w_duell", werte: ["duell", e.sieger, e.verlierer] }, { gastgeber: false, wer: e.wer });
        aend.tafel = true;
      }
    }
    // Partybrett-Ereignisse streichen: nur die Spielleitung; gilt fuer alle Partybretter im Raum ab dem naechsten "?"-Feld.
    // Minispiele und Gegenstaende (Hauptmenue) darf auch, wer das sammelnde Brett leitet.
    else if (a.typ === "_brettweg") {
      const leitetBrett = Object.values(raum.partien).some((x) => x.spiel === "brett" && x.phase === "sammeln" && P.darfLeiten(x, von, admin));
      if ((!admin && !leitetBrett) || !BE.streichAktion(raum, a.was === "warenweg" ? { ...a, ids: BR.WAREN.map((w) => w.id) } : a)) return;
      Object.values(raum.partien).forEach((x) => { if (x.hm) x.hm.vorlage = null; });
      aend.lobby = true;
      brettMerkenSchreiben();
    }
    else if (a.typ === "_alle" && admin) {
      // Spiel fuer alle: jeder, der gerade verbunden ist, ist gleich dabei; die Spielleitung startet mit "Los"
      const sp = spiel(a.wert || a.id);
      if (!sp || sp.versteckt || Object.keys(raum.partien).length >= MAX_PARTIEN) return;
      const pid = `p${raum.pNr++}`;
      const p = P.neu(pid, sp.id, von, Date.now(), raum.ohneAlkohol);
      gaeste().filter((x) => x.online && x.id !== von).forEach((x) => { if (p.mit.length < P.MAX_MIT) p.mit.push(x.id); });
      if (pult) { p.mit = p.mit.filter((x) => x !== von); p.von = p.mit[0] || von; }   // der Beamer spielt nicht mit
      raum.partien[pid] = p;
      if (sp.id === "brett") brettVorbelegen(p);
      raum.meldung = { nr: (raum.meldung ? raum.meldung.nr : 0) + 1, pid, von, alle: true };
      aend.lobby = true; aend.partien.add(pid);
      logge("spiel", `${sp.emoji} ${sp.name} für alle geöffnet`, ich.name);
      rueckMerken(von, "start", `${sp.name} geöffnet`, { pid });
    }
    else if (a.typ === "_tafel") {
      tafelAusfuehren(a, { gastgeber: admin, wer: ich.name, von });
      aend.tafel = true;
      if (raum.rueck && raum.rueck[von]) aend.lobby = true;
    } else if (a.typ === "_admin") { adminPruefen(von, a.beweis); return; }
    else if (a.typ === "_adminweg") { raum.admins = raum.admins.filter((x) => x !== von); aend.lobby = true; }
    else if (a.typ === "_raumende" && (admin || von === meineId)) { raumBeenden(); return; }
    return verteilen(aend);
  }
  // ---- alles Weitere gehoert zu einem Spiel
  const p = raum.partien[a.p];
  if (!p) return;
  const sp = spiel(p.spiel);
  if (!sp) return;
  const leitet = P.darfLeiten(p, von, admin);
  aend.partien.add(p.pid);
  // Pause: Spielzuege warten (auch die, die eine Uhr am Handy von selbst ausloest) und laufen beim Weiter nach
  if (raum.pause && SL.wartetInPause(a)) { if (pauseStau.length < 300) pauseStau.push([von, a]); return; }
  if (a.typ === "_mit") { if (!P.zurueck(p, von) && !P.mitmachen(p, sp, von, raum)) return; }
  // Verlassen (Nico 13.11.2026): jeder geht nur fuer sich; sind alle Menschen raus, beendet sich das Spiel selbst
  else if (a.typ === "_verlassen") {
    const art = P.verlassen(raum, p, sp, von);
    if (!art) return;
    logge("spiel", `🚪 ${ich.name} verlässt ${sp.name}${art === "bot" ? " (Computer spielt weiter)" : ""}`, ich.name);
    if (!P.aktive(p).length) { logge("spiel", `⏹️ ${sp.name} beendet (alle sind raus)`, ich.name); partieWeg(p.pid); }
    else {
      p.v = (p.v || 0) + 1;
      if (p.phase === "laeuft") { weiterRechtSetzen(p, sp, null); raum.raus = { nr: (raum.raus ? raum.raus.nr : 0) + 1, pid: p.pid, name: ich.name, bot: art === "bot" }; aend.lobby = true; }
    }
  }
  // Zuschauer-Wette aufs Partybrett (Runde C, Punkt 36): nur wer nicht mitspielt, bis vor den letzten 2 Runden
  else if (a.typ === "_wette") {
    if (sp.id !== "brett" || p.phase !== "laeuft" || p.mit.includes(von) || P.istBot(von) || !BR.wetteOffen(p.s) || !Number.isInteger(a.ziel) || a.ziel < 0 || a.ziel >= p.mit.length) return;
    p.wetten = { ...(p.wetten || {}), [von]: a.ziel };
  }
  // Nachzuegler einsteigen lassen (Runde C, Punkt 8: nur die Spielleitung bestaetigt)
  else if (a.typ === "_einlassen") { if (!leitet || !SL.einlassen(p, sp, a.id, P.nameVon(raum, p, a.id))) return; logge("spiel", `🙋 ${P.nameVon(raum, p, a.id)} steigt bei ${sp.name} ein`, ich.name); }
  else if (a.typ === "_raus") {
    if (!P.raus(p, von)) return;
    if (!p.mit.some((id) => !P.istBot(id))) delete raum.partien[p.pid];
  } else if (a.typ === "_los") {
    if (!leitet || p.phase !== "sammeln" || (sp.startBereit && !sp.startBereit(p))) return;
    if (sp.id === "brett") brettZuletztMerken(p);
    P.starten(p, sp, raum);
    if (!ER.OHNE.has(sp.id)) { p.erkl = Date.now() + ER.ERKL_ZEIT; ER.uhrenNachHinten(p, Date.now()); }   // kurze Erklaerung oben/an der Wand (Restpaket 3a); Uhren erst danach
    logge("spiel", `▶️ ${sp.name} gestartet (${p.mit.length} Spieler)`, ich.name);
    if (admin) { rueckMerken(von, "start", `Start von ${sp.name}`, { pid: p.pid, los: true }); aend.lobby = true; }
    // "Nicht auf dem Beamer" beim Start: wie "Spielansicht ausblenden" - die Wand zeigt weiter Diashow/bisheriges Bild,
    // die Steuerseite kann das Spiel spaeter trotzdem zeigen ("wieder am Beamer zeigen")
    if (p.wand === false && BS.BEAMER_SPIELE.includes(sp.id) && B.steuerAktion(raum, { was: "spielaus", pid: p.pid }, Date.now())) aend.lobby = true;
  }
  // Beamer-Schalter beim Start (Nico 07.11.2026): Spiel auf dem Beamer zeigen oder nicht - Vorgabe ja
  else if (a.typ === "_wand") { if (!leitet || p.phase !== "sammeln") return; p.wand = !!a.an; }
  else if (a.typ === "_erklweg") { if (!leitet || !p.erkl) return; ER.uhrenVorziehen(p, Date.now()); p.erkl = 0; clearTimeout(botTimer[p.pid]); delete botTimer[p.pid]; }   // Spielleitung ueberspringt die Erklaerung
  else if (a.typ === "_zurueck") { if (!leitet) return; logge("spiel", `⏹️ ${sp.name} beendet`, ich.name); partieWeg(p.pid); }
  // Mit oder ohne Trinken fuer genau dieses Spiel (Spielleitung; vorbelegt mit dem Raum-Schalter, auch mitten im Spiel)
  else if (a.typ === "_ohne") { if (!leitet) return; p.ohne = !!a.ohne; if (p.s) p.s.ohne = p.ohne; if (p.hm) p.hm.vorlage = null; }
  // Hauptmenue des Partybretts: Karte, Runden; "_hm" alles andere; "_figur" darf jeder fuer sich selbst, die Spielleitung fuer alle
  else if (a.typ === "_karte") {
    if (!leitet || p.phase !== "sammeln") return;
    if (a.karte !== undefined) { const k = a.karte === "zufall" ? "zufall" : Number(a.karte); if (k !== "zufall" && !BR.BRETTER[k]) return; p.karte = k; }
    if (a.runden !== undefined) { const r = Number(a.runden); if (!M.rundenGueltig(r)) return; p.runden = r; }
    M.stand(p).vorlage = null;
  } else if (a.typ === "_hm") {
    if (!leitet || p.phase !== "sammeln" || sp.id !== "brett") return;
    if (String(a.was).startsWith("vorlage")) { if (!brettVorlage(p, a)) return; aend.lobby = true; }
    else if (!M.aktion(p, a)) return;
  } else if (a.typ === "_figur") {
    if (sp.id !== "brett" || p.phase !== "sammeln" || (a.id !== von && !leitet) || !M.figurSetzen(p, a.id, a)) return;
  }
  // Partybrett ohne Rundenende: die Spielleitung wertet aus
  else if (a.typ === "_brettende") { if (!leitet || p.phase !== "laeuft" || !sp.schlussJetzt || !sp.schlussJetzt(p.s)) return; p.v = (p.v || 0) + 1; }
  // Partybrett speichern (Runde C, Punkt 40): Stand landet auf dem Gastgeber-Geraet, die Liste im Raum
  else if (a.typ === "_brettspeichern") { if (!leitet || !SL.speichern(raum, p, P.namen(raum, p), Date.now())) return; aend.lobby = true; hinweis("💾 Partybrett gespeichert"); logge("spiel", `💾 ${sp.name} gespeichert (Runde ${p.s.runde})`, ich.name); }
  // Notfall-Knopf: letzter funktionierender Stand zurueck (nur die Spielleitung)
  else if (a.typ === "_retten") { if (!admin || p.phase !== "laeuft") return; spielRetten(p); aend.lobby = true; logge("notfall", raum.rettung.leer ? `🛟 ${sp.name}: kein älterer Stand` : `🛟 ${sp.name} zurückgesetzt um ${raum.rettung.sek} s`, ich.name); }
  // Platz uebergeben: wer im Spiel sitzt, gibt ihn selbst ab; die Spielleitung auch fuer andere (Handy schon weg)
  else if (a.typ === "_platz") {
    const felder = Array.isArray(a.werte) ? a.werte : [];
    const wer = admin && felder[0] ? felder[0] : von, an = felder[1] || a.wert;
    if (!P.platzGeben(raum, p, wer, an)) return;
    const nameVon = (id) => (raum.spieler.find((x) => x.id === id) || {}).name || "";
    raum.uebergabe = { nr: (raum.uebergabe ? raum.uebergabe.nr : 0) + 1, pid: p.pid, von: wer, an, vonName: nameVon(wer), anName: nameVon(an) };
    p.v = (p.v || 0) + 1;
    aend.lobby = true;
    logge("notfall", `🔁 ${sp.name}: ${nameVon(an)} übernimmt den Platz von ${nameVon(wer)}`, ich.name);
  }
  else if (a.typ === "_neuauf") { if (!leitet || p.phase !== "laeuft" || !p.wartend.length) return; P.neueRunde(p, sp, raum); }
  else if (a.typ === "_botneu") { if (!leitet || !sp.bot || !P.botDazu(p, raum)) return; }
  else if (a.typ === "_botweg") { if (!leitet || !P.botWeg(p, a.id)) return; }
  else {
    if (p.phase !== "laeuft" || ER.offen(p, Date.now())) return;   // waehrend der Erklaerung startet kein Zug eine Uhr
    const idx = p.mit.indexOf(von);
    if (idx < 0) return;
    if (spielAktion(p, sp, idx, a)) aend.tafel = true;
    // Gluecksrad-Duell: "Fertig" raeumt es weg. Nur genau dieses Spiel und nur s.weg === true - das Millionaer-Spiel fuehrt
    // unter s.weg die 50:50-Liste ([] gilt als wahr) und war sonst nach dem ersten Tipp beendet (Nicos Kritik 08.11.2026, Punkt 10)
    if (sp.id === "gduell" && p.s && p.s.weg === true) partieWeg(p.pid);
  }
  if (raum.partien[p.pid]) p.t = Date.now();   // zuletzt geaendert (Beamer: Ergebnis steht eine Weile, dann Diashow)
  if (sp.id === "brett" && p.phase === "sammeln" && raum.partien[p.pid]) { M.abgleich(p, raum.look, P.istBot); if (a.typ !== "_figur") brettZuletztMerken(p); }
  verteilen(aend);
}

function partieWeg(pid) {
  delete raum.partien[pid];
  clearTimeout(botTimer[pid]); delete botTimer[pid];
  if (rettung[pid]) { delete rettung[pid]; rettungAblegen(); }
  if (netz) netz.schreiben(`stand/live/${pid}`, null).catch(() => {});   // Live-Stand eines Duells mit wegraeumen
  if (netz) netz.schreiben(`stand/live/${pid}kam`, null).catch(() => {});   // Kamera des Partybretts (Runde 3)
}

// Gluecksrad "Duell" am Handy: eigenes Spiel nur fuer die zwei, beide werden hingeschaltet (ansichtPruefen)
function glueckDuellStarten(aend) {
  const l = raum.glueck && raum.glueck.lauf, d = l && l.duell;
  if (!d || d.art !== "app" || d.pid) return;
  const sp = spiel("gduell"), pid = `p${raum.pNr++}`;
  const p = P.neu(pid, sp.id, d.von, Date.now(), raum.ohneAlkohol);
  p.mit = [d.von, d.an];
  P.starten(p, sp, raum);
  p.s.duell.kanal = pid;
  raum.partien[pid] = p;
  d.pid = pid;
  raum.meldung = { nr: (raum.meldung ? raum.meldung.nr : 0) + 1, pid, von: d.von };
  aend.partien.add(pid);
}

// -> true, wenn dabei ein Sieg in die Gesamtwertung kam
function spielAktion(p, sp, idx, a) {
  const weiter = WEITER_TYPEN.has(a.typ);
  // schon weitergeblaettert, seit dieses Handy den Stand gesehen hat: zweiter Tipp verfaellt
  if (weiter && typeof a.pv === "number" && (p.wv || 0) > a.pv) return false;
  const vorher = JSON.stringify(p.s), dranVorher = zugVon(p, sp);
  const nm = P.namen(raum, p);
  p.s.anzahl = p.mit.length;
  try { sp.aktion(p.s, idx, a, nm, raum); } catch (e) { console.error(e); rettungKaputt.add(p.pid); }
  if (p.s && p.s.duell && !p.s.duell.kanal) p.s.duell.kanal = p.pid;   // Live-Leitung des Duells: stand/live/<pid>
  p.v = (p.v || 0) + 1;
  const geaendert = JSON.stringify(p.s) !== vorher;
  if (weiter && geaendert) p.wv = p.v;
  if (geaendert) weiterRechtSetzen(p, sp, dranVorher);
  return spielWerten(p, sp, nm);
}

// "Weiter" drueckt zuerst nur, wer dran ist oder gerade dran war (Nico 13.11.2026: "wenn man dran war und unter Weiter
// druecken kann, kann das jeder - das ist kacke"). p.wz = Spieler-Nummern, die sofort duerfen:
// - das Spiel kennt einen Spieler am Zug (dranVon): er und wer es direkt davor war
// - sonst (alle gleichzeitig, Ergebnis-Bildschirme): wer das Spiel gestartet hat
// Computer zaehlen nicht (sie druecken selbst). Alle anderen sehen den Knopf gesperrt, bis er WEITER_FREI ms dastand
// (zugSperrePruefen, rein am Handy - so haengt ein Spiel nie, wenn der eine gerade nicht aufs Handy schaut). Die
// Spielleitung darf immer.
// Wer am Zug ist - auch waehrend eines Duells im Partybrett (dranVon meldet dort bewusst niemanden, damit das Handy nicht
// "du bist dran" brummt): das Duell gehoert zum Zug dessen, der es ausgeloest hat. Nach einem Minispiel, in der Bonusrunde
// und nach dem Spielende ist niemand "dran" - dort drueckt zuerst, wer das Spiel gestartet hat.
function zugVon(p, sp) {
  const s = p.s;
  if (!s || s.ende || ["mini", "bonus"].includes(s.phase)) return null;
  if (sp.dranVon) { try { return sp.dranVon(s); } catch (e) { return null; } }
  return typeof s.dran === "number" ? s.dran : null;
}
function weiterRechtSetzen(p, sp, dranVorher) {
  if (!p.s) return;
  // wer raus ist, bleibt fuer seinen Zug eingetragen: ein Mitspieler drueckt dann fuer ihn (fuerHinweis) und zaehlt als er
  const mensch = (i) => Number.isInteger(i) && i >= 0 && i < p.mit.length && !P.istBot(p.mit[i]);
  let ids = [...new Set([dranVorher, zugVon(p, sp)].filter(mensch))];
  if (!ids.length) { const l = p.mit.indexOf(P.leiter(p)); if (l >= 0) ids = [l]; }
  if (!Array.isArray(p.wz) || p.wz.join() !== ids.join()) p.wz = ids;
}

// App-Spiele vergeben Punkte von selbst: kennt das Spiel einen Sieger (spiel.ergebnis), wird er einmal gebucht. Neu
// gewertet wird erst, wenn das Ergebnis wieder weg war (neue Partie/Frage/Runde) oder ein anderes gemeldet wird.
function spielWerten(p, sp, nm) {
  if (!sp.ergebnis || !raum.tafel) return false;
  let e = null;
  try { e = sp.ergebnis(p.s, nm); } catch (x) { console.error(x); }
  if (!e || !Array.isArray(e.sieger) || !e.sieger.length) { p.zuletzt = null; return false; }
  const key = `${p.runde}:${e.nr}`;
  if (key === p.zuletzt) return false;
  p.zuletzt = key;
  const ids = e.sieger.map((j) => p.mit[j]).filter((id) => id && !P.istBot(id));
  const namen = ids.map((id) => P.nameVon(raum, p, id));
  if (!namen.length) return false;
  // Sieger bestimmter Spiele (Blitzreaktion) bekommen einen Joker fuers Gluecksrad
  // (am Beamer steht unter der Rangliste, wer ihn bekommen hat - p.joker gehoert zu genau diesem Ergebnis)
  if (G.JOKER_SPIELE.includes(sp.id)) {
    const neu = G.jokerFuerSieger(raum, ids, sp.name);
    p.joker = { key, neu: neu.map((id) => P.nameVon(raum, p, id)), alle: namen };
  }
  tafelAusfuehren({ was: "w_app", spiel: sp.id, titel: sp.name, emo: sp.emoji, namen }, { gastgeber: true, intern: true });
  // Zuschauer-Wetten (Runde C): wer auf einen der Sieger getippt hat
  const richtig = Object.entries(p.wetten || {}).filter(([id, j]) => e.sieger.includes(j) && !p.mit.includes(id) && !P.istBot(id)).map(([id]) => P.nameVon(raum, p, id)).filter((n) => n && n !== "Weg");
  if (richtig.length) tafelAusfuehren({ was: "w_app", spiel: "brettwette", titel: "Partybrett-Wette", emo: "🔮", namen: richtig }, { gastgeber: true, intern: true });
  return true;
}

function tafelAusfuehren(a, ctx) {
  if (!raum.tafel) raum.tafel = TAFEL.neu();
  const w = W.sicher(raum.tafel), vorher = W.summen(w), nr = w.bNr;
  w.ohneTest = K.testkontenAn(raum);
  try { TAFEL.aktion(raum.tafel, a, { jetzt: Date.now(), ohneAlkohol: !!raum.ohneAlkohol, ...ctx }); } catch (e) { console.error(e); }
  if (tafelAblage) tafelAblage.sichern(raum.tafel);
  // Protokoll: jede Punkt-Aenderung mit vorher/nachher (Abendsumme), egal woher sie kommt
  const neu = W.sicher(raum.tafel), diff = SL.punkteDiff(vorher, W.summen(neu));
  if (diff.length) logge("punkte", SL.punkteText(a), ctx.wer, { punkte: diff });
  if (a.was === "w_hand" && ctx.von && ctx.gastgeber && neu.bNr > nr) rueckMerken(ctx.von, "punkte", `Korrektur ${diff.map((x) => `${x.name} ${x.nach - x.vor >= 0 ? "+" : ""}${x.nach - x.vor}`).join(", ")}`, { b: neu.bNr - 1 });
}

function einzigartig(name, selbst) {
  const vergeben = (n) => raum.spieler.some((x) => x !== selbst && x.name.toLocaleLowerCase("de") === n.toLocaleLowerCase("de"));
  if (!vergeben(name)) return name;
  for (let k = 2; k < 99; k++) { const n = `${name.slice(0, NAME_MAX - 3)} ${k}`; if (!vergeben(n)) return n; }
  return name;
}

// Ein Handy meldet sich (beim Beitreten und nach jedem Wiederverbinden). Gleiche Kennung = derselbe Spieler; neue Kennung
// mit dem Namen eines Spielers, der gerade nicht verbunden ist = er ist zurueck (anderer Tab, Handy neu gestartet).
// wunsch = "Ja, das ist mein Platz" (Vorschlag 9): das alte Handy gilt dann auch als weg, wenn der Server es noch fuehrt,
// sein Lebenszeichen aber ausbleibt - ein leerer Akku trennt nicht sauber.
function hallo(von, name, wunsch = false) {
  if (!von) return false;
  // dieses Handy hat seinen Platz an ein anderes abgegeben: es legt keinen zweiten an
  if (raum.wechsel && raum.wechsel[von]) return false;
  name = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || "Gast";
  let sp = raum.spieler.find((x) => x.id === von);
  if (!sp) {
    const weg = (x) => !anwesend[x.id] || (wunsch && wache && wache.stumm(x.id));
    const zurueck = raum.spieler.find((x) => x.id !== raum.gastgeber && weg(x) && x.name.toLocaleLowerCase("de") === name.toLocaleLowerCase("de"));
    if (zurueck) {
      raum.wechsel = { ...(raum.wechsel || {}), [zurueck.id]: von };
      G.idErsetzen(raum, zurueck.id, von); P.idErsetzen(raum, zurueck.id, von); sp = zurueck;
      delete sp.stv;   // Gast ohne Handy hat jetzt doch eins
      name = sp.name;  // "lena" statt "Lena": die Gesamtwertung zaehlt nach Namen und darf sich nicht teilen
    }
  }
  if (sp) { sp.name = einzigartig(name, sp); sp.online = true; return true; }
  return spielerDazu(von, name);
}
function spielerDazu(id, name, mehr = {}) {
  if (raum.spieler.length >= MAX_SPIELER) return false;
  const belegt = new Set(raum.spieler.map((x) => x.platz));
  let platz = 0; while (belegt.has(platz)) platz++;
  // Begruessung am Beamer: nur "Gast Nummer X" (fortlaufend, ohne "von Y"); wer zurueckkommt, wird nicht neu gezaehlt
  raum.gastNr = (Number(raum.gastNr) || raum.spieler.length) + 1;
  const neu = { id, name: einzigartig(name, null), platz, online: true, gast: raum.gastNr, ...mehr };
  raum.spieler.push(neu);
  raum.gruesse = [...(Array.isArray(raum.gruesse) ? raum.gruesse : []), { nr: raum.gastNr, name: neu.name }].slice(-8);
  hinweis(`${neu.name} ist dabei`);
  TON.spiele(A.klang(raum.look, "beitritt"));
  return true;
}

// ---- Spielleitung: Beweis pruefen (der Gastgeber braucht dafuer selbst den Code), falsche Beweise bremsen
async function adminPruefen(von, b) {
  const k = K.meinSchluessel();
  if (!k) { adminWartend[von] = b; return; }
  const f = adminFehler[von] || { n: 0, bis: 0 };
  if (f.bis > Date.now()) return;
  const ok = await K.beweisPruefen(k, code, von, b).catch(() => false);
  if (!ok) { f.n++; if (f.n >= 5) { f.bis = Date.now() + 60000; f.n = 0; } adminFehler[von] = f; return; }
  delete adminWartend[von];
  if (!raum.admins.includes(von)) {
    raum.admins.push(von);
    const aend = neueAenderung(); aend.lobby = true; verteilen(aend);
  }
}
function adminSelbst() {
  if (!raum.admins.includes(meineId)) raum.admins.push(meineId);
  Object.entries(adminWartend).forEach(([id, b]) => adminPruefen(id, b));
}
async function adminBeweisSenden() {
  const k = K.meinSchluessel();
  if (!k || rolle !== "gast" || !netz || !meineId) return;
  try { await netz.aktionSenden(meineId, { typ: "_admin", beweis: await K.beweis(k, code, meineId) }); } catch (e) { console.warn(e); }
}

async function raumBeenden() {
  const n = netz;
  if (tafelAblage) tafelAblage.loeschen();
  eigeneVergessen(code);
  sessionStorage.removeItem(sitzKey(code));
  try { localStorage.removeItem(rettungKey()); localStorage.removeItem(rueckKey()); } catch (e) { /* privater Modus */ }
  rolle = null; raum = null;
  status = "beendet"; statusText = "Der Raum ist beendet.";
  try { if (n) await n.raumLoeschen(); } catch (e) { console.warn(e); }
  if (n) n.beenden();
  netz = null;
  zeichnen();
}

function verteilen(aend = ALLES()) {
  if (rolle !== "gastgeber" || !raum) return;
  schreiben();
  radProtokoll();
  ansichtPruefen();
  ansageZeigen();
  pauseAbgleich();
  if (!stillHalten(aend)) zeichnen();
  aend.partien.forEach(rettungMerken);   // nach dem Zeichnen: scheitert die Anzeige, gilt dieser Stand nicht als funktionierend
  botPlanen();
  zugPlanen();
}

let schreibPlan = null;
function schreiben() {
  if (schreibPlan || !netz) return;
  schreibPlan = setTimeout(() => {
    schreibPlan = null;
    if (rolle !== "gastgeber" || !raum || !netz) return;
    const teile = standTeile(raum, BS.auszug(raum));   // dazu stand/beamer: was die Wand zeigen darf (ohne Rollen)
    const upd = standAenderung(geschrieben, teile);
    if (!Object.keys(upd).length) return;
    geschrieben = teile;
    netz.aendern(upd).catch((e) => { console.warn("Schreiben fehlgeschlagen:", e && e.code); geschrieben = null; });
  }, 20);
}

// Countdown der Runde: jede Sekunde nur die Zahlen tauschen (kein Neuzeichnen); beim Gastgeber loest das Ende die
// Pokal-Uebergabe aus. Gaeste rechnen mit der Uhr des Gastgebers (ueber die Serverzeit abgeglichen).
const jetztGastgeber = () => (rolle === "gastgeber" || !netz || !raum ? Date.now() : Date.now() + netz.versatz - (raum.uhr || 0));
// Duelle (duell.js): Start nach der Gastgeber-Uhr, Fortschritt der Duellanten nach stand/live/<pid>/<spieler>
DU.leitung({ jetzt: jetztGastgeber, schreiben: (pfad, wert) => { if (netz) netz.schreiben(`stand/live/${pfad}`, wert).catch((e) => console.warn("Live:", e && e.code)); } });
setInterval(() => {
  const jetzt = jetztGastgeber();
  // Erklaer-Einblendung: Restzeiten im gerade gezeigten Spiel stehen auf voller Zeit, bis sie vorbei ist
  const halt = ER.haltZeit(ansicht && raum && raum.partien[ansicht], jetzt), ab = (el) => (el.closest(".spielflaeche") ? halt : jetzt);
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const rest = Number(el.dataset.countdown) - ab(el);
    const text = W.uhrText(rest);
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.toggle("knapp", rest <= 60000);
      if (rest > 0 && rest <= 3000 && el.dataset.tick !== text && el.closest("#app")) { el.dataset.tick = text; TON.spiele("tick"); }
    }
  });
  bremseAnzeigen();
  // In der Pause laeuft keine Frist ab (spielleitung.js schiebt sie beim Weiter nach hinten)
  const fristen = rolle === "gastgeber" && raum && !raum.pause;
  if (fristen && raum.tafel && W.faellig(raum.tafel.wertung, Date.now())) {
    tafelAusfuehren({ was: "w_ablauf" }, { gastgeber: true, wer: meinName });
    const aend = neueAenderung(); aend.tafel = true; verteilen(aend);
  }
  // Gluecksrad: Joker-Zeit abgelaufen -> Ergebnis gilt (nur der Gastgeber schliesst ab)
  if (fristen && G.pruefen(raum, Date.now())) { const aend = neueAenderung(); aend.lobby = true; verteilen(aend); }
  // Spielplan: 5 Minuten vorher kuendigt der Beamer an
  if (fristen && SL.planPruefen(raum, Date.now())) { const aend = neueAenderung(); aend.lobby = true; verteilen(aend); }
  if (raum && !status) {
    ansageZeigen();   // Gluecksrad-Meldung folgt der Uhr (Stopp, Joker-Zeit, Ausblenden)
    // Sperrzeit und Joker-Sekunden zaehlen ohne Neuzeichnen (kein Ticken wie beim Runden-Countdown)
    let frei = false;
    document.querySelectorAll("[data-gcd]").forEach((el) => {
      const rest = Number(el.dataset.gcd) - ab(el);
      const t = el.dataset.sek !== undefined ? String(Math.max(0, Math.ceil(rest / 1000))) : W.uhrText(rest);
      if (el.textContent !== t) el.textContent = t;
      if (rest <= 0 && el.closest("#app")) frei = true;
    });
    if (frei && !ansicht && !tafelAuf && !steuerAuf) zeichnen();
  }
}, 1000);

// ---------------------------------------------------------------- Computer-Mitspieler (nur beim Gastgeber, je Spiel)
const botTimer = {};
function botPlanen() {
  if (rolle !== "gastgeber" || !raum || raum.pause) return;
  Object.values(raum.partien).forEach((p) => {
    if (p.phase !== "laeuft" || botTimer[p.pid] || !p.mit.some(P.istBot)) return;
    const sp = spiel(p.spiel);
    if (!sp || !sp.bot) return;
    const pause = sp.botPause ? sp.botPause(p.s) : 900;
    // botMindest: so lange fuehrt das Spiel noch vor (Partybrett: Wurf, Laufen, Auftritt) - vorher zieht kein Computer
    let mindest = 0;
    try { mindest = sp.botMindest ? sp.botMindest(p.s) : 0; } catch (e) { mindest = 0; }
    if (ER.offen(p, Date.now())) mindest = Math.max(mindest, p.erkl - Date.now() + 50);   // Computer warten die Erklaerung ab
    botTimer[p.pid] = setTimeout(() => botZug(p.pid), Math.max(mindest, pause * (0.7 + Math.random() * 0.6)));
  });
}
function botZug(pid) {
  delete botTimer[pid];
  const p = raum && raum.partien[pid];
  if (rolle !== "gastgeber" || !p || p.phase !== "laeuft" || raum.pause) return;
  if (ER.offen(p, Date.now())) { botTimer[pid] = setTimeout(() => botZug(pid), p.erkl - Date.now() + 50); return; }
  const sp = spiel(p.spiel);
  const nm = P.namen(raum, p);
  const reihe = p.mit.map((id, i) => (P.istBot(id) ? i : -1)).filter((i) => i >= 0).sort(() => Math.random() - 0.5);
  for (const i of reihe) {
    let a = null;
    try { a = sp.bot(p.s, i, nm, raum); } catch (e) { console.error(e); }
    if (a) {
      const aend = neueAenderung(); aend.partien.add(pid);
      if (spielAktion(p, sp, i, a)) aend.tafel = true;
      p.t = Date.now();
      return verteilen(aend);
    }
  }
  botTimer[pid] = setTimeout(() => botZug(pid), sp.botNochmal ? sp.botNochmal(p.s) : 1500); // gerade nichts zu tun - spaeter wieder nachsehen
}
// Zeit je Zug (Partybrett, Spieltempo): laeuft sie ab, zieht der Gastgeber fuer den Spieler am Zug weiter
const zugTimer = {};
function zugPlanen() {
  if (rolle !== "gastgeber" || !raum || raum.pause) return;
  Object.keys(zugTimer).forEach((pid) => { if (!raum.partien[pid]) { clearTimeout(zugTimer[pid].t); delete zugTimer[pid]; } });
  Object.values(raum.partien).forEach((p) => {
    const sp = spiel(p.spiel);
    if (!sp || !sp.zugFrist || p.phase !== "laeuft") return;
    const bis = sp.zugFrist(p.s), alt = zugTimer[p.pid];
    if (alt && alt.bis === bis) return;
    if (alt) { clearTimeout(alt.t); delete zugTimer[p.pid]; }
    if (bis) zugTimer[p.pid] = { bis, t: setTimeout(() => zugAblauf(p.pid, bis), Math.max(50, bis - Date.now())) };
  });
}
function zugAblauf(pid, bis) {
  delete zugTimer[pid];
  const p = raum && raum.partien[pid];
  if (rolle !== "gastgeber" || !p || p.phase !== "laeuft" || raum.pause) return;
  if (ER.offen(p, Date.now())) { zugTimer[pid] = { bis, t: setTimeout(() => zugAblauf(pid, bis), p.erkl - Date.now() + 50) }; return; }
  const sp = spiel(p.spiel);
  if (!sp || sp.zugFrist(p.s) !== bis || P.istBot(p.mit[p.s.dran])) return;
  let a = null;
  try { a = sp.zugAuto(p.s, p.s.dran); } catch (e) { console.error(e); }
  if (!a) return;
  const aend = neueAenderung(); aend.partien.add(pid);
  if (spielAktion(p, sp, p.s.dran, a)) aend.tafel = true;
  p.t = Date.now();
  verteilen(aend);
}

// ---------------------------------------------------------------- Gast
async function gastBeitreten() {
  rolle = "gast";
  status = "verbinde"; statusText = "";
  zeichnen();
  try { await verbinden(code); } catch (e) { return fehlerBild("Keine Verbindung zum Raum. Ist das Internet an? Es wird gleich von selbst noch einmal versucht.", gastBeitreten); }
  meineId = netz.uid || meineId || zufallsText(16);
  sitzungMerken();
  localStorage.setItem("pa_name", meinName);
  history.replaceState(history.state, "", `${BASIS}#r=${code}`);
  ansicht = sessionStorage.getItem(`pa_ansicht_${code}`) || null;
  netz.beobachten("stand", standEmpfangen);
  netz.beobachten("da", (d) => {
    const vorher = gastgeberDa(), b = beamerZahl();
    anwesend = d || {};
    gastgeberWegPruefen();
    if (raum && vorher !== gastgeberDa()) zeichnen();
    else beamerGeaendert(b);
  });
  netz.beiVerbindung = (an) => { netzAnzeige(an); if (an) halloSenden(); };
  netz.beiPostfach = () => netzAnzeige(netz.verbunden);
  netz.anwesend(meineId, meinName);
  pulsStarten();
  stvLaden();
  padsLaden(false);
  if (netz.verbunden) halloSenden();
}
function halloSenden() {
  if (!netz || rolle !== "gast") return;
  netz.aktionSenden(meineId, { typ: "_hallo", name: meinName, ...(zurueckWunsch ? { zurueck: true } : {}) }).catch((e) => console.warn(e));
  Object.values(pads).forEach((pad) => netz.aktionSenden(pad.id, { typ: "_hallo", name: pad.name }).catch((e) => console.warn(e)));
  adminBeweisSenden();
}

// ---------------------------------------------------------------- Controller (Nico 30.10.2026)
// Ein Controller am Geraet meldet sich mit dem ersten Tastendruck als eigener Spieler (_hallo mit eigener Kennung) und
// schickt alles ueber dieselbe Schiene wie ein Handy. Er gilt als "lokal": Spiele, in denen er mitmacht, zeigt dieses Geraet.
const padsKey = () => `pa_pads_${code}`;
const padIds = () => Object.values(pads).map((x) => x.id);
const lokaleIds = () => [...padIds(), ...stvMein];   // alle, die ausser dem Handy-Besitzer von diesem Geraet aus spielen
const istLokal = (id) => id === meineId || lokaleIds().includes(id);
const istPadId = (id) => /-pad\d+$/.test(String(id || ""));
const padMarke = (id) => (istPadId(id) ? ` <span class="padmarke" title="spielt mit Controller">🎮</span>` : "");
function padsLaden(hallo = true) {
  try { pads = JSON.parse(sessionStorage.getItem(padsKey())) || {}; } catch (e) { pads = {}; }
  Object.values(pads).forEach((pad) => { if (netz) netz.anwesendDazu(pad.id, pad.name); if (hallo && rolle === "gastgeber") ausfuehren(pad.id, { typ: "_hallo", name: pad.name }); });
}
function padsMerken() { if (code) sessionStorage.setItem(padsKey(), JSON.stringify(pads)); }
function sendenAls(id, a) { sendeAls = id; try { senden(a); } finally { sendeAls = null; } }
function padHallo(pad) {
  if (netz) netz.anwesendDazu(pad.id, pad.name);
  sendenAls(pad.id, { typ: "_hallo", name: pad.name });
}
function padNeu(g) {
  const belegt = new Set(Object.values(pads).map((x) => x.nr));
  let nr = 1; while (belegt.has(nr)) nr++;
  const pad = { id: `${meineId}-pad${nr}`, name: `Controller ${nr}`, nr, art: C.art(g.id) };
  pads[g.index] = pad;
  padsMerken();
  padHallo(pad);   // der Gastgeber meldet "… ist dabei" selbst (hallo)
  if (rolle !== "gastgeber") { hinweis(`🎮 ${pad.name} spielt mit`); TON.spiele(A.klang(raum.look, "beitritt")); }
  zeichnen();
}
function padTaste(g, t) {
  if (B.menueTaste(t)) return;   // Geraet am Beamer: der Controller bedient das Hauptmenue
  if (!raum || status || !rolle || raum.pause) return;
  const pad = pads[g.index];
  if (!pad) { if (["a", "b", "x", "y", "start"].includes(t)) padNeu(g); return; }
  const a = C.art(g.id);
  if (pad.art !== a) { pad.art = a; padsMerken(); }
  const p = ansicht && raum.partien[ansicht];
  if (p && !tafelAuf && !(steuerAuf && zeigeSteuer())) {
    const j = p.mit.indexOf(pad.id);
    if (p.phase === "sammeln") {
      // Mitmachen und Abmelden direkt mit der Taste; Start = "Los geht's" (wer leiten darf, entscheidet absender)
      if (t === "a" && j < 0) { vibriere(25); TON.spiele("klick"); return sendenAls(pad.id, { typ: "_mit", p: p.pid }); }
      if (t === "b" && j > 0) return sendenAls(pad.id, { typ: "_raus", p: p.pid });
      if (t === "start") return sendenAls(pad.id, { typ: "_los", p: p.pid });
      // im Hauptmenue des Partybretts drueckt A, was den Fokus hat; sonst nur "Los geht's"
      if (t === "a" && !document.querySelector("#app .hm") && !String((C.fokus() || {}).dataset?.a || "").includes('"_los"')) return;
    } else if (p.phase === "laeuft" && j >= 0 && (DU.taste(pad.id, t) || C.miniTaste(pad.id, t))) return;
  }
  if (["hoch", "runter", "links", "rechts"].includes(t)) return C.fokusBewegen(t);
  if (t === "a") {
    const el = C.fokus();
    if (!el) return;
    sendeAls = pad.id;
    try { C.druecken(el); } finally { sendeAls = null; }
  }
}
C.starten(padTaste);
// Partybrett (Runde 3): nach der Vorfuehrung werden Weiter & Co. wieder frei - Controller-Fokus neu setzen
document.addEventListener("pa-entsperrt", () => { if (padIds().length) C.fokusWiederherstellen(); });

// fuer wen ein laufendes Spiel auf diesem Geraet gezeichnet wird: eigener Spieler, beim Partybrett wer von hier dran
// ist; im Minispiel nur der eigene (Controller spielen in eigenen Feldern) - -1 = Geraet spielt nur mit Controllern mit
function anzeigeIch(p, sp) {
  const eigen = p.mit.indexOf(meineId);
  if (p.phase !== "laeuft" || !lokaleIds().length) return eigen;
  const lokal = p.mit.map((id, j) => (istLokal(id) ? j : -1)).filter((j) => j >= 0);
  if (!lokal.length) return -1;
  // Stellvertreter: wer gerade gewaehlt ist (Leiste unter dem Spiel); am Zug kommt das Brett von selbst zum Richtigen
  const stv = stvIndex(p, eigen);
  if (sp.id === "gduell") return stv ?? eigen;   // Controller spielen das Duell in ihrem eigenen Feld (padDuell)
  if (sp.id === "brett" && p.s) {
    if ((p.s.phase === "mini" || p.s.phase === "dkampf") && !p.s.ende) return stv ?? eigen;
    if (lokal.includes(p.s.dran)) return p.s.dran;
  }
  return stv ?? (eigen >= 0 ? eigen : lokal[0]);
}
function padMinis(p, sp, nm) {
  if (sp.id !== "brett" || p.phase !== "laeuft" || !p.s || p.s.phase !== "mini" || !p.s.mini || p.s.mini.fertig) { C.miniAus(); return ""; }
  const m = p.s.mini;
  // nur Controller, die in diesem Minispiel mitspielen (Duell: nur die zwei; Ausbau 31.10.2026)
  const hier = Object.values(pads).map((pad) => ({ pad, j: p.mit.indexOf(pad.id) })).filter((x) => x.j >= 0 && (!Array.isArray(m.teil) || m.teil.includes(x.j)));
  const zuschauer = Object.values(pads).filter((pad) => { const j = p.mit.indexOf(pad.id); return j >= 0 && Array.isArray(m.teil) && !m.teil.includes(j); });
  const zusch = zuschauer.length ? `<p class="mitte leise klein">👀 ${zuschauer.map((x) => esc(x.name)).join(", ")} ${zuschauer.length > 1 ? "schauen" : "schaut"} diesmal zu</p>` : "";
  return C.miniHTML(m, hier, m.art === "schaetzen" ? T.SCHAETZ[m.frage] : null, (id, wert, mk) => sendenAls(id, mk ? { typ: "mini", wert, mk, p: p.pid } : { typ: "mini", wert, p: p.pid })) + zusch;
}
// Duell (Partybrett-Duellfeld, Gluecksrad-Duell): jeder Controller, der duelliert, bekommt sein eigenes Feld
function padDuell(p, sp, nm) {
  const du = p.phase === "laeuft" && p.s && ((sp.id === "brett" && p.s.phase === "dkampf") || sp.id === "gduell") ? p.s.duell : null;
  if (!du || !padIds().length) return "";
  const boxen = Object.values(pads).map((pad) => ({ pad, j: p.mit.indexOf(pad.id) })).filter(({ j }) => j >= 0 && (j === du.a || j === du.b)).map(({ pad, j }) => {
    const h = DU.padHTML(du, pad.id, j, nm, (t) => C.taste(pad.art, t), (a) => sendenAls(pad.id, { ...a, p: p.pid }));
    return h ? `<div class="padbox" data-pad="${esc(pad.id)}"><div class="padkopf"><span class="farbe f${j % 20}"></span><b>${esc(pad.name)}</b><small>🎮</small></div><div class="padinhalt">${h}</div></div>` : "";
  }).join("");
  return boxen ? `<div class="padminis">${boxen}</div>` : "";
}
// Leiste unter dem Spiel: welche Controller hier dabei sind und was ihre Tasten gerade tun
function padLeiste(p, sp) {
  const liste = Object.values(pads);
  if (!liste.length) return "";
  const arten = new Set(liste.map((x) => x.art));
  const ar = arten.size === 1 ? [...arten][0] : "beide";
  let text;
  if (p.phase === "sammeln") text = `${C.taste(ar, "a")} mitmachen · ${C.taste(ar, "b")} doch nicht · ${C.taste(ar, "start")} los geht's`;
  else if (sp.id === "brett" && p.s && p.s.phase === "mini" && p.s.mini && !p.s.mini.fertig) text = "Minispiel: jeder Controller spielt in seinem Feld";
  else {
    text = `${C.taste(ar, "kreuz")} Knopf wählen · ${C.taste(ar, "a")} drücken`;
    // Partybrett: deutlich sagen, welcher Controller gerade dran ist
    const dranPad = sp.id === "brett" && p.s && !p.s.ende && p.s.phase !== "mini" && liste.find((x) => x.id === p.mit[p.s.dran]);
    if (dranPad) text = `<b class="paddran">🎮 ${esc(dranPad.name)} ist dran</b> · ${C.taste(dranPad.art, "a")} drücken · ${C.taste(dranPad.art, "kreuz")} wählen`;
  }
  const wer = liste.map((pad) => { const j = p.mit.indexOf(pad.id); return `<span class="pille ${j >= 0 ? "" : "aus"}">${j >= 0 ? `<span class="farbe f${farbeVon(p, pad.id)}"></span>` : ""}🎮 ${esc(pad.name)}${j >= 0 ? "" : " · nicht dabei"}</span>`; }).join("");
  return `<div class="padleiste"><div class="padleiste-wer">${wer}</div><small>${text}</small></div>`;
}
// Karte in der Uebersicht: Controller dieses Geraets, Namen aendern, entfernen
function padKarte() {
  const liste = Object.entries(pads);
  if (!liste.length) return C.moeglich() && window.innerWidth >= 900 ? `<p class="leise klein mitte padhinweis">🎮 Controller am Gerät? Einfach eine Taste drücken – schon spielt er mit.</p>` : "";
  return `<div class="karte padkarte"><h2>🎮 Controller an diesem Gerät</h2>
      ${liste.map(([k, pad]) => `<div class="padzeile"><span class="padzeile-name">🎮 <b>${esc(pad.name)}</b></span>
        <input id="rf-padname-${pad.nr}" maxlength="${NAME_MAX}" placeholder="Neuer Name" autocomplete="off">
        <button class="klein2" data-padname="${esc(k)}">Name</button><button class="klein2" data-padweg="${esc(k)}" aria-label="Controller entfernen">✕</button></div>`).join("")}
      <p class="leise klein">Neuer Controller: eine Taste drücken. ${C.taste("beide", "kreuz")} wählt einen Knopf, ${C.taste("beide", "a")} drückt ihn, ${C.taste("beide", "start")} startet ein Spiel.</p>
    </div>`;
}
const gastgeberDa = () => !!(raum && (rolle === "gastgeber" || anwesend[raum.gastgeber]));

let letzteLive = "null";   // stand/live zuletzt (Duelle): aendert sich nur er, wird nicht neu gezeichnet
function standEmpfangen(stand) {
  if (rolle !== "gast") return;
  if (!stand) {
    // den Raum gibt es nicht mehr (Spielleitung hat ihn beendet)
    raum = null; status = "beendet"; statusText = "Der Raum ist beendet.";
    sessionStorage.removeItem(sitzKey(code));
    if (netz) netz.beenden();
    netz = null; rolle = null;
    ansageWeg();
    return zeichnen();
  }
  const l = standLesen(stand, merker);
  if (!l) return;
  // nur die Live-Leitung eines Duells hat sich bewegt: nichts neu zeichnen (duell.js zieht die Anzeige selbst nach)
  const liveText = JSON.stringify(stand.live || null), nurLive = liveText !== letzteLive && !l.aend.lobby && !l.aend.tafel && !l.aend.partien.size;
  letzteLive = liveText;
  DU.liveEmpfangen(stand.live);
  if (nurLive && raum && status === "") return;
  merker = l.merker;
  raum = l.raum;
  gastgeberWegPruefen();
  document.title = `${A.titel(raum.anlass)} – Partyspiele`;
  const drin = raum.spieler.some((x) => x.id === meineId);
  const warDrin = status === "";
  status = drin ? "" : "verbinde";
  // Platz liegt inzwischen auf einem anderen Handy (Wiedereinstieg): hier nicht ewig "Verbinde ..." zeigen
  if (raum.wechsel && raum.wechsel[meineId]) { status = "gewechselt"; return zeichnen(); }
  if (ersterStand && drin) {
    eigeneMeldung = ansageNr = raum.meldung ? raum.meldung.nr : 0;
    Object.values(raum.partien).forEach((p) => { phasen[p.pid] = p.phase; });
    if (ansicht && !raum.partien[ansicht]) ansicht = null;
    meldeNummernSetzen();
    ersterStand = false;
    // Wiedereinstieg: das neue Handy geht gleich an den alten Platz (ein laufendes Spiel, in dem man sitzt)
    if (neuDabei) {
      const alt = P.liste(raum).find((p) => p.phase === "laeuft" && p.mit.includes(meineId));
      if (alt) { ansicht = alt.pid; setTimeout(() => hinweis("👋 Willkommen zurück – dein Platz ist wieder da"), 60); }
    }
    neuDabei = false; zurueckWunsch = false;
  }
  if ((!wache || wache.netz !== netz) && K.istAdmin(raum, meineId)) wacheStarten();
  if (!drin) return zeichnen();
  ansichtPruefen();
  ansageZeigen();
  pauseAbgleich();
  if (!warDrin || !stillHalten(l.aend)) zeichnen();
  if (!warDrin) eingangEinmal();
}

// ---------------------------------------------------------------- Ansicht, Meldungen
// Name des zuletzt angesehenen Spiels je Partie: die Meldung "… ist beendet" nennt das Spiel, damit sie nicht wie das Ende
// des naechsten Spiels aussieht (Abnahme 31.10.2026: Meldung stand mitten in einem neuen Spiel)
const spielNamen = {};
function ansichtPruefen() {
  if (!raum) return;
  if (ansicht && raum.partien[ansicht]) { const sp = spiel(raum.partien[ansicht].spiel); if (sp) spielNamen[ansicht] = `${sp.emoji} ${sp.name}`; }
  if (ansicht && !raum.partien[ansicht]) { hinweis(`${spielNamen[ansicht] || "Das Spiel"} ist beendet`, "ende"); ansicht = null; }
  // sobald man in einem anderen Spiel ist, stoert die Meldung zum alten nicht mehr
  if (ansicht && raum.partien[ansicht]) document.querySelectorAll(".toast[data-art='ende']").forEach((t) => t.remove());
  // Platz uebergeben: der Neue landet im Spiel, der Alte in der Uebersicht
  const u = raum.uebergabe;
  if (u && u.nr > uebergabeNr) {
    uebergabeNr = u.nr;
    platzAuf = null;
    if (istLokal(u.an) && raum.partien[u.pid]) { ansicht = u.pid; tafelAuf = false; steuerAuf = false; window.scrollTo(0, 0); hinweis(`🔁 Du spielst jetzt für ${u.vonName} weiter`); vibriere([120, 60, 120]); }
    else if (u.von === meineId) { if (ansicht === u.pid) ansicht = null; hinweis(`✓ ${u.anName} spielt jetzt auf deinem Platz`); }
  }
  // Jemand hat das Spiel verlassen: die Mitspieler erfahren es (und ob ein Computer weiterspielt)
  const rs = raum.raus;
  if (rs && rs.nr > rausNr) {
    rausNr = rs.nr;
    const pr = raum.partien[rs.pid];
    if (pr && pr.mit.some(istLokal) && ansicht === rs.pid) hinweis(rs.bot ? `🚪 ${rs.name} ist raus – ein Computer spielt weiter` : `🚪 ${rs.name} ist raus`);
  }
  // Spiel gerettet: alle Mitspieler erfahren, warum der Stand springt
  const gr = raum.rettung;
  if (gr && gr.nr > rettungNr) {
    rettungNr = gr.nr;
    rettenFrage = null;
    if (gr.leer) { if (binAdmin()) hinweis("Kein älterer Stand gesichert – bitte Spiel neu starten"); }
    else if (binAdmin() || (raum.partien[gr.pid] && raum.partien[gr.pid].mit.some(istLokal))) hinweis(`🛟 ${gr.name} ist zurück auf dem Stand von vor ${gr.sek} Sekunden`);
  }
  // Rueckgaengig: nur wer es gedrueckt hat, erfaehrt, ob es geklappt hat
  const rm = raum.rueckMeld;
  if (rm && rm.nr > rueckMeldNr) { const erst = !rueckMeldNr && ersterStand; rueckMeldNr = rm.nr; rueckFrage = false; if (rm.an === meineId && !erst) hinweis(rm.text); }
  dranPruefen();
  const m = raum.meldung;
  // wer ein Spiel startet, sieht es sofort
  if (m && istLokal(m.von) && m.nr > eigeneMeldung) {
    eigeneMeldung = m.nr;
    if (raum.partien[m.pid]) { ansicht = m.pid; tafelAuf = false; steuerAuf = false; window.scrollTo(0, 0); }
  }
  // ein Spiel, bei dem ich dabei bin, geht los: aus der Uebersicht hinschalten, sonst melden
  Object.values(raum.partien).forEach((p) => {
    const alt = phasen[p.pid];
    phasen[p.pid] = p.phase;
    // Gluecksrad-Duell: startet sofort - beide Duellanten werden hingeschaltet (oder bekommen die Meldung)
    if (alt === undefined && p.spiel === "gduell" && p.phase === "laeuft" && p.mit.some(istLokal)) {
      if (ansicht === p.pid) return;
      if (!ansicht && !tafelAuf && !steuerAuf) { ansicht = p.pid; window.scrollTo(0, 0); } else losAnsage(p);
      TON.spiele("spannung");
      vibriere([120, 60, 120]);
      return;
    }
    if (alt !== "sammeln" || p.phase !== "laeuft" || !p.mit.some(istLokal)) return;
    if (!ansicht && !tafelAuf && !steuerAuf) { ansicht = p.pid; window.scrollTo(0, 0); }
    else if (ansicht !== p.pid) losAnsage(p);
    TON.spiele(A.klang(raum.look, "los"));
    if (raum.look === "geburtstag") konfetti(40);
    vibriere(120);
  });
  ansichtMerken();
}

function ansageEl() {
  let el = document.getElementById("ansage");
  if (!el) { el = document.createElement("div"); el.id = "ansage"; el.className = "ansage"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  return el;
}
function ansageWeg() { const el = document.getElementById("ansage"); if (el) el.remove(); clearTimeout(ansageTimer); app.style.paddingTop = ""; }
// Die Meldung liegt oben ueber der Seite - solange sie da ist, ruecken die Inhalte darunter, damit nichts verdeckt wird
function ansagePlatz() { const el = document.getElementById("ansage"); if (el) app.style.paddingTop = `${el.offsetHeight + 22}px`; }
window.addEventListener("resize", ansagePlatz);

// ---- Gluecksrad am Handy: kurze Meldung oben bei allen, beim Getroffenen mit Joker die Wahl zum Weiterschieben
function radStand() {
  const g = raum && raum.glueck, l = g && g.lauf;
  // beim ersten Stand nichts Altes melden (eine gerade laufende Drehung schon)
  if (radGesehen < 0) radGesehen = radGemeldet = l ? (l.fertig && jetztGastgeber() > Math.max(l.ende, l.zu || 0) + 10000 ? l.nr : l.nr - 1) : 0;
  if (jokerGesehen < 0) { jokerGesehen = g ? Number(g.jokerNr) || 0 : 0; meineJoker = G.jokerVon(raum, meineId); }
  return l;
}
function jokerPruefen() {
  const g = raum && raum.glueck;
  if (!g) return;
  const n = G.jokerVon(raum, meineId);
  const neu = g.jokerNeu && g.jokerNeu.nr > jokerGesehen && (g.jokerNeu.ids || []).includes(meineId);
  if (n > meineJoker && meineJoker >= 0) {
    const grund = neu && g.jokerNeu.grund ? ` (${g.jokerNeu.grund})` : "";
    setTimeout(() => hinweis(`🃏 Du hast einen Joker bekommen${grund} – jetzt ${n} von ${G.JOKER_MAX}`), 60);
    vibriere([60, 40, 60]);
  }
  meineJoker = n;
  if (g.jokerNeu) jokerGesehen = Math.max(jokerGesehen, g.jokerNeu.nr);
}
// nachrang = ein neues Spiel will gemeldet werden: ein fertiges Ergebnis macht ihm Platz
function radAnsage(nachrang = false) {
  if (!raum || status) return false;
  const l = radStand();
  const el = document.getElementById("ansage");
  const istRad = el && el.dataset.art === "rad";
  if (!l || l.nr <= radGesehen) { if (istRad) ansageWeg(); return false; }
  const jetzt = jetztGastgeber(), ph = G.phase(l, jetzt);
  // Feld "Duell": wer betroffen ist, sieht die Meldung, bis das Duell gewaehlt bzw. eingetragen ist (hoechstens 5 Minuten)
  const d = l.duell, duellIch = G.duellOffen(l) && (d ? [d.von, d.an].includes(meineId) : l.getroffen === meineId) && jetzt < Math.max(l.ende, l.zu || 0) + 300000;
  if (ph === "fertig" && !duellIch && jetzt > Math.max(l.ende, l.zu || 0) + 12000) { radGesehen = l.nr; if (istRad) ansageWeg(); return false; }
  if (l.nr > radGemeldet) {
    radGemeldet = l.nr;
    TON.spiele(A.klang(raum.look, "meldung"));
    vibriere([60, 40, 60]);
  }
  const wahl = ph === "joker" && l.getroffen === meineId && !l.schub && G.jokerVon(raum, meineId) > 0;
  if (nachrang && (ph === "fertig" || ph === "warten") && !duellIch) { radGesehen = l.nr; return false; }
  const sig = `${l.nr}|${ph === "warten" ? "fertig" : ph}|${l.schub ? 1 : 0}|${wahl ? 1 : 0}|${beamerZahl() ? 1 : 0}|${d ? `${d.art}${d.erg ? "e" : ""}` : ""}|${duellIch ? 1 : 0}`;
  if (istRad && el.dataset.sig === sig) return true;
  const a = ansageEl();
  a.dataset.art = "rad"; a.dataset.nr = String(l.nr); a.dataset.sig = sig;
  const hin = `<button class="gruen" data-rad-hin>🎡 Rad</button>`;
  const weg = `<button class="klein2" data-ansage-weg aria-label="Schließen">✕</button>`;
  let text;
  if (ph === "drehen") text = `<b>🎡 ${esc(l.name)} dreht das Glücksrad …</b><small>${beamerZahl() ? "Schaut zum Beamer!" : "Gleich steht es fest"}</small>`;
  else if (l.schub) text = `<b>🃏 ${esc(G.schubText(l))}</b><small>${esc(l.schub.anName)}: ${l.emo} ${esc(l.feld === "wop" ? l.zusatz : l.kurz)}</small>`;
  else {
    const name = l.trifft ? l.getroffenName : l.name;
    const unter = l.feld === "wop" ? l.zusatz : l.zusatz || (l.text ? `${name} ${l.text}` : "");
    text = `<b>🎡 ${esc(G.ergebnisText(l))}</b><small>${esc(unter)}</small>`;
    if (ph === "joker" && !wahl) text += `<small>🃏 ${esc(l.getroffenName)} hat einen Joker – weiterschieben? <b data-gcd="${l.frist}" data-sek>${Math.ceil((l.frist - jetzt) / 1000)}</b> s</small>`;
  }
  if (wahl) {
    const andere = raum.spieler.filter((x) => x.id !== meineId);
    a.innerHTML = `<span class="ansage-text">${text}<small>🃏 Du hast ${G.jokerVon(raum, meineId)} Joker – an wen schiebst du es weiter? Noch <b data-gcd="${l.frist}" data-sek>${Math.ceil((l.frist - jetzt) / 1000)}</b> s</small>
        <select id="rf-schub" class="rad-schubwahl">${andere.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></span>
      <span class="ansage-knoepfe rad-wahl">${knopf("🃏 Weiterschieben", { typ: "_glueck", was: "schieben" }, "gelb", `data-feld="rf-schub" data-klang="tada"`)}${knopf("Nehm ich", { typ: "_glueck", was: "behalten" }, "klein2")}</span>`;
    TON.spiele("dran");
    vibriere([120, 60, 120]);
  } else if (duellIch && (ph === "fertig" || ph === "warten")) a.innerHTML = radDuellHTML(l, text);
  else {
    if (d && (ph === "fertig" || ph === "warten")) text += `<small>⚔️ ${esc(d.vonName)} fordert ${esc(d.anName)} heraus${d.art === "echt" ? " – in echt" : " – am Handy"}</small>`;
    a.innerHTML = `<span class="ansage-text">${text}</span><span class="ansage-knoepfe">${hin}${weg}</span>`;
  }
  ansagePlatz();
  return true;
}
// Gluecksrad "Duell": Gegner waehlen (am Handy oder in echt), beim echten Duell danach das Ergebnis melden
function radDuellHTML(l, text) {
  const d = l.duell;
  if (!d) {
    const andere = raum.spieler.filter((x) => x.id !== meineId);
    TON.spiele("dran");
    return `<span class="ansage-text">${text}<small>⚔️ Wen forderst du heraus?</small>
        <select id="rf-duellgegner" class="rad-schubwahl">${andere.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></span>
      <span class="ansage-knoepfe rad-wahl rad-duellwahl">${knopf("🎮 Duell am Handy", { typ: "_glueck", was: "duell", art: "app" }, "gelb", `data-feld="rf-duellgegner" data-klang="los"`)}${knopf("🤼 In echt", { typ: "_glueck", was: "duell", art: "echt" }, "klein2", `data-feld="rf-duellgegner"`)}</span>`;
  }
  const gegner = meineId === d.von ? d.anName : d.vonName;
  return `<span class="ansage-text"><b>🤼 ${esc(l.zusatz || "Duell in echt")}</b><small>Gegen ${esc(gegner)} – wer hat gewonnen? Meldet der Sieger, bestätigt der Verlierer an der Turniertafel.</small></span>
    <span class="ansage-knoepfe rad-wahl">${knopf("🏆 Ich hab gewonnen", { typ: "_glueck", was: "duellerg", gewonnen: true }, "gruen")}${knopf("😅 Ich hab verloren", { typ: "_glueck", was: "duellerg", gewonnen: false }, "klein2")}</span>`;
}

// "Neues Spiel: Quiz-Duell - mitmachen?" oben bei allen, die noch nicht dabei sind
function ansageZeigen() {
  jokerPruefen();
  const m = raum && raum.meldung;
  const p = m && raum.partien[m.pid];
  // "Spiel fuer alle" (Spielleitung): wer verbunden war, ist schon dabei - nur Bescheid geben
  const alle = m && p && m.alle && m.nr > ansageNr && !istLokal(m.von) && p.mit.includes(meineId) && p.phase === "sammeln";
  const zeigen = m && p && m.nr > ansageNr && !istLokal(m.von) && !p.mit.includes(meineId) && !p.wartend.includes(meineId)
    && (p.phase === "sammeln" || P.mittendrin(p.spiel));
  // Gluecksrad zuerst, solange es dreht oder jemand ueber seinen Joker entscheidet; danach hat ein neues Spiel Vorrang
  if (radAnsage(!!(alle || zeigen))) return;
  const el = document.getElementById("ansage");
  if (alle) {
    if (el && el.dataset.art === "alle" && el.dataset.nr === String(m.nr)) return;
    const sp = spiel(p.spiel);
    const a = ansageEl();
    a.dataset.art = "alle"; a.dataset.nr = String(m.nr);
    a.innerHTML = `<span class="ansage-text"><b>${sp.emoji} ${esc(sp.name)} – für alle!</b><small>Die Spielleitung hat dich gleich eingetragen</small></span>
      <span class="ansage-knoepfe"><button class="gruen" data-ansicht="${esc(p.pid)}">Ansehen</button><button class="klein2" data-ansage-weg aria-label="Schließen">✕</button></span>`;
    ansagePlatz();
    TON.spiele(A.klang(raum.look, "meldung"));
    vibriere([80, 60, 80]);
    clearTimeout(ansageTimer);
    ansageTimer = setTimeout(() => { ansageNr = Math.max(ansageNr, m.nr); ansageWeg(); }, 30000);
    return;
  }
  if (!zeigen) { if (el && (el.dataset.art === "neu" || el.dataset.art === "alle")) ansageWeg(); return; }
  if (el && el.dataset.art === "neu" && el.dataset.nr === String(m.nr)) return;
  const sp = spiel(p.spiel);
  const a = ansageEl();
  a.dataset.art = "neu"; a.dataset.nr = String(m.nr);
  a.innerHTML = `<span class="ansage-text"><b>Neues Spiel: ${sp.emoji} ${esc(sp.name)} – mitmachen?</b><small>${esc(P.nameVon(raum, p, m.von))} hat es gestartet</small></span>
    <span class="ansage-knoepfe"><button class="gruen" data-ansage-mit="${esc(p.pid)}">Mitmachen</button><button class="klein2" data-ansage-weg aria-label="Schließen">✕</button></span>`;
  ansagePlatz();
  TON.spiele(A.klang(raum.look, "meldung"));
  vibriere([80, 60, 80]);
  clearTimeout(ansageTimer);
  ansageTimer = setTimeout(() => { ansageNr = Math.max(ansageNr, m.nr); ansageWeg(); }, 30000);
}
function losAnsage(p) {
  const sp = spiel(p.spiel);
  const a = ansageEl();
  a.dataset.art = "los"; a.dataset.nr = p.pid;
  a.innerHTML = `<span class="ansage-text"><b>${sp.emoji} ${esc(sp.name)} geht los!</b><small>Du bist dabei</small></span>
    <span class="ansage-knoepfe"><button class="gruen" data-ansicht="${esc(p.pid)}">Hin</button><button class="klein2" data-ansage-weg aria-label="Schließen">✕</button></span>`;
  ansagePlatz();
  clearTimeout(ansageTimer);
  ansageTimer = setTimeout(ansageWeg, 20000);
}

function netzAnzeige(an) {
  if (an) warVerbunden = true;
  let el = document.getElementById("netz");
  if (an || !warVerbunden) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "netz"; el.className = "netzweg"; document.body.appendChild(el); }
  const n = netz ? Object.keys(netz.postfach).length : 0;
  el.textContent = n ? `📡 Verbindung weg – ${n === 1 ? "deine Eingabe wird" : `${n} Eingaben werden`} gleich nachgeschickt` : "📡 Verbindung weg – kommt gleich wieder";
}

function eingangEinmal() {
  if (!raum || !code) return;
  const k = `pa_eingang_${code}`;
  if (sessionStorage.getItem(k)) return;
  sessionStorage.setItem(k, "1");
  setTimeout(() => A.eingang(raum.look, konfetti, TON.spiele), 250);
}

// ---------------------------------------------------------------- Senden
export function senden(a) {
  if (!raum || !a) return;
  if (!RAUM_TYPEN.has(a.typ) && a.p == null && ansicht) a = { ...a, p: ansicht };
  if (WEITER_TYPEN.has(a.typ) && a.p != null && raum.partien[a.p]) a = { ...a, pv: raum.partien[a.p].v || 0 };
  const von = absender(a);
  if (rolle === "gastgeber") return ausfuehren(von, a);
  if (netz) netz.aktionSenden(von, a).catch((e) => { console.warn(e); hinweis("Nicht gesendet – keine Verbindung?"); });
}
// In wessen Namen eine Aktion geht: der Controller, der sie ausloest; Spielzuege per Touch fuer den Spieler, fuer den
// das Spiel gerade gezeichnet ist; Leiten (Los, Beenden ...) darf, wer von diesem Geraet aus leiten darf.
const LEITER_TYPEN = new Set(["_los", "_wand", "_erklweg", "_zurueck", "_neuauf", "_botneu", "_botweg", "_ohne", "_karte", "_hm", "_brettende"]);
function absender(a) {
  const eigen = sendeAls || meineId;
  if (a.typ === "_figur" && a.id === meineId) return meineId;   // die eigene Figur, auch wenn der Controller drueckt
  if (RAUM_TYPEN.has(a.typ) || a.p == null || !lokaleIds().length) return eigen;
  const p = raum.partien[a.p];
  if (!p) return eigen;
  if (LEITER_TYPEN.has(a.typ)) {
    const darf = (id) => P.darfLeiten(p, id, K.istAdmin(raum, id));
    return darf(eigen) ? eigen : [meineId, ...padIds()].find(darf) || eigen;
  }
  if (a.typ.startsWith("_")) return eigen;
  if (sendeAls && p.mit.includes(sendeAls)) return sendeAls;
  return anzeige.pid === p.pid && anzeige.id && p.mit.includes(anzeige.id) ? anzeige.id : eigen;
}
const sendenFuer = (pid) => (a) => senden({ ...a, p: pid });

// ---------------------------------------------------------------- Rechte und Anzeige-Hilfen
const binAdmin = () => K.istAdmin(raum, meineId);
const zeigeSteuer = () => binAdmin() && steuern;
const ichSpieler = () => raum && raum.spieler.find((x) => x.id === meineId);
function meinTafelName() { const s = ichSpieler(); return (s && s.name) || meinName; }
function offenFuerMich() { return raum && raum.tafel && raum.tafel.wertung ? W.offenFuer(raum.tafel.wertung, meinTafelName()).length : 0; }
// Im Spiel zaehlt die Spieler-Nummer im Spiel (so faerben auch die Spiele selbst: f0, f1 ...), ausserhalb der Platz im Raum
const farbeVon = (p, id) => { const j = p.mit.indexOf(id), f = p.hm && p.hm.fig && p.hm.fig[id]; return f ? f.farbe : j >= 0 ? j % 20 : 0; };
function schilder(name, id) {
  return `${K.istTestkonto(raum, name) ? `<span class="testschild" title="Testkonto: zählt nicht in die Wertung">TEST</span>` : ""}${K.istAdmin(raum, id) ? `<span class="adminschild" title="Spielleitung">🛠️</span>` : ""}`;
}
function pille(sp) {
  return `<span class="pille ${sp.online ? "" : "aus"}"><span class="farbe f${sp.platz % 20}"></span>${esc(sp.name)}${schilder(sp.name, sp.id)}${padMarke(sp.id)}${sp.id === meineId ? " (du)" : ""}</span>`;
}

function tafelMomente() {
  const t = raum && raum.tafel, w = t && t.wertung;
  return { ehrung: (t && t.ehrung) || 0, pokal: (w && w.uebergabe) || 0, abend: (w && w.abend) || 0 };
}
function tafelPruefen() {
  if (!raum) return;
  const m = tafelMomente(), g = tafelMomenteGesehen;
  tafelMomenteGesehen = m;
  if (!g) { offenGemeldet = offenFuerMich(); return; }
  const modus = m.pokal > g.pokal ? "pokal" : m.abend > g.abend ? "abend" : m.ehrung > g.ehrung ? "ehrung" : null;
  if (modus) { tafelAuf = true; tafelAnsicht = { station: null, modus, leeren: false }; window.scrollTo(0, 0); }
  const offen = offenFuerMich();
  if (offen > offenGemeldet && !tafelAuf) { setTimeout(() => hinweis("⚔️ Jemand wartet auf deine Bestätigung – Tafel öffnen"), 50); vibriere(150); }
  offenGemeldet = offen;
}

// Was im angezeigten Spiel von der Lobby abhaengt (Namen, Verbindung der Mitspieler, Schalter, Aussehen, Rechte)
function sigFuer(p) {
  return JSON.stringify([P.namen(raum, p), p.mit.map((id) => { const s = raum.spieler.find((x) => x.id === id); return s ? !!s.online : true; }),
    raum.ab18, raum.ohneAlkohol, raum.look, raum.testkonten, binAdmin(), steuern, gastgeberDa(), p.phase === "sammeln" ? [raum.brettWeg, raum.brettVorlagen] : 0]);
}
// Ein laufendes Spiel (Fiesbau-Lauf, 3D-Brett, halb getippte Eingaben) wird nur neu aufgebaut, wenn sich fuer genau diese
// Ansicht etwas geaendert hat - nicht, weil nebenan ein anderes Spiel weiterlaeuft oder jemand die Tafel fuettert.
function stillHalten(aend) {
  if (!aend || !raum || status || aend.alles) return false;
  if (steuerAuf && zeigeSteuer()) return !aend.lobby && beamerSpielSig() === steuerSpiel;
  if (tafelAuf) return !aend.lobby && !aend.tafel;
  if (!ansicht || !raum.partien[ansicht]) return false;
  if (aend.partien.has(ansicht)) return false;
  if (aend.lobby && sigFuer(raum.partien[ansicht]) !== partieSig) return false;
  if (aend.tafel) {
    if (offenFuerMich() > offenGemeldet) return false;
    const m = tafelMomente(), g = tafelMomenteGesehen;
    if (g && (m.ehrung > g.ehrung || m.pokal > g.pokal || m.abend > g.abend)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- Eingaben ueberstehen das Neuzeichnen
// Nico 31.10.2026: "tippt einer etwas und ein anderer gibt ab, wird das Feld bei allen geleert". Jedes Feld mit id behaelt
// seinen Wert (data-rk = zu welcher Runde/Frage es gehoert: wechselt sie, faengt das Feld leer an). Das Feld, in dem gerade
// getippt wird, bleibt sogar dasselbe Element - so bleiben Fokus, Schreibmarke und die Handy-Tastatur offen.
const FELDER = "input[id],textarea[id],select[id]";
function felderMerken() {
  const m = {};
  document.querySelectorAll(FELDER).forEach((f) => { if (f.type !== "checkbox" && f.type !== "radio") m[f.id] = { wert: f.value, rk: f.dataset.rk || "" }; });
  return m;
}
function felderZurueck(m) {
  Object.entries(m).forEach(([id, x]) => {
    const f = document.getElementById(id);
    if (!f || (f.dataset.rk || "") !== x.rk || f.value === x.wert) return;
    if (f.tagName === "SELECT" && ![...f.options].some((o) => o.value === x.wert)) return;
    f.value = x.wert;
  });
}
function fokusMerken() {
  const f = document.activeElement;
  if (!f || !f.id || !/^(INPUT|TEXTAREA)$/.test(f.tagName)) return null;
  let start = null, ende = null;
  try { start = f.selectionStart; ende = f.selectionEnd; } catch (e) { /* Zahlenfeld kennt keine Schreibmarke */ }
  return { id: f.id, start, ende };
}
function fokusZurueck(x) {
  if (!x) return;
  const f = document.getElementById(x.id);
  if (!f || f === document.activeElement || !/^(INPUT|TEXTAREA)$/.test(f.tagName)) return;
  f.focus({ preventScroll: true });
  try { if (x.start !== null) f.setSelectionRange(x.start, x.ende); } catch (e) { /* Zahlenfeld */ }
}
// Neues HTML ins App-Feld. Tippt gerade jemand in ein Feld, das es danach wieder gibt (gleiche id, Art und Runde), bleiben
// dieses Element und seine Vorfahren stehen - nur alles drumherum wird ersetzt.
function einsetzen(html) {
  eingesetzt = null;
  const halten = document.activeElement;
  if (halten && halten.id && app.contains(halten) && /^(INPUT|TEXTAREA)$/.test(halten.tagName)) {
    const neu = document.createElement("div");
    neu.innerHTML = html;
    const partner = neu.querySelector(`#${CSS.escape(halten.id)}`);
    if (partner && partner.tagName === halten.tagName && partner.type === halten.type
      && (partner.dataset.rk || "") === (halten.dataset.rk || "") && verpflanzen(neu, halten, partner)) return;
  }
  app.innerHTML = html;
  eingesetzt = { html, knoten: app.firstElementChild };
}
function verpflanzen(neu, halten, partner) {
  const pfad = (wurzel, ziel) => { const l = []; for (let k = ziel; k && k !== wurzel; k = k.parentNode) l.unshift(k); return l; };
  const pa = pfad(app, halten), pn = pfad(neu, partner);
  if (pa.length !== pn.length || pa.some((k, i) => k.nodeName !== pn[i].nodeName)) return false;
  let alt = app, nw = neu;
  pa.forEach((ak, i) => {
    const nk = pn[i];
    [...alt.childNodes].forEach((k) => { if (k !== ak) k.remove(); });
    const kinder = [...nw.childNodes], stelle = kinder.indexOf(nk);
    kinder.slice(0, stelle).forEach((k) => alt.insertBefore(k, ak));
    kinder.slice(stelle + 1).forEach((k) => alt.appendChild(k));
    attributeUebernehmen(ak, nk, ak === halten);
    alt = ak; nw = nk;
  });
  return true;
}
function attributeUebernehmen(ziel, quelle, feld) {
  [...ziel.attributes].forEach((x) => { if (!quelle.hasAttribute(x.name) && !(feld && x.name === "value")) ziel.removeAttribute(x.name); });
  [...quelle.attributes].forEach((x) => { if (!(feld && x.name === "value") && ziel.getAttribute(x.name) !== x.value) ziel.setAttribute(x.name, x.value); });
}

// ---------------------------------------------------------------- Ergebnis steht erst eine Weile (kein Wegtippen)
// Nico 31.10.2026 (Tipp-Marathon im Partybrett): wer nach dem Ende weitertippt, darf die Rangliste nicht wegtippen. Ein neues
// Ergebnis sperrt die Weiter-Knoepfe (SPERR_TYPEN) im Spielfeld fuer ERGEBNIS_SPERRE ms - danach geht es nur bewusst weiter.
function sperrKnoepfe() {
  return [...app.querySelectorAll(".spielflaeche button[data-a]")].filter((k) => { try { return SPERR_TYPEN.has(JSON.parse(k.dataset.a).typ); } catch (e) { return false; } });
}
function ergebnisPruefen(p) {
  if (!p) return;
  const marken = [...app.querySelectorAll(".spielflaeche [data-ergebnis], .spielflaeche .urteil, .spielflaeche .rangliste")];
  const key = marken.length ? `${p.pid}|${marken.map((el) => el.dataset.ergebnis || el.textContent.replace(/\s+/g, " ").trim().slice(0, 160)).join("|")}` : "";
  if (key !== ergebnisSperre.key) {
    ergebnisSperre.key = key;
    clearTimeout(ergebnisSperre.timer);
    // Partybrett: die Stehzeit folgt dem Spieltempo (Pausen)
    const sp = spiel(p.spiel), dauer = ERGEBNIS_SPERRE * (sp && sp.sperrFaktor && p.s ? sp.sperrFaktor(p.s) : 1);
    ergebnisSperre.bis = key ? Date.now() + dauer : 0;
    if (key) ergebnisSperre.timer = setTimeout(sperreAufheben, dauer + 20);
  }
  if (Date.now() < ergebnisSperre.bis) sperrKnoepfe().forEach((k) => { if (!k.disabled) { k.disabled = true; k.dataset.gesperrt = ""; } });
}
function sperreAufheben() {
  ergebnisSperre.bis = 0;
  app.querySelectorAll("button[data-gesperrt]").forEach((k) => { if (k.dataset.zugsperre === undefined) k.disabled = false; delete k.dataset.gesperrt; });
  if (padIds().length) C.fokusWiederherstellen();
}

// ---------------------------------------------------------------- "Weiter" nur fuer den Spieler am Zug (weiterRechtSetzen)
// Wer nicht dran ist, sieht die Weiter-Knoepfe gesperrt mit Hinweis und Restzeit; nach WEITER_FREI ms sind sie fuer alle frei.
// Die Zeit laeuft ab dem Moment, in dem der Knopf auf DIESEM Handy erscheint - nicht ab dem letzten Zug: ein Ergebnis nach
// 30 Sekunden Raten waere sonst sofort frei.
const WEITER_FREI = 20000;
let zugSperre = { key: "", seit: 0, fehlt: 0 };
function weiterKnoepfe() {
  return [...app.querySelectorAll(".spielflaeche button[data-a]")].filter((k) => { try { return WEITER_TYPEN.has(JSON.parse(k.dataset.a).typ); } catch (e) { return false; } });
}
function zugSperrePruefen(p) {
  const frei = (k) => { if (k.dataset.zugsperre !== undefined) { delete k.dataset.zugsperre; if (k.dataset.gesperrt === undefined) k.disabled = false; } };
  const knoepfe = p && p.phase === "laeuft" && !status ? weiterKnoepfe() : [];
  const wz = p && Array.isArray(p.wz) ? p.wz : [];
  const meine = p ? [meineId, ...lokaleIds()].map((id) => p.mit.indexOf(id)).filter((i) => i >= 0) : [];
  const darf = !wz.length || binAdmin() || meine.some((i) => wz.includes(i));
  if (darf) { zugSperre = { key: "", seit: 0, fehlt: 0 }; knoepfe.forEach(frei); return; }
  if (!knoepfe.length) {
    // der Knopf ist gerade nicht da: erst nach 3 s gilt er als wirklich weg (dann beginnt die Wartezeit beim naechsten von vorn)
    if (zugSperre.key && !zugSperre.fehlt) zugSperre.fehlt = Date.now();
    else if (zugSperre.key && Date.now() - zugSperre.fehlt > 3000) zugSperre = { key: "", seit: 0, fehlt: 0 };
    return;
  }
  const key = `${p.pid}|${p.wv || 0}|${wz.join()}`;
  if (key !== zugSperre.key) zugSperre = { key, seit: Date.now(), fehlt: 0 };
  zugSperre.fehlt = 0;
  const rest = Math.ceil((zugSperre.seit + WEITER_FREI - Date.now()) / 1000);
  if (rest <= 0) { knoepfe.forEach(frei); return; }
  const nm = P.namen(raum, p), wer = wz.map((i) => nm[i]).filter(Boolean).join(" oder ");
  const text = `⏳ ${wer || "Jemand anderes"} drückt – in ${rest} s für alle frei`;
  knoepfe.forEach((k) => {
    if (k.disabled && k.dataset.zugsperre === undefined && k.dataset.gesperrt === undefined) return;   // vom Spiel selbst gesperrt: nicht anfassen
    if (k.dataset.zugsperre !== text) k.dataset.zugsperre = text;
    if (!k.disabled) k.disabled = true;
  });
}
setInterval(() => { if (zugSperre.key && raum && !status && ansicht && raum.partien[ansicht]) zugSperrePruefen(raum.partien[ansicht]); }, 500);

// ---------------------------------------------------------------- Spielmodus am Handy: Vollbild, nichts verrutscht
// Nicos Kritik 08.11.2026 (Punkte 8, 9): "ein versehentlicher Tipp neben das Spielfenster verschiebt die Seite" und "am besten
// alle Spiele im Vollbild". Solange ein Spiel laeuft (fuer alle Spiele, zentral hier):
// - html.im-spiel: kein Ueberscrollen/Gummiband, kein Ziehen zum Neuladen, kein Doppeltipp-Zoom, kein Markieren (style.css)
// - Zoom aus: der Viewport bekommt maximum-scale=1/user-scalable=no; zwei Finger bewegen die Seite nicht
// - Wischen, das NEBEN dem Spielfeld beginnt (Kopf, Rand, Fuss), bewegt die Seite nicht; auf dem Spielfeld darf man weiter
//   scrollen (lange Spiele brauchen das), Eingabefelder bleiben frei
// - Vollbild (Fullscreen-API) braucht eine Geste: "Los", "Mitmachen" und das Oeffnen eines Spiels schalten es ein, sonst
//   der Knopf "⛶ Vollbild" im Spielkopf. iPhone-Safari kennt Vollbild fuer Webseiten nicht - dort fehlt der Knopf, es
//   bleibt bei der Sperre gegen Verrutschen und voller Hoehe (100dvh); die Safari-Leisten lassen sich von einer Seite aus nicht wegschalten.
const HANDY = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const VOLLBILD_DA = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const VIEWPORT = document.querySelector('meta[name="viewport"]');
const VIEWPORT_NORMAL = VIEWPORT ? VIEWPORT.content : "";
const imVollbild = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function vollbildKnopf() {
  return HANDY && VOLLBILD_DA ? `<button class="klein2 vollbild-knopf" data-vollbild aria-label="Vollbild" title="Vollbild">⛶ Vollbild</button>` : "";
}
function vollbildAn() {
  if (!HANDY || !VOLLBILD_DA || imVollbild()) return;
  const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
  try { const r = f.call(el, { navigationUI: "hide" }); if (r && r.catch) r.catch(() => {}); } catch (e) { /* Browser lehnt ab: Knopf bleibt */ }
}
function spielmodus(an) {
  const html = document.documentElement;
  if (html.classList.contains("im-spiel") === an) return;
  html.classList.toggle("im-spiel", an);
  if (VIEWPORT) VIEWPORT.content = an ? `${VIEWPORT_NORMAL}, maximum-scale=1, user-scalable=no` : VIEWPORT_NORMAL;
}
// Bildschirm bleibt an, solange ein Spiel offen ist (Nico 13.11.2026): beim Warten auf den eigenen Zug, bei Werwolf oder im
// Quiz sperrte sich das Handy sonst von selbst. In der Uebersicht darf es ausgehen (Akku). Ein Geraet, das den Raum haelt,
// bleibt immer wach - geht dessen Bildschirm aus, steht bei allen alles. Aeltere Browser kennen das nicht: dann bleibt es beim Alten.
let wachSperre = null, wachSoll = false, wachHolt = false;
async function wachHalten(an) {
  wachSoll = !!an;
  if (!("wakeLock" in navigator) || wachHolt) return;
  try {
    if (wachSoll && !wachSperre && !document.hidden) {
      wachHolt = true;
      const w = await navigator.wakeLock.request("screen");
      wachHolt = false;
      w.addEventListener("release", () => { if (wachSperre === w) wachSperre = null; });
      wachSperre = w;
      if (!wachSoll) wachHalten(false);
    } else if (!wachSoll && wachSperre) { const w = wachSperre; wachSperre = null; await w.release(); }
  } catch (e) { wachHolt = false; /* Stromsparmodus oder der Browser lehnt ab */ }
}
// nach dem Entsperren oder Zurueckwechseln gibt der Browser die Sperre frei: neu holen
document.addEventListener("visibilitychange", () => { if (!document.hidden && wachSoll) wachHalten(true); });
function vollbildGeaendert() { document.documentElement.classList.toggle("vollbild", imVollbild()); }
document.addEventListener("fullscreenchange", vollbildGeaendert);
document.addEventListener("webkitfullscreenchange", vollbildGeaendert);
let wischStart = null;
document.addEventListener("touchstart", (ev) => { wischStart = ev.target; }, { passive: true, capture: true });
document.addEventListener("touchmove", (ev) => {
  if (!document.documentElement.classList.contains("im-spiel")) return;
  if (ev.touches.length > 1) { ev.preventDefault(); return; }   // zwei Finger: kein Zoomen im Spiel
  const t = wischStart && wischStart.closest ? wischStart : null;
  if (t && t.closest(".spielflaeche, input, textarea, select, .protokoll, .bm-pult")) return;
  ev.preventDefault();
}, { passive: false });

// ---------------------------------------------------------------- Zurueck-Knopf des Handys
// Aus Spiel, Turniertafel oder Steuerseite fuehrt "Zurueck" in die Uebersicht (vorher verliess man den Raum). Dafuer liegt,
// solange so eine Ansicht offen ist, ein eigener Eintrag im Verlauf.
function zurueckMerken() {
  if (zurueckEintrag || !code) return;
  history.pushState({ pa: "unter" }, "", location.href);
  zurueckEintrag = true;
}
window.addEventListener("popstate", (ev) => {
  if (ev.state && ev.state.pa === "unter") { zurueckEintrag = true; return; }
  zurueckEintrag = false;
  if (!raum || status) return;
  if (ansicht || tafelAuf || steuerAuf) {
    ansicht = null; tafelAuf = false; steuerAuf = false; glueckReiter = false; brettReiter = false; ansichtMerken();
    vibriere(20); zeichnen(); window.scrollTo(0, 0);
  } else hinweis("Noch einmal Zurück verlässt den Raum");
});

// ---------------------------------------------------------------- Zeichnen
const gesehen = new Set();
// Steuerseite: neu zeichnen, sobald der Beamer ein anderes Spiel zeigt (auch wenn sich nur ein Spiel geaendert hat)
let steuerSpiel = "";
function beamerSpielSig() { const g = raum && BS.gezeigt(raum, jetztGastgeber()); return g ? g.p.pid : ""; }
function zeichnen() {
  document.body.classList.remove("nachtmodus");
  TON.nachtLeise(false);   // Werwolf-Nacht: werwolf.js schaltet es beim Zeichnen wieder ein (ton.js, nachtLeise)
  A.lookAnwenden(raum ? raum.look : null);
  // halb getippte Eingaben (in allen Spielen, der Tafel und im Raum) ueberstehen das Neuzeichnen
  const fokus = fokusMerken();
  const felder = felderMerken();
  if (raum && !status) tafelPruefen();
  // Zeigt der Beamer gerade genau dieses Spiel, kommen Musik, Spielgeraeusche und Erzaehler von der Wand: Handy still
  const anDerWand = !!(raum && !status && ansicht && raum.partien[ansicht] && beamerZahl() > 0 && !tafelAuf && !(steuerAuf && zeigeSteuer())
    && (BS.gezeigt(raum, jetztGastgeber()) || {}).p === raum.partien[ansicht]);
  TON.still(anDerWand);
  let musik = null, partie = null;
  hmKontext = null;
  if (status || !raum) app.innerHTML = statusBild();
  else if (steuerAuf && zeigeSteuer()) { einsetzen(brettReiter ? brettListeBild() : glueckReiter ? glueckListeBild() : steuerBild()); steuerSpiel = beamerSpielSig(); }
  else if (tafelAuf) einsetzen(tafelBild());
  else if (ansicht && raum.partien[ansicht]) {
    const p = partie = raum.partien[ansicht];
    const sp = spiel(p.spiel);
    fuerPruefen(p, sp);
    const ich = anzeigeIch(p, sp);
    anzeige = { pid: p.pid, id: ich >= 0 ? p.mit[ich] : null };
    // sp.ruhig (Autoscooter, 08.11.2026): gleicher Inhalt = Seite stehen lassen; nur nach() zieht den neuen Stand nach
    // (vorher wurde bei jedem Rechentakt die ganze Seite neu gebaut - auf allen Handys, mehrmals pro Sekunde)
    const bild = partieBild(p, sp, ich);
    let ruhig = false;
    try { ruhig = typeof sp.ruhig === "function" ? !!sp.ruhig(p.s) : !!sp.ruhig; } catch (e) { ruhig = false; }
    // Schritt 4b (Nico 08.11.2026): Spielseiten werden weich angeglichen statt neu eingesetzt (weich.js) - Einblenden,
    // Aufdecken, Hochzaehlen und Siegesmoment laufen so einmal durch und starten nicht bei jedem fremden Tipp neu.
    // Spiele mit eigener Zeichenflaeche/3D, deren nach() Lauscher an ihre Elemente haengt, bleiben beim Neu-Einsetzen.
    if (ruhig && eingesetzt && eingesetzt.html === bild && eingesetzt.knoten && eingesetzt.knoten.parentNode === app) { /* unveraendert */ }
    else if (sp.weich !== false && eingesetzt && eingesetzt.pid === p.pid && eingesetzt.knoten && eingesetzt.knoten.parentNode === app) {
      einsetzenWeich(app, bild);
      eingesetzt = { html: bild, knoten: app.firstElementChild, pid: p.pid };
    } else { einsetzen(bild); if (eingesetzt) eingesetzt.pid = p.pid; }
    partieSig = sigFuer(p);
    felderZurueck(felder);
    if (p.phase === "laeuft" && ich >= 0) {
      const nm = P.namen(raum, p);
      try { musik = sp.musik ? sp.musik(p.s, ich, raum) : null; } catch (e) { musik = null; }
      // waehrend der Erklaerung keine Handy-Uhr starten (erklNachziehen zeichnet danach neu, dann laeuft nach)
      if (sp.nach && !ER.offen(p, jetztGastgeber())) try { sp.nach(p.s, ich, sendenFuer(p.pid), nm, raum); } catch (e) { console.error(e); }
    }
  } else { ansicht = null; einsetzen(raumBild()); }
  TON.musik(anDerWand || SL.pausiert(raum) ? null : musik);
  felderZurueck(felder);
  document.body.classList.toggle("hm-offen", !!hmKontext);
  spielmodus(!!(partie && partie.phase === "laeuft"));
  wachHalten(!!(raum && !status && (partie || rolle === "gastgeber")));
  if (hmKontext) HM.nach(hmKontext);
  ergebnisPruefen(partie);
  zugSperrePruefen(partie);
  if (raum && !status && (ansicht || tafelAuf || steuerAuf)) zurueckMerken();
  if (einladenOffen) qrZeigen(document.querySelector("[data-qr]"));
  if (steuerAuf && !zeigeSteuer()) steuerAuf = false;
  if (tafelAuf && tafelAnsicht.modus === "ehrung" && raum && raum.tafel && !gesehen.has("tt-ehrung-" + raum.tafel.ehrung)) {
    gesehen.add("tt-ehrung-" + raum.tafel.ehrung);
    konfetti(140);
  }
  // Pokal-Uebergabe und Abendwertung: einmal Konfetti und Fanfare je Moment
  const w = raum && raum.tafel && raum.tafel.wertung;
  if (tafelAuf && w && (tafelAnsicht.modus === "pokal" || tafelAnsicht.modus === "abend")) {
    const k = `tw-${tafelAnsicht.modus}-${tafelAnsicht.modus === "pokal" ? w.uebergabe : w.abend}`;
    if (!gesehen.has(k)) { gesehen.add(k); konfetti(160); }
  }
  // Animationen nur beim ersten Erscheinen, Konfetti bei Siegen
  // Weiches Einsetzen (weich.js): ein Element, das schon beim ersten Erscheinen dastand (__erstK), bleibt stehen und spielt
  // seine Animation zu Ende - "still" bekaemen nur neu eingesetzte Doppelgaenger (sonst wuerde die laufende Animation abgeschnitten)
  document.querySelectorAll("[data-key]").forEach((el) => {
    const k = el.dataset.key;
    if (gesehen.has(k)) { if (el.__erstK !== k) el.classList.add("still"); }
    else { gesehen.add(k); el.__erstK = k; if (el.dataset.ton && !anDerWand) { const n = el.dataset.ton, v = Number(el.dataset.tonNach || 0); v ? setTimeout(() => TON.spiele(n), v) : TON.spiele(n); } }
  });
  document.querySelectorAll(".urteil").forEach((el) => {
    const k = "k:" + el.textContent.slice(0, 80);
    if (!gesehen.has(k)) { gesehen.add(k); el.__erstU = k; if (/🏆|gewinnt/.test(el.textContent) && !anDerWand) konfetti(); }
    else if (el.__erstU !== k) el.classList.add("still");
  });
  if (gesehen.size > 3000) gesehen.clear();
  fokusZurueck(fokus);
  if (padIds().length) C.fokusWiederherstellen();
  radDrehen();
  pauseAbgleich();
}

// Drehung am Handy abspielen (nur solange sie laeuft). Klang nur ohne Beamer - sonst kommt er von der Wand.
function radDrehen() {
  if (!document.querySelector("#app svg.rad[data-rad-t]")) return;
  G.abspielen(jetztGastgeber, {
    beiTick: () => { if (!beamerZahl()) TON.spiele("tack"); },
    beiStopp: () => {
      const l = raum && raum.glueck && raum.glueck.lauf;
      if (!beamerZahl()) TON.spiele(l && l.trifft ? "tada" : "stern");
      if (l && l.getroffen === meineId) vibriere(200);
      radAnsage();
      if (raum && !status && !ansicht && !tafelAuf && !steuerAuf) zeichnen();
    },
  });
}

function statusBild() {
  if (status === "lade") return `<div class="karte mitte"><div class="logo spin">⏳</div><p>${esc(statusText)}</p></div>`;
  if (status === "verbinde") return `<div class="karte mitte"><div class="logo spin">🔗</div><p>Verbinde mit dem Raum …</p>
    ${raum && !gastgeberDa() ? `<p class="leise">Das Gastgeber-Gerät ist gerade nicht verbunden. Du kommst rein, sobald es wieder da ist.</p>` : ""}</div>`;
  if (status === "abgeloest") return `<div class="karte mitte"><div class="logo">🔁</div><h2>Gastgeber gewechselt</h2><p>${esc(statusText)}</p>
    <button class="gross" data-uebernehmen>Hier wieder übernehmen</button></div>`;
  if (status === "gewechselt") return `<div class="karte mitte"><div class="logo">📱</div><h2>Dein Platz ist umgezogen</h2><p>Du spielst jetzt auf einem anderen Handy weiter.</p>
    <button class="gross" data-neu-beitreten>Hier neu beitreten</button></div>`;
  if (status === "beendet") return `<div class="karte mitte"><div class="logo">👋</div><h2>${esc(statusText || "Der Raum ist beendet.")}</h2>
    <button class="gross" data-raum-neu>Neuen Raum öffnen</button></div>`;
  return `<div class="karte mitte"><div class="logo">📡</div><h2>Hoppla</h2><p>${esc(statusText)}</p><button class="gross" data-neu-laden>Neu laden</button></div>`;
}

// Seit wann das Gastgeber-Geraet weg ist (nur Gaeste). Nach HOLEN_NACH bekommt die Spielleitung den Knopf "Raum hierher holen".
let gastgeberWegSeit = 0, gastgeberWegTimer = null;
function gastgeberWegPruefen() {
  if (rolle !== "gast" || !raum) return;
  if (gastgeberDa()) { gastgeberWegSeit = 0; clearTimeout(gastgeberWegTimer); gastgeberWegTimer = null; return; }
  if (gastgeberWegSeit) return;
  gastgeberWegSeit = Date.now();
  clearTimeout(gastgeberWegTimer);
  gastgeberWegTimer = setTimeout(() => { gastgeberWegTimer = null; if (rolle === "gast" && raum && !status && !gastgeberDa() && binAdmin()) zeichnen(); }, HOLEN_NACH + 100);
}
function gastgeberHinweis() {
  if (rolle !== "gast" || gastgeberDa()) return "";
  const holen = binAdmin() && gastgeberWegSeit && Date.now() - gastgeberWegSeit >= HOLEN_NACH
    ? `<div class="raumholen"><button class="klein2 gruen" data-raum-holen>🏠 Raum hierher holen</button>
        <small>Nur drücken, wenn das Gastgeber-Gerät wirklich ausgefallen ist. Dieses Gerät hält dann den Raum und muss an bleiben.</small></div>` : "";
  return `<div class="hinweisbox warten netzhinweis">⚠️ Das Gastgeber-Gerät ist gerade nicht verbunden – deine Eingaben kommen an, sobald es wieder da ist.${holen}</div>`;
}

function raumLinkText() { return `${BASIS}#r=${code}`; }

// Uebersicht kuerzer (Nico 13.11.2026): am Handy war sie gut sieben Bildschirme lang. Oben eine Sprungleiste zu den sechs
// Spielgruppen (ein Tipp springt hin), jede Gruppe laesst sich am Titel zuklappen. Was zu ist, merkt sich dieses Handy.
const GRUPPEN_KURZ = ["🎲 Große", "🧩 Für alle", "🎉 Gruppen", "🍻 Trinken", "🃏 Karten", "🎯 Klassiker"];
const GRUPPEN_ZU = "pa_gruppen_zu";
let gruppenZu = new Set();
try { gruppenZu = new Set(JSON.parse(sessionStorage.getItem(GRUPPEN_ZU) || "[]")); } catch (e) { gruppenZu = new Set(); }
function gruppenMerken() { try { sessionStorage.setItem(GRUPPEN_ZU, JSON.stringify([...gruppenZu])); } catch (e) { /* privater Modus */ } }
function sprungLeiste() {
  return `<div class="sprung"><small class="leise">Spiel starten – spring zu:</small>
    <div class="sprungleiste">${GRUPPEN.map((g, k) => `<button class="klein2" data-sprung="${k}">${esc(GRUPPEN_KURZ[k] || g.titel)}</button>`).join("")}</div></div>`;
}

function raumBild() {
  const partien = P.liste(raum);
  const online = gaeste().filter((x) => x.online).length;
  const link = raumLinkText();
  const ich = ichSpieler();
  const kachel = (sp, breit) => `
    <button class="spielkachel ${breit ? "breit" : ""}" style="--k1:${(sp.farben || [])[0] || "#3b2f8f"};--k2:${(sp.farben || [])[1] || "#1f1b4d"}" data-a='${JSON.stringify({ typ: "_spielwahl", id: sp.id })}'>
      <span class="emo">${sp.emoji}</span><b>${nameHTML(sp.name)}</b><small>${esc(sp.kurz)}</small>${sp.bot ? `<span class="botmarke" title="Computer-Mitspieler möglich">🤖</span>` : ""}${P.mittendrin(sp.id) ? `<span class="einstiegmarke" title="Einsteigen mittendrin möglich">➕</span>` : ""}</button>`;
  const bereich = (g, k) => (k === 0 ? `<div class="bereichstitel" style="grid-column:span 2">✨ Von Jarvis gebaut<small>eigene Spiele, extra für euch entwickelt</small></div>`
    : g.titel.startsWith("📦") ? `<div class="bereichstitel" style="grid-column:span 2">📦 Fertige Spiele<small>bewährte Klassiker aus freien Spielesammlungen</small></div>` : "");
  const auswahl = GRUPPEN.map((g, k) => {
    const zu = gruppenZu.has(k), spiele = g.ids.map(spiel).filter(Boolean);
    return bereich(g, k) + `<div class="gruppentitel gruppenknopf" id="gruppe-${k}" style="grid-column:span 2" data-gruppe="${k}" role="button" tabindex="0" aria-expanded="${!zu}">
        <span>${g.titel.startsWith("📦") ? "🎯 Klassiker für zwei und mehr" : g.titel}</span><span class="gruppen-pfeil">${zu ? `${spiele.length} Spiele ▸` : "▾"}</span></div>` +
      (zu ? "" : spiele.map((sp) => kachel(sp, g.ids.length < 3)).join(""));
  }).join("");
  return `
    ${gastgeberHinweis()}
    <div class="karte raumkopf">
      ${A.deko(raum.look)}
      <h1 class="anlass-titel">${A.titelHTML(raum.anlass)}</h1>
      <p class="leise raumzeile">${online} online · ${gaeste().length} im Raum${partien.length ? ` · ${partien.length} ${partien.length === 1 ? "Spiel läuft" : "Spiele laufen"}` : ""}</p>
      <div class="kontozeile"><span>Du: <b>${esc(ich ? ich.name : meinName)}</b>${schilder(ich ? ich.name : meinName, meineId)}</span>
        ${binAdmin() ? `<button class="klein2" data-steuern>${steuern ? "🎮 Nur mitspielen" : "🛠️ Steuern"}</button>` : ""}
        ${zeigeSteuer() ? `<button class="klein2" data-steuer-auf>📽️ Steuerseite</button>` : ""}</div>
      <details class="einladen" ${einladenOffen ? "open" : ""}><summary>📲 Leute einladen – ein Link, ein QR-Code</summary>
        <p class="leise klein">Alle nehmen denselben Link. Mehr braucht es nicht.</p>
        <div class="linkzeile" data-link="${esc(link)}">${esc(link)}</div>
        <button class="gross" data-teilen="${esc(`${A.titel(raum.anlass)} – komm in den Raum und spiel mit: ${link}`)}">🔗 Link teilen</button>
        <div class="qr" data-qr="${esc(link)}"></div>
      </details>
      ${sprungLeiste()}
    </div>
    <div class="karte">
      <h2>🎮 Laufende Spiele</h2>
      ${partien.length ? `<div class="partien">${partien.map(partieKarte).join("")}</div>` : `<p class="leise">Noch läuft nichts. Such dir unten ein Spiel aus – alle anderen bekommen eine Meldung und können mitmachen.</p>`}
    </div>
    ${glueckKarte()}
    <button class="gross gelb tt-einstieg" data-tt-auf><span>🏆 Turniertafel</span><small>${esc(TAFEL.kurz(raum.tafel, raum.ohneAlkohol))}</small>${tafelKnopfZusatz()}</button>
    <div class="karte">
      <h2>Spiel starten</h2>
      <p class="leise klein">Jeder darf ein Spiel starten. Mehrere Spiele dürfen gleichzeitig laufen.</p>
      <div class="kacheln">${auswahl}</div>
    </div>
    <div class="karte">
      <h2>👥 Im Raum</h2>
      <div class="leute">${gaeste().map(pille).join("")}</div>
    </div>
    ${padKarte()}
    ${zeigeSteuer() ? steuerKarte() : binAdmin() ? "" : codeKarte()}
    <div class="spielhilfe"><button class="klein2" data-geht-nicht>⚠️ Geht nicht</button>${dranSchalter()}</div>
    <p class="leise klein mitte">Trinkt verantwortungsvoll – Wasser zählt auch als Schluck. 💧</p>`;
}

// Gluecksrad am Handy (Schritt C): schlicht und stromsparend - das Rad dreht sich hier nur waehrend eines Drehs; mit
// Beamer im Raum klein und nur mit Zeichen (das grosse Rad laeuft an der Wand), ohne Beamer gross und beschriftet.
// Kein eigenes alkoholfreies Rad (Nico): die Karte bleibt auch mit "Ohne Alkohol" sichtbar und unveraendert.
function glueckKarte() {
  const g = raum.glueck || {}, l = g.lauf, jetzt = jetztGastgeber();
  const beamer = beamerZahl() > 0;
  const d = G.darfDrehen(raum, meineId, jetzt);
  const joker = G.jokerVon(raum, meineId);
  const zeigRad = l && (!l.fertig || jetzt < Math.max(l.ende, l.zu || 0) + 15000);
  let knopfHTML;
  if (d.ok) knopfHTML = knopf(d.nochmal ? "🔁 Nochmal drehen!" : "🎡 Drehen", { typ: "_glueck", was: "drehen" }, "gross rad-dreh", `data-klang="wuerfel"`);
  else knopfHTML = `<button class="gross rad-dreh" disabled>${d.bis ? `⏳ Wieder drehen in <span data-gcd="${d.bis}">${W.uhrText(d.bis - jetzt)}</span>` : g.frei === false ? "🔒 Rad gesperrt" : `🎡 ${esc(d.grund || "Gerade nicht")}`}</button>`;
  const rad = zeigRad ? `<div class="rad-handy ${beamer ? "klein" : "gross"}">${G.radLaufSVG(l, raum.look, jetzt, !beamer)}</div>${G.ergebnisHTML(l, jetzt)}` : "";
  const zuletzt = !zeigRad && g.letzter ? `<p class="leise klein">Zuletzt: <b>${esc(g.letzter.name)}</b> – ${esc(g.letzter.preis)}</p>` : "";
  return `<div class="karte glueckkarte" id="glueck">
      <h2>🎡 Glücksrad</h2>
      ${rad || `<p class="leise klein">${beamer ? "Tipp auf Drehen – das große Rad erscheint am Beamer." : "Tipp auf Drehen – Shot, Exen, Wahrheit oder Pflicht … oder Glück gehabt."}</p>`}
      ${zuletzt}
      ${g.frei === false ? `<p class="hinweisbox warten">🔒 Die Spielleitung hat das Rad gerade gesperrt.</p>` : ""}
      ${knopfHTML}
      <p class="rad-jokerzeile">🃏 Deine Joker: <b>${joker} von ${G.JOKER_MAX}</b><small>${joker ? "Trifft dich das Rad, kannst du es an jemand anderen weiterschieben." : "Joker gibt es auf dem Rad und für Siege bei der Blitzreaktion."}</small></p>
    </div>`;
}

function partieKarte(p) {
  const sp = spiel(p.spiel);
  if (!sp) return "";
  const dabei = p.mit.some(istLokal), wartet = p.wartend.includes(meineId);
  const nm = P.namen(raum, p);
  const mitten = P.mittendrin(p.spiel);
  const zustand = p.phase === "sammeln" ? "sammelt Mitspieler" : mitten ? "läuft · Einsteigen geht" : "läuft · Einstieg in der nächsten Runde";
  const mitA = JSON.stringify({ typ: "_mit", p: p.pid });
  let knoepfe;
  if (p.phase === "laeuft" && P.kannZurueck(p, meineId)) knoepfe = `<button class="gruen" data-a='${mitA}' data-ansicht="${p.pid}">🙋 Wieder mitmachen</button>`;
  else if (dabei) knoepfe = `<button class="gruen" data-ansicht="${p.pid}">${p.phase === "sammeln" ? "Ansehen" : "Zurück ins Spiel"}</button>`;
  else if (p.phase === "sammeln" || mitten) knoepfe = `<button class="gruen" data-a='${mitA}' data-ansicht="${p.pid}">🙋 Mitmachen</button>`;
  else if (wartet) knoepfe = `<span class="ok">✓ vorgemerkt</span><button class="klein2" data-a='${JSON.stringify({ typ: "_raus", p: p.pid })}'>Doch nicht</button>`;
  else knoepfe = `<button data-a='${mitA}'>📌 Für nächste Runde vormerken</button>`;
  // Partybrett: Zuschauer koennen auf den Sieger wetten (Runde C, Punkt 36)
  if (!dabei && p.spiel === "brett" && p.phase === "laeuft") knoepfe += `<button class="klein2" data-ansicht="${p.pid}">🔮 Zuschauen &amp; wetten</button>`;
  return `<div class="partie ${dabei ? "dabei" : ""}" data-pid="${p.pid}">
      <div class="partie-kopf"><span class="emo">${sp.emoji}</span><span class="partie-text"><b>${esc(sp.name)}</b><small>${zustand}</small></span></div>
      <div class="partie-mit">${p.mit.map((id, j) => `<span class="pille"><span class="farbe f${farbeVon(p, id)}"></span>${esc(nm[j])}${P.istBot(id) ? "" : schilder(nm[j], id)}</span>`).join("")}</div>
      ${p.wartend.length ? `<small class="leise">Vorgemerkt: ${p.wartend.map((id) => esc(P.nameVon(raum, p, id))).join(", ")}</small>` : ""}
      <div class="partie-knoepfe">${knoepfe}</div>
    </div>`;
}

function partieBild(p, sp, ich) {
  const nm = P.namen(raum, p);
  const leitet = P.darfLeiten(p, meineId, zeigeSteuer()) || padIds().includes(P.leiter(p));
  const offen = offenFuerMich();
  // Partybrett: das Hauptmenue ersetzt die Sammelseite
  if (p.phase === "sammeln" && sp.id === "brett") {
    hmKontext = { p, raum, nm, meineId, leitet, ort: "handy", link: raumLinkText(), admin: zeigeSteuer(), senden: (a) => senden({ ...a, p: p.pid }), neu: zeichnen,
      qr: () => qrZeigen(document.querySelector(".hm [data-qr]")), zusatz: padLeiste(p, sp) + stvSammeln(p) };
    return `${gastgeberHinweis()}${HM.html(hmKontext)}`;
  }
  let inhalt;
  if (p.phase === "sammeln") inhalt = sammelBild(p, sp, nm, ich, leitet);
  else if (ich < 0 && !p.mit.some(istLokal)) inhalt = zuschauBild(p, sp, nm);
  else {
    try { inhalt = sp.render(p.s, ich, nm, raum) + padMinis(p, sp, nm) + padDuell(p, sp, nm); if (P.ohneTrinken(raum, p)) inhalt = ohneAlkohol(inhalt); }
    catch (e) { console.error(e); rettungKaputt.add(p.pid); inhalt = `<p class="fehler">Anzeigefehler: ${esc(e.message)}</p>`; }
    // Spielzuege warten die Erklaerung ab (ausfuehren) - darum ist das Spiel darunter sichtbar gesperrt, statt Tipps still zu schlucken
    if (ER.offen(p, jetztGastgeber())) { inhalt = ER.handyHTML(sp, p, jetztGastgeber(), leitet, knopf) + ER.gesperrt(inhalt); erklNachziehen(p); }
    if (P.istWeg(p, meineId) && ich === p.mit.indexOf(meineId)) inhalt = `<div class="weg-sperre">${inhalt}</div>`;
    if (leitet && p.wartend.length) inhalt = `<div class="hinweisbox vorgemerkt">📌 ${p.wartend.length === 1 ? "1 wartet" : `${p.wartend.length} warten`} auf die nächste Runde: ${p.wartend.map((id) => esc(P.nameVon(raum, p, id))).join(", ")}
      ${sp.einlassen ? p.wartend.map((id) => knopf(`🙋 ${esc(P.nameVon(raum, p, id))} jetzt einsteigen lassen`, { typ: "_einlassen", id }, "gruen einlassen")).join("") : ""}
      ${knopf("🔄 Neue Runde mit allen", { typ: "_neuauf" }, "gelb")}</div>${inhalt}`;
  }
  return `${gastgeberHinweis()}
    <div class="kopf"><span>${sp.emoji} ${nameHTML(sp.name)}${p.phase === "laeuft" && P.ohneTrinken(raum, p) ? ` <small class="ohne-marke" title="ohne Trinken">🧃</small>` : ""}</span>
      <span class="kopfknoepfe"><button class="klein2 ${offen ? "tw-blinkt" : ""}" data-tt-auf title="Turniertafel">🏆 ${offen ? `⚔️ ${offen}` : rundenUhr() || "Tafel"}</button>
      <button class="klein2" data-ansicht="">‹ Übersicht</button>
      ${leitet && sp.id === "brett" && p.s && p.s.runden === 0 && !p.s.ende && p.s.phase !== "bonus" ? `<button class="klein2" data-a='{"typ":"_brettende"}'>🏁 Auswerten</button>` : ""}
      ${leitet && sp.id === "brett" && p.phase === "laeuft" && p.s && !p.s.ende ? `<button class="klein2" data-a='{"typ":"_brettspeichern"}' title="Spielstand speichern">💾</button>` : ""}
      ${endeKnoepfe(p, leitet)}${vollbildKnopf()}</span></div>
    ${endeFragen(p)}${wegHinweis(p)}${fuerHinweis(p, sp, nm)}
    <div class="spielflaeche" data-spiel="${esc(sp.id)}"${sp.weich !== false ? " data-weich" : ""}>${inhalt}</div>
    ${stvLeiste(p, nm, ich)}
    ${padLeiste(p, sp)}
    <div class="fuss">${p.mit.map((id, i) => { const s = raum.spieler.find((x) => x.id === id); return `<span class="pille ${(!s || s.online) && !P.istWeg(p, id) ? "" : "aus"}"><span class="farbe f${farbeVon(p, id)}"></span>${esc(nm[i])}${P.istBot(id) ? "" : schilder(nm[i], id)}${padMarke(id)}${P.istWeg(p, id) ? " 🚪" : ""}${id === meineId ? " (du)" : ""}</span>`; }).join("")}</div>
    ${spielHilfe(p)}`;
}
// Verlassen statt "Beenden fuer alle" (Nico 13.11.2026). Beim Sammeln schliesst weiter, wer das Spiel aufgemacht hat. Laeuft es:
// - jeder Mitspieler: "Verlassen" (ein Computer spielt weiter oder der Platz bleibt stehen; "Wieder mitmachen" holt ihn zurueck)
// - der letzte Mensch im Spiel: Nachfrage, denn damit endet das Spiel
// - nur die Spielleitung: "Beenden" fuer alle, mit Nachfrage
function endeKnoepfe(p, leitet) {
  if (p.phase !== "laeuft") return leitet ? `<button class="klein2" data-a='{"typ":"_zurueck"}'>⏹️ Beenden</button>` : "";
  const drin = p.mit.includes(meineId) && !P.istWeg(p, meineId);
  return `${drin ? `<button class="klein2" data-verlassen="${esc(p.pid)}">🚪 Verlassen</button>` : ""}${zeigeSteuer() ? `<button class="klein2" data-alle-ende="${esc(p.pid)}" title="Spiel für alle beenden">⏹️ Beenden</button>` : ""}`;
}
function endeFragen(p) {
  if (p.phase !== "laeuft") return "";
  if (alleEndeFrage === p.pid && zeigeSteuer()) return `<div class="hinweisbox warten endefrage"><b>Spiel für alle beenden?</b><div class="raster2"><button class="klein2 rot" data-a='{"typ":"_zurueck"}'>Ja, für alle beenden</button><button class="klein2" data-alle-ende="">Doch nicht</button></div></div>`;
  if (verlassenFrage === p.pid) return `<div class="hinweisbox warten endefrage"><b>Du bist der Letzte im Spiel – wenn du gehst, ist es beendet.</b><div class="raster2"><button class="klein2 rot" data-verlassen-ja="${esc(p.pid)}">Ja, Spiel beenden</button><button class="klein2" data-verlassen="">Doch nicht</button></div></div>`;
  return "";
}
// Der Spieler am Zug ist raus oder nicht verbunden (Spiele mit fester Reihenfolge und ohne Computer): damit die Runde nicht
// haengt, darf jeder Mitspieler fuer genau diesen Zug fuer ihn druecken. Technisch ein Stellvertreter auf Zeit (stvMein):
// das Geraet zeigt das Spiel aus seiner Sicht; ist sein Zug vorbei, springt es von selbst zurueck (fuerPruefen).
function fuerWen(p, sp) {
  if (p.phase !== "laeuft" || !p.s || !p.mit.some(istLokal)) return null;
  const j = dranVon(p, sp);
  if (!Number.isInteger(j) || j < 0 || j >= p.mit.length) return null;
  const id = p.mit[j];
  if (P.istBot(id) || istLokal(id)) return null;
  const s = raum.spieler.find((x) => x.id === id);
  const weg = P.istWeg(p, id);
  return weg || (s && !s.online) ? { id, j, weg } : null;
}
function fuerHinweis(p, sp, nm) {
  const f = fuerWen(p, sp);
  if (!f) return "";
  return `<div class="hinweisbox warten fuerbox">${f.weg ? `🚪 ${esc(nm[f.j])} ist dran, hat das Spiel aber verlassen.` : `📵 ${esc(nm[f.j])} ist dran, aber gerade nicht verbunden.`}
    <button class="klein2 gruen" data-stv-fuer="${esc(f.id)}">🤝 Für ${esc(nm[f.j])} drücken</button></div>`;
}
function fuerPruefen(p, sp) {
  if (!fuerAuto) return;
  const j = fuerAuto.pid === p.pid && p.phase === "laeuft" ? dranVon(p, sp) : null;
  if (Number.isInteger(j) && p.mit[j] === fuerAuto.id) return;   // sein Zug laeuft noch
  if (stvWahl === fuerAuto.id) stvWahl = null;
  if (fuerAuto.neu && stvMein.includes(fuerAuto.id)) { stvMein = stvMein.filter((x) => x !== fuerAuto.id); stvMerken(); }
  fuerAuto = null;
}
function wegHinweis(p) {
  if (p.phase !== "laeuft" || !P.kannZurueck(p, meineId)) return "";
  return `<div class="hinweisbox warten wegbox">🚪 Du hast das Spiel verlassen.${P.istWeg(p, meineId) ? "" : " Ein Computer spielt für dich weiter."} ${knopf("🙋 Wieder mitmachen", { typ: "_mit" }, "klein2 gruen")}</div>`;
}
function spielVerlassen(pid) {
  verlassenFrage = null;
  senden({ typ: "_verlassen", p: pid });
  if (ansicht === pid) { ansicht = null; ansichtMerken(); }
  hinweis("🚪 Du bist raus – über „Laufende Spiele“ kommst du wieder rein");
  zeichnen(); window.scrollTo(0, 0);
}

// Erklaer-Einblendung: nach Ablauf einmal neu zeichnen, damit sie verschwindet
let erklTimer = null;
function erklNachziehen(p) {
  if (erklTimer) return;
  erklTimer = setTimeout(() => { erklTimer = null; zeichnen(); }, Math.max(200, p.erkl - jetztGastgeber() + 150));
}
// Unter jedem Spiel: "Geht nicht" und "Platz uebergeben" (Vorschlaege 130 und 7)
function spielHilfe(p) {
  const dabei = p.mit.includes(meineId);
  const frei = gaeste().filter((x) => x.online && x.id !== meineId && !p.mit.includes(x.id));
  const platz = platzAuf !== p.pid ? "" : `<div class="platzwahl"><p class="leise klein">Wer spielt auf deinem Platz weiter? Punkte, Figur und Zug gehen mit.</p>
    ${frei.length ? `<select id="rf-platz" aria-label="Neuer Spieler">${frei.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>
      ${knopf("🔁 Platz übergeben", { typ: "_platz" }, "gelb", `data-feld="rf-platz"`)}`
    : `<p class="hinweisbox warten">Gerade ist niemand frei. Wer übernehmen soll, muss zuerst dem Raum beitreten.</p>`}</div>`;
  return `<div class="spielhilfe"><button class="klein2" data-geht-nicht>⚠️ Geht nicht</button>${dabei ? `<button class="klein2" data-platz-auf="${esc(p.pid)}">🔁 Platz abgeben</button>${dranSchalter()}` : ""}</div>${platz}`;
}

let hmKontext = null;   // gesetzt, solange das Hauptmenue des Partybretts zu sehen ist
function sammelBild(p, sp, nm, ich, leitet) {
  const liste = p.mit.map((id, j) => `<li class="sp an ${P.istBot(id) ? "bot" : ""}"><span class="farbe f${farbeVon(p, id)}"></span>${esc(nm[j])}${P.istBot(id) ? "" : schilder(nm[j], id)}${padMarke(id)}
      ${j === 0 ? ` <span class="leise">(startet)</span>` : ""}${id === meineId ? ` <span class="leise">(du)</span>` : ""}
      ${P.istBot(id) && leitet ? `<span class="rechts">${knopf("✕", { typ: "_botweg", id }, "klein2")}</span>` : ""}</li>`).join("");
  return `<div class="frage">Wer macht mit?</div>
    <p class="mitte leise">${esc(sp.kurz)}</p>
    <ul class="spieler">${liste}</ul>
    ${ich < 0 ? knopf("🙋 Mitmachen", { typ: "_mit" }, "gross gruen") : ich > 0 ? knopf("Doch nicht", { typ: "_raus" }, "zweit") : ""}
    ${leitet && sp.bot ? knopf("🤖 Computer-Mitspieler dazu", { typ: "_botneu" }, "zweit") : ""}
    ${trinkWahl(p, leitet)}
    ${wandWahl(p, sp, leitet)}
    ${stvSammeln(p)}
    ${leitet ? knopf(`▶️ Los geht's (${p.mit.length} ${p.mit.length === 1 ? "Spieler" : "Spieler"})`, { typ: "_los" }, "gross", `data-klang="los"`)
      : `<div class="hinweisbox warten">${esc(nm[0])} startet, sobald alle dabei sind …</div>`}`;
}

// Mit oder ohne Trinken - je Spiel beim Start (Nico 31.10.2026, Punkt 7). Die Spielleitung waehlt, alle sehen die Wahl.
function trinkWahl(p, leitet) {
  const ohne = P.ohneTrinken(raum, p);
  const text = ohne ? "🧃 Ohne Trinken: statt Schlucken gibt es Strafpunkte oder kleine Aufgaben" : "🍺 Mit Trinken";
  if (!leitet) return `<p class="mitte leise klein trinkwahl-info">${text}</p>`;
  return `<div class="trinkwahl"><div class="raster2">${knopf("🍺 Mit Trinken", { typ: "_ohne", ohne: false }, ohne ? "zweit" : "gewaehlt")}${knopf("🧃 Ohne Trinken", { typ: "_ohne", ohne: true }, ohne ? "gewaehlt" : "zweit")}</div>
    <p class="mitte leise klein">${ohne ? "Statt Schlucken: Strafpunkte oder kleine Aufgaben." : `Vorbelegt mit dem Raum-Schalter${raum.ohneAlkohol ? " (ohne Alkohol)" : ""} – gilt nur für dieses Spiel.`}</p></div>`;
}

// Auf dem Beamer zeigen oder nicht - je Spiel beim Start (Nico 07.11.2026), Vorgabe: auf dem Beamer. Nur Spiele, die die
// Wand ueberhaupt gross zeigen (BS.BEAMER_SPIELE). Ohne Beamer bleibt die Wand bei Diashow/bisherigem Bild.
function wandWahl(p, sp, leitet) {
  if (!BS.BEAMER_SPIELE.includes(sp.id)) return "";
  const an = p.wand !== false;
  const text = an ? "📽️ Läuft auf dem Beamer" : "🙈 Nicht auf dem Beamer – die Wand zeigt weiter die Diashow";
  if (!leitet) return `<p class="mitte leise klein wandwahl-info">${text}</p>`;
  return `<div class="trinkwahl wandwahl"><div class="raster2">${knopf("📽️ Auf dem Beamer", { typ: "_wand", an: true }, an ? "gewaehlt" : "zweit")}${knopf("🙈 Nicht auf dem Beamer", { typ: "_wand", an: false }, an ? "zweit" : "gewaehlt")}</div>
    <p class="mitte leise klein">${an ? "Die Wand zeigt das Spiel groß." : "Die Wand zeigt weiter die Diashow – nur die Handys spielen."}</p></div>`;
}

function zuschauBild(p, sp, nm) {
  const mitten = P.mittendrin(p.spiel);
  const wartet = p.wartend.includes(meineId);
  return `<div class="frage">${sp.emoji} ${esc(sp.name)} läuft gerade</div>
    <p class="mitte">Dabei: ${nm.map((n) => `<b>${esc(n)}</b>`).join(", ")}</p>
    ${p.spiel === "brett" && p.s ? BR.wettHTML(p.s, nm, (p.wetten || {})[meineId], p.wetten) : ""}
    ${mitten ? knopf("🙋 Mitmachen", { typ: "_mit" }, "gross gruen")
      : wartet ? `<div class="hinweisbox warten">✓ Vorgemerkt – du bist in der nächsten Runde dabei.</div>${knopf("Doch nicht", { typ: "_raus" }, "zweit")}`
      : `<p class="mitte leise">Mittendrin einsteigen geht bei diesem Spiel nicht. Die nächste Runde startet ${esc(nm[0])}.</p>${knopf("📌 Für nächste Runde vormerken", { typ: "_mit" }, "gross")}`}`;
}

// Kleine Karte in der Uebersicht: fuehrt zur Steuerseite
function steuerKarte() {
  const m = B.modus(B.steuer(raum), jetztGastgeber());
  return `<div class="karte steuerkarte">
      <h2>🛠️ Steuerung</h2>
      <p class="leise klein">Nur für die Spielleitung sichtbar. ${beamerZahl() ? `📽️ Beamer verbunden · ${m.art === "fest" ? "steht auf " + esc(B.seiteName(m.seite)) : m.art === "aus" ? "Diashow aus" : "Diashow läuft"}` : "Kein Beamer verbunden."}</p>
      <button class="gross" data-steuer-auf>📽️ Steuerseite öffnen</button>
      <p class="leise klein">Beamer, Diashow, Glücksrad und Joker, Spiel für alle, Aussehen, Testkonten${raum.look === "halloween" ? ", Schreckmoment" : ""}</p>
    </div>`;
}
const beamerZahl = () => Object.keys(anwesend || {}).filter((k) => k.startsWith("beamer-")).length;
const beamerLink = () => `${BASIS}#r=${code}&beamer`;
// Beamer koppeln (Runde 3): Zahl vom Beamer -> dessen Kennung lesen -> Gastgeber gibt Steuerrechte -> Beamer springt in den Raum
let koppeltGerade = false, koppelMeldung = "";
async function beamerKoppeln(knopfEl) {
  if (koppeltGerade || !raum || !binAdmin()) return;
  const f = document.getElementById("rf-kopplung");
  const zahl = f ? f.value.replace(/\D/g, "") : "";
  if (!KOPPLUNG.zahlGueltig(zahl)) { hinweis("Bitte die vierstellige Zahl vom Beamer eintippen"); return; }
  koppeltGerade = true;
  if (knopfEl) knopfEl.disabled = true;
  try {
    const id = await KOPPLUNG.beamerVon(zahl);
    if (!id) { TON.spiele("falsch"); hinweis("Kein Beamer mit dieser Zahl – bitte die Zahl am Beamer prüfen"); return; }
    senden({ typ: "_koppeln", beamer: id });
    await KOPPLUNG.zuweisen(zahl, code);
    if (f) f.value = "";
    vibriere(40); TON.spiele("richtig");
    // steht im Koppeln-Feld, nicht als Streifen ueber den Knoepfen
    koppelMeldung = "✓ Beamer gekoppelt – er kommt gleich in diesen Raum";
    zeichnen();
    setTimeout(() => { koppelMeldung = ""; if (steuerAuf) zeichnen(); }, 6000);
  } catch (e) { console.warn(e); hinweis("Koppeln hat nicht geklappt – Internet prüfen und noch einmal"); }
  finally { koppeltGerade = false; if (knopfEl && knopfEl.isConnected) knopfEl.disabled = false; }
}

// Ablauf: oben auf der Steuerseite, was man in Sekunden braucht; Spielplan und Protokoll darunter
let planAuf = false, protokollAuf = false;
function steuerAblauf() {
  const spiele = GRUPPEN.flatMap((g) => g.ids).map(spiel).filter(Boolean), liste = wache ? wache.protokollListe() : [];
  const n = (raum.plan || []).length;
  return `<div class="karte steuerseite steuer-ablauf">
      <h2>🧭 Ablauf</h2>
      ${SL.schnellHTML(raum, meineId, knopf, { frageAttr: "data-rueck-frage", frage: rueckFrage })}
      <details class="plan-auf" ${planAuf ? "open" : ""}><summary>⏰ Spielplan${n ? ` (${n})` : ""}</summary>${SL.planHTML(raum, knopf, spiele, spiel)}</details>
      <details class="protokoll-auf" ${protokollAuf ? "open" : ""}><summary>📜 Protokoll${liste.length ? ` (${liste.length})` : ""}</summary>${SL.protokollHTML(liste)}</details>
    </div>`;
}

// Steuerseite oben: was gerade brennt. Meldungen stehen offen da, die Gaesteliste (bis 30) ist aufklappbar, die Zaehlung nicht.
let gaesteAuf = false;
function steuerGaeste() {
  if (!wache) wacheStarten();
  const zahl = { gruen: 0, gelb: 0, rot: 0, ohne: 0 };
  raum.spieler.forEach((sp) => { zahl[wache.stand(sp)]++; });
  const knoepfe = (sp) => {
    if (sp.id === meineId || istPadId(sp.id)) return "";
    const an = stvMein.includes(sp.id), sitzt = Object.values(raum.partien).some((p) => p.mit.includes(sp.id));
    return `<button class="klein2 ${an ? "gewaehlt" : ""}" data-stv-um="${esc(sp.id)}">🤝 ${an ? "Du drückst" : "Mitdrücken"}</button>${sp.stv && !sitzt ? knopf("✕", { typ: "_stvweg", id: sp.id }, "klein2", `aria-label="${esc(sp.name)} entfernen"`) : ""}`;
  };
  return `<div class="karte steuerseite steuer-gaeste">
      <h2>🚦 Gäste und Verbindung</h2>
      ${wache.meldungenHTML("data-meldung-ok")}
      <details class="gaeste-auf" ${gaesteAuf ? "open" : ""}><summary><span class="ampelzahl">🟢 ${zahl.gruen}</span><span class="ampelzahl">🟡 ${zahl.gelb}</span><span class="ampelzahl">🔴 ${zahl.rot}</span>${zahl.ohne ? `<span class="ampelzahl">🤝 ${zahl.ohne}</span>` : ""}</summary>
        ${wache.gaesteHTML(raum, knoepfe)}
        <p class="leise klein">Grün: gut verbunden. Gelb: wackelt. Rot: weg. Den Akku zeigen nur manche Handys, iPhones zum Beispiel nicht.</p>
        <h3 class="tt-unter">🤝 Gast ohne Handy</h3>
        <p class="leise klein">Du drückst an deinem Handy für ihn mit. Unter dem Spiel wählst du, für wen du gerade spielst.</p>
        <div class="koppeln-zeile"><input id="rf-stvname" maxlength="${NAME_MAX}" autocomplete="off" placeholder="Name" aria-label="Name des Gastes"><button class="gruen" data-stv-neu>Dazu</button></div>
      </details>
    </div>
    ${steuerNotfall()}`;
}
// Notfall je laufendem Spiel: Spiel retten, und Platz uebergeben fuer jemanden, dessen Handy schon aus ist
function steuerNotfall() {
  const laufend = P.liste(raum).filter((p) => p.phase === "laeuft");
  if (!laufend.length) return "";
  return `<div class="karte steuerseite steuer-notfall"><h2>🛟 Notfall</h2>
    <p class="leise klein">Hängt ein Spiel, geht es zum letzten funktionierenden Stand zurück. Noch einmal drücken geht weiter zurück. Punkte in der Gesamtwertung bleiben.</p>
    ${laufend.map((p) => {
      const sp = spiel(p.spiel);
      if (!sp) return "";
      const nm = P.namen(raum, p), sitze = p.mit.filter((id) => !P.istBot(id)), frei = gaeste().filter((x) => !p.mit.includes(x.id));
      return `<div class="notfall" data-pid="${esc(p.pid)}"><b>${sp.emoji} ${esc(sp.name)}</b>
        ${rettenFrage === p.pid ? `<div class="raster2">${knopf("Ja, zurücksetzen", { typ: "_retten", p: p.pid }, "rot")}<button class="zweit" data-retten-frage="">Doch nicht</button></div>`
          : `<button class="gelb" data-retten-frage="${esc(p.pid)}">🛟 Spiel retten</button>`}
        ${frei.length ? `<details class="platz-fremd"><summary>🔁 Platz übergeben</summary>
          <label>Wer geht<select id="rf-pw-${esc(p.pid)}">${sitze.map((id) => `<option value="${esc(id)}">${esc(nm[p.mit.indexOf(id)])}</option>`).join("")}</select></label>
          <label>Wer übernimmt<select id="rf-pa-${esc(p.pid)}">${frei.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>
          ${knopf("🔁 Übergeben", { typ: "_platz", p: p.pid }, "gelb", `data-felder="rf-pw-${esc(p.pid)},rf-pa-${esc(p.pid)}"`)}</details>` : ""}</div>`;
    }).join("")}</div>`;
}

// Die Steuerseite der Spielleitung (Nico 26.10.2026): alles, was den Raum und den Beamer betrifft, am Handy bedienbar
function steuerBild() {
  const schalter = (typ, an, titel, text, mehr = "") => `<div class="schalter" data-a='${JSON.stringify({ typ, ...(mehr || {}) })}'><input type="checkbox" ${an ? "checked" : ""} tabindex="-1"><span>${titel}<br><small class="leise">${text}</small></span></div>`;
  const bm = (was, mehr = {}) => ({ typ: "_beamer", was, ...mehr });
  const st = B.steuer(raum), jetzt = jetztGastgeber(), m = B.modus(st, jetzt), da = B.verfuegbar(raum);
  const n = beamerZahl();
  const uhrzeit = (t) => new Date(t - jetzt + Date.now()).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const zustand = m.art === "fest" ? `📌 Steht auf <b>${esc(B.seiteName(m.seite))}</b> bis ${uhrzeit(m.bis)} – danach wieder Diashow`
    : m.art === "aus" ? "⏸️ Diashow aus – der Beamer bleibt auf der aktuellen Seite" : `▶️ Diashow läuft – alle ${st.dauer} s die nächste Seite mit Inhalt`;
  const link = beamerLink();
  const spieleWahl = GRUPPEN.flatMap((g) => g.ids).map(spiel).filter(Boolean);
  return `${gastgeberHinweis()}
    <div class="kopf"><span>🛠️ Steuerseite</span><button class="klein2" data-steuer-zu>‹ Übersicht</button></div>
    ${steuerGaeste()}
    ${steuerAblauf()}
    <div class="karte steuerseite">
      <h2>📽️ Beamer</h2>
      <p class="${n ? "ok" : "leise"}">${n ? `✓ ${n === 1 ? "Ein Beamer ist" : `${n} Beamer sind`} verbunden` : "Noch kein Beamer verbunden."}</p>
      <div class="koppeln">
        <h3 class="tt-unter">🔗 Beamer koppeln</h3>
        <p class="leise klein">Am Gerät am Beamer das Lesezeichen <b>…/partyspiele/#beamer</b> öffnen. Dort steht eine große vierstellige Zahl – hier eintippen. Der Beamer kommt in diesen Raum und darf sofort steuern (mit der Maus).</p>
        <div class="koppeln-zeile"><input id="rf-kopplung" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="z. B. 4821" aria-label="Zahl vom Beamer"><button class="gruen" data-koppeln>Koppeln</button></div>
        ${koppelMeldung ? `<p class="ok" role="status">${esc(koppelMeldung)}</p>` : ""}
      </div>
      <p class="leise klein">Oder diesen Link am Gerät am Beamer öffnen (Browser, Vollbild). Der Beamer ist kein Spieler und zählt nicht als Gast.</p>
      <div class="linkzeile" data-beamer-link="${esc(link)}">${esc(link)}</div>
      <div class="raster2"><button data-teilen="${esc(link)}">🔗 Link teilen</button><a class="knopf-link" href="${esc(link)}" target="_blank" rel="noopener">📽️ Hier öffnen</a></div>
    </div>
    ${steuerSpielansicht(bm)}
    <div class="karte steuerseite">
      <h2>🖼️ Diashow</h2>
      ${schalter("_beamer", st.diashow, "Diashow an", "wechselt von selbst durch alle Seiten mit Inhalt", { was: "diashow" })}
      <p class="steuerzustand">${zustand}</p>
      ${m.art === "fest" ? knopf("▶️ Zurück zur Diashow", bm("seite", { seite: null }), "zweit gruen") : ""}
      <h3 class="tt-unter">Sekunden je Seite</h3>
      <div class="raster4">${B.DAUERN.map((s) => knopf(`${s} s`, bm("dauer", { s }), st.dauer === s ? "gewaehlt" : "")).join("")}</div>
      <h3 class="tt-unter">Seite zeigen (bleibt 30 Min. stehen)</h3>
      <div class="raster2 seitenwahl">${B.SEITEN.map((s) => knopf(`${s.emo} ${esc(s.name)}${da.includes(s.id) ? "" : `<small>noch leer</small>`}`, bm("seite", { seite: s.id }), m.art === "fest" && m.seite === s.id ? "gewaehlt" : "")).join("")}</div>
      ${knopf("✋ Ereignis am Beamer ausblenden", bm("weg"), "zweit")}
      ${schalter("_beamer", st.geteilt, "◧ Wand teilen", "läuft ein Spiel an der Wand: links das Spiel, rechts die Abendwertung", { was: "geteilt" })}
      ${schalter("_beamer", !st.ruhig, "📳 Wackeln und Blitz am Brett", "Sternkauf, Diebstahl, Vulkanausbruch, Bankraub kurz groß zeigen", { was: "ruhig" })}
      ${raum.look === "halloween" ? `${knopf("😱 Schreckmoment!", bm("schreck"), "gross rot schreckknopf", `data-klang="kichern"`)}
        <p class="leise klein">Am Beamer erscheint 2–3 Sekunden ein Gruselgesicht mit Schrei. Nur im Halloween-Aussehen.</p>` : ""}
    </div>
    ${steuerGlueck(schalter)}
    ${steuerBrett()}
    <div class="karte steuerseite">
      <h2>🎮 Spiel für alle starten</h2>
      <p class="leise klein">Alle, die gerade verbunden sind, sind sofort dabei. Du startest dann mit „Los“.</p>
      <label>Spiel<select id="rf-alle">${spieleWahl.map((sp) => `<option value="${esc(sp.id)}">${sp.emoji} ${esc(sp.name)}</option>`).join("")}</select></label>
      ${knopf("🚀 Für alle starten", { typ: "_alle" }, "gross gruen", `data-feld="rf-alle" data-klang="los"`)}
    </div>
    <div class="karte steuerseite steuerkarte-raum">
      <h2>⚙️ Raum</h2>
      <h3 class="tt-unter">Aussehen</h3>
      <div class="raster3 looks">${Object.entries(A.LOOKS).map(([k, l]) => knopf(`${l.emoji} ${esc(l.name)}`, { typ: "_look", look: k }, raum.look === k ? "gewaehlt" : "")).join("")}</div>
      ${schalter("_testkonten", K.testkontenAn(raum), "🧪 Testkonten erlaubt", "Namen mit „test“ spielen mit, zählen aber nirgends in die Wertung – am Partyabend ausschalten")}
      ${schalter("_ab18", raum.ab18, "🔞 Alle hier sind über 18", "schaltet die Kategorien Spicy und 18+ frei")}
      ${schalter("_trink", raum.ohneAlkohol, "🧃 Ohne Alkohol spielen", "statt Schlucken gibt es Strafpunkte")}
      ${knopf("🔁 Fragen wieder von vorn", { typ: "_fragenneu" }, "zweit fragen-neu")}
      <p class="leise klein">Quizfragen kommen sonst über alle Abende nur einmal dran. Vor der Party einmal drücken, dann zählen Testrunden nicht mit.${raum.fragenNeuAm ? ` Zuletzt: ${new Date(raum.fragenNeuAm).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
      ${knopf("Steuerrechte abgeben", { typ: "_adminweg" }, "zweit")}
      ${endeKnopf()}
    </div>`;
}
// Spielansicht am Beamer (Schritt D): welches Spiel die Wand gerade zeigt, ausblenden (zurueck zur Diashow), wieder zeigen
function steuerSpielansicht(bm) {
  const g = BS.gezeigt(raum, jetztGastgeber());
  const aus = BS.ausgeblendet(raum);
  const weg = P.liste(raum).filter((p) => aus.includes(p.pid) && p.phase === "laeuft" && BS.BEAMER_SPIELE.includes(p.spiel));
  const name = (p) => { const sp = spiel(p.spiel); return sp ? `${sp.emoji} ${esc(sp.name)}` : ""; };
  const welche = BS.BEAMER_SPIELE.map(spiel).filter(Boolean).map((sp) => esc(sp.name)).join(", ");
  return `<div class="karte steuerseite steuer-spiel">
      <h2>🎮 Spiele am Beamer</h2>
      ${g ? `<p class="steuerzustand">📽️ Der Beamer zeigt gerade: <b>${name(g.p)}</b></p>
        ${knopf("🙈 Spielansicht ausblenden – zurück zur Diashow", bm("spielaus", { pid: g.p.pid }), "zweit")}`
      : `<p class="leise klein">Läuft ${welche}, zeigt der Beamer das Spiel groß und danach kurz das Ergebnis.</p>`}
      ${weg.map((p) => knopf(`👁️ ${name(p)} wieder am Beamer zeigen`, bm("spielan", { pid: p.pid }), "zweit gruen")).join("")}
    </div>`;
}

// Gluecksrad auf der Steuerseite: sperren/freigeben, fuer jemanden drehen, Joker geben, Felder an/aus, eigene Felder
function steuerGlueck(schalter) {
  const g = G.sicher(JSON.parse(JSON.stringify({ glueck: raum.glueck || null }))), jetzt = jetztGastgeber();
  const gl = (was, mehr = {}) => ({ typ: "_glueck", was, ...mehr });
  const leute = gaeste().map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.online ? "" : " (weg)"}</option>`).join("");
  const nameVon = (id) => { const s = raum.spieler.find((x) => x.id === id); return s ? s.name : null; };
  const joker = Object.entries(g.joker).filter(([id, n]) => n > 0 && nameVon(id)).map(([id, n]) => `${esc(nameVon(id))} ${"🃏".repeat(Math.min(n, G.JOKER_MAX))}`);
  const erwischt = Object.entries(g.erwischt).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).map(([n, z]) => `${esc(n)} ${z}×`);
  const aufRad = G.felder(g).length;
  const l = g.lauf, laeuft = l && !l.fertig;
  return `<div class="karte steuerseite steuer-glueck">
      <h2>🎡 Glücksrad</h2>
      ${schalter("_glueck", g.frei, "Glücksrad freigegeben", "aus = Gäste können nicht drehen; du kannst unten trotzdem für jemanden drehen", { was: "frei" })}
      ${laeuft ? `<p class="steuerzustand">🎡 Dreht gerade für <b>${esc(l.name)}</b>${G.phase(l, jetzt) === "joker" ? " – Joker-Entscheidung läuft" : ""}</p>` : ""}
      <h3 class="tt-unter">Rad drehen für …</h3>
      <label>Gast<select id="rf-gfuer">${leute}</select></label>
      ${knopf("🎡 Rad drehen", gl("fuer"), "gross", `data-feld="rf-gfuer" data-klang="wuerfel"`)}
      <h3 class="tt-unter">Joker geben (höchstens ${G.JOKER_MAX} je Gast)</h3>
      <label>Gast<select id="rf-gjoker">${leute}</select></label>
      ${knopf("🃏 Joker geben", gl("joker"), "zweit", `data-feld="rf-gjoker"`)}
      <p class="leise klein">${joker.length ? `Joker: ${joker.join(" · ")}` : "Noch hat niemand einen Joker."}${erwischt.length ? `<br>Vom Rad erwischt: ${erwischt.slice(0, 8).join(" · ")}` : ""}</p>
      <h3 class="tt-unter">Felder auf dem Rad (${aufRad})</h3>
      <button class="gross gl-reiter-knopf" data-gl-reiter>📋 Alle ${G.ergebnisZahl()} möglichen Ergebnisse – ansehen und streichen${g.gestrichen.length ? `<small>${g.gestrichen.length} gestrichen</small>` : ""}</button>
      ${knopf(G.FELDER.filter((f) => f.trink).every((f) => g.aus.includes(f.id)) ? "🍺 Trink-Felder wieder an" : "🧃 Alle Trink-Felder aus", gl("trinkaus"), "zweit")}
      ${G.FELDER.map((f) => schalter("_glueck", !g.aus.includes(f.id), `${f.emo} ${esc(f.name)}`, `${f.trifft ? "trifft den Drehenden – Joker möglich" : "harmlos"}${f.pool ? ` · ${G.poolFrei(g, f).length} von ${G.VORRAT[f.pool].length} Aufgaben` : ""}`, { was: "feld", id: f.id })).join("")}
      ${g.eigene.map((e) => `<div class="schalter rad-eigen"><span>✏️ ${esc(e.name)}<br><small class="leise">${esc(e.text || "eigenes Feld")}</small></span>${knopf("✕", gl("eigenweg", { id: e.id }), "klein2", `aria-label="Feld entfernen"`)}</div>`).join("")}
      ${g.eigene.length < G.EIGENE_MAX ? `<h3 class="tt-unter">Eigenes Feld dazu</h3>
      <label>Name (steht auf dem Rad)<input id="rf-gname" maxlength="${G.NAME_MAX}" placeholder="z. B. Lied singen" autocomplete="off"></label>
      <label>Kurzer Text (optional)<input id="rf-gtext" maxlength="${G.TEXT_MAX}" placeholder="z. B. singt eine Strophe vor" autocomplete="off"></label>
      ${knopf("➕ Feld aufs Rad", gl("eigen"), "zweit", `data-felder="rf-gname,rf-gtext" data-leeren`)}` : `<p class="leise klein">Mehr als ${G.EIGENE_MAX} eigene Felder gehen nicht.</p>`}
      <p class="leise klein">Gäste dürfen alle ${G.SPERRE / 60000} Minuten drehen. Das Rad bringt keine Punkte – es zählt nur, wer wie oft erwischt wurde.</p>
    </div>`;
}

// Reiter "Alle Ergebnisse" des Gluecksrads (Nico 31.10.2026, Punkt 9): jede moegliche Aufgabe einzeln streichen
let glueckReiter = false;
function glueckListeBild() {
  const g = G.sicher(JSON.parse(JSON.stringify({ glueck: raum.glueck || null })));
  const gl = (was, mehr = {}) => ({ typ: "_glueck", was, ...mehr });
  const liste = G.ergebnisListe(g);
  const offen = liste.reduce((n, f) => n + (f.aus ? 0 : f.eintraege.filter((x) => !x.weg).length), 0);
  const zeile = (f, x) => {
    const a = x.ganz ? gl("feld", { id: f.feld }) : gl("streichen", { id: x.id });
    const weg = x.weg || f.aus;
    return `<div class="gl-eintrag ${weg ? "gestrichen" : ""}" data-a='${JSON.stringify(a).replace(/'/g, "&#39;")}'><input type="checkbox" ${weg ? "" : "checked"} tabindex="-1"><span>${esc(x.text)}</span></div>`;
  };
  return `${gastgeberHinweis()}
    <div class="kopf"><span>📋 Glücksrad: alle Ergebnisse</span><button class="klein2" data-gl-zu>‹ Steuerseite</button></div>
    <div class="karte steuerseite gl-liste">
      <p class="leise klein">${offen} von ${G.ergebnisZahl()} Ergebnissen sind drin. Antippen streicht oder nimmt wieder auf. Die Auswahl gilt sofort und dieses Gerät merkt sie sich für den nächsten Raum.</p>
      ${knopf(G.FELDER.filter((f) => f.trink).every((f) => g.aus.includes(f.id)) ? "🍺 Trink-Felder wieder an" : "🧃 Alle Trink-Felder aus", gl("trinkaus"), "zweit")}
      ${liste.map((f) => `<div class="gl-kopf"><h3>${f.emo} ${esc(f.name)}${f.aus ? " <small class=\"leise\">(Feld aus)</small>" : ""}</h3>
        ${f.eintraege.length > 1 ? knopf(f.eintraege.every((x) => x.weg) ? "alle wieder rein" : "alle streichen", gl(f.eintraege.every((x) => x.weg) ? "alleauf" : "allestreichen", { id: f.feld }), "klein2 zweit") : ""}</div>
        ${f.eintraege.map((x) => zeile(f, x)).join("")}`).join("")}
    </div>`;
}

// Partybrett auf der Steuerseite: Reiter mit allen Ereignissen des "?"-Felds (Nico 31.10.2026, Punkt 8)
function steuerBrett() {
  const liste = raum.brettWeg || [], weg = liste.filter((k) => !String(k).startsWith("m:")).length, miniWeg = liste.length - weg;
  return `<div class="karte steuerseite steuer-brett">
      <h2>🎲 Partybrett</h2>
      <p class="leise klein">Auf dem ❓-Feld wartet einer von ${BE.anzahl()} Zufällen, nach jeder Runde eins von ${BE.MINI_KENNUNGEN.length} Minispielen. Trink-Ereignisse kommen nur, wenn das Brett mit Trinken gespielt wird.</p>
      <button class="gross gl-reiter-knopf" data-br-reiter>📋 Alle ${BE.anzahl()} Ereignisse und ${BE.MINI_KENNUNGEN.length} Minispiele – ansehen und streichen${weg || miniWeg ? `<small>${[weg ? `${weg} Ereignisse` : "", miniWeg ? `${miniWeg} Minispiele` : ""].filter(Boolean).join(", ")} gestrichen</small>` : ""}</button>
    </div>`;
}
let brettReiter = false;
function brettListeBild() {
  const weg = new Set(raum.brettWeg || []);
  const offen = BE.EREIGNISSE.filter((x) => !weg.has(x.id)).length;
  const br = (was, mehr = {}) => ({ typ: "_brettweg", was, ...mehr });
  const zeile = (x) => `<div class="gl-eintrag ${weg.has(x.id) ? "gestrichen" : ""}" data-a='${JSON.stringify(br("streichen", { id: x.id })).replace(/'/g, "&#39;")}'><input type="checkbox" ${weg.has(x.id) ? "" : "checked"} tabindex="-1"><span>${esc(x.text)}</span></div>`;
  return `${gastgeberHinweis()}
    <div class="kopf"><span>📋 Partybrett: alle Ereignisse</span><button class="klein2" data-br-zu>‹ Steuerseite</button></div>
    <div class="karte steuerseite gl-liste br-liste">
      <p class="leise klein">${offen} von ${BE.anzahl()} Ereignissen sind drin. Antippen streicht oder nimmt wieder auf. Die Auswahl gilt sofort für alle Partybretter im Raum, und dieses Gerät merkt sie sich für den nächsten Raum.</p>
      ${weg.size ? knopf("Alle wieder rein", br("alleauf"), "zweit") : ""}
      ${BE.KATEGORIEN.map(([k, titel]) => { const l = BE.EREIGNISSE.filter((x) => x.kat === k); const alleWeg = l.every((x) => weg.has(x.id));
        return `<div class="gl-kopf"><h3>${titel} <small class="leise">(${l.filter((x) => !weg.has(x.id)).length}/${l.length})</small></h3>${knopf(alleWeg ? "alle wieder rein" : "alle streichen", br("kat", { kat: k }), "klein2 zweit")}</div>
        ${l.map(zeile).join("")}`; }).join("")}
      ${brettMiniListe(weg, br)}
    </div>`;
}
// Teil 4b (Nico 31.10.2026): Minispiele streichen wie die Ereignisse - gleiche Liste ("m:<Kennung>"), gleiche Merk-Ablage
function brettMiniListe(weg, br) {
  const ids = BE.MINI_KENNUNGEN, aus = ids.filter((id) => weg.has(`m:${id}`)).length;
  const zeile = (id) => { const info = BR.miniInfo(id) || { emo: "🎮", titel: id, typ: "" }, w = weg.has(`m:${id}`);
    return `<div class="gl-eintrag br-mini ${w ? "gestrichen" : ""}" data-a='${JSON.stringify(br("mini", { id })).replace(/'/g, "&#39;")}'><input type="checkbox" ${w ? "" : "checked"} tabindex="-1"><span>${info.emo} ${esc(info.titel)} <small class="leise">${esc(info.typ)}</small></span></div>`; };
  return `<div class="gl-kopf br-mini-kopf"><h3>🎮 Minispiele <small class="leise">(${ids.length - aus}/${ids.length})</small></h3>${aus ? knopf("alle wieder rein", br("minisauf"), "klein2 zweit") : ""}</div>
    <p class="leise klein">Gestrichene Minispiele kommen nach den Runden nicht mehr dran. Sind alle gestrichen, kommen wieder alle.</p>
    ${ids.map(zeile).join("")}`;
}

function endeKnopf() {
  return endeFrage
    ? `<div class="raster2">${knopf("Ja, Raum beenden", { typ: "_raumende" }, "rot")}<button data-ende-frage>Doch nicht</button></div>`
    : `<button class="zweit" data-ende-frage>🚪 Raum beenden (für alle)</button>`;
}
function codeKarte() {
  const k = K.meinSchluessel();
  return `<details class="karte codekarte" ${codeOffen ? "open" : ""}><summary>🔑 Spielleitung? Freischaltcode eingeben</summary>
      ${k ? `<p class="leise">Code ist eingegeben – das Gastgeber-Gerät schaltet dich frei, sobald dort die Spielleitung den Code eingegeben hat.</p>` : ""}
      <label>Freischaltcode<input id="rf-code" type="password" inputmode="numeric" autocomplete="off" maxlength="40" placeholder="nur für die Spielleitung"></label>
      ${codeFehler && codeFehler.feld === "rf-code" ? codeFehlerHTML("rf-code", codeFehler.gebremst) : ""}
      <button class="zweit" data-code>Freischalten</button>
      ${rolle === "gastgeber" ? endeKnopf() : ""}
    </details>`;
}

// Restzeit der Runde fuer Lobby-Knopf und Spielkopf (wird vom Sekundentakt weitergezaehlt)
function rundenUhr() {
  const w = raum && raum.tafel && raum.tafel.wertung;
  return w && w.runde && w.runde.ende ? `<span data-countdown="${w.runde.ende}">${W.uhrText(w.runde.ende - jetztGastgeber())}</span>` : "";
}
function tafelKnopfZusatz() {
  const w = raum && raum.tafel && raum.tafel.wertung;
  if (!w) return "";
  const offen = offenFuerMich();
  const teile = [];
  if (w.runde && w.runde.ende) teile.push(`Runde ${w.runde.nr} · ⏱️ ${rundenUhr()}`);
  if (w.pokal) teile.push(`🏆 ${esc(w.pokal.join(" & "))}`);
  return `${teile.length ? `<small>${teile.join(" · ")}</small>` : ""}${offen ? `<small class="tw-offen">⚔️ ${offen} ${offen === 1 ? "Bestätigung wartet" : "Bestätigungen warten"} auf dich</small>` : ""}`;
}

function tafelBild() {
  const info = {
    gastgeber: zeigeSteuer(), ohneAlkohol: !!raum.ohneAlkohol,
    meinName: meinTafelName(),
    namen: gaeste().filter((x) => !K.istTestkonto(raum, x.name)).map((x) => x.name),
    jetzt: jetztGastgeber(),
  };
  let inhalt;
  try { inhalt = TAFEL.render(raum.tafel, tafelAnsicht, info); }
  catch (e) { console.error(e); inhalt = `<p class="fehler">Anzeigefehler: ${esc(e.message)}</p>`; }
  return `${gastgeberHinweis()}
    <div class="kopf"><span>🏆 Turniertafel</span>
      <button class="klein2" data-tt-zu>${ansicht && raum.partien[ansicht] ? "Zurück zum Spiel" : "Zur Übersicht"}</button></div>
    <div class="spielflaeche tt">${inhalt}</div>`;
}

// ---------------------------------------------------------------- QR-Code (Bibliothek qrcode-generator, MIT, nur bei Bedarf geladen)
let qrLaden = null, qrBild = null;
function qrLib() {
  if (!qrLaden) {
    qrLaden = new Promise((ok, nein) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
      s.onload = () => (window.qrcode ? ok(window.qrcode) : nein(new Error("qrcode fehlt")));
      s.onerror = () => { qrLaden = null; nein(new Error("QR-Bibliothek nicht geladen")); };
      document.head.appendChild(s);
    });
  }
  return qrLaden;
}
async function qrZeigen(el) {
  if (!el) return;
  const link = el.dataset.qr;
  if (qrBild && qrBild.link === link) { el.innerHTML = qrBild.svg; return; }
  el.innerHTML = `<span class="leise klein">QR-Code wird erzeugt …</span>`;
  try {
    const q = await qrLib();
    const qr = q(0, "M");
    qr.addData(link);
    qr.make();
    qrBild = { link, svg: qr.createSvgTag(6, 2) };
    const ziel = document.querySelector("[data-qr]");
    if (ziel) ziel.innerHTML = qrBild.svg;
  } catch (e) { el.innerHTML = `<span class="leise klein">QR-Code geht gerade nicht – Link teilen reicht.</span>`; }
}
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!(d instanceof HTMLDetailsElement)) return;
  if (d.classList.contains("einladen")) { einladenOffen = d.open; if (d.open) qrZeigen(d.querySelector("[data-qr]")); }
  if (d.classList.contains("codekarte")) codeOffen = d.open;
  if (d.classList.contains("gaeste-auf")) gaesteAuf = d.open;
  if (d.classList.contains("plan-auf")) planAuf = d.open;
  if (d.classList.contains("protokoll-auf")) protokollAuf = d.open;
  if (d.classList.contains("codekarte") || d.classList.contains("codefeld")) { if (!d.open) codeFehlerWeg(); }
}, true);

// ---------------------------------------------------------------- Klicks
document.addEventListener("click", async (ev) => {
  // Vollbild braucht eine Geste: der Knopf im Spielkopf, dazu "Los", "Mitmachen" und das Oeffnen eines Spiels (Spielmodus oben)
  if (ev.target.closest("[data-vollbild]")) { vibriere(20); return vollbildAn(); }
  const start = ev.target.closest("[data-ansage-mit], [data-a*='\"_los\"'], [data-a*='\"_mit\"'], [data-ansicht]:not([data-ansicht=''])");
  if (start && raum) vollbildAn();
  const schalter = ev.target.closest("[data-ton-schalter]");
  if (schalter) { const t = TON.umschalten(); schalter.outerHTML = TON.schalterHTML(); zeigeHinweis(t); return; }
  // Turniertafel oeffnen, schliessen, Station wechseln: nur auf diesem Handy, nichts wird gesendet
  const tt = ev.target.closest("[data-tt-auf],[data-tt-zu],[data-tt-zeige],[data-tt-leeren-frage]");
  if (tt && raum) {
    vibriere(20); TON.spiele("klick");
    if (tt.dataset.ttAuf !== undefined) { tafelAuf = true; steuerAuf = false; tafelAnsicht = { station: null, modus: "liste", leeren: false }; }
    else if (tt.dataset.ttZu !== undefined) tafelAuf = false;
    else if (tt.dataset.ttLeerenFrage !== undefined) tafelAnsicht.leeren = !tafelAnsicht.leeren;
    else {
      const z = tt.dataset.ttZeige;
      tafelAnsicht = ["ehrung", "wertung", "pokal", "abend"].includes(z) ? { station: null, modus: z, leeren: false } : { station: z ? Number(z) : null, modus: "liste", leeren: false };
      const w = document.getElementById("tt-wert"); if (w) w.value = "";
    }
    zeichnen(); window.scrollTo(0, 0);
    return;
  }
  const el = ev.target.closest("[data-anlass],[data-zurueck],#beitreten,#weitermachen,[data-ansicht],[data-a],[data-teilen],[data-ansage-mit],[data-ansage-weg],[data-steuern],[data-code],[data-raum-neu],[data-uebernehmen],[data-ende-frage],[data-neu-laden],[data-steuer-auf],[data-steuer-zu],[data-gl-reiter],[data-gl-zu],[data-br-reiter],[data-br-zu],[data-ohne-code],[data-rad-hin],[data-padname],[data-padweg],[data-koppeln],[data-geht-nicht],[data-platz-auf],[data-stv-um],[data-stv-wahl],[data-stv-mit],[data-stv-neu],[data-retten-frage],[data-meldung-ok],[data-doppel],[data-neu-beitreten],[data-rueck-frage],[data-dran-ton],[data-raum-holen],[data-verlassen],[data-verlassen-ja],[data-alle-ende],[data-stv-fuer],[data-sprung],[data-gruppe]");
  if (!el) return;
  if (el.dataset.gesperrt !== undefined || el.dataset.zugsperre !== undefined) return;   // Ergebnis steht noch (ergebnisPruefen) / nicht am Zug (zugSperrePruefen)
  if (el.dataset.koppeln !== undefined) return beamerKoppeln(el);
  // ---- Verlaesslichkeit (Geburtstags-Runde A)
  if (el.dataset.gehtNicht !== undefined) { vibriere(40); return gehtNicht(); }
  if (el.dataset.platzAuf !== undefined) { platzAuf = platzAuf === el.dataset.platzAuf ? null : el.dataset.platzAuf; return zeichnen(); }
  if (el.dataset.stvUm) { stvUmschalten(el.dataset.stvUm); vibriere(20); return zeichnen(); }
  if (el.dataset.stvWahl) { stvWahl = el.dataset.stvWahl === meineId ? null : el.dataset.stvWahl; vibriere(20); TON.spiele("klick"); return zeichnen(); }
  if (el.dataset.stvMit) { vibriere(25); TON.spiele("klick"); return sendenAls(el.dataset.stvMit, { typ: "_mit", p: ansicht }); }
  if (el.dataset.stvNeu !== undefined) {
    const f = document.getElementById("rf-stvname"), name = f ? f.value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
    if (!name) { hinweis("Bitte einen Namen eintippen"); return; }
    const id = `stv-${zufallsText(10)}`;
    f.value = "";
    stvUmschalten(id);   // wer ihn anlegt, drueckt auch gleich fuer ihn
    return senden({ typ: "_stvneu", id, name });
  }
  if (el.dataset.rettenFrage !== undefined) { rettenFrage = el.dataset.rettenFrage || null; return zeichnen(); }
  if (el.dataset.rueckFrage !== undefined) { rueckFrage = !!el.dataset.rueckFrage; return zeichnen(); }
  if (el.dataset.dranTon !== undefined) {
    localStorage.setItem(DRAN_TON, dranTonAn() ? "aus" : "an");
    if (dranTonAn()) TON.spiele("dran");   // zum Probehoeren
    return zeichnen();
  }
  if (el.dataset.meldungOk) { if (wache) wache.erledigen(el.dataset.meldungOk); return; }
  if (el.dataset.doppel) {
    zurueckWunsch = el.dataset.doppel === "ja";
    doppelName = null;
    neuDabei = true;
    return gastBeitreten();
  }
  if (el.dataset.neuBeitreten !== undefined) { sessionStorage.removeItem(sitzKey(code)); return location.reload(); }
  // Controller umbenennen oder entfernen (nur dieses Geraet; der Spieler bleibt im Raum, wie ein Handy, das geht)
  if (el.dataset.padname !== undefined || el.dataset.padweg !== undefined) {
    const k = el.dataset.padname ?? el.dataset.padweg, pad = pads[k];
    if (!pad) return;
    if (el.dataset.padweg !== undefined) {
      delete pads[k]; padsMerken();
      if (netz) netz.anwesendWeg(pad.id);
      hinweis(`🎮 ${pad.name} entfernt`);
      return zeichnen();
    }
    const f = document.getElementById(`rf-padname-${pad.nr}`);
    const n = f ? f.value.replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
    if (!n) { hinweis("Bitte einen Namen eintippen"); return; }
    if (f) f.value = "";
    pad.name = n; padsMerken();
    padHallo(pad);
    return;
  }
  if (el.dataset.brReiter !== undefined || el.dataset.brZu !== undefined) {
    brettReiter = el.dataset.brReiter !== undefined; glueckReiter = false;
    if (brettReiter && !steuerAuf) { steuerAuf = true; tafelAuf = false; ansicht = null; ansichtMerken(); }
    vibriere(20); TON.spiele("klick"); zeichnen(); window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.glReiter !== undefined || el.dataset.glZu !== undefined) {
    glueckReiter = el.dataset.glReiter !== undefined; brettReiter = false;
    vibriere(20); TON.spiele("klick"); zeichnen(); window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.steuerAuf !== undefined || el.dataset.steuerZu !== undefined) {
    steuerAuf = el.dataset.steuerAuf !== undefined; tafelAuf = false; glueckReiter = false; brettReiter = false;
    if (steuerAuf) { ansicht = null; ansichtMerken(); }
    vibriere(20); TON.spiele("klick"); zeichnen(); window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.ohneCode !== undefined) {
    const f = document.getElementById("rf-freischalt");
    if (f) f.value = "";
    if (!namenLesen()) return;
    codeFehlerWeg();
    neuDabei = true;
    return gastBeitreten();
  }
  if (el.dataset.anlass) {
    if (!namenLesen()) return;
    const anlass = A.anlassNeu(el.dataset.anlass, (document.getElementById("rf-anlass") || {}).value);
    if (!anlass) { hinweis("Bitte den Anlass eintippen, z. B. Hüttenabend"); return; }
    if (!(await freischalten("rf-freischalt"))) return;
    vibriere(25); TON.spiele("klick");
    return raumOeffnen(anlass);
  }
  if (el.dataset.zurueck) { history.replaceState(null, "", `${BASIS}#r=${el.dataset.zurueck}`); return raumLink(el.dataset.zurueck); }
  if (el.id === "beitreten") {
    if (!namenLesen()) return;
    if (!(await freischalten("rf-freischalt"))) return;
    if (await doppelNameFragen()) return;
    neuDabei = true;
    return gastBeitreten();
  }
  if (el.id === "weitermachen") { namenLesen(); if (!(await freischalten("rf-freischalt"))) return; return gastgeberFortsetzen(); }
  if (el.dataset.raumNeu !== undefined) {
    if (netz) { netz.beenden(); netz = null; }
    rolle = null; raum = null; code = null; status = ""; ansicht = null; merker = {}; ersterStand = true;
    history.replaceState(null, "", BASIS);
    return startseite();
  }
  if (el.dataset.neuLaden !== undefined) return location.reload();
  if (el.dataset.uebernehmen !== undefined) return gastgeberFortsetzen();
  if (el.dataset.raumHolen !== undefined) { vibriere(40); return raumHolen(); }
  // Verlassen: der letzte Mensch im Spiel wird gefragt (dann endet es), alle anderen gehen sofort
  if (el.dataset.verlassen !== undefined) {
    const pv = el.dataset.verlassen && raum.partien[el.dataset.verlassen];
    alleEndeFrage = null;
    if (!pv) { verlassenFrage = null; return zeichnen(); }
    const rest = P.aktive(pv).filter((id) => id !== meineId);
    vibriere(25); TON.spiele("klick");
    if (!rest.length) { verlassenFrage = pv.pid; return zeichnen(); }
    return spielVerlassen(pv.pid);
  }
  if (el.dataset.verlassenJa) { vibriere(25); return spielVerlassen(el.dataset.verlassenJa); }
  // Uebersicht: zur Spielgruppe springen (klappt sie auf) oder eine Gruppe am Titel auf- und zuklappen
  if (el.dataset.sprung !== undefined || el.dataset.gruppe !== undefined) {
    const k = Number(el.dataset.sprung ?? el.dataset.gruppe), sprung = el.dataset.sprung !== undefined;
    if (sprung || gruppenZu.has(k)) gruppenZu.delete(k); else gruppenZu.add(k);
    gruppenMerken();
    vibriere(15); TON.spiele("klick");
    zeichnen();
    const ziel = document.getElementById(`gruppe-${k}`);
    if (sprung && ziel) ziel.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  if (el.dataset.stvFuer) {
    const id = el.dataset.stvFuer, neu = !stvMein.includes(id);
    if (neu) { stvMein = [...stvMein, id]; stvMerken(); }
    stvWahl = id;
    fuerAuto = { pid: ansicht, id, neu };
    vibriere(25); TON.spiele("klick");
    return zeichnen();
  }
  if (el.dataset.alleEnde !== undefined) { alleEndeFrage = el.dataset.alleEnde || null; verlassenFrage = null; vibriere(20); return zeichnen(); }
  if (el.dataset.teilen) return teilen(el.dataset.teilen, "Partyspiele");
  if (el.dataset.ansageWeg !== undefined) {
    const a = document.getElementById("ansage");
    if (a && (a.dataset.art === "neu" || a.dataset.art === "alle")) ansageNr = Math.max(ansageNr, Number(a.dataset.nr));
    if (a && a.dataset.art === "rad") radGesehen = Math.max(radGesehen, Number(a.dataset.nr));
    return ansageWeg();
  }
  if (el.dataset.radHin !== undefined) {
    // zum Gluecksrad in der Uebersicht (laufendes Spiel laeuft weiter)
    ansicht = null; tafelAuf = false; steuerAuf = false; ansichtMerken();
    vibriere(20); TON.spiele("klick"); zeichnen();
    const k = document.getElementById("glueck");
    if (k) k.scrollIntoView({ block: "center" });
    return;
  }
  if (el.dataset.ansageMit) {
    const a = document.getElementById("ansage");
    if (a) ansageNr = Math.max(ansageNr, Number(a.dataset.nr));
    ansageWeg();
    ansicht = el.dataset.ansageMit; tafelAuf = false; ansichtMerken();
    vibriere(25); TON.spiele("klick");
    senden({ typ: "_mit", p: ansicht });
    zeichnen(); window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.steuern !== undefined) { steuern = !steuern; sessionStorage.setItem("pa_steuern", steuern ? "an" : "aus"); return zeichnen(); }
  if (el.dataset.endeFrage !== undefined) { endeFrage = !endeFrage; return zeichnen(); }
  if (el.dataset.code !== undefined) {
    const vorher = K.meinSchluessel();
    if (!K.codeSauber((document.getElementById("rf-code") || {}).value)) { hinweis("Bitte den Freischaltcode eingeben"); return; }
    if (!(await freischalten("rf-code"))) return;
    if (!K.meinSchluessel() || K.meinSchluessel() === vorher && binAdmin()) return;
    hinweis("Code richtig – Spielleitung wird freigeschaltet");
    TON.spiele("richtig");
    if (rolle === "gastgeber") { adminSelbst(); const aend = neueAenderung(); aend.lobby = true; return verteilen(aend); }
    return adminBeweisSenden();
  }
  if (el.dataset.ansicht !== undefined) {
    if (el.closest("#ansage")) {
      const x = document.getElementById("ansage");
      if (x && (x.dataset.art === "neu" || x.dataset.art === "alle")) ansageNr = Math.max(ansageNr, Number(x.dataset.nr));
      ansageWeg();
    }
    ansicht = el.dataset.ansicht || null; tafelAuf = false; steuerAuf = false; ansichtMerken();
    if (!el.dataset.a) { vibriere(20); TON.spiele("klick"); zeichnen(); window.scrollTo(0, 0); return; }
  }
  if (!el.dataset.a) return;
  const a = JSON.parse(el.dataset.a);
  if (el.dataset.feld) {
    const f = document.getElementById(el.dataset.feld);
    a.wert = f ? f.value : "";
    if (f && el.dataset.leeren !== undefined) f.value = "";
  }
  if (el.dataset.felder) a.werte = el.dataset.felder.split(",").map((id) => { const f = document.getElementById(id); return f ? f.value : ""; });
  if (a.typ === "_tafel") {
    const fehlt = TAFEL.pruefen(a);
    if (fehlt) { hinweis(fehlt); TON.spiele("falsch"); vibriere(80); return; }
    if (el.dataset.felder && el.dataset.leeren) el.dataset.leeren.split(",").forEach((id) => { const f = document.getElementById(id); if (f) f.value = ""; });
    if (a.was === "w_reset") tafelAnsicht.leeren = false;
    vibriere(25); TON.spiele(el.dataset.klang || "klick");
    return tafelAbgleich.aendern(a);
  }
  if (a.typ === "_raumende") endeFrage = false;
  if (a.typ === "_rueck") rueckFrage = false;
  if (a.typ === "_plan" && a.was === "dazu") {
    const [zeit, sp, text] = a.werte;
    if (!zeit || (!sp && !String(text || "").trim())) { hinweis("Bitte eine Uhrzeit und ein Spiel oder einen Text angeben"); return; }
    ["rf-planzeit", "rf-plantext"].forEach((id) => { const f = document.getElementById(id); if (f) f.value = ""; });
  }
  if (a.typ === "_glueck" && a.was === "eigen" && !String((a.werte || [])[0] || "").trim()) { hinweis("Bitte einen Namen für das Feld eintippen"); return; }
  if (a.typ === "vorschlag" && !String((a.werte || [])[1] || "").trim()) { hinweis("Bitte eine Figur eintippen"); return; }
  // Eingabefelder nach dem Abschicken leeren (Auswahllisten bleiben stehen)
  if (el.dataset.felder && el.dataset.leeren !== undefined) el.dataset.felder.split(",").forEach((id) => { const f = document.getElementById(id); if (f && f.tagName !== "SELECT") f.value = ""; });
  vibriere(25);
  TON.spiele(el.dataset.klang || "klick");
  senden(a);
  if (el.dataset.ansicht !== undefined) { zeichnen(); window.scrollTo(0, 0); }
});

// Enter im Feld = der eine Knopf, der dieses Feld abschickt (Raten, Abgeben, Regel festlegen ...)
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || ev.isComposing) return;
  const f = ev.target;
  if (!f || !f.id || f.tagName !== "INPUT") return;
  const k = [...document.querySelectorAll("[data-feld]")].filter((x) => x.dataset.feld === f.id);
  if (k.length === 1 && !k[0].disabled) { ev.preventDefault(); k[0].click(); }
});

document.body.insertAdjacentHTML("beforeend", TON.schalterHTML());
function zeigeHinweis(text) {
  let h = document.getElementById("ton-hinweis");
  if (!h) { h = document.createElement("div"); h.id = "ton-hinweis"; document.body.appendChild(h); }
  h.textContent = text; h.classList.remove("weg"); clearTimeout(h._t); h._t = setTimeout(() => h.classList.add("weg"), 1400);
}

startBild();
