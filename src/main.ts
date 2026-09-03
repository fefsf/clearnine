import { BOARD_SIZE, REGION, findNearestPlacement, pieceFitsAnywhere, type ClearResult } from './game/board';
import { findContinueFor, findContinueGame, Game } from './game/game';
import { getWeeklyMandate, weekKey } from './game/expert';
import { evaluateGoals } from './game/goals';
import { cellCount, colorForPiece, pieceBounds, type PieceDef } from './game/pieces';
import { todayKey } from './game/rng';
import {
  getDailyBest,
  getWeeklyBest,
  loadProfile,
  recordGameFinished,
  recordPlacement,
  reversePlacement,
  saveProfile,
  type GameMode,
  type Profile,
} from './game/stats';
import { applyTheme, isThemeUnlocked, THEMES } from './game/themes';
import { Sfx } from './audio/sfx';
import {
  hapticBad,
  hapticCheer,
  hapticClear,
  hapticPlace,
  hapticTap,
  hapticUndo,
  setHapticsEnabled,
} from './audio/feel';
import {
  askConfirm,
  askUpdateAvailable,
  renderGoals,
  renderHome,
  renderHowTo,
  renderRecords,
  renderSettings,
  renderThemes,
  showSplash,
  showToast,
  showTutorial,
  showUpdateDownloadProgress,
  handleOverlayBack,
  renderBoard,
  transitionScreen,
  type ScreenHandlers,
} from './ui/screens';
import { setStorageFailHandler } from './app/storage';
import { ApkInstaller } from './app/apk-installer';
import { checkForUpdate, skipVersion, snoozeVersion, type UpdateInfo } from './app/update';
import { APP_VERSION } from './app/version';
import { fetchBoard, submitScore, type BoardRow, type BoardTab } from './app/leaderboard';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import './styles.css';

const COLOR_CLASS = (n: number) => `filled-${n}`;
const HINT_IDLE_MS = 12000;

const app = document.querySelector<HTMLDivElement>('#app')!;
const game = new Game();
const sfx = new Sfx();

let profile: Profile = loadProfile();
sfx.muted = profile.mute;
setHapticsEnabled(profile.haptics);
applyTheme(profile.themeId);

let sessionClears = 0;
let hintTimer: ReturnType<typeof setTimeout> | null = null;
let hintSlot: number | null = null;
let cheeredBestThisGame = false;
let displayedScore = 0;
let scoreAnim: number | null = null;
/** True after game-over stats have been written for the current overlay. */
let gameOverFinalized = false;
/** Bumped when leaving play so delayed clear/game-over callbacks no-op. */
let playSessionId = 0;
let clearAnimTimer: ReturnType<typeof setTimeout> | null = null;

function modeTitle(mode: GameMode): string {
  if (mode === 'daily') return game.expert ? 'Expert Daily' : 'Today’s Puzzle';
  if (mode === 'weekly') {
    const name = game.weeklyMandate()?.name ?? getWeeklyMandate(weekKey()).name;
    return `Weekly · ${name}`;
  }
  if (mode === 'blitz') return 'Endgame Sprint';
  return game.expert ? 'Expert Play' : 'Play';
}

function bestTarget(): number {
  if (game.mode === 'daily') return getDailyBest(profile, todayKey(), game.expert);
  if (game.mode === 'weekly') return getWeeklyBest(profile, weekKey());
  if (game.mode === 'blitz') return profile.bestBlitz;
  return game.expert ? profile.bestClassicExpert : profile.bestClassic;
}

const handlers: ScreenHandlers = {
  onClassic: () => void beginMode('classic'),
  onDaily: () => void beginMode('daily'),
  onWeekly: () => void beginMode('weekly'),
  onBlitz: () => void beginMode('blitz'),
  onContinue: () => {
    const info = findContinueGame(profile.expertMode);
    if (!info) {
      showHome();
      return;
    }
    startPlay(info.mode, true, info.expert);
  },
  onRecords: () => showRecords(),
  onGoals: () => showGoals(),
  onThemes: () => showThemes(),
  onHowTo: () => showHowTo(),
  onSettings: () => showSettings(),
  onBoard: () => showBoard(),
  onBackHome: () => showHome(),
  onSelectTheme: (id) => {
    if (!isThemeUnlocked(profile, id)) return;
    profile.themeId = id;
    saveProfile(profile);
    applyTheme(id);
    hapticTap();
    sfx.tap();
    showThemes();
    showToast(`${THEMES.find((t) => t.id === id)?.name ?? id} colors are on`);
  },
  onToggleMute: () => {
    sfx.toggleMute();
    profile.mute = sfx.muted;
    saveProfile(profile);
    hapticTap();
    showSettings();
  },
  onToggleHaptics: () => {
    profile.haptics = !profile.haptics;
    setHapticsEnabled(profile.haptics);
    saveProfile(profile);
    if (profile.haptics) hapticTap();
    showSettings();
  },
  onToggleExpert: () => {
    profile.expertMode = !profile.expertMode;
    saveProfile(profile);
    hapticTap();
    sfx.tap();
    showSettings();
    showToast(
      profile.expertMode
        ? 'Expert Mode on — harder options unlocked'
        : 'Expert Mode off — back to the calm game',
    );
  },
  onToggleLeaderboard: () => {
    if (!profile.leaderboardOn && !profile.leaderboardName.trim()) {
      showToast('Type a leaderboard name first');
      return;
    }
    profile.leaderboardOn = !profile.leaderboardOn;
    saveProfile(profile);
    hapticTap();
    sfx.tap();
    showToast(profile.leaderboardOn ? 'Leaderboard is on — scores can post' : 'Leaderboard is off');
  },
  onSaveLeaderboardName: (name) => {
    profile.leaderboardName = name.replace(/\s+/g, ' ').trim().slice(0, 20);
    saveProfile(profile);
  },
  onCheckUpdate: () => {
    void runUpdateCheck({ force: true, fromSettings: true });
  },
};

async function beginMode(mode: GameMode): Promise<void> {
  const cont = findContinueFor(mode, profile.expertMode);
  if (cont) {
    const ok = await askConfirm(
      mode === 'daily'
        ? 'Start a brand new Today’s Puzzle? Your current puzzle will be cleared.'
        : mode === 'weekly'
          ? `Start a brand new Weekly Mandate (${getWeeklyMandate(weekKey()).name})? Your current board will be cleared.`
          : 'Start a brand new game? Your current board will be cleared.',
    );
    if (!ok) return;
  }
  startPlay(mode, false);
}

type AppView = 'home' | 'play' | 'panel';
let appView: AppView = 'home';

function showHome(): void {
  if (appView === 'play' && !game.gameOver) {
    game.persist();
  }
  stopHintTimer();
  teardownPlayLayout();
  teardownHomeLayout();
  profile = loadProfile();
  appView = 'home';
  transitionScreen(app, () => {
    renderHome(app, profile, handlers, findContinueGame(profile.expertMode));
    setupHomeLayout();
  });
}

function showRecords(): void {
  teardownHomeLayout();
  profile = loadProfile();
  appView = 'panel';
  transitionScreen(app, () => renderRecords(app, profile, handlers));
}

function showGoals(): void {
  teardownHomeLayout();
  profile = loadProfile();
  appView = 'panel';
  transitionScreen(app, () => renderGoals(app, profile, handlers));
}

function showThemes(): void {
  teardownHomeLayout();
  profile = loadProfile();
  appView = 'panel';
  transitionScreen(app, () => renderThemes(app, profile, handlers));
}

function showSettings(): void {
  teardownHomeLayout();
  profile = loadProfile();
  appView = 'panel';
  transitionScreen(app, () => renderSettings(app, profile, handlers));
}

