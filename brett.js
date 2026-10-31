// Partybrett - eigenes Brettspiel mit Wuerfeln, Feldern, Sternen und Minispielen nach jeder Runde
// (in der Art bekannter Party-Brettspiele, eigene Umsetzung).
// Ausbau Nico 31.10.2026 (Punkt 8, alle vier Richtungen): groesseres Brett mit zwei Abzweigungen, Laden mit Gegenstaenden,
// Fallen, Schild, Ereignisfeld mit ~100 Zufaellen (brett_ereignisse.js, streichbar), wandernder Stern, Aufholhilfe,
// Schlussrunden-Ereignis, Bonussterne am Ende; 25 Minispiele (5 alte hier, 20 neue in brett_minis.js) in den Spielarten
// alle gegen alle, Team gegen Team, 1 gegen alle und Duell.
import { esc, knopf, zufall, ziehe, mischen, name, schlucke } from "./hilfe.js";
import * as T from "./texte.js";
import * as BE from "./brett_ereignisse.js";
import * as R from "./brett_minis.js";
import * as STAPEL from "./stapel.js";
import { brett3dZeigen } from "./brett3d.js";

const RUNDEN = 8;
const STERNPREIS = 10;
const AUFGABE_STRAFE = 2;
const BEUTEL = 3;   // hoechstens so viele Gegenstaende

// ---------------------------------------------------------------- Brett: Hauptrunde (36) + Abkuerzung (5) + Umweg (4)
// Feldarten: m = +3 Muenzen, v = -3 Muenzen, t = Trinkfeld (ohne Trinken: a = Aufgabenfeld), e = Ereignis, d = Duell, l = Laden
const HAUPT = "mmtemvlmemdtmevmlmetmvmemdmtemvlmedm";
const ABK = "vedvm";    // von Feld 8 quer ueber die Insel nach Feld 17 - kurz, aber gefaehrlich
const UMWEG = "mlem";   // von Feld 24 aussen herum nach Feld 29 - gleich lang, dafuer Laden und Muenzen
const MUSTER = HAUPT + ABK + UMWEG;
const NH = HAUPT.length, A0 = NH, U0 = NH + ABK.length, FELDER = MUSTER.length;
export const NEXT = Array.from({ length: FELDER }, (_, i) => (i < NH ? [(i + 1) % NH] : [i + 1]));
NEXT[8] = [9, A0]; NEXT[A0 + ABK.length - 1] = [17];
NEXT[24] = [25, U0]; NEXT[U0 + UMWEG.length - 1] = [29];
const PREV = Array.from({ length: FELDER }, () => []);
NEXT.forEach((nx, i) => nx.forEach((j) => PREV[j].push(i)));
PREV.forEach((p) => p.sort((x, y) => (x < NH ? 0 : 1) - (y < NH ? 0 : 1)));   // zurueck immer ueber die Hauptrunde
const WEGNAME = { 9: "➡️ Hauptweg", [A0]: "⚡ Abkürzung – kurz, aber gefährlich", 25: "➡️ Hauptweg", [U0]: "🌿 Umweg – mit Laden und Münzen" };
const OHNE_MUSTER = MUSTER.replace(/t/g, "a");
const muster = (s) => (s && s.ohne ? OHNE_MUSTER : MUSTER);
const ART = { m: ["🪙", "+3 Münzen"], v: ["💸", "−3 Münzen"], t: ["🍺", "Trinkfeld"], a: ["🎯", "Aufgabenfeld"], e: ["❓", "Ereignis"], d: ["⚔️", "Duell"], l: ["🛒", "Laden"] };

// Lage der Felder (x/z in Brett-Einheiten) - fuer 3D und die flache Ersatzansicht
function hauptXY(i) {
  const a = (i / NH) * Math.PI * 2;
  return { x: Math.cos(a) * 9.6 * (1 + 0.07 * Math.sin(a * 3)), z: Math.sin(a) * 7.6 * (1 + 0.07 * Math.cos(a * 2)) };
}
export const LAGE = (() => {
  const l = Array.from({ length: NH }, (_, i) => hauptXY(i));
  const zwischen = (a, b, k, n, f) => { const t = k / n, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, w = 1 + f * Math.sin(Math.PI * t); return { x: p.x * w, z: p.z * w }; };
  for (let k = 1; k <= ABK.length; k++) l.push(zwischen(l[8], l[17], k, ABK.length + 1, -0.42));
  for (let k = 1; k <= UMWEG.length; k++) l.push(zwischen(l[24], l[29], k, UMWEG.length + 1, 0.2));
  return l;
})();

// ---------------------------------------------------------------- Gegenstaende (Laden, Ereignisse)
export const WAREN = [
  { id: "doppel", emo: "🎲", name: "Doppelwürfel", preis: 5, text: "zwei Würfel in diesem Zug" },
  { id: "dreifach", emo: "🎰", name: "Dreifachwürfel", preis: 9, text: "drei Würfel in diesem Zug" },
  { id: "mini", emo: "🐢", name: "Mini-Würfel", preis: 2, text: "würfelt nur 1 bis 3 – zum gezielten Landen" },
  { id: "tausch", emo: "🔄", name: "Tauschtrank", preis: 7, text: "tausch den Platz mit jemandem" },
  { id: "dieb", emo: "🧲", name: "Münzmagnet", preis: 6, text: "klau jemandem bis zu 5 Münzen" },
  { id: "falle", emo: "🪤", name: "Falle", preis: 4, text: "auf dein Feld: wer dort landet, zahlt dir 5" },
  { id: "schild", emo: "🛡️", name: "Schutzschild", preis: 5, text: "fängt das nächste Unglück ab (wirkt von selbst)" },
  { id: "rohr", emo: "🌟", name: "Sternenrohr", preis: 14, text: "bringt dich direkt vor den Stern" },
];
const ware = (id) => WAREN.find((w) => w.id === id);
const LADEN = ["doppel", "mini", "dieb", "falle", "schild", "tausch", "dreifach", "rohr"];

// ---------------------------------------------------------------- Minispiele
// Die fuenf ersten (alte Fassung, eigener Code weiter unten und in controller.js) + 20 neue (brett_minis.js)
const ALT = {
  tappen: { titel: "Tipp-Marathon", emo: "👆", typ: "Geschick", regel: "Tippe so oft du kannst auf die Fläche – 5 Sekunden!" },
  farbwort: { titel: "Farbwort-Chaos", emo: "🎨", typ: "Kopf", regel: "Tippe die FARBE, in der das Wort geschrieben ist – nicht das Wort! 12 Sekunden." },
  reaktion: { titel: "Blitzreaktion", emo: "⚡", typ: "Reaktion", regel: "Tippe, sobald die Fläche grün wird. Zu früh = letzter Platz." },
  gedaechtnis: { titel: "Zahlen-Gedächtnis", emo: "🧠", typ: "Gedächtnis", regel: "Merk dir die Zahl – sie verschwindet nach 3 Sekunden." },
  schaetzen: { titel: "Schätzfrage", emo: "🎯", typ: "Wissen", regel: "Wer am nächsten dran ist, gewinnt." },
};
export const MINI_IDS = [...Object.keys(ALT), ...R.NEU_IDS];
export const miniInfo = (art) => (ALT[art] || R.NEU[art]);
const MODI = { alle: "Alle gegen alle", team: "Team gegen Team", eins: "Einer gegen alle", duell: "Duell" };

