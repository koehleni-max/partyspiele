// Hauptmenue des Partybretts (Nico 06.11.2026: "Ja" zum Entwurf entwurf/): ersetzt die Sammelseite am Handy und das Pult am Beamer.
// Links die Karte gross, rechts die fuenf Reiter, unten Plaetze, Mitmach-Code und Start; am Handy dieselbe Ordnung untereinander.
// Die Spielleitung stellt alles ein, Gaeste sehen nur eine einfache Ansicht und aendern nur ihre eigene Figur.
//
// html(c) liefert das Bild, nach(c) fuellt danach 3D und QR-Code. c = { p, raum, nm, meineId, leitet, ort: "handy" | "beamer",
// lesen (nur ansehen), link, senden(a), neu() (neu zeichnen), admin, qr(), zusatz (HTML unter dem Kopf) }.
// Am Handy laufen Aktionen ueber data-a (app.js), am Beamer ueber data-hm (hier). Was nur dieses Geraet betrifft (Reiter, offene
// Zeile, aufgeklappte Gruppen), steht in ui und wird nicht gesendet.
import { esc } from "./hilfe.js";
import * as BR from "./brett.js";
import * as M from "./brett_menue.js";
import { KARTEN_REIHE } from "./brett_karten.js";
import { brett3dZeigen } from "./brett3d.js";

const BILD = { 1: "insel", 2: "vulkan", 3: "hafen", 4: "kaufhaus" };
export const bildVon = (nr) => `karten/${BILD[nr]}.jpg`;
const REITER = [["karte", "🗺️", "Karte", "Karte"], ["regeln", "📜", "Regeln", "Regeln"], ["tempo", "⏩", "Tempo", "Tempo"], ["spieler", "🧑‍🤝‍🧑", "Spieler", "Spieler & Teams"], ["extras", "🎁", "Extras", "Minispiele & Gegenstände"]];
const HUT_NAME = { party: "Partyhut", hexe: "Hexenhut", krone: "Krone", zylinder: "Zylinder", kappe: "Kappe", helm: "Helm" };
// Einteilung der Minispiele (Vorschlag E.D.I.T.H.); was hier fehlt, landet unter "Weitere"
const GRUPPEN = {
  // Geburtstags-Minis (minis_geburtstag.js) seit Restpaket 3d einsortiert: Farbverwirrung, Schüttelmeister, Torte, Kugel, Bierdeckel
  "Reaktion und Timing": ["Sekundengefühl", "Zielzone", "Blitzreaktion", "Nur bei Grün", "Pfeil-Chaos", "Springen & Ducken", "Duell um zwölf", "Taktgefühl", "Farbverwirrung"],
  "Geschick": ["Tipp-Marathon", "Pfeil-Folge", "Turmbau", "Links-Rechts-Sprint", "Hürdenlauf", "Münzregen", "Hungrige Schlange", "Geisterjagd", "Heißer Draht", "Meteoritenschauer", "Wackelige Eisscholle", "Kürbis-Schnitt", "Korbwurf",
    "Schüttelmeister", "Torte schneiden", "Kugel-Labyrinth"],
  "Rennen": ["Seifenkisten-Rennen", "Schlitten-Slalom", "Hamsterrad-Rennen"],
  "Zielen": ["Kegelbahn", "Bogenschießen im Wind", "Greifautomat", "Fallschirm-Landung", "Kanonen-Golf", "Weltraum-Abwehr", "Bierdeckel-Weitwurf"],
  "Kopf und Gedächtnis": ["Farbwort-Chaos", "Zahlen-Gedächtnis", "Schätzfrage", "Farbfolge merken", "Mathe-Blitz", "Zähl genau", "Finde den Anderen", "Zahlenkette", "Minenpfad", "Paare finden", "Dunkles Labyrinth"],
  "Glück und Mut": ["Ballon-Mut", "Höher oder tiefer", "Schatztruhen", "Zündschnur", "Würfelglück", "Einzigartige Zahl"],
  "Gegeneinander und Teams": ["Lavaboden", "Sumo-Ring", "Elfmeter-Duell", "Schnick-Schnack-Schnuck", "Brückenbau", "Tauziehen im Takt"],
};
function miniGruppen() {
  const rest = new Set(BR.MINI_IDS), liste = Object.entries(GRUPPEN).map(([art, titel]) => {
    const ids = BR.MINI_IDS.filter((id) => titel.includes(BR.miniInfo(id).titel));
    ids.forEach((id) => rest.delete(id));
    return [art, ids];
  });
  if (rest.size) liste.push(["Weitere", [...rest]]);
  return liste;
}

