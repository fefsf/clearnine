import { describe, expect, it } from 'vitest';
import { evaluateGoals, GOALS } from './goals';
import { addDays } from './rng';
import { defaultProfile } from './stats';
import { applyTheme, isThemeUnlocked, THEMES, themeUnlockHint } from './themes';

function local(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0);
}

function channel(hex: string, index: number): number {
  const raw = Number.parseInt(hex.replace('#', '').slice(index * 2, index * 2 + 2), 16) / 255;
  return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
}

function contrast(fore: string, back: string): number {
  const lum = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  const hi = Math.max(lum(fore), lum(back));
  const lo = Math.min(lum(fore), lum(back));
  return (hi + 0.05) / (lo + 0.05);
}

/** Approximate `color-mix(in srgb, color 88%, white)`. */
function mixWhite(hex: string, whitePart: number): string {
  const parse = (value: string) => [0, 1, 2].map((index) => Number.parseInt(value.replace('#', '').slice(index * 2, index * 2 + 2), 16));
  const base = parse(hex);
  const parts = base.map((item) => Math.round(item * (1 - whitePart) + 255 * whitePart));
  return `#${parts.map((item) => item.toString(16).padStart(2, '0')).join('')}`;
}

describe('isThemeUnlocked', () => {
  it('opens free themes and keeps award themes locked', () => {
    const profile = defaultProfile();
    for (const id of ['minimalist', 'wood', 'ocean']) {
      expect(isThemeUnlocked(profile, id), id).toBe(true);
    }
    for (const id of ['sunset', 'forest', 'midnight', 'aurora', 'ember', 'mono']) {
      expect(isThemeUnlocked(profile, id), id).toBe(false);
    }
    expect(isThemeUnlocked(profile, 'nope')).toBe(false);
  });

  it('unlocks a theme only after its trophy is on the profile', () => {
    const earned = defaultProfile();
    earned.unlockedGoals = ['daily_30'];
    expect(isThemeUnlocked(earned, 'aurora')).toBe(true);
    expect(isThemeUnlocked(earned, 'ember')).toBe(false);

    const waiting = defaultProfile();
    waiting.stats.piecesPlaced = 1000;
    waiting.stats.cellsCleared = 25000;
    waiting.stats.dailyDates = Array.from({ length: 30 }, (_, index) => addDays('2020-06-01', index));
    expect(isThemeUnlocked(waiting, 'aurora')).toBe(false);
    expect(isThemeUnlocked(waiting, 'ember')).toBe(false);
    expect(isThemeUnlocked(waiting, 'mono')).toBe(false);
    evaluateGoals(waiting);
    expect(isThemeUnlocked(waiting, 'aurora')).toBe(true);
    expect(isThemeUnlocked(waiting, 'ember')).toBe(true);
    expect(isThemeUnlocked(waiting, 'mono')).toBe(true);
  });

  it('stays locked one step under each new trophy', () => {
    const profile = defaultProfile();
    profile.stats.piecesPlaced = 999;
    profile.stats.cellsCleared = 24999;
    profile.stats.dailyDates = Array.from({ length: 29 }, (_, index) => addDays('2020-06-01', index * 3));
    evaluateGoals(profile);
    expect(profile.unlockedGoals).not.toContain('daily_30');
    expect(profile.unlockedGoals).not.toContain('pieces_1000');
    expect(profile.unlockedGoals).not.toContain('cells_25000');
    expect(isThemeUnlocked(profile, 'aurora')).toBe(false);
    expect(isThemeUnlocked(profile, 'ember')).toBe(false);
    expect(isThemeUnlocked(profile, 'mono')).toBe(false);
  });

  it('still unlocks Sunset from its score trophy', () => {
    const shy = defaultProfile();
    shy.bestClassic = 499;
    evaluateGoals(shy);
    expect(isThemeUnlocked(shy, 'sunset')).toBe(false);
    const ready = defaultProfile();
    ready.bestClassic = 500;
    evaluateGoals(ready);
    expect(isThemeUnlocked(ready, 'sunset')).toBe(true);
  });
});

