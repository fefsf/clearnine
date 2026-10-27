import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardKey, deviceId, tabToQuery } from './leaderboard';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('boardKey', () => {
  it('namespaces expert and dated modes', () => {
    expect(boardKey('classic', false, '')).toBe('classic');
    expect(boardKey('classic', true, '')).toBe('expert-classic');
    expect(boardKey('daily', false, '2026-08-28')).toBe('daily-2026-08-28');
    expect(boardKey('daily', true, '2026-08-28')).toBe('expert-daily-2026-08-28');
    expect(boardKey('weekly', true, '2026-W35')).toBe('weekly-2026-W35');
    expect(boardKey('blitz', true, '')).toBe('blitz');
  });
});

describe('deviceId', () => {
  it('reuses a stored id and replaces the shared anonymous id', () => {
    localStorage.setItem('clearnine-device-id', 'device-abc12345');
    expect(deviceId()).toBe('device-abc12345');
    localStorage.setItem('clearnine-device-id', 'c9-anonymous');
    const next = deviceId();
    expect(next).not.toBe('c9-anonymous');
    expect(next.length).toBeGreaterThanOrEqual(8);
    expect(localStorage.getItem('clearnine-device-id')).toBe(next);
  });

  it('keeps one in-memory id when storage throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const a = deviceId();
    const b = deviceId();
    expect(a).not.toBe('c9-anonymous');
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(b).toBe(a);
  });
});

describe('tabToQuery', () => {
  it('maps daily tab to today', () => {
    expect(tabToQuery('daily', '2026-08-28', '2026-W35')).toEqual({
      mode: 'daily',
      expert: false,
      period: '2026-08-28',
    });
  });
});
