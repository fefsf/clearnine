import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, serializeBackup } from '../app/backup';
import { renderHome, renderSettings, type ScreenHandlers } from '../ui/screens';
import { getWeeklyMandate } from './expert';
import { Game } from './game';
import { pickRandomPiece, type DealOptions } from './pieces';
import { createRng } from './rng';
import {
  defaultProfile,
  loadProfile,
  nextDealDepth,
  normalizeDealDepth,
  recordGameFinished,
  saveProfile,
  stagePendingFinalize,
  type DealDepth,
  type GameMode,
  type Profile,
} from './stats';

function weekWithHold(hold: boolean): string {
  for (let n = 1; n <= 80; n++) {
    const key = `2026-W${String(n).padStart(2, '0')}`;
    if (getWeeklyMandate(key).hold === hold) return key;
  }
  throw new Error(`no mandate with hold=${hold}`);
}

function handlers(partial: Partial<ScreenHandlers> = {}): ScreenHandlers {
  const noop = () => {};
  return {
    onClassic: noop,
    onDaily: noop,
    onWeekly: noop,
    onBlitz: noop,
    onPuzzles: noop,
    onPuzzle: noop,
    onContinue: noop,
    onRecords: noop,
    onGoals: noop,
    onThemes: noop,
    onHowTo: noop,
    onSettings: noop,
    onBoard: noop,
    onBackHome: noop,
    onSelectTheme: noop,
    onSelectSeason: noop,
    onToggleSeasonal: noop,
    onToggleBlockStyle: noop,
    onToggleMute: noop,
    onToggleHaptics: noop,
    onToggleExpert: noop,
    onToggleHoldOption: noop,
    onCycleDealDepth: noop,
    onToggleLeaderboard: noop,
    onSaveLeaderboardName: noop,
    onCheckUpdate: noop,
    onShowTips: noop,
    ...partial,
  };
}

function trayIds(opts: {
  mode?: GameMode;
  expert?: boolean;
  holdOption?: boolean;
  dealDepth?: DealDepth;
  dailyDate?: string;
  week?: string;
}): string {
  const game = new Game();
  game.configure(opts.mode ?? 'daily', {
    expert: opts.expert ?? false,
    holdOption: opts.holdOption,
    dealDepth: opts.dealDepth,
    dailyDate: opts.dailyDate ?? '2026-04-02',
    week: opts.week,
  });
  game.newGame();
  return game.tray.map((piece) => piece?.id ?? '').join(',');
}

function meanPicked(opts: DealOptions | undefined, seed = 20261026, draws = 4000): number {
  const rng = createRng(seed);
  let total = 0;
  for (let i = 0; i < draws; i++) {
    total += pickRandomPiece(() => rng.next(), opts).cells.length;
  }
  return total / draws;
}