function showHowTo(): void {
  teardownHomeLayout();
  profile = loadProfile();
  appView = 'panel';
  transitionScreen(app, () => renderHowTo(app, handlers, profile.expertMode));
}

let boardTab: BoardTab = 'classic';
let boardFetchId = 0;

function showBoard(): void {
  teardownHomeLayout();
  profile = loadProfile();
  appView = 'panel';
  const tab = boardTab;
  const fetchId = ++boardFetchId;
  const paint = (loading: boolean, error: string | null, rows: BoardRow[]) => {
    if (appView !== 'panel' || fetchId !== boardFetchId) return;
    renderBoard(app, profile, handlers, {
      tab,
      loading,
      error,
      rows,
      onTab: (next) => {
        boardTab = next;
        showBoard();
      },
    });
  };
  paint(true, null, []);
  void fetchBoard(tab, todayKey(), weekKey())
    .then((rows) => paint(false, null, rows))
    .catch(() => paint(false, 'Can’t reach the leaderboard right now.', []));
}

function startPlay(mode: GameMode, resume: boolean, expert = profile.expertMode): void {
  teardownHomeLayout();
  sessionClears = 0;
  cheeredBestThisGame = false;
  gameOverFinalized = false;
  playSessionId += 1;
  const session = playSessionId;
  if (clearAnimTimer) {
    clearTimeout(clearAnimTimer);
    clearAnimTimer = null;
  }
  game.configure(mode, {
    dailyDate: todayKey(),
    week: weekKey(),
    expert,
  });
  appView = 'play';
  transitionScreen(app, () => {
    if (session !== playSessionId) return;
    mountPlayUi(mode);
    if (resume) {
      game.loadOrNew();
    } else {
      game.newGame();
    }
    sessionClears = game.clearsThisGame;
    displayedScore = game.score;
    paintBoard();
    paintTray(true);
    paintHold();
    updateHud(true);
    hideGameOver();
    requestAnimationFrame(() => {
      fitBoardToWrap();
      const wrap = boardEl?.parentElement;
      const wrapH = wrap?.clientHeight ?? 0;
      const starved = wrapH > 0 && wrapH < 220;
      app.classList.toggle('play-compact', starved && profile.expertMode);
      if (starved) {
        requestAnimationFrame(() => fitBoardToWrap());
      }
      boardEl.classList.add('board-enter');
      setTimeout(() => boardEl.classList.remove('board-enter'), 420);
    });
    resetHintTimer();
  });
}

function mountPlayUi(mode: GameMode): void {
  const modeLabel = modeTitle(mode);
  const holdHtml = game.holdEnabled()
    ? `<div class="hold-wrap">
        <div class="hold-slot" id="hold-slot" role="button" tabindex="0" aria-label="Hold piece">
          <span class="hold-label">Hold</span>
          <div class="hold-preview" id="hold-preview"></div>
        </div>
        <p class="hold-hint">Tap a tray piece, then Hold to park it</p>
      </div>`
    : '';
  app.classList.add('play-layout');
  app.innerHTML = `
    <header class="play-top">
      <button type="button" class="text-btn menu-nav-btn" id="home-btn">Menu</button>
      <div class="play-mode" id="mode-badge">${modeLabel}</div>
    </header>

    <div class="score-bar">
      <div class="score-block">
        <span class="score-label">Your score</span>
        <span class="score-value" id="score">0</span>
      </div>
      <div class="score-block">
        <span class="score-label" id="best-label">Best ever</span>
        <span class="score-value" id="best">0</span>
      </div>
    </div>
    <p class="beat-target" id="beat-target" hidden></p>

    <div class="board-wrap">
      <div class="board" id="board" role="grid" aria-label="Puzzle board"></div>
      <div class="combo-banner" id="combo-banner"></div>
      <div class="streak-banner" id="streak-banner"></div>
      <div class="celebrate-banner" id="celebrate-banner"></div>
    </div>

    <p class="tray-label" id="hint">Your pieces — drag one onto the board</p>
    <div class="tray" id="tray" aria-label="Your pieces"></div>
    ${holdHtml}

    <div class="play-toolbar">
      <button type="button" class="tool-btn" id="undo-btn">
        <span class="tool-title">Undo</span>
        <span class="tool-meta" id="undo-meta">3 left</span>
      </button>
      <button type="button" class="tool-btn" id="mute-btn">
        <span class="tool-title" id="mute-title">Sound On</span>
        <span class="tool-meta">Tap to change</span>
      </button>
      <button type="button" class="tool-btn" id="new-btn">
        <span class="tool-title">New Game</span>
        <span class="tool-meta">Start over</span>
      </button>
    </div>

    <div class="drag-ghost" id="drag-ghost"></div>

    <div class="overlay" id="overlay">
      <div class="dialog">
        <h2 id="over-title">Great game!</h2>
        <p id="over-sub">The board is too full for your remaining pieces.</p>
        <p class="final-label">Your score</p>
        <div class="final-score" id="final-score">0</div>
        <p id="best-note"></p>
        <button type="button" class="primary-btn" id="again-btn">Play again</button>
        <button type="button" class="secondary-btn" id="over-undo-btn" hidden>Undo last move</button>
        <button type="button" class="secondary-btn" id="share-btn" hidden>Share score</button>
        <button type="button" class="secondary-btn" id="over-home-btn" data-back>Back to menu</button>
      </div>
    </div>
  `;

  bindPlayDom();
  buildBoard();
  fitBoardToWrap();
  window.addEventListener('resize', fitBoardToWrap);
  window.visualViewport?.addEventListener('resize', fitBoardToWrap);
}

function teardownPlayLayout(): void {
  if (clearAnimTimer) {
    clearTimeout(clearAnimTimer);
    clearAnimTimer = null;
  }
  playSessionId += 1;
  app.classList.remove('play-layout');
  app.classList.remove('play-compact');
  window.removeEventListener('resize', fitBoardToWrap);
  window.visualViewport?.removeEventListener('resize', fitBoardToWrap);
}

/** Keep the square board inside the free space between score and tray. */
function fitBoardToWrap(): void {
  if (!boardEl || !boardEl.isConnected) return;
  const wrap = boardEl.parentElement;
  if (!wrap) return;
  if (app.classList.contains('play-layout') && profile.expertMode) {
    const starved = wrap.clientHeight > 0 && wrap.clientHeight < 220;
    const was = app.classList.contains('play-compact');
    app.classList.toggle('play-compact', starved);
    if (was !== starved) {
      // chrome size changed — remeasure after layout
      requestAnimationFrame(() => {
        if (!boardEl?.isConnected) return;
        const w2 = boardEl.parentElement;
        if (!w2) return;
        const w = w2.clientWidth;
        const h = w2.clientHeight;
        if (w < 40 || h < 40) return;
        const size = Math.floor(Math.min(w, h));
        boardEl.style.width = `${size}px`;
        boardEl.style.height = `${size}px`;
      });
    }
  }
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w < 40 || h < 40) return;
  const size = Math.floor(Math.min(w, h));
  boardEl.style.width = `${size}px`;
  boardEl.style.height = `${size}px`;
  boardEl.style.maxWidth = '100%';
  boardEl.style.maxHeight = '100%';
}

let homeLayoutActive = false;

function setupHomeLayout(): void {
  homeLayoutActive = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fitHomeLayout());
  });
  window.addEventListener('resize', fitHomeLayout);
  window.visualViewport?.addEventListener('resize', fitHomeLayout);
  void document.fonts?.ready?.then(() => {
    if (!homeLayoutActive) return;
    fitHomeLayout();
  });
}

function teardownHomeLayout(): void {
  if (!homeLayoutActive) return;
  homeLayoutActive = false;
  window.removeEventListener('resize', fitHomeLayout);
  window.visualViewport?.removeEventListener('resize', fitHomeLayout);
}

