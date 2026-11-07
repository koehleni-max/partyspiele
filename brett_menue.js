// Hauptmenue des Partybretts: was eingestellt ist und was die Einstellungen bedeuten (Nico 06.11.2026, Entwurf entwurf/).
// Reine Logik ohne Oberflaeche: laeuft beim Gastgeber (app.js), hauptmenue.js zeigt an, brett.js und brett3d.js lesen die Tempo-Stufen.
//
// Einstellungen je Partie: p.karte (Nummer oder "zufall"), p.runden (0 = unbegrenzt), p.ohne und p.hm = { sternAn, sterne, tempo,
// teams, team: {id: 0|1}, fig: {id: {farbe, hut}}, vorlage }. Beim Start wandert alles in den Spielstand (brett.js, vorStart).

export const STUFEN = ["langsam", "normal", "schnell", "turbo"];
// Was jede Stufe bedeutet. zug: Sekunden, die ein Mensch fuer seinen Schritt hat, dann zieht das Spiel fuer ihn weiter.
// pause: mal so lange stehen Ereigniskarte, Ergebnis und die Wartezeiten. bots: mal so lange denken die Computer-Mitspieler.
// figuren, wuerfel, kamera: so viel mal schneller als normal laufen Figuren, Wurf und Kamerafahrten.
export const TEMPO = {
  zug: [120, 60, 30, 15],
  pause: [1.5, 1, 0.6, 0.3],
  bots: [1.6, 1, 0.5, 0.2],
  figuren: [0.7, 1, 1.6, 3],
  wuerfel: [0.7, 1, 1.6, 3],
  kamera: [0.7, 1, 1.6, 3],
};
export const TEMPO_GRUPPEN = { spiel: ["zug", "pause", "bots"], anim: ["figuren", "wuerfel", "kamera"] };
const NORMAL = 1;
export const tempoNeu = () => Object.fromEntries(Object.keys(TEMPO).map((k) => [k, NORMAL]));
// Faktor einer Stufe im Spielstand; alte Staende ohne Tempo laufen auf normal
export function faktor(s, key) {
  const st = s && s.tempo ? s.tempo[key] : NORMAL;
  return TEMPO[key][Number.isInteger(st) && TEMPO[key][st] !== undefined ? st : NORMAL];
}
// Stufe einer Gruppe: alle Teile gleich -> diese Stufe, sonst null ("gemischt")
export function gruppenStufe(tempo, gruppe) {
  const teile = TEMPO_GRUPPEN[gruppe].map((k) => tempo[k]);
  return teile.every((x) => x === teile[0]) ? teile[0] : null;
}
export function tempoSetzen(tempo, key, wert) {
  if (!Number.isInteger(wert) || wert < 0 || wert >= STUFEN.length) return false;
  if (TEMPO_GRUPPEN[key]) TEMPO_GRUPPEN[key].forEach((k) => { tempo[k] = wert; });
  else if (key in TEMPO) tempo[key] = wert;
  else return false;
  return true;
}

export const HUT_IDS = ["party", "hexe", "krone", "zylinder", "kappe", "helm"];
export const TEAM_NAMEN = ["Team Rot", "Team Blau"];
export const FARBEN_ZAHL = 20;
export const RUNDEN_VORGABE = 12, RUNDEN_MAX = 99, STERNE_MAX = 20, STERNE_VORGABE = 5, SPIELER_MAX = 20;
export const rundenGueltig = (r) => Number.isInteger(r) && r >= 0 && r <= RUNDEN_MAX;
export const rundenVon = (p) => (rundenGueltig(p.runden) ? p.runden : RUNDEN_VORGABE);

const neu = () => ({ sternAn: false, sterne: STERNE_VORGABE, tempo: tempoNeu(), teams: false, team: {}, fig: {}, vorlage: null });
export function stand(p) {
  if (!p.hm || typeof p.hm !== "object") p.hm = neu();
  const m = p.hm;
  if (!m.tempo) m.tempo = tempoNeu();
  if (!m.team) m.team = {};
  if (!m.fig) m.fig = {};
  return m;
}

