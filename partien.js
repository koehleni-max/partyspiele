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

// ohne = "ohne Trinken" fuer genau diese Partie (Nico 31.10.2026: "Trinkelemente pro Spiel waehlbar, da nicht alle
// trinken"). Vorbelegt mit dem Raum-Schalter, die Spielleitung stellt es vor "Los" um (Aktion _ohne).
export function neu(pid, spiel, von, jetzt, ohne = false) {
  return { pid, spiel, phase: "sammeln", mit: [von], bots: {}, wartend: [], von, start: jetzt, s: null, zuletzt: null, runde: 1, ohne: !!ohne };
}
// Partien von vor dem 31.10. kennen kein eigenes "ohne" - dort gilt der Raum-Schalter
export const ohneTrinken = (raum, p) => (p && typeof p.ohne === "boolean" ? p.ohne : !!(raum && raum.ohneAlkohol));

export function nameVon(raum, p, id) {
  if (istBot(id)) return (p && p.bots && p.bots[id]) || "🤖 Bot";
  const sp = raum.spieler.find((x) => x.id === id);
  return sp ? sp.name : "Weg";
}
export const namen = (raum, p) => p.mit.map((id) => nameVon(raum, p, id));
// Verlassen (Nico 13.11.2026): p.weg = wer das laufende Spiel verlassen hat, aber noch auf seinem Platz steht (Spiele ohne
// Computer-Mitspieler); p.ersatz = {botId: Kennung} fuer Plaetze, die ein Computer fuer jemanden weiterspielt.
export const istWeg = (p, id) => Array.isArray(p.weg) && p.weg.includes(id);
export const aktive = (p) => p.mit.filter((id) => !istBot(id) && !istWeg(p, id));
export const leiter = (p) => aktive(p)[0] || null;
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
  // wer das Spiel verlassen hat, sitzt in der neuen Runde nicht mehr mit am Tisch
  if (Array.isArray(p.weg) && p.weg.length) { p.mit = p.mit.filter((id) => !p.weg.includes(id)); p.weg = []; }
  // raum: fuer Inhalte ohne Wiederholung ueber den ganzen Abend (stapel.js, z. B. die Figuren bei Wer bin ich)
  p.s = sp.start(namen(raum, p), raum);
  p.s.anzahl = p.mit.length;
  p.s.ohne = ohneTrinken(raum, p);   // die Spiele lesen es selbst (Aufgaben statt Schlucke, Trinkkarten weglassen)
  if (sp.vorStart) sp.vorStart(p.s, p, raum);   // Wahl beim Sammeln (Partybrett: alles aus dem Hauptmenue)
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
    if (Array.isArray(p.weg)) p.weg = p.weg.map((x) => (x === alt ? neu : x));
    if (p.ersatz) Object.keys(p.ersatz).forEach((b) => { if (p.ersatz[b] === alt) p.ersatz[b] = neu; });
    // Partybrett: Figur und Team aus dem Hauptmenue gehen mit
    if (p.hm) ["fig", "team"].forEach((k) => { if (p.hm[k] && alt in p.hm[k]) { p.hm[k][neu] = p.hm[k][alt]; delete p.hm[k][alt]; } });
  });
  if (raum.meldung && raum.meldung.von === alt) raum.meldung.von = neu;
}

// Platz uebergeben (Vorschlag 7): wer geht, gibt seinen Sitz an einen Gast, der noch nicht mitspielt. Punkte, Figur und Zug
// haengen an der Spieler-Nummer und gehen mit; die Gesamtwertung zaehlt nach Namen, bisherige Siege bleiben also beim alten.
export function platzGeben(raum, p, alt, neu) {
  if (!alt || !neu || alt === neu || istBot(alt) || !p.mit.includes(alt) || p.mit.includes(neu)) return false;
  if (!raum.spieler.some((x) => x.id === neu)) return false;
  p.mit = p.mit.map((x) => (x === alt ? neu : x));
  p.wartend = p.wartend.filter((x) => x !== neu);
  if (Array.isArray(p.weg)) p.weg = p.weg.filter((x) => x !== alt);   // der Platz ist wieder besetzt
  if (p.von === alt) p.von = neu;
  if (p.hm) ["fig", "team"].forEach((k) => { if (p.hm[k] && alt in p.hm[k]) { p.hm[k][neu] = p.hm[k][alt]; delete p.hm[k][alt]; } });
  return true;
}

