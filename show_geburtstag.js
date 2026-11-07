// Geburtstags-Runde G - Show und Abschluss (Nico 06.11.2026: Vorschlaege 110, 112, 113 mit Ja).
//  - 110 Abschlusszeugnis: am Ende des Abends bekommt jeder Gast ein Zeugnis mit einem lustigen Titel. Alles kommt aus den
//    echten Daten der Gesamtwertung (wertung.js, nur bestaetigte Buchungen): Punkte, Platz, Siege, Lieblingsspiel,
//    Duelle, Pokalrunden, Niederlagen und Herzen. Jeder Titel wird hoechstens einmal vergeben (der Staerkste zuerst).
//  - 113 Bester Verlierer: wer am oefter verloren hat (Gegner in bestaetigten Duellen/Bierpong) und trotzdem gute Laune
//    verbreitet (Herzen zaehlen mit) - Sonderehrung im Abschluss. Der Abendsieger kann es nicht werden.
//  - 112 Gute-Laune-Herzen: jeder Gast verteilt bis zu HERZEN_JE Herzen an andere (je Person hoechstens eins, nie an sich
//    selbst, nochmal tippen nimmt es zurueck). Der Stand liegt in raum.tafel.herzen und wird mit der Tafel gesichert.
//    Aktion: {typ:"_tafel", was:"sh_herz", an:<Name>} - tafel.js reicht alle "sh_"-Aktionen hierher durch.
// Anzeige: Handy unter der Abendwertung (tafel.js, Modus "abend"), Herzen-Knoepfe auch in der Gesamtwertung;
// Beamer im Ereignis "abend" (beamer.js) als Kacheln.
import { esc, knopf, nameSauber } from "./hilfe.js";
import * as W from "./wertung.js";

export const HERZEN_JE = 3;
const schl = (n) => nameSauber(n).toLocaleLowerCase("de");
const gleich = (x, y) => schl(x) === schl(y);
const zaehlt = (b) => b.info && b.info.status === "bestaetigt" && b.runde != null;

// ---------------------------------------------------------------- Herzen
export function herzenVon(t, wer) { const h = (t && t.herzen) || {}, x = h[schl(wer)]; return x ? x.an.slice() : []; }

