import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayKey } from '../game/rng';
import { loadProfile, PROFILE_SCHEMA_VERSION, type Profile } from '../game/stats';
import { APP_VERSION } from './version';
import {
  applyBackup,
  BACKUP_SCHEMA_VERSION,
  buildBackup,
  MAX_BACKUP_CHARS,
  parseBackup,
  serializeBackup,
  type BackupFile,
  type BackupStorage,
} from './backup';

function mem(initial: Record<string, string> = {}): BackupStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function envelope(data: Record<string, string | object>, schemaVersion = 1): BackupFile {
  return {
    app: 'ClearNine',
    schemaVersion,
    appVersion: '1.12.21',
    exportedAt: '2026-10-26T12:00:00.000Z',
    data,
  };
}

function classicSave(expert: boolean, score: number) {
  const board = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
  board[0]![0] = 1;
  return {
    mode: 'classic' as const,
    board,
    tray: [{ id: 'dot', cells: [{ r: 0, c: 0 }], weight: 1 }, null, null],
    hold: null,
    score,
    streak: 1,
    gameOver: false,
    undosLeft: 0,
    undoStack: [] as unknown[],
    rng: { seed: 5, counter: 2 },
    clearsThisGame: 3,
    expert,
  };
}

describe('local backup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips progress, excludes device id, and replaces saves', () => {
    const today = todayKey();
    const yesterday = addDays(today, -1);
    const source = mem({
      'clearnine-profile': JSON.stringify({
        bestClassic: 1200,
        bestClassicExpert: 80,
        bestBlitz: 40,
        stats: { gamesPlayed: 7, dailyDates: [yesterday, today] },
        leaderboardOn: true,
        leaderboardName: 'Ada',
        mute: true,
        seenTutorial: true,
        haptics: false,
        themeId: 'wood',
        seasonal: 'off',
        unlockedGoals: ['score_500'],
      }),
      'clearnine-save-classic': JSON.stringify({
        ...classicSave(false, 42),
        undoStack: [{ board: 'nope' }],
      }),
      'clearnine-save-classic-expert': JSON.stringify(classicSave(true, 9)),
      'clearnine-save-daily': JSON.stringify({
        ...classicSave(false, 4),
        mode: 'daily',
        dailyDate: '2026-10-01',
      }),
      'clearnine-device-id': 'device-abc12345',
      'clearnine-update-last-check': '111',
      'clearnine-update-skipped': '1.0.0',
      'clearnine-update-snooze': '{}',
      'clearnine-pending-finalize': '[{"mode":"classic"}]',
      'clearnine-best': '999',
      'clearnine-mute': '1',
    });

    const built = buildBackup(source, new Date('2026-10-26T15:00:00.000Z'));
    expect(built.app).toBe('ClearNine');
    expect(built.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(built.appVersion).toBe(APP_VERSION);
    expect(built.exportedAt).toBe('2026-10-26T15:00:00.000Z');
    const keys = Object.keys(built.data);
    expect(keys).toEqual(
      expect.arrayContaining([
        'clearnine-profile',
        'clearnine-save-classic',
        'clearnine-save-classic-expert',
        'clearnine-save-daily',
      ]),
    );
    expect(keys).not.toContain('clearnine-device-id');
    expect(keys).not.toContain('clearnine-update-last-check');
    expect(keys).not.toContain('clearnine-update-skipped');
    expect(keys).not.toContain('clearnine-pending-finalize');
    expect(serializeBackup(built)).not.toContain('device-abc12345');

    const parsed = parseBackup(serializeBackup(built));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const dest = mem({
      'clearnine-profile': JSON.stringify({ bestClassic: 1 }),
      'clearnine-save-weekly': '{"stale":true}',
      'clearnine-device-id': 'dest-device',
      'clearnine-update-last-check': '222',
      'clearnine-pending-finalize': '[{"mode":"classic"}]',
    });
    const applied = applyBackup(parsed.backup, dest);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.summary).toEqual({
      bestClassic: 1200,
      bestClassicExpert: 80,
      bestBlitz: 40,
      gamesPlayed: 7,
      dailyStreak: 2,
    });

    const profile = JSON.parse(dest.getItem('clearnine-profile') ?? '{}') as Profile;
    expect(profile.leaderboardName).toBe('Ada');
    expect(profile.leaderboardOn).toBe(true);
    expect(profile.mute).toBe(true);
    expect(profile.haptics).toBe(false);
    expect(profile.seenTutorial).toBe(true);
    expect(profile.themeId).toBe('wood');
    expect(profile.seasonal).toBe('off');
    expect(profile.blockStyle).toBe('uniform');
    expect(profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(profile.unlockedGoals).toEqual(['score_500']);

    const save = JSON.parse(dest.getItem('clearnine-save-classic') ?? '{}') as {
      score: number;
      undoStack: unknown[];
      expert: boolean;
    };
    expect(save.score).toBe(42);
    expect(save.undoStack).toEqual([]);
    expect(save.expert).toBe(false);
    const expert = JSON.parse(dest.getItem('clearnine-save-classic-expert') ?? '{}') as {
      score: number;
      expert: boolean;
    };
    expect(expert.score).toBe(9);
    expect(expert.expert).toBe(true);
    const daily = JSON.parse(dest.getItem('clearnine-save-daily') ?? '{}') as {
      score: number;
      dailyDate: string;
    };
    expect(daily.score).toBe(4);
    expect(daily.dailyDate).toBe('2026-10-01');
    expect(dest.getItem('clearnine-save-weekly')).toBeNull();
    expect(dest.getItem('clearnine-device-id')).toBe('dest-device');
    expect(dest.getItem('clearnine-update-last-check')).toBe('222');
    expect(dest.getItem('clearnine-pending-finalize')).toBeNull();
  });

  it('merges profile defaults and stamps schema version 1', () => {
    const parsed = parseBackup(
      JSON.stringify(
        envelope({
          'clearnine-profile': {
            themeId: 'wood',
            mute: true,
            bestClassic: 'nope' as unknown as number,
            stats: 'nope' as unknown as object,
            recentGames: 'crash' as unknown as object,
            schemaVersion: 99 as unknown as number,
            seasonal: 'off',
          },
        }),
      ),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const store = mem();
    const applied = applyBackup(parsed.backup, store);
    expect(applied.ok).toBe(true);
    const profile = JSON.parse(store.getItem('clearnine-profile') ?? '{}') as Profile;
    expect(profile.themeId).toBe('wood');
    expect(profile.mute).toBe(true);
    expect(profile.seasonal).toBe('off');
    expect(profile.blockStyle).toBe('uniform');
    expect(profile.bestClassic).toBe(0);
    expect(profile.schemaVersion).toBe(1);
    expect(profile.stats.gamesPlayed).toBe(0);
    expect(profile.recentGames).toEqual([]);
    expect(profile.haptics).toBe(true);
  });

  it('loadProfile migrates old and newer profiles without throwing', () => {
    localStorage.setItem('clearnine-profile', JSON.stringify({ themeId: 'wood', mute: true }));
    const old = loadProfile();
    expect(old.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(old.themeId).toBe('wood');
    expect(old.mute).toBe(true);
    expect(old.seasonal).toBe('auto');
    expect(old.blockStyle).toBe('uniform');

    localStorage.setItem(
      'clearnine-profile',
      JSON.stringify({
        schemaVersion: 99,
        bestClassic: { bad: true },
        stats: 'nope',
        recentGames: 'crash',
        bestBlitz: 15,
      }),
    );
    expect(() => loadProfile()).not.toThrow();
    const next = loadProfile();
    expect(next.schemaVersion).toBe(1);
    expect(next.bestClassic).toBe(0);
    expect(next.bestBlitz).toBe(15);
    expect(next.recentGames).toEqual([]);
    expect(next.stats.gamesPlayed).toBe(0);
  });

  it('rejects bad JSON and non-objects', () => {
    const broken = parseBackup('{');
    expect(broken.ok).toBe(false);
    expect(parseBackup('null').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('"ClearNine"').ok).toBe(false);
    if (!broken.ok) expect(broken.error).toBe('That backup could not be read.');
  });

  it('rejects a file that is not a ClearNine backup', () => {
    const text = JSON.stringify({ ...envelope({ 'clearnine-profile': { bestClassic: 1 } }), app: 'Other' });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe('That file is not a ClearNine backup.');
  });

  it('rejects a newer schema without writing', () => {
    const store = mem({ 'clearnine-profile': JSON.stringify({ bestClassic: 1 }) });
    const text = JSON.stringify(envelope({ 'clearnine-profile': { bestClassic: 5 } }, 99));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe('That backup is from a newer ClearNine.');
    const applied = applyBackup(envelope({ 'clearnine-profile': { bestClassic: 5 } }, 99), store);
    expect(applied.ok).toBe(false);
    expect(JSON.parse(store.getItem('clearnine-profile') ?? '{}').bestClassic).toBe(1);
  });

  it('rejects an oversized backup', () => {
    const parsed = parseBackup('x'.repeat(MAX_BACKUP_CHARS + 1));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe('That backup is too large.');
    const atCap = parseBackup('x'.repeat(MAX_BACKUP_CHARS));
    expect(atCap.ok).toBe(false);
    if (!atCap.ok) expect(atCap.error).toBe('That backup could not be read.');
  });

  it('rejects keys that are not on the allow list', () => {
    const text = JSON.stringify(
      envelope({
        'clearnine-profile': { bestClassic: 1 },
        'clearnine-device-id': 'cloned-phone',
      }),
    );
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe('That backup has unexpected data.');
  });

  it('rejects a saved game that is not a real board', () => {
    const store = mem({ 'clearnine-profile': '{"bestClassic":2}' });
    const applied = applyBackup(
      envelope({
        'clearnine-profile': { bestClassic: 2 },
        'clearnine-save-classic': { mode: 'classic', score: 'lots' },
      }),
      store,
    );
    expect(applied.ok).toBe(false);
    expect(store.getItem('clearnine-profile')).toBe('{"bestClassic":2}');
  });

  it('rolls back earlier writes when a later write fails', () => {
    const original = JSON.stringify({ bestClassic: 3, mute: true });
    const map = new Map<string, string>([
      ['clearnine-profile', original],
      ['clearnine-device-id', 'keep-me'],
      ['clearnine-pending-finalize', 'keep'],
    ]);
    const backup = buildBackup(
      mem({
        'clearnine-profile': JSON.stringify({ bestClassic: 99, stats: { gamesPlayed: 4 } }),
        'clearnine-save-classic': JSON.stringify(classicSave(false, 8)),
      }),
    );
    const storage: BackupStorage = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: (key, value) => {
        if (key === 'clearnine-save-classic') throw new Error('quota');
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
    };
    const applied = applyBackup(backup, storage);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.error).toBe('Could not save the backup. Your current progress was kept.');
    expect(map.get('clearnine-profile')).toBe(original);
    expect(map.has('clearnine-save-classic')).toBe(false);
    expect(map.get('clearnine-device-id')).toBe('keep-me');
    expect(map.get('clearnine-pending-finalize')).toBe('keep');
  });
});
