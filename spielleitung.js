// Spielleitung und Ablauf (Geburtstags-Runde B, Nico 06.11.2026, Vorschlaege 1, 2, 6, 18, 19, 20).
//
// Reine Logik und gemeinsame Anzeige fuer Steuerseite (app.js) und Pult (beamer_pult.js). Ausgefuehrt wird alles beim Gastgeber.
//   raum.pause    {seit, wer}             alles steht; beim Weiter laufen alle Fristen um die Pausenlaenge nach hinten
//   raum.plan     [{id, t, zeit, spiel, text, angesagt}]   Spielplan, sortiert; t = Zeitpunkt nach der Gastgeber-Uhr
//   raum.planAnsage {nr, id}              Zaehler fuer die Ansage am Beamer (5 Minuten vorher)
//   raum.rueck    {<kennung>: {text}}     was diese Spielleitung gerade zuruecknehmen kann (die Daten dazu haelt der Gastgeber)
//   protokoll/<push-id>  {t, wer, art, text, punkte?}   liegt neben "stand": Gaeste laden es nie, das spart Hotspot (net.js)
import { esc } from "./hilfe.js";
import { endzeitLesen } from "./wertung.js";
import { zeitenSchieben, MAX_MIT } from "./partien.js";

export const PLAN_VORLAUF = 5 * 60000;   // so lange vorher kuendigt der Beamer an
export const PLAN_NACHLAUF = 15 * 60000; // so lange bleibt ein Punkt nach seiner Uhrzeit in der Liste
const PLAN_MAX = 20, TEXT_MAX = 40;
export const PROTOKOLL_ZEIGEN = 200;

// ---------------------------------------------------------------- Pause
export const pausiert = (raum) => !!(raum && raum.pause);
export function pauseAn(raum, wer, jetzt) {
  if (raum.pause) return false;
  raum.pause = { seit: jetzt, wer: String(wer || "") };
  return true;
}
// -> Pausenlaenge in ms. Spielstaende, Gluecksrad und Runden-Ende ruecken nach hinten, damit keine Frist in der Pause verstreicht.
export function pauseAus(raum, jetzt) {
  if (!raum.pause) return 0;
  const seit = raum.pause.seit, um = Math.max(0, jetzt - seit);
  raum.pause = null;
  Object.values(raum.partien || {}).forEach((p) => {
    if (p.s) p.s = zeitenSchieben(p.s, seit, um);
    if (p.t) p.t += um;
    p.v = (p.v || 0) + 1;
  });
  if (raum.glueck) raum.glueck = zeitenSchieben(raum.glueck, seit, um);
  const w = raum.tafel && raum.tafel.wertung;
  if (w && w.runde && w.runde.ende) w.runde.ende += um;
  return um;
}
// Spiel-Eingaben warten in der Pause und laufen beim Weiter nach; Notfall-Aktionen der Spielleitung gelten sofort
export const PAUSE_FREI = new Set(["_zurueck", "_retten", "_platz", "_mit", "_raus", "_botneu", "_botweg", "_ohne", "_karte", "_hm", "_figur"]);
const RAD_LAUF = new Set(["drehen", "fuer", "schieben", "behalten", "duell", "duellerg"]);
export const wartetInPause = (a) => (a.typ === "_glueck" ? RAD_LAUF.has(a.was) : !a.typ.startsWith("_") || !PAUSE_FREI.has(a.typ));

// ---------------------------------------------------------------- Nachzuegler (Runde C, Punkt 8)
// Wer zu einem laufenden Spiel ohne Mittendrin-Einstieg dazukommt, steht auf der Warteliste. Kann das Spiel Neue aufnehmen
// (sp.einlassen, z. B. das Partybrett), laesst die Spielleitung ihn mit einem Druck sofort einsteigen.
export function einlassen(p, sp, id, name) {
  if (!p || !sp || !sp.einlassen || p.phase !== "laeuft" || !p.s || !p.wartend.includes(id) || p.mit.includes(id) || p.mit.length >= MAX_MIT) return false;
  if (!sp.einlassen(p.s, name)) return false;
  p.mit.push(id);
  p.wartend = p.wartend.filter((x) => x !== id);
  p.s.anzahl = p.mit.length;
  return true;
}

