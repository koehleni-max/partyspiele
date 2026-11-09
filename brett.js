// Partybrett - eigenes Brettspiel mit Wuerfeln, Feldern, Sternen und Minispielen nach jeder Runde
// (in der Art bekannter Party-Brettspiele, eigene Umsetzung).
// Ausbau Nico 31.10.2026 (Punkt 8, alle vier Richtungen): groesseres Brett mit zwei Abzweigungen, Laden mit Gegenstaenden,
// Fallen, Schild, Ereignisfeld mit ~100 Zufaellen (brett_ereignisse.js, streichbar), wandernder Stern, Aufholhilfe,
// Schlussrunden-Ereignis, Bonussterne am Ende; Minispiele in den Spielarten alle gegen alle, Team gegen Team, 1 gegen alle, Duell.
// Teil 4b (Nico 31.10.2026 abends: "doppelte Menge und Komplexitaet, so nah wie moeglich am Original"):
// - 53 Minispiele (5 alte hier, 48 in brett_minis.js/brett_minis2.js), einzeln streichbar wie die Ereignisse
// - Lebenspunkte (30): Stachelfelder, Waffen-Gegenstaende, Bomben, Gift, Duelle und der Vulkan ziehen ab; bei 0 ist man K.O.:
//   die Haelfte der Muenzen (hoechstens 15) bleibt als Haufen auf dem Feld liegen (wer vorbeikommt, sammelt sie ein),
//   zurueck zum Start mit vollen Lebenspunkten
// - 19 Gegenstaende (Laden zeigt je Besuch 6 davon), Truhenfelder, Heilquellen, Stachelfelder, Portale, Glutfelder
// - Rundenzahl beim Start waehlbar (6/8/12/20), zweites Brett "Vulkaninsel" mit Portalen, Lavapfad und Ausbruch alle 3 Runden
import { esc, knopf, zufall, ziehe, mischen, schlucke } from "./hilfe.js";
import * as T from "./texte.js";
import * as BE from "./brett_ereignisse.js";
import * as R from "./brett_minis.js";
import * as STAPEL from "./stapel.js";
import * as DU from "./duell.js";
import { brett3dZeigen, vorfuehrDauer, WURF, LAUF } from "./brett3d.js";
import * as KF from "./kamera_frei.js";
import { still as amBeamer } from "./ton.js";
import { KARTEN, KARTEN_REIHE, VORGABE_KARTE, AUSBRUCH_ALLE, GEZEITEN_ALLE, STEMPEL_ZIEL, wegeVon, feldArt, lavaFelder, istGesperrt, ausweg, kartenZustand, kartenInfo } from "./brett_karten.js";
import * as M from "./brett_menue.js";
// Grossumbau Runde 3 (Nico 01.11.2026, Vorbild Pummel Party): jede Aktion bekommt eine Bilanz (s.bilanz: wer wie viele
// Muenzen, Sterne, Lebenspunkte gewonnen oder verloren hat, mit Symbol und Anlass) - brett3d.js fuehrt sie gross vor.
// Waehrend der Vorfuehrung sind "Weiter" und Co. gesperrt und die Computer-Spieler warten (ruhigeres Tempo).
// Zeigt der Beamer das Brett, sehen die Handys statt der 3D-Ansicht: Wuerfel, Gegenstaende, Ereigniskarte, Kamera-Flaeche
// (wer am Zug ist, fuehrt die Kamera am Beamer) und eine kleine Karte.

// Grossumbau Runde 4 (Plan 3.1 E): die Karten stehen in brett_karten.js (je Feld x, z, Hoehe, Art, Nachbarn). Neu: Hafeninsel
// mit Ebbe und Flut, Vulkaninsel mit wandernden Lavafeldern, Glitzerpassage mit Etagen und Laeden; Kartenwahl beim Sammeln.

// Hauptmenue (Nico 06.11.2026): alles wird vor dem Start in hauptmenue.js eingestellt und steht dann im Spielstand: s.runden (0 =
// unbegrenzt), s.sternZiel (0 = aus, sonst gewinnt sofort, wer es erreicht), s.tempo (brett_menue.js), s.fig (Farbe und Hut je
// Spieler), s.team (0/1 je Spieler, fest), s.warenWeg (abgeschaltete Gegenstaende). Die Spielerfarbe ist seitdem nicht mehr die
// Spielernummer: fk(s, j) liefert sie.

const RUNDEN = M.RUNDEN_VORGABE;        // Vorgabe (Nico 01.11.2026: waehlbar, Vorgabe 12)
export const RUNDEN_WAHL = [6, 8, 12, 20];
const STERNPREIS = 10;
const AUFGABE_STRAFE = 2;
const BEUTEL = 3;   // hoechstens so viele Gegenstaende
export const LP = 30;                   // Lebenspunkte
const ANGEBOT = 6;  // so viele Gegenstaende zeigt der Laden je Besuch

// ---------------------------------------------------------------- Bretter
// Die Karten selbst stehen in brett_karten.js (Feldarten siehe dort)
export const BRETTER = KARTEN;
const B = (s) => BRETTER[s && s.brettNr] || BRETTER[1];
// Inselbrett wie bisher (Tests, 3D-Pruefungen)
export const NEXT = BRETTER[1].next;
export const LAGE = BRETTER[1].lage;
const muster = (s) => (s && s.ohne ? B(s).ohne : B(s).muster);
const artVon = (s, f) => feldArt(s, B(s), f, muster(s));
const wege = (s, f) => wegeVon(s, B(s), f);
export const ART = { m: ["🪙", "+3 Münzen"], v: ["💸", "−3 Münzen"], t: ["🍺", "Trinkfeld"], a: ["🎯", "Aufgabenfeld"], e: ["❓", "Ereignis"], d: ["⚔️", "Duell"], l: ["🛒", "Laden"],
  s: ["🌵", "Stachelfeld"], h: ["💖", "Heilquelle"], k: ["🧰", "Truhe"], p: ["🌀", "Portal"], g: ["🔥", "Glutfeld"], z: ["🛗", "Aufzug"], b: ["🏦", "Bank"] };
// Bank (Runde C, Punkt 25): wer vorbeilaeuft, zahlt BANK_EIN Muenzen ein; wer genau darauf landet, raeumt sie leer
export const BANK_EIN = 3;

// ---------------------------------------------------------------- Gegenstaende (Laden, Truhen, Ereignisse)
// ziel = braucht ein Opfer (Phase "ziel")
export const WAREN = [
  { id: "doppel", emo: "🎲", name: "Doppelwürfel", preis: 5, text: "zwei Würfel in diesem Zug" },
  { id: "dreifach", emo: "🎰", name: "Dreifachwürfel", preis: 9, text: "drei Würfel in diesem Zug" },
  { id: "mini", emo: "🐢", name: "Mini-Würfel", preis: 2, text: "würfelt nur 1 bis 3 – zum gezielten Landen" },
  { id: "tausch", emo: "🔄", name: "Tauschtrank", preis: 7, text: "tausch den Platz mit jemandem", ziel: true },
  { id: "dieb", emo: "🧲", name: "Münzmagnet", preis: 6, text: "klau jemandem bis zu 5 Münzen", ziel: true },
  { id: "falle", emo: "🪤", name: "Falle", preis: 4, text: "auf dein Feld: wer dort landet, zahlt dir 5" },
  { id: "schild", emo: "🛡️", name: "Schutzschild", preis: 5, text: "fängt das nächste Unglück oder den nächsten Treffer ab (wirkt von selbst)" },
  { id: "rohr", emo: "🌟", name: "Sternenrohr", preis: 14, text: "bringt dich direkt vor den Stern" },
  { id: "heil", emo: "💖", name: "Heiltrank", preis: 4, text: "+15 Lebenspunkte" },
  { id: "faust", emo: "🥊", name: "Boxhandschuh", preis: 8, text: "15 Schaden an jemandem bis 4 Felder entfernt", ziel: true },
  { id: "bogen", emo: "🏹", name: "Pfeil und Bogen", preis: 6, text: "8 Schaden an jemandem, egal wo", ziel: true },
  { id: "blitz", emo: "⚡", name: "Gewitterwolke", preis: 10, text: "alle anderen verlieren 6 Lebenspunkte" },
  { id: "bombe", emo: "💣", name: "Zeitbombe", preis: 6, text: "auf dein Feld: knallt zu Rundenbeginn – 12 Schaden dort und daneben" },
  { id: "gift", emo: "🧪", name: "Gifttrank", preis: 7, text: "Ziel verliert 3 Runden lang je 4 Lebenspunkte", ziel: true },
  { id: "rakete", emo: "🚀", name: "Rakete", preis: 9, text: "fliegt 8 Felder vor – wer überflogen wird, bekommt 6 Schaden" },
  { id: "fluch", emo: "🐌", name: "Schneckenfluch", preis: 5, text: "Ziel würfelt beim nächsten Mal nur 1 oder 2", ziel: true },
  { id: "sperre", emo: "🚧", name: "Absperrung", preis: 4, text: "auf dein Feld: wer vorbeiläuft, muss dort anhalten" },
  { id: "wunder", emo: "🎁", name: "Wundertüte", preis: 5, text: "irgendwas passiert – meistens Gutes" },
  { id: "handschuh", emo: "🧤", name: "Langfinger", preis: 6, text: "klau jemandem einen Gegenstand", ziel: true },
  // nur auf ihrer Karte zu haben (nur = Trick der Karte)
  { id: "muschel", emo: "🐚", name: "Muschelhorn", preis: 4, text: "schaltet sofort zwischen Ebbe und Flut um", nur: "gezeiten" },
  { id: "aufkleber", emo: "🏷️", name: "Preisaufkleber", preis: 5, text: "Ziel zahlt in seinem nächsten Zug alles doppelt", ziel: true, nur: "kaufhaus" },
];
const ware = (id) => WAREN.find((w) => w.id === id);
const LADEN = WAREN.filter((w) => !w.nur).map((w) => w.id);
const wareAn = (s, id) => !(s.warenWeg || []).includes(id);
// was es auf dieser Karte zu kaufen und zu finden gibt (ohne die im Hauptmenue abgeschalteten)
const ladenVon = (s) => [...LADEN, ...WAREN.filter((w) => w.nur && w.nur === B(s).trick).map((w) => w.id)].filter((id) => wareAn(s, id));
// Spielerfarbe (Nummer der festen Liste --s0 ... --s19); ohne Hauptmenue-Wahl wie bisher die Spielernummer
const fk = (s, j) => (s.fig && s.fig[j] ? s.fig[j].farbe : j) % M.FARBEN_ZAHL;
export const brettFarbe = fk;
const nameIn = (s, namen, j) => `<b class="n${fk(s, j)}">${esc(namen[j])}</b>`;
const preisVon = (s, i, w) => w.preis * (s.teuer && s.teuer[i] ? 2 : 1);

// ---------------------------------------------------------------- Minispiele
// Die fuenf ersten (alte Fassung, eigener Code weiter unten und in controller.js) + 48 neue (brett_minis.js, brett_minis2.js)
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
  const bb = B(s), mu = bb.muster;
  // nie auf Feldern, die gesperrt sein koennen - sonst stuende der Stern bei Flut unerreichbar im Wasser
  const frei = [...mu].map((f, i) => (f === "m" && !bb.sperren[i] && i !== s.stern && !(s.pos || []).includes(i) ? i : -1)).filter((i) => i >= 0);
  const wahl = bb.next.length > 60 ? sternInReichweite(s, frei) : frei;
  return wahl[zufall(wahl.length)];
}
// Grosse Karten (Runde 4): auf 100 Feldern kaeme bei 12 Runden sonst kaum jemand zum Stern (gemessen: 1,7 Sterne je Partie
// statt 3,9 auf der kleinen Karte). Deshalb taucht er in Reichweite auf: fuer niemanden gleich vor den Fuessen, aber fuer
// mindestens einen in wenigen Wuerfen zu erreichen.
const STERN_MIN = 5, STERN_MAX = 14;
const sternWartet = (s) => (B(s).next.length > 60 ? 4 : 3);   // so viele Runden bleibt er stehen, bevor er weiterzieht
function sternInReichweite(s, frei) {
  const weit = new Map();
  [...new Set(s.pos)].forEach((start) => {
    const d = new Map([[start, 0]]), q = [start];
    while (q.length) {
      const x = q.shift();
      if (d.get(x) >= STERN_MAX) continue;
      wege(s, x).forEach((y) => { if (!d.has(y)) { d.set(y, d.get(x) + 1); q.push(y); } });
    }
    d.forEach((v, f) => { if (!weit.has(f) || v < weit.get(f)) weit.set(f, v); });
  });
  const nah = frei.filter((f) => weit.has(f) && weit.get(f) >= STERN_MIN);
  return nah.length ? nah : frei;
}
// vor dem ersten Wurf laesst sich Stand noch per Aktion umstellen (die Wahl selbst steht seit dem Hauptmenue vor dem Start)
const einstellbar = (s) => s.runde === 1 && s.dran === 0 && s.phase === "wuerfeln" && !s.spurNr && !s.wareBenutzt;
const rundenGueltig = M.rundenGueltig;

