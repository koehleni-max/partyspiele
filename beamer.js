// Beamer-Ansicht (Nico 26.10.2026, Halloween-Fassung Schritt B; Huettenplan 16.6, 17.11, 17.12, 19.6).
//
// Ein Geraet am Beamer (z. B. Handheld-PC per HDMI) oeffnet den Raum-Link mit dem Zusatz "&beamer". Es ist KEIN Spieler:
// es meldet sich nicht beim Gastgeber an (kein "_hallo"), zaehlt nicht als Gast, bekommt keine Punkte und sendet nichts.
// Es liest nur den Stand des Raums und zeigt ihn gross, im Aussehen des Anlasses. Grosse Effekte (Konfetti, Fledermaeuse,
// Nebel, Schreckmoment) laufen NUR hier - die Handys bleiben stromsparend.
//
// Diashow: wechselt von selbst durch die Seiten, die gerade Daten haben (SEITEN, Reihenfolge fest). Die Spielleitung
// steuert sie auf der Steuerseite (raum.beamer, siehe steuer()):
//   diashow  an/aus             seite + seit   von Hand gewaehlte Seite (bleibt PAUSE lang stehen, dann wieder Diashow)
//   dauer    Sekunden je Seite  weg            Zaehler "Ereignis ausblenden"      schreck   Zaehler Schreckmoment
// Ereignisse unterbrechen die Diashow kurz (ereignisse()): neues Spiel (raum.meldung), Pokal-Uebergabe und Abendwertung
// (tafel.wertung.uebergabe/abend), Begruessung neuer Gaeste (raum.gruesse, nur "Gast Nummer X"), Schreckmoment.
import { Verbindung, zufallsText, standLesen } from "./net.js";
import { SPIELE } from "./spiele.js";
import * as TON from "./ton.js";
import * as TAFEL from "./tafel.js";
import * as W from "./wertung.js";
import * as P from "./partien.js";
import * as A from "./anlass.js";
import { esc } from "./hilfe.js";

export const PAUSE = 30 * 60000;          // von Hand gewaehlte Seite bleibt so lange stehen
export const DAUERN = [10, 15, 30, 60];   // Sekunden je Seite (Steuerseite)
export const DAUER = 15;
export const SEITEN = [
  { id: "wertung", emo: "🏅", name: "Gesamtwertung" },
  { id: "pokal", emo: "🏆", name: "Wanderpokal" },
  { id: "pong", emo: "🏓", name: "Turnierbaum" },
  { id: "rennen", emo: "🏁", name: "Rennzeiten" },
  { id: "spiele", emo: "🎮", name: "Laufende Spiele" },
  { id: "glueck", emo: "🎡", name: "Glücksrad" },
  { id: "mitmachen", emo: "📲", name: "Mitmachen (QR-Code)" },
];
export const seiteGueltig = (id) => SEITEN.some((s) => s.id === id);
export const seiteName = (id) => { const s = SEITEN.find((x) => x.id === id); return s ? `${s.emo} ${s.name}` : ""; };
export const DAUER_EREIGNIS = { gruss: 7000, spiel: 10000, pokal: 16000, abend: 20000, schreck: 2600 };
const MED = { 1: "🥇", 2: "🥈", 3: "🥉" };
const spiel = (id) => SPIELE.find((x) => x.id === id);

// ---------------------------------------------------------------- Steuerung (Stand im Raum, nur die Spielleitung aendert)
export function steuer(raum) {
  const b = (raum && raum.beamer) || {};
  return {
    diashow: b.diashow !== false, dauer: DAUERN.includes(b.dauer) ? b.dauer : DAUER,
    seite: seiteGueltig(b.seite) ? b.seite : null, seit: Number(b.seit) || 0,
    weg: Number(b.weg) || 0, schreck: Number(b.schreck) || 0,
  };
}

// Aktion "_beamer" beim Gastgeber (Rechte prueft app.js). -> true, wenn sich etwas geaendert hat
export function steuerAktion(raum, a, jetzt) {
  const b = steuer(raum);
  if (a.was === "diashow") { b.diashow = !b.diashow; if (b.diashow) { b.seite = null; b.seit = 0; } }
  else if (a.was === "dauer") { if (!DAUERN.includes(a.s)) return false; b.dauer = a.s; }
  else if (a.was === "seite") {
    if (a.seite == null) { b.seite = null; b.seit = 0; }
    else if (seiteGueltig(a.seite)) { b.seite = a.seite; b.seit = jetzt; }
    else return false;
  } else if (a.was === "weg") b.weg += 1;
  else if (a.was === "schreck") { if (raum.look !== "halloween") return false; b.schreck += 1; }
  else return false;
  raum.beamer = b;
  return true;
}

// "fest" = von Hand gewaehlt (bis), "diashow" = wechselt, "aus" = steht auf der aktuellen Seite
export function modus(st, jetzt) {
  if (st.seite && jetzt - st.seit < PAUSE) return { art: "fest", seite: st.seite, bis: st.seit + PAUSE };
  return { art: st.diashow ? "diashow" : "aus" };
}

