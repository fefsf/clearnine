import { writeLocal } from '../app/storage';
import { evaluateGoals } from './goals';
import { addDays, todayKey } from './rng';

export type GameMode = 'classic' | 'daily' | 'weekly' | 'blitz' | 'puzzle';

/** Calm deal bias. Expert Mode does not use this. */
export type DealDepth = 'gentle' | 'normal' | 'deep';

/** Unknown or missing values stay on the original calm deal. */
export function normalizeDealDepth(value: unknown): DealDepth {
  if (value === 'gentle' || value === 'deep' || value === 'normal') return value;
  return 'normal';
}

/** Settings cycle: Gentle → Normal → Deep → Gentle. */
export function nextDealDepth(depth: DealDepth): DealDepth {
  if (depth === 'gentle') return 'normal';
  if (depth === 'normal') return 'deep';
  return 'gentle';
}

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
  /** Dates the Today’s Puzzle bonus goal was met. Older saves omit this. */
  dailyGoalsMet: string[];
  /** Week keys with a finished Weekly Challenge. */
  weeklyKeys: string[];
  /** Placements that left the board empty. Older saves omit this (treated as 0). */
  allClears: number;
};

/** Stored Profile shape. Older saves omit this and migrate to 1. */
export const PROFILE_SCHEMA_VERSION = 1;

export type Profile = {
  schemaVersion: number;
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
  /** 'auto' follows the calendar. 'off' keeps themeId until turned back on. */
  seasonal: 'auto' | 'off';
  /** 'uniform' is one block hue. 'varied' uses a small palette. */
  blockStyle: 'uniform' | 'varied';
  mute: boolean;
  haptics: boolean;
  seenTutorial: boolean;
  seenHoldCoach: boolean;
  expertMode: boolean;
  /** Calm Hold slot on Play. Expert Mode already includes Hold and ignores this. */
  holdOption: boolean;
  /**
   * Calm deal bias. 'normal' is the original weights. Expert Mode ignores this
   * and keeps rising pressure, Weekly, and Endgame.
   */
  dealDepth: DealDepth;
  leaderboardOn: boolean;
  leaderboardName: string;
  /** Best move counts for solved puzzle-pack ids. Missing on older saves. */
  puzzlesSolved: Record<string, { moves: number }>;
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
    dailyGoalsMet: [],
    weeklyKeys: [],
    allClears: 0,
  };
}

export function defaultProfile(): Profile {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
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
    seasonal: 'auto',
    blockStyle: 'uniform',
    mute: false,
    haptics: true,
    seenTutorial: false,
    seenHoldCoach: false,
    expertMode: false,
    holdOption: false,
    dealDepth: 'normal',
    leaderboardOn: false,
    leaderboardName: '',
    puzzlesSolved: {},
  };
}

function finishLoad(profile: Profile): Profile {
  if (settlePendingFinalizes(profile)) saveProfile(profile);
  return profile;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function wholeOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    return null;
  }
  return Math.floor(value);
}

function countOr(value: unknown, fallback: number): number {
  return wholeOrNull(value) ?? fallback;
}

function numberMap(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, number> = {};
  let count = 0;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (key.length === 0 || key.length > 40) continue;
    const n = wholeOrNull(value[key]);
    if (n == null) continue;
    out[key] = n;
    count += 1;
    if (count >= 4000) break;
  }
  return out;
}

function stringList(value: unknown, max: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!text || text.length > maxLen) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function themeIdOf(value: unknown): string {
  if (typeof value !== 'string') return 'minimalist';
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(id)) return 'minimalist';
  return id;
}

function leaderboardNameOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

function isMode(value: unknown): value is GameMode {
  return (
    value === 'classic' ||
    value === 'daily' ||
    value === 'weekly' ||
    value === 'blitz' ||
    value === 'puzzle'
  );
}

const PUZZLE_SOLVE_ID = /^[a-z0-9_-]{1,32}$/;

/** Drop unknown ids and non-integer move counts. Older profiles have no map. */
function migratePuzzlesSolved(value: unknown): Record<string, { moves: number }> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, { moves: number }> = {};
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (!PUZZLE_SOLVE_ID.test(key)) continue;
    const item = value[key];
    if (!isPlainObject(item)) continue;
    const moves = item.moves;
    if (typeof moves !== 'number' || !Number.isInteger(moves) || moves < 0 || moves > 999) continue;
    out[key] = { moves };
    if (Object.keys(out).length >= 200) break;
  }
  return out;
}

