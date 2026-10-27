/** Single-line clears stay at the original calm density. */
export const CALM_SPARK_CAP = 12;
/** Combo clears can grow, but not into a storm. */
export const SPARK_CAP = 28;
/** Personal-best celebration. */
export const CONFETTI_BURST = 28;
/** Smaller burst for a combo of 4 or more. */
export const CONFETTI_COMBO = 12;

function whole(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/**
 * Sparks for one clear.
 * One line at combo 1 keeps the calm cap (one spark per cell, at most 12).
 * Multi-line clears scale with lines and the combo multiplier, up to 28.
 */
export function sparkCountForClear(
  clearedCells: number,
  linesCleared: number,
  comboMultiplier: number,
): number {
  const cells = whole(clearedCells);
  const lines = whole(linesCleared);
  const combo = Math.max(1, whole(comboMultiplier));
  if (cells === 0 || lines === 0) return 0;
  if (lines <= 1 && combo <= 1) return Math.min(CALM_SPARK_CAP, cells);
  const base = Math.min(cells, CALM_SPARK_CAP);
  const scaled = Math.round((base * (lines + combo)) / 2);
  return Math.min(SPARK_CAP, Math.max(base, scaled));
}

/** Bits for a combo celebration. Zero unless the combo is at least 4. */
export function confettiBitsForCombo(comboMultiplier: number): number {
  return whole(comboMultiplier) >= 4 ? CONFETTI_COMBO : 0;
}
