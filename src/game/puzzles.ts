import { PIECE_CATALOG, type PieceDef } from './pieces';

/**
 * Hand-crafted puzzle packs.
 *
 * Boards are 9 strings of '.' (empty) and '#' (filled). Trays are fixed;
 * when the sequence runs out, the puzzle fails unless the objective is met.
 * Shapes are small and gaps are few so a solver can prove each one quickly.
 *
 * In-progress play is one local save (`clearnine-save-puzzle`), resumed when
 * that same puzzle is opened again. The save is not a Home Continue game and
 * is not part of the backup allow-list — a restore keeps solved puzzles
 * (they live on the profile) and the next open of an unfinished puzzle
 * starts over if that local save is gone. Undo history is not stored;
 * the undo budget is.
 */
export type PieceId = (typeof PIECE_CATALOG)[number]['id'];

export type PuzzleObjective =
  | { type: 'clearLines'; n: number }
  | { type: 'clearAll' }
  | { type: 'clearRegions'; n: number };

export type PuzzleBoard = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

export type PuzzleDef = {
  id: string;
  name: string;
  objective: PuzzleObjective;
  board: PuzzleBoard;
  /** Each tray is three catalog piece ids, dealt in order. */
  trays: PieceId[][];
  parMoves?: number;
};

export type PuzzlePack = {
  id: 'warmup' | 'studio' | 'mastery';
  name: string;
  blurb: string;
  puzzles: PuzzleDef[];
};

/** Generous undo budget for puzzle runs. */
export const PUZZLE_UNDOS = 99;

const DOTS: PieceId[] = ['dot', 'dot', 'dot'];

function asBoard(rows: string[]): PuzzleBoard {
  if (rows.length !== 9 || rows.some((row) => !/^[.#]{9}$/.test(row))) {
    throw new Error(`bad puzzle board ${rows.join('|')}`);
  }
  return rows as unknown as PuzzleBoard;
}

/** One nearly full row. `holes` are the empty columns. */
function loneRows(specs: Array<{ r: number; holes: number[] }>): PuzzleBoard {
  const rows = Array.from({ length: 9 }, () => '.........');
  for (const spec of specs) {
    const cells = Array.from({ length: 9 }, () => '#');
    for (const col of spec.holes) cells[col] = '.';
    rows[spec.r] = cells.join('');
  }
  return asBoard(rows);
}

/** One nearly full column (column 0). `holes` are the empty rows. */
function loneColumn(holes: number[]): PuzzleBoard {
  const rows = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => '.'));
  const skip = new Set(holes);
  for (let r = 0; r < 9; r++) {
    if (!skip.has(r)) rows[r]![0] = '#';
  }
  return asBoard(rows.map((row) => row.join('')));
}

/**
 * Full 3×3 blocks with a few holes punched out. The rest of the board stays
 * empty, so a line cannot fill until a block itself is finished.
 */
function boxed(
  blocks: Array<{ r0: number; c0: number; holes: Array<[number, number]> }>,
): PuzzleBoard {
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => '.'));
  for (const block of blocks) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) grid[block.r0 + r]![block.c0 + c] = '#';
    }
    for (const [r, c] of block.holes) grid[r]![c] = '.';
  }
  return asBoard(grid.map((row) => row.join('')));
}

function puzzle(
  id: string,
  name: string,
  objective: PuzzleObjective,
  board: PuzzleBoard,
  trays: PieceId[][],
  parMoves: number,
): PuzzleDef {
  return { id, name, objective, board, trays, parMoves };
}

