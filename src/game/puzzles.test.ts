import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '../app/backup';
import { findClears } from './board';
import { Game, findContinueGame, puzzleResumeId } from './game';
import { solvePuzzle } from './puzzle-solver';
import {
  PUZZLE_PACKS,
  PUZZLES,
  boardFromRows,
  getPuzzle,
  objectiveMet,
} from './puzzles';
import { PIECE_CATALOG } from './pieces';
import {
  defaultProfile,
  migrateProfile,
  recordGameFinished,
  recordPuzzleSolved,
} from './stats';
import { renderHome, renderPuzzles, type ScreenHandlers } from '../ui/screens';

function handlers(): ScreenHandlers {
  const noop = () => {};
  return {
    onClassic: noop,
    onDaily: noop,
    onWeekly: noop,
    onBlitz: noop,
    onPuzzles: noop,
    onPuzzle: noop,
    onContinue: noop,
    onRecords: noop,
    onGoals: noop,
    onThemes: noop,
    onHowTo: noop,
    onSettings: noop,
    onBoard: noop,
    onBackHome: noop,
    onSelectTheme: noop,
    onSelectSeason: noop,
    onToggleSeasonal: noop,
    onToggleBlockStyle: noop,
    onToggleMute: noop,
    onToggleHaptics: noop,
    onToggleExpert: noop,
    onToggleHoldOption: noop,
    onCycleDealDepth: noop,
    onToggleLeaderboard: noop,
    onSaveLeaderboardName: noop,
    onCheckUpdate: noop,
    onShowTips: noop,
  };
}

