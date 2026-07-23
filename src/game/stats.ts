import { addDays, todayKey } from './rng';

export type GameMode = 'classic' | 'daily';

export type RecentGame = {
  mode: GameMode;
  score: number;
  date: string;
  cleared: number;
};

export type LifetimeStats = {
  gamesPlayed: number;
  piecesPlaced: number;
  linesCleared: number;
  cellsCleared: number;
  maxCombo: number;
  maxStreak: number;
  /** Dates (YYYY-MM-DD) with at least one finished Daily. */
  dailyDates: string[];
};

export type Profile = {
  bestClassic: number;
  bestDaily: Record<string, number>;
  recentGames: RecentGame[];
  stats: LifetimeStats;
  unlockedGoals: string[];
  themeId: string;
  mute: boolean;
  haptics: boolean;
  seenTutorial: boolean;
};

const STORAGE_PROFILE = 'clearnine-profile';
const LEGACY_BEST = 'clearnine-best';
const LEGACY_MUTE = 'clearnine-mute';

export function emptyStats(): LifetimeStats {
  return {
    gamesPlayed: 0,
    piecesPlaced: 0,
    linesCleared: 0,
    cellsCleared: 0,
    maxCombo: 0,
    maxStreak: 0,
    dailyDates: [],
  };
}

export function defaultProfile(): Profile {
  return {
    bestClassic: 0,
    bestDaily: {},
    recentGames: [],
    stats: emptyStats(),
    unlockedGoals: [],
    themeId: 'minimalist',
    mute: false,
    haptics: true,
    seenTutorial: false,
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE);
    if (raw) {
      const parsed = JSON.parse(raw) as Profile;
      return {
        ...defaultProfile(),
        ...parsed,
        stats: { ...emptyStats(), ...parsed.stats },
        bestDaily: parsed.bestDaily ?? {},
        recentGames: parsed.recentGames ?? [],
        unlockedGoals: parsed.unlockedGoals ?? [],
        haptics: parsed.haptics ?? true,
        seenTutorial:
          typeof parsed.seenTutorial === 'boolean' ? parsed.seenTutorial : true,
      };
    }
  } catch {
    /* fall through to migrate */
  }
  return migrateLegacy();
}

function migrateLegacy(): Profile {
  const profile = defaultProfile();
  try {
    const best = localStorage.getItem(LEGACY_BEST);
    if (best) profile.bestClassic = Number(best) || 0;
    const mute = localStorage.getItem(LEGACY_MUTE);
    if (mute === '1') profile.mute = true;
  } catch {
    /* ignore */
  }
  saveProfile(profile);
  return profile;
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

export function getDailyBest(profile: Profile, date = todayKey()): number {
  return profile.bestDaily[date] ?? 0;
}

/** Consecutive days ending today (or yesterday if today not yet played) with a Daily finish. */
export function dailyPlayStreak(profile: Profile, today = todayKey()): number {
  const set = new Set(profile.stats.dailyDates);
  let streak = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor) && cursor !== today) return 0;
  if (!set.has(today) && !set.has(addDays(today, -1))) return 0;
  if (!set.has(today)) {
    // streak counted through yesterday only
  }
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function recordPlacement(
  profile: Profile,
  opts: {
    combo: number;
    streak: number;
    clearCount: number;
    cellsCleared: number;
  },
): void {
  profile.stats.piecesPlaced += 1;
  profile.stats.linesCleared += opts.clearCount;
  profile.stats.cellsCleared += opts.cellsCleared;
  profile.stats.maxCombo = Math.max(profile.stats.maxCombo, opts.combo);
  profile.stats.maxStreak = Math.max(profile.stats.maxStreak, opts.streak);
}

export function recordGameFinished(
  profile: Profile,
  opts: {
    mode: GameMode;
    score: number;
    cleared: number;
    date?: string;
  },
): { newClassicBest: boolean; newDailyBest: boolean } {
  const date = opts.date ?? todayKey();
  profile.stats.gamesPlayed += 1;

  let newClassicBest = false;
  let newDailyBest = false;

  if (opts.mode === 'classic') {
    if (opts.score > profile.bestClassic) {
      profile.bestClassic = opts.score;
      newClassicBest = true;
    }
  } else {
    const prev = profile.bestDaily[date] ?? 0;
    if (opts.score > prev) {
      profile.bestDaily[date] = opts.score;
      newDailyBest = true;
    }
    if (!profile.stats.dailyDates.includes(date)) {
      profile.stats.dailyDates.push(date);
      profile.stats.dailyDates.sort();
    }
  }

  profile.recentGames.unshift({
    mode: opts.mode,
    score: opts.score,
    date,
    cleared: opts.cleared,
  });
  profile.recentGames = profile.recentGames.slice(0, 20);

  saveProfile(profile);
  return { newClassicBest, newDailyBest };
}
