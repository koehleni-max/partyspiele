// Partybrett - eigenes Brettspiel mit Wuerfeln, Feldern, Sternen und Minispielen nach jeder Runde
// (in der Art bekannter Party-Brettspiele, eigene Umsetzung).
import { esc, knopf, zufall, ziehe, mischen, name, schlucke } from "./hilfe.js";
import * as T from "./texte.js";
import { brett3dZeigen } from "./brett3d.js";

const RUNDEN = 8;
const FELDER = 28;
const STERNPREIS = 10;
// Feldarten: m = +3 Muenzen, v = -3 Muenzen, t = Trinkfeld, e = Ereignis, d = Duell
const MUSTER = "mmtmevmdmtmemvmtmmdemtmvmemt";
// ohne Trinken (s.ohne, Nico 31.10.2026): aus dem Trinkfeld wird ein Aufgabenfeld (a) - kleine Aufgabe, sonst -2 Muenzen
const MUSTER_OHNE = MUSTER.replace(/t/g, "a");
const muster = (s) => (s && s.ohne ? MUSTER_OHNE : MUSTER);
const AUFGABE_STRAFE = 2;
const ART = { m: ["🪙", "+3 Münzen"], v: ["💸", "−3 Münzen"], t: ["🍺", "Trinkfeld"], a: ["🎯", "Aufgabenfeld"], e: ["❓", "Ereignis"], d: ["⚔️", "Duell"] };
const EREIGNISSE = [
  ["Glückspilz! +6 Münzen", (s, i) => (s.muenzen[i] += 6)],
  ["Taschendieb! Du verlierst 5 Münzen", (s, i) => (s.muenzen[i] = Math.max(0, s.muenzen[i] - 5))],
  ["Robin Hood: der Reichste gibt dir 4 Münzen", (s, i) => { const r = s.muenzen.indexOf(Math.max(...s.muenzen)); const n = Math.min(4, s.muenzen[r]); s.muenzen[r] -= n; s.muenzen[i] += n; }],
  ["Alle anderen trinken einen Schluck auf dich", () => {}, "Alle anderen applaudieren dir 5 Sekunden lang"],
  ["Teleport! Du landest 4 Felder weiter", (s, i) => { s.pos[i] = (s.pos[i] + 4) % FELDER; }],
  ["Stern-Umzug: der Stern wandert woanders hin", (s) => { s.stern = neuerStern(s); }],
  ["Du trinkst 2 Schlucke – dafür +4 Münzen", (s, i) => (s.muenzen[i] += 4), "Mach 10 Kniebeugen – dafür +4 Münzen"],
  ["Schenk jemandem 3 Münzen – oder trink 3 Schlucke", () => {}, "Schenk jemandem 3 Münzen – oder die Runde denkt sich eine kleine Aufgabe für dich aus"],
];
const MINI = ["tappen", "farbwort", "reaktion", "gedaechtnis", "schaetzen"];

function neuerStern(s) {
  let f; do { f = zufall(FELDER); } while (s.pos && s.pos.includes(f));
  return f;
}