const testVorgabe = () => (typeof globalThis !== "undefined" && globalThis.__brettTest) || null;

function neuerStern(s) {
  const frei = [...MUSTER].map((f, i) => (f === "m" && i !== s.stern && !(s.pos || []).includes(i) ? i : -1)).filter((i) => i >= 0);
  return frei[zufall(frei.length)];
}

export const brett = {
  id: "brett", name: "Partybrett", emoji: "🎲", farben: ["#ff9600","#b4231f"], kurz: "Würfeln, Abzweigungen, Laden, Sterne kaufen, 25 Minispiele – 8 Runden",
  start(namen) {
    const n = namen.length, je = (v) => namen.map(() => (typeof v === "function" ? v() : v));
    const s = { runde: 1, dran: 0, pos: je(0), muenzen: je(5), sterne: je(0), phase: "wuerfeln", wurf: null, wuerfe: null,
      meldung: "Wer zuerst würfelt, fängt an!", stern: 0, mini: null, ende: false,
      waren: je(() => []), fallen: {}, rabatt: je(false), stat: { mini: je(0), gesammelt: je(0), ereignis: je(0) },
      rest: 0, wahl: null, spur: null, spurNr: 0, sternVorbei: false, wuerfelArt: null, wareBenutzt: false, zielWare: null,
      extra: false, schluss: null, bonus: null, miniNr: 0, sternSeit: 1, gezogen: [], effekt: null };
    s.stern = neuerStern(s);
    return s;
  },
  // Gesamtwertung: wer am Ende vorne liegt (Sterne, dann Muenzen - wie die Rangliste)
  ergebnis(s) {
    if (!s.ende) return null;
    const best = (j) => s.sterne[j] * 10000 + s.muenzen[j];
    const max = Math.max(...s.pos.map((_, j) => best(j)));
    return { nr: "1", sieger: s.pos.map((_, j) => j).filter((j) => best(j) === max) };
  },
  aktion(s, i, a, namen, raum) {
    if (a.typ === "neustart") return Object.assign(s, brett.start(namen));
    if (s.ende) return;
    sicher(s);
    const dran = i === s.dran;
    if (s.phase === "wuerfeln" && dran && a.typ === "wuerfeln") wuerfeln(s, i, namen, raum);
    else if (s.phase === "wuerfeln" && dran && a.typ === "ware") wareEinsetzen(s, i, a.ware, namen);
    else if (s.phase === "ziel" && dran && a.typ === "ziel" && a.ziel !== i && a.ziel >= 0 && a.ziel < s.pos.length) zielWirkung(s, i, a.ziel, namen);
    else if (s.phase === "ziel" && dran && a.typ === "nein") { if (s.zielWare) s.waren[i].push(s.zielWare); s.zielWare = null; s.wareBenutzt = false; s.phase = "wuerfeln"; s.meldung = `${namen[i]} steckt den Gegenstand wieder ein.`; }
    else if (s.phase === "weg" && dran && a.typ === "weg" && NEXT[s.pos[i]].includes(a.ziel)) { s.wahl = a.ziel; if (laufen(s, i)) nachLauf(s, i, namen, raum); }
    else if (s.phase === "stern" && dran && (a.typ === "kaufen" || a.typ === "nein")) {
      if (a.typ === "kaufen" && s.muenzen[i] >= sternPreis(s, i)) {
        const p = sternPreis(s, i);
        s.muenzen[i] -= p; s.sterne[i]++; s.rabatt[i] = false;
        s.meldung = `⭐ ${namen[i]} kauft einen Stern${p < STERNPREIS ? ` für nur ${p}` : ""}! Alle anderen trinken 1 Schluck.`;
        s.stern = neuerStern(s); s.sternSeit = s.runde;
        effekt(s, "stern", i);
      }
      feldWirkung(s, i, muster(s)[s.pos[i]], namen, raum);
    } else if (s.phase === "laden" && dran && a.typ === "kaufware") {
      const w = ware(a.ware);
      if (!w || !LADEN.includes(w.id) || s.muenzen[i] < w.preis || s.waren[i].length >= BEUTEL) return;
      s.muenzen[i] -= w.preis; s.waren[i].push(w.id);
      s.meldung = `🛒 ${namen[i]} kauft: ${w.emo} ${w.name}.`;
      s.phase = "weiter";
    } else if (s.phase === "laden" && dran && a.typ === "nein") { s.meldung = `🛒 ${namen[i]} kauft nichts.`; s.phase = "weiter"; }
    else if (s.phase === "duell" && dran && a.typ === "duell" && a.ziel !== i && a.ziel >= 0 && a.ziel < s.pos.length) {
      const ich = 1 + zufall(6), du = 1 + zufall(6);
      const sieger = ich >= du ? i : a.ziel, verl = sieger === i ? a.ziel : i;
      const beute = Math.min(4, s.muenzen[verl]);
      s.muenzen[verl] -= beute; geben(s, sieger, beute);
      s.meldung = `⚔️ Duell: ${namen[i]} ${ich} gegen ${namen[a.ziel]} ${du} – ${namen[sieger]} gewinnt ${beute} Münzen, ${namen[verl]} trinkt 2 Schlucke!`;
      zugEnde(s, namen, raum);
    } else if (s.phase === "weiter" && a.typ === "weiter") zugEnde(s, namen, raum);
    else if (s.phase === "aufgabe" && a.typ === "aufgabe" && dran) {
      if (!a.ok) { s.muenzen[i] = Math.max(0, s.muenzen[i] - AUFGABE_STRAFE); s.meldung = `🙅 ${namen[i]} kneift – −${AUFGABE_STRAFE} Münzen.`; }
      else s.meldung = `✅ ${namen[i]} hat die Aufgabe erledigt.`;
      zugEnde(s, namen, raum);
    } else if (s.phase === "bonus" && a.typ === "weiter") { s.ende = true; s.phase = "ende"; }
    else if (s.phase === "mini") miniAktion(s, i, a, namen, raum);
  },
  render(s, ich, namen, raum) {
    sicher(s);
    const tafel = `<div class="tafel">${namen.map((nm, j) => `<div class="${j === s.dran && s.phase !== "mini" ? "dran" : ""}"><span class="farbe f${j}"></span><b>${esc(nm)}</b>
      <span>⭐${s.sterne[j]}</span><span>🪙${s.muenzen[j]}</span>${s.waren[j].length ? `<span class="beutel" title="Gegenstände">${s.waren[j].map((w) => ware(w).emo).join("")}</span>` : ""}</div>`).join("")}</div>`;
    const m = s.meldung || "";
    const klang = /kauft einen Stern/.test(m) ? "stern" : /\+3 Münzen|\+6 Münzen/.test(m) ? "richtig" : /−3 Münzen|−6 Münzen/.test(m) ? "falsch" : /❓/.test(m) ? "magie" : /Duell/.test(m) ? "spannung" : /Trinkfeld|Aufgabenfeld|🛒/.test(m) ? "pop" : "";
    const meldung = `<div class="meldung">${esc(m)}</div>${klang ? `<i hidden data-key="bt-${s.runde}-${s.dran}-${m.length}-${klang}" data-ton="${klang}" data-ton-nach="${s.wurf && klang !== "stern" ? 400 + Math.min(12, s.wurf) * 280 : 0}"></i>` : ""}`;
    const schluss = s.schluss && !s.ende ? `<div class="schlussband">🔥 Schlussrunden: ${esc(SCHLUSS[s.schluss].text)}</div>` : "";
    if (s.ende) {
      const rang = rangfolge(s);
      return `${tafel}<div class="urteil">🏆 ${name(namen, rang[0])} gewinnt das Partybrett!</div>
        <ol class="rangliste">${rang.map((j) => `<li>${name(namen, j)}: ⭐${s.sterne[j]} 🪙${s.muenzen[j]}</li>`).join("")}</ol>
        ${bonusListe(s, namen)}
        <p class="mitte">${s.ohne ? `🎯 Letzter Platz: ${esc(T.AUFGABEN[(s.pos.length * 7 + s.muenzen.reduce((x, y) => x + y, 0)) % T.AUFGABEN.length])}` : "Letzter Platz trinkt 3 Schlucke 🍺"}</p>${knopf("Neues Spiel", { typ: "neustart" }, "gross")}`;
    }
    if (s.phase === "bonus") {
      return `${tafel}<div class="frage">🌟 Bonussterne!</div><p class="mitte leise">Nach ${RUNDEN} Runden gibt es noch Sterne für besondere Leistungen.</p>${bonusListe(s, namen)}
        <i hidden data-key="btbonus-${s.runde}" data-ton="stern"></i><i hidden data-ergebnis="bw-bonus"></i>${knopf("Weiter", { typ: "weiter" }, "gross")}`;
    }
    if (s.phase === "mini") return `${tafel}<i hidden data-key="btmini-${s.runde}-${s.mini && s.mini.art}" data-ton="los"></i>${miniRender(s, ich, namen)}`;
    const brettHtml = `<div id="brett3d" class="brett3d">${brett2d(s, namen)}<div class="brett3d-info">Runde ${Math.min(s.runde, RUNDEN)}/${RUNDEN}${s.wurf ? ` · 🎲 ${s.wuerfe && s.wuerfe.length > 1 ? `${s.wuerfe.join("+")} = ` : ""}${s.wurf}` : ""}</div></div>`;
    const istDran = ich === s.dran;
    const wer = esc(namen[s.dran]);
    let steuer = "";
    if (s.phase === "wuerfeln") {
      if (istDran) {
        const art = s.wuerfelArt ? ware(s.wuerfelArt) : null;
        const nutzbar = s.wareBenutzt ? [] : s.waren[ich].filter((w) => w !== "schild");
        steuer = `<i hidden data-key="btdran-${s.runde}-${s.dran}" data-ton="dran"></i>` + knopf("🎲 Würfeln", { typ: "wuerfeln" }, "gross")
          + (art ? `<p class="mitte leise">Aktiv: ${art.emo} ${esc(art.name)}</p>` : "")
          + (nutzbar.length ? `<p class="mitte leise klein">Oder vorher einen Gegenstand einsetzen:</p><div class="raster2 waren">${[...new Set(nutzbar)].map((w) => knopf(`${ware(w).emo} ${esc(ware(w).name)}`, { typ: "ware", ware: w }, "zweit")).join("")}</div>` : "");
      } else steuer = `<p class="mitte leise">${wer} würfelt …</p>`;
    }
    if (s.phase === "ziel") steuer = istDran ? `<p class="mitte">${esc(ware(s.zielWare).emo + " " + ware(s.zielWare).name)}: gegen wen?</p><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(`${esc(nm)}<small>🪙${s.muenzen[j]}</small>`, { typ: "ziel", ziel: j }, "gross"))).join("")}</div>${knopf("Doch nicht", { typ: "nein" }, "zweit")}`
      : `<p class="mitte leise">${wer} setzt einen Gegenstand ein …</p>`;
    if (s.phase === "weg") steuer = istDran ? `<p class="mitte">Abzweigung! Welcher Weg?</p><div class="raster wege">${NEXT[s.pos[ich]].map((z) => knopf(`${WEGNAME[z] || "➡️ Weiter"}<small>⭐ in ${sternAbstand(s, z) + 1} Feldern · noch ${s.rest} Schritte</small>`, { typ: "weg", ziel: z }, "gross")).join("")}</div>`
      : `<p class="mitte leise">${wer} wählt einen Weg …</p>`;
    if (s.phase === "stern") steuer = istDran ? `<div class="raster2">${knopf(`⭐ Kaufen (${sternPreis(s, ich)})`, { typ: "kaufen" }, "gross gelb")}${knopf("Nein", { typ: "nein" }, "gross")}</div>` : `<p class="mitte leise">${wer} überlegt …</p>`;
    if (s.phase === "laden") steuer = istDran ? `<p class="mitte">🛒 Laden – ${s.waren[ich].length}/${BEUTEL} im Beutel, du hast 🪙${s.muenzen[ich]}</p><div class="laden">${LADEN.map((id) => { const w = ware(id); const geht = s.muenzen[ich] >= w.preis && s.waren[ich].length < BEUTEL;
        return knopf(`<span>${w.emo} ${esc(w.name)} <b>${w.preis} 🪙</b></span><small>${esc(w.text)}</small>`, { typ: "kaufware", ware: id }, "ware-knopf", geht ? "" : "disabled"); }).join("")}</div>${knopf("🚪 Nichts kaufen", { typ: "nein" }, "zweit")}`
      : `<p class="mitte leise">${wer} stöbert im Laden …</p>`;
    if (s.phase === "duell") steuer = istDran ? `<p class="mitte">Wen forderst du heraus?</p><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "duell", ziel: j }, "gross"))).join("")}</div>` : `<p class="mitte leise">${wer} wählt einen Gegner …</p>`;
    if (s.phase === "weiter") steuer = knopf("Weiter", { typ: "weiter" }, "gross");
    if (s.phase === "aufgabe") steuer = istDran ? `<div class="raster2">${knopf("✅ Erledigt", { typ: "aufgabe", ok: true }, "gross gruen")}${knopf(`🙅 Keine Lust (−${AUFGABE_STRAFE} 🪙)`, { typ: "aufgabe", ok: false }, "gross")}</div>`
      : `<p class="mitte leise">${wer} ist mit der Aufgabe dran …</p>`;
    // nach dem Wurf steht das Feld erst eine Weile: Weiter, Kaufen/Nein, Wegwahl, Laden und die Duell-Wahl sind kurz gesperrt
    // (app.js), damit ein zweiter Tipp auf "Wuerfeln" nicht gleich das Ergebnis wegtippt
    const nachWurf = ["weiter", "stern", "duell", "aufgabe", "weg", "laden"].includes(s.phase) ? `<i hidden data-ergebnis="bw-${s.runde}-${s.dran}-${s.phase}-${m.length}"></i>` : "";
    return `${tafel}${schluss}${brettHtml}${meldung}${nachWurf}${steuer}`;
  },
  musik(s) { return s.ende ? null : "brett"; },
  // Computer-Mitspieler: wuerfeln, Wege, Laden, Gegenstaende, kaufen, duellieren und spielen die Minispiele mit glaubwuerdigen Werten
  botPause: (s) => (s.phase === "weiter" || s.phase === "bonus" ? 2800 : s.phase === "mini" ? 4500 : 1400),
  bot(s, i) {
    if (s.ende) return null;
    sicher(s);
    const n = s.pos.length;
    if (s.phase === "mini") {
      const m = s.mini;
      if (!m || m.fertig || m.werte[i] !== undefined || !teilVon(s, m).includes(i)) return null;
      if (R.istNeu(m.art)) return { typ: "mini", wert: R.botWert(m.art, m) };
      const r = (a, b) => a + zufall(b - a + 1);
      const wert = m.art === "tappen" ? r(18, 36) : m.art === "farbwort" ? r(4, 11) : m.art === "gedaechtnis" ? r(4, 8)
        : m.art === "reaktion" ? (Math.random() < 0.08 ? -1 : r(240, 470)) : Math.round(T.SCHAETZ[m.frage][1] * (0.55 + Math.random() * 0.9));
      return { typ: "mini", wert };
    }
    if (s.phase === "bonus") return { typ: "weiter" };
    if (s.dran !== i) return null;
    const andere = [...Array(n).keys()].filter((j) => j !== i).sort((a, b) => s.muenzen[b] - s.muenzen[a]);
    if (s.phase === "wuerfeln") {
      const nutz = s.wareBenutzt ? [] : s.waren[i].filter((w) => w !== "schild");
      if (nutz.length && Math.random() < 0.6) return { typ: "ware", ware: nutz[0] };
      return { typ: "wuerfeln" };
    }
    if (s.phase === "ziel") return { typ: "ziel", ziel: andere[0] };
    if (s.phase === "weg") { const nx = NEXT[s.pos[i]]; const d = nx.map((z) => sternAbstand(s, z)); return { typ: "weg", ziel: nx[d[0] <= d[1] ? 0 : 1] }; }
    if (s.phase === "stern") return { typ: "kaufen" };
    if (s.phase === "laden") { const geht = LADEN.filter((id) => s.muenzen[i] - ware(id).preis >= 5 && s.waren[i].length < BEUTEL); return geht.length ? { typ: "kaufware", ware: geht[zufall(geht.length)] } : { typ: "nein" }; }
    if (s.phase === "duell") return { typ: "duell", ziel: andere[0] };
    if (s.phase === "weiter") return { typ: "weiter" };
    if (s.phase === "aufgabe") return { typ: "aufgabe", ok: true };
    return null;
  },
  nach(s, ich, senden) {
    if (s.phase === "mini") return miniNach(s, ich, senden);
    const c = document.getElementById("brett3d");
    if (c && !s.ende && s.phase !== "bonus") {
      const zweiD = c.querySelector(".brett2d");
      if (brett3dZeigen(c, s, muster(s), { lage: LAGE, next: NEXT, waren: WAREN }) && zweiD) zweiD.remove();
    }
  },
};