/**
 * Scale home chrome via --home-d so the full menu fits without scrolling.
 * Standard starts roomier; Expert starts tighter; both clamp to viewport.
 */
function fitHomeLayout(): void {
  if (!homeLayoutActive) return;
  const screen = app.querySelector<HTMLElement>('.home-screen');
  const content = app.querySelector<HTMLElement>('.home-content');
  if (!screen || !content) return;

  const expert = screen.dataset.mode === 'expert';
  const base = expert ? 0.94 : 1.06;
  const minD = 0.62;
  const maxD = expert ? 1.02 : 1.12;
  const margin = 6;

  const fits = (d: number): boolean => {
    screen.style.setProperty('--home-d', d.toFixed(3));
    return content.scrollHeight <= screen.clientHeight - margin;
  };

  if (fits(base)) {
    // Grow toward maxD while it still fits (use spare height on tall phones).
    let lo = base;
    let hi = maxD;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    screen.style.setProperty('--home-d', lo.toFixed(3));
  } else {
    // Shrink from base until it fits.
    let lo = minD;
    let hi = base;
    let best = minD;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    screen.style.setProperty('--home-d', best.toFixed(3));
  }

  // Allow a few px of subpixel / font rounding before treating as clipped.
  const overflow = content.scrollHeight - (screen.clientHeight - margin);
  // Scroll fallback only when density floor still cannot fit.
  screen.classList.toggle('home-scroll', overflow > 4);
}

let boardEl: HTMLDivElement;
let trayEl: HTMLDivElement;
let scoreEl: HTMLSpanElement;
let bestEl: HTMLSpanElement;
let bestLabel: HTMLSpanElement;
let beatTargetEl: HTMLParagraphElement;
let muteBtn: HTMLButtonElement;
let muteTitle: HTMLSpanElement;
let newBtn: HTMLButtonElement;
let undoBtn: HTMLButtonElement;
let undoMeta: HTMLSpanElement;
let homeBtn: HTMLButtonElement;
let overlay: HTMLDivElement;
let finalScore: HTMLDivElement;
let bestNote: HTMLParagraphElement;
let againBtn: HTMLButtonElement;
let shareBtn: HTMLButtonElement;
let overHomeBtn: HTMLButtonElement;
let overUndoBtn: HTMLButtonElement;
let dragGhost: HTMLDivElement;
let comboBanner: HTMLDivElement;
let streakBanner: HTMLDivElement;
let celebrateBanner: HTMLDivElement;
let hintEl: HTMLParagraphElement;
let overTitle: HTMLHeadingElement;
let holdSlotBtn: HTMLElement | null = null;
let holdPreview: HTMLDivElement | null = null;
let selectedTrayForHold: number | null = null;
const cells: HTMLDivElement[] = [];

function bindPlayDom(): void {
  boardEl = app.querySelector('#board')!;
  trayEl = app.querySelector('#tray')!;
  scoreEl = app.querySelector('#score')!;
  bestEl = app.querySelector('#best')!;
  bestLabel = app.querySelector('#best-label')!;
  beatTargetEl = app.querySelector('#beat-target')!;
  muteBtn = app.querySelector('#mute-btn')!;
  muteTitle = app.querySelector('#mute-title')!;
  newBtn = app.querySelector('#new-btn')!;
  undoBtn = app.querySelector('#undo-btn')!;
  undoMeta = app.querySelector('#undo-meta')!;
  homeBtn = app.querySelector('#home-btn')!;
  overlay = app.querySelector('#overlay')!;
  finalScore = app.querySelector('#final-score')!;
  bestNote = app.querySelector('#best-note')!;
  againBtn = app.querySelector('#again-btn')!;
  shareBtn = app.querySelector('#share-btn')!;
  overHomeBtn = app.querySelector('#over-home-btn')!;
  overUndoBtn = app.querySelector('#over-undo-btn')!;
  dragGhost = app.querySelector('#drag-ghost')!;
  comboBanner = app.querySelector('#combo-banner')!;
  streakBanner = app.querySelector('#streak-banner')!;
  celebrateBanner = app.querySelector('#celebrate-banner')!;
  hintEl = app.querySelector('#hint')!;
  overTitle = app.querySelector('#over-title')!;
  holdSlotBtn = app.querySelector('#hold-slot');
  holdPreview = app.querySelector('#hold-preview');

  muteBtn.addEventListener('click', () => {
    sfx.toggleMute();
    profile.mute = sfx.muted;
    saveProfile(profile);
    hapticTap();
    updateHud(true);
  });

  const performUndo = (): boolean => {
    const result = game.undo();
    if (!result.ok) return false;
    sessionClears = game.clearsThisGame;
    if (result.placement) {
      reversePlacement(profile, {
        clearCount: result.placement.clearCount,
        cellsCleared: result.placement.cellsCleared,
      });
      saveProfile(profile);
    }
    selectedTrayForHold = null;
    boardEl.classList.add('board-undo');
    sfx.undo();
    hapticUndo();
    paintBoard();
    paintTray(true);
    paintHold();
    updateHud(true);
    setTimeout(() => boardEl.classList.remove('board-undo'), 280);
    resetHintTimer();
    return true;
  };

  undoBtn.addEventListener('click', () => {
    performUndo();
  });

  newBtn.addEventListener('click', () => {
    void (async () => {
      const ok = await askConfirm('Start over? This board will be cleared.');
      if (!ok) return;
      finalizeGameOverIfNeeded();
      startFresh();
    })();
  });

  homeBtn.addEventListener('click', () => {
    finalizeGameOverIfNeeded();
    showHome();
  });
  againBtn.addEventListener('click', () => {
    finalizeGameOverIfNeeded();
    startFresh();
  });
  shareBtn.addEventListener('click', () => void shareRunScore());
  overHomeBtn.addEventListener('click', () => {
    finalizeGameOverIfNeeded();
    showHome();
  });
  overUndoBtn.addEventListener('click', () => {
    if (!performUndo()) return;
    hideGameOver();
    gameOverFinalized = false;
  });

  if (holdSlotBtn) {
    bindHoldDrag(holdSlotBtn);
  }
}

function buildBoard(): void {
  boardEl.innerHTML = '';
  cells.length = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.setAttribute('role', 'gridcell');
      const br = Math.floor(r / REGION);
      const bc = Math.floor(c / REGION);
      if ((br + bc) % 2 === 1) cell.classList.add('region-alt');
      if ((c + 1) % REGION === 0 && c < BOARD_SIZE - 1) cell.classList.add('region-r');
      if ((r + 1) % REGION === 0 && r < BOARD_SIZE - 1) cell.classList.add('region-b');
      boardEl.appendChild(cell);
      cells.push(cell);
    }
  }
}

function cellAt(r: number, c: number): HTMLDivElement {
  return cells[r * BOARD_SIZE + c]!;
}

function paintBoard(): void {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = cellAt(r, c);
      const v = game.board[r]![c]!;
      cell.className = 'cell';
      const br = Math.floor(r / REGION);
      const bc = Math.floor(c / REGION);
      if ((br + bc) % 2 === 1) cell.classList.add('region-alt');
      if ((c + 1) % REGION === 0 && c < BOARD_SIZE - 1) cell.classList.add('region-r');
      if ((r + 1) % REGION === 0 && r < BOARD_SIZE - 1) cell.classList.add('region-b');
      if (v > 0) cell.classList.add(COLOR_CLASS(v));
    }
  }
}

function piecePreviewHtml(piece: PieceDef, cellPx: number, gapPx = 3): string {
  const { rows, cols } = pieceBounds(piece.cells);
  const color = colorForPiece(piece);
  const occupied = new Set(piece.cells.map(({ r, c }) => `${r},${c}`));
  let html = `<div class="piece-preview" style="grid-template-columns:repeat(${cols}, ${cellPx}px); gap:${gapPx}px; --pc-size:${cellPx}px">`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occupied.has(`${r},${c}`)) {
        html += `<div class="pc c${color}"></div>`;
      } else {
        html += `<div class="pc" style="visibility:hidden"></div>`;
      }
    }
  }
  html += '</div>';
  return html;
}