// ---------------------------------------------------------------- Daten je Seite (null = nichts zu zeigen)
const wertungVon = (raum) => { const w = raum && raum.tafel && raum.tafel.wertung; return w && Array.isArray(w.buchungen) && w.runde ? w : null; };
const stationen = (raum, art) => ((raum && raum.tafel && raum.tafel.stationen) || []).filter((s) => s.art === art);

function datenWertung(raum) {
  const w = wertungVon(raum);
  if (!w) return null;
  const runde = W.stand(w, w.runde.nr).filter((x) => x.summe > 0);
  if (runde.length) return { titel: `Gesamtwertung · Runde ${w.runde.nr}`, liste: runde, w };
  const abend = W.stand(w, null).filter((x) => x.summe > 0);
  if (abend.length) return { titel: "Abendwertung bisher", liste: abend, w, hinweis: `Runde ${w.runde.nr} hat noch keine Punkte` };
  return null;
}
function datenPokal(raum) { const w = wertungVon(raum); return w && (w.pokal || w.runde.ende) ? w : null; }
function datenPong(raum) {
  const l = stationen(raum, "pong").filter((s) => s.baum || (s.teams || []).length);
  return l.find((s) => s.baum) || l[0] || null;
}
function datenRennen(raum) {
  const l = stationen(raum, "rennen").filter((s) => (s.zeiten || []).some((z) => z.n != null || z.s != null));
  return l.sort((x, y) => y.zeiten.length - x.zeiten.length)[0] || null;
}
const datenSpiele = (raum) => { const l = P.liste(raum || {}).filter((p) => spiel(p.spiel)); return l.length ? l : null; };
const datenGlueck = (raum) => (raum && raum.glueck && raum.glueck.letzter && raum.glueck.letzter.name ? raum.glueck.letzter : null);
const DATEN = { wertung: datenWertung, pokal: datenPokal, pong: datenPong, rennen: datenRennen, spiele: datenSpiele, glueck: datenGlueck, mitmachen: () => true };

export const verfuegbar = (raum) => SEITEN.map((s) => s.id).filter((id) => { try { return !!DATEN[id](raum); } catch (e) { return false; } });

// naechste Seite mit Daten nach "aktuell" (Reihenfolge wie SEITEN, rundherum)
export function naechste(da, aktuell) {
  if (!da.length) return null;
  const ids = SEITEN.map((s) => s.id);
  const i = ids.indexOf(aktuell);
  for (let k = 1; k <= ids.length; k++) { const id = ids[(i + k + ids.length) % ids.length]; if (da.includes(id)) return id; }
  return da[0];
}

// Welche Seite jetzt? zustand = {seite, ab} (lokal am Beamer). -> {seite, neu}
export function waehlen(raum, zustand, jetzt, uhr, ereignisLaeuft) {
  const st = steuer(raum), m = modus(st, jetzt), da = verfuegbar(raum);
  if (m.art === "fest") return { seite: m.seite, neu: m.seite !== zustand.seite };
  const hat = zustand.seite && da.includes(zustand.seite);
  if (!hat) { const s = naechste(da, zustand.seite); return { seite: s, neu: s !== zustand.seite }; }
  if (m.art === "aus" || ereignisLaeuft) return { seite: zustand.seite, neu: false };
  if (uhr - zustand.ab >= st.dauer * 1000) { const s = naechste(da, zustand.seite); return { seite: s, neu: s !== zustand.seite, frisch: true }; }
  return { seite: zustand.seite, neu: false };
}

// ---------------------------------------------------------------- Ereignisse
export function marken(raum) {
  const w = wertungVon(raum), st = steuer(raum);
  return {
    meldung: raum.meldung ? Number(raum.meldung.nr) || 0 : 0,
    uebergabe: (w && w.uebergabe) || 0, abend: (w && w.abend) || 0,
    gast: Math.max(0, ...(raum.gruesse || []).map((g) => Number(g.nr) || 0)),
    schreck: st.schreck, weg: st.weg,
  };
}
// alt = Marken beim letzten Stand (null = erster Stand: nichts Altes nachholen)
export function ereignisse(alt, raum) {
  const neu = marken(raum), liste = [];
  if (!alt) return { liste, marken: neu, weg: false };
  (raum.gruesse || []).filter((g) => g.nr > alt.gast).sort((x, y) => x.nr - y.nr).forEach((g) => liste.push({ art: "gruss", name: g.name, nr: g.nr }));
  if (neu.meldung > alt.meldung && raum.meldung && raum.partien && raum.partien[raum.meldung.pid]) liste.push({ art: "spiel", pid: raum.meldung.pid, von: raum.meldung.von, alle: !!raum.meldung.alle });
  if (neu.uebergabe > alt.uebergabe) liste.push({ art: "pokal" });
  if (neu.abend > alt.abend) liste.push({ art: "abend" });
  if (neu.schreck > alt.schreck && raum.look === "halloween") liste.push({ art: "schreck" });
  return { liste, marken: neu, weg: neu.weg > alt.weg };
}