export const brett = {
  id: "brett", weich: false, name: "Partybrett",   // weich: false = 3D/Minispiele haengen eigene Lauscher an (app.js, weich.js) emoji: "🎲", farben: ["#ff9600","#b4231f"], kurz: "Würfeln, Lebenspunkte, Laden, Sterne kaufen, 53 Minispiele – 4 Karten, Runden frei wählbar",
  start(namen) {
    const n = namen.length, je = (v) => namen.map(() => (typeof v === "function" ? v() : v));
    const t = testVorgabe();
    const s = { runde: 1, dran: 0, pos: je(0), muenzen: je(5), sterne: je(0), phase: "wuerfeln", wurf: null, wuerfe: null,
      meldung: "Wer zuerst würfelt, fängt an!", stern: 0, mini: null, ende: false,
      waren: je(() => []), fallen: {}, rabatt: je(false), stat: { mini: je(0), gesammelt: je(0), ereignis: je(0), ko: je(0), pech: je(0) },
      rest: 0, wahl: null, spur: null, spurNr: 0, sternVorbei: false, wuerfelArt: null, wareBenutzt: false, zielWare: null,
      extra: false, schluss: null, bonus: null, miniNr: 0, sternSeit: 1, gezogen: [], effekt: null,
      runden: (t && t.runden) || RUNDEN, brettNr: (t && BRETTER[t.karte] && t.karte) || VORGABE_KARTE, lp: je(LP), gift: je(0), fluch: je(false), bomben: {}, sperren: {}, haufen: {}, angebot: null, unterwegs: null,
      duell: null, duellNr: 0, zug: 0, bilanz: null, grund: null, rundeZug: -1,
      flut: false, lavaGruppe: -1, krusteRunde: 0, stempel: je(() => []), teuer: je(false),
      tempo: null, fig: null, team: null, sternZiel: 0, sternSieg: false, warenWeg: [], zugBis: 0, autoDran: -1, bank: 0 };
    s.stern = neuerStern(s);
    return s;
  },
  // Wahl im Hauptmenue (app.js: Aktionen _karte, _hm, _figur; partien.js: starten)
  vorStart(s, p, raum) {
    const nr = p.karte === "zufall" ? KARTEN_REIHE[zufall(KARTEN_REIHE.length)] : p.karte;
    if (BRETTER[nr] && nr !== s.brettNr) { s.brettNr = nr; s.stern = neuerStern(s); }
    if (rundenGueltig(p.runden)) s.runden = p.runden;
    if (p.hm) {
      const m = p.hm;
      s.tempo = { ...M.tempoNeu(), ...(m.tempo || {}) };
      s.sternZiel = m.sternAn ? m.sterne : 0;
      s.fig = p.mit.map((id, j) => (m.fig && m.fig[id]) || { farbe: j % M.FARBEN_ZAHL, hut: "party" });
      const team = p.mit.map((id) => (m.team && m.team[id] === 1 ? 1 : 0));
      s.team = m.teams && team.includes(0) && team.includes(1) ? team : null;
    }
    s.warenWeg = ((raum && raum.brettWeg) || []).filter((k) => String(k).startsWith("w:")).map((k) => k.slice(2));
    const dauer = s.runden ? `${s.runden} Runden` : "ohne Rundenende";
    s.meldung = `${B(s).emo} ${B(s).name} · ${dauer}${s.sternZiel ? ` · bis ${s.sternZiel} Sterne` : ""} – wer zuerst würfelt, fängt an!`;
    zugFrist(s);
  },
  startBereit: (p) => M.startGrund(p) === null,
  // Nachzuegler (Runde C, Punkt 8): steigt in ein laufendes Brettspiel ein, nachdem die Spielleitung bestaetigt hat
  // (spielleitung.js einlassen). Muenzen = Durchschnitt der anderen (abgerundet), 0 Sterne, Startfeld, volle Lebenspunkte.
  einlassen(s, name) {
    if (!s || s.ende || s.phase === "bonus" || !Array.isArray(s.pos)) return false;
    sicher(s);
    const n = s.pos.length;
    const schnitt = n ? Math.floor(s.muenzen.reduce((a, x) => a + x, 0) / n) : 5;
    s.pos.push(0); s.muenzen.push(schnitt); s.sterne.push(0); s.waren.push([]); s.rabatt.push(false);
    s.lp.push(LP); s.gift.push(0); s.fluch.push(false); s.stempel.push([]); s.teuer.push(false);
    Object.keys(s.stat).forEach((k) => { if (Array.isArray(s.stat[k])) s.stat[k].push(0); });
    if (Array.isArray(s.fig)) s.fig.push({ farbe: n % M.FARBEN_ZAHL, hut: "party" });
    if (Array.isArray(s.team)) { const t0 = s.team.filter((t) => t === 0).length; s.team.push(t0 <= s.team.length - t0 ? 0 : 1); }
    s.meldung = `🙋 ${name || "Neu"} steigt ein: ${schnitt} Münzen, 0 Sterne, Start auf dem Startfeld. ${s.meldung || ""}`.trim();
    return true;
  },
  // Gesamtwertung: wer am Ende vorne liegt (Sterne, dann Muenzen - wie die Rangliste); mit Teams das ganze Siegerteam
  ergebnis(s) {
    if (!s.ende) return null;
    if (s.team) { const t = siegerTeam(s); return { nr: "1", sieger: s.pos.map((_, j) => j).filter((j) => t < 0 || s.team[j] === t) }; }
    const best = (j) => s.sterne[j] * 10000 + s.muenzen[j];
    const max = Math.max(...s.pos.map((_, j) => best(j)));
    return { nr: "1", sieger: s.pos.map((_, j) => j).filter((j) => best(j) === max) };
  },
  // Spielleitung beendet ein Spiel ohne Rundenende: Bonussterne und Wertung wie nach der letzten Runde
  schlussJetzt(s) {
    if (s.ende || s.phase === "bonus") return false;
    s.mini = null; s.duell = null;
    bonusVergeben(s); s.phase = "bonus"; s.meldung = ""; s.zugBis = 0;
    return true;
  },
  zugFrist: (s) => (s && !s.ende ? s.zugBis || 0 : 0),
  // Zeit je Zug ist um: das Spiel zieht fuer den Spieler am Zug weiter - ohne seine Gegenstaende oder Muenzen auszugeben
  zugAuto(s, i) {
    s.autoDran = i;
    if (s.phase === "wuerfeln") return { typ: "wuerfeln" };
    if (s.phase === "laden" || s.phase === "ziel") return { typ: "nein" };
    return brettBot(s, i);
  },
  // jede Aktion: vorher/nachher vergleichen -> Bilanz fuer den Auftritt (Runde 3)
  aktion(s, i, a, namen, raum) {
    const vor = Array.isArray(s.pos) && a.typ !== "neustart" ? { m: s.muenzen.slice(), st: s.sterne.slice(), lp: Array.isArray(s.lp) ? s.lp.slice() : null,
      ko: s.stat && Array.isArray(s.stat.ko) ? s.stat.ko.slice() : null, sig: zugSig(s) } : null;
    s.grund = null;
    const r = aktionInnen(s, i, a, namen, raum);
    sternZielPruefen(s, namen);
    if (vor && zugSig(s) !== vor.sig) { s.zug = (s.zug || 0) + 1; bilanzZiehen(s, vor); zugFrist(s); }
    s.grund = null;
    return r;
  },
  render(s, ich, namen, raum) { return renderBrett(s, ich, namen, raum); },
  musik(s) { return s.ende ? null : "brett"; },
  // Computer-Spieler warten, bis das Brett fertig vorgefuehrt hat (app.js: botMindest)
  botMindest: (s) => Math.round(vorfuehrDauer(s) * 1000) + Math.round(400 * M.faktor(s, "bots")),
  botPause: (s) => Math.round(brettBotPause(s) * M.faktor(s, "bots")),
  botNochmal: (s) => Math.round(1500 * M.faktor(s, "bots")),
  sperrFaktor: (s) => M.faktor(s, "pause"),
  bot(s, i) { return brettBot(s, i); },
  nach(s, ich, senden, namen, raum) { return brettNach(s, ich, senden, namen, raum); },
};

// Zeit je Zug (Hauptmenue, Spieltempo): bis wann der Spieler am Zug Zeit hat. Die Vorfuehrung zaehlt nicht mit. War er schon einmal
// zu langsam (weg vom Handy), zieht das Spiel den Rest dieses Zugs zuegig durch.
const OHNE_FRIST = ["mini", "dkampf", "bonus", "ende", "einsatz"];
function zugFrist(s) {
  const t = testVorgabe();
  if (s.autoDran !== s.dran) s.autoDran = -1;
  if (s.ende || OHNE_FRIST.includes(s.phase) || (t && !t.zugzeit)) { s.zugBis = 0; return; }
  const zeit = s.autoDran === s.dran ? 1500 : (t && t.zugzeit) || M.faktor(s, "zug") * 1000;
  s.zugBis = Date.now() + Math.round(vorfuehrDauer(s) * 1000) + zeit;
}
// Sternziel (Hauptmenue): wer es erreicht, gewinnt sofort; mit Teams zaehlen die Sterne des ganzen Teams
const teamWert = (s, t, feld) => s.pos.reduce((a, _, j) => a + (s.team[j] === t ? s[feld][j] : 0), 0);
function siegerTeam(s) {
  const wert = (t) => teamWert(s, t, "sterne") * 10000 + teamWert(s, t, "muenzen");
  return wert(0) === wert(1) ? -1 : wert(0) > wert(1) ? 0 : 1;
}
function sternZielPruefen(s, namen) {
  if (!s.sternZiel || s.ende || !Array.isArray(s.sterne)) return;
  const erreicht = s.team ? [0, 1].some((t) => teamWert(s, t, "sterne") >= s.sternZiel) : s.sterne.some((x) => x >= s.sternZiel);
  if (!erreicht) return;
  s.ende = true; s.phase = "ende"; s.sternSieg = true; s.mini = null; s.duell = null; s.zugBis = 0;
  s.meldung = `⭐ ${s.sternZiel} Sterne erreicht – das Spiel ist aus!`;
}
export const brettRundeText = (s) => (s.runden ? `Runde ${Math.min(s.runde, s.runden)}/${s.runden}` : `Runde ${s.runde}`) + (s.sternZiel ? ` · bis ${s.sternZiel} ⭐` : "");
export const brettTeamZeile = (s) => (s.team ? `<div class="teamzeile">${[0, 1].map((t) => `<span class="t${t}">${M.TEAM_NAMEN[t]}: ⭐${teamWert(s, t, "sterne")} 🪙${teamWert(s, t, "muenzen")}</span>`).join("")}</div>` : "");
export function brettSiegerText(s, namen) {
  if (s.team) { const t = siegerTeam(s); return t < 0 ? "Unentschieden zwischen den Teams!" : `${M.TEAM_NAMEN[t]} gewinnt das Partybrett!`; }
  return `${namen[rangfolge(s)[0]] || ""} gewinnt das Partybrett!`;
}
// Standbild einer Karte fuer das Hauptmenue (eine Figur auf dem Start, nichts passiert)
export function vorschauStand(nr) {
  const s = brett.start(["Vorschau"]);
  s.brettNr = nr; s.stern = neuerStern(s); s.phase = "weiter"; s.meldung = "";
  return s;
}

// was sich durch eine Aktion sichtbar geaendert hat (fuer den Zug-Zaehler s.zug)
const zugSig = (s) => `${s.phase}|${s.dran}|${s.spurNr}|${s.runde}|${s.meldung}|${s.muenzen}|${s.sterne}|${s.lp}|${s.ende}|${s.mini ? Object.keys(s.mini.werte || {}).length : ""}`;
// Anlass der Aenderung fuer die Ereigniskarte; fest = spaetere Feldwirkung ueberschreibt ihn nicht (Sternkauf, Gegenstand)
function grundSetzen(s, emo, titel, text = "", mehr = {}) {
  if (s.grund && s.grund.fest && !mehr.fest) return;
  s.grund = { emo, titel, text: String(text || "").trim().slice(0, 160), ...mehr };
}
function bilanzZiehen(s, vor) {
  if (s.ende || ["mini", "dkampf", "bonus", "einsatz"].includes(s.phase)) return;
  const liste = [];
  s.pos.forEach((_, j) => {
    const e = { j, m: (s.muenzen[j] || 0) - (vor.m[j] || 0), st: (s.sterne[j] || 0) - (vor.st[j] || 0), lp: vor.lp && s.lp ? s.lp[j] - vor.lp[j] : 0 };
    // K.O.: Lebenspunkte springen auf voll - gezeigt wird der Treffer, nicht das Auffuellen
    if (vor.ko && s.stat.ko && s.stat.ko[j] > (vor.ko[j] || 0) && vor.lp) e.lp = -vor.lp[j];
    if (e.m || e.st || e.lp) liste.push(e);
  });
  const gr = s.grund;
  if (!liste.length && !(gr && gr.immer)) return;
  liste.sort((x, y) => (x.j === s.dran ? -1 : y.j === s.dran ? 1 : 0));
  s.bilanz = { nr: ((s.bilanz && s.bilanz.nr) || 0) + 1, zug: s.zug, emo: gr ? gr.emo : "✨", titel: gr ? gr.titel : "", text: gr ? gr.text : "", liste };
}

