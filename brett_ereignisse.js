// Ereignisfeld "?" im Partybrett (Nico 31.10.2026, Punkt 8: "rund 100 verschiedene Zufaelle, daneben eine Liste aller
// Ereignisse, in der der Gastgeber einzelne streichen kann - wird gemerkt"). Reine Daten + Wirkung; brett.js zieht und
// wendet an, app.js zeigt die Streichliste (raum.brettWeg = gestrichene Kennungen).
//
// Eintrag: { id, kat, text, trink?, boese?, f(s, i, h) -> Zusatztext | undefined }
//   trink = nur "mit Trinken" (ohne Trinken nie gezogen, Nico: "Trinken-Ereignisse nur bei 'mit Trinken'")
//   boese = schadet dem, der draufsteht (ein Schutzschild faengt es ab)
// Die Kennungen bleiben fest (die Streichliste merkt sich das Geraet). Neue Eintraege nur hinten mit neuer Nummer anhaengen.
// h = Helfer aus brett.js: n, nm, rnd(k), muenzen(j, d), sterne(j, d), vor(j, k), zurueck(j, k), tausch(j, k),
//     gib(j, ware), stern(), erster(), letzter(), reichster(), aermster(), anderer(i), zuStern(j), extraWurf(j)

export const KATEGORIEN = [
  ["glueck", "🍀 Glück"], ["pech", "🌧️ Pech"], ["stern", "⭐ Sterne"], ["weg", "🌀 Bewegung"], ["tausch", "🔄 Tauschen & Klauen"],
  ["alle", "👥 Für alle"], ["ware", "🎒 Gegenstände"], ["spass", "🎭 Spaß-Aufgaben"], ["trink", "🍺 Trinken (nur mit Trinken)"],
];

const L = [];
let nr = 0;
const e = (kat, text, f, mehr = {}) => L.push({ id: `${kat}${++nr}`, kat, text, f: f || (() => {}), ...mehr });

// ---------------------------------------------------------------- Glueck (Muenzen fuer dich)
e("glueck", "Glückspilz! Du findest 6 Münzen.", (s, i, h) => { h.muenzen(i, 6); });
e("glueck", "Ein Goldregen: +10 Münzen!", (s, i, h) => { h.muenzen(i, 10); });
e("glueck", "Du findest eine Münze im Sofa. +1 Münze (immerhin).", (s, i, h) => { h.muenzen(i, 1); });
e("glueck", "Geburtstagsgeschenk von Oma: +5 Münzen.", (s, i, h) => { h.muenzen(i, 5); });
e("glueck", "Pfandflaschen abgegeben: +4 Münzen.", (s, i, h) => { h.muenzen(i, 4); });
e("glueck", "Würfle noch einmal – so viele Münzen bekommst du.", (s, i, h) => { const w = 1 + h.rnd(6); h.muenzen(i, w); return `Gewürfelt: ${w}.`; });
e("glueck", "Doppelt hält besser: deine Münzen verdoppeln sich (höchstens +10).", (s, i, h) => { const d = Math.min(10, s.muenzen[i]); h.muenzen(i, d); return `+${d} Münzen.`; });
e("glueck", "Lottoschein! 1 zu 3: du gewinnst 15 Münzen.", (s, i, h) => { if (h.rnd(3) === 0) { h.muenzen(i, 15); return "Gewonnen! +15 Münzen."; } return "Leider nichts."; });
e("glueck", "Finderlohn: für jeden Mitspieler 1 Münze.", (s, i, h) => { h.muenzen(i, h.n - 1); });
e("glueck", "Zinsen! Du bekommst 1 Münze für je 5, die du hast.", (s, i, h) => { const d = Math.floor(s.muenzen[i] / 5); h.muenzen(i, d); return `+${d} Münzen.`; });
e("glueck", "Bonus für den Letzten: liegst du hinten, gibt es 8 Münzen – sonst 2.", (s, i, h) => { const d = h.letzter() === i ? 8 : 2; h.muenzen(i, d); return `+${d} Münzen.`; });
e("glueck", "Schatzkarte: 3 bis 9 Münzen, je nach Würfel.", (s, i, h) => { const d = 3 + h.rnd(7); h.muenzen(i, d); return `+${d} Münzen.`; });

