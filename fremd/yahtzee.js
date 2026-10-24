// ERZEUGT von fremd_bauen.py - nicht von Hand aendern.
// Quelle: LAN Games von kbennett2000, MIT-Lizenz (siehe fremd/LICENSE-lan-games.txt), Spiel: yahtzee
const __configs = {"settings.json": {"diceCount": 5, "diceFaces": 6, "rollsPerTurn": 3, "upperBonusThreshold": 63, "upperBonus": 35, "fullHouseScore": 25, "smallStraightScore": 30, "largeStraightScore": 40, "yahtzeeScore": 50, "minPlayers": 1, "maxPlayers": 8, "playerColors": [{"id": "red", "hex": "#e63946"}, {"id": "blue", "hex": "#3a86ff"}, {"id": "green", "hex": "#2a9d8f"}, {"id": "yellow", "hex": "#e8c428"}, {"id": "purple", "hex": "#9d4edd"}, {"id": "orange", "hex": "#f4845f"}, {"id": "teal", "hex": "#43aa8b"}, {"id": "pink", "hex": "#ef476f"}], "playerTokens": ["🎲", "🎯", "🎪", "🎨", "🎭", "🎰", "🎳", "🎱"]}};
const __iface = { validateImplementation() {}, defaultGetStateForPlayer: (s) => s };
const __logik = (() => {
  const module = { exports: {} }; const exports = module.exports; const __dirname = "/";
  const require = (n) => {
    if (n === "fs") return { readFileSync: (p) => JSON.stringify(__configs[String(p).split("/").pop()]), existsSync: (p) => !!__configs[String(p).split("/").pop()] };
    if (n === "path") return { join: (...a) => a.join("/"), resolve: (...a) => a.join("/"), dirname: (p) => p, basename: (p) => String(p).split("/").pop() };
    if (n.includes("game-logic-interface")) return __iface;
    throw new Error("require nicht verfuegbar: " + n);
  };
'use strict';

/**
 * Yahtzee game-logic module.
 * Implements the GameLogic interface defined in server/src/game-logic-interface.js.
 *
 * Standard solo-rolls Yahtzee, multiplayer turn-based.  Each player plays 13
 * rounds; on a turn you get up to 3 rolls (holding any subset between rolls)
 * then must score into one unused category.  Game ends when every player has
 * filled all 13 categories.
 *
 * OUT OF SCOPE for v1: Yahtzee bonuses (rolling a second yahtzee for +100)
 * and joker rules.  Deliberate — keep it simple.  A second yahtzee, if the
 * category is already filled, scores 0 in any other category as normal.
 *
 * ─── State shape ─────────────────────────────────────────────────────────────
 *
 * GameState {
 *   id, name, gameType: 'yahtzee', stateVersion, status, config,
 *   createdBy, minPlayers, maxPlayers,
 *   players: Player[],
 *   turnState: TurnState,
 *   winner: string | string[] | null,  // userId, array of userIds for ties, null if unfinished
 *   log: LogEntry[]
 * }
 *
 * Player {
 *   userId, username, color, colorHex, token, active, connected,
 *   scoreSheet: {
 *     ones, twos, threes, fours, fives, sixes: number | null,
 *     threeOfAKind, fourOfAKind, fullHouse, smallStraight,
 *     largeStraight, yahtzee, chance: number | null
 *   }
 *   // null = category not yet scored; number = scored value
 *   // (a scored 0 is distinct from null — use `=== null`, not falsy checks)
 * }
 *
 * TurnState {
 *   currentPlayerIndex: number,
 *   dice:             number[]   // length = diceCount; values 1..diceFaces; empty before first roll
 *   held:             boolean[]  // length = diceCount; which dice carry over to next roll
 *   rollsUsed:        number     // 0, 1, 2, or 3
 *   roundsCompleted:  number     // full rounds where every player has taken a turn
 * }
 */

const fs = require('fs');
const path = require('path');
const {
  validateImplementation,
  defaultGetStateForPlayer,
} = require('../../src/game-logic-interface');

const STATE_VERSION = 1;
const CONFIG_DIR = path.join(__dirname, 'config');
let _config = null;

// All 13 categories, ordered upper-then-lower for display.
const CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'threeOfAKind',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yahtzee',
  'chance',
];
const UPPER_CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];

// ── config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  const settings = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'settings.json'), 'utf8'));
  _config = { settings };
  return _config;
}

function getConfigCopy() {
  if (!_config) loadConfig();
  return structuredClone(_config);
}

// ── metadata ──────────────────────────────────────────────────────────────────

function getGameMetadata() {
  return {
    name: 'Yahtzee',
    description: 'Roll five dice up to three times per turn, then score into one of 13 categories.',
    minPlayers: 1,
    maxPlayers: 8,
    icon: '🎲',
    estimatedDurationMinutes: 20,
    complexity: 'light',
    tags: ['dice', 'classic', 'family', 'no-spatial', 'solo-friendly'],
  };
}

// ── player creation ───────────────────────────────────────────────────────────

function emptyScoreSheet() {
  const sheet = {};
  for (const c of CATEGORIES) sheet[c] = null;
  return sheet;
}

function createInitialPlayer(user, existingPlayers = [], config = null) {
  if (!config?.settings?.playerColors || !config?.settings?.playerTokens) {
    throw new Error(
      'createInitialPlayer requires a config with settings.playerColors and settings.playerTokens',
    );
  }
  const idx = existingPlayers.length;
  const colorObj = config.settings.playerColors[idx] || config.settings.playerColors[0];
  const token = config.settings.playerTokens[idx] || config.settings.playerTokens[0];
  return {
    userId: user.id,
    username: user.username,
    color: colorObj.id,
    colorHex: colorObj.hex,
    token,
    active: true,
    connected: true,
    scoreSheet: emptyScoreSheet(),
  };
}

// ── game initialisation ───────────────────────────────────────────────────────

function initGame(gameId, name, players, config) {
  const cfg = config || getConfigCopy();
  const diceCount = cfg.settings.diceCount;
  return {
    id: gameId,
    name,
    gameType: 'yahtzee',
    stateVersion: STATE_VERSION,
    status: 'playing',
    config: cfg,
    players: players.map((p) => ({ ...p, scoreSheet: p.scoreSheet || emptyScoreSheet() })),
    turnState: {
      currentPlayerIndex: 0,
      dice: [],
      held: Array(diceCount).fill(false),
      rollsUsed: 0,
      roundsCompleted: 0,
    },
    winner: null,
    log: [],
  };
}

// ── turn helpers ──────────────────────────────────────────────────────────────

function getCurrentPlayer(state) {
  if (!state?.turnState) return null;
  const p = state.players[state.turnState.currentPlayerIndex];
  if (!p) return null;
  return { userId: p.userId, username: p.username };
}

function isTurnTimerBlocked(_state) {
  return false;
}

function getValidActions(state, userId) {
  if (state.status !== 'playing') return [];
  const cur = state.players[state.turnState?.currentPlayerIndex];
  if (!cur || cur.userId !== userId) return [];
  const ts = state.turnState;
  const actions = [];
  if (ts.rollsUsed < state.config.settings.rollsPerTurn) actions.push('rollDice');
  if (ts.rollsUsed >= 1) actions.push('scoreCategory');
  return actions;
}

// ── action descriptors ───────────────────────────────────────────────────────