export function herzenStand(t) {
  const je = new Map();
  Object.values((t && t.herzen) || {}).forEach((x) => (x.an || []).forEach((n) => {
    const k = schl(n); if (!k) return;
    if (!je.has(k)) je.set(k, { name: nameSauber(n), n: 0 });
    je.get(k).n++;
  }));
  return [...je.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"));
}

export function aktion(t, a, ctx = {}) {
  if (a.was === "sh_feuerwerk") { if (ctx.gastgeber) t.feuerwerkAus = !t.feuerwerkAus; return; }
  if (a.was === "sh_klang") { const wer = nameSauber(ctx.wer); if (wer) klangWaehlen(t, wer, String(a.k || "")); return; }
  if (a.was !== "sh_herz") return;
  const wer = nameSauber(ctx.wer), an = nameSauber(a.an);
  if (!wer || !an || gleich(wer, an)) return;
  if (!t.herzen) t.herzen = {};
  const x = t.herzen[schl(wer)] || (t.herzen[schl(wer)] = { von: wer, an: [] });
  const i = x.an.findIndex((n) => gleich(n, an));
  if (i >= 0) x.an.splice(i, 1);
  else if (x.an.length < HERZEN_JE) x.an.push(an);
}

// ---------------------------------------------------------------- 105 Eigener Siegerklang
// Jeder Gast waehlt am Handy einen der vorhandenen Klaenge (ton.js). Der Beamer spielt ihn statt der Fanfare, wenn dieser
// Gast den Wanderpokal holt (Ereignis "pokal") oder die Abendwertung anfuehrt (Ereignis "abend").
// Aktion: {typ:"_tafel", was:"sh_klang", k:<Name>} - nochmal denselben tippen nimmt die Wahl zurueck.
export const SIEGKLAENGE = [["fanfare", "🎺 Fanfare"], ["sieg", "🎷 Saxofon"], ["tada", "✨ Tada"], ["techno", "🎛️ Techno"],
  ["troete", "📯 Tröte"], ["boing", "🤪 Boing"], ["wirbel", "🥁 Trommelwirbel"], ["wobble", "🌀 Wobble"]];
export function klangVon(t, wer) { const x = ((t && t.siegklang) || {})[schl(wer)]; return x ? x.k : null; }
function klangWaehlen(t, wer, k) {
  if (!SIEGKLAENGE.some(([n]) => n === k)) return;
  if (!t.siegklang) t.siegklang = {};
  if (klangVon(t, wer) === k) delete t.siegklang[schl(wer)];
  else t.siegklang[schl(wer)] = { von: wer, k };
}
// Klang fuer ein Beamer-Ereignis: Pokal = Sieger der letzten Runde mit Siegern, Abend = Platz 1. Ohne Wahl: null.
export function siegKlang(t, art) {
  if (!t) return null;
  const w = W.sicher(t);
  let namen = [];
  if (art === "pokal") { const r = (w.runden || []).filter((x) => (x.sieger || []).length).pop(); namen = r ? r.sieger : []; }
  else if (art === "abend") namen = W.stand(w, null).filter((x) => x.platz === 1 && x.summe > 0).map((x) => x.name);
  for (const n of namen) { const k = klangVon(t, n); if (k) return k; }
  return null;
}

// ---------------------------------------------------------------- 97 Feuerwerk am Beamer zur vollen Stunde
// In den ersten FW_FENSTER Minuten jeder vollen Stunde einmal (nicht mitten in einem Spiel - dann sobald es vorbei ist,
// solange das Fenster offen ist). Die Spielleitung schaltet es in der Gesamtwertung ab/an: raum.tafel.feuerwerkAus.
export const FW_FENSTER = 5;
export function feuerwerkFaellig(t, datum, zuletzt, spielLaeuft = false) {
  if (!t || t.feuerwerkAus || spielLaeuft || datum.getMinutes() >= FW_FENSTER) return null;
  const key = `${datum.toDateString()} ${datum.getHours()}`;
  return key === zuletzt ? null : { key, stunde: datum.getHours() };
}
export function renderFeuerwerkSchalter(t, info) {
  if (!info.gastgeber) return "";
  const aus = !!(t && t.feuerwerkAus);
  return `<div class="sh-fw"><p class="leise klein">🎆 Feuerwerk am Beamer zur vollen Stunde: <b>${aus ? "aus" : "an"}</b></p>
    ${knopf(aus ? "🎆 Feuerwerk wieder an" : "🔕 Feuerwerk aus", { typ: "_tafel", was: "sh_feuerwerk" }, "klein2")}</div>`;
}
// Zeichnet das Feuerwerk (Raketen-Bursts + Uhrzeit-Schriftzug) in ziel und raeumt nach ~7 s selbst auf
export function feuerwerk(ziel, stunde, doc = document) {
  cssEinhaengen(doc);
  const box = doc.createElement("div"); box.className = "sh-fw-buehne";
  box.innerHTML = `<div class="sh-fw-text">🎆 ${String(stunde).padStart(2, "0")}:00 Uhr! 🎆</div>`;
  const farben = ["#ff5fae", "#3fd0ff", "#ffd23f", "#5ef08a", "#ff9600", "#b98bff"];
  for (let b = 0; b < 7; b++) {
    const x = 10 + Math.random() * 80, y = 12 + Math.random() * 45, f = farben[b % farben.length], ab = b * 0.7;
    for (let i = 0; i < 18; i++) {
      const s = doc.createElement("i"), w = (i / 18) * Math.PI * 2, r = 14 + Math.random() * 8;
      s.className = "sh-fw-funke";
      s.style.cssText = `left:${x}vw;top:${y}vh;background:${f};box-shadow:0 0 1.2vmin ${f};animation-delay:${ab}s;--dx:${Math.cos(w) * r}vmin;--dy:${Math.sin(w) * r}vmin`;
      box.appendChild(s);
    }
  }
  ziel.appendChild(box);
  setTimeout(() => box.remove(), 7500);
  return box;
}

// ---------------------------------------------------------------- Zahlen je Gast aus der Wertung
export function statistik(t, namen = []) {
  const w = W.sicher(t), tab = W.stand(w, null, namen), herz = herzenStand(t);
  const je = new Map(tab.map((x) => [schl(x.name), { name: x.name, summe: x.summe, platz: x.platz, siege: 0, spiele: {}, duelle: 0, niederlagen: 0, pokal: 0, herzen: 0 }]));
  const dazu = (n) => { const k = schl(n); if (!k) return null; if (!je.has(k)) je.set(k, { name: nameSauber(n), summe: 0, platz: tab.length + 1, siege: 0, spiele: {}, duelle: 0, niederlagen: 0, pokal: 0, herzen: 0 }); return je.get(k); };
  w.buchungen.filter(zaehlt).forEach((b) => {
    (b.namen || []).forEach((n) => {
      const x = dazu(n); if (!x || !(b.punkte > 0)) return;
      x.siege++;
      if (b.kat !== "hand") x.spiele[b.kname] = (x.spiele[b.kname] || 0) + 1;
      if ((b.gegner || []).length) x.duelle++;
    });
    (b.gegner || []).forEach((n) => { const x = dazu(n); if (x) { x.niederlagen++; x.duelle++; } });
  });
  (w.runden || []).forEach((r) => (r.sieger || []).forEach((n) => { const x = dazu(n); if (x) x.pokal++; }));
  herz.forEach((h) => { const x = dazu(h.name); if (x) x.herzen = h.n; });
  return [...je.values()].sort((a, b) => a.platz - b.platz || a.name.localeCompare(b.name, "de"));
}

// Bester Verlierer: meiste Niederlagen (+ Herzen als Gute-Laune-Bonus), nicht der Abendsieger. Ohne Niederlagen:
// bei mindestens drei Gaesten der Letzte mit Punkten 0 oder wenig - sonst niemand.
export function besterVerlierer(liste) {
  const kand = liste.filter((x) => !(x.platz === 1 && x.summe > 0));
  const mitN = kand.filter((x) => x.niederlagen > 0)
    .sort((a, b) => (b.niederlagen * 2 + b.herzen) - (a.niederlagen * 2 + a.herzen) || a.summe - b.summe || a.name.localeCompare(b.name, "de"));
  if (mitN.length) return { ...mitN[0], grund: `${mitN[0].niederlagen}× knapp daneben${mitN[0].herzen ? ` und ${mitN[0].herzen} ${mitN[0].herzen === 1 ? "Herz" : "Herzen"} trotzdem` : ""}` };
  if (liste.length >= 3) { const x = kand.slice().sort((a, b) => a.summe - b.summe || b.herzen - a.herzen)[0]; return { ...x, grund: "hat tapfer bis zum Schluss mitgespielt" }; }
  return null;
}

const lieblingsspiel = (x) => Object.entries(x.spiele).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))[0];