// ---------------------------------------------------------------- Brettspiel speichern und spaeter weiterspielen (Runde C, Punkt 40)
// Der volle Spielstand liegt nur im Speicher des Gastgeber-Geraets (er rechnet ohnehin alles); im Raum steht nur die kurze
// Liste raum.speicher [{nr, zeit, runde, runden, namen, n}] - so muessen die Gaeste-Handys nie ganze Spielstaende laden.
const SPEICHER_LS = "pa_brett_speicher";
export const SPEICHER_MAX = 6;
const lsLesen = () => { try { const l = JSON.parse(localStorage.getItem(SPEICHER_LS) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } };
const lsSchreiben = (l) => { try { localStorage.setItem(SPEICHER_LS, JSON.stringify(l)); return true; } catch (e) { return false; } };
const kopfVon = ({ p, ...kopf }) => kopf;
// beim Oeffnen des Raums: die Liste aus dem Geraet in den Raum holen
export function speicherAbgleich(raum) { raum.speicher = lsLesen().map(kopfVon); raum.speicherNr = Math.max(Number(raum.speicherNr) || 0, ...raum.speicher.map((e) => e.nr || 0)); }
export function speichern(raum, p, nm, jetzt) {
  if (!raum || !p || p.spiel !== "brett" || p.phase !== "laeuft" || !p.s || p.s.ende) return false;
  const liste = lsLesen();
  raum.speicherNr = Math.max(Number(raum.speicherNr) || 0, ...liste.map((e) => e.nr || 0)) + 1;
  const d = new Date(jetzt), namen = (nm || []).map(String);
  const e = { nr: raum.speicherNr, zeit: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, runde: p.s.runde, runden: p.s.runden || 0,
    namen: namen.slice(0, 5).join(", ") + (namen.length > 5 ? ` +${namen.length - 5}` : ""), n: namen.length,
    p: JSON.parse(JSON.stringify({ spiel: p.spiel, mit: p.mit, bots: p.bots || {}, s: p.s, ohne: !!p.ohne, karte: p.karte, runden: p.runden })) };
  const neu = [e, ...liste].slice(0, SPEICHER_MAX);
  if (!lsSchreiben(neu)) return false;
  raum.speicher = neu.map(kopfVon);
  return true;
}
// -> neue Partie, die genau am gespeicherten Punkt weiterlaeuft (oder null). Fristen starten neu, das Minispiel bekommt neue Zeit.
export function laden(raum, nr, pid, von, jetzt) {
  const e = lsLesen().find((x) => x.nr === nr);
  if (!e || !e.p || !e.p.s) return null;
  const q = e.p, s = q.s;
  s.zugBis = 0; s.autoDran = -1;
  if (s.mini) s.mini.t0 = jetzt;
  if (s.duell) s.duell.seit = jetzt;
  return { pid, spiel: q.spiel, phase: "laeuft", mit: q.mit.slice(), bots: { ...(q.bots || {}) }, wartend: [], von, start: jetzt, s, zuletzt: null, runde: 1, ohne: !!q.ohne,
    karte: q.karte, runden: q.runden, v: 1, geladen: nr };
}
export function speicherWeg(raum, nr) {
  const liste = lsLesen();
  if (!liste.some((x) => x.nr === nr)) return false;
  const neu = liste.filter((x) => x.nr !== nr);
  lsSchreiben(neu);
  raum.speicher = neu.map(kopfVon);
  return true;
}
export function speicherHTML(raum, kn) {
  const l = (raum && Array.isArray(raum.speicher) && raum.speicher) || [];
  if (!l.length) return `<p class="leise klein">💾 Kein gespeichertes Partybrett. Speichern geht im laufenden Brett oben mit „💾“.</p>`;
  return `<ul class="sl-plan sl-speicher">${l.map((e) => `<li data-speicher="${e.nr}"><b>💾 ${esc(e.zeit)}</b><span class="sl-plan-name">Runde ${e.runde}${e.runden ? `/${e.runden}` : ""} · ${esc(e.namen)}</span>
      ${kn("▶️ Weiter", { typ: "_brettladen", nr: e.nr }, "klein2 gruen")}${kn("✕", { typ: "_brettladen", nr: e.nr, weg: true }, "klein2", `aria-label="Spielstand löschen"`)}</li>`).join("")}</ul>`;
}

// ---------------------------------------------------------------- Spielplan
const textSauber = (t) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
export function planDazu(raum, zeit, spiel, text, jetzt) {
  const t = endzeitLesen(zeit, jetzt), plan = Array.isArray(raum.plan) ? raum.plan : [];
  if (t === null || plan.length >= PLAN_MAX) return false;
  const name = textSauber(text);
  if (!spiel && !name) return false;
  raum.planNr = (Number(raum.planNr) || 0) + 1;
  const d = new Date(t);
  const e = { id: raum.planNr, t, zeit: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, spiel: String(spiel || ""), text: name, angesagt: false };
  raum.plan = [...plan, e].sort((x, y) => x.t - y.t);
  return true;
}
export function planWeg(raum, id) {
  const plan = Array.isArray(raum.plan) ? raum.plan : [];
  if (!plan.some((e) => e.id === id)) return false;
  raum.plan = plan.filter((e) => e.id !== id);
  return true;
}
// Sekundentakt beim Gastgeber: ansagen, was in fuenf Minuten dran ist, und Altes wegraeumen. -> true, wenn sich etwas geaendert hat
export function planPruefen(raum, jetzt) {
  const plan = Array.isArray(raum.plan) ? raum.plan : [];
  if (!plan.length) return false;
  let neu = false;
  const rest = plan.filter((e) => jetzt < e.t + PLAN_NACHLAUF);
  if (rest.length !== plan.length) { raum.plan = rest; neu = true; }
  const e = rest.find((x) => !x.angesagt && jetzt >= x.t - PLAN_VORLAUF && jetzt < x.t);
  if (e) {
    e.angesagt = true;
    raum.planAnsage = { nr: (raum.planAnsage ? raum.planAnsage.nr : 0) + 1, id: e.id };
    neu = true;
  }
  return neu;
}
export const planNaechster = (raum, jetzt) => ((raum && raum.plan) || []).find((e) => e.t >= jetzt) || null;
export const planName = (e, spielVon) => { const sp = e.spiel && spielVon(e.spiel); return sp ? `${sp.emoji} ${sp.name}` : e.text; };
// Der Gastgeber merkt sich die Uhrzeiten fuer den naechsten Raum (Plan vorher anlegen, Raum erst am Abend oeffnen)
export const planMerkStand = (raum) => ((raum && raum.plan) || []).map(({ zeit, spiel, text }) => ({ zeit, spiel, text }));
export function planUebernehmen(raum, liste, jetzt) { (Array.isArray(liste) ? liste : []).forEach((e) => planDazu(raum, e.zeit, e.spiel, e.text, jetzt)); }

// ---------------------------------------------------------------- Protokoll
// vorher/nachher = Abendsummen (wertung.js summen) -> [{name, vor, nach}] fuer alle, bei denen sich etwas geaendert hat
export function punkteDiff(vorher, nachher) {
  return [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])].sort((x, y) => x.localeCompare(y, "de"))
    .filter((n) => (vorher[n] || 0) !== (nachher[n] || 0)).map((name) => ({ name, vor: vorher[name] || 0, nach: nachher[name] || 0 }));
}
export function punkteText(a) {
  const x = a.werte || [];
  if (a.was === "w_app") return `${a.emo || "🎮"} ${a.titel || a.spiel}: gewonnen`;
  if (a.was === "w_hand") return `✍️ Korrektur von Hand${textSauber(x[2]) ? `: ${textSauber(x[2])}` : ""}`;
  if (a.was === "w_weg") return "🗑️ Eintrag gelöscht";
  if (a.was === "w_ok") return "👍 Eintrag bestätigt";
  if (a.was === "w_reset") return "🗑️ Ganze Wertung zurückgesetzt";
  if (a.was === "w_ende" || a.was === "w_ablauf") return "⏹️ Rundenende";
  if (a.was === "w_duell") return "⚔️ Duell eingetragen";
  return "🏅 Punkte geändert";
}
const uhrzeit = (t) => new Date(t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function protokollZeile(e) {
  const p = Array.isArray(e.punkte) ? e.punkte : [];
  return `<li class="pk-zeile" data-art="${esc(e.art || "")}"><span class="pk-zeit">${uhrzeit(e.t)}</span><span class="pk-text">${esc(e.text)}${e.wer ? `<small>von ${esc(e.wer)}</small>` : ""}
      ${p.map((x) => `<small class="pk-punkte">${esc(x.name)}: ${x.vor} → <b>${x.nach}</b></small>`).join("")}</span></li>`;
}
export function protokollHTML(liste) {
  if (!liste.length) return `<p class="leise klein">Noch ist nichts passiert.</p>`;
  const zeig = liste.slice(0, PROTOKOLL_ZEIGEN);
  return `<ol class="protokoll">${zeig.map(protokollZeile).join("")}</ol>${liste.length > zeig.length ? `<p class="leise klein">Die letzten ${zeig.length} von ${liste.length} Einträgen.</p>` : ""}`;
}

// ---------------------------------------------------------------- Anzeige (Steuerseite und Pult)
// kn(text, aktion, klassen, zusatz) baut den Knopf der jeweiligen Seite; frage = Sicherheitsfrage zum Rueckgaengig steht offen
export function schnellHTML(raum, id, kn, { frageAttr, frage }) {
  const b = (raum && raum.beamer) || {}, r = (raum.rueck || {})[id];
  const pause = pausiert(raum);
  return `<div class="sl-knoepfe">
      ${kn(pause ? "▶️ Weiter" : "⏸️ Pause", { typ: "_pause" }, `${pause ? "gruen" : "gelb"} sl-pause`)}
      ${b.party ? kn("🎉 Partymodus beenden", { typ: "_party", aus: true }, "zweit sl-party") : kn("🎉 Partymodus starten", { typ: "_party" }, "gruen sl-party")}
    </div>
    ${b.party ? `<p class="leise klein">🎉 Partymodus läuft: Diashow, Gesamtwertung und „Wer ist da“ an der Wand.</p>` : `<p class="leise klein">Ein Druck: Diashow an, Gesamtwertung läuft, an der Wand steht, wer da ist.</p>`}
    ${r ? (frage ? `<div class="sl-knoepfe sl-frage">${kn(`Ja, zurücknehmen: ${esc(r.text)}`, { typ: "_rueck" }, "rot sl-rueck-ja")}<button class="zweit" ${frageAttr}="">Doch nicht</button></div>`
      : `<button class="zweit sl-rueck" ${frageAttr}="1">↩️ Rückgängig: ${esc(r.text)}</button>`) : ""}
    ${speicherHTML(raum, kn)}`;
}
export function planHTML(raum, kn, spiele, spielVon) {
  const plan = (raum && raum.plan) || [];
  return `${plan.length ? `<ul class="sl-plan">${plan.map((e) => `<li data-plan="${e.id}"><b>${esc(e.zeit)}</b><span class="sl-plan-name">${esc(planName(e, spielVon))}</span>
        ${e.spiel ? kn("▶️ Jetzt", { typ: "_alle", wert: e.spiel }, "klein2 gruen") : ""}${kn("✕", { typ: "_plan", was: "weg", id: e.id }, "klein2", `aria-label="Punkt entfernen"`)}</li>`).join("")}</ul>`
    : `<p class="leise klein">Noch nichts geplant. Der Beamer kündigt jeden Punkt 5 Minuten vorher an.</p>`}
    <div class="sl-planform"><label>Uhrzeit<input id="rf-planzeit" type="time" aria-label="Uhrzeit"></label>
      <label>Spiel<select id="rf-planspiel"><option value="">– eigener Text –</option>${spiele.map((sp) => `<option value="${esc(sp.id)}">${sp.emoji} ${esc(sp.name)}</option>`).join("")}</select></label>
      <label>Eigener Text<input id="rf-plantext" maxlength="${TEXT_MAX}" autocomplete="off" placeholder="z. B. Torte"></label></div>
    ${kn("➕ In den Spielplan", { typ: "_plan", was: "dazu" }, "zweit sl-plan-dazu", `data-felder="rf-planzeit,rf-planspiel,rf-plantext"`)}`;
}
