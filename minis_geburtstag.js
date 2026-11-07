// Partybrett: Geburtstags-Runde D - neue Minispiele (Nico 06.11.2026, Vorschlaege 41, 42, 47, 50, 54 einzeln mit Ja).
//   50 Farbverwirrung, 47 Schuettelmeister, 41 Bierdeckel-Weitwurf, 42 Torte schneiden, 54 Kugel-Labyrinth
// Gleiche Bauart wie brett_minis.js / brett_minis2.js (Zustandsmaschine mit Tasten, Gastgeber wuerfelt m.d aus, jedes Geraet
// misst selbst und schickt EINEN Wert; Bots, Streichliste und Hauptmenue laufen ueber NEU_IDS von selbst mit).
// Neu hier sind Eingaben, die mehr koennen als Knopf und Wischrichtung. Sie kommen als eigene Tasten-Texte an:
//   "wurf:<kraft>:<seite>"          Bierdeckel: Wisch nach oben (Tempo = Kraft, Schraege = Seite)
//   "schnitt:<x1>:<y1>:<x2>:<y2>"   Torte: Wisch quer ueber die Torte (Prozent der Tortenflaeche)
//   "schuettel"                      Schuettelmeister: ein Schuettler vom Bewegungssensor
//   "kipp:<x>:<y>"                   Kugel-Labyrinth: Neigung des Handys (-100..100)
// Die Hoerer dafuer sitzen unten am Dokument (nicht an brett_minis.js) und schicken ueber dessen taste() weiter. Ohne Sensor
// oder ohne Freigabe (iPhone fragt nach) bleiben immer die Knoepfe - am Controller sowieso.
// Kein Import von brett_minis.js beim Laden (der Satz wird dort beim Laden eingesammelt), nur spaeter zur Laufzeit.

const r = (n) => Math.floor(Math.random() * n);
const komma = (x, n = 1) => x.toFixed(n).replace(".", ",");
const begrenzt = (x, a, b) => Math.max(a, Math.min(b, x));
const sek = (ms) => komma(Math.max(0, ms) / 1000);
const pendel = (ms, p) => { const ph = (((ms % p) + p) % p) / p; return (ph < 0.5 ? ph * 2 : 2 - ph * 2) * 100; };
function schritt(st, ms) { const dt = Math.min(0.12, Math.max(0, ms - (st.t || 0)) / 1000); st.t = ms; return dt; }
const istText = (t) => typeof t === "string";
const links = (t) => t === "links" || t === "x";
const rechts = (t) => t === "rechts" || t === "b";
const FARBE = { a: ["Grün", "#16a34a"], b: ["Rot", "#e11d48"], x: ["Blau", "#2563eb"], y: ["Gelb", "#eab308"] };
const VIER = ["a", "b", "x", "y"];
const RICHT = { hoch: [0, -1], runter: [0, 1], links: [-1, 0], rechts: [1, 0] };
const kreuz = () => [["hoch", "⬆️"], ["links", "⬅️"], ["rechts", "➡️"], ["runter", "⬇️"]];

