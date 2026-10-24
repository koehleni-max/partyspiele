// ERZEUGT von fremd_bauen.py - nicht von Hand aendern.
// Quelle: LAN Games von kbennett2000, MIT-Lizenz (siehe fremd/LICENSE-lan-games.txt), Spiel: connect-four
const __configs = {"settings.json": {"boardWidth": 7, "boardHeight": 6, "winLength": 4, "playerColors": [{"id": "red", "hex": "#e53935"}, {"id": "yellow", "hex": "#fdd835"}], "playerTokens": ["🔴", "🟡"]}};
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
 * Connect Four game-logic module.
 * Implements the GameLogic interface defined in server/src/game-logic-interface.js.
 *
 * State shape:
 *   {
 *     id, name, gameType, createdBy, stateVersion, status, config,
 *     players: [{ userId, username, color, colorHex, token, active, connected }],
 *     board:   number[][] — [row][col], null = empty, userId = piece owner
 *              row 0 is the TOP, row (height-1) is the BOTTOM
 *     turnState: { currentPlayerIndex, phase: 'drop' }
 *     winner:  string | null   (userId of winner, or null for draw)
 *     log:     [{ message, type, timestamp }]
 *   }
 */

const fs = require('fs');
const path = require('path');
const {
  validateImplementation,
  defaultGetStateForPlayer,
} = require('../../src/game-logic-interface');

// Bump this whenever the GameState shape changes incompatibly.
// game-manager.js will call migrate() for any saved game whose
// stateVersion doesn't match.
const STATE_VERSION = 1;

const CONFIG_DIR = path.join(__dirname, 'config');
let _config = null;

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
    name: 'Connect Four',
    description: 'Drop pieces to connect four in a row.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🔴',
    estimatedDurationMinutes: 5,
    complexity: 'light',
    tags: ['spatial', 'no-luck', 'family', 'classic', 'two-player'],
  };
}

// ── player creation ───────────────────────────────────────────────────────────

function createInitialPlayer(user, existingPlayers = [], config = null) {
  if (!config?.settings?.playerColors || !config?.settings?.playerTokens) {
    throw new Error(
      'createInitialPlayer requires a config with settings.playerColors and settings.playerTokens',
    );
  }
  const colors = config.settings.playerColors;
  const tokens = config.settings.playerTokens;
  const idx = existingPlayers.length;
  const colorObj = colors[idx] || colors[0];
  return {
    userId: user.id,
    username: user.username,
    color: colorObj.id,
    colorHex: colorObj.hex,
    token: tokens[idx] || colorObj.id,
    active: true,
    connected: true,
  };
}

// ── game initialisation ───────────────────────────────────────────────────────

function initGame(gameId, name, players, config) {
  const cfg = config || getConfigCopy();
  const { boardWidth, boardHeight } = cfg.settings;

  const board = Array.from({ length: boardHeight }, () => Array(boardWidth).fill(null));

  return {
    id: gameId,
    name,
    gameType: 'connect-four',
    stateVersion: STATE_VERSION,
    status: 'playing',
    config: cfg,
    players: players.map((p) => ({ ...p })),
    board,
    turnState: { currentPlayerIndex: 0, phase: 'drop' },
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
  return false; // no phases that block auto-skip
}

function getValidActions(state, userId) {
  if (state.status !== 'playing') return [];
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) return [];
  const { boardWidth } = state.config.settings;
  const actions = [];
  for (let col = 0; col < boardWidth; col++) {
    if (state.board[0][col] === null) actions.push(`dropPiece:${col}`);
  }
  return actions;
}

// ── win detection ─────────────────────────────────────────────────────────────

function checkWinner(board, row, col, userId, winLength) {
  const height = board.length;
  const width = board[0].length;
  // Four directions: horizontal, vertical, diagonal-↘, diagonal-↙
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let i = 1; i < winLength; i++) {
      const r = row + dr * i,
        c = col + dc * i;
      if (r < 0 || r >= height || c < 0 || c >= width || board[r][c] !== userId) break;
      count++;
    }
    for (let i = 1; i < winLength; i++) {
      const r = row - dr * i,
        c = col - dc * i;
      if (r < 0 || r >= height || c < 0 || c >= width || board[r][c] !== userId) break;
      count++;
    }
    if (count >= winLength) return true;
  }
  return false;
}

