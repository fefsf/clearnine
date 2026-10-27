import {
  dailyPlayStreak,
  type Profile,
} from './stats';

export type GoalProgress = {
  value: number;
  target: number;
};

export type GoalDef = {
  id: string;
  title: string;
  description: string;
  /** Theme unlocked when this goal is earned (if any). */
  unlocksTheme?: string;
  /** Count toward a locked trophy. Best-score awards omit this. */
  progress?: (p: Profile) => GoalProgress;
  check: (p: Profile) => boolean;
};

function countProgress(value: number, target: number): GoalProgress {
  const safe = Number.isFinite(value) ? Math.floor(value) : 0;
  return { value: Math.max(0, safe), target };
}

function dailyGoalsMetCount(profile: Profile): number {
  const days = profile.stats.dailyGoalsMet;
  if (!Array.isArray(days)) return 0;
  return new Set(days).size;
}

/** Label for a locked count trophy, capped at the target. */
export function formatGoalProgress(progress: GoalProgress): string {
  const target = Math.max(0, Math.floor(Number.isFinite(progress.target) ? progress.target : 0));
  const raw = Number.isFinite(progress.value) ? Math.floor(progress.value) : 0;
  const value = Math.min(Math.max(0, raw), target);
  return `${value.toLocaleString('en-US')} / ${target.toLocaleString('en-US')}`;
}

/** Highest finished score in classic, daily, weekly, or blitz (calm or Expert). */
function bestPlayScore(profile: Profile): number {
  const scores = [
    profile.bestClassic,
    profile.bestClassicExpert,
    profile.bestBlitz,
    ...Object.values(profile.bestDaily ?? {}),
    ...Object.values(profile.bestDailyExpert ?? {}),
    ...Object.values(profile.bestWeekly ?? {}),
  ];
  let best = 0;
  for (const score of scores) {
    if (typeof score === 'number' && score > best) best = score;
  }
  return best;
}

