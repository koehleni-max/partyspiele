// Mehrere Spiele gleichzeitig im Raum (Nico 26.10.2026: Spiele-Uebersicht + Meldungen). Reine Logik, laeuft beim
// Gastgeber; app.js zeigt an und verteilt.
//
// Partie = {pid, spiel, phase: "sammeln" | "laeuft", mit: [id ...], bots: {id: name}, wartend: [id ...], von, start,
//           s (Spielstand), zuletzt (zuletzt gewerteter Sieg), runde}
//   mit[0] leitet das Spiel (wer es gestartet hat) - fuer die Spiele ist das "Spieler 0" wie frueher der Gastgeber.
//   Startet jemand ein Spiel, sammelt es zuerst Mitspieler ("Neues Spiel: Quiz-Duell - mitmachen?"), dann "Los".
//   Laeuft es schon: Spiele aus MITTENDRIN nehmen Neue sofort auf (sie werden hinten angehaengt), alle anderen merken sie
//   fuer die naechste Runde vor ("laeuft, naechste Runde").

// Je Spiel geprueft (26.10.): Zustand nur je Spieler-Nummer in Objekten oder Listen, die man hinten verlaengern kann.
// Nicht dabei: Partybrett, Fiesbau, Werwolf, Farbchaos, Wer bin ich, Spion und die fertigen Spiele - dort stehen Rollen,
// Karten oder Figuren beim Start fest.
const punkteDazu = (s) => { if (Array.isArray(s.punkte)) s.punkte.push(0); if (Array.isArray(s.kreisStart)) s.kreisStart.push(0); };
export const MITTENDRIN = {
  nochnie: null, werwuerde: null, wop: null, lieber: null, paranoia: null,   // Fragen und Trinkspiele: zaehlen namen.length
  klatschen: null, pferde: null,                                                 // reihum / Wetten je Spieler
  reaktion: null, schaetzen: null, malen: null,                                  // je Runde neu
  busfahrer: (s) => { s.hand.push([]); s.fehler.push(0); },
  begriffe: punkteDazu, pantomime: punkteDazu, quiz: punkteDazu, slf: punkteDazu,
};
export const mittendrin = (spielId) => Object.prototype.hasOwnProperty.call(MITTENDRIN, spielId);

export const BOTNAMEN = ["🤖 Robo-Rudi", "🤖 Bot Berta", "🤖 Cyber-Claus", "🤖 Pixel-Paula", "🤖 Byte-Bernd", "🤖 Chip-Charlie", "🤖 Neo-Nora", "🤖 Tin-Tina",
  "🤖 Mecha-Max", "🤖 Data-Doris", "🤖 Servo-Sepp", "🤖 Laser-Lotte", "🤖 Turbo-Toni", "🤖 Giga-Gisela", "🤖 Robo-Rosi", "🤖 Kilo-Karl", "🤖 Mega-Mia", "🤖 Volt-Viktor", "🤖 Nano-Nele"];
export const MAX_MIT = 30;
export const istBot = (id) => String(id).startsWith("bot:");

export function neu(pid, spiel, von, jetzt) {
  return { pid, spiel, phase: "sammeln", mit: [von], bots: {}, wartend: [], von, start: jetzt, s: null, zuletzt: null, runde: 1 };
}

export function nameVon(raum, p, id) {
  if (istBot(id)) return (p && p.bots && p.bots[id]) || "🤖 Bot";
  const sp = raum.spieler.find((x) => x.id === id);
  return sp ? sp.name : "Weg";
}
export const namen = (raum, p) => p.mit.map((id) => nameVon(raum, p, id));
export const leiter = (p) => p.mit.find((id) => !istBot(id)) || null;
export const darfLeiten = (p, id, admin) => admin || leiter(p) === id;

// -> "dabei" | "wartet" | null
export function mitmachen(p, sp, id, raum) {
  if (p.mit.includes(id)) return "dabei";
  if (p.mit.length >= MAX_MIT) return null;
  if (p.phase === "sammeln") { p.mit.push(id); p.wartend = p.wartend.filter((x) => x !== id); return "dabei"; }
  if (mittendrin(p.spiel) && p.s) {
    const hook = MITTENDRIN[p.spiel];
    if (hook) hook(p.s);
    p.mit.push(id);
    p.s.anzahl = p.mit.length;
    return "dabei";
  }
  if (!p.wartend.includes(id)) p.wartend.push(id);
  return "wartet";
}

// Abmelden geht nur, solange gesammelt wird (danach haengen Punkte und Zuege an der Spieler-Nummer) oder von der Warteliste
export function raus(p, id) {
  if (p.wartend.includes(id)) { p.wartend = p.wartend.filter((x) => x !== id); return true; }
  if (p.phase !== "sammeln" || !p.mit.includes(id)) return false;
  p.mit = p.mit.filter((x) => x !== id);
  return true;
}

export function starten(p, sp, raum) {
  p.s = sp.start(namen(raum, p));
  p.s.anzahl = p.mit.length;
  p.phase = "laeuft";
  p.zuletzt = null;
}

// Neue Runde mit allen Vorgemerkten (fuer Spiele ohne Einstieg mittendrin)
export function neueRunde(p, sp, raum) {
  p.mit = [...p.mit, ...p.wartend.filter((id) => !p.mit.includes(id))].slice(0, MAX_MIT);
  p.wartend = [];
  p.runde = (p.runde || 1) + 1;
  starten(p, sp, raum);
}

export function botDazu(p, raum) {
  if (p.phase !== "sammeln" || p.mit.length >= MAX_MIT) return false;
  const vergeben = new Set(Object.values(p.bots));
  const name = BOTNAMEN.find((n) => !vergeben.has(n)) || `🤖 Bot ${Object.keys(p.bots).length + 1}`;
  let k = 1; while (p.bots[`bot:${k}`]) k++;
  p.bots[`bot:${k}`] = name;
  p.mit.push(`bot:${k}`);
  return true;
}
export function botWeg(p, id) {
  if (p.phase !== "sammeln" || !istBot(id)) return false;
  delete p.bots[id];
  p.mit = p.mit.filter((x) => x !== id);
  return true;
}

// Ein Konto bekommt eine neue Kennung (Gastgeber-Tab neu geoeffnet, Gast unter gleichem Namen zurueck)
export function idErsetzen(raum, alt, neu) {
  if (!alt || alt === neu) return;
  raum.spieler.forEach((x) => { if (x.id === alt) x.id = neu; });
  if (Array.isArray(raum.admins)) raum.admins = raum.admins.map((x) => (x === alt ? neu : x));
  Object.values(raum.partien || {}).forEach((p) => {
    p.mit = p.mit.map((x) => (x === alt ? neu : x));
    p.wartend = p.wartend.map((x) => (x === alt ? neu : x));
    if (p.von === alt) p.von = neu;
  });
  if (raum.meldung && raum.meldung.von === alt) raum.meldung.von = neu;
}

// Uebersicht: laufende Spiele, neueste zuerst
export const liste = (raum) => Object.values(raum.partien || {}).sort((x, y) => (y.start || 0) - (x.start || 0));