function isBoardFull(board) {
  return board[0].every((cell) => cell !== null);
}

// ── actions ───────────────────────────────────────────────────────────────────

function dropPiece(state, userId, column) {
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: 'Not your turn' };
  }
  if (state.status !== 'playing') {
    return { state, events: [], error: 'Game is not in playing state' };
  }

  const { boardWidth, boardHeight, winLength } = state.config.settings;
  const col = Number(column);
  if (!Number.isInteger(col) || col < 0 || col >= boardWidth) {
    return { state, events: [], error: 'Invalid column' };
  }

  const newBoard = state.board.map((r) => [...r]);

  // Find the lowest empty row in the column (board[0] = top)
  let row = -1;
  for (let r = boardHeight - 1; r >= 0; r--) {
    if (newBoard[r][col] === null) {
      row = r;
      break;
    }
  }
  if (row === -1) {
    return { state, events: [], error: 'Column is full' };
  }

  newBoard[row][col] = userId;

  const player = state.players.find((p) => p.userId === userId);
  const events = [];
  events.push({
    type: 'PIECE_DROPPED',
    data: { username: player.username, column: col, row },
    timestamp: Date.now(),
  });

  let newStatus = 'playing';
  let winner = null;
  let logMsg = `${player.username} dropped in column ${col + 1}`;
  let logType = 'move';

  if (checkWinner(newBoard, row, col, userId, winLength)) {
    newStatus = 'finished';
    winner = userId;
    logMsg = `${player.username} wins!`;
    logType = 'game';
    events.push({ type: 'GAME_OVER', data: { winner: player.username }, timestamp: Date.now() });
  } else if (isBoardFull(newBoard)) {
    newStatus = 'finished';
    logMsg = "It's a draw!";
    logType = 'game';
    events.push({ type: 'GAME_OVER', data: { winner: null }, timestamp: Date.now() });
  }

  const nextIdx =
    newStatus === 'playing'
      ? (state.turnState.currentPlayerIndex + 1) % state.players.length
      : state.turnState.currentPlayerIndex;

  const newState = {
    ...state,
    board: newBoard,
    status: newStatus,
    winner,
    turnState: { ...state.turnState, currentPlayerIndex: nextIdx },
    log: [...(state.log || []), { message: logMsg, type: logType, timestamp: Date.now() }],
  };

  return { state: newState, events };
}

function skipTurn(state, userId) {
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: "Not this player's turn" };
  }

  const nextIdx = (state.turnState.currentPlayerIndex + 1) % state.players.length;
  const newState = {
    ...state,
    turnState: { ...state.turnState, currentPlayerIndex: nextIdx },
    log: [
      ...(state.log || []),
      { message: `${cur.username}'s turn was skipped`, type: 'info', timestamp: Date.now() },
    ],
  };

  return {
    state: newState,
    events: [{ type: 'TURN_SKIPPED', data: { username: cur.username }, timestamp: Date.now() }],
  };
}

// ── applyAction dispatcher ────────────────────────────────────────────────────

function applyAction(state, userId, action, payload = {}) {
  switch (action) {
    case 'dropPiece':
      return dropPiece(state, userId, payload.column);
    case 'skipTurn':
      return skipTurn(state, userId);
    default:
      return { state, events: [], error: `Unknown action: ${action}` };
  }
}

// ── exports ───────────────────────────────────────────────────────────────────

/**
 * Upgrade a persisted state to the current STATE_VERSION.
 * Add a new `if` branch for each version bump.  See game-logic-interface.js
 * for the full contract.
 *
 * @param   {Object} state  Saved state with stateVersion < STATE_VERSION.
 * @returns {Object}        New state with stateVersion === STATE_VERSION.
 * @throws  {Error}         If no migration path exists for the given version.
 */
function migrate(state) {
  // No structural changes yet — STATE_VERSION 1 is the initial release.
  // Future migrations follow this pattern:
  //
  //   if (state.stateVersion < 2) {
  //     state = { ...state, newField: defaultValue, stateVersion: 2 };
  //   }

  throw new Error(
    `[connect-four] No migration path from stateVersion ${state.stateVersion} to ${STATE_VERSION}`,
  );
}

