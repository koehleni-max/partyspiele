// Steuerpult am Beamer-Geraet (Nico 31.10.2026, Prompt 2026-10-31-1730-beamer-steuerung-zuschauen-sounds).
//
// Am Geraet, das am Beamer haengt (z. B. ROG Ally im Browser), laesst sich die Party per Touch oder Maus steuern - Nicos
// Handy bleibt frei und spielt normal mit. Das Beamer-Geraet bleibt KEIN Spieler: es meldet sich nie mit "_hallo" an.
// Freischaltung wie am Handy ueber den Spielleitungs-Code: das Pult prueft den Code (konten.js), behaelt nur den
// Schluessel (sessionStorage dieses Tabs) und beweist ihn dem Gastgeber mit "_admin" fuer seine Beamer-Kennung. Der
// Gastgeber nimmt die Kennung in raum.admins auf und fuehrt danach NUR die Aktionen aus pultErlaubt() aus (app.js).
import { SPIELE, GRUPPEN } from "./spiele.js";
import * as K from "./konten.js";
import * as A from "./anlass.js";
import * as P from "./partien.js";
import * as G from "./gluecksrad.js";
import * as BS from "./beamer_spiele.js";
import * as TON from "./ton.js";
import * as KOPPLUNG from "./kopplung.js";
import { Wache } from "./netzwache.js";
import { esc } from "./hilfe.js";
import * as SL from "./spielleitung.js";

export const istPult = (id) => /^beamer-[a-z0-9]{6,20}$/.test(String(id || ""));
const RAUM_PULT = new Set(["_beamer", "_alle", "_spielwahl", "_look", "_ab18", "_trink", "_testkonten", "_adminweg", "_brettweg", "_pause", "_party", "_plan", "_rueck", "_brettladen"]);
const SPIEL_PULT = new Set(["_los", "_zurueck", "_ohne", "_neuauf", "_botneu", "_botweg", "_karte", "_hm", "_figur", "_brettende", "_retten", "_brettspeichern", "_einlassen"]);
const GLUECK_PULT = new Set(["frei", "fuer", "joker", "feld", "trinkaus"]);   // nie selbst drehen/schieben - das Pult ist kein Gast
// Was der Gastgeber vom Pult annimmt (zusaetzlich muss die Kennung freigeschaltet sein)
export function pultErlaubt(a) {
  if (!a || typeof a.typ !== "string") return false;
  if (a.typ === "_glueck") return GLUECK_PULT.has(a.was);
  return RAUM_PULT.has(a.typ) || SPIEL_PULT.has(a.typ);
}

export const REITER = [
  { id: "spiele", name: "🎮 Spiel starten" }, { id: "laufend", name: "▶️ Laufend" }, { id: "gaeste", name: "🚦 Gäste" }, { id: "beamer", name: "📽️ Beamer" },
  { id: "rad", name: "🎡 Glücksrad" }, { id: "leitung", name: "🧭 Ablauf" }, { id: "raum", name: "⚙️ Einstellungen" },
];
const spiel = (id) => SPIELE.find((x) => x.id === id);
const knopf = (text, a, kl = "", extra = "") => `<button class="${kl}" data-pa='${JSON.stringify(a).replace(/'/g, "&#39;")}' ${extra}>${text}</button>`;

// ctx = {netz, id, code, raum(), jetzt(), B (beamer.js: SEITEN, steuer, modus, verfuegbar, DAUERN, seiteName), fokus(pid), fokusPid()}
let ctx = null, el = null, knopfEl = null;
let offen = false, reiter = "spiele", kat = 0, eingabe = "", meldung = "", pruefe = false, endeFrage = null, zuletztBeweis = 0;
let wache = null, rettenFrage = null;   // Netzwache: erst mit Steuerrechten. Meldungen erscheinen hier nur im Pult, nie an der Wand
let rueckFrage = false;                 // Sicherheitsfrage zu "Rueckgaengig" steht offen

