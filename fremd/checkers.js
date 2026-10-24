// ERZEUGT von fremd_bauen.py - nicht von Hand aendern.
// Quelle: LAN Games von kbennett2000, MIT-Lizenz (siehe fremd/LICENSE-lan-games.txt), Spiel: checkers
const __configs = {"settings.json": {"boardSize": 8, "piecesPerPlayer": 12, "playerColors": [{"id": "red", "hex": "#e74c3c"}, {"id": "black", "hex": "#2c3e50"}], "playerTokens": ["🔴", "⚫"]}};
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
    name: 'Checkers',
    description:
      'Classic American Checkers — capture all opponent pieces or block them completely.',
    minPlayers: 2,
    maxPlayers: 2,
    icon: '🔴',
    estimatedDurationMinutes: 15,
    complexity: 'light',
    tags: ['classic', 'abstract', 'two-player', 'perfect-information'],
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
    pieceCount: config.settings.piecesPerPlayer,
    active: true,
    connected: true,
  };
}

// ── board helpers ─────────────────────────────────────────────────────────────

function isDarkSquare(row, col) {
  return (row + col) % 2 === 1;
}

function isValidPosition(row, col, size) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function createStartingBoard(size) {
  const board = Array.from({ length: size }, () => Array(size).fill(null));
  const rowsPerSide = (size - 2) / 2; // 3 rows each for 8×8

  // Red pieces: bottom rows (rows 5-7 on 8×8). Red = players[0].
  for (let r = size - rowsPerSide; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isDarkSquare(r, c)) {
        board[r][c] = { color: 'red', king: false };
      }
    }
  }

  // Black pieces: top rows (rows 0-2 on 8×8). Black = players[1].
  for (let r = 0; r < rowsPerSide; r++) {
    for (let c = 0; c < size; c++) {
      if (isDarkSquare(r, c)) {
        board[r][c] = { color: 'black', king: false };
      }
    }
  }

  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function countPieces(board, color) {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.color === color) count++;
    }
  }
  return count;
}

// ── move generation ───────────────────────────────────────────────────────────

function getForwardDirections(color) {
  // Red starts at bottom (high rows), moves toward row 0 (up → dr = -1).
  // Black starts at top (low rows), moves toward row 7 (down → dr = +1).
  return color === 'red' ? [-1] : [1];
}

function getMoveDirections(piece) {
  if (piece.king) return [-1, 1];
  return getForwardDirections(piece.color);
}

function getMovesForPiece(board, row, col) {
  const piece = board[row][col];
  if (!piece) return { steps: [], captures: [] };
  const size = board.length;
  const rowDirs = getMoveDirections(piece);
  const colDirs = [-1, 1];
  const steps = [];
  const captures = [];

  for (const dr of rowDirs) {
    for (const dc of colDirs) {
      const toRow = row + dr;
      const toCol = col + dc;
      if (!isValidPosition(toRow, toCol, size)) continue;

      if (board[toRow][toCol] === null) {
        steps.push({
          from: { row, col },
          to: { row: toRow, col: toCol },
          isCapture: false,
          captures: [],
        });
      } else if (board[toRow][toCol].color !== piece.color) {
        const jumpRow = toRow + dr;
        const jumpCol = toCol + dc;
        if (isValidPosition(jumpRow, jumpCol, size) && board[jumpRow][jumpCol] === null) {
          captures.push({
            from: { row, col },
            to: { row: jumpRow, col: jumpCol },
            isCapture: true,
            captures: [{ row: toRow, col: toCol }],
          });
        }
      }
    }
  }

  return { steps, captures };
}

function getCapturesForPiece(board, row, col) {
  return getMovesForPiece(board, row, col).captures;
}

function getAvailableCaptures(board, color) {
  const size = board.length;
  const allCaptures = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] && board[r][c].color === color) {
        allCaptures.push(...getCapturesForPiece(board, r, c));
      }
    }
  }
  return allCaptures;
}

function getAllValidMoves(board, color) {
  const size = board.length;
  const allCaptures = [];
  const allSteps = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] && board[r][c].color === color) {
        const { steps, captures } = getMovesForPiece(board, r, c);
        allCaptures.push(...captures);
        allSteps.push(...steps);
      }
    }
  }
  // Captures are mandatory — if any exist, only captures are legal.
  return allCaptures.length > 0 ? allCaptures : allSteps;
}

// ── game state queries ────────────────────────────────────────────────────────