function previewCellPx(
  host: HTMLElement,
  cols: number,
  rows: number,
  fallback: number,
  minPx = 10,
): number {
  const w = host.clientWidth;
  const h = host.clientHeight;
  if (w < 16 || h < 16) return Math.min(fallback, minPx);
  const gap = 2;
  const pad = 4;
  const byW = Math.floor((w - pad - gap * Math.max(0, cols - 1)) / Math.max(1, cols));
  const byH = Math.floor((h - pad - gap * Math.max(0, rows - 1)) / Math.max(1, rows));
  return Math.max(minPx, Math.min(fallback, byW, byH));
}

function paintTray(animateIn = false): void {
  trayEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement('div');
    slot.className = 'tray-slot';
    slot.dataset.index = String(i);
    const piece = game.tray[i];
    if (!piece) {
      slot.classList.add('empty');
      trayEl.appendChild(slot);
      continue;
    }
    trayEl.appendChild(slot);
    const { rows, cols } = pieceBounds(piece.cells);
    const fallback = cols >= 5 ? 16 : cols >= 4 ? 20 : 24;
    const cellPx = previewCellPx(slot, cols, rows, fallback);
    slot.innerHTML = piecePreviewHtml(piece, cellPx);
    bindDrag(slot, i);
    if (hintSlot === i) slot.classList.add('hint-pulse');
    if (selectedTrayForHold === i) slot.classList.add('hold-selected');
    if (animateIn) {
      slot.classList.add('tray-in');
      slot.style.animationDelay = `${i * 70}ms`;
    }
  }
}

function paintHold(): void {
  if (!holdPreview || !holdSlotBtn) return;
  holdSlotBtn.classList.toggle('has-piece', !!game.hold);
  holdSlotBtn.classList.toggle('awaiting', selectedTrayForHold !== null);
  const holdLabel = holdSlotBtn.querySelector('.hold-label');
  if (holdLabel) {
    if (selectedTrayForHold !== null) {
      holdLabel.textContent = game.hold ? 'Swap' : 'Park';
    } else if (game.hold) {
      holdLabel.textContent = 'Drag';
    } else {
      holdLabel.textContent = 'Hold';
    }
  }
  if (selectedTrayForHold !== null) {
    holdSlotBtn.setAttribute(
      'aria-label',
      game.hold ? 'Swap with parked piece' : 'Park selected piece',
    );
  } else if (game.hold) {
    holdSlotBtn.setAttribute('aria-label', 'Drag parked piece onto the board');
  } else {
    holdSlotBtn.setAttribute('aria-label', 'Hold piece');
  }
  const holdHint = app.querySelector('.hold-hint');
  if (holdHint) {
    if (selectedTrayForHold !== null) {
      holdHint.textContent = game.hold
        ? 'Tap Hold to swap with the parked piece'
        : 'Tap Hold to park it';
    } else if (game.hold) {
      holdHint.textContent = 'Drag this piece onto the board — or tap a tray piece to swap';
    } else {
      holdHint.textContent = 'Tap a tray piece, then Hold to park it';
    }
  }
  if (!game.hold) {
    holdPreview.innerHTML = '<span class="hold-empty">+</span>';
    return;
  }
  const { rows, cols } = pieceBounds(game.hold.cells);
  const fallback = cols >= 5 || rows >= 4 ? 10 : cols >= 4 || rows >= 3 ? 12 : 14;
  const cellPx = previewCellPx(holdPreview, cols, rows, fallback, 6);
  holdPreview.innerHTML = piecePreviewHtml(game.hold, cellPx, 2);
}

function animateScoreTo(target: number): void {
  if (scoreAnim) cancelAnimationFrame(scoreAnim);
  const start = displayedScore;
  const delta = target - start;
  if (delta === 0) {
    scoreEl.textContent = String(target);
    return;
  }
  const t0 = performance.now();
  const dur = Math.min(520, 180 + Math.abs(delta) * 2);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / dur);
    const eased = 1 - (1 - t) * (1 - t);
    displayedScore = Math.round(start + delta * eased);
    scoreEl.textContent = String(displayedScore);
    if (t < 1) scoreAnim = requestAnimationFrame(step);
    else {
      displayedScore = target;
      scoreEl.textContent = String(target);
      scoreEl.classList.remove('score-pulse');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('score-pulse');
      scoreAnim = null;
    }
  };
  scoreAnim = requestAnimationFrame(step);
}

function updateHud(snapScore = false): void {
  if (snapScore) {
    displayedScore = game.score;
    scoreEl.textContent = String(game.score);
  } else {
    animateScoreTo(game.score);
  }
  const target = bestTarget();
  if (game.mode === 'daily') {
    bestLabel.textContent = game.expert ? 'Expert best' : 'Best today';
  } else if (game.mode === 'weekly') {
    bestLabel.textContent = 'Week best';
  } else if (game.mode === 'blitz') {
    bestLabel.textContent = 'Sprint best';
  } else {
    bestLabel.textContent = game.expert ? 'Expert best' : 'Best ever';
  }
  bestEl.textContent = String(Math.max(target, game.score));

  if (game.expert && target > 0) {
    beatTargetEl.hidden = false;
    const remain = Math.max(0, target + 1 - game.score);
    beatTargetEl.textContent =
      remain === 0 ? 'You’re at your best — keep going!' : `Beat your best: ${target} · ${remain} to go`;
  } else {
    beatTargetEl.hidden = true;
  }

  muteTitle.textContent = sfx.muted ? 'Sound Off' : 'Sound On';
  undoBtn.disabled = !game.canUndo();
  undoBtn.classList.toggle('disabled', !game.canUndo());
  undoMeta.textContent = `${game.undosLeft} left`;
  if (hintSlot === null) {
    hintEl.textContent = game.holdEnabled()
      ? 'Drag a piece — or tap one, then Hold to park it'
      : 'Your pieces — drag one onto the board';
    hintEl.classList.remove('hint-active');
  }
}

function stopHintTimer(): void {
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
}

function clearHintHighlight(): void {
  hintSlot = null;
  if (trayEl) {
    trayEl.querySelectorAll('.hint-pulse').forEach((el) => el.classList.remove('hint-pulse'));
  }
  holdSlotBtn?.classList.remove('hint-pulse');
  if (hintEl) {
    hintEl.textContent = game.holdEnabled()
      ? 'Your pieces — drag one, or tap then Hold to park'
      : 'Your pieces — drag one onto the board';
    hintEl.classList.remove('hint-active');
  }
}

function resetHintTimer(): void {
  stopHintTimer();
  clearHintHighlight();
  if (game.gameOver) return;
  hintTimer = setTimeout(() => showStuckHint(), HINT_IDLE_MS);
}

function findHintSlot(): number | null {
  let best: { index: number; size: number } | null = null;
  for (let i = 0; i < game.tray.length; i++) {
    const piece = game.tray[i];
    if (!piece) continue;
    if (!pieceFitsAnywhere(game.board, piece)) continue;
    const size = cellCount(piece.cells);
    if (!best || size < best.size) best = { index: i, size };
  }
  return best?.index ?? null;
}

function holdFitsAnywhere(): boolean {
  return !!game.hold && pieceFitsAnywhere(game.board, game.hold);
}