const WARMUP: PuzzleDef[] = [
  puzzle('w1', 'First Spark', { type: 'clearLines', n: 1 }, loneRows([{ r: 0, holes: [8] }]), [DOTS], 1),
  puzzle(
    'w2',
    'Little Domino',
    { type: 'clearLines', n: 1 },
    loneRows([{ r: 0, holes: [7, 8] }]),
    [['h2', 'dot', 'dot']],
    1,
  ),
  puzzle(
    'w3',
    'Three Across',
    { type: 'clearLines', n: 1 },
    loneRows([{ r: 0, holes: [6, 7, 8] }]),
    [['h3', 'dot', 'dot']],
    1,
  ),
  puzzle('w4', 'Down One', { type: 'clearLines', n: 1 }, loneColumn([8]), [DOTS], 1),
  puzzle(
    'w5',
    'Tall Stack',
    { type: 'clearLines', n: 1 },
    loneColumn([6, 7, 8]),
    [['v3', 'dot', 'dot']],
    1,
  ),
  puzzle(
    'w6',
    'One Box',
    { type: 'clearRegions', n: 1 },
    boxed([{ r0: 0, c0: 0, holes: [[2, 2]] }]),
    [DOTS],
    1,
  ),
  puzzle(
    'w7',
    'Open Corner',
    { type: 'clearAll' },
    boxed([{ r0: 0, c0: 0, holes: [[0, 0]] }]),
    [DOTS],
    1,
  ),
  puzzle(
    'w8',
    'Elbow',
    { type: 'clearRegions', n: 1 },
    boxed([{ r0: 0, c0: 0, holes: [[0, 0], [1, 0], [1, 1]] }]),
    [['l3a', 'dot', 'dot']],
    1,
  ),
];

const STUDIO: PuzzleDef[] = [
  puzzle(
    's1',
    'Split Row',
    { type: 'clearLines', n: 1 },
    loneRows([{ r: 0, holes: [3, 7] }]),
    [DOTS],
    2,
  ),
  puzzle(
    's2',
    'Two Boxes',
    { type: 'clearRegions', n: 2 },
    boxed([
      { r0: 0, c0: 0, holes: [[2, 2]] },
      { r0: 3, c0: 3, holes: [[5, 5]] },
    ]),
    [DOTS],
    2,
  ),
  puzzle(
    's3',
    'Bottom Edge',
    { type: 'clearAll' },
    boxed([{ r0: 0, c0: 0, holes: [[2, 0], [2, 1], [2, 2]] }]),
    [DOTS],
    3,
  ),
  puzzle(
    's4',
    'Diagonals',
    { type: 'clearAll' },
    boxed([{ r0: 0, c0: 0, holes: [[0, 0], [2, 2]] }]),
    [DOTS],
    2,
  ),
  puzzle('s5', 'Split Column', { type: 'clearLines', n: 1 }, loneColumn([2, 6]), [DOTS], 2),
  puzzle(
    's6',
    'Bend',
    { type: 'clearRegions', n: 1 },
    boxed([{ r0: 0, c0: 0, holes: [[0, 0], [1, 0], [1, 1]] }]),
    [DOTS],
    3,
  ),
  puzzle(
    's7',
    'Four Corners',
    { type: 'clearAll' },
    boxed([{ r0: 0, c0: 0, holes: [[0, 0], [0, 2], [2, 0], [2, 2]] }]),
    [DOTS, DOTS],
    4,
  ),
  puzzle(
    's8',
    'Two Rows',
    { type: 'clearLines', n: 2 },
    loneRows([
      { r: 0, holes: [8] },
      { r: 3, holes: [0] },
    ]),
    [DOTS],
    2,
  ),
];