// ---------------------------------------------------------------- Figur (Knubbelfigur wie im Spiel, sechs Huete)
const HUT_SVG = {
  party: (c) => `<path d="M50 5 66 41H34Z" fill="#fff"/><path d="M45 16 41.5 24 59.5 31 56 18ZM37 34 34 41H66L63.500 35Z" fill="${c}"/><circle cx="50" cy="6" r="5.500" fill="#fff"/>`,
  hexe: (c) => `<path d="M60 3C50 6 41 20 33 39H68C65 26 62 14 60 3Z" fill="#4a3670" stroke="#fff5" stroke-width="1.500"/><path d="M33 39 36.500 31H65.800L68 39Z" fill="${c}"/><ellipse cx="50" cy="40" rx="37" ry="6.500" fill="#4a3670" stroke="#fff5" stroke-width="1.500"/>`,
  krone: () => `<path d="M26 41 22 13 37 26 50 8 63 26 78 13 74 41Z" fill="#ffc800" stroke="#d29a00" stroke-width="2.500" stroke-linejoin="round"/><circle cx="50" cy="31" r="4.500" fill="#ff4b4b"/><circle cx="35" cy="33" r="3" fill="#1cb0f6"/><circle cx="65" cy="33" r="3" fill="#58cc02"/>`,
  zylinder: (c) => `<rect x="31" y="5" width="38" height="35" rx="3" fill="#33334a" stroke="#fff5" stroke-width="1.500"/><rect x="32" y="28" width="36" height="8" fill="${c}"/><ellipse cx="50" cy="40" rx="35" ry="6" fill="#33334a" stroke="#fff5" stroke-width="1.500"/>`,
  kappe: (c) => `<path d="M21 40C21 16 79 16 79 40Z" fill="#fff"/><path d="M42 21.500C46 20 54 20 58 21.500L60 39H40Z" fill="${c}"/><path d="M60 40C72 36 88 38 96 44 84 47 70 46 60 44Z" fill="#fff" stroke="#0003" stroke-width="1.500"/>`,
  helm: () => `<path d="M21 33C8 30 6 16 11 7 13 18 19 22 29 23ZM79 33C92 30 94 16 89 7 87 18 81 22 71 23Z" fill="#fff3d6" stroke="#c9a86a" stroke-width="2"/><path d="M21 41C21 8 79 8 79 41Z" fill="#9aa0c7"/><rect x="19" y="35" width="62" height="8" rx="3" fill="#6d7196"/>`,
};
function figur(farbe, hut) {
  const c = `var(--s${farbe})`;
  return `<svg class="hm-fig" viewBox="0 0 100 124" aria-hidden="true">
    <ellipse cx="35" cy="115" rx="13" ry="7" fill="#15151f"/><ellipse cx="65" cy="115" rx="13" ry="7" fill="#15151f"/>
    <ellipse cx="14" cy="78" rx="9" ry="14" fill="${c}" transform="rotate(16 14 78)"/><ellipse cx="86" cy="78" rx="9" ry="14" fill="${c}" transform="rotate(-16 86 78)"/>
    <ellipse cx="50" cy="74" rx="38" ry="41" fill="${c}"/><ellipse cx="50" cy="74" rx="38" ry="41" fill="#000" opacity=".08" clip-path="inset(55% 0 0 0)"/>
    <ellipse cx="50" cy="94" rx="21" ry="17" fill="#fff" opacity=".42"/>
    <ellipse cx="36" cy="64" rx="9" ry="11.500" fill="#fff"/><ellipse cx="64" cy="64" rx="9" ry="11.500" fill="#fff"/>
    <circle cx="37" cy="66" r="5" fill="#15151f"/><circle cx="65" cy="66" r="5" fill="#15151f"/><circle cx="39" cy="63.500" r="1.800" fill="#fff"/><circle cx="67" cy="63.500" r="1.800" fill="#fff"/>
    <circle cx="23" cy="77" r="5" fill="#ff7aa8" opacity=".75"/><circle cx="77" cy="77" r="5" fill="#ff7aa8" opacity=".75"/>
    <path d="M41 80Q50 90 59 80" fill="none" stroke="#15151f" stroke-width="3.500" stroke-linecap="round"/>
    ${(HUT_SVG[hut] || HUT_SVG.party)(c)}</svg>`;
}