export const GOALS: GoalDef[] = [
  {
    id: 'score_500',
    title: 'Getting started',
    description: 'Score 500 in Play (any mode)',
    unlocksTheme: 'sunset',
    check: (p) => bestPlayScore(p) >= 500,
  },
  {
    id: 'score_2000',
    title: 'Sharp eye',
    description: 'Score 2,000 in Play (any mode)',
    check: (p) => bestPlayScore(p) >= 2000,
  },
  {
    id: 'score_5000',
    title: 'Block master',
    description: 'Score 5,000 in Play (any mode)',
    unlocksTheme: 'midnight',
    check: (p) => bestPlayScore(p) >= 5000,
  },
  {
    id: 'combo_3',
    title: 'Triple clear',
    description: 'Clear a Combo ×3 in one move',
    unlocksTheme: 'forest',
    progress: (p) => countProgress(p.stats.maxCombo, 3),
    check: (p) => p.stats.maxCombo >= 3,
  },
  {
    id: 'combo_4',
    title: 'Quad blast',
    description: 'Clear a Combo ×4 in one move',
    progress: (p) => countProgress(p.stats.maxCombo, 4),
    check: (p) => p.stats.maxCombo >= 4,
  },
  {
    id: 'streak_5',
    title: 'On a roll',
    description: 'Reach a clear streak of 5',
    progress: (p) => countProgress(p.stats.maxStreak, 5),
    check: (p) => p.stats.maxStreak >= 5,
  },
  {
    id: 'pieces_100',
    title: 'Century',
    description: 'Place 100 pieces',
    progress: (p) => countProgress(p.stats.piecesPlaced, 100),
    check: (p) => p.stats.piecesPlaced >= 100,
  },
  {
    id: 'pieces_500',
    title: 'Dedicated',
    description: 'Place 500 pieces',
    progress: (p) => countProgress(p.stats.piecesPlaced, 500),
    check: (p) => p.stats.piecesPlaced >= 500,
  },
  {
    id: 'pieces_1000',
    title: 'Ember',
    description: 'Place 1,000 pieces',
    unlocksTheme: 'ember',
    progress: (p) => countProgress(p.stats.piecesPlaced, 1000),
    check: (p) => p.stats.piecesPlaced >= 1000,
  },
  {
    id: 'clears_50',
    title: 'Clean sweep',
    description: 'Clear 50 lines or regions total',
    progress: (p) => countProgress(p.stats.linesCleared, 50),
    check: (p) => p.stats.linesCleared >= 50,
  },
  {
    id: 'cells_25000',
    title: 'Mono Ink',
    description: 'Clear 25,000 cells',
    unlocksTheme: 'mono',
    progress: (p) => countProgress(p.stats.cellsCleared, 25000),
    check: (p) => p.stats.cellsCleared >= 25000,
  },
  {
    id: 'games_10',
    title: 'Regular',
    description: 'Finish 10 games',
    progress: (p) => countProgress(p.stats.gamesPlayed, 10),
    check: (p) => p.stats.gamesPlayed >= 10,
  },
  {
    id: 'daily_first',
    title: 'Day one',
    description: 'Finish a Daily Challenge',
    progress: (p) => countProgress(p.stats.dailyDates.length, 1),
    check: (p) => p.stats.dailyDates.length >= 1,
  },
  {
    id: 'daily_streak_3',
    title: 'Three-day rhythm',
    description: 'Play Daily 3 days in a row',
    progress: (p) => countProgress(dailyPlayStreak(p), 3),
    check: (p) => dailyPlayStreak(p) >= 3,
  },
  {
    id: 'daily_streak_7',
    title: 'Week warrior',
    description: 'Play Daily 7 days in a row',
    progress: (p) => countProgress(dailyPlayStreak(p), 7),
    check: (p) => dailyPlayStreak(p) >= 7,
  },
  {
    id: 'daily_30',
    title: 'Aurora',
    description: 'Finish Daily on 30 different days',
    unlocksTheme: 'aurora',
    progress: (p) => countProgress(p.stats.dailyDates.length, 30),
    check: (p) => p.stats.dailyDates.length >= 30,
  },
  {
    id: 'rule_breaker',
    title: 'Rule Breaker',
    description: 'Meet a Today’s Puzzle goal',
    progress: (p) => countProgress(dailyGoalsMetCount(p), 1),
    check: (p) => dailyGoalsMetCount(p) >= 1,
  },
  {
    id: 'rule_master',
    title: 'Rule Master',
    description: 'Meet the Today’s Puzzle goal on 7 different days',
    progress: (p) => countProgress(dailyGoalsMetCount(p), 7),
    check: (p) => dailyGoalsMetCount(p) >= 7,
  },
  {
    id: 'score_8000',
    title: 'Untouchable',
    description: 'Score 8,000 in Play (any mode)',
    check: (p) => bestPlayScore(p) >= 8000,
  },
  {
    id: 'combo_5',
    title: 'Cascade king',
    description: 'Clear a Combo ×5 in one move',
    progress: (p) => countProgress(p.stats.maxCombo, 5),
    check: (p) => p.stats.maxCombo >= 5,
  },
  {
    id: 'streak_10',
    title: 'Unstoppable',
    description: 'Reach a clear streak of 10',
    progress: (p) => countProgress(p.stats.maxStreak, 10),
    check: (p) => p.stats.maxStreak >= 10,
  },
  {
    id: 'expert_daily',
    title: 'Expert day',
    description: 'Score 1,500 on an Expert Daily',
    check: (p) => Object.values(p.bestDailyExpert).some((s) => s >= 1500),
  },
  {
    id: 'weekly_first',
    title: 'Week challenger',
    description: 'Finish a Weekly Challenge',
    progress: (p) => countProgress(p.stats.weeklyKeys.length, 1),
    check: (p) => p.stats.weeklyKeys.length >= 1,
  },
  {
    id: 'blitz_800',
    title: 'Crowded genius',
    description: 'Score 800 in Endgame Sprint',
    check: (p) => p.bestBlitz >= 800,
  },
  {
    id: 'puzzler',
    title: 'Puzzler',
    description: 'Solve 8 puzzles',
    progress: (p) => countProgress(Object.keys(p.puzzlesSolved ?? {}).length, 8),
    check: (p) => Object.keys(p.puzzlesSolved ?? {}).length >= 8,
  },
];

/** Returns newly unlocked goal ids (also mutates profile.unlockedGoals). */
export function evaluateGoals(profile: Profile): GoalDef[] {
  const newly: GoalDef[] = [];
  for (const goal of GOALS) {
    if (profile.unlockedGoals.includes(goal.id)) continue;
    if (goal.check(profile)) {
      profile.unlockedGoals.push(goal.id);
      newly.push(goal);
    }
  }
  return newly;
}

export function isGoalUnlocked(profile: Profile, goalId: string): boolean {
  return profile.unlockedGoals.includes(goalId);
}