// Titel-Regeln, staerkste zuerst. Jede Regel: [Pruefung, Titel, Satz] - ein Titel geht nur an einen Gast.
const REGELN = [
  ["sieger", (x) => x.platz === 1 && x.summe > 0, () => "Champion des Abends", (x) => `${x.summe} Punkte – keiner hatte mehr`],
  ["verlierer", (x, c) => c.verlierer && gleich(c.verlierer.name, x.name), () => "Bester Verlierer", (x, c) => c.verlierer.grund],
  ["herz", (x, c) => x.herzen > 0 && x.herzen === c.maxHerzen, () => "Gute-Laune-Kanone", (x) => `${x.herzen} ${x.herzen === 1 ? "Herz" : "Herzen"} von den anderen`],
  ["pokal", (x) => x.pokal >= 2, () => "Pokal-Sammler", (x) => `${x.pokal}× den Wanderpokal geholt`],
  ["duell", (x, c) => x.duelle >= 3 && x.duelle === c.maxDuelle, () => "Duell-Haudegen", (x) => `${x.duelle} Duelle ausgefochten`],
  ["meister", (x) => { const l = lieblingsspiel(x); return l && l[1] >= 2; }, (x) => `Meister im ${lieblingsspiel(x)[0]}`, (x) => `${lieblingsspiel(x)[1]}× gewonnen`],
  ["allround", (x) => Object.keys(x.spiele).length >= 3, () => "Allrounder", (x) => `in ${Object.keys(x.spiele).length} verschiedenen Spielen gewonnen`],
  ["treppchen", (x) => x.platz <= 3 && x.summe > 0, (x) => (x.platz === 2 ? "Vize-Champion" : "Bronze-Held"), (x) => `Platz ${x.platz} mit ${x.summe} Punkten`],
  ["einsieg", (x) => x.siege === 1, () => "Glückspilz", (x) => { const l = lieblingsspiel(x); return l ? `der eine Sieg bei ${l[0]} zählt doppelt` : "einmal ganz vorn"; }],
  ["fleiss", (x) => x.siege >= 2, () => "Fleißiges Lieschen", (x) => `${x.siege} Siege gesammelt`],
];
const ERSATZ = [["Geheimtipp für nächstes Jahr", "die Punkte kommen bestimmt noch"], ["Stimmungs-Garant", "dabei sein ist alles"],
  ["Ehrengast der Gemütlichkeit", "ganz entspannt durch den Abend"], ["Partylöwe", "immer mittendrin"], ["Joker der Runde", "unberechenbar wie immer"]];

