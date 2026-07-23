import type { ClearResult } from './board';
import { cellCount, type PieceDef } from './pieces';

export type ScoreBreakdown = {
  placePoints: number;
  clearPoints: number;
  comboBonus: number;
  streakBonus: number;
  total: number;
  comboMultiplier: number;
  streak: number;
};

const POINTS_PER_CELL = 1;
const POINTS_PER_CLEAR = 18;
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
): ScoreBreakdown {
  const placePoints = cellCount(piece.cells) * POINTS_PER_CELL;
  const n = clears.clearCount;
  const clearPoints = n * POINTS_PER_CLEAR;

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

  const total = placePoints + clearPoints + comboBonus + streakBonus;
  return {
    placePoints,
    clearPoints,
    comboBonus,
    streakBonus,
    total,
    comboMultiplier,
    streak,
  };
}
