import { beforeEach, describe, expect, it } from 'vitest';
import { findClears } from './board';
import { findContinueFor, findContinueGame, Game } from './game';
import { evaluateGoals } from './goals';
import { createEmptyBoard } from './board';
import {
  defaultProfile,
  loadProfile,
  recordGameFinished,
  recordPlacement,
  reversePlacement,
} from './stats';

const dot = { id: 'dot', cells: [{ r: 0, c: 0 }], weight: 1 };
const wide = {
  id: 'h5',
  cells: [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 2 },
    { r: 0, c: 3 },
    { r: 0, c: 4 },
  ],
  weight: 1,
};

/** Every row, column, and region keeps a hole, and no row has five open cells. */
function lockBoard(game: Game): void {
  const holes = new Set([
    '0,0', '1,1', '2,2', '3,3', '4,4', '5,5', '6,6', '7,7', '8,8',
    '0,3', '1,6', '3,0', '4,8', '6,2', '7,3',
  ]);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      game.board[r]![c] = holes.has(`${r},${c}`) ? 0 : 1;
    }
  }
  game.tray = [dot, wide, { ...wide, id: 'h5b', cells: wide.cells.map((cell) => ({ ...cell })) }];
  game.hold = null;
}

describe('Revival regressions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps a finished run if the app dies while undo is still available', () => {
    const game = new Game();
    game.configure('classic', { expert: false });
    game.newGame();
    game.score = 499;
    game.clearsThisGame = 4;
    lockBoard(game);
    expect(findClears(game.board).clearCount).toBe(0);

    const placed = game.tryPlace(0, 0, 0);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.clears.clearCount).toBe(0);
    expect(placed.gameOver).toBe(true);
    expect(game.canUndo()).toBe(true);
    expect(game.score).toBe(500);
    expect(findContinueFor('classic', false)).toBeNull();

    const recovered = loadProfile();
    expect(recovered.bestClassic).toBe(500);
    expect(recovered.stats.gamesPlayed).toBe(1);
    expect(recovered.recentGames).toHaveLength(1);
    expect(recovered.recentGames[0]).toMatchObject({ mode: 'classic', score: 500, cleared: 4, expert: false });
    expect(recovered.unlockedGoals).toContain('score_500');
    expect(loadProfile().stats.gamesPlayed).toBe(1);
    expect(loadProfile().recentGames).toHaveLength(1);
  });

  it('does not credit a finish that was undone, and still lets that undo happen', () => {
    const game = new Game();
    game.configure('classic', { expert: false });
    game.newGame();
    lockBoard(game);
    const placed = game.tryPlace(0, 0, 0);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.gameOver).toBe(true);
    const undone = game.undo();
    expect(undone.ok).toBe(true);
    expect(game.gameOver).toBe(false);
    expect(game.score).toBe(0);

    const profile = loadProfile();
    expect(profile.stats.gamesPlayed).toBe(0);
    expect(profile.bestClassic).toBe(0);
    expect(profile.recentGames).toEqual([]);
    expect(findContinueFor('classic', false)?.mode).toBe('classic');
  });

  it('credits daily, weekly, blitz, and expert bests once when main also finalizes', () => {
    const daily = new Game();
    daily.configure('daily', { dailyDate: '2026-04-02', expert: false });
    daily.newGame();
    daily.score = 250;
    daily.clearsThisGame = 3;
    daily.gameOver = true;
    daily.persist();

    const weekly = new Game();
    weekly.configure('weekly', { week: '2026-W10', expert: true });
    weekly.newGame();
    weekly.score = 640;
    weekly.clearsThisGame = 2;
    weekly.gameOver = true;
    weekly.persist();

    const blitz = new Game();
    blitz.configure('blitz', { expert: true });
    blitz.newGame();
    blitz.score = 90;
    blitz.clearsThisGame = 1;
    blitz.gameOver = true;
    blitz.persist();

    const expert = new Game();
    expert.configure('classic', { expert: true });
    expert.newGame();
    expert.score = 800;
    expert.clearsThisGame = 5;
    expert.gameOver = true;
    expert.persist();

    const profile = defaultProfile();
    recordGameFinished(profile, {
      mode: 'daily',
      score: 250,
      cleared: 3,
      date: '2026-04-02',
      expert: false,
    });
    expect(profile.stats.gamesPlayed).toBe(1);

    const loaded = loadProfile();
    expect(loaded.stats.gamesPlayed).toBe(4);
    expect(loaded.bestDaily['2026-04-02']).toBe(250);
    expect(loaded.stats.dailyDates).toContain('2026-04-02');
    expect(loaded.bestWeekly['2026-W10']).toBe(640);
    expect(loaded.stats.weeklyKeys).toContain('2026-W10');
    expect(loaded.bestBlitz).toBe(90);
    expect(loaded.bestClassicExpert).toBe(800);
    expect(loaded.bestClassic).toBe(0);
    expect(loadProfile().stats.gamesPlayed).toBe(4);
    expect(loadProfile().stats.dailyDates.filter((day) => day === '2026-04-02')).toHaveLength(1);
  });

  it('still records an older staged finish when a later game finalizes with a different score', () => {
    const game = new Game();
    game.configure('classic', { expert: false });
    game.newGame();
    game.score = 500;
    game.clearsThisGame = 2;
    game.gameOver = true;
    game.persist();
    game.newGame();

    const profile = defaultProfile();
    const flags = recordGameFinished(profile, {
      mode: 'classic',
      score: 40,
      cleared: 0,
      expert: false,
    });
    expect(flags.newClassicBest).toBe(false);
    expect(profile.stats.gamesPlayed).toBe(2);
    expect(profile.bestClassic).toBe(500);
    expect(profile.recentGames.map((item) => item.score)).toEqual([40, 500]);
  });

  it('keeps the undo budget after Continue so post-resume moves can be undone', () => {
    const mono = { id: 'o1', cells: [{ r: 0, c: 0 }], weight: 1 };
    localStorage.setItem(
      'clearnine-save-classic',
      JSON.stringify({
        mode: 'classic',
        board: createEmptyBoard(),
        tray: [mono, null, null],
        hold: null,
        score: 12,
        streak: 0,
        gameOver: false,
        undosLeft: 3,
        undoStack: [],
        rng: { seed: 1, counter: 0 },
        clearsThisGame: 0,
        expert: false,
      }),
    );
    const resumed = new Game();
    resumed.configure('classic', { expert: false });
    expect(resumed.loadOrNew()).toBe(true);
    expect(resumed.undosLeft).toBe(3);
    expect(resumed.canUndo()).toBe(false);
    expect(resumed.tryPlace(0, 0, 0).ok).toBe(true);
    expect(resumed.canUndo()).toBe(true);
    expect(resumed.undosLeft).toBe(3);

    const live = new Game();
    live.configure('classic', { expert: false });
    live.newGame();
    expect(live.tryPlace(0, 0, 0).ok).toBe(true);
    expect(live.canUndo()).toBe(true);
    expect(live.undosLeft).toBe(3);
    const saved = JSON.parse(localStorage.getItem('clearnine-save-classic') ?? '{}') as {
      undoStack?: unknown[];
      undosLeft?: number;
    };
    expect(saved.undoStack ?? []).toEqual([]);
    expect(saved.undosLeft).toBe(3);
    expect(findContinueGame(false)?.score).toBeGreaterThan(0);
  });

  it('records a combo only at ×2 or higher and restores maxes and trophies on undo', () => {
    const profile = defaultProfile();
    profile.stats.maxCombo = 4;
    profile.stats.maxStreak = 2;
    profile.unlockedGoals = ['pieces_100'];

    recordPlacement(profile, { combo: 1, streak: 1, clearCount: 1, cellsCleared: 9 });
    expect(profile.stats.maxCombo).toBe(4);
    expect(profile.stats.maxStreak).toBe(2);
    expect(profile.stats.piecesPlaced).toBe(1);
    expect(profile.stats.cellsCleared).toBe(9);

    recordPlacement(profile, { combo: 5, streak: 9, clearCount: 5, cellsCleared: 30 });
    expect(profile.stats.maxCombo).toBe(5);
    expect(profile.stats.maxStreak).toBe(9);
    const unlocked = evaluateGoals(profile).map((goal) => goal.id);
    expect(unlocked).toEqual(expect.arrayContaining(['combo_3', 'combo_4', 'combo_5']));

    reversePlacement(profile, { clearCount: 5, cellsCleared: 30 });
    expect(profile.stats.maxCombo).toBe(4);
    expect(profile.stats.maxStreak).toBe(2);
    expect(profile.stats.piecesPlaced).toBe(1);
    expect(profile.stats.linesCleared).toBe(1);
    expect(profile.stats.cellsCleared).toBe(9);
    expect(profile.unlockedGoals).toEqual(['pieces_100']);

    reversePlacement(profile, { clearCount: 1, cellsCleared: 9 });
    expect(profile.stats.piecesPlaced).toBe(0);
    expect(profile.stats.linesCleared).toBe(0);
    expect(profile.stats.cellsCleared).toBe(0);
    expect(profile.stats.maxCombo).toBe(4);
    expect(profile.stats.maxStreak).toBe(2);
  });
});