// alte Staende (vor dem Ausbau) bekommen die neuen Felder
function sicher(s) {
  const je = (v) => s.pos.map(() => (typeof v === "function" ? v() : v));
  if (!Array.isArray(s.waren)) s.waren = je(() => []);
  if (!s.fallen || typeof s.fallen !== "object") s.fallen = {};
  if (!Array.isArray(s.rabatt)) s.rabatt = je(false);
  if (!s.stat) s.stat = { mini: je(0), gesammelt: je(0), ereignis: je(0) };
  if (!Array.isArray(s.gezogen)) s.gezogen = [];
}
function geben(s, j, d) {
  if (d > 0) { s.muenzen[j] += d; s.stat.gesammelt[j] += d; return d; }
  const weg = Math.min(s.muenzen[j], -d);
  s.muenzen[j] -= weg;
  return -weg;
}
function rangfolge(s) { return s.pos.map((_, j) => j).sort((a, b) => s.sterne[b] - s.sterne[a] || s.muenzen[b] - s.muenzen[a]); }
const sternPreis = (s, i) => (s.rabatt[i] || s.schluss === "rabatt" ? 5 : STERNPREIS);
function effekt(s, art, j, wert = 0) { s.effekt = { nr: ((s.effekt && s.effekt.nr) || 0) + 1, art, j, wert }; }
// Felder bis zum Stern (Breitensuche ueber die Wege)
function sternAbstand(s, von) {
  const weit = new Map([[von, 0]]), q = [von];
  while (q.length) { const x = q.shift(); if (x === s.stern) return weit.get(x); NEXT[x].forEach((y) => { if (!weit.has(y)) { weit.set(y, weit.get(x) + 1); q.push(y); } }); }
  return 99;
}

