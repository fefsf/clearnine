/** Expert Mode: optional hard rules for high-skill players. Off = original ClearNine. */

export const EXPERT_BLURB =
  'Expert Mode is for players who already score high and want more challenge. It unlocks harder puzzles, a Hold slot, rising difficulty, Weekly and Endgame modes, extra records, and score sharing. Turn it off anytime to return to the calm original game.';

export const EXPERT_FEATURE_LINES = [
  'Harder Today’s Puzzle — denser starters and tougher piece deals',
  'Hold slot in Play — park one piece and swap it back later',
  'Rising pressure — larger pieces show up more as your score climbs',
  'Weekly Challenge — one tough seeded board each week',
  'Endgame Sprint — start on a crowded board and fight for space',
  'Extra records — expert bests, best combo, best streak',
  'Beat-your-best target on the scoreboard',
  'Share your score when a run ends',
] as const;

export function weekKey(d = new Date()): string {
  // ISO-ish week: YYYY-Www
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