function migrateStats(value: unknown): LifetimeStats {
  const src = isPlainObject(value) ? value : {};
  return {
    gamesPlayed: countOr(src.gamesPlayed, 0),
    piecesPlaced: countOr(src.piecesPlaced, 0),
    linesCleared: countOr(src.linesCleared, 0),
    cellsCleared: countOr(src.cellsCleared, 0),
    maxCombo: countOr(src.maxCombo, 0),
    maxStreak: countOr(src.maxStreak, 0),
    dailyDates: stringList(src.dailyDates, 4000, 32),
    dailyGoalsMet: dailyGoalDates(src.dailyGoalsMet),
    weeklyKeys: stringList(src.weeklyKeys, 2000, 16),
    allClears: countOr(src.allClears, 0),
  };
}

function migrateRecent(value: unknown): RecentGame[] {
  if (!Array.isArray(value)) return [];
  const out: RecentGame[] = [];
  for (const item of value) {
    if (!isPlainObject(item) || !isMode(item.mode)) continue;
    const score = wholeOrNull(item.score);
    const cleared = wholeOrNull(item.cleared);
    if (score == null || cleared == null) continue;
    if (typeof item.date !== 'string' || item.date.trim().length === 0 || item.date.length > 32) continue;
    const game: RecentGame = {
      mode: item.mode,
      score,
      date: item.date.trim(),
      cleared,
    };
    if (typeof item.expert === 'boolean') game.expert = item.expert;
    out.push(game);
    if (out.length >= 20) break;
  }
  return out;
}

function stampSchema(incoming: number): number {
  if (!Number.isFinite(incoming) || incoming < 1 || incoming > PROFILE_SCHEMA_VERSION) {
    return PROFILE_SCHEMA_VERSION;
  }
  return incoming;
}

/**
 * Normalize a stored profile. Missing schemaVersion (v0) becomes 1.
 * A newer schemaVersion is read field-by-field and stamped as the current
 * version so unknown extras cannot crash the app.
 */
export function migrateProfile(raw: unknown): Profile {
  try {
    const src = isPlainObject(raw) ? raw : {};
    const incoming = typeof src.schemaVersion === 'number' ? src.schemaVersion : 0;
    return {
      schemaVersion: stampSchema(incoming),
      bestClassic: countOr(src.bestClassic, 0),
      bestDaily: numberMap(src.bestDaily),
      bestClassicExpert: countOr(src.bestClassicExpert, 0),
      bestDailyExpert: numberMap(src.bestDailyExpert),
      bestWeekly: numberMap(src.bestWeekly),
      bestBlitz: countOr(src.bestBlitz, 0),
      recentGames: migrateRecent(src.recentGames),
      stats: migrateStats(src.stats),
      unlockedGoals: stringList(src.unlockedGoals, 200, 64),
      themeId: themeIdOf(src.themeId),
      seasonal: src.seasonal === 'off' ? 'off' : 'auto',
      blockStyle: src.blockStyle === 'varied' ? 'varied' : 'uniform',
      mute: flag(src.mute, false),
      haptics: flag(src.haptics, true),
      seenTutorial: flag(src.seenTutorial, false),
      seenHoldCoach: src.seenHoldCoach === true,
      expertMode: flag(src.expertMode, false),
      holdOption: flag(src.holdOption, false),
      dealDepth: normalizeDealDepth(src.dealDepth),
      leaderboardOn: flag(src.leaderboardOn, false),
      leaderboardName: leaderboardNameOf(src.leaderboardName),
      puzzlesSolved: migratePuzzlesSolved(src.puzzlesSolved),
    };
  } catch {
    return defaultProfile();
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILE);
    if (raw) return finishLoad(migrateProfile(JSON.parse(raw) as unknown));
  } catch {
    /* fall through to migrate */
  }
  return finishLoad(migrateLegacy());
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
  writeLocal(STORAGE_PROFILE, JSON.stringify(profile));
}

