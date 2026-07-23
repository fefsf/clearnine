import { BOARD_SIZE, REGION, findNearestPlacement, pieceFitsAnywhere, type ClearResult } from './game/board';
import { findContinueGame, Game } from './game/game';
import { evaluateGoals } from './game/goals';
import { cellCount, colorForPiece, pieceBounds, type PieceDef } from './game/pieces';
import { todayKey } from './game/rng';
import {
  getDailyBest,
  loadProfile,
  recordGameFinished,
  recordPlacement,
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
  transitionScreen,
  type ScreenHandlers,
} from './ui/screens';
import { checkForUpdate, skipVersion, type UpdateInfo } from './app/update';
import { APP_VERSION } from './app/version';
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

const handlers: ScreenHandlers = {
  onClassic: () => void beginMode('classic'),
  onDaily: () => void beginMode('daily'),
  onContinue: () => {
    const info = findContinueGame();
    if (!info) {
      showHome();
      return;
    }
    startPlay(info.mode, true);
  },
  onRecords: () => showRecords(),
  onGoals: () => showGoals(),
  onThemes: () => showThemes(),
  onHowTo: () => showHowTo(),
  onSettings: () => showSettings(),
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
  onCheckUpdate: () => {
    void runUpdateCheck({ force: true, fromSettings: true });
  },
};

async function beginMode(mode: GameMode): Promise<void> {
  const cont = findContinueGame();
  if (cont?.mode === mode) {
    const ok = await askConfirm(
      mode === 'daily'
        ? 'Start a brand new Today’s Puzzle? Your current puzzle will be cleared.'
        : 'Start a brand new game? Your current board will be cleared.',
    );
    if (!ok) return;
  }
  startPlay(mode, false);
}

function showHome(): void {
  stopHintTimer();
  teardownPlayLayout();
  profile = loadProfile();
  transitionScreen(app, () => {
    renderHome(app, profile, handlers, findContinueGame());
  });
}

function showRecords(): void {
  profile = loadProfile();
  transitionScreen(app, () => renderRecords(app, profile, handlers));
}

function showGoals(): void {
  profile = loadProfile();
  transitionScreen(app, () => renderGoals(app, profile, handlers));
}

function showThemes(): void {
  profile = loadProfile();
  transitionScreen(app, () => renderThemes(app, profile, handlers));
}

function showSettings(): void {
  profile = loadProfile();
  transitionScreen(app, () => renderSettings(app, profile, handlers));
}

function showHowTo(): void {
  transitionScreen(app, () => renderHowTo(app, handlers));
}

function startPlay(mode: GameMode, resume: boolean): void {
  sessionClears = 0;
  cheeredBestThisGame = false;
  game.configure(mode, todayKey());
  transitionScreen(app, () => {
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
    updateHud(true);
    hideGameOver();
    requestAnimationFrame(() => {
      fitBoardToWrap();
      boardEl.classList.add('board-enter');
      setTimeout(() => boardEl.classList.remove('board-enter'), 420);
    });
    resetHintTimer();
  });
}

function mountPlayUi(mode: GameMode): void {
  const modeLabel = mode === 'daily' ? 'Today’s Puzzle' : 'Play';
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

    <div class="board-wrap">
      <div class="board" id="board" role="grid" aria-label="Puzzle board"></div>
      <div class="combo-banner" id="combo-banner"></div>
      <div class="streak-banner" id="streak-banner"></div>
      <div class="celebrate-banner" id="celebrate-banner"></div>
    </div>

    <p class="tray-label" id="hint">Your pieces — drag one onto the board</p>
    <div class="tray" id="tray" aria-label="Your pieces"></div>

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
        <button type="button" class="secondary-btn" id="over-home-btn">Back to menu</button>
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
  app.classList.remove('play-layout');
  window.removeEventListener('resize', fitBoardToWrap);
  window.visualViewport?.removeEventListener('resize', fitBoardToWrap);
}

