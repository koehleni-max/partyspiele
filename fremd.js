// Adapter fuer fertige Spiele aus "LAN Games" (kbennett2000, MIT): deren Regelwerk laeuft beim Gastgeber,
// deren Anzeige auf jedem Handy; englische Texte werden beim Anzeigen ins Deutsche uebertragen.
import { esc, knopf } from "./hilfe.js";
import * as VIER from "./fremd/connect-four.js";
import * as TTT from "./fremd/tic-tac-toe.js";
import * as WUERFEL from "./fremd/yahtzee.js";
import * as DAME from "./fremd/checkers.js";
import * as SCHIFFE from "./fremd/battleship.js";

const DE = [
  [/'s fleet is waiting\.?/gi, "s Flotte wartet."], [/Your shot/gi, "Dein Schuss"], [/click anywhere on/gi, "tippe auf ein Feld in"], [/\bfire!/g, "schieß!"],
  [/pick a column/gi, "wähle eine Spalte"], [/\bclick\b/gi, "tippe"], [/\btap\b/gi, "tippe"], [/ is thinking/gi, " überlegt"],
  [/ is firing at you/gi, " schießt auf dich"], [/ is aiming/gi, " zielt"], [/'s waters/gi, "s Gewässer"], [/firing at/gi, "schießt auf"], [/aiming/gi, "zielt"],
  [/Fire at/gi, "Schieß auf"], [/You sank/gi, "Du hast versenkt:"], [/sank your/gi, "versenkt dein"], [/You won/gi, "Du hast gewonnen"], [/You lost/gi, "Du hast verloren"],
  [/Unplaced ships/gi, "Noch nicht aufgestellt"], [/Press R while dragging to rotate\.?/gi, "Am PC ziehen (R dreht) – am Handy einfach oben zufällig aufstellen."],
  [/ is placing their ships/gi, " stellt die Flotte auf"], [/(\d) von (\d) placed/g, "$1 von $2 aufgestellt"], [/placed/g, "aufgestellt"],
  [/select a piece to move/gi, "wähle einen Stein"], [/select a destination/gi, "wähle das Ziel"], [/their/g, "seine"],
  [/Grand Total/gi, "Gesamt"], [/Grand Summe/g, "Gesamt"], [/Subtotal/gi, "Zwischensumme"], [/\(\+35 if ≥63\)/g, "(+35 ab 63)"], [/\bif\b/g, "ab"],
  [/3 of a Kind/gi, "Dreierpasch"], [/4 of a Kind/gi, "Viererpasch"], [/(\d) of (\d)/g, "$1 von $2"], [/(\d+) held/g, "$1 gehalten"],
  [/re-roll or/gi, "nochmal würfeln oder"], [/re-roll/gi, "nochmal würfeln"], [/pick a category/gi, "Feld wählen"], [/\bor\b/g, "oder"],
  [/Your turn/gi, "Du bist dran"], [/your turn/gi, "du bist dran"], [/'s turn/g, " ist dran"], [/Waiting for/gi, "Warte auf"], [/Waiting/gi, "Warte"],
  [/wins!?/gi, "gewinnt!"], [/won!?/gi, "hat gewonnen!"], [/Draw/g, "Unentschieden"], [/Game over/gi, "Spiel vorbei"],
  [/Roll Dice/gi, "Würfeln"], [/Roll/g, "Würfeln"], [/Rolls left/gi, "Würfe übrig"], [/rolls? left/gi, "Würfe übrig"], [/Hold/g, "Halten"], [/Held/g, "Gehalten"],
  [/Ones/g, "Einser"], [/Twos/g, "Zweier"], [/Threes/g, "Dreier"], [/Fours/g, "Vierer"], [/Fives/g, "Fünfer"], [/Sixes/g, "Sechser"],
  [/Three of a Kind/gi, "Dreierpasch"], [/Four of a Kind/gi, "Viererpasch"], [/Full House/gi, "Full House"], [/Small Straight/gi, "Kleine Straße"],
  [/Large Straight/gi, "Große Straße"], [/Yahtzee/g, "Fünferpasch"], [/YAHTZEE/g, "FÜNFERPASCH"], [/Chance/g, "Chance"], [/Upper Bonus/gi, "Bonus oben"],
  [/Bonus/g, "Bonus"], [/Total/g, "Summe"], [/Upper/g, "Oben"], [/Lower/g, "Unten"], [/Score/g, "Punkte"], [/score/g, "Punkte"], [/Category/g, "Kategorie"],
  [/Place your ships/gi, "Stelle deine Schiffe auf"], [/Ready/g, "Fertig"], [/Rotate/g, "Drehen"], [/Horizontal/g, "Waagerecht"], [/Vertical/g, "Senkrecht"],
  [/Random/g, "Zufällig"], [/Fire!?/g, "Feuer!"], [/Hit!?/g, "Treffer!"], [/Miss/g, "Daneben"], [/Sunk/gi, "Versenkt"], [/Your fleet/gi, "Deine Flotte"],
  [/Enemy waters/gi, "Feindliche Gewässer"], [/Enemy/g, "Gegner"], [/Carrier/g, "Flugzeugträger"], [/Battleship/g, "Schlachtschiff"], [/Cruiser/g, "Kreuzer"],
  [/Submarine/g, "U-Boot"], [/Destroyer/g, "Zerstörer"], [/King/g, "Dame"], [/must jump/gi, "muss schlagen"], [/Jump/g, "Schlagen"], [/Move/g, "Zug"],
  [/Actions/g, "Aktionen"], [/Spectating/gi, "Zuschauen"], [/Player/g, "Spieler"], [/Drop/g, "Einwerfen"], [/Column/g, "Spalte"], [/Turn/g, "Zug"],
];
function uebersetzen(knoten) {
  if (!knoten || !knoten.nodeType) return; // Spiel schon geschlossen, bevor die Uebersetzung lief
  const walker = document.createTreeWalker(knoten, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    let t = n.nodeValue, neu = t;
    for (const [re, de] of DE) neu = neu.replace(re, de);
    if (neu !== t) n.nodeValue = neu;
  }
  knoten.querySelectorAll && knoten.querySelectorAll("[title]").forEach((el) => { let t = el.title; for (const [re, de] of DE) t = t.replace(re, de); el.title = t; });
}

const buehnen = {};
let aktuelleAnsicht = null;

function fremdSpiel({ id, name, emoji, kurz, farben, M, regeln, gruppe, bot }) {
  const meta = M.LOGIK.getGameMetadata ? M.LOGIK.getGameMetadata() : { maxPlayers: 8 };
  return {
    id, name, emoji, kurz, farben, fremd: true,
    // Gesamtwertung: das Regelwerk traegt den Sieger in state.winner ein (Spieler-Nr. als Text, bei Gleichstand eine
    // Liste; Unentschieden = null)
    ergebnis(s) {
      const w = s.st && s.st.winner;
      if (w === null || w === undefined) return null;
      const sieger = [w].flat().map(Number).filter((j) => Number.isInteger(j));
      return sieger.length ? { nr: String(s.partie), sieger } : null;
    },
    ...(bot ? {
      botPause: () => 1300,
      bot(s, i) {
        const uid = String(i);
        if (i >= (s.st.players || []).length) return null;
        if (s.st.status && s.st.status !== "playing") return null;
        const gueltig = M.LOGIK.getValidActions ? M.LOGIK.getValidActions(s.st, uid).filter((x) => x !== "skipTurn") : [];
        if (!gueltig.length) return null;
        const zug = bot(s.st, uid, (action, payload) => { const r = M.LOGIK.applyAction(s.st, uid, action, payload || {}); return r.error ? null : r; }, gueltig);
        return zug ? (zug.typ ? zug : { typ: "fremd", action: zug.action, payload: zug.payload }) : null;
      },
    } : {}),
    start(namen) {
      const config = M.LOGIK.loadConfig ? M.LOGIK.loadConfig() : M.LOGIK.getConfigCopy();
      const spieler = [];
      namen.slice(0, meta.maxPlayers || namen.length).forEach((n, i) => spieler.push(M.LOGIK.createInitialPlayer({ id: String(i), username: n }, spieler, config)));
      return { st: M.LOGIK.initGame("party", name, spieler, config), nr: 0, ereignisse: [], partie: Date.now() % 1e6, fehler: null };
    },
    aktion(s, i, a, namen) {
      if (a.typ === "neu") return Object.assign(s, this.start(namen));
      if (a.typ === "zufall") return zufallsFlotte(M, s, String(i));
      if (a.typ !== "fremd") return;
      let r;
      try { r = M.LOGIK.applyAction(s.st, String(i), a.action, a.payload || {}); } catch (e) { s.fehler = { i, text: String(e.message || e), n: Date.now() }; return; }
      if (r.error) { s.fehler = { i, text: r.error, n: Date.now() }; return; }
      s.st = r.state; s.nr++; s.ereignisse = (r.events || []).map((e) => ({ ...e, nr: s.nr })).slice(-12);
    },
    render(s, ich, namen) {
      const mitspieler = (s.st.players || []).length;
      const zuschauer = ich >= mitspieler;
      const vorbei = s.st.status === "finished" || s.st.phase === "finished" || s.st.gameOver || s.st.winner !== undefined && s.st.winner !== null;
      const ichSpieler = (s.st.players || [])[ich];
      const flotteKnopf = id === "f-schiffe" && !zuschauer && s.st.turnState?.phase === "setup" && ichSpieler && !ichSpieler.ready
        ? knopf("🎲 Flotte zufällig aufstellen", { typ: "zufall" }, "gross zufall-flotte") : "";
      return `${flotteKnopf}${zuschauer ? `<div class="hinweisbox warten">👀 Dieses Spiel ist für ${mitspieler} Spieler – du schaust zu.</div>` : ""}
        <div id="fremd-platz" class="fremd-platz"></div>
        ${s.fehler && s.fehler.i === ich ? `<div class="hinweisbox" data-key="f${s.fehler.n}">⚠️ ${esc(uebersetzt(s.fehler.text))}</div>` : ""}
        ${vorbei ? `<i hidden data-ergebnis="f${s.partie}-${s.nr}"></i>${knopf("🔄 Neue Partie", { typ: "neu" }, "gross")}` : ""}
        <details class="grundregeln"><summary>📖 So geht's</summary>${regeln}</details>
        <p class="leise klein mitte">Fertiges Spiel aus „LAN Games“ von kbennett2000 (MIT-Lizenz), eingebunden von Jarvis.</p>`;
    },
    nach(s, ich, senden) {
      const platz = document.getElementById("fremd-platz");
      if (!platz) return;
      const schluessel = `${id}-${s.partie}-${ich}`;
      let b = buehnen[schluessel];
      const uid = String(ich);
      let ansicht = M.LOGIK.getStateForPlayer ? M.LOGIK.getStateForPlayer(s.st, uid) : s.st;
      if (M.LOGIK.getValidActions) ansicht = { ...ansicht, validActions: M.LOGIK.getValidActions(ansicht, uid) };
      if (M.LOGIK.getActionDescriptors) ansicht = { ...ansicht, actionDescriptors: M.LOGIK.getActionDescriptors(ansicht, uid) };
      ansicht = { ...ansicht, spectators: [] };
      aktuelleAnsicht = ansicht;
      if (!b) {
        Object.keys(buehnen).filter((k) => k.startsWith(id)).forEach((k) => { try { buehnen[k].r.destroy(); } catch (e) {} delete buehnen[k]; });
        const el = document.createElement("div");
        el.className = "fremd-buehne";
        el.innerHTML = `<div class="fremd-spiel"></div><div class="fremd-aktionen"><h3 id="action-title"></h3><div id="action-buttons" class="action-buttons"></div><div id="auction-panel" style="display:none"></div></div><ul class="fremd-log"></ul>`;
        const log = el.querySelector(".fremd-log");
        const UIManager = { appendLog: (t) => { const li = document.createElement("li"); li.textContent = t; log.prepend(li); while (log.children.length > 6) log.lastChild.remove(); uebersetzen(li); } };
        const SoundManager = new Proxy({}, { get: () => () => {} });
        let renderer = null;
        const Registry = { register: (_n, r) => (renderer = r) };
        const r = M.ANZEIGE(UIManager, SoundManager, Registry, { getState: () => aktuelleAnsicht });
        b = buehnen[schluessel] = { el, r, nr: -1 };
        platz.appendChild(el);
        const zuschauer = ich >= (s.st.players || []).length;
        r.init(el.querySelector(".fremd-spiel"), ansicht, String(ich), (action, payload) => senden({ typ: "fremd", action, payload }), { isSpectator: zuschauer });
        new MutationObserver((m) => m.forEach((x) => x.addedNodes.forEach((k) => (k.nodeType === 1 ? uebersetzen(k) : k.nodeType === 3 && uebersetzen(k.parentNode))))).observe(el, { childList: true, subtree: true, characterData: false });
      } else platz.appendChild(b.el);
      try { b.r.update(ansicht); } catch (e) { console.error(e); }
      if (b.nr !== s.nr) { b.nr = s.nr; (s.ereignisse || []).filter((e) => e.nr === s.nr).forEach((e) => { try { b.r.onEvent(e, ansicht); } catch (x) {} }); }
      uebersetzen(b.el);
    },
  };
}
// Handy-tauglich: Schiffe zufaellig, aber regelgerecht ueber placeShip setzen (das Original kann nur Ziehen mit der Maus)
function zufallsFlotte(M, s, uid) {
  const cfg = s.st.config?.settings || s.st.config || {};
  const breite = cfg.gridWidth || 10, hoehe = cfg.gridHeight || 10;
  for (const schiff of cfg.ships || []) {
    for (let v = 0; v < 400; v++) {
      const payload = { shipId: schiff.id, orientation: Math.random() < 0.5 ? "horizontal" : "vertical", origin: { x: Math.floor(Math.random() * breite), y: Math.floor(Math.random() * hoehe) } };
      const r = M.LOGIK.applyAction(s.st, uid, "placeShip", payload);
      if (!r.error) { s.st = r.state; break; }
    }
  }
  s.nr++; s.ereignisse = []; s.fehler = null;
}
// ---------------------------------------------------------------- Computer-Mitspieler fuer die fertigen Spiele
// Sie probieren Zuege am Regelwerk selbst aus (ohne es zu veraendern) - so sind sie immer regelgerecht.
const mischen = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
function gewinntMit(r, uid) { const w = r && r.state && r.state.winner; return w === uid || (Array.isArray(w) && w.includes(uid)); }
function botReihe(action, schluessel, werte) {
  return (st, uid, probe) => {
    const zuege = mischen(werte(st)).map((p) => ({ action, payload: p }));
    // Mitte bevorzugen, sofort gewinnen, wenn moeglich
    const sieg = zuege.find((z) => gewinntMit(probe(z.action, z.payload), uid));
    if (sieg) return sieg;
    const sortiert = zuege.sort((a, b) => schluessel(a.payload) - schluessel(b.payload));
    return sortiert.find((z) => probe(z.action, z.payload)) || null;
  };
}
const BOT_VIER = botReihe("dropPiece", (p) => Math.abs(p.column - 3) + Math.random() * 2.5, () => [0, 1, 2, 3, 4, 5, 6].map((column) => ({ column })));
const BOT_TTT = botReihe("markCell", (p) => (p.row === 1 && p.col === 1 ? 0 : (p.row + p.col) % 2 === 0 ? 1 : 2) + Math.random() * 1.5,
  () => [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ row, col }))));
