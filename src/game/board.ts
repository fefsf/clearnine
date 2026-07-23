import type { Cell, PieceDef } from './pieces';

export const BOARD_SIZE = 9;
export const REGION = 3;

/** 0 = empty; 1–8 = filled color index. */
export type Board = number[][];

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 0),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

export function canPlace(
  board: Board,
  piece: PieceDef,
  row: number,
  col: number,
): boolean {
  for (const { r, c } of piece.cells) {
    const br = row + r;
    const bc = col + c;
    if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) return false;
    if (board[br]![bc] !== 0) return false;
  }
  return true;
}

export function placePiece(
  board: Board,
  piece: PieceDef,
  row: number,
  col: number,
  color: number,
): void {
  for (const { r, c } of piece.cells) {
    board[row + r]![col + c] = color;
  }
}

export function pieceFitsAnywhere(board: Board, piece: PieceDef): boolean {
  const { rows, cols } = bounds(piece.cells);
  for (let r = 0; r <= BOARD_SIZE - rows; r++) {
    for (let c = 0; c <= BOARD_SIZE - cols; c++) {
      if (canPlace(board, piece, r, c)) return true;
    }
  }
  return false;
}

/**
 * Pick the valid origin closest to the intended origin (Manhattan).
 * Tight snap only — avoids yanking the piece across the board.
 */
export function findNearestPlacement(
  board: Board,
  piece: PieceDef,
  targetRow: number,
  targetCol: number,
  maxDist = 1,
): { row: number; col: number } | null {
  const { rows, cols } = bounds(piece.cells);
  let best: { row: number; col: number; dist: number } | null = null;

  for (let r = 0; r <= BOARD_SIZE - rows; r++) {
    for (let c = 0; c <= BOARD_SIZE - cols; c++) {
      if (!canPlace(board, piece, r, c)) continue;
      const dist = Math.abs(r - targetRow) + Math.abs(c - targetCol);
      if (!best || dist < best.dist) {
        best = { row: r, col: c, dist };
      }
    }
  }

  if (!best || best.dist > maxDist) return null;
  return { row: best.row, col: best.col };
}

function bounds(cells: Cell[]): { rows: number; cols: number } {
  let maxR = 0;
  let maxC = 0;
  for (const { r, c } of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { rows: maxR + 1, cols: maxC + 1 };
}

export type ClearResult = {
  rows: number[];
  cols: number[];
  regions: { br: number; bc: number }[];
  /** Unique cells to clear. */
  cells: Cell[];
  clearCount: number;
};

export function findClears(board: Board): ClearResult {
  const rows: number[] = [];
  const cols: number[] = [];
  const regions: { br: number; bc: number }[] = [];
  const cellSet = new Set<string>();

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r]!.every((v) => v !== 0)) {
      rows.push(r);
      for (let c = 0; c < BOARD_SIZE; c++) cellSet.add(`${r},${c}`);
    }
  }

  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (board[r]![c] === 0) {
        full = false;
        break;
      }
    }
    if (full) {
      cols.push(c);
      for (let r = 0; r < BOARD_SIZE; r++) cellSet.add(`${r},${c}`);
    }
  }

  for (let br = 0; br < REGION; br++) {
    for (let bc = 0; bc < REGION; bc++) {
      let full = true;
      outer: for (let r = br * REGION; r < br * REGION + REGION; r++) {
        for (let c = bc * REGION; c < bc * REGION + REGION; c++) {
          if (board[r]![c] === 0) {
            full = false;
            break outer;
          }
        }
      }
      if (full) {
        regions.push({ br, bc });
        for (let r = br * REGION; r < br * REGION + REGION; r++) {
          for (let c = bc * REGION; c < bc * REGION + REGION; c++) {
            cellSet.add(`${r},${c}`);
          }
        }
      }
    }
  }

  const cells: Cell[] = [];
  for (const key of cellSet) {
    const [rs, cs] = key.split(',');
    cells.push({ r: Number(rs), c: Number(cs) });
  }

  return {
    rows,
    cols,
    regions,
    cells,
    clearCount: rows.length + cols.length + regions.length,
  };
}

export function applyClears(board: Board, clears: ClearResult): void {
  for (const { r, c } of clears.cells) {
    board[r]![c] = 0;
  }
}

export function anyTrayPieceFits(
  board: Board,
  tray: (PieceDef | null)[],
): boolean {
  for (const piece of tray) {
    if (piece && pieceFitsAnywhere(board, piece)) return true;
  }
  return false;
}