function aktionInnen(s, i, a, namen, raum) {
  {
    if (a.typ === "neustart") {
      const wahl = { runden: s.runden, brettNr: s.brettNr };
      const bleibt = Object.fromEntries(["tempo", "fig", "team", "sternZiel", "warenWeg"].map((k) => [k, s[k]]));
      Object.assign(s, brett.start(namen), bleibt);
      if (rundenGueltig(wahl.runden)) s.runden = wahl.runden;
      if (BRETTER[wahl.brettNr] && wahl.brettNr !== s.brettNr) { s.brettNr = wahl.brettNr; s.stern = neuerStern(s); }
      zugFrist(s);
      return s;
    }
    if (s.ende) return;
    sicher(s);
    const dran = i === s.dran;
    if (s.phase === "wuerfeln" && dran && a.typ === "einstellung" && einstellbar(s)) einstellen(s, a, namen);
    else if (s.phase === "wuerfeln" && dran && a.typ === "wuerfeln") wuerfeln(s, i, namen, raum);
    else if (s.phase === "wuerfeln" && dran && a.typ === "ware") wareEinsetzen(s, i, a.ware, namen);
    else if (s.phase === "ziel" && dran && a.typ === "ziel" && zielListe(s, i, s.zielWare).includes(a.ziel)) zielWirkung(s, i, a.ziel, namen);
    else if (s.phase === "ziel" && dran && a.typ === "nein") { if (s.zielWare) s.waren[i].push(s.zielWare); s.zielWare = null; s.wareBenutzt = false; s.phase = "wuerfeln"; s.meldung = `${namen[i]} steckt den Gegenstand wieder ein.`; }
    else if (s.phase === "weg" && dran && a.typ === "weg" && wege(s, s.pos[i]).includes(a.ziel)) { s.wahl = a.ziel; if (laufen(s, i)) nachLauf(s, i, namen, raum); }
    else if (s.phase === "stern" && dran && (a.typ === "kaufen" || a.typ === "nein")) {
      if (a.typ === "kaufen" && s.muenzen[i] >= sternPreis(s, i)) {
        const p = sternPreis(s, i);
        s.muenzen[i] -= p; s.sterne[i]++; s.rabatt[i] = false;
        s.meldung = `⭐ ${namen[i]} kauft einen Stern${p < STERNPREIS ? ` für nur ${p}` : ""}! Alle anderen trinken 1 Schluck.`;
        s.stern = neuerStern(s); s.sternSeit = s.runde;
        effekt(s, "stern", i);
        grundSetzen(s, "⭐", "Stern gekauft!", `${namen[i]} zahlt ${p} Münzen${s.ohne ? "" : " – alle anderen trinken 1 Schluck"}`, { fest: true });
      }
      feldWirkung(s, i, artVon(s, s.pos[i]), namen, raum);
    } else if (s.phase === "laden" && dran && a.typ === "kaufware") {
      const w = ware(a.ware);
      if (!w || !angebot(s).includes(w.id) || s.muenzen[i] < preisVon(s, i, w) || s.waren[i].length >= BEUTEL) return;
      s.muenzen[i] -= preisVon(s, i, w); s.waren[i].push(w.id);
      s.meldung = `🛒 ${namen[i]} kauft: ${w.emo} ${w.name}.`;
      grundSetzen(s, "🛒", `Gekauft: ${w.emo} ${w.name}`, w.text, { fest: true });
      s.phase = "weiter"; s.angebot = null;
    } else if (s.phase === "laden" && dran && a.typ === "nein") { s.meldung = `🛒 ${namen[i]} kauft nichts.`; s.phase = "weiter"; s.angebot = null; }
    // Duellfeld (Grossumbau Runde 1, Nico 01.11.2026): kein Wuerfel mehr - der Herausforderer waehlt den Gegner, dann
    // spielen beide ein echtes Duell (duell.js). Einsatz fest 5 Muenzen; Trinken und Schaden wie bisher.
    else if (s.phase === "duell" && dran && a.typ === "duell" && Number.isInteger(a.ziel) && a.ziel !== i && a.ziel >= 0 && a.ziel < s.pos.length) {
      s.duell = DU.neu(i, a.ziel, s.duellNr++, namen || []);
      s.duell.kopf = kopfgeldAuf(s);   // wer beim Herausfordern vorne liegt (Kopfgeld, Runde C)
      s.phase = "dkampf";
      s.meldung = `⚔️ ${namen[i]} fordert ${namen[a.ziel]} zum Duell heraus – Einsatz ${DU.EINSATZ} Münzen!${s.duell.kopf >= 0 && [i, a.ziel].includes(s.duell.kopf) ? ` 🎯 Auf ${namen[s.duell.kopf]} steht ein Kopfgeld von ${KOPFGELD} Münzen!` : ""}`;
    } else if (s.phase === "dkampf") duellAktion(s, i, a, namen, raum);
    else if (s.phase === "weiter" && a.typ === "weiter") zugEnde(s, namen, raum);
    else if (s.phase === "aufgabe" && a.typ === "aufgabe" && dran) {
      if (!a.ok) { s.muenzen[i] = Math.max(0, s.muenzen[i] - AUFGABE_STRAFE); s.meldung = `🙅 ${namen[i]} kneift – −${AUFGABE_STRAFE} Münzen.`; grundSetzen(s, "🙅", "Aufgabe verweigert", "", { fest: true }); }
      else s.meldung = `✅ ${namen[i]} hat die Aufgabe erledigt.`;
      zugEnde(s, namen, raum);
    } else if (s.phase === "bonus" && a.typ === "weiter") { s.ende = true; s.phase = "ende"; }
    else if (s.phase === "mini") miniAktion(s, i, a, namen, raum);
    else if (s.phase === "einsatz" && s.mini) einsatzAktion(s, i, a);
  }
}

function renderBrett(s, ich, namen, raum) {
  {
    sicher(s);
    // Zeigt der Beamer das Brett, steht die ganze Tafel dort; bei vielen Gaesten bleiben am Handy nur "ich" und wer dran ist,
    // sonst muesste man erst an 20 Namen vorbei zum Wuerfel
    const kurzTafel = amBeamer() && !s.ende && namen.length > 6;
    const tafel = `${brettTeamZeile(s)}<div class="tafel">${namen.map((nm, j) => kurzTafel && j !== ich && j !== s.dran ? "" : `<div class="${j === s.dran && s.phase !== "mini" ? "dran" : ""}"><span class="farbe f${fk(s, j)}"></span><b>${esc(nm)}</b>
      <span>⭐${s.sterne[j]}</span><span>🪙${s.muenzen[j]}</span><span class="lp ${s.lp[j] <= 10 ? "niedrig" : ""}" title="Lebenspunkte">❤️${s.lp[j]}</span>${s.gift[j] ? `<span title="vergiftet">🧪</span>` : ""}${s.fluch[j] ? `<span title="Schneckenfluch">🐌</span>` : ""}${s.teuer[j] ? `<span title="zahlt im nächsten Zug doppelt">🏷️×2</span>` : ""}${B(s).trick === "kaufhaus" ? `<span title="Stempel: verschiedene Läden besucht">🛍️${s.stempel[j].length}/${STEMPEL_ZIEL}</span>` : ""}${s.waren[j].length ? `<span class="beutel" title="Gegenstände">${s.waren[j].map((w) => ware(w).emo).join("")}</span>` : ""}</div>`).join("")}</div>`;
    const m = s.meldung || "";
    // Muenzen, Sterne und Treffer klingen seit Runde 3 im Auftritt (brett3d.js, im Takt der fliegenden Muenzen) - hier nur
    // noch die Klaenge ohne Bilanz; sie kommen, wenn die Figur angekommen ist
    const klang = /❓/.test(m) ? "magie" : /Duell/.test(m) ? "spannung" : /Trinkfeld|Aufgabenfeld|🛒|Portal/.test(m) ? "pop" : "";
    const nachLand = s.wurf && s.spur && !s.spur.sprung ? Math.round((WURF.los / M.faktor(s, "wuerfel") + Math.max(0, s.spur.felder.length - 1) / (LAUF * M.faktor(s, "figuren"))) * 1000) : 0;
    const meldung = `<div class="meldung">${esc(m)}</div>${klang ? `<i hidden data-key="bt-${s.runde}-${s.dran}-${m.length}-${klang}" data-ton="${klang}" data-ton-nach="${nachLand}"></i>` : ""}`;
    const schluss = s.schluss && !s.ende ? `<div class="schlussband">🔥 Schlussrunden: ${esc(SCHLUSS[s.schluss].text)}</div>` : "";
    if (s.ende) {
      const rang = rangfolge(s);
      return `${tafel}<div class="urteil">🏆 ${s.team ? esc(brettSiegerText(s, namen)) : `${nameIn(s, namen, rang[0])} gewinnt das Partybrett!`}</div>
        ${s.sternSieg ? `<p class="mitte leise">⭐ ${s.sternZiel} Sterne erreicht – das Spiel endet sofort.</p>` : ""}
        <div id="brett3d" class="brett3d sieger"></div>
        <ol class="rangliste">${rang.map((j) => `<li>${nameIn(s, namen, j)}: ⭐${s.sterne[j]} 🪙${s.muenzen[j]}${s.stat.ko[j] ? ` · 💫${s.stat.ko[j]}× K.O.` : ""}</li>`).join("")}</ol>
        ${bonusListe(s, namen)}
        <p class="mitte">${s.ohne ? `🎯 Letzter Platz: ${esc(T.AUFGABEN[(s.pos.length * 7 + s.muenzen.reduce((x, y) => x + y, 0)) % T.AUFGABEN.length])}` : "Letzter Platz trinkt 3 Schlucke 🍺"}</p>${knopf("Neues Spiel", { typ: "neustart" }, "gross")}`;
    }
    if (s.phase === "bonus") {
      return `${tafel}<div class="frage">🌟 Bonussterne!</div><p class="mitte leise">Nach ${s.runden || s.runde} Runden gibt es noch Sterne für besondere Leistungen.</p>${bonusListe(s, namen)}
        <i hidden data-key="btbonus-${s.runde}" data-ton="stern"></i><i hidden data-ergebnis="bw-bonus"></i>${knopf("Weiter", { typ: "weiter" }, "gross")}`;
    }
    if (s.phase === "einsatz" && s.mini) return `${tafel}${einsatzRender(s, ich, namen)}`;
    if (s.phase === "mini") return `${tafel}<i hidden data-key="btmini-${s.runde}-${s.mini && s.mini.art}" data-ton="los"></i>${miniRender(s, ich, namen)}`;
    if (s.phase === "dkampf" && s.duell) return `${tafel}${duellRender(s, ich, namen)}`;
    const bb = B(s);
    const istDran = ich === s.dran;
    // Beamer zeigt das Brett: hier nur Kamera-Flaeche (wer am Zug ist) und kleine Karte, dazu die Ereigniskarte
    const wand = amBeamer();
    const infoZeile = `${bb.emo} ${brettRundeText(s)}${s.wurf ? ` · 🎲 ${s.wuerfe && s.wuerfe.length > 1 ? `${s.wuerfe.join("+")} = ` : ""}${s.wurf}` : ""}`;
    const lageText = brettLage(s, namen);
    const lage = lageText ? `<div class="brett-kartenlage">${esc(lageText)}</div>` : "";
    const brettHtml = wand ? "" : `<div id="brett3d" class="brett3d welt-${bb.welt}">${brett2d(s, namen)}<div class="brett3d-info">${infoZeile}</div></div>`;
    const wer = esc(namen[s.dran]);
    let steuer = "";
    if (s.phase === "wuerfeln") {
      if (istDran) {
        const art = s.wuerfelArt ? ware(s.wuerfelArt) : null;
        const nutzbar = nutzbareWaren(s, ich);
        steuer = knopf("🎲 Würfeln", { typ: "wuerfeln" }, "gross")   // Ton und Vibration "du bist dran": app.js (dranPruefen)
          + (s.fluch[ich] ? `<p class="mitte leise">🐌 Schneckenfluch: dieser Wurf zeigt nur 1 oder 2.</p>` : "")
          + (art ? `<p class="mitte leise">Aktiv: ${art.emo} ${esc(art.name)}</p>` : "")
          + (nutzbar.length ? `<p class="mitte leise klein">Oder vorher einen Gegenstand einsetzen:</p><div class="raster2 waren">${nutzbar.map((w) => knopf(`${ware(w).emo} ${esc(ware(w).name)}<small>${esc(ware(w).text)}</small>`, { typ: "ware", ware: w }, "zweit")).join("")}</div>` : "");
      } else steuer = `<p class="mitte leise">${wer} würfelt …</p>`;
    }
    if (s.phase === "ziel") steuer = istDran ? `<p class="mitte">${esc(ware(s.zielWare).emo + " " + ware(s.zielWare).name)}: gegen wen?</p><div class="raster">${zielListe(s, ich, s.zielWare).map((j) => knopf(`${esc(namen[j])}<small>🪙${s.muenzen[j]} ❤️${s.lp[j]}${s.waren[j].length ? ` · ${s.waren[j].map((w) => ware(w).emo).join("")}` : ""}</small>`, { typ: "ziel", ziel: j }, "gross")).join("")}</div>${knopf("Doch nicht", { typ: "nein" }, "zweit")}`
      : `<p class="mitte leise">${wer} setzt einen Gegenstand ein …</p>`;
    if (s.phase === "weg") steuer = istDran ? `<p class="mitte">Abzweigung! Welcher Weg?</p><div class="raster wege">${wege(s, s.pos[ich]).map((z) => knopf(`${bb.wegname[z] || "➡️ Weiter"}<small>⭐ in ${sternAbstand(s, z) + 1} Feldern · noch ${s.rest} Schritte</small>`, { typ: "weg", ziel: z }, "gross")).join("")}</div>`
      : `<p class="mitte leise">${wer} wählt einen Weg …</p>`;
    if (s.phase === "stern") steuer = istDran ? `<div class="raster2">${knopf(`⭐ Kaufen (${sternPreis(s, ich)})`, { typ: "kaufen" }, "gross gelb")}${knopf("Nein", { typ: "nein" }, "gross")}</div>` : `<p class="mitte leise">${wer} überlegt …</p>`;
    if (s.phase === "laden") steuer = istDran ? `<p class="mitte">${ladenTitel(s, ich)} – ${s.waren[ich].length}/${BEUTEL} im Beutel, du hast 🪙${s.muenzen[ich]}${s.teuer[ich] ? " · 🏷️ alles doppelt" : ""}</p><div class="laden">${angebot(s).map((id) => { const w = ware(id), preis = preisVon(s, ich, w); const geht = s.muenzen[ich] >= preis && s.waren[ich].length < BEUTEL;
        return knopf(`<span>${w.emo} ${esc(w.name)} <b>${preis} 🪙</b></span><small>${esc(w.text)}</small>`, { typ: "kaufware", ware: id }, "ware-knopf", geht ? "" : "disabled"); }).join("")}</div>${knopf("🚪 Nichts kaufen", { typ: "nein" }, "zweit")}`
      : `<p class="mitte leise">${wer} stöbert im Laden …</p>`;
    if (s.phase === "duell") steuer = istDran ? `<p class="mitte">Wen forderst du heraus? Ihr spielt ein echtes Duell – der Verlierer gibt ${DU.EINSATZ} Münzen ab, trinkt 2 Schlucke und verliert 5 ❤️.</p><div class="raster">${namen.map((nm, j) => (j === ich ? "" : knopf(`${esc(nm)}<small>🪙${s.muenzen[j]} ❤️${s.lp[j]}</small>`, { typ: "duell", ziel: j }, "gross"))).join("")}</div>` : `<p class="mitte leise">${wer} wählt einen Gegner …</p>`;
    if (s.phase === "weiter") steuer = knopf("Weiter", { typ: "weiter" }, "gross");
    if (s.phase === "aufgabe") steuer = istDran ? `<div class="raster2">${knopf("✅ Erledigt", { typ: "aufgabe", ok: true }, "gross gruen")}${knopf(`🙅 Keine Lust (−${AUFGABE_STRAFE} 🪙)`, { typ: "aufgabe", ok: false }, "gross")}</div>`
      : `<p class="mitte leise">${wer} ist mit der Aufgabe dran …</p>`;
    // nach dem Wurf steht das Feld erst eine Weile: Weiter, Kaufen/Nein, Wegwahl, Laden und die Duell-Wahl sind kurz gesperrt
    // (app.js), damit ein zweiter Tipp auf "Wuerfeln" nicht gleich das Ergebnis wegtippt
    const nachWurf = ["weiter", "stern", "duell", "aufgabe", "weg", "laden"].includes(s.phase) ? `<i hidden data-ergebnis="bw-${s.runde}-${s.dran}-${s.phase}-${m.length}"></i>` : "";
    // Zeit je Zug: nur wer dran ist, sieht sie laufen (Sekundentakt in app.js, data-gcd)
    if (istDran && s.zugBis) steuer += `<p class="zugzeit">⏳ noch <span data-gcd="${s.zugBis}" data-sek>${Math.round(M.faktor(s, "zug"))}</span> Sekunden</p>`;
    if (wand) {
      const karte = s.bilanz && s.bilanz.zug === s.zug ? ereignisKarte(s, s.bilanz, namen) : "";
      const kamera = istDran ? `<div class="kamera-flaeche" data-kamera-flaeche role="application" aria-label="Kamera am Beamer führen">
          <span>🎥 Kamera am Beamer</span><small>ein Finger schiebt · zwei Finger zoomen und drehen</small></div>
        <div class="raster2 kamera-knoepfe"><button class="zweit" data-kf="karte">🗺️ Karte ansehen</button><button class="zweit" data-kf="zurueck">🎯 Zurück zur Figur</button></div>` : "";
      return `${tafel}${schluss}<div class="brett-wand-info">📽️ ${infoZeile} · das Brett läuft groß am Beamer</div>${lage}${karte}${meldung}${nachWurf}${steuer}${kamera}
        <div class="brett-minikarte" aria-label="Kleine Karte">${brett2d(s, namen)}</div>`;
    }
    return `${tafel}${schluss}${brettHtml}${lage}${meldung}${nachWurf}${steuer}`;
  }
}

