import { describe, expect, it } from 'vitest';
import { getWeeklyMandate, WEEKLY_MANDATES } from './expert';
import { hashString } from './rng';

/** Locked to the historical hashWeek output so shipped weeklies do not move. */
const WEEK_MANDATES: Record<string, string> = {
  '2020-W01': 'rising_tide',
  '2024-W52': 'gridlock',
  '2026-W01': 'gridlock',
  '2026-W10': 'precision',
  '2026-W43': 'rising_tide',
};

describe('getWeeklyMandate', () => {
  it('is deterministic for a given week', () => {
    for (const [week, id] of Object.entries(WEEK_MANDATES)) {
      expect(getWeeklyMandate(week).id).toBe(id);
      expect(getWeeklyMandate(week)).toBe(getWeeklyMandate(week));
    }
  });

  it('uses hashString unchanged, so existing week seeds stay put', () => {
    expect(hashString('2026-W01')).toBe(4229294556);
    expect(hashString('2020-W01')).toBe(1256206450);
    expect(hashString('2024-W52')).toBe(2174993754);
    expect(getWeeklyMandate('2026-W01')).toBe(
      WEEKLY_MANDATES[4229294556 % WEEKLY_MANDATES.length],
    );
    expect(getWeeklyMandate('2020-W01')).toBe(
      WEEKLY_MANDATES[1256206450 % WEEKLY_MANDATES.length],
    );
  });
});
