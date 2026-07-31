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
};

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

export function dealTray(
  count = 3,
  rng: () => number = Math.random,
  opts?: DealOptions,
): PieceDef[] {
  return Array.from({ length: count }, () => pickRandomPiece(rng, opts));
}

/** Assign a stable color index (1–PIECE_COLORS) from piece id. */
export function colorForPiece(piece: PieceDef): number {
  let hash = 0;
  for (let i = 0; i < piece.id.length; i++) {
    hash = (hash * 31 + piece.id.charCodeAt(i)) >>> 0;
  }
  return (hash % PIECE_COLORS) + 1;
}
