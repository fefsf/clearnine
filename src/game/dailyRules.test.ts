import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '../app/backup';
import { renderHome, type ScreenHandlers } from '../ui/screens';
import { createEmptyBoard } from './board';
import {
  DAILY_RULES,
  dailyRuleBlurb,
  formatDailyGoalProgress,
  formatDailyOver,
  getDailyRule,
} from './dailyRules';
import { getWeeklyMandate, weekKey } from './expert';
import { Game, readDailyGoalCounters } from './game';
import { evaluateGoals, GOALS } from './goals';
import type { DealOptions, PieceDef } from './pieces';
import { addDays, todayKey } from './rng';
import { defaultProfile, loadProfile, recordGameFinished } from './stats';

const dot: PieceDef = { id: 'dot', cells: [{ r: 0, c: 0 }], weight: 1 };
const GOAL_TYPES = new Set(['score', 'lines', 'regions', 'combos']);

function dateFor(id: string): string {
  for (let i = 0; i < 500; i++) {
    const key = addDays('2026-01-01', i);
    if (getDailyRule(key).id === id) return key;
  }
  throw new Error(`no date for ${id}`);
}

function start(date: string, expert = false): Game {
  localStorage.clear();
  const game = new Game();
  game.configure('daily', { dailyDate: date, expert, dealDepth: 'normal' });
  game.newGame();
  return game;
}

function place(game: Game, row: number, col: number) {
  game.tray = [dot, { ...dot }, { ...dot }];
  return game.tryPlace(0, row, col);
}

function dealOptions(game: Game): DealOptions | undefined {
  return (game as unknown as { dealOpts(): DealOptions | undefined }).dealOpts();
}

const handlers = new Proxy({}, { get: () => () => undefined }) as ScreenHandlers;

