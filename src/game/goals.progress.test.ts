import { describe, expect, it } from 'vitest';
import { formatGoalProgress, GOALS, type GoalDef } from './goals';
import { addDays, todayKey } from './rng';
import { defaultProfile, longestDailyStreak, type Profile } from './stats';

function goal(id: string): GoalDef {
  const found = GOALS.find((item) => item.id === id);
  if (!found?.progress) throw new Error(`missing progress for ${id}`);
  return found;
}

function consecutiveEndingToday(count: number): string[] {
  const today = todayKey();
  return Array.from({ length: count }, (_, index) => addDays(today, -index));
}

describe('formatGoalProgress', () => {
  it('shows the count and caps a value past the target', () => {
    expect(formatGoalProgress({ value: 47, target: 100 })).toBe('47 / 100');
    expect(formatGoalProgress({ value: 120, target: 100 })).toBe('100 / 100');
    expect(formatGoalProgress({ value: 12500, target: 25000 })).toBe('12,500 / 25,000');
    expect(formatGoalProgress({ value: -3, target: 100 })).toBe('0 / 100');
    expect(formatGoalProgress({ value: Number.NaN, target: 10 })).toBe('0 / 10');
  });
});

describe('goal progress', () => {
  it('reports pieces, clears, games, and cells toward their targets', () => {
    const profile = defaultProfile();
    profile.stats.piecesPlaced = 47;
    profile.stats.linesCleared = 12;
    profile.stats.gamesPlayed = 3;
    profile.stats.cellsCleared = 400;
    expect(goal('pieces_100').progress!(profile)).toEqual({ value: 47, target: 100 });
    expect(goal('pieces_500').progress!(profile)).toEqual({ value: 47, target: 500 });
    expect(goal('pieces_1000').progress!(profile)).toEqual({ value: 47, target: 1000 });
    expect(goal('clears_50').progress!(profile)).toEqual({ value: 12, target: 50 });
    expect(goal('games_10').progress!(profile)).toEqual({ value: 3, target: 10 });
    expect(goal('cells_25000').progress!(profile)).toEqual({ value: 400, target: 25000 });
    expect(goal('pieces_100').check(profile)).toBe(false);
    expect(goal('pieces_1000').unlocksTheme).toBe('ember');
    expect(goal('cells_25000').unlocksTheme).toBe('mono');
  });

  it('counts the current daily streak apart from total finishes', () => {
    const today = todayKey();
    const profile = defaultProfile();
    profile.stats.dailyDates = [addDays(today, -2), addDays(today, -3)];
    expect(goal('daily_streak_3').progress!(profile)).toEqual({ value: 0, target: 3 });
    expect(goal('daily_streak_7').progress!(profile)).toEqual({ value: 0, target: 7 });
    expect(goal('daily_streak_3').check(profile)).toBe(false);
    expect(goal('daily_30').progress!(profile)).toEqual({ value: 2, target: 30 });
    expect(goal('daily_30').check(profile)).toBe(false);
    expect(goal('daily_first').check(profile)).toBe(true);
    expect(goal('daily_first').progress!(profile).value).toBe(2);
    expect(goal('daily_30').unlocksTheme).toBe('aurora');

    profile.stats.dailyDates = consecutiveEndingToday(7);
    expect(goal('daily_streak_3').progress!(profile)).toEqual({ value: 7, target: 3 });
    expect(goal('daily_streak_3').check(profile)).toBe(true);
    expect(goal('daily_streak_7').check(profile)).toBe(true);
    expect(goal('daily_30').progress!(profile)).toEqual({ value: 7, target: 30 });
    expect(goal('daily_30').check(profile)).toBe(false);
  });

  it('leaves best-score awards without a count bar', () => {
    for (const id of ['score_500', 'score_2000', 'score_5000', 'score_8000', 'expert_daily', 'blitz_800']) {
      expect(GOALS.find((item) => item.id === id)?.progress, id).toBeUndefined();
    }
  });

  it('crosses each count trophy at the same number the check uses', () => {
    const counters: { id: string; apply: (profile: Profile, count: number) => void }[] = [
      { id: 'combo_3', apply: (profile, count) => { profile.stats.maxCombo = count; } },
      { id: 'combo_4', apply: (profile, count) => { profile.stats.maxCombo = count; } },
      { id: 'combo_5', apply: (profile, count) => { profile.stats.maxCombo = count; } },
      { id: 'streak_5', apply: (profile, count) => { profile.stats.maxStreak = count; } },
      { id: 'streak_10', apply: (profile, count) => { profile.stats.maxStreak = count; } },
      { id: 'pieces_100', apply: (profile, count) => { profile.stats.piecesPlaced = count; } },
      { id: 'pieces_500', apply: (profile, count) => { profile.stats.piecesPlaced = count; } },
      { id: 'pieces_1000', apply: (profile, count) => { profile.stats.piecesPlaced = count; } },
      { id: 'clears_50', apply: (profile, count) => { profile.stats.linesCleared = count; } },
      { id: 'cells_25000', apply: (profile, count) => { profile.stats.cellsCleared = count; } },
      { id: 'games_10', apply: (profile, count) => { profile.stats.gamesPlayed = count; } },
      { id: 'daily_first', apply: (profile, count) => { profile.stats.dailyDates = consecutiveEndingToday(count); } },
      { id: 'daily_streak_3', apply: (profile, count) => { profile.stats.dailyDates = consecutiveEndingToday(count); } },
      { id: 'daily_streak_7', apply: (profile, count) => { profile.stats.dailyDates = consecutiveEndingToday(count); } },
      { id: 'daily_30', apply: (profile, count) => { profile.stats.dailyDates = consecutiveEndingToday(count); } },
      { id: 'weekly_first', apply: (profile, count) => { profile.stats.weeklyKeys = Array.from({ length: count }, (_, index) => `2026-W${index}`); } },
      {
        id: 'puzzler',
        apply: (profile, count) => {
          profile.puzzlesSolved = {};
          for (let i = 0; i < count; i++) profile.puzzlesSolved[`p${i}`] = { moves: 1 };
        },
      },
    ];

    for (const counter of counters) {
      const item = goal(counter.id);
      const target = item.progress!(defaultProfile()).target;
      const below = defaultProfile();
      counter.apply(below, target - 1);
      expect(item.progress!(below), counter.id).toEqual({ value: target - 1, target });
      expect(item.check(below), counter.id).toBe(false);
      const hit = defaultProfile();
      counter.apply(hit, target);
      expect(item.progress!(hit).value, counter.id).toBeGreaterThanOrEqual(target);
      expect(item.check(hit), counter.id).toBe(true);
    }
  });

  it('treats a negative stored count as zero progress', () => {
    const profile = defaultProfile();
    profile.stats.piecesPlaced = -4;
    expect(goal('pieces_100').progress!(profile)).toEqual({ value: 0, target: 100 });
  });
});