/**
 * Human-readable display names for each scoring category. Used by
 * getActionDescriptors to build descriptor labels like "Score Three of a
 * Kind for 18". Separate from the renderer's own CATEGORY_META labels
 * (which are for table-row headers, static and rendering-specific).
 */
const CATEGORY_DISPLAY_NAMES = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeOfAKind: 'Three of a Kind',
  fourOfAKind: 'Four of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yahtzee: 'Yahtzee',
  chance: 'Chance',
};

/**
 * Rich action descriptors for the Yahtzee renderer. See
 * docs/action-descriptors.md for the contract.
 *
 * Shape:
 *   • Exactly one `rollDice` descriptor when it's the player's turn, with
 *     enabled flipping based on rolls remaining.
 *   • One `scoreCategory` descriptor per unscored category, ONLY after
 *     the player's first roll of the turn. Each descriptor's data carries
 *     { category, previewScore } — the renderer reads previewScore for
 *     the in-table preview cell; the descriptor's label includes it too
 *     so hover tooltips and other surfacings work without reformatting.
 *
 * Decision (option (a) from the migration spec): pre-roll
 * (rollsUsed === 0) emits ONLY the rollDice descriptor. No
 * scoreCategory descriptors before any roll — dice are empty, there's
 * nothing to preview, and the renderer's score-sheet table renders all
 * 13 rows from CATEGORIES regardless of descriptor presence. Matches
 * Battleship/Risk precedent: descriptors describe what's currently
 * actionable, not "all actions, gated by enabled."
 *
 * Returns [] on non-current-player calls, finished games, and pre-
 * initGame waiting-room states (per the waiting-room-safety convention).
 */
function getActionDescriptors(state, userId) {
  if (!state || state.status !== 'playing') return [];
  if (!state.turnState || !Array.isArray(state.players)) return [];
  const idx = state.players.findIndex((p) => p.userId === userId);
  if (idx < 0) return [];
  const ts = state.turnState;
  if (ts.currentPlayerIndex !== idx) return [];

  const me = state.players[idx];
  const { rollsPerTurn } = state.config.settings;
  const dice = ts.dice;
  const out = [];

  // ── rollDice ─────────────────────────────────────────────────────────
  const next = ts.rollsUsed + 1;
  const rollsRemaining = rollsPerTurn - ts.rollsUsed;
  if (rollsRemaining > 0) {
    out.push({
      action: 'rollDice',
      label: next === 1 ? 'Roll dice' : `Roll ${next} of ${rollsPerTurn}`,
      enabled: true,
      hint:
        next === 1
          ? `You have ${rollsPerTurn} rolls this turn.`
          : `Re-roll unheld dice — ${rollsRemaining} ${rollsRemaining === 1 ? 'roll' : 'rolls'} remaining.`,
    });
  } else {
    out.push({
      action: 'rollDice',
      label: 'Rolls exhausted',
      enabled: false,
      hint: 'All rolls used — choose a category to score.',
    });
  }

  // ── scoreCategory (one per unscored category, after first roll) ──────
  if (ts.rollsUsed >= 1 && Array.isArray(dice) && dice.length > 0) {
    for (const cat of CATEGORIES) {
      if (me.scoreSheet[cat] !== null) continue; // already scored
      const previewScore = scoreFor(cat, dice, state.config);
      out.push({
        action: 'scoreCategory',
        label: `Score ${CATEGORY_DISPLAY_NAMES[cat]} for ${previewScore}`,
        enabled: true,
        data: { category: cat, previewScore },
      });
    }
  }

  return out;
}

// ── scoring ──────────────────────────────────────────────────────────────────

/**
 * Pure scoring function: given a category, a 5-die roll, and the config
 * (for category-specific point values), return the points scored.
 *
 * No state dependency.  Validates only the category name; assumes dice are
 * a non-empty array of integers in [1..diceFaces].
 */
function scoreFor(category, dice, config) {
  const sum = dice.reduce((a, b) => a + b, 0);
  const counts = countByFace(dice, config.settings.diceFaces);
  const cfg = config.settings;

  switch (category) {
    case 'ones':
      return sumOfFace(dice, 1);
    case 'twos':
      return sumOfFace(dice, 2);
    case 'threes':
      return sumOfFace(dice, 3);
    case 'fours':
      return sumOfFace(dice, 4);
    case 'fives':
      return sumOfFace(dice, 5);
    case 'sixes':
      return sumOfFace(dice, 6);

    case 'threeOfAKind':
      return counts.some((c) => c >= 3) ? sum : 0;

    case 'fourOfAKind':
      return counts.some((c) => c >= 4) ? sum : 0;

    case 'fullHouse':
      // 3 of one value AND 2 of another.  Standard rule: five of a kind
      // does NOT count as a full house.
      return counts.includes(3) && counts.includes(2) ? cfg.fullHouseScore : 0;

    case 'smallStraight':
      // 4 consecutive faces present
      return hasConsecutiveRun(counts, 4) ? cfg.smallStraightScore : 0;

    case 'largeStraight':
      // 5 consecutive faces present
      return hasConsecutiveRun(counts, 5) ? cfg.largeStraightScore : 0;

    case 'yahtzee':
      return counts.some((c) => c >= 5) ? cfg.yahtzeeScore : 0;

    case 'chance':
      return sum;

    default:
      throw new Error(`Unknown scoring category: ${category}`);
  }
}

function sumOfFace(dice, face) {
  let total = 0;
  for (const d of dice) if (d === face) total += d;
  return total;
}

/** counts[i] = how many dice show face (i+1); length = diceFaces. */
function countByFace(dice, diceFaces) {
  const counts = Array(diceFaces).fill(0);
  for (const d of dice) counts[d - 1]++;
  return counts;
}