describe('daily rule of the day', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is deterministic and rotates so neighboring days differ', () => {
    expect(getDailyRule('2026-10-27')).toEqual(getDailyRule('2026-10-27'));
    expect(getDailyRule('nope').id.length).toBeGreaterThan(0);
    expect(getDailyRule('2026-02-31').goal.target).toBeGreaterThan(0);
    expect(getDailyRule('2019-12-31').id).not.toBe(getDailyRule('2020-01-01').id);

    getDailyRule('2032-01-01');
    let prev = getDailyRule('2024-01-01').id;
    const seen = new Set<string>([prev]);
    for (let i = 1; i <= 400; i++) {
      const id = getDailyRule(addDays('2024-01-01', i)).id;
      expect(id, addDays('2024-01-01', i)).not.toBe(prev);
      seen.add(id);
      prev = id;
    }
    expect(seen).toEqual(new Set(DAILY_RULES.map((rule) => rule.id)));
  });

  it('gives every rule a real goal', () => {
    const ids = new Set<string>();
    expect(DAILY_RULES.length).toBeGreaterThanOrEqual(8);
    for (const rule of DAILY_RULES) {
      expect(ids.has(rule.id), rule.id).toBe(false);
      ids.add(rule.id);
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.blurb.length).toBeGreaterThan(0);
      expect(GOAL_TYPES.has(rule.goal.type)).toBe(true);
      expect(Number.isInteger(rule.goal.target)).toBe(true);
      expect(rule.goal.target).toBeGreaterThan(0);
      if (rule.modifier?.deal) {
        expect(['small', 'giants', 'hard']).toContain(rule.modifier.deal);
      }
    }
    const lineUp = DAILY_RULES.find((rule) => rule.id === 'line_up')!;
    expect(formatDailyGoalProgress(lineUp, { lines: 7, regions: 0, combos: 0, score: 0 })).toBe(
      'Lines 7 / 12',
    );
    const tiny = DAILY_RULES.find((rule) => rule.id === 'tiny_tuesday')!;
    expect(dailyRuleBlurb(tiny, false).toLowerCase()).toContain('small');
    expect(dailyRuleBlurb(tiny, true).toLowerCase()).not.toContain('small');
  });

  it('counts lines, regions, and combos, keeps them across resume, and undoes them', () => {
    const date = dateFor('line_up');
    const game = start(date);
    game.board = createEmptyBoard();
    for (let c = 1; c < 9; c++) game.board[0]![c] = 1;
    const line = place(game, 0, 0);
    expect(line.ok).toBe(true);
    expect(game.dailyProgress()).toMatchObject({ lines: 1, regions: 0, combos: 0 });

    game.board = createEmptyBoard();
    for (let r = 3; r < 6; r++) {
      for (let c = 3; c < 6; c++) {
        if (r === 3 && c === 3) continue;
        game.board[r]![c] = 1;
      }
    }
    const region = place(game, 3, 3);
    expect(region.ok).toBe(true);
    expect(game.dailyProgress()).toMatchObject({ lines: 1, regions: 1, combos: 0 });

    game.board = createEmptyBoard();
    for (let c = 0; c < 8; c++) game.board[4]![c] = 1;
    for (let r = 0; r < 9; r++) if (r !== 4) game.board[r]![8] = 1;
    const combo = place(game, 4, 8);
    expect(combo.ok).toBe(true);
    if (combo.ok) expect(combo.score.comboMultiplier).toBeGreaterThanOrEqual(2);
    expect(game.dailyProgress()).toMatchObject({ lines: 3, regions: 1, combos: 1 });
    expect(readDailyGoalCounters(false, date)).toEqual(game.dailyProgress());

    const resumed = new Game();
    resumed.configure('daily', { dailyDate: date, expert: false, dealDepth: 'normal' });
    expect(resumed.loadOrNew()).toBe(true);
    expect(resumed.dailyProgress()).toEqual(game.dailyProgress());

    expect(resumed.undo().ok).toBe(false);
    expect(game.undo().ok).toBe(true);
    expect(game.dailyProgress()).toMatchObject({ lines: 1, regions: 1, combos: 0 });
    const afterUndo = new Game();
    afterUndo.configure('daily', { dailyDate: date, expert: false, dealDepth: 'normal' });
    expect(afterUndo.loadOrNew()).toBe(true);
    expect(afterUndo.dailyProgress()).toMatchObject({ lines: 1, regions: 1, combos: 0 });
  });

  it('meets a score goal without ending the run, then rolls the goal back on undo', () => {
    const date = dateFor('steady_hands');
    const game = start(date);
    game.board = createEmptyBoard();
    game.score = 599;
    const met = place(game, 0, 0);
    expect(met.ok).toBe(true);
    if (!met.ok) return;
    expect(met.goalJustMet).toBe(true);
    expect(game.gameOver).toBe(false);
    expect(game.score).toBe(600);
    expect(game.dailyProgress()?.met).toBe(true);
    expect(formatDailyOver(getDailyRule(date), game.dailyProgress()!)).toContain('Goal complete');

    expect(game.undo().ok).toBe(true);
    expect(game.score).toBe(599);
    expect(game.dailyProgress()?.met).toBe(false);

    const again = place(game, 1, 1);
    expect(again.ok && again.goalJustMet).toBe(true);
    expect(game.gameOver).toBe(false);
  });

  it('records a met Daily goal once, and skips it when undo clears the goal', () => {
    const date = dateFor('steady_hands');
    const game = start(date);
    game.board = createEmptyBoard();
    game.score = 599;
    expect(place(game, 0, 0).ok).toBe(true);
    game.gameOver = true;
    game.persist();

    const profile = defaultProfile();
    recordGameFinished(profile, {
      mode: 'daily',
      score: game.score,
      cleared: game.clearsThisGame,
      date,
      expert: false,
      dailyGoalMet: true,
    });
    expect(profile.stats.gamesPlayed).toBe(1);
    expect(profile.stats.dailyGoalsMet).toEqual([date]);
    recordGameFinished(profile, {
      mode: 'daily',
      score: game.score,
      cleared: game.clearsThisGame,
      date,
      expert: false,
      dailyGoalMet: true,
    });
    expect(profile.stats.dailyGoalsMet).toEqual([date]);

    localStorage.clear();
    const replay = start(date);
    replay.board = createEmptyBoard();
    replay.score = 599;
    expect(place(replay, 0, 0).ok).toBe(true);
    replay.gameOver = true;
    replay.persist();
    expect(loadProfile().stats.dailyGoalsMet).toEqual([date]);
    expect(loadProfile().stats.gamesPlayed).toBe(1);
    expect(loadProfile().stats.dailyGoalsMet).toEqual([date]);

    localStorage.clear();
    const undone = start(date);
    undone.board = createEmptyBoard();
    undone.score = 599;
    expect(place(undone, 0, 0).ok).toBe(true);
    expect(undone.undo().ok).toBe(true);
    undone.gameOver = true;
    undone.persist();
    const missed = loadProfile();
    expect(missed.stats.dailyDates).toContain(date);
    expect(missed.stats.dailyGoalsMet).toEqual([]);
  });

  it('treats older saves as zero progress and still notices a score goal already reached', () => {
    const linesDate = dateFor('line_up');
    localStorage.setItem(
      'clearnine-save-daily',
      JSON.stringify({
        mode: 'daily',
        board: createEmptyBoard(),
        tray: [dot, null, null],
        hold: null,
        score: 5000,
        streak: 0,
        gameOver: false,
        undosLeft: 1,
        undoStack: [],
        rng: { seed: 3, counter: 1 },
        clearsThisGame: 0,
        expert: false,
        dailyDate: linesDate,
      }),
    );
    const lines = new Game();
    lines.configure('daily', { dailyDate: linesDate, expert: false });
    expect(lines.loadOrNew()).toBe(true);
    expect(lines.dailyProgress()).toMatchObject({
      lines: 0,
      regions: 0,
      combos: 0,
      score: 5000,
      met: false,
    });

    const scoreDate = dateFor('steady_hands');
    localStorage.setItem(
      'clearnine-save-daily',
      JSON.stringify({
        mode: 'daily',
        board: createEmptyBoard(),
        tray: [dot, null, null],
        hold: null,
        score: 600,
        streak: 0,
        gameOver: false,
        undosLeft: 1,
        undoStack: [],
        rng: { seed: 4, counter: 1 },
        clearsThisGame: 0,
        expert: false,
        dailyDate: scoreDate,
      }),
    );
    const scored = new Game();
    scored.configure('daily', { dailyDate: scoreDate, expert: false });
    expect(scored.loadOrNew()).toBe(true);
    expect(scored.dailyProgress()).toMatchObject({ lines: 0, score: 600, met: true });
  });

  it('applies calm modifiers and leaves Expert Daily on its hard deal', () => {
    const slate = dateFor('clean_slate');
    const calm = start(slate, false);
    expect(calm.board.every((row) => row.every((cell) => cell === 0))).toBe(true);
    const expert = new Game();
    expert.configure('daily', { dailyDate: slate, expert: true, dealDepth: 'normal' });
    expert.newGame();
    expect(expert.board.some((row) => row.some((cell) => cell !== 0))).toBe(true);

    const lined = dateFor('line_up');
    const seeded = start(lined, false);
    expect(seeded.board.some((row) => row.some((cell) => cell !== 0))).toBe(true);

    const game = new Game();
    game.configure('daily', { dailyDate: dateFor('tiny_tuesday'), expert: false, dealDepth: 'deep' });
    expect(dealOptions(game)).toEqual({ bias: 'small' });
    game.configure('daily', { dailyDate: dateFor('big_day'), expert: false, dealDepth: 'normal' });
    expect(dealOptions(game)).toEqual({ bias: 'giants' });
    game.configure('daily', { dailyDate: dateFor('ten_deep'), expert: false, dealDepth: 'gentle' });
    expect(dealOptions(game)).toEqual({ hard: true });
    game.configure('daily', { dailyDate: lined, expert: false, dealDepth: 'normal' });
    expect(dealOptions(game)).toBeUndefined();
    game.configure('daily', { dailyDate: lined, expert: false, dealDepth: 'gentle' });
    expect(dealOptions(game)).toEqual({ bias: 'small' });
    game.configure('daily', { dailyDate: dateFor('tiny_tuesday'), expert: true, dealDepth: 'gentle' });
    expect(dealOptions(game)).toEqual({ hard: true });
    game.configure('classic', { expert: false, dealDepth: 'normal' });
    expect(dealOptions(game)).toBeUndefined();
  });

  it('shows the rule on the home daily line and button', () => {
    const profile = defaultProfile();
    const root = document.createElement('div');
    renderHome(root, profile, handlers, null);
    const rule = getDailyRule(todayKey());
    const blurb = dailyRuleBlurb(rule, false);
    const text = root.textContent ?? '';
    expect(root.querySelector('.home-dayline')?.textContent).toContain(rule.name);
    expect(text).toContain(blurb);
    expect(root.querySelector('#btn-daily')?.textContent).toContain('0 /');
    expect(text).toContain(`Best: ${profile.bestClassic === 0 ? 0 : profile.bestClassic}`);

    profile.expertMode = true;
    renderHome(root, profile, handlers, null);
    expect(root.textContent).toContain(getWeeklyMandate(weekKey()).name);
    expect(root.textContent).toContain(dailyRuleBlurb(rule, true));

    profile.stats.dailyDates = [todayKey()];
    profile.stats.dailyGoalsMet = [todayKey()];
    renderHome(root, profile, handlers, null);
    expect(root.textContent).toContain('goal met');
    expect(root.textContent).toContain('Goal met');
    expect(root.querySelector('#btn-daily')?.textContent).not.toContain('0 /');
  });

  it('unlocks Rule Breaker once and Rule Master after 7 different days', () => {
    const fresh = defaultProfile();
    expect(fresh.stats.dailyGoalsMet).toEqual([]);
    const breaker = GOALS.find((goal) => goal.id === 'rule_breaker')!;
    const master = GOALS.find((goal) => goal.id === 'rule_master')!;
    expect(breaker.title).toBe('Rule Breaker');
    expect(master.title).toBe('Rule Master');
    expect(breaker.progress?.(fresh)).toEqual({ value: 0, target: 1 });
    expect(master.progress?.(fresh)).toEqual({ value: 0, target: 7 });

    fresh.stats.dailyGoalsMet = ['2026-01-01', '2026-01-01'];
    expect(breaker.check(fresh)).toBe(true);
    expect(master.check(fresh)).toBe(false);
    expect(master.progress?.(fresh)).toEqual({ value: 1, target: 7 });
    expect(evaluateGoals(fresh).map((goal) => goal.id)).toContain('rule_breaker');
    expect(evaluateGoals(fresh).map((goal) => goal.id)).not.toContain('rule_breaker');

    fresh.stats.dailyGoalsMet = Array.from({ length: 7 }, (_, index) => addDays('2026-01-01', index));
    expect(master.check(fresh)).toBe(true);
    expect(evaluateGoals(fresh).map((goal) => goal.id)).toContain('rule_master');
  });

  it('keeps daily goal fields through backup validation', () => {
    const board = createEmptyBoard();
    board[0]![0] = 1;
    const parsed = parseBackup(
      JSON.stringify({
        app: 'ClearNine',
        schemaVersion: 1,
        appVersion: '1.14.0',
        exportedAt: '2026-10-27T12:00:00.000Z',
        data: {
          'clearnine-profile': {
            stats: {
              dailyGoalsMet: ['2026-10-03', 'nope', '2026-10-03', '2026-02-31', '2026-10-01'],
            },
          },
          'clearnine-save-daily': {
            mode: 'daily',
            board,
            tray: [dot, null, null],
            hold: null,
            score: 40,
            streak: 0,
            gameOver: false,
            undosLeft: 1,
            undoStack: [{ board: 'drop me' }],
            rng: { seed: 9, counter: 2 },
            clearsThisGame: 1,
            expert: false,
            dailyDate: '2026-10-01',
            dailyLines: 4,
            dailyRegions: 1,
            dailyCombos: 2,
            dailyGoalMet: true,
          },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const profile = parsed.backup.data['clearnine-profile'] as { stats: { dailyGoalsMet: string[] } };
    expect(profile.stats.dailyGoalsMet).toEqual(['2026-10-01', '2026-10-03']);
    const save = parsed.backup.data['clearnine-save-daily'] as {
      dailyLines: number;
      dailyRegions: number;
      dailyCombos: number;
      dailyGoalMet?: boolean;
      undoStack: unknown[];
    };
    expect(save.dailyLines).toBe(4);
    expect(save.dailyRegions).toBe(1);
    expect(save.dailyCombos).toBe(2);
    expect(save.dailyGoalMet).toBe(true);
    expect(save.undoStack).toEqual([]);

    const rejected = parseBackup(
      JSON.stringify({
        app: 'ClearNine',
        schemaVersion: 1,
        appVersion: '1.14.0',
        exportedAt: '2026-10-27T12:00:00.000Z',
        data: {
          'clearnine-profile': { stats: { gamesPlayed: 1 } },
          'clearnine-save-daily': {
            mode: 'daily',
            board,
            tray: [dot, null, null],
            hold: null,
            score: 1,
            streak: 0,
            gameOver: false,
            undosLeft: 1,
            undoStack: [],
            rng: { seed: 1, counter: 0 },
            clearsThisGame: 0,
            expert: false,
            dailyDate: '2026-10-01',
            dailyLines: -1,
          },
        },
      }),
    );
    expect(rejected.ok).toBe(false);

    localStorage.setItem('clearnine-profile', JSON.stringify({ stats: { gamesPlayed: 2 } }));
    expect(loadProfile().stats.dailyGoalsMet).toEqual([]);
  });
});
