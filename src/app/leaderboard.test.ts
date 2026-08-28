import { describe, expect, it } from 'vitest';
import { boardKey, tabToQuery } from './leaderboard';

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

describe('tabToQuery', () => {
  it('maps daily tab to today', () => {
    expect(tabToQuery('daily', '2026-08-28', '2026-W35')).toEqual({
      mode: 'daily',
      expert: false,
      period: '2026-08-28',
    });
  });
});