// Ereigniskarte als HTML (Handy, wenn das 3D-Brett am Beamer laeuft): Symbol, Anlass, je Spieler die Aenderung
function ereignisKarte(s, b, namen) {
  const vz = (x) => (x > 0 ? "+" : "−") + Math.abs(x);
  const chips = b.liste.map((e) => {
    const teile = [e.st ? `${vz(e.st)} ⭐` : "", e.m ? `${vz(e.m)} 🪙` : "", e.lp ? `${vz(e.lp)} ❤️` : ""].filter(Boolean);
    const gut = (e.st || 0) * 20 + (e.m || 0) + (e.lp || 0) * 0.3;
    return `<span class="b3k-chip ${gut >= 0 ? "gut" : "schlecht"}"><i class="farbe f${fk(s, e.j)}"></i>${esc(namen[e.j] || "")} <b>${teile.join(" ")}</b></span>`;
  }).join("");
  return `<div class="b3-karte im-fluss" role="status" data-key="bk-${b.nr}"><span class="b3k-emo">${esc(b.emo || "✨")}</span><span class="b3k-text">${b.titel ? `<b>${esc(b.titel)}</b>` : ""}${b.text ? `<small>${esc(b.text)}</small>` : ""}</span>${chips ? `<span class="b3k-chips">${chips}</span>` : ""}</div>`;
}

// Computer-Mitspieler: wuerfeln, Wege, Laden, Gegenstaende, kaufen, duellieren und spielen die Minispiele mit glaubwuerdigen Werten
function brettBotPause(s) {
  return s.phase === "weiter" || s.phase === "bonus" ? 2800 : s.phase === "mini" ? 4500 : s.phase === "dkampf" ? (s.duell && s.duell.phase === "ende" ? 3800 : 1600) : 1400;
}
function brettBot(s, i) {
  {
    if (s.ende) return null;
    sicher(s);
    const n = s.pos.length;
    // Duell: Spielwahl und Verlauf je Bot-Staerke (duell.js); nach dem Ergebnis blaettert der Herausforderer weiter
    if (s.phase === "dkampf") {
      if (!s.duell) return { typ: "weiter" };
      if (s.duell.phase === "ende") return i === s.dran ? { typ: "weiter" } : null;
      return DU.bot(s.duell, i);
    }
    if (s.phase === "mini") {
      const m = s.mini;
      if (!m || m.fertig || m.werte[i] !== undefined || !teilVon(s, m).includes(i)) return null;
      if (R.istNeu(m.art)) return { typ: "mini", wert: R.botWert(m.art, m, i) };
      const r = (a, b) => a + zufall(b - a + 1);
      const wert = m.art === "tappen" ? r(18, 36) : m.art === "farbwort" ? r(4, 11) : m.art === "gedaechtnis" ? r(4, 8)
        : m.art === "reaktion" ? (Math.random() < 0.08 ? -1 : r(240, 470)) : Math.round(T.SCHAETZ[m.frage][1] * (0.55 + Math.random() * 0.9));
      return { typ: "mini", wert };
    }
    if (s.phase === "bonus") return { typ: "weiter" };
    // Einsatz: Computer setzen meist ein bisschen, nie mehr als sie haben
    if (s.phase === "einsatz") {
      const m = s.mini;
      if (!m || m.einsatz[i] !== undefined || !teilVon(s, m).includes(i)) return null;
      const geht = EINSATZ_STUFEN.filter((w) => w <= s.muenzen[i]);
      return { typ: "setzen", wert: Math.random() < 0.35 ? 0 : geht[zufall(geht.length)] };
    }
    if (s.dran !== i) return null;
    if (s.phase === "wuerfeln") {
      const nutz = nutzbareWaren(s, i);
      if (nutz.length && Math.random() < 0.6) return { typ: "ware", ware: nutz[0] };
      return { typ: "wuerfeln" };
    }
    if (s.phase === "ziel") { const z = zielListe(s, i, s.zielWare).sort((a, b) => s.muenzen[b] - s.muenzen[a]); return z.length ? { typ: "ziel", ziel: z[0] } : { typ: "nein" }; }
    if (s.phase === "weg") { const nx = wege(s, s.pos[i]), d = nx.map((z) => sternAbstand(s, z)); return { typ: "weg", ziel: nx[d.indexOf(Math.min(...d))] }; }
    if (s.phase === "stern") return { typ: "kaufen" };
    if (s.phase === "laden") { const geht = angebot(s).filter((id) => s.muenzen[i] - preisVon(s, i, ware(id)) >= 5 && s.waren[i].length < BEUTEL); return geht.length ? { typ: "kaufware", ware: geht[zufall(geht.length)] } : { typ: "nein" }; }
    if (s.phase === "duell") { const andere = [...Array(n).keys()].filter((j) => j !== i).sort((a, b) => s.muenzen[b] - s.muenzen[a]); return { typ: "duell", ziel: andere[0] }; }
    if (s.phase === "weiter") return { typ: "weiter" };
    if (s.phase === "aufgabe") return { typ: "aufgabe", ok: true };
    return null;
  }
}

// Kamera-Leitung des Spielers am Zug (kamera_frei.js): Kanal stand/live/<pid>kam, Schluessel je Zug
function kameraLeitung(s, ich, raum, pid = null) {
  const p = pid ? { pid } : raum && raum.partien ? Object.values(raum.partien).find((x) => x && x.s === s) : null;
  const kanal = p && p.pid ? `${p.pid}kam` : null;
  const key = `${s.runde}-${s.dran}`;
  const brettZug = !s.ende && !["mini", "dkampf", "bonus"].includes(s.phase);
  const darf = brettZug && ich >= 0 && ich === s.dran;
  return { darf, sendet: darf && !!kanal, key, kanal,
    senden: (v) => { if (kanal) DU.kanalSchreiben(kanal, s.dran, key, v); },
    lesen: () => (kanal ? DU.liveVon(kanal, s.dran, key) : null) };
}
export const brettKamera = kameraLeitung;   // fuer den Beamer (beamer_spiele.js)
export const brettMuster = (s) => muster(s);
export const brettVon = (s) => B(s);
// Kartenlage, dazu Bankinhalt und Kopfgeld (Runde C) - Handy und Beamer lesen dieselbe Zeile
export const brettLage = (s, namen = null) => {
  const kg = Array.isArray(s.pos) && !s.ende ? kopfgeldAuf(s) : -1;
  return [kartenInfo(s, B(s)), s.bank ? `🏦 Bank: ${s.bank} 🪙` : "", kg >= 0 ? `🎯 Kopfgeld ${KOPFGELD} 🪙 auf ${namen && namen[kg] ? namen[kg] : "den Führenden"}` : ""].filter(Boolean).join(" · ");
};
// Zuschauer-Wetten (Runde C, Punkt 36): wer nicht mitspielt, tippt am Handy auf den Sieger (p.wetten {id: Spielernummer},
// app.js). Bis vor den letzten zwei Runden darf man setzen und umsetzen; ohne Rundenende immer. Richtige Wette = Punkte in der
// Gesamtwertung (wertung.js, "Partybrett-Wette").
export const wetteOffen = (s) => !!s && Array.isArray(s.pos) && !s.ende && s.phase !== "bonus" && (!s.runden || s.runde <= s.runden - 2);
export function wettHTML(s, namen, meine, wetten = {}) {
  if (!s || s.ende || !Array.isArray(s.pos)) return "";
  const zahl = (j) => Object.values(wetten || {}).filter((x) => x === j).length;
  if (!wetteOffen(s)) return Number.isInteger(meine) ? `<div class="hinweisbox wette">🔮 Deine Wette: <b>${esc(namen[meine] || "")}</b> – Wetten sind geschlossen, Daumen drücken!</div>` : "";
  return `<div class="karte wette"><p class="mitte"><b>🔮 Wer gewinnt das Partybrett?</b><br><small class="leise">Richtig getippt = Punkte in der Gesamtwertung. Setzen geht bis vor den letzten 2 Runden.</small></p>
    <div class="raster">${namen.map((nm, j) => knopf(`${esc(nm)}<small>⭐${s.sterne[j]} 🪙${s.muenzen[j]}${zahl(j) ? ` · 🔮${zahl(j)}` : ""}</small>`, { typ: "_wette", ziel: j }, meine === j ? "gross gelb" : "gross")).join("")}</div></div>`;
}
// Kopfgeld (Runde C, Punkt 24): wer den Fuehrenden (meiste Sterne, dann Muenzen) im Duell schlaegt, bekommt KOPFGELD Bonusmuenzen.
// Nur bei klarer Fuehrung (kein Gleichstand an der Spitze) - sonst gibt es keinen Gejagten.
export const KOPFGELD = 5;
export function kopfgeldAuf(s) {
  if (!Array.isArray(s.pos) || s.pos.length < 2) return -1;
  const r = rangfolge(s), a = r[0], b = r[1];
  return s.sterne[a] === s.sterne[b] && s.muenzen[a] === s.muenzen[b] ? -1 : a;
}
// was die 3D-Ansicht von der Karte braucht (Handy und Beamer gleich)
export function brett3dDaten(s) {
  const bb = B(s);
  return { lage: bb.lage, next: bb.next, waren: WAREN, nh: bb.nh, welt: bb.welt, radius: bb.radius, burg: bb.burg, burgGroesse: bb.burgGroesse, podest: bb.podest,
    teiche: bb.teiche, etagen: bb.etagen, aufzug: bb.aufzug, zustand: kartenZustand(s, bb), fig: s.fig || null };
}
export { endSieger as brettEndSieger, miniSieger as brettMiniSieger };

// Waehrend das Brett vorfuehrt (Wurf, Laufen, Auftritt), sind Weiter, Kaufen, Wegwahl usw. gesperrt - je Geraet ab dem
// ersten Anblick des neuen Stands. Danach geht es nur bewusst weiter (Nico 01.11.2026: Tempo runter).
const SPERR = new Set(["weiter", "kaufen", "nein", "kaufware", "weg", "duell", "aufgabe", "ziel"]);
let sperre = { key: "", bis: 0, timer: null };
function vorfuehrSperre(s) {
  const key = `${s.zug || 0}-${s.spurNr || 0}`;
  if (key !== sperre.key) {
    sperre.key = key;
    sperre.bis = performance.now() + vorfuehrDauer(s) * 1000;
    // CSS-Animationen des Bretts (Titelkarte, Ereigniskarte) folgen dem Animationstempo
    document.documentElement.style.setProperty("--brett-anim", String(1 / M.faktor(s, "kamera")));
    clearTimeout(sperre.timer);
  }
  const rest = sperre.bis - performance.now();
  const knoepfe = [...document.querySelectorAll("#app .spielflaeche button[data-a], #app button[data-a]")].filter((k) => {
    try { return SPERR.has(JSON.parse(k.dataset.a).typ); } catch (e) { return false; }
  });
  if (rest <= 60) {
    let frei = false;
    knoepfe.forEach((k) => { if (k.dataset.vorfuehrung !== undefined) { k.disabled = false; delete k.dataset.vorfuehrung; frei = true; } });
    // Controller: Fokus auf den jetzt wieder freien Knopf (app.js hoert darauf)
    if (frei) document.dispatchEvent(new CustomEvent("pa-entsperrt"));
    return;
  }
  knoepfe.forEach((k) => { if (!k.disabled) { k.disabled = true; k.dataset.vorfuehrung = ""; } });
  clearTimeout(sperre.timer);
  sperre.timer = setTimeout(() => vorfuehrSperre(s), rest + 30);
}

// Kamera-Flaeche am Handy (Beamer zeigt das Brett): Eingaben fuehren die Kamera am Beamer, die kleine Karte zeigt, wohin
let flaecheLauf = null, flaecheWurf = null;
function flaecheTakt() {
  const el = document.querySelector("[data-kamera-flaeche]");
  if (!el) { flaecheLauf = null; return; }
  const t = performance.now(), dt = Math.min(0.1, (t - (flaecheLauf || t)) / 1000);
  flaecheLauf = t;
  if (KF.padTakt(dt, 500)) blickMarke();
  requestAnimationFrame(flaecheTakt);
}
function blickMarke() {
  const svg = document.querySelector(".brett-minikarte svg");
  if (!svg) return;
  let m = svg.querySelector(".blickmarke");
  if (!KF.K.an) { if (m) m.remove(); return; }
  if (!m) { m = document.createElementNS("http://www.w3.org/2000/svg", "circle"); m.setAttribute("class", "blickmarke"); svg.appendChild(m); }
  m.setAttribute("cx", KF.K.x.toFixed(2)); m.setAttribute("cy", KF.K.z.toFixed(2)); m.setAttribute("r", Math.max(1.2, KF.K.a * 0.16).toFixed(2));
}

