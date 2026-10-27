/** Cell offset within a piece shape (row, col). */
export type Cell = { r: number; c: number };

export type PieceDef = {
  id: string;
  cells: Cell[];
  /** Relative weight when dealing (higher = more common). */
  weight: number;
};

/** Color index 1–8 used when painting placed cells. */
export const PIECE_COLORS = 8;

export function pieceBounds(cells: Cell[]): { rows: number; cols: number } {
  let maxR = 0;
  let maxC = 0;
  for (const { r, c } of cells) {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  return { rows: maxR + 1, cols: maxC + 1 };
}

export function cellCount(cells: Cell[]): number {
  return cells.length;
}

/** Original polyomino catalog (fixed orientations — no rotation). */
export const PIECE_CATALOG: PieceDef[] = [
  // Monomino / domino
  { id: 'dot', cells: [{ r: 0, c: 0 }], weight: 6 },
  { id: 'h2', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }], weight: 8 },
  { id: 'v2', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }], weight: 8 },

  // Trominoes
  { id: 'h3', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }], weight: 7 },
  { id: 'v3', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }], weight: 7 },
  { id: 'l3a', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }], weight: 6 },
  { id: 'l3b', cells: [{ r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }], weight: 6 },
  { id: 'l3c', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }], weight: 6 },
  { id: 'l3d', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }], weight: 6 },

  // Squares
  { id: 'sq2', cells: [
    { r: 0, c: 0 }, { r: 0, c: 1 },
    { r: 1, c: 0 }, { r: 1, c: 1 },
  ], weight: 7 },
  { id: 'sq3', cells: [
    { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 },
    { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 },
    { r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 },
  ], weight: 2 },

  // 2×3 / 3×2 rectangles (6 cells — not used by starter previews)
  { id: 'r23', cells: [
    { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 },
    { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 },
  ], weight: 3 },
  { id: 'r32', cells: [
    { r: 0, c: 0 }, { r: 0, c: 1 },
    { r: 1, c: 0 }, { r: 1, c: 1 },
    { r: 2, c: 0 }, { r: 2, c: 1 },
  ], weight: 3 },

  // Straight 4 / 5
  { id: 'h4', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }], weight: 5 },
  { id: 'v4', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }], weight: 5 },
  { id: 'h5', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }], weight: 3 },
  { id: 'v5', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }, { r: 4, c: 0 }], weight: 3 },

  // L tetrominoes
  { id: 'l4a', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 }, { r: 2, c: 1 }], weight: 5 },
  { id: 'l4b', cells: [{ r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 0 }, { r: 2, c: 1 }], weight: 5 },
  { id: 'l4c', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 0 }], weight: 5 },
  { id: 'l4d', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 2 }], weight: 5 },
  { id: 'l4e', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 2, c: 1 }], weight: 4 },
  { id: 'l4f', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 2, c: 0 }], weight: 4 },

  // T / plus-ish
  { id: 't4a', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 1 }], weight: 5 },
  { id: 't4b', cells: [{ r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }], weight: 5 },
  { id: 't4c', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 0 }], weight: 4 },
  { id: 't4d', cells: [{ r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 1 }], weight: 4 },

  // S / Z
  { id: 's4a', cells: [{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 1, c: 0 }, { r: 1, c: 1 }], weight: 4 },
  { id: 's4b', cells: [{ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 1 }], weight: 4 },
  { id: 'z4a', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 1 }, { r: 1, c: 2 }], weight: 4 },
  { id: 'z4b', cells: [{ r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 0 }], weight: 4 },

  // Larger L / corner
  { id: 'corner5', cells: [
    { r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 },
    { r: 2, c: 1 }, { r: 2, c: 2 },
  ], weight: 3 },
  { id: 'corner5b', cells: [
    { r: 0, c: 2 }, { r: 1, c: 2 }, { r: 2, c: 0 },
    { r: 2, c: 1 }, { r: 2, c: 2 },
  ], weight: 3 },
  { id: 'u5', cells: [
    { r: 0, c: 0 }, { r: 0, c: 2 },
    { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 },
  ], weight: 3 },
  { id: 'plus5', cells: [
    { r: 0, c: 1 },
    { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 },
    { r: 2, c: 1 },
  ], weight: 3 },
];

const totalWeight = PIECE_CATALOG.reduce((s, p) => s + p.weight, 0);

export type DealBias = 'giants' | 'small';

export type DealOptions = {
  /** Bias toward larger / awkward pieces. */
  hard?: boolean;
  /** Classic rising pressure — boost large pieces as score climbs. */
  score?: number;
  /** Weekly Mandate deal shape bias. */
  bias?: DealBias;
  /**
   * Occupancy grid (0 = empty). Calm deals guarantee one piece fits.
   * Ignored when `hard` is set, or when `fits` is provided.
   */
  board?: number[][];
  /** Whether a piece can be placed somewhere. Preferred over `board`. */
  fits?: (piece: PieceDef) => boolean;
};

/** At most two copies of one shape in a tray (never three identical). */
const MAX_SAME_SHAPE = 2;
/** Re-rolls of a third identical shape before a catalog fallback. */
const SHAPE_REROLLS = 12;
/** Calm re-deals looking for a piece that fits, then the smallest piece. */
const KINDNESS_REROLLS = 8;

