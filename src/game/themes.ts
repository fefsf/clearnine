import { GOALS, isGoalUnlocked } from './goals';
import type { Profile } from './stats';

export type ThemeDef = {
  id: string;
  name: string;
  /** Goal id required, or null if free. */
  requiresGoal: string | null;
  vars: Record<string, string>;
};

/** All block color slots share one hue (doc: uniform theme coloring). */
function uniformBlocks(color: string): Record<string, string> {
  return {
    '--c1': color,
    '--c2': color,
    '--c3': color,
    '--c4': color,
    '--c5': color,
    '--c6': color,
    '--c7': color,
    '--c8': color,
  };
}

export const THEMES: ThemeDef[] = [
  {
    id: 'minimalist',
    name: 'Minimalist',
    requiresGoal: null,
    vars: {
      '--bg-top': '#f4f6f8',
      '--bg-bot': '#e4e8ee',
      '--panel': '#ffffff',
      '--panel-edge': '#c5ccd6',
      '--cell-empty': '#e8ecf1',
      '--cell-empty-alt': '#dde3ea',
      '--region-line': '#9aa8b8',
      '--text': '#1a2430',
      '--text-dim': '#5a6a7a',
      '--accent': '#3b82f6',
      '--accent-warm': '#f59e0b',
      '--danger': '#e11d48',
      ...uniformBlocks('#3b82f6'),
      '--btn-text': '#ffffff',
      '--status-style': 'dark',
    },
  },
  {
    id: 'wood',
    name: 'Classic Wood',
    requiresGoal: null,
    vars: {
      '--bg-top': '#5c3d2e',
      '--bg-bot': '#3a2418',
      '--panel': '#6b4734',
      '--panel-edge': '#8a6348',
      '--cell-empty': '#4a3224',
      '--cell-empty-alt': '#3f2a1e',
      '--region-line': '#c4a574',
      '--text': '#f7ebe0',
      '--text-dim': '#c9b09a',
      '--accent': '#d4a574',
      '--accent-warm': '#e8c99a',
      '--danger': '#e07a7a',
      ...uniformBlocks('#c8956c'),
      '--btn-text': '#2a1810',
      '--status-style': 'light',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    requiresGoal: null,
    vars: {
      '--bg-top': '#1f4456',
      '--bg-bot': '#122833',
      '--panel': '#2a5164',
      '--panel-edge': '#4a7388',
      '--cell-empty': '#183848',
      '--cell-empty-alt': '#142e3a',
      '--region-line': '#7ed9cb',
      '--text': '#f3fafc',
      '--text-dim': '#b7d0dc',
      '--accent': '#7ed9cb',
      '--accent-warm': '#ffb86b',
      '--danger': '#f08a8a',
      ...uniformBlocks('#7ed9cb'),
      '--btn-text': '#12303a',
      '--status-style': 'light',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    requiresGoal: 'score_500',
    vars: {
      '--bg-top': '#4a2c1a',
      '--bg-bot': '#2a1510',
      '--panel': '#5a3828',
      '--panel-edge': '#7a5040',
      '--cell-empty': '#3a2218',
      '--cell-empty-alt': '#2e1a12',
      '--region-line': '#f0a05a',
      '--text': '#fff0e4',
      '--text-dim': '#c4a090',
      '--accent': '#f0a05a',
      '--accent-warm': '#e07a7a',
      '--danger': '#e07a7a',
      ...uniformBlocks('#f0a05a'),
      '--btn-text': '#2a1510',
      '--status-style': 'light',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    requiresGoal: 'combo_3',
    vars: {
      '--bg-top': '#1a3a28',
      '--bg-bot': '#0e2218',
      '--panel': '#244034',
      '--panel-edge': '#3a5c4c',
      '--cell-empty': '#142a20',
      '--cell-empty-alt': '#102018',
      '--region-line': '#8fd18a',
      '--text': '#e8f6ec',
      '--text-dim': '#8eb8a0',
      '--accent': '#8fd18a',
      '--accent-warm': '#e0c46a',
      '--danger': '#e07a7a',
      ...uniformBlocks('#8fd18a'),
      '--btn-text': '#0e2218',
      '--status-style': 'light',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    requiresGoal: 'score_5000',
    vars: {
      '--bg-top': '#1a1a2e',
      '--bg-bot': '#0d0d18',
      '--panel': '#2a2a42',
      '--panel-edge': '#444466',
      '--cell-empty': '#141428',
      '--cell-empty-alt': '#101020',
      '--region-line': '#c9a0e0',
      '--text': '#eee8f8',
      '--text-dim': '#a098b8',
      '--accent': '#c9a0e0',
      '--accent-warm': '#7aa8e0',
      '--danger': '#e07a7a',
      ...uniformBlocks('#c9a0e0'),
      '--btn-text': '#0d0d18',
      '--status-style': 'light',
    },
  },
];

export function isThemeUnlocked(profile: Profile, themeId: string): boolean {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) return false;
  if (!theme.requiresGoal) return true;
  return isGoalUnlocked(profile, theme.requiresGoal);
}

export function applyTheme(themeId: string): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]!;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.vars['--bg-top'] ?? '#3b82f6');
  void syncNativeStatusBar(theme.vars['--status-style'] === 'dark');
}

async function syncNativeStatusBar(darkIcons: boolean): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: darkIcons ? Style.Light : Style.Dark });
    await StatusBar.setBackgroundColor({
      color: getComputedStyle(document.documentElement).getPropertyValue('--bg-top').trim() || '#1a2430',
    });
  } catch {
    /* web / unsupported */
  }
}

export function themeUnlockHint(themeId: string): string {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme?.requiresGoal) return 'Ready to use';
  const goal = GOALS.find((g) => g.id === theme.requiresGoal);
  return goal ? `Locked — finish award “${goal.title}”` : 'Locked';
}
