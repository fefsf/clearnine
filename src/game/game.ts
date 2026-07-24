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
import { weekKey } from './expert';
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

function maxUndos(mode: GameMode): number {
  if (mode === 'classic') return 3;
  if (mode === 'blitz') return 1;
  return 1; // daily / weekly
}

function saveKey(mode: GameMode): string {
  if (mode === 'daily') return SAVE_DAILY;
  if (mode === 'weekly') return SAVE_WEEKLY;
  if (mode === 'blitz') return SAVE_BLITZ;
  return SAVE_CLASSIC;
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

  holdEnabled(): boolean {
    return this.expert && (this.mode === 'classic' || this.mode === 'weekly');
  }

  private dealOpts(): DealOptions | undefined {
    if (!this.expert) return undefined;
    if (this.mode === 'classic') return { hard: true, score: this.score };
    if (this.mode === 'daily' || this.mode === 'weekly' || this.mode === 'blitz') {
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
    this.undosLeft = maxUndos(this.mode);
    this.undoStack = [];
    this.clearsThisGame = 0;
    this.hold = null;

    if (this.mode === 'daily') {
      const seed = this.expert ? `${this.dailyDate}-expert` : this.dailyDate;
      this.rng = rngFromDate(seed);
      seedDailyStarters(this.board, () => this.rng.next(), { expert: this.expert });
    } else if (this.mode === 'weekly') {
      this.rng = rngFromDate(`weekly-${this.weekId}`);
      seedDailyStarters(this.board, () => this.rng.next(), { expert: true, dense: true });
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

    this.pushUndo();
    const piece = this.hold;
    this.hold = null;
    const color = colorForPiece(piece);
    placePiece(this.board, piece, row, col, color);

    const clears = findClears(this.board);
    const breakdown = scorePlacement(piece, clears, this.streak);
    this.streak = breakdown.streak;
    this.score += breakdown.total;
    this.clearsThisGame += clears.clearCount;
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

  /** Swap hold with tray slot (or park tray piece into empty hold). */
  swapHold(trayIndex: number): boolean {
    if (!this.holdEnabled() || this.gameOver) return false;
    if (trayIndex < 0 || trayIndex >= this.tray.length) return false;
    const trayPiece = this.tray[trayIndex];
    if (!trayPiece && !this.hold) return false;

    this.pushUndo();
    this.tray[trayIndex] = this.hold;
    this.hold = trayPiece;
    this.persist();
    return true;
  }

  canUndo(): boolean {
    return this.undosLeft > 0 && this.undoStack.length > 0 && !this.gameOver;
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    const frame = this.undoStack.pop()!;
    this.board = cloneBoard(frame.board);
    this.tray = frame.tray.map((p) => clonePiece(p));
    this.hold = clonePiece(frame.hold);
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
      tray: this.tray.map((p) => clonePiece(p)),
      hold: clonePiece(this.hold),
      score: this.score,
      streak: this.streak,
      rng: { seed: this.rng.seed, counter: this.rng.counter },
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
  try {
    localStorage.setItem(saveKey(mode), JSON.stringify(save));
  } catch {
    /* ignore */
  }
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
    const raw = localStorage.getItem(saveKey(mode));
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
  return saved.score > 0 || boardHasBlocks(saved.board) || !!saved.hold;
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