describe('longestDailyStreak', () => {
  function withDates(...keys: string[]): Profile {
    const profile = defaultProfile();
    profile.stats.dailyDates = keys;
    return profile;
  }

  it('finds the longest run, including ones that already ended', () => {
    expect(longestDailyStreak(withDates())).toBe(0);
    expect(longestDailyStreak(withDates('2026-06-10'))).toBe(1);
    expect(longestDailyStreak(withDates('2026-06-12', '2026-06-10', '2026-06-11'))).toBe(3);
    expect(longestDailyStreak(withDates('2026-06-01', '2026-06-03'))).toBe(1);
    expect(longestDailyStreak(withDates('2026-06-10', '2026-06-10', '2026-06-11'))).toBe(2);
    expect(longestDailyStreak(withDates('2026-01-01', 'nope', '2026-02-31', '2026-01-02'))).toBe(2);

    const january = Array.from({ length: 5 }, (_, index) => addDays('2026-01-01', index));
    const june = ['2026-06-10', '2026-06-11'];
    expect(longestDailyStreak(withDates(...june, ...january))).toBe(5);
    expect(longestDailyStreak(withDates('2024-02-28', '2024-03-01', '2024-02-29'))).toBe(3);
    expect(longestDailyStreak(withDates('2023-02-28', '2023-03-01'))).toBe(2);
  });
});
