// ERZEUGT von fremd_bauen.py - nicht von Hand aendern.
// Quelle: LAN Games von kbennett2000, MIT-Lizenz (siehe fremd/LICENSE-lan-games.txt), Spiel: tic-tac-toe
const __configs = {"settings.json": {"boardSize": 3, "winLength": 3, "playerColors": [{"id": "x", "hex": "#3a86ff"}, {"id": "o", "hex": "#e63946"}], "playerTokens": ["✕", "◯"]}};
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
 * Tic-Tac-Toe game-logic module.
 * Implements the GameLogic interface defined in server/src/game-logic-interface.js.
 *
 * State shape:
 *   {
 *     id, name, gameType, createdBy, stateVersion, status, config,
 *     players: [{ userId, username, color, colorHex, token, active, connected }],
 *     board:   (string|null)[][] — [row][col], null = empty, userId = cell owner
 *     turnState: { currentPlayerIndex, phase: 'mark' }
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
    name: 'Tic-Tac-Toe',
    description: 'Mark three in a row to win.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '✕',
    estimatedDurationMinutes: 2,
    complexity: 'light',
    tags: ['no-luck', 'family', 'classic', 'two-player'],
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
  };
}

// ── game initialisation ───────────────────────────────────────────────────────

function initGame(gameId, name, players, config) {
  const cfg = config || getConfigCopy();
  const size = cfg.settings.boardSize;
  const board = Array.from({ length: size }, () => Array(size).fill(null));
  return {
    id: gameId,
    name,
    gameType: 'tic-tac-toe',
    stateVersion: STATE_VERSION,
    status: 'playing',
    config: cfg,
    players: players.map((p) => ({ ...p })),
    board,
    turnState: { currentPlayerIndex: 0, phase: 'mark' },
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
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) return [];
  const size = state.config.settings.boardSize;
  const actions = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (state.board[r][c] === null) actions.push(`markCell:${r},${c}`);
    }
  }
  return actions;
}

// ── win detection ─────────────────────────────────────────────────────────────

function checkWinner(board, row, col, userId, winLength) {
  const size = board.length;
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
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== userId) break;
      count++;
    }
    for (let i = 1; i < winLength; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== userId) break;
      count++;
    }
    if (count >= winLength) return true;
  }
  return false;
}

function isBoardFull(board) {
  for (const row of board) {
    for (const cell of row) {
      if (cell === null) return false;
    }
  }
  return true;
}

// ── actions ───────────────────────────────────────────────────────────────────

function markCell(state, userId, payload) {
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: 'Not your turn' };
  }
  if (state.status !== 'playing') {
    return { state, events: [], error: 'Game is not in playing state' };
  }

  const size = state.config.settings.boardSize;
  const row = Number(payload?.row);
  const col = Number(payload?.col);
  if (
    !Number.isInteger(row) ||
    row < 0 ||
    row >= size ||
    !Number.isInteger(col) ||
    col < 0 ||
    col >= size
  ) {
    return { state, events: [], error: 'Invalid cell coordinates' };
  }
  if (state.board[row][col] !== null) {
    return { state, events: [], error: 'Cell is already marked' };
  }

  const newBoard = state.board.map((r) => [...r]);
  newBoard[row][col] = userId;

  const player = state.players.find((p) => p.userId === userId);
  const events = [
    {
      type: 'CELL_MARKED',
      data: { username: player.username, row, col, token: player.token },
      timestamp: Date.now(),
    },
  ];

  const { winLength } = state.config.settings;
  let newStatus = 'playing';
  let winner = null;
  let logMsg = `${player.username} marked (${row + 1},${col + 1})`;
  let logType = 'move';

  if (checkWinner(newBoard, row, col, userId, winLength)) {
    newStatus = 'finished';
    winner = userId;
    logMsg = `${player.username} wins!`;
    logType = 'game';
    events.push({
      type: 'GAME_OVER',
      data: { winner: player.username },
      timestamp: Date.now(),
    });
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
    case 'markCell':
      return markCell(state, userId, payload);
    case 'skipTurn':
      return skipTurn(state, userId);
    default:
      return { state, events: [], error: `Unknown action: ${action}` };
  }
}

// ── migration ─────────────────────────────────────────────────────────────────