export function start(c) {
  ctx = c;
  knopfEl = document.querySelector("[data-pult-auf]");
  el = document.querySelector(".bm-pult");
  if (!knopfEl || !el) return;
  knopfEl.addEventListener("click", () => (offen ? zu() : auf()));
  el.addEventListener("click", klick);
  document.addEventListener("keydown", (e) => {
    if (!offen) return;
    if (e.key === "Escape") return zu();
    if (istAdmin()) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { taste(e.key); e.preventDefault(); }   // Ziffern, auch Buchstaben (Tastatur)
    else if (e.key === "Backspace") { taste("weg"); e.preventDefault(); }
    else if (e.key === "Enter") { taste("ok"); e.preventDefault(); }
  });
  window.__pult = { offen: () => offen, reiter: () => reiter, admin: () => istAdmin(), meldung: () => meldung, zahl: () => kopplungsZahl(), wache: () => wache };
  setInterval(() => { if (wache && offen && reiter === "gaeste") wache.auffrischen(el); }, 2000);
}
// Hauptmenue am Beamer: "Steuern" oeffnet das Pult darueber, ein gestartetes Partybrett macht es zu (das Menue uebernimmt)
export const aufmachen = () => { if (!offen && el) auf(); };
export const zumachen = () => { if (offen) zu(); };

const istAdmin = () => { const r = ctx && ctx.raum(); return !!(r && K.istAdmin(r, ctx.id)); };

function auf() { offen = true; el.hidden = false; document.body.classList.add("pult-offen"); zeichnen(); }
function zu() { offen = false; el.hidden = true; document.body.classList.remove("pult-offen"); endeFrage = null; }

// Neuer Stand vom Raum: Pult nachziehen; liegt ein Schluessel vor, aber der Gastgeber kennt das Pult (noch) nicht -
// z. B. nach Neuladen oder weil das Gastgeber-Geraet den Code erst spaeter bekam -, den Beweis erneut schicken
export function neu() {
  if (!ctx) return;
  if (K.meinSchluessel() && !istAdmin() && Date.now() - zuletztBeweis > 8000) beweisSenden();
  if (knopfEl) knopfEl.classList.toggle("frei", istAdmin());
  if (istAdmin()) {
    if (!wache) {
      wache = new Wache(ctx.netz, { beiNeu: () => { if (offen) zeichnen(); } });
      wache.namen = () => Object.fromEntries(((ctx.raum() || {}).spieler || []).map((x) => [x.id, x.name]));
    }
    // freigeschaltet: Kopplungszahl wird nicht mehr gebraucht; kam der Beamer gerade per Kopplung, Pult einmal aufklappen
    if (kopplung && kopplung.ende) { kopplung.ende(); kopplung = null; }
    let frisch = false;
    try { frisch = sessionStorage.getItem("pa_pult_nach_kopplung") === "1"; sessionStorage.removeItem("pa_pult_nach_kopplung"); } catch (e) { frisch = false; }
    if (frisch && !offen) { meldung = ""; auf(); }
  }
  if (offen) zeichnen();
}

async function beweisSenden() {
  const k = K.meinSchluessel();
  if (!k || !ctx.netz) return;
  zuletztBeweis = Date.now();
  try { await ctx.netz.aktionSenden(ctx.id, { typ: "_admin", beweis: await K.beweis(k, ctx.code, ctx.id) }); } catch (e) { console.warn(e); }
}

function senden(a) {
  if (!ctx.netz) return;
  ctx.netz.aktionSenden(ctx.id, a).catch((e) => console.warn(e));
  TON.spiele("klick");
}

async function taste(t) {
  if (pruefe) return;
  if (t === "weg") eingabe = eingabe.slice(0, -1);
  else if (t === "ok") return freischalten();
  else if (eingabe.length < 40) eingabe += t;
  meldung = "";
  zeichnen();
}

async function freischalten() {
  if (!K.codeSauber(eingabe)) { meldung = "Bitte zuerst den Code eintippen."; return zeichnen(); }
  if (K.wartezeit() > 0) { eingabe = ""; meldung = `⏳ Zu viele falsche Codes – noch ${Math.ceil(K.wartezeit() / 1000)} s warten.`; TON.spiele("falsch"); return zeichnen(); }
  pruefe = true; meldung = "Code wird geprüft …"; zeichnen();
  let k = null;
  try { k = await K.codePruefen(eingabe); } catch (e) { k = null; }
  pruefe = false; eingabe = "";
  if (!k) { K.fehlversuch(); meldung = "❌ Code falsch."; TON.spiele("falsch"); return zeichnen(); }
  K.erfolg(); K.schluesselMerken(k);
  meldung = "✓ Code richtig – das Gastgeber-Gerät schaltet das Pult gleich frei …";
  zeichnen();
  beweisSenden();
}