// Zeugnisnoten (1 bis 3 - es ist ein Geburtstag)
function noten(x, n) {
  const p = x.summe > 0 ? Math.min(3, 1 + Math.floor(((x.platz - 1) * 3) / Math.max(1, n))) : 3;
  return [["Mitmachen", "1"], ["Punkte", String(p)], ["Gute Laune", x.herzen ? "1+" : "2"]];
}

export function zeugnisse(t, namen = []) {
  const liste = statistik(t, namen);
  const c = { verlierer: besterVerlierer(liste), maxHerzen: Math.max(0, ...liste.map((x) => x.herzen)), maxDuelle: Math.max(0, ...liste.map((x) => x.duelle)) };
  const vergeben = new Set(); let e = 0;
  return { verlierer: c.verlierer, liste: liste.map((x) => {
    let titel = null, satz = "";
    for (const [id, ok, ti, sa] of REGELN) {
      const tt = ok(x, c) && ti(x);
      if (tt && !vergeben.has(tt) && !(id === "verlierer" && vergeben.has("verlierer"))) { titel = tt; satz = sa(x, c); vergeben.add(tt); break; }
    }
    if (!titel) { const [ti, sa] = ERSATZ[e++ % ERSATZ.length]; titel = ti; satz = sa; }
    return { ...x, titel, satz, noten: noten(x, liste.length) };
  }) };
}

// ---------------------------------------------------------------- Anzeige
const MED = { 1: "🥇", 2: "🥈", 3: "🥉" };
const herzTaste = (an, mein) => knopf(`${mein ? "❤️" : "🤍"} ${esc(an)}`, { typ: "_tafel", was: "sh_herz", an }, `klein2 sh-herz${mein ? " an" : ""}`, `data-klang="${mein ? "los" : "richtig"}"`);