function BOT_DAME(st, uid, probe) {
  const n = st.config?.settings?.boardSize || 8, zuege = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [2, 2], [2, -2], [-2, 2], [-2, -2]]) {
    const z = { action: "move", payload: { from: { row: r, col: c }, to: { row: r + dr, col: c + dc } } };
    if (z.payload.to.row < 0 || z.payload.to.col < 0 || z.payload.to.row >= n || z.payload.to.col >= n) continue;
    if (probe(z.action, z.payload)) zuege.push({ ...z, schlag: Math.abs(dr) === 2 });
  }
  if (!zuege.length) return null;
  const schlaege = zuege.filter((z) => z.schlag);
  const auswahl = schlaege.length ? schlaege : zuege;
  return auswahl[Math.floor(Math.random() * auswahl.length)];
}
function BOT_WUERFEL(st, uid, probe, gueltig) {
  const ts = st.turnState || {}, wuerfel = ts.dice || [], benutzt = ts.rollsUsed || 0;
  const zaehl = {}; wuerfel.forEach((w) => (zaehl[w] = (zaehl[w] || 0) + 1));
  const haeufig = Number(Object.keys(zaehl).sort((a, b) => zaehl[b] - zaehl[a] || b - a)[0]);
  // bestes Feld bewerten
  const ich = (st.players || []).find((p) => p.userId === uid) || {};
  let bestes = null, bestPunkte = -1;
  if (benutzt > 0 && gueltig.includes("scoreCategory")) {
    for (const cat of Object.keys(ich.scoreSheet || {})) {
      if (ich.scoreSheet[cat] !== null) continue;
      const r = probe("scoreCategory", { category: cat });
      if (!r) continue;
      const nach = (r.state.players.find((p) => p.userId === uid) || {}).scoreSheet || {};
      const punkte = (nach[cat] || 0) + (["ones", "twos", "threes"].includes(cat) ? 0.5 : 0) - (cat === "chance" ? 6 : 0) - (cat === "yahtzee" && !nach[cat] ? 8 : 0);
      if (punkte > bestPunkte) { bestPunkte = punkte; bestes = cat; }
    }
  }
  const nochWuerfeln = gueltig.includes("rollDice") && (benutzt === 0 || (bestPunkte < 20 && benutzt < 3));
  if (nochWuerfeln) {
    const held = wuerfel.length ? wuerfel.map((w) => w === haeufig) : undefined;
    return { action: "rollDice", payload: held ? { held } : {} };
  }
  return bestes ? { action: "scoreCategory", payload: { category: bestes } } : null;
}
function BOT_SCHIFFE(st, uid, probe, gueltig) {
  if (st.turnState?.phase === "setup") {
    const ich = st.players.find((p) => p.userId === uid);
    if (ich && !ich.ready && (ich.ships || []).length < (st.config.settings.ships || []).length) return { typ: "zufall" };
    return gueltig.includes("commitPlacement") ? { action: "commitPlacement", payload: {} } : null;
  }
  if (!gueltig.includes("fireShot")) return null;
  const ich = st.players.find((p) => p.userId === uid);
  const geschossen = new Set((ich.shotsFired || []).map((x) => `${x.cell.x},${x.cell.y}`));
  const treffer = (ich.shotsFired || []).filter((x) => x.result === "hit").map((x) => x.cell);
  const ziele = [];
  treffer.forEach((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => ziele.push({ x: c.x + dx, y: c.y + dy })));
  for (const c of mischen(ziele)) if (!geschossen.has(`${c.x},${c.y}`) && probe("fireShot", { cell: c })) return { action: "fireShot", payload: { cell: c } };
  for (let v = 0; v < 200; v++) {
    const c = { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 10) };
    if ((c.x + c.y) % 2 === 0 && v < 150 || v >= 150) if (!geschossen.has(`${c.x},${c.y}`) && probe("fireShot", { cell: c })) return { action: "fireShot", payload: { cell: c } };
  }
  return null;
}