// ---------------------------------------------------------------- Sensoren (Schuetteln, Neigen)
const braucheFreigabe = () => typeof window !== "undefined" && (
  (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function")
  || (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function"));
let freigegeben = false;
// Freigabe-Knopf in der Knopfleiste (die bleibt stehen; das Bild wird laufend neu gezeichnet und wuerde das Antippen verschlucken).
// Die Taste "sensor" tut im Spiel nichts, die Freigabe selbst holt der Klick-Hoerer unten.
// Kommen schon Messwerte (Android, oder Freigabe von frueher), verschwindet der Knopf von selbst.
const sensorKnopf = (text, ctrl) => (!ctrl && !freigegeben && braucheFreigabe() ? [["sensor", `📱 ${text}`, "gruen"]] : []);

// ---------------------------------------------------------------- 50 Farbverwirrung
const farbverwirrung = {
  id: "farbverwirrung", titel: "Farbverwirrung", emo: "🌀", typ: "Reaktion", gut: "hoch", dauer: 16000,
  regel: "Ein Farbwort in der falschen Farbe. Oben steht, was gerade zählt: die SCHRIFTFARBE oder das WORT selbst – das wechselt! Tipp schnell die richtige Farbe. Richtig +1, falsch −1. Alle bekommen dieselben Aufgaben.",
  einheit: (w) => `${w} ${w === 1 ? "Punkt" : "Punkte"}`,
  daten() {
    const f = [];
    for (let k = 0; k < 80; k++) {
      const wort = r(4); let tinte = r(3); if (tinte >= wort) tinte++;
      f.push({ wort, tinte, frage: k < 3 ? 0 : r(10) < 6 ? 0 : 1, hell: r(2) === 1 });
    }
    return { f };
  },
  neu: () => ({ i: 0, punkte: 0, zuletzt: null }),
  taste(st, t, m) {
    const k = VIER.indexOf(t);
    if (k < 0) return;
    const a = m.d.f[st.i % m.d.f.length], richtig = a.frage === 0 ? a.tinte : a.wort;
    st.zuletzt = k === richtig;
    st.punkte = st.zuletzt ? st.punkte + 1 : Math.max(0, st.punkte - 1);
    st.i++;
  },
  bild(st, m) {
    const a = m.d.f[st.i % m.d.f.length];
    const frage = a.frage === 0 ? "Welche SCHRIFTFARBE?" : "Was STEHT da?";
    return `<div style="font-weight:900;font-size:17px;letter-spacing:.5px">${frage}</div>
      <div style="background:${a.hell ? "#f1f5f9" : "#111827"};color:${FARBE[VIER[a.tinte]][1]};font-size:42px;font-weight:900;padding:10px 22px;border-radius:14px;max-width:100%;box-sizing:border-box">${FARBE[VIER[a.wort]][0].toUpperCase()}</div>
      <small>${st.punkte} ${st.punkte === 1 ? "Punkt" : "Punkte"}${st.zuletzt === null ? "" : st.zuletzt ? " · ✔️" : " · ❌"}</small>`;
  },
  knoepfe: () => VIER.map((t) => [t, FARBE[t][0], `farbe-${t}`]), raster: "22",
  ende: (st) => st.punkte, bot: () => 4 + r(11),
};

// ---------------------------------------------------------------- 47 Schuettelmeister
const schuetteln = {
  id: "schuetteln", titel: "Schüttelmeister", emo: "🫨", typ: "Bewegung", gut: "hoch", dauer: 10000,
  regel: "Schüttel dein Handy, so fest und schnell du kannst – jeder Schüttler zählt! Halt es gut fest. Ohne Bewegungssensor (oder ohne Freigabe am iPhone) tippst du stattdessen auf den Knopf. 10 Sekunden!",
  einheit: (w) => `${w} ${w === 1 ? "Schüttler" : "Schüttler"}`,
  neu: () => ({ n: 0, sensor: 0 }),
  taste(st, t) {
    if (t === "schuettel") { st.n++; st.sensor++; }
    else if (t === "a") st.n++;
  },
  bild(st) {
    const kipp = st.n % 2 ? -16 : 16;
    return `<div class="mg-schuettel" style="font-size:70px;line-height:1;transform:rotate(${kipp}deg)">🍹</div>
      <div style="width:min(260px,80%);height:14px;border-radius:7px;background:#ffffff22;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, st.n * 1.25).toFixed(0)}%;background:#f97316"></i></div>
      <small>${st.n} Schüttler${st.sensor ? " · 📳 Sensor an" : ""}</small>`;
  },
  knoepfe: (st, m, ms, ctrl) => [...sensorKnopf("Schütteln erlauben", ctrl), ["a", ctrl ? "Schütteln (A hämmern)" : "👆 Tippen statt Schütteln"]], raster: "1",
  ende: (st) => st.n, bot: () => 25 + r(36),
};

// ---------------------------------------------------------------- 41 Bierdeckel-Weitwurf
// Spielfeld von oben: 0 = Abwurf, 75 = Ziel, 1 Einheit = 10 cm. Wind je Wurf fuer alle gleich (m.d).
const BD_ZIEL = 75;
const bdOben = (y) => 92 - y * 0.68;   // Weite -> Abstand von oben (Prozent)
function bdWurf(st, m, kraft, seite) {
  const wind = m.d.wind[Math.min(2, st.wurf)], weit = kraft / BD_ZIEL;
  const x = 50 + seite * 0.6 * weit + wind * 22 * weit, y = kraft;
  const ab = Math.round(Math.hypot(x - 50, y - BD_ZIEL) * 10);
  st.wuerfe.push([begrenzt(x, 2, 98), begrenzt(y, 0, 130), ab]);
  st.best = Math.min(st.best, ab); st.zuletzt = ab; st.wurf++; st.phase = "bereit";
  if (st.wurf >= 3) return { wert: st.best };
}
const windText = (w) => `🌬️ ${Math.abs(w) < 0.08 ? "kaum Wind" : `${w < 0 ? "⬅️" : "➡️"} ${Math.abs(w) < 0.35 ? "schwach" : Math.abs(w) < 0.7 ? "mittel" : "stark"}`}`;
const bierdeckel = {
  id: "bierdeckel", titel: "Bierdeckel-Weitwurf", emo: "🍺", typ: "Zielen", gut: "tief", dauer: 24000,
  regel: "Wisch den Bierdeckel nach oben zum Ziel 🎯 – je schneller der Wisch, desto weiter fliegt er. Der Wind treibt ihn zur Seite, also schräg dagegen wischen. Drei Würfe, der beste zählt: wer am nächsten am Ziel liegt, gewinnt.",
  einheit: (w) => (w >= 9999 ? "kein Wurf" : `${komma(w / 100, 2)} m vom Ziel`),
  daten: () => ({ wind: [0, 1, 2].map(() => Math.round((Math.random() * 2 - 1) * 100) / 100) }),
  neu: () => ({ wurf: 0, phase: "bereit", t0: 0, seite: 0, wuerfe: [], best: 9999, zuletzt: null }),
  taste(st, t, m, ms) {
    if (st.wurf >= 3 || !istText(t)) return;
    if (t.startsWith("wurf:")) {
      const [, k, s] = t.split(":");
      return bdWurf(st, m, begrenzt(Number(k) || 0, 0, 130), begrenzt(Number(s) || 0, -45, 45));
    }
    if (links(t)) st.seite = begrenzt(st.seite - 5, -45, 45);
    if (rechts(t)) st.seite = begrenzt(st.seite + 5, -45, 45);
    if (t === "a") {
      if (st.phase === "bereit") { st.phase = "kraft"; st.t0 = ms; return; }
      return bdWurf(st, m, pendel(ms - st.t0, 1500) * 1.2, st.seite);
    }
  },
  bild(st, m, ms) {
    const wind = m.d.wind[Math.min(2, st.wurf)];
    const marken = st.wuerfe.map(([x, y, ab], k) => `<i style="position:absolute;left:${x.toFixed(1)}%;top:${bdOben(y).toFixed(1)}%;transform:translate(-50%,-50%);font-style:normal;font-size:${k === st.wuerfe.length - 1 ? 26 : 18}px">🟤</i>`).join("");
    const zielen = `<i style="position:absolute;left:${(50 + st.seite * 0.6).toFixed(1)}%;top:${bdOben(BD_ZIEL) + 9}%;transform:translate(-50%,-50%);font-style:normal;font-size:16px;opacity:.75">⬆️</i>`;
    const feld = `<div data-mg="wurf" style="position:relative;width:min(280px,86%);height:210px;border-radius:14px;overflow:hidden;touch-action:none;cursor:grab;background:linear-gradient(#5b3a1e,#8b5a2b);box-shadow:inset 0 0 0 3px #3b2410">
      <i style="position:absolute;left:50%;top:${bdOben(BD_ZIEL)}%;transform:translate(-50%,-50%);font-style:normal;font-size:40px">🎯</i>${zielen}${marken}
      ${st.wurf < 3 ? `<i style="position:absolute;left:50%;top:92%;transform:translate(-50%,-50%);font-style:normal;font-size:28px">🟫</i>` : ""}</div>`;
    const kraft = st.phase === "kraft" ? `<div style="width:min(260px,80%);height:12px;border-radius:6px;background:#ffffff22;overflow:hidden"><i style="display:block;height:100%;width:${pendel(ms - st.t0, 1500).toFixed(0)}%;background:#22c55e"></i></div>` : "";
    return `${feld}${kraft}<small>Wurf ${Math.min(3, st.wurf + 1)}/3 · ${windText(wind)}${st.zuletzt !== null ? ` · zuletzt ${komma(st.zuletzt / 100, 2)} m` : ""}</small><small>👆 Nach oben wischen – oder ⬅️ ➡️ zielen, 💪 Kraft</small>`;
  },
  knoepfe: (st) => [["links", "⬅️"], ["a", st.phase === "kraft" ? "🍺 Los!" : "💪 Kraft"], ["rechts", "➡️"]], raster: "3",
  ende: (st) => st.best, bot: () => (Math.random() < 0.1 ? 9999 : 20 + r(700)),
};

// ---------------------------------------------------------------- 42 Torte schneiden
// Runde 1: eine Torte halbieren (ein Schnitt), Runde 2: eine zweite vierteln (zwei Schnitte). Flaechen zaehlt ein feines
// Punktgitter in der Torte (Mitte 50/50, Halbmesser 45) - so stimmt es auch fuer schiefe Schnitte, die sich nicht in der Mitte kreuzen.
const TO_R = 45;
function tortenTeile(schnitte) {
  const zahl = new Map(); let n = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
    const x = (i + 0.5) * 2.5, y = (j + 0.5) * 2.5;
    if ((x - 50) ** 2 + (y - 50) ** 2 > TO_R * TO_R) continue;
    n++;
    const k = schnitte.map(([x1, y1, x2, y2]) => ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) >= 0 ? 1 : 0)).join("");
    zahl.set(k, (zahl.get(k) || 0) + 1);
  }
  return [...zahl.values()].map((c) => (c * 100) / n).sort((a, b) => b - a);
}
function tortenWertung(schnitte, teile) {
  const anteile = tortenTeile(schnitte), soll = 100 / teile;
  let fehler = 0;
  for (let k = 0; k < teile; k++) fehler += Math.abs((anteile[k] || 0) - soll);
  fehler += anteile.slice(teile).reduce((a, b) => a + b, 0);
  return { punkte: Math.max(0, Math.round(100 - fehler * (teile === 2 ? 2 : 1.5))), anteile };
}
// Schnittlinie auf den Tortenrand kuerzen (fuer die Zeichnung)
function sehne([x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const px = x1 - 50, py = y1 - 50, b = px * ux + py * uy, c = px * px + py * py - TO_R * TO_R, d = b * b - c;
  if (d <= 0) return null;
  const t1 = -b - Math.sqrt(d), t2 = -b + Math.sqrt(d);
  return [x1 + ux * t1, y1 + uy * t1, x1 + ux * t2, y1 + uy * t2];
}
const toLinie = (st, ms) => 15 + pendel(ms - st.t0, 2400) * 0.7;
const toFuehrung = (st, ms) => { const p = toLinie(st, ms); return st.runde === 1 && st.schnitte.length === 1 ? [0, p, 100, p] : [p, 0, p, 100]; };
function toSchnitt(st, s, ms) {
  st.schnitte.push(s); st.t0 = ms;
  const teile = st.runde === 0 ? 2 : 4;
  if (st.schnitte.length < teile / 2) return;
  const w = tortenWertung(st.schnitte, teile);
  st.punkte.push(w.punkte); st.zuletzt = { ...w, schnitte: st.schnitte }; st.schnitte = []; st.runde++;
  if (st.runde >= 2) return { wert: st.punkte.reduce((a, b) => a + b, 0) };
}
const torte = {
  id: "torte", titel: "Torte schneiden", emo: "🎂", typ: "Geschick", gut: "hoch", dauer: 26000,
  regel: "Erst eine Torte genau halbieren, dann eine zweite genau vierteln (zwei Schnitte). Schneid mit einem Wisch quer über die Torte – oder drück 🔪, wenn die wandernde Linie richtig steht. Je gleicher die Stücke, desto mehr Punkte (bis 200).",
  einheit: (w) => `${w} von 200 Punkten`,
  neu: () => ({ runde: 0, schnitte: [], punkte: [], zuletzt: null, t0: 0 }),
  taste(st, t, m, ms) {
    if (st.runde >= 2 || !istText(t)) return;
    if (t.startsWith("schnitt:")) {
      const z = t.split(":").slice(1).map(Number);
      if (z.length !== 4 || z.some((x) => isNaN(x)) || Math.hypot(z[2] - z[0], z[3] - z[1]) < 10) return;
      return toSchnitt(st, z, ms);
    }
    if (t === "a") return toSchnitt(st, toFuehrung(st, ms), ms);
  },
  bild(st, m, ms) {
    const linie = (s, farbe, breit, strich = "") => { const c = sehne(s); return c ? `<line x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${c[2].toFixed(1)}" y2="${c[3].toFixed(1)}" stroke="${farbe}" stroke-width="${breit}" stroke-linecap="round" ${strich}/>` : ""; };
    const kerzen = [[50, 22], [72, 40], [64, 68], [36, 68], [28, 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="#e11d48"/><circle cx="${x}" cy="${y - 4}" r="1.6" fill="#fde047"/>`).join("");
    const fuehrung = st.runde < 2 ? linie(toFuehrung(st, ms), "#ffffff", 0.8, `stroke-dasharray="3 2" opacity=".85"`) : "";
    const svg = `<svg data-mg="torte" viewBox="0 0 100 100" style="width:min(230px,70vw);height:auto;touch-action:none;cursor:crosshair;display:block">
      <circle cx="50" cy="50" r="${TO_R + 3}" fill="#e5e7eb"/><circle cx="50" cy="50" r="${TO_R}" fill="#f9a8d4"/><circle cx="50" cy="50" r="${TO_R - 6}" fill="none" stroke="#fdf2f8" stroke-width="2" stroke-dasharray="2 3"/>${kerzen}
      ${st.schnitte.map((s) => linie(s, "#7c2d12", 1.6)).join("")}${fuehrung}</svg>`;
    const aufgabe = st.runde === 0 ? "Halbieren: ein Schnitt" : st.runde === 1 ? `Vierteln: Schnitt ${st.schnitte.length + 1} von 2` : "fertig";
    const z = st.zuletzt ? ` · zuletzt ${st.zuletzt.anteile.slice(0, 4).map((a) => Math.round(a)).join("/")} % = ${st.zuletzt.punkte} P.` : "";
    return `${svg}<small>${aufgabe}${z}</small><small>👆 Quer über die Torte wischen</small>`;
  },
  knoepfe: () => [["a", "🔪 Schneiden"]], raster: "1",
  ende: (st) => st.punkte.reduce((a, b) => a + b, 0), bot: () => 100 + r(90),
};

// ---------------------------------------------------------------- 54 Kugel-Labyrinth
// Alle kippen dasselbe Holz-Labyrinth (6 x 6, vom Gastgeber gewuerfelt). Die Kugel rollt Feld fuer Feld in die Richtung, in die
// das Handy am staerksten geneigt ist, schneller je staerker. Loecher liegen nur abseits des Weges ins Ziel - wer reinfaellt,
// startet von vorn. Knoepfe/Controller geben einen kurzen Stoss in die Richtung.
const KL_N = 6, KL_ZIEL = KL_N * KL_N - 1;
const KL_BIT = { hoch: 1, rechts: 2, runter: 4, links: 8 };
const KL_SCHRITT = { hoch: -KL_N, rechts: 1, runter: KL_N, links: -1 };
const kugel = {
  id: "kugel", titel: "Kugel-Labyrinth", emo: "🔵", typ: "Neigen", gut: "tief", dauer: 35000,
  regel: "Kipp dein Handy und roll die Kugel durchs Holz-Labyrinth ins Ziel 🏁 – vorsicht vor den Löchern, sonst geht es von vorn los! Ohne Neigesensor schubst du die Kugel mit den Pfeilen. Alle haben dasselbe Labyrinth, der Schnellste gewinnt.",
  einheit: (w) => (w < 60000 ? `im Ziel nach ${sek(w)} s` : "nicht ins Ziel"),
  daten() {
    const N = KL_N, offen = Array(N * N).fill(0), besucht = new Set([0]), stapel = [0], vater = { 0: -1 };
    const SEITE = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];   // dx, dy, eigene Tuer, Tuer gegenueber
    while (stapel.length) {
      const c = stapel[stapel.length - 1], x = c % N, y = (c - x) / N;
      const nb = SEITE.map(([dx, dy, b, g]) => [x + dx, y + dy, b, g]).filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N && !besucht.has(b * N + a));
      if (!nb.length) { stapel.pop(); continue; }
      const [nx, ny, b, gb] = nb[r(nb.length)], n = ny * N + nx;
      offen[c] |= b; offen[n] |= gb; besucht.add(n); stapel.push(n); vater[n] = c;
    }
    const weg = new Set(); for (let c = KL_ZIEL; c >= 0; c = vater[c]) weg.add(c);
    const frei = [...Array(N * N).keys()].filter((c) => !weg.has(c));
    const loecher = [];
    while (loecher.length < 4 && frei.length) loecher.push(frei.splice(r(frei.length), 1)[0]);
    return { offen, loecher };
  },
  neu: () => ({ p: 0, kx: 0, ky: 0, lauf: 0, t: 0, faelle: 0, knopfBis: -1, fall: -9999 }),
  taste(st, t, m, ms) {
    if (!istText(t)) return;
    if (t.startsWith("kipp:")) {
      if (ms < st.knopfBis) return;
      const [, gx, gy] = t.split(":");
      st.kx = begrenzt((Number(gx) || 0) / 100, -1, 1); st.ky = begrenzt((Number(gy) || 0) / 100, -1, 1);
      return;
    }
    const d = RICHT[t];
    if (d) { st.kx = d[0]; st.ky = d[1]; st.knopfBis = ms + 700; }
  },
  tick(st, m, ms) {
    const dt = schritt(st, ms);
    if (ms < st.knopfBis) { st.kx *= Math.pow(0.05, dt); st.ky *= Math.pow(0.05, dt); }
    const ax = Math.abs(st.kx), ay = Math.abs(st.ky), s = Math.max(ax, ay);
    if (s < 0.2) { st.lauf = 0; return; }
    const dir = ax >= ay ? (st.kx > 0 ? "rechts" : "links") : st.ky > 0 ? "runter" : "hoch";
    if (!(m.d.offen[st.p] & KL_BIT[dir])) { st.lauf = 0; return; }
    st.lauf += dt * (1.5 + s * 4.5);
    if (st.lauf < 1) return;
    st.lauf = 0; st.p += KL_SCHRITT[dir];
    if (m.d.loecher.includes(st.p)) { st.p = 0; st.faelle++; st.fall = ms; st.kx = st.ky = 0; }
    if (st.p === KL_ZIEL) return { wert: Math.max(1, Math.round(ms)) };
  },
  bild(st, m, ms) {
    const felder = m.d.offen.map((o, c) => {
      const rand = `border-style:solid;border-color:#3b2410;border-width:${o & 1 ? 0 : 3}px ${o & 2 ? 0 : 3}px ${o & 4 ? 0 : 3}px ${o & 8 ? 0 : 3}px`;
      const was = c === st.p ? "🔵" : c === KL_ZIEL ? "🏁" : m.d.loecher.includes(c) ? "🕳️" : "";
      return `<span style="${rand};box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:18px;min-width:0">${was}</span>`;
    }).join("");
    const fiel = ms - st.fall < 1500 ? " · 🕳️ reingefallen!" : "";
    return `<div class="mg-kugel" data-mg-runde="${m.runde !== undefined ? m.runde : ""}" style="display:grid;grid-template-columns:repeat(${KL_N},1fr);grid-template-rows:repeat(${KL_N},1fr);width:min(240px,72vw);aspect-ratio:1;background:#c08a4a;border:3px solid #3b2410;border-radius:8px;box-sizing:border-box">${felder}</div>
      <small>${sek(ms)} s${st.faelle ? ` · ${st.faelle}× gefallen` : ""}${fiel}</small>`;
  },
  // ohne Freigabe sitzt der Freigabe-Knopf in der freien Ecke oben links des Steuerkreuzes
  knoepfe: (st, m, ms, ctrl) => [...sensorKnopf("Sensor", ctrl), ...kreuz()], raster: "kreuz",
  ende: (st) => {
    const x = st.p % KL_N, y = (st.p - x) / KL_N;
    return 60000 + (KL_N - 1 - x) + (KL_N - 1 - y);
  },
  bot: () => (Math.random() < 0.7 ? 9000 + r(20000) : 60000 + r(10)),
};

export const DEFS_GEB = [farbverwirrung, schuetteln, bierdeckel, torte, kugel];
// fuer die Tests
export const _intern = { tortenWertung, sehne, bdWurf };

// ---------------------------------------------------------------- Eingaben am Handy (Wischen mit Tempo/Linie, Sensoren)
let brettMinis = null;
const modul = () => (brettMinis ? Promise.resolve(brettMinis) : import("./brett_minis.js").then((x) => (brettMinis = x)));
const sende = (key, t) => { modul().then((x) => x.taste(key, t)).catch(() => {}); };
// das laufende Handy-Feld (nicht die Controller-Felder am Gastgeber) mit diesem Bild
function handyFeld(sel) {
  for (const el of document.querySelectorAll(`.mn:not(.mn-pad) ${sel}`)) { const b = el.closest("[data-mn]"); if (b) return [b.dataset.mn, el]; }
  return null;
}
let zug = null;
function zugEnde(x, y) {
  const z = zug; zug = null;
  if (!z) return;
  const dx = x - z.x, dy = y - z.y, dt = Math.max(40, performance.now() - z.t);
  if (z.art === "wurf") {
    if (-dy < 20) return;
    // Tempo in "Feldhoehen pro Sekunde" -> Kraft; Schraege -> Seite
    const kraft = ((-dy / Math.max(1, z.r.height)) / (dt / 1000)) * 22;
    sende(z.key, `wurf:${Math.round(kraft)}:${Math.round((dx / -dy) * 40)}`);
  }
  if (z.art === "torte") {
    const p = (cx, cy) => [((cx - z.r.left) / Math.max(1, z.r.width)) * 100, ((cy - z.r.top) / Math.max(1, z.r.height)) * 100];
    const a = p(z.x, z.y), b = p(x, y);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 10) return;
    sende(z.key, `schnitt:${[...a, ...b].map((v) => v.toFixed(1)).join(":")}`);
  }
}
let hoererAn = false, oben = false, kippZuletzt = 0, basis = { wer: "", beta: 0 };
function sensorHoerer() {
  if (hoererAn || typeof window === "undefined") return;
  hoererAn = true;
  // Schuetteln: ein Schuettler, wenn die Beschleunigung ueber die Schwelle geht (und vorher wieder darunter war)
  window.addEventListener("devicemotion", (ev) => {
    const a = ev.acceleration, g = ev.accelerationIncludingGravity;
    let s;
    if (a && a.x !== null && a.x !== undefined) s = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    else if (g && g.x !== null && g.x !== undefined) s = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81);
    else return;
    freigegeben = true;   // echte Messwerte kommen an - Freigabe-Knopf weg
    if (!oben && s > 14) { oben = true; const f = handyFeld(".mg-schuettel"); if (f) sende(f[0], "schuettel"); }
    else if (oben && s < 6) oben = false;
  });
  // Neigen: Grundhaltung beim ersten Messwert der Partie merken, dann Abweichung (20 Grad = voll), hoechstens alle 80 ms
  window.addEventListener("deviceorientation", (ev) => {
    if (ev.beta === null || ev.gamma === null || ev.beta === undefined) return;
    freigegeben = true;
    const f = handyFeld(".mg-kugel");
    if (!f) return;
    const wer = `${f[0]}|${f[1].dataset.mgRunde || ""}`;
    if (basis.wer !== wer) basis = { wer, beta: ev.beta };
    const jetzt = performance.now();
    if (jetzt - kippZuletzt < 80) return;
    kippZuletzt = jetzt;
    const gx = Math.round(begrenzt(ev.gamma / 20, -1, 1) * 100), gy = Math.round(begrenzt((ev.beta - basis.beta) / 20, -1, 1) * 100);
    sende(f[0], `kipp:${gx}:${gy}`);
  });
}
// iPhone: Bewegung und Neigung nur nach Freigabe, und die nur aus einem Antippen heraus
function sensorFreigeben() {
  const fragen = [];
  try {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") fragen.push(DeviceMotionEvent.requestPermission().catch(() => "denied"));
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") fragen.push(DeviceOrientationEvent.requestPermission().catch(() => "denied"));
  } catch (e) { return; }
  Promise.all(fragen).then((x) => { if (x.some((y) => y === "granted")) { freigegeben = true; sensorHoerer(); } }).catch(() => {});
}
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (ev) => {
    const el = ev.target && ev.target.closest ? ev.target.closest("[data-mg]") : null;
    if (!el) return;
    const box = el.closest("[data-mn]");
    if (!box || box.classList.contains("mn-pad")) return;
    ev.preventDefault();
    zug = { art: el.dataset.mg, key: box.dataset.mn, id: ev.pointerId, x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, t: performance.now(), r: el.getBoundingClientRect() };
  });
  // das Bild wird alle 50 ms neu gezeichnet - deshalb am Dokument mitlesen, nicht am Element
  document.addEventListener("pointermove", (ev) => { if (zug && ev.pointerId === zug.id) { zug.lx = ev.clientX; zug.ly = ev.clientY; } }, { passive: true });
  document.addEventListener("pointerup", (ev) => { if (zug && ev.pointerId === zug.id) zugEnde(ev.clientX, ev.clientY); });
  document.addEventListener("pointercancel", (ev) => { if (zug && ev.pointerId === zug.id) zugEnde(zug.lx, zug.ly); });
  document.addEventListener("click", (ev) => { if (ev.target && ev.target.closest && ev.target.closest('[data-mt="sensor"]')) sensorFreigeben(); });
  // Hoerer gleich anmelden: ohne Freigabe kommen am iPhone schlicht keine Werte, neuere Chrome-Fassungen kennen die
  // Freigabe-Frage auch, liefern aber sofort Werte (dann verschwindet der Knopf mit dem ersten Messwert)
  sensorHoerer();
}
