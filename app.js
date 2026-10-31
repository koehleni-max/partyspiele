// Partyspiele: Raum, Spiele-Uebersicht, Meldungen, Spielablauf (Halloween-Fassung, Nico 26.10.2026).
// Ein Link fuer alle (Firebase, net.js). Das Gastgeber-Geraet haelt den Stand, fuehrt alle Aktionen aus und schreibt den
// neuen Stand in den Raum; alle anderen zeigen ihn an. Mehrere Spiele laufen gleichzeitig (partien.js) - jedes Handy
// zeigt eins davon, die Uebersicht oder die Turniertafel. Anlass und Aussehen: anlass.js. Konten: konten.js.
import { Verbindung, neuerCode, codeGueltig, zufallsText, standTeile, standAenderung, standLesen } from "./net.js";
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

const app = document.getElementById("app");
const BASIS = location.href.split("#")[0];
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NAME_MAX = 14;
const MAX_SPIELER = 30;
const MAX_PARTIEN = 12;
const spiel = (id) => SPIELE.find((x) => x.id === id);

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
let warVerbunden = false;
let radGesehen = -1, radGemeldet = -1, jokerGesehen = -1, meineJoker = -1;   // Gluecksrad: was dieses Handy schon gemeldet hat
// Controller an diesem Geraet (Nico 30.10.2026, controller.js): jeder ist ein eigener Spieler im Raum
let pads = {};             // gamepad.index -> {id, name, nr, art}
let sendeAls = null;       // waehrend ein Controller etwas ausloest: in seinem Namen senden
let anzeige = { pid: null, id: null };   // fuer wen das angezeigte Spiel gerade gezeichnet ist
// Fehlerjagd nach dem ersten Spieleabend (Nico 31.10.2026):
// - Ergebnis-Bildschirme stehen erst eine Weile: Weiter-Knoepfe sind die ersten Sekunden gesperrt ("die Rangliste wird
//   durch Weitertippen sofort weggetippt"). Ein Ergebnis erkennt app.js an .urteil, .rangliste oder [data-ergebnis].
// - "Weiter" zaehlt nur einmal: wer weiterblaettert, schickt mit, welchen Stand (p.v) er gesehen hat; hat seitdem schon
//   jemand weitergeblaettert (p.wv), verfaellt der zweite Tipp (Doppeltipp, zwei Handys gleichzeitig).
const ERGEBNIS_SPERRE = 2000;
const WEITER_TYPEN = new Set(["weiter", "naechster", "miniweiter", "neu", "neustart", "los", "start", "aufloesen"]);
const SPERR_TYPEN = new Set([...WEITER_TYPEN, "kaufen", "nein", "duell"]);
let ergebnisSperre = { key: "", bis: 0, timer: null };
// Zurueck-Knopf des Handys: aus Spiel, Tafel oder Steuerseite zur Uebersicht statt aus dem Raum
let zurueckEintrag = !!(history.state && history.state.pa === "unter");

// Fuer die automatischen Tests (liest nur)
window.__partyspiele = { code: () => code, id: () => meineId, raum: () => raum, rolle: () => rolle, ansicht: () => ansicht, pads: () => pads };