/** True if `counts` contains `n` consecutive non-zero entries. */
function hasConsecutiveRun(counts, n) {
  let run = 0;
  for (const c of counts) {
    if (c > 0) {
      run++;
      if (run >= n) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

// ── derived score-sheet totals ────────────────────────────────────────────────

/**
 * Compute upper-section subtotal, upper bonus, lower-section total, and grand
 * total for a player.  Treats unscored categories (null) as zero so this is
 * safe to call mid-game for display.
 */
function computeTotals(scoreSheet, config) {
  let upperSubtotal = 0;
  for (const c of UPPER_CATEGORIES) {
    if (typeof scoreSheet[c] === 'number') upperSubtotal += scoreSheet[c];
  }
  const upperBonus =
    upperSubtotal >= config.settings.upperBonusThreshold ? config.settings.upperBonus : 0;
  let lowerTotal = 0;
  for (const c of CATEGORIES) {
    if (!UPPER_CATEGORIES.includes(c) && typeof scoreSheet[c] === 'number') {
      lowerTotal += scoreSheet[c];
    }
  }
  return {
    upperSubtotal,
    upperBonus,
    lowerTotal,
    grandTotal: upperSubtotal + upperBonus + lowerTotal,
  };
}

function allCategoriesFilled(scoreSheet) {
  for (const c of CATEGORIES) if (scoreSheet[c] === null) return false;
  return true;
}

/**
 * Finalize a game whose every player has filled every category.  Pure:
 * returns the post-game state (status='finished', winner set) and the
 * caller's event/log arrays appended with GAME_OVER and a winner message.
 *
 * Exported for unit testing — extracted from scoreCategory so edge cases
 * like three-way ties and upper-bonus thresholds can be exercised without
 * driving through dozens of scripted dice rolls.
 *
 * @param {Object} state       Pre-finalization state (config/log carry over).
 * @param {Array}  players     Player array with all 13 categories filled.
 * @param {Array}  baseEvents  Events accumulated before the game-over check.
 * @param {Array}  baseLog     Log entries accumulated before the game-over check.
 * @returns {{ state, events }}
 */
function finalizeGame(state, players, baseEvents, baseLog) {
  const finalScores = players.map((p) => ({
    userId: p.userId,
    username: p.username,
    ...computeTotals(p.scoreSheet, state.config),
  }));
  const top = Math.max(...finalScores.map((s) => s.grandTotal));
  const winnerScores = finalScores.filter((s) => s.grandTotal === top);
  const winnerIds = winnerScores.map((s) => s.userId);
  const winnerNames = winnerScores.map((s) => s.username);
  // winner: userId for a single winner, array of userIds for ties — matches
  // the framework convention used by every other game (socket-client.js
  // reads state.winner as a userId).
  const winner = winnerIds.length === 1 ? winnerIds[0] : winnerIds;

  const events = [
    ...baseEvents,
    { type: 'GAME_OVER', data: { winner, finalScores }, timestamp: Date.now() },
  ];
  const log = [
    ...baseLog,
    {
      message:
        winnerNames.length > 1
          ? `Tie! ${winnerNames.join(' & ')} all finished with ${top}.`
          : `${winnerNames[0]} wins with ${top}!`,
      type: 'game',
      timestamp: Date.now(),
    },
  ];

  return {
    state: { ...state, players, status: 'finished', winner, log },
    events,
  };
}

// ── actions ───────────────────────────────────────────────────────────────────

function rollDie(faces) {
  return 1 + Math.floor(Math.random() * faces);
}

function rollDice(state, userId, payload) {
  const cur = state.players[state.turnState.currentPlayerIndex];
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: 'Not your turn' };
  }
  if (state.status !== 'playing') {
    return { state, events: [], error: 'Game is not in playing state' };
  }
  const ts = state.turnState;
  if (ts.rollsUsed >= state.config.settings.rollsPerTurn) {
    return { state, events: [], error: 'No rolls remaining this turn' };
  }

  const { diceCount, diceFaces } = state.config.settings;
  let held = payload?.held;
  if (held === undefined) {
    held = Array(diceCount).fill(false);
  } else if (
    !Array.isArray(held) ||
    held.length !== diceCount ||
    !held.every((v) => typeof v === 'boolean')
  ) {
    return { state, events: [], error: `held must be an array of ${diceCount} booleans` };
  }
  // First roll of the turn: ignore any holds (nothing to hold yet).
  if (ts.rollsUsed === 0 && held.some(Boolean)) {
    return { state, events: [], error: 'Cannot hold dice on the first roll' };
  }

  const newDice = [];
  for (let i = 0; i < diceCount; i++) {
    if (ts.rollsUsed > 0 && held[i]) {
      newDice.push(ts.dice[i]);
    } else {
      newDice.push(rollDie(diceFaces));
    }
  }

  const player = state.players.find((p) => p.userId === userId);
  const newState = {
    ...state,
    turnState: {
      ...ts,
      dice: newDice,
      held: held.slice(),
      rollsUsed: ts.rollsUsed + 1,
    },
    log: [
      ...(state.log || []),
      {
        message: `${player.username} rolled [${newDice.join(',')}] (roll ${ts.rollsUsed + 1}/${state.config.settings.rollsPerTurn})`,
        type: 'dice',
        timestamp: Date.now(),
      },
    ],
  };

  return {
    state: newState,
    events: [
      {
        type: 'DICE_ROLLED',
        data: {
          username: player.username,
          dice: newDice,
          held: held.slice(),
          rollsUsed: ts.rollsUsed + 1,
        },
        timestamp: Date.now(),
      },
    ],
  };
}

function scoreCategory(state, userId, payload) {
  const curIndex = state.turnState.currentPlayerIndex;
  const cur = state.players[curIndex];
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: 'Not your turn' };
  }
  if (state.status !== 'playing') {
    return { state, events: [], error: 'Game is not in playing state' };
  }
  if (state.turnState.rollsUsed < 1) {
    return { state, events: [], error: 'You must roll at least once before scoring' };
  }
  const category = payload?.category;
  if (!CATEGORIES.includes(category)) {
    return { state, events: [], error: `Unknown category: ${category}` };
  }
  if (cur.scoreSheet[category] !== null) {
    return { state, events: [], error: `Category "${category}" is already used` };
  }

  const dice = state.turnState.dice;
  const points = scoreFor(category, dice, state.config);

  const events = [];
  // Update score sheet for the current player (immutable copy).
  const newPlayers = state.players.map((p, idx) => {
    if (idx !== curIndex) return p;
    return { ...p, scoreSheet: { ...p.scoreSheet, [category]: points } };
  });

  events.push({
    type: 'CATEGORY_SCORED',
    data: { username: cur.username, category, dice: dice.slice(), points },
    timestamp: Date.now(),
  });
  const logs = [
    ...(state.log || []),
    {
      message: `${cur.username} scored ${points} in ${category} with [${dice.join(',')}]`,
      type: 'score',
      timestamp: Date.now(),
    },
  ];

  // Check for game over: every player has every category filled.
  if (newPlayers.every((p) => allCategoriesFilled(p.scoreSheet))) {
    return finalizeGame(state, newPlayers, events, logs);
  }

  // Otherwise advance the turn.
  const { nextIdx, roundsCompleted } = nextPlayerIndex(state, curIndex);
  const nextPlayer = newPlayers[nextIdx];
  events.push({
    type: 'TURN_ENDED',
    data: { username: cur.username },
    timestamp: Date.now(),
  });
  events.push({
    type: 'TURN_STARTED',
    data: { username: nextPlayer.username },
    timestamp: Date.now(),
  });
  logs.push({
    message: `${nextPlayer.username}'s turn.`,
    type: 'turn',
    timestamp: Date.now(),
  });

  return {
    state: {
      ...state,
      players: newPlayers,
      turnState: freshTurnState(state.config, nextIdx, roundsCompleted),
      log: logs,
    },
    events,
  };
}

/**
 * Advance to the next non-disconnected, non-inactive player.  If the loop
 * wraps past the highest-indexed player, increment `roundsCompleted`.
 * Returns `{ nextIdx, roundsCompleted }`.
 */
function nextPlayerIndex(state, fromIdx) {
  const n = state.players.length;
  let roundsCompleted = state.turnState.roundsCompleted;
  for (let step = 1; step <= n; step++) {
    const idx = (fromIdx + step) % n;
    if (idx <= fromIdx) roundsCompleted++; // wrapped past end of player list
    const p = state.players[idx];
    if (p.active !== false) return { nextIdx: idx, roundsCompleted };
  }
  // All other players are inactive — stay on the current player.
  return { nextIdx: fromIdx, roundsCompleted };
}

function freshTurnState(config, currentPlayerIndex, roundsCompleted) {
  return {
    currentPlayerIndex,
    dice: [],
    held: Array(config.settings.diceCount).fill(false),
    rollsUsed: 0,
    roundsCompleted,
  };
}