// ---------------------------------------------------------------- Seiten (HTML)
const cd = (ende, jetzt) => `<b class="bm-cd" data-bcd="${ende}">${W.uhrText(ende - jetzt)}</b>`;
const namenText = (l) => l.map((n) => `<b>${esc(n)}</b>`).join(" &amp; ");

function seiteWertung(d) {
  const top = d.liste.slice(0, 12), mehr = d.liste.length - top.length;
  const pokal = (n) => d.w.pokal && d.w.pokal.some((p) => p.toLocaleLowerCase("de") === n.toLocaleLowerCase("de"));
  return `<h2 class="bm-h">🏅 ${esc(d.titel)}</h2>${d.hinweis ? `<p class="bm-leise mitte">${esc(d.hinweis)}</p>` : ""}
    <ol class="bm-rang ${top.length > 6 ? "zwei" : ""}" style="--zeilen:${Math.ceil(top.length / (top.length > 6 ? 2 : 1))}">${top.map((x) => `
      <li class="p${x.platz}"><span class="bm-platz">${MED[x.platz] || x.platz + "."}</span><span class="bm-name">${pokal(x.name) ? "🏆 " : ""}${esc(x.name)}
        <small>${Object.values(x.kats).map((c) => `${c.emo} ${c.punkte}`).join(" · ")}</small></span><b class="bm-wert">${x.summe}</b></li>`).join("")}</ol>
    ${mehr > 0 ? `<p class="bm-leise mitte">+ ${mehr} weitere</p>` : ""}`;
}

function seitePokal(w, jetzt) {
  const vorn = W.stand(w, w.runde.nr).filter((x) => x.summe > 0 && x.platz === 1);
  const r = w.runde;
  return `<div class="bm-pokal"><div class="bm-pokalbild">🏆</div>
    <p class="bm-gross">${w.pokal ? `${namenText(w.pokal)} ${w.pokal.length > 1 ? "halten" : "hält"} den Wanderpokal` : "Der Wanderpokal ist noch zu haben!"}</p>
    <p class="bm-zeile">${r.ende ? `Runde ${r.nr} endet in ${cd(r.ende, jetzt)}` : `Runde ${r.nr} läuft`}</p>
    ${vorn.length ? `<p class="bm-leise">Gerade vorne: ${namenText(vorn.map((x) => x.name))} mit ${vorn[0].summe} ${vorn[0].summe === 1 ? "Punkt" : "Punkten"}</p>` : `<p class="bm-leise">In dieser Runde hat noch niemand Punkte.</p>`}</div>`;
}

function seitePong(st, oa) {
  const titel = `${W.anzeigeName(st, oa)}${oa || st.name !== "Bierpong" ? "" : "-Turnier"}`;
  const tn = (id) => { const t = (st.teams || []).find((x) => x.id === id); return t ? esc(TAFEL.teamName(t)) : ""; };
  if (!st.baum) {
    return `<h2 class="bm-h">🏓 ${esc(titel)}</h2><p class="bm-leise mitte">${st.teams.length} ${st.teams.length === 1 ? "Team" : "Teams"} angemeldet – gleich wird ausgelost</p>
      <div class="bm-teams">${st.teams.map((t) => `<span>${esc(TAFEL.teamName(t))}</span>`).join("")}</div>`;
  }
  const n = st.baum.length;
  const seite = (s, id) => {
    if (id == null) return `<span class="bm-team offen">wartet …</span>`;
    const g = TAFEL.siegerVon(s);
    return `<span class="bm-team ${g === id ? "sieger" : g != null ? "raus" : ""}">${g === id ? "🏆 " : ""}${tn(id)}</span>`;
  };
  const box = (s) => (s.frei ? `<div class="bm-sp frei">${seite({ sieger: s.a }, s.a)}<small>Freilos</small></div>` : `<div class="bm-sp">${seite(s, s.a)}${seite(s, s.b)}</div>`);
  const podest = TAFEL.pongPodest(st);
  const sieger = podest.length && podest[0].platz === 1 ? podest[0].namen[0] : null;
  return `<h2 class="bm-h">🏓 ${esc(titel)}</h2>
    ${sieger ? `<p class="bm-sieger">🏆 ${esc(sieger)} gewinnt das Turnier!</p>` : ""}
    <div class="bm-baum" style="--runden:${n}">${st.baum.map((runde, r) => `<div class="bm-runde"><h3>${TAFEL.rundenName(r, n)}</h3>
      <div class="bm-spiele">${runde.map(box).join("")}${r === n - 1 && st.platz3 ? `<h3>Spiel um Platz 3</h3>${box(st.platz3)}` : ""}</div></div>`).join("")}</div>`;
}

