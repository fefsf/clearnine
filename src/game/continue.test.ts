import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyBoard } from './board';
import { findContinueFor, findContinueGame, Game } from './game';

function stubSave(key: string, opts: { score: number; expert: boolean; mode?: string }): void {
  const mono = { id: 'o1', cells: [{ r: 0, c: 0 }], weight: 1 };
  localStorage.setItem(
    key,
    JSON.stringify({
      mode: opts.mode ?? 'classic',
      board: createEmptyBoard(),
      tray: [mono, null, null],
      hold: null,
      score: opts.score,
      streak: 0,
      gameOver: false,
      undosLeft: 3,
      undoStack: [],
      rng: { seed: 1, counter: 0 },
      clearsThisGame: 0,
      expert: opts.expert,
    }),
  );
}

describe('Continue after Settings / Expert toggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('still offers a calm in-progress game after Expert is turned on', () => {
    stubSave('clearnine-save-classic', { score: 420, expert: false });
    const found = findContinueGame(true);
    expect(found).toEqual({ mode: 'classic', score: 420, expert: false });
  });

  it('still offers an Expert in-progress game after Expert is turned off', () => {
    stubSave('clearnine-save-classic-expert', { score: 88, expert: true });
    const found = findContinueGame(false);
    expect(found).toEqual({ mode: 'classic', score: 88, expert: true });
  });

  it('prefers the current Expert lane when both saves exist', () => {
    stubSave('clearnine-save-classic', { score: 10, expert: false });
    stubSave('clearnine-save-classic-expert', { score: 99, expert: true });
    expect(findContinueGame(true)?.score).toBe(99);
    expect(findContinueGame(false)?.score).toBe(10);
  });

  it('findContinueFor only matches that mode and Expert flag', () => {
    stubSave('clearnine-save-classic', { score: 50, expert: false });
    expect(findContinueFor('classic', false)?.score).toBe(50);
    expect(findContinueFor('classic', true)).toBeNull();
    expect(findContinueFor('daily', false)).toBeNull();
  });

  it('loadOrNew restores the save for the configured Expert flag', () => {
    stubSave('clearnine-save-classic', { score: 420, expert: false });
    const game = new Game();
    game.configure('classic', { expert: true });
    expect(game.loadOrNew()).toBe(false);
    expect(game.score).toBe(0);

    game.configure('classic', { expert: false });
    expect(game.loadOrNew()).toBe(true);
    expect(game.score).toBe(420);
  });
});