function brettNach(s, ich, senden, namen, raum) {
  {
    const c = document.getElementById("brett3d");
    const bb = B(s), opt = { ...brett3dDaten(s), namen: namen || [] };
    KF.welt(bb.radius);
    // Siegerehrung in 3D: am Ende das Treppchen nach der Rangliste, nach einem Minispiel die Gewinner oben
    if (c && c.classList.contains("sieger")) {
      const sg = s.ende ? endSieger(s) : s.phase === "mini" && s.mini && s.mini.fertig ? miniSieger(s, s.mini) : null;
      if (!sg || !brett3dZeigen(c, s, muster(s), opt, sg)) c.remove();
    }
    if (s.phase === "mini") return miniNach(s, ich, senden);
    if (s.phase === "einsatz") return einsatzNach(s, senden);
    if (s.phase === "dkampf") return DU.nach(s.duell, ich, senden);
    const kam = kameraLeitung(s, ich, raum);
    if (c && !s.ende && s.phase !== "bonus") {
      const zweiD = c.querySelector(".brett2d");
      if (brett3dZeigen(c, s, muster(s), { ...opt, kamera: kam }) && zweiD) zweiD.remove();
    }
    // Handy neben dem Beamer: Kamera-Flaeche fuer den Spieler am Zug
    const fl = document.querySelector("[data-kamera-flaeche]");
    if (fl) {
      const L = bb.lage[s.pos[s.dran]] || { x: 0, z: 0 };
      KF.steuerung({ ...kam, start: () => ({ x: L.x, z: L.z, a: 12, d: 0 }) });
      // gewuerfelt: der Freiflug endet, Beamer und Zuschauer folgen wieder der Figur (ohne Beamer macht das brett3d.js;
      // hier laeuft kein 3D-Bild, und die Wand wuerde sonst weiter die alte Lage von der Leitung nehmen)
      const wurfKey = `${s.runde}-${s.dran}-${s.spurNr}`;
      if (flaecheWurf !== wurfKey) { if (flaecheWurf !== null && KF.K.an) KF.zurueck(); flaecheWurf = wurfKey; }
      KF.binden(fl, { beiAenderung: blickMarke });
      document.querySelectorAll("[data-kf]").forEach((k) => {
        k.onclick = () => { if (k.dataset.kf === "karte") KF.karteAnsehen({ x: 0, z: 0.8, a: bb.radius * 2.05, d: 0 }); else KF.zurueck(); blickMarke(); };
      });
      blickMarke();
      if (!flaecheLauf) { flaecheLauf = performance.now(); requestAnimationFrame(flaecheTakt); }
    }
    if (!s.ende && s.phase !== "bonus") vorfuehrSperre(s);
  }
}

// alte Staende (vor dem Ausbau) bekommen die neuen Felder
function sicher(s) {
  const je = (v) => s.pos.map(() => (typeof v === "function" ? v() : v));
  if (!Array.isArray(s.waren)) s.waren = je(() => []);
  if (!s.fallen || typeof s.fallen !== "object") s.fallen = {};
  if (!Array.isArray(s.rabatt)) s.rabatt = je(false);
  if (!s.stat) s.stat = { mini: je(0), gesammelt: je(0), ereignis: je(0) };
  if (!Array.isArray(s.stat.ko)) s.stat.ko = je(0);
  if (!Array.isArray(s.stat.pech)) s.stat.pech = je(0);
  if (!Array.isArray(s.gezogen)) s.gezogen = [];
  if (!rundenGueltig(s.runden)) s.runden = RUNDEN;
  if (!BRETTER[s.brettNr]) s.brettNr = 1;
  if (!Array.isArray(s.warenWeg)) s.warenWeg = [];
  if (!Array.isArray(s.stempel)) s.stempel = je(() => []);
  if (!Array.isArray(s.teuer)) s.teuer = je(false);
  if (!Number.isInteger(s.lavaGruppe)) s.lavaGruppe = -1;
  if (!Array.isArray(s.lp)) s.lp = je(LP);
  if (!Array.isArray(s.gift)) s.gift = je(0);
  if (!Array.isArray(s.fluch)) s.fluch = je(false);
  ["bomben", "sperren", "haufen"].forEach((k) => { if (!s[k] || typeof s[k] !== "object") s[k] = {}; });
  if (!Number.isInteger(s.duellNr)) s.duellNr = 0;
  if (!Number.isInteger(s.zug)) s.zug = 0;
  if (!Number.isInteger(s.bank)) s.bank = 0;
  if (s.phase === "dkampf" && !s.duell) s.phase = "weiter";
}

// ---------------------------------------------------------------- Duell (duell.js)
function duellAktion(s, i, a, namen, raum) {
  const du = s.duell;
  if (du.phase === "ende") {
    if (a.typ === "weiter") { s.duell = null; zugEnde(s, namen, raum); }
    return;
  }
  if (!DU.aktion(du, i, a, { muenzen: s.muenzen })) return;
  if (du.phase === "ende") duellFolgen(s, du, namen);
}
// Einsatz fest 5 Muenzen (Nico 01.11.2026); Verlierer trinkt 2 Schlucke und verliert 5 Lebenspunkte (wie bisher)
function duellFolgen(s, du, namen) {
  const sg = du.sieger, vl = du.verlierer;
  const beute = Math.min(DU.EINSATZ, s.muenzen[vl]);
  s.muenzen[vl] -= beute; geben(s, sg, beute);
  du.beute = beute;
  s.meldung = `⚔️ ${namen[sg]} gewinnt das Duell gegen ${namen[vl]} – ${beute} ${beute === 1 ? "Münze" : "Münzen"} an ${namen[sg]}, ${namen[vl]} trinkt 2 Schlucke! `;
  du.schaden = schaden(s, vl, 5, namen).trim();
  s.meldung += du.schaden;
  // Kopfgeld: der Fuehrende hat verloren
  if (Number.isInteger(du.kopf) && du.kopf >= 0 && du.kopf === vl && sg !== vl) {
    du.kopfgeld = geben(s, sg, KOPFGELD);
    s.meldung += ` 🎯 Kopfgeld kassiert: +${KOPFGELD} Münzen für ${namen[sg]}!`;
  }
}
function duellRender(s, ich, namen) {
  const du = s.duell;
  const kopf = Number.isInteger(du.kopf) && du.kopf >= 0 && [du.a, du.b].includes(du.kopf) ? ` · 🎯 Kopfgeld ${KOPFGELD} 🪙 auf ${esc(namen[du.kopf])}` : "";
  const einsatz = `Einsatz: <b>${DU.EINSATZ} 🪙</b> · der Verlierer trinkt 2 Schlucke und verliert 5 ❤️${kopf}`;
  if (du.phase !== "ende") return DU.html(du, ich, namen, { einsatz });
  const vl = du.verlierer;
  const folgen = `<div class="du-folgen"><span>🪙 ${du.beute || 0} ${du.beute === 1 ? "Münze" : "Münzen"} von ${esc(namen[vl])} an ${esc(namen[du.sieger])}</span>
    <span>🍺 ${esc(namen[vl])} trinkt 2 Schlucke</span>${du.schaden ? `<span>${esc(du.schaden)}</span>` : ""}${du.kopfgeld ? `<span>🎯 Kopfgeld: +${du.kopfgeld} 🪙 für ${esc(namen[du.sieger])}</span>` : ""}</div>`;
  return DU.html(du, ich, namen, { folgen, knopf: knopf("Weiter", { typ: "weiter" }, "gross") }) + `<i hidden data-ergebnis="bd-${du.nr}"></i>`;
}
function geben(s, j, d) {
  if (d > 0) { s.muenzen[j] += d; s.stat.gesammelt[j] += d; return d; }
  const weg = Math.min(s.muenzen[j], -d);
  s.muenzen[j] -= weg;
  return -weg;
}
function rangfolge(s) { return s.pos.map((_, j) => j).sort((a, b) => s.sterne[b] - s.sterne[a] || s.muenzen[b] - s.muenzen[a]); }
const sternPreis = (s, i) => (s.rabatt[i] || s.schluss === "rabatt" ? 5 : STERNPREIS) * (s.teuer[i] ? 2 : 1);
// fuer die 3D-Ansicht (brett3d.js): was gerade passiert ist; mehr = { von } beim Muenzmagnet, { ziel } beim Tausch,
// { ziele: [{ j, wert, ko }] } bei Flaechenschaden, { feld } beim K.O., { inhalt } bei der Truhe
function effekt(s, art, j, wert = 0, mehr = null) { s.effekt = { nr: ((s.effekt && s.effekt.nr) || 0) + 1, art, j, wert, ...(mehr || {}) }; }
// Felder bis zum Stern (Breitensuche ueber die Wege)
function sternAbstand(s, von) {
  const weit = new Map([[von, 0]]), q = [von];
  while (q.length) { const x = q.shift(); if (x === s.stern) return weit.get(x); wege(s, x).forEach((y) => { if (!weit.has(y)) { weit.set(y, weit.get(x) + 1); q.push(y); } }); }
  return 99;
}
// Abstand ohne Richtung (fuer den Boxhandschuh)
function feldAbstand(s, a, b) {
  const bb = B(s), weit = new Map([[a, 0]]), q = [a];
  while (q.length) { const x = q.shift(); if (x === b) return weit.get(x); [...bb.next[x], ...bb.prev[x]].forEach((y) => { if (!weit.has(y)) { weit.set(y, weit.get(x) + 1); q.push(y); } }); }
  return 99;
}
function nachbarn(s, f) { const bb = B(s); return [f, ...bb.next[f], ...bb.prev[f]]; }

// ---------------------------------------------------------------- Einstellungen vor dem ersten Wurf (nur noch als Aktion; gewaehlt wird im Hauptmenue)
function einstellen(s, a, namen) {
  if (RUNDEN_WAHL.includes(a.runden)) s.runden = a.runden;
  if (BRETTER[a.brett] && a.brett !== s.brettNr) {
    s.brettNr = a.brett;
    s.pos = s.pos.map(() => 0); s.fallen = {}; s.bomben = {}; s.sperren = {}; s.haufen = {};
    s.stern = neuerStern(s); s.sternSeit = 1; s.spur = null;
  }
  s.meldung = `⚙️ ${s.runden} Runden auf der Karte ${B(s).name} ${B(s).emo} – ${namen[s.dran]} würfelt.`;
}

// ---------------------------------------------------------------- Lebenspunkte, K.O.
// d Schaden an j; sammel = Liste fuer Flaechenschaden (dann ein gemeinsamer Effekt), sonst eigener Effekt -> Meldungstext
function schaden(s, j, d, namen, sammel = null) {
  if (d <= 0 || j < 0 || j >= s.pos.length) return "";
  if (schildFaengt(s, j, !!sammel)) { if (sammel) sammel.push({ j, wert: 0, schild: true }); return `🛡️ ${namen[j]}s Schild fängt den Treffer ab. `; }
  s.lp[j] -= d;
  if (s.lp[j] > 0) {
    if (sammel) sammel.push({ j, wert: -d }); else effekt(s, "schaden", j, -d);
    return `💔 ${namen[j]} −${d} ❤️ (${s.lp[j]} übrig). `;
  }
  return ko(s, j, namen, sammel, d);
}
function ko(s, j, namen, sammel, d) {
  const feld = s.pos[j], verlust = Math.min(15, Math.ceil(s.muenzen[j] / 2));
  s.muenzen[j] -= verlust;
  if (verlust) s.haufen[feld] = (s.haufen[feld] || 0) + verlust;
  s.pos[j] = 0; s.lp[j] = LP; s.gift[j] = 0; s.stat.ko[j]++;
  if (sammel) sammel.push({ j, wert: -d, ko: true, feld }); else effekt(s, "ko", j, -verlust, { feld });
  return `💫 ${namen[j]} ist K.O.! ${verlust ? `${verlust} Münzen bleiben auf dem Feld liegen – ` : ""}zurück zum Start mit vollen ❤️. `;
}
function heilen(s, j, d) { const vor = s.lp[j]; s.lp[j] = Math.min(LP, s.lp[j] + d); return s.lp[j] - vor; }

// ---------------------------------------------------------------- Zug
function wuerfeln(s, i, namen, raum) {
  let zahl = s.wuerfelArt === "dreifach" ? 3 : s.wuerfelArt === "doppel" ? 2 : 1;
  let seiten = s.wuerfelArt === "mini" ? 3 : 6;
  const verflucht = s.fluch[i];
  if (verflucht) { zahl = 1; seiten = 2; s.fluch[i] = false; }
  s.wuerfe = Array.from({ length: zahl }, () => 1 + zufall(seiten));
  s.wurf = s.wuerfe.reduce((a, b) => a + b, 0);
  s.rest = s.wurf; s.wahl = null; s.sternVorbei = false; s.unterwegs = { muenzen: 0, sperre: -1 };
  s.spur = { j: i, nr: ++s.spurNr, felder: [s.pos[i]] };
  s.meldung = `${verflucht ? "🐌 " : ""}${namen[i]} würfelt ${zahl > 1 ? `${s.wuerfe.join(" + ")} = ` : "eine "}${s.wurf}.`;
  s.wuerfelArt = null;
  if (laufen(s, i)) nachLauf(s, i, namen, raum);
}
// Schritt fuer Schritt; an einer Abzweigung anhalten (Phase "weg") -> false. Unterwegs: Muenzhaufen einsammeln,
// an fremden Absperrungen stehen bleiben.
function laufen(s, i) {
  if (!s.unterwegs) s.unterwegs = { muenzen: 0, sperre: -1 };
  const bb = B(s);
  while (s.rest > 0) {
    const hier = s.pos[i], nx = wege(s, hier);
    // aus dem Aufzug gestiegen: erst auf der Etage weiter, sonst fuehre man Schritt fuer Schritt nur hoch und runter
    const ausDemAufzug = bb.aufzug.includes(hier) && s.spur && bb.aufzug.includes(s.spur.felder[s.spur.felder.length - 2]);
    if (nx.length > 1 && s.wahl === null && !ausDemAufzug) { s.phase = "weg"; return false; }
    const ziel = s.wahl !== null ? s.wahl : nx[0];
    s.wahl = null;
    s.pos[i] = ziel; s.rest--;
    if (s.spur) s.spur.felder.push(ziel);
    if (ziel === s.stern) s.sternVorbei = true;
    if (bb.laeden[ziel]) stempeln(s, i, bb.laeden[ziel]);
    if (s.haufen[ziel]) { s.unterwegs.muenzen += s.haufen[ziel]; geben(s, i, s.haufen[ziel]); delete s.haufen[ziel]; }
    if (s.sperren[ziel] !== undefined && s.sperren[ziel] !== i) { s.unterwegs.sperre = s.sperren[ziel]; delete s.sperren[ziel]; s.rest = 0; }
    // Bank: nur im Vorbeilaufen einzahlen (wer dort stehen bleibt, raeumt sie in feldWirkung leer)
    if (s.rest > 0 && artVon(s, ziel) === "b") { const d = -geben(s, i, -BANK_EIN); s.bank += d; s.unterwegs.bank = (s.unterwegs.bank || 0) + d; }
  }
  return true;
}
// Glitzerpassage: jeder Laden, an dem man vorbeikommt, stempelt einmal; nach vier verschiedenen wird der naechste Stern billiger
function stempeln(s, i, laden) {
  if (s.stempel[i].includes(laden.nr)) return;
  s.stempel[i].push(laden.nr);
  s.unterwegs.stempel = laden;
  if (s.stempel[i].length >= STEMPEL_ZIEL) { s.stempel[i] = []; s.rabatt[i] = true; s.unterwegs.rabatt = true; }
}
function nachLauf(s, i, namen, raum) {
  const u = s.unterwegs || {};
  if (u.stempel) s.meldung += ` ${u.stempel.emo} Stempel von ${u.stempel.name}!`;
  if (u.rabatt) { s.meldung += ` 🛍️ ${STEMPEL_ZIEL} Läden geschafft: der nächste Stern kostet nur 5!`; grundSetzen(s, "🛍️", "Stern-Rabatt!", `${namen[i]} war in ${STEMPEL_ZIEL} Läden – der nächste Stern kostet nur 5`, { immer: true }); }
  if (u.muenzen) { s.meldung += ` 🪙 Unterwegs ${u.muenzen} liegengebliebene Münzen eingesammelt!`; effekt(s, "muenzen", i, u.muenzen); grundSetzen(s, "🪙", "Münzen eingesammelt", "lagen unterwegs auf dem Weg"); }
  if (u.sperre >= 0) s.meldung += ` 🚧 Absperrung von ${namen[u.sperre]} – hier ist Schluss!`;
  if (u.bank) { s.meldung += ` 🏦 An der Bank vorbei: ${u.bank} ${u.bank === 1 ? "Münze" : "Münzen"} eingezahlt (jetzt ${s.bank} drin).`; grundSetzen(s, "🏦", "Bank", `${namen[i]} zahlt ${u.bank} ein – wer genau dort landet, bekommt alles`); }
  s.unterwegs = null;
  const preis = sternPreis(s, i);
  if (s.sternVorbei && s.muenzen[i] >= preis) { s.phase = "stern"; s.meldung += " Am Stern vorbei – kaufen?"; return; }
  if (s.sternVorbei) s.meldung += ` Am Stern vorbei, aber zu wenig Münzen (${preis} nötig).`;
  feldWirkung(s, i, artVon(s, s.pos[i]), namen, raum);
}

