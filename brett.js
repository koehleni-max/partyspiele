// Partybrett - eigenes Brettspiel mit Wuerfeln, Feldern, Sternen und Minispielen nach jeder Runde
// (in der Art bekannter Party-Brettspiele, eigene Umsetzung).
import { esc, knopf, zufall, ziehe, mischen, name, schlucke } from "./hilfe.js";
import * as T from "./texte.js";

const RUNDEN = 8;
const FELDER = 28;
const STERNPREIS = 10;
// Feldarten: m = +3 Muenzen, v = -3 Muenzen, t = Trinkfeld, e = Ereignis, d = Duell
const MUSTER = "mmtmevmdmtmemvmtmmdemtmvmemt";
const ART = { m: ["🪙", "+3 Münzen"], v: ["💸", "−3 Münzen"], t: ["🍺", "Trinkfeld"], e: ["❓", "Ereignis"], d: ["⚔️", "Duell"] };
const EREIGNISSE = [
  ["Glückspilz! +6 Münzen", (s, i) => (s.muenzen[i] += 6)],
  ["Taschendieb! Du verlierst 5 Münzen", (s, i) => (s.muenzen[i] = Math.max(0, s.muenzen[i] - 5))],
  ["Robin Hood: der Reichste gibt dir 4 Münzen", (s, i) => { const r = s.muenzen.indexOf(Math.max(...s.muenzen)); const n = Math.min(4, s.muenzen[r]); s.muenzen[r] -= n; s.muenzen[i] += n; }],
  ["Alle anderen trinken einen Schluck auf dich", () => {}],
  ["Teleport! Du landest 4 Felder weiter", (s, i) => { s.pos[i] = (s.pos[i] + 4) % FELDER; }],
  ["Stern-Umzug: der Stern wandert woanders hin", (s) => { s.stern = neuerStern(s); }],
  ["Du trinkst 2 Schlucke – dafür +4 Münzen", (s, i) => (s.muenzen[i] += 4)],
  ["Schenk jemandem 3 Münzen – oder trink 3 Schlucke", () => {}],
];
const MINI = ["tappen", "reaktion", "schaetzen"];

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
      const feld = MUSTER[s.pos[i]];
      s.meldung = `${namen[i]} würfelt eine ${s.wurf}.`;
      if (passiert && s.muenzen[i] >= STERNPREIS) { s.phase = "stern"; s.meldung += " Am Stern vorbei – kaufen?"; return; }
      if (passiert) s.meldung += ` Am Stern vorbei, aber zu wenig Münzen (${STERNPREIS} nötig).`;
      feldWirkung(s, i, feld, namen);
    } else if (s.phase === "stern" && i === s.dran && (a.typ === "kaufen" || a.typ === "nein")) {
      if (a.typ === "kaufen") { s.muenzen[i] -= STERNPREIS; s.sterne[i]++; s.meldung = `⭐ ${namen[i]} kauft einen Stern! Alle anderen trinken 1.`; s.stern = neuerStern(s); }
      feldWirkung(s, i, MUSTER[s.pos[i]], namen, true);
    } else if (s.phase === "duell" && i === s.dran && a.typ === "duell" && a.ziel !== i) {
      const ich = 1 + zufall(6), du = 1 + zufall(6);
      const sieger = ich >= du ? i : a.ziel, verl = sieger === i ? a.ziel : i;
      const beute = Math.min(4, s.muenzen[verl]);
      s.muenzen[verl] -= beute; s.muenzen[sieger] += beute;
      s.meldung = `⚔️ Duell: ${namen[i]} ${ich} gegen ${namen[a.ziel]} ${du} – ${namen[sieger]} gewinnt ${beute} Münzen, ${namen[verl]} trinkt 2!`;
      zugEnde(s);
    } else if (s.phase === "weiter" && a.typ === "weiter") {
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
      return `<div class="feld art-${MUSTER[f]} ${f === s.stern ? "sternfeld" : ""}" style="grid-column:${x + 1};grid-row:${y + 1}">
        ${f === s.stern ? "⭐" : ART[MUSTER[f]][0]}<div class="figs">${figuren}</div></div>`;
    }).join("");
    const mitte = `<div class="brettmitte">Runde ${Math.min(s.runde, RUNDEN)}/${RUNDEN}${s.wurf ? `<div class="wuerfel">🎲 ${s.wurf}</div>` : ""}</div>`;
    const brettHtml = `<div class="brett">${felder}${mitte}</div>`;
    const meldung = `<div class="meldung">${esc(s.meldung)}</div>`;
    if (s.ende) {
      const rang = namen.map((_, j) => j).sort((a, b) => s.sterne[b] - s.sterne[a] || s.muenzen[b] - s.muenzen[a]);
      return `${tafel}<div class="urteil">🏆 ${name(namen, rang[0])} gewinnt das Partybrett!</div>
        <ol class="rangliste">${rang.map((j) => `<li>${name(namen, j)}: ⭐${s.sterne[j]} 🪙${s.muenzen[j]}</li>`).join("")}</ol>
        <p class="mitte">Letzter Platz trinkt 3 Schlucke 🍺</p>${knopf("Neues Spiel", { typ: "neustart" }, "gross")}`;
    }
    if (s.phase === "mini") return `${tafel}${miniRender(s, ich, namen)}`;
    let steuer = "";
    const istDran = ich === s.dran;
    if (s.phase === "wuerfeln") steuer = istDran ? knopf("🎲 Würfeln", { typ: "wuerfeln" }, "gross") : `<p class="mitte leise">${esc(namen[s.dran])} würfelt …</p>`;
    if (s.phase === "stern") steuer = istDran ? `<div class="raster2">${knopf(`⭐ Kaufen (${STERNPREIS})`, { typ: "kaufen" }, "gross gelb")}${knopf("Nein", { typ: "nein" }, "gross")}</div>` : `<p class="mitte leise">${esc(namen[s.dran])} überlegt …</p>`;
    if (s.phase === "duell") steuer = istDran ? `<p class="mitte">Wen forderst du heraus?</p><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(esc(nm), { typ: "duell", ziel: j }, "gross"))).join("")}</div>` : `<p class="mitte leise">${esc(namen[s.dran])} wählt einen Gegner …</p>`;
    if (s.phase === "weiter") steuer = knopf("Weiter", { typ: "weiter" }, "gross");
    return `${tafel}${brettHtml}${meldung}${steuer}`;
  },
  nach(s, ich, senden) { if (s.phase === "mini") miniNach(s, ich, senden); },
};

