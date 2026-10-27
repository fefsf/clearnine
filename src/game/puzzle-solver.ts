import {
  applyClears,
  canPlace,
  cloneBoard,
  findClears,
  placePiece,
  type Board,
} from './board';
import { pieceBounds, type PieceDef } from './pieces';
import {
  boardFromRows,
  objectiveMet,
  pieceById,
  type PuzzleDef,
} from './puzzles';

export type PuzzleMove = { slot: number; row: number; col: number };

const NODE_CAP = 80_000;

function boardEmpty(board: Board): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell !== 0) return false;
    }
  }
  return true;
}

function regionEmpties(board: Board, row: number, col: number): number {
  const r0 = Math.floor(row / 3) * 3;
  const c0 = Math.floor(col / 3) * 3;
  let empty = 0;
  for (let r = r0; r < r0 + 3; r++) {
    for (let c = c0; c < c0 + 3; c++) {
      if (board[r]![c] === 0) empty += 1;
    }
  }
  return empty;
}

/** Prefer gaps in nearly finished boxes, then moves that actually clear. */
function moveScore(board: Board, piece: PieceDef, row: number, col: number): number {
  let score = 0;
  const covered = new Set<string>();
  for (const cell of piece.cells) covered.add(`${row + cell.r},${col + cell.c}`);
  for (const cell of piece.cells) {
    const r = row + cell.r;
    const c = col + cell.c;
    score += (9 - regionEmpties(board, r, c)) * 4;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= 9 || cc >= 9) continue;
      if (covered.has(`${rr},${cc}`)) score += 1;
      else if (board[rr]![cc] !== 0) score += 8;
    }
  }
  const trial = cloneBoard(board);
  placePiece(trial, piece, row, col, 1);
  score += findClears(trial).clearCount * 1000;
  return score;
}

function stamp(board: Board): string {
  let text = '';
  for (const row of board) {
    for (const cell of row) text += cell === 0 ? '.' : '#';
  }
  return text;
}

/**
 * Depth-first search using the game's own placement and clear rules.
 * Returns one objective-satisfying sequence, or null.
 * Throws if the node cap is hit so a too-wide puzzle fails the test fast.
 */
export function solvePuzzle(puzzle: PuzzleDef): PuzzleMove[] | null {
  const trays: PieceDef[][] = puzzle.trays.map((tray) =>
    tray.map((id) => {
      const piece = pieceById(id);
      if (!piece) throw new Error(`${puzzle.id} unknown piece ${id}`);
      return piece;
    }),
  );
  const seen = new Set<string>();
  let nodes = 0;
  const path: PuzzleMove[] = [];

  function dfs(board: Board, trayIndex: number, mask: number, lines: number, regions: number): boolean {
    if (objectiveMet(puzzle.objective, lines, regions, boardEmpty(board))) return true;
    if (trayIndex >= trays.length) return false;
    const key = `${trayIndex}:${mask}:${lines}:${regions}:${stamp(board)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    nodes += 1;
    if (nodes > NODE_CAP) {
      throw new Error(`solver node cap on ${puzzle.id}`);
    }

    const tray = trays[trayIndex]!;
    const options: Array<PuzzleMove & { score: number }> = [];
    for (let slot = 0; slot < tray.length; slot++) {
      if (mask & (1 << slot)) continue;
      const piece = tray[slot]!;
      const { rows, cols } = pieceBounds(piece.cells);
      for (let row = 0; row <= 9 - rows; row++) {
        for (let col = 0; col <= 9 - cols; col++) {
          if (!canPlace(board, piece, row, col)) continue;
          options.push({ slot, row, col, score: moveScore(board, piece, row, col) });
        }
      }
    }
    options.sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col || a.slot - b.slot);

    for (const option of options) {
      const next = cloneBoard(board);
      const piece = tray[option.slot]!;
      placePiece(next, piece, option.row, option.col, 1);
      const clears = findClears(next);
      let nextLines = lines;
      let nextRegions = regions;
      if (clears.clearCount > 0) {
        nextLines += clears.rows.length + clears.cols.length;
        nextRegions += clears.regions.length;
        applyClears(next, clears);
      }
      path.push({ slot: option.slot, row: option.row, col: option.col });
      const nextMask = mask | (1 << option.slot);
      const filledTray = nextMask === (1 << tray.length) - 1;
      const ok = dfs(
        next,
        filledTray ? trayIndex + 1 : trayIndex,
        filledTray ? 0 : nextMask,
        nextLines,
        nextRegions,
      );
      if (ok) return true;
      path.pop();
    }
    return false;
  }

  const board = boardFromRows(puzzle.board);
  if (!dfs(board, 0, 0, 0, 0)) return null;
  return path;
}