function seiteRennen(st, oa) {
  const { schnell, nach } = TAFEL.rennenTabellen(st);
  const lauf = (f) => (f === "n" ? (oa ? "1. Lauf" : "nüchtern") : (oa ? "2. Lauf" : "später"));
  const platz = new Map(nach.map((z) => [z.id, z.platz]));
  const zeilen = [...st.zeiten].filter((z) => z.n != null || z.s != null).sort((x, y) => {
    const dx = platz.has(x.id) ? x.s - x.n : null, dy = platz.has(y.id) ? y.s - y.n : null;
    if (dx != null && dy != null) return dy - dx;
    if (dx != null || dy != null) return dx != null ? -1 : 1;
    return (x.n ?? Infinity) - (y.n ?? Infinity);
  }).slice(0, 8);
  return `<h2 class="bm-h">🏁 ${esc(st.name)}: ${oa ? "1. gegen 2. Lauf" : "nüchtern gegen später"}</h2>
    <div class="bm-renn-oben">
      ${nach.length ? `<div class="bm-kachel rot"><small>Wer hat am meisten nachgelassen?</small><b>${esc(nach[0].name)}</b><span>${TAFEL.diffText(nach[0].s - nach[0].n)}</span></div>` : ""}
      ${schnell.length ? `<div class="bm-kachel gruen"><small>Schnellste Zeit ${oa ? "im 1. Lauf" : "nüchtern"}</small><b>${esc(schnell[0].name)}</b><span>${TAFEL.zeitText(schnell[0].n)}</span></div>` : ""}
    </div>
    <table class="bm-tab"><thead><tr><th>Fahrer</th><th>${lauf("n")}</th><th>${lauf("s")}</th><th>Unterschied</th></tr></thead><tbody>
      ${zeilen.map((z) => { const d = platz.has(z.id) ? z.s - z.n : null; return `<tr><td>${platz.has(z.id) ? (MED[platz.get(z.id)] || platz.get(z.id) + ".") + " " : ""}${esc(z.name)}</td>
        <td>${TAFEL.zeitText(z.n)}</td><td>${TAFEL.zeitText(z.s)}</td><td class="${d > 0 ? "schlechter" : d < 0 ? "besser" : ""}">${d == null ? "–" : TAFEL.diffText(d)}</td></tr>`; }).join("")}
    </tbody></table>`;
}

function partieZustand(p) {
  return p.phase === "sammeln" ? "sucht Mitspieler – mitmachen!" : P.mittendrin(p.spiel) ? "läuft · Einsteigen geht" : "läuft · nächste Runde vormerken";
}
function pillen(raum, p, max = 12) {
  const nm = P.namen(raum, p), zeig = nm.slice(0, max);
  return `${zeig.map((n) => `<span class="bm-pille">${esc(n)}</span>`).join("")}${nm.length > max ? `<span class="bm-pille leise">+ ${nm.length - max}</span>` : ""}`;
}
function seiteSpiele(raum, liste) {
  const zeig = liste.slice(0, 6);
  return `<h2 class="bm-h">🎮 Laufende Spiele</h2>
    <div class="bm-partien ${zeig.length > 2 ? "drei" : ""}">${zeig.map((p) => { const sp = spiel(p.spiel); return `
      <div class="bm-partie ${p.phase === "sammeln" ? "sammelt" : ""}"><div class="bm-partie-kopf"><span class="bm-emo">${sp.emoji}</span><span><b>${esc(sp.name)}</b><small>${partieZustand(p)}</small></span></div>
        <div class="bm-pillen">${pillen(raum, p, zeig.length > 2 ? 8 : 14)}</div></div>`; }).join("")}</div>
    ${liste.length > zeig.length ? `<p class="bm-leise mitte">+ ${liste.length - zeig.length} weitere Spiele</p>` : ""}`;
}

function seiteGlueck(g) {
  return `<div class="bm-pokal"><div class="bm-pokalbild">🎡</div><p class="bm-leise">Letzter Glücksrad-Gewinner</p>
    <p class="bm-gross"><b>${esc(g.name)}</b></p>${g.preis ? `<p class="bm-zeile">bekommt: <b>${esc(g.preis)}</b></p>` : ""}</div>`;
}

function seiteMitmachen(raum) {
  const da = (raum.spieler || []).filter((x) => x.online).length;
  return `<div class="bm-mitmachen"><div class="bm-qrgross" data-bqr></div>
    <div class="bm-mm-text"><h2 class="bm-h">📲 Mitspielen!</h2>
      <p class="bm-zeile">Handy-Kamera auf den Code halten</p><p class="bm-zeile">Namen eingeben – fertig</p>
      <p class="bm-leise">${da} ${da === 1 ? "Gast ist" : "Gäste sind"} schon dabei · kein Konto, keine App</p></div></div>`;
}

const LEER = { wertung: "Noch keine Punkte – das erste Spiel bringt sie.", pokal: "Noch keine Runde gestartet.", pong: "Noch kein Turnier angelegt.",
  rennen: "Noch keine Rennzeiten.", spiele: "Gerade läuft kein Spiel.", glueck: "Das Glücksrad hat sich noch nicht gedreht." };

