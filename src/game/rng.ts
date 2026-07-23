/** Seeded PRNG (Mulberry32) for deterministic Daily deals. */
export type RngState = { seed: number; counter: number };

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number, counter = 0): RngState & { next: () => number } {
  const state: RngState = { seed: seed >>> 0, counter };
  const next = (): number => {
    state.counter += 1;
    let t = (state.seed + state.counter * 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(state, { next });
}

export function rngFromDate(dateKey: string): RngState & { next: () => number } {
  return createRng(hashString(`clearnine-daily-${dateKey}`), 0);
}

export function cloneRng(
  state: RngState,
): RngState & { next: () => number } {
  return createRng(state.seed, state.counter);
}

/** Local calendar date as YYYY-MM-DD. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + delta);
  return todayKey(dt);
}