// ---------------------------------------------------------------- Hilfen
async function teilen(text, titel) {
  if (navigator.share) {
    try { await navigator.share({ title: titel, text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); hinweis("Kopiert – jetzt in WhatsApp einfügen"); }
  catch (e) { prompt("Zum Kopieren:", text); }
}
function hinweis(text, art = "") {
  const d = document.createElement("div");
  d.className = "toast";
  if (art) d.dataset.art = art;
  d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
function vibriere(ms = 60) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
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
function startBild() {
  const m = location.hash.match(/^#r=([a-z0-9]{12,32})(&beamer)?$/);
  if (m && m[2]) return B.start(m[1], app);   // Beamer: kein Spieler, zeigt nur (beamer.js)
  if (m) return raumLink(m[1]);
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
function fehlerBild(text) { status = "fehler"; statusText = text; zeichnen(); }

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
  } catch (e) { return fehlerBild("Keine Verbindung zum Raum. Ist das Internet an? Dann die Seite neu laden."); }
  if (!lobby) { status = "beendet"; statusText = "Diesen Raum gibt es nicht (mehr)."; return zeichnen(); }
  status = "";
  A.lookAnwenden(lobby.look);
  document.title = `${A.titel(lobby.anlass)} – Partyspiele`;
  const eigen = eigene().find((x) => x.code === c);
  const online = (lobby.spieler || []).filter((x) => x.online).length;
  app.innerHTML = `
    <div class="karte mitte titelbild">
      <div class="logo">${A.logo(lobby.look)}</div>
      ${A.deko(lobby.look)}
      <h1 class="anlass-titel">${A.titelHTML(lobby.anlass)}</h1>
      <p class="leise">${online} ${online === 1 ? "ist" : "sind"} schon da${gg && gg.name ? ` · Gastgeber: ${esc(gg.name)}` : ""}</p>
      ${namensFeld()}
      ${codeFeld()}
      <button class="gross" id="beitreten">Beitreten</button>
      ${eigen ? `<button class="zweit" id="weitermachen">🏠 Als Gastgeber weitermachen</button>` : ""}
    </div>`;
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
    admins: [], gastgeber: meineId, spieler: [{ id: meineId, name: meinName, platz: 0, online: true, gast: 1 }], partien: {}, tafel: TAFEL.neu(),
    gastNr: 1, gruesse: [], beamer: B.steuer(null), glueck: null };
  G.sicher(raum);
  glueckMerkenLesen();   // gestrichene Rad-Ergebnisse vom letzten Raum (Nico 31.10.2026: "wird gemerkt")
  geschrieben = null;
  gastgeberStart();
}

// Gluecksrad-Auswahl (abgeschaltete Felder, gestrichene Ergebnisse) auf dem Gastgeber-Geraet merken
const GLUECK_MERK = "pa_glueck_auswahl";
const GLUECK_MERKEN = new Set(["feld", "streichen", "allestreichen", "alleauf", "trinkaus"]);
function glueckMerkenSchreiben() {
  try { localStorage.setItem(GLUECK_MERK, JSON.stringify(G.merkStand(raum.glueck))); } catch (e) { /* privater Modus */ }
}
function glueckMerkenLesen() {
  try { const m = JSON.parse(localStorage.getItem(GLUECK_MERK) || "null"); if (m) G.merkUebernehmen(raum, m); } catch (e) { /* kaputt: ignorieren */ }
}

async function gastgeberFortsetzen() {
  rolle = "gastgeber";
  ladeBild("Raum wird geladen …");
  let l = null, gg = null;
  try {
    await verbinden(code);
    gg = await netz.lesen("gastgeber");
    l = standLesen(await netz.lesen("stand"));
  } catch (e) { return fehlerBild("Keine Verbindung zum Raum. Ist das Internet an? Dann die Seite neu laden."); }
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
  if (alt && alt !== neu) { P.idErsetzen(raum, alt, neu); G.idErsetzen(raum, alt, neu); }
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
  netz.beobachten("da", (d) => { const b = beamerZahl(); anwesend = d || {}; anwesenheitUebernehmen(); beamerGeaendert(b); });
  netz.beobachten("gastgeber", (gg) => { if (rolle === "gastgeber" && gg && gg.uid && gg.uid !== meineId) abgeloest(); });
  netz.anwesend(meineId, meinName);
  netz.aktionenEmpfangen((von, a) => { if (rolle === "gastgeber") ausfuehren(von, a); });
  ansicht = sessionStorage.getItem(`pa_ansicht_${code}`) || null;
  if (ansicht && !raum.partien[ansicht]) ansicht = null;
  Object.values(raum.partien).forEach((p) => { phasen[p.pid] = p.phase; });
  eigeneMeldung = ansageNr = raum.meldung ? raum.meldung.nr : 0;
  const k = K.meinSchluessel();
  if (k) adminSelbst();
  verteilen(ALLES());
  eingangEinmal();
  padsLaden();
}

// Beamer kommt oder geht: nur die Steuerung neu zeigen (Steuerseite oder Uebersicht), kein laufendes Spiel stoeren
function beamerGeaendert(vorher) {
  if (!raum || status || beamerZahl() === vorher || !zeigeSteuer()) return;
  if (steuerAuf || (!tafelAuf && !ansicht)) zeichnen();
}

function abgeloest() {
  rolle = null;
  if (netz) { netz.beenden(); netz = null; }
  raum = null;
  status = "abgeloest";
  statusText = "Ein anderes Gerät hält jetzt den Raum (ist jetzt Gastgeber).";
  zeichnen();
}

function anwesenheitUebernehmen() {
  if (!raum) return;
  let neu = false;
  raum.spieler.forEach((sp) => {
    const da = sp.id === meineId || !!anwesend[sp.id];
    if (sp.online !== da) { sp.online = da; neu = true; }
  });
  if (neu) { const aend = neueAenderung(); aend.lobby = true; verteilen(aend); }
}

const RAUM_TYPEN = new Set(["_hallo", "_spielwahl", "_ab18", "_trink", "_look", "_testkonten", "_tafel", "_admin", "_adminweg", "_raumende", "_beamer", "_alle", "_glueck"]);

function ausfuehren(von, a) {
  if (!raum || !a || typeof a !== "object" || typeof a.typ !== "string") return;
  const aend = neueAenderung();
  if (a.typ === "_hallo") { if (hallo(von, a.name)) aend.lobby = true; return verteilen(aend); }
  const ich = raum.spieler.find((x) => x.id === von);
  if (!ich) return;
  const admin = K.istAdmin(raum, von);
  if (RAUM_TYPEN.has(a.typ)) {
    if (a.typ === "_spielwahl") {
      const sp = spiel(a.id);
      if (!sp || Object.keys(raum.partien).length >= MAX_PARTIEN) return;
      const pid = `p${raum.pNr++}`;
      raum.partien[pid] = P.neu(pid, sp.id, von, Date.now(), raum.ohneAlkohol);
      raum.meldung = { nr: (raum.meldung ? raum.meldung.nr : 0) + 1, pid, von };
      aend.lobby = true; aend.partien.add(pid);
    } else if (a.typ === "_ab18" && admin) { raum.ab18 = !raum.ab18; aend.lobby = true; }
    else if (a.typ === "_trink" && admin) { raum.ohneAlkohol = !raum.ohneAlkohol; aend.lobby = true; }
    else if (a.typ === "_look" && admin && A.lookGueltig(a.look)) { raum.look = a.look; aend.lobby = true; }
    else if (a.typ === "_testkonten" && admin) { raum.testkonten = !K.testkontenAn(raum); aend.lobby = true; }
    else if (a.typ === "_beamer" && admin) { if (!B.steuerAktion(raum, a, Date.now())) return; aend.lobby = true; }
    // Gluecksrad: das Ergebnis entscheidet nur der Gastgeber (Rechte fuer Steuer-Aktionen prueft gluecksrad.js)
    else if (a.typ === "_glueck") {
      if (!G.aktion(raum, von, a, Date.now(), admin)) return;
      aend.lobby = true;
      if (admin && GLUECK_MERKEN.has(a.was)) glueckMerkenSchreiben();
    }
    else if (a.typ === "_alle" && admin) {
      // Spiel fuer alle: jeder, der gerade verbunden ist, ist gleich dabei; die Spielleitung startet mit "Los"
      const sp = spiel(a.wert || a.id);
      if (!sp || Object.keys(raum.partien).length >= MAX_PARTIEN) return;
      const pid = `p${raum.pNr++}`;
      const p = P.neu(pid, sp.id, von, Date.now(), raum.ohneAlkohol);
      raum.spieler.filter((x) => x.online && x.id !== von).forEach((x) => { if (p.mit.length < P.MAX_MIT) p.mit.push(x.id); });
      raum.partien[pid] = p;
      raum.meldung = { nr: (raum.meldung ? raum.meldung.nr : 0) + 1, pid, von, alle: true };
      aend.lobby = true; aend.partien.add(pid);
    }
    else if (a.typ === "_tafel") {
      tafelAusfuehren(a, { gastgeber: admin, wer: ich.name });
      aend.tafel = true;
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
  if (a.typ === "_mit") { if (!P.mitmachen(p, sp, von, raum)) return; }
  else if (a.typ === "_raus") {
    if (!P.raus(p, von)) return;
    if (!p.mit.some((id) => !P.istBot(id))) delete raum.partien[p.pid];
  } else if (a.typ === "_los") { if (!leitet || p.phase !== "sammeln") return; P.starten(p, sp, raum); }
  else if (a.typ === "_zurueck") { if (!leitet) return; partieWeg(p.pid); }
  // Mit oder ohne Trinken fuer genau dieses Spiel (Spielleitung; vorbelegt mit dem Raum-Schalter, auch mitten im Spiel)
  else if (a.typ === "_ohne") { if (!leitet) return; p.ohne = !!a.ohne; if (p.s) p.s.ohne = p.ohne; }
  else if (a.typ === "_neuauf") { if (!leitet || p.phase !== "laeuft" || !p.wartend.length) return; P.neueRunde(p, sp, raum); }
  else if (a.typ === "_botneu") { if (!leitet || !sp.bot || !P.botDazu(p, raum)) return; }
  else if (a.typ === "_botweg") { if (!leitet || !P.botWeg(p, a.id)) return; }
  else {
    if (p.phase !== "laeuft") return;
    const idx = p.mit.indexOf(von);
    if (idx < 0) return;
    if (spielAktion(p, sp, idx, a)) aend.tafel = true;
  }
  if (raum.partien[p.pid]) p.t = Date.now();   // zuletzt geaendert (Beamer: Ergebnis steht eine Weile, dann Diashow)
  verteilen(aend);
}

function partieWeg(pid) {
  delete raum.partien[pid];
  clearTimeout(botTimer[pid]); delete botTimer[pid];
}

// -> true, wenn dabei ein Sieg in die Gesamtwertung kam
function spielAktion(p, sp, idx, a) {
  const weiter = WEITER_TYPEN.has(a.typ);
  // schon weitergeblaettert, seit dieses Handy den Stand gesehen hat: zweiter Tipp verfaellt
  if (weiter && typeof a.pv === "number" && (p.wv || 0) > a.pv) return false;
  const vorher = weiter ? JSON.stringify(p.s) : null;
  const nm = P.namen(raum, p);
  p.s.anzahl = p.mit.length;
  try { sp.aktion(p.s, idx, a, nm, raum); } catch (e) { console.error(e); }
  p.v = (p.v || 0) + 1;
  if (weiter && JSON.stringify(p.s) !== vorher) p.wv = p.v;
  return spielWerten(p, sp, nm);
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
  return true;
}

function tafelAusfuehren(a, ctx) {
  if (!raum.tafel) raum.tafel = TAFEL.neu();
  W.sicher(raum.tafel).ohneTest = K.testkontenAn(raum);
  try { TAFEL.aktion(raum.tafel, a, { jetzt: Date.now(), ohneAlkohol: !!raum.ohneAlkohol, ...ctx }); } catch (e) { console.error(e); }
  if (tafelAblage) tafelAblage.sichern(raum.tafel);
}

function einzigartig(name, selbst) {
  const vergeben = (n) => raum.spieler.some((x) => x !== selbst && x.name.toLocaleLowerCase("de") === n.toLocaleLowerCase("de"));
  if (!vergeben(name)) return name;
  for (let k = 2; k < 99; k++) { const n = `${name.slice(0, NAME_MAX - 3)} ${k}`; if (!vergeben(n)) return n; }
  return name;
}

// Ein Handy meldet sich (beim Beitreten und nach jedem Wiederverbinden). Gleiche Kennung = derselbe Spieler; neue Kennung
// mit dem Namen eines Spielers, der gerade nicht verbunden ist = er ist zurueck (anderer Tab, Handy neu gestartet).
function hallo(von, name) {
  if (!von) return false;
  name = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) || "Gast";
  let sp = raum.spieler.find((x) => x.id === von);
  if (!sp) {
    const zurueck = raum.spieler.find((x) => x.id !== raum.gastgeber && !anwesend[x.id] && x.name.toLocaleLowerCase("de") === name.toLocaleLowerCase("de"));
    if (zurueck) { G.idErsetzen(raum, zurueck.id, von); P.idErsetzen(raum, zurueck.id, von); sp = zurueck; }
  }
  if (sp) { sp.name = einzigartig(name, sp); sp.online = true; return true; }
  if (raum.spieler.length >= MAX_SPIELER) return false;
  const belegt = new Set(raum.spieler.map((x) => x.platz));
  let platz = 0; while (belegt.has(platz)) platz++;
  // Begruessung am Beamer: nur "Gast Nummer X" (fortlaufend, ohne "von Y"); wer zurueckkommt, wird nicht neu gezaehlt
  raum.gastNr = (Number(raum.gastNr) || raum.spieler.length) + 1;
  const neu = { id: von, name: einzigartig(name, null), platz, online: true, gast: raum.gastNr };
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
  ansichtPruefen();
  ansageZeigen();
  if (!stillHalten(aend)) zeichnen();
  botPlanen();
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
setInterval(() => {
  const jetzt = jetztGastgeber();
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const rest = Number(el.dataset.countdown) - jetzt;
    const text = W.uhrText(rest);
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.toggle("knapp", rest <= 60000);
      if (rest > 0 && rest <= 3000 && el.dataset.tick !== text && el.closest("#app")) { el.dataset.tick = text; TON.spiele("tick"); }
    }
  });
  bremseAnzeigen();
  if (rolle === "gastgeber" && raum && raum.tafel && W.faellig(raum.tafel.wertung, Date.now())) {
    tafelAusfuehren({ was: "w_ablauf" }, { gastgeber: true, wer: meinName });
    const aend = neueAenderung(); aend.tafel = true; verteilen(aend);
  }
  // Gluecksrad: Joker-Zeit abgelaufen -> Ergebnis gilt (nur der Gastgeber schliesst ab)
  if (rolle === "gastgeber" && raum && G.pruefen(raum, Date.now())) { const aend = neueAenderung(); aend.lobby = true; verteilen(aend); }
  if (raum && !status) {
    ansageZeigen();   // Gluecksrad-Meldung folgt der Uhr (Stopp, Joker-Zeit, Ausblenden)
    // Sperrzeit und Joker-Sekunden zaehlen ohne Neuzeichnen (kein Ticken wie beim Runden-Countdown)
    let frei = false;
    document.querySelectorAll("[data-gcd]").forEach((el) => {
      const rest = Number(el.dataset.gcd) - jetzt;
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
  if (rolle !== "gastgeber" || !raum) return;
  Object.values(raum.partien).forEach((p) => {
    if (p.phase !== "laeuft" || botTimer[p.pid] || !p.mit.some(P.istBot)) return;
    const sp = spiel(p.spiel);
    if (!sp || !sp.bot) return;
    const pause = sp.botPause ? sp.botPause(p.s) : 900;
    botTimer[p.pid] = setTimeout(() => botZug(p.pid), pause * (0.7 + Math.random() * 0.6));
  });
}
function botZug(pid) {
  delete botTimer[pid];
  const p = raum && raum.partien[pid];
  if (rolle !== "gastgeber" || !p || p.phase !== "laeuft") return;
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
  botTimer[pid] = setTimeout(() => botZug(pid), 1500); // gerade nichts zu tun - spaeter wieder nachsehen
}

// ---------------------------------------------------------------- Gast
async function gastBeitreten() {
  rolle = "gast";
  status = "verbinde"; statusText = "";
  zeichnen();
  try { await verbinden(code); } catch (e) { return fehlerBild("Keine Verbindung zum Raum. Ist das Internet an? Dann die Seite neu laden."); }
  meineId = netz.uid || meineId || zufallsText(16);
  sitzungMerken();
  localStorage.setItem("pa_name", meinName);
  history.replaceState(history.state, "", `${BASIS}#r=${code}`);
  ansicht = sessionStorage.getItem(`pa_ansicht_${code}`) || null;
  netz.beobachten("stand", standEmpfangen);
  netz.beobachten("da", (d) => {
    const vorher = gastgeberDa(), b = beamerZahl();
    anwesend = d || {};
    if (raum && vorher !== gastgeberDa()) zeichnen();
    else beamerGeaendert(b);
  });
  netz.beiVerbindung = (an) => { netzAnzeige(an); if (an) halloSenden(); };
  netz.anwesend(meineId, meinName);
  padsLaden(false);
  if (netz.verbunden) halloSenden();
}
function halloSenden() {
  if (!netz || rolle !== "gast") return;
  netz.aktionSenden(meineId, { typ: "_hallo", name: meinName }).catch((e) => console.warn(e));
  Object.values(pads).forEach((pad) => netz.aktionSenden(pad.id, { typ: "_hallo", name: pad.name }).catch((e) => console.warn(e)));
  adminBeweisSenden();
}

// ---------------------------------------------------------------- Controller (Nico 30.10.2026)
// Ein Controller am Geraet meldet sich mit dem ersten Tastendruck als eigener Spieler (_hallo mit eigener Kennung) und
// schickt alles ueber dieselbe Schiene wie ein Handy. Er gilt als "lokal": Spiele, in denen er mitmacht, zeigt dieses Geraet.
const padsKey = () => `pa_pads_${code}`;
const padIds = () => Object.values(pads).map((x) => x.id);
const istLokal = (id) => id === meineId || padIds().includes(id);
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
  if (!raum || status || !rolle) return;
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
      if (t === "a" && !String((C.fokus() || {}).dataset?.a || "").includes('"_los"')) return;
    } else if (p.phase === "laeuft" && j >= 0 && C.miniTaste(pad.id, t)) return;
  }
  if (["hoch", "runter", "links", "rechts"].includes(t)) return C.fokusBewegen(t);
  if (t === "a") {
    const el = C.fokus();
    if (!el) return;
    sendeAls = pad.id;
    try { el.click(); } finally { sendeAls = null; }
  }
}
C.starten(padTaste);

// fuer wen ein laufendes Spiel auf diesem Geraet gezeichnet wird: eigener Spieler, beim Partybrett wer von hier dran
// ist; im Minispiel nur der eigene (Controller spielen in eigenen Feldern) - -1 = Geraet spielt nur mit Controllern mit
function anzeigeIch(p, sp) {
  const eigen = p.mit.indexOf(meineId);
  if (p.phase !== "laeuft" || !padIds().length) return eigen;
  const lokal = p.mit.map((id, j) => (istLokal(id) ? j : -1)).filter((j) => j >= 0);
  if (!lokal.length) return -1;
  if (sp.id === "brett" && p.s) {
    if (p.s.phase === "mini" && !p.s.ende) return eigen;
    if (lokal.includes(p.s.dran)) return p.s.dran;
  }
  return eigen >= 0 ? eigen : lokal[0];
}
function padMinis(p, sp, nm) {
  if (sp.id !== "brett" || p.phase !== "laeuft" || !p.s || p.s.phase !== "mini" || !p.s.mini || p.s.mini.fertig) { C.miniAus(); return ""; }
  const hier = Object.values(pads).map((pad) => ({ pad, j: p.mit.indexOf(pad.id) })).filter((x) => x.j >= 0);
  const m = p.s.mini;
  return C.miniHTML(m, hier, m.art === "schaetzen" ? T.SCHAETZ[m.frage] : null, (id, wert) => sendenAls(id, { typ: "mini", wert, p: p.pid }));
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
  const wer = liste.map((pad) => { const j = p.mit.indexOf(pad.id); return `<span class="pille ${j >= 0 ? "" : "aus"}">${j >= 0 ? `<span class="farbe f${j % 20}"></span>` : ""}🎮 ${esc(pad.name)}${j >= 0 ? "" : " · nicht dabei"}</span>`; }).join("");
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
  merker = l.merker;
  raum = l.raum;
  document.title = `${A.titel(raum.anlass)} – Partyspiele`;
  const drin = raum.spieler.some((x) => x.id === meineId);
  const warDrin = status === "";
  status = drin ? "" : "verbinde";
  if (ersterStand && drin) {
    eigeneMeldung = ansageNr = raum.meldung ? raum.meldung.nr : 0;
    Object.values(raum.partien).forEach((p) => { phasen[p.pid] = p.phase; });
    if (ansicht && !raum.partien[ansicht]) ansicht = null;
    ersterStand = false;
  }
  if (!drin) return zeichnen();
  ansichtPruefen();
  ansageZeigen();
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
  if (ph === "fertig" && jetzt > Math.max(l.ende, l.zu || 0) + 12000) { radGesehen = l.nr; if (istRad) ansageWeg(); return false; }
  if (l.nr > radGemeldet) {
    radGemeldet = l.nr;
    TON.spiele(A.klang(raum.look, "meldung"));
    vibriere([60, 40, 60]);
  }
  const wahl = ph === "joker" && l.getroffen === meineId && !l.schub && G.jokerVon(raum, meineId) > 0;
  if (nachrang && (ph === "fertig" || ph === "warten")) { radGesehen = l.nr; return false; }
  const sig = `${l.nr}|${ph === "warten" ? "fertig" : ph}|${l.schub ? 1 : 0}|${wahl ? 1 : 0}|${beamerZahl() ? 1 : 0}`;
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
  } else a.innerHTML = `<span class="ansage-text">${text}</span><span class="ansage-knoepfe">${hin}${weg}</span>`;
  ansagePlatz();
  return true;
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
  if (!el) { el = document.createElement("div"); el.id = "netz"; el.className = "netzweg"; el.textContent = "📡 Verbindung weg – kommt gleich wieder"; document.body.appendChild(el); }
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
const LEITER_TYPEN = new Set(["_los", "_zurueck", "_neuauf", "_botneu", "_botweg", "_ohne"]);
function absender(a) {
  const eigen = sendeAls || meineId;
  if (RAUM_TYPEN.has(a.typ) || a.p == null || !padIds().length) return eigen;
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
const farbeVon = (p, id) => { const j = p.mit.indexOf(id); return j >= 0 ? j % 20 : 0; };
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
    raum.ab18, raum.ohneAlkohol, raum.look, raum.testkonten, binAdmin(), steuern, gastgeberDa()]);
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
  const halten = document.activeElement;
  if (halten && halten.id && app.contains(halten) && /^(INPUT|TEXTAREA)$/.test(halten.tagName)) {
    const neu = document.createElement("div");
    neu.innerHTML = html;
    const partner = neu.querySelector(`#${CSS.escape(halten.id)}`);
    if (partner && partner.tagName === halten.tagName && partner.type === halten.type
      && (partner.dataset.rk || "") === (halten.dataset.rk || "") && verpflanzen(neu, halten, partner)) return;
  }
  app.innerHTML = html;
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
    ergebnisSperre.bis = key ? Date.now() + ERGEBNIS_SPERRE : 0;
    if (key) ergebnisSperre.timer = setTimeout(sperreAufheben, ERGEBNIS_SPERRE + 20);
  }
  if (Date.now() < ergebnisSperre.bis) sperrKnoepfe().forEach((k) => { if (!k.disabled) { k.disabled = true; k.dataset.gesperrt = ""; } });
}
function sperreAufheben() {
  ergebnisSperre.bis = 0;
  app.querySelectorAll("button[data-gesperrt]").forEach((k) => { k.disabled = false; delete k.dataset.gesperrt; });
  if (padIds().length) C.fokusWiederherstellen();
}

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
    ansicht = null; tafelAuf = false; steuerAuf = false; ansichtMerken();
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
  if (status || !raum) app.innerHTML = statusBild();
  else if (steuerAuf && zeigeSteuer()) { einsetzen(glueckReiter ? glueckListeBild() : steuerBild()); steuerSpiel = beamerSpielSig(); }
  else if (tafelAuf) einsetzen(tafelBild());
  else if (ansicht && raum.partien[ansicht]) {
    const p = partie = raum.partien[ansicht];
    const sp = spiel(p.spiel);
    const ich = anzeigeIch(p, sp);
    anzeige = { pid: p.pid, id: ich >= 0 ? p.mit[ich] : null };
    einsetzen(partieBild(p, sp, ich));
    partieSig = sigFuer(p);
    felderZurueck(felder);
    if (p.phase === "laeuft" && ich >= 0) {
      const nm = P.namen(raum, p);
      try { musik = sp.musik ? sp.musik(p.s, ich, raum) : null; } catch (e) { musik = null; }
      if (sp.nach) try { sp.nach(p.s, ich, sendenFuer(p.pid), nm, raum); } catch (e) { console.error(e); }
    }
  } else { ansicht = null; einsetzen(raumBild()); }
  TON.musik(anDerWand ? null : musik);
  felderZurueck(felder);
  ergebnisPruefen(partie);
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
  document.querySelectorAll("[data-key]").forEach((el) => {
    const k = el.dataset.key;
    if (gesehen.has(k)) el.classList.add("still");
    else { gesehen.add(k); if (el.dataset.ton && !anDerWand) { const n = el.dataset.ton, v = Number(el.dataset.tonNach || 0); v ? setTimeout(() => TON.spiele(n), v) : TON.spiele(n); } }
  });
  document.querySelectorAll(".urteil").forEach((el) => {
    const k = "k:" + el.textContent.slice(0, 80);
    if (!gesehen.has(k)) { gesehen.add(k); if (/🏆|gewinnt/.test(el.textContent) && !anDerWand) konfetti(); }
    else el.classList.add("still");
  });
  if (gesehen.size > 3000) gesehen.clear();
  fokusZurueck(fokus);
  if (padIds().length) C.fokusWiederherstellen();
  radDrehen();
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
  if (status === "beendet") return `<div class="karte mitte"><div class="logo">👋</div><h2>${esc(statusText || "Der Raum ist beendet.")}</h2>
    <button class="gross" data-raum-neu>Neuen Raum öffnen</button></div>`;
  return `<div class="karte mitte"><div class="logo">📡</div><h2>Hoppla</h2><p>${esc(statusText)}</p><button class="gross" data-neu-laden>Neu laden</button></div>`;
}

