import { beforeEach, describe, expect, it } from 'vitest';
import { DAILY_RULES, getDailyRule } from './dailyRules';
import { Game } from './game';
import { PUZZLES } from './puzzles';

function dateWithDealOverride(withOverride: boolean): string {
  for (let day = 1; day <= 28; day++) {
    for (const month of ['01', '02', '03', '04', '05', '06']) {
      const key = `2026-${month}-${String(day).padStart(2, '0')}`;
      const has = getDailyRule(key).modifier?.deal != null;
      if (has === withOverride) return key;
    }
  }
  throw new Error('no matching daily rule date');
}

describe('v1.14 review regressions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('daily rules include at least one deal override and one without', () => {
    expect(DAILY_RULES.some((r) => r.modifier?.deal != null)).toBe(true);
    expect(DAILY_RULES.some((r) => r.modifier?.deal == null)).toBe(true);
  });

  it('keeps Daily ranked when the rule overrides Gentle/Deep deals', () => {
    const date = dateWithDealOverride(true);
    const game = new Game();
    game.configure('daily', { dailyDate: date, expert: false, dealDepth: 'deep' });
    expect(game.practiceRun()).toBe(false);
  });

  it('still treats Gentle/Deep Daily as practice when the rule sets no deal', () => {
    const date = dateWithDealOverride(false);
    const game = new Game();
    game.configure('daily', { dailyDate: date, expert: false, dealDepth: 'deep' });
    expect(game.practiceRun()).toBe(true);
  });

  it('configure clears a finished puzzle so a resumed game is not locked', () => {
    const game = new Game();
    game.configurePuzzle(PUZZLES[0].id);
    game.newGame();
    game.puzzleWon = true;
    game.configure('classic', { expert: false });
    expect(game.puzzleWon).toBe(false);
    game.newGame();
    expect(game.tryPlace(0, 0, 0).ok).toBe(true);
  });
});