// HTML einer Seite (fuer die Steuerseite gibt es "leer", wenn von Hand eine Seite ohne Daten gewaehlt wurde)
export function seiteHTML(raum, id, jetzt) {
  const oa = !!raum.ohneAlkohol;
  let d = null;
  try { d = DATEN[id] ? DATEN[id](raum) : null; } catch (e) { d = null; }
  if (!d) return `<div class="bm-leer"><div class="bm-pokalbild">${(SEITEN.find((s) => s.id === id) || {}).emo || "✨"}</div><h2 class="bm-h">${esc(seiteName(id).replace(/^\S+ /, ""))}</h2><p class="bm-leise">${LEER[id] || ""}</p></div>`;
  if (id === "wertung") return seiteWertung(d);
  if (id === "pokal") return seitePokal(d, jetzt);
  if (id === "pong") return seitePong(d, oa);
  if (id === "rennen") return seiteRennen(d, oa);
  if (id === "spiele") return seiteSpiele(raum, d);
  if (id === "glueck") return seiteGlueck(d);
  return seiteMitmachen(raum);
}

// ---------------------------------------------------------------- Ereignis-Bilder
export function ereignisHTML(raum, e, jetzt) {
  if (e.art === "gruss") {
    return `<div class="bm-e-box bm-gruss"><div class="bm-e-emo">${A.logo(raum.look)}</div><p class="bm-e-klein">Willkommen,</p>
      <p class="bm-e-gross">${esc(e.name)}!</p><p class="bm-e-nr">Gast Nummer ${e.nr}</p></div>`;
  }
  if (e.art === "spiel") {
    const p = raum.partien[e.pid], sp = p && spiel(p.spiel);
    if (!sp) return "";
    return `<div class="bm-e-box bm-e-spiel"><div class="bm-e-emo">${sp.emoji}</div>
      <p class="bm-e-gross">${esc(sp.name)} läuft – mitmachen!</p>
      <p class="bm-e-klein">${e.alle ? "Die Spielleitung startet es für alle" : `gestartet von ${esc(P.nameVon(raum, p, e.von))}`} · am Handy oben „Mitmachen“ tippen</p>
      <div class="bm-pillen mitte">${pillen(raum, p, 16)}</div></div>`;
  }
  if (e.art === "pokal") {
    return `<div class="bm-e-box bm-e-pokal">${W.renderPokal(raum.tafel, { ohneAlkohol: !!raum.ohneAlkohol })}</div>`;
  }
  if (e.art === "abend") {
    const w = wertungVon(raum);
    const tab = W.stand(w, null).filter((x) => x.summe > 0 && x.platz <= 3);
    const traeger = w.runden.filter((x) => x.sieger.length);
    return `<div class="bm-e-box bm-e-abend"><div class="tt-ehrungtitel">🌙 Abendwertung</div>
      ${tab.length ? `<div class="tt-podest">${tab.map((x) => `<div class="tt-rang r${x.platz}"><span>${MED[x.platz]}</span><span class="tt-rangnamen"><b>${esc(x.name)} (${x.summe})</b></span></div>`).join("")}</div>` : `<p class="bm-leise">Noch keine Punkte.</p>`}
      ${traeger.length ? `<p class="bm-leise">🏆 Pokalträger: ${traeger.slice(-6).map((x) => `Runde ${x.nr}: ${esc(x.sieger.join(" & "))}`).join(" · ")}</p>` : ""}</div>`;
  }
  return "";
}

// Selbst gezeichnetes Gruselgesicht (SVG, keine fremde Vorlage): fahle Fratze, leere Augen mit Glut, offener Schrei-Mund
export const FRATZE = `<svg class="bm-fratze" viewBox="0 0 400 500" aria-hidden="true">
  <defs><radialGradient id="bmhaut" cx="50%" cy="38%" r="62%"><stop offset="0" stop-color="#ece6d2"/><stop offset=".55" stop-color="#a39c86"/><stop offset="1" stop-color="#1f1d17"/></radialGradient>
    <radialGradient id="bmglut"><stop offset="0" stop-color="#fff6d0"/><stop offset=".25" stop-color="#ff3a00"/><stop offset="1" stop-color="#ff1a0000"/></radialGradient>
    <radialGradient id="bmloch" cx="50%" cy="45%"><stop offset=".55" stop-color="#000"/><stop offset="1" stop-color="#2b1a12"/></radialGradient></defs>
  <path d="M200 18C318 18 372 132 364 246C356 352 312 470 200 488C88 470 44 352 36 246C28 132 82 18 200 18Z" fill="url(#bmhaut)"/>
  <path d="M70 150C110 120 160 128 182 160M330 150C290 120 240 128 218 160" stroke="#3a3326" stroke-width="10" fill="none" stroke-linecap="round"/>
  <ellipse cx="135" cy="218" rx="54" ry="66" fill="url(#bmloch)"/><ellipse cx="265" cy="218" rx="54" ry="66" fill="url(#bmloch)"/>
  <circle class="bm-glut" cx="140" cy="228" r="22" fill="url(#bmglut)"/><circle class="bm-glut" cx="260" cy="228" r="22" fill="url(#bmglut)"/>
  <path d="M188 292L200 258L212 292Q200 300 188 292Z" fill="#1d1a12"/>
  <path d="M118 352Q200 300 282 352Q276 468 200 476Q124 468 118 352Z" fill="#050302"/>
  <path d="M126 350L140 378L152 336L166 372L180 326L194 366L206 324L220 366L234 330L248 372L262 338L274 376L282 352Q200 304 118 352Z" fill="#d9d2bb"/>
  <path d="M146 466L156 436L168 470L182 440L194 474L208 442L220 474L234 440L246 468L254 450Q240 476 200 478Q160 476 146 466Z" fill="#cfc7ae"/>
  <path d="M84 300Q70 340 92 392M316 300Q330 340 308 392M200 40L192 96L206 120M300 70L276 110" stroke="#4b4334" stroke-width="4" fill="none"/>
</svg>`;