function playerColor(state, userId) {
  const p = state.players.find((pl) => pl.userId === userId);
  return p ? p.color : null;
}

function coronationRow(color) {
  // Red moves toward row 0; black moves toward row 7.
  return color === 'red' ? 0 : 7;
}

function checkGameOver(state) {
  const currentColor = state.players[state.turnState.currentPlayerIndex].color;
  const moves = getAllValidMoves(state.board, currentColor);
  if (moves.length === 0) {
    // Current player has no moves → they lose.
    const opponentIdx = (state.turnState.currentPlayerIndex + 1) % 2;
    return state.players[opponentIdx].userId;
  }

  // Check if either player has zero pieces.
  for (const p of state.players) {
    if (countPieces(state.board, p.color) === 0) {
      const winner = state.players.find((pl) => pl.color !== p.color);
      return winner.userId;
    }
  }

  return null;
}

// ── game initialisation ───────────────────────────────────────────────────────

function initGame(gameId, name, players, config) {
  const cfg = config || getConfigCopy();
  const size = cfg.settings.boardSize;
  const board = createStartingBoard(size);

  const captureRequired = getAvailableCaptures(board, 'red').length > 0;

  return {
    id: gameId,
    name,
    gameType: 'checkers',
    stateVersion: STATE_VERSION,
    status: 'playing',
    config: cfg,
    players: players.map((p) => ({ ...p })),
    board,
    turnState: { currentPlayerIndex: 0, phase: 'move' },
    winner: null,
    captureRequired,
    pendingChainPiece: null,
    lastMove: null,
    log: [],
  };
}

// ── turn helpers ──────────────────────────────────────────────────────────────

function getCurrentPlayer(state) {
  if (!state?.turnState || state.status !== 'playing') return null;
  const p = state.players[state.turnState.currentPlayerIndex];
  if (!p) return null;
  return { userId: p.userId, username: p.username };
}

function isTurnTimerBlocked(state) {
  return state?.pendingChainPiece != null;
}

function getValidActions(state, userId) {
  if (state.status !== 'playing') return [];
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) return [];

  const color = playerColor(state, userId);
  if (!color) return [];

  if (state.pendingChainPiece) {
    const captures = getCapturesForPiece(
      state.board,
      state.pendingChainPiece.row,
      state.pendingChainPiece.col,
    );
    return captures.map((m) => `move:${m.from.row},${m.from.col},${m.to.row},${m.to.col}`);
  }

  const moves = getAllValidMoves(state.board, color);
  return moves.map((m) => `move:${m.from.row},${m.from.col},${m.to.row},${m.to.col}`);
}

// ── action descriptors ────────────────────────────────────────────────────────

function getActionDescriptors(state, userId) {
  if (!state || state.status !== 'playing') return [];
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) return [];

  const color = playerColor(state, userId);
  if (!color) return [];

  let moves;
  if (state.pendingChainPiece) {
    moves = getCapturesForPiece(
      state.board,
      state.pendingChainPiece.row,
      state.pendingChainPiece.col,
    );
  } else {
    moves = getAllValidMoves(state.board, color);
  }

  return moves.map((m) => ({
    action: 'move',
    label: m.isCapture ? 'Capture' : 'Move',
    enabled: true,
    hint: m.isCapture
      ? `Jump from (${m.from.row},${m.from.col}) to (${m.to.row},${m.to.col})`
      : `Move from (${m.from.row},${m.from.col}) to (${m.to.row},${m.to.col})`,
    data: {
      from: m.from,
      to: m.to,
      isCapture: m.isCapture,
      captures: m.captures,
    },
  }));
}

// ── actions ───────────────────────────────────────────────────────────────────

