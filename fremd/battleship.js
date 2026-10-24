// ERZEUGT von fremd_bauen.py - nicht von Hand aendern.
// Quelle: LAN Games von kbennett2000, MIT-Lizenz (siehe fremd/LICENSE-lan-games.txt), Spiel: battleship
const __configs = {"settings.json": {"gridWidth": 10, "gridHeight": 10, "ships": [{"id": "carrier", "name": "Carrier", "length": 5}, {"id": "battleship", "name": "Battleship", "length": 4}, {"id": "cruiser", "name": "Cruiser", "length": 3}, {"id": "submarine", "name": "Submarine", "length": 3}, {"id": "destroyer", "name": "Destroyer", "length": 2}], "firstPlayerSelection": "random", "minPlayers": 2, "maxPlayers": 2, "playerColors": [{"id": "blue", "hex": "#3b82f6"}, {"id": "red", "hex": "#ef4444"}], "playerTokens": ["⚓", "🚢"]}};
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
 * Battleship game-logic module.
 * Implements the GameLogic interface defined in server/src/game-logic-interface.js.
 *
 * Standard 2-player Battleship: each player privately places five ships on
 * their own 10×10 grid, then both players take alternating shots at the
 * opponent's grid until one fleet is entirely sunk.
 *
 * ─── Out of scope for v1 (deliberate omissions) ───────────────────────────────
 *   • Salvo mode (one shot per surviving ship per turn).
 *   • "Extra turn on hit" house rule.
 *   • Multi-shot variants, ship abilities, special weapons.
 *   • N-player Battleship (the game is fundamentally a duel; v1 is 2 only).
 *   • Setup-phase timer / kick mechanism. Real games can take 60-180s to set
 *     up; the framework's chat covers this for v1. Adding a per-phase timer
 *     is a separate framework decision.
 *
 * ─── New patterns this game introduces ────────────────────────────────────────
 *   • SIMULTANEOUS SETUP PHASE — both players can act before any turn begins.
 *     Modelled as `state.status='playing'` + `state.turnState.phase='setup'`
 *     with `currentPlayerIndex=null`. The phase auto-transitions to 'firing'
 *     when both players become Ready (a barrier, not a turn).
 *   • HIDDEN GAME STATE — each player's ship positions are private to that
 *     player. Enforced by getStateForPlayer below, which REMOVES the `ships`
 *     field from the opponent's record on every emit (rather than masking).
 *
 * ─── State shape ──────────────────────────────────────────────────────────────
 *
 * GameState {
 *   id, name, gameType: 'battleship', stateVersion, status, config,
 *   createdBy, minPlayers, maxPlayers,
 *   players: Player[],         // length 2
 *   turnState: TurnState,
 *   winner: string | null,     // userId of winner, null until determined
 *   log: LogEntry[]
 * }
 *
 * Player {
 *   userId, username, color, colorHex, token, active, connected,
 *   // ── Setup-phase state (private to this player) ──────────────────
 *   ships: Ship[],             // ships this player has placed
 *   ready: boolean,            // has this player committed their placement?
 *   // ── Play-phase state (mixed visibility) ─────────────────────────
 *   shotsReceived: Shot[],     // shots the opponent fired AT this player
 *   shotsFired:    Shot[],     // shots this player fired AT the opponent
 *   shipsSunk:     string[]    // ids of this player's ships that have been sunk
 * }
 *
 * Ship {
 *   id, length, orientation: 'horizontal' | 'vertical',
 *   origin: { x, y },     // top-left for horizontal, top for vertical
 *   cells:  Cell[],       // derived from origin+orientation+length
 *   hits:   Cell[]        // cells hit so far, derived from shotsReceived
 * }
 *
 * Shot {
 *   cell:        { x, y },
 *   result:      'hit' | 'miss' | 'sunk',
 *   sunkShipId?: string,   // only present when result === 'sunk'
 *   timestamp:   number
 * }
 *
 * TurnState {
 *   phase: 'setup' | 'firing',
 *   currentPlayerIndex: number | null,   // null during setup; 0 or 1 during firing
 *   setupCompleteAt:    number | null    // timestamp of setup→firing transition
 * }
 */

const fs = require('fs');
const path = require('path');
const { validateImplementation } = require('../../src/game-logic-interface');
// NOTE: This is the first game where defaultGetStateForPlayer would be a
// CRITICAL bug — every player's ship positions would leak to the opponent.
// A real getStateForPlayer is implemented below.

const STATE_VERSION = 1;
const CONFIG_DIR = path.join(__dirname, 'config');
let _config = null;

// ── config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  const settings = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'settings.json'), 'utf8'));
  if (settings.firstPlayerSelection !== 'random') {
    // Other plausible value in the future: "first-ready" (the player who
    // committed their placement first goes first). Not implemented in v1.
    throw new Error(
      `[battleship] firstPlayerSelection="${settings.firstPlayerSelection}" not implemented; only "random" is supported in v1.`,
    );
  }
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
    name: 'Battleship',
    description: 'Place your fleet, then guess where the enemy hid theirs.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🚢',
    estimatedDurationMinutes: 15,
    complexity: 'light',
    // Battleship outcomes hinge on guessing under uncertainty and reading the
    // opponent — there's no dice or shuffle. Classified as no-luck on the same
    // grounds poker is mostly skill.
    tags: ['spatial', 'hidden-information', 'two-player', 'classic', 'no-luck'],
  };
}

// ── player creation ───────────────────────────────────────────────────────────

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
    ships: [],
    ready: false,
    shotsReceived: [],
    shotsFired: [],
    shipsSunk: [],
  };
}

// ── game initialisation ───────────────────────────────────────────────────────

function initGame(gameId, name, players, config) {
  const cfg = config || getConfigCopy();
  return {
    id: gameId,
    name,
    gameType: 'battleship',
    stateVersion: STATE_VERSION,
    status: 'playing',
    config: cfg,
    players: players.map((p) => ({
      ...p,
      ships: p.ships || [],
      ready: p.ready ?? false,
      shotsReceived: p.shotsReceived || [],
      shotsFired: p.shotsFired || [],
      shipsSunk: p.shipsSunk || [],
    })),
    turnState: {
      phase: 'setup',
      currentPlayerIndex: null,
      setupCompleteAt: null,
    },
    winner: null,
    log: [],
  };
}

// ── geometry helpers ──────────────────────────────────────────────────────────

function computeShipCells(origin, length, orientation) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    if (orientation === 'horizontal') cells.push({ x: origin.x + i, y: origin.y });
    else cells.push({ x: origin.x, y: origin.y + i });
  }
  return cells;
}

function cellKey(c) {
  return `${c.x},${c.y}`;
}

function inBounds(c, w, h) {
  return (
    Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.x < w && c.y >= 0 && c.y < h
  );
}

function shipById(config, shipId) {
  return config.settings.ships.find((s) => s.id === shipId) || null;
}

// ── player lookups ────────────────────────────────────────────────────────────

function indexOfPlayer(state, userId) {
  return state.players.findIndex((p) => p.userId === userId);
}

function opponentIndexOf(state, userId) {
  const me = indexOfPlayer(state, userId);
  if (me < 0) return -1;
  return me === 0 ? 1 : 0;
}

// ── turn helpers ──────────────────────────────────────────────────────────────

/**
 * During the setup phase BOTH players are active simultaneously, so there is no
 * single "current" player. Returns null in that case. The framework's turn-timer
 * and disconnect logic in socket-handler.js already handle null gracefully
 * (verified: both consumers use `cur?.userId` / `!cur` short-circuits).
 */
function getCurrentPlayer(state) {
  if (!state?.turnState || state.turnState.phase !== 'firing') return null;
  const p = state.players[state.turnState.currentPlayerIndex];
  if (!p) return null;
  return { userId: p.userId, username: p.username };
}

/**
 * Setup phase has no turn timer — both players need free time to place
 * ships and the framework's 30s auto-skip would be actively harmful.
 * Matches the `isTurnTimerBlocked` escape-hatch pattern Monopoly uses for
 * auctions and Risk for multi-step phases.
 */
function isTurnTimerBlocked(state) {
  return state?.turnState?.phase === 'setup';
}

/**
 * Rich-shape action descriptors for the Battleship renderer. See
 * docs/action-descriptors.md for the contract. Safe on pre-initGame
 * waiting-room states (returns []).
 *
 * Shape choices documented in the design doc:
 *   • commitPlacement / uncommitPlacement are SEPARATE descriptors;
 *     `enabled` flips between them so the renderer picks the active one.
 *   • placeShip / fireShot are single descriptors (no per-cell / per-ship
 *     enumeration) — the renderer drives the payload via drag / click.
 *   • The `hint` field doubles as button tooltip and status-line text;
 *     the renderer surfaces it in both places.
 */