module.exports = {
  STATE_VERSION,
  initGame,
  createInitialPlayer,
  applyAction,
  skipTurn,
  getCurrentPlayer,
  isTurnTimerBlocked,
  getValidActions,
  getGameMetadata,
  loadConfig,
  getConfigCopy,
  // See note in game-logic-interface.js about waiting-room safety.
  getStateForPlayer: defaultGetStateForPlayer,
  migrate,
};

// Validate interface compliance at load time
validateImplementation(module.exports);

  return module.exports;
})();
const __anzeige = (UIManager, SoundManager, GameRendererRegistry, GameState) => {
/**
 * Connect Four renderer — GameRenderer interface implementation.
 *
 * Self-registers with GameRendererRegistry at module load time.
 * The framework (app.js, socket-client.js) interacts with this module
 * exclusively through the registry; no direct references to this global.
 *
 * Implements: init / update / onEvent / destroy
 */

const ConnectFourRenderer = (() => {

  let _myUserId = null;
  let _emit     = null;
  let _isSpectator = false;

  // ── init ────────────────────────────────────────────────────────────────────

  function init(container, state, myUserId, emitAction, options = {}) {
    _myUserId = myUserId;
    _emit     = emitAction;
    _isSpectator = !!options.isSpectator;

    const { boardWidth, boardHeight } = state.config.settings;

    // Build the entire Connect Four DOM inside the framework-owned container.
    // destroy() removes it; the framework empties the container between game
    // changes as a safety net.
    const wrapper = document.createElement('div');
    wrapper.id        = 'connect-four-wrapper';
    wrapper.className = 'connect-four-wrapper';

    // Column drop buttons (▼ one per column, sits above the grid)
    const colBtns = document.createElement('div');
    colBtns.id        = 'cf-col-buttons';
    colBtns.className = 'cf-col-buttons';
    colBtns.style.gridTemplateColumns = `repeat(${boardWidth}, 1fr)`;

    for (let c = 0; c < boardWidth; c++) {
      const btn = document.createElement('button');
      btn.className   = 'cf-col-btn';
      btn.textContent = '▼';
      btn.dataset.col = String(c);
      btn.disabled    = true; // enabled by update() when it's my turn
      btn.addEventListener('click', () => {
        if (_isSpectator) return;
        if (_emit) _emit('dropPiece', { column: c });
      });
      colBtns.appendChild(btn);
    }
    wrapper.appendChild(colBtns);

    // The grid
    const grid = document.createElement('div');
    grid.id        = 'cf-grid';
    grid.className = 'cf-grid';
    grid.style.gridTemplateColumns = `repeat(${boardWidth}, 1fr)`;

    for (let r = 0; r < boardHeight; r++) {
      for (let c = 0; c < boardWidth; c++) {
        const cell = document.createElement('div');
        cell.className = 'cf-cell';
        cell.id        = `cf-cell-${r}-${c}`;
        grid.appendChild(cell);
      }
    }
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  }

  // ── update ──────────────────────────────────────────────────────────────────

  function update(state) {
    if (!state?.board) return;
    const { boardHeight, boardWidth } = state.config.settings;

    // Paint board cells
    for (let r = 0; r < boardHeight; r++) {
      for (let c = 0; c < boardWidth; c++) {
        const cell = document.getElementById(`cf-cell-${r}-${c}`);
        if (!cell) continue;
        const userId = state.board[r][c];
        if (userId) {
          const player = state.players.find(p => p.userId === userId);
          cell.style.background = player?.colorHex || '#888';
          cell.classList.add('filled');
        } else {
          cell.style.background = '';
          cell.classList.remove('filled');
        }
      }
    }

    // Sync action panel
    const cur      = state.players[state.turnState?.currentPlayerIndex];
    const isMyTurn = cur?.userId === _myUserId;
    const playing  = state.status === 'playing';

    const titleEl = document.getElementById('action-title');
    if (titleEl) {
      titleEl.textContent = !playing
        ? 'Game over'
        : isMyTurn ? 'Your turn — pick a column' : `Waiting for ${cur?.username || ''}…`;
    }

    // Clear Monopoly action buttons and auction panel
    const buttonsEl = document.getElementById('action-buttons');
    if (buttonsEl) buttonsEl.innerHTML = '';
    const auctionEl = document.getElementById('auction-panel');
    if (auctionEl) auctionEl.style.display = 'none';

    // Enable/disable column drop buttons.  Spectators always see disabled
    // columns (the early-return in the click handler is the security gate).
    const colBtns = document.getElementById('cf-col-buttons');
    if (colBtns) {
      colBtns.querySelectorAll('.cf-col-btn').forEach((btn, c) => {
        btn.disabled = _isSpectator || !isMyTurn || !playing || state.board[0]?.[c] !== null;
      });
    }
  }

  // ── onEvent ─────────────────────────────────────────────────────────────────

  function onEvent(event, state) {
    switch (event.type) {
      case 'ACTION_REJECTED': {
        UIManager.appendLog(`⚠ ${event.data.message}`, 'info');
        const actionsEl = document.getElementById('action-buttons');
        if (actionsEl) {
          actionsEl.style.outline = '2px solid #e53935';
          setTimeout(() => { actionsEl.style.outline = ''; }, 1000);
        }
        break;
      }
      case 'GAME_OVER':
        UIManager.appendLog(
          event.data.winner ? `🏆 ${event.data.winner} wins!` : "🤝 It's a draw!", 'game'
        );
        SoundManager.playGameOver();
        break;
      // PIECE_DROPPED — no sound asset yet; silently accepted
      // All other event types are silently ignored per interface contract.
    }
  }

  // ── destroy ─────────────────────────────────────────────────────────────────

  function destroy() {
    document.getElementById('connect-four-wrapper')?.remove();
    _myUserId = null;
    _emit     = null;
    _isSpectator = false;
  }

  // ── public API ───────────────────────────────────────────────────────────────

  return { init, update, onEvent, destroy };

})();

// Self-register with the framework registry.
GameRendererRegistry.register('connect-four', ConnectFourRenderer);

  return ConnectFourRenderer;
};
export const LOGIK = __logik;
export const ANZEIGE = __anzeige;
export const HILFE = "# Connect Four\n\n## Overview\n\nConnect Four is a two-player game played on a vertical board with 7 columns and 6 rows. Each player has a coloured disc — Red goes first, Yellow second. Players take turns dropping discs into columns; each disc falls and stacks on top of whatever is already in that column. The first player to line up **four of their discs in a row** — horizontally, vertically, or diagonally — wins.\n\nA typical game lasts about 5 minutes. The rules are easy to teach but the strategy is much deeper than Tic-Tac-Toe.\n\n**Spectators welcome** — anyone logged in can watch a Connect Four game in progress from the lobby's 👁 Spectate button.\n\n## Setup\n\nNo setup phase. As soon as the host starts the game, both players see an empty 7×6 board. Red moves first.\n\n## How a Turn Works\n\nOn your turn:\n\n1. Look at the seven columns. Any column that is not already full is a legal move.\n2. Click the column you want to play. Your disc drops into that column and settles into the lowest empty cell.\n3. The turn immediately passes to your opponent.\n\nYou cannot choose *where* in the column to drop — gravity always pulls the disc to the lowest open spot. You cannot pass; you must drop a disc every turn.\n\n## Winning\n\nYou win as soon as four of your discs are in a continuous line. The line can run:\n\n- **Horizontally** along one row.\n- **Vertically** up a single column.\n- **Diagonally** in either direction.\n\nThe instant the fourth disc completes a line, the game ends and the winning line is highlighted on the board.\n\nIf all 42 cells fill up and no line of four exists, the game is a **draw**. Draws are uncommon — most games end with a win well before the board is full.\n\n## Useful to Know\n\n- Once a disc is placed, you cannot move it. There are no take-backs.\n- A column with six discs already in it is full; you cannot play there. The board will reject the click.\n- If both players ever sit idle, the game does not auto-resolve — somebody has to make the next move.\n\n## Strategy Hints\n\nA few starter ideas:\n\n- **Play the centre column early.** The centre column is part of more winning lines than any other, so controlling it gives you the most options.\n- **Watch your opponent's threats before your own.** If they have three in a row with an open fourth, you must block — even if it costs you a move you wanted to make.\n- **Think about what you give your opponent.** When you drop a disc, the cell directly above becomes the next move in that column. Avoid setting up a stack that lets them complete a line on top of yours.\n- **Aim for forks** — positions where one of your moves creates two separate threats. Your opponent can only block one, so the other wins.\n\nConnect Four is a solved game with perfect play (Red wins by playing the centre column first), but in practice almost no one plays perfectly, so attentive defence and patient setup go a long way.\n";