/** Keep the square board inside the free space between score and tray. */
function fitBoardToWrap(): void {
  if (!boardEl || !boardEl.isConnected) return;
  const wrap = boardEl.parentElement;
  if (!wrap) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w < 40 || h < 40) return;
  const size = Math.floor(Math.min(w, h));
  boardEl.style.width = `${size}px`;
  boardEl.style.height = `${size}px`;
  boardEl.style.maxWidth = '100%';
  boardEl.style.maxHeight = '100%';
}

let boardEl: HTMLDivElement;
let trayEl: HTMLDivElement;
let scoreEl: HTMLSpanElement;
let bestEl: HTMLSpanElement;
let bestLabel: HTMLSpanElement;
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
let overHomeBtn: HTMLButtonElement;
let dragGhost: HTMLDivElement;
let comboBanner: HTMLDivElement;
let streakBanner: HTMLDivElement;
let celebrateBanner: HTMLDivElement;
let hintEl: HTMLParagraphElement;
let overTitle: HTMLHeadingElement;
const cells: HTMLDivElement[] = [];

function bindPlayDom(): void {
  boardEl = app.querySelector('#board')!;
  trayEl = app.querySelector('#tray')!;
  scoreEl = app.querySelector('#score')!;
  bestEl = app.querySelector('#best')!;
  bestLabel = app.querySelector('#best-label')!;
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
  overHomeBtn = app.querySelector('#over-home-btn')!;
  dragGhost = app.querySelector('#drag-ghost')!;
  comboBanner = app.querySelector('#combo-banner')!;
  streakBanner = app.querySelector('#streak-banner')!;
  celebrateBanner = app.querySelector('#celebrate-banner')!;
  hintEl = app.querySelector('#hint')!;
  overTitle = app.querySelector('#over-title')!;

  muteBtn.addEventListener('click', () => {
    sfx.toggleMute();
    profile.mute = sfx.muted;
    saveProfile(profile);
    hapticTap();
    sfx.tap();
    updateHud();
  });

  newBtn.addEventListener('click', () => {
    void (async () => {
      hapticTap();
      if (game.score > 0 && !game.gameOver) {
        const ok = await askConfirm('Start a brand new game? Your current board will be cleared.');
        if (!ok) return;
      }
      startFresh();
    })();
  });

  undoBtn.addEventListener('click', () => {
    if (!game.undo()) return;
    clearHintHighlight();
    boardEl.classList.add('board-undo');
    sfx.undo();
    hapticUndo();
    paintBoard();
    paintTray(true);
    animateScoreTo(game.score);
    updateHud();
    setTimeout(() => boardEl.classList.remove('board-undo'), 280);
    resetHintTimer();
  });

  homeBtn.addEventListener('click', () => {
    hapticTap();
    showHome();
  });

  againBtn.addEventListener('click', () => {
    hapticTap();
    startFresh();
  });
  overHomeBtn.addEventListener('click', () => {
    hapticTap();
    showHome();
  });
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

function paintTray(animateIn = false): void {
  trayEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement('div');
    slot.className = 'tray-slot';
    slot.dataset.index = String(i);
    const piece = game.tray[i];
    if (!piece) {
      slot.classList.add('empty');
    } else {
      const { cols } = pieceBounds(piece.cells);
      const cellPx = cols >= 5 ? 16 : cols >= 4 ? 20 : 24;
      slot.innerHTML = piecePreviewHtml(piece, cellPx);
      bindDrag(slot, i);
      if (hintSlot === i) slot.classList.add('hint-pulse');
      if (animateIn) {
        slot.classList.add('tray-in');
        slot.style.animationDelay = `${i * 70}ms`;
      }
    }
    trayEl.appendChild(slot);
  }
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
  if (game.mode === 'daily') {
    bestLabel.textContent = 'Best today';
    bestEl.textContent = String(Math.max(getDailyBest(profile), game.score));
  } else {
    bestLabel.textContent = 'Best ever';
    bestEl.textContent = String(Math.max(profile.bestClassic, game.score));
  }
  muteTitle.textContent = sfx.muted ? 'Sound Off' : 'Sound On';
  undoBtn.disabled = !game.canUndo();
  undoBtn.classList.toggle('disabled', !game.canUndo());
  undoMeta.textContent = `${game.undosLeft} left`;
  if (hintSlot === null) {
    hintEl.textContent = 'Your pieces — drag one onto the board';
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
  if (hintEl) {
    hintEl.textContent = 'Your pieces — drag one onto the board';
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

function showStuckHint(): void {
  if (game.gameOver || drag) return;
  const index = findHintSlot();
  if (index === null) return;
  hintSlot = index;
  paintTray();
  hintEl.textContent = 'Try the glowing piece — drag it onto the board';
  hintEl.classList.add('hint-active');
}

function maybeCheerNewBest(): void {
  if (cheeredBestThisGame) return;
  let isNew = false;
  if (game.mode === 'classic' && game.score > profile.bestClassic) {
    isNew = true;
  }
  if (game.mode === 'daily' && game.score > getDailyBest(profile)) {
    isNew = true;
  }
  if (!isNew) return;
  cheeredBestThisGame = true;
  if (game.mode === 'classic') profile.bestClassic = game.score;
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
  const { newClassicBest, newDailyBest } = recordGameFinished(profile, {
    mode: game.mode,
    score: game.score,
    cleared: sessionClears,
  });
  checkAndToastGoals();

  const isBest = newClassicBest || newDailyBest;
  overTitle.textContent = isBest ? 'New personal best!' : 'Great game!';
  finalScore.textContent = String(game.score);
  if (isBest) {
    bestNote.textContent = 'That’s a new personal best — amazing!';
    sfx.cheer();
    hapticCheer();
  } else if (game.mode === 'daily') {
    bestNote.textContent = `Best today: ${getDailyBest(profile)}`;
    sfx.gameOver();
    showToast('Daily puzzle finished');
  } else {
    bestNote.textContent = `Best ever: ${profile.bestClassic}`;
    sfx.gameOver();
  }
  overlay.classList.add('show', 'overlay-pop');
}

function showGameOver(): void {
  onGameOver();
}

function hideGameOver(): void {
  overlay.classList.remove('show', 'overlay-pop');
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

  for (const r of clears.rows) {
    const a = cellAt(r, 0).getBoundingClientRect();
    const b = cellAt(r, BOARD_SIZE - 1).getBoundingClientRect();
    const band = document.createElement('div');
    band.className = 'sweep-band sweep-row';
    band.style.left = `${a.left - boardRect.left}px`;
    band.style.top = `${a.top - boardRect.top}px`;
    band.style.width = `${b.right - a.left}px`;
    band.style.height = `${a.height}px`;
    layer.appendChild(band);
  }

  for (const c of clears.cols) {
    const a = cellAt(0, c).getBoundingClientRect();
    const b = cellAt(BOARD_SIZE - 1, c).getBoundingClientRect();
    const band = document.createElement('div');
    band.className = 'sweep-band sweep-col';
    band.style.left = `${a.left - boardRect.left}px`;
    band.style.top = `${a.top - boardRect.top}px`;
    band.style.width = `${a.width}px`;
    band.style.height = `${b.bottom - a.top}px`;
    layer.appendChild(band);
  }

  for (const { br, bc } of clears.regions) {
    const a = cellAt(br * REGION, bc * REGION).getBoundingClientRect();
    const b = cellAt(br * REGION + REGION - 1, bc * REGION + REGION - 1).getBoundingClientRect();
    const band = document.createElement('div');
    band.className = 'sweep-band sweep-box';
    band.style.left = `${a.left - boardRect.left}px`;
    band.style.top = `${a.top - boardRect.top}px`;
    band.style.width = `${b.right - a.left}px`;
    band.style.height = `${b.bottom - a.top}px`;
    layer.appendChild(band);
  }

  setTimeout(() => layer.remove(), 480);
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
  for (const { r, c } of piece.cells) {
    const cell = cellAt(row + r, col + c);
    cell.classList.remove('land-pop');
    void cell.offsetWidth;
    cell.classList.add('land-pop');
  }
}

function flashBanners(combo: number, streak: number, cleared: boolean): void {
  if (!cleared) return;

  boardEl.classList.remove('board-combo-flash', 'board-streak-ring');
  void boardEl.offsetWidth;

  if (combo >= 2) {
    comboBanner.textContent = `Combo ×${combo}!`;
    comboBanner.classList.remove('show', 'combo-big');
    void comboBanner.offsetWidth;
    comboBanner.classList.add('show');
    if (combo >= 3) comboBanner.classList.add('combo-big');
    boardEl.classList.add('board-combo-flash');
    flashCelebrate(combo >= 3 ? 'Amazing!' : 'Nice!');
  } else {
    flashCelebrate('Nice!');
  }

  if (streak >= 2) {
    streakBanner.textContent = `Streak ×${streak}`;
    streakBanner.classList.remove('show');
    void streakBanner.offsetWidth;
    streakBanner.classList.add('show');
    boardEl.classList.add('board-streak-ring');
  }

  setTimeout(() => {
    boardEl.classList.remove('board-combo-flash', 'board-streak-ring');
  }, 700);
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
    cell.classList.remove('ghost-ok', 'ghost-bad');
  }
}

function highlightGhost(
  piece: PieceDef,
  row: number,
  col: number,
  valid: boolean,
): void {
  clearGhostHighlight();
  for (const { r, c } of piece.cells) {
    const br = row + r;
    const bc = col + c;
    if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) continue;
    cellAt(br, bc).classList.add(valid ? 'ghost-ok' : 'ghost-bad');
  }
}

type DragState = {
  trayIndex: number;
  piece: PieceDef;
  pointerId: number;
  cellPx: number;
  gapPx: number;
  liftPx: number;
};

let drag: DragState | null = null;

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
 * Clamps slightly outside edges so corner aims still resolve.
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
  // Allow a little slack past the board for fingertip near edges.
  if (row < -2 || col < -2 || row > BOARD_SIZE + 1 || col > BOARD_SIZE + 1) {
    return null;
  }
  const maxRow = Math.max(0, BOARD_SIZE - rows);
  const maxCol = Math.max(0, BOARD_SIZE - cols);
  return {
    row: Math.max(0, Math.min(maxRow, row)),
    col: Math.max(0, Math.min(maxCol, col)),
  };
}