function getActionDescriptors(state, userId) {
  if (!state || state.status !== 'playing') return [];
  const idx = indexOfPlayer(state, userId);
  if (idx < 0) return [];
  const me = state.players[idx];
  const phase = state.turnState?.phase;
  const total = state.config.settings.ships.length;

  if (phase === 'setup') {
    const placed = me.ships.length;
    const remaining = total - placed;
    const allPlaced = placed === total;
    const editing = !me.ready;
    const placeHint = me.ready
      ? "You've committed — un-ready to rearrange."
      : allPlaced
        ? `All ${total} placed — click Ready when you're set.`
        : `Place your ships — ${placed} of ${total} placed.`;
    return [
      {
        action: 'placeShip',
        label: 'Drag a ship onto your grid',
        enabled: editing,
        hint: placeHint,
        data: { shipsPlaced: placed, shipsRequired: total },
      },
      {
        action: 'removeShip',
        label: 'Pick up a placed ship',
        enabled: editing && placed > 0,
        hint: editing
          ? placed > 0
            ? 'Drag a placed ship to reposition it.'
            : 'No ships placed yet.'
          : "You've committed — un-ready to rearrange.",
      },
      {
        action: 'commitPlacement',
        label: 'Ready',
        enabled: editing && allPlaced,
        hint: me.ready
          ? 'Already committed.'
          : allPlaced
            ? 'Click to commit your placement.'
            : remaining === total
              ? 'Place all 5 ships first.'
              : `Place all ${total} ships first (${remaining} remaining).`,
        data: { shipsPlaced: placed, shipsRequired: total },
      },
      {
        action: 'uncommitPlacement',
        label: 'Unready',
        // Per uncommitPlacement's server check: phase must still be 'setup'
        // and player.ready must be true. Both are encoded by `me.ready`
        // here — once both players ready, the phase transitions to firing
        // and this descriptor is no longer returned at all.
        enabled: me.ready,
        hint: me.ready ? 'Take back your commitment.' : "You haven't committed yet.",
      },
    ];
  }

  if (phase === 'firing') {
    const isMyTurn = state.turnState.currentPlayerIndex === idx;
    const opp = state.players[opponentIndexOf(state, userId)];
    return [
      {
        action: 'fireShot',
        label: `Fire at ${opp?.username || 'opponent'}'s waters`,
        enabled: isMyTurn,
        hint: isMyTurn ? 'Click an unshot cell.' : `${opp?.username || 'Opponent'}'s turn.`,
      },
    ];
  }

  return [];
}