// welche Gegenstaende jetzt einsetzbar sind (der Schild wirkt von selbst)
function nutzbareWaren(s, i) {
  if (s.wareBenutzt || s.phase !== "wuerfeln") return [];
  return [...new Set(s.waren[i])].filter((w) => {
    if (w === "schild") return false;
    if (w === "heil") return s.lp[i] < LP;
    if (ware(w).ziel) return zielListe(s, i, w).length > 0;
    return true;
  });
}
// moegliche Opfer eines Gegenstands
function zielListe(s, i, id) {
  const andere = s.pos.map((_, j) => j).filter((j) => j !== i);
  if (id === "faust") return andere.filter((j) => feldAbstand(s, s.pos[i], s.pos[j]) <= 4);
  if (id === "handschuh") return andere.filter((j) => s.waren[j].length);
  if (id === "gift") return andere.filter((j) => !s.gift[j]);
  if (id === "fluch") return andere.filter((j) => !s.fluch[j]);
  if (id === "aufkleber") return andere.filter((j) => !s.teuer[j]);
  return andere;
}
// Hafeninsel: Ebbe oder Flut setzen. Bei Flut spuelt das Wasser alle von der Sandbank ans Ufer.
function flutSetzen(s, an, namen) {
  const bb = B(s);
  s.flut = !!an;
  if (!s.flut) return "🏖️ Ebbe: die Sandbänke sind wieder frei";
  const gerettet = [];
  s.pos.forEach((p, j) => { if (bb.sperren[p] === "flut") { s.pos[j] = ausweg(bb, p); gerettet.push(namen[j]); } });
  return `🌊 Flut: die Sandbänke sind gesperrt${gerettet.length ? ` – ${gerettet.join(", ")} ans Ufer gespült` : ""}`;
}
function zumStern(s, i, art) {
  const vor = B(s).prev[s.stern][0];
  s.pos[i] = vor; s.spur = { j: i, nr: ++s.spurNr, felder: [vor], sprung: true };
  effekt(s, art, i);
}
function wareEinsetzen(s, i, id, namen) {
  const k = s.waren[i].indexOf(id);
  if (k < 0 || !nutzbareWaren(s, i).includes(id)) return;
  s.waren[i].splice(k, 1);
  s.wareBenutzt = true;
  const w = ware(id);
  grundSetzen(s, w.emo, w.name, w.text, { fest: true });
  if (id === "doppel" || id === "dreifach" || id === "mini") { s.wuerfelArt = id; s.meldung = `${namen[i]} nimmt den ${w.emo} ${w.name}.`; }
  else if (w.ziel) { s.zielWare = id; s.phase = "ziel"; s.meldung = `${namen[i]} holt ${w.emo} ${w.name} heraus …`; }
  else if (id === "falle") { s.fallen[s.pos[i]] = i; s.meldung = `🪤 ${namen[i]} stellt eine Falle auf.`; effekt(s, "falle", i); }
  else if (id === "rohr") { zumStern(s, i, "rohr"); s.meldung = `🌟 ${namen[i]} rauscht durchs Sternenrohr direkt vor den Stern!`; }
  else if (id === "heil") { const d = heilen(s, i, 15); s.meldung = `💖 ${namen[i]} trinkt den Heiltrank: +${d} ❤️.`; effekt(s, "heilen", i, d); }
  else if (id === "blitz") {
    const ziele = [], text = s.pos.map((_, j) => (j === i ? "" : schaden(s, j, 6, namen, ziele))).join("");
    s.meldung = `⚡ ${namen[i]} ruft die Gewitterwolke! ${text}`; effekt(s, "flaeche", i, 0, { ziele, quelle: "blitz" });
  } else if (id === "bombe") { s.bomben[s.pos[i]] = i; s.meldung = `💣 ${namen[i]} legt eine Zeitbombe ab – sie knallt zu Beginn der nächsten Runde!`; effekt(s, "bombe", i); }
  else if (id === "sperre") { s.sperren[s.pos[i]] = i; s.meldung = `🚧 ${namen[i]} stellt eine Absperrung auf.`; effekt(s, "sperre", i); }
  else if (id === "muschel") { s.meldung = `🐚 ${namen[i]} bläst ins Muschelhorn! ${flutSetzen(s, !s.flut, namen)}.`; effekt(s, "wunder", i); }
  else if (id === "rakete") {
    const bb = B(s), felder = [s.pos[i]], ziele = [];
    let x = s.pos[i], muenzen = 0, text = "";
    for (let k = 0; k < 8; k++) {
      x = bb.next[x][0]; felder.push(x);
      if (s.haufen[x]) { muenzen += s.haufen[x]; geben(s, i, s.haufen[x]); delete s.haufen[x]; }
      s.pos.forEach((p, j) => { if (j !== i && p === x && !ziele.some((z) => z.j === j)) text += schaden(s, j, 6, namen, ziele); });
    }
    s.pos[i] = x; s.spur = { j: i, nr: ++s.spurNr, felder, sprung: true };
    s.meldung = `🚀 ${namen[i]} zündet die Rakete und fliegt 8 Felder weit! ${text}${muenzen ? `🪙 ${muenzen} Münzen im Flug geschnappt. ` : ""}`;
    effekt(s, "rakete", i, 0, { ziele });
  } else if (id === "wunder") s.meldung = `🎁 ${namen[i]} öffnet die Wundertüte: ${wundertuete(s, i, namen)}`;
}
function wundertuete(s, i, namen) {
  const x = zufall(6);
  if (x === 0) { geben(s, i, 10); effekt(s, "muenzen", i, 10); return "10 Münzen!"; }
  if (x === 1) { s.extra = true; effekt(s, "wunder", i); return "Nach diesem Zug darfst du noch einmal würfeln!"; }
  if (x === 2) {
    const rein = [];
    const vorrat = ladenVon(s);
    if (!vorrat.length) { geben(s, i, 10); effekt(s, "muenzen", i, 10); return "10 Münzen!"; }
    [vorrat[zufall(vorrat.length)], vorrat[zufall(vorrat.length)]].forEach((w) => { if (s.waren[i].length < BEUTEL) { s.waren[i].push(w); rein.push(w); } });
    effekt(s, "wunder", i);
    return rein.length ? `${rein.map((w) => `${ware(w).emo} ${ware(w).name}`).join(" und ")}!` : "zwei Gegenstände – aber der Beutel ist voll.";
  }
  if (x === 3) { zumStern(s, i, "rohr"); return "ein Wirbel trägt dich direkt vor den Stern!"; }
  if (x === 4) return `ein Knallfrosch! ${schaden(s, i, 5, namen)}`;
  const d = heilen(s, i, 15); geben(s, i, 3); effekt(s, "heilen", i, d); return `+${d} ❤️ und 3 Münzen.`;
}
function zielWirkung(s, i, j, namen) {
  const id = s.zielWare; s.zielWare = null; s.phase = "wuerfeln";
  const w = ware(id);
  grundSetzen(s, w.emo, `${w.name} gegen ${namen[j]}`, w.text, { fest: true });
  if (schildFaengt(s, j)) { s.meldung = `${w.emo} 🛡️ ${namen[j]} hält den Schild hoch – nichts passiert.`; return; }
  if (id === "tausch") { [s.pos[i], s.pos[j]] = [s.pos[j], s.pos[i]]; s.spur = { j: i, nr: ++s.spurNr, felder: [s.pos[i]], sprung: true }; s.meldung = `🔄 ${namen[i]} und ${namen[j]} tauschen die Plätze!`; effekt(s, "tausch", i, 0, { ziel: j }); }
  else if (id === "dieb") { const d = -geben(s, j, -5); geben(s, i, d); pech(s, j, d); s.meldung = `🧲 ${namen[i]} zieht ${d} Münzen von ${namen[j]} ab!`; effekt(s, "muenzen", i, d, { von: j }); }
  else if (id === "faust") { s.meldung = `🥊 ${namen[i]} boxt ${namen[j]}! ${schaden(s, j, 15, namen)}`; if (s.effekt && s.effekt.j === j) s.effekt.quelle = { art: "faust", von: i }; }
  else if (id === "bogen") { s.meldung = `🏹 ${namen[i]} schießt auf ${namen[j]}! ${schaden(s, j, 8, namen)}`; if (s.effekt && s.effekt.j === j) s.effekt.quelle = { art: "bogen", von: i }; }
  else if (id === "gift") { s.gift[j] = 3; s.meldung = `🧪 ${namen[j]} ist vergiftet – 3 Runden lang je 4 ❤️ weniger.`; effekt(s, "gift", j); }
  else if (id === "fluch") { s.fluch[j] = true; s.meldung = `🐌 ${namen[j]} ist verflucht – der nächste Wurf zeigt nur 1 oder 2.`; effekt(s, "fluch", j); }
  else if (id === "aufkleber") { s.teuer[j] = true; s.meldung = `🏷️ ${namen[i]} klebt ${namen[j]} einen Preisaufkleber an – im nächsten Zug kostet alles das Doppelte!`; effekt(s, "fluch", j); }
  else if (id === "handschuh") {
    const k = zufall(s.waren[j].length), g = s.waren[j].splice(k, 1)[0];
    pech(s, j, PECH_WARE);
    if (s.waren[i].length < BEUTEL) s.waren[i].push(g);
    s.meldung = `🧤 ${namen[i]} klaut ${namen[j]} ${ware(g).emo} ${ware(g).name}${s.waren[i].includes(g) ? "" : " – kein Platz im Beutel, er fällt weg"}!`;
    effekt(s, "handschuh", i, 0, { von: j });
  }
}
// leise = kein eigener Effekt (Flaechenschaden zeigt den Schild selbst)
function schildFaengt(s, j, leise = false) {
  const k = s.waren[j].indexOf("schild");
  if (k < 0) return false;
  s.waren[j].splice(k, 1);
  if (!leise) effekt(s, "schild", j);
  return true;
}
// Truhe: Gegenstand, Muenzen, Heilung - oder eine bissige Truhe
function truhe(s, i, namen) {
  const x = Math.random();
  if (x < 0.45 && s.waren[i].length < BEUTEL && ladenVon(s).length) { const vorrat = ladenVon(s), w = vorrat[zufall(vorrat.length)]; s.waren[i].push(w); effekt(s, "truhe", i, 0, { inhalt: ware(w).emo }); return `Drin: ${ware(w).emo} ${ware(w).name}!`; }
  if (x < 0.8) { const d = 4 + zufall(9); geben(s, i, d); effekt(s, "truhe", i, d, { inhalt: "🪙" }); return `${d} Münzen!`; }
  if (x < 0.88) { const d = heilen(s, i, 12); effekt(s, "truhe", i, 0, { inhalt: "💖" }); return `ein Heiltrank – +${d} ❤️.`; }
  const t = schaden(s, i, 8, namen);
  if (s.effekt && s.effekt.j === i) s.effekt.quelle = { art: "truhe" };
  return `Die Truhe beißt zu! ${t}`;
}