// ---------------------------------------------------------------- Anzeige am Geraet (DOM)
let netz = null, raum = null, merker = {}, mk = null, app = null;
let zustand = { seite: null, ab: 0 }, schlange = [], laufend = null, laufTimer = null, schreckTimer = null, gezeigt = "";
let zuletztFledermaus = 0;
const verlauf = [];
const jetztG = () => (netz && raum ? Date.now() + netz.versatz - (raum.uhr || 0) : Date.now());
const merke = (x) => { verlauf.push(x); if (verlauf.length > 200) verlauf.shift(); };

export async function start(code, wurzel) {
  app = wurzel;
  document.body.classList.add("beamer");
  document.title = "📽️ Beamer – Partyspiele";
  window.__beamer = { raum: () => raum, seite: () => zustand.seite, ereignis: () => (laufend ? laufend.art : null), verlauf: () => verlauf.slice() };
  app.innerHTML = `<div class="bm">
      <div class="bm-kopf"><span class="bm-titel">📽️ Beamer</span><span class="bm-zeit"></span></div>
      <div class="bm-buehne"><div class="bm-inhalt"><div class="bm-leer"><div class="bm-pokalbild">⏳</div><p class="bm-leise">Raum wird geladen …</p></div></div><i class="bm-fortschritt"></i></div>
      <div class="bm-fuss"><div class="bm-punkte"></div><div class="bm-modus"></div><div class="bm-qrklein" data-bqr title="Mitmachen"></div></div>
    </div>
    <div class="bm-ereignis" hidden></div>
    <div class="bm-schreck" hidden></div>
    <button class="bm-start" data-bm-start><span>▶️ Vollbild und Ton an</span><small>einmal klicken – danach läuft alles von selbst</small></button>`;
  document.querySelector("[data-bm-start]").addEventListener("click", vollbild);
  // aendert sich der Platz (Vollbild, Fuss bricht um, QR-Code geladen), passt der Inhalt sich neu ein
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => einpassen(app.querySelector(".bm-inhalt"), app.querySelector(".bm-buehne"), 1));
    ro.observe(app.querySelector(".bm-buehne"));
  }
  ["mousemove", "pointerdown"].forEach((t) => document.addEventListener(t, mausDa, { passive: true }));
  mausDa();
  try {
    netz = await new Verbindung(code).start();
  } catch (e) { return fehler("Keine Verbindung zum Raum. Ist das Internet an? Dann die Seite neu laden."); }
  netz.anwesend(`beamer-${zufallsText(10)}`, "📽️ Beamer");   // nur fuer die Anzeige "Beamer verbunden" - kein Spieler
  netz.beobachten("stand", empfangen);
  setInterval(takt, 500);
}

function fehler(text) {
  const i = app.querySelector(".bm-inhalt");
  if (i) i.innerHTML = `<div class="bm-leer"><div class="bm-pokalbild">📡</div><p class="bm-gross">${esc(text)}</p></div>`;
}

async function vollbild() {
  const k = document.querySelector("[data-bm-start]");
  if (k) k.remove();
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch (e) { /* geht auch ohne */ }
  try { if (navigator.wakeLock) await navigator.wakeLock.request("screen"); } catch (e) { /* Bildschirm bleibt evtl. nicht an */ }
  if (TON.tonModus() === "aus") hinweis("Ton ist auf diesem Gerät aus – unten links einschalten");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && navigator.wakeLock && document.body.classList.contains("beamer")) navigator.wakeLock.request("screen").catch(() => {}); });

let mausTimer = null;
function mausDa() {
  document.body.classList.remove("maus-weg");
  clearTimeout(mausTimer);
  mausTimer = setTimeout(() => document.body.classList.add("maus-weg"), 3000);
}
function hinweis(text) {
  const d = document.createElement("div");
  d.className = "toast"; d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}