// ---------------------------------------------------------------- Pech (schadet dir)
e("pech", "Taschendieb! Du verlierst 5 Münzen.", (s, i, h) => { h.muenzen(i, -5); }, { boese: true });
e("pech", "Loch in der Tasche: −3 Münzen.", (s, i, h) => { h.muenzen(i, -3); }, { boese: true });
e("pech", "Strafzettel fürs Falschparken: −4 Münzen.", (s, i, h) => { h.muenzen(i, -4); }, { boese: true });
e("pech", "Handy runtergefallen – Reparatur: −6 Münzen.", (s, i, h) => { h.muenzen(i, -6); }, { boese: true });
e("pech", "Die Hälfte deiner Münzen fällt in einen Gully (höchstens 8).", (s, i, h) => { const d = Math.min(8, Math.floor(s.muenzen[i] / 2)); h.muenzen(i, -d); return `−${d} Münzen.`; }, { boese: true });
e("pech", "Bananenschale! Du rutschst 3 Felder zurück.", (s, i, h) => { h.zurueck(i, 3); }, { boese: true });
e("pech", "Sturm! Du wirst 5 Felder zurückgeweht.", (s, i, h) => { h.zurueck(i, 5); }, { boese: true });
e("pech", "Spendenaufruf: 2 Münzen an jeden anderen.", (s, i, h) => { let g = 0; for (let j = 0; j < h.n; j++) if (j !== i) { const d = -h.muenzen(i, -2); h.muenzen(j, d); g += d; } return `Verteilt: ${g}.`; }, { boese: true });
e("pech", "Würfle: so viele Münzen verlierst du.", (s, i, h) => { const w = 1 + h.rnd(6); h.muenzen(i, -w); return `Gewürfelt: ${w}.`; }, { boese: true });
e("pech", "Abo vergessen zu kündigen: −2 Münzen.", (s, i, h) => { h.muenzen(i, -2); }, { boese: true });
e("pech", "Du verlierst alle Gegenstände aus deinem Beutel.", (s, i, h) => { const w = (s.waren[i] || []).length; s.waren[i] = []; return w ? `${w} weg.` : "Der Beutel war eh leer."; }, { boese: true });
e("pech", "Pech im Glück: −3 Münzen, dafür bekommst du einen Schutzschild.", (s, i, h) => { h.muenzen(i, -3); h.gib(i, "schild"); });

// ---------------------------------------------------------------- Sterne
e("stern", "Sternschnuppe! Du bekommst einen Stern geschenkt.", (s, i, h) => { h.sterne(i, 1); });
e("stern", "Stern-Umzug: der Stern wandert woanders hin.", (s, i, h) => { h.stern(); });
e("stern", "Sternenbus: du landest direkt vor dem Stern.", (s, i, h) => { h.zuStern(i); });
e("stern", "Sterndieb! Wer die meisten Sterne hat, verliert einen – an dich. (Nur, wenn du nicht selbst vorne bist.)", (s, i, h) => { const r = h.erster(); if (r === i || s.sterne[r] < 1) return "Niemand zum Beklauen."; h.sterne(r, -1); h.sterne(i, 1); return `${h.nm[r]} gibt dir einen Stern!`; });
e("stern", "Sternenmarkt: kauf jetzt einen Stern für 15 Münzen – wenn du sie hast.", (s, i, h) => { if (s.muenzen[i] < 15) return "Zu wenig Münzen."; h.muenzen(i, -15); h.sterne(i, 1); return "Gekauft! ⭐"; });
e("stern", "Glücksstern: 1 zu 4, dass du einen Stern bekommst.", (s, i, h) => { if (h.rnd(4) === 0) { h.sterne(i, 1); return "Treffer! ⭐"; } return "Diesmal nicht."; });
e("stern", "Wackelstern: du verlierst einen Stern – falls du einen hast.", (s, i, h) => { if (s.sterne[i] < 1) return "Glück gehabt, du hast keinen."; h.sterne(i, -1); }, { boese: true });
e("stern", "Sternentausch: du tauschst deine Sterne mit dem Spieler direkt hinter dir in der Wertung.", (s, i, h) => { const k = h.hinterMir(i); if (k < 0) return "Hinter dir ist keiner."; [s.sterne[i], s.sterne[k]] = [s.sterne[k], s.sterne[i]]; return `Getauscht mit ${h.nm[k]}.`; });
e("stern", "Sternenrabatt: der nächste Stern kostet dich nur die Hälfte.", (s, i, h) => { s.rabatt[i] = true; });
e("stern", "Der Stern hüpft 6 Felder weiter.", (s, i, h) => { h.sternVor(6); });