function skipTurn(state, userId) {
  const curIndex = state.turnState.currentPlayerIndex;
  const cur = state.players[curIndex];
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: "Not this player's turn" };
  }
  const { nextIdx, roundsCompleted } = nextPlayerIndex(state, curIndex);
  const nextPlayer = state.players[nextIdx];
  return {
    state: {
      ...state,
      turnState: freshTurnState(state.config, nextIdx, roundsCompleted),
      log: [
        ...(state.log || []),
        { message: `${cur.username}'s turn was skipped`, type: 'info', timestamp: Date.now() },
      ],
    },
    events: [
      { type: 'TURN_SKIPPED', data: { username: cur.username }, timestamp: Date.now() },
      { type: 'TURN_STARTED', data: { username: nextPlayer.username }, timestamp: Date.now() },
    ],
  };
}

// ── applyAction dispatcher ────────────────────────────────────────────────────

function applyAction(state, userId, action, payload = {}) {
  switch (action) {
    case 'rollDice':
      return rollDice(state, userId, payload);
    case 'scoreCategory':
      return scoreCategory(state, userId, payload);
    case 'skipTurn':
      return skipTurn(state, userId);
    default:
      return { state, events: [], error: `Unknown action: ${action}` };
  }
}

// ── migration ─────────────────────────────────────────────────────────────────

// STATE_VERSION 1 is the initial release — nothing to migrate yet.  The stub
// satisfies the optional interface method; future versions add `if` branches.
function migrate(state) {
  if (state.stateVersion === STATE_VERSION) return state;
  throw new Error(
    `[yahtzee] No migration path from stateVersion ${state.stateVersion} to ${STATE_VERSION}`,
  );
}

// ── exports ───────────────────────────────────────────────────────────────────

module.exports = {
  STATE_VERSION,
  initGame,
  createInitialPlayer,
  applyAction,
  skipTurn,
  getCurrentPlayer,
  isTurnTimerBlocked,
  getValidActions,
  getActionDescriptors,
  getGameMetadata,
  loadConfig,
  getConfigCopy,
  // See note in game-logic-interface.js about waiting-room safety.
  // Yahtzee is perfect-information (everyone sees everyone's score sheet),
  // so the default identity filter is safe.
  getStateForPlayer: defaultGetStateForPlayer,
  migrate,

  // Internal helpers exported for unit tests.
  scoreFor,
  computeTotals,
  finalizeGame,
  CATEGORIES,
  UPPER_CATEGORIES,
  CATEGORY_DISPLAY_NAMES,
};