describe('calm options', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults Hold off and normal difficulty on old profiles', () => {
    localStorage.setItem('clearnine-profile', JSON.stringify({ bestClassic: 12, dealDepth: 'brutal', holdOption: 'yes' }));
    const profile = loadProfile();
    expect(profile.holdOption).toBe(false);
    expect(profile.dealDepth).toBe('normal');
    expect(profile.bestClassic).toBe(12);
    expect(normalizeDealDepth('deep')).toBe('deep');
    expect(nextDealDepth('gentle')).toBe('normal');
    expect(nextDealDepth('normal')).toBe('deep');
    expect(nextDealDepth('deep')).toBe('gentle');
  });

  it('enables Hold only for the combinations that should have it', () => {
    const withHold = weekWithHold(true);
    const noHold = weekWithHold(false);
    const cases: Array<{
      mode: GameMode;
      expert: boolean;
      holdOption: boolean;
      week?: string;
      hold: boolean;
    }> = [
      { mode: 'classic', expert: true, holdOption: false, hold: true },
      { mode: 'classic', expert: true, holdOption: true, hold: true },
      { mode: 'daily', expert: true, holdOption: true, hold: false },
      { mode: 'blitz', expert: true, holdOption: true, hold: false },
      { mode: 'weekly', expert: true, holdOption: false, week: withHold, hold: true },
      { mode: 'weekly', expert: true, holdOption: true, week: noHold, hold: false },
      { mode: 'classic', expert: false, holdOption: false, hold: false },
      { mode: 'classic', expert: false, holdOption: true, hold: true },
      { mode: 'daily', expert: false, holdOption: true, hold: false },
      { mode: 'weekly', expert: false, holdOption: true, week: withHold, hold: false },
      { mode: 'blitz', expert: false, holdOption: true, hold: false },
    ];
    for (const item of cases) {
      const game = new Game();
      game.configure(item.mode, {
        expert: item.expert,
        holdOption: item.holdOption,
        week: item.week,
        dailyDate: '2026-04-02',
      });
      expect(game.holdEnabled(), JSON.stringify(item)).toBe(item.hold);
    }
  });

  it('resumes a Hold run from the save after the setting is turned off', () => {
    const game = new Game();
    game.configure('classic', { expert: false, holdOption: true, dealDepth: 'deep' });
    game.newGame();
    const parked = game.tray[0];
    expect(parked).toBeTruthy();
    expect(game.swapHold(0).ok).toBe(true);
    expect(game.hold?.id).toBe(parked!.id);

    const resumed = new Game();
    resumed.configure('classic', { expert: false, holdOption: false, dealDepth: 'normal' });
    expect(resumed.loadOrNew()).toBe(true);
    expect(resumed.holdEnabled()).toBe(true);
    expect(resumed.hold?.id).toBe(parked!.id);
    expect(resumed.dealDepth).toBe('deep');
    expect(resumed.holdOption).toBe(true);
    expect(resumed.practiceRun()).toBe(true);
  });

  it('does not record calm bests for Hold or non-normal deals, and still records Expert', () => {
    const profile = defaultProfile();
    profile.bestClassic = 100;
    profile.bestDaily['2026-10-26'] = 50;

    const held = recordGameFinished(profile, {
      mode: 'classic',
      score: 5000,
      cleared: 3,
      expert: false,
      practice: true,
    });
    expect(held.newClassicBest).toBe(false);
    expect(profile.bestClassic).toBe(100);

    const deepDaily = recordGameFinished(profile, {
      mode: 'daily',
      score: 4000,
      cleared: 2,
      date: '2026-10-26',
      expert: false,
      practice: true,
    });
    expect(deepDaily.newDailyBest).toBe(false);
    expect(profile.bestDaily['2026-10-26']).toBe(50);

    const calm = recordGameFinished(profile, {
      mode: 'classic',
      score: 250,
      cleared: 1,
      expert: false,
    });
    expect(calm.newClassicBest).toBe(true);
    expect(profile.bestClassic).toBe(250);

    const expert = recordGameFinished(profile, {
      mode: 'classic',
      score: 900,
      cleared: 1,
      expert: true,
      practice: true,
    });
    expect(expert.newClassicBest).toBe(true);
    expect(profile.bestClassicExpert).toBe(900);
    expect(profile.bestClassic).toBe(250);
  });

  it('a staged practice finish does not become the calm best', () => {
    const game = new Game();
    game.configure('classic', { expert: false, holdOption: true, dealDepth: 'normal' });
    game.newGame();
    game.score = 4200;
    game.gameOver = true;
    game.persist();
    const profile = loadProfile();
    expect(profile.bestClassic).toBe(0);
    expect(profile.stats.gamesPlayed).toBe(1);
    expect(game.practiceRun()).toBe(true);
  });

  it('a fair calm finish and an Expert finish still record their own bests', () => {
    const calm = new Game();
    calm.configure('classic', { expert: false, holdOption: false, dealDepth: 'normal' });
    calm.newGame();
    calm.score = 80;
    calm.gameOver = true;
    calm.persist();
    expect(loadProfile().bestClassic).toBe(80);
    expect(calm.practiceRun()).toBe(false);

    localStorage.clear();
    const expert = new Game();
    expert.configure('classic', { expert: true, holdOption: true, dealDepth: 'deep' });
    expert.newGame();
    expert.score = 77;
    expert.gameOver = true;
    expert.persist();
    const profile = loadProfile();
    expect(profile.bestClassicExpert).toBe(77);
    expect(profile.bestClassic).toBe(0);
    expect(expert.practiceRun()).toBe(false);
  });

  it('Daily with the Hold setting on still counts when deals are normal', () => {
    const game = new Game();
    game.configure('daily', {
      expert: false,
      holdOption: true,
      dealDepth: 'normal',
      dailyDate: '2026-10-26',
    });
    expect(game.holdEnabled()).toBe(false);
    expect(game.practiceRun()).toBe(false);
    game.newGame();
    game.score = 40;
    game.gameOver = true;
    game.persist();
    expect(loadProfile().bestDaily['2026-10-26']).toBe(40);
  });

  it('Gentle favors smaller pieces and Deep favors larger ones', () => {
    const gentle = meanPicked({ bias: 'small' });
    const normal = meanPicked(undefined);
    const deep = meanPicked({ hard: true });
    expect(gentle).toBeLessThan(normal - 0.25);
    expect(deep).toBeGreaterThan(normal + 0.15);

    let smaller = 0;
    let larger = 0;
    for (let day = 1; day <= 28; day++) {
      const date = `2026-03-${String(day).padStart(2, '0')}`;
      const base = trayIds({ dealDepth: 'normal', dailyDate: date });
      if (trayIds({ dealDepth: 'gentle', dailyDate: date }) !== base) smaller += 1;
      if (trayIds({ dealDepth: 'deep', dailyDate: date }) !== base) larger += 1;
    }
    expect(smaller).toBeGreaterThan(8);
    expect(larger).toBeGreaterThan(8);

    const date = '2026-04-02';
    expect(trayIds({ dailyDate: date })).toBe(trayIds({ dealDepth: 'normal', dailyDate: date }));
    expect(trayIds({ expert: true, dealDepth: 'gentle', holdOption: true, dailyDate: date })).toBe(
      trayIds({ expert: true, dealDepth: 'deep', holdOption: false, dailyDate: date }),
    );
    expect(trayIds({ expert: true, dealDepth: 'normal', dailyDate: date })).toBe(
      trayIds({ expert: true, dailyDate: date }),
    );
  });

  it('backup keeps the new profile fields and the Hold save', () => {
    const stored = defaultProfile();
    stored.holdOption = true;
    stored.dealDepth = 'deep';
    stored.bestClassic = 10;
    saveProfile(stored);

    const game = new Game();
    game.configure('classic', { expert: false, holdOption: true, dealDepth: 'gentle' });
    game.newGame();
    expect(game.swapHold(0).ok).toBe(true);

    const parsed = parseBackup(serializeBackup(buildBackup()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const profile = parsed.backup.data['clearnine-profile'] as Profile;
    expect(profile.holdOption).toBe(true);
    expect(profile.dealDepth).toBe('deep');
    const save = parsed.backup.data['clearnine-save-classic'] as {
      holdOption?: boolean;
      dealDepth?: string;
      hold: { id: string } | null;
    };
    expect(save.holdOption).toBe(true);
    expect(save.dealDepth).toBe('gentle');
    expect(save.hold?.id).toBeTruthy();
  });

  it('settings shows Hold and piece difficulty only while Expert is off', () => {
    const root = document.createElement('div');
    let held = 0;
    let cycled = 0;
    const profile = defaultProfile();
    profile.holdOption = true;
    profile.dealDepth = 'gentle';
    renderSettings(
      root,
      profile,
      handlers({
        onToggleHoldOption: () => {
          held += 1;
        },
        onCycleDealDepth: () => {
          cycled += 1;
        },
      }),
    );
    expect(root.querySelector('#hold-state')?.textContent).toBe('On');
    expect(root.querySelector('#depth-state')?.textContent).toBe('Gentle');
    expect(root.textContent).not.toContain('Included with Expert');
    root.querySelector<HTMLButtonElement>('#btn-toggle-hold')!.click();
    root.querySelector<HTMLButtonElement>('#btn-cycle-depth')!.click();
    expect(held).toBe(1);
    expect(cycled).toBe(1);

    profile.expertMode = true;
    renderSettings(root, profile, handlers());
    expect(root.querySelector('#btn-toggle-hold')).toBeNull();
    expect(root.querySelector('#btn-cycle-depth')).toBeNull();
    expect(root.textContent).toContain('Included with Expert');

    const home = document.createElement('div');
    profile.expertMode = false;
    profile.holdOption = true;
    renderHome(home, profile, handlers(), null);
    expect(home.textContent).toContain('Relaxing game · Hold');
    profile.holdOption = false;
    renderHome(home, profile, handlers(), null);
    expect(home.textContent).toContain('Relaxing game');
    expect(home.textContent).not.toContain('Relaxing game · Hold');
  });

  it('pending practice flag is stored only when set', () => {
    stagePendingFinalize({
      mode: 'classic',
      expert: false,
      score: 10,
      cleared: 1,
      date: '2026-10-26',
      practice: true,
    });
    const raw = localStorage.getItem('clearnine-pending-finalize') ?? '';
    expect(raw).toContain('"practice":true');
    const profile = loadProfile();
    expect(profile.bestClassic).toBe(0);
    expect(profile.stats.gamesPlayed).toBe(1);
  });
});
