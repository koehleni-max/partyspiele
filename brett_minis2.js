// Partybrett: zweiter Satz Minispiele (Teil 4b, Nico 31.10.2026 abends: "alle Spiele mindestens doppelte Menge und
// Komplexitaet, so nah wie moeglich ans Original"). Gemeint ist die Art bekannter Party-Brettspiele: Ausweich-Arenen,
// Last-Man-Standing, Wettrennen, Zielen, Wischen, Neigen, Team-Absprache und Duelle mit eigener Mechanik. Alles selbst
// ausgedacht und gebaut, keine fremden Namen oder Inhalte.
//
// Gleiche Bauart wie brett_minis.js (dort steht der Ablauf am Geraet): jedes Spiel ist eine kleine Zustandsmaschine mit den
// Tasten a b x y hoch runter links rechts (Controller), am Handy Knoepfe mit data-mt, die dieselben Tasten senden. Neu hier:
//   wisch: true   -> am Handy darf man auf dem Bild wischen (ergibt hoch/runter/links/rechts)
//   neigen: true  -> am Handy steuert auch das Neigen ("neig:<Grad>"), die Knoepfe bleiben
//   neu(m, j)     -> j = Spielernummer (fuer Team-Ziele), kann fehlen
//   einheit(w, m, j), punkte(werte, j, teil, m), bot(m, i) -> m (mit Teams und allen Werten) und j/i koennen fehlen
// Gemeinsame Ablaeufe (Lava-Wellen, Strecke, Labyrinth ...) wuerfelt der Gastgeber einmal aus (daten -> m.d): alle spielen
// dieselbe Arena, also ist "wer haelt am laengsten durch" ein echtes Last-Man-Standing.