function move(state, userId, payload) {
  if (state.status !== 'playing') {
    return { state, events: [], error: 'Game is not in playing state' };
  }
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: 'Not your turn' };
  }

  const { from, to } = payload;
  if (!from || !to) {
    return { state, events: [], error: 'Move requires from and to positions' };
  }

  const size = state.config.settings.boardSize;
  if (!isValidPosition(from.row, from.col, size) || !isValidPosition(to.row, to.col, size)) {
    return { state, events: [], error: 'Position out of bounds' };
  }

  const piece = state.board[from.row][from.col];
  if (!piece) {
    return { state, events: [], error: 'No piece at the source position' };
  }

  const color = playerColor(state, userId);
  if (piece.color !== color) {
    return { state, events: [], error: 'That piece does not belong to you' };
  }

  // If a chain is pending, must move the chain piece.
  if (state.pendingChainPiece) {
    if (from.row !== state.pendingChainPiece.row || from.col !== state.pendingChainPiece.col) {
      return {
        state,
        events: [],
        error: 'You must continue the capture chain with the same piece',
      };
    }
  }

  if (state.board[to.row][to.col] !== null) {
    return { state, events: [], error: 'Destination square is occupied' };
  }

  if (!isDarkSquare(to.row, to.col)) {
    return { state, events: [], error: 'Pieces can only move on dark squares' };
  }

  const rowDiff = to.row - from.row;
  const colDiff = to.col - from.col;

  // Determine if this is a step or a capture.
  const isStep = Math.abs(rowDiff) === 1 && Math.abs(colDiff) === 1;
  const isCapture = Math.abs(rowDiff) === 2 && Math.abs(colDiff) === 2;

  if (!isStep && !isCapture) {
    return { state, events: [], error: 'Invalid move distance' };
  }

  // Direction check: non-king pieces can only move in their forward direction.
  if (!piece.king) {
    const allowedDirs = getForwardDirections(piece.color);
    const dir = rowDiff > 0 ? 1 : -1;
    if (!allowedDirs.includes(dir)) {
      return { state, events: [], error: 'Regular pieces can only move forward' };
    }
  }

  // If in a pending chain, only captures are allowed.
  if (state.pendingChainPiece && !isCapture) {
    return { state, events: [], error: 'You must continue capturing' };
  }

  // Mandatory capture rule: if any capture is available, must capture.
  if (!state.pendingChainPiece && isStep) {
    const allCaptures = getAvailableCaptures(state.board, color);
    if (allCaptures.length > 0) {
      return { state, events: [], error: 'A capture is available — you must take it' };
    }
  }

  // Validate the capture target.
  if (isCapture) {
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;
    const midPiece = state.board[midRow][midCol];
    if (!midPiece) {
      return { state, events: [], error: 'No piece to capture' };
    }
    if (midPiece.color === color) {
      return { state, events: [], error: 'Cannot capture your own piece' };
    }
  }

  // ── Apply the move ──────────────────────────────────────────────────────────

  const newBoard = cloneBoard(state.board);
  const events = [];
  const player = state.players.find((p) => p.userId === userId);

  // Move the piece.
  newBoard[to.row][to.col] = { ...piece };
  newBoard[from.row][from.col] = null;

  events.push({
    type: 'PIECE_MOVED',
    data: { username: player.username, from, to },
    timestamp: Date.now(),
  });

  let capturedAt = null;

  if (isCapture) {
    const midRow = (from.row + to.row) / 2;
    const midCol = (from.col + to.col) / 2;
    capturedAt = { row: midRow, col: midCol };
    newBoard[midRow][midCol] = null;

    events.push({
      type: 'PIECE_CAPTURED',
      data: { username: player.username, capturedAt, by: to },
      timestamp: Date.now(),
    });
  }

  // Check coronation — piece reached the back row.
  let crowned = false;
  if (!newBoard[to.row][to.col].king && to.row === coronationRow(piece.color)) {
    newBoard[to.row][to.col].king = true;
    crowned = true;
    events.push({
      type: 'PIECE_CROWNED',
      data: { username: player.username, position: to },
      timestamp: Date.now(),
    });
  }

  // Update piece counts on players.
  const newPlayers = state.players.map((p) => ({
    ...p,
    pieceCount: countPieces(newBoard, p.color),
  }));

  // Determine if the chain continues.
  let pendingChainPiece = null;
  let advanceTurn = true;

  if (isCapture && !crowned) {
    const furtherCaptures = getCapturesForPiece(newBoard, to.row, to.col);
    if (furtherCaptures.length > 0) {
      pendingChainPiece = { row: to.row, col: to.col };
      advanceTurn = false;
      events.push({
        type: 'CHAIN_CONTINUE',
        data: { piece: to },
        timestamp: Date.now(),
      });
    }
  }

  const lastMove = {
    from,
    to,
    isCapture,
    capturedAt,
    crowned,
    chainContinues: !advanceTurn,
  };

  let nextIdx = state.turnState.currentPlayerIndex;
  if (advanceTurn) {
    nextIdx = (state.turnState.currentPlayerIndex + 1) % state.players.length;
  }

  let newStatus = 'playing';
  let winner = null;

  // Build provisional state to check game-over.
  const provisionalState = {
    ...state,
    board: newBoard,
    players: newPlayers,
    turnState: { ...state.turnState, currentPlayerIndex: nextIdx },
    pendingChainPiece,
  };

  if (advanceTurn) {
    const winnerId = checkGameOver(provisionalState);
    if (winnerId) {
      newStatus = 'finished';
      winner = winnerId;
      const winnerPlayer = newPlayers.find((p) => p.userId === winnerId);
      events.push({
        type: 'GAME_OVER',
        data: { winner: winnerPlayer.username },
        timestamp: Date.now(),
      });
    }
  }

  const nextColor = newPlayers[nextIdx].color;
  const captureRequired =
    newStatus === 'playing' && advanceTurn
      ? getAvailableCaptures(newBoard, nextColor).length > 0
      : pendingChainPiece
        ? true
        : state.captureRequired;

  const logMsg = isCapture
    ? `${player.username} captured a piece${crowned ? ' and was crowned' : ''}${!advanceTurn ? ' — chain continues' : ''}`
    : `${player.username} moved${crowned ? ' and was crowned' : ''}`;

  const newState = {
    ...state,
    board: newBoard,
    status: newStatus,
    winner,
    players: newPlayers,
    turnState: { ...state.turnState, currentPlayerIndex: nextIdx },
    captureRequired,
    pendingChainPiece,
    lastMove,
    log: [
      ...(state.log || []),
      { message: logMsg, type: newStatus === 'finished' ? 'game' : 'move', timestamp: Date.now() },
    ],
  };

  return { state: newState, events };
}

