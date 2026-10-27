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

/** Opt-in palette. Keys are theme ids and season ids. */
const VARIED_HUES: Record<string, readonly string[]> = {
  minimalist: ['#3b82f6', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#e11d48', '#8b5cf6', '#0ea5e9'],
  wood: ['#c8956c', '#d4a017', '#6b8f71', '#c45c26', '#8d6e63', '#b45309', '#a16207', '#4f7942'],
  ocean: ['#7ed9cb', '#38bdf8', '#3b82f6', '#2dd4bf', '#22d3ee', '#818cf8', '#5eead4', '#67e8f9'],
  sunset: ['#f0a05a', '#e11d48', '#f59e0b', '#fb7185', '#f97316', '#c084fc', '#fbbf24', '#e07a7a'],
  forest: ['#8fd18a', '#4ade80', '#a3e635', '#34d399', '#eab308', '#22c55e', '#86efac', '#65a30d'],
  midnight: ['#c9a0e0', '#818cf8', '#7aa8e0', '#e879f9', '#67e8f9', '#a78bfa', '#f0abfc', '#93c5fd'],
  halloween: ['#ff9a3c', '#c084fc', '#facc15', '#a855f7', '#fb923c', '#e879f9', '#fbbf24', '#7c3aed'],
  thanksgiving: ['#ffbf69', '#ea580c', '#fbbf24', '#d97706', '#f59e0b', '#c2410c', '#fcd34d', '#b45309'],
  christmas: ['#ff6b6b', '#3cb371', '#f4fbff', '#ef4444', '#4ade80', '#fecaca', '#22c55e', '#fca5a5'],
  newyear: ['#f6d36b', '#93c5fd', '#f8fafc', '#fbbf24', '#60a5fa', '#fde68a', '#c4b5fd', '#e2e8f0'],
  valentine: ['#ff8fab', '#fb7185', '#fda4af', '#e11d48', '#f9a8d4', '#be123c', '#fecdd3', '#f43f5e'],
  spring: ['#8ee4b0', '#f9a8d4', '#fde68a', '#86efac', '#6ee7b7', '#fbcfe8', '#a3e635', '#5eead4'],
  summer: ['#7dd3fc', '#ffe08a', '#38bdf8', '#fbbf24', '#2dd4bf', '#fde68a', '#fb923c', '#67e8f9'],
};

function variedBlockVars(id: string): Record<string, string> | null {
  const hues = VARIED_HUES[id];
  if (!hues || hues.length < 8) return null;
  const vars: Record<string, string> = {};
  for (let i = 0; i < 8; i++) vars[`--c${i + 1}`] = hues[i]!;
  return vars;
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

export type SeasonFx = 'bats' | 'snow' | 'leaves' | 'hearts' | 'petals' | 'sun' | 'confetti';

export type SeasonDef = {
  id: string;
  name: string;
  /** Inclusive local month (1–12) and day. `end` may wrap past New Year. */
  start: [number, number];
  end: [number, number];
  vars: Record<string, string>;
  fx: SeasonFx;
  glyphs: string[];
  /** Short quiet sting, played once. Frequencies in Hz. */
  notes: number[];
};

type SeasonSkin = {
  bgTop: string;
  bgBot: string;
  panel: string;
  panelEdge: string;
  cell: string;
  cellAlt: string;
  region: string;
  text: string;
  textDim: string;
  accent: string;
  warm: string;
  danger: string;
  block: string;
  btnText: string;
};

function seasonVars(skin: SeasonSkin): Record<string, string> {
  return {
    '--bg-top': skin.bgTop,
    '--bg-bot': skin.bgBot,
    '--panel': skin.panel,
    '--panel-edge': skin.panelEdge,
    '--cell-empty': skin.cell,
    '--cell-empty-alt': skin.cellAlt,
    '--region-line': skin.region,
    '--text': skin.text,
    '--text-dim': skin.textDim,
    '--accent': skin.accent,
    '--accent-warm': skin.warm,
    '--danger': skin.danger,
    ...uniformBlocks(skin.block),
    '--btn-text': skin.btnText,
    '--status-style': 'light',
  };
}

/** Non-overlapping local-date windows. Gaps keep the saved theme. */
export const SEASONS: SeasonDef[] = [
  {
    id: 'halloween',
    name: 'Halloween',
    start: [10, 15],
    end: [11, 1],
    fx: 'bats',
    glyphs: ['🦇', '🎃'],
    notes: [392, 466.16, 349.23],
    vars: seasonVars({
      bgTop: '#2a160c',
      bgBot: '#12080c',
      panel: '#3a2214',
      panelEdge: '#6b3d22',
      cell: '#24140c',
      cellAlt: '#1c100a',
      region: '#ffb15a',
      text: '#fff4e8',
      textDim: '#e7d0bc',
      accent: '#ff9a3c',
      warm: '#d8b4fe',
      danger: '#ff8b8b',
      block: '#ff9a3c',
      btnText: '#1a0e06',
    }),
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    start: [11, 20],
    end: [11, 30],
    fx: 'leaves',
    glyphs: ['🍁', '🍂'],
    notes: [349.23, 440, 523.25],
    vars: seasonVars({
      bgTop: '#3a2412',
      bgBot: '#241408',
      panel: '#4a3018',
      panelEdge: '#7a5430',
      cell: '#2e1c10',
      cellAlt: '#26160c',
      region: '#ffd59a',
      text: '#fff6e8',
      textDim: '#f0ddc4',
      accent: '#ffbf69',
      warm: '#ffe0b0',
      danger: '#ff8f7a',
      block: '#ffbf69',
      btnText: '#2a1608',
    }),
  },
  {
    id: 'christmas',
    name: 'Christmas',
    start: [12, 1],
    end: [12, 26],
    fx: 'snow',
    glyphs: ['❄', '✦'],
    notes: [523.25, 659.25, 783.99],
    vars: seasonVars({
      bgTop: '#123024',
      bgBot: '#0a1c14',
      panel: '#1a4030',
      panelEdge: '#3d6a52',
      cell: '#10281c',
      cellAlt: '#0c2016',
      region: '#f4fbff',
      text: '#f4fff8',
      textDim: '#d5efe0',
      accent: '#ffd166',
      warm: '#ff6b6b',
      danger: '#ff8f8f',
      block: '#ff6b6b',
      btnText: '#1a1408',
    }),
  },
  {
    id: 'newyear',
    name: 'New Year',
    start: [12, 27],
    end: [1, 6],
    fx: 'confetti',
    glyphs: ['✦', '✨'],
    notes: [523.25, 659.25, 783.99, 1046.5],
    vars: seasonVars({
      bgTop: '#16182e',
      bgBot: '#0c1020',
      panel: '#222644',
      panelEdge: '#455080',
      cell: '#12162c',
      cellAlt: '#0e1224',
      region: '#f6d36b',
      text: '#f8f4e8',
      textDim: '#d9e2f2',
      accent: '#f6d36b',
      warm: '#dbe7ff',
      danger: '#ffb0b0',
      block: '#f6d36b',
      btnText: '#16120a',
    }),
  },
  {
    id: 'valentine',
    name: 'Valentine',
    start: [2, 7],
    end: [2, 16],
    fx: 'hearts',
    glyphs: ['♥', '❤'],
    notes: [523.25, 659.25, 698.46],
    vars: seasonVars({
      bgTop: '#3a1824',
      bgBot: '#240e18',
      panel: '#4c2232',
      panelEdge: '#7a3a52',
      cell: '#301420',
      cellAlt: '#261018',
      region: '#ffc2d4',
      text: '#fff0f4',
      textDim: '#f6d5df',
      accent: '#ff8fab',
      warm: '#ffc2d4',
      danger: '#ff8b8b',
      block: '#ff8fab',
      btnText: '#2a1018',
    }),
  },
  {
    id: 'spring',
    name: 'Spring',
    start: [3, 20],
    end: [5, 31],
    fx: 'petals',
    glyphs: ['✿', '🌸'],
    notes: [523.25, 659.25, 783.99],
    vars: seasonVars({
      bgTop: '#163228',
      bgBot: '#0e2218',
      panel: '#214838',
      panelEdge: '#3e6e58',
      cell: '#122c22',
      cellAlt: '#0e241c',
      region: '#ffc2d4',
      text: '#f4fff6',
      textDim: '#d7f5e4',
      accent: '#9ae6b4',
      warm: '#ffc2d4',
      danger: '#ff8fa8',
      block: '#8ee4b0',
      btnText: '#102018',
    }),
  },
  {
    id: 'summer',
    name: 'Summer',
    start: [6, 1],
    end: [8, 31],
    fx: 'sun',
    glyphs: ['☀', '✶'],
    notes: [587.33, 739.99, 880],
    vars: seasonVars({
      bgTop: '#123044',
      bgBot: '#0c2030',
      panel: '#1a4060',
      panelEdge: '#3a6888',
      cell: '#102838',
      cellAlt: '#0c2030',
      region: '#ffe08a',
      text: '#f4fbff',
      textDim: '#d4eaf8',
      accent: '#7dd3fc',
      warm: '#ffe08a',
      danger: '#ff9a9a',
      block: '#7dd3fc',
      btnText: '#082033',
    }),
  },
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASON_PARTICLE_COUNT = 12;

function monthDayValue(month: number, day: number): number {
  return month * 100 + day;
}

function dateInSeason(date: Date, season: SeasonDef): boolean {
  const cur = monthDayValue(date.getMonth() + 1, date.getDate());
  const start = monthDayValue(season.start[0], season.start[1]);
  const end = monthDayValue(season.end[0], season.end[1]);
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;
}

/** Active seasonal look for a local calendar date, or null on ordinary days. */
export function getActiveSeason(date: Date): SeasonDef | null {
  return SEASONS.find((season) => dateInSeason(date, season)) ?? null;
}

export function seasonRangeLabel(season: SeasonDef): string {
  const [month, day] = season.end;
  const name = MONTH_SHORT[month - 1] ?? '';
  return `${season.name} · through ${name} ${day}`;
}

export function resolveLook(
  profile: { themeId: string; seasonal?: 'auto' | 'off' },
  date: Date,
): { season: SeasonDef | null; themeId: string } {
  const themeId = profile.themeId;
  if (profile.seasonal === 'off') return { season: null, themeId };
  return { season: getActiveSeason(date), themeId };
}

export function isThemeUnlocked(profile: Profile, themeId: string): boolean {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) return false;
  if (!theme.requiresGoal) return true;
  return isGoalUnlocked(profile, theme.requiresGoal);
}

export type ApplyThemeOptions = {
  /** 'auto' follows the date. 'off' keeps the saved theme. Defaults to auto. */
  seasonal?: 'auto' | 'off';
  blockStyle?: 'uniform' | 'varied';
  date?: Date;
};

export function applyTheme(themeId: string, options: ApplyThemeOptions = {}): void {
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]!;
  const date = options.date ?? new Date();
  const { season } = resolveLook(
    { themeId: theme.id, seasonal: options.seasonal ?? 'auto' },
    date,
  );
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  if (season) root.setAttribute('data-season', season.id);
  else root.removeAttribute('data-season');

  const vars: Record<string, string> = { ...theme.vars, ...(season?.vars ?? {}) };
  if (options.blockStyle === 'varied') {
    const hues = variedBlockVars(season?.id ?? theme.id);
    if (hues) Object.assign(vars, hues);
  }

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', vars['--bg-top'] ?? '#3b82f6');
  syncSeasonFx(season);
  void syncNativeStatusBar(vars['--status-style'] === 'dark');
}

function syncSeasonFx(season: SeasonDef | null): void {
  const existing = document.getElementById('season-fx');
  if (!season) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.season === season.id && existing.childElementCount === SEASON_PARTICLE_COUNT) {
    return;
  }
  existing?.remove();
  if (!document.body) return;
  const layer = document.createElement('div');
  layer.id = 'season-fx';
  layer.dataset.season = season.id;
  layer.setAttribute('aria-hidden', 'true');
  const glyphs = season.glyphs.length ? season.glyphs : ['✦'];
  for (let i = 0; i < SEASON_PARTICLE_COUNT; i++) {
    const bit = document.createElement('span');
    bit.className = 'season-particle';
    bit.textContent = glyphs[i % glyphs.length]!;
    const left = (i * 7.7 + (i % 4) * 3.1) % 96;
    bit.style.setProperty('--x', `${left.toFixed(2)}%`);
    bit.style.setProperty('--delay', `${(-i * 1.15).toFixed(2)}s`);
    bit.style.setProperty('--dur', `${13 + (i % 5) * 1.7}s`);
    bit.style.setProperty('--drift', `${(i % 2 === 0 ? 1 : -1) * (12 + (i % 5) * 6)}px`);
    bit.style.setProperty('--spin', `${(i % 2 === 0 ? 1 : -1) * (18 + i * 7)}deg`);
    bit.style.setProperty('--size', `${13 + (i % 4) * 2}px`);
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
}

async function syncNativeStatusBar(darkIcons: boolean): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: darkIcons ? Style.Light : Style.Dark });
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch {
      /* Android 15+ may ignore */
    }
    try {
      await StatusBar.setBackgroundColor({
        color: getComputedStyle(document.documentElement).getPropertyValue('--bg-top').trim() || '#1a2430',
      });
    } catch {
      /* not available when overlay / Android 15+ */
    }

    const info = await StatusBar.getInfo().catch(() => null);
    const root = document.documentElement;
    const envTop = getComputedStyle(root).getPropertyValue('--safe-top').trim();
    const envTopPx = Number.parseFloat(envTop) || 0;
    // Fallback when WebView reports 0 safe-area but status bar has height.
    if (envTopPx < 1 && info?.overlays && info.height > 0) {
      root.style.setProperty('--safe-top', `${Math.round(info.height)}px`);
    }
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
