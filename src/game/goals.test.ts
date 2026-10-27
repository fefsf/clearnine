import { describe, expect, it } from 'vitest';
import { evaluateGoals, GOALS } from './goals';
import { addDays, todayKey } from './rng';
import { dailyPlayStreak, defaultProfile, type Profile } from './stats';

function profile(): Profile {
  return defaultProfile();
}

function idsOf(p: Profile): string[] {
  return evaluateGoals(p).map((goal) => goal.id);
}

describe('evaluateGoals', () => {
  it('unlocks score trophies from any mode and keeps theme rewards', () => {
    const blitz = profile();
    blitz.bestBlitz = 500;
    const blitzGoals = evaluateGoals(blitz);
    expect(blitzGoals.map((goal) => goal.id)).toContain('score_500');
    expect(blitzGoals.find((goal) => goal.id === 'score_500')?.unlocksTheme).toBe('sunset');
    expect(blitz.bestClassic).toBe(0);

    const daily = profile();
    daily.bestDaily['2026-01-02'] = 2000;
    expect(idsOf(daily)).toEqual(expect.arrayContaining(['score_500', 'score_2000']));

    const expertDaily = profile();
    expertDaily.bestDailyExpert['2026-01-02'] = 5000;
    const expertGoals = evaluateGoals(expertDaily);
    expect(expertGoals.find((goal) => goal.id === 'score_5000')?.unlocksTheme).toBe('midnight');

    const weekly = profile();
    weekly.bestWeekly['2026-W01'] = 8000;
    expect(idsOf(weekly)).toEqual(
      expect.arrayContaining(['score_500', 'score_2000', 'score_5000', 'score_8000']),
    );

    const classic = profile();
    classic.bestClassicExpert = 8000;
    expect(idsOf(classic)).toContain('score_8000');
    expect(GOALS.find((goal) => goal.id === 'score_8000')?.description).toBe(
      'Score 8,000 in Play (any mode)',
    );
  });

  it('does not unlock score trophies below the threshold', () => {
    const p = profile();
    p.bestClassic = 499;
    p.bestClassicExpert = 499;
    p.bestBlitz = 499;
    p.bestDaily['2026-01-02'] = 499;
    p.bestDailyExpert['2026-01-02'] = 499;
    p.bestWeekly['2026-W01'] = 499;
    expect(idsOf(p)).not.toContain('score_500');
  });

  it('unlocks each goal once when its condition is met', () => {
    const p = profile();
    p.stats.maxCombo = 5;
    p.stats.maxStreak = 10;
    p.stats.piecesPlaced = 500;
    p.stats.linesCleared = 50;
    p.stats.gamesPlayed = 10;
    const today = todayKey();
    p.stats.dailyDates = Array.from({ length: 7 }, (_, index) => addDays(today, -index));
    p.stats.weeklyKeys = ['2026-W01'];
    p.bestDailyExpert['2026-06-10'] = 1500;
    p.bestBlitz = 800;

    const first = idsOf(p);
    expect(first).toEqual(
      expect.arrayContaining([
        'combo_3',
        'combo_4',
        'combo_5',
        'streak_5',
        'streak_10',
        'pieces_100',
        'pieces_500',
        'clears_50',
        'games_10',
        'daily_first',
        'daily_streak_3',
        'daily_streak_7',
        'expert_daily',
        'weekly_first',
        'blitz_800',
      ]),
    );
    expect(idsOf(p)).toEqual([]);

    const almost = profile();
    almost.stats.maxCombo = 2;
    almost.stats.maxStreak = 4;
    almost.stats.piecesPlaced = 99;
    almost.stats.linesCleared = 49;
    almost.stats.gamesPlayed = 9;
    almost.bestDailyExpert['2026-06-10'] = 1499;
    almost.bestBlitz = 799;
    const missed = idsOf(almost);
    for (const id of ['combo_3', 'streak_5', 'pieces_100', 'clears_50', 'games_10', 'expert_daily', 'blitz_800', 'weekly_first']) {
      expect(missed).not.toContain(id);
    }
  });
});

describe('dailyPlayStreak', () => {
  const today = '2026-06-10';

  function dates(...keys: string[]): Profile {
    const p = profile();
    p.stats.dailyDates = keys;
    return p;
  }

  it('counts through today, or through yesterday when today is unfinished', () => {
    expect(dailyPlayStreak(dates(), today)).toBe(0);
    expect(dailyPlayStreak(dates(today), today)).toBe(1);
    expect(dailyPlayStreak(dates(addDays(today, -1)), today)).toBe(1);
    expect(dailyPlayStreak(dates(today, addDays(today, -1), addDays(today, -2)), today)).toBe(3);
    expect(dailyPlayStreak(dates(addDays(today, -1), addDays(today, -2)), today)).toBe(2);
    expect(dailyPlayStreak(dates(addDays(today, -2)), today)).toBe(0);
    expect(dailyPlayStreak(dates(today, addDays(today, -2)), today)).toBe(1);
  });
});