// ---------------------------------------------------------------- Zug
function wuerfeln(s, i, namen, raum) {
  const zahl = s.wuerfelArt === "dreifach" ? 3 : s.wuerfelArt === "doppel" ? 2 : 1;
  const seiten = s.wuerfelArt === "mini" ? 3 : 6;
  s.wuerfe = Array.from({ length: zahl }, () => 1 + zufall(seiten));
  s.wurf = s.wuerfe.reduce((a, b) => a + b, 0);
  s.rest = s.wurf; s.wahl = null; s.sternVorbei = false;
  s.spur = { j: i, nr: ++s.spurNr, felder: [s.pos[i]] };
  s.meldung = `${namen[i]} würfelt ${zahl > 1 ? `${s.wuerfe.join(" + ")} = ` : "eine "}${s.wurf}.`;
  s.wuerfelArt = null;
  if (laufen(s, i)) nachLauf(s, i, namen, raum);
}
// Schritt fuer Schritt; an einer Abzweigung anhalten (Phase "weg") -> false
function laufen(s, i) {
  while (s.rest > 0) {
    const nx = NEXT[s.pos[i]];
    if (nx.length > 1 && s.wahl === null) { s.phase = "weg"; return false; }
    const ziel = s.wahl !== null ? s.wahl : nx[0];
    s.wahl = null;
    s.pos[i] = ziel; s.rest--;
    if (s.spur) s.spur.felder.push(ziel);
    if (ziel === s.stern) s.sternVorbei = true;
  }
  return true;
}
function nachLauf(s, i, namen, raum) {
  const preis = sternPreis(s, i);
  if (s.sternVorbei && s.muenzen[i] >= preis) { s.phase = "stern"; s.meldung += " Am Stern vorbei – kaufen?"; return; }
  if (s.sternVorbei) s.meldung += ` Am Stern vorbei, aber zu wenig Münzen (${preis} nötig).`;
  feldWirkung(s, i, muster(s)[s.pos[i]], namen, raum);
}

function wareEinsetzen(s, i, id, namen) {
  const k = s.waren[i].indexOf(id);
  if (k < 0 || s.wareBenutzt || id === "schild") return;
  s.waren[i].splice(k, 1);
  s.wareBenutzt = true;
  const w = ware(id);
  if (id === "doppel" || id === "dreifach" || id === "mini") { s.wuerfelArt = id; s.meldung = `${namen[i]} nimmt den ${w.emo} ${w.name}.`; }
  else if (id === "tausch" || id === "dieb") { s.zielWare = id; s.phase = "ziel"; s.meldung = `${namen[i]} holt ${w.emo} ${w.name} heraus …`; }
  else if (id === "falle") { s.fallen[s.pos[i]] = i; s.meldung = `🪤 ${namen[i]} stellt eine Falle auf.`; effekt(s, "falle", i); }
  else if (id === "rohr") {
    const vor = PREV[s.stern][0];
    s.pos[i] = vor; s.spur = { j: i, nr: ++s.spurNr, felder: [vor], sprung: true };
    s.meldung = `🌟 ${namen[i]} rauscht durchs Sternenrohr direkt vor den Stern!`; effekt(s, "rohr", i);
  }
}
function zielWirkung(s, i, j, namen) {
  const id = s.zielWare; s.zielWare = null; s.phase = "wuerfeln";
  if (schildFaengt(s, j)) { s.meldung = `🛡️ ${namen[j]} hält den Schild hoch – nichts passiert.`; return; }
  if (id === "tausch") { [s.pos[i], s.pos[j]] = [s.pos[j], s.pos[i]]; s.spur = { j: i, nr: ++s.spurNr, felder: [s.pos[i]], sprung: true }; s.meldung = `🔄 ${namen[i]} und ${namen[j]} tauschen die Plätze!`; effekt(s, "tausch", i); }
  else if (id === "dieb") { const d = -geben(s, j, -5); geben(s, i, d); s.meldung = `🧲 ${namen[i]} zieht ${d} Münzen von ${namen[j]} ab!`; effekt(s, "muenzen", i, d); }
}
function schildFaengt(s, j) {
  const k = s.waren[j].indexOf("schild");
  if (k < 0) return false;
  s.waren[j].splice(k, 1);
  return true;
}