const MASTERY: PuzzleDef[] = [
  puzzle(
    'm1',
    'Three Rows',
    { type: 'clearLines', n: 3 },
    loneRows([
      { r: 0, holes: [8] },
      { r: 3, holes: [0] },
      { r: 6, holes: [4] },
    ]),
    [DOTS],
    3,
  ),
  puzzle(
    'm2',
    'Three Boxes',
    { type: 'clearRegions', n: 3 },
    boxed([
      { r0: 0, c0: 0, holes: [[2, 2]] },
      { r0: 3, c0: 3, holes: [[5, 5]] },
      { r0: 6, c0: 6, holes: [[8, 8]] },
    ]),
    [DOTS],
    3,
  ),
  puzzle(
    'm3',
    'Clear Three',
    { type: 'clearAll' },
    boxed([
      { r0: 0, c0: 6, holes: [[0, 8]] },
      { r0: 3, c0: 0, holes: [[5, 0]] },
      { r0: 6, c0: 3, holes: [[6, 5]] },
    ]),
    [DOTS],
    3,
  ),
  puzzle(
    'm4',
    'Five Lights',
    { type: 'clearRegions', n: 1 },
    boxed([{ r0: 0, c0: 0, holes: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]] }]),
    [DOTS, DOTS],
    5,
  ),
  puzzle(
    'm5',
    'Twin Fields',
    { type: 'clearRegions', n: 2 },
    boxed([
      { r0: 0, c0: 0, holes: [[2, 0], [2, 1], [2, 2]] },
      { r0: 3, c0: 3, holes: [[5, 3], [5, 4], [5, 5]] },
    ]),
    [DOTS, DOTS],
    6,
  ),
  puzzle(
    'm6',
    'Broken Line',
    { type: 'clearLines', n: 1 },
    loneRows([{ r: 0, holes: [2, 5, 8] }]),
    [DOTS],
    3,
  ),
  puzzle(
    'm7',
    'Open Square',
    { type: 'clearAll' },
    boxed([{ r0: 0, c0: 0, holes: [[0, 0], [0, 1], [1, 0], [1, 1]] }]),
    [DOTS, DOTS],
    4,
  ),
  puzzle('m8', 'Deep Column', { type: 'clearLines', n: 1 }, loneColumn([1, 4, 7]), [DOTS], 3),
];

export const PUZZLE_PACKS: PuzzlePack[] = [
  { id: 'warmup', name: 'Warm-up', blurb: 'Easy · one careful drop', puzzles: WARMUP },
  { id: 'studio', name: 'Studio', blurb: 'Medium · a short sequence', puzzles: STUDIO },
  { id: 'mastery', name: 'Mastery', blurb: 'Hard · every piece matters', puzzles: MASTERY },
];

export const PUZZLES: PuzzleDef[] = PUZZLE_PACKS.flatMap((pack) => pack.puzzles);

const BY_ID = new Map(PUZZLES.map((puzzle) => [puzzle.id, puzzle]));

export function getPuzzle(id: string): PuzzleDef | undefined {
  return BY_ID.get(id);
}

export function nextPuzzleId(id: string): string | null {
  const index = PUZZLES.findIndex((puzzle) => puzzle.id === id);
  if (index < 0 || index + 1 >= PUZZLES.length) return null;
  return PUZZLES[index + 1]!.id;
}

export function pieceById(id: string): PieceDef | undefined {
  return PIECE_CATALOG.find((piece) => piece.id === id);
}

export function boardFromRows(rows: readonly string[]): number[][] {
  return rows.map((row) => [...row].map((cell) => (cell === '#' ? 1 : 0)));
}

export function describeObjective(objective: PuzzleObjective): string {
  if (objective.type === 'clearLines') {
    return objective.n === 1 ? 'Clear 1 line' : `Clear ${objective.n} lines`;
  }
  if (objective.type === 'clearRegions') {
    return objective.n === 1 ? 'Clear 1 box' : `Clear ${objective.n} boxes`;
  }
  return 'Clear the board';
}

export function formatObjectiveProgress(
  objective: PuzzleObjective,
  lines: number,
  regions: number,
  boardEmpty: boolean,
): string {
  if (objective.type === 'clearLines') {
    const done = Math.max(0, Math.min(lines, objective.n));
    return `${done} / ${objective.n}`;
  }
  if (objective.type === 'clearRegions') {
    const done = Math.max(0, Math.min(regions, objective.n));
    return `${done} / ${objective.n}`;
  }
  return boardEmpty ? 'Done' : 'In progress';
}

export function objectiveMet(
  objective: PuzzleObjective,
  lines: number,
  regions: number,
  boardEmpty: boolean,
): boolean {
  if (objective.type === 'clearLines') return lines >= objective.n;
  if (objective.type === 'clearRegions') return regions >= objective.n;
  return boardEmpty;
}