function feldWirkung(s, i, feld, namen, nachStern = false) {
  const pre = nachStern ? s.meldung + " " : s.meldung + " ";
  if (feld === "m") { s.muenzen[i] += 3; s.meldung = pre + "+3 Münzen."; s.phase = "weiter"; }
  else if (feld === "v") { s.muenzen[i] = Math.max(0, s.muenzen[i] - 3); s.meldung = pre + "−3 Münzen."; s.phase = "weiter"; }
  else if (feld === "t") { s.meldung = pre + `🍺 Trinkfeld: ${namen[i]} trinkt ${schlucke(1 + zufall(3))}.`; s.phase = "weiter"; }
  else if (feld === "e") { const [text, f] = ziehe(EREIGNISSE); f(s, i); s.meldung = pre + "❓ " + text; s.phase = "weiter"; }
  else if (feld === "d") { s.meldung = pre + "⚔️ Duellfeld!"; s.phase = "duell"; }
}

function zugEnde(s) {
  const n = s.pos.length;
  s.dran = (s.dran + 1) % n;
  s.wurf = null;
  if (s.dran === 0) {
    // Runde vorbei: Minispiel
    const art = MINI[(s.runde - 1) % MINI.length];
    s.mini = { art, runde: s.runde, werte: {}, warte: 1500 + zufall(3500), frage: zufall(T.SCHAETZ.length) };
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
      if (m.art === "tappen") rang = [...Array(n).keys()].sort((x, y) => m.werte[y] - m.werte[x]);
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
  tappen: ["👆 Tipp-Marathon", "Tippe so oft du kannst auf die Fläche – 5 Sekunden!"],
  reaktion: ["⚡ Blitzreaktion", "Tippe, sobald die Fläche grün wird. Zu früh = letzter Platz."],
  schaetzen: ["🎯 Schätzfrage", "Wer am nächsten dran ist, gewinnt."],
};

function miniRender(s, ich, namen) {
  const m = s.mini;
  const [titel, text] = MINITEXT[m.art];
  if (m.fertig) {
    const fmt = (j) => (m.art === "tappen" ? `${m.werte[j]} Taps` : m.art === "reaktion" ? (m.werte[j] < 0 ? "zu früh" : `${m.werte[j]} ms`) : m.werte[j]);
    return `<div class="frage">${titel} – Ergebnis${m.art === "schaetzen" ? `<br><small>${esc(T.SCHAETZ[m.frage][0])} → <b>${T.SCHAETZ[m.frage][1]}</b></small>` : ""}</div>
      <ol class="rangliste">${m.rang.map((j, p) => `<li>${name(namen, j)}: ${fmt(j)} → +${[8, 4, 2, 0][p]} 🪙</li>`).join("")}</ol>
      <div class="urteil">${name(namen, m.rang[m.rang.length - 1])} trinkt 2 Schlucke</div>${knopf("Weiter zur nächsten Runde", { typ: "miniweiter" }, "gross")}`;
  }
  const fertig = m.werte[ich] !== undefined;
  let inhalt = "";
  if (fertig) inhalt = `<p class="mitte">Erledigt – warte auf die anderen (${Object.keys(m.werte).length}/${namen.length})</p>`;
  else if (m.art === "schaetzen") inhalt = `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div><input id="minitipp" type="number" inputmode="decimal" placeholder="Schätzung">${knopf("Abgeben", { typ: "mini" }, "gross", `data-feld="minitipp"`)}`;
  else inhalt = `<div id="minifeld" class="reaktion rot">${m.art === "tappen" ? "Tippen zum Starten!" : "Warte …"}</div>`;
  return `<div class="frage">Minispiel: ${titel}</div><p class="mitte leise">${text}</p>${inhalt}`;
}

let miniLokal = { schluessel: null };
function miniNach(s, ich, senden) {
  const m = s.mini;
  if (!m || m.fertig || m.werte[ich] !== undefined || m.art === "schaetzen") return;
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
