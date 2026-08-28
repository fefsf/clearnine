import { APP_VERSION } from './version';
import type { GameMode } from '../game/stats';

export const LEADERBOARD_URL = 'https://c9.heezynet.com';
export const LEADERBOARD_TOKEN = 'c9hzy_4f8e2a91b0c6d3e7';

const STORAGE_DEVICE = 'clearnine-device-id';

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

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_DEVICE);
    if (existing && existing.length >= 8) return existing;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `c9-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_DEVICE, id);
    return id;
  } catch {
    return 'c9-anonymous';
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
  if (!res.ok) throw new Error(`Board ${res.status}`);
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