export const brett = {
  id: "brett", name: "Partybrett", emoji: "🎲", farben: ["#ff9600","#b4231f"], kurz: "Würfeln, Münzen sammeln, Sterne kaufen, Minispiele – 8 Runden",
  start(namen) {
    const s = { runde: 1, dran: 0, pos: namen.map(() => 0), muenzen: namen.map(() => 5), sterne: namen.map(() => 0),
      phase: "wuerfeln", wurf: null, meldung: "Wer zuerst würfelt, fängt an!", stern: 0, mini: null, ende: false };
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
  aktion(s, i, a, namen) {
    const n = s.pos.length;
    if (a.typ === "neustart") return Object.assign(s, brett.start(namen));
    if (s.ende) return;
    if (s.phase === "wuerfeln" && a.typ === "wuerfeln" && i === s.dran) {
      s.wurf = 1 + zufall(6);
      let passiert = false;
      for (let k = 0; k < s.wurf; k++) {
        s.pos[i] = (s.pos[i] + 1) % FELDER;
        if (s.pos[i] === s.stern) passiert = true;
      }
      const feld = muster(s)[s.pos[i]];
      s.meldung = `${namen[i]} würfelt eine ${s.wurf}.`;
      if (passiert && s.muenzen[i] >= STERNPREIS) { s.phase = "stern"; s.meldung += " Am Stern vorbei – kaufen?"; return; }
      if (passiert) s.meldung += ` Am Stern vorbei, aber zu wenig Münzen (${STERNPREIS} nötig).`;
      feldWirkung(s, i, feld, namen);
    } else if (s.phase === "stern" && i === s.dran && (a.typ === "kaufen" || a.typ === "nein")) {
      if (a.typ === "kaufen") { s.muenzen[i] -= STERNPREIS; s.sterne[i]++; s.meldung = `⭐ ${namen[i]} kauft einen Stern! Alle anderen trinken 1 Schluck.`; s.stern = neuerStern(s); }
      feldWirkung(s, i, muster(s)[s.pos[i]], namen, true);
    } else if (s.phase === "duell" && i === s.dran && a.typ === "duell" && a.ziel !== i) {
      const ich = 1 + zufall(6), du = 1 + zufall(6);
      const sieger = ich >= du ? i : a.ziel, verl = sieger === i ? a.ziel : i;
      const beute = Math.min(4, s.muenzen[verl]);
      s.muenzen[verl] -= beute; s.muenzen[sieger] += beute;
      s.meldung = `⚔️ Duell: ${namen[i]} ${ich} gegen ${namen[a.ziel]} ${du} – ${namen[sieger]} gewinnt ${beute} Münzen, ${namen[verl]} trinkt 2 Schlucke!`;
      zugEnde(s);
    } else if (s.phase === "weiter" && a.typ === "weiter") {
      zugEnde(s);
    } else if (s.phase === "aufgabe" && a.typ === "aufgabe" && i === s.dran) {
      if (!a.ok) { s.muenzen[i] = Math.max(0, s.muenzen[i] - AUFGABE_STRAFE); s.meldung = `🙅 ${namen[i]} kneift – −${AUFGABE_STRAFE} Münzen.`; }
      else s.meldung = `✅ ${namen[i]} hat die Aufgabe erledigt.`;
      zugEnde(s);
    } else if (s.phase === "mini") {
      miniAktion(s, i, a, namen);
    }
  },
  render(s, ich, namen) {
    const n = s.pos.length;
    const tafel = `<div class="tafel">${namen.map((nm, j) => `<div class="${j === s.dran && s.phase !== "mini" ? "dran" : ""}"><span class="farbe f${j}"></span><b>${esc(nm)}</b>
      <span>⭐${s.sterne[j]}</span><span>🪙${s.muenzen[j]}</span></div>`).join("")}</div>`;
    // Brett als Rundkurs in einem 8x8-Raster
    const koord = brettKoord();
    const felder = koord.map(([x, y], f) => {
      const figuren = namen.map((_, j) => (s.pos[j] === f ? `<i class="fig f${j}"></i>` : "")).join("");
      const art = muster(s)[f];
      return `<div class="feld art-${art === "a" ? "t" : art} ${f === s.stern ? "sternfeld" : ""}" style="grid-column:${x + 1};grid-row:${y + 1}">
        ${f === s.stern ? "⭐" : ART[art][0]}<div class="figs">${figuren}</div></div>`;
    }).join("");
    const mitte = `<div class="brettmitte">Runde ${Math.min(s.runde, RUNDEN)}/${RUNDEN}${s.wurf ? `<div class="wuerfel">🎲 ${s.wurf}</div>` : ""}</div>`;
    const brettHtml = `<div id="brett3d" class="brett3d"><div class="brett brett2d">${felder}${mitte}</div><div class="brett3d-info">Runde ${Math.min(s.runde, RUNDEN)}/${RUNDEN}${s.wurf ? ` · 🎲 ${s.wurf}` : ""}</div></div>`;
    const m = s.meldung || "";
    const klang = /kauft einen Stern/.test(m) ? "stern" : /\+3 Münzen/.test(m) ? "richtig" : /−3 Münzen/.test(m) ? "falsch" : /❓/.test(m) ? "magie" : /Duell/.test(m) ? "spannung" : /Trinkfeld|Aufgabenfeld/.test(m) ? "pop" : "";
    const meldung = `<div class="meldung">${esc(m)}</div>${klang ? `<i hidden data-key="bt-${s.runde}-${s.dran}-${m.length}-${klang}" data-ton="${klang}" data-ton-nach="${s.wurf && klang !== "stern" ? 400 + s.wurf * 280 : 0}"></i>` : ""}`;
    if (s.ende) {
      const rang = namen.map((_, j) => j).sort((a, b) => s.sterne[b] - s.sterne[a] || s.muenzen[b] - s.muenzen[a]);
      return `${tafel}<div class="urteil">🏆 ${name(namen, rang[0])} gewinnt das Partybrett!</div>
        <ol class="rangliste">${rang.map((j) => `<li>${name(namen, j)}: ⭐${s.sterne[j]} 🪙${s.muenzen[j]}</li>`).join("")}</ol>
        <p class="mitte">${s.ohne ? `🎯 Letzter Platz: ${esc(T.AUFGABEN[(s.pos.length * 7 + s.muenzen.reduce((x, y) => x + y, 0)) % T.AUFGABEN.length])}` : "Letzter Platz trinkt 3 Schlucke 🍺"}</p>${knopf("Neues Spiel", { typ: "neustart" }, "gross")}`;
    }
    if (s.phase === "mini") return `${tafel}<i hidden data-key="btmini-${s.runde}-${s.mini && s.mini.art}" data-ton="los"></i>${miniRender(s, ich, namen)}`;
    let steuer = "";
    const istDran = ich === s.dran;
    if (s.phase === "wuerfeln") steuer = istDran ? `<i hidden data-key="btdran-${s.runde}-${s.dran}" data-ton="dran"></i>` + knopf("🎲 Würfeln", { typ: "wuerfeln" }, "gross") : `<p class="mitte leise">${esc(namen[s.dran])} würfelt …</p>`;
    if (s.phase === "stern") steuer = istDran ? `<div class="raster2">${knopf(`⭐ Kaufen (${STERNPREIS})`, { typ: "kaufen" }, "gross gelb")}${knopf("Nein", { typ: "nein" }, "gross")}</div>` : `<p class="mitte leise">${esc(namen[s.dran])} überlegt …</p>`;
    if (s.phase === "duell") steuer = istDran ? `<p class="mitte">Wen forderst du heraus?</p><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "duell", ziel: j }, "gross"))).join("")}</div>` : `<p class="mitte leise">${esc(namen[s.dran])} wählt einen Gegner …</p>`;
    if (s.phase === "weiter") steuer = knopf("Weiter", { typ: "weiter" }, "gross");
    if (s.phase === "aufgabe") steuer = istDran ? `<div class="raster2">${knopf("✅ Erledigt", { typ: "aufgabe", ok: true }, "gross gruen")}${knopf(`🙅 Keine Lust (−${AUFGABE_STRAFE} 🪙)`, { typ: "aufgabe", ok: false }, "gross")}</div>`
      : `<p class="mitte leise">${esc(namen[s.dran])} ist mit der Aufgabe dran …</p>`;
    // nach dem Wurf steht das Feld erst eine Weile: Weiter, Kaufen/Nein und die Duell-Wahl sind kurz gesperrt (app.js),
    // damit ein zweiter Tipp auf "Wuerfeln" nicht gleich das Ergebnis wegtippt
    const nachWurf = ["weiter", "stern", "duell", "aufgabe"].includes(s.phase) ? `<i hidden data-ergebnis="bw-${s.runde}-${s.dran}-${s.phase}-${m.length}"></i>` : "";
    return `${tafel}${brettHtml}${meldung}${nachWurf}${steuer}`;
  },
  musik(s) { return s.ende ? null : "brett"; },
  // Computer-Mitspieler: wuerfeln, kaufen, duellieren und spielen die Minispiele mit glaubwuerdigen Werten
  botPause: (s) => (s.phase === "weiter" ? 2800 : s.phase === "mini" ? 4500 : 1400),
  bot(s, i) {
    if (s.ende) return null;
    const n = s.pos.length;
    if (s.phase === "mini") {
      const m = s.mini;
      if (!m || m.fertig || m.werte[i] !== undefined) return null;
      const r = (a, b) => a + zufall(b - a + 1);
      const wert = m.art === "tappen" ? r(18, 36) : m.art === "farbwort" ? r(4, 11) : m.art === "gedaechtnis" ? r(4, 8)
        : m.art === "reaktion" ? (Math.random() < 0.08 ? -1 : r(240, 470)) : Math.round(T.SCHAETZ[m.frage][1] * (0.55 + Math.random() * 0.9));
      return { typ: "mini", wert };
    }
    if (s.dran !== i) return null;
    if (s.phase === "wuerfeln") return { typ: "wuerfeln" };
    if (s.phase === "stern") return { typ: "kaufen" };
    if (s.phase === "duell") { const andere = [...Array(n).keys()].filter((j) => j !== i).sort((a, b) => s.muenzen[b] - s.muenzen[a]); return { typ: "duell", ziel: andere[0] }; }
    if (s.phase === "weiter") return { typ: "weiter" };
    if (s.phase === "aufgabe") return { typ: "aufgabe", ok: true };
    return null;
  },
  nach(s, ich, senden) {
    if (s.phase === "mini") return miniNach(s, ich, senden);
    const c = document.getElementById("brett3d");
    if (c && !s.ende) {
      const zweiD = c.querySelector(".brett2d");
      if (brett3dZeigen(c, s, muster(s)) && zweiD) zweiD.remove();
    }
  },
};

function feldWirkung(s, i, feld, namen, nachStern = false) {
  const pre = nachStern ? s.meldung + " " : s.meldung + " ";
  if (feld === "m") { s.muenzen[i] += 3; s.meldung = pre + "+3 Münzen."; s.phase = "weiter"; }
  else if (feld === "v") { s.muenzen[i] = Math.max(0, s.muenzen[i] - 3); s.meldung = pre + "−3 Münzen."; s.phase = "weiter"; }
  else if (feld === "t") { s.meldung = pre + `🍺 Trinkfeld: ${namen[i]} trinkt ${schlucke(1 + zufall(3))}.`; s.phase = "weiter"; }
  // Aufgabenfeld (ohne Trinken): kleine Aufgabe; wer nicht will, gibt Muenzen ab
  else if (feld === "a") { s.meldung = pre + `🎯 Aufgabenfeld: ${namen[i]} – ${ziehe(T.AUFGABEN)}`; s.phase = "aufgabe"; }
  else if (feld === "e") { const [text, f, ohneText] = ziehe(EREIGNISSE); f(s, i); s.meldung = pre + "❓ " + (s.ohne && ohneText ? ohneText : text); s.phase = "weiter"; }
  else if (feld === "d") { s.meldung = pre + "⚔️ Duellfeld!"; s.phase = "duell"; }
}

function zugEnde(s) {
  const n = s.pos.length;
  s.dran = (s.dran + 1) % n;
  s.wurf = null;
  if (s.dran === 0) {
    // Runde vorbei: Minispiel
    const art = MINI[(s.runde - 1) % MINI.length];
    s.mini = { art, runde: s.runde, werte: {}, warte: 1500 + zufall(3500), frage: zufall(T.SCHAETZ.length), zahl: String(10000000 + zufall(89999999)) };
    s.phase = "mini";
    s.meldung = "";
  } else s.phase = "wuerfeln";
}

function miniAktion(s, i, a, namen) {
  const m = s.mini;
  if (a.typ === "mini" && m.werte[i] === undefined && !m.fertig) {
    m.werte[i] = Number(a.wert);
    if (Object.keys(m.werte).length >= s.pos.length) {
      m.fertig = true;
      const n = s.pos.length;
      let rang;
      if (m.art === "tappen" || m.art === "farbwort" || m.art === "gedaechtnis") rang = [...Array(n).keys()].sort((x, y) => m.werte[y] - m.werte[x]);
      else if (m.art === "reaktion") rang = [...Array(n).keys()].sort((x, y) => (m.werte[x] < 0 ? 1e9 : m.werte[x]) - (m.werte[y] < 0 ? 1e9 : m.werte[y]));
      else { const l = T.SCHAETZ[m.frage][1]; rang = [...Array(n).keys()].sort((x, y) => Math.abs(m.werte[x] - l) - Math.abs(m.werte[y] - l)); }
      const preis = [8, 4, 2, 0];
      rang.forEach((j, p) => (s.muenzen[j] += preis[p] || 0));
      m.rang = rang;
    }
  } else if (a.typ === "miniweiter" && m.fertig) {
    s.mini = null;
    s.runde++;
    if (s.runde > RUNDEN) { s.ende = true; return; }
    s.phase = "wuerfeln";
    s.meldung = `Runde ${s.runde} – ${namen[0]} würfelt.`;
  }
}

const MINITEXT = {
  farbwort: ["🎨 Farbwort-Chaos", "Tippe die FARBE, in der das Wort geschrieben ist – nicht das Wort! 12 Sekunden."],
  gedaechtnis: ["🧠 Zahlen-Gedächtnis", "Merk dir die Zahl – sie verschwindet nach 3 Sekunden."],
  tappen: ["👆 Tipp-Marathon", "Tippe so oft du kannst auf die Fläche – 5 Sekunden!"],
  reaktion: ["⚡ Blitzreaktion", "Tippe, sobald die Fläche grün wird. Zu früh = letzter Platz."],
  schaetzen: ["🎯 Schätzfrage", "Wer am nächsten dran ist, gewinnt."],
};

function miniRender(s, ich, namen) {
  const m = s.mini;
  const [titel, text] = MINITEXT[m.art];
  if (m.fertig) {
    const fmt = (j) => (m.art === "farbwort" ? `${m.werte[j]} richtig` : m.art === "gedaechtnis" ? `${m.werte[j]} Ziffern` : m.art === "tappen" ? `${m.werte[j]} Taps` : m.art === "reaktion" ? (m.werte[j] < 0 ? "zu früh" : `${m.werte[j]} ms`) : m.werte[j]);
    return `<div class="frage">${titel} – Ergebnis${m.art === "schaetzen" ? `<br><small>${esc(T.SCHAETZ[m.frage][0])} → <b>${T.SCHAETZ[m.frage][1]}</b></small>` : ""}</div>
      <ol class="rangliste">${m.rang.map((j, p) => `<li>${name(namen, j)}: ${fmt(j)} → +${[8, 4, 2, 0][p]} 🪙</li>`).join("")}</ol>
      <div class="urteil">${name(namen, m.rang[m.rang.length - 1])} trinkt 2 Schlucke</div>${knopf("Weiter zur nächsten Runde", { typ: "miniweiter" }, "gross")}`;
  }
  const fertig = m.werte[ich] !== undefined;
  let inhalt = "";
  // ich < 0: dieses Geraet spielt nur mit Controllern mit (app.js zeigt deren Felder darunter, controller.js)
  if (ich < 0) inhalt = `${m.art === "schaetzen" ? `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div>` : ""}<p class="mitte">${Object.keys(m.werte).length}/${namen.length} fertig</p>`;
  else if (fertig) inhalt = `<p class="mitte">Erledigt – warte auf die anderen (${Object.keys(m.werte).length}/${namen.length})</p>`;
  else if (m.art === "schaetzen") inhalt = `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div><input id="minitipp" data-rk="${m.runde}" type="number" inputmode="decimal" placeholder="Schätzung">${knopf("Abgeben", { typ: "mini" }, "gross", `data-feld="minitipp"`)}`;
  else if (m.art === "farbwort") inhalt = `<div id="farbwort" class="farbwort">Tippe zum Starten</div><div class="raster farbknoepfe">${FW.map(([n, c]) => `<button class="gross" style="background:${c};box-shadow:0 5px 0 #0008" data-fw="${n}">${n}</button>`).join("")}</div>`;
  else if (m.art === "gedaechtnis") {
    // ist die Zahl schon verdeckt, gleich mit Feld zeichnen - sonst verschwindet das Feld beim Neuzeichnen kurz (Fokus weg)
    const zu = gedLokal.schluessel === `ged-${m.runde}` && gedLokal.versteckt;
    inhalt = `<div id="gedzahl" class="reaktion fertig" style="font-size:44px;letter-spacing:6px">${zu ? "? ? ? ?" : m.zahl}</div><input id="gedtipp" data-rk="${m.runde}" inputmode="numeric" placeholder="Zahl eintippen" style="display:${zu ? "block" : "none"}"><button id="gedknopf" class="gross" style="display:${zu ? "block" : "none"}">Abgeben</button>`;
  }
  else inhalt = `<div id="minifeld" class="reaktion rot">${m.art === "tappen" ? "Tippen zum Starten!" : "Warte …"}</div>`;
  return `<div class="frage">Minispiel: ${titel}</div><p class="mitte leise">${text}</p>${inhalt}`;
}

let miniLokal = { schluessel: null };
const FW = [["Rot", "#e11d48"], ["Blau", "#2563eb"], ["Grün", "#16a34a"], ["Gelb", "#ca8a04"]];
function miniNach(s, ich, senden) {
  const m = s.mini;
  if (!m || m.fertig || m.werte[ich] !== undefined || m.art === "schaetzen") return;
  if (m.art === "farbwort") return farbwortNach(m, senden);
  if (m.art === "gedaechtnis") return gedaechtnisNach(m, senden);
  const fl = document.getElementById("minifeld");
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

function brettKoord() {
  // Rundkurs auf dem Rand eines 8x8-Rasters: 28 Felder
  const k = [];
  for (let x = 0; x < 8; x++) k.push([x, 0]);
  for (let y = 1; y < 8; y++) k.push([7, y]);
  for (let x = 6; x >= 0; x--) k.push([x, 7]);
  for (let y = 6; y >= 1; y--) k.push([0, y]);
  return k;
}

let fwLokal = { schluessel: null };
function farbwortNach(m, senden) {
  const schluessel = `fw-${m.runde}`;
  const anzeige = document.getElementById("farbwort");
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