function getValidActions(state, userId) {
  if (!state || state.status !== 'playing') return [];
  const idx = indexOfPlayer(state, userId);
  if (idx < 0) return [];
  const me = state.players[idx];
  const phase = state.turnState?.phase;
  const shipsConfigured = state.config.settings.ships.length;

  if (phase === 'setup') {
    if (me.ready) {
      // Once both players become Ready the phase auto-transitions to firing,
      // so this branch is only reachable for the first player to commit.
      // uncommit is only valid while the phase is still setup.
      return ['uncommitPlacement'];
    }
    const actions = ['placeShip', 'removeShip'];
    if (me.ships.length === shipsConfigured) actions.push('commitPlacement');
    return actions;
  }

  if (phase === 'firing') {
    const cur = state.players[state.turnState.currentPlayerIndex];
    if (cur?.userId === userId) return ['fireShot'];
    return [];
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACTIONS — setup phase
// ═══════════════════════════════════════════════════════════════════════════════

function placeShip(state, userId, payload) {
  const idx = indexOfPlayer(state, userId);
  if (idx < 0) return { state, events: [], error: 'Not a player in this game' };
  if (state.turnState.phase !== 'setup') {
    return { state, events: [], error: 'Ship placement is only allowed during setup' };
  }
  const me = state.players[idx];
  if (me.ready) {
    return {
      state,
      events: [],
      error: 'Cannot rearrange after committing — uncommitPlacement first',
    };
  }

  const shipId = payload?.shipId;
  const shipDef = shipById(state.config, shipId);
  if (!shipDef) {
    return { state, events: [], error: `Unknown shipId: ${shipId}` };
  }
  const orientation = payload?.orientation;
  if (orientation !== 'horizontal' && orientation !== 'vertical') {
    return { state, events: [], error: 'orientation must be "horizontal" or "vertical"' };
  }
  const origin = payload?.origin;
  if (!origin || !Number.isInteger(origin.x) || !Number.isInteger(origin.y)) {
    return { state, events: [], error: 'origin must be { x: integer, y: integer }' };
  }
  const { gridWidth, gridHeight } = state.config.settings;
  if (!inBounds(origin, gridWidth, gridHeight)) {
    return { state, events: [], error: 'origin is out of bounds' };
  }
  const cells = computeShipCells(origin, shipDef.length, orientation);
  if (!cells.every((c) => inBounds(c, gridWidth, gridHeight))) {
    return { state, events: [], error: 'ship extends out of bounds' };
  }
  // Overlap check: ignore this shipId (placeShip doubles as "move").
  const otherCells = new Set();
  for (const ship of me.ships) {
    if (ship.id === shipId) continue;
    for (const c of ship.cells) otherCells.add(cellKey(c));
  }
  for (const c of cells) {
    if (otherCells.has(cellKey(c))) {
      return { state, events: [], error: 'ship overlaps another placed ship' };
    }
  }

  const newShip = {
    id: shipDef.id,
    length: shipDef.length,
    orientation,
    origin: { x: origin.x, y: origin.y },
    cells,
    hits: [],
  };
  const newShips = me.ships.filter((s) => s.id !== shipId).concat(newShip);
  const newPlayers = state.players.map((p, i) => (i === idx ? { ...p, ships: newShips } : p));

  return {
    state: {
      ...state,
      players: newPlayers,
      log: [
        ...(state.log || []),
        {
          message: `${me.username} placed ${shipDef.name}`,
          type: 'setup',
          timestamp: Date.now(),
        },
      ],
    },
    // SHIP_PLACED is broadcast to BOTH players, so position MUST NOT be in
    // the event payload — that would leak ship locations during setup.
    events: [
      {
        type: 'SHIP_PLACED',
        data: { username: me.username, shipId },
        timestamp: Date.now(),
      },
    ],
  };
}

function removeShip(state, userId, payload) {
  const idx = indexOfPlayer(state, userId);
  if (idx < 0) return { state, events: [], error: 'Not a player in this game' };
  if (state.turnState.phase !== 'setup') {
    return { state, events: [], error: 'Ship removal is only allowed during setup' };
  }
  const me = state.players[idx];
  if (me.ready) {
    return {
      state,
      events: [],
      error: 'Cannot rearrange after committing — uncommitPlacement first',
    };
  }
  const shipId = payload?.shipId;
  if (!me.ships.find((s) => s.id === shipId)) {
    return { state, events: [], error: 'Ship is not currently placed' };
  }
  const newShips = me.ships.filter((s) => s.id !== shipId);
  const newPlayers = state.players.map((p, i) => (i === idx ? { ...p, ships: newShips } : p));
  return {
    state: {
      ...state,
      players: newPlayers,
      log: [
        ...(state.log || []),
        { message: `${me.username} removed a ship`, type: 'setup', timestamp: Date.now() },
      ],
    },
    // Same privacy rule as SHIP_PLACED — no positional info in the event.
    events: [
      { type: 'SHIP_REMOVED', data: { username: me.username, shipId }, timestamp: Date.now() },
    ],
  };
}

function commitPlacement(state, userId) {
  const idx = indexOfPlayer(state, userId);
  if (idx < 0) return { state, events: [], error: 'Not a player in this game' };
  if (state.turnState.phase !== 'setup') {
    return { state, events: [], error: 'Commit is only allowed during setup' };
  }
  const me = state.players[idx];
  if (me.ready) {
    return { state, events: [], error: 'Already committed' };
  }
  const shipsConfigured = state.config.settings.ships.length;
  if (me.ships.length !== shipsConfigured) {
    return {
      state,
      events: [],
      error: `All ${shipsConfigured} ships must be placed before committing (currently ${me.ships.length})`,
    };
  }

  const newPlayers = state.players.map((p, i) => (i === idx ? { ...p, ready: true } : p));
  const events = [{ type: 'PLAYER_READY', data: { username: me.username }, timestamp: Date.now() }];
  const log = [
    ...(state.log || []),
    { message: `${me.username} is ready`, type: 'setup', timestamp: Date.now() },
  ];

  // Both ready? Auto-transition to the firing phase.
  if (newPlayers.every((p) => p.ready)) {
    const firstIdx = Math.random() < 0.5 ? 0 : 1;
    const first = newPlayers[firstIdx];
    const now = Date.now();
    events.push({
      type: 'SETUP_COMPLETE',
      data: { firstPlayer: first.username },
      timestamp: now,
    });
    // Emit TURN_STARTED here too so the renderer has one consistent
    // signal for "this player is up" across the first and all subsequent
    // turns; otherwise the renderer would need a separate branch for the
    // first turn after setup.
    events.push({
      type: 'TURN_STARTED',
      data: { username: first.username },
      timestamp: now,
    });
    log.push({
      message: `Both players ready — ${first.username} fires first`,
      type: 'game',
      timestamp: now,
    });
    return {
      state: {
        ...state,
        players: newPlayers,
        turnState: {
          phase: 'firing',
          currentPlayerIndex: firstIdx,
          setupCompleteAt: now,
        },
        log,
      },
      events,
    };
  }

  return { state: { ...state, players: newPlayers, log }, events };
}

function uncommitPlacement(state, userId) {
  const idx = indexOfPlayer(state, userId);
  if (idx < 0) return { state, events: [], error: 'Not a player in this game' };
  // Once both players become Ready the phase transitions to 'firing' and
  // un-readying is no longer possible — the single phase check covers this.
  if (state.turnState.phase !== 'setup') {
    return { state, events: [], error: 'Cannot un-ready after firing has begun' };
  }
  const me = state.players[idx];
  if (!me.ready) {
    return { state, events: [], error: 'Not currently ready' };
  }
  const newPlayers = state.players.map((p, i) => (i === idx ? { ...p, ready: false } : p));
  return {
    state: {
      ...state,
      players: newPlayers,
      log: [
        ...(state.log || []),
        { message: `${me.username} un-readied`, type: 'setup', timestamp: Date.now() },
      ],
    },
    events: [{ type: 'PLAYER_UNREADY', data: { username: me.username }, timestamp: Date.now() }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACTIONS — firing phase
// ═══════════════════════════════════════════════════════════════════════════════

function fireShot(state, userId, payload) {
  if (state.status !== 'playing') {
    return { state, events: [], error: 'Game is not in playing state' };
  }
  if (state.turnState.phase !== 'firing') {
    return { state, events: [], error: 'Cannot fire during setup' };
  }
  const meIdx = indexOfPlayer(state, userId);
  if (meIdx < 0) return { state, events: [], error: 'Not a player in this game' };
  if (state.turnState.currentPlayerIndex !== meIdx) {
    return { state, events: [], error: 'Not your turn' };
  }
  const oppIdx = opponentIndexOf(state, userId);
  const me = state.players[meIdx];
  const opp = state.players[oppIdx];

  const cell = payload?.cell;
  const { gridWidth, gridHeight } = state.config.settings;
  if (!cell || !inBounds(cell, gridWidth, gridHeight)) {
    return { state, events: [], error: 'cell is out of bounds or malformed' };
  }
  if (me.shotsFired.some((s) => s.cell.x === cell.x && s.cell.y === cell.y)) {
    return { state, events: [], error: 'Cell has already been targeted' };
  }

  // Determine the result by scanning the opponent's actual (server-side) ship
  // layout. The renderer never sees opp.ships — only the resolved Shot record.
  let hitShip = null;
  for (const ship of opp.ships) {
    if (ship.cells.some((c) => c.x === cell.x && c.y === cell.y)) {
      hitShip = ship;
      break;
    }
  }

  const now = Date.now();
  let shot;
  let updatedOppShips = opp.ships;
  let updatedSunk = opp.shipsSunk;
  let sunkShipDef = null;

  if (!hitShip) {
    shot = { cell: { x: cell.x, y: cell.y }, result: 'miss', timestamp: now };
  } else {
    const newHits = hitShip.hits.concat({ x: cell.x, y: cell.y });
    const allHit = newHits.length >= hitShip.length;
    const updatedShip = { ...hitShip, hits: newHits };
    updatedOppShips = opp.ships.map((s) => (s.id === hitShip.id ? updatedShip : s));
    if (allHit) {
      shot = {
        cell: { x: cell.x, y: cell.y },
        result: 'sunk',
        sunkShipId: hitShip.id,
        timestamp: now,
      };
      updatedSunk = opp.shipsSunk.concat(hitShip.id);
      sunkShipDef = updatedShip;
    } else {
      shot = { cell: { x: cell.x, y: cell.y }, result: 'hit', timestamp: now };
    }
  }

  const events = [
    {
      type: 'SHOT_FIRED',
      data: {
        shooter: me.username,
        target: opp.username,
        cell: { x: cell.x, y: cell.y },
        result: shot.result,
      },
      timestamp: now,
    },
  ];
  const logs = [
    ...(state.log || []),
    {
      message: `${me.username} fires at (${cell.x + 1},${cell.y + 1}): ${shot.result}`,
      type: shot.result === 'miss' ? 'info' : 'hit',
      timestamp: now,
    },
  ];

  if (sunkShipDef) {
    // SHIP_SUNK reveals the ship's full cell footprint — by rule, a sunk ship
    // is no longer hidden information. The renderer paints all cells as sunk.
    events.push({
      type: 'SHIP_SUNK',
      data: {
        owner: opp.username,
        shipId: sunkShipDef.id,
        shipName: shipById(state.config, sunkShipDef.id)?.name || sunkShipDef.id,
        length: sunkShipDef.length,
        cells: sunkShipDef.cells.map((c) => ({ x: c.x, y: c.y })),
      },
      timestamp: now,
    });
    logs.push({
      message: `${me.username} sunk ${opp.username}'s ${shipById(state.config, sunkShipDef.id)?.name || sunkShipDef.id}!`,
      type: 'game',
      timestamp: now,
    });
  }

  // Build the updated player records.
  const newMe = { ...me, shotsFired: me.shotsFired.concat(shot) };
  const newOpp = {
    ...opp,
    ships: updatedOppShips,
    shotsReceived: opp.shotsReceived.concat(shot),
    shipsSunk: updatedSunk,
  };
  const newPlayers = state.players.map((p, i) => {
    if (i === meIdx) return newMe;
    if (i === oppIdx) return newOpp;
    return p;
  });

  // Game over?
  const totalShips = state.config.settings.ships.length;
  if (updatedSunk.length === totalShips) {
    // Reveal both fleets at game over. The state filter still hides opp
    // ships at all times (status-independent for security clarity); the
    // reveal travels through the event channel, which is broadcast
    // identically to every player. Once the game is finished, the hidden
    // information no longer matters by rule.
    events.push({
      type: 'GAME_OVER',
      data: {
        winner: me.userId,
        winnerUsername: me.username,
        finalFleets: {
          [newMe.userId]: newMe.ships,
          [newOpp.userId]: newOpp.ships,
        },
      },
      timestamp: now,
    });
    logs.push({
      message: `${me.username} wins! All of ${opp.username}'s ships are sunk.`,
      type: 'game',
      timestamp: now,
    });
    return {
      state: {
        ...state,
        players: newPlayers,
        status: 'finished',
        winner: me.userId,
        log: logs,
      },
      events,
    };
  }

  // Otherwise advance to the opponent.
  events.push({
    type: 'TURN_STARTED',
    data: { username: newOpp.username },
    timestamp: now,
  });
  return {
    state: {
      ...state,
      players: newPlayers,
      turnState: { ...state.turnState, currentPlayerIndex: oppIdx },
      log: logs,
    },
    events,
  };
}

function skipTurn(state, userId) {
  // Skipping during setup is meaningless — both players are placing ships in
  // parallel and there is no turn to skip. isTurnTimerBlocked already
  // prevents the framework from invoking this during setup, but return an
  // explicit error in case anything else calls it directly.
  if (state.turnState?.phase !== 'firing') {
    return { state, events: [], error: 'Cannot skip a turn during setup' };
  }
  const meIdx = indexOfPlayer(state, userId);
  if (meIdx < 0 || state.turnState.currentPlayerIndex !== meIdx) {
    return { state, events: [], error: "Not this player's turn" };
  }
  const oppIdx = opponentIndexOf(state, userId);
  const me = state.players[meIdx];
  const opp = state.players[oppIdx];
  const now = Date.now();
  return {
    state: {
      ...state,
      turnState: { ...state.turnState, currentPlayerIndex: oppIdx },
      log: [
        ...(state.log || []),
        { message: `${me.username}'s turn was skipped`, type: 'info', timestamp: now },
      ],
    },
    events: [
      { type: 'TURN_SKIPPED', data: { username: me.username }, timestamp: now },
      { type: 'TURN_STARTED', data: { username: opp.username }, timestamp: now },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  applyAction dispatcher
// ═══════════════════════════════════════════════════════════════════════════════

function applyAction(state, userId, action, payload = {}) {
  switch (action) {
    case 'placeShip':
      return placeShip(state, userId, payload);
    case 'removeShip':
      return removeShip(state, userId, payload);
    case 'commitPlacement':
      return commitPlacement(state, userId);
    case 'uncommitPlacement':
      return uncommitPlacement(state, userId);
    case 'fireShot':
      return fireShot(state, userId, payload);
    case 'skipTurn':
      return skipTurn(state, userId);
    default:
      return { state, events: [], error: `Unknown action: ${action}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  getStateForPlayer
//
// SECURITY CRITICAL: This function is the only thing standing between an
// opponent and full knowledge of your ship positions. The `ships` field must
// be REMOVED from the opponent's player record on every emit, not masked. A
// masked field (e.g. ships: []) is still better than nothing, but removing
// the field entirely is the simplest defensive posture — there is no field
// for a malicious client to introspect for length, orientation, or cell
// data, and any future field added to Ship is automatically hidden too.
// ═══════════════════════════════════════════════════════════════════════════════

function getStateForPlayer(state, userId) {
  if (!state || !Array.isArray(state.players)) return state;
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.userId === userId) return p;
      // Safe on waiting-room states: players placed via createInitialPlayer
      // have a ships field (empty array) already; pre-initGame players might
      // not. Either way, destructuring `{ ships: _ships, ...rest }` produces
      // an object without a `ships` key.
      const { ships, ...rest } = p;
      // Expose a count (not positions) of the opponent's placed ships so
      // the renderer can show "N of 5 placed" during setup. The count
      // reveals strictly less than PLAYER_READY (which implies 5/5); no
      // security boundary moves.
      return { ...rest, placementCount: ships?.length ?? 0 };
    }),
  };
}

// ── migration ────────────────────────────────────────────────────────────────

function migrate(state) {
  if (state.stateVersion === STATE_VERSION) return state;
  throw new Error(
    `[battleship] No migration path from stateVersion ${state.stateVersion} to ${STATE_VERSION}`,
  );
}

// ── exports ──────────────────────────────────────────────────────────────────

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
  getStateForPlayer,
  migrate,

  // Internal helpers exported for unit tests.
  computeShipCells,
  cellKey,
  inBounds,
};

validateImplementation(module.exports, {
  internalExports: ['computeShipCells', 'cellKey', 'inBounds'],
});

  return module.exports;
})();
const __anzeige = (UIManager, SoundManager, GameRendererRegistry, GameState) => {
/**
 * Battleship — shared 10×10 grid primitive.
 *
 * Builds a CSS-Grid <div> with one cell per (x,y), each cell tagged with
 * data-x / data-y attributes. Used by both the setup and firing phases.
 *
 * Keeping this thin: cell rendering is owned by the phase modules
 * (they paint ships, shots, overlays). This module just provides the
 * grid scaffold + a couple of lookup helpers shared by both phases.
 */

const BattleshipGrid = (() => {
  /**
   * @param {number} width  e.g. 10
   * @param {number} height e.g. 10
   * @param {object} options
   * @param {string} [options.id]              DOM id for the grid container
   * @param {string} [options.className]       extra class appended to .bs-grid
   * @param {Function} [options.onCellMousedown] (event, x, y) => void
   * @returns {HTMLDivElement}
   */
  function build(width, height, options = {}) {
    const grid = document.createElement('div');
    if (options.id) grid.id = options.id;
    grid.className = 'bs-grid' + (options.className ? ` ${options.className}` : '');
    grid.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${height}, 1fr)`;
    grid.dataset.width = String(width);
    grid.dataset.height = String(height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = document.createElement('div');
        cell.className = 'bs-cell';
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        if (options.onCellMousedown) {
          cell.addEventListener('mousedown', (e) => options.onCellMousedown(e, x, y));
        }
        grid.appendChild(cell);
      }
    }
    return grid;
  }

  /** Lookup a single cell element by coordinate. */
  function getCell(grid, x, y) {
    return grid.querySelector(`.bs-cell[data-x="${x}"][data-y="${y}"]`);
  }

  /**
   * Resolve which cell of `grid` is under the given viewport point, or null
   * if the cursor is outside the grid. Uses elementFromPoint so it works
   * across overlapping elements (the floating drag ghost, if any).
   */
  function cellFromPoint(grid, clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !el.classList.contains('bs-cell')) return null;
    if (!grid.contains(el)) return null;
    return { x: Number(el.dataset.x), y: Number(el.dataset.y) };
  }

  /** Remove a given class from every cell in the grid. */
  function clearClass(grid, className) {
    grid.querySelectorAll('.' + className).forEach((el) => el.classList.remove(className));
  }

  return { build, getCell, cellFromPoint, clearClass };
})();

/**
 * Battleship — setup phase.
 *
 * Mounts a single .bs-setup section containing:
 *   • Player's own 10×10 grid (left) — drop target, drag-pickup source
 *   • Unplaced ships panel (right) — list of ship previews; drag-source
 *   • Status line + Ready/Unready button (below the grid)
 *   • Opponent placeholder — dimmed grid + "N of 5" overlay (below unplaced)
 *
 * ─── Drag-and-drop implementation ──────────────────────────────────────────
 * Mouse-event-based (mousedown/mousemove/mouseup + keydown for R-rotate),
 * not HTML5 DnD. Reasons: HTML5 DnD's drag image is hard to style
 * consistently across browsers; we want the "ghost" to render directly on
 * the grid as cell highlights, not as a floating element, so the snap-to-
 * cell feel is built-in. Implementation is a small state machine:
 *   idle  → dragging       (mousedown on a ship preview or placed ship)
 *   dragging → dragging    (mousemove → repaint ghost / hover cell)
 *   dragging → dragging    (R key → toggle orientation)
 *   dragging → committed   (mouseup on valid cell → emit placeShip)
 *   dragging → cancelled   (mouseup off-grid or invalid → no-op; ship
 *                           returns to unplaced panel because server says
 *                           it's not placed)
 *
 * No floating ghost element. Off-grid the cursor moves freely with no
 * visual; over-grid the would-be cells highlight green (valid) or red
 * (invalid). The "← placing" indicator in the unplaced panel tells the
 * user which ship is currently in-flight if they need a reminder.
 *
 * ─── Drag-pickup of a placed ship ──────────────────────────────────────────
 * Mousedown on a placed ship cell emits removeShip immediately, then
 * enters the drag state for that ship. If the user cancels the drag
 * (releases off-grid or on an invalid cell), the server has already
 * removed the ship and it appears in the unplaced panel until they place
 * it again. This is intentional: it matches the "you can shuffle freely"
 * intent.
 */

const BattleshipSetup = (() => {
  // ── module-scoped state (re-initialised by mount()) ─────────────────────
  let _wrapper = null; // the <div class="bs-setup"> we own
  let _myUserId = null;
  let _emit = null;
  let _state = null;
  let _grid = null; // the player's grid DOM
  let _drag = null; // { shipId, length, orientation, sourceWasGrid }
  let _hoveredCell = null; // { x, y } | null — cursor's last grid cell

  // ── lifecycle ───────────────────────────────────────────────────────────

  function mount(container, state, myUserId, emit) {
    _myUserId = myUserId;
    _emit = emit;
    _state = state;

    _wrapper = document.createElement('div');
    _wrapper.className = 'bs-setup';

    // Left column: your fleet + status + ready button
    const leftCol = document.createElement('div');
    leftCol.className = 'bs-setup-col bs-setup-fleet-col';
    const fleetLabel = document.createElement('h3');
    fleetLabel.className = 'bs-section-label';
    fleetLabel.textContent = 'Your fleet';
    leftCol.appendChild(fleetLabel);

    _grid = BattleshipGrid.build(
      state.config.settings.gridWidth,
      state.config.settings.gridHeight,
      { id: 'bs-setup-grid', className: 'bs-grid-own', onCellMousedown: onGridMousedown },
    );
    leftCol.appendChild(_grid);

    const status = document.createElement('div');
    status.id = 'bs-setup-status';
    status.className = 'bs-setup-status';
    leftCol.appendChild(status);

    const readyBtn = document.createElement('button');
    readyBtn.type = 'button';
    readyBtn.id = 'bs-ready-btn';
    readyBtn.className = 'btn btn-primary bs-ready-btn';
    readyBtn.addEventListener('click', onReadyClick);
    leftCol.appendChild(readyBtn);

    _wrapper.appendChild(leftCol);

    // Right column: unplaced ships + opponent placeholder
    const rightCol = document.createElement('div');
    rightCol.className = 'bs-setup-col bs-setup-right-col';

    const unplacedLabel = document.createElement('h3');
    unplacedLabel.className = 'bs-section-label';
    unplacedLabel.textContent = 'Unplaced ships';
    rightCol.appendChild(unplacedLabel);

    const hint = document.createElement('p');
    hint.className = 'bs-hint';
    hint.textContent = '💡 Press R while dragging to rotate.';
    rightCol.appendChild(hint);

    const unplacedPanel = document.createElement('div');
    unplacedPanel.id = 'bs-unplaced-panel';
    unplacedPanel.className = 'bs-unplaced-panel';
    rightCol.appendChild(unplacedPanel);

    const opponentLabel = document.createElement('h3');
    opponentLabel.className = 'bs-section-label bs-opp-label';
    rightCol.appendChild(opponentLabel);

    const opponentPlaceholder = document.createElement('div');
    opponentPlaceholder.id = 'bs-opp-placeholder';
    opponentPlaceholder.className = 'bs-opp-placeholder';
    rightCol.appendChild(opponentPlaceholder);

    _wrapper.appendChild(rightCol);
    container.appendChild(_wrapper);

    // Mouse-up listener lives on document for the whole mount, so a drag
    // that ends outside the grid still resolves.
    document.addEventListener('mouseup', onDocMouseup);
    document.addEventListener('mousemove', onDocMousemove);
    document.addEventListener('keydown', onDocKeydown);

    paintAll();
  }

  function unmount() {
    document.removeEventListener('mouseup', onDocMouseup);
    document.removeEventListener('mousemove', onDocMousemove);
    document.removeEventListener('keydown', onDocKeydown);
    _wrapper?.remove();
    _wrapper = null;
    _grid = null;
    _state = null;
    _drag = null;
    _hoveredCell = null;
    _myUserId = null;
    _emit = null;
  }

  function update(state) {
    _state = state;
    paintAll();
  }

  function onEvent(_event, _state) {
    // All visuals come from update(); no event-only effects in setup phase.
    // (SHIP_PLACED / SHIP_REMOVED / PLAYER_READY all flow through state.)
  }

  // ── painting ────────────────────────────────────────────────────────────

  function paintAll() {
    if (!_state || !_grid) return;
    paintGridShips();
    paintDragGhost();
    paintUnplacedPanel();
    paintStatusAndButton();
    paintOpponentPlaceholder();
  }

  function paintGridShips() {
    const me = state_meAndOpp().me;
    // Clear classes AND the dataset attribute on every cell — otherwise a
    // moved ship leaves its old cells with a stale shipId, and mousedown on
    // one of those cells would start a drag for a ship not actually there.
    _grid.querySelectorAll('.bs-cell').forEach((cell) => {
      cell.classList.remove('bs-cell-ship', 'bs-cell-ship-pickup');
      delete cell.dataset.shipId;
    });
    for (const ship of me.ships) {
      // While a placed ship is being dragged, the server may not yet have
      // confirmed the removeShip — hide it locally so it doesn't render at
      // its old position with the drag ghost simultaneously visible.
      if (_drag?.shipId === ship.id && _drag.sourceWasGrid) continue;
      for (const c of ship.cells) {
        const cell = BattleshipGrid.getCell(_grid, c.x, c.y);
        if (!cell) continue;
        cell.classList.add('bs-cell-ship');
        cell.dataset.shipId = ship.id;
        if (!me.ready) cell.classList.add('bs-cell-ship-pickup');
      }
    }
  }

  function paintDragGhost() {
    BattleshipGrid.clearClass(_grid, 'bs-cell-ghost-valid');
    BattleshipGrid.clearClass(_grid, 'bs-cell-ghost-invalid');
    if (!_drag || !_hoveredCell) return;
    const cells = computeGhostCells(_hoveredCell, _drag.length, _drag.orientation);
    const valid = isPlacementValid(cells);
    const cls = valid ? 'bs-cell-ghost-valid' : 'bs-cell-ghost-invalid';
    for (const c of cells) {
      const cell = BattleshipGrid.getCell(_grid, c.x, c.y);
      if (cell) cell.classList.add(cls);
    }
  }

  function paintUnplacedPanel() {
    const panel = document.getElementById('bs-unplaced-panel');
    if (!panel) return;
    panel.innerHTML = '';

    const me = state_meAndOpp().me;
    const placedIds = new Set(me.ships.map((s) => s.id));
    const draggedId = _drag?.shipId;

    for (const def of _state.config.settings.ships) {
      if (placedIds.has(def.id) && draggedId !== def.id) continue;
      const row = document.createElement('div');
      row.className = 'bs-unplaced-row';
      row.dataset.shipId = def.id;
      if (draggedId === def.id) row.classList.add('bs-unplaced-placing');

      const preview = document.createElement('div');
      preview.className = 'bs-ship-preview';
      preview.style.setProperty('--ship-color', me.colorHex || 'var(--accent)');
      for (let i = 0; i < def.length; i++) {
        const seg = document.createElement('span');
        seg.className = 'bs-ship-seg';
        preview.appendChild(seg);
      }
      row.appendChild(preview);

      const label = document.createElement('span');
      label.className = 'bs-ship-label';
      label.textContent = `${def.name} (${def.length})`;
      row.appendChild(label);

      if (draggedId === def.id) {
        const ind = document.createElement('span');
        ind.className = 'bs-ship-placing';
        ind.textContent = '← placing';
        row.appendChild(ind);
      } else if (!me.ready) {
        row.addEventListener('mousedown', (e) => startDrag(def.id, false, e));
      }
      panel.appendChild(row);
    }
  }

  function paintStatusAndButton() {
    const status = document.getElementById('bs-setup-status');
    const btn = document.getElementById('bs-ready-btn');
    if (!status || !btn) return;

    // Action descriptors are the source of truth for button label, enabled
    // state, and the status-line hint. See docs/action-descriptors.md. The
    // hand-rolled mirror of me.ready / me.ships.length used to live here;
    // that mirror could drift from server rules. The descriptors carry the
    // server's view, computed server-side, attached to every emit.
    const descriptors = _state.actionDescriptors || [];
    const commit = descriptors.find((d) => d.action === 'commitPlacement');
    const uncommit = descriptors.find((d) => d.action === 'uncommitPlacement');
    const placeShip = descriptors.find((d) => d.action === 'placeShip');

    // Pick whichever of commit/uncommit is currently enabled; if neither is
    // (e.g. setup with not-all-placed), surface the disabled commit
    // descriptor so the button still renders informatively.
    let active;
    if (uncommit?.enabled) {
      active = { ...uncommit, dataAction: 'uncommit', primary: false };
    } else if (commit) {
      active = { ...commit, dataAction: 'commit', primary: true };
    }
    // No descriptors yet (waiting-room race): keep the button hidden by
    // disabling and blanking it; update() will be called again with real
    // data shortly.
    if (!active) {
      btn.disabled = true;
      btn.textContent = '';
      status.textContent = '';
      return;
    }
    btn.textContent = active.label;
    btn.disabled = !active.enabled;
    btn.dataset.action = active.dataAction;
    btn.classList.toggle('btn-primary', active.primary);
    btn.classList.toggle('btn-outline', !active.primary);
    // The placeShip descriptor's hint is the broader setup status text
    // ("3 of 5 placed" etc). When the player is ready, the active commit/
    // uncommit hint is more relevant ("Waiting for opponent" via the
    // commitPlacement hint, or "Take back your commitment" via uncommit).
    status.textContent = active.dataAction === 'uncommit'
      ? 'Waiting for opponent…'
      : placeShip?.hint || active.hint || '';
  }

  function paintOpponentPlaceholder() {
    const { opp } = state_meAndOpp();
    const label = _wrapper?.querySelector('.bs-opp-label');
    if (label) label.textContent = opp ? opp.username : 'Opponent';

    const placeholder = document.getElementById('bs-opp-placeholder');
    if (!placeholder) return;
    placeholder.innerHTML = '';
    const oppGrid = document.createElement('div');
    oppGrid.className = 'bs-grid bs-grid-dimmed';
    const w = _state.config.settings.gridWidth;
    const h = _state.config.settings.gridHeight;
    oppGrid.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
    oppGrid.style.gridTemplateRows = `repeat(${h}, 1fr)`;
    for (let i = 0; i < w * h; i++) {
      const c = document.createElement('div');
      c.className = 'bs-cell';
      oppGrid.appendChild(c);
    }
    placeholder.appendChild(oppGrid);

    const overlay = document.createElement('div');
    overlay.className = 'bs-opp-overlay';
    const username = opp?.username || 'Opponent';
    const total = _state.config.settings.ships.length;
    const placed = opp?.placementCount ?? 0;
    let text;
    if (opp?.ready) text = `${username} is ready ✓`;
    else if (placed === 0) text = `${username} is placing their ships…`;
    else if (placed < total) text = `${username} is placing their ships… (${placed} of ${total})`;
    else text = `${username} is reviewing their placement…`;
    overlay.textContent = text;
    placeholder.appendChild(overlay);
  }

  // ── drag state machine ──────────────────────────────────────────────────

  function startDrag(shipId, sourceWasGrid, event) {
    const me = state_meAndOpp().me;
    if (me.ready) return;
    const def = _state.config.settings.ships.find((s) => s.id === shipId);
    if (!def) return;
    // Default orientation: horizontal. If picking up a placed ship, keep
    // the ship's current orientation so a small move doesn't reorient it.
    let orientation = 'horizontal';
    if (sourceWasGrid) {
      const existing = me.ships.find((s) => s.id === shipId);
      if (existing) orientation = existing.orientation;
    }
    _drag = { shipId, length: def.length, orientation, sourceWasGrid };
    if (sourceWasGrid) {
      _emit('removeShip', { shipId });
      // Don't wait for the server — paint as if removed locally; the
      // next update() will reconcile.
    }
    if (event) event.preventDefault();
    paintAll();
  }

  function endDrag(commit) {
    if (!_drag) return;
    let committed = false;
    if (commit && _hoveredCell) {
      const cells = computeGhostCells(_hoveredCell, _drag.length, _drag.orientation);
      if (isPlacementValid(cells)) {
        _emit('placeShip', {
          shipId: _drag.shipId,
          origin: { x: _hoveredCell.x, y: _hoveredCell.y },
          orientation: _drag.orientation,
        });
        committed = true;
      }
    }
    _drag = null;
    _hoveredCell = null;
    paintAll();
    return committed;
  }

  function onGridMousedown(event, x, y) {
    if (_drag) return; // already mid-drag
    const cell = BattleshipGrid.getCell(_grid, x, y);
    // Require the pickup class — guards against picking up "phantom" cells
    // when the player is ready (no pickup allowed) or when stale state
    // briefly references a removed ship.
    if (!cell?.classList.contains('bs-cell-ship-pickup')) return;
    const shipId = cell.dataset?.shipId;
    if (!shipId) return;
    startDrag(shipId, true, event);
  }

  function onDocMousemove(e) {
    if (!_drag || !_grid) return;
    _hoveredCell = BattleshipGrid.cellFromPoint(_grid, e.clientX, e.clientY);
    paintDragGhost();
  }

  function onDocMouseup() {
    if (!_drag) return;
    endDrag(true);
  }

  function onDocKeydown(e) {
    if (!_drag) return;
    if (e.key === 'r' || e.key === 'R') {
      _drag.orientation = _drag.orientation === 'horizontal' ? 'vertical' : 'horizontal';
      paintDragGhost();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      endDrag(false);
      e.preventDefault();
    }
  }

  function onReadyClick() {
    const btn = document.getElementById('bs-ready-btn');
    if (!btn || btn.disabled) return;
    if (btn.dataset.action === 'commit') _emit('commitPlacement');
    else if (btn.dataset.action === 'uncommit') _emit('uncommitPlacement');
  }

  // ── geometry helpers ────────────────────────────────────────────────────

  function computeGhostCells(origin, length, orientation) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      if (orientation === 'horizontal') cells.push({ x: origin.x + i, y: origin.y });
      else cells.push({ x: origin.x, y: origin.y + i });
    }
    return cells;
  }

  function isPlacementValid(cells) {
    const w = _state.config.settings.gridWidth;
    const h = _state.config.settings.gridHeight;
    for (const c of cells) {
      if (c.x < 0 || c.x >= w || c.y < 0 || c.y >= h) return false;
    }
    const me = state_meAndOpp().me;
    const occupied = new Set();
    for (const ship of me.ships) {
      if (ship.id === _drag.shipId) continue; // self-overlap allowed (move)
      for (const c of ship.cells) occupied.add(`${c.x},${c.y}`);
    }
    for (const c of cells) {
      if (occupied.has(`${c.x},${c.y}`)) return false;
    }
    return true;
  }

  function state_meAndOpp() {
    const me = _state.players.find((p) => p.userId === _myUserId) || { ships: [], ready: false };
    const opp = _state.players.find((p) => p.userId !== _myUserId);
    return { me, opp };
  }

  return { mount, unmount, update, onEvent };
})();

/**
 * Battleship — firing phase.
 *
 * Two-grid layout:
 *   • Left  — your fleet (your ships visible; opponent shots overlaid)
 *   • Right — opponent's waters (your shots overlaid; sunk opp ships
 *             revealed when they're sunk)
 *
 * Grids stay in fixed positions across turns; the interactive treatment
 * (dim / crosshair cursor / etc.) flips per turn. Per the design sketch,
 * "moving the active grid to center" or swapping per turn reads wrong.
 *
 * ─── Sunk-ship cell cache ──────────────────────────────────────────────────
 * Opponent ship positions are hidden by the server's getStateForPlayer.
 * The only positional reveal is the SHIP_SUNK event, which carries the
 * full cell footprint of the just-sunk ship. We cache those cells locally
 * in _sunkOppCells so the "SUNK" overlay persists across subsequent
 * update() calls.
 *
 * Known limitation: if a player rejoins mid-game after one or more
 * opponent ships have already been sunk, those cells are not in the
 * cache (events don't replay on rejoin) and the renderer paints them
 * as plain hit cells rather than as a sunk-ship overlay. The game
 * remains functionally playable; the cosmetic loss is documented and
 * accepted for v1. Closing the gap requires the server to expose sunk
 * opponent ships' cells, which is out of session-2 scope.
 *
 * Game-over reveal of the loser's full fleet is the same cache: when
 * the winner sinks the 5th opponent ship they've necessarily received 5
 * SHIP_SUNK events during play, so the cache is complete for the winner
 * at game-over. (Traditional Battleship doesn't reveal the winner's
 * fleet to the loser, which matches what the server does — the loser
 * just sees their own grid as-is.)
 */

const BattleshipFiring = (() => {
  let _wrapper = null;
  let _myUserId = null;
  let _emit = null;
  let _state = null;
  let _myGrid = null;
  let _oppGrid = null;
  let _sunkOppCells = new Map(); // shipId → cells[]

  function mount(container, state, myUserId, emit) {
    _myUserId = myUserId;
    _emit = emit;
    _state = state;
    _sunkOppCells = new Map();

    _wrapper = document.createElement('div');
    _wrapper.className = 'bs-firing';

    // Left column — your fleet
    const leftCol = document.createElement('div');
    leftCol.className = 'bs-firing-col';
    const leftStatus = document.createElement('div');
    leftStatus.id = 'bs-left-status';
    leftStatus.className = 'bs-firing-status';
    leftCol.appendChild(leftStatus);
    const leftLabel = document.createElement('h3');
    leftLabel.className = 'bs-section-label';
    leftLabel.textContent = 'Your fleet';
    leftCol.appendChild(leftLabel);
    _myGrid = BattleshipGrid.build(
      state.config.settings.gridWidth,
      state.config.settings.gridHeight,
      { id: 'bs-my-grid', className: 'bs-grid-own' },
    );
    leftCol.appendChild(_myGrid);
    _wrapper.appendChild(leftCol);

    // Right column — opponent waters
    const rightCol = document.createElement('div');
    rightCol.className = 'bs-firing-col';
    const rightStatus = document.createElement('div');
    rightStatus.id = 'bs-right-status';
    rightStatus.className = 'bs-firing-status';
    rightCol.appendChild(rightStatus);
    const rightLabel = document.createElement('h3');
    rightLabel.id = 'bs-opp-label';
    rightLabel.className = 'bs-section-label';
    rightCol.appendChild(rightLabel);
    _oppGrid = BattleshipGrid.build(
      state.config.settings.gridWidth,
      state.config.settings.gridHeight,
      { id: 'bs-opp-grid', className: 'bs-grid-opp', onCellMousedown: onOppGridMousedown },
    );
    rightCol.appendChild(_oppGrid);
    _wrapper.appendChild(rightCol);

    // Game-over banner placeholder
    const banner = document.createElement('div');
    banner.id = 'bs-game-over';
    banner.className = 'bs-game-over';
    banner.style.display = 'none';
    _wrapper.appendChild(banner);

    container.appendChild(_wrapper);
    paintAll();
  }

  function unmount() {
    _wrapper?.remove();
    _wrapper = null;
    _myGrid = null;
    _oppGrid = null;
    _state = null;
    _myUserId = null;
    _emit = null;
    _sunkOppCells = new Map();
  }

  function update(state) {
    _state = state;
    paintAll();
  }

  function onEvent(event, state) {
    _state = state;
    switch (event.type) {
      case 'SHOT_FIRED': {
        // Brief impact flash on the just-hit cell. The PERSISTENT hit
        // marker is painted by paintMyGrid/paintOppGrid from state; this
        // adds a one-time animation class that survives ~250ms. The split
        // is required by the renderer-interface contract: animations
        // belong in onEvent (so they don't replay every update tick).
        if (event.data.result === 'miss') break;
        const onOpp = event.data.shooter !== oppPlayer()?.username;
        const grid = onOpp ? _oppGrid : _myGrid;
        flashCell(grid, event.data.cell, 'bs-cell-hit-flash', 250);
        break;
      }
      case 'SHIP_SUNK': {
        const owner = event.data.owner;
        const shipId = event.data.shipId;
        const cells = event.data.cells;
        const opp = oppPlayer();
        const onOpp = opp && owner === opp.username;
        if (onOpp) {
          // Cells are revealed on sink. Cache so the persistent SUNK
          // overlay survives subsequent state updates (the server hides
          // opp.ships, so this cache is the only place that knows).
          _sunkOppCells.set(shipId, cells);
          UIManager.appendLog(`💥 You sank ${owner}'s ${event.data.shipName}!`, 'game');
        } else {
          UIManager.appendLog(`💥 Your ${event.data.shipName} was sunk!`, 'game');
        }
        paintAll();
        flashCells(onOpp ? _oppGrid : _myGrid, cells, 'bs-cell-sunk-flash', 1000);
        SoundManager.playEliminate();
        break;
      }
      case 'GAME_OVER': {
        SoundManager.playGameOver();
        // Reveal the opponent's full fleet from the GAME_OVER payload.
        // For the winner this is mostly redundant with cells already in
        // _sunkOppCells (they sank all 5), but it fills any gaps caused
        // by mid-game rejoin (SHIP_SUNK events don't replay). For the
        // loser this is the only source — they never received SHIP_SUNK
        // events for the winner's still-floating ships. Static reveal,
        // no flash class — the game's over.
        const opp = oppPlayer();
        const finalFleets = event.data.finalFleets;
        if (opp && finalFleets && Array.isArray(finalFleets[opp.userId])) {
          for (const ship of finalFleets[opp.userId]) {
            _sunkOppCells.set(ship.id, ship.cells);
          }
        }
        const winnerUsername = event.data.winnerUsername;
        const iWon = event.data.winner === _myUserId;
        UIManager.appendLog(
          iWon
            ? `🏆 You win! All of ${opp?.username}'s ships are sunk.`
            : `🏳 ${winnerUsername} wins.`,
          'game',
        );
        paintAll();
        break;
      }
      // TURN_STARTED visuals handled by update().
    }
  }

  /** Add a class to one cell, then remove it after `durationMs`. */
  function flashCell(grid, cell, className, durationMs) {
    if (!grid) return;
    const el = BattleshipGrid.getCell(grid, cell.x, cell.y);
    if (!el) return;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), durationMs);
  }

  /** Add a class to a list of cells, then remove it after `durationMs`. */
  function flashCells(grid, cells, className, durationMs) {
    if (!grid) return;
    for (const c of cells) {
      const el = BattleshipGrid.getCell(grid, c.x, c.y);
      if (el) el.classList.add(className);
    }
    setTimeout(() => {
      for (const c of cells) {
        const el = BattleshipGrid.getCell(grid, c.x, c.y);
        if (el) el.classList.remove(className);
      }
    }, durationMs);
  }

  // ── painting ────────────────────────────────────────────────────────────

  function paintAll() {
    if (!_state || !_myGrid || !_oppGrid) return;
    paintMyGrid();
    paintOppGrid();
    paintStatuses();
    paintGameOver();
  }

  function paintMyGrid() {
    BattleshipGrid.clearClass(_myGrid, 'bs-cell-ship');
    BattleshipGrid.clearClass(_myGrid, 'bs-cell-hit');
    BattleshipGrid.clearClass(_myGrid, 'bs-cell-miss');
    BattleshipGrid.clearClass(_myGrid, 'bs-cell-sunk');
    BattleshipGrid.clearClass(_myGrid, 'bs-cell-sunk-flash');
    const me = mePlayer();
    if (!me) return;

    // Own ships visible
    const sunkShipIds = new Set(me.shipsSunk || []);
    for (const ship of me.ships || []) {
      const isSunk = sunkShipIds.has(ship.id);
      for (const c of ship.cells) {
        const cell = BattleshipGrid.getCell(_myGrid, c.x, c.y);
        if (!cell) continue;
        cell.classList.add('bs-cell-ship');
        if (isSunk) cell.classList.add('bs-cell-sunk');
      }
    }

    // Opponent's shots against me overlay (hit / miss)
    for (const shot of me.shotsReceived || []) {
      const cell = BattleshipGrid.getCell(_myGrid, shot.cell.x, shot.cell.y);
      if (!cell) continue;
      if (shot.result === 'miss') cell.classList.add('bs-cell-miss');
      else cell.classList.add('bs-cell-hit');
    }
  }

  function paintOppGrid() {
    BattleshipGrid.clearClass(_oppGrid, 'bs-cell-hit');
    BattleshipGrid.clearClass(_oppGrid, 'bs-cell-miss');
    BattleshipGrid.clearClass(_oppGrid, 'bs-cell-sunk');
    BattleshipGrid.clearClass(_oppGrid, 'bs-cell-sunk-flash');
    BattleshipGrid.clearClass(_oppGrid, 'bs-cell-shot-disabled');

    const me = mePlayer();
    if (!me) return;

    // Paint sunk-ship cell footprints first so individual shot markers
    // still draw on top of them. The one-time flash class is added by
    // onEvent('SHIP_SUNK') only — not here — so it doesn't restart on
    // every paintAll tick.
    for (const cells of _sunkOppCells.values()) {
      for (const c of cells) {
        const cell = BattleshipGrid.getCell(_oppGrid, c.x, c.y);
        if (!cell) continue;
        cell.classList.add('bs-cell-sunk');
      }
    }

    // Your shots — already-shot cells must be visually distinct and
    // non-clickable.
    for (const shot of me.shotsFired || []) {
      const cell = BattleshipGrid.getCell(_oppGrid, shot.cell.x, shot.cell.y);
      if (!cell) continue;
      cell.classList.add('bs-cell-shot-disabled');
      if (shot.result === 'miss') cell.classList.add('bs-cell-miss');
      else cell.classList.add('bs-cell-hit');
    }

    // Interactive treatment: enable hover crosshair only on my turn,
    // playing status, and only for cells I haven't already shot at.
    const isMyTurn = currentIsMe();
    const playing = _state.status === 'playing';
    _oppGrid.classList.toggle('bs-grid-active', isMyTurn && playing);
    _oppGrid.classList.toggle('bs-grid-inactive', !(isMyTurn && playing));
    _myGrid.classList.toggle('bs-grid-active', !isMyTurn && playing);
    _myGrid.classList.toggle('bs-grid-inactive', isMyTurn || !playing);
  }

  function paintStatuses() {
    const left = document.getElementById('bs-left-status');
    const right = document.getElementById('bs-right-status');
    const oppLabel = document.getElementById('bs-opp-label');
    if (oppLabel) oppLabel.textContent = `${oppPlayer()?.username || 'Opponent'}'s waters`;
    if (!left || !right) return;
    const playing = _state.status === 'playing';
    const finished = _state.status === 'finished';
    if (finished) {
      left.textContent = 'Game over';
      right.textContent = 'Game over';
      return;
    }
    if (!playing) {
      left.textContent = '';
      right.textContent = '';
      return;
    }
    const isMyTurn = currentIsMe();
    const oppName = oppPlayer()?.username || 'Opponent';
    if (isMyTurn) {
      left.textContent = `${oppName}'s fleet is waiting.`;
      right.textContent = `Your shot — click anywhere on ${oppName}'s waters.`;
    } else {
      left.textContent = `${oppName} is firing at you…`;
      right.textContent = `${oppName} is aiming…`;
    }
  }

  function paintGameOver() {
    const banner = document.getElementById('bs-game-over');
    if (!banner) return;
    if (_state.status !== 'finished') {
      banner.style.display = 'none';
      return;
    }
    const iWon = _state.winner === _myUserId;
    const oppName = oppPlayer()?.username || 'Opponent';
    banner.style.display = '';
    banner.innerHTML = '';
    const headline = document.createElement('div');
    headline.className = 'bs-game-over-headline';
    headline.textContent = iWon ? '🏆 You win!' : `🏳 ${oppName} wins`;
    banner.appendChild(headline);
    const sub = document.createElement('div');
    sub.className = 'bs-game-over-sub';
    sub.textContent = iWon
      ? `All of ${oppName}'s ships sunk.`
      : 'Your fleet is gone.';
    banner.appendChild(sub);
  }

  // ── input handlers ──────────────────────────────────────────────────────

  function onOppGridMousedown(_event, x, y) {
    if (_state.status !== 'playing') return;
    if (!currentIsMe()) return;
    const me = mePlayer();
    if (!me) return;
    // Renderer-side visual gate; server is the authority. Pre-empt the
    // server round-trip for cells that have already been targeted.
    if (me.shotsFired.some((s) => s.cell.x === x && s.cell.y === y)) return;
    _emit('fireShot', { cell: { x, y } });
  }

  // ── lookups ─────────────────────────────────────────────────────────────

  function mePlayer() {
    return _state.players.find((p) => p.userId === _myUserId);
  }
  function oppPlayer() {
    return _state.players.find((p) => p.userId !== _myUserId);
  }
  function currentIsMe() {
    const idx = _state.turnState?.currentPlayerIndex;
    if (idx === null || idx === undefined) return false;
    return _state.players[idx]?.userId === _myUserId;
  }

  return { mount, unmount, update, onEvent };
})();

/**
 * Battleship renderer — GameRenderer interface implementation.
 *
 * Self-registers with GameRendererRegistry at module load time.
 * Delegates phase-specific rendering to BattleshipSetup / BattleshipFiring;
 * this module owns the lifecycle and phase routing.
 *
 * ─── Layout responsibility split ───────────────────────────────────────────
 *   renderer.js (this file)
 *     • init / update / onEvent / destroy lifecycle
 *     • Creates the wrapper element (#battleship-wrapper)
 *     • Detects state.turnState.phase changes and remounts the active
 *       phase module
 *     • Clears framework chrome (action-buttons, auction-panel) every
 *       update — Battleship doesn't use them
 *     • Drives the sidebar #action-title with whose-turn / phase text
 *
 *   setup-phase.js     — drag-and-drop ship placement
 *   firing-phase.js    — two-grid shooting, sunk-ship tracking, game over
 *   grid.js            — shared 10×10 grid DOM primitive
 *
 * ─── Phase transition ──────────────────────────────────────────────────────
 * On every update() we compare state.turnState.phase to _lastPhase. If it
 * changed, we unmount the active phase module and mount the new one.
 * No slide animation — the spec listed it as a polish item to skip if it
 * becomes a tar pit; the cross-module DOM swap is the functional change
 * and clean enough on its own.
 *
 * ─── Pre-game ──────────────────────────────────────────────────────────────
 * Like Yahtzee, this renderer is only init'd when state.status === 'playing'
 * (or 'paused' on rejoin) — see client/js/app.js enterGameScreen. The
 * waiting-room view lives in the framework's #waiting-screen.
 */

const BattleshipRenderer = (() => {
  let _myUserId = null;
  let _emit = null;
  let _isSpectator = false;
  let _wrapper = null;
  let _activeModule = null; // BattleshipSetup or BattleshipFiring
  let _lastPhase = null;

  function init(container, state, myUserId, emitAction, options = {}) {
    _myUserId = myUserId;
    _isSpectator = !!options.isSpectator;
    // Spectator-safe emit: every game:action originating from a sub-module
    // (placeShip, fireShot, commitPlacement, …) is swallowed when the
    // local viewer is spectating.  Sub-modules don't need to know they're
    // running for a spectator — their `emit` just no-ops.  The CSS gate
    // below prevents the visual UI (drag-and-drop, grid cell hover) from
    // even appearing interactive, so spectators don't get confused by
    // clicks that animate but don't commit.
    _emit = _isSpectator ? () => {} : emitAction;

    _wrapper = document.createElement('div');
    _wrapper.id = 'battleship-wrapper';
    _wrapper.className = 'battleship-wrapper';
    if (_isSpectator) _wrapper.style.pointerEvents = 'none';
    container.appendChild(_wrapper);

    mountPhase(state);
  }

  function update(state) {
    if (!state?.turnState) return;
    const phase = state.turnState.phase;
    if (phase !== _lastPhase) {
      teardownActiveModule();
      mountPhase(state);
    } else {
      _activeModule?.update?.(state);
    }
    paintSidebarTitle(state);
    clearMonopolyChrome();
  }

  function onEvent(event, state) {
    _activeModule?.onEvent?.(event, state);
    if (event.type === 'ACTION_REJECTED') {
      UIManager.appendLog(`⚠ ${event.data.message}`, 'info');
      if (_wrapper) {
        _wrapper.style.outline = '2px solid #e53935';
        setTimeout(() => {
          if (_wrapper) _wrapper.style.outline = '';
        }, 800);
      }
    }
  }

  function destroy() {
    teardownActiveModule();
    document.getElementById('battleship-wrapper')?.remove();
    _wrapper = null;
    _myUserId = null;
    _emit = null;
    _isSpectator = false;
    _lastPhase = null;
  }

  // ── phase routing ───────────────────────────────────────────────────────

  function mountPhase(state) {
    if (!_wrapper) return;
    _wrapper.innerHTML = '';
    const phase = state.turnState.phase;
    // 'finished' status arrives with phase still === 'firing' (the server
    // doesn't transition phase on game over). Route by phase.
    if (phase === 'setup') {
      _activeModule = BattleshipSetup;
    } else {
      _activeModule = BattleshipFiring;
    }
    _activeModule.mount(_wrapper, state, _myUserId, _emit);
    _lastPhase = phase;
  }

  function teardownActiveModule() {
    _activeModule?.unmount?.();
    _activeModule = null;
  }

  // ── sidebar / framework-chrome glue ─────────────────────────────────────

  function paintSidebarTitle(state) {
    const titleEl = document.getElementById('action-title');
    if (!titleEl) return;
    if (state.status === 'finished') {
      titleEl.textContent = 'Game over';
      return;
    }
    const phase = state.turnState.phase;
    if (phase === 'setup') {
      const me = state.players.find((p) => p.userId === _myUserId);
      const opp = state.players.find((p) => p.userId !== _myUserId);
      if (me?.ready && !opp?.ready) titleEl.textContent = 'Waiting for opponent…';
      else if (me?.ready && opp?.ready) titleEl.textContent = 'Both ready — game starting';
      else titleEl.textContent = 'Place your ships';
      return;
    }
    if (phase === 'firing') {
      const idx = state.turnState.currentPlayerIndex;
      const cur = state.players[idx];
      const isMyTurn = cur?.userId === _myUserId;
      titleEl.textContent = isMyTurn ? 'Your turn — fire!' : `Waiting for ${cur?.username || ''}…`;
      return;
    }
  }

  function clearMonopolyChrome() {
    const buttonsEl = document.getElementById('action-buttons');
    if (buttonsEl) buttonsEl.innerHTML = '';
    const auctionEl = document.getElementById('auction-panel');
    if (auctionEl) auctionEl.style.display = 'none';
  }

  return { init, update, onEvent, destroy };
})();

GameRendererRegistry.register('battleship', BattleshipRenderer);

  return BattleshipRenderer;
};
export const LOGIK = __logik;
export const ANZEIGE = __anzeige;
export const HILFE = "# Battleship\n\n## Overview\n\nBattleship is a two-player game of hidden ship placement and shot-by-shot deduction. Each player has a 10×10 grid and a fleet of five ships. You secretly place your ships, then take turns firing shots at your opponent's grid. The first player to sink the entire enemy fleet wins.\n\nA complete game takes roughly 10–20 minutes. The game has two distinct phases: a **setup** phase where both players place ships in secret, and a **firing** phase where they take turns shooting.\n\n**Spectators welcome** — anyone logged in can watch a Battleship game in progress from the lobby's 👁 Spectate button. Note that spectators see *both* fleets' positions (the suspense is for the players, not the audience).\n\n## Setup — Placing Your Fleet\n\nEach player places five ships on their own 10×10 grid:\n\n| Ship       | Length |\n|------------|--------|\n| Carrier    | 5      |\n| Battleship | 4      |\n| Cruiser    | 3      |\n| Submarine  | 3      |\n| Destroyer  | 2      |\n\nRules for placement:\n\n- Each ship must be placed in a straight horizontal or vertical line. No diagonals or bends.\n- Ships must fit entirely on the grid.\n- Ships cannot overlap each other.\n- Ships are allowed to be adjacent (touch sides or corners).\n\nYou can place ships in any order. Once you've placed all five, lock in your fleet to signal you're ready. The game starts as soon as both players have locked in.\n\nYour fleet stays hidden from your opponent for the entire game. They'll only learn where your ships are by hitting them during the firing phase.\n\n## Firing — Taking Shots\n\nOnce both players are ready, one player is chosen at random to fire first.\n\nOn your turn:\n\n1. Click any unrevealed cell on your opponent's grid.\n2. The result is announced immediately:\n   - **Miss** — no ship was at that cell. The cell is marked with a miss.\n   - **Hit** — your shot landed on one of their ships. The cell is marked with a hit, but you are not told which ship.\n   - **Sunk** — your shot was the final hit on a ship. You are told *which* ship you sank (\"You sank their Cruiser!\"), revealing that ship's length.\n3. The turn passes to your opponent regardless of whether you hit or missed.\n\nYou can also see all your opponent's shots on your own grid in real time, so you always know which cells they've already targeted.\n\n## Winning\n\nA player loses when **every cell of every ship in their fleet has been hit**. The total fleet has 17 cells (5 + 4 + 3 + 3 + 2), so it takes at least 17 perfect hits to finish a game.\n\nWhen the last cell of the last ship is hit, the game ends and the firing player wins.\n\n## Useful to Know\n\n- **One shot per turn, hit or miss.** This implementation does not have the \"extra turn on hit\" house rule. Every shot ends your turn.\n- **No salvo mode.** Each player fires exactly one shot per turn regardless of how many ships they have left.\n- **You don't know which ship you hit** until you sink it. A single Hit could be on any of the five ships, and the only way to learn is to find every cell.\n- **The first-fire choice is random** — neither player picks who goes first.\n- **Your fleet is filtered out of the game state sent to the other player**, so even with developer tools you cannot snoop on their ship positions before they are hit. This is enforced server-side.\n\n## Strategy Hints\n\n- **Hunt mode versus target mode.** When you don't have any open hits to follow up, spread your shots out on a checkerboard pattern. Because the smallest ship is length 2, you can skip every other cell during hunt mode and still guarantee that every ship has at least one cell that a checkerboard pattern hits.\n- **When you score a hit, work outward immediately.** Try the four adjacent cells (up, down, left, right). Once a second hit confirms the ship's orientation, fire along that line until you sink it.\n- **Don't place ships in the corners.** A common pattern, especially against newer players, is to start hunting from the centre — corners are statistically safer, but only slightly. Better to place ships unpredictably than to follow any pattern.\n- **Watch the kill list.** Once your opponent sinks one of your ships, they know its length. Use that information yourself: the moment one of *their* ships sinks, you can rule out cells that couldn't fit the remaining ships.\n";