/** Prefer exact overlay; snap at most 1 cell if slightly invalid. */
function resolvePlacement(
  trayIndex: number,
  piece: PieceDef,
  naive: { row: number; col: number },
): { row: number; col: number; valid: boolean } {
  if (game.canPlaceAt(trayIndex, naive.row, naive.col)) {
    return { row: naive.row, col: naive.col, valid: true };
  }
  const snapped = findNearestPlacement(game.board, piece, naive.row, naive.col, 1);
  if (snapped) {
    return { row: snapped.row, col: snapped.col, valid: true };
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

    const m = boardGridMetrics();
    const liftPx = m.pitch * 1.25;
    drag = {
      trayIndex,
      piece,
      pointerId: e.pointerId,
      cellPx: m.cellPx,
      gapPx: m.gapPx,
      liftPx,
    };
    slot.style.opacity = '0.25';

    dragGhost.innerHTML = piecePreviewHtml(piece, m.cellPx, m.gapPx);
    dragGhost.classList.add('active', 'ghost-lift');
    slot.classList.add('dragging');
    moveDragGhost(e);
    updatePlacementGhost(e);
  });

  slot.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    moveDragGhost(e);
    updatePlacementGhost(e);
  });

  slot.addEventListener('pointerup', (e) => onPointerEnd(e, slot));
  slot.addEventListener('pointercancel', (e) => onPointerEnd(e, slot));
}

