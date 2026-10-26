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
import { browserAblage, schluesselFuer, abgleich } from "./tafel_ablage.js";
import { knopf } from "./hilfe.js";

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

// Fuer die automatischen Tests (liest nur)
window.__partyspiele = { code: () => code, id: () => meineId, raum: () => raum, rolle: () => rolle, ansicht: () => ansicht };

// ---------------------------------------------------------------- Hilfen
async function teilen(text, titel) {
  if (navigator.share) {
    try { await navigator.share({ title: titel, text }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); hinweis("Kopiert – jetzt in WhatsApp einfügen"); }
  catch (e) { prompt("Zum Kopieren:", text); }
}
function hinweis(text) {
  const d = document.createElement("div");
  d.className = "toast";
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
function ohneAlkohol(h) {
  return h.replace(/trinkt das Klatschglas aus/g, "bekommt 5 Strafpunkte")
    .replace(/(\d+)\s*Schlucke/g, "$1 Strafpunkte").replace(/(\d+)\s*Schluck\b/g, "$1 Strafpunkt")
    .replace(/einen Schluck/g, "einen Strafpunkt").replace(/\btrinkt\b/g, "bekommt").replace(/\btrinken\b/g, "bekommen")
    .replace(/klatscht/g, "bekommt einen Strafpunkt").replace(/🍺|🍻|🥃/g, "⚡").replace(/Schlucke/g, "Strafpunkte").replace(/Schluck\b/g, "Strafpunkt");
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
    gastNr: 1, gruesse: [], beamer: B.steuer(null) };
  geschrieben = null;
  gastgeberStart();
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
  if (alt && alt !== neu) P.idErsetzen(raum, alt, neu);
  meineId = neu;
  raum.gastgeber = neu;
  if (!Array.isArray(raum.admins)) raum.admins = [];
  const ich = raum.spieler.find((x) => x.id === meineId);
  meinName = ich ? ich.name : meinName;
  geschrieben = l.merker;
  eigeneMerken(code, "", A.titel(raum.anlass));
  gastgeberStart();
}

function gastgeberStart() {
  status = "";
  sitzungMerken();
  history.replaceState(null, "", `${BASIS}#r=${code}`);
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

const RAUM_TYPEN = new Set(["_hallo", "_spielwahl", "_ab18", "_trink", "_look", "_testkonten", "_tafel", "_admin", "_adminweg", "_raumende", "_beamer", "_alle"]);

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
      raum.partien[pid] = P.neu(pid, sp.id, von, Date.now());
      raum.meldung = { nr: (raum.meldung ? raum.meldung.nr : 0) + 1, pid, von };
      aend.lobby = true; aend.partien.add(pid);
    } else if (a.typ === "_ab18" && admin) { raum.ab18 = !raum.ab18; aend.lobby = true; }
    else if (a.typ === "_trink" && admin) { raum.ohneAlkohol = !raum.ohneAlkohol; aend.lobby = true; }
    else if (a.typ === "_look" && admin && A.lookGueltig(a.look)) { raum.look = a.look; aend.lobby = true; }
    else if (a.typ === "_testkonten" && admin) { raum.testkonten = !K.testkontenAn(raum); aend.lobby = true; }
    else if (a.typ === "_beamer" && admin) { if (!B.steuerAktion(raum, a, Date.now())) return; aend.lobby = true; }
    else if (a.typ === "_alle" && admin) {
      // Spiel fuer alle: jeder, der gerade verbunden ist, ist gleich dabei; die Spielleitung startet mit "Los"
      const sp = spiel(a.wert || a.id);
      if (!sp || Object.keys(raum.partien).length >= MAX_PARTIEN) return;
      const pid = `p${raum.pNr++}`;
      const p = P.neu(pid, sp.id, von, Date.now());
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
  else if (a.typ === "_neuauf") { if (!leitet || p.phase !== "laeuft" || !p.wartend.length) return; P.neueRunde(p, sp, raum); }
  else if (a.typ === "_botneu") { if (!leitet || !sp.bot || !P.botDazu(p, raum)) return; }
  else if (a.typ === "_botweg") { if (!leitet || !P.botWeg(p, a.id)) return; }
  else {
    if (p.phase !== "laeuft") return;
    const idx = p.mit.indexOf(von);
    if (idx < 0) return;
    if (spielAktion(p, sp, idx, a)) aend.tafel = true;
  }
  verteilen(aend);
}

function partieWeg(pid) {
  delete raum.partien[pid];
  clearTimeout(botTimer[pid]); delete botTimer[pid];
}

// -> true, wenn dabei ein Sieg in die Gesamtwertung kam
function spielAktion(p, sp, idx, a) {
  const nm = P.namen(raum, p);
  p.s.anzahl = p.mit.length;
  try { sp.aktion(p.s, idx, a, nm, raum); } catch (e) { console.error(e); }
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
  const namen = e.sieger.map((j) => p.mit[j]).filter((id) => id && !P.istBot(id)).map((id) => P.nameVon(raum, p, id));
  if (!namen.length) return false;
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
    if (zurueck) { P.idErsetzen(raum, zurueck.id, von); sp = zurueck; }
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
    const teile = standTeile(raum);
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
  history.replaceState(null, "", `${BASIS}#r=${code}`);
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
  if (netz.verbunden) halloSenden();
}
function halloSenden() {
  if (!netz || rolle !== "gast") return;
  netz.aktionSenden(meineId, { typ: "_hallo", name: meinName }).catch((e) => console.warn(e));
  adminBeweisSenden();
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
function ansichtPruefen() {
  if (!raum) return;
  if (ansicht && !raum.partien[ansicht]) { ansicht = null; hinweis("Das Spiel ist beendet"); }
  const m = raum.meldung;
  // wer ein Spiel startet, sieht es sofort
  if (m && m.von === meineId && m.nr > eigeneMeldung) {
    eigeneMeldung = m.nr;
    if (raum.partien[m.pid]) { ansicht = m.pid; tafelAuf = false; steuerAuf = false; window.scrollTo(0, 0); }
  }
  // ein Spiel, bei dem ich dabei bin, geht los: aus der Uebersicht hinschalten, sonst melden
  Object.values(raum.partien).forEach((p) => {
    const alt = phasen[p.pid];
    phasen[p.pid] = p.phase;
    if (alt !== "sammeln" || p.phase !== "laeuft" || !p.mit.includes(meineId)) return;
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

// "Neues Spiel: Quiz-Duell - mitmachen?" oben bei allen, die noch nicht dabei sind
function ansageZeigen() {
  const m = raum && raum.meldung;
  const p = m && raum.partien[m.pid];
  const el = document.getElementById("ansage");
  // "Spiel fuer alle" (Spielleitung): wer verbunden war, ist schon dabei - nur Bescheid geben
  const alle = m && p && m.alle && m.nr > ansageNr && m.von !== meineId && p.mit.includes(meineId) && p.phase === "sammeln";
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
  const zeigen = m && p && m.nr > ansageNr && m.von !== meineId && !p.mit.includes(meineId) && !p.wartend.includes(meineId)
    && (p.phase === "sammeln" || P.mittendrin(p.spiel));
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
  if (rolle === "gastgeber") return ausfuehren(meineId, a);
  if (netz) netz.aktionSenden(meineId, a).catch((e) => { console.warn(e); hinweis("Nicht gesendet – keine Verbindung?"); });
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
  return `<span class="pille ${sp.online ? "" : "aus"}"><span class="farbe f${sp.platz % 20}"></span>${esc(sp.name)}${schilder(sp.name, sp.id)}${sp.id === meineId ? " (du)" : ""}</span>`;
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
  if (steuerAuf && zeigeSteuer()) return !aend.lobby;
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

// ---------------------------------------------------------------- Zeichnen
const gesehen = new Set();
function zeichnen() {
  document.body.classList.remove("nachtmodus");
  A.lookAnwenden(raum ? raum.look : null);
  const fokus = document.activeElement && document.activeElement.id;
  // halb getippte Eingaben der Tafel und des Raums ueberstehen das Neuzeichnen
  const felder = {};
  document.querySelectorAll("input[id^='tt-'],select[id^='tt-'],input[id^='rf-'],select[id^='rf-']").forEach((f) => { felder[f.id] = f.value; });
  if (raum && !status) tafelPruefen();
  let musik = null;
  if (status || !raum) app.innerHTML = statusBild();
  else if (steuerAuf && zeigeSteuer()) app.innerHTML = steuerBild();
  else if (tafelAuf) app.innerHTML = tafelBild();
  else if (ansicht && raum.partien[ansicht]) {
    const p = raum.partien[ansicht];
    const sp = spiel(p.spiel);
    const ich = p.mit.indexOf(meineId);
    app.innerHTML = partieBild(p, sp, ich);
    partieSig = sigFuer(p);
    if (p.phase === "laeuft" && ich >= 0) {
      const nm = P.namen(raum, p);
      try { musik = sp.musik ? sp.musik(p.s, ich, raum) : null; } catch (e) { musik = null; }
      if (sp.nach) try { sp.nach(p.s, ich, sendenFuer(p.pid), nm, raum); } catch (e) { console.error(e); }
    }
  } else { ansicht = null; app.innerHTML = raumBild(); }
  TON.musik(musik);
  Object.entries(felder).forEach(([id, wert]) => { const f = document.getElementById(id); if (f) f.value = wert; });
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
    else { gesehen.add(k); if (el.dataset.ton) { const n = el.dataset.ton, v = Number(el.dataset.tonNach || 0); v ? setTimeout(() => TON.spiele(n), v) : TON.spiele(n); } }
  });
  document.querySelectorAll(".urteil").forEach((el) => {
    const k = "k:" + el.textContent.slice(0, 80);
    if (!gesehen.has(k)) { gesehen.add(k); if (/🏆|gewinnt/.test(el.textContent)) konfetti(); }
    else el.classList.add("still");
  });
  if (gesehen.size > 3000) gesehen.clear();
  if (fokus && document.getElementById(fokus) && document.getElementById(fokus).tagName === "INPUT") document.getElementById(fokus).focus();
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
    ${zeigeSteuer() ? steuerKarte() : binAdmin() ? "" : codeKarte()}
    <p class="leise klein mitte">Trinkt verantwortungsvoll – Wasser zählt auch als Schluck. 💧</p>`;
}

function partieKarte(p) {
  const sp = spiel(p.spiel);
  if (!sp) return "";
  const dabei = p.mit.includes(meineId), wartet = p.wartend.includes(meineId);
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
  const leitet = P.darfLeiten(p, meineId, zeigeSteuer());
  const offen = offenFuerMich();
  let inhalt;
  if (p.phase === "sammeln") inhalt = sammelBild(p, sp, nm, ich, leitet);
  else if (ich < 0) inhalt = zuschauBild(p, sp, nm);
  else {
    try { inhalt = sp.render(p.s, ich, nm, raum); if (raum.ohneAlkohol) inhalt = ohneAlkohol(inhalt); }
    catch (e) { console.error(e); inhalt = `<p class="fehler">Anzeigefehler: ${esc(e.message)}</p>`; }
    if (leitet && p.wartend.length) inhalt = `<div class="hinweisbox vorgemerkt">📌 ${p.wartend.length === 1 ? "1 wartet" : `${p.wartend.length} warten`} auf die nächste Runde: ${p.wartend.map((id) => esc(P.nameVon(raum, p, id))).join(", ")}
      ${knopf("🔄 Neue Runde mit allen", { typ: "_neuauf" }, "gelb")}</div>${inhalt}`;
  }
  return `${gastgeberHinweis()}
    <div class="kopf"><span>${sp.emoji} ${esc(sp.name)}</span>
      <span class="kopfknoepfe"><button class="klein2 ${offen ? "tw-blinkt" : ""}" data-tt-auf title="Turniertafel">🏆 ${offen ? `⚔️ ${offen}` : rundenUhr() || "Tafel"}</button>
      <button class="klein2" data-ansicht="">‹ Übersicht</button>
      ${leitet ? `<button class="klein2" data-a='{"typ":"_zurueck"}'>⏹️ Beenden</button>` : ""}</span></div>
    <div class="spielflaeche">${inhalt}</div>
    <div class="fuss">${p.mit.map((id, i) => { const s = raum.spieler.find((x) => x.id === id); return `<span class="pille ${!s || s.online ? "" : "aus"}"><span class="farbe f${farbeVon(p, id)}"></span>${esc(nm[i])}${P.istBot(id) ? "" : schilder(nm[i], id)}${i === ich ? " (du)" : ""}</span>`; }).join("")}</div>`;
}

function sammelBild(p, sp, nm, ich, leitet) {
  const liste = p.mit.map((id, j) => `<li class="sp an ${P.istBot(id) ? "bot" : ""}"><span class="farbe f${farbeVon(p, id)}"></span>${esc(nm[j])}${P.istBot(id) ? "" : schilder(nm[j], id)}
      ${j === 0 ? ` <span class="leise">(startet)</span>` : ""}${id === meineId ? ` <span class="leise">(du)</span>` : ""}
      ${P.istBot(id) && leitet ? `<span class="rechts">${knopf("✕", { typ: "_botweg", id }, "klein2")}</span>` : ""}</li>`).join("");
  return `<div class="frage">Wer macht mit?</div>
    <p class="mitte leise">${esc(sp.kurz)}</p>
    <ul class="spieler">${liste}</ul>
    ${ich < 0 ? knopf("🙋 Mitmachen", { typ: "_mit" }, "gross gruen") : ich > 0 ? knopf("Doch nicht", { typ: "_raus" }, "zweit") : ""}
    ${leitet && sp.bot ? knopf("🤖 Computer-Mitspieler dazu", { typ: "_botneu" }, "zweit") : ""}
    ${leitet ? knopf(`▶️ Los geht's (${p.mit.length} ${p.mit.length === 1 ? "Spieler" : "Spieler"})`, { typ: "_los" }, "gross", `data-klang="los"`)
      : `<div class="hinweisbox warten">${esc(nm[0])} startet, sobald alle dabei sind …</div>`}`;
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
      <p class="leise klein">Beamer, Diashow, Spiel für alle, Aussehen, Testkonten${raum.look === "halloween" ? ", Schreckmoment" : ""}</p>
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
  const el = ev.target.closest("[data-anlass],[data-zurueck],#beitreten,#weitermachen,[data-ansicht],[data-a],[data-teilen],[data-ansage-mit],[data-ansage-weg],[data-steuern],[data-code],[data-raum-neu],[data-uebernehmen],[data-ende-frage],[data-neu-laden],[data-steuer-auf],[data-steuer-zu],[data-ohne-code]");
  if (!el) return;
  if (el.dataset.steuerAuf !== undefined || el.dataset.steuerZu !== undefined) {
    steuerAuf = el.dataset.steuerAuf !== undefined; tafelAuf = false;
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
    return ansageWeg();
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
  vibriere(25);
  TON.spiele(el.dataset.klang || "klick");
  senden(a);
  if (el.dataset.ansicht !== undefined) { zeichnen(); window.scrollTo(0, 0); }
});

document.body.insertAdjacentHTML("beforeend", TON.schalterHTML());
function zeigeHinweis(text) {
  let h = document.getElementById("ton-hinweis");
  if (!h) { h = document.createElement("div"); h.id = "ton-hinweis"; document.body.appendChild(h); }
  h.textContent = text; h.classList.remove("weg"); clearTimeout(h._t); h._t = setTimeout(() => h.classList.add("weg"), 1400);
}

startBild();