function weightFor(piece: PieceDef, opts?: DealOptions): number {
  let w = piece.weight;
  const size = piece.cells.length;
  if (opts?.bias === 'giants') {
    if (size >= 5) w *= 3.2;
    else if (size >= 4) w *= 2.4;
    else if (size <= 2) w *= 0.35;
    else w *= 0.7;
  } else if (opts?.bias === 'small') {
    if (size <= 2) w *= 2.8;
    else if (size === 3) w *= 1.6;
    else if (size >= 5) w *= 0.35;
    else w *= 0.55;
  } else if (opts?.hard) {
    if (size >= 5) w *= 2.4;
    else if (size >= 4) w *= 1.8;
    else if (size <= 2) w *= 0.55;
  }
  const score = opts?.score ?? 0;
  if (score >= 1500) {
    const tier = Math.min(4, Math.floor(score / 1500));
    if (size >= 5) w *= 1 + tier * 0.35;
    else if (size >= 4) w *= 1 + tier * 0.22;
    else if (size <= 2) w *= Math.max(0.35, 1 - tier * 0.12);
  }
  return w;
}

export function pickRandomPiece(rng: () => number = Math.random, opts?: DealOptions): PieceDef {
  const total = PIECE_CATALOG.reduce((s, p) => s + weightFor(p, opts), 0);
  let roll = rng() * (total || totalWeight);
  for (const piece of PIECE_CATALOG) {
    roll -= weightFor(piece, opts);
    if (roll <= 0) return piece;
  }
  return PIECE_CATALOG[PIECE_CATALOG.length - 1]!;
}

function copiesOf(tray: PieceDef[], id: string): number {
  let n = 0;
  for (const piece of tray) if (piece.id === id) n += 1;
  return n;
}

function smallestPiece(): PieceDef {
  for (const piece of PIECE_CATALOG) {
    if (piece.id === 'dot') return piece;
  }
  let best = PIECE_CATALOG[0]!;
  for (const piece of PIECE_CATALOG) {
    if (piece.cells.length < best.cells.length) best = piece;
  }
  return best;
}

/** True when a calm deal should keep one placeable piece. Hard deals opt out. */
function kindnessActive(opts?: DealOptions): opts is DealOptions {
  if (!opts || opts.hard) return false;
  return typeof opts.fits === 'function' || opts.board != null;
}

function pieceFitsOnBoard(board: number[][], piece: PieceDef): boolean {
  const size = board.length;
  const { rows, cols } = pieceBounds(piece.cells);
  if (rows > size || cols > size) return false;
  for (let r = 0; r <= size - rows; r++) {
    for (let c = 0; c <= size - cols; c++) {
      let ok = true;
      for (const cell of piece.cells) {
        const row = board[r + cell.r];
        const bc = c + cell.c;
        if (!row || bc >= row.length || row[bc] !== 0) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }
  return false;
}

function pieceCanFit(piece: PieceDef, opts: DealOptions): boolean {
  if (opts.fits) return opts.fits(piece);
  if (opts.board) return pieceFitsOnBoard(opts.board, piece);
  return true;
}

/** Draw one shape, re-rolling a third copy with the same rng. */
function pickAllowed(rng: () => number, opts: DealOptions | undefined, tray: PieceDef[]): PieceDef {
  let piece = pickRandomPiece(rng, opts);
  let spins = 0;
  while (copiesOf(tray, piece.id) >= MAX_SAME_SHAPE && spins < SHAPE_REROLLS) {
    piece = pickRandomPiece(rng, opts);
    spins += 1;
  }
  if (copiesOf(tray, piece.id) >= MAX_SAME_SHAPE) {
    const alt = PIECE_CATALOG.find((p) => copiesOf(tray, p.id) < MAX_SAME_SHAPE);
    if (alt) return alt;
  }
  return piece;
}

function dealRaw(count: number, rng: () => number, opts?: DealOptions): PieceDef[] {
  const tray: PieceDef[] = [];
  for (let i = 0; i < count; i++) tray.push(pickAllowed(rng, opts, tray));
  return tray;
}

function withSmallestFallback(tray: PieceDef[]): PieceDef[] {
  const small = smallestPiece();
  const next = tray.slice();
  if (next.length === 0 || copiesOf(next, small.id) >= MAX_SAME_SHAPE) return next;
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]!.id !== small.id) {
      next[i] = small;
      return next;
    }
  }
  return next;
}

export function dealTray(
  count = 3,
  rng: () => number = Math.random,
  opts?: DealOptions,
): PieceDef[] {
  if (!kindnessActive(opts)) return dealRaw(count, rng, opts);

  let tray = dealRaw(count, rng, opts);
  let tries = 0;
  while (!tray.some((piece) => pieceCanFit(piece, opts)) && tries < KINDNESS_REROLLS) {
    tray = dealRaw(count, rng, opts);
    tries += 1;
  }
  if (!tray.some((piece) => pieceCanFit(piece, opts))) {
    tray = withSmallestFallback(tray);
  }
  return tray;
}

/** Assign a stable color index (1–PIECE_COLORS) from piece id. */
export function colorForPiece(piece: PieceDef): number {
  let hash = 0;
  for (let i = 0; i < piece.id.length; i++) {
    hash = (hash * 31 + piece.id.charCodeAt(i)) >>> 0;
  }
  return (hash % PIECE_COLORS) + 1;
}