// ---------------------------------------------------------------- Bewegung
e("weg", "Teleport! Du landest 4 Felder weiter.", (s, i, h) => { h.vor(i, 4); });
e("weg", "Rückenwind: 6 Felder vor.", (s, i, h) => { h.vor(i, 6); });
e("weg", "Zufallsportal: du landest irgendwo auf dem Brett.", (s, i, h) => { h.irgendwo(i); });
e("weg", "Extrawurf! Du darfst gleich noch einmal würfeln.", (s, i, h) => { h.extraWurf(i); });
e("weg", "Trampolin: 2 Felder vor und +2 Münzen.", (s, i, h) => { h.vor(i, 2); h.muenzen(i, 2); });
e("weg", "Rolltreppe nach unten: 2 Felder zurück, dafür +3 Münzen.", (s, i, h) => { h.zurueck(i, 2); h.muenzen(i, 3); });
e("weg", "Zurück zum Start – dort gibt es 5 Münzen Trost.", (s, i, h) => { h.nachStart(i); h.muenzen(i, 5); }, { boese: true });
e("weg", "Magnet: alle anderen werden 2 Felder zu dir herangezogen.", (s, i, h) => { for (let j = 0; j < h.n; j++) if (j !== i) h.vor(j, 2); });
e("weg", "Rakete: würfle – so viele Felder fliegst du weiter.", (s, i, h) => { const w = 1 + h.rnd(6); h.vor(i, w); return `Gewürfelt: ${w}.`; });
e("weg", "Nebel: der Spieler vor dir in der Wertung muss 3 Felder zurück.", (s, i, h) => { const k = h.vorMir(i); if (k < 0) return "Du bist vorne – nichts passiert."; if (h.geschuetzt(k)) return `${h.nm[k]} hat einen Schild.`; h.zurueck(k, 3); return `${h.nm[k]} muss zurück.`; });

// ---------------------------------------------------------------- Tauschen & Klauen
e("tausch", "Robin Hood: der Reichste gibt dir 4 Münzen.", (s, i, h) => { const r = h.reichster(i); if (r < 0) return "Du bist selbst der Reichste."; if (h.geschuetzt(r)) return `${h.nm[r]} hat einen Schild.`; const d = -h.muenzen(r, -4); h.muenzen(i, d); return `${h.nm[r]} zahlt ${d}.`; });
e("tausch", "Platztausch mit einem zufälligen Mitspieler.", (s, i, h) => { const k = h.anderer(i); if (k < 0) return; h.tausch(i, k); return `Getauscht mit ${h.nm[k]}.`; });
e("tausch", "Münztausch: du tauschst alle Münzen mit dem Ärmsten.", (s, i, h) => { const k = h.aermster(i); if (k < 0) return "Niemand hat weniger."; [s.muenzen[i], s.muenzen[k]] = [s.muenzen[k], s.muenzen[i]]; return `Getauscht mit ${h.nm[k]}.`; }, { boese: true });
e("tausch", "Münztausch: du tauschst alle Münzen mit dem Reichsten.", (s, i, h) => { const k = h.reichster(i); if (k < 0) return "Du bist schon der Reichste."; if (h.geschuetzt(k)) return `${h.nm[k]} hat einen Schild.`; [s.muenzen[i], s.muenzen[k]] = [s.muenzen[k], s.muenzen[i]]; return `Getauscht mit ${h.nm[k]}.`; });
e("tausch", "Wegelagerer: jeder andere gibt dir 1 Münze.", (s, i, h) => { let g = 0; for (let j = 0; j < h.n; j++) if (j !== i && !h.geschuetzt(j)) { const d = -h.muenzen(j, -1); g += d; } h.muenzen(i, g); return `+${g} Münzen.`; });
e("tausch", "Zollstation: wer vor dir in der Wertung liegt, zahlt dir 3 Münzen.", (s, i, h) => { const k = h.vorMir(i); if (k < 0) return "Du bist vorne."; if (h.geschuetzt(k)) return `${h.nm[k]} hat einen Schild.`; const d = -h.muenzen(k, -3); h.muenzen(i, d); return `${h.nm[k]} zahlt ${d}.`; });
e("tausch", "Klau-Elster: ein zufälliger Mitspieler verliert einen Gegenstand an dich.", (s, i, h) => { const mit = [...Array(h.n).keys()].filter((j) => j !== i && (s.waren[j] || []).length && !h.geschuetzt(j)); if (!mit.length) return "Niemand hat etwas."; const k = mit[h.rnd(mit.length)]; const w = s.waren[k].splice(h.rnd(s.waren[k].length), 1)[0]; h.gib(i, w); return `Von ${h.nm[k]}.`; });
e("tausch", "Schuldschein: du gibst dem Letzten 4 Münzen.", (s, i, h) => { const k = h.letzter(); if (k === i) return "Du bist selbst Letzter – du behältst sie."; const d = -h.muenzen(i, -4); h.muenzen(k, d); return `${h.nm[k]} bekommt ${d}.`; }, { boese: true });
e("tausch", "Hütchenspiel gegen einen Zufallsgegner: Gewinner bekommt 5 Münzen vom anderen.", (s, i, h) => { const k = h.anderer(i); if (k < 0) return; const [w, v] = h.rnd(2) ? [i, k] : [k, i]; const d = -h.muenzen(v, -5); h.muenzen(w, d); return `${h.nm[w]} gewinnt ${d}.`; });
e("tausch", "Positionswechsel: der Erste und der Letzte tauschen ihre Plätze auf dem Brett.", (s, i, h) => { const a = h.erster(), b = h.letzter(); if (a === b) return; h.tausch(a, b); return `${h.nm[a]} ⇄ ${h.nm[b]}.`; });