function skipTurn(state, userId) {
  if (state.status !== 'playing') {
    return { state, events: [], error: 'Game is not in playing state' };
  }
  const cur = getCurrentPlayer(state);
  if (!cur || cur.userId !== userId) {
    return { state, events: [], error: "Not this player's turn" };
  }

  const events = [];

  // If mid-chain, abandon it.
  if (state.pendingChainPiece) {
    events.push({
      type: 'CHAIN_ABANDONED',
      data: { username: cur.username, piece: state.pendingChainPiece },
      timestamp: Date.now(),
    });
  }

  const nextIdx = (state.turnState.currentPlayerIndex + 1) % state.players.length;
  const nextColor = state.players[nextIdx].color;
  const captureRequired = getAvailableCaptures(state.board, nextColor).length > 0;

  const newState = {
    ...state,
    turnState: { ...state.turnState, currentPlayerIndex: nextIdx },
    pendingChainPiece: null,
    captureRequired,
    log: [
      ...(state.log || []),
      { message: `${cur.username}'s turn was skipped`, type: 'info', timestamp: Date.now() },
    ],
  };

  events.push({
    type: 'TURN_SKIPPED',
    data: { username: cur.username },
    timestamp: Date.now(),
  });

  return { state: newState, events };
}

// ── applyAction dispatcher ────────────────────────────────────────────────────

function applyAction(state, userId, action, payload = {}) {
  switch (action) {
    case 'move':
      return move(state, userId, payload);
    case 'skipTurn':
      return skipTurn(state, userId);
    default:
      return { state, events: [], error: `Unknown action: ${action}` };
  }
}

// ── migration ─────────────────────────────────────────────────────────────────