function empfangen(stand) {
  if (!stand) {
    raum = null; schlange = []; ereignisEnde();
    const i = app.querySelector(".bm-inhalt");
    if (i) i.innerHTML = `<div class="bm-leer"><div class="bm-pokalbild">👋</div><p class="bm-gross">Der Raum ist beendet.</p></div>`;
    gezeigt = "";
    return;
  }
  const l = standLesen(stand, merker);
  if (!l) return;
  merker = l.merker; raum = l.raum;
  A.lookAnwenden(raum.look);
  document.title = `📽️ ${A.titel(raum.anlass)} – Beamer`;
  const e = ereignisse(mk, raum);
  mk = e.marken;
  if (e.weg) { schlange = []; ereignisEnde(); merke({ ereignis: "weg" }); }
  e.liste.forEach((x) => (x.art === "schreck" ? schreck() : schlange.push(x)));
  if (!laufend) naechstesEreignis();
  takt(true);
}

function takt(stand) {
  if (!app) return;
  const z = app.querySelector(".bm-zeit");
  if (z) z.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (!raum) return;
  const jetzt = jetztG();
  const w = waehlen(raum, zustand, jetzt, Date.now(), !!laufend);
  if (w.neu || w.frisch) zustand = { seite: w.seite, ab: Date.now() };
  if (w.neu) merke({ seite: w.seite });
  if (w.neu || stand === true) zeichnen(w.neu);
  app.querySelectorAll("[data-bcd]").forEach((el) => {
    const rest = Number(el.dataset.bcd) - jetzt, t = W.uhrText(rest);
    if (el.textContent !== t) { el.textContent = t; el.classList.toggle("knapp", rest <= 60000); }
  });
  umgebung();
}

