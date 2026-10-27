import { describe, expect, it } from 'vitest';
import { createEmptyBoard, findClears, type ClearResult } from './board';
import { scorePlacement } from './scoring';
import type { PieceDef } from './pieces';

function piece(cells: number): PieceDef {
  return {
    id: `n${cells}`,
    cells: Array.from({ length: cells }, (_, i) => ({ r: 0, c: i })),
    weight: 1,
  };
}

function clears(count: number): ClearResult {
  return {
    rows: Array.from({ length: count }, (_, i) => i),
    cols: [],
    regions: [],
    cells: [],
    clearCount: count,
  };
}

describe('scorePlacement', () => {
  it('scores one point per cell and nothing else when nothing clears', () => {
    const scored = scorePlacement(piece(3), clears(0), 4);
    expect(scored.placePoints).toBe(3);
    expect(scored.clearPoints).toBe(0);
    expect(scored.comboBonus).toBe(0);
    expect(scored.streakBonus).toBe(0);
    expect(scored.total).toBe(3);
    expect(scored.comboMultiplier).toBe(1);
    expect(scored.streak).toBe(0);
  });

  it('adds 18 per row, column, or region', () => {
    const one = scorePlacement(piece(3), clears(1), 0);
    expect(one.clearPoints).toBe(18);
    expect(one.comboBonus).toBe(0);
    expect(one.comboMultiplier).toBe(1);
    expect(one.streak).toBe(1);
    expect(one.streakBonus).toBe(0);
    expect(one.total).toBe(21);

    const four = scorePlacement(piece(1), clears(4), 0);
    expect(four.clearPoints).toBe(72);
    expect(four.comboBonus).toBe(3 * 10 * 4);
    expect(four.comboMultiplier).toBe(4);
  });

  it('pays the combo bonus only once two or more lines clear', () => {
    const scored = scorePlacement(piece(2), clears(3), 4);
    expect(scored.comboBonus).toBe(2 * 10 * 3);
    expect(scored.comboMultiplier).toBe(3);
    expect(scored.streak).toBe(5);
    expect(scored.streakBonus).toBe(5 * 5);
    expect(scored.clearPoints).toBe(54);
    expect(scored.total).toBe(2 + 54 + 60 + 25);
  });

  it('adds the streak bonus from the second clear-move onward', () => {
    const first = scorePlacement(piece(1), clears(2), 0);
    expect(first.streak).toBe(1);
    expect(first.streakBonus).toBe(0);
    expect(first.comboBonus).toBe(20);

    const next = scorePlacement(piece(4), clears(1), 1);
    expect(next.streak).toBe(2);
    expect(next.streakBonus).toBe(10);
    expect(next.total).toBe(4 + 18 + 10);
  });
});

describe('findClears', () => {
  it('finds a full row, column, and 3x3 region', () => {
    const rowBoard = createEmptyBoard();
    for (let c = 0; c < 9; c++) rowBoard[4]![c] = 1;
    const row = findClears(rowBoard);
    expect(row.rows).toEqual([4]);
    expect(row.cols).toEqual([]);
    expect(row.regions).toEqual([]);
    expect(row.clearCount).toBe(1);
    expect(row.cells).toHaveLength(9);

    const colBoard = createEmptyBoard();
    for (let r = 0; r < 9; r++) colBoard[r]![2] = 1;
    const col = findClears(colBoard);
    expect(col.cols).toEqual([2]);
    expect(col.clearCount).toBe(1);
    expect(col.cells).toHaveLength(9);

    const regionBoard = createEmptyBoard();
    for (let r = 3; r < 6; r++) {
      for (let c = 3; c < 6; c++) regionBoard[r]![c] = 1;
    }
    const region = findClears(regionBoard);
    expect(region.regions).toEqual([{ br: 1, bc: 1 }]);
    expect(region.rows).toEqual([]);
    expect(region.cols).toEqual([]);
    expect(region.clearCount).toBe(1);
    expect(region.cells).toHaveLength(9);
  });

  it('counts overlapping lines once in the cell list and once per line in clearCount', () => {
    const board = createEmptyBoard();
    for (let c = 0; c < 9; c++) board[0]![c] = 1;
    for (let r = 0; r < 9; r++) board[r]![0] = 1;
    const crossed = findClears(board);
    expect(crossed.rows).toEqual([0]);
    expect(crossed.cols).toEqual([0]);
    expect(crossed.clearCount).toBe(2);
    expect(crossed.cells).toHaveLength(17);
    const keys = crossed.cells.map((cell) => `${cell.r},${cell.c}`);
    expect(new Set(keys).size).toBe(17);
    expect(keys).toContain('0,0');

    const region = createEmptyBoard();
    for (let c = 0; c < 9; c++) region[0]![c] = 1;
    for (let r = 1; r <= 2; r++) {
      for (let c = 0; c <= 2; c++) region[r]![c] = 1;
    }
    const overlap = findClears(region);
    expect(overlap.rows).toEqual([0]);
    expect(overlap.regions).toEqual([{ br: 0, bc: 0 }]);
    expect(overlap.cols).toEqual([]);
    expect(overlap.clearCount).toBe(2);
    expect(overlap.cells).toHaveLength(15);
    expect(new Set(overlap.cells.map((cell) => `${cell.r},${cell.c}`)).size).toBe(15);
  });
});
