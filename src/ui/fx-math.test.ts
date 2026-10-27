import { describe, expect, it } from 'vitest';
import {
  CALM_SPARK_CAP,
  CONFETTI_COMBO,
  SPARK_CAP,
  confettiBitsForCombo,
  sparkCountForClear,
} from './fx-math';

describe('sparkCountForClear', () => {
  it('keeps a single clear calm', () => {
    expect(sparkCountForClear(9, 1, 1)).toBe(9);
    expect(sparkCountForClear(20, 1, 1)).toBe(CALM_SPARK_CAP);
  });

  it('scales with lines and combo, then caps', () => {
    expect(sparkCountForClear(18, 2, 2)).toBe(24);
    expect(sparkCountForClear(81, 6, 6)).toBe(SPARK_CAP);
    expect(sparkCountForClear(18, 2, 2)).toBeGreaterThan(CALM_SPARK_CAP);
  });

  it('returns 0 when nothing cleared', () => {
    expect(sparkCountForClear(0, 1, 1)).toBe(0);
    expect(sparkCountForClear(9, 0, 1)).toBe(0);
  });
});

describe('confettiBitsForCombo', () => {
  it('stays quiet below combo 4 and uses a small burst at 4+', () => {
    expect(confettiBitsForCombo(1)).toBe(0);
    expect(confettiBitsForCombo(3)).toBe(0);
    expect(confettiBitsForCombo(4)).toBe(CONFETTI_COMBO);
    expect(confettiBitsForCombo(8)).toBe(CONFETTI_COMBO);
  });
});