function feldWirkung(s, i, feld, namen, raum) {
  const pre = s.meldung + " ";
  let falle = "";
  const f = s.fallen[s.pos[i]];
  if (f !== undefined && f !== i && f < s.pos.length) {
    delete s.fallen[s.pos[i]];
    if (schildFaengt(s, i)) falle = `🪤 Falle von ${namen[f]} – aber der Schild hält! `;
    else { const d = -geben(s, i, -5); geben(s, f, d); pech(s, i, d); falle =`🪤 In die Falle von ${namen[f]} getappt: ${d} Münzen an ${namen[f]}! `; effekt(s, "muenzen", i, -d); }
    grundSetzen(s, "🪤", `Falle von ${namen[f]}!`, falle.replace(/^🪤\s*/, ""));
  }
  const mal = s.schluss === "doppelt" ? 2 : 1;
  s.phase = "weiter";
  if (feld === "m") { geben(s, i, 3 * mal); s.meldung = pre + falle + `+${3 * mal} Münzen.`; effekt(s, "muenzen", i, 3 * mal); grundSetzen(s, "🪙", "Münzfeld", mal > 1 ? "Schlussrunden: doppelt!" : ""); }
  else if (feld === "v") { pech(s, i, -geben(s, i, -3 * mal)); s.meldung = pre + falle + `−${3 * mal} Münzen.`; effekt(s, "muenzen", i, -3 * mal); grundSetzen(s, "💸", "Pechfeld", mal > 1 ? "Schlussrunden: doppelt!" : ""); }
  else if (feld === "t") s.meldung = pre + falle + `🍺 Trinkfeld: ${namen[i]} trinkt ${schlucke(1 + zufall(3))}.`;
  // Aufgabenfeld (ohne Trinken): kleine Aufgabe; wer nicht will, gibt Muenzen ab
  else if (feld === "a") { s.meldung = pre + falle + `🎯 Aufgabenfeld: ${namen[i]} – ${ziehe(T.AUFGABEN)}`; s.phase = "aufgabe"; }
  else if (feld === "e") { s.stat.ereignis[i]++; s.meldung = pre + falle + "❓ " + ereignis(s, i, namen, raum); effekt(s, "ereignis", i); }
  else if (feld === "d") { s.meldung = pre + falle + "⚔️ Duellfeld!"; s.phase = "duell"; }
  else if (feld === "l") {
    // Glitzerpassage: jeder Laden hat sein eigenes Sortiment; sonst alles, was es auf der Karte gibt
    const laden = B(s).laeden[s.pos[i]];
    const waren = (laden ? laden.waren : ladenVon(s)).filter((id) => wareAn(s, id));
    s.meldung = pre + falle + (laden ? `${laden.emo} ${laden.name}!` : "🛒 Laden!");
    if (waren.length) { s.phase = "laden"; s.angebot = mischen([...waren]).slice(0, ANGEBOT); }
    else s.meldung += " Heute gibt es hier nichts zu kaufen.";
  }
  else if (feld === "z") { s.meldung = pre + falle + "🛗 Der Aufzug wartet: beim nächsten Wurf wählst du die Etage."; }
  else if (feld === "b") {
    const d = s.bank; s.bank = 0;
    if (d) { geben(s, i, d); effekt(s, "muenzen", i, d, { bank: true }); s.meldung = pre + falle + `🏦 Volltreffer auf der Bank: ${namen[i]} räumt ${d} Münzen ab!`; grundSetzen(s, "🏦", "Bank geknackt!", `${namen[i]} bekommt den ganzen Inhalt: ${d} Münzen`, { immer: true }); }
    else s.meldung = pre + falle + "🏦 Die Bank ist gerade leer.";
  }
  else if (feld === "s") { s.meldung = pre + falle + `🌵 Stachelfeld! ${schaden(s, i, 10, namen)}`; grundSetzen(s, "🌵", "Stachelfeld", s.pos[i] === 0 ? "K.O. – zurück zum Start" : ""); }
  else if (feld === "h") { const d = heilen(s, i, 8); s.meldung = pre + falle + `💖 Heilquelle: +${d} ❤️.`; effekt(s, "heilen", i, d); grundSetzen(s, "💖", "Heilquelle"); }
  else if (feld === "k") { const t = truhe(s, i, namen); s.meldung = pre + falle + `🧰 Truhe! ${t}`; grundSetzen(s, "🧰", "Truhe!", t); }
  else if (feld === "g") { geben(s, i, 5); s.meldung = pre + falle + `🔥 Glutfeld: +5 heiße Münzen, aber ${schaden(s, i, 5, namen)}`; grundSetzen(s, "🔥", "Glutfeld", "heiße Münzen – aber es brennt"); }
  else if (feld === "p") {
    const ziel = B(s).portale[s.pos[i]];
    if (ziel !== undefined) { s.pos[i] = ziel; s.meldung = pre + falle + `🌀 Portal! ${namen[i]} wird auf die andere Seite der Insel gezogen.`; effekt(s, "portal", i); }
    else s.meldung = pre + falle;
  } else s.meldung = pre + falle;
}