// Herzen verteilen (am eigenen Handy). namen = alle Gaeste
export function renderHerzen(t, info) {
  const ich = nameSauber(info.meinName);
  const andere = [...new Set((info.namen || []).map(nameSauber).filter((n) => n && !gleich(n, ich)))];
  if (!ich || !andere.length) return "";
  const mein = herzenVon(t, ich), rest = HERZEN_JE - mein.length;
  return `<div class="sh-herzen"><h3 class="tt-unter">❤️ Gute-Laune-Herzen</h3>
    <p class="leise klein">Wer hat heute für gute Laune gesorgt? Du hast ${HERZEN_JE} Herzen – ${rest ? `noch ${rest} frei` : "alle verteilt"}. Nochmal tippen nimmt eins zurück.</p>
    <div class="sh-herzliste">${andere.map((n) => herzTaste(n, mein.some((m) => gleich(m, n)))).join("")}</div></div>`;
}

// Siegerklang waehlen (am eigenen Handy) - Tippen spielt ihn gleich zur Probe ab
export function renderKlangWahl(t, info) {
  const ich = nameSauber(info.meinName);
  if (!ich) return "";
  const mein = klangVon(t, ich);
  return `<div class="sh-klaenge"><h3 class="tt-unter">🔊 Dein Siegerklang</h3>
    <p class="leise klein">Holst du den Pokal oder führst am Abend, spielt der Beamer deinen Klang. ${mein ? "Nochmal tippen = wieder Fanfare." : "Ohne Wahl gibt's die Fanfare."}</p>
    <div class="sh-herzliste">${SIEGKLAENGE.map(([k, txt]) => knopf(esc(txt), { typ: "_tafel", was: "sh_klang", k }, `klein2 sh-klang${mein === k ? " an" : ""}`, `data-klang="${k}"`)).join("")}</div></div>`;
}

// Alles, was der Gast selbst tippt: Herzen + Siegerklang
export const renderHandy = (t, info) => renderHerzen(t, info) + renderKlangWahl(t, info) + renderFeuerwerkSchalter(t, info);

function zeugnisKarte(z, eigen) {
  return `<div class="sh-zeugnis${eigen ? " eigen" : ""}"><div class="sh-z-kopf"><span class="sh-z-platz">${z.summe > 0 ? MED[z.platz] || z.platz + "." : "🎈"}</span><b>${esc(z.name)}</b></div>
    <div class="sh-z-titel">${esc(z.titel)}</div><div class="sh-z-satz">${esc(z.satz)}</div>
    <div class="sh-z-noten">${z.noten.map(([f, n]) => `<span>${f}: <b>${n}</b></span>`).join("")}</div>
    <div class="sh-z-fuss">${z.summe} Punkte · ${z.siege} Siege${z.herzen ? ` · ❤️ ${z.herzen}` : ""}</div></div>`;
}

// Handy: unter der Abendwertung - eigenes Zeugnis zuerst, Bester Verlierer, Herzen-Rangliste, alle Zeugnisse
export function renderAbschluss(t, info) {
  const { liste, verlierer } = zeugnisse(t, info.namen || []);
  if (!liste.length) return "";
  const ich = nameSauber(info.meinName), mein = liste.find((z) => gleich(z.name, ich));
  const herz = herzenStand(t).slice(0, 5);
  return `<div class="sh-abschluss">
    <h3 class="tt-unter">🎓 Abschlusszeugnisse</h3>
    ${mein ? zeugnisKarte(mein, true) : ""}
    ${verlierer ? `<div class="sh-verlierer"><span class="sh-v-emo">🥄</span><div><b>Bester Verlierer: ${esc(verlierer.name)}</b><small>${esc(verlierer.grund)}</small></div></div>` : ""}
    ${herz.length ? `<h3 class="tt-unter">💖 Die meisten Herzen</h3><ul class="tt-tabelle">${herz.map((h) => `<li class="tt-zeile klein"><span class="tt-name">${esc(h.name)}</span><b class="tt-wert">❤️ ${h.n}</b></li>`).join("")}</ul>` : ""}
    <div class="sh-zliste">${liste.filter((z) => z !== mein).map((z) => zeugnisKarte(z, false)).join("")}</div>
  </div>`;
}