validateImplementation(module.exports, {
  internalExports: [
    'scoreFor',
    'computeTotals',
    'finalizeGame',
    'CATEGORIES',
    'UPPER_CATEGORIES',
    'CATEGORY_DISPLAY_NAMES',
  ],
});

  return module.exports;
})();
const __anzeige = (UIManager, SoundManager, GameRendererRegistry, GameState) => {
/**
 * Yahtzee score sheet — DOM table builder + painter.
 *
 * Owned by the Yahtzee renderer. Split out from renderer.js because the
 * combined file exceeded the ~500 line guideline in the session-2 spec.
 *
 * Responsibilities
 * ────────────────
 *   • Build the score-sheet <table> structure (rebuild on player roster change).
 *   • Paint per-cell values, previews, selection highlights, summary rows.
 *   • Flash a cell when CATEGORY_SCORED fires.
 *
 * NOT responsibilities (renderer.js owns these)
 * ─────────────────────────────────────────────
 *   • Selection state (_selectedCategory) — renderer holds it and passes
 *     it into paint() each call.
 *   • Click handlers — renderer wires onCellClick in rebuild()'s options.
 *   • Dice and roll button — separate concerns.
 *
 * Preview values for unscored categories come from the server-side
 * getActionDescriptors output (state.actionDescriptors) — one
 * scoreCategory descriptor per unscored category, carrying
 * data.previewScore. The renderer's old scoreFor mirror was deleted
 * when this contract landed; see docs/action-descriptors.md.
 *
 * computeTotals stays renderer-side: upper subtotal, lower total, and
 * grand total are display arithmetic over already-visible scoreSheet
 * values, not rule logic. See the resolved decision in
 * docs/renderer-contract.md ("derived view fields stay client-side").
 */

const YahtzeeScoreSheet = (() => {
  // ─── shape constants ─────────────────────────────────────────────────────

  const CATEGORIES = [
    'ones',
    'twos',
    'threes',
    'fours',
    'fives',
    'sixes',
    'threeOfAKind',
    'fourOfAKind',
    'fullHouse',
    'smallStraight',
    'largeStraight',
    'yahtzee',
    'chance',
  ];
  const UPPER = new Set(['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']);

  const CATEGORY_META = {
    ones: { label: 'Ones', hint: 'Sum of 1s' },
    twos: { label: 'Twos', hint: 'Sum of 2s' },
    threes: { label: 'Threes', hint: 'Sum of 3s' },
    fours: { label: 'Fours', hint: 'Sum of 4s' },
    fives: { label: 'Fives', hint: 'Sum of 5s' },
    sixes: { label: 'Sixes', hint: 'Sum of 6s' },
    threeOfAKind: { label: '3 of a Kind', hint: 'Sum of all dice (need ≥3 same)' },
    fourOfAKind: { label: '4 of a Kind', hint: 'Sum of all dice (need ≥4 same)' },
    fullHouse: { label: 'Full House', hint: '3 + 2 of two values' },
    smallStraight: { label: 'Small Straight', hint: '4 consecutive faces' },
    largeStraight: { label: 'Large Straight', hint: '5 consecutive faces' },
    yahtzee: { label: 'Yahtzee', hint: '5 of a kind' },
    chance: { label: 'Chance', hint: 'Sum of all dice' },
  };

  // ─── rebuild ─────────────────────────────────────────────────────────────

  /**
   * Build (or rebuild) the table structure. Cheap to call; the renderer only
   * invokes it on first paint and on roster-shape change.
   *
   * @param {HTMLTableElement} table
   * @param {Object[]} players       state.players
   * @param {Object}   options
   * @param {Function} options.onCellClick(category, userId)
   */
  function rebuild(table, players, options) {
    table.innerHTML = '';
    const onCellClick = options?.onCellClick || (() => {});

    const thead = document.createElement('thead');
    const headTr = document.createElement('tr');
    headTr.appendChild(thEl('Category', 'yz-cat-col'));
    players.forEach((p) => {
      const th = thEl(`${p.token || ''} ${p.username}`.trim(), 'yz-player-col');
      th.dataset.userId = p.userId;
      th.style.color = p.colorHex || '';
      headTr.appendChild(th);
    });
    headTr.appendChild(thEl('Hint', 'yz-hint-col'));
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const cat of CATEGORIES.filter((c) => UPPER.has(c))) {
      tbody.appendChild(buildCategoryRow(cat, players, onCellClick));
    }
    tbody.appendChild(buildSummaryRow('upperSubtotal', 'Upper Subtotal', players));
    tbody.appendChild(buildSummaryRow('upperBonus', 'Upper Bonus (+35 if ≥63)', players));

    // Visual separator between upper and lower sections.
    const sep = document.createElement('tr');
    sep.className = 'yz-row-sep';
    const sepTd = document.createElement('td');
    sepTd.colSpan = players.length + 2;
    sep.appendChild(sepTd);
    tbody.appendChild(sep);

    for (const cat of CATEGORIES.filter((c) => !UPPER.has(c))) {
      tbody.appendChild(buildCategoryRow(cat, players, onCellClick));
    }
    tbody.appendChild(buildSummaryRow('lowerTotal', 'Lower Total', players));
    tbody.appendChild(buildSummaryRow('grandTotal', 'Grand Total', players, true));
    table.appendChild(tbody);
  }

  function thEl(text, cls) {
    const th = document.createElement('th');
    th.className = cls;
    th.textContent = text;
    return th;
  }

  function buildCategoryRow(cat, players, onCellClick) {
    const meta = CATEGORY_META[cat];
    const tr = document.createElement('tr');
    tr.dataset.category = cat;
    tr.className = 'yz-cat-row';

    const labelTd = document.createElement('td');
    labelTd.className = 'yz-cat-label';
    labelTd.textContent = meta.label;
    tr.appendChild(labelTd);

    for (const p of players) {
      const td = document.createElement('td');
      td.className = 'yz-score-cell';
      td.dataset.userId = p.userId;
      td.dataset.category = cat;
      td.textContent = '—';
      td.addEventListener('click', () => onCellClick(cat, p.userId));
      tr.appendChild(td);
    }

    const hintTd = document.createElement('td');
    hintTd.className = 'yz-hint';
    hintTd.textContent = meta.hint;
    tr.appendChild(hintTd);
    return tr;
  }

  function buildSummaryRow(kind, label, players, grand = false) {
    const tr = document.createElement('tr');
    tr.className = grand ? 'yz-summary-row yz-grand-row' : 'yz-summary-row';
    tr.dataset.summary = kind;

    const labelTd = document.createElement('td');
    labelTd.className = 'yz-cat-label';
    labelTd.textContent = label;
    tr.appendChild(labelTd);

    for (const p of players) {
      const td = document.createElement('td');
      td.className = 'yz-summary-cell';
      td.dataset.userId = p.userId;
      td.dataset.summary = kind;
      td.textContent = '0';
      tr.appendChild(td);
    }
    const hintTd = document.createElement('td');
    hintTd.className = 'yz-hint';
    tr.appendChild(hintTd);
    return tr;
  }

  // ─── paint ───────────────────────────────────────────────────────────────

  /**
   * Repaint every cell from current state.
   *
   * @param {Object} state
   * @param {Object} ctx
   * @param {string} ctx.myUserId
   * @param {string|null} ctx.selectedCategory  Category awaiting commit-click.
   */
  function paint(state, ctx) {
    const { myUserId, selectedCategory } = ctx;
    const curIdx = state.turnState.currentPlayerIndex;
    const cur = state.players[curIdx];
    const isMyTurn = cur?.userId === myUserId;
    const playing = state.status === 'playing';
    const finished = state.status === 'finished';
    const rollsUsed = state.turnState.rollsUsed;
    const dice = state.turnState.dice;

    const totals = state.players.map((p) => computeTotals(p.scoreSheet, state.config));
    const topGrand = Math.max(...totals.map((t) => t.grandTotal));

    // Column header highlights
    document.querySelectorAll('#yz-sheet thead th[data-user-id]').forEach((th) => {
      const isCur = playing && th.dataset.userId === cur?.userId;
      th.classList.toggle('yz-col-current', isCur);
      th.classList.toggle('yz-col-me', th.dataset.userId === myUserId);
      const idx = state.players.findIndex((p) => p.userId === th.dataset.userId);
      const isWinner = finished && totals[idx]?.grandTotal === topGrand;
      th.classList.toggle('yz-col-winner', isWinner);
    });

    // Category cells
    for (const cat of CATEGORIES) {
      for (const p of state.players) {
        const td = document.querySelector(
          `#yz-sheet td.yz-score-cell[data-user-id="${p.userId}"][data-category="${cat}"]`,
        );
        if (!td) continue;
        const v = p.scoreSheet[cat];

        td.classList.remove(
          'yz-cell-scored',
          'yz-cell-preview',
          'yz-cell-selected',
          'yz-cell-empty',
          'yz-cell-locked',
          'yz-col-current',
          'yz-col-me',
        );
        td.classList.toggle('yz-col-current', playing && p.userId === cur?.userId);
        td.classList.toggle('yz-col-me', p.userId === myUserId);
        td.style.removeProperty('color');

        if (v !== null) {
          td.textContent = String(v);
          td.classList.add('yz-cell-scored', 'yz-cell-locked');
          if (v === 0) td.style.color = 'var(--text-muted, #9aa0a6)';
        } else if (
          isMyTurn &&
          playing &&
          rollsUsed >= 1 &&
          dice.length > 0 &&
          p.userId === myUserId
        ) {
          // Preview score comes from the server-supplied descriptor.
          // No fallback: if descriptors are absent, the cell renders
          // blank rather than re-deriving from rule logic.
          const desc = findScoreDescriptor(state, cat);
          if (desc) {
            td.textContent = String(desc.data.previewScore);
            td.classList.add('yz-cell-preview');
            if (selectedCategory === cat) td.classList.add('yz-cell-selected');
          } else {
            td.textContent = '—';
            td.classList.add('yz-cell-empty');
          }
        } else {
          td.textContent = '—';
          td.classList.add('yz-cell-empty');
        }
      }
    }

    // Summary cells
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const t = totals[i];
      setSummary(p.userId, 'upperSubtotal', t.upperSubtotal);
      setSummary(p.userId, 'upperBonus', t.upperBonus);
      setSummary(p.userId, 'lowerTotal', t.lowerTotal);
      setSummary(p.userId, 'grandTotal', t.grandTotal);
      document
        .querySelectorAll(`#yz-sheet td.yz-summary-cell[data-user-id="${p.userId}"]`)
        .forEach((td) => {
          td.classList.toggle('yz-col-current', playing && p.userId === cur?.userId);
          td.classList.toggle('yz-col-me', p.userId === myUserId);
          td.classList.toggle('yz-col-winner', finished && t.grandTotal === topGrand);
        });
    }
  }

  function setSummary(userId, kind, value) {
    const td = document.querySelector(
      `#yz-sheet td.yz-summary-cell[data-user-id="${userId}"][data-summary="${kind}"]`,
    );
    if (td) td.textContent = String(value);
  }

  function flashCell(state, username, category) {
    const p = state.players.find((pp) => pp.username === username);
    if (!p) return;
    const td = document.querySelector(
      `#yz-sheet td.yz-score-cell[data-user-id="${p.userId}"][data-category="${category}"]`,
    );
    if (!td) return;
    td.classList.add('yz-cell-flash');
    setTimeout(() => td.classList.remove('yz-cell-flash'), 800);
  }

  // ─── descriptor lookup ───────────────────────────────────────────────────

  /**
   * Find the scoreCategory descriptor for a given category from the
   * server-supplied state.actionDescriptors list. Returns undefined when
   * no descriptor exists for that category (already scored, pre-roll, or
   * not the player's turn). The renderer uses this for both the preview
   * value (data.previewScore) and the per-category enabled gate.
   */
  function findScoreDescriptor(state, category) {
    return state.actionDescriptors?.find(
      (d) => d.action === 'scoreCategory' && d.data?.category === category,
    );
  }

  function computeTotals(scoreSheet, config) {
    let upperSubtotal = 0;
    for (const c of CATEGORIES) {
      if (UPPER.has(c) && typeof scoreSheet[c] === 'number') upperSubtotal += scoreSheet[c];
    }
    const upperBonus =
      upperSubtotal >= config.settings.upperBonusThreshold ? config.settings.upperBonus : 0;
    let lowerTotal = 0;
    for (const c of CATEGORIES) {
      if (!UPPER.has(c) && typeof scoreSheet[c] === 'number') lowerTotal += scoreSheet[c];
    }
    return {
      upperSubtotal,
      upperBonus,
      lowerTotal,
      grandTotal: upperSubtotal + upperBonus + lowerTotal,
    };
  }

  return { rebuild, paint, flashCell, CATEGORIES };
})();

