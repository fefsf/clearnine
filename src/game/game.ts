import {
  anyTrayPieceFits,
  applyClears,
  canPlace,
  cloneBoard,
  createEmptyBoard,
  findClears,
  placePiece,
  seedDailyStarters,
  type Board,
  type ClearResult,
} from './board';
import { getWeeklyMandate, weekKey, type WeeklyMandate } from './expert';
import {
  colorForPiece,
  dealTray,
  type DealOptions,
  type PieceDef,
} from './pieces';
import {
  cloneRng,
  createRng,
  rngFromDate,
  todayKey,
  type RngState,
} from './rng';
import { scorePlacement, type ScoreBreakdown } from './scoring';
import type { GameMode } from './stats';
import { writeLocal } from '../app/storage';

export type TraySlot = PieceDef | null;

export type PlaceResult =
  | {
      ok: true;
      score: ScoreBreakdown;
      clears: ClearResult;
      color: number;
      gameOver: boolean;
      dealt: boolean;
    }
  | {
      ok: false;
      reason: 'invalid' | 'empty-slot';
    };

export type UndoFrame = {
  board: Board;
  tray: TraySlot[];
  hold: PieceDef | null;
  score: number;
  streak: number;
  rng: RngState;
  clearsThisGame: number;
  /** What action created this frame — used to reverse stats correctly. */
  kind: 'place' | 'swap';
  placement?: {
    clearCount: number;
    cellsCleared: number;
    combo: number;
    streak: number;
  };
};

export type GameSave = {
  mode: GameMode;
  board: Board;
  tray: TraySlot[];
  hold: PieceDef | null;
  score: number;
  streak: number;
  gameOver: boolean;
  undosLeft: number;
  undoStack: UndoFrame[];
  rng: RngState;
  dailyDate?: string;
  weekKey?: string;
  clearsThisGame: number;
  expert: boolean;
};

const SAVE_CLASSIC = 'clearnine-save-classic';
const SAVE_DAILY = 'clearnine-save-daily';
const SAVE_WEEKLY = 'clearnine-save-weekly';
const SAVE_BLITZ = 'clearnine-save-blitz';
const LEGACY_SAVE = 'clearnine-save';

function maxUndos(mode: GameMode, mandate?: WeeklyMandate | null): number {
  if (mode === 'classic') return 3;
  if (mode === 'blitz') return 1;
  if (mode === 'weekly' && mandate) return mandate.undos;
  return 1; // daily / weekly default
}

function saveKey(mode: GameMode, expert = false): string {
  let base = SAVE_CLASSIC;
  if (mode === 'daily') base = SAVE_DAILY;
  else if (mode === 'weekly') base = SAVE_WEEKLY;
  else if (mode === 'blitz') base = SAVE_BLITZ;
  return expert ? `${base}-expert` : base;
}

/** Move legacy shared-key expert saves into the expert-namespaced key once. */
function migrateSharedExpertSave(mode: GameMode): void {
  try {
    const calmKey = saveKey(mode, false);
    const expertKey = saveKey(mode, true);
    if (localStorage.getItem(expertKey)) return;
    const raw = localStorage.getItem(calmKey);
    if (!raw) return;
    const saved = JSON.parse(raw) as GameSave;
    if (saved.expert) {
      localStorage.setItem(expertKey, raw);
      localStorage.removeItem(calmKey);
    }
  } catch {
    /* ignore */
  }
}

function clonePiece(p: PieceDef | null): PieceDef | null {
  if (!p) return null;
  return { ...p, cells: p.cells.map((c) => ({ ...c })) };
}

export class Game {
  mode: GameMode = 'classic';
  board: Board = createEmptyBoard();
  tray: TraySlot[] = [];
  hold: PieceDef | null = null;
  score = 0;
  streak = 0;
  gameOver = false;
  undosLeft = 3;
  clearsThisGame = 0;
  expert = false;
  private undoStack: UndoFrame[] = [];
  private rng = createRng(Date.now() >>> 0);
  private dailyDate = todayKey();
  private weekId = weekKey();

  configure(mode: GameMode, opts?: { dailyDate?: string; week?: string; expert?: boolean }): void {
    this.mode = mode;
    this.dailyDate = opts?.dailyDate ?? todayKey();
    this.weekId = opts?.week ?? weekKey();
    this.expert = opts?.expert ?? false;
  }