function showStuckHint(): void {
  if (game.gameOver || drag) return;
  const index = findHintSlot();
  if (index !== null) {
    hintSlot = index;
    paintTray();
    hintEl.textContent = 'Try the glowing piece — drag it onto the board';
    hintEl.classList.add('hint-active');
    return;
  }
  if (game.holdEnabled() && holdFitsAnywhere()) {
    hintSlot = null;
    paintTray();
    paintHold();
    holdSlotBtn?.classList.add('hint-pulse');
    hintEl.textContent = 'Your Hold piece still fits — drag it onto the board';
    hintEl.classList.add('hint-active');
  }
}

function maybeCheerNewBest(): void {
  if (cheeredBestThisGame) return;
  const target = bestTarget();
  if (game.score <= target) return;
  cheeredBestThisGame = true;
  flashCelebrate('New personal best!');
  sfx.cheer();
  hapticCheer();
  spawnConfetti();
  showToast('You beat your best score!');
}

function flashCelebrate(text: string): void {
  celebrateBanner.textContent = text;
  celebrateBanner.classList.remove('show');
  void celebrateBanner.offsetWidth;
  celebrateBanner.classList.add('show');
}

function checkAndToastGoals(): void {
  const newly = evaluateGoals(profile);
  if (newly.length) {
    saveProfile(profile);
    for (const g of newly) {
      showToast(`Trophy: ${g.title}`);
      if (g.unlocksTheme) {
        showToast(`Theme unlocked: ${g.unlocksTheme}`);
      }
    }
  }
}

function onGameOver(): void {
  stopHintTimer();
  clearHintHighlight();
  selectedTrayForHold = null;

  const canUndoLast = game.canUndo();
  overUndoBtn.hidden = !canUndoLast;
  if (canUndoLast) {
    overUndoBtn.textContent = `Undo last move (${game.undosLeft} left)`;
  }

  overTitle.textContent = 'Great game!';
  finalScore.textContent = String(game.score);
  bestNote.textContent = `${bestLabel.textContent}: ${bestTarget()}`;
  shareBtn.hidden = !game.expert;
  overlay.classList.add('show', 'overlay-pop');

  // If no undo left, lock in stats now. Otherwise wait until they leave or play again.
  if (!canUndoLast) {
    finalizeGameOverIfNeeded();
  } else {
    sfx.gameOver();
    if (game.mode === 'daily') showToast('Daily puzzle finished');
  }
}

function finalizeGameOverIfNeeded(): void {
  if (gameOverFinalized || !game.gameOver) return;
  gameOverFinalized = true;
  const result = recordGameFinished(profile, {
    mode: game.mode,
    score: game.score,
    cleared: sessionClears,
    week: game.mode === 'weekly' ? game.periodKey : undefined,
    date: game.mode === 'daily' ? game.periodKey : undefined,
    expert: game.expert,
  });
  saveProfile(profile);
  checkAndToastGoals();

  const isBest =
    result.newClassicBest ||
    result.newDailyBest ||
    result.newWeeklyBest ||
    result.newBlitzBest;
  if (isBest) {
    overTitle.textContent = 'New personal best!';
    bestNote.textContent = 'That’s a new personal best — amazing!';
    sfx.cheer();
    hapticCheer();
  } else {
    sfx.gameOver();
  }
  if (game.mode === 'daily') showToast('Daily puzzle finished');
  void maybeSubmitBoardScore();
}

async function maybeSubmitBoardScore(): Promise<void> {
  if (!profile.leaderboardOn) return;
  const name = profile.leaderboardName.trim();
  if (!name || game.score < 1) return;
  const periodKey =
    game.mode === 'daily' || game.mode === 'weekly' ? game.periodKey : '';
  try {
    const result = await submitScore({
      name,
      mode: game.mode,
      expert: game.expert,
      score: game.score,
      cleared: sessionClears,
      periodKey,
    });
    if (result.improved && result.rank) {
      showToast(`Leaderboard rank #${result.rank}`);
    } else if (result.ok) {
      showToast('Leaderboard already has this best');
    }
  } catch {
    showToast('Could not reach the leaderboard');
  }
}

function startFresh(): void {
  hideGameOver();
  sessionClears = 0;
  cheeredBestThisGame = false;
  gameOverFinalized = false;
  selectedTrayForHold = null;
  game.newGame();
  displayedScore = 0;
  paintBoard();
  paintTray(true);
  paintHold();
  updateHud(true);
  fitBoardToWrap();
  boardEl.classList.add('board-enter');
  setTimeout(() => boardEl.classList.remove('board-enter'), 420);
  resetHintTimer();
}

function showGameOver(): void {
  onGameOver();
}

function hideGameOver(): void {
  overlay.classList.remove('show', 'overlay-pop');
}