// ---------------------------------------------------------------- Stand dieses Geraets
const ui = { pid: null, reiter: null, offen: null, auf: new Set(), scroll: 0, meldung: "", meldungBis: 0 };
let aktuell = null;
const breit = () => typeof matchMedia === "function" && matchMedia("(min-width: 1100px)").matches;
const knopfAttr = (c, a) => { const t = JSON.stringify(a).replace(/'/g, "&#39;"); return c.lesen ? "disabled" : `${c.ort === "beamer" ? "data-hm" : "data-a"}='${t}'`; };
const karteVon = (p) => (typeof p.karte === "number" ? BR.BRETTER[p.karte] || null : null);
const istBot = (id) => String(id).startsWith("bot:");
const tempoWort = (w) => (w === null || w === undefined ? "gemischt" : M.STUFEN[w]);
const rundenText = (r) => (r === 0 ? "Unbegrenzt" : `${r} Runden`);
const hm = (p) => M.stand(p);

function schieber(key, wert, stufen, c) {
  const id = `hm-t-${key}`;
  return `<div class="hm-schieber"><input id="${id}" type="range" min="0" max="3" step="1" value="${wert ?? 1}" data-rk="${wert ?? ""}" data-tempo="${key}" aria-label="${key}" aria-valuetext="${tempoWort(wert)}" ${c.lesen ? "disabled" : ""}>
    ${stufen ? `<div class="hm-stufen">${M.STUFEN.map((s, i) => `<span class="${i === wert ? "an" : ""}" data-tempo-stufe="${key}" data-i="${i}">${s}</span>`).join("")}</div>` : ""}</div>`;
}
function zahl(c, wert, einheit, a, b) {
  return `<div class="hm-zahl"><button type="button" ${knopfAttr(c, a)} aria-label="weniger">−</button><output>${wert}<small>${einheit}</small></output><button type="button" ${knopfAttr(c, b)} aria-label="mehr">+</button></div>`;
}
function tempoGruppe(c, key, titel, hinweis, teile) {
  const t = hm(c.p).tempo, stufe = M.gruppenStufe(t, key), auf = ui.auf.has(`fein-${key}`) || breit();
  const fein = teile.map(([k, wort]) => `<div class="hm-feinzeile"><b>${wort}<em>${M.STUFEN[t[k]]}</em></b>${schieber(k, t[k], false, c)}</div>`).join("");
  return `<section class="hm-gruppe"><h3>${titel}<small>${tempoWort(stufe)}</small></h3><p class="hm-hinweis">${hinweis}</p>${schieber(key, stufe, true, c)}
    <details class="hm-fein" data-hmd="fein-${key}" ${auf ? "open" : ""}><summary>Einzeln einstellen</summary>${fein}</details></section>`;
}

const SEITEN = {
  karte: (c) => `<div class="hm-karten">${KARTEN_REIHE.map((nr) => { const k = BR.BRETTER[nr]; return `<button type="button" class="hm-kachel ${nr === c.p.karte ? "an" : ""}" ${knopfAttr(c, { typ: "_karte", karte: nr })}><span class="vorschau"><img src="${bildVon(nr)}" alt=""></span><span class="wort"><b>${k.emo} ${esc(k.name)}</b><small>${esc(k.kurz)} · ${k.next.length} Felder</small></span></button>`; }).join("")}
    <button type="button" class="hm-kachel ${c.p.karte === "zufall" ? "an" : ""}" ${knopfAttr(c, { typ: "_karte", karte: "zufall" })}><span class="vorschau zufall">🎲</span><span class="wort"><b>Überraschung</b><small>Der Würfel wählt die Karte</small></span></button></div>`,
  regeln: (c) => {
    const r = M.rundenVon(c.p), m = hm(c.p), mal = r || 30, ohne = !!c.p.ohne;
    const zuR = (d) => ({ typ: "_karte", runden: Math.max(1, Math.min(M.RUNDEN_MAX, mal + d)) }), zuS = (d) => ({ typ: "_hm", was: "stern", sterne: Math.max(1, Math.min(M.STERNE_MAX, m.sterne + d)) });
    return `<div class="hm-zweispaltig"><section class="hm-gruppe"><h3>Wie lange?</h3>${zahl(c, r || "∞", r ? "Runden" : "unbegrenzt", zuR(-1), zuR(1))}
      <div class="hm-chips">${[6, 8, 12, 20, 30, 0].map((x) => `<button type="button" class="${x === r ? "an" : ""}" ${knopfAttr(c, { typ: "_karte", runden: x })}>${x || "∞"}</button>`).join("")}</div></section>
    <section class="hm-gruppe"><h3>Früher Schluss</h3><label class="hm-schalter"><input type="checkbox" id="hm-stern-an" ${m.sternAn ? "checked" : ""} ${c.lesen ? "disabled" : ""}><i></i><span>Wer zuerst genug Sterne hat, gewinnt sofort</span></label>
      ${m.sternAn ? zahl(c, m.sterne, "Sterne", zuS(-1), zuS(1)) : `<p class="hm-hinweis">${r ? "Es wird bis zur letzten Runde gespielt." : "Ohne Sternziel läuft das Spiel, bis die Spielleitung es beendet."}</p>`}</section></div>
    <section class="hm-gruppe"><h3>Trinken</h3><div class="hm-wahl"><button type="button" class="${ohne ? "" : "an"}" ${knopfAttr(c, { typ: "_ohne", ohne: false })}>🍺 Mit Trinken</button><button type="button" class="${ohne ? "an" : ""}" ${knopfAttr(c, { typ: "_ohne", ohne: true })}>🧃 Ohne Trinken</button></div></section>
    ${c.admin && c.ort === "handy" ? `<button type="button" class="zweit" data-br-reiter>📋 Ereignisse des ❓-Felds ansehen und streichen</button>` : ""}`;
  },
  tempo: (c) => `<div class="hm-zweispaltig">${tempoGruppe(c, "spiel", "Spieltempo", "Wie schnell das Spiel voranschreitet.", [["zug", "Zeit je Zug"], ["pause", "Pausen"], ["bots", "Computer-Mitspieler"]])}
    ${tempoGruppe(c, "anim", "Animationstempo", "Wie schnell alles im Bild abläuft.", [["figuren", "Figuren"], ["wuerfel", "Würfel"], ["kamera", "Kamerafahrten"]])}</div>`,
  // Am Handy klappt die Wahl von Farbe und Figur unter dem Namen auf, am PC steht sie daneben: dort muss nichts gerollt werden
  spieler: (c) => {
    const p = c.p, m = hm(p), weit = breit(), id = p.mit[ui.offen], ich = p.mit.includes(c.meineId), voll = p.mit.length >= M.SPIELER_MAX;
    return `<section class="hm-gruppe"><h3>Teams</h3><div class="hm-wahl"><button type="button" class="${m.teams ? "" : "an"}" ${knopfAttr(c, { typ: "_hm", was: "teams", an: false })}>Jeder für sich</button><button type="button" class="${m.teams ? "an" : ""}" ${knopfAttr(c, { typ: "_hm", was: "teams", an: true })}>Feste Teams</button></div></section>
    <div class="hm-zweispaltig"><section class="hm-gruppe"><h3>Wer macht mit?<small>${p.mit.length} Spieler</small></h3><ul class="hm-liste">${p.mit.map((x, i) => spielerZeile(c, x, i, weit)).join("")}</ul>
    <div class="hm-dazu"><button type="button" class="zweit" ${knopfAttr(c, { typ: "_botneu" })} ${voll ? "disabled" : ""}>🤖 Computer dazu</button>${c.ort === "handy" ? (ich ? `<button type="button" class="zweit" data-teilen="${esc(c.link)}">📨 Leute einladen</button>` : `<button type="button" class="zweit gruen" ${knopfAttr(c, { typ: "_mit" })}>🙋 Ich mache mit</button>`) : ""}</div></section>
    ${weit ? `<section class="hm-gruppe"><h3>${id ? esc(c.nm[ui.offen]) : "Farbe und Figur"}</h3>${id ? spielerWahl(c, id) : `<p class="hm-hinweis">Tippe links auf einen Spieler.</p>`}</section>` : ""}</div>`;
  },
  extras: (c) => {
    const weg = new Set(c.raum.brettWeg || []), gruppen = miniGruppen(), alle = BR.MINI_IDS.length, miniAn = BR.MINI_IDS.filter((id) => !weg.has(`m:${id}`)).length, wareAn = BR.WAREN.filter((w) => !weg.has(`w:${w.id}`)).length;
    const arten = gruppen.map(([art, ids], i) => {
      const n = ids.filter((id) => !weg.has(`m:${id}`)).length, auf = ui.auf.has(`art-${i}`) || (i === 0 && !ui.auf.has("art-zu"));
      return `<details class="hm-art" data-hmd="art-${i}" ${auf ? "open" : ""}><summary>${esc(art)}<small>${n} von ${ids.length}</small></summary><div class="hm-chipliste">${ids.map((id) => { const x = BR.miniInfo(id), aus = weg.has(`m:${id}`); return `<button type="button" class="hm-chip ${aus ? "aus" : ""}" ${knopfAttr(c, { typ: "_brettweg", was: "mini", id })} aria-pressed="${!aus}">${x.emo} ${esc(x.titel)}</button>`; }).join("")}</div></details>`;
    }).join("");
    return `<div class="hm-zweispaltig"><section class="hm-gruppe"><h3>Minispiele<small>${miniAn} von ${alle} an</small></h3><div class="hm-zeile"><button type="button" ${knopfAttr(c, { typ: "_brettweg", was: "minisauf" })}>Alle an</button><button type="button" ${knopfAttr(c, { typ: "_brettweg", was: "minisweg" })}>Alle aus</button></div>${miniAn ? "" : `<p class="hm-hinweis">Ohne Minispiele geht es nach jeder Runde gleich weiter.</p>`}${arten}</section>
      <section class="hm-gruppe"><h3>Gegenstände<small>${wareAn} von ${BR.WAREN.length} an</small></h3><div class="hm-zeile"><button type="button" ${knopfAttr(c, { typ: "_brettweg", was: "warenauf" })}>Alle an</button><button type="button" ${knopfAttr(c, { typ: "_brettweg", was: "warenweg" })}>Alle aus</button></div>
      <div class="hm-chipliste">${BR.WAREN.map((w) => { const aus = weg.has(`w:${w.id}`); return `<button type="button" class="hm-chip ${aus ? "aus" : ""}" ${knopfAttr(c, { typ: "_brettweg", was: "ware", id: w.id })} aria-pressed="${!aus}">${w.emo} ${esc(w.name)}</button>`; }).join("")}</div></section></div>`;
  },
};
function spielerWahl(c, id) {
  const m = hm(c.p), f = m.fig[id] || { farbe: 0, hut: "party" };
  const belegt = new Set(c.p.mit.filter((x) => x !== id && m.fig[x]).map((x) => m.fig[x].farbe));
  return `<div class="hm-sp-wahl"><h4>Farbe</h4><div class="hm-farben">${Array.from({ length: M.FARBEN_ZAHL }, (_, k) => `<button type="button" class="hm-farbe ${k === f.farbe ? "an" : ""}" style="background:var(--s${k})" ${knopfAttr(c, { typ: "_figur", id, farbe: k })} aria-label="Farbe ${k + 1}" ${belegt.has(k) ? "disabled" : ""}></button>`).join("")}</div>
    <h4>Figur</h4><div class="hm-huete">${M.HUT_IDS.map((k) => `<button type="button" class="hm-hut ${k === f.hut ? "an" : ""}" ${knopfAttr(c, { typ: "_figur", id, hut: k })}>${figur(f.farbe, k)}${HUT_NAME[k]}</button>`).join("")}</div></div>`;
}
function spielerZeile(c, id, i, weit) {
  const m = hm(c.p), f = m.fig[id] || { farbe: i % 20, hut: "party" }, offen = ui.offen === i, wahl = offen && !weit ? spielerWahl(c, id) : "", bot = istBot(id);
  const art = bot ? "Computer" : id === c.p.mit[0] ? "startet" : "Gast", t = m.team[id] === 1 ? 1 : 0;
  const rechts = m.teams ? `<button type="button" class="hm-team t${t}" ${knopfAttr(c, { typ: "_hm", was: "team", id })}>${M.TEAM_NAMEN[t]}</button>` : `<span class="auf">${weit ? (offen ? "◀ gewählt" : "") : offen ? "▲" : "ändern ▼"}</span>`;
  const weg = bot ? `<button type="button" class="hm-weg" ${knopfAttr(c, { typ: "_botweg", id })} aria-label="Computer entfernen">✕</button>` : "";
  return `<li class="hm-sp ${offen ? "offen" : ""} ${bot ? "bot" : ""}"><div class="hm-sp-kopf" role="button" tabindex="0" data-hmo="${i}">${figur(f.farbe, f.hut)}<span class="wer"><b>${esc(c.nm[i] || "")}</b><small>${art}</small></span><span class="rechts2">${rechts}${weg}</span></div>${wahl}</li>`;
}

function kurzMarken(c) {
  const p = c.p, m = hm(p), an = BR.MINI_IDS.filter((id) => !(c.raum.brettWeg || []).includes(`m:${id}`)).length;
  return [rundenText(M.rundenVon(p)), m.sternAn ? `bis ${m.sterne} Sterne` : "", p.ohne ? "🧃 Ohne Trinken" : "🍺 Mit Trinken", `⏩ ${tempoWort(M.gruppenStufe(m.tempo, "spiel"))}`, m.teams ? "Feste Teams" : "", `🎮 ${an} Minispiele`].filter(Boolean);
}
function buehne(c) {
  const p = c.p, k = karteVon(p), leer = p.karte === undefined || p.karte === null, zufall = p.karte === "zufall", i = k ? KARTEN_REIHE.indexOf(k.nr) : -1, n = KARTEN_REIHE.length;
  const bild = leer ? `<div class="hm-leer"><span>🗺️</span><b>Noch keine Karte gewählt</b></div>`
    : zufall ? `<div class="hm-leer"><span>🎲</span><b>Überraschung</b>Der Würfel wählt beim Start.</div>` : `<img src="${bildVon(k.nr)}" alt="Die Karte ${esc(k.name)} von oben">`;
  const pfeile = !k || !c.leitet ? "" : `<button type="button" class="hm-pfeil links" ${knopfAttr(c, { typ: "_karte", karte: KARTEN_REIHE[(i + n - 1) % n] })} aria-label="Karte davor">‹</button><button type="button" class="hm-pfeil rechts" ${knopfAttr(c, { typ: "_karte", karte: KARTEN_REIHE[(i + 1) % n] })} aria-label="Karte danach">›</button>`;
  const name = leer ? "" : `<div class="hm-name"><h2>${k ? `${k.emo} ${esc(k.name)}` : "🎲 Überraschung"}</h2>${k ? `<span class="hm-marke">${esc(k.kurz)}</span>` : ""}</div>`;
  return `<section class="hm-buehne" aria-label="Gewählte Karte"><div class="hm-bild" data-karte-bild="${esc(String(p.karte ?? ""))}">${bild}${pfeile}</div>
    <div class="hm-info">${name}${k ? `<p class="hm-text">${k.next.length} Felder · ${esc(k.text)}</p>` : ""}<div class="hm-kurz">${kurzMarken(c).map((t) => `<span>${t}</span>`).join("")}</div></div></section>`;
}
function plaetze(c) {
  const p = c.p, m = hm(p);
  const liste = p.mit.map((id, i) => { const f = m.fig[id] || { farbe: i % 20, hut: "party" }; return `<button type="button" class="hm-platz" data-hmp="${i}">${figur(f.farbe, f.hut)}<span><b>${esc(c.nm[i] || "")}</b><small>${m.teams ? M.TEAM_NAMEN[m.team[id] === 1 ? 1 : 0] : istBot(id) ? "Computer" : "Gast"}</small></span></button>`; }).join("");
  return `<div class="hm-plaetze ${p.mit.length > 6 ? "dicht" : ""}">${liste}${p.mit.length < M.SPIELER_MAX && c.leitet ? `<button type="button" class="hm-platz dazu" ${knopfAttr(c, { typ: "_botneu" })}>＋ Computer</button>` : ""}</div>`;
}
function vorlagen(c) {
  const eigene = c.raum.brettVorlagen || {}, wahl = hm(c.p).vorlage;
  const namen = [...Object.keys(M.VORLAGEN), ...Object.keys(eigene)];
  const zeile = (n) => `<option value="${esc(n)}" ${n === wahl ? "selected" : ""}>${esc(n)}</option>`;
  return `<div class="hm-vorlage"><label for="hm-vorlage">Vorlage</label><select id="hm-vorlage" data-rk="${esc(wahl || "")}" ${c.lesen ? "disabled" : ""}><option value="" ${wahl ? "" : "selected"}>Eigene Einstellung</option>${namen.map(zeile).join("")}</select>
    <button class="klein2" type="button" ${knopfAttr(c, { typ: "_hm", was: "vorlage_speichern" })}>💾 Als Vorlage</button>${wahl && eigene[wahl] ? `<button class="klein2" type="button" ${knopfAttr(c, { typ: "_hm", was: "vorlage_weg", name: wahl })} aria-label="Vorlage löschen">🗑️</button>` : ""}</div>`;
}
function zurueckKnoepfe(c) {
  const zu = c.ort === "beamer" ? `<button class="klein2 hm-zurueck" type="button" data-hm-zu>‹ Übersicht</button>` : `<button class="klein2 hm-zurueck" type="button" data-ansicht="">‹ Übersicht</button>`;
  const ende = c.leitet ? `<button class="klein2 hm-abbruch" type="button" ${knopfAttr(c, { typ: "_zurueck" })} aria-label="Beenden">⏹️<span class="wort"> Beenden</span></button>` : "";
  const pult = c.ort === "beamer" ? `<button class="klein2" type="button" data-hm-pult>🛠️ Steuern</button>` : "";
  return `<span class="hm-oben">${zu}${ende}${pult}</span>`;
}
// Meldungen stehen im Kopf statt als Streifen ueber den Knoepfen und ueberstehen das Neuzeichnen
const MELDUNG_DAUER = 2600;
const meldungJetzt = () => (ui.meldung && Date.now() < ui.meldungBis ? ui.meldung : "");
export function meldung(text) {
  ui.meldung = text; ui.meldungBis = Date.now() + MELDUNG_DAUER;
  meldungZeigen();
  setTimeout(meldungZeigen, MELDUNG_DAUER + 30);
}
function meldungZeigen() {
  const el = document.querySelector("[data-hm-meldung]");
  if (!el) return;
  const t = meldungJetzt();
  el.textContent = t || "Hauptmenü"; el.classList.toggle("an", !!t);
}
const kopf = (c, vorlage) => `<header class="hm-kopf">${zurueckKnoepfe(c)}<div class="hm-titel"><span class="hm-wuerfel" aria-hidden="true">🎲</span><div><h1>Partybrett</h1><small data-hm-meldung role="status" class="${meldungJetzt() ? "an" : ""}">${esc(meldungJetzt() || "Hauptmenü")}</small></div></div>${vorlage}${c.zusatz ? `<div class="hm-zusatz">${c.zusatz}</div>` : ""}</header>`;
const qrFeld = (c) => `<div class="hm-mitmachen"><div class="hm-qr" ${c.ort === "beamer" ? "data-bqr" : `data-qr="${esc(c.link)}"`}></div><span><b>Mitmachen</b><small>Mit dem Handy<br>scannen</small></span></div>`;

function leiterBild(c) {
  const p = c.p;
  const seite = (SEITEN[ui.reiter] || SEITEN.regeln)(c);
  const grund = c.lesen ? "Die Spielleitung startet" : M.startGrund(p);
  const reiter = REITER.map(([id, emo, kurz, lang]) => `<button type="button" role="tab" aria-selected="${id === ui.reiter}" data-hmr="${id}"><span class="emo">${emo}</span><span class="kurz">${kurz}</span><span class="lang">${lang}</span></button>`).join("");
  return `<main class="hm ${c.lesen ? "lesen" : ""}" data-reiter="${ui.reiter}">${kopf(c, vorlagen(c))}${buehne(c)}
    <section class="hm-pult" aria-label="Einstellungen"><nav class="hm-reiter" role="tablist">${reiter}</nav><div class="hm-inhalt" data-seite="${ui.reiter}" role="tabpanel">${seite}</div></section>
    <footer class="hm-fuss">${plaetze(c)}${qrFeld(c)}<button class="gross hm-los" id="hm-los" type="button" ${c.lesen ? "" : knopfAttr(c, { typ: "_los" })} data-klang="los" ${grund ? "disabled" : ""}>${grund || `▶️ Los geht's (${p.mit.length} Spieler)`}</button></footer></main>`;
}

// Gaeste (Testrolle Karin): nichts entscheiden muessen, nur die eigene Figur; was eingestellt ist, steht zum Lesen da
function gastBild(c) {
  const p = c.p, k = karteVon(p), r = M.rundenVon(p), m = hm(p), dabei = p.mit.includes(c.meineId);
  const name = k ? `${k.emo} ${esc(k.name)}` : p.karte === "zufall" ? "🎲 Überraschung" : "🗺️ Karte wird noch gewählt";
  const leute = p.mit.map((id, i) => { const f = m.fig[id] || { farbe: i % 20, hut: "party" }; return `<li class="hm-gast-sp">${figur(f.farbe, f.hut)}<span><b>${esc(c.nm[i] || "")}</b>${id === c.meineId ? ` <small class="du">(du)</small>` : ""}${m.teams ? `<small>${M.TEAM_NAMEN[m.team[id] === 1 ? 1 : 0]}</small>` : ""}</span></li>`; }).join("");
  return `<main class="hm gast" data-reiter="gast">${kopf(c, "")}${buehne(c)}
    <p class="mitte leise klein kartenwahl-info">${name} · ${r ? `${r} Runden` : "ohne Rundenende"}</p>
    <p class="mitte leise klein trinkwahl-info">${p.ohne ? "🧃 Ohne Trinken: statt Schlucken gibt es Strafpunkte oder kleine Aufgaben" : "🍺 Mit Trinken"}</p>
    ${dabei ? `<section class="hm-gruppe"><h3>Deine Figur</h3>${spielerWahl(c, c.meineId)}</section>` : `<button class="gross gruen" type="button" ${knopfAttr(c, { typ: "_mit" })}>🙋 Mitmachen</button>`}
    <section class="hm-gruppe"><h3>Wer macht mit?<small>${p.mit.length} Spieler</small></h3><ul class="hm-gast-liste">${leute}</ul></section>
    ${dabei && p.mit[0] !== c.meineId ? `<button class="zweit" type="button" ${knopfAttr(c, { typ: "_raus" })}>Doch nicht</button>` : ""}
    <div class="hinweisbox warten">${esc(c.nm[0] || "Die Spielleitung")} startet, sobald alle dabei sind …</div></main>`;
}

export function html(c) {
  if (ui.pid !== c.p.pid) {
    ui.pid = c.p.pid; ui.scroll = 0;
    ui.reiter = c.p.karte === undefined || c.p.karte === null ? "karte" : "regeln";
    ui.offen = c.leitet ? 0 : null;
  }
  aktuell = c;
  return c.leitet || c.lesen ? leiterBild(c) : gastBild(c);
}

// Echtes 3D statt Foto: an der Wand und bei der Spielleitung; Gaeste sehen das Foto derselben Karte (schont ihre Handys)
const vorschauStaende = {};
export function nach(c) {
  const inhalt = document.querySelector(".hm-inhalt");
  if (inhalt) inhalt.scrollTop = ui.scroll;
  if (c.qr) c.qr();
  const k = karteVon(c.p), feld = document.querySelector(".hm-bild");
  if (!k || !feld || !(c.leitet || c.ort === "beamer") || (typeof globalThis !== "undefined" && globalThis.__brettTest)) return;
  const s = vorschauStaende[k.nr] || (vorschauStaende[k.nr] = BR.vorschauStand(k.nr));
  s.ohne = !!c.p.ohne;
  try {
    if (brett3dZeigen(feld, s, BR.brettMuster(s), { ...BR.brett3dDaten(s), vorschau: true, beamer: c.ort === "beamer" })) feld.classList.add("hat-3d");
  } catch (e) { console.warn("3D-Vorschau:", e); }
}

// ---------------------------------------------------------------- Eingaben (nur dieses Geraet oder ohne eigenen Knopf)
function sende(a) { if (aktuell && !aktuell.lesen) aktuell.senden(a); }
const neu = () => { if (aktuell && aktuell.neu) aktuell.neu(); };
document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (!t || !t.closest || !t.closest(".hm")) return;
  const r = t.closest("[data-hmr]");
  if (r) { ui.reiter = r.dataset.hmr; ui.scroll = 0; return neu(); }
  const pl = t.closest("[data-hmp]");
  if (pl) { ui.reiter = "spieler"; ui.offen = Number(pl.dataset.hmp); ui.scroll = 0; return neu(); }
  const st = t.closest("[data-tempo-stufe]");
  if (st) return sende({ typ: "_hm", was: "tempo", key: st.dataset.tempoStufe, wert: Number(st.dataset.i) });
  const b = t.closest("[data-hm]");
  if (b) { if (b.disabled) return; try { sende(JSON.parse(b.dataset.hm)); } catch (e) { console.warn(e); } return; }
  // Zeile aufklappen, aber nicht, wenn drin ein eigener Knopf (Team, Computer weg) gedrueckt wurde
  const z = t.closest("[data-hmo]");
  if (z && !t.closest("button")) { const i = Number(z.dataset.hmo); ui.offen = ui.offen === i && !breit() ? null : i; neu(); }
});
document.addEventListener("keydown", (ev) => {
  if ((ev.key !== "Enter" && ev.key !== " ") || !ev.target.closest || !ev.target.matches("[data-hmo]")) return;
  ev.preventDefault(); ev.target.click();
});
// Schieber: beim Ziehen nur die Anzeige, gesendet wird beim Loslassen (sonst zeichnet der Stand den Schieber unter dem Finger neu)
document.addEventListener("input", (ev) => {
  const f = ev.target;
  if (!f.dataset || !f.dataset.tempo) return;
  f.setAttribute("aria-valuetext", M.STUFEN[Number(f.value)]);
  f.closest(".hm-schieber").querySelectorAll(".hm-stufen span").forEach((s, i) => s.classList.toggle("an", i === Number(f.value)));
});
document.addEventListener("change", (ev) => {
  const f = ev.target;
  if (f.dataset && f.dataset.tempo) sende({ typ: "_hm", was: "tempo", key: f.dataset.tempo, wert: Number(f.value) });
  else if (f.id === "hm-stern-an") sende({ typ: "_hm", was: "stern", an: f.checked });
  else if (f.id === "hm-vorlage" && f.value) sende({ typ: "_hm", was: "vorlage_laden", name: f.value });
});
// aufgeklappte Gruppen und die Rollstelle ueberstehen das Neuzeichnen
document.addEventListener("toggle", (ev) => {
  const d = ev.target;
  if (!d.dataset || !d.dataset.hmd) return;
  if (d.open) ui.auf.add(d.dataset.hmd); else { ui.auf.delete(d.dataset.hmd); if (d.dataset.hmd === "art-0") ui.auf.add("art-zu"); }
}, true);
document.addEventListener("scroll", (ev) => { if (ev.target.classList && ev.target.classList.contains("hm-inhalt")) ui.scroll = ev.target.scrollTop; }, true);
// fuer die Tests und den Controller
export const uiStand = () => ({ reiter: ui.reiter, offen: ui.offen });
