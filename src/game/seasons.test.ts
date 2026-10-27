import { describe, expect, it } from 'vitest';
import { defaultProfile, loadProfile } from './stats';
import { applyTheme, getActiveSeason, resolveLook, SEASONS, THEMES } from './themes';

/** Local noon so calendar edges are not DST-sensitive. Month is 1–12. */
function local(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0);
}

describe('getActiveSeason', () => {
  it('includes Halloween edges and excludes the days beside them', () => {
    expect(getActiveSeason(local(2026, 10, 14))).toBeNull();
    expect(getActiveSeason(local(2026, 10, 15))?.id).toBe('halloween');
    expect(getActiveSeason(local(2026, 10, 26))?.id).toBe('halloween');
    expect(getActiveSeason(local(2026, 11, 1))?.id).toBe('halloween');
    expect(getActiveSeason(local(2026, 11, 2))).toBeNull();
  });

  it('wraps New Year across Dec 31 and Jan 6, then stops', () => {
    expect(getActiveSeason(local(2026, 12, 27))?.id).toBe('newyear');
    expect(getActiveSeason(local(2026, 12, 31))?.id).toBe('newyear');
    expect(getActiveSeason(local(2027, 1, 1))?.id).toBe('newyear');
    expect(getActiveSeason(local(2027, 1, 6))?.id).toBe('newyear');
    expect(getActiveSeason(local(2027, 1, 7))).toBeNull();
  });

  it('covers the other windows and leaves the gaps empty', () => {
    expect(getActiveSeason(local(2026, 11, 19))).toBeNull();
    expect(getActiveSeason(local(2026, 11, 20))?.id).toBe('thanksgiving');
    expect(getActiveSeason(local(2026, 11, 30))?.id).toBe('thanksgiving');
    expect(getActiveSeason(local(2026, 12, 1))?.id).toBe('christmas');
    expect(getActiveSeason(local(2026, 12, 26))?.id).toBe('christmas');
    expect(getActiveSeason(local(2027, 2, 6))).toBeNull();
    expect(getActiveSeason(local(2027, 2, 7))?.id).toBe('valentine');
    expect(getActiveSeason(local(2027, 2, 16))?.id).toBe('valentine');
    expect(getActiveSeason(local(2027, 2, 17))).toBeNull();
    expect(getActiveSeason(local(2027, 3, 19))).toBeNull();
    expect(getActiveSeason(local(2027, 3, 20))?.id).toBe('spring');
    expect(getActiveSeason(local(2027, 5, 31))?.id).toBe('spring');
    expect(getActiveSeason(local(2027, 6, 1))?.id).toBe('summer');
    expect(getActiveSeason(local(2027, 8, 31))?.id).toBe('summer');
    expect(getActiveSeason(local(2027, 9, 1))).toBeNull();
    expect(getActiveSeason(local(2027, 9, 15))).toBeNull();
  });
});

describe('resolveLook', () => {
  it('ignores the calendar when seasonal is off and keeps themeId', () => {
    const profile = defaultProfile();
    profile.themeId = 'ocean';
    profile.seasonal = 'off';
    const look = resolveLook(profile, local(2026, 10, 31));
    expect(look.season).toBeNull();
    expect(look.themeId).toBe('ocean');
    expect(profile.themeId).toBe('ocean');
  });

  it('returns the active season without changing themeId', () => {
    const profile = defaultProfile();
    profile.themeId = 'forest';
    profile.seasonal = 'auto';
    const on = resolveLook(profile, local(2026, 12, 31));
    expect(on.season?.id).toBe('newyear');
    expect(on.themeId).toBe('forest');
    const gap = resolveLook(profile, local(2027, 1, 7));
    expect(gap.season).toBeNull();
    expect(gap.themeId).toBe('forest');
  });
});

describe('season skins and saved profiles', () => {
  it('each season defines the same color tokens as a theme', () => {
    const required = Object.keys(THEMES[0]!.vars);
    for (const season of SEASONS) {
      for (const key of required) {
        expect(season.vars[key], `${season.id} ${key}`).toBeTruthy();
      }
      expect(season.glyphs.length).toBeGreaterThan(0);
      expect(season.notes.length).toBeGreaterThan(0);
    }
  });

  it('loadProfile defaults seasonal and block colors for an old save', () => {
    localStorage.clear();
    localStorage.setItem('clearnine-profile', JSON.stringify({ themeId: 'wood', mute: true }));
    const profile = loadProfile();
    expect(profile.seasonal).toBe('auto');
    expect(profile.blockStyle).toBe('uniform');
    expect(profile.themeId).toBe('wood');
    expect(profile.mute).toBe(true);
  });
});

describe('applyTheme', () => {
  it('sets data-season and particles, then removes them when seasonal is off', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    applyTheme('minimalist', { seasonal: 'auto', date: local(2026, 10, 26) });
    expect(document.documentElement.getAttribute('data-season')).toBe('halloween');
    expect(document.documentElement.style.getPropertyValue('--bg-top').trim().toLowerCase()).toBe('#2a160c');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')?.toLowerCase()).toBe(
      '#2a160c',
    );
    const count = document.getElementById('season-fx')?.childElementCount ?? 0;
    expect(count).toBeGreaterThanOrEqual(10);
    expect(count).toBeLessThanOrEqual(14);

    applyTheme('ocean', { seasonal: 'off', blockStyle: 'uniform', date: local(2026, 10, 26) });
    expect(document.documentElement.getAttribute('data-season')).toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('ocean');
    expect(document.getElementById('season-fx')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--accent').trim().toLowerCase()).toBe('#7ed9cb');
    expect(document.documentElement.style.getPropertyValue('--c1').trim()).toBe(
      document.documentElement.style.getPropertyValue('--c8').trim(),
    );
  });

  it('uses distinct block hues only while block style is varied', () => {
    applyTheme('minimalist', { seasonal: 'off', blockStyle: 'varied', date: local(2026, 9, 15) });
    const c1 = document.documentElement.style.getPropertyValue('--c1').trim().toLowerCase();
    const c2 = document.documentElement.style.getPropertyValue('--c2').trim().toLowerCase();
    expect(c1).not.toBe(c2);

    applyTheme('minimalist', { seasonal: 'off', blockStyle: 'uniform', date: local(2026, 9, 15) });
    expect(document.documentElement.style.getPropertyValue('--c1').trim().toLowerCase()).toBe('#3b82f6');
    expect(document.documentElement.style.getPropertyValue('--c2').trim().toLowerCase()).toBe('#3b82f6');
  });
});