async function shareRunScore(): Promise<void> {
  const text = `ClearNine ${modeTitle(game.mode)}: ${game.score} points${game.expert ? ' · Expert' : ''} · v${APP_VERSION}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'ClearNine', text });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Score copied');
  } catch {
    showToast(text);
  }
}

function spawnClearSparks(cellsList: { r: number; c: number }[]): void {
  const layer = document.createElement('div');
  layer.className = 'spark-layer';
  boardEl.appendChild(layer);
  for (const { r, c } of cellsList) {
    const cell = cellAt(r, c);
    const rect = cell.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      const spark = document.createElement('span');
      spark.className = 'spark';
      const x = rect.left - boardRect.left + rect.width / 2 + (Math.random() - 0.5) * 12;
      const y = rect.top - boardRect.top + rect.height / 2 + (Math.random() - 0.5) * 12;
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.style.setProperty('--sx', `${(Math.random() - 0.5) * 36}px`);
      spark.style.setProperty('--sy', `${-12 - Math.random() * 28}px`);
      layer.appendChild(spark);
    }
  }
  setTimeout(() => layer.remove(), 500);
}

function playClearSweeps(clears: ClearResult): void {
  const layer = document.createElement('div');
  layer.className = 'sweep-layer';
  boardEl.appendChild(layer);
  const boardRect = boardEl.getBoundingClientRect();
  let bandIndex = 0;

  const addBand = (
    className: string,
    left: number,
    top: number,
    width: number,
    height: number,
  ): void => {
    const band = document.createElement('div');
    band.className = `sweep-band ${className}`;
    band.style.left = `${left}px`;
    band.style.top = `${top}px`;
    band.style.width = `${width}px`;
    band.style.height = `${height}px`;
    band.style.animationDelay = `${bandIndex * 45}ms`;
    layer.appendChild(band);
    bandIndex += 1;
  };

  for (const r of clears.rows) {
    const a = cellAt(r, 0).getBoundingClientRect();
    const b = cellAt(r, BOARD_SIZE - 1).getBoundingClientRect();
    addBand(
      'sweep-row',
      a.left - boardRect.left,
      a.top - boardRect.top,
      b.right - a.left,
      a.height,
    );
  }

  for (const c of clears.cols) {
    const a = cellAt(0, c).getBoundingClientRect();
    const b = cellAt(BOARD_SIZE - 1, c).getBoundingClientRect();
    addBand(
      'sweep-col',
      a.left - boardRect.left,
      a.top - boardRect.top,
      a.width,
      b.bottom - a.top,
    );
  }

  for (const { br, bc } of clears.regions) {
    const a = cellAt(br * REGION, bc * REGION).getBoundingClientRect();
    const b = cellAt(
      br * REGION + REGION - 1,
      bc * REGION + REGION - 1,
    ).getBoundingClientRect();
    addBand(
      'sweep-box',
      a.left - boardRect.left,
      a.top - boardRect.top,
      b.right - a.left,
      b.bottom - a.top,
    );
  }

  setTimeout(() => layer.remove(), 560 + bandIndex * 45);
}

/** Cascade clear cells from centroid outward (ms delay per cell). */
function clearCascadeDelays(
  cellsList: { r: number; c: number }[],
): Map<string, number> {
  const delays = new Map<string, number>();
  if (cellsList.length === 0) return delays;
  const cr =
    cellsList.reduce((s, x) => s + x.r, 0) / cellsList.length;
  const cc =
    cellsList.reduce((s, x) => s + x.c, 0) / cellsList.length;
  let maxDist = 0.001;
  const dists = cellsList.map(({ r, c }) => {
    const d = Math.hypot(r - cr, c - cc);
    maxDist = Math.max(maxDist, d);
    return d;
  });
  cellsList.forEach(({ r, c }, i) => {
    delays.set(`${r},${c}`, Math.round((dists[i]! / maxDist) * 240));
  });
  return delays;
}

function spawnConfetti(): void {
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  document.body.appendChild(layer);
  const colors = ['var(--accent)', 'var(--accent-warm)', 'var(--c1)', '#fff'];
  for (let i = 0; i < 28; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti-bit';
    bit.style.left = `${10 + Math.random() * 80}%`;
    bit.style.setProperty('--fall', `${55 + Math.random() * 40}vh`);
    bit.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    bit.style.setProperty('--delay', `${Math.random() * 0.25}s`);
    bit.style.background = colors[i % colors.length]!;
    layer.appendChild(bit);
  }
  setTimeout(() => layer.remove(), 1600);
}

function shakeBoard(): void {
  boardEl.classList.remove('board-shake');
  void boardEl.offsetWidth;
  boardEl.classList.add('board-shake');
  setTimeout(() => boardEl.classList.remove('board-shake'), 360);
}

function landPiece(piece: PieceDef, row: number, col: number): void {
  const n = cellCount(piece.cells);
  const weight = n <= 1 ? 'land-light' : n >= 5 ? 'land-heavy' : 'land-mid';
  for (const { r, c } of piece.cells) {
    const cell = cellAt(row + r, col + c);
    cell.classList.remove('land-pop', 'land-light', 'land-mid', 'land-heavy');
    void cell.offsetWidth;
    cell.classList.add('land-pop', weight);
  }
}

let weatherFadeTimer: ReturnType<typeof setTimeout> | null = null;

function syncBoardWeather(combo: number, streak: number, cleared: boolean): void {
  if (weatherFadeTimer) {
    clearTimeout(weatherFadeTimer);
    weatherFadeTimer = null;
  }
  boardEl.classList.remove(
    'weather-combo-2',
    'weather-combo-3',
    'weather-streak',
    'board-combo-flash',
    'board-streak-ring',
  );
  if (!cleared) return;

  if (combo >= 3) boardEl.classList.add('weather-combo-3');
  else if (combo >= 2) boardEl.classList.add('weather-combo-2');
  if (streak >= 2) boardEl.classList.add('weather-streak');

  // Flash vignette / ring briefly; keep ambient weather while streak lives
  void boardEl.offsetWidth;
  if (combo >= 2) boardEl.classList.add('board-combo-flash');
  if (streak >= 2) boardEl.classList.add('board-streak-ring');
  setTimeout(() => {
    boardEl.classList.remove('board-combo-flash', 'board-streak-ring');
  }, 700);

  if (streak < 2) {
    weatherFadeTimer = setTimeout(() => {
      boardEl.classList.remove('weather-combo-2', 'weather-combo-3');
      weatherFadeTimer = null;
    }, 1200);
  }
}

function flashBanners(combo: number, streak: number, cleared: boolean): void {
  if (!cleared) {
    syncBoardWeather(0, 0, false);
    return;
  }

  syncBoardWeather(combo, streak, true);

  if (combo >= 2) {
    comboBanner.textContent = `Combo ×${combo}!`;
    comboBanner.classList.remove('show', 'combo-big');
    void comboBanner.offsetWidth;
    comboBanner.classList.add('show');
    if (combo >= 3) comboBanner.classList.add('combo-big');
    flashCelebrate(combo >= 3 ? 'Amazing!' : 'Nice!');
  } else {
    flashCelebrate('Nice!');
  }

  if (streak >= 2) {
    streakBanner.textContent = `Streak ×${streak}`;
    streakBanner.classList.remove('show');
    void streakBanner.offsetWidth;
    streakBanner.classList.add('show');
  }
}

function showScorePop(points: number, clientX: number, clientY: number): void {
  if (points <= 0) return;
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = `+${points}`;
  el.style.left = `${clientX}px`;
  el.style.top = `${clientY}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function clearGhostHighlight(): void {
  for (const cell of cells) {
    cell.classList.remove('ghost-ok', 'ghost-bad', 'ghost-snap');
  }
  dragGhost.classList.remove('ghost-valid', 'ghost-invalid');
}

function highlightGhost(
  piece: PieceDef,
  row: number,
  col: number,
  valid: boolean,
): void {
  clearGhostHighlight();
  dragGhost.classList.add(valid ? 'ghost-valid' : 'ghost-invalid');
  for (const { r, c } of piece.cells) {
    const br = row + r;
    const bc = col + c;
    if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) continue;
    const cell = cellAt(br, bc);
    cell.classList.add(valid ? 'ghost-ok' : 'ghost-bad');
    if (valid) cell.classList.add('ghost-snap');
  }
}

type DragState = {
  /** -1 means placing from Hold. */
  trayIndex: number;
  piece: PieceDef;
  pointerId: number;
  cellPx: number;
  gapPx: number;
  liftPx: number;
  moved: boolean;
  startX: number;
  startY: number;
};

/** Finger must travel this far before a gesture counts as a drag-to-place. */
const DRAG_THRESHOLD_PX = 18;

let drag: DragState | null = null;
let lastTrailAt = 0;

function spawnDragTrail(left: number, top: number, width: number, height: number): void {
  const now = performance.now();
  if (now - lastTrailAt < 42) return;
  lastTrailAt = now;
  const crumb = document.createElement('div');
  crumb.className = 'drag-trail';
  crumb.style.left = `${left + width / 2}px`;
  crumb.style.top = `${top + height / 2}px`;
  crumb.style.width = `${Math.max(10, width * 0.22)}px`;
  crumb.style.height = `${Math.max(10, height * 0.22)}px`;
  document.body.appendChild(crumb);
  setTimeout(() => crumb.remove(), 320);
}

function pointerPos(e: PointerEvent): { x: number; y: number } {
  return { x: e.clientX, y: e.clientY };
}

/** Inner grid metrics matching the board's CSS grid (padding + gap). */
function boardGridMetrics(): {
  left: number;
  top: number;
  pitch: number;
  cellPx: number;
  gapPx: number;
} {
  const rect = boardEl.getBoundingClientRect();
  const style = getComputedStyle(boardEl);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padT = parseFloat(style.paddingTop) || 0;
  const gapPx = parseFloat(style.gap) || 4;

  const sample = cells[0]?.getBoundingClientRect();
  if (sample && sample.width > 0) {
    const cellPx = sample.width;
    const pitch = cellPx + gapPx;
    return {
      left: sample.left,
      top: sample.top,
      pitch,
      cellPx,
      gapPx,
    };
  }

  const padR = parseFloat(style.paddingRight) || 0;
  const innerW = rect.width - padL - padR;
  const pitch = (innerW + gapPx) / BOARD_SIZE;
  const cellPx = pitch - gapPx;
  return {
    left: rect.left + padL,
    top: rect.top + padT,
    pitch,
    cellPx: Math.max(8, cellPx),
    gapPx,
  };
}

/**
 * Map floating ghost top-left (screen) → piece origin on the board.
 * Clamps past edges so bottom/corner aims still resolve (finger sits below the piece).
 */