// ---------------------------------------------------------------- Fuer alle
e("alle", "Spendierrunde: alle bekommen 3 Münzen.", (s, i, h) => { for (let j = 0; j < h.n; j++) h.muenzen(j, 3); });
e("alle", "Inflation! Alle verlieren 2 Münzen.", (s, i, h) => { for (let j = 0; j < h.n; j++) if (!h.geschuetzt(j)) h.muenzen(j, -2); });
e("alle", "Kommunismus: alle Münzen werden gleich verteilt.", (s, i, h) => { const sum = s.muenzen.reduce((a, b) => a + b, 0); const je = Math.floor(sum / h.n); for (let j = 0; j < h.n; j++) s.muenzen[j] = je; return `Jeder hat jetzt ${je}.`; });
e("alle", "Erdbeben: alle Figuren rutschen 2 Felder zurück.", (s, i, h) => { for (let j = 0; j < h.n; j++) h.zurueck(j, 2); });
e("alle", "Wirbelsturm: alle Figuren werden zufällig neu gemischt.", (s, i, h) => { const p = [...s.pos]; for (let k = p.length - 1; k > 0; k--) { const j = h.rnd(k + 1); [p[k], p[j]] = [p[j], p[k]]; } s.pos = p; });
e("alle", "Geschenkregen: der Letzte bekommt 10 Münzen.", (s, i, h) => { const k = h.letzter(); h.muenzen(k, 10); return `${h.nm[k]} freut sich.`; });
e("alle", "Steuerprüfung: wer die meisten Münzen hat, zahlt 5 in die Mitte (weg).", (s, i, h) => { const k = h.reichster(-1); if (h.geschuetzt(k)) return `${h.nm[k]} hat einen Schild.`; h.muenzen(k, -5); return `${h.nm[k]} zahlt.`; });
e("alle", "Alle bekommen so viele Münzen, wie sie Sterne haben (mal 2).", (s, i, h) => { for (let j = 0; j < h.n; j++) h.muenzen(j, s.sterne[j] * 2); });
e("alle", "Die Reichen geben ab: jeder mit mehr als 15 Münzen gibt 3 an dich.", (s, i, h) => { let g = 0; for (let j = 0; j < h.n; j++) if (j !== i && s.muenzen[j] > 15 && !h.geschuetzt(j)) { h.muenzen(j, -3); g += 3; } h.muenzen(i, g); return g ? `+${g} Münzen.` : "Keiner ist so reich."; });
e("alle", "Alle anderen würfeln: wer eine 1 hat, gibt dir 3 Münzen.", (s, i, h) => { let g = 0; const wer = []; for (let j = 0; j < h.n; j++) if (j !== i && h.rnd(6) === 0) { g -= h.muenzen(j, -3); wer.push(h.nm[j]); } h.muenzen(i, g); return wer.length ? `${wer.join(", ")} zahlen.` : "Keine 1 dabei."; });
e("alle", "Aufholjagd: alle, die hinter dir liegen, rücken 3 Felder vor.", (s, i, h) => { h.hinterAllen(i).forEach((j) => h.vor(j, 3)); });
e("alle", "Gleichstand: jeder bekommt so viele Münzen, dass er mindestens 5 hat.", (s, i, h) => { for (let j = 0; j < h.n; j++) if (s.muenzen[j] < 5) s.muenzen[j] = 5; });

