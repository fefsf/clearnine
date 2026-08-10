import { addDays, todayKey } from './rng';

export type GameMode = 'classic' | 'daily' | 'weekly' | 'blitz';

export type RecentGame = {
  mode: GameMode;
  score: number;
  date: string;
  cleared: number;
  expert?: boolean;
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
  /** Week keys with a finished Weekly Challenge. */
  weeklyKeys: string[];
};

export type Profile = {
  bestClassic: number;
  bestDaily: Record<string, number>;
  /** Expert Mode highs (separate so calm mode stays untouched). */
  bestClassicExpert: number;
  bestDailyExpert: Record<string, number>;
  bestWeekly: Record<string, number>;
  bestBlitz: number;
  recentGames: RecentGame[];
  stats: LifetimeStats;
  unlockedGoals: string[];
  themeId: string;
  mute: boolean;
  haptics: boolean;
  seenTutorial: boolean;
  expertMode: boolean;
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
    weeklyKeys: [],
  };
}

export function defaultProfile(): Profile {
  return {
    bestClassic: 0,
    bestDaily: {},
    bestClassicExpert: 0,
    bestDailyExpert: {},
    bestWeekly: {},
    bestBlitz: 0,
    recentGames: [],
    stats: emptyStats(),
    unlockedGoals: [],
    themeId: 'minimalist',
    mute: false,
    haptics: true,
    seenTutorial: false,
    expertMode: false,
  };
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      return {
        ...defaultProfile(),
        ...parsed,
        stats: { ...emptyStats(), ...parsed.stats },
        bestDaily: parsed.bestDaily ?? {},
        bestDailyExpert: parsed.bestDailyExpert ?? {},
        bestWeekly: parsed.bestWeekly ?? {},
        bestClassicExpert: parsed.bestClassicExpert ?? 0,
        bestBlitz: parsed.bestBlitz ?? 0,
        recentGames: parsed.recentGames ?? [],
        unlockedGoals: parsed.unlockedGoals ?? [],
        haptics: parsed.haptics ?? true,
        expertMode: parsed.expertMode ?? false,
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

export function getDailyBest(profile: Profile, date = todayKey(), expert = false): number {
  if (expert) return profile.bestDailyExpert[date] ?? 0;
  return profile.bestDaily[date] ?? 0;
}

export function getWeeklyBest(profile: Profile, week: string): number {
  return profile.bestWeekly[week] ?? 0;
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

/** Roll back a placement that was undone (counts only; lifetime maxes stay). */
export function reversePlacement(
  profile: Profile,
  opts: {
    clearCount: number;
    cellsCleared: number;
  },
): void {
  profile.stats.piecesPlaced = Math.max(0, profile.stats.piecesPlaced - 1);
  profile.stats.linesCleared = Math.max(0, profile.stats.linesCleared - opts.clearCount);
  profile.stats.cellsCleared = Math.max(0, profile.stats.cellsCleared - opts.cellsCleared);
}

export function recordGameFinished(
  profile: Profile,
  opts: {
    mode: GameMode;
    score: number;
    cleared: number;
    date?: string;
    week?: string;
    expert?: boolean;
  },
): { newClassicBest: boolean; newDailyBest: boolean; newWeeklyBest: boolean; newBlitzBest: boolean } {
  const date = opts.date ?? todayKey();
  const expert = opts.expert ?? false;
  profile.stats.gamesPlayed += 1;

  let newClassicBest = false;
  let newDailyBest = false;
  let newWeeklyBest = false;
  let newBlitzBest = false;

  if (opts.mode === 'classic') {
    if (expert) {
      if (opts.score > profile.bestClassicExpert) {
        profile.bestClassicExpert = opts.score;
        newClassicBest = true;
      }
    } else if (opts.score > profile.bestClassic) {
      profile.bestClassic = opts.score;
      newClassicBest = true;
    }
  } else if (opts.mode === 'daily') {
    const bag = expert ? profile.bestDailyExpert : profile.bestDaily;
    const prev = bag[date] ?? 0;
    if (opts.score > prev) {
      bag[date] = opts.score;
      newDailyBest = true;
    }
    if (!profile.stats.dailyDates.includes(date)) {
      profile.stats.dailyDates.push(date);
      profile.stats.dailyDates.sort();
    }
  } else if (opts.mode === 'weekly') {
    const week = opts.week ?? date;
    const prev = profile.bestWeekly[week] ?? 0;
    if (opts.score > prev) {
      profile.bestWeekly[week] = opts.score;
      newWeeklyBest = true;
    }
    if (!profile.stats.weeklyKeys.includes(week)) {
      profile.stats.weeklyKeys.push(week);
      profile.stats.weeklyKeys.sort();
    }
  } else if (opts.mode === 'blitz') {
    if (opts.score > profile.bestBlitz) {
      profile.bestBlitz = opts.score;
      newBlitzBest = true;
    }
  }

  profile.recentGames.unshift({
    mode: opts.mode,
    score: opts.score,
    date,
    cleared: opts.cleared,
    expert,
  });
  profile.recentGames = profile.recentGames.slice(0, 20);

  saveProfile(profile);
  return { newClassicBest, newDailyBest, newWeeklyBest, newBlitzBest };
}