function originFromGhostOverlay(
  piece: PieceDef,
  ghostLeft: number,
  ghostTop: number,
): { row: number; col: number } | null {
  const m = boardGridMetrics();
  const { rows, cols } = pieceBounds(piece.cells);
  const col = Math.round((ghostLeft - m.left) / m.pitch);
  const row = Math.round((ghostTop - m.top) / m.pitch);
  // Extra slack past the board — especially below — for fingertip near edges.
  if (row < -3 || col < -3 || row > BOARD_SIZE + 3 || col > BOARD_SIZE + 3) {
    return null;
  }
  const maxRow = Math.max(0, BOARD_SIZE - rows);
  const maxCol = Math.max(0, BOARD_SIZE - cols);
  return {
    row: Math.max(0, Math.min(maxRow, row)),
    col: Math.max(0, Math.min(maxCol, col)),
  };
}

/** Prefer exact overlay; snap only 1 cell if slightly invalid (corners / bottom). */
function resolvePlacement(
  trayIndex: number,
  piece: PieceDef,
  naive: { row: number; col: number },
): { row: number; col: number; valid: boolean } {
  const can =
    trayIndex < 0
      ? game.canPlaceHoldAt(naive.row, naive.col)
      : game.canPlaceAt(trayIndex, naive.row, naive.col);
  if (can) {
    return { row: naive.row, col: naive.col, valid: true };
  }
  const snapped = findNearestPlacement(game.board, piece, naive.row, naive.col, 1);
  if (snapped) {
    const ok =
      trayIndex < 0
        ? game.canPlaceHoldAt(snapped.row, snapped.col)
        : game.canPlaceAt(trayIndex, snapped.row, snapped.col);
    if (ok) {
      return { row: snapped.row, col: snapped.col, valid: true };
    }
  }
  return { row: naive.row, col: naive.col, valid: false };
}

function ghostScreenRect(
  x: number,
  y: number,
  piece: PieceDef,
  cellPx: number,
  gapPx: number,
  liftPx: number,
): { left: number; top: number; width: number; height: number } {
  const { rows, cols } = pieceBounds(piece.cells);
  const width = cols * cellPx + Math.max(0, cols - 1) * gapPx;
  const height = rows * cellPx + Math.max(0, rows - 1) * gapPx;
  // Finger grips bottom-center; piece floats above so board stays visible.
  return {
    left: x - width / 2,
    top: y - height - liftPx,
    width,
    height,
  };
}

function bindDrag(slot: HTMLDivElement, trayIndex: number): void {
  slot.addEventListener('pointerdown', (e) => {
    const piece = game.tray[trayIndex];
    if (!piece || game.gameOver) return;
    e.preventDefault();
    stopHintTimer();
    clearHintHighlight();
    slot.setPointerCapture(e.pointerId);

    const { x, y } = pointerPos(e);
    const m = boardGridMetrics();
    const liftPx = m.pitch * 1.25;
    drag = {
      trayIndex,
      piece,
      pointerId: e.pointerId,
      cellPx: m.cellPx,
      gapPx: m.gapPx,
      liftPx,
      moved: false,
      startX: x,
      startY: y,
    };
    // Don't dim / show board ghost until the finger actually drags
    slot.classList.add('dragging');
  });

  slot.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const { x, y } = pointerPos(e);
    const dist = Math.hypot(x - drag.startX, y - drag.startY);
    if (!drag.moved && dist < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      slot.style.opacity = '0.25';
      dragGhost.innerHTML = piecePreviewHtml(drag.piece, drag.cellPx, drag.gapPx);
      dragGhost.classList.add('active', 'ghost-lift');
    }
    moveDragGhost(e);
    updatePlacementGhost(e);
  });

  slot.addEventListener('pointerup', (e) => onPointerEnd(e, slot));
  slot.addEventListener('pointercancel', (e) => onPointerEnd(e, slot));
}

function bindHoldDrag(slot: HTMLElement): void {
  slot.addEventListener('pointerdown', (e) => {
    if (game.gameOver || !game.holdEnabled()) return;

    // Tap Hold with a selected tray piece → park / swap
    if (selectedTrayForHold !== null) {
      e.preventDefault();
      const swapped = game.swapHold(selectedTrayForHold);
      if (swapped.ok) {
        selectedTrayForHold = null;
        sfx.tap();
        hapticTap();
        paintTray(swapped.dealt);
        paintHold();
        updateHud(true);
        fitBoardToWrap();
        if (swapped.dealt) sfx.refill();
        if (swapped.dealt && game.hold) {
          showToast('New pieces dealt — drag Hold onto the board anytime');
        } else if (game.hold) {
          showToast('Parked — drag it onto the board when you’re ready');
        }
        if (game.gameOver) showGameOver();
        else resetHintTimer();
      }
      return;
    }

    if (!game.hold) {
      e.preventDefault();
      showToast('Tap a tray piece, then Hold');
      return;
    }

    e.preventDefault();
    stopHintTimer();
    clearHintHighlight();
    slot.setPointerCapture(e.pointerId);
    const piece = game.hold;
    const { x, y } = pointerPos(e);
    const m = boardGridMetrics();
    const liftPx = m.pitch * 1.25;
    drag = {
      trayIndex: -1,
      piece,
      pointerId: e.pointerId,
      cellPx: m.cellPx,
      gapPx: m.gapPx,
      liftPx,
      moved: false,
      startX: x,
      startY: y,
    };
    slot.classList.add('dragging');
  });
  slot.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId || drag.trayIndex !== -1) return;
    const { x, y } = pointerPos(e);
    const dist = Math.hypot(x - drag.startX, y - drag.startY);
    if (!drag.moved && dist < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      slot.style.opacity = '0.35';
      dragGhost.innerHTML = piecePreviewHtml(drag.piece, drag.cellPx, drag.gapPx);
      dragGhost.classList.add('active', 'ghost-lift');
    }
    moveDragGhost(e);
    updatePlacementGhost(e);
  });
  slot.addEventListener('pointerup', (e) => onPointerEnd(e, slot));
  slot.addEventListener('pointercancel', (e) => onPointerEnd(e, slot));
}

function ghostOverlapsBoard(
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  const rect = boardEl.getBoundingClientRect();
  // Generous pad: finger sits below the piece, so bottom-row aims often sit outside the board.
  const pad = 28;
  return !(
    left + width < rect.left - pad ||
    left > rect.right + pad ||
    top + height < rect.top - pad ||
    top > rect.bottom + pad
  );
}

function moveDragGhost(e: PointerEvent): void {
  if (!drag || !drag.moved) return;
  const { x, y } = pointerPos(e);
  const rect = ghostScreenRect(x, y, drag.piece, drag.cellPx, drag.gapPx, drag.liftPx);
  dragGhost.style.left = `${rect.left}px`;
  dragGhost.style.top = `${rect.top}px`;
  spawnDragTrail(rect.left, rect.top, rect.width, rect.height);
}

function updatePlacementGhost(e: PointerEvent): void {
  if (!drag || !drag.moved) return;
  const { x, y } = pointerPos(e);
  const rect = ghostScreenRect(x, y, drag.piece, drag.cellPx, drag.gapPx, drag.liftPx);
  const naive = originFromGhostOverlay(drag.piece, rect.left, rect.top);
  if (!naive) {
    clearGhostHighlight();
    return;
  }
  const place = resolvePlacement(drag.trayIndex, drag.piece, naive);
  highlightGhost(drag.piece, place.row, place.col, place.valid);
}