const r = (n) => Math.floor(Math.random() * n);
const mischen = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = r(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const komma = (x, n = 1) => x.toFixed(n).replace(".", ",");
const begrenzt = (x, a, b) => Math.max(a, Math.min(b, x));
const PFEIL = { hoch: "⬆️", rechts: "➡️", runter: "⬇️", links: "⬅️" };
const RICHTUNGEN = ["hoch", "rechts", "runter", "links"];
const RICHT = { hoch: [0, -1], runter: [0, 1], links: [-1, 0], rechts: [1, 0] };
const kreuz = () => [["hoch", "⬆️"], ["links", "⬅️"], ["rechts", "➡️"], ["runter", "⬇️"]];
const links = (t) => t === "links" || t === "x";
const rechts = (t) => t === "rechts" || t === "b";
// Dreieck 0..100..0 mit der Periode p (ms)
const pendel = (ms, p) => { const ph = (((ms % p) + p) % p) / p; return (ph < 0.5 ? ph * 2 : 2 - ph * 2) * 100; };
// Zeitschritt seit dem letzten Takt (Sekunden, gedeckelt)
function schritt(st, ms) { const dt = Math.min(0.12, Math.max(0, ms - (st.t || 0)) / 1000); st.t = ms; return dt; }
// Arena: Flaeche mit frei gesetzten Dingen (x/y in Prozent der Flaeche)
const arena = (kl, inhalt) => `<div class="mn-arena ${kl}">${inhalt}</div>`;
const ding = (x, y, inhalt, kl = "", stil = "") => `<i class="${kl}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;${stil}">${inhalt}</i>`;
const sek = (ms) => komma(Math.max(0, ms) / 1000);
const ueberlebt = (dauer) => (w) => (w >= dauer ? "bis zum Schluss! 🏆" : `${sek(w)} s durchgehalten`);
// Teams fuer Duelle und Team-Spiele: in "Team gegen Team" und "Einer gegen alle" die eigene Seite, sonst man selbst
function eigenesTeam(j, m) {
  if (m && Array.isArray(m.teams) && (m.modus === "team" || m.modus === "eins")) { const t = m.teams.find((x) => x.includes(j)); if (t) return t; }
  return [j];
}
function gegnerVon(j, teil, m) { const t = eigenesTeam(j, m); return teil.filter((k) => !t.includes(k)); }
const teilVon = (m) => (m && Array.isArray(m.teil) ? m.teil : m && m.werte ? Object.keys(m.werte).map(Number) : []);
const gueltig = (w) => w !== null && w !== undefined && !isNaN(Number(w));
// Wahl-Folgen (Elfmeter, Schnick-Schnack-Schnuck) als eine Zahl zur Basis 3
const zahl3 = (l) => l.reduce((a, z, k) => a + z * 3 ** k, 0);
const ziffern3 = (w, n) => Array.from({ length: n }, (_, k) => Math.floor(Number(w) / 3 ** k) % 3);

// ---------------------------------------------------------------- Hilfsrechnungen einzelner Spiele
function lavaZustand(m, ms) {
  const warn = new Set(), lava = new Set();
  for (const w of m.d.wellen) {
    if (ms >= w.at + 1100 && ms < w.at + 1900) w.f.forEach((k) => lava.add(k));
    else if (ms >= w.at && ms < w.at + 1100) w.f.forEach((k) => warn.add(k));
  }
  return { warn, lava };
}
function schollenWind(m, ms) {
  const s = ms / 1000, a = 0.35 + Math.min(0.75, s / 20);
  return a * (Math.sin(s * m.d.f1 * 2 + m.d.p1) * 0.65 + Math.sin(s * m.d.f2 * 2 + m.d.p2) * 0.35);
}
function apfelNeu(st, m) {
  for (let k = 0; k < m.d.aepfel.length; k++) { const p = m.d.aepfel[(st.ai + k) % m.d.aepfel.length]; if (!st.k.includes(p)) { st.ai += k; return p; } }
  return -1;
}
const schnittAktiv = (m, ms) => m.d.z.findIndex((x) => ms >= x.at && ms < x.at + 620);
function korbX(m, ms) { const s = ms / 1000; return 50 + Math.sin(s * (1.7 + s * 0.09) + m.d.ph) * 40; }
function bogenZiel(st, ms) { const s = ms / 1000; return [begrenzt(st.x + Math.sin(s * 2.1) * 6, 0, 100), begrenzt(st.y + Math.sin(s * 1.6 + 1) * 5, 0, 100)]; }
function asteroidPos(x, ms) { const u = (ms - x.at) / x.dauer; return [x.x + (50 - x.x) * u * 0.8, 4 + u * 84]; }
function drahtX(m, ms) { const s = ms / 1000; return begrenzt(50 + m.d.a.reduce((a, w, k) => a + Math.sin(s * w.f * (1 + s / 18) + w.p) * w.h / (k + 1), 0), 8, 92); }
function brueckenZiel(m, n) { const d = (m && m.d) || { basis: 3, plus: 0 }; return Math.max(n, d.basis * n + d.plus); }
// Elfmeter: je Gegner fuenf Schuesse gegen seine fuenf Paraden und umgekehrt (Folge: Schuss, Parade, Schuss, ...)
function elfBilanz(werte, j, teil, m) {
  const ich = ziffern3(werte[j], 10);
  let tore = 0, gegen = 0;
  gegnerVon(j, teil, m).forEach((g) => {
    if (!gueltig(werte[g])) return;
    const du = ziffern3(werte[g], 10);
    for (let k = 0; k < 5; k++) { if (ich[2 * k] !== du[2 * k + 1]) tore++; if (du[2 * k] !== ich[2 * k + 1]) gegen++; }
  });
  return { tore, gegen };
}
// Schnick-Schnack-Schnuck: 0 Stein, 1 Papier, 2 Schere - (a - b + 3) % 3 === 1 heisst a gewinnt
function sssBilanz(werte, j, teil, m) {
  const ich = ziffern3(werte[j], 5);
  let sieg = 0, nied = 0;
  gegnerVon(j, teil, m).forEach((g) => {
    if (!gueltig(werte[g])) return;
    const du = ziffern3(werte[g], 5);
    for (let k = 0; k < 5; k++) { const d = (ich[k] - du[k] + 3) % 3; if (d === 1) sieg++; else if (d === 2) nied++; }
  });
  return { sieg, nied };
}
const SSS = ["✊", "✋", "✌️"];

const DEFS2 = [
  // ---------------------------------------------------------------- Ausweichen / Last Man Standing
  {
    id: "lava", titel: "Lavaboden", emo: "🌋", typ: "Last Man Standing", gut: "hoch", dauer: 24000, wisch: true,
    regel: "Der Boden bricht ein! Felder blinken und werden dann zu Lava. Lauf mit den Pfeilen (oder wisch) auf sichere Felder – wer in der Lava steht, ist raus. Wer am längsten durchhält, gewinnt.",
    einheit: ueberlebt(24000),
    daten() {
      const wellen = []; let t = 1200, k = 0;
      while (t < 23500) { wellen.push({ at: t, f: mischen([...Array(16).keys()]).slice(0, Math.min(12, 5 + Math.floor(k / 2))) }); t += Math.max(1500, 2400 - k * 90); k++; }
      return { wellen };
    },
    neu: () => ({ x: 1, y: 2 }),
    taste(st, t) { const d = RICHT[t]; if (d) { st.x = begrenzt(st.x + d[0], 0, 3); st.y = begrenzt(st.y + d[1], 0, 3); } },
    tick(st, m, ms) { if (lavaZustand(m, ms).lava.has(st.y * 4 + st.x)) return { wert: Math.round(ms) }; },
    bild(st, m, ms) {
      const z = lavaZustand(m, ms);
      return `<div class="mn-gitter g4">${[...Array(16).keys()].map((k) => `<span class="${z.lava.has(k) ? "lava" : z.warn.has(k) ? "warn" : ""}">${k === st.y * 4 + st.x ? "🧍" : ""}</span>`).join("")}</div><small>${sek(ms)} s</small>`;
    },
    knoepfe: kreuz, raster: "kreuz",
    ende: () => 24000, bot: () => (Math.random() < 0.2 ? 24000 : 3000 + r(20000)),
  },
  {
    id: "meteor", titel: "Meteoritenschauer", emo: "☄️", typ: "Ausweichen", gut: "hoch", dauer: 22000, wisch: true,
    regel: "Meteoriten stürzen auf fünf Bahnen – ihr Schatten zeigt, wo sie einschlagen. Weich mit ⬅️ ➡️ aus. Ein Treffer und du bist raus!",
    einheit: ueberlebt(22000),
    daten() {
      const z = []; let t = 900, k = 0;
      while (t < 21000) { const b = r(5); z.push({ at: t, b }); if (k > 6 && r(3) === 0) z.push({ at: t, b: (b + 1 + r(4)) % 5 }); t += Math.max(380, 900 - k * 18); k++; }
      return { z };
    },
    neu: () => ({ b: 2 }),
    taste(st, t) { if (links(t)) st.b = Math.max(0, st.b - 1); if (rechts(t)) st.b = Math.min(4, st.b + 1); },
    tick(st, m, ms) { if (m.d.z.some((x) => x.b === st.b && ms >= x.at + 1000 && ms < x.at + 1200)) return { wert: Math.round(ms) }; },
    bild(st, m, ms) {
      const teile = m.d.z.filter((x) => ms >= x.at && ms < x.at + 1300).map((x) => {
        const u = (ms - x.at) / 1000, x0 = x.b * 20 + 10;
        return u < 1 ? ding(x0, 88, "", "schatten", `transform:translate(-50%,-50%) scale(${(0.4 + u * 0.8).toFixed(2)})`) + ding(x0, u * 80, "☄️") : ding(x0, 84, "💥");
      }).join("");
      return arena("nacht", teile + ding(st.b * 20 + 10, 86, "🏃")) + `<small>${sek(ms)} s</small>`;
    },
    knoepfe: () => [["links", "⬅️"], ["rechts", "➡️"]], raster: "2",
    ende: () => 22000, bot: () => (Math.random() < 0.15 ? 22000 : 2500 + r(19000)),
  },
  {
    id: "ducken", titel: "Springen & Ducken", emo: "🦇", typ: "Reaktion", gut: "hoch", dauer: 20000,
    regel: "Feuer kommt unten – SPRING (A oder ⬆️). Fledermäuse kommen oben – DUCK dich (B oder ⬇️). Ein Fehler und du bist raus.",
    einheit: (w) => `${w} ausgewichen`,
    daten() {
      const h = []; let t = 1600, k = 0;
      while (t < 19500) { h.push({ at: t, oben: r(2) === 1 }); t += Math.max(620, 1250 - k * 25) + r(350); k++; }
      return { h };
    },
    neu: () => ({ sprung: -9999, duck: -9999, idx: 0, ok: 0 }),
    taste(st, t, m, ms) {
      if ((t === "a" || t === "hoch") && ms - st.sprung > 600) st.sprung = ms;
      if ((t === "b" || t === "runter") && ms - st.duck > 600) st.duck = ms;
    },
    tick(st, m, ms) {
      while (st.idx < m.d.h.length && m.d.h[st.idx].at <= ms) {
        const x = m.d.h[st.idx], d = x.at - (x.oben ? st.duck : st.sprung);
        if (d < 0 || d > 600) return { wert: st.ok };
        st.ok++; st.idx++;
      }
      if (st.idx >= m.d.h.length) return { wert: st.ok };
    },
    bild(st, m, ms) {
      const luft = ms - st.sprung, hoch = luft >= 0 && luft < 600 ? Math.sin((luft / 600) * Math.PI) * 42 : 0;
      const duckt = ms - st.duck >= 0 && ms - st.duck < 600;
      const h = m.d.h.filter((x) => x.at > ms - 150 && x.at < ms + 1900).map((x) => ding(14 + ((x.at - ms) / 2000) * 84, x.oben ? 38 : 80, x.oben ? "🦇" : "🔥")).join("");
      return arena("abend", h + ding(14, 78 - hoch, duckt ? "🙇" : "🏃", `spiegel ${duckt ? "klein" : ""}`)) + `<small>${st.ok} ausgewichen</small>`;
    },
    knoepfe: () => [["a", "⤴️ Springen"], ["b", "⤵️ Ducken"]], raster: "2",
    ende: (st) => st.ok, bot: (m) => r(((m && m.d && m.d.h) || []).length + 1),
  },
  {
    id: "scholle", titel: "Wackelige Eisscholle", emo: "🐧", typ: "Neigen", gut: "hoch", dauer: 20000, neigen: true,
    regel: "Der Pinguin rutscht auf der kippelnden Scholle. Kipp sie mit ⬅️ ➡️ (oder neig das Handy) und halt ihn oben – fällt er ins Wasser, bist du raus.",
    einheit: ueberlebt(20000),
    daten: () => ({ f1: 0.6 + Math.random() * 0.5, f2: 0.25 + Math.random() * 0.3, p1: Math.random() * 6.28, p2: Math.random() * 6.28 }),
    neu: () => ({ p: 0, v: 0, kipp: 0, t: 0 }),
    taste(st, t) {
      if (links(t)) st.kipp = begrenzt(st.kipp - 0.35, -1, 1);
      if (rechts(t)) st.kipp = begrenzt(st.kipp + 0.35, -1, 1);
      if (typeof t === "string" && t.startsWith("neig:")) st.kipp = begrenzt(Number(t.slice(5)) / 30 || 0, -1, 1);
    },
    tick(st, m, ms) {
      const dt = schritt(st, ms);
      const kraft = schollenWind(m, ms) + st.kipp * 1.1;
      st.v = st.v * 0.96 + kraft * dt * 2.2; st.p += st.v * dt;
      st.kipp *= Math.pow(0.35, dt);   // losgelassen kippt die Scholle zurueck
      if (Math.abs(st.p) > 1) return { wert: Math.round(ms) };
    },
    bild(st, m, ms) {
      const w = (schollenWind(m, ms) + st.kipp * 1.1) * 14;
      return `<div class="mn-scholle"><div class="eis" style="transform:rotate(${w.toFixed(1)}deg)"><i style="left:${(50 + st.p * 46).toFixed(1)}%">🐧</i></div></div><small>${sek(ms)} s · ${st.kipp < -0.15 ? "⬅️" : st.kipp > 0.15 ? "➡️" : "⚖️"}</small>`;
    },
    knoepfe: () => [["links", "⬅️ kippen"], ["rechts", "kippen ➡️"]], raster: "2",
    ende: () => 20000, bot: () => (Math.random() < 0.25 ? 20000 : 3000 + r(17000)),
  },
  {
    id: "sumo", titel: "Sumo-Ring", emo: "🤼", typ: "Last Man Standing", gut: "hoch", dauer: 20000,
    regel: "Von allen Seiten wird geschubst! Kurz vorher zeigt ein Blitz, woher der Stoß kommt – drück genau DIESE Richtung und halt dagegen. Dreimal weggeschubst = raus aus dem Ring.",
    einheit: (w) => `${w} Stöße gehalten`,
    daten() {
      const s = []; let t = 1500, k = 0;
      while (t < 19000) { s.push({ at: t, von: RICHTUNGEN[r(4)] }); t += Math.max(820, 1500 - k * 40) + r(300); k++; }
      return { s };
    },
    neu: () => ({ gedrueckt: {}, idx: 0, rutsch: 0, gehalten: 0, zuletzt: null }),
    taste(st, t, m, ms) {
      if (!PFEIL[t]) return;
      const k = m.d.s.findIndex((x, i) => ms >= x.at - 700 && ms <= x.at + 120 && !(i in st.gedrueckt));
      if (k >= 0) st.gedrueckt[k] = t;
    },
    tick(st, m, ms) {
      while (st.idx < m.d.s.length && m.d.s[st.idx].at + 120 < ms) {
        const x = m.d.s[st.idx];
        if (st.gedrueckt[st.idx] === x.von) { st.gehalten++; st.zuletzt = true; } else { st.rutsch++; st.zuletzt = false; }
        st.idx++;
        if (st.rutsch >= 3) return { wert: st.gehalten };
      }
      if (st.idx >= m.d.s.length) return { wert: st.gehalten + 5 };
    },
    bild(st, m, ms) {
      const x = m.d.s.find((y, i) => ms >= y.at - 700 && ms <= y.at + 120 && i >= st.idx);
      const ort = { hoch: [50, 10], runter: [50, 90], links: [8, 50], rechts: [92, 50] };
      const warn = x ? ding(ort[x.von][0], ort[x.von][1], "💥", "warnblitz") : "";
      const weg = 50 + st.rutsch * 11;
      return arena("ring", `<b class="ringkreis"></b>${warn}${ding(50, Math.min(weg, 84), st.zuletzt === false ? "😵" : "🧍")}`) + `<small>${st.gehalten} gehalten · ${"❤️".repeat(3 - st.rutsch)}${x ? ` · von ${{ hoch: "OBEN", runter: "UNTEN", links: "LINKS", rechts: "RECHTS" }[x.von]}!` : ""}</small>`;
    },
    knoepfe: kreuz, raster: "kreuz",
    ende: (st) => st.gehalten + 5, bot: () => (Math.random() < 0.3 ? 15 + r(8) : r(12)),
  },
  // ---------------------------------------------------------------- Geschick
  {
    id: "schlange", titel: "Hungrige Schlange", emo: "🐍", typ: "Geschick", gut: "hoch", dauer: 25000, wisch: true,
    regel: "Steuere die Schlange mit den Pfeilen (oder wisch) zu den Äpfeln. Jeder Apfel macht sie länger und schneller. Wand oder eigener Schwanz – aus!",
    einheit: (w) => `${w} ${w === 1 ? "Apfel" : "Äpfel"}`,
    daten: () => ({ aepfel: Array.from({ length: 60 }, () => r(81)) }),
    neu: () => ({ k: [40, 39, 38], dir: "rechts", next: "rechts", naechst: 0, ai: 0, apfel: null, voll: 0 }),
    taste(st, t) { const geg = { hoch: "runter", runter: "hoch", links: "rechts", rechts: "links" }; if (RICHT[t] && geg[t] !== st.dir) st.next = t; },
    tick(st, m, ms) {
      if (st.apfel === null) st.apfel = apfelNeu(st, m);
      while (ms >= st.naechst) {
        st.naechst += Math.max(130, 280 - st.voll * 12);
        st.dir = st.next;
        const kopf = st.k[0], x = (kopf % 9) + RICHT[st.dir][0], y = Math.floor(kopf / 9) + RICHT[st.dir][1];
        if (x < 0 || x > 8 || y < 0 || y > 8) return { wert: st.voll };
        const neu = y * 9 + x, isst = neu === st.apfel;
        if (st.k.slice(0, isst ? st.k.length : st.k.length - 1).includes(neu)) return { wert: st.voll };
        st.k.unshift(neu);
        if (isst) { st.voll++; st.ai++; st.apfel = apfelNeu(st, m); } else st.k.pop();
      }
    },
    bild: (st) => `<div class="mn-gitter g9">${[...Array(81).keys()].map((c) => `<span class="${c === st.k[0] ? "kopf" : st.k.includes(c) ? "leib" : ""}">${c === st.apfel ? "🍎" : ""}</span>`).join("")}</div><small>${st.voll} Äpfel</small>`,
    knoepfe: kreuz, raster: "kreuz",
    ende: (st) => st.voll, bot: () => 1 + r(10),
  },
  {
    id: "geister", titel: "Geisterjagd", emo: "👻", typ: "Geschick", gut: "hoch", dauer: 18000,
    regel: "Geister tauchen aus neun Gräbern auf – tipp sie weg! 👻 +1, goldener Geist 🌟 +3, aber Kürbis 🎃 −2.",
    einheit: (w) => `${w} Punkte`,
    daten() {
      const z = []; let t = 500, k = 0;
      while (t < 16500) { const art = r(10) === 0 ? "gold" : r(4) === 0 ? "kuerbis" : "geist"; z.push({ at: t, loch: r(9), art, bis: t + Math.max(600, 1150 - k * 12) }); t += Math.max(260, 620 - k * 8) + r(200); k++; }
      return { z };
    },
    neu: () => ({ punkte: 0, weg: {}, cx: 1, cy: 1 }),
    taste(st, t, m, ms) {
      const d = RICHT[t];
      if (d) { st.cx = begrenzt(st.cx + d[0], 0, 2); st.cy = begrenzt(st.cy + d[1], 0, 2); return; }
      const g = /^g([0-8])$/.exec(t);
      const loch = g ? Number(g[1]) : t === "a" ? st.cy * 3 + st.cx : -1;
      if (loch < 0) return;
      const k = m.d.z.findIndex((x, i) => x.loch === loch && ms >= x.at && ms < x.bis && !st.weg[i]);
      if (k < 0) return;
      st.weg[k] = 1;
      const a = m.d.z[k].art;
      st.punkte += a === "gold" ? 3 : a === "kuerbis" ? -2 : 1;
    },
    tick(st, m, ms) { if (ms > m.d.z[m.d.z.length - 1].bis + 200) return { wert: st.punkte }; },
    bild(st, m, ms, ctrl) {
      if (!ctrl) return `<small>${st.punkte} Punkte</small>`;
      return `<div class="mn-gitter g3">${[...Array(9).keys()].map((l) => `<span class="${l === st.cy * 3 + st.cx ? "cursor" : ""}">${geistIn(st, m, ms, l)}</span>`).join("")}</div><small>${st.punkte} Punkte</small>`;
    },
    knoepfe: (st, m, ms, ctrl) => (ctrl ? [["hoch", "zielen"], ["a", "hauen"]] : [...Array(9).keys()].map((l) => [`g${l}`, geistIn(st, m, ms, l), "loch"])), raster: "9",
    ende: (st) => st.punkte, bot: () => 4 + r(12),
  },
  {
    id: "draht", titel: "Heißer Draht", emo: "⚡", typ: "Geschick", gut: "hoch", dauer: 18000, wisch: true,
    regel: "Der Draht schlängelt sich dir entgegen. Halte den Ring mit ⬅️ ➡️ darauf – nur die Zeit genau auf dem Draht zählt.",
    einheit: (w) => `${komma(w / 10)} s sauber`,
    daten: () => ({ a: [0, 1, 2].map(() => ({ f: 0.4 + Math.random() * 0.9, p: Math.random() * 6.28, h: 10 + Math.random() * 14 })) }),
    neu: () => ({ x: 50, v: 0, t: 0, gut: 0 }),
    taste(st, t) { if (links(t)) st.v = Math.max(-70, st.v - 20); if (rechts(t)) st.v = Math.min(70, st.v + 20); },
    tick(st, m, ms) {
      const dt = schritt(st, ms);
      st.x = begrenzt(st.x + st.v * dt, 2, 98); st.v *= Math.pow(0.2, dt);
      if (Math.abs(st.x - drahtX(m, ms)) < 7) st.gut += dt * 1000;
    },
    bild(st, m, ms) {
      const punkte = [...Array(13).keys()].map((k) => { const y = 6 + k * 6.5; return ding(drahtX(m, ms + (80 - y) * 22), y, "", "draht"); }).join("");
      const drauf = Math.abs(st.x - drahtX(m, ms)) < 7;
      return arena("dunkel", punkte + ding(st.x, 80, drauf ? "🟢" : "⭕", drauf ? "" : "zischt")) + `<small>${sek(st.gut)} s sauber</small>`;
    },
    knoepfe: () => [["links", "⬅️"], ["rechts", "➡️"]], raster: "2",
    ende: (st) => Math.round(st.gut / 100), bot: () => 60 + r(110),
  },
  // ---------------------------------------------------------------- Wettrennen
  {
    id: "kart", titel: "Seifenkisten-Rennen", emo: "🏎️", typ: "Wettrennen", gut: "tief", dauer: 28000, wisch: true,
    regel: "Wettrennen bergab! Wechsel mit ⬅️ ➡️ die Spur, weich den Steinen 🪨 aus und nimm Turbo-Felder ⚡ mit. A zündet einen deiner drei Turbos. Wer zuerst im Ziel ist, gewinnt.",
    einheit: (w) => (w < 30000 ? `im Ziel nach ${sek(w)} s` : `nicht im Ziel (noch ${w - 30000} m)`),
    daten() {
      const h = [];
      for (let d = 40; d < 560; d += 22 + r(18)) { const b = r(3); h.push({ d, b, art: r(5) === 0 ? "turbo" : "stein" }); if (r(4) === 0) h.push({ d, b: (b + 1 + r(2)) % 3, art: "stein" }); }
      return { h, laenge: 600 };
    },
    neu: () => ({ b: 1, d: 0, t: 0, turbo: 3, schub: 0, stopp: 0, idx: 0 }),
    taste(st, t, m, ms) {
      if (links(t)) st.b = Math.max(0, st.b - 1);
      if (rechts(t)) st.b = Math.min(2, st.b + 1);
      if ((t === "a" || t === "hoch") && st.turbo > 0 && ms > st.schub) { st.turbo--; st.schub = ms + 1500; }
    },
    tick(st, m, ms) {
      const dt = schritt(st, ms);
      st.d += (ms < st.stopp ? 10 : ms < st.schub ? 58 : 34) * dt;
      while (st.idx < m.d.h.length && m.d.h[st.idx].d <= st.d) {
        const x = m.d.h[st.idx];
        if (x.b === st.b) { if (x.art === "stein") { st.stopp = ms + 900; st.schub = 0; } else st.schub = Math.max(st.schub, ms) + 1200; }
        st.idx++;
      }
      if (st.d >= m.d.laenge) return { wert: Math.round(ms) };
    },
    bild(st, m, ms) {
      const y = (d) => 82 - (d - st.d) * 1.35;
      const sicht = m.d.h.filter((x) => x.d > st.d - 5 && x.d < st.d + 60).map((x) => ding(x.b * 33.3 + 16.6, y(x.d), x.art === "stein" ? "🪨" : "⚡")).join("");
      const ziel = m.d.laenge - st.d < 62 ? `<b class="zielband" style="top:${y(m.d.laenge).toFixed(1)}%"></b>` : "";
      const auto = ding(st.b * 33.3 + 16.6, 86, ms < st.stopp ? "💫" : "🏎️", ms < st.schub ? "turbo" : "", ms < st.stopp ? "" : "transform:translate(-50%,-50%) rotate(90deg)");
      return arena("strasse", ziel + sicht + auto) + `<small>${Math.round(Math.min(st.d, m.d.laenge))} / ${m.d.laenge} m · Turbo ${"⚡".repeat(st.turbo) || "–"}</small>`;
    },
    knoepfe: () => [["links", "⬅️"], ["a", "⚡ Turbo"], ["rechts", "➡️"]], raster: "3",
    ende: (st, m) => 30000 + Math.max(1, Math.round(m.d.laenge - st.d)),
    bot: () => (Math.random() < 0.8 ? 14000 + r(9000) : 30000 + 20 + r(150)),
  },
  {
    id: "slalom", titel: "Schlitten-Slalom", emo: "🛷", typ: "Wettrennen", gut: "hoch", dauer: 20000, wisch: true,
    regel: "Saus den Hang hinunter und fahr durch die Tore 🚩 🚩. Lenk mit ⬅️ ➡️ (oder wisch) – jedes verpasste Tor fehlt dir am Ende.",
    einheit: (w) => `${w} von 22 Toren`,
    daten() { const tore = []; let c = 50; for (let k = 0; k < 22; k++) { c = begrenzt(c + (Math.random() - 0.5) * 50, 18, 82); tore.push({ d: 30 + k * 25, c }); } return { tore }; },
    neu: () => ({ x: 50, v: 0, d: 0, t: 0, idx: 0, durch: 0, zuletzt: null }),
    taste(st, t) { if (links(t)) st.v = Math.max(-60, st.v - 22); if (rechts(t)) st.v = Math.min(60, st.v + 22); },
    tick(st, m, ms) {
      const dt = schritt(st, ms);
      st.d += 32 * dt; st.x = begrenzt(st.x + st.v * dt, 3, 97); st.v *= Math.pow(0.25, dt);
      while (st.idx < m.d.tore.length && m.d.tore[st.idx].d <= st.d) { st.zuletzt = Math.abs(st.x - m.d.tore[st.idx].c) <= 11; if (st.zuletzt) st.durch++; st.idx++; }
      if (st.idx >= m.d.tore.length) return { wert: st.durch };
    },
    bild(st, m, ms) {
      const tore = m.d.tore.filter((x) => x.d > st.d - 3 && x.d < st.d + 52).map((x) => { const y = 80 - (x.d - st.d) * 1.5; return ding(x.c - 11, y, "🚩", "klein") + ding(x.c + 11, y, "🚩", "klein"); }).join("");
      return arena("schnee", tore + ding(st.x, 82, "🛷")) + `<small>${st.durch} Tore${st.zuletzt === false ? " · verpasst!" : ""}</small>`;
    },
    knoepfe: () => [["links", "⬅️"], ["rechts", "➡️"]], raster: "2",
    ende: (st) => st.durch, bot: () => 8 + r(15),
  },
  {
    id: "hamster", titel: "Hamsterrad-Rennen", emo: "🐹", typ: "Wettrennen", gut: "hoch", dauer: 12000,
    regel: "Lauf mit ⬅️ ➡️ abwechselnd – aber das Rad wird heiß! Steht die Hitze im Roten, stolperst du kurz. Gleichmäßig schlägt hektisch.",
    einheit: (w) => `${w} m`,
    neu: () => ({ m: 0, hitze: 0, letzte: null, t: 0, stolper: 0 }),
    taste(st, t, m, ms) {
      const s = links(t) ? "l" : rechts(t) ? "r" : null;
      if (!s || s === st.letzte || ms < st.stolper) return;
      st.letzte = s; st.m += 1.5; st.hitze += 9;
      if (st.hitze >= 100) { st.stolper = ms + 1500; st.hitze = 60; }
    },
    tick(st, m, ms) { const dt = schritt(st, ms); st.hitze = Math.max(0, st.hitze - 38 * dt); },
    bild: (st, m, ms) => `<div class="mn-gross">${ms < st.stolper ? "😵‍💫" : "🐹"}</div><div class="mn-hitze"><i style="width:${Math.min(100, st.hitze).toFixed(0)}%"></i></div><small>${Math.round(st.m)} m · Hitze ${Math.round(st.hitze)} %${ms < st.stolper ? " · gestolpert!" : ""}</small>`,
    knoepfe: () => [["links", "⬅️ Links"], ["rechts", "Rechts ➡️"]], raster: "2",
    ende: (st) => Math.round(st.m), bot: () => 30 + r(40),
  },
  // ---------------------------------------------------------------- Wischen
  {
    id: "schnitt", titel: "Kürbis-Schnitt", emo: "🎃", typ: "Wischen", gut: "hoch", dauer: 19000, wisch: true,
    regel: "Kürbisse fliegen hoch – wisch in Pfeilrichtung (oder drück den Pfeil). Bei der Bombe NICHTS tun! Richtig +1, falsch −1, Bombe −3.",
    einheit: (w) => `${w} Punkte`,
    daten() {
      const z = []; let t = 600, k = 0;
      while (t < 18000) { z.push({ at: t, dir: RICHTUNGEN[r(4)], bombe: k > 2 && r(5) === 0 }); t += Math.max(650, 1150 - k * 20); k++; }
      return { z };
    },
    neu: () => ({ punkte: 0, done: {} }),
    taste(st, t, m, ms) {
      if (!PFEIL[t]) return;
      const k = schnittAktiv(m, ms);
      if (k < 0 || st.done[k]) return;
      st.done[k] = t;
      const x = m.d.z[k];
      st.punkte += x.bombe ? -3 : t === x.dir ? 1 : -1;
    },
    tick(st, m, ms) { if (ms > m.d.z[m.d.z.length - 1].at + 900) return { wert: st.punkte }; },
    bild(st, m, ms) {
      const k = schnittAktiv(m, ms);
      if (k < 0) return arena("nacht", "") + `<small>${st.punkte} Punkte</small>`;
      const x = m.d.z[k], u = (ms - x.at) / 620, y = 82 - Math.sin(u * Math.PI) * 52, zu = st.done[k];
      const was = zu ? (x.bombe ? "💥" : zu === x.dir ? "✨" : "❌") : x.bombe ? "💣" : "🎃";
      return arena("nacht", ding(50, y, was, "gross") + (x.bombe || zu ? "" : ding(50, Math.max(10, y - 24), PFEIL[x.dir]))) + `<small>${st.punkte} Punkte</small>`;
    },
    knoepfe: kreuz, raster: "kreuz",
    ende: (st) => st.punkte, bot: () => 3 + r(14),
  },
  {
    id: "korb", titel: "Korbwurf", emo: "🏀", typ: "Wischen", gut: "hoch", dauer: 16000, wisch: true,
    regel: "Der Korb fährt hin und her. Wirf mit A, ⬆️ oder Wisch nach oben, wenn er gleich über dir ist – der Ball braucht kurz bis oben.",
    einheit: (w) => `${w} ${w === 1 ? "Korb" : "Körbe"}`,
    daten: () => ({ ph: Math.random() * 6.28 }),
    neu: () => ({ koerbe: 0, wurf: null, zuletzt: null }),
    taste(st, t, m, ms) { if ((t === "a" || t === "hoch") && st.wurf === null) st.wurf = ms; },
    tick(st, m, ms) {
      if (st.wurf !== null && ms - st.wurf >= 650) { st.zuletzt = Math.abs(korbX(m, st.wurf + 650) - 50) < 9; if (st.zuletzt) st.koerbe++; st.wurf = null; }
    },
    bild(st, m, ms) {
      const ball = ding(50, st.wurf !== null ? 86 - ((ms - st.wurf) / 650) * 72 : 86, "🏀");
      const marke = st.zuletzt !== null && st.wurf === null ? ding(82, 52, st.zuletzt ? "✅" : "❌", "klein") : "";
      return arena("halle", ding(korbX(m, ms), 12, "🧺") + ball + marke) + `<small>${st.koerbe} Körbe</small>`;
    },
    knoepfe: () => [["a", "🏀 Werfen"]], raster: "1",
    ende: (st) => st.koerbe, bot: () => 2 + r(9),
  },
  // ---------------------------------------------------------------- Zielen
  {
    id: "kegeln", titel: "Kegelbahn", emo: "🎳", typ: "Zielen", gut: "hoch", dauer: 22000,
    regel: "Zwei Würfe auf neun Kegel. Erst ZIELEN (A, wenn der Pfeil mittig steht), dann KRAFT (A, wenn der Balken voll ist). Alle neun im ersten Wurf = Kranz mit 5 Bonuspunkten.",
    einheit: (w) => `${w} Punkte`,
    neu: () => ({ wurf: 0, phase: "ziel", ziel: 50, t0: 0, stehen: 9, punkte: 0, zuletzt: null }),
    taste(st, t, m, ms) {
      if (t !== "a") return;
      if (st.phase === "ziel") { st.ziel = pendel(ms - st.t0, 1300); st.phase = "kraft"; st.t0 = ms; return; }
      const kraft = pendel(ms - st.t0, 800);
      const gen = Math.max(0, 1 - Math.abs(st.ziel - 50) / 45), k = Math.min(1, kraft / 90);
      const um = begrenzt(Math.round(st.stehen * Math.min(1, Math.pow(gen, 1.4) * (0.55 + 0.5 * k) + (Math.random() - 0.5) * 0.12)), 0, st.stehen);
      st.stehen -= um; st.punkte += um; st.zuletzt = um; st.wurf++;
      if (st.wurf === 1 && st.stehen === 0) { st.punkte += 5; return { wert: st.punkte }; }
      if (st.wurf >= 2) return { wert: st.punkte };
      st.phase = "ziel"; st.t0 = ms;
    },
    bild(st, m, ms) {
      const reihen = [[0], [1, 2], [3, 4, 5], [6, 7], [8]];
      const kegel = `<div class="mn-kegel">${reihen.map((rz) => `<div>${rz.map((k) => `<span class="${k >= st.stehen ? "weg" : ""}">●</span>`).join("")}</div>`).join("")}</div>`;
      const balken = st.phase === "ziel"
        ? `<div class="mn-balken"><i class="mn-zone"></i><b class="mn-zeiger" style="left:${pendel(ms - st.t0, 1300).toFixed(1)}%"></b></div><small>Wurf ${st.wurf + 1}/2 · ZIELEN</small>`
        : `<div class="mn-hitze kraft"><i style="width:${pendel(ms - st.t0, 800).toFixed(0)}%"></i></div><small>Wurf ${st.wurf + 1}/2 · KRAFT</small>`;
      return kegel + balken + `<small>${st.punkte} Punkte${st.zuletzt !== null ? ` · zuletzt ${st.zuletzt}` : ""}</small>`;
    },
    knoepfe: (st) => [["a", st.phase === "ziel" ? "🎯 Zielen" : "💪 Werfen"]], raster: "1",
    ende: (st) => st.punkte, bot: () => r(16),
  },
  {
    id: "bogen", titel: "Bogenschießen im Wind", emo: "🏹", typ: "Zielen", gut: "hoch", dauer: 21000,
    regel: "Das Fadenkreuz schwankt und der Wind schiebt es weg. Halt es mit den Pfeilen auf der Mitte und schieß mit A. Drei Pfeile, Mitte = 10 Punkte.",
    einheit: (w) => `${w} Ringe`,
    daten: () => ({ wind: [0, 1, 2].map(() => ({ x: (Math.random() - 0.5) * 16, y: (Math.random() - 0.5) * 10 })) }),
    neu: () => ({ x: 50, y: 50, t: 0, pfeil: 0, summe: 0, treffer: [] }),
    taste(st, t, m, ms) {
      const d = RICHT[t];
      if (d) { st.x = begrenzt(st.x + d[0] * 5, 0, 100); st.y = begrenzt(st.y + d[1] * 5, 0, 100); return; }
      if (t !== "a") return;
      const [ax, ay] = bogenZiel(st, ms), p = Math.max(0, 10 - Math.floor(Math.hypot(ax - 50, ay - 50) / 4));
      st.treffer.push([ax, ay, p]); st.summe += p; st.pfeil++;
      if (st.pfeil >= 3) return { wert: st.summe };
    },
    tick(st, m, ms) { const dt = schritt(st, ms), w = m.d.wind[Math.min(2, st.pfeil)]; st.x = begrenzt(st.x + w.x * dt, 0, 100); st.y = begrenzt(st.y + w.y * dt, 0, 100); },
    bild(st, m, ms) {
      const [ax, ay] = bogenZiel(st, ms), w = m.d.wind[Math.min(2, st.pfeil)];
      return `<div class="mn-scheibe">${st.treffer.map(([x, y]) => ding(x, y, "📍", "klein")).join("")}${ding(ax, ay, "", "fadenkreuz")}</div><small>Pfeil ${Math.min(3, st.pfeil + 1)}/3 · ${st.summe} Ringe · Wind ${w.x < 0 ? "⬅️" : "➡️"}</small>`;
    },
    knoepfe: () => [["hoch", "⬆️"], ["links", "⬅️"], ["a", "🏹 Schuss"], ["rechts", "➡️"], ["runter", "⬇️"]], raster: "kreuzmitte",
    ende: (st) => st.summe, bot: () => 3 + r(25),
  },
  {
    id: "kran", titel: "Greifautomat", emo: "🕹️", typ: "Zielen", gut: "hoch", dauer: 22000,
    regel: "Der Greifer fährt hin und her – und wird schneller. Drück A, damit er genau über einem Preis hinunterfährt. Drei Versuche, große Preise sind schmal.",
    einheit: (w) => `${w} Punkte`,
    daten: () => ({ preise: mischen([[10, "🧸", 4], [6, "🎁", 6], [4, "🍬", 8], [3, "🎈", 8], [2, "🪀", 9], [0, "🧦", 9]]).map(([w, e, b], k) => ({ w, e, b, x: 9 + k * 16.4 })) }),
    neu: () => ({ versuch: 0, t0: 0, summe: 0, weg: [], greif: null, zuletzt: null }),
    taste(st, t, m, ms) { if (t !== "a" || st.greif) return; st.greif = { x: 5 + pendel(ms - st.t0, 2600 - st.versuch * 400) * 0.9, at: ms }; },
    tick(st, m, ms) {
      if (!st.greif || ms - st.greif.at <= 900) return;
      const p = m.d.preise.findIndex((q, k) => !st.weg.includes(k) && Math.abs(q.x - st.greif.x) <= q.b / 2 + 1);
      if (p >= 0) { st.weg.push(p); st.summe += m.d.preise[p].w; st.zuletzt = m.d.preise[p].e; } else st.zuletzt = "✋";
      st.greif = null; st.versuch++; st.t0 = ms;
      if (st.versuch >= 3) return { wert: st.summe };
    },
    bild(st, m, ms) {
      const x = st.greif ? st.greif.x : 5 + pendel(ms - st.t0, 2600 - st.versuch * 400) * 0.9;
      const y = st.greif ? 10 + Math.min(1, (ms - st.greif.at) / 700) * 58 : 10;
      const preise = m.d.preise.map((q, k) => (st.weg.includes(k) ? "" : ding(q.x, 82, q.e) + ding(q.x, 95, String(q.w), "wert"))).join("");
      return arena("automat", preise + `<b class="seil" style="left:${x.toFixed(1)}%;height:${y.toFixed(1)}%"></b>` + ding(x, y + 4, "🪝")) + `<small>Versuch ${Math.min(3, st.versuch + 1)}/3 · ${st.summe} Punkte${st.zuletzt ? ` · ${st.zuletzt}` : ""}</small>`;
    },
    knoepfe: () => [["a", "⬇️ Greifen"]], raster: "1",
    ende: (st) => st.summe, bot: () => r(18),
  },
  {
    id: "fallschirm", titel: "Fallschirm-Landung", emo: "🪂", typ: "Zielen", gut: "hoch", dauer: 19000, wisch: true,
    regel: "Drei Sprünge. Der Wind treibt dich ab – lenk mit ⬅️ ➡️ und lande möglichst genau auf der Zielscheibe 🎯. Genau drauf = 100 Punkte.",
    einheit: (w) => `${w} Punkte`,
    daten: () => ({ ziel: [0, 1, 2].map(() => 20 + r(61)), wind: [0, 1, 2].map(() => ({ a: 6 + Math.random() * 10, f: 0.8 + Math.random() * 1.4, p: Math.random() * 6.28 })) }),
    neu: () => ({ sprung: 0, t0: 0, x: 50, v: 0, t: 0, summe: 0, zuletzt: null }),
    taste(st, t) { if (links(t)) st.v = Math.max(-30, st.v - 9); if (rechts(t)) st.v = Math.min(30, st.v + 9); },
    tick(st, m, ms) {
      const dt = schritt(st, ms), w = m.d.wind[Math.min(2, st.sprung)], s = (ms - st.t0) / 1000;
      st.x = begrenzt(st.x + (st.v + Math.sin(s * w.f + w.p) * w.a) * dt, 0, 100); st.v *= Math.pow(0.5, dt);
      if (ms - st.t0 >= 5000) {
        const p = Math.max(0, Math.round(100 - Math.abs(st.x - m.d.ziel[st.sprung]) * 4));
        st.summe += p; st.zuletzt = p; st.sprung++; st.t0 = ms; st.x = 50; st.v = 0;
        if (st.sprung >= 3) return { wert: st.summe };
      }
    },
    bild(st, m, ms) {
      const u = Math.min(1, Math.max(0, ms - st.t0) / 5000), z = m.d.ziel[Math.min(2, st.sprung)];
      return arena("himmel", ding(z, 92, "🎯") + ding(st.x, 8 + u * 78, "🪂")) + `<small>Sprung ${Math.min(3, st.sprung + 1)}/3 · ${st.summe} Punkte${st.zuletzt !== null ? ` · zuletzt ${st.zuletzt}` : ""}</small>`;
    },
    knoepfe: () => [["links", "⬅️"], ["rechts", "➡️"]], raster: "2",
    ende: (st) => st.summe, bot: () => 60 + r(200),
  },
  {
    id: "kanone", titel: "Kanonen-Golf", emo: "⛳", typ: "Zielen", gut: "hoch", dauer: 24000,
    regel: "Drei Schüsse auf die Fahne. Erst den WINKEL mit A festlegen, dann die KRAFT mit A. Achtung Wind! Je näher an der Fahne, desto mehr Punkte.",
    einheit: (w) => `${w} Punkte`,
    daten: () => ({ fahne: [0, 1, 2].map(() => 45 + r(45)), wind: [0, 1, 2].map(() => Math.round((Math.random() - 0.5) * 12)) }),
    neu: () => ({ schuss: 0, phase: "winkel", t0: 0, winkel: 45, summe: 0, flug: null, zuletzt: null }),
    taste(st, t, m, ms) {
      if (t !== "a" || st.flug) return;
      if (st.phase === "winkel") { st.winkel = 15 + pendel(ms - st.t0, 1500) * 0.6; st.phase = "kraft"; st.t0 = ms; return; }
      const kraft = 0.35 + (pendel(ms - st.t0, 1000) / 100) * 0.75;
      const weite = 100 * kraft * kraft * Math.sin((2 * st.winkel * Math.PI) / 180) + m.d.wind[st.schuss] * kraft;
      st.flug = { at: ms, weite, winkel: st.winkel, p: Math.max(0, Math.round(50 - Math.abs(weite - m.d.fahne[st.schuss]) * 1.5)) };
    },
    tick(st, m, ms) {
      if (!st.flug || ms - st.flug.at < 1100) return;
      st.summe += st.flug.p; st.zuletzt = st.flug.p; st.flug = null; st.schuss++; st.phase = "winkel"; st.t0 = ms;
      if (st.schuss >= 3) return { wert: st.summe };
    },
    bild(st, m, ms) {
      const k = Math.min(2, st.schuss), fx = 6 + m.d.fahne[k] * 0.88;
      let ball = "";
      if (st.flug) {
        const u = Math.min(1, (ms - st.flug.at) / 1100), w = Math.max(-5, st.flug.weite), h = Math.min(62, Math.abs(w) * Math.tan((st.flug.winkel * Math.PI) / 180) * 0.45);
        ball = ding(begrenzt(6 + w * 0.88 * u, 2, 98), 84 - 4 * h * u * (1 - u), "⚫", "klein");
      }
      const anzeige = st.phase === "winkel" && !st.flug
        ? `<small>Winkel: ${Math.round(15 + pendel(ms - st.t0, 1500) * 0.6)}°</small>`
        : `<div class="mn-hitze kraft"><i style="width:${st.flug ? 0 : pendel(ms - st.t0, 1000).toFixed(0)}%"></i></div>`;
      return arena("wiese", ding(fx, 80, "⛳") + ding(6, 84, "💣", "klein") + ball) + anzeige
        + `<small>Schuss ${k + 1}/3 · Wind ${m.d.wind[k] < 0 ? "⬅️" : "➡️"} ${Math.abs(m.d.wind[k])} · ${st.summe} Punkte${st.zuletzt !== null ? ` · zuletzt ${st.zuletzt}` : ""}</small>`;
    },
    knoepfe: (st) => [["a", st.phase === "winkel" ? "📐 Winkel" : "💥 Feuer"]], raster: "1",
    ende: (st) => st.summe, bot: () => 20 + r(110),
  },
  {
    id: "abwehr", titel: "Weltraum-Abwehr", emo: "🛸", typ: "Zielen", gut: "hoch", dauer: 20000,
    regel: "Asteroiden stürzen auf deine Station. Dreh die Kanone mit ⬅️ ➡️ und schieß mit A. Drei Einschläge auf die Station und es ist vorbei.",
    einheit: (w) => `${w} abgeschossen`,
    daten() {
      const a = []; let t = 700, k = 0;
      while (t < 17500) { a.push({ at: t, x: 8 + r(85), dauer: Math.max(2200, 4200 - k * 70) }); t += Math.max(420, 1100 - k * 20); k++; }
      return { a };
    },
    neu: () => ({ w: 0, weg: {}, treffer: 0, schaden: 0, schuss: null }),
    taste(st, t, m, ms) {
      if (links(t)) st.w = Math.max(-75, st.w - 12);
      if (rechts(t)) st.w = Math.min(75, st.w + 12);
      if ((t === "a" || t === "hoch") && (!st.schuss || ms - st.schuss.at > 250)) {
        st.schuss = { at: ms, w: st.w };
        const rad = (st.w * Math.PI) / 180, dx = Math.sin(rad), dy = -Math.cos(rad);
        let best = -1, bt = 1e9;
        m.d.a.forEach((x, i) => {
          if (st.weg[i] || ms < x.at || ms > x.at + x.dauer) return;
          const p = asteroidPos(x, ms), vx = p[0] - 50, vy = (p[1] - 92) * 0.8, tt = vx * dx + vy * dy;
          if (tt > 0 && Math.abs(vx * dy - vy * dx) < 7 && tt < bt) { bt = tt; best = i; }
        });
        if (best >= 0) { st.weg[best] = 1; st.treffer++; }
      }
    },
    tick(st, m, ms) {
      m.d.a.forEach((x, i) => { if (!st.weg[i] && ms >= x.at + x.dauer) { st.weg[i] = 2; st.schaden++; } });
      const letzt = m.d.a[m.d.a.length - 1];
      if (st.schaden >= 3 || ms > letzt.at + letzt.dauer + 100) return { wert: st.treffer };
    },
    bild(st, m, ms) {
      const steine = m.d.a.map((x, i) => (st.weg[i] || ms < x.at || ms > x.at + x.dauer ? "" : ding(...asteroidPos(x, ms), "🌑"))).join("");
      const strahl = st.schuss && ms - st.schuss.at < 140 ? `<b class="strahl" style="transform:rotate(${st.schuss.w}deg)"></b>` : "";
      return arena("weltall", steine + strahl + `<b class="rohr" style="transform:rotate(${st.w}deg)"></b>` + ding(50, 92, "🛰️")) + `<small>${st.treffer} abgeschossen · Station ${"🛡️".repeat(Math.max(0, 3 - st.schaden))}</small>`;
    },
    knoepfe: () => [["links", "↶ Drehen"], ["a", "💥 Feuer"], ["rechts", "Drehen ↷"]], raster: "3",
    ende: (st) => st.treffer, bot: () => 3 + r(14),
  },
  // ---------------------------------------------------------------- Rhythmus / Gedaechtnis / Orientierung
  {
    id: "takt", titel: "Taktgefühl", emo: "🎵", typ: "Rhythmus", gut: "hoch", dauer: 20000,
    regel: "Noten fallen auf drei Bahnen. Drück ⬅️, 🎵 oder ➡️ genau, wenn die Note die Linie trifft. Perfekt +3, gut +1, daneben −1.",
    einheit: (w) => `${w} Punkte`,
    daten() {
      const n = []; let t = 1500, k = 0;
      while (t < 18500) { n.push({ at: t, b: r(3) }); if (k > 8 && r(5) === 0) n.push({ at: t, b: (n[n.length - 1].b + 1 + r(2)) % 3 }); t += [500, 500, 750, 300][r(4)]; k++; }
      return { n };
    },
    neu: () => ({ punkte: 0, weg: {}, last: null }),
    taste(st, t, m, ms) {
      const b = { links: 0, x: 0, a: 1, hoch: 1, runter: 1, rechts: 2, b: 2 }[t];
      if (b === undefined) return;
      let best = -1, bd = 1e9;
      m.d.n.forEach((x, i) => { if (x.b === b && !st.weg[i]) { const d = Math.abs(x.at - ms); if (d < bd) { bd = d; best = i; } } });
      if (best >= 0 && bd <= 200) { st.weg[best] = 1; const p = bd <= 90 ? 3 : 1; st.punkte += p; st.last = { ms, p }; }
      else { st.punkte -= 1; st.last = { ms, p: -1 }; }
    },
    tick(st, m, ms) { if (ms > m.d.n[m.d.n.length - 1].at + 600) return { wert: st.punkte }; },
    bild(st, m, ms) {
      const noten = m.d.n.map((x, i) => (st.weg[i] || x.at - ms > 1600 || ms - x.at > 220 ? "" : ding(x.b * 33.3 + 16.6, 84 - ((x.at - ms) / 1600) * 80, ["🟣", "🟡", "🔵"][x.b]))).join("");
      const fb = st.last && ms - st.last.ms < 400 ? ding(50, 50, st.last.p === 3 ? "PERFEKT" : st.last.p === 1 ? "gut" : "daneben", "wort") : "";
      return arena("buehne", `<b class="linie"></b>${noten}${fb}`) + `<small>${st.punkte} Punkte</small>`;
    },
    knoepfe: () => [["links", "⬅️"], ["a", "🎵"], ["rechts", "➡️"]], raster: "3",
    ende: (st) => st.punkte, bot: () => 10 + r(40),
  },
  {
    id: "minen", titel: "Minenpfad", emo: "🗺️", typ: "Gedächtnis", gut: "hoch", dauer: 24000,
    regel: "Vier Sekunden lang leuchtet der sichere Weg. Dann ist er unsichtbar: lauf ihn mit den Pfeilen nach oben ab und oben hinaus. Ein falscher Schritt – BUMM.",
    einheit: (w) => (w >= 60 ? `durch! +${w - 60} Zeitbonus` : `bis Reihe ${w / 10 + 1} von 6`),
    daten() {
      let c = r(5); const start = c, sicher = [];
      for (let y = 0; y < 6; y++) { const z = y === 5 ? c : begrenzt(c + r(5) - 2, 0, 4); for (let x = Math.min(c, z); x <= Math.max(c, z); x++) sicher.push(y * 5 + x); c = z; }
      return { sicher, start };
    },
    neu: (m) => ({ x: m && m.d ? m.d.start : 2, y: 0, best: 0, tot: false }),
    taste(st, t, m, ms) {
      if (ms < 4000 || st.tot) return;
      const d = { hoch: [0, 1], links: [-1, 0], rechts: [1, 0], runter: [0, -1] }[t];
      if (!d) return;
      const x = begrenzt(st.x + d[0], 0, 4), y = st.y + d[1];
      if (y < 0) return;
      if (y > 5) return { wert: 60 + Math.max(0, Math.round((24000 - ms) / 1000)) };
      st.x = x; st.y = y;
      if (!m.d.sicher.includes(y * 5 + x)) { st.tot = true; return { wert: st.best * 10 }; }
      st.best = Math.max(st.best, y);
    },
    bild(st, m, ms) {
      const zeig = ms < 4000 || st.tot;
      const zellen = [];
      for (let y = 5; y >= 0; y--) for (let x = 0; x < 5; x++) {
        const c = y * 5 + x, ich = st.x === x && st.y === y;
        zellen.push(`<span class="${zeig && m.d.sicher.includes(c) ? "sicher" : ""}">${ich ? (st.tot ? "💥" : "🧍") : ""}</span>`);
      }
      return `<div class="mn-gitter g5">${zellen.join("")}</div><small>${ms < 4000 ? `Merken! Noch ${Math.ceil((4000 - ms) / 1000)} s` : `Reihe ${st.y + 1}/6 – oben hinaus!`}</small>`;
    },
    knoepfe: (st, m, ms) => (ms < 4000 ? [] : kreuz()), raster: "kreuz",
    ende: (st) => st.best * 10, bot: () => (Math.random() < 0.4 ? 60 + r(15) : r(6) * 10),
  },
  {
    id: "memory", titel: "Paare finden", emo: "🧩", typ: "Gedächtnis", gut: "hoch", dauer: 30000,
    regel: "Zwölf verdeckte Karten, sechs Paare. Deck je zwei auf – gleiche bleiben offen. Wer alle Paare schnell findet, bekommt Zeitbonus.",
    einheit: (w) => (w >= 600 ? `alle Paare, ${w - 600} s übrig` : `${Math.floor(w / 100)} Paare`),
    daten: () => ({ k: mischen(["🎃", "👻", "🦇", "🕷️", "🍬", "🌙"].flatMap((x) => [x, x])) }),
    neu: () => ({ offen: [], paare: [], sperre: 0, cur: 0 }),
    taste(st, t, m, ms) {
      if (RICHT[t]) { const x = (st.cur % 4) + RICHT[t][0], y = Math.floor(st.cur / 4) + RICHT[t][1]; if (x >= 0 && x < 4 && y >= 0 && y < 3) st.cur = y * 4 + x; return; }
      const c = /^c(\d+)$/.exec(t);
      const k = c ? Number(c[1]) : t === "a" ? st.cur : -1;
      if (k < 0 || k > 11 || ms < st.sperre) return;
      if (st.offen.length === 2) st.offen = [];
      if (st.paare.includes(k) || st.offen.includes(k)) return;
      st.offen.push(k);
      if (st.offen.length < 2) return;
      const [a, b] = st.offen;
      if (m.d.k[a] === m.d.k[b]) { st.paare.push(a, b); st.offen = []; if (st.paare.length === 12) return { wert: 600 + Math.max(0, Math.round((30000 - ms) / 1000)) }; }
      else st.sperre = ms + 700;
    },
    tick(st, m, ms) { if (st.offen.length === 2 && ms >= st.sperre) st.offen = []; },
    bild(st, m, ms, ctrl) {
      const n = st.paare.length / 2;
      if (!ctrl) return `<small>${n} von 6 Paaren</small>`;
      return `<div class="mn-gitter g4k">${m.d.k.map((x, i) => `<span class="${i === st.cur ? "cursor" : ""}">${st.paare.includes(i) || st.offen.includes(i) ? x : "❓"}</span>`).join("")}</div><small>${n} von 6 Paaren</small>`;
    },
    knoepfe: (st, m, ms, ctrl) => (ctrl ? [["hoch", "Karte wählen"], ["a", "aufdecken"]]
      : m.d.k.map((x, i) => [`c${i}`, st.paare.includes(i) || st.offen.includes(i) ? x : "❓", st.paare.includes(i) ? "mkarte paar" : "mkarte"])), raster: "4",
    ende: (st) => (st.paare.length / 2) * 100, bot: () => (Math.random() < 0.5 ? 600 + r(15) : (2 + r(4)) * 100),
  },
  {
    id: "labyrinth", titel: "Dunkles Labyrinth", emo: "🔦", typ: "Orientierung", gut: "tief", dauer: 30000, wisch: true,
    regel: "Alle stecken im selben Labyrinth – aber die Taschenlampe leuchtet nur ein Feld weit. Finde mit den Pfeilen (oder Wischen) den Ausgang 🚪. Schnellster gewinnt.",
    einheit: (w) => (w < 60000 ? `raus nach ${sek(w)} s` : "nicht rausgefunden"),
    daten() {
      const N = 7, offen = Array(N * N).fill(0), besucht = new Set([0]), stapel = [0];
      const SEITE = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];   // dx, dy, eigene Tuer, Tuer gegenueber
      while (stapel.length) {
        const c = stapel[stapel.length - 1], x = c % N, y = (c - x) / N;
        const nb = SEITE.map(([dx, dy, b, g]) => [x + dx, y + dy, b, g]).filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N && !besucht.has(b * N + a));
        if (!nb.length) { stapel.pop(); continue; }
        const [nx, ny, b, gb] = nb[r(nb.length)], n = ny * N + nx;
        offen[c] |= b; offen[n] |= gb; besucht.add(n); stapel.push(n);
      }
      return { offen };
    },
    neu: () => ({ p: 0, spur: [0] }),
    taste(st, t, m, ms) {
      const bit = { hoch: 1, rechts: 2, runter: 4, links: 8 }[t];
      if (!bit || !(m.d.offen[st.p] & bit)) return;
      st.p += { hoch: -7, rechts: 1, runter: 7, links: -1 }[t];
      if (!st.spur.includes(st.p)) st.spur.push(st.p);
      if (st.p === 48) return { wert: Math.max(1, Math.round(ms)) };
    },
    bild(st, m) {
      const px = st.p % 7, py = (st.p - px) / 7;
      return `<div class="mn-labyr">${m.d.offen.map((o, c) => {
        const x = c % 7, y = (c - x) / 7, nah = Math.max(Math.abs(x - px), Math.abs(y - py)) <= 1, gesehen = nah || st.spur.includes(c);
        const rand = gesehen ? `border-width:${o & 1 ? 0 : 3}px ${o & 2 ? 0 : 3}px ${o & 4 ? 0 : 3}px ${o & 8 ? 0 : 3}px` : "";
        return `<span class="${nah ? "hell" : gesehen ? "spur" : "dunkel"}" style="${rand}">${c === st.p ? "🧍" : c === 48 ? "🚪" : ""}</span>`;
      }).join("")}</div>`;
    },
    knoepfe: kreuz, raster: "kreuz",
    ende: (st) => 60000 + (6 - (st.p % 7)) + (6 - Math.floor(st.p / 7)), bot: () => (Math.random() < 0.75 ? 8000 + r(20000) : 60000 + r(8)),
  },
  // ---------------------------------------------------------------- Duelle mit eigener Mechanik (gegen jeden Gegner gleichzeitig)
  {
    id: "elfmeter", titel: "Elfmeter-Duell", emo: "⚽", typ: "Duell", gut: "hoch", dauer: 22000,
    regel: "Fünf Schüsse, fünf Paraden – gegen alle Gegner gleichzeitig. Wähl heimlich: wohin schießt du, wohin springst du? Springt der Torwart nicht in deine Ecke, ist er drin.",
    einheit(w, m, j) {
      if (m && m.werte && j !== undefined && gueltig(w)) { const b = elfBilanz(m.werte, j, teilVon(m), m); return `${b.tore}:${b.gegen} Tore`; }
      return "alle Schüsse gewählt";
    },
    neu: () => ({ wahl: [] }),
    taste(st, t) {
      const z = { links: 0, x: 0, hoch: 1, a: 1, rechts: 2, b: 2 }[t];
      if (z === undefined) return;
      st.wahl.push(z);
      if (st.wahl.length >= 10) return { wert: zahl3(st.wahl) };
    },
    bild(st) {
      const k = st.wahl.length, schuss = k % 2 === 0, nr = Math.floor(k / 2) + 1;
      const zuletzt = k ? ["⬅️", "⬆️", "➡️"][st.wahl[k - 1]] : "";
      return `<div class="mn-tor"><span>🥅</span>${schuss ? "⚽" : "🧤"}</div><div class="mn-gross klein">${schuss ? `Schuss ${nr}/5` : `Parade ${nr}/5`}</div><small>${schuss ? "Wohin schießt du?" : "Wohin springst du?"}${zuletzt ? ` · zuletzt ${zuletzt}` : ""}</small>`;
    },
    knoepfe: () => [["links", "⬅️ Links"], ["hoch", "⬆️ Mitte"], ["rechts", "Rechts ➡️"]], raster: "3",
    ende: (st) => { const w = [...st.wahl]; while (w.length < 10) w.push(r(3)); return zahl3(w); },
    bot: () => zahl3(Array.from({ length: 10 }, () => r(3))),
    punkte(werte, j, teil, m) { if (!gueltig(werte[j])) return -1e9; const b = elfBilanz(werte, j, teil, m); return (b.tore - b.gegen) * 1000 + b.tore; },
  },
  {
    id: "sss", titel: "Schnick-Schnack-Schnuck", emo: "✊", typ: "Duell", gut: "hoch", dauer: 16000,
    regel: "Fünf Runden gegen jeden Gegner gleichzeitig: wähl heimlich fünfmal Stein, Papier oder Schere. Jeder Sieg zählt +1, jede Niederlage −1.",
    einheit(w, m, j) {
      if (m && m.werte && j !== undefined && gueltig(w)) { const b = sssBilanz(m.werte, j, teilVon(m), m); return `${ziffern3(w, 5).map((z) => SSS[z]).join("")} · ${b.sieg} Siege, ${b.nied} Niederlagen`; }
      return gueltig(w) ? ziffern3(w, 5).map((z) => SSS[z]).join("") : "—";
    },
    neu: () => ({ wahl: [] }),
    taste(st, t) {
      const z = { a: 0, b: 1, x: 2 }[t];
      if (z === undefined) return;
      st.wahl.push(z);
      if (st.wahl.length >= 5) return { wert: zahl3(st.wahl) };
    },
    bild: (st) => `<div class="mn-gross">${st.wahl.map((z) => SSS[z]).join(" ") || "✊ ✋ ✌️"}</div><small>Runde ${Math.min(5, st.wahl.length + 1)}/5 – keiner sieht deine Wahl</small>`,
    knoepfe: () => [["a", "✊ Stein"], ["b", "✋ Papier"], ["x", "✌️ Schere"]], raster: "3",
    ende: (st) => { const w = [...st.wahl]; while (w.length < 5) w.push(r(3)); return zahl3(w); },
    bot: () => zahl3(Array.from({ length: 5 }, () => r(3))),
    punkte(werte, j, teil, m) { if (!gueltig(werte[j])) return -1e9; const b = sssBilanz(werte, j, teil, m); return (b.sieg - b.nied) * 1000 + b.sieg; },
  },
  {
    id: "mittag", titel: "Duell um zwölf", emo: "🤠", typ: "Reaktion", gut: "tief", dauer: 12000,
    regel: "Warte auf das Wort ZIEH! – und dann sofort A. Vorher kommen falsche Wörter: wer bei ZIEGE, ZIMT oder ZUG drückt, verliert.",
    einheit: (w) => (w >= 9000 ? "Fehlstart 💥" : w >= 5000 ? "zu langsam" : `${w} ms`),
    daten() {
      const zieh = 3500 + r(5000), W = ["ZIEGE!", "ZIMT!", "ZUG!", "ZIEL!", "ZIRKUS!", "ZIPFEL!"], fakes = [];
      for (let t = 800 + r(800); t < zieh - 700; t += 900 + r(900)) fakes.push({ at: t, w: W[r(W.length)] });
      return { zieh, fakes };
    },
    neu: () => ({}),
    taste: (st, t, m, ms) => (t === "a" ? { wert: ms >= m.d.zieh ? Math.max(1, Math.round(ms - m.d.zieh)) : 9000 } : undefined),
    tick: (st, m, ms) => (ms > m.d.zieh + 3000 ? { wert: 5000 } : undefined),
    bild(st, m, ms) {
      const f = m.d.fakes.find((x) => ms >= x.at && ms < x.at + 550), jetzt = ms >= m.d.zieh;
      return `<div class="mn-wort ${jetzt ? "zieh" : f ? "falsch" : ""}">${jetzt ? "ZIEH!" : f ? f.w : "…"}</div><small>🤠 Hand am Halfter …</small>`;
    },
    knoepfe: () => [["a", "✋ Ziehen!"]], raster: "1",
    ende: () => 5000, bot: () => (Math.random() < 0.12 ? 9000 : 220 + r(380)),
  },
  // ---------------------------------------------------------------- Team (Absprache)
  {
    id: "bruecke", titel: "Brückenbau", emo: "🌉", typ: "Team", gut: "hoch", dauer: 20000,
    regel: "Euer Team braucht GENAU so viele Bretter wie angezeigt. Jeder legt heimlich 1 bis 5 dazu – sprecht euch ab! Zu wenig = Lücke, zu viel = die Brücke bricht.",
    einheit(w, m, j) {
      if (!gueltig(w)) return "—";
      if (m && m.werte && j !== undefined) {
        const team = eigenesTeam(j, m).filter((k) => teilVon(m).includes(k)), summe = team.reduce((a, k) => a + (Number(m.werte[k]) || 0), 0), ziel = brueckenZiel(m, team.length);
        return `${w} 🪵 · ${team.length > 1 ? "Team" : "du"}: ${summe}/${ziel}${summe === ziel ? " ✅" : summe > ziel ? " 💥" : ""}`;
      }
      return `${w} 🪵`;
    },
    daten: () => ({ basis: 2 + r(3), plus: r(3) - 1 }),
    neu: (m, j) => ({ wahl: 3, ziel: brueckenZiel(m, j === undefined ? 1 : eigenesTeam(j, m).length), team: j === undefined ? 1 : eigenesTeam(j, m).length }),
    taste(st, t) {
      const z = /^z([1-5])$/.exec(t);
      if (z) return { wert: Number(z[1]) };
      if (t === "links" || t === "runter") st.wahl = Math.max(1, st.wahl - 1);
      if (t === "rechts" || t === "hoch") st.wahl = Math.min(5, st.wahl + 1);
      if (t === "a") return { wert: st.wahl };
    },
    bild: (st, m, ms, ctrl) => `<div class="mn-gross">🌉 ${st.ziel} Bretter</div><small>${st.team > 1 ? `Ziel für euer Team (${st.team} Leute) – sprecht euch ab!` : "Dein Ziel – leg genau so viele."}</small>`
      + (ctrl ? `<div class="mn-zahlen">${[1, 2, 3, 4, 5].map((z) => `<span class="${z === st.wahl ? "an" : ""}">${z}</span>`).join("")}</div>` : ""),
    knoepfe: (st, m, ms, ctrl) => (ctrl ? [["links", "◀ weniger"], ["rechts", "mehr ▶"], ["a", "✅ Abgeben"]] : [1, 2, 3, 4, 5].map((z) => [`z${z}`, `${z} 🪵`])), raster: "5",
    ende: (st) => st.wahl,
    bot: (m) => begrenzt(((m && m.d && m.d.basis) || 3) + r(3) - 1, 1, 5),
    punkte(werte, j, teil, m) {
      if (!gueltig(werte[j])) return -1e9;
      const team = eigenesTeam(j, m).filter((k) => teil.includes(k)), summe = team.reduce((a, k) => a + (Number(werte[k]) || 0), 0), ziel = brueckenZiel(m, team.length);
      return summe > ziel ? -100 - (summe - ziel) : -(ziel - summe);
    },
  },
  {
    id: "tauziehen", titel: "Tauziehen im Takt", emo: "🪢", typ: "Team", gut: "hoch", dauer: 12000,
    regel: "Zieh mit ⬅️ ➡️ abwechselnd – genau auf den Trommelschlag zählt jeder Zug doppelt. Im Team zählt der Schnitt aller: zieht gemeinsam im Takt!",
    einheit: (w) => `${w} Kraft`,
    neu: () => ({ kraft: 0, letzte: null, takt: -9999 }),
    taste(st, t, m, ms) {
      const s = links(t) ? "l" : rechts(t) ? "r" : null;
      if (!s || s === st.letzte) return;
      st.letzte = s;
      const imTakt = Math.abs((((ms % 500) + 500) % 500) - 250) > 170;
      st.kraft += imTakt ? 2 : 1;
      if (imTakt) st.takt = ms;
    },
    bild(st, m, ms) {
      const schlag = (((ms % 500) + 500) % 500) < 120, pos = begrenzt(50 + (st.kraft - (Math.max(0, ms) / 1000) * 6) * 0.9, 8, 92);
      return `<div class="mn-tau"><i style="left:${pos.toFixed(1)}%">🎀</i></div><div class="mn-trommel ${schlag ? "an" : ""}">🥁</div><small>${st.kraft} Kraft${ms - st.takt < 300 ? " · im Takt! ×2" : ""}</small>`;
    },
    knoepfe: () => [["links", "⬅️ Zieh"], ["rechts", "Zieh ➡️"]], raster: "2",
    ende: (st) => st.kraft, bot: () => 30 + r(50),
    punkte(werte, j, teil, m) {
      if (!gueltig(werte[j])) return -1e9;
      const team = eigenesTeam(j, m).filter((k) => teil.includes(k));
      return team.reduce((a, k) => a + (Number(werte[k]) || 0), 0) / team.length;
    },
  },
];

function geistIn(st, m, ms, l) {
  const k = m.d.z.findIndex((x, i) => x.loch === l && ms >= x.at && ms < x.bis && !st.weg[i]);
  return k < 0 ? "🪦" : { geist: "👻", gold: "🌟", kuerbis: "🎃" }[m.d.z[k].art];
}

export { DEFS2 };
