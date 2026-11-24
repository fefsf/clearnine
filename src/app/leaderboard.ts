import { APP_VERSION } from './version';
import type { GameMode } from '../game/stats';

export const LEADERBOARD_URL = 'https://c9.heezynet.com';
/**
 * Public speed bump, not a secret. The server ships the same default so
 * already-installed builds can still post. See server/README.md.
 */
export const LEADERBOARD_TOKEN = 'c9hzy_4f8e2a91b0c6d3e7';

const STORAGE_DEVICE = 'clearnine-device-id';
const ANONYMOUS_DEVICE = 'c9-anonymous';
let memoryDeviceId: string | null = null;

function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c9-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type BoardTab = 'classic' | 'classic-expert' | 'daily' | 'daily-expert' | 'weekly' | 'blitz';

export type BoardRow = {
  rank: number;
  name: string;
  score: number;
  you: boolean;
};

export function boardKey(mode: GameMode, expert: boolean, periodKey: string): string | null {
  const exp = expert ? 'expert-' : '';
  if (mode === 'classic') return `${exp}classic`;
  if (mode === 'daily') return `${exp}daily-${periodKey}`;
  if (mode === 'weekly') return `weekly-${periodKey}`;
  if (mode === 'blitz') return 'blitz';
  return null;
}

export function tabToQuery(tab: BoardTab, today: string, week: string): {
  mode: GameMode;
  expert: boolean;
  period: string;
} {
  if (tab === 'classic') return { mode: 'classic', expert: false, period: '' };
  if (tab === 'classic-expert') return { mode: 'classic', expert: true, period: '' };
  if (tab === 'daily') return { mode: 'daily', expert: false, period: today };
  if (tab === 'daily-expert') return { mode: 'daily', expert: true, period: today };
  if (tab === 'weekly') return { mode: 'weekly', expert: true, period: week };
  return { mode: 'blitz', expert: true, period: '' };
}

/** Same rule the server applies. Keep in sync with cleanName in server/index.mjs. */
const NAME_OK = /^[\p{L}\p{N} ._\-]+$/u;

export function cleanBoardName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 20);
}

/** Why the server would refuse this name, or null when it is fine. */
export function boardNameProblem(raw: string): string | null {
  const name = cleanBoardName(raw);
  if (!name) return 'Type a leaderboard name first';
  if (!NAME_OK.test(name)) return 'Use only letters, numbers, spaces, . _ and - in the name';
  return null;
}

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_DEVICE);
    if (existing && existing.length >= 8 && existing !== ANONYMOUS_DEVICE) return existing;
    const id = newDeviceId();
    localStorage.setItem(STORAGE_DEVICE, id);
    return id;
  } catch {
    if (!memoryDeviceId) memoryDeviceId = newDeviceId();
    return memoryDeviceId;
  }
}

/** The server answered, but refused the request. `status` says why. */
export class BoardError extends Error {
  status: number;
  constructor(status: number) {
    super(`Board ${status}`);
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LEADERBOARD_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'X-C9-Token': LEADERBOARD_TOKEN,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new BoardError(res.status);
  return (await res.json()) as T;
}

export async function fetchBoard(tab: BoardTab, today: string, week: string): Promise<BoardRow[]> {
  const q = tabToQuery(tab, today, week);
  const params = new URLSearchParams({
    mode: q.mode,
    expert: q.expert ? '1' : '0',
    period: q.period,
    device: deviceId(),
  });
  const data = await api<{ rows: BoardRow[] }>(`/v1/board?${params}`);
  return data.rows ?? [];
}

export async function submitScore(opts: {
  name: string;
  mode: GameMode;
  expert: boolean;
  score: number;
  cleared: number;
  periodKey: string;
}): Promise<{ ok: boolean; improved?: boolean; rank?: number }> {
  return api('/v1/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: deviceId(),
      name: opts.name,
      mode: opts.mode,
      expert: opts.expert,
      score: opts.score,
      cleared: opts.cleared,
      periodKey: opts.periodKey,
      version: APP_VERSION,
    }),
  });
}

export async function pingBoard(): Promise<boolean> {
  try {
    const data = await api<{ ok?: boolean }>('/health');
    return data.ok === true;
  } catch {
    return false;
  }
}

const STORAGE_POSTED = 'clearnine-board-posted';

function readPosted(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_POSTED);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writePosted(map: Record<string, number>): void {
  try {
    // Dated boards pile up; keep the newest few dozen keys.
    const keys = Object.keys(map).sort();
    const trimmed: Record<string, number> = {};
    for (const key of keys.slice(-80)) trimmed[key] = map[key]!;
    localStorage.setItem(STORAGE_POSTED, JSON.stringify(trimmed));
  } catch {
    /* posting again later is harmless */
  }
}

/** Remember that the server has at least this score for the board (per name). */
export function markPosted(name: string, mode: GameMode, expert: boolean, periodKey: string, score: number): void {
  const key = boardKey(mode, expert, periodKey);
  if (!key) return;
  const map = readPosted();
  const slot = `${key}|${name}`;
  if ((map[slot] ?? 0) >= score) return;
  map[slot] = score;
  writePosted(map);
}

export type LocalBest = { mode: GameMode; expert: boolean; periodKey: string; score: number };

/**
 * Post any local best the server has not confirmed yet (a game that ended
 * offline, or one credited after a restart). Returns how many boards improved.
 * Stops at the first network failure; the next call tries again.
 */
export async function syncLocalBests(name: string, bests: LocalBest[]): Promise<number> {
  let improved = 0;
  const posted = readPosted();
  for (const best of bests) {
    const key = boardKey(best.mode, best.expert, best.periodKey);
    if (!key || best.score < 1) continue;
    if ((posted[`${key}|${name}`] ?? 0) >= best.score) continue;
    let result: { ok: boolean; improved?: boolean };
    try {
      result = await submitScore({
        name,
        mode: best.mode,
        expert: best.expert,
        score: best.score,
        cleared: 0,
        periodKey: best.periodKey,
      });
    } catch (err) {
      // One refused board must not hold back the others. A dead network does stop the pass.
      if (err instanceof BoardError && err.status === 400) continue;
      throw err;
    }
    if (result.ok) markPosted(name, best.mode, best.expert, best.periodKey, best.score);
    if (result.improved) improved += 1;
  }
  return improved;
}