function feldWirkung(s, i, feld, namen, raum) {
  const pre = s.meldung + " ";
  let falle = "";
  const f = s.fallen[s.pos[i]];
  if (f !== undefined && f !== i && f < s.pos.length) {
    delete s.fallen[s.pos[i]];
    if (schildFaengt(s, i)) falle = `🪤 Falle von ${namen[f]} – aber der Schild hält! `;
    else { const d = -geben(s, i, -5); geben(s, f, d); falle = `🪤 In die Falle von ${namen[f]} getappt: ${d} Münzen an ${namen[f]}! `; effekt(s, "muenzen", i, -d); }
  }
  const mal = s.schluss === "doppelt" ? 2 : 1;
  if (feld === "m") { geben(s, i, 3 * mal); s.meldung = pre + falle + `+${3 * mal} Münzen.`; s.phase = "weiter"; effekt(s, "muenzen", i, 3 * mal); }
  else if (feld === "v") { geben(s, i, -3 * mal); s.meldung = pre + falle + `−${3 * mal} Münzen.`; s.phase = "weiter"; effekt(s, "muenzen", i, -3 * mal); }
  else if (feld === "t") { s.meldung = pre + falle + `🍺 Trinkfeld: ${namen[i]} trinkt ${schlucke(1 + zufall(3))}.`; s.phase = "weiter"; }
  // Aufgabenfeld (ohne Trinken): kleine Aufgabe; wer nicht will, gibt Muenzen ab
  else if (feld === "a") { s.meldung = pre + falle + `🎯 Aufgabenfeld: ${namen[i]} – ${ziehe(T.AUFGABEN)}`; s.phase = "aufgabe"; }
  else if (feld === "e") { s.stat.ereignis[i]++; s.meldung = pre + falle + "❓ " + ereignis(s, i, namen, raum); s.phase = "weiter"; effekt(s, "ereignis", i); }
  else if (feld === "d") { s.meldung = pre + falle + "⚔️ Duellfeld!"; s.phase = "duell"; }
  else if (feld === "l") { s.meldung = pre + falle + "🛒 Laden!"; s.phase = "laden"; }
  else { s.meldung = pre + falle; s.phase = "weiter"; }
}

// ---------------------------------------------------------------- Ereignisfeld
function ereignis(s, i, namen, raum) {
  let pool = BE.ziehbar(raum && raum.brettWeg, s.ohne);
  const t = testVorgabe();
  if (t && Array.isArray(t.ereignisse)) pool = pool.filter((x) => t.ereignisse.includes(x.id));
  if (!pool.length) { geben(s, i, 2); return "Ruhiges Feld: +2 Münzen."; }
  let frei = pool.filter((x) => !s.gezogen.includes(x.id));
  if (!frei.length) { s.gezogen = []; frei = pool; }
  const ev = frei[zufall(frei.length)];
  s.gezogen.push(ev.id);
  if (ev.boese && schildFaengt(s, i)) return `${ev.text} 🛡️ Der Schild fängt es ab!`;
  let extra;
  try { extra = ev.f(s, i, helfer(s, namen)); } catch (e) { console.error(e); }
  return extra ? `${ev.text} ${extra}` : ev.text;
}
function helfer(s, namen) {
  const n = s.pos.length, alle = [...Array(n).keys()];
  const rang = () => rangfolge(s);
  const schritt = (j, k, rueck) => { for (let x = 0; x < k; x++) s.pos[j] = rueck ? PREV[s.pos[j]][0] : NEXT[s.pos[j]][0]; };
  return {
    n, nm: namen, rnd: (k) => zufall(k),
    muenzen: (j, d) => geben(s, j, d),
    sterne: (j, d) => { s.sterne[j] = Math.max(0, s.sterne[j] + d); if (d > 0) effekt(s, "stern", j); },
    vor: (j, k) => schritt(j, k, false), zurueck: (j, k) => schritt(j, k, true),
    tausch: (j, k) => { [s.pos[j], s.pos[k]] = [s.pos[k], s.pos[j]]; },
    gib: (j, id) => { if (s.waren[j].length < BEUTEL) s.waren[j].push(id); },
    zufallWare: () => LADEN[zufall(LADEN.length)], wareName: (id) => `${ware(id).emo} ${ware(id).name}`,
    stern: () => { s.stern = neuerStern(s); s.sternSeit = s.runde; },
    sternVor: (k) => { for (let x = 0; x < k; x++) s.stern = NEXT[s.stern][0]; },
    zuStern: (j) => { s.pos[j] = PREV[s.stern][0]; },
    irgendwo: (j) => { s.pos[j] = zufall(FELDER); },
    nachStart: (j) => { s.pos[j] = 0; },
    extraWurf: () => { s.extra = true; },
    erster: () => rang()[0], letzter: () => rang()[n - 1],
    vorMir: (i) => { const r = rang(), p = r.indexOf(i); return p > 0 ? r[p - 1] : -1; },
    hinterMir: (i) => { const r = rang(), p = r.indexOf(i); return p < n - 1 ? r[p + 1] : -1; },
    hinterAllen: (i) => { const r = rang(); return r.slice(r.indexOf(i) + 1); },
    reichster: (aus) => { const k = alle.filter((j) => j !== aus).sort((a, b) => s.muenzen[b] - s.muenzen[a]); return k.length && (aus < 0 || s.muenzen[k[0]] > 0) ? k[0] : -1; },
    aermster: (i) => { const k = alle.filter((j) => j !== i && s.muenzen[j] < s.muenzen[i]).sort((a, b) => s.muenzen[a] - s.muenzen[b]); return k.length ? k[0] : -1; },
    anderer: (i) => { const k = alle.filter((j) => j !== i); return k.length ? k[zufall(k.length)] : -1; },
    geschuetzt: (j) => schildFaengt(s, j),
  };
}