/** Keep the fewest moves for a solved puzzle. Invalid ids are ignored. */
export function recordPuzzleSolved(profile: Profile, id: string, moves: number): void {
  if (!PUZZLE_SOLVE_ID.test(id)) return;
  if (!Number.isInteger(moves) || moves < 0 || moves > 999) return;
  const prev = profile.puzzlesSolved[id];
  if (!prev || moves < prev.moves) profile.puzzlesSolved[id] = { moves };
  saveProfile(profile);
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
  if (!set.has(cursor)) return 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

const DAILY_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isDailyDateKey(key: string): boolean {
  if (!DAILY_DATE_KEY.test(key)) return false;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Valid, unique Daily dates. Junk and repeats from older or edited saves are dropped. */
function dailyGoalDates(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of stringList(value, 4000, 32)) {
    if (!isDailyDateKey(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  out.sort();
  return out;
}

/** Longest run of back-to-back Daily finishes, including streaks that already ended. */
export function longestDailyStreak(profile: Profile): number {
  const days = [...new Set(profile.stats.dailyDates.filter(isDailyDateKey))].sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const day of days) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}

type PlacementSnap = {
  maxCombo: number;
  maxStreak: number;
  unlockedGoals: string[];
};

/**
 * Undo can roll back max combo, max streak, and trophies earned by that move.
 * Snapshots live only as long as the profile object does — relaunch drops the
 * undo stack too, so there is nothing to restore.
 */
const placementSnaps = new WeakMap<Profile, PlacementSnap[]>();

function snapStack(profile: Profile): PlacementSnap[] {
  let stack = placementSnaps.get(profile);
  if (!stack) {
    stack = [];
    placementSnaps.set(profile, stack);
  }
  return stack;
}

export function recordPlacement(
  profile: Profile,
  opts: {
    combo: number;
    streak: number;
    clearCount: number;
    cellsCleared: number;
    allClear?: boolean;
  },
): void {
  snapStack(profile).push({
    maxCombo: profile.stats.maxCombo,
    maxStreak: profile.stats.maxStreak,
    unlockedGoals: profile.unlockedGoals.slice(),
  });
  profile.stats.piecesPlaced += 1;
  profile.stats.linesCleared += opts.clearCount;
  profile.stats.cellsCleared += opts.cellsCleared;
  if (opts.allClear) profile.stats.allClears = (profile.stats.allClears ?? 0) + 1;
  // scorePlacement reports comboMultiplier 1 when the move did not combo.
  if (opts.combo >= 2) {
    profile.stats.maxCombo = Math.max(profile.stats.maxCombo, opts.combo);
  }
  profile.stats.maxStreak = Math.max(profile.stats.maxStreak, opts.streak);
}

/** Roll back a placement that was undone, including maxes and trophies from that move. */
export function reversePlacement(
  profile: Profile,
  opts: {
    clearCount: number;
    cellsCleared: number;
    allClear?: boolean;
  },
): void {
  profile.stats.piecesPlaced = Math.max(0, profile.stats.piecesPlaced - 1);
  profile.stats.linesCleared = Math.max(0, profile.stats.linesCleared - opts.clearCount);
  profile.stats.cellsCleared = Math.max(0, profile.stats.cellsCleared - opts.cellsCleared);
  if (opts.allClear) profile.stats.allClears = Math.max(0, (profile.stats.allClears ?? 0) - 1);
  const snap = snapStack(profile).pop();
  if (!snap) return;
  profile.stats.maxCombo = snap.maxCombo;
  profile.stats.maxStreak = snap.maxStreak;
  profile.unlockedGoals = snap.unlockedGoals.slice();
}

const PENDING_KEY = 'clearnine-pending-finalize';

type PendingFinalize = {
  mode: GameMode;
  expert: boolean;
  score: number;
  cleared: number;
  date: string;
  week?: string;
  /** Calm Hold or non-normal difficulty. Must not become a ranked best. */
  practice?: boolean;
  /** Today’s Puzzle bonus goal was met on this finished run. */
  dailyGoalMet?: boolean;
};

type FinishOpts = {
  mode: GameMode;
  score: number;
  cleared: number;
  date?: string;
  week?: string;
  expert?: boolean;
  /** Skip best updates. Expert runs ignore this and record as they do today. */
  practice?: boolean;
  /** Today’s Puzzle bonus goal was met. Recorded once per date. */
  dailyGoalMet?: boolean;
};

type FinishFlags = {
  newClassicBest: boolean;
  newDailyBest: boolean;
  newWeeklyBest: boolean;
  newBlitzBest: boolean;
};

const FINISH_MODES = new Set<GameMode>(['classic', 'daily', 'weekly', 'blitz']);

function isPending(value: unknown): value is PendingFinalize {
  if (!value || typeof value !== 'object') return false;
  const item = value as PendingFinalize;
  return (
    FINISH_MODES.has(item.mode) &&
    typeof item.score === 'number' &&
    typeof item.cleared === 'number' &&
    typeof item.date === 'string'
  );
}

function readPending(): PendingFinalize[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPending);
  } catch {
    return [];
  }
}

function writePending(items: PendingFinalize[]): void {
  if (items.length === 0) {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  writeLocal(PENDING_KEY, JSON.stringify(items));
}

function sameSlot(item: PendingFinalize, mode: GameMode, expert: boolean): boolean {
  return item.mode === mode && !!item.expert === expert;
}

/** Park a finished run so a kill during the undo window still credits it. */
export function stagePendingFinalize(entry: PendingFinalize): void {
  const expert = !!entry.expert;
  const next = readPending().filter((item) => !sameSlot(item, entry.mode, expert));
  next.push({
    mode: entry.mode,
    expert,
    score: entry.score,
    cleared: entry.cleared,
    date: entry.date,
    week: entry.week,
    ...(entry.practice ? { practice: true } : {}),
    ...(entry.dailyGoalMet ? { dailyGoalMet: true } : {}),
  });
  writePending(next);
}

/** Forget a staged finish (the player undid the move that ended the run). */
export function discardPendingFinalize(mode: GameMode, expert = false): void {
  writePending(readPending().filter((item) => !sameSlot(item, mode, !!expert)));
}

function takePending(mode: GameMode, expert: boolean): PendingFinalize | null {
  const items = readPending();
  const found = items.find((item) => sameSlot(item, mode, expert)) ?? null;
  if (!found) return null;
  writePending(items.filter((item) => !sameSlot(item, mode, expert)));
  return found;
}

function sameFinish(pending: PendingFinalize, opts: FinishOpts): boolean {
  const expert = !!(opts.expert ?? false);
  if (!sameSlot(pending, opts.mode, expert)) return false;
  if (pending.score !== opts.score || pending.cleared !== opts.cleared) return false;
  if ((pending.week ?? '') !== (opts.week ?? '')) return false;
  if (opts.mode === 'daily' && opts.date && pending.date !== opts.date) return false;
  if ((pending.practice === true) !== (opts.practice === true)) return false;
  if ((pending.dailyGoalMet === true) !== (opts.dailyGoalMet === true)) return false;
  return true;
}

function settlePendingFinalizes(profile: Profile): boolean {
  const pending = readPending();
  if (pending.length === 0) return false;
  writePending([]);
  for (const item of pending) commitFinishedGame(profile, item);
  evaluateGoals(profile);
  return true;
}

function commitFinishedGame(profile: Profile, opts: FinishOpts): FinishFlags {
  const emptyFlags = {
    newClassicBest: false,
    newDailyBest: false,
    newWeeklyBest: false,
    newBlitzBest: false,
  };
  // Puzzle packs keep their own solve map. They must not touch bests,
  // games played, daily dates, or the recent-score list.
  if (opts.mode === 'puzzle') return emptyFlags;

  const date = opts.date ?? todayKey();
  const expert = opts.expert ?? false;
  // Calm Hold and Gentle/Deep deals still count as played, but they must not
  // replace the plain calm bests (or be treated as the fair Daily/Weekly high).
  const practice = !expert && opts.practice === true;
  profile.stats.gamesPlayed += 1;

  let newClassicBest = false;
  let newDailyBest = false;
  let newWeeklyBest = false;
  let newBlitzBest = false;

  if (opts.mode === 'classic') {
    if (!practice && expert) {
      if (opts.score > profile.bestClassicExpert) {
        profile.bestClassicExpert = opts.score;
        newClassicBest = true;
      }
    } else if (!practice && opts.score > profile.bestClassic) {
      profile.bestClassic = opts.score;
      newClassicBest = true;
    }
  } else if (opts.mode === 'daily') {
    if (!practice) {
      const bag = expert ? profile.bestDailyExpert : profile.bestDaily;
      const prev = bag[date] ?? 0;
      if (opts.score > prev) {
        bag[date] = opts.score;
        newDailyBest = true;
      }
    }
    if (!profile.stats.dailyDates.includes(date)) {
      profile.stats.dailyDates.push(date);
      profile.stats.dailyDates.sort();
    }
    if (opts.dailyGoalMet === true && isDailyDateKey(date)) {
      if (!Array.isArray(profile.stats.dailyGoalsMet)) profile.stats.dailyGoalsMet = [];
      if (!profile.stats.dailyGoalsMet.includes(date)) {
        profile.stats.dailyGoalsMet.push(date);
        profile.stats.dailyGoalsMet.sort();
      }
    }
  } else if (opts.mode === 'weekly') {
    const week = opts.week ?? date;
    const prev = profile.bestWeekly[week] ?? 0;
    if (!practice && opts.score > prev) {
      profile.bestWeekly[week] = opts.score;
      newWeeklyBest = true;
    }
    if (!profile.stats.weeklyKeys.includes(week)) {
      profile.stats.weeklyKeys.push(week);
      profile.stats.weeklyKeys.sort();
    }
  } else if (opts.mode === 'blitz') {
    if (!practice && opts.score > profile.bestBlitz) {
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

  return { newClassicBest, newDailyBest, newWeeklyBest, newBlitzBest };
}

export function recordGameFinished(profile: Profile, opts: FinishOpts): FinishFlags {
  const expert = opts.expert ?? false;
  const pending = takePending(opts.mode, expert);
  if (pending && !sameFinish(pending, opts)) {
    commitFinishedGame(profile, pending);
  }
  const flags = commitFinishedGame(profile, opts);
  saveProfile(profile);
  return flags;
}
