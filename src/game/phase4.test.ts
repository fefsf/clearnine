import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyBoard, seedDailyStarters } from './board';
import { Game } from './game';
import { createRng } from './rng';
import { loadProfile, saveProfile } from './stats';
import {
  resetStorageFailWarning,
  setStorageFailHandler,
  writeLocal,
} from '../app/storage';

describe('Phase 4 polish regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStorageFailWarning();
  });

  it('L1: dense seedDailyStarters places the requested starter count', () => {
    const board = createEmptyBoard();
    const rng = createRng(42);
    const placed = seedDailyStarters(board, () => rng.next(), { dense: true });
    expect(placed).toBeGreaterThanOrEqual(5);
    const filled = board.flat().filter((c) => c !== 0).length;
    expect(filled).toBeGreaterThan(0);
  });

  it('L2: applySave clears hold when Hold UI is disabled', () => {
    const mono = { id: 'o1', cells: [{ r: 0, c: 0 }], weight: 1 };
    localStorage.setItem(
      'clearnine-save-classic',
      JSON.stringify({
        mode: 'classic',
        board: createEmptyBoard(),
        tray: [mono, null, null],
        hold: mono,
        score: 10,
        streak: 0,
        gameOver: false,
        undosLeft: 3,
        undoStack: [],
        rng: { seed: 1, counter: 0 },
        clearsThisGame: 0,
        expert: false,
      }),
    );
    const game = new Game();
    game.configure('classic', { expert: false });
    expect(game.loadOrNew()).toBe(true);
    expect(game.hold).toBeNull();
  });

  it('L3: writeLocal reports failure once when setItem throws', () => {
    const handler = vi.fn();
    setStorageFailHandler(handler);
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    expect(writeLocal('k', 'v')).toBe(false);
    expect(writeLocal('k2', 'v2')).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    setStorageFailHandler(null);
  });

  it('L5: missing seenTutorial defaults to false (show tutorial)', () => {
    localStorage.setItem(
      'clearnine-profile',
      JSON.stringify({ bestClassic: 0, mute: false }),
    );
    const profile = loadProfile();
    expect(profile.seenTutorial).toBe(false);
    profile.seenTutorial = true;
    saveProfile(profile);
    expect(loadProfile().seenTutorial).toBe(true);
  });
});