function onPointerEnd(e: PointerEvent, slot: HTMLElement): void {
  if (!drag || drag.pointerId !== e.pointerId) return;
  const { x, y } = pointerPos(e);
  const piece = drag.piece;
  const trayIndex = drag.trayIndex;
  const moved = drag.moved;
  drag = null;
  dragGhost.classList.remove('active', 'ghost-lift', 'ghost-valid', 'ghost-invalid');
  clearGhostHighlight();
  lastTrailAt = 0;
  slot.style.opacity = '';
  slot.classList.remove('dragging');

  // Tap (or tiny jitter): select for Hold — never auto-place
  if (!moved) {
    if (trayIndex >= 0 && game.holdEnabled()) {
      selectedTrayForHold = selectedTrayForHold === trayIndex ? null : trayIndex;
      hapticTap();
      paintTray();
      paintHold();
      if (selectedTrayForHold !== null) {
        showToast('Selected — tap Hold to park it');
      }
      resetHintTimer();
      return;
    }
    if (trayIndex < 0 && game.hold) {
      showToast('Drag this piece onto the board — no need to swap');
    }
    paintTray();
    paintHold();
    resetHintTimer();
    return;
  }

  // Use the floating piece (not the finger) — finger is below the piece for bottom/corner aims.
  const m = boardGridMetrics();
  const liftPx = m.pitch * 1.25;
  const rect = ghostScreenRect(x, y, piece, m.cellPx, m.gapPx, liftPx);
  const naive = originFromGhostOverlay(piece, rect.left, rect.top);

  if (!naive || !ghostOverlapsBoard(rect.left, rect.top, rect.width, rect.height)) {
    // Released nowhere near the board — cancel quietly (not a failed place shake)
    paintTray();
    paintHold();
    resetHintTimer();
    return;
  }

  const place = resolvePlacement(trayIndex, piece, naive);
  if (!place.valid) {
    sfx.bad();
    hapticBad();
    shakeBoard();
    paintTray();
    paintHold();
    resetHintTimer();
    return;
  }

  const result =
    trayIndex < 0
      ? game.tryPlaceHold(place.row, place.col)
      : game.tryPlace(trayIndex, place.row, place.col);
  if (!result.ok) {
    sfx.bad();
    hapticBad();
    shakeBoard();
    paintTray();
    paintHold();
    resetHintTimer();
    return;
  }

  selectedTrayForHold = null;
  recordPlacement(profile, {
    combo: result.score.comboMultiplier,
    streak: result.score.streak,
    clearCount: result.clears.clearCount,
    cellsCleared: result.clears.cells.length,
  });
  sessionClears = game.clearsThisGame;
  maybeCheerNewBest();
  saveProfile(profile);
  checkAndToastGoals();

  sfx.place();
  hapticPlace();
  paintBoard();
  landPiece(piece, place.row, place.col);
  updateHud();

  if (result.clears.clearCount > 0) {
    playClearSweeps(result.clears);
    const delays = clearCascadeDelays(result.clears.cells);
    let maxDelay = 0;
    for (const { r, c } of result.clears.cells) {
      const cell = cellAt(r, c);
      const delay = delays.get(`${r},${c}`) ?? 0;
      maxDelay = Math.max(maxDelay, delay);
      cell.classList.add('flash-clear', 'clearing');
      cell.style.animationDelay = `${delay}ms`;
    }
    spawnClearSparks(result.clears.cells);
    sfx.clear(result.score.comboMultiplier);
    hapticClear(result.score.comboMultiplier);
    if (result.score.comboMultiplier >= 2) sfx.whoosh();
    flashBanners(result.score.comboMultiplier, result.score.streak, true);
    showScorePop(result.score.total, x, y);

    const sessionAtClear = playSessionId;
    if (clearAnimTimer) clearTimeout(clearAnimTimer);
    clearAnimTimer = setTimeout(() => {
      clearAnimTimer = null;
      if (sessionAtClear !== playSessionId) return;
      for (const cell of cells) {
        cell.style.animationDelay = '';
      }
      paintBoard();
      paintTray(result.dealt);
      paintHold();
      if (result.dealt) sfx.refill();
      updateHud();
      if (result.gameOver) showGameOver();
      else resetHintTimer();
    }, 420 + maxDelay);
  } else {
    syncBoardWeather(0, 0, false);
    showScorePop(result.score.total, x, y);
    paintTray(result.dealt);
    paintHold();
    if (result.dealt) sfx.refill();
    updateHud();
    if (result.gameOver) showGameOver();
    else resetHintTimer();
  }
}

async function openGithubRelease(url: string): Promise<void> {
  try {
    await ApkInstaller.openUrl({ url });
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

async function openUpdateDownload(info: UpdateInfo): Promise<void> {
  if (!info.apkUrl) {
    await openGithubRelease(info.releaseUrl);
    return;
  }

  let openedGithub = false;
  const ui = showUpdateDownloadProgress({
    onOpenGithub: () => {
      openedGithub = true;
      void ApkInstaller.cancelDownload().finally(() => {
        void openGithubRelease(info.releaseUrl);
      });
      ui.close();
    },
    onBack: () => {
      void ApkInstaller.cancelDownload();
      ui.close();
    },
  });

  let progressHandle: { remove: () => Promise<void> } | null = null;
  try {
    progressHandle = await ApkInstaller.addListener('downloadProgress', (p) => {
      ui.setProgress(p.received, p.total);
    });
    const result = await ApkInstaller.downloadAndInstall({ url: info.apkUrl });
    if (openedGithub || result.status === 'cancelled') {
      return;
    }
    if (result.status === 'need-permission') {
      showToast('Allow ClearNine to install apps, then tap Download again');
    } else if (result.status === 'ok') {
      showToast('Tap Install on the next screen');
    } else {
      showToast(result.message || 'Download failed — opening GitHub');
      await openGithubRelease(info.releaseUrl);
    }
  } catch {
    if (!openedGithub) {
      showToast('Could not download — opening GitHub');
      await openGithubRelease(info.releaseUrl);
    }
  } finally {
    ui.close();
    try {
      await progressHandle?.remove();
    } catch {
      /* plugin may already be gone */
    }
  }
}

async function promptUpdate(info: UpdateInfo): Promise<void> {
  const choice = await askUpdateAvailable({
    version: info.version,
    notes: info.notes,
  });
  if (choice === 'download') {
    await openUpdateDownload(info);
  } else if (choice === 'github') {
    await openGithubRelease(info.releaseUrl);
  } else if (choice === 'skip') {
    skipVersion(info.version);
    showToast(`Won't ask about ${info.version} again`);
  } else if (choice === 'later') {
    snoozeVersion(info.version);
  }
}

async function runUpdateCheck(opts: {
  force?: boolean;
  fromSettings?: boolean;
}): Promise<void> {
  const fromSettings = opts.fromSettings ?? false;
  if (fromSettings) showToast('Checking for updates…');

  const result = await checkForUpdate({
    force: opts.force ?? false,
    respectSkip: !fromSettings,
  });

  if (result.status === 'update') {
    await promptUpdate(result.info);
    return;
  }

  if (!fromSettings) return;

  if (result.status === 'up-to-date' || result.status === 'skipped') {
    showToast(`You're on the latest version (${APP_VERSION})`);
  } else if (result.status === 'offline') {
    showToast('No connection — try again later');
  } else if (result.status === 'error') {
    showToast('Could not check for updates');
  }
}

function handleHardwareBack(): void {
  if (handleOverlayBack()) return;
  if (appView === 'play') {
    finalizeGameOverIfNeeded();
    showHome();
    return;
  }
  if (appView === 'panel') {
    showHome();
    return;
  }
  if (Capacitor.isNativePlatform()) {
    void App.exitApp();
  }
}

function bindHardwareBack(): void {
  void App.addListener('backButton', () => {
    handleHardwareBack();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
    handleHardwareBack();
  });
}

function boot(): void {
  setStorageFailHandler((message) => showToast(message));
  bindHardwareBack();
  showSplash(() => {
    showHome();
    if (!profile.seenTutorial) {
      showTutorial(() => {
        profile.seenTutorial = true;
        saveProfile(profile);
        hapticTap();
        sfx.nice();
        void runUpdateCheck({ force: false });
      });
    } else {
      void runUpdateCheck({ force: false });
    }
  });
}

boot();