// Jeder Mitspieler hat Farbe, Hut und Team; niemand teilt sich eine Farbe (nur ueber 20 Spielern reichen die Farben nicht)
export function abgleich(p, look, istBot = () => false) {
  const m = stand(p), belegt = new Set();
  Object.keys(m.fig).forEach((id) => { if (!p.mit.includes(id)) delete m.fig[id]; });
  Object.keys(m.team).forEach((id) => { if (!p.mit.includes(id)) delete m.team[id]; });
  p.mit.forEach((id) => { if (m.fig[id]) belegt.add(m.fig[id].farbe); });
  p.mit.forEach((id, j) => {
    if (!m.fig[id]) {
      let farbe = 0;
      while (belegt.has(farbe) && farbe < FARBEN_ZAHL) farbe++;
      if (farbe >= FARBEN_ZAHL) farbe = j % FARBEN_ZAHL;
      belegt.add(farbe);
      m.fig[id] = { farbe, hut: istBot(id) ? HUT_IDS[(j + 2) % HUT_IDS.length] : look === "halloween" ? "hexe" : "party" };
    }
    if (m.team[id] !== 0 && m.team[id] !== 1) {
      const rot = p.mit.filter((x) => m.team[x] === 0).length, blau = p.mit.filter((x) => m.team[x] === 1).length;
      m.team[id] = rot <= blau ? 0 : 1;
    }
  });
}
// -> true, wenn es geklappt hat; eine Farbe, die jemand anderes hat, wird abgelehnt
export function figurSetzen(p, id, a) {
  const m = stand(p), f = m.fig[id];
  if (!f || !p.mit.includes(id)) return false;
  if (a.farbe !== undefined) {
    const farbe = Number(a.farbe);
    if (!Number.isInteger(farbe) || farbe < 0 || farbe >= FARBEN_ZAHL) return false;
    if (p.mit.some((x) => x !== id && m.fig[x] && m.fig[x].farbe === farbe)) return false;
    f.farbe = farbe;
  }
  if (a.hut !== undefined) {
    if (!HUT_IDS.includes(a.hut)) return false;
    f.hut = a.hut;
  }
  return true;
}

// Warum noch nicht gestartet werden kann (null = es geht los)
export function startGrund(p) {
  if (p.karte === undefined || p.karte === null) return "Erst eine Karte wählen";
  const m = stand(p);
  if (m.teams && p.mit.length > 1) {
    const rot = p.mit.filter((id) => m.team[id] === 0).length;
    if (!rot || rot === p.mit.length) return "Jedes Team braucht jemanden";
  }
  return null;
}

// Aktion "_hm" der Spielleitung -> true, wenn sich etwas geaendert hat (Vorlagen: app.js)
export function aktion(p, a) {
  const m = stand(p);
  if (a.was === "stern") {
    if (typeof a.an === "boolean") m.sternAn = a.an;
    if (a.sterne !== undefined) { const n = Number(a.sterne); if (!Number.isInteger(n) || n < 1 || n > STERNE_MAX) return false; m.sterne = n; }
  } else if (a.was === "tempo") { if (!tempoSetzen(m.tempo, a.key, Number(a.wert))) return false; }
  else if (a.was === "teams") m.teams = !!a.an;
  else if (a.was === "team") { if (!p.mit.includes(a.id)) return false; m.team[a.id] = m.team[a.id] === 1 ? 0 : 1; }
  else return false;
  m.vorlage = null;
  return true;
}

// ---------------------------------------------------------------- Vorlagen
// Fertige Vorschlaege aus dem Entwurf (ohne Karte: die Karte bleibt, wie sie ist); eigene liegen beim Gastgeber (app.js)
export const VORLAGEN = {
  "Schnelle Runde": { runden: 6, sternAn: false, spiel: 3, anim: 3 },
  "Langer Abend": { runden: 20, sternAn: true, sterne: 8, spiel: 1, anim: 1 },
  "Familie, ohne Trinken": { runden: 12, sternAn: false, ohne: true, spiel: 0, anim: 1 },
};
const nurWahl = (weg) => (Array.isArray(weg) ? weg.filter((k) => /^[mw]:/.test(String(k))) : []);
export function vorlageAus(p, raum) {
  const m = stand(p);
  return { karte: p.karte ?? null, runden: rundenVon(p), ohne: !!p.ohne, sternAn: m.sternAn, sterne: m.sterne, tempo: { ...m.tempo }, teams: m.teams, weg: nurWahl(raum && raum.brettWeg) };
}
export function vorlageAnwenden(p, raum, v, name = null) {
  if (!v || typeof v !== "object") return false;
  const m = stand(p);
  if (v.karte !== undefined && v.karte !== null) p.karte = v.karte;
  if (rundenGueltig(v.runden)) p.runden = v.runden;
  if (typeof v.ohne === "boolean") p.ohne = v.ohne || !!(raum && raum.ohneAlkohol);
  if (typeof v.sternAn === "boolean") m.sternAn = v.sternAn;
  if (Number.isInteger(v.sterne)) m.sterne = v.sterne;
  if (typeof v.teams === "boolean") m.teams = v.teams;
  if (v.tempo) Object.keys(TEMPO).forEach((k) => { if (Number.isInteger(v.tempo[k])) m.tempo[k] = v.tempo[k]; });
  if (Number.isInteger(v.spiel)) tempoSetzen(m.tempo, "spiel", v.spiel);
  if (Number.isInteger(v.anim)) tempoSetzen(m.tempo, "anim", v.anim);
  if (Array.isArray(v.weg) && raum) raum.brettWeg = [...(raum.brettWeg || []).filter((k) => !/^[mw]:/.test(String(k))), ...nurWahl(v.weg)];
  m.vorlage = name;
  return true;
}
export function vorlageName(liste) {
  let n = 1;
  while (liste && liste[`Meine Vorlage ${n}`]) n++;
  return `Meine Vorlage ${n}`;
}
