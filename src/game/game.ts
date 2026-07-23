import {
  anyTrayPieceFits,
  applyClears,
  canPlace,
  cloneBoard,
  createEmptyBoard,
  findClears,
  placePiece,
  type Board,
  type ClearResult,
} from './board';
import {
  colorForPiece,
  dealTray,
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
  score: number;
  streak: number;
  rng: RngState;
};

export type GameSave = {
  mode: GameMode;
  board: Board;
  tray: TraySlot[];
  score: number;
  streak: number;
  gameOver: boolean;
  undosLeft: number;
  undoStack: UndoFrame[];
  rng: RngState;
  /** Daily only — must match today to restore. */
  dailyDate?: string;
  clearsThisGame: number;
};

const SAVE_CLASSIC = 'clearnine-save-classic';
const SAVE_DAILY = 'clearnine-save-daily';
const LEGACY_SAVE = 'clearnine-save';

function maxUndos(mode: GameMode): number {
  return mode === 'daily' ? 1 : 3;
}

export class Game {
  mode: GameMode = 'classic';
  board: Board = createEmptyBoard();
  tray: TraySlot[] = [];
  score = 0;
  streak = 0;
  gameOver = false;
  undosLeft = 3;
  clearsThisGame = 0;
  private undoStack: UndoFrame[] = [];
  private rng = createRng(Date.now() >>> 0);
  private dailyDate = todayKey();

  configure(mode: GameMode, dailyDate = todayKey()): void {
    this.mode = mode;
    this.dailyDate = dailyDate;
  }

  newGame(): void {
    this.board = createEmptyBoard();
    this.score = 0;
    this.streak = 0;
    this.gameOver = false;
    this.undosLeft = maxUndos(this.mode);
    this.undoStack = [];
    this.clearsThisGame = 0;
    if (this.mode === 'daily') {
      this.rng = rngFromDate(this.dailyDate);
    } else {
      this.rng = createRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    }
    this.tray = dealTray(3, () => this.rng.next());
    this.persist();
  }

  /** Restore unfinished save for current mode, or start new. */
  loadOrNew(): boolean {
    const saved = loadSave(this.mode, this.dailyDate);
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
    this.score = saved.score;
    this.streak = saved.streak;
    this.gameOver = saved.gameOver;
    this.undosLeft = saved.undosLeft;
    this.undoStack = saved.undoStack ?? [];
    this.rng = cloneRng(saved.rng);
    this.clearsThisGame = saved.clearsThisGame ?? 0;
    if (saved.dailyDate) this.dailyDate = saved.dailyDate;
  }

  tryPlace(trayIndex: number, row: number, col: number): PlaceResult {
    if (this.gameOver) return { ok: false, reason: 'invalid' };
    const piece = this.tray[trayIndex];
    if (!piece) return { ok: false, reason: 'empty-slot' };
    if (!canPlace(this.board, piece, row, col)) {
      return { ok: false, reason: 'invalid' };
    }

    this.pushUndo();

    const color = colorForPiece(piece);
    placePiece(this.board, piece, row, col, color);
    this.tray[trayIndex] = null;

    const clears = findClears(this.board);
    const breakdown = scorePlacement(piece, clears, this.streak);
    this.streak = breakdown.streak;
    this.score += breakdown.total;
    this.clearsThisGame += clears.clearCount;

    if (clears.clearCount > 0) {
      applyClears(this.board, clears);
    }

    let dealt = false;
    if (this.tray.every((s) => s === null)) {
      this.tray = dealTray(3, () => this.rng.next());
      dealt = true;
    }

    if (!anyTrayPieceFits(this.board, this.tray)) {
      this.gameOver = true;
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

  canUndo(): boolean {
    return this.undosLeft > 0 && this.undoStack.length > 0 && !this.gameOver;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    const frame = this.undoStack.pop()!;
    this.board = cloneBoard(frame.board);
    this.tray = frame.tray.map((p) => (p ? { ...p, cells: p.cells.map((c) => ({ ...c })) } : null));
    this.score = frame.score;
    this.streak = frame.streak;
    this.rng = cloneRng(frame.rng);
    this.undosLeft -= 1;
    this.persist();
    return true;
  }

  private pushUndo(): void {
    this.undoStack.push({
      board: cloneBoard(this.board),
      tray: this.tray.slice(),
      score: this.score,
      streak: this.streak,
      rng: { seed: this.rng.seed, counter: this.rng.counter },
    });
    // Cap stack to undos that can still be used
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

  clearPersist(): void {
    clearSave(this.mode);
  }

  private persist(): void {
    if (this.gameOver) {
      clearSave(this.mode);
      return;
    }
    const save: GameSave = {
      mode: this.mode,
      board: this.board,
      tray: this.tray,
      score: this.score,
      streak: this.streak,
      gameOver: false,
      undosLeft: this.undosLeft,
      undoStack: this.undoStack,
      rng: { seed: this.rng.seed, counter: this.rng.counter },
      clearsThisGame: this.clearsThisGame,
    };
    if (this.mode === 'daily') save.dailyDate = this.dailyDate;
    writeSave(this.mode, save);
  }
}

function saveKey(mode: GameMode): string {
  return mode === 'daily' ? SAVE_DAILY : SAVE_CLASSIC;
}

function writeSave(mode: GameMode, save: GameSave): void {
  try {
    localStorage.setItem(saveKey(mode), JSON.stringify(save));
  } catch {
    /* ignore */
  }
}

function loadSave(mode: GameMode, dailyDate: string): GameSave | null {
  try {
    // Migrate legacy classic save once
    if (mode === 'classic') {
      const legacy = localStorage.getItem(LEGACY_SAVE);
      if (legacy && !localStorage.getItem(SAVE_CLASSIC)) {
        localStorage.setItem(SAVE_CLASSIC, legacy);
        localStorage.removeItem(LEGACY_SAVE);
      }
    }
    const raw = localStorage.getItem(saveKey(mode));
    if (!raw) return null;
    const saved = JSON.parse(raw) as GameSave;
    if (mode === 'daily') {
      if (saved.dailyDate !== dailyDate) return null;
    }
    if (!saved.rng) return null;
    return saved;
  } catch {
    return null;
  }
}

function clearSave(mode: GameMode): void {
  try {
    localStorage.removeItem(saveKey(mode));
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
  return saved.score > 0 || boardHasBlocks(saved.board);
}

/** Unfinished game to resume from the home screen (Classic preferred, else today’s Daily). */
export function findContinueGame(): { mode: GameMode; score: number } | null {
  const day = todayKey();
  const classic = loadSave('classic', day);
  if (saveIsContinuable(classic)) {
    return { mode: 'classic', score: classic.score };
  }
  const daily = loadSave('daily', day);
  if (saveIsContinuable(daily)) {
    return { mode: 'daily', score: daily.score };
  }
  return null;
}