// Verlassen statt "Beenden fuer alle" (Nico 13.11.2026: "nicht jeder darf alles beenden ... wenn alle aus dem Game raus sind,
// beendet es sich selbst"). Jeder geht nur fuer sich:
// - beim Sammeln oder von der Warteliste: einfach raus
// - laufendes Spiel mit Computer-Mitspielern (sp.bot): ein Computer spielt auf dem Platz weiter ("🤖 Anna")
// - sonst bleibt der Platz stehen und gilt als "weg" (Punkte und Zuege haengen an der Spieler-Nummer)
// In beiden Faellen holt "Wieder mitmachen" den Platz zurueck (zurueck). -> "raus" | "bot" | "weg" | null
const platzUmhaengen = (p, alt, neu) => {
  p.mit = p.mit.map((x) => (x === alt ? neu : x));
  if (p.von === alt) p.von = neu;
  if (p.hm) ["fig", "team"].forEach((k) => { if (p.hm[k] && alt in p.hm[k]) { p.hm[k][neu] = p.hm[k][alt]; delete p.hm[k][alt]; } });
};
export function verlassen(raum, p, sp, id) {
  if (p.wartend.includes(id)) { p.wartend = p.wartend.filter((x) => x !== id); return "raus"; }
  if (istBot(id) || !p.mit.includes(id) || istWeg(p, id)) return null;
  if (p.phase === "sammeln") { p.mit = p.mit.filter((x) => x !== id); if (p.von === id) p.von = leiter(p) || p.von; return "raus"; }
  if (sp.bot) {
    let k = 1; while (p.bots[`bot:${k}`]) k++;
    const bot = `bot:${k}`, name = nameVon(raum, p, id);
    p.bots[bot] = `🤖 ${name.slice(0, 11)}`;
    p.ersatz = { ...(p.ersatz || {}), [bot]: id };
    platzUmhaengen(p, id, bot);
    return "bot";
  }
  p.weg = [...(p.weg || []), id];
  return "weg";
}
// -> true, wenn die Kennung ihren alten Platz zurueckbekommen hat
export function zurueck(p, id) {
  if (istWeg(p, id)) { p.weg = p.weg.filter((x) => x !== id); return true; }
  const bot = Object.keys(p.ersatz || {}).find((b) => p.ersatz[b] === id && p.mit.includes(b));
  if (!bot || p.mit.includes(id)) return false;
  platzUmhaengen(p, bot, id);
  delete p.bots[bot];
  delete p.ersatz[bot];
  return true;
}
export const kannZurueck = (p, id) => istWeg(p, id) || Object.keys(p.ersatz || {}).some((b) => p.ersatz[b] === id && p.mit.includes(b));

// Spiel retten (Vorschlag 124): was der Notfall-Knopf sichert und zurueckholt. Kennungen bleiben draussen - wer inzwischen den
// Platz gewechselt hat, behaelt ihn.
export const rettungStand = (p) => ({ s: p.s, phase: p.phase, runde: p.runde, n: p.mit.length });
// Absolute Zeiten im Stand (Fristen, Startzeiten) laufen um "vor"; sonst waere jede Frist sofort abgelaufen
export function zeitenSchieben(o, von, um) {
  if (Array.isArray(o)) return o.map((x) => zeitenSchieben(x, von, um));
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, zeitenSchieben(x, von, um)]));
  return typeof o === "number" && Math.abs(o - von) < 86400000 ? o + um : o;
}
export function standZurueck(p, stand, gesichert, jetzt) {
  p.s = zeitenSchieben(stand.s, gesichert, jetzt - gesichert);
  p.phase = stand.phase;
  p.runde = stand.runde;
  // spaeter Dazugekommene hatten damals noch keinen Sitz: sie warten auf die naechste Runde
  if (p.mit.length > stand.n) { p.wartend = [...p.wartend, ...p.mit.slice(stand.n).filter((id) => !istBot(id))]; p.mit = p.mit.slice(0, stand.n); }
  if (p.s) p.s.anzahl = p.mit.length;
  p.v = (p.v || 0) + 1;
  p.wv = 0;
}

// Uebersicht: laufende Spiele, neueste zuerst
export const liste = (raum) => Object.values(raum.partien || {}).sort((x, y) => (y.start || 0) - (x.start || 0));