/**
 * Yahtzee renderer — GameRenderer interface implementation.
 *
 * Self-registers with GameRendererRegistry at module load time.
 * The framework (app.js, socket-client.js) interacts with this module
 * exclusively through the registry; no direct references to this global.
 *
 * Implements: init / update / onEvent / destroy
 *
 * ─── Layout decision ────────────────────────────────────────────────────────
 * Chose layout (a) from docs/renderer-contract.md "score-sheet question":
 * a single shared table with players as columns and categories as rows. The
 * current player's column lights up with score previews on unscored
 * categories; opponents' unscored cells stay blank ("—").
 *
 * Why (a) over (b) and (c):
 *   • Canonical paper-Yahtzee layout — recognised instantly.
 *   • Side-by-side player columns put comparison data exactly where Yahtzee
 *     players want it (you finish scoring Threes; you immediately see what
 *     everyone else got in Threes — that informs your next category pick).
 *   • At expected 2-4 players the table is comfortably wide; at 5-8 it stays
 *     legible on a 1366×768 viewport (~100px per column). Worst case is a
 *     horizontal scroll bar, not a structural failure.
 *   • (c) sounds clean in the abstract but duplicates the current player's
 *     column into a separate "your options" panel — that forces the eye
 *     between two regions for one decision. Cost > benefit.
 *
 * ─── Layout inside .board-wrapper ──────────────────────────────────────────
 *
 *   ┌─ .board-wrapper ─────────────────────────────────────────────────┐
 *   │  ┌─ score-sheet table (current player col highlighted) ───────┐  │
 *   │  │  Category    │ You │ Bob │ Carol │ ...                     │  │
 *   │  │  Ones        │  3  │  5  │  —    │                         │  │
 *   │  │  ...                                                       │  │
 *   │  │  Upper sub, bonus, grand total                             │  │
 *   │  └────────────────────────────────────────────────────────────┘  │
 *   │  ┌─ dice tray (5 large clickable dice) ───────────────────────┐  │
 *   │  │   [d1]  [d2]  [d3]  [d4]  [d5]                             │  │
 *   │  └────────────────────────────────────────────────────────────┘  │
 *   │  ┌─ roll button ──────────────────────────────────────────────┐  │
 *   │  │     [ Roll 2 of 3 — 3 held ]                               │  │
 *   │  └────────────────────────────────────────────────────────────┘  │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * ─── Two-click commit ──────────────────────────────────────────────────────
 * Clicking a preview cell selects it (visual outline). Clicking the SAME cell
 * again commits the score. Clicking a different preview moves the selection.
 * Clicking Roll cancels. Selection auto-clears on turn change.
 *
 * ─── Action labels ─────────────────────────────────────────────────────────
 * Per docs/renderer-contract.md the action-label contract is deliberately
 * unresolved until more dice/card games land. Yahtzee handles its own
 * labels locally; the score sheet module owns the score-preview math.
 *
 * ─── Pre-game ──────────────────────────────────────────────────────────────
 * The Yahtzee renderer is only init'd when state.status === 'playing' (or
 * 'paused' on rejoin) — see client/js/app.js enterGameScreen. So there is
 * no "waiting-room" view to handle here; the framework's #waiting-screen
 * shows the player list before initGame runs.
 */