// ---------------------------------------------------------------- Rundenende, Schlussrunden, Bonussterne
const SCHLUSS = {
  doppelt: { text: "Münzfelder zählen doppelt!" },
  rabatt: { text: "Sterne kosten nur 5 Münzen!" },
  minis: { text: "Minispiele bringen doppelte Münzen!" },
};
function zugEnde(s, namen, raum) {
  const n = s.pos.length;
  s.wurf = null; s.wuerfe = null; s.wareBenutzt = false; s.wuerfelArt = null;
  if (s.extra) { s.extra = false; s.phase = "wuerfeln"; s.meldung = `🎲 ${namen[s.dran]} darf noch einmal würfeln!`; return; }
  s.dran = (s.dran + 1) % n;
  if (s.dran === 0) miniStart(s, raum);
  else s.phase = "wuerfeln";
}
function rundeBeginnt(s, namen) {
  const teile = [`Runde ${s.runde}`];
  const n = s.pos.length;
  // Aufholhilfe: wer hinten liegt, bekommt jede Runde etwas Rueckenwind
  if (n > 1) { const l = rangfolge(s)[n - 1]; geben(s, l, 3); teile.push(`🤝 Aufholhilfe: ${namen[l]} bekommt 3 Münzen`); }
  // wandernder Stern: drei Runden nicht gekauft -> er sucht sich einen neuen Platz
  if (s.runde - s.sternSeit >= 3) { s.stern = neuerStern(s); s.sternSeit = s.runde; teile.push("⭐ Der Stern ist weitergewandert"); }
  // Schlussrunden: die letzten drei Runden mit einer Besonderheit und einem Schub fuer den Letzten
  if (s.runde === RUNDEN - 2 && !s.schluss) {
    s.schluss = Object.keys(SCHLUSS)[zufall(3)];
    const l = rangfolge(s)[n - 1];
    if (n > 1) geben(s, l, 10);
    teile.push(`🔥 Die letzten 3 Runden! ${SCHLUSS[s.schluss].text}${n > 1 ? ` ${namen[l]} bekommt 10 Münzen Schub` : ""}`);
  }
  s.meldung = `${teile.join(" · ")} – ${namen[0]} würfelt.`;
}
function bonusVergeben(s) {
  const kat = [["mini", "🎮", "Minispiel-Ass", "Minispiel-Siege"], ["gesammelt", "🪙", "Münzsammler", "Münzen eingesammelt"], ["ereignis", "❓", "Ereignis-Jäger", "Ereignisfelder"]];
  s.bonus = kat.map(([k, emo, titel, was]) => {
    const w = s.stat[k], max = Math.max(...w);
    const wer = max > 0 ? w.map((x, j) => (x === max ? j : -1)).filter((j) => j >= 0) : [];
    wer.forEach((j) => { s.sterne[j]++; });
    return { emo, titel, was, wert: max, wer };
  });
}
function bonusListe(s, namen) {
  if (!s.bonus) return "";
  return `<div class="bonusliste">${s.bonus.map((b) => `<div class="bonus"><span class="emo">${b.emo}</span><span><b>${esc(b.titel)}</b><small>${b.wer.length ? `${b.wer.map((j) => esc(namen[j])).join(" & ")} · ${b.wert} ${esc(b.was)} · +1 ⭐` : "keiner"}</small></span></div>`).join("")}</div>`;
}

// ---------------------------------------------------------------- Minispiel nach jeder Runde
function naechstesMini(s, raum) {
  const t = testVorgabe();
  if (t && Array.isArray(t.minis) && t.minis.length) return t.minis[s.miniNr % t.minis.length];
  if (raum) return MINI_IDS[STAPEL.eins(raum, "brettminis", MINI_IDS.length)];
  return MINI_IDS[zufall(MINI_IDS.length)];
}
function modusWahl(n, s) {
  const t = testVorgabe();
  if (t && Array.isArray(t.modi) && t.modi.length) { const m = t.modi[s.miniNr % t.modi.length]; if (m === "alle" || n >= (m === "team" ? 4 : m === "eins" ? 3 : 2)) return m; return "alle"; }
  const x = Math.random();
  if (n <= 2) return "alle";
  if (n === 3) return x < 0.6 ? "alle" : x < 0.85 ? "eins" : "duell";
  return x < 0.4 ? "alle" : x < 0.65 ? "team" : x < 0.85 ? "eins" : "duell";
}
function miniStart(s, raum) {
  const n = s.pos.length;
  const art = naechstesMini(s, raum);
  const modus = modusWahl(n, s);
  s.miniNr++;
  const reihe = mischen([...Array(n).keys()]);
  let teams = null, teil = [...Array(n).keys()];
  if (modus === "team") { const h = Math.ceil(n / 2); teams = [reihe.slice(0, h).sort(), reihe.slice(h).sort()]; }
  else if (modus === "eins") teams = [[reihe[0]], reihe.slice(1).sort()];
  else if (modus === "duell") teil = reihe.slice(0, 2).sort();
  s.mini = { art, runde: s.runde, werte: {}, warte: 1500 + zufall(3500), frage: zufall(T.SCHAETZ.length), zahl: String(10000000 + zufall(89999999)),
    d: R.daten(art), modus, teams, teil, t0: Date.now() };
  s.phase = "mini";
  s.meldung = "";
}
const teilVon = (s, m) => (Array.isArray(m.teil) ? m.teil : s.pos.map((_, j) => j));
const ABBRUCH_AB = 25000;   // ab dann darf jeder "Nicht mehr warten" druecken (Handy gesperrt, Spieler weg)

function miniAktion(s, i, a, namen, raum) {
  const m = s.mini;
  const teil = teilVon(s, m);
  if (a.typ === "mini" && teil.includes(i) && m.werte[i] === undefined && !m.fertig && (!a.mk || a.mk === `${m.runde}-${m.art}`)) {
    m.werte[i] = a.wert === null || a.wert === undefined || isNaN(Number(a.wert)) ? null : Number(a.wert);
    if (teil.every((j) => m.werte[j] !== undefined)) auswerten(s, m, namen);
  } else if (a.typ === "miniabbruch" && !m.fertig && Date.now() - (m.t0 || 0) >= ABBRUCH_AB) {
    teil.forEach((j) => { if (m.werte[j] === undefined) m.werte[j] = null; });
    auswerten(s, m, namen);
  } else if (a.typ === "miniweiter" && m.fertig) {
    s.mini = null;
    s.runde++;
    if (s.runde > RUNDEN) { bonusVergeben(s); s.phase = "bonus"; s.meldung = ""; return; }
    s.phase = "wuerfeln";
    rundeBeginnt(s, namen);
  }
}
// Vergleichswert je Spieler: hoeher = besser
function wertVon(s, m, j, teil) {
  if (R.istNeu(m.art)) return R.punkte(m.art, m.werte, j, teil);
  const w = m.werte[j];
  if (w === null || w === undefined) return -1e9;
  if (m.art === "reaktion") return w < 0 ? -1e8 : -w;
  if (m.art === "schaetzen") return -Math.abs(w - T.SCHAETZ[m.frage][1]);
  return w;
}
function auswerten(s, m, namen) {
  const teil = teilVon(s, m);
  const w = Object.fromEntries(teil.map((j) => [j, wertVon(s, m, j, teil)]));
  const rang = [...teil].sort((x, y) => w[y] - w[x]);
  // Platz mit Gleichstand: gleiche Werte teilen sich den besten Platz; mittlerer Platz fuer die Teams
  const platz = {}, mittel = {};
  rang.forEach((j, p) => {
    const gleich = rang.filter((k) => w[k] === w[j]);
    platz[j] = rang.indexOf(gleich[0]);
    mittel[j] = gleich.reduce((a, k) => a + rang.indexOf(k), 0) / gleich.length;
  });
  const mal = s.schluss === "minis" ? 2 : 1;
  const preise = {};
  let sieger = [], verlierer = [], kopf = "";
  if (m.modus === "team" || m.modus === "eins") {
    const [ta, tb] = m.teams;
    const schnitt = (t) => t.reduce((a, j) => a + mittel[j], 0) / t.length;
    // Einer gegen alle: der Einzelne gewinnt, wenn er besser als die Haelfte der anderen ist
    let gewinner;
    if (m.modus === "eins") gewinner = mittel[ta[0]] <= Math.floor((teil.length - 1) / 2) ? 0 : 1;
    else gewinner = schnitt(ta) < schnitt(tb) ? 0 : schnitt(tb) < schnitt(ta) ? 1 : -1;
    if (gewinner < 0) { teil.forEach((j) => { preise[j] = 2 * mal; }); kopf = "Unentschieden – alle bekommen 2 Münzen"; }
    else {
      const gw = m.teams[gewinner], vl = m.teams[1 - gewinner];
      const je = m.modus === "eins" ? (gewinner === 0 ? 10 : 4) : 6;
      gw.forEach((j) => { preise[j] = je * mal; });
      sieger = gw; verlierer = vl;
      kopf = `${m.modus === "eins" && gewinner === 0 ? "Der Einzelkämpfer" : "Team"} ${gw.map((j) => namen[j]).join(" & ")} gewinnt`;
    }
  } else if (m.modus === "duell") {
    const [x, y] = rang;
    if (w[x] === w[y]) { preise[x] = preise[y] = 3 * mal; kopf = "Unentschieden – beide bekommen 3 Münzen"; }
    else { preise[x] = 8 * mal; sieger = [x]; verlierer = [y]; kopf = `${namen[x]} gewinnt das Duell`; }
  } else {
    const tabelle = [8, 4, 2, 0];
    rang.forEach((j) => { preise[j] = (tabelle[platz[j]] || 0) * mal; });
    sieger = rang.filter((j) => platz[j] === 0);
    const letzt = platz[rang[rang.length - 1]];
    verlierer = rang.length > 1 && letzt > 0 ? rang.filter((j) => platz[j] === letzt) : [];
  }
  Object.entries(preise).forEach(([j, d]) => { if (d) geben(s, Number(j), d); });
  sieger.forEach((j) => { s.stat.mini[j]++; });
  Object.assign(m, { fertig: true, rang, preise, sieger, verlierer, kopf });
}