// ---------------------------------------------------------------- Ereignisfeld
function ereignis(s, i, namen, raum) {
  let pool = BE.ziehbar(raum && raum.brettWeg, s.ohne);
  const t = testVorgabe();
  if (t && Array.isArray(t.ereignisse)) pool = pool.filter((x) => t.ereignisse.includes(x.id));
  if (!pool.length) { geben(s, i, 2); grundSetzen(s, "❓", "Ruhiges Feld"); return "Ruhiges Feld: +2 Münzen."; }
  let frei = pool.filter((x) => !s.gezogen.includes(x.id));
  if (!frei.length) { s.gezogen = []; frei = pool; }
  const ev = frei[zufall(frei.length)];
  s.gezogen.push(ev.id);
  // Ereigniskarte (Runde 3): Symbol und Name der Kategorie, darunter der Text - auch ohne Gewinn/Verlust
  const kat = (BE.KATEGORIEN.find(([k]) => k === ev.kat) || ["", "❓ Ereignis"])[1];
  const [kEmo, ...kName] = kat.split(" ");
  const karte = (text) => grundSetzen(s, kEmo || "❓", `Ereignis: ${kName.join(" ") || "Überraschung"}`, text, { immer: true });
  if (ev.boese && schildFaengt(s, i)) { karte(`${ev.text} – der Schild fängt es ab!`); return `${ev.text} 🛡️ Der Schild fängt es ab!`; }
  let extra;
  const h = helfer(s, namen);
  try { extra = ev.f(s, i, h); } catch (e) { console.error(e); }
  if (h.ersatz()) extra = `${extra ? `${extra} ` : ""}Der Gegenstand ist abgeschaltet: dafür ${ERSATZ_MUENZEN} Münzen.`;
  const text = extra ? `${ev.text} ${extra}` : ev.text;
  karte(text);
  return text;
}
const ERSATZ_MUENZEN = 3;   // Ereignis schenkt einen abgeschalteten Gegenstand
function helfer(s, namen) {
  const n = s.pos.length, alle = [...Array(n).keys()], bb = B(s);
  const rang = () => rangfolge(s);
  let ersatz = false;
  const schritt = (j, k, rueck) => { for (let x = 0; x < k; x++) s.pos[j] = rueck ? bb.prev[s.pos[j]][0] : bb.next[s.pos[j]][0]; };
  return {
    n, nm: namen, rnd: (k) => zufall(k),
    muenzen: (j, d) => geben(s, j, d),
    sterne: (j, d) => { s.sterne[j] = Math.max(0, s.sterne[j] + d); if (d > 0) effekt(s, "stern", j); },
    vor: (j, k) => schritt(j, k, false), zurueck: (j, k) => schritt(j, k, true),
    tausch: (j, k) => { [s.pos[j], s.pos[k]] = [s.pos[k], s.pos[j]]; },
    gib: (j, id) => { if (!id || !wareAn(s, id)) { ersatz = true; geben(s, j, ERSATZ_MUENZEN); return; } if (s.waren[j].length < BEUTEL) s.waren[j].push(id); },
    ersatz: () => ersatz,
    zufallWare: () => { const v = ladenVon(s); return v.length ? v[zufall(v.length)] : null; }, wareName: (id) => (id ? `${ware(id).emo} ${ware(id).name}` : "nichts"),
    stern: () => { s.stern = neuerStern(s); s.sternSeit = s.runde; },
    sternVor: (k) => { for (let x = 0; x < k; x++) s.stern = bb.next[s.stern][0]; },
    zuStern: (j) => { s.pos[j] = bb.prev[s.stern][0]; },
    irgendwo: (j) => { const frei = bb.next.map((_, f) => f).filter((f) => !istGesperrt(s, bb, f)); s.pos[j] = frei[zufall(frei.length)]; },
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
    // Teil 4b: Lebenspunkte
    schaden: (j, d) => schaden(s, j, d, namen).trim(),
    heilen: (j, d) => { const x = heilen(s, j, d); if (x) effekt(s, "heilen", j, x); return x; },
    lp: (j) => s.lp[j],
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
  s.teuer[s.dran] = false;   // Preisaufkleber gilt fuer genau einen eigenen Zug
  if (s.extra) { s.extra = false; s.phase = "wuerfeln"; s.meldung = `🎲 ${namen[s.dran]} darf noch einmal würfeln!`; return; }
  s.dran = (s.dran + 1) % n;
  if (s.dran !== 0) s.phase = "wuerfeln";
  else if (keineMinis(raum)) rundeWeiter(s, namen);   // alle Minispiele abgeschaltet: gleich die naechste Runde
  else miniStart(s, raum);
}
function rundeWeiter(s, namen) {
  s.mini = null;
  s.runde++;
  if (s.runden && s.runde > s.runden) { bonusVergeben(s); s.phase = "bonus"; s.meldung = ""; return; }
  s.phase = "wuerfeln";
  rundeBeginnt(s, namen);
}
function rundeBeginnt(s, namen) {
  const teile = [`Runde ${s.runde}`];
  const n = s.pos.length, bb = B(s), ziele = [];
  let quelle = null;
  // Aufholhilfe: wer hinten liegt, bekommt jede Runde etwas Rueckenwind
  if (n > 1) { const l = rangfolge(s)[n - 1]; geben(s, l, 3); teile.push(`🤝 Aufholhilfe: ${namen[l]} bekommt 3 Münzen`); }
  // Gift wirkt
  s.gift.forEach((g, j) => { if (g > 0) { s.gift[j]--; teile.push(`🧪 ${schaden(s, j, 4, namen, ziele).trim()}`); quelle = quelle || "gift"; } });
  // Zeitbomben knallen: 12 Schaden auf dem Feld und den Nachbarfeldern
  Object.keys(s.bomben).forEach((f) => {
    const feld = Number(f), von = s.bomben[f], zone = nachbarn(s, feld);
    delete s.bomben[f];
    const opfer = s.pos.map((p, j) => (zone.includes(p) ? j : -1)).filter((j) => j >= 0);
    teile.push(`💣 BUMM! Die Bombe von ${namen[von] || "jemandem"} explodiert${opfer.length ? `: ${opfer.map((j) => schaden(s, j, 12, namen, ziele).trim()).join(" ")}` : " – niemand in der Nähe"}`);
    quelle = "bombe";
  });
  // Hafeninsel: alle 2 Runden wechseln Ebbe und Flut
  if (bb.trick === "gezeiten" && s.runde > 1 && (s.runde - 1) % GEZEITEN_ALLE === 0) teile.push(flutSetzen(s, !s.flut, namen));
  // Vulkaninsel: Ausbruch zu Beginn jeder dritten Runde. Er legt neue Lavafelder, wer auf oder neben Glut steht, bekommt
  // 10 Schaden; die alte Lava ist erkaltet und fuer genau diese Runde eine Abkuerzung.
  if (bb.trick === "ausbruch" && s.runde % AUSBRUCH_ALLE === 0) {
    s.lavaGruppe = (s.lavaGruppe + 1) % bb.lava.length;
    s.krusteRunde = s.runde;
    const zone = new Set();
    [...bb.muster].forEach((f, k) => { if (f === "g") nachbarn(s, k).forEach((x) => zone.add(x)); });
    lavaFelder(s, bb).forEach((k) => nachbarn(s, k).forEach((x) => zone.add(x)));
    const opfer = s.pos.map((p, j) => (zone.has(p) ? j : -1)).filter((j) => j >= 0);
    teile.push(`🌋 Der Vulkan bricht aus!${opfer.length ? ` ${opfer.map((j) => schaden(s, j, 10, namen, ziele).trim()).join(" ")}` : " Zum Glück steht niemand in der Glut."} 🪨 Die alte Lava ist erkaltet – diese Runde eine Abkürzung`);
    quelle = "ausbruch";
  } else if (bb.trick === "ausbruch") {
    // die Kruste bricht wieder: wer noch drauf steht, kommt ans Ende des Wegs
    s.pos.forEach((p, j) => { if (bb.sperren[p] === "kruste") s.pos[j] = ausweg(bb, p); });
    if (s.runde % AUSBRUCH_ALLE === AUSBRUCH_ALLE - 1) teile.push("🌋 Der Vulkan grollt – nächste Runde bricht er aus!");
  }
  if (quelle) effekt(s, "flaeche", s.dran, 0, { ziele, quelle });
  // wandernder Stern: drei (grosse Karte: vier) Runden nicht gekauft -> er sucht sich einen neuen Platz
  if (s.runde - s.sternSeit >= sternWartet(s)) { s.stern = neuerStern(s); s.sternSeit = s.runde; teile.push("⭐ Der Stern ist weitergewandert"); }
  // Schlussrunden: die letzten drei Runden mit einer Besonderheit und einem Schub fuer den Letzten
  if (s.runde === s.runden - 2 && !s.schluss) {
    s.schluss = Object.keys(SCHLUSS)[zufall(3)];
    const l = rangfolge(s)[n - 1];
    if (n > 1) geben(s, l, 10);
    teile.push(`🔥 Die letzten 3 Runden! ${SCHLUSS[s.schluss].text}${n > 1 ? ` ${namen[l]} bekommt 10 Münzen Schub` : ""}`);
  }
  s.meldung = `${teile.join(" · ")} – ${namen[0]} würfelt.`;
  s.rundeZug = (s.zug || 0) + 1;   // diese Aktion (Zaehler steigt gleich danach): Ueberflug laeuft, Bots warten (vorfuehrDauer)
  const was = teile.slice(1);
  grundSetzen(s, quelle === "ausbruch" ? "🌋" : quelle === "bombe" ? "💣" : quelle === "gift" ? "🧪" : "🔔", `Runde ${s.runde}`, was.join(" · "));
}
// Pechvogel (Runde C, Punkt 32). Kennzahl "Pechpunkte": jede Muenze, die man auf Pechfeldern, in fremden Fallen oder an den
// Muenzmagnet verloren hat, zaehlt 1; ein geklauter Gegenstand (Langfinger) zaehlt PECH_WARE. Am Ende gibt es fuer die meisten
// Pechpunkte einen Bonusstern.
const PECH_WARE = 3;
function pech(s, j, d) { if (d > 0 && s.stat && Array.isArray(s.stat.pech)) s.stat.pech[j] = (s.stat.pech[j] || 0) + d; }
function bonusVergeben(s) {
  if (!Array.isArray(s.stat.pech)) s.stat.pech = s.pos.map(() => 0);
  const kat = [["mini", "🎮", "Minispiel-Ass", "Minispiel-Siege"], ["gesammelt", "🪙", "Münzsammler", "Münzen eingesammelt"], ["ereignis", "❓", "Ereignis-Jäger", "Ereignisfelder"],
    ["pech", "☔", "Pechvogel", "Pechpunkte (Pechfelder, Fallen, Diebstahl)"]];
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
const angebot = (s) => (Array.isArray(s.angebot) && s.angebot.length ? s.angebot.filter((id) => ware(id)) : LADEN.slice(0, ANGEBOT));
function ladenTitel(s, i) { const l = B(s).laeden[s.pos[i]]; return l ? `${l.emo} ${esc(l.name)}` : "🛒 Laden"; }

// ---------------------------------------------------------------- Minispiel nach jeder Runde
// gestrichene Minispiele stehen als "m:<Kennung>" in raum.brettWeg (brett_ereignisse.js, gleiche Liste wie die Ereignisse)
export function miniPool(raum) {
  const weg = new Set((raum && Array.isArray(raum.brettWeg) && raum.brettWeg) || []);
  const pool = MINI_IDS.filter((id) => !weg.has(`m:${id}`));
  return pool.length ? pool : MINI_IDS;
}
// "Alle aus" im Hauptmenue: dann gibt es wirklich keine Minispiele (Testvorgaben gehen vor)
function keineMinis(raum) {
  const t = testVorgabe(), weg = (raum && raum.brettWeg) || [];
  return !(t && Array.isArray(t.minis) && t.minis.length) && MINI_IDS.every((id) => weg.includes(`m:${id}`));
}
function naechstesMini(s, raum) {
  const t = testVorgabe();
  if (t && Array.isArray(t.minis) && t.minis.length) return t.minis[s.miniNr % t.minis.length];
  const pool = miniPool(raum);
  if (raum) return MINI_IDS[STAPEL.eins(raum, "brettminis", MINI_IDS.length, Math.random, (k) => pool.includes(MINI_IDS[k]))];
  return pool[zufall(pool.length)];
}
function modusWahl(n, s) {
  const t = testVorgabe();
  if (t && Array.isArray(t.modi) && t.modi.length) { const m = t.modi[s.miniNr % t.modi.length]; if (m === "alle" || n >= (m === "team" ? 4 : m === "eins" ? 3 : 2)) return m; return "alle"; }
  const x = Math.random();
  if (s.team) return x < 0.6 ? "team" : x < 0.85 ? "alle" : "duell";   // feste Teams: meist Team gegen Team
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
  if (modus === "team" && s.team) teams = [0, 1].map((t) => s.pos.map((_, j) => j).filter((j) => s.team[j] === t));
  else if (modus === "team") { const h = Math.ceil(n / 2); teams = [reihe.slice(0, h).sort(), reihe.slice(h).sort()]; }
  else if (modus === "eins") teams = [[reihe[0]], reihe.slice(1).sort()];
  else if (modus === "duell") teil = reihe.slice(0, 2).sort();
  s.mini = { art, runde: s.runde, werte: {}, warte: 1500 + zufall(3500), frage: zufall(T.SCHAETZ.length), zahl: String(10000000 + zufall(89999999)),
    d: R.daten(art), modus, teams, teil, t0: Date.now(), einsatz: {} };
  s.meldung = "";
  // Einsatz (Runde C, Punkt 26): erst duerfen alle Mitspielenden ein paar eigene Muenzen auf sich setzen
  const t = testVorgabe();
  if ((t && !t.einsatz) || !teil.some((j) => s.muenzen[j] > 0)) { s.phase = "mini"; return; }
  s.phase = "einsatz";
  s.einsatzBis = Date.now() + ((t && t.einsatzZeit) || EINSATZ_ZEIT);
}
// Einsatz vor dem Minispiel: 0, 1, 3 oder 5 eigene Muenzen; wer gewinnt, bekommt das Doppelte zurueck. Nach EINSATZ_ZEIT
// (oder wenn alle gesetzt haben) geht es los - jedes Geraet schickt dann "einsatzende" (der Gastgeber nimmt es einmal an).
export const EINSATZ_STUFEN = [0, 1, 3, 5];
const EINSATZ_ZEIT = 10000;
function einsatzAktion(s, i, a) {
  const m = s.mini, teil = teilVon(s, m);
  if (a.typ === "setzen" && teil.includes(i) && m.einsatz[i] === undefined && EINSATZ_STUFEN.includes(a.wert)) {
    const d = Math.min(a.wert, s.muenzen[i]);
    s.muenzen[i] -= d; m.einsatz[i] = d;
  } else if (!(a.typ === "einsatzende" && Date.now() >= (s.einsatzBis || 0))) return;
  if (a.typ === "einsatzende" || teil.every((j) => m.einsatz[j] !== undefined)) {
    teil.forEach((j) => { if (m.einsatz[j] === undefined) m.einsatz[j] = 0; });
    s.phase = "mini"; s.einsatzBis = 0; m.t0 = Date.now();
  }
}
function einsatzRender(s, ich, namen) {
  const m = s.mini, info = miniInfo(m.art), teil = teilVon(s, m);
  const kopf = `<div class="frage mini-titelkarte"><span class="mtk-emo" aria-hidden="true">${info.emo}</span><span class="mtk-text"><small class="mtk-vor">Gleich: Minispiel</small><b>${esc(info.titel)}</b><small class="mini-typ">${esc(info.typ)}</small></span></div><div class="mini-modus">${modusZeile(m, namen)}</div>`;
  const liste = `<div class="bm-pillen mitte einsatz-liste" data-einsatz>${teil.map((j) => `<span class="bm-pille ${m.einsatz[j] !== undefined ? "da" : "leise"}">${esc(namen[j])}: ${m.einsatz[j] !== undefined ? `${m.einsatz[j]} 🪙` : "…"}</span>`).join("")}</div>`;
  const uhr = s.einsatzBis ? `<p class="zugzeit">⏳ noch <span data-gcd="${s.einsatzBis}" data-sek>${Math.round(EINSATZ_ZEIT / 1000)}</span> Sekunden</p>` : "";
  let steuer;
  if (ich >= 0 && teil.includes(ich) && m.einsatz[ich] === undefined) {
    steuer = `<p class="mitte">🪙 Setzt du Münzen auf dich? Gewinnst du, bekommst du das Doppelte zurück.</p><div class="raster2 einsatz-knoepfe">${EINSATZ_STUFEN.map((w) => knopf(w ? `${w} 🪙 setzen` : "Nichts setzen", { typ: "setzen", wert: w }, w ? "gross gelb" : "gross", w > s.muenzen[ich] ? "disabled" : "")).join("")}</div>`;
  } else steuer = `<p class="mitte leise">${ich >= 0 && teil.includes(ich) ? `Du setzt ${m.einsatz[ich]} 🪙 – warte auf die anderen …` : "Die Mitspielenden setzen ihre Münzen …"}</p>`;
  return `${kopf}${liste}${steuer}${uhr}<i hidden data-key="bteinsatz-${s.runde}-${m.art}" data-ton="pop"></i>`;
}
let einsatzTimer = null;
function einsatzNach(s, senden) {
  clearTimeout(einsatzTimer);
  if (!s.einsatzBis) return;
  // die Uhren der Handys gehen nicht genau gleich: solange der Einsatz noch steht, alle 1,5 s nachfragen
  const los = () => { if (!document.querySelector("[data-einsatz]")) return; senden({ typ: "einsatzende" }); einsatzTimer = setTimeout(los, 1500); };
  einsatzTimer = setTimeout(los, Math.max(0, s.einsatzBis - Date.now()) + 300);
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
  } else if (a.typ === "miniweiter" && m.fertig) rundeWeiter(s, namen);
}
// Vergleichswert je Spieler: hoeher = besser
function wertVon(s, m, j, teil) {
  if (R.istNeu(m.art)) return R.punkte(m.art, m.werte, j, teil, m);
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
  // Einsatz (Runde C): Sieger bekommen ihren Einsatz doppelt zurueck, sonst ist er weg
  const einsatz = m.einsatz || {};
  sieger.forEach((j) => { if (einsatz[j] > 0) geben(s, j, 2 * einsatz[j]); });
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
    const fmt = (j) => (m.werte[j] === null || m.werte[j] === undefined ? "nicht mitgemacht" : R.istNeu(m.art) ? esc(R.einheit(m.art, m.werte[j], m, j))
      : m.art === "farbwort" ? `${m.werte[j]} richtig` : m.art === "gedaechtnis" ? `${m.werte[j]} Ziffern` : m.art === "tappen" ? `${m.werte[j]} Taps`
      : m.art === "reaktion" ? (m.werte[j] < 0 ? "zu früh" : `${m.werte[j]} ms`) : m.werte[j]);
    const verl = m.verlierer || [];
    return `<div class="frage">${info.emo} ${esc(info.titel)} – Ergebnis${m.art === "schaetzen" ? `<br><small>${esc(T.SCHAETZ[m.frage][0])} → <b>${T.SCHAETZ[m.frage][1]}</b></small>` : ""}</div>${modus}
      ${m.kopf ? `<div class="mini-kopf">🏅 ${esc(m.kopf)}</div>` : ""}
      <div id="brett3d" class="brett3d sieger"></div>
      <ol class="rangliste">${m.rang.map((j) => { const e = (m.einsatz || {})[j] || 0, gew = (m.sieger || []).includes(j);
        return `<li>${nameIn(s, namen, j)}: ${fmt(j)} → +${(m.preise || {})[j] || 0} 🪙${e ? ` · Einsatz ${e}: ${gew ? `+${2 * e} 🪙 zurück` : "weg"}` : ""}</li>`; }).join("")}</ol>
      ${verl.length ? `<div class="urteil">${verl.map((j) => nameIn(s, namen, j)).join(" & ")} ${verl.length > 1 ? "trinken" : "trinkt"} ${schlucke(m.modus === "alle" || m.modus === "duell" ? 2 : 1)}</div>` : ""}
      ${knopf("Weiter zur nächsten Runde", { typ: "miniweiter" }, "gross")}`;
  }
  const zaehler = `${teil.filter((j) => m.werte[j] !== undefined).length}/${teil.length} fertig`;
  const abbruch = `<div class="mini-abbruch" hidden data-mini-abbruch="${m.runde}-${m.art}"><p class="leise klein mitte">Jemand hängt fest? Nach einer Weile geht es auch ohne ihn weiter.</p>${knopf("⏭️ Nicht mehr warten", { typ: "miniabbruch" }, "zweit")}</div>`;
  // Titelkarte (brett3d-Umbau 31.10.2026 abends): grosses Symbol, Name, Spielart - fliegt beim ersten Anblick herein
  const kopf = `<div class="frage mini-titelkarte"><span class="mtk-emo" aria-hidden="true">${info.emo}</span><span class="mtk-text"><small class="mtk-vor">Minispiel</small><b>${esc(info.titel)}</b><small class="mini-typ">${esc(info.typ)}</small></span></div>${modus}`;
  let inhalt = "";
  // ich < 0: dieses Geraet spielt nur mit Controllern mit (app.js zeigt deren Felder darunter, controller.js)
  if (ich < 0) inhalt = `<p class="mitte leise">${esc(info.regel)}</p>${m.art === "schaetzen" ? `<div class="frage">${esc(T.SCHAETZ[m.frage][0])}</div>` : ""}<p class="mitte">${zaehler}</p>`;
  else if (!teil.includes(ich)) inhalt = `<p class="mitte leise">${esc(info.regel)}</p><div class="hinweisbox warten">👀 Du schaust diesmal zu – ${zaehler}</div>`;
  else if (m.werte[ich] !== undefined) inhalt = `<p class="mitte">Erledigt – warte auf die anderen (${zaehler})</p>`;
  else if (R.istNeu(m.art)) inhalt = R.html(m, `h${ich}`, null, ich);
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
// Titelkarte des Minispiels: beim ersten Anblick einmal hereinfliegen lassen (spaetere Neuzeichnungen stehen still)
const titelGesehen = new Set();
function miniTitelkarte(m) {
  const el = document.querySelector(".mini-titelkarte");
  const k = `${m.runde}-${m.art}-${m.t0 || 0}`;
  if (!el || titelGesehen.has(k)) return;
  titelGesehen.add(k);
  el.classList.add("ankunft");
}
// nach dem Minispiel: wer oben aufs Treppchen kommt
function miniSieger(s, m) {
  const teil = teilVon(s, m), sieger = m.sieger || [], verl = m.verlierer || [];
  let plaetze;
  if (m.modus === "team" || m.modus === "eins" || sieger.length > 1) plaetze = teil.map((j) => [j, sieger.includes(j) ? 1 : 0]);
  else plaetze = (m.rang || teil).map((j, r) => [j, r < 3 ? r + 1 : 0]);
  return { plaetze, jubel: sieger, trauer: verl };
}
function endSieger(s) {
  const rang = rangfolge(s);
  return { plaetze: rang.map((j, r) => [j, r < 3 ? r + 1 : 0]), jubel: [rang[0]], trauer: rang.length > 1 ? [rang[rang.length - 1]] : [] };
}
function miniNach(s, ich, senden) {
  const m = s.mini;
  if (!m || m.fertig) return;
  miniTitelkarte(m);
  abbruchZeigen(m);
  if (ich < 0 || m.werte[ich] !== undefined || !teilVon(s, m).includes(ich)) return;
  if (R.istNeu(m.art)) return R.anmelden(m, `h${ich}`, (wert, mk) => senden({ typ: "mini", wert, mk }), null, ich);
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
  const bb = B(s), L = bb.lage;
  const xs = L.map((p) => p.x), zs = L.map((p) => p.z);
  const x0 = Math.min(...xs) - 1.4, z0 = Math.min(...zs) - 1.4, w = Math.max(...xs) + 1.4 - x0, h = Math.max(...zs) + 1.4 - z0;
  const linien = bb.next.flatMap((nx, i) => nx.map((j) => `<line x1="${L[i].x}" y1="${L[i].z}" x2="${L[j].x}" y2="${L[j].z}"/>`)).join("");
  const felder = L.map((p, i) => { const art = artVon(s, i), zu = istGesperrt(s, bb, i); return `<g class="f2 art-${art === "a" ? "t" : art}${i === s.stern ? " sternfeld" : ""}${zu ? " zu" : ""}"><circle cx="${p.x}" cy="${p.z}" r="0.72"/><text x="${p.x}" y="${p.z + 0.3}">${i === s.stern ? "⭐" : zu ? "🚫" : ART[art][0]}</text></g>`; }).join("");
  const figuren = s.pos.map((f, j) => `<circle class="fig2 f${fk(s, j)}" cx="${L[f].x + Math.cos(j * 1.57) * 0.45}" cy="${L[f].z + Math.sin(j * 1.57) * 0.45}" r="0.36"/>`).join("");
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