// ---------------------------------------------------------------- Gegenstaende
e("ware", "Fundsache: ein Doppelwürfel für deinen Beutel.", (s, i, h) => { h.gib(i, "doppel"); });
e("ware", "Fundsache: ein Schutzschild.", (s, i, h) => { h.gib(i, "schild"); });
e("ware", "Fundsache: ein Münzmagnet.", (s, i, h) => { h.gib(i, "dieb"); });
e("ware", "Fundsache: eine Falle.", (s, i, h) => { h.gib(i, "falle"); });
e("ware", "Fundsache: ein Tauschtrank.", (s, i, h) => { h.gib(i, "tausch"); });
e("ware", "Glückstag: ein Dreifachwürfel!", (s, i, h) => { h.gib(i, "dreifach"); });
e("ware", "Jackpot: ein Sternenrohr (bringt dich direkt vor den Stern).", (s, i, h) => { h.gib(i, "rohr"); });
e("ware", "Wundertüte: ein zufälliger Gegenstand.", (s, i, h) => { const w = h.zufallWare(); h.gib(i, w); return `Drin: ${h.wareName(w)}.`; });
e("ware", "Flohmarkt: du verkaufst einen Gegenstand für 6 Münzen.", (s, i, h) => { const b = s.waren[i] || []; if (!b.length) return "Dein Beutel ist leer."; const w = b.pop(); h.muenzen(i, 6); return `${h.wareName(w)} verkauft.`; });
e("ware", "Großzügig: alle anderen bekommen einen Mini-Würfel.", (s, i, h) => { for (let j = 0; j < h.n; j++) if (j !== i) h.gib(j, "mini"); });

// ---------------------------------------------------------------- Spass-Aufgaben (die Runde schaut zu, Wirkung fest)
e("spass", "Mach eine Tierstimme – die Runde klatscht, du bekommst 3 Münzen.", (s, i, h) => { h.muenzen(i, 3); });
e("spass", "Erzähl einen Witz. Lacht jemand: +4 Münzen. (Die Runde ist großzügig – es gibt die Münzen sowieso.)", (s, i, h) => { h.muenzen(i, 4); });
e("spass", "Sing die erste Zeile eines Liedes – +3 Münzen.", (s, i, h) => { h.muenzen(i, 3); });
e("spass", "Mach 10 Kniebeugen – dafür +4 Münzen.", (s, i, h) => { h.muenzen(i, 4); });
e("spass", "Mach dein bestes Siegerfoto-Gesicht. Alle anderen machen es nach. +2 Münzen.", (s, i, h) => { h.muenzen(i, 2); });
e("spass", "Sag jedem Mitspieler ein Kompliment – für jeden 1 Münze.", (s, i, h) => { h.muenzen(i, h.n - 1); });
e("spass", "Alle applaudieren dir 5 Sekunden lang. Genieß es!", () => {});
e("spass", "Sprich bis zu deinem nächsten Zug nur in Reimen. Schaffst du es: die Runde gönnt dir 3 Münzen – gibt es gleich.", (s, i, h) => { h.muenzen(i, 3); });
e("spass", "Erfinde einen Spitznamen für den Spieler links von dir – +2 Münzen.", (s, i, h) => { h.muenzen(i, 2); });
e("spass", "Imitiere einen Mitspieler, die anderen raten wen – +3 Münzen.", (s, i, h) => { h.muenzen(i, 3); });
e("spass", "Halte 20 Sekunden lang die Luft an … oder zahl 2 Münzen. (Wir glauben dir.)", () => {});
e("spass", "Wähle jemanden, der eine Runde lang dein Diener ist (Snacks holen, Würfel reichen).", () => {});