function gastgeberHinweis() {
  return rolle === "gast" && !gastgeberDa()
    ? `<div class="hinweisbox warten netzhinweis">⚠️ Das Gastgeber-Gerät ist gerade nicht verbunden – deine Eingaben kommen an, sobald es wieder da ist.</div>` : "";
}

function raumLinkText() { return `${BASIS}#r=${code}`; }

function raumBild() {
  const partien = P.liste(raum);
  const online = raum.spieler.filter((x) => x.online).length;
  const link = raumLinkText();
  const ich = ichSpieler();
  const kachel = (sp, breit) => `
    <button class="spielkachel ${breit ? "breit" : ""}" style="--k1:${(sp.farben || [])[0] || "#3b2f8f"};--k2:${(sp.farben || [])[1] || "#1f1b4d"}" data-a='${JSON.stringify({ typ: "_spielwahl", id: sp.id })}'>
      <span class="emo">${sp.emoji}</span><b>${esc(sp.name)}</b><small>${esc(sp.kurz)}</small>${sp.bot ? `<span class="botmarke" title="Computer-Mitspieler möglich">🤖</span>` : ""}${P.mittendrin(sp.id) ? `<span class="einstiegmarke" title="Einsteigen mittendrin möglich">➕</span>` : ""}</button>`;
  const bereich = (g, k) => (k === 0 ? `<div class="bereichstitel" style="grid-column:span 2">✨ Von Jarvis gebaut<small>eigene Spiele, extra für euch entwickelt</small></div>`
    : g.titel.startsWith("📦") ? `<div class="bereichstitel" style="grid-column:span 2">📦 Fertige Spiele<small>bewährte Klassiker aus freien Spielesammlungen</small></div>` : "");
  const auswahl = GRUPPEN.map((g, k) => bereich(g, k) + `<div class="gruppentitel" style="grid-column:span 2">${g.titel.startsWith("📦") ? "🎯 Klassiker für zwei und mehr" : g.titel}</div>` +
    g.ids.map(spiel).filter(Boolean).map((sp) => kachel(sp, g.ids.length < 3)).join("")).join("");
  return `
    ${gastgeberHinweis()}
    <div class="karte raumkopf">
      ${A.deko(raum.look)}
      <h1 class="anlass-titel">${A.titelHTML(raum.anlass)}</h1>
      <p class="leise raumzeile">${online} online · ${raum.spieler.length} im Raum${partien.length ? ` · ${partien.length} ${partien.length === 1 ? "Spiel läuft" : "Spiele laufen"}` : ""}</p>
      <div class="kontozeile"><span>Du: <b>${esc(ich ? ich.name : meinName)}</b>${schilder(ich ? ich.name : meinName, meineId)}</span>
        ${binAdmin() ? `<button class="klein2" data-steuern>${steuern ? "🎮 Nur mitspielen" : "🛠️ Steuern"}</button>` : ""}
        ${zeigeSteuer() ? `<button class="klein2" data-steuer-auf>📽️ Steuerseite</button>` : ""}</div>
      <details class="einladen" ${einladenOffen ? "open" : ""}><summary>📲 Leute einladen – ein Link, ein QR-Code</summary>
        <p class="leise klein">Alle nehmen denselben Link. Mehr braucht es nicht.</p>
        <div class="linkzeile" data-link="${esc(link)}">${esc(link)}</div>
        <button class="gross" data-teilen="${esc(`${A.titel(raum.anlass)} – komm in den Raum und spiel mit: ${link}`)}">🔗 Link teilen</button>
        <div class="qr" data-qr="${esc(link)}"></div>
      </details>
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
      <div class="leute">${raum.spieler.map(pille).join("")}</div>
    </div>
    ${padKarte()}
    ${zeigeSteuer() ? steuerKarte() : binAdmin() ? "" : codeKarte()}
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
  if (dabei) knoepfe = `<button class="gruen" data-ansicht="${p.pid}">${p.phase === "sammeln" ? "Ansehen" : "Zurück ins Spiel"}</button>`;
  else if (p.phase === "sammeln" || mitten) knoepfe = `<button class="gruen" data-a='${mitA}' data-ansicht="${p.pid}">🙋 Mitmachen</button>`;
  else if (wartet) knoepfe = `<span class="ok">✓ vorgemerkt</span><button class="klein2" data-a='${JSON.stringify({ typ: "_raus", p: p.pid })}'>Doch nicht</button>`;
  else knoepfe = `<button data-a='${mitA}'>📌 Für nächste Runde vormerken</button>`;
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
  let inhalt;
  if (p.phase === "sammeln") inhalt = sammelBild(p, sp, nm, ich, leitet);
  else if (ich < 0 && !p.mit.some(istLokal)) inhalt = zuschauBild(p, sp, nm);
  else {
    try { inhalt = sp.render(p.s, ich, nm, raum) + padMinis(p, sp, nm); if (P.ohneTrinken(raum, p)) inhalt = ohneAlkohol(inhalt); }
    catch (e) { console.error(e); inhalt = `<p class="fehler">Anzeigefehler: ${esc(e.message)}</p>`; }
    if (leitet && p.wartend.length) inhalt = `<div class="hinweisbox vorgemerkt">📌 ${p.wartend.length === 1 ? "1 wartet" : `${p.wartend.length} warten`} auf die nächste Runde: ${p.wartend.map((id) => esc(P.nameVon(raum, p, id))).join(", ")}
      ${knopf("🔄 Neue Runde mit allen", { typ: "_neuauf" }, "gelb")}</div>${inhalt}`;
  }
  return `${gastgeberHinweis()}
    <div class="kopf"><span>${sp.emoji} ${esc(sp.name)}${p.phase === "laeuft" && P.ohneTrinken(raum, p) ? ` <small class="ohne-marke" title="ohne Trinken">🧃</small>` : ""}</span>
      <span class="kopfknoepfe"><button class="klein2 ${offen ? "tw-blinkt" : ""}" data-tt-auf title="Turniertafel">🏆 ${offen ? `⚔️ ${offen}` : rundenUhr() || "Tafel"}</button>
      <button class="klein2" data-ansicht="">‹ Übersicht</button>
      ${leitet ? `<button class="klein2" data-a='{"typ":"_zurueck"}'>⏹️ Beenden</button>` : ""}</span></div>
    <div class="spielflaeche">${inhalt}</div>
    ${padLeiste(p, sp)}
    <div class="fuss">${p.mit.map((id, i) => { const s = raum.spieler.find((x) => x.id === id); return `<span class="pille ${!s || s.online ? "" : "aus"}"><span class="farbe f${farbeVon(p, id)}"></span>${esc(nm[i])}${P.istBot(id) ? "" : schilder(nm[i], id)}${padMarke(id)}${id === meineId ? " (du)" : ""}</span>`; }).join("")}</div>`;
}

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

function zuschauBild(p, sp, nm) {
  const mitten = P.mittendrin(p.spiel);
  const wartet = p.wartend.includes(meineId);
  return `<div class="frage">${sp.emoji} ${esc(sp.name)} läuft gerade</div>
    <p class="mitte">Dabei: ${nm.map((n) => `<b>${esc(n)}</b>`).join(", ")}</p>
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
    <div class="karte steuerseite">
      <h2>📽️ Beamer</h2>
      <p class="${n ? "ok" : "leise"}">${n ? `✓ ${n === 1 ? "Ein Beamer ist" : `${n} Beamer sind`} verbunden` : "Noch kein Beamer verbunden."}</p>
      <p class="leise klein">Diesen Link am Gerät am Beamer öffnen (Browser, Vollbild). Der Beamer ist kein Spieler und zählt nicht als Gast.</p>
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
      ${raum.look === "halloween" ? `${knopf("😱 Schreckmoment!", bm("schreck"), "gross rot schreckknopf", `data-klang="kichern"`)}
        <p class="leise klein">Am Beamer erscheint 2–3 Sekunden ein Gruselgesicht mit Schrei. Nur im Halloween-Aussehen.</p>` : ""}
    </div>
    ${steuerGlueck(schalter)}
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
  const leute = raum.spieler.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.online ? "" : " (weg)"}</option>`).join("");
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
    namen: raum.spieler.filter((x) => !K.istTestkonto(raum, x.name)).map((x) => x.name),
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
  if (d.classList.contains("codekarte") || d.classList.contains("codefeld")) { if (!d.open) codeFehlerWeg(); }
}, true);

// ---------------------------------------------------------------- Klicks
document.addEventListener("click", async (ev) => {
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
  const el = ev.target.closest("[data-anlass],[data-zurueck],#beitreten,#weitermachen,[data-ansicht],[data-a],[data-teilen],[data-ansage-mit],[data-ansage-weg],[data-steuern],[data-code],[data-raum-neu],[data-uebernehmen],[data-ende-frage],[data-neu-laden],[data-steuer-auf],[data-steuer-zu],[data-gl-reiter],[data-gl-zu],[data-ohne-code],[data-rad-hin],[data-padname],[data-padweg]");
  if (!el) return;
  if (el.dataset.gesperrt !== undefined) return;   // Ergebnis steht noch (ergebnisPruefen)
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
  if (el.dataset.glReiter !== undefined || el.dataset.glZu !== undefined) {
    glueckReiter = el.dataset.glReiter !== undefined;
    vibriere(20); TON.spiele("klick"); zeichnen(); window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.steuerAuf !== undefined || el.dataset.steuerZu !== undefined) {
    steuerAuf = el.dataset.steuerAuf !== undefined; tafelAuf = false; glueckReiter = false;
    if (steuerAuf) { ansicht = null; ansichtMerken(); }
    vibriere(20); TON.spiele("klick"); zeichnen(); window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.ohneCode !== undefined) {
    const f = document.getElementById("rf-freischalt");
    if (f) f.value = "";
    if (!namenLesen()) return;
    codeFehlerWeg();
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
