import type { ClearResult } from './board';
import { cellCount, type PieceDef } from './pieces';

export type ScoreBreakdown = {
  placePoints: number;
  clearPoints: number;
  comboBonus: number;
  streakBonus: number;
  /** Flat bonus when this placement leaves the board empty. */
  allClearBonus: number;
  total: number;
  comboMultiplier: number;
  streak: number;
  allClear: boolean;
};

const POINTS_PER_CELL = 1;
const POINTS_PER_CLEAR = 18;
/** Awarded once when a placement wipes the board clean. */
export const ALL_CLEAR_BONUS = 100;
/** Combo: each clear beyond the first adds this × clearCount. */
const COMBO_PER_EXTRA = 10;
/** Streak: after first consecutive clear-move, +5 × streak level. */
const STREAK_BASE = 5;

/**
 * Score one placement + resulting clears.
 * `streakBefore` is the streak going into this move (0 if last place cleared nothing).
 */
export function scorePlacement(
  piece: PieceDef,
  clears: ClearResult,
  streakBefore: number,
  allClear = false,
): ScoreBreakdown {
  const placePoints = cellCount(piece.cells) * POINTS_PER_CELL;
  const n = clears.clearCount;
  const clearPoints = n * POINTS_PER_CLEAR;
  const clearedBoard = allClear && n > 0;
  const allClearBonus = clearedBoard ? ALL_CLEAR_BONUS : 0;

  let comboMultiplier = 1;
  let comboBonus = 0;
  if (n >= 2) {
    comboMultiplier = n;
    comboBonus = (n - 1) * COMBO_PER_EXTRA * n;
  }

  let streak = streakBefore;
  let streakBonus = 0;
  if (n > 0) {
    streak = streakBefore + 1;
    if (streak >= 2) {
      streakBonus = STREAK_BASE * streak;
    }
  } else {
    streak = 0;
  }

  const total = placePoints + clearPoints + comboBonus + streakBonus + allClearBonus;
  return {
    placePoints,
    clearPoints,
    comboBonus,
    streakBonus,
    allClearBonus,
    total,
    comboMultiplier,
    streak,
    allClear: clearedBoard,
  };
}
