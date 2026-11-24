// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '../app/backup';
import { isReleaseApkUrl } from '../app/apk-installer';
import { boardNameProblem, cleanBoardName } from '../app/leaderboard';
import { renderBoard, renderRecords } from '../ui/screens';
import { weekKey } from './expert';
import { findContinueFor, Game, savedRunSummary, takeExpiredRuns } from './game';
import { addDays, todayKey } from './rng';
import { bankDailyGoal, defaultProfile, migrateProfile } from './stats';

const dot = { id: 'dot', cells: [{ r: 0, c: 0 }], weight: 6 };

function emptyBoard(): number[][] {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
}

function save(over: Record<string, unknown>): Record<string, unknown> {
  const board = emptyBoard();
  board[4]![4] = 1;
  return {
    mode: 'classic',
    board,
    tray: [dot, dot, dot],
    hold: null,
    score: 120,
    streak: 0,
    gameOver: false,
    undosLeft: 1,
    undoStack: [],
    rng: { seed: 3, counter: 0 },
    clearsThisGame: 4,
    expert: false,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('text from a backup shown on screen', () => {
  const payload = '<img src=x onerror=alert(1)>';

  it('drops a recent game whose date is not a date', () => {
    const profile = migrateProfile({
      recentGames: [
        { mode: 'classic', score: 5, cleared: 1, date: payload },
        { mode: 'classic', score: 9, cleared: 1, date: '2026-03-04' },
      ],
    });
    expect(profile.recentGames.map((g) => g.date)).toEqual(['2026-03-04']);
  });

  it('never turns a stored date into markup, even if one slips through', () => {
    const profile = defaultProfile();
    profile.recentGames = [{ mode: 'classic', score: 5, cleared: 1, date: payload }];
    const root = document.createElement('div');
    renderRecords(root, profile, {} as never);
    expect(root.querySelector('.rec-date img')).toBeNull();
    expect(root.querySelector('.rec-date')!.textContent).toBe(payload);
  });

  it('keeps a hostile backup from injecting anything into My Scores', () => {
    const text = JSON.stringify({
      app: 'ClearNine',
      schemaVersion: 1,
      appVersion: '1.14.4',
      exportedAt: '2026-01-01T00:00:00Z',
      data: { 'clearnine-profile': { recentGames: [{ mode: 'classic', score: 5, cleared: 1, date: payload }] } },
    });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const root = document.createElement('div');
    renderRecords(root, migrateProfile(parsed.backup.data['clearnine-profile']), {} as never);
    expect(root.querySelector('img')).toBeNull();
  });

  it('shows leaderboard rank and score as numbers only', () => {
    const root = document.createElement('div');
    renderBoard(root, defaultProfile(), {} as never, {
      tab: 'classic',
      loading: false,
      error: null,
      rows: [{ rank: payload as unknown as number, name: 'Ada', score: payload as unknown as number, you: false }],
      onTab: () => {},
    });
    expect(root.querySelector('.board-list img')).toBeNull();
    expect(root.querySelector('.board-score')!.textContent).toBe('0');
  });
});

describe('leaderboard name', () => {
  it('accepts what the server accepts and explains the rest', () => {
    expect(boardNameProblem('Dave_2')).toBeNull();
    expect(boardNameProblem('José')).toBeNull();
    expect(boardNameProblem('  Ann   B. ')).toBeNull();
    expect(cleanBoardName('  Ann   B. ')).toBe('Ann B.');
    expect(boardNameProblem('')).toMatch(/name/i);
    for (const bad of ['Mom’s', "Mom's", 'Gran!', 'Ann & Bob', 'Anna 😀']) {
      expect(boardNameProblem(bad)).toMatch(/letters/i);
    }
  });
});

describe('update download address', () => {
  it('allows only this project’s release assets', () => {
    expect(isReleaseApkUrl('https://github.com/fefsf/clearnine/releases/download/v1.15.0/ClearNine.apk')).toBe(true);
    expect(isReleaseApkUrl('https://github.com/someone/else/releases/download/v1/evil.apk')).toBe(false);
    expect(isReleaseApkUrl('https://raw.githubusercontent.com/someone/else/main/evil.apk')).toBe(false);
    expect(
      isReleaseApkUrl('https://github.com/fefsf/clearnine/releases/download/../../../../someone/else/evil.apk'),
    ).toBe(false);
    expect(isReleaseApkUrl('https://github.com/fefsf/clearnine/releases/download/%2e%2e/x.apk')).toBe(false);
    expect(isReleaseApkUrl('https://github.com/fefsf/clearnine/releases/download/')).toBe(false);
  });
});

describe('saved games', () => {
  it('starts a new game instead of loading a damaged save', () => {
    localStorage.setItem('clearnine-save-classic', JSON.stringify(save({ board: [[1, 2, 3]] })));
    expect(findContinueFor('classic', false)).toBeNull();
    const game = new Game();
    game.configure('classic');
    expect(game.loadOrNew()).toBe(false);
    expect(game.board).toHaveLength(9);
    expect(game.score).toBe(0);
  });

  it('reports what an unfinished run is worth', () => {
    localStorage.setItem('clearnine-save-classic', JSON.stringify(save({})));
    expect(savedRunSummary('classic', false)).toMatchObject({
      mode: 'classic',
      expert: false,
      score: 120,
      cleared: 4,
      practice: false,
    });
    // Reading the summary must not disturb the save.
    expect(findContinueFor('classic', false)?.score).toBe(120);
  });

  it('marks a Gentle run as practice', () => {
    localStorage.setItem('clearnine-save-classic', JSON.stringify(save({ dealDepth: 'gentle' })));
    expect(savedRunSummary('classic', false)?.practice).toBe(true);
  });

  it('hands back a Daily left unfinished on an earlier day, once', () => {
    const today = todayKey();
    const yesterday = addDays(today, -1);
    localStorage.setItem(
      'clearnine-save-daily',
      JSON.stringify(save({ mode: 'daily', dailyDate: yesterday, score: 340, dailyGoalMet: true })),
    );
    const runs = takeExpiredRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ mode: 'daily', score: 340, date: yesterday, dailyGoalMet: true });
    expect(takeExpiredRuns()).toHaveLength(0);
    expect(localStorage.getItem('clearnine-save-daily')).toBeNull();
  });

  it('leaves today’s Daily and this week’s Weekly alone', () => {
    const today = todayKey();
    localStorage.setItem('clearnine-save-daily', JSON.stringify(save({ mode: 'daily', dailyDate: today })));
    localStorage.setItem(
      'clearnine-save-weekly-expert',
      JSON.stringify(save({ mode: 'weekly', expert: true, weekKey: weekKey() })),
    );
    expect(takeExpiredRuns()).toHaveLength(0);
    expect(localStorage.getItem('clearnine-save-daily')).not.toBeNull();
    expect(localStorage.getItem('clearnine-save-weekly-expert')).not.toBeNull();
  });

  it('does not eat a save dated in the future (clock set back)', () => {
    const tomorrow = addDays(todayKey(), 1);
    localStorage.setItem('clearnine-save-daily', JSON.stringify(save({ mode: 'daily', dailyDate: tomorrow })));
    expect(takeExpiredRuns()).toHaveLength(0);
    expect(localStorage.getItem('clearnine-save-daily')).not.toBeNull();
  });
});

describe('Today’s Puzzle goal', () => {
  it('is recorded the moment it is met, once', () => {
    const profile = defaultProfile();
    expect(bankDailyGoal(profile, '2026-03-04')).toBe(true);
    expect(bankDailyGoal(profile, '2026-03-04')).toBe(false);
    expect(profile.stats.dailyGoalsMet).toEqual(['2026-03-04']);
    expect(profile.stats.dailyDates).toEqual(['2026-03-04']);
    expect(bankDailyGoal(profile, 'not-a-date')).toBe(false);
  });
});