function uebersetzt(t) { let x = String(t); for (const [re, de] of DE) x = x.replace(re, de); return x; }

export const FREMDSPIELE = [
  fremdSpiel({ id: "f-vier", bot: BOT_VIER, name: "Vier in einer Reihe", emoji: "🔴", kurz: "Der Klassiker für zwei – Steine einwerfen, vier in einer Reihe gewinnt", farben: ["#e11d48", "#1e3a8a"], M: VIER,
    regeln: "<ul><li>Abwechselnd einen Stein in eine Spalte werfen (Pfeil antippen).</li><li>Wer zuerst vier in einer Reihe hat – waagerecht, senkrecht oder schräg – gewinnt.</li><li>Für 2 Spieler, die anderen schauen zu.</li></ul>" }),
  fremdSpiel({ id: "f-wuerfel", bot: BOT_WUERFEL, name: "Würfelpoker", emoji: "🎲", kurz: "Fünf Würfel, drei Würfe, 13 Felder – für 2 bis 6 Spieler", farben: ["#f59e0b", "#7c2d12"], M: WUERFEL,
    regeln: "<ul><li>Pro Zug bis zu dreimal würfeln. Würfel antippen = behalten.</li><li>Danach ein freies Feld auf dem Zettel wählen und eintragen.</li><li>Oben: Augen zählen (ab 63 gibt es Bonus). Unten: Pasch, Full House, Straßen, Fünferpasch, Chance.</li><li>Wer am Ende die meisten Punkte hat, gewinnt.</li></ul>" }),
  fremdSpiel({ id: "f-schiffe", bot: BOT_SCHIFFE, name: "Schiffe versenken", emoji: "🚢", kurz: "Flotte verstecken, dann abwechselnd schießen – für 2", farben: ["#0ea5e9", "#0c4a6e"], M: SCHIFFE,
    regeln: "<ul><li>Zuerst stellt jeder seine Schiffe auf (oder lässt sie zufällig verteilen) und tippt „Fertig“.</li><li>Dann abwechselnd auf das gegnerische Feld schießen.</li><li>Wer zuerst alle Schiffe des anderen versenkt, gewinnt.</li></ul>" }),
  fremdSpiel({ id: "f-dame", bot: BOT_DAME, name: "Dame", emoji: "⚫", kurz: "Das klassische Brettspiel für zwei", farben: ["#78350f", "#1c1917"], M: DAME,
    regeln: "<ul><li>Steine ziehen schräg nach vorn. Gegnerische Steine werden übersprungen und geschlagen – Schlagen ist Pflicht.</li><li>Wer die andere Seite erreicht, wird zur Dame und darf auch rückwärts.</li><li>Wer keine Steine oder Züge mehr hat, verliert.</li></ul>" }),
  fremdSpiel({ id: "f-ttt", bot: BOT_TTT, name: "Tic-Tac-Toe", emoji: "❌", kurz: "Drei in einer Reihe – schnell zwischendurch", farben: ["#8b5cf6", "#312e81"], M: TTT,
    regeln: "<ul><li>Abwechselnd ein Feld antippen. Drei in einer Reihe gewinnt.</li></ul>" }),
];