  get periodKey(): string {
    if (this.mode === 'weekly') return this.weekId;
    return this.dailyDate;
  }

  weeklyMandate(): WeeklyMandate | null {
    if (this.mode !== 'weekly') return null;
    return getWeeklyMandate(this.weekId);
  }

  holdEnabled(): boolean {
    if (!this.expert) return false;
    if (this.mode === 'classic') return true;
    if (this.mode === 'weekly') {
      return this.weeklyMandate()?.hold ?? true;
    }
    return false;
  }

  private dealOpts(): DealOptions | undefined {
    if (!this.expert) return undefined;
    if (this.mode === 'classic') return { hard: true, score: this.score };
    if (this.mode === 'weekly') {
      const m = this.weeklyMandate();
      if (!m) return { hard: true };
      if (m.dealBias === 'giants') return { bias: 'giants', hard: true };
      if (m.dealBias === 'small') return { bias: 'small' };
      if (m.dealBias === 'rising') return { hard: true, score: this.score };
      return { hard: true };
    }
    if (this.mode === 'daily' || this.mode === 'blitz') {
      return { hard: true };
    }
    return undefined;
  }

  private deal(): TraySlot[] {
    return dealTray(3, () => this.rng.next(), this.dealOpts());
  }

  newGame(): void {
    this.board = createEmptyBoard();
    this.score = 0;
    this.streak = 0;
    this.gameOver = false;
    const mandate = this.weeklyMandate();
    this.undosLeft = maxUndos(this.mode, mandate);
    this.undoStack = [];
    this.clearsThisGame = 0;
    this.hold = null;

    if (this.mode === 'daily') {
      const seed = this.expert ? `${this.dailyDate}-expert` : this.dailyDate;
      this.rng = rngFromDate(seed);
      seedDailyStarters(this.board, () => this.rng.next(), { expert: this.expert });
    } else if (this.mode === 'weekly') {
      this.rng = rngFromDate(`weekly-${this.weekId}`);
      const dense = mandate?.dense ?? true;
      seedDailyStarters(this.board, () => this.rng.next(), { expert: true, dense });
    } else if (this.mode === 'blitz') {
      this.rng = createRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
      seedDailyStarters(this.board, () => this.rng.next(), { dense: true });
    } else {
      this.rng = createRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    }

    this.tray = this.deal();
    this.persist();
  }

  /** Restore unfinished save for current mode + expert flag, or start new. */
  loadOrNew(): boolean {
    const saved = loadSave(this.mode, this.dailyDate, this.weekId, this.expert);
    if (saved && !saved.gameOver) {
      this.applySave(saved);
      return true;
    }
    this.newGame();
    return false;
  }

  private applySave(saved: GameSave): void {
    this.mode = saved.mode;
    this.board = saved.board;
    this.tray = saved.tray;
    this.hold = saved.hold ?? null;
    this.score = saved.score;
    this.streak = saved.streak;
    this.gameOver = saved.gameOver;
    this.undosLeft = saved.undosLeft;
    this.undoStack = saved.undoStack ?? [];
    this.rng = cloneRng(saved.rng);
    this.clearsThisGame = saved.clearsThisGame ?? 0;
    this.expert = saved.expert ?? false;
    if (saved.dailyDate) this.dailyDate = saved.dailyDate;
    if (saved.weekKey) this.weekId = saved.weekKey;
    // Corrupt / mode mismatch: Hold must not keep a dead game alive with no UI.
    if (!this.holdEnabled() && this.hold) {
      this.hold = null;
    }
  }

  tryPlace(trayIndex: number, row: number, col: number): PlaceResult {
    if (this.gameOver) return { ok: false, reason: 'invalid' };
    const piece = this.tray[trayIndex];
    if (!piece) return { ok: false, reason: 'empty-slot' };
    if (!canPlace(this.board, piece, row, col)) {
      return { ok: false, reason: 'invalid' };
    }

    this.pushUndo('place');

    const color = colorForPiece(piece);
    placePiece(this.board, piece, row, col, color);
    this.tray[trayIndex] = null;

    const clears = findClears(this.board);
    const breakdown = scorePlacement(piece, clears, this.streak);
    this.streak = breakdown.streak;
    this.score += breakdown.total;
    this.clearsThisGame += clears.clearCount;
    this.tagLastUndoPlacement(clears.clearCount, clears.cells.length, breakdown);

    if (clears.clearCount > 0) {
      applyClears(this.board, clears);
    }

    let dealt = false;
    if (this.tray.every((s) => s === null)) {
      this.tray = this.deal();
      dealt = true;
    }

    if (!anyTrayPieceFits(this.board, this.tray)) {
      if (!this.hold || !pieceFitsHold(this.board, this.hold)) {
        this.gameOver = true;
      }
    }

    this.persist();

    return {
      ok: true,
      score: breakdown,
      clears,
      color,
      gameOver: this.gameOver,
      dealt,
    };
  }