function zeichnen(neueSeite) {
  const jetzt = jetztG(), st = steuer(raum), m = modus(st, jetzt), da = verfuegbar(raum);
  const kopf = app.querySelector(".bm-titel");
  if (kopf) kopf.textContent = A.titel(raum.anlass);
  const punkte = app.querySelector(".bm-punkte");
  if (punkte) punkte.innerHTML = SEITEN.filter((s) => da.includes(s.id) || s.id === zustand.seite).map((s) => `<span class="${s.id === zustand.seite ? "an" : ""}">${s.emo} ${esc(s.name.replace(/ \(.*\)/, ""))}</span>`).join("");
  const mod = app.querySelector(".bm-modus");
  if (mod) mod.textContent = m.art === "fest" ? `📌 von Hand gewählt · Diashow ab ${new Date(m.bis - jetzt + Date.now()).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : m.art === "aus" ? "⏸️ Diashow aus" : "";
  const balken = app.querySelector(".bm-fortschritt");
  if (balken && neueSeite) {
    balken.style.animation = "none"; void balken.offsetWidth;
    balken.style.animation = m.art === "diashow" && da.length > 1 ? `bm-balken ${st.dauer}s linear forwards` : "none";
  }
  const klein = app.querySelector(".bm-qrklein");
  if (klein) klein.hidden = zustand.seite === "mitmachen";
  // Inhalt erst nach Kopf und Fuss: erst dann steht fest, wie viel Platz die Buehne hat
  const html = zustand.seite ? seiteHTML(raum, zustand.seite, jetzt) : "";
  const inhalt = app.querySelector(".bm-inhalt");
  if (inhalt && (html !== gezeigt || neueSeite)) {
    inhalt.innerHTML = html;
    inhalt.dataset.seite = zustand.seite || "";
    inhalt.classList.remove("bm-rein"); void inhalt.offsetWidth; inhalt.classList.add("bm-rein");
    gezeigt = html;
    einpassen(inhalt, app.querySelector(".bm-buehne"), 1);
    qrFuellen();
  }
}

// Inhalt so skalieren, dass er ganz in den Kasten passt (nie abgeschnitten); hoechstens bis "max" vergroessern
function einpassen(el, kasten, max = 1) {
  if (!el || !kasten) return;
  el.style.transform = "none";
  const cs = getComputedStyle(kasten);
  const h = el.scrollHeight, b = el.scrollWidth;
  const kh = kasten.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), kb = kasten.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  if (!h || !kh) return;
  const s = Math.min(max, kh / h, kb / b);
  el.style.transform = s === 1 ? "none" : `scale(${s.toFixed(4)})`;
}
window.addEventListener("resize", () => {
  if (!app) return;
  einpassen(app.querySelector(".bm-inhalt"), app.querySelector(".bm-buehne"), 1);
  const box = document.querySelector(".bm-ereignis .bm-e-box");
  if (box) einpassen(box, document.querySelector(".bm-ereignis"), 2.4);
});

// ---------------------------------------------------------------- Ereignisse zeigen
function naechstesEreignis() {
  if (laufend || !schlange.length || !raum) return;
  const e = schlange.shift();
  const html = ereignisHTML(raum, e, jetztG());
  if (!html) return naechstesEreignis();
  laufend = e;
  merke({ ereignis: e.art, name: e.name, nr: e.nr });
  const el = document.querySelector(".bm-ereignis");
  el.innerHTML = html;
  el.hidden = false;
  el.dataset.art = e.art;
  einpassen(el.querySelector(".bm-e-box"), el, e.art === "pokal" || e.art === "abend" ? 2.4 : 1);
  if (e.art === "gruss") { TON.spiele(TON.GRUSS_KLAENGE[Math.floor(Math.random() * TON.GRUSS_KLAENGE.length)]); effekt(raum.look, 60); }
  else if (e.art === "spiel") TON.spiele(A.klang(raum.look, "meldung"));
  else { TON.spiele("fanfare"); effekt(raum.look, 180); }
  clearTimeout(laufTimer);
  laufTimer = setTimeout(() => { ereignisEnde(); naechstesEreignis(); }, DAUER_EREIGNIS[e.art] || 8000);
}
function ereignisEnde() {
  clearTimeout(laufTimer);
  const el = document.querySelector(".bm-ereignis");
  if (el) { el.hidden = true; el.innerHTML = ""; }
  if (laufend) zustand.ab = Date.now();   // die Seite darunter bekommt danach ihre volle Zeit
  laufend = null;
}

function schreck() {
  const el = document.querySelector(".bm-schreck");
  if (!el) return;
  merke({ ereignis: "schreck" });
  el.innerHTML = FRATZE;
  el.hidden = false;
  el.classList.remove("los"); void el.offsetWidth; el.classList.add("los");
  TON.spiele("schrei");
  clearTimeout(schreckTimer);
  schreckTimer = setTimeout(() => { el.hidden = true; el.innerHTML = ""; el.classList.remove("los"); }, DAUER_EREIGNIS.schreck);
}

// Grosse Effekte (nur am Beamer): Konfetti je Aussehen, im Halloween-Aussehen dazu Fledermaeuse
function effekt(look, n) {
  if (look === "halloween") fledermaeuse(6);
  const farben = look === "halloween" ? ["#ff7518", "#9b4dff", "#ffd23f", "#3a3a3a", "#ff9a3c"] : look === "edel" ? ["#d8b56a", "#f3e3bd", "#8a8f9e", "#fff"] : ["#ff5fae", "#3fd0ff", "#ffd23f", "#5ef08a", "#6d5dfc", "#ff9600"];
  for (let i = 0; i < n; i++) {
    const d = document.createElement("i");
    d.className = "konfetti";
    d.style.left = Math.random() * 100 + "vw";
    d.style.background = farben[i % farben.length];
    d.style.width = "1.2vmin"; d.style.height = "1.7vmin";
    d.style.setProperty("--dx", (Math.random() * 40 - 20) + "vw");
    d.style.setProperty("--dreh", (Math.random() * 1440 - 720) + "deg");
    d.style.animationDuration = 2.2 + Math.random() * 2 + "s";
    d.style.animationDelay = Math.random() * 0.5 + "s";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5200);
  }
}
function fledermaeuse(n) {
  for (let i = 0; i < n; i++) {
    const f = document.createElement("i");
    f.className = "fledermaus";
    f.textContent = "🦇";
    f.style.top = 6 + Math.random() * 60 + "vh";
    f.style.fontSize = 5 + Math.random() * 5 + "vmin";
    f.style.animationDelay = i * 0.3 + "s";
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 4000 + i * 300);
  }
}
// Ruhige Stimmung zwischendurch: im Halloween-Aussehen ab und zu ein paar Fledermaeuse
function umgebung() {
  if (!raum || raum.look !== "halloween" || laufend) return;
  const t = Date.now();
  if (!zuletztFledermaus) { zuletztFledermaus = t; return; }
  if (t - zuletztFledermaus > 50000) { zuletztFledermaus = t; fledermaeuse(3); }
}

// ---------------------------------------------------------------- QR-Code (gleiche Bibliothek wie app.js, nur bei Bedarf)
let qrLaden = null, qrSvg = null;
function qrLib() {
  if (!qrLaden) {
    qrLaden = new Promise((ok, nein) => {
      if (window.qrcode) return ok(window.qrcode);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
      s.onload = () => (window.qrcode ? ok(window.qrcode) : nein(new Error("qrcode fehlt")));
      s.onerror = () => { qrLaden = null; nein(new Error("QR-Bibliothek nicht geladen")); };
      document.head.appendChild(s);
    });
  }
  return qrLaden;
}
export const gastLink = () => location.href.split("#")[0] + location.hash.replace(/&beamer$/, "");
async function qrFuellen() {
  const ziele = [...document.querySelectorAll("[data-bqr]")].filter((x) => !x.firstChild);
  if (!ziele.length) return;
  try {
    if (!qrSvg) {
      const q = await qrLib();
      const qr = q(0, "M"); qr.addData(gastLink()); qr.make();
      qrSvg = qr.createSvgTag(8, 2);
    }
    document.querySelectorAll("[data-bqr]").forEach((x) => { if (!x.firstChild) x.innerHTML = qrSvg; });
  } catch (e) { ziele.forEach((x) => { x.innerHTML = `<span class="bm-leise">Link: ${esc(gastLink())}</span>`; }); }
}
