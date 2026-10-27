import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyBoard, pieceFitsAnywhere, type Board } from './board';
import { Game } from './game';
import {
  PIECE_CATALOG,
  PIECE_COLORS,
  colorForPiece,
  dealTray,
  pieceBounds,
  type DealOptions,
  type PieceDef,
} from './pieces';
import { createRng } from './rng';

function idsOf(tray: PieceDef[]): string[] {
  return tray.map((piece) => piece.id);
}

function maxSame(ids: string[]): number {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  let max = 0;
  for (const n of counts.values()) if (n > max) max = n;
  return max;
}

function sequence(seed: number, opts?: DealOptions, rolls = 6): string[][] {
  const rng = createRng(seed);
  return Array.from({ length: rolls }, () => idsOf(dealTray(3, () => rng.next(), opts)));
}

function oneHole(): Board {
  const board = createEmptyBoard();
  for (const row of board) row.fill(1);
  board[8]![8] = 0;
  return board;
}

function covers(piece: PieceDef, rows: number, cols: number): void {
  expect(piece.cells).toHaveLength(rows * cols);
  expect(pieceBounds(piece.cells)).toEqual({ rows, cols });
  const keys = new Set(piece.cells.map((cell) => `${cell.r},${cell.c}`));
  expect(keys.size).toBe(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) expect(keys.has(`${r},${c}`)).toBe(true);
  }
}

describe('rectangle pieces', () => {
  it('adds valid 2x3 and 3x2 rectangles with stable colors', () => {
    const ids = PIECE_CATALOG.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);

    const r23 = PIECE_CATALOG.find((piece) => piece.id === 'r23');
    const r32 = PIECE_CATALOG.find((piece) => piece.id === 'r32');
    expect(r23).toBeTruthy();
    expect(r32).toBeTruthy();
    expect(r23!.weight).toBe(3);
    expect(r32!.weight).toBe(3);
    covers(r23!, 2, 3);
    covers(r32!, 3, 2);

    for (const piece of PIECE_CATALOG) {
      const color = colorForPiece(piece);
      expect(color).toBeGreaterThanOrEqual(1);
      expect(color).toBeLessThanOrEqual(PIECE_COLORS);
      expect(colorForPiece(piece)).toBe(color);
    }
  });
});

describe('dealTray', () => {
  it('never deals three identical shapes', () => {
    const options: Array<DealOptions | undefined> = [
      undefined,
      { hard: true, score: 4500 },
      { bias: 'giants', hard: true },
      { bias: 'small' },
    ];
    for (let seed = 0; seed < 50; seed++) {
      const rng = createRng(seed);
      const opts = options[seed % options.length];
      for (let n = 0; n < 20; n++) {
        const tray = dealTray(3, () => rng.next(), opts);
        expect(tray).toHaveLength(3);
        expect(maxSame(idsOf(tray))).toBeLessThan(3);
      }
    }
  });

  it('re-rolls a third copy and still allows a pair', () => {
    expect(idsOf(dealTray(3, () => 0))).toEqual(['dot', 'dot', 'h2']);
  });

  it('repeats the same trays for the same seed', () => {
    expect(sequence(20261026)).toEqual(sequence(20261026));
    expect(sequence(8, { hard: true, score: 3000 })).toEqual(sequence(8, { hard: true, score: 3000 }));

    const hole = oneHole();
    expect(sequence(15, { board: hole })).toEqual(sequence(15, { board: hole }));
    expect(sequence(15, { fits: (piece) => pieceFitsAnywhere(hole, piece) })).toEqual(
      sequence(15, { fits: (piece) => pieceFitsAnywhere(hole, piece) }),
    );
  });

  it('does not spend extra rolls when the first tray already fits', () => {
    const open = createEmptyBoard();
    expect(sequence(4)).toEqual(sequence(4, { board: open }));
    expect(sequence(4)).toEqual(sequence(4, { fits: () => true }));
  });

  it('guarantees a fitting piece on calm deals and not on hard deals', () => {
    const hole = oneHole();
    for (let seed = 0; seed < 24; seed++) {
      const calm = createRng(seed);
      const tray = dealTray(3, () => calm.next(), { board: hole });
      expect(tray.some((piece) => pieceFitsAnywhere(hole, piece))).toBe(true);
      expect(maxSame(idsOf(tray))).toBeLessThan(3);

      const gentleRng = createRng(seed + 100);
      const viaFits = dealTray(3, () => gentleRng.next(), {
        bias: 'small',
        fits: (piece) => pieceFitsAnywhere(hole, piece),
      });
      expect(viaFits.some((piece) => pieceFitsAnywhere(hole, piece))).toBe(true);
    }

    let unfit = 0;
    for (let seed = 0; seed < 24; seed++) {
      const rng = createRng(seed + 500);
      const tray = dealTray(3, () => rng.next(), { hard: true, board: hole });
      expect(maxSame(idsOf(tray))).toBeLessThan(3);
      if (!tray.some((piece) => pieceFitsAnywhere(hole, piece))) unfit += 1;
    }
    expect(unfit).toBeGreaterThan(0);

    expect(sequence(4, { hard: true })).toEqual(
      sequence(4, { hard: true, fits: () => false, board: hole }),
    );
  });

  it('falls back to dot when nothing can fit', () => {
    const run = (seed: number): string[] => {
      const rng = createRng(seed);
      return idsOf(dealTray(3, () => rng.next(), { fits: () => false }));
    };
    const ids = run(11);
    expect(ids).toEqual(run(11));
    expect(ids).toContain('dot');
    expect(maxSame(ids)).toBeLessThan(3);
  });
});

describe('Game deal kindness', () => {
  const parked = PIECE_CATALOG.find((piece) => piece.id === 'sq3')!;

  beforeEach(() => {
    localStorage.clear();
  });

  function dealOnHole(opts: { expert?: boolean; holdOption?: boolean; dealDepth?: 'normal' | 'gentle' | 'deep' }): string[] {
    const game = new Game();
    game.configure('classic', opts);
    game.newGame();
    for (const row of game.board) row.fill(1);
    game.board[8]![8] = 0;
    game.tray = [parked, null, null];
    game.hold = null;
    const swapped = game.swapHold(0);
    expect(swapped).toEqual({ ok: true, dealt: true });
    const ids = game.tray.map((piece) => piece?.id ?? '');
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(maxSame(ids)).toBeLessThan(3);
    return ids;
  }

  function fitsHole(ids: string[], hole: Board): boolean {
    return ids.some((id) => {
      const piece = PIECE_CATALOG.find((item) => item.id === id);
      return !!piece && pieceFitsAnywhere(hole, piece);
    });
  }

  it('gives calm and gentle trays a piece that fits, and not deep or expert', () => {
    const hole = oneHole();
    for (let n = 0; n < 8; n++) {
      expect(fitsHole(dealOnHole({ holdOption: true }), hole)).toBe(true);
      expect(fitsHole(dealOnHole({ holdOption: true, dealDepth: 'gentle' }), hole)).toBe(true);
    }

    let hardMiss = 0;
    for (let n = 0; n < 8; n++) {
      if (!fitsHole(dealOnHole({ holdOption: true, dealDepth: 'deep' }), hole)) hardMiss += 1;
      if (!fitsHole(dealOnHole({ expert: true }), hole)) hardMiss += 1;
    }
    expect(hardMiss).toBeGreaterThan(0);
  });
});