function modusZeile(m, namen) {
  const nm = (l) => l.map((j) => esc(namen[j])).join(" & ");
  if (m.modus === "team") return `🤝 ${m.teams[0].length} gegen ${m.teams[1].length}: <b>${nm(m.teams[0])}</b> gegen <b>${nm(m.teams[1])}</b>`;
  if (m.modus === "eins") return `🦸 1 gegen ${m.teams[1].length}: <b>${nm(m.teams[0])}</b> gegen alle anderen`;
  if (m.modus === "duell") return `⚔️ Duell: <b>${nm(m.teil)}</b> – die anderen schauen zu`;
  return "👥 Alle gegen alle";
}
function miniRender(s, ich, namen) {
  const m = s.mini;
  const info = miniInfo(m.art);
  const teil = teilVon(s, m);
  const modus = `<div class="mini-modus">${modusZeile(m, namen)}</div>`;
  if (m.fertig) {
    const fmt = (j) => (m.werte[j] === null || m.werte[j] === undefined ? "nicht mitgemacht" : R.istNeu(m.art) ? esc(R.einheit(m.art, m.werte[j]))
      : m.art === "farbwort" ? `${m.werte[j]} richtig` : m.art === "gedaechtnis" ? `${m.werte[j]} Ziffern` : m.art === "tappen" ? `${m.werte[j]} Taps`
      : m.art === "reaktion" ? (m.werte[j] < 0 ? "zu früh" : `${m.werte[j]} ms`) : m.werte[j]);
    const verl = m.verlierer || [];
    return `<div class="frage">${info.emo} ${esc(info.titel)} – Ergebnis${m.art === "schaetzen" ? `<br><small>${esc(T.SCHAETZ[m.frage][0])} → <b>${T.SCHAETZ[m.frage][1]}</b></small>` : ""}</div>${modus}
      ${m.kopf ? `<div class="mini-kopf">🏅 ${esc(m.kopf)}</div>` : ""}
      <ol class="rangliste">${m.rang.map((j) => `<li>${name(namen, j)}: ${fmt(j)} → +${(m.preise || {})[j] || 0} 🪙</li>`).join("")}</ol>
      ${verl.length ? `<div class="urteil">${verl.map((j) => name(namen, j)).join(" & ")} ${verl.length > 1 ? "trinken" : "trinkt"} ${schlucke(m.modus === "alle" || m.modus === "duell" ? 2 : 1)}</div>` : ""}
      ${knopf("Weiter zur nächsten Runde", { typ: "miniweiter" }, "gross")}`;
  }
  const zaehler = `${teil.filter((j) => m.werte[j] !== undefined).length}/${teil.length} fertig`;
  const abbruch = `<div class="mini-abbruch" hidden data-mini-abbruch="${m.runde}-${m.art}"><p class="leise klein mitte">Jemand hängt fest? Nach einer Weile geht es auch ohne ihn weiter.</p>${knopf("⏭️ Nicht mehr warten", { typ: "miniabbruch" }, "zweit")}</div>`;
  const kopf = `<div class="frage">Minispiel: ${info.emo} ${esc(info.titel)}<small class="mini-typ">${esc(info.typ)}</small></div>${modus}`;
  let inhalt = "";
  // ich < 0: dieses Geraet spielt nur mit Controllern mit (app.js zeigt deren Felder darunter, controller.js)
  if (ich < 0) inhalt = `<p class="mitte leise">${esc(info.regel)}</p>${m.art === "schaetzen" ? `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div>` : ""}<p class="mitte">${zaehler}</p>`;
  else if (!teil.includes(ich)) inhalt = `<p class="mitte leise">${esc(info.regel)}</p><div class="hinweisbox warten">👀 Du schaust diesmal zu – ${zaehler}</div>`;
  else if (m.werte[ich] !== undefined) inhalt = `<p class="mitte">Erledigt – warte auf die anderen (${zaehler})</p>`;
  else if (R.istNeu(m.art)) inhalt = R.html(m, `h${ich}`);
  else inhalt = `<p class="mitte leise">${esc(info.regel)}</p>${altInhalt(s, m, ich)}`;
  return `${kopf}${inhalt}${abbruch}`;
}
function altInhalt(s, m, ich) {
  if (m.art === "schaetzen") return `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div><input id="minitipp" data-rk="${m.runde}" type="number" inputmode="decimal" placeholder="Schätzung">${knopf("Abgeben", { typ: "mini" }, "gross", `data-feld="minitipp"`)}`;
  if (m.art === "farbwort") return `<div id="farbwort" class="farbwort">Tippe zum Starten</div><div class="raster farbknoepfe">${FW.map(([n, c]) => `<button class="gross" style="background:${c};box-shadow:0 5px 0 #0008" data-fw="${n}">${n}</button>`).join("")}</div>`;
  if (m.art === "gedaechtnis") {
    // ist die Zahl schon verdeckt, gleich mit Feld zeichnen - sonst verschwindet das Feld beim Neuzeichnen kurz (Fokus weg)
    const zu = gedLokal.schluessel === `ged-${m.runde}` && gedLokal.versteckt;
    return `<div id="gedzahl" class="reaktion fertig" style="font-size:44px;letter-spacing:6px">${zu ? "? ? ? ?" : m.zahl}</div><input id="gedtipp" data-rk="${m.runde}" inputmode="numeric" placeholder="Zahl eintippen" style="display:${zu ? "block" : "none"}"><button id="gedknopf" class="gross" style="display:${zu ? "block" : "none"}">Abgeben</button>`;
  }
  return `<div id="minifeld" class="reaktion rot">${m.art === "tappen" ? "Tippen zum Starten!" : "Warte …"}</div>`;
}

