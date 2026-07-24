import {
  dailyPlayStreak,
  type Profile,
} from './stats';

export type GoalDef = {
  id: string;
  title: string;
  description: string;
  /** Theme unlocked when this goal is earned (if any). */
  unlocksTheme?: string;
  check: (p: Profile) => boolean;
};

export const GOALS: GoalDef[] = [
  {
    id: 'score_500',
    title: 'Getting started',
    description: 'Score 500 in Classic',
    unlocksTheme: 'sunset',
    check: (p) => p.bestClassic >= 500,
  },
  {
    id: 'score_2000',
    title: 'Sharp eye',
    description: 'Score 2,000 in Classic',
    check: (p) => p.bestClassic >= 2000,
  },
  {
    id: 'score_5000',
    title: 'Block master',
    description: 'Score 5,000 in Classic',
    unlocksTheme: 'midnight',
    check: (p) => p.bestClassic >= 5000,
  },
  {
    id: 'combo_3',
    title: 'Triple clear',
    description: 'Clear a Combo ×3 in one move',
    unlocksTheme: 'forest',
    check: (p) => p.stats.maxCombo >= 3,
  },
  {
    id: 'combo_4',
    title: 'Quad blast',
    description: 'Clear a Combo ×4 in one move',
    check: (p) => p.stats.maxCombo >= 4,
  },
  {
    id: 'streak_5',
    title: 'On a roll',
    description: 'Reach a clear streak of 5',
    check: (p) => p.stats.maxStreak >= 5,
  },
  {
    id: 'pieces_100',
    title: 'Century',
    description: 'Place 100 pieces',
    check: (p) => p.stats.piecesPlaced >= 100,
  },
  {
    id: 'pieces_500',
    title: 'Dedicated',
    description: 'Place 500 pieces',
    check: (p) => p.stats.piecesPlaced >= 500,
  },
  {
    id: 'clears_50',
    title: 'Clean sweep',
    description: 'Clear 50 lines or regions total',
    check: (p) => p.stats.linesCleared >= 50,
  },
  {
    id: 'games_10',
    title: 'Regular',
    description: 'Finish 10 games',
    check: (p) => p.stats.gamesPlayed >= 10,
  },
  {
    id: 'daily_first',
    title: 'Day one',
    description: 'Finish a Daily Challenge',
    check: (p) => p.stats.dailyDates.length >= 1,
  },
  {
    id: 'daily_streak_3',
    title: 'Three-day rhythm',
    description: 'Play Daily 3 days in a row',
    check: (p) => dailyPlayStreak(p) >= 3,
  },
  {
    id: 'daily_streak_7',
    title: 'Week warrior',
    description: 'Play Daily 7 days in a row',
    check: (p) => dailyPlayStreak(p) >= 7,
  },
  {
    id: 'score_8000',
    title: 'Untouchable',
    description: 'Score 8,000 in Classic (or Expert Play)',
    check: (p) => p.bestClassic >= 8000 || p.bestClassicExpert >= 8000,
  },
  {
    id: 'combo_5',
    title: 'Cascade king',
    description: 'Clear a Combo ×5 in one move',
    check: (p) => p.stats.maxCombo >= 5,
  },
  {
    id: 'streak_10',
    title: 'Unstoppable',
    description: 'Reach a clear streak of 10',
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
    check: (p) => p.stats.weeklyKeys.length >= 1,
  },
  {
    id: 'blitz_800',
    title: 'Crowded genius',
    description: 'Score 800 in Endgame Sprint',
    check: (p) => p.bestBlitz >= 800,
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