// Beamer: im Ereignis "abend" unter dem Podest - Bester Verlierer, Herzen-Koenig und bis zu 12 Zeugnis-Kacheln
export function beamerAbschluss(t, namen = []) {
  if (!t) return "";
  const { liste, verlierer } = zeugnisse(t, namen);
  if (!liste.length) return "";
  const herz = herzenStand(t)[0];
  return `<div class="sh-bm">
    <div class="sh-bm-ehren">${verlierer ? `<span>🥄 Bester Verlierer: <b>${esc(verlierer.name)}</b></span>` : ""}${herz ? `<span>❤️ Gute-Laune-Kanone: <b>${esc(herz.name)}</b> (${herz.n})</span>` : ""}</div>
    <div class="sh-bm-kacheln">${liste.slice(0, 12).map((z) => `<div class="sh-bm-k"><b>${esc(z.name)}</b><span>${esc(z.titel)}</span></div>`).join("")}</div></div>`;
}

// Aussehen (eigene Klassen sh-*, als <style> einmal in den Kopf gehaengt - style.css bleibt unberuehrt)
export const CSS = `
.sh-herzliste{display:flex;flex-wrap:wrap;gap:6px}.sh-herz{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-herz.an{background:#7a1f3d;border-color:#ff6b9a}.sh-klang.an{background:#1f4d7a;border-color:#6bc4ff}
.sh-zeugnis{border:2px solid #d4af37;border-radius:12px;padding:10px 12px;margin:8px 0;background:linear-gradient(160deg,#fffaf0,#f3e7c9);color:#3b2a10;overflow-wrap:anywhere}
.sh-zeugnis.eigen{box-shadow:0 0 0 3px #ffd54a}
.sh-z-kopf{display:flex;gap:8px;align-items:center;font-size:1.05em}.sh-z-titel{font-size:1.25em;font-weight:800;margin:4px 0 2px;color:#8a1c1c}
.sh-z-satz{font-size:.92em;opacity:.85}.sh-z-noten{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0 2px;font-size:.88em}
.sh-z-fuss{font-size:.8em;opacity:.7}
.sh-verlierer{display:flex;gap:10px;align-items:center;border-radius:12px;padding:10px 12px;margin:8px 0;background:#2b3a55;overflow-wrap:anywhere}
.sh-verlierer small{display:block;opacity:.8}.sh-v-emo{font-size:2em}
.sh-fw{margin:10px 0}
.sh-fw-buehne{position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden}
.sh-fw-text{position:absolute;left:0;right:0;bottom:12vh;text-align:center;font-size:9vmin;font-weight:900;color:#fff;text-shadow:0 0 3vmin #ffd23f;animation:sh-fw-text 7s ease-out forwards}
.sh-fw-funke{position:absolute;width:1.1vmin;height:1.1vmin;border-radius:50%;opacity:0;animation:sh-fw-knall 1.8s ease-out forwards}
@keyframes sh-fw-knall{0%{opacity:1;transform:translate(0,0) scale(1.4)}70%{opacity:1}100%{opacity:0;transform:translate(var(--dx),calc(var(--dy) + 6vmin)) scale(.4)}}
@keyframes sh-fw-text{0%{opacity:0;transform:scale(.6)}12%{opacity:1;transform:scale(1.08)}20%{transform:scale(1)}85%{opacity:1}100%{opacity:0}}
.sh-bm{margin-top:14px}.sh-bm-ehren{display:flex;flex-wrap:wrap;gap:8px 28px;justify-content:center;font-size:1.3em;margin-bottom:10px}
.sh-bm-kacheln{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.sh-bm-k{background:rgba(255,255,255,.1);border:1px solid rgba(255,215,0,.5);border-radius:10px;padding:6px 10px;overflow:hidden}
.sh-bm-k b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sh-bm-k span{font-size:.9em;color:#ffd54a}
`;
export function cssEinhaengen(doc = typeof document !== "undefined" ? document : null) {
  if (!doc || doc.getElementById("sh-css")) return;
  const s = doc.createElement("style"); s.id = "sh-css"; s.textContent = CSS; doc.head.appendChild(s);
}