function klick(e) {
  const t = e.target.closest("button, [data-pa]");
  if (!t || !el.contains(t)) return;
  if (t.dataset.pz !== undefined) return taste(t.dataset.pz);
  if (t.hasAttribute("data-p-ersatz")) { ersatz = true; return zeichnen(); }
  if (t.dataset.pr) { reiter = t.dataset.pr; endeFrage = null; return zeichnen(); }
  if (t.dataset.pk !== undefined) { kat = Number(t.dataset.pk) || 0; return zeichnen(); }
  if (t.hasAttribute("data-p-zu")) return zu();
  if (t.dataset.pf !== undefined) { ctx.fokus(t.dataset.pf || null); zu(); return; }
  if (t.dataset.pende !== undefined) { endeFrage = t.dataset.pende || null; return zeichnen(); }
  if (t.dataset.pMenue) { zu(); ctx.menueAuf(t.dataset.pMenue); return; }
  if (t.dataset.pMeldungOk) { if (wache) wache.erledigen(t.dataset.pMeldungOk); return; }
  if (t.dataset.pRetten !== undefined) { rettenFrage = t.dataset.pRetten || null; return zeichnen(); }
  if (t.dataset.pRueck !== undefined) { rueckFrage = !!t.dataset.pRueck; return zeichnen(); }
  if (t.dataset.pa) {
    let a;
    try { a = JSON.parse(t.dataset.pa); } catch (x) { return; }
    if (a.typ === "_adminweg") { K.schluesselMerken(null); meldung = ""; }
    if (t.dataset.felder) a.werte = t.dataset.felder.split(",").map((id) => { const f = document.getElementById(id); return f ? f.value : ""; });
    if (a.typ === "_plan" && a.was === "dazu") {
      if (!a.werte[0] || (!a.werte[1] && !a.werte[2].trim())) { meldung = "Bitte Uhrzeit und Spiel oder Text angeben."; return zeichnen(); }
      meldung = ""; a.werte.forEach((_, i) => { const f = document.getElementById(t.dataset.felder.split(",")[i]); if (f) f.value = ""; });
    }
    if (a.typ === "_rueck") rueckFrage = false;
    senden(a);
    t.classList.add("gesendet"); setTimeout(() => t.classList.remove("gesendet"), 600);
    if (a.typ === "_alle") { reiter = "laufend"; setTimeout(zeichnen, 50); if (a.wert === "brett") zu(); }
    if (a.typ === "_zurueck") endeFrage = null;
    if (a.typ === "_retten") { rettenFrage = null; setTimeout(zeichnen, 50); }
    if (a.typ === "_beamer" && a.was === "schreck") zu();   // Schreck soll man sehen, nicht das Pult
  }
}

// ---------------------------------------------------------------- Zeichnen
function zeichnen() {
  if (!el || !offen) return;
  if (el.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName)) return;   // tippt gerade (Spielplan)
  const r = ctx.raum();
  const kopf = `<div class="bp-kopf"><b>🛠️ Steuerpult</b>${r && istAdmin() ? knopf(SL.pausiert(r) ? "▶️ Weiter" : "⏸️ Pause", { typ: "_pause" }, `bp-pause ${SL.pausiert(r) ? "gruen" : "gelb"}`) : ""}<button class="bp-zu" data-p-zu aria-label="Schließen">✕</button></div>`;
  if (!r) { el.innerHTML = `${kopf}<p class="bp-leise">Raum wird geladen …</p>`; return; }
  if (!istAdmin()) { el.innerHTML = kopf + sperre(); return; }
  // halb getippte Eingaben (Spielplan) ueberstehen das Neuzeichnen
  const felder = [...el.querySelectorAll("input[id],select[id]")].map((f) => [f.id, f.value]);
  const n = Object.keys(r.partien || {}).length;
  const mld = wache ? wache.offen().length : 0;
  const tabs = `<div class="bp-reiter">${REITER.map((x) => `<button data-pr="${x.id}" class="${x.id === reiter ? "an" : ""}">${x.name}${x.id === "laufend" && n ? ` <i>${n}</i>` : ""}${x.id === "gaeste" && mld ? ` <i class="bp-alarm">${mld}</i>` : ""}</button>`).join("")}</div>`;
  const inhalt = { spiele: spieleBild, laufend: laufendBild, gaeste: gaesteBild, beamer: beamerBild, rad: radBild, leitung: leitungBild, raum: raumBild }[reiter] || spieleBild;
  let html = "";
  try { html = inhalt(r); } catch (x) { console.error(x); html = `<p class="bp-leise">Fehler beim Anzeigen.</p>`; }
  el.innerHTML = `${kopf}${tabs}<div class="bp-inhalt" data-reiter="${reiter}">${html}</div>`;
  felder.forEach(([id, wert]) => { const f = document.getElementById(id); if (f && wert) f.value = wert; });
}