function migrate(state) {
  throw new Error(
    `[tic-tac-toe] No migration path from stateVersion ${state.stateVersion} to ${STATE_VERSION}`,
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
  getGameMetadata,
  loadConfig,
  getConfigCopy,
  // See note in game-logic-interface.js about waiting-room safety.
  getStateForPlayer: defaultGetStateForPlayer,
  migrate,
};

validateImplementation(module.exports);

  return module.exports;
})();
const __anzeige = (UIManager, SoundManager, GameRendererRegistry, GameState) => {
/**
 * Tic-Tac-Toe renderer — GameRenderer interface implementation.
 *
 * Self-registers with GameRendererRegistry at module load time.
 * The framework (app.js, socket-client.js) interacts with this module
 * exclusively through the registry.
 *
 * Implements: init / update / onEvent / destroy
 */

const TicTacToeRenderer = (() => {
  let _myUserId = null;
  let _emit = null;
  let _isSpectator = false;

  // ── init ────────────────────────────────────────────────────────────────────

  function init(container, state, myUserId, emitAction, options = {}) {
    _myUserId = myUserId;
    _emit = emitAction;
    _isSpectator = !!options.isSpectator;

    const size = state.config.settings.boardSize;

    const wrapper = document.createElement('div');
    wrapper.id = 'tic-tac-toe-wrapper';
    wrapper.className = 'tic-tac-toe-wrapper';

    const grid = document.createElement('div');
    grid.id = 'ttt-grid';
    grid.className = 'ttt-grid';
    grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${size}, 1fr)`;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('button');
        cell.className = 'ttt-cell';
        cell.id = `ttt-cell-${r}-${c}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.disabled = true; // update() enables on my turn
        cell.addEventListener('click', () => {
          if (_isSpectator) return;
          if (_emit) _emit('markCell', { row: r, col: c });
        });
        grid.appendChild(cell);
      }
    }
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  }

  // ── update ──────────────────────────────────────────────────────────────────

  function update(state) {
    if (!state?.board) return;
    const size = state.config.settings.boardSize;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.getElementById(`ttt-cell-${r}-${c}`);
        if (!cell) continue;
        const userId = state.board[r][c];
        if (userId) {
          const player = state.players.find((p) => p.userId === userId);
          cell.textContent = player?.token || '?';
          cell.style.color = player?.colorHex || '#888';
          cell.classList.add('filled');
        } else {
          cell.textContent = '';
          cell.style.color = '';
          cell.classList.remove('filled');
        }
      }
    }

    const cur = state.players[state.turnState?.currentPlayerIndex];
    const isMyTurn = cur?.userId === _myUserId;
    const playing = state.status === 'playing';

    const titleEl = document.getElementById('action-title');
    if (titleEl) {
      titleEl.textContent = !playing
        ? 'Game over'
        : isMyTurn
          ? 'Your turn — click an empty cell'
          : `Waiting for ${cur?.username || ''}…`;
    }

    // Clear any leftover Monopoly chrome
    const buttonsEl = document.getElementById('action-buttons');
    if (buttonsEl) buttonsEl.innerHTML = '';
    const auctionEl = document.getElementById('auction-panel');
    if (auctionEl) auctionEl.style.display = 'none';

    // Enable/disable cells: only empty cells, only on my turn, only while
    // playing.  Spectators always see fully-disabled cells (the early-return
    // in the click handler is the security gate; this is the UX gate).
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.getElementById(`ttt-cell-${r}-${c}`);
        if (!cell) continue;
        cell.disabled = _isSpectator || !isMyTurn || !playing || state.board[r][c] !== null;
      }
    }
  }

  // ── onEvent ─────────────────────────────────────────────────────────────────

  function onEvent(event, _state) {
    switch (event.type) {
      case 'ACTION_REJECTED': {
        UIManager.appendLog(`⚠ ${event.data.message}`, 'info');
        const grid = document.getElementById('ttt-grid');
        if (grid) {
          grid.style.outline = '2px solid #e53935';
          setTimeout(() => {
            grid.style.outline = '';
          }, 800);
        }
        break;
      }
      case 'GAME_OVER':
        UIManager.appendLog(
          event.data.winner ? `🏆 ${event.data.winner} wins!` : "🤝 It's a draw!",
          'game',
        );
        SoundManager.playGameOver();
        break;
      // CELL_MARKED, TURN_SKIPPED — silently accepted; update() covers visuals.
    }
  }

  // ── destroy ─────────────────────────────────────────────────────────────────

  function destroy() {
    document.getElementById('tic-tac-toe-wrapper')?.remove();
    _myUserId = null;
    _emit = null;
    _isSpectator = false;
  }

  return { init, update, onEvent, destroy };
})();

GameRendererRegistry.register('tic-tac-toe', TicTacToeRenderer);

  return TicTacToeRenderer;
};
export const LOGIK = __logik;
export const ANZEIGE = __anzeige;
export const HILFE = "# Tic-Tac-Toe\n\n## Overview\n\nTic-Tac-Toe is a two-player game played on a 3×3 grid. One player is **X**, the other is **O**. Players take turns placing their mark in an empty cell. The first player to line up three of their marks in a row, column, or diagonal wins. If every cell is filled and no one has three in a row, the game ends in a draw.\n\nA complete game usually takes less than a minute. It is one of the simplest games on the platform and a good first pick if you are showing a new player how the framework works.\n\n**Spectators welcome** — anyone logged in can watch a Tic-Tac-Toe game in progress from the lobby's 👁 Spectate button.\n\n## Setup\n\nThere is no setup. As soon as both players join and the host starts the game, an empty 3×3 board appears. The first player is assigned **X** and moves first; the second player gets **O**.\n\n## How a Turn Works\n\nOn your turn:\n\n1. Look at the board for empty cells.\n2. Click any empty cell to drop your mark there.\n3. The turn passes immediately to your opponent.\n\nYou cannot place a mark in a cell that already has one. You cannot pass — every turn must place a mark.\n\n## Winning\n\nYou win as soon as you have three of your marks in any straight line:\n\n- Any of the three horizontal rows.\n- Any of the three vertical columns.\n- Either of the two diagonals.\n\nThe game ends the moment a winning line is formed. If all nine cells fill up without anyone forming a line, the result is a **draw**.\n\n## Useful to Know\n\n- The board is locked once the game ends. You will need to return to the lobby and start a new game to play again.\n- There is no time limit on individual turns by default. Take as long as you like.\n- The first move is the strongest — the centre cell gives the most winning lines (four pass through it).\n\n## Strategy Hints\n\nWith perfect play, Tic-Tac-Toe always ends in a draw. A few practical pointers if you want to never lose:\n\n- **Take the centre** if you move first.\n- **Always block** an opponent who has two in a row, before you do anything else.\n- Look for **forks** — a single move that creates two threats at once. Your opponent can only block one of them.\n\nOnce you and your opponent both know these patterns, every game ends in a draw and you should pick a more complex game.\n";