// ---------------------------------------------------------------- Trinken (nur mit Trinken)
e("trink", "Alle anderen trinken einen Schluck auf dich.", () => {}, { trink: true });
e("trink", "Du trinkst 2 Schlucke – dafür +4 Münzen.", (s, i, h) => { h.muenzen(i, 4); }, { trink: true });
e("trink", "Schenk jemandem 3 Münzen – oder trink 3 Schlucke.", () => {}, { trink: true });
e("trink", "Wasserfall! Alle trinken, du hörst als Erster auf.", () => {}, { trink: true });
e("trink", "Verteile 3 Schlucke, wie du willst.", () => {}, { trink: true });
e("trink", "Der Reichste trinkt 2 Schlucke.", (s, i, h) => { return `${h.nm[h.reichster(-1)]} ist dran.`; }, { trink: true });
e("trink", "Der Letzte darf 4 Schlucke verteilen.", (s, i, h) => { return `${h.nm[h.letzter()]} verteilt.`; }, { trink: true });
e("trink", "Prost-Runde: alle trinken einen Schluck.", () => {}, { trink: true });
e("trink", "Trinkpartner: such dir jemanden aus – bis zu deinem nächsten Zug trinkt ihr immer zusammen.", () => {}, { trink: true });
e("trink", "Würfle: so viele Schlucke trinkst du – oder zahl die doppelte Zahl in Münzen.", (s, i, h) => { const w = 1 + h.rnd(6); return `Gewürfelt: ${w}.`; }, { trink: true });
e("trink", "Wer die wenigsten Sterne hat, trinkt einen Schluck.", () => {}, { trink: true });
e("trink", "Du trinkst einen Schluck und bekommst einen Schutzschild.", (s, i, h) => { h.gib(i, "schild"); }, { trink: true });
e("trink", "Alle mit mehr Münzen als du trinken einen Schluck.", () => {}, { trink: true });
e("trink", "Ex oder 5 Münzen: du entscheidest.", () => {}, { trink: true });
e("trink", "Regel erfinden: bis zum Spielende trinkt, wer sie bricht.", () => {}, { trink: true });
e("trink", "Spiegel: der Spieler rechts von dir trinkt so viel wie du – zwei Schlucke für euch beide.", () => {}, { trink: true });

export const EREIGNISSE = L;
export const anzahl = () => L.length;
export const nachId = (id) => L.find((x) => x.id === id);
const gueltig = new Set(L.map((x) => x.id));

// ziehbar: nicht gestrichen und - ohne Trinken - keine Trink-Ereignisse
export function ziehbar(weg, ohne) {
  const w = new Set(Array.isArray(weg) ? weg : []);
  return L.filter((x) => !w.has(x.id) && !(ohne && x.trink));
}

// Streichliste aendern (nur Spielleitung; app.js prueft die Rechte). -> true, wenn sich etwas geaendert hat
export function streichAktion(raum, a) {
  const weg = new Set(Array.isArray(raum.brettWeg) ? raum.brettWeg.filter((id) => gueltig.has(id)) : []);
  const vorher = weg.size;
  if (a.was === "streichen" && gueltig.has(a.id)) { if (weg.has(a.id)) weg.delete(a.id); else weg.add(a.id); }
  else if (a.was === "kat" && KATEGORIEN.some(([k]) => k === a.kat)) {
    const ids = L.filter((x) => x.kat === a.kat).map((x) => x.id);
    const alleWeg = ids.every((id) => weg.has(id));
    ids.forEach((id) => (alleWeg ? weg.delete(id) : weg.add(id)));
  } else if (a.was === "alleauf") weg.clear();
  else return false;
  const neu = [...weg];
  const anders = neu.length !== vorher || a.was === "streichen" || a.was === "kat";
  raum.brettWeg = neu;
  return anders;
}
// gemerkte Liste (Gastgeber-Geraet) uebernehmen - nur bekannte Kennungen
export function merkUebernehmen(raum, liste) {
  if (!Array.isArray(liste)) return false;
  raum.brettWeg = liste.filter((id) => gueltig.has(id));
  return true;
}