function migrate(state) {
  throw new Error(
    `[checkers] No migration path from stateVersion ${state.stateVersion} to ${STATE_VERSION}`,
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
  getStateForPlayer: defaultGetStateForPlayer,
  getActionDescriptors,
  migrate,
};

validateImplementation(module.exports);

  return module.exports;
})();
const __anzeige = (UIManager, SoundManager, GameRendererRegistry, GameState) => {
/**
 * Checkers renderer — GameRenderer interface implementation.
 *
 * Self-registers with GameRendererRegistry at module load time.
 * Implements: init / update / onEvent / destroy
 */

const CheckersRenderer = (() => {

  let _myUserId    = null;
  let _emit        = null;
  let _isSpectator = false;

  // Selection state
  let _selectedPiece = null;  // { row, col } or null
  let _myColor       = null;

  // Animation queue — events are enqueued here and drained sequentially.
  let _animQueue   = [];
  let _animRunning = false;

  // ── init ──────────────────────────────────────────────────────────────────

  function init(container, state, myUserId, emitAction, options = {}) {
    _myUserId    = myUserId;
    _emit        = emitAction;
    _isSpectator = !!options.isSpectator;
    _selectedPiece = null;
    _animQueue   = [];
    _animRunning = false;

    const me = state.players.find(p => p.userId === myUserId);
    _myColor = me ? me.color : null;

    const size = state.config.settings.boardSize;

    const wrapper = document.createElement('div');
    wrapper.id        = 'checkers-wrapper';
    wrapper.className = 'checkers-wrapper';

    // Capture-required banner
    const banner = document.createElement('div');
    banner.id        = 'ck-capture-banner';
    banner.className = 'ck-capture-banner';
    banner.textContent = '⚔️ Captures available — you must capture this turn.';
    wrapper.appendChild(banner);

    // Board grid
    const grid = document.createElement('div');
    grid.id        = 'ck-grid';
    grid.className = 'ck-grid';
    grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    grid.style.gridTemplateRows    = `repeat(${size}, 1fr)`;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        const isDark = (r + c) % 2 === 1;
        cell.className = `ck-cell ${isDark ? 'ck-dark' : 'ck-light'}`;
        cell.id        = `ck-cell-${r}-${c}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        cell.addEventListener('click', () => onCellClick(r, c));
        grid.appendChild(cell);
      }
    }

    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  }

  // ── cell click handler ────────────────────────────────────────────────────

  function onCellClick(row, col) {
    if (_isSpectator) return;
    if (!_lastState || _lastState.status !== 'playing') return;

    const cur = _lastState.players[_lastState.turnState?.currentPlayerIndex];
    if (!cur || cur.userId !== _myUserId) return;

    // During chain: only allow clicking valid chain destinations
    if (_lastState.pendingChainPiece) {
      const dest = _lastDestinations.find(d => d.row === row && d.col === col);
      if (dest) {
        _emit('move', {
          from: _lastState.pendingChainPiece,
          to: { row, col },
        });
      }
      return;
    }

    // If a piece is selected...
    if (_selectedPiece) {
      // Clicking the same piece → deselect
      if (_selectedPiece.row === row && _selectedPiece.col === col) {
        _selectedPiece = null;
        renderSelectionState();
        return;
      }

      // Clicking a valid destination → make move
      const dest = _lastDestinations.find(d => d.row === row && d.col === col);
      if (dest) {
        _emit('move', { from: _selectedPiece, to: { row, col } });
        _selectedPiece = null;
        return;
      }

      // Clicking a different eligible piece → select it instead
      const key = `${row},${col}`;
      if (_lastEligible.has(key)) {
        _selectedPiece = { row, col };
        renderSelectionState();
        return;
      }

      // Clicking anywhere else → ignore
      return;
    }

    // No piece selected: click an eligible piece to select
    const key = `${row},${col}`;
    if (_lastEligible.has(key)) {
      _selectedPiece = { row, col };
      renderSelectionState();
    }
  }

  // ── update ────────────────────────────────────────────────────────────────

  let _lastState        = null;
  let _lastEligible     = new Set();
  let _lastDestinations = [];

  function update(state) {
    if (!state?.board) return;
    _lastState = state;

    const size = state.config.settings.boardSize;

    // Paint pieces
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.getElementById(`ck-cell-${r}-${c}`);
        if (!cell) continue;

        // Remove old piece
        const oldPiece = cell.querySelector('.ck-piece');
        if (oldPiece && !oldPiece.classList.contains('ck-anim-fading')) {
          oldPiece.remove();
        }

        const boardCell = state.board[r][c];
        if (boardCell) {
          // Don't re-add if already present (animation in progress)
          if (!cell.querySelector('.ck-piece:not(.ck-anim-fading)')) {
            const piece = createPieceEl(boardCell);
            cell.appendChild(piece);
          }
        }
      }
    }

    // Compute eligible pieces from action descriptors
    _lastEligible = new Set();
    const descriptors = state.actionDescriptors || [];
    descriptors.forEach(d => {
      if (d.action === 'move') {
        _lastEligible.add(`${d.data.from.row},${d.data.from.col}`);
      }
    });

    // During chain, force-select the chain piece
    if (state.pendingChainPiece) {
      _selectedPiece = { ...state.pendingChainPiece };
    }

    // If selected piece is no longer eligible, deselect
    if (_selectedPiece) {
      const selKey = `${_selectedPiece.row},${_selectedPiece.col}`;
      if (!_lastEligible.has(selKey) && !state.pendingChainPiece) {
        _selectedPiece = null;
      }
    }

    renderSelectionState();

    // Sync action panel
    const cur      = state.players[state.turnState?.currentPlayerIndex];
    const isMyTurn = cur?.userId === _myUserId;
    const playing  = state.status === 'playing';

    const titleEl = document.getElementById('action-title');
    if (titleEl) {
      if (!playing) {
        titleEl.textContent = 'Game over';
      } else if (isMyTurn) {
        if (state.pendingChainPiece) {
          titleEl.textContent = 'Continue your capture chain';
        } else if (state.captureRequired) {
          titleEl.textContent = 'You must capture — select a piece';
        } else {
          titleEl.textContent = 'Your turn — select a piece to move';
        }
      } else {
        titleEl.textContent = `Waiting for ${cur?.username || ''}…`;
      }
    }

    // Clear Monopoly action buttons and auction panel
    const buttonsEl = document.getElementById('action-buttons');
    if (buttonsEl) buttonsEl.innerHTML = '';
    const auctionEl = document.getElementById('auction-panel');
    if (auctionEl) auctionEl.style.display = 'none';

    // Capture banner visibility
    const banner = document.getElementById('ck-capture-banner');
    if (banner) {
      const showBanner = playing && isMyTurn && !_isSpectator && state.captureRequired;
      banner.style.display = showBanner ? '' : 'none';
    }
  }

  // ── selection / highlighting ──────────────────────────────────────────────

  function renderSelectionState() {
    const state = _lastState;
    if (!state) return;
    const size = state.config.settings.boardSize;
    const cur = state.players[state.turnState?.currentPlayerIndex];
    const isMyTurn = cur?.userId === _myUserId;
    const playing = state.status === 'playing';
    const isChain = !!state.pendingChainPiece;

    // Compute destinations for selected piece
    _lastDestinations = [];
    if (_selectedPiece) {
      const descriptors = state.actionDescriptors || [];
      _lastDestinations = descriptors
        .filter(d =>
          d.action === 'move' &&
          d.data.from.row === _selectedPiece.row &&
          d.data.from.col === _selectedPiece.col
        )
        .map(d => d.data.to);
    }

    const destSet = new Set(_lastDestinations.map(d => `${d.row},${d.col}`));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.getElementById(`ck-cell-${r}-${c}`);
        if (!cell) continue;
        const key = `${r},${c}`;
        const piece = cell.querySelector('.ck-piece');

        // Clear all state classes
        cell.classList.remove('ck-dest', 'ck-dest-capture');
        if (piece) {
          piece.classList.remove('ck-eligible', 'ck-capture-eligible', 'ck-selected');
        }

        if (!playing) continue;

        // Destination highlighting
        if (destSet.has(key)) {
          const isCaptureDest = _lastDestinations.some(d =>
            d.row === r && d.col === c
          ) && state.captureRequired;
          cell.classList.add(isCaptureDest ? 'ck-dest-capture' : 'ck-dest');
        }

        if (!piece) continue;

        // Selected piece
        if (_selectedPiece && _selectedPiece.row === r && _selectedPiece.col === c) {
          piece.classList.add('ck-selected');
          continue;
        }

        // Eligible piece highlighting (only for current player, not spectators during chain)
        if ((isMyTurn || _isSpectator) && _lastEligible.has(key) && !isChain) {
          if (state.captureRequired) {
            piece.classList.add('ck-capture-eligible');
          } else {
            piece.classList.add('ck-eligible');
          }
        }
      }
    }

    // Update cursor styles on dark cells
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.getElementById(`ck-cell-${r}-${c}`);
        if (!cell || !cell.classList.contains('ck-dark')) continue;
        const key = `${r},${c}`;

        if (_isSpectator || !playing) {
          cell.style.cursor = 'default';
        } else if (destSet.has(key)) {
          cell.style.cursor = 'pointer';
        } else if (_lastEligible.has(key) && !isChain) {
          cell.style.cursor = 'pointer';
        } else if (_selectedPiece && _selectedPiece.row === r && _selectedPiece.col === c) {
          cell.style.cursor = 'pointer';
        } else {
          cell.style.cursor = 'default';
        }
      }
    }
  }

  // ── piece element creation ────────────────────────────────────────────────

  function createPieceEl(boardCell) {
    const el = document.createElement('div');
    el.className = `ck-piece ck-piece-${boardCell.color}`;
    if (boardCell.king) {
      const crown = document.createElement('span');
      crown.className = 'ck-crown';
      crown.textContent = '👑';
      el.appendChild(crown);
    }
    return el;
  }

  // ── onEvent (animations) ──────────────────────────────────────────────────

  function onEvent(event, state) {
    switch (event.type) {
      case 'PIECE_MOVED':
      case 'PIECE_CAPTURED':
      case 'PIECE_CROWNED':
      case 'CHAIN_CONTINUE':
        _animQueue.push({ event, state });
        drainAnimQueue();
        break;

      case 'ACTION_REJECTED':
        UIManager.appendLog(`⚠ ${event.data.message}`, 'info');
        break;

      case 'GAME_OVER':
        UIManager.appendLog(
          event.data.winner ? `🏆 ${event.data.winner} wins!` : '🤝 Draw!',
          'game'
        );
        SoundManager.playGameOver();
        break;
    }
  }

  // ── animation queue ───────────────────────────────────────────────────────

  function drainAnimQueue() {
    if (_animRunning) return;
    if (_animQueue.length === 0) return;

    _animRunning = true;
    const { event } = _animQueue.shift();

    switch (event.type) {
      case 'PIECE_MOVED':
        animateMove(event.data, () => { _animRunning = false; drainAnimQueue(); });
        break;
      case 'PIECE_CAPTURED':
        animateCapture(event.data, () => { _animRunning = false; drainAnimQueue(); });
        break;
      case 'PIECE_CROWNED':
        animateCrown(event.data, () => { _animRunning = false; drainAnimQueue(); });
        break;
      case 'CHAIN_CONTINUE':
        // Brief pause between chain jumps
        setTimeout(() => { _animRunning = false; drainAnimQueue(); }, 150);
        break;
      default:
        _animRunning = false;
        drainAnimQueue();
    }
  }

  function animateMove(data, done) {
    const { from, to } = data;
    const fromCell = document.getElementById(`ck-cell-${from.row}-${from.col}`);
    const toCell   = document.getElementById(`ck-cell-${to.row}-${to.col}`);
    if (!fromCell || !toCell) { done(); return; }

    const piece = fromCell.querySelector('.ck-piece');
    if (!piece) { done(); return; }

    const fromRect = fromCell.getBoundingClientRect();
    const toRect   = toCell.getBoundingClientRect();
    const dx = toRect.left - fromRect.left;
    const dy = toRect.top  - fromRect.top;

    piece.classList.add('ck-anim-moving');
    piece.style.transform = `translate(${dx}px, ${dy}px)`;
    piece.style.zIndex = '10';

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      piece.removeEventListener('transitionend', settle);
      piece.classList.remove('ck-anim-moving');
      piece.style.transform = '';
      piece.style.zIndex = '';
      piece.remove();
      const oldDest = toCell.querySelector('.ck-piece');
      if (oldDest) oldDest.remove();
      toCell.appendChild(piece);
      done();
    };

    piece.addEventListener('transitionend', settle);
    setTimeout(settle, 500);
  }

  function animateCapture(data, done) {
    const { capturedAt } = data;
    const cell = document.getElementById(`ck-cell-${capturedAt.row}-${capturedAt.col}`);
    if (!cell) { done(); return; }

    const piece = cell.querySelector('.ck-piece');
    if (!piece) { done(); return; }

    piece.classList.add('ck-anim-fading');
    setTimeout(() => {
      piece.remove();
      done();
    }, 400);
  }

  function animateCrown(data, done) {
    const { position } = data;
    const cell = document.getElementById(`ck-cell-${position.row}-${position.col}`);
    if (!cell) { done(); return; }

    const piece = cell.querySelector('.ck-piece');
    if (!piece) { done(); return; }

    // Add crown if not already present
    if (!piece.querySelector('.ck-crown')) {
      const crown = document.createElement('span');
      crown.className = 'ck-crown ck-crown-anim';
      crown.textContent = '👑';
      piece.appendChild(crown);
    }

    piece.classList.add('ck-anim-crowning');
    setTimeout(() => {
      piece.classList.remove('ck-anim-crowning');
      const crown = piece.querySelector('.ck-crown');
      if (crown) crown.classList.remove('ck-crown-anim');
      done();
    }, 600);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy() {
    document.getElementById('checkers-wrapper')?.remove();
    _myUserId      = null;
    _emit          = null;
    _isSpectator   = false;
    _selectedPiece = null;
    _myColor       = null;
    _lastState     = null;
    _lastEligible  = new Set();
    _lastDestinations = [];
    _animQueue     = [];
    _animRunning   = false;
  }

  // ── public API ────────────────────────────────────────────────────────────

  return { init, update, onEvent, destroy };

})();

GameRendererRegistry.register('checkers', CheckersRenderer);

  return CheckersRenderer;
};
export const LOGIK = __logik;
export const ANZEIGE = __anzeige;
export const HILFE = "# Checkers\n\n## Overview\n\nCheckers is a two-player abstract strategy game played on an 8x8 board. One player is **Red**, the other is **Black**. Red moves first. The goal is to capture all of your opponent's pieces or leave them with no legal moves.\n\nA typical game lasts about 15 minutes. The rules are American Checkers (also called English Draughts) — simpler than International Draughts, with no flying kings or backwards captures for regular pieces.\n\n**Spectators welcome** — anyone logged in can watch a Checkers game in progress from the lobby's 👁 Spectate button. Checkers is a perfect-information game, so spectators see everything the players see.\n\n## Setup\n\nNo setup phase. As soon as both players join and the host starts the game, a standard 8x8 board appears with 12 pieces per side. Pieces occupy only the dark squares: Black's 12 pieces fill the first three rows at the top, Red's 12 fill the last three rows at the bottom. The first player to join plays Red and moves first.\n\n## How a Turn Works\n\nOn your turn:\n\n1. Look at the board. Your pieces that have legal moves are highlighted with a subtle glow.\n2. Click one of your highlighted pieces to select it. Valid destination squares light up with markers.\n3. Click a destination to move. The turn passes to your opponent (unless a chain capture is available — see below).\n\nYou can click the selected piece again to deselect it, or click a different eligible piece to switch your selection.\n\n## Movement Rules\n\n- **Regular pieces** move diagonally forward only, one square at a time, onto empty dark squares.\n- **Kings** move diagonally forward **and** backward, one square at a time. Kings do not \"fly\" across multiple squares — this is American Checkers, not International Draughts.\n- **Captures** are diagonal jumps: leap over an adjacent opponent's piece to an empty square beyond it. The jumped piece is removed from the board.\n\n## The Capture Rule\n\nCaptures are mandatory. If you can capture, you must.\n\n- If any of your pieces can make a capture, you are not allowed to make a non-capturing move. The board highlights only the pieces that can capture, and a banner reminds you.\n- **Chain captures**: after a capture, if your piece can immediately capture again from its new position, you must continue jumping. The chain keeps going until no more captures are available. During a chain, you cannot switch to a different piece — you must keep jumping with the same one.\n- **You do not have to take the longest chain.** If multiple captures are available, any one satisfies the requirement. But once you start a chain, you must follow it through.\n- **Coronation ends a chain.** If your piece reaches the back row mid-chain, it is crowned and the chain ends — even if more captures would be available as a king.\n\n## King Coronation\n\nWhen a regular piece reaches the opposite back row (row 0 for Red, row 7 for Black), it is promoted to a king. A crown appears on the piece. Kings are significantly more powerful because they can move and capture in all four diagonal directions.\n\nCoronation happens at the end of the move. If a piece reaches the back row by capturing, the chain ends and the piece is crowned immediately.\n\n## Winning\n\nTwo ways to win:\n\n- **Capture all of your opponent's pieces.** The most common outcome.\n- **Leave your opponent with no legal moves.** If it is their turn and none of their pieces can move (they are all blocked), they lose. Stalemate is a loss, not a draw.\n\nThere is no draw rule in this implementation — no 40-move rule, no threefold repetition, no agreed draws. Every game ends in a win or a loss.\n\n## Useful to Know\n\n- The first player to join the game is Red and moves first.\n- A regular piece can capture a king. Being a king does not make a piece immune to capture.\n- Kings move one square at a time, just like regular pieces. The only difference is that kings can move backward.\n- The board locks once the game ends. Return to the lobby to start a new game.\n\n## Strategy Hints\n\n- **Control the centre.** Pieces in the middle of the board have more move options than pieces on the edges.\n- **Don't rush to the back row.** Advancing all your pieces early leaves gaps behind them. Kings are powerful, but keeping a solid formation matters more in the early game.\n- **Use the forced-capture rule.** Sometimes \"offering\" a piece — deliberately placing it where the opponent must capture — sets up a multi-jump reply that wins more pieces than it costs.\n- **Kings are worth the investment.** A single king behind enemy lines can dominate the endgame. Prioritise crowning when the opportunity is safe.\n- **Watch the edges.** Pieces on the side of the board cannot be jumped from that direction, making them safer but less mobile.\n";