const YahtzeeRenderer = (() => {
  // ─── module-private state ─────────────────────────────────────────────────

  let _myUserId = null;
  let _emit = null;
  let _isSpectator = false;
  let _selectedCategory = null; // category awaiting second-click commit
  let _lastTurnKey = null; // for detecting turn change → clear selection
  let _animationToken = 0; // bumped on each roll to abort stale animations

  // Pip layout per face value (1-indexed slot positions in a 3×3 grid).
  // Slots: 1 2 3 / 4 5 6 / 7 8 9
  const PIPS = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  // ─── init ────────────────────────────────────────────────────────────────

  function init(container, state, myUserId, emitAction, options = {}) {
    _myUserId = myUserId;
    _emit = emitAction;
    _isSpectator = !!options.isSpectator;
    _selectedCategory = null;
    _lastTurnKey = null;
    _animationToken = 0;

    const { diceCount } = state.config.settings;

    const wrapper = document.createElement('div');
    wrapper.id = 'yahtzee-wrapper';
    wrapper.className = 'yahtzee-wrapper';

    // Score sheet
    const sheetSection = document.createElement('div');
    sheetSection.className = 'yz-sheet-wrap';
    const table = document.createElement('table');
    table.id = 'yz-sheet';
    table.className = 'yz-sheet';
    sheetSection.appendChild(table);
    wrapper.appendChild(sheetSection);

    // Dice tray
    const tray = document.createElement('div');
    tray.id = 'yz-tray';
    tray.className = 'yz-tray';
    for (let i = 0; i < diceCount; i++) {
      const die = document.createElement('button');
      die.type = 'button';
      die.className = 'yz-die yz-die-empty';
      die.id = `yz-die-${i}`;
      die.dataset.idx = String(i);
      die.disabled = true;
      for (let s = 0; s < 9; s++) {
        const pip = document.createElement('span');
        pip.className = 'yz-pip-slot';
        die.appendChild(pip);
      }
      die.addEventListener('click', () => onDieClick(i));
      tray.appendChild(die);
    }
    wrapper.appendChild(tray);

    // Roll button
    const rollWrap = document.createElement('div');
    rollWrap.className = 'yz-roll-wrap';
    const rollBtn = document.createElement('button');
    rollBtn.type = 'button';
    rollBtn.id = 'yz-roll-btn';
    rollBtn.className = 'btn btn-primary yz-roll-btn';
    rollBtn.disabled = true;
    rollBtn.textContent = 'Roll';
    rollBtn.addEventListener('click', onRollClick);
    rollWrap.appendChild(rollBtn);
    wrapper.appendChild(rollWrap);

    container.appendChild(wrapper);

    YahtzeeScoreSheet.rebuild(table, state.players, { onCellClick });
  }

  // ─── update ──────────────────────────────────────────────────────────────

  function update(state) {
    if (!state?.turnState) return;

    // Detect turn change → clear pending selection so a stale highlight
    // doesn't carry into the next player's turn or even the same player's
    // next roll. Key includes rollsUsed so a fresh roll also drops it.
    const turnKey = `${state.turnState.currentPlayerIndex}:${state.turnState.roundsCompleted}:${state.turnState.rollsUsed}`;
    if (_lastTurnKey !== null && _lastTurnKey !== turnKey) {
      _selectedCategory = null;
    }
    _lastTurnKey = turnKey;

    // Roster shape changes (e.g. cross-game rejoin into a different game)
    // require rebuilding the table. Cheap to check.
    const expectedCols = state.players.length + 2;
    const existingHead = document.querySelector('#yz-sheet thead tr');
    if (!existingHead || existingHead.children.length !== expectedCols) {
      const table = document.getElementById('yz-sheet');
      if (table) YahtzeeScoreSheet.rebuild(table, state.players, { onCellClick });
    }

    YahtzeeScoreSheet.paint(state, {
      myUserId: _myUserId,
      selectedCategory: _selectedCategory,
    });
    paintDice(state);
    paintRollButton(state);
    paintSidebarTitle(state);

    // Clear any leftover Monopoly chrome.
    const buttonsEl = document.getElementById('action-buttons');
    if (buttonsEl) buttonsEl.innerHTML = '';
    const auctionEl = document.getElementById('auction-panel');
    if (auctionEl) auctionEl.style.display = 'none';
  }

  // ─── onEvent ─────────────────────────────────────────────────────────────

  function onEvent(event, state) {
    switch (event.type) {
      case 'ACTION_REJECTED': {
        UIManager.appendLog(`⚠ ${event.data.message}`, 'info');
        const tray = document.getElementById('yz-tray');
        if (tray) {
          tray.style.outline = '2px solid #e53935';
          setTimeout(() => {
            tray.style.outline = '';
          }, 800);
        }
        break;
      }
      case 'DICE_ROLLED': {
        SoundManager.playDice();
        animateDice(event.data.dice, event.data.held, state.config.settings.diceCount);
        break;
      }
      case 'CATEGORY_SCORED': {
        SoundManager.playCollect();
        YahtzeeScoreSheet.flashCell(state, event.data.username, event.data.category);
        break;
      }
      case 'GAME_OVER': {
        SoundManager.playGameOver();
        // state.winner is a userId (or array of userIds for ties); look up
        // display names from finalScores so the log shows the player's name.
        const w = event.data.winner;
        const lookup = (uid) =>
          event.data.finalScores?.find((s) => s.userId === uid)?.username || uid;
        const msg = Array.isArray(w)
          ? `🤝 Tie! ${w.map(lookup).join(' & ')} all win`
          : w
            ? `🏆 ${lookup(w)} wins!`
            : '🤝 Draw!';
        UIManager.appendLog(msg, 'game');
        break;
      }
      // TURN_STARTED, TURN_ENDED, TURN_SKIPPED — visuals covered by update().
    }
  }

  // ─── destroy ─────────────────────────────────────────────────────────────

  function destroy() {
    document.getElementById('yahtzee-wrapper')?.remove();
    _myUserId = null;
    _emit = null;
    _isSpectator = false;
    _selectedCategory = null;
    _lastTurnKey = null;
    _animationToken++; // invalidate any in-flight animations
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  cell-click bridge to the score sheet
  // ═══════════════════════════════════════════════════════════════════════════

  function onCellClick(category, userId) {
    if (_isSpectator) return;
    if (userId !== _myUserId) return;
    const state = GameState.getState();
    if (!state || state.status !== 'playing') return;
    const cur = state.players[state.turnState.currentPlayerIndex];
    if (cur?.userId !== _myUserId) return;
    if (state.turnState.rollsUsed < 1) return;
    const me = state.players.find((p) => p.userId === _myUserId);
    if (!me || me.scoreSheet[category] !== null) return;

    if (_selectedCategory === category) {
      _selectedCategory = null;
      _emit('scoreCategory', { category });
    } else {
      _selectedCategory = category;
      YahtzeeScoreSheet.paint(state, {
        myUserId: _myUserId,
        selectedCategory: _selectedCategory,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  helpers — dice
  // ═══════════════════════════════════════════════════════════════════════════

  function paintDice(state) {
    const { diceCount, rollsPerTurn } = state.config.settings;
    const dice = state.turnState.dice;
    const held = state.turnState.held;
    const rollsUsed = state.turnState.rollsUsed;
    const cur = state.players[state.turnState.currentPlayerIndex];
    const isMyTurn = cur?.userId === _myUserId;
    const playing = state.status === 'playing';
    const canHold = !_isSpectator && isMyTurn && playing && rollsUsed >= 1 && rollsUsed < rollsPerTurn;

    for (let i = 0; i < diceCount; i++) {
      const die = document.getElementById(`yz-die-${i}`);
      if (!die) continue;
      const val = dice[i];
      const isHeld = !!held?.[i];

      if (val === undefined) {
        renderDieFace(die, null);
        die.classList.add('yz-die-empty');
        die.classList.remove('yz-die-held');
      } else {
        renderDieFace(die, val);
        die.classList.remove('yz-die-empty');
        die.classList.toggle('yz-die-held', isHeld);
      }

      die.disabled = !canHold || val === undefined;
    }
  }

  function renderDieFace(die, value) {
    const slots = die.querySelectorAll('.yz-pip-slot');
    slots.forEach((s) => s.classList.remove('pip'));
    if (value === null || value === undefined) {
      die.dataset.value = '';
      return;
    }
    die.dataset.value = String(value);
    for (const pos of PIPS[value] || []) {
      slots[pos - 1]?.classList.add('pip');
    }
  }

  function onDieClick(idx) {
    const die = document.getElementById(`yz-die-${idx}`);
    if (!die || die.disabled) return;
    die.classList.toggle('yz-die-held');
    updateRollLabelFromDom();
  }

  function updateRollLabelFromDom() {
    const btn = document.getElementById('yz-roll-btn');
    if (!btn || btn.disabled) return;
    const next = Number(btn.dataset.nextRoll || '0');
    const max = Number(btn.dataset.maxRoll || '3');
    if (!next || next === 1) return;
    const heldCount = document.querySelectorAll('.yz-die.yz-die-held').length;
    btn.textContent = `Roll ${next} of ${max} — ${heldCount} held`;
  }

  function currentHeldFromDom(diceCount) {
    const held = [];
    for (let i = 0; i < diceCount; i++) {
      const die = document.getElementById(`yz-die-${i}`);
      held.push(!!die?.classList.contains('yz-die-held'));
    }
    return held;
  }

  /**
   * Animate dice flicker. Held dice (server-confirmed) stay still; non-held
   * dice flicker for ~300ms then settle on the new value. _animationToken
   * guards against overlapping rolls — only the most recent animation gets
   * to write the final values.
   */
  function animateDice(newDice, heldServer, diceCount) {
    _animationToken++;
    const token = _animationToken;
    const FRAMES = 6;
    const FRAME_MS = 50;

    for (let i = 0; i < diceCount; i++) {
      const die = document.getElementById(`yz-die-${i}`);
      if (!die) continue;
      if (heldServer[i]) continue;

      let frame = 0;
      const step = () => {
        if (token !== _animationToken) return;
        if (frame >= FRAMES) {
          renderDieFace(die, newDice[i]);
          die.classList.remove('yz-die-rolling');
          return;
        }
        die.classList.add('yz-die-rolling');
        renderDieFace(die, 1 + ((frame + i) % 6));
        frame++;
        setTimeout(step, FRAME_MS);
      };
      step();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  helpers — roll button
  // ═══════════════════════════════════════════════════════════════════════════

  function paintRollButton(state) {
    const btn = document.getElementById('yz-roll-btn');
    if (!btn) return;
    const ts = state.turnState;
    const next = ts.rollsUsed + 1;
    const max = state.config.settings.rollsPerTurn;
    btn.dataset.nextRoll = String(next);
    btn.dataset.maxRoll = String(max);

    // The rollDice descriptor is the source of truth for label/enabled
    // when it's the player's turn (whether enabled or rolls-exhausted).
    // It's absent only when status !== 'playing' or not my turn — those
    // states show display-only text the descriptor doesn't cover.
    const roll = (state.actionDescriptors || []).find((d) => d.action === 'rollDice');
    if (roll) {
      btn.disabled = !roll.enabled;
      // For rolls 2+, append the DOM-derived held count — this is purely
      // client-side ephemeral state (the user's held selection before
      // committing the next roll), not something the server can know.
      if (roll.enabled && next > 1) {
        const heldCount = currentHeldFromDom(state.config.settings.diceCount).filter(
          Boolean,
        ).length;
        btn.textContent = `${roll.label} — ${heldCount} held`;
      } else {
        btn.textContent = roll.label;
      }
      return;
    }

    // No descriptor: not my turn, or game finished. Show display-only text.
    btn.disabled = true;
    if (state.status !== 'playing') {
      btn.textContent = 'Game over';
    } else {
      const cur = state.players[ts.currentPlayerIndex];
      btn.textContent = `Waiting for ${cur?.username || ''}…`;
    }
  }

  function onRollClick() {
    if (_isSpectator) return;
    _selectedCategory = null;
    const state = GameState.getState();
    if (!state) return;
    const ts = state.turnState;
    if (ts.rollsUsed === 0) {
      _emit('rollDice');
    } else {
      _emit('rollDice', { held: currentHeldFromDom(state.config.settings.diceCount) });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  helpers — sidebar title
  // ═══════════════════════════════════════════════════════════════════════════

  function paintSidebarTitle(state) {
    const titleEl = document.getElementById('action-title');
    if (!titleEl) return;
    const cur = state.players[state.turnState.currentPlayerIndex];
    const isMyTurn = cur?.userId === _myUserId;
    const playing = state.status === 'playing';
    if (!playing) {
      titleEl.textContent = 'Game over';
      return;
    }
    if (!isMyTurn) {
      titleEl.textContent = `Waiting for ${cur?.username || ''}…`;
      return;
    }
    const ts = state.turnState;
    if (ts.rollsUsed === 0) titleEl.textContent = 'Your turn — roll!';
    else if (ts.rollsUsed >= state.config.settings.rollsPerTurn)
      titleEl.textContent = 'Your turn — pick a category';
    else titleEl.textContent = 'Your turn — re-roll or score';
  }

  // ─── public API ──────────────────────────────────────────────────────────

  return { init, update, onEvent, destroy };
})();

GameRendererRegistry.register('yahtzee', YahtzeeRenderer);

  return YahtzeeRenderer;
};
export const LOGIK = __logik;
export const ANZEIGE = __anzeige;
export const HILFE = "# Yahtzee\n\n## Overview\n\nYahtzee is a dice game for 1–8 players. Each player rolls five dice and tries to score them into one of 13 categories. The game lasts exactly 13 rounds, so every player ends up scoring once in each category. After the final round, the player with the highest total score wins.\n\nA full game takes around 15–25 minutes. The rules are simple but the choices each turn — *which dice to keep, which category to lock in* — are surprisingly rich.\n\n**Spectators welcome** — anyone logged in can watch a Yahtzee game in progress from the lobby's 👁 Spectate button. Spectators see every player's score sheet and dice rolls.\n\n## How a Turn Works\n\nOn your turn you get **up to three rolls** of all five dice, with the chance to keep some and reroll the rest in between.\n\n1. **First roll.** All five dice are rolled.\n2. **Keep or reroll.** Click a die to \"hold\" it. Unheld dice will be re-rolled when you click Roll. You can hold and release any dice between rolls — no commitments stick until you score.\n3. **Second roll.** Unheld dice roll again.\n4. **Keep or reroll.** Same as before.\n5. **Third roll.** Unheld dice roll one last time.\n6. **Score.** Pick one of the 13 categories that you haven't filled yet. Your current dice are scored into that category, even if the score is zero.\n\nYou don't have to use all three rolls. If your first or second roll is good enough, you can score immediately and end your turn.\n\nEvery turn must end with scoring something. If your dice don't match any unfilled category well, you'll need to **zero out** a category — pick one you can't fill and lock it in for 0 points. Choosing which category to sacrifice is a real part of the game.\n\n## The Scoring Categories\n\nThere are 13 categories, split into an **upper section** (six) and a **lower section** (seven).\n\n### Upper section\n\nScore the sum of the dice showing that face. Other faces are ignored.\n\n| Category | What scores                     |\n|----------|---------------------------------|\n| Ones     | Sum of dice showing 1           |\n| Twos     | Sum of dice showing 2           |\n| Threes   | Sum of dice showing 3           |\n| Fours    | Sum of dice showing 4           |\n| Fives    | Sum of dice showing 5           |\n| Sixes    | Sum of dice showing 6           |\n\nIf the total of the upper section is **63 or more**, you earn a **+35 bonus**. 63 is what you would get by rolling exactly three of each face — so the bonus rewards consistent upper-section scoring without needing every category to be perfect.\n\n### Lower section\n\nEach lower category has a specific requirement.\n\n| Category        | Requirement                  | Score                            |\n|-----------------|------------------------------|----------------------------------|\n| Three of a Kind | At least three dice the same | Sum of *all five* dice           |\n| Four of a Kind  | At least four dice the same  | Sum of *all five* dice           |\n| Full House      | Three of one + two of another| 25 points (flat)                 |\n| Small Straight  | Four consecutive faces       | 30 points (flat)                 |\n| Large Straight  | Five consecutive faces       | 40 points (flat)                 |\n| Yahtzee         | All five dice the same       | 50 points (flat)                 |\n| Chance          | Anything                     | Sum of all five dice             |\n\nIf your dice don't meet the requirement, the category scores **0**. For example, scoring \"no straight\" dice into Large Straight gives 0; the category is then used up.\n\n## Winning\n\nThe game ends when every player has scored all 13 categories. Final score is:\n\n- Upper section subtotal\n- + the +35 bonus (if upper section ≥ 63)\n- + lower section total\n\nThe highest total wins.\n\n## Useful to Know\n\n- **Five of a kind does not count as a Full House** in this implementation. Five matching dice scored as Full House gives 0. (Score it as Yahtzee instead.)\n- **No Yahtzee bonus.** In the classic boxed version, rolling additional Yahtzees after your first earns +100 each. This version deliberately does *not* implement that bonus — a second Yahtzee scored after the Yahtzee category is filled scores normally (or zero, depending on the category you put it in).\n- **Chance is the safety net** — it accepts any roll. Save it for a turn where everything else would zero out.\n- **A \"joker\"-style override is not implemented either.** If your Yahtzee category is filled and you roll a Yahtzee again, you cannot use it to fill the matching upper category at full value; it scores like normal dice.\n\n## Strategy Hints\n\n- **Fill the upper section early.** Going for the +35 bonus is one of the easiest score boosts in the game, but only if you commit to it before all your big upper rolls have been spent.\n- **Save Chance and the high upper categories (Fours, Fives, Sixes) for emergencies.** A bad-looking roll has somewhere to go if you still have these open.\n- **Don't zero out Yahtzee too early.** If you're going to take a zero, pick a category you definitely can't fill — Yahtzee has a chance to drop into your lap on any turn.\n- **Small Straight is easier to score than it looks** — 1-2-3-4, 2-3-4-5, or 3-4-5-6 with two rerolls is very common.\n";