// Ablauf: Partymodus, Rueckgaengig, Spielplan, Protokoll - dasselbe wie auf der Steuerseite am Handy
function leitungBild(r) {
  const spiele = GRUPPEN.flatMap((g) => g.ids).map(spiel).filter(Boolean);
  return `${SL.schnellHTML(r, ctx.id, knopf, { frageAttr: "data-p-rueck", frage: rueckFrage })}
    ${meldung ? `<p class="bp-meldung" role="status">${esc(meldung)}</p>` : ""}
    <h3>⏰ Spielplan</h3>${SL.planHTML(r, knopf, spiele, spiel)}
    <h3>📜 Protokoll</h3>${wache ? SL.protokollHTML(wache.protokollListe()) : `<p class="bp-leise">Wird geladen …</p>`}`;
}

// Gesperrt (Runde 3, Plan 3.16): vorn steht die Kopplungszahl - die Spielleitung koppelt vom Handy, am Beamer wird nichts
// getippt. Das Ziffernfeld gibt es nur noch als Ersatzweg hinter einem Knopf.
let kopplung = null, ersatz = false;
function kopplungStarten() {
  if (kopplung) return;
  kopplung = { zahl: null };
  KOPPLUNG.anbieten(ctx.id, (code) => {
    // gekoppelt: in diesem Raum kommen die Rechte vom Gastgeber; anderer Raum -> dorthin wechseln (gleiche Kennung)
    if (code === ctx.code) { meldung = "✓ Gekoppelt – die Rechte kommen gleich …"; kopplung = null; return zeichnen(); }
    try { sessionStorage.setItem(`pa_beamer_${code}`, ctx.id); sessionStorage.setItem("pa_pult_nach_kopplung", "1"); } catch (e) { /* privater Modus */ }
    location.hash = `#r=${code}&beamer`;
    location.reload();
  }).then((k) => { kopplung = k; zeichnen(); }).catch((e) => { console.warn(e); kopplung = { fehler: true }; zeichnen(); });
}
export const kopplungsZahl = () => (kopplung && kopplung.zahl) || null;
function sperre() {
  kopplungStarten();
  const k = K.meinSchluessel();
  const punkte = eingabe ? "●".repeat(eingabe.length) : "<span class=\"bp-leise\">Code</span>";
  const zahl = kopplung && kopplung.zahl;
  return `<div class="bp-sperre">
      <div class="bp-koppeln"><p>Zum Steuern: am Handy der Spielleitung <b>🛠️ Steuerseite → 🔗 Beamer koppeln</b> und diese Zahl eintippen</p>
        <div class="bp-zahl" data-p-kopplung>${zahl ? esc(zahl) : kopplung && kopplung.fehler ? "–" : "····"}</div>
        <p class="bp-leise">Das Beamer-Gerät wird dadurch <b>kein</b> Spieler – dein Handy spielt normal mit.</p></div>
      ${k ? `<p class="bp-ok">✓ Code ist eingegeben – das Gastgeber-Gerät schaltet das Pult frei, sobald es selbst freigeschaltet ist.</p>` : ""}
      ${ersatz || eingabe ? `<p class="bp-leise">Ersatzweg: Freischaltcode eintippen (auch mit der Tastatur)</p>
      <div class="bp-anzeige" data-p-anzeige>${punkte}</div>
      <div class="bp-pad">${["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((z) => `<button data-pz="${z}">${z}</button>`).join("")}
        <button data-pz="weg" aria-label="Löschen">⌫</button><button data-pz="0">0</button><button data-pz="ok" class="gruen" ${pruefe ? "disabled" : ""}>✓</button></div>
      <div class="bp-abc">${[..."abcdefghijklmnopqrstuvwxyz-"].map((z) => `<button data-pz="${z}">${z}</button>`).join("")}</div>`
        : `<button class="zweit bp-ersatz" data-p-ersatz>⌨️ Ersatzweg: Code eintippen</button>`}
      ${meldung ? `<p class="bp-meldung" role="status">${esc(meldung)}</p>` : ""}
    </div>`;
}

function spieleBild(r) {
  const g = GRUPPEN[kat] || GRUPPEN[0];
  const online = (r.spieler || []).filter((x) => x.online).length;
  return `<div class="bp-kats">${GRUPPEN.map((x, i) => `<button data-pk="${i}" class="${i === kat ? "an" : ""}">${esc(x.titel)}</button>`).join("")}</div>
    <p class="bp-leise">Antippen startet das Spiel für alle ${online} verbundenen Gäste. Danach unter „Laufend“ auf „Los“.</p>
    <div class="bp-spiele">${g.ids.map(spiel).filter(Boolean).map((sp) => knopf(`<span class="bp-emo">${sp.emoji}</span><span><b>${esc(sp.name)}</b><small>${esc(sp.kurz || "")}</small></span>`, { typ: "_alle", wert: sp.id }, "bp-spiel", `data-spiel="${esc(sp.id)}"`)).join("")}</div>`;
}

function laufendBild(r) {
  const liste = P.liste(r);
  if (!liste.length) return `<p class="bp-leer">Gerade läuft kein Spiel.<br><button data-pr="spiele">🎮 Spiel starten</button></p>`;
  const fokus = ctx.fokusPid();
  return liste.map((p) => {
    const sp = spiel(p.spiel);
    if (!sp) return "";
    const nm = P.namen(r, p);
    const sammelt = p.phase === "sammeln";
    const ohne = P.ohneTrinken(r, p);
    const knoepfe = [];
    if (sammelt && p.spiel === "brett") knoepfe.push(`<button data-p-menue="${esc(p.pid)}" class="gruen gross">🎲 Hauptmenü öffnen</button>`);
    else if (sammelt) {
      knoepfe.push(knopf(`▶️ Los geht's (${p.mit.length} Spieler)`, { typ: "_los", p: p.pid }, "gruen gross", p.mit.length ? "" : "disabled"));
      if (sp.bot) knoepfe.push(knopf("🤖 Computer dazu", { typ: "_botneu", p: p.pid }, "zweit"));
      knoepfe.push(knopf(ohne ? "🧃 Ohne Trinken (umschalten)" : "🍺 Mit Trinken (umschalten)", { typ: "_ohne", p: p.pid, ohne: !ohne }, "zweit"));
    } else if (p.bm) {
      knoepfe.push(fokus === p.pid ? `<button data-pf="" class="zweit">↩️ Großbild beenden</button>` : `<button data-pf="${esc(p.pid)}" class="gruen">👁️ Groß am Beamer zeigen</button>`);
      // Partybrett ohne Rundenende: hier laesst es sich auswerten (statt nur abbrechen)
      if (p.spiel === "brett" && p.runden === 0) knoepfe.push(knopf("🏁 Jetzt auswerten", { typ: "_brettende", p: p.pid }, "zweit"));
    }
    if (!sammelt && p.spiel === "brett") knoepfe.push(knopf("💾 Speichern", { typ: "_brettspeichern", p: p.pid }, "zweit"));
    knoepfe.push(endeFrage === p.pid
      ? `${knopf("Ja, beenden", { typ: "_zurueck", p: p.pid }, "rot")}<button data-pende="" class="zweit">Doch nicht</button>`
      : `<button data-pende="${esc(p.pid)}" class="zweit">⏹️ Beenden</button>`);
    const bots = Object.keys(p.bots || {});
    return `<div class="bp-partie ${sammelt ? "sammelt" : ""}" data-pid="${esc(p.pid)}">
        <div class="bp-partie-kopf"><span class="bp-emo">${sp.emoji}</span><span><b>${esc(sp.name)}</b><small>${sammelt ? "sammelt Mitspieler – am Handy „Mitmachen“" : "läuft"}${bots.length ? ` · ${bots.length} Computer` : ""}</small></span></div>
        <div class="bp-namen">${nm.length ? nm.slice(0, 16).map((n) => `<span>${esc(n)}</span>`).join("") + (nm.length > 16 ? `<span>+ ${nm.length - 16}</span>` : "") : `<span class="bp-leise">noch niemand dabei</span>`}</div>
        <div class="bp-knoepfe">${knoepfe.join("")}</div></div>`;
  }).join("");
}

// Wer ist wie verbunden, wer meldet "Geht nicht", welches Spiel braucht den Notfall-Knopf. Hier steht es gross fuer die
// Spielleitung; Gaeste ohne Handy legt die Spielleitung am Handy an (Steuerseite), das Pult spielt nie mit.
function gaesteBild(r) {
  if (!wache) return `<p class="bp-leise">Wird geladen …</p>`;
  const laufend = P.liste(r).filter((p) => p.phase === "laeuft");
  const gr = r.rettung;
  return `${wache.meldungenHTML("data-p-meldung-ok")}
    ${wache.gaesteHTML(r)}
    <p class="bp-leise">Grün: gut verbunden. Gelb: wackelt. Rot: weg. Den Akku zeigen nur manche Handys.</p>
    ${laufend.length ? `<h3>🛟 Spiel retten</h3><p class="bp-leise">Hängt ein Spiel, geht es zum letzten funktionierenden Stand zurück.</p>` : ""}
    ${laufend.map((p) => {
      const sp = spiel(p.spiel);
      if (!sp) return "";
      return `<div class="bp-reihe" data-pid="${esc(p.pid)}">${rettenFrage === p.pid
        ? `${knopf(`Ja, ${esc(sp.name)} zurücksetzen`, { typ: "_retten", p: p.pid }, "rot")}<button class="zweit" data-p-retten="">Doch nicht</button>`
        : `<button class="zweit" data-p-retten="${esc(p.pid)}">🛟 ${sp.emoji} ${esc(sp.name)} retten</button>`}</div>`;
    }).join("")}
    ${gr ? `<p class="bp-leise" data-p-gerettet>${gr.leer ? "Kein älterer Stand gesichert." : `${esc(gr.name)} ist zurück auf dem Stand von vor ${gr.sek} Sekunden.`}</p>` : ""}`;
}

function beamerBild(r) {
  const B = ctx.B, st = B.steuer(r), jetzt = ctx.jetzt(), m = B.modus(st, jetzt), da = B.verfuegbar(r);
  const bm = (was, mehr = {}) => ({ typ: "_beamer", was, ...mehr });
  const g = BS.gezeigt(r, jetzt), aus = BS.ausgeblendet(r);
  const weg = P.liste(r).filter((p) => aus.includes(p.pid) && p.phase === "laeuft" && BS.BEAMER_SPIELE.includes(p.spiel));
  const name = (p) => { const sp = spiel(p.spiel); return sp ? `${sp.emoji} ${esc(sp.name)}` : ""; };
  return `${r.look === "halloween" ? knopf("😱 Schreckmoment!", bm("schreck"), "rot bp-schreck") : `<p class="bp-leise">Den Schreckmoment gibt es nur im Halloween-Aussehen (unter Einstellungen).</p>`}
    ${g ? `<h3>Spiel an der Wand: ${name(g.p)}</h3>${knopf("🙈 Spielansicht ausblenden – zurück zur Diashow", bm("spielaus", { pid: g.p.pid }), "zweit")}` : ""}
    ${weg.map((p) => knopf(`👁️ ${name(p)} wieder zeigen`, bm("spielan", { pid: p.pid }), "zweit")).join("")}
    <h3>Diashow</h3>
    <div class="bp-reihe">${knopf(st.diashow ? "⏸️ Diashow anhalten" : "▶️ Diashow an", bm("diashow"), st.diashow ? "zweit" : "gruen")}
      ${m.art === "fest" ? knopf("▶️ Zurück zur Diashow", bm("seite", { seite: null }), "gruen") : ""}${knopf("✋ Ereignis ausblenden", bm("weg"), "zweit")}</div>
    <div class="bp-reihe">${B.DAUERN.map((s) => knopf(`${s} s je Seite`, bm("dauer", { s }), st.dauer === s ? "an" : "zweit")).join("")}</div>
    <h3>Wand teilen</h3>
    ${knopf(st.geteilt ? "◧ Geteilt: an – Spiel links, Abendwertung rechts" : "◧ Geteilt: aus – Spiel über die ganze Wand", bm("geteilt"), st.geteilt ? "an bp-geteilt" : "zweit bp-geteilt")}
    ${knopf(st.ruhig ? "📳 Wackeln und Blitz am Brett: aus" : "📳 Wackeln und Blitz am Brett: an (Sternkauf, Diebstahl, Ausbruch, Bank)", bm("ruhig"), st.ruhig ? "zweit bp-ruhig" : "an bp-ruhig")}
    <h3>Seite zeigen <small class="bp-leise">(bleibt 30 Min. stehen)</small></h3>
    <div class="bp-raster">${B.SEITEN.map((s) => knopf(`${s.emo} ${esc(s.name)}${da.includes(s.id) ? "" : "<small>noch leer</small>"}`, bm("seite", { seite: s.id }), m.art === "fest" && m.seite === s.id ? "an" : "zweit")).join("")}</div>`;
}

function radBild(r) {
  const g = G.sicher(JSON.parse(JSON.stringify({ glueck: r.glueck || null })));
  const gl = (was, mehr = {}) => ({ typ: "_glueck", was, ...mehr });
  const leute = (r.spieler || []).filter((x) => x.online);
  const trinkAus = G.FELDER.filter((f) => f.trink).every((f) => g.aus.includes(f.id));
  return `<div class="bp-reihe">${knopf(g.frei ? "🔒 Rad für Gäste sperren" : "🔓 Rad für Gäste freigeben", gl("frei"), g.frei ? "zweit" : "gruen")}
      ${knopf(trinkAus ? "🍺 Trink-Felder wieder an" : "🧃 Alle Trink-Felder aus", gl("trinkaus"), "zweit")}</div>
    <h3>Rad drehen für …</h3>
    <div class="bp-raster">${leute.length ? leute.map((x) => knopf(`🎡 ${esc(x.name)}`, gl("fuer", { wert: x.id }), "zweit", `data-gast="${esc(x.name)}"`)).join("") : `<p class="bp-leise">Noch niemand verbunden.</p>`}</div>
    <h3>Joker geben</h3>
    <div class="bp-raster">${leute.map((x) => knopf(`🃏 ${esc(x.name)}`, gl("joker", { wert: x.id }), "zweit")).join("")}</div>`;
}

function raumBild(r) {
  const an = (x) => (x ? "an" : "zweit");
  return `<h3>Aussehen</h3>
    <div class="bp-raster">${Object.entries(A.LOOKS).map(([k, l]) => knopf(`${l.emoji} ${esc(l.name)}`, { typ: "_look", look: k }, r.look === k ? "an" : "zweit")).join("")}</div>
    <h3>Schalter</h3>
    <div class="bp-raster">${knopf(`🔞 Alle über 18: ${r.ab18 ? "an" : "aus"}`, { typ: "_ab18" }, an(r.ab18))}
      ${knopf(`🧃 Ohne Alkohol: ${r.ohneAlkohol ? "an" : "aus"}`, { typ: "_trink" }, an(r.ohneAlkohol))}
      ${knopf(`🧪 Testkonten: ${K.testkontenAn(r) ? "an" : "aus"}`, { typ: "_testkonten" }, an(K.testkontenAn(r)))}</div>
    <p class="bp-leise">Turniertafel eintragen geht weiter am Handy (Turniertafel). Hier am Beamer zeigst du sie über „📽️ Beamer → Seite zeigen“.</p>
    ${knopf("Steuerrechte dieses Beamers abgeben", { typ: "_adminweg" }, "zweit")}`;
}