// "Nicht mehr warten" erst nach einer Weile zeigen (eigene Uhr ab dem ersten Anblick des Minispiels)
const abbruchSeit = {};
function abbruchZeigen(m) {
  const k = `${m.runde}-${m.art}`;
  if (!abbruchSeit[k]) abbruchSeit[k] = performance.now();
  const zeig = () => { const el = document.querySelector(`[data-mini-abbruch="${k}"]`); if (el) el.hidden = false; };
  const rest = abbruchSeit[k] + ABBRUCH_AB + 3000 - performance.now();
  if (rest <= 0) zeig(); else setTimeout(zeig, rest);
}

let miniLokal = { schluessel: null };
const FW = [["Rot", "#e11d48"], ["Blau", "#2563eb"], ["Grün", "#16a34a"], ["Gelb", "#ca8a04"]];
function miniNach(s, ich, senden) {
  const m = s.mini;
  if (!m || m.fertig) return;
  abbruchZeigen(m);
  if (ich < 0 || m.werte[ich] !== undefined || !teilVon(s, m).includes(ich)) return;
  if (R.istNeu(m.art)) return R.anmelden(m, `h${ich}`, (wert, mk) => senden({ typ: "mini", wert, mk }));
  if (m.art === "schaetzen") return;
  if (m.art === "farbwort") return farbwortNach(m, senden);
  if (m.art === "gedaechtnis") return gedaechtnisNach(m, senden);
  const fl = document.getElementById("minifeld");
  if (!fl) return;
  const schluessel = `${m.runde}-${m.art}`;
  if (miniLokal.schluessel !== schluessel) {
    clearTimeout(miniLokal.timer);
    miniLokal = { schluessel, zaehl: 0, start: 0, gruen: 0, gesendet: false };
    if (m.art === "reaktion") miniLokal.timer = setTimeout(() => {
      miniLokal.gruen = performance.now();
      const f = document.getElementById("minifeld"); if (f) { f.className = "reaktion gruen"; f.textContent = "JETZT!"; }
    }, m.warte);
  }
  if (m.art === "reaktion") {
    if (miniLokal.gruen) { fl.className = "reaktion gruen"; fl.textContent = "JETZT!"; }
    fl.onpointerdown = () => {
      if (miniLokal.gesendet) return; miniLokal.gesendet = true; clearTimeout(miniLokal.timer);
      senden({ typ: "mini", wert: miniLokal.gruen ? Math.round(performance.now() - miniLokal.gruen) : -1 });
    };
  } else {
    if (miniLokal.start) { fl.className = "reaktion gruen"; fl.textContent = `${miniLokal.zaehl} Taps`; }
    fl.onpointerdown = () => {
      if (miniLokal.gesendet) return;
      if (!miniLokal.start) {
        miniLokal.start = performance.now();
        miniLokal.timer = setTimeout(() => { miniLokal.gesendet = true; senden({ typ: "mini", wert: miniLokal.zaehl }); }, 5000);
        fl.className = "reaktion gruen";
      }
      miniLokal.zaehl++;
      fl.textContent = `${miniLokal.zaehl} Taps`;
    };
  }
}

// flache Ersatzansicht, falls 3D am Geraet nicht geht (wird sonst sofort durch die 3D-Ansicht ersetzt)
function brett2d(s, namen) {
  const xs = LAGE.map((p) => p.x), zs = LAGE.map((p) => p.z);
  const x0 = Math.min(...xs) - 1.4, z0 = Math.min(...zs) - 1.4, w = Math.max(...xs) + 1.4 - x0, h = Math.max(...zs) + 1.4 - z0;
  const mu = muster(s);
  const linien = NEXT.flatMap((nx, i) => nx.map((j) => `<line x1="${LAGE[i].x}" y1="${LAGE[i].z}" x2="${LAGE[j].x}" y2="${LAGE[j].z}"/>`)).join("");
  const felder = LAGE.map((p, i) => `<g class="f2 art-${mu[i] === "a" ? "t" : mu[i]}${i === s.stern ? " sternfeld" : ""}"><circle cx="${p.x}" cy="${p.z}" r="0.72"/><text x="${p.x}" y="${p.z + 0.3}">${i === s.stern ? "⭐" : ART[mu[i]][0]}</text></g>`).join("");
  const figuren = s.pos.map((f, j) => `<circle class="fig2 f${j}" cx="${LAGE[f].x + Math.cos(j * 1.57) * 0.45}" cy="${LAGE[f].z + Math.sin(j * 1.57) * 0.45}" r="0.36"/>`).join("");
  return `<svg class="brett2d" viewBox="${x0.toFixed(1)} ${z0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Spielbrett"><g class="wege">${linien}</g>${felder}${figuren}</svg>`;
}

let fwLokal = { schluessel: null };
function farbwortNach(m, senden) {
  const schluessel = `fw-${m.runde}`;
  const anzeige = document.getElementById("farbwort");
  if (!anzeige) return;
  const neu = () => { const w = FW[Math.floor(Math.random() * 4)], f = FW[Math.floor(Math.random() * 4)]; fwLokal.richtig = f[0]; return [w[0], f[1]]; };
  const zeige = () => { const a = document.getElementById("farbwort"); if (a && fwLokal.wort) { a.textContent = fwLokal.wort[0]; a.style.color = fwLokal.wort[1]; } };
  if (fwLokal.schluessel !== schluessel) fwLokal = { schluessel, start: 0, punkte: 0, gesendet: false };
  if (fwLokal.start) zeige();
  anzeige.onclick = () => { if (fwLokal.start) return; fwLokal.start = performance.now(); fwLokal.wort = neu(); zeige();
    setTimeout(() => { fwLokal.gesendet = true; senden({ typ: "mini", wert: fwLokal.punkte }); }, 12000); };
  document.querySelectorAll("[data-fw]").forEach((b) => (b.onclick = () => {
    if (!fwLokal.start || fwLokal.gesendet) return;
    if (b.dataset.fw === fwLokal.richtig) fwLokal.punkte++; else fwLokal.punkte = Math.max(0, fwLokal.punkte - 1);
    fwLokal.wort = neu(); zeige();
    const a = document.getElementById("farbwort"); if (a) a.dataset.punkte = fwLokal.punkte;
  }));
}
let gedLokal = { schluessel: null };
function gedaechtnisNach(m, senden) {
  const schluessel = `ged-${m.runde}`;
  if (gedLokal.schluessel !== schluessel) { gedLokal = { schluessel, versteckt: false }; setTimeout(() => { gedLokal.versteckt = true; gedaechtnisNach(m, senden); }, 3000); }
  if (!gedLokal.versteckt) return;
  const z = document.getElementById("gedzahl"), i = document.getElementById("gedtipp"), k = document.getElementById("gedknopf");
  if (!z) return;
  z.textContent = "? ? ? ?"; i.style.display = "block"; k.style.display = "block";
  k.onclick = () => { const e = i.value.replace(/\D/g, ""); let r = 0; for (let x = 0; x < m.zahl.length; x++) if (e[x] === m.zahl[x]) r++; senden({ typ: "mini", wert: r }); };
}