function moveDragGhost(e: PointerEvent): void {
  if (!drag) return;
  const { x, y } = pointerPos(e);
  const rect = ghostScreenRect(x, y, drag.piece, drag.cellPx, drag.gapPx, drag.liftPx);
  dragGhost.style.left = `${rect.left}px`;
  dragGhost.style.top = `${rect.top}px`;
}

function updatePlacementGhost(e: PointerEvent): void {
  if (!drag) return;
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

function onPointerEnd(e: PointerEvent, slot: HTMLDivElement): void {
  if (!drag || drag.pointerId !== e.pointerId) return;
  const { x, y } = pointerPos(e);
  const rect = ghostScreenRect(x, y, drag.piece, drag.cellPx, drag.gapPx, drag.liftPx);
  const naive = originFromGhostOverlay(drag.piece, rect.left, rect.top);
  const piece = drag.piece;
  const trayIndex = drag.trayIndex;
  drag = null;
  dragGhost.classList.remove('active', 'ghost-lift');
  clearGhostHighlight();
  slot.style.opacity = '';
  slot.classList.remove('dragging');

  if (!naive) {
    sfx.bad();
    hapticBad();
    shakeBoard();
    paintTray();
    resetHintTimer();
    return;
  }

  const place = resolvePlacement(trayIndex, piece, naive);
  if (!place.valid) {
    sfx.bad();
    hapticBad();
    shakeBoard();
    paintTray();
    resetHintTimer();
    return;
  }

  const result = game.tryPlace(trayIndex, place.row, place.col);
  if (!result.ok) {
    sfx.bad();
    hapticBad();
    shakeBoard();
    paintTray();
    resetHintTimer();
    return;
  }

  recordPlacement(profile, {
    combo: result.score.comboMultiplier,
    streak: result.score.streak,
    clearCount: result.clears.clearCount,
    cellsCleared: result.clears.cells.length,
  });
  sessionClears = game.clearsThisGame;
  maybeCheerNewBest();
  if (game.mode === 'classic' && game.score > profile.bestClassic) {
    profile.bestClassic = game.score;
  }
  saveProfile(profile);
  checkAndToastGoals();

  sfx.place();
  hapticPlace();
  paintBoard();
  landPiece(piece, place.row, place.col);
  updateHud();

  if (result.clears.clearCount > 0) {
    playClearSweeps(result.clears);
    for (const { r, c } of result.clears.cells) {
      const cell = cellAt(r, c);
      cell.classList.add('flash-clear', 'clearing');
    }
    spawnClearSparks(result.clears.cells);
    sfx.clear(result.score.comboMultiplier);
    hapticClear(result.score.comboMultiplier);
    if (result.score.comboMultiplier >= 2) sfx.whoosh();
    flashBanners(result.score.comboMultiplier, result.score.streak, true);
    showScorePop(result.score.total, x, y);

    setTimeout(() => {
      paintBoard();
      paintTray(result.dealt);
      if (result.dealt) sfx.refill();
      updateHud();
      if (result.gameOver) showGameOver();
      else resetHintTimer();
    }, 420);
  } else {
    showScorePop(result.score.total, x, y);
    paintTray(result.dealt);
    if (result.dealt) sfx.refill();
    updateHud();
    if (result.gameOver) showGameOver();
    else resetHintTimer();
  }
}

function startFresh(): void {
  hideGameOver();
  sessionClears = 0;
  cheeredBestThisGame = false;
  game.newGame();
  paintBoard();
  paintTray(true);
  updateHud(true);
  fitBoardToWrap();
  boardEl.classList.add('board-enter');
  setTimeout(() => boardEl.classList.remove('board-enter'), 420);
  resetHintTimer();
}

async function openUpdateDownload(info: UpdateInfo): Promise<void> {
  const url = info.apkUrl || info.releaseUrl;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch {
    window.open(url, '_blank');
  }
}

async function promptUpdate(info: UpdateInfo): Promise<void> {
  const choice = await askUpdateAvailable({
    version: info.version,
    notes: info.notes,
  });
  if (choice === 'download') {
    await openUpdateDownload(info);
  } else if (choice === 'skip') {
    skipVersion(info.version);
    showToast(`Won't ask about ${info.version} again`);
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

function boot(): void {
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