describe('puzzle packs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ships 24 solvable puzzles in three packs of eight', () => {
    expect(PUZZLE_PACKS.map((pack) => pack.puzzles.length)).toEqual([8, 8, 8]);
    expect(PUZZLES).toHaveLength(24);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.id)).size).toBe(24);

    const tooLong: string[] = [];
    for (const puzzle of PUZZLES) {
      expect(puzzle.board, puzzle.id).toHaveLength(9);
      for (const row of puzzle.board) expect(row, puzzle.id).toMatch(/^[.#]{9}$/);
      for (const tray of puzzle.trays) {
        expect(tray, puzzle.id).toHaveLength(3);
        for (const id of tray) {
          expect(PIECE_CATALOG.some((piece) => piece.id === id), `${puzzle.id} ${id}`).toBe(true);
        }
      }
      const board = boardFromRows(puzzle.board);
      expect(findClears(board).clearCount, puzzle.id).toBe(0);
      expect(objectiveMet(puzzle.objective, 0, 0, false), puzzle.id).toBe(false);

      const solved = solvePuzzle(puzzle);
      expect(solved, puzzle.id).not.toBeNull();
      if (puzzle.parMoves != null && solved!.length > puzzle.parMoves) {
        tooLong.push(`${puzzle.id} solved in ${solved!.length}, par ${puzzle.parMoves}`);
      }

      const game = new Game();
      game.configurePuzzle(puzzle.id);
      game.newGame();
      expect(game.undosLeft, puzzle.id).toBe(99);
      for (const move of solved!) {
        const result = game.tryPlace(move.slot, move.row, move.col);
        expect(result.ok, `${puzzle.id} slot ${move.slot} @ ${move.row},${move.col}`).toBe(true);
      }
      expect(game.puzzleWon, puzzle.id).toBe(true);
      expect(game.gameOver, puzzle.id).toBe(false);
      expect(game.puzzleMoves, puzzle.id).toBe(solved!.length);
    }
    expect(tooLong).toEqual([]);
  });

  it('undoes a win and a tray refill, then retry starts clean', () => {
    const puzzle = getPuzzle('s7')!;
    const moves = solvePuzzle(puzzle)!;
    expect(moves.length).toBeGreaterThanOrEqual(4);
    const game = new Game();
    game.configurePuzzle(puzzle.id);
    game.newGame();

    for (let i = 0; i < 3; i++) {
      expect(game.tryPlace(moves[i]!.slot, moves[i]!.row, moves[i]!.col).ok).toBe(true);
    }
    expect(game.puzzleWon).toBe(false);
    expect(game.tray.filter(Boolean)).toHaveLength(3);
    expect(game.undo().ok).toBe(true);
    expect(game.puzzleMoves).toBe(2);
    expect(game.tray.filter(Boolean)).toHaveLength(1);

    for (let i = 2; i < moves.length; i++) {
      expect(game.tryPlace(moves[i]!.slot, moves[i]!.row, moves[i]!.col).ok).toBe(true);
    }
    expect(game.puzzleWon).toBe(true);
    expect(game.undo().ok).toBe(true);
    expect(game.puzzleWon).toBe(false);

    game.newGame();
    expect(game.puzzleWon).toBe(false);
    expect(game.gameOver).toBe(false);
    expect(game.puzzleMoves).toBe(0);
    expect(game.tray.filter(Boolean)).toHaveLength(3);
  });

  it('fails when every piece misses, then Retry restores the board', () => {
    const game = new Game();
    game.configurePuzzle('m1');
    game.newGame();
    const wasted = [
      [8, 8],
      [8, 7],
      [8, 6],
    ] as const;
    for (const [row, col] of wasted) {
      const slot = game.tray.findIndex((piece) => piece != null);
      expect(game.tryPlace(slot, row, col).ok).toBe(true);
    }
    expect(game.puzzleWon).toBe(false);
    expect(game.gameOver).toBe(true);

    game.newGame();
    expect(game.gameOver).toBe(false);
    expect(game.puzzleMoves).toBe(0);
    expect(game.board[0]!.filter((cell) => cell !== 0).length).toBeGreaterThan(0);
  });

  it('does not touch ranked bests, Continue, or lifetime counts', () => {
    const profile = defaultProfile();
    profile.bestClassic = 40;
    profile.bestDaily['2026-01-02'] = 11;
    profile.bestBlitz = 7;
    profile.stats.gamesPlayed = 2;
    profile.stats.piecesPlaced = 9;
    profile.stats.linesCleared = 4;

    const game = new Game();
    game.configurePuzzle('w1');
    game.newGame();
    expect(findContinueGame(false)).toBeNull();
    expect(findContinueGame(true)).toBeNull();
    expect(puzzleResumeId()).toBe('w1');

    const classic = new Game();
    classic.configure('classic', { expert: false });
    classic.newGame();
    expect(findContinueGame(false)?.mode).toBe('classic');
    expect(puzzleResumeId()).toBe('w1');

    const moves = solvePuzzle(getPuzzle('w1')!)!;
    for (const move of moves) game.tryPlace(move.slot, move.row, move.col);
    expect(game.puzzleWon).toBe(true);
    expect(puzzleResumeId()).toBeNull();

    recordPuzzleSolved(profile, 'w1', game.puzzleMoves);
    recordGameFinished(profile, {
      mode: 'puzzle',
      score: game.score,
      cleared: 9,
      expert: false,
    });
    expect(profile.bestClassic).toBe(40);
    expect(profile.bestDaily['2026-01-02']).toBe(11);
    expect(profile.bestBlitz).toBe(7);
    expect(profile.stats.gamesPlayed).toBe(2);
    expect(profile.stats.piecesPlaced).toBe(9);
    expect(profile.stats.linesCleared).toBe(4);
    expect(profile.puzzlesSolved.w1).toEqual({ moves: game.puzzleMoves });
    expect(profile.recentGames.some((item) => item.mode === 'puzzle')).toBe(false);
  });

  it('keeps valid puzzle solves through profile migration and backup', () => {
    const migrated = migrateProfile({
      puzzlesSolved: {
        w1: { moves: 2 },
        Bad: { moves: 1 },
        s1: { moves: 1.5 },
        m1: { moves: 3 },
        '../../../x': { moves: 1 },
        s2: { moves: '2' },
      },
    });
    expect(migrated.puzzlesSolved).toEqual({ w1: { moves: 2 }, m1: { moves: 3 } });

    const parsed = parseBackup(JSON.stringify({
      app: 'ClearNine',
      schemaVersion: 1,
      appVersion: '1.14.0',
      exportedAt: '2026-10-26T12:00:00.000Z',
      data: {
        'clearnine-profile': {
          bestClassic: 5,
          puzzlesSolved: { w1: { moves: 4 }, evil: { moves: -3 } },
        },
      },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const profile = parsed.backup.data['clearnine-profile'] as { puzzlesSolved: Record<string, { moves: number }> };
    expect(profile.puzzlesSolved).toEqual({ w1: { moves: 4 } });
  });

  it('lists solved puzzles from home into the pack screen', () => {
    const profile = defaultProfile();
    profile.puzzlesSolved.w1 = { moves: 1 };
    const home = document.createElement('div');
    renderHome(home, profile, handlers(), null);
    expect(home.querySelector('#btn-puzzles')).not.toBeNull();
    expect(home.textContent).toContain('1 of 24');

    const list = document.createElement('div');
    renderPuzzles(list, profile, handlers(), 's1');
    expect(list.querySelectorAll('[data-puzzle]')).toHaveLength(24);
    const solved = list.querySelector('[data-puzzle="w1"]');
    expect(solved?.classList.contains('solved')).toBe(true);
    expect(solved?.textContent).toContain('✓');
    expect(list.querySelector('[data-puzzle="s1"]')?.textContent).toContain('In progress');
    expect(list.querySelector('#btn-back')?.textContent).toContain('Back');
  });
});