  /** Place the held piece onto the board. */
  tryPlaceHold(row: number, col: number): PlaceResult {
    if (this.gameOver || !this.hold) return { ok: false, reason: 'empty-slot' };
    if (!canPlace(this.board, this.hold, row, col)) {
      return { ok: false, reason: 'invalid' };
    }

    this.pushUndo('place');
    const piece = this.hold;
    this.hold = null;
    const color = colorForPiece(piece);
    placePiece(this.board, piece, row, col, color);

    const clears = findClears(this.board);
    const breakdown = scorePlacement(piece, clears, this.streak);
    this.streak = breakdown.streak;
    this.score += breakdown.total;
    this.clearsThisGame += clears.clearCount;
    this.tagLastUndoPlacement(clears.clearCount, clears.cells.length, breakdown);
    if (clears.clearCount > 0) applyClears(this.board, clears);

    let dealt = false;
    if (this.tray.every((s) => s === null)) {
      this.tray = this.deal();
      dealt = true;
    }

    if (!anyTrayPieceFits(this.board, this.tray)) {
      if (!this.hold || !pieceFitsHold(this.board, this.hold)) {
        this.gameOver = true;
      }
    }

    this.persist();
    return {
      ok: true,
      score: breakdown,
      clears,
      color,
      gameOver: this.gameOver,
      dealt,
    };
  }

  /**
   * Swap hold with tray slot (or park tray piece into empty hold).
   * Parking the last tray piece refills the tray, same as placing the last piece.
   */
  swapHold(trayIndex: number): { ok: true; dealt: boolean } | { ok: false } {
    if (!this.holdEnabled() || this.gameOver) return { ok: false };
    if (trayIndex < 0 || trayIndex >= this.tray.length) return { ok: false };
    const trayPiece = this.tray[trayIndex];
    if (!trayPiece && !this.hold) return { ok: false };

    this.pushUndo('swap');
    this.tray[trayIndex] = this.hold;
    this.hold = trayPiece;

    let dealt = false;
    if (this.tray.every((s) => s === null)) {
      this.tray = this.deal();
      dealt = true;
    }

    if (!anyTrayPieceFits(this.board, this.tray)) {
      if (!this.hold || !pieceFitsHold(this.board, this.hold)) {
        this.gameOver = true;
      }
    }

    this.persist();
    return { ok: true, dealt };
  }

  canUndo(): boolean {
    return this.undosLeft > 0 && this.undoStack.length > 0;
  }

  /**
   * Restore previous board state. Returns placement stats to reverse when
   * the undone action was a place (not a hold swap).
   */
  undo():
    | { ok: true; placement: UndoFrame['placement'] | null }
    | { ok: false } {
    if (!this.canUndo()) return { ok: false };
    const frame = this.undoStack.pop()!;
    this.board = cloneBoard(frame.board);
    this.tray = frame.tray.map((p) => clonePiece(p));
    this.hold = clonePiece(frame.hold);
    this.score = frame.score;
    this.streak = frame.streak;
    this.rng = cloneRng(frame.rng);
    this.clearsThisGame =
      typeof frame.clearsThisGame === 'number' ? frame.clearsThisGame : this.clearsThisGame;
    this.undosLeft -= 1;
    this.gameOver = false;
    if (!anyTrayPieceFits(this.board, this.tray)) {
      if (!this.hold || !pieceFitsHold(this.board, this.hold)) {
        this.gameOver = true;
      }
    }
    this.persist();
    return {
      ok: true,
      placement: frame.kind === 'place' ? (frame.placement ?? null) : null,
    };
  }

  private tagLastUndoPlacement(
    clearCount: number,
    cellsCleared: number,
    breakdown: ScoreBreakdown,
  ): void {
    const frame = this.undoStack[this.undoStack.length - 1];
    if (!frame || frame.kind !== 'place') return;
    frame.placement = {
      clearCount,
      cellsCleared,
      combo: breakdown.comboMultiplier,
      streak: breakdown.streak,
    };
  }