describe('award themes', () => {
  it('ties each gated theme to the trophy that names it', () => {
    const gates: Record<string, string> = {
      sunset: 'score_500',
      forest: 'combo_3',
      midnight: 'score_5000',
      aurora: 'daily_30',
      ember: 'pieces_1000',
      mono: 'cells_25000',
    };
    for (const [themeId, goalId] of Object.entries(gates)) {
      const theme = THEMES.find((item) => item.id === themeId);
      const award = GOALS.find((item) => item.id === goalId);
      expect(theme?.requiresGoal, themeId).toBe(goalId);
      expect(award?.unlocksTheme, goalId).toBe(themeId);
    }
    for (const id of ['minimalist', 'wood', 'ocean']) {
      expect(THEMES.find((item) => item.id === id)?.requiresGoal).toBeNull();
    }
  });

  it('reuses the theme color tokens and one block hue', () => {
    const required = Object.keys(THEMES[0]!.vars);
    for (const id of ['aurora', 'ember', 'mono']) {
      const theme = THEMES.find((item) => item.id === id);
      expect(theme, id).toBeTruthy();
      for (const key of required) {
        expect(theme!.vars[key], `${id} ${key}`).toBeTruthy();
      }
      for (let slot = 2; slot <= 8; slot += 1) {
        expect(theme!.vars[`--c${slot}`], id).toBe(theme!.vars['--c1']);
      }
    }
    expect(THEMES.find((item) => item.id === 'mono')?.vars['--status-style']).toBe('dark');
    expect(THEMES.find((item) => item.id === 'aurora')?.vars['--status-style']).toBe('light');
    expect(THEMES.find((item) => item.id === 'ember')?.vars['--status-style']).toBe('light');
  });

  it('keeps text, buttons, blocks, and borders readable', () => {
    for (const id of ['aurora', 'ember', 'mono']) {
      const vars = THEMES.find((item) => item.id === id)!.vars;
      const textPairs = [
        [vars['--text']!, vars['--panel']!],
        [vars['--text']!, vars['--bg-top']!],
        [vars['--text']!, vars['--bg-bot']!],
        [vars['--text-dim']!, vars['--panel']!],
        [vars['--text-dim']!, vars['--bg-top']!],
        [vars['--text-dim']!, vars['--bg-bot']!],
        [vars['--btn-text']!, vars['--accent']!],
        [vars['--accent']!, vars['--panel']!],
        [vars['--danger']!, vars['--panel']!],
      ];
      for (const [fore, back] of textPairs) {
        expect(contrast(fore, back), `${id} ${fore} on ${back}`).toBeGreaterThanOrEqual(4.5);
      }
      const shapePairs = [
        [vars['--region-line']!, vars['--cell-empty']!],
        [vars['--region-line']!, vars['--cell-empty-alt']!],
        [vars['--c1']!, vars['--cell-empty']!],
        [vars['--c1']!, vars['--cell-empty-alt']!],
        [vars['--panel-edge']!, vars['--panel']!],
      ];
      for (const [fore, back] of shapePairs) {
        expect(contrast(fore, back), `${id} ${fore} on ${back}`).toBeGreaterThanOrEqual(3);
      }
      const continueFill = mixWhite(vars['--accent-warm']!, 0.12);
      expect(contrast('#3a2210', continueFill), id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('describes the lock on the Colors screen', () => {
    const fresh = defaultProfile();
    expect(themeUnlockHint('minimalist', fresh)).toBe('Ready to use');
    expect(themeUnlockHint('sunset', fresh)).toBe('Locked — Score 500 in Play (any mode)');
    expect(themeUnlockHint('aurora', fresh)).toBe('Locked — 0 / 30 · Finish Daily on 30 different days');
    fresh.stats.piecesPlaced = 47;
    expect(themeUnlockHint('ember', fresh)).toBe('Locked — 47 / 1,000 · Place 1,000 pieces');
    expect(themeUnlockHint('mono', fresh)).toBe('Locked — 0 / 25,000 · Clear 25,000 cells');
    fresh.stats.maxCombo = 1;
    expect(themeUnlockHint('forest', fresh)).toBe('Locked — 1 / 3 · Clear a Combo ×3 in one move');
  });

  it('paints Aurora in one hue until varied blocks are on', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    const quietDay = local(2027, 9, 15);
    applyTheme('aurora', { seasonal: 'off', blockStyle: 'uniform', date: quietDay });
    const root = document.documentElement;
    expect(root.getAttribute('data-theme')).toBe('aurora');
    expect(root.getAttribute('data-season')).toBeNull();
    expect(root.style.getPropertyValue('--c1').trim().toLowerCase()).toBe('#8ef0c8');
    expect(root.style.getPropertyValue('--c8').trim().toLowerCase()).toBe('#8ef0c8');
    expect(root.style.getPropertyValue('--text').trim().toLowerCase()).toBe('#f4f7ff');

    applyTheme('aurora', { seasonal: 'off', blockStyle: 'varied', date: quietDay });
    expect(root.style.getPropertyValue('--c1').trim().toLowerCase()).not.toBe(
      root.style.getPropertyValue('--c2').trim().toLowerCase(),
    );
  });
});