  private pushUndo(kind: 'place' | 'swap'): void {
    this.undoStack.push({
      board: cloneBoard(this.board),
      tray: this.tray.map((p) => clonePiece(p)),
      hold: clonePiece(this.hold),
      score: this.score,
      streak: this.streak,
      rng: { seed: this.rng.seed, counter: this.rng.counter },
      clearsThisGame: this.clearsThisGame,
      kind,
    });
    const cap = this.undosLeft;
    if (this.undoStack.length > cap) {
      this.undoStack.shift();
    }
  }

  canPlaceAt(trayIndex: number, row: number, col: number): boolean {
    const piece = this.tray[trayIndex];
    if (!piece) return false;
    return canPlace(this.board, piece, row, col);
  }

  canPlaceHoldAt(row: number, col: number): boolean {
    if (!this.hold) return false;
    return canPlace(this.board, this.hold, row, col);
  }

  clearPersist(): void {
    clearSave(this.mode, this.expert);
  }

  private persist(): void {
    if (this.gameOver) {
      clearSave(this.mode, this.expert);
      return;
    }
    const save: GameSave = {
      mode: this.mode,
      board: this.board,
      tray: this.tray,
      hold: this.hold,
      score: this.score,
      streak: this.streak,
      gameOver: false,
      undosLeft: this.undosLeft,
      undoStack: this.undoStack,
      rng: { seed: this.rng.seed, counter: this.rng.counter },
      clearsThisGame: this.clearsThisGame,
      expert: this.expert,
    };
    if (this.mode === 'daily') save.dailyDate = this.dailyDate;
    if (this.mode === 'weekly') save.weekKey = this.weekId;
    writeSave(this.mode, save);
  }
}

function pieceFitsHold(board: Board, piece: PieceDef): boolean {
  return anyTrayPieceFits(board, [piece]);
}

function writeSave(mode: GameMode, save: GameSave): void {
  const expert = save.expert ?? false;
  writeLocal(saveKey(mode, expert), JSON.stringify(save));
}

function loadSave(
  mode: GameMode,
  dailyDate: string,
  week: string,
  expert: boolean,
): GameSave | null {
  try {
    if (mode === 'classic') {
      const legacy = localStorage.getItem(LEGACY_SAVE);
      if (legacy && !localStorage.getItem(SAVE_CLASSIC)) {
        localStorage.setItem(SAVE_CLASSIC, legacy);
        localStorage.removeItem(LEGACY_SAVE);
      }
    }
    migrateSharedExpertSave(mode);
    const raw = localStorage.getItem(saveKey(mode, expert));
    if (!raw) return null;
    const saved = JSON.parse(raw) as GameSave;
    if ((saved.expert ?? false) !== expert) return null;
    if (mode === 'daily' && saved.dailyDate !== dailyDate) return null;
    if (mode === 'weekly' && saved.weekKey !== week) return null;
    if (!saved.rng) return null;
    return saved;
  } catch {
    return null;
  }
}

function clearSave(mode: GameMode, expert = false): void {
  try {
    localStorage.removeItem(saveKey(mode, expert));
  } catch {
    /* ignore */
  }
}

function boardHasBlocks(board: Board): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell !== 0) return true;
    }
  }
  return false;
}

function saveIsContinuable(saved: GameSave | null): saved is GameSave {
  if (!saved || saved.gameOver) return false;
  const trayHasPiece = saved.tray.some((p) => p != null);
  return (
    saved.score > 0 ||
    boardHasBlocks(saved.board) ||
    !!saved.hold ||
    trayHasPiece
  );
}

/** Unfinished game matching current Expert on/off. */
export function findContinueGame(expert = false): { mode: GameMode; score: number } | null {
  const day = todayKey();
  const week = weekKey();
  const order: GameMode[] = expert
    ? ['classic', 'daily', 'weekly', 'blitz']
    : ['classic', 'daily'];
  for (const mode of order) {
    const saved = loadSave(mode, day, week, expert);
    if (saveIsContinuable(saved)) {
      return { mode, score: saved.score };
    }
  }
  return null;
}

/** Exported for debug / tests: whether a save counts as Continue. */
export function isSaveContinuable(saved: GameSave | null): boolean {
  return saveIsContinuable(saved);
}
