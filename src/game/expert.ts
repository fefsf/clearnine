/** Expert Mode: optional hard rules for high-skill players. Off = original ClearNine. */

export const EXPERT_BLURB =
  'Expert Mode is for players who already score high and want more challenge. It unlocks harder puzzles, a Hold slot, rising difficulty, Weekly and Endgame modes, extra records, and score sharing. Turn it off anytime to return to the calm original game.';

export const EXPERT_FEATURE_LINES = [
  'Harder Today’s Puzzle — denser starters and tougher piece deals',
  'Hold slot in Play — park one piece, then drag it onto the board',
  'Rising pressure — larger pieces show up more as your score climbs',
  'Weekly Mandate — a new named challenge each week (rules rotate)',
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

export type WeeklyDealBias = 'hard' | 'giants' | 'small' | 'rising';

export type WeeklyMandate = {
  id: string;
  name: string;
  /** Short menu line (without Best). */
  blurb: string;
  howto: string;
  dense: boolean;
  hold: boolean;
  undos: number;
  dealBias: WeeklyDealBias;
};

export const WEEKLY_MANDATES: readonly WeeklyMandate[] = [
  {
    id: 'gridlock',
    name: 'Gridlock',
    blurb: 'Crowded start',
    howto: 'Starts with a densely packed board. Use Hold and careful clears to carve space.',
    dense: true,
    hold: true,
    undos: 1,
    dealBias: 'hard',
  },
  {
    id: 'titans',
    name: 'Titans',
    blurb: 'Huge pieces',
    howto: 'Deals favor large awkward shapes. Plan ahead — big pieces need open lanes.',
    dense: false,
    hold: true,
    undos: 1,
    dealBias: 'giants',
  },
  {
    id: 'precision',
    name: 'Precision',
    blurb: 'Small pieces',
    howto: 'Crowded start plus mostly small pieces. Fill gaps cleanly and chain clears.',
    dense: true,
    hold: true,
    undos: 1,
    dealBias: 'small',
  },
  {
    id: 'lone_wolf',
    name: 'Lone Wolf',
    blurb: 'No Hold',
    howto: 'Hold is disabled this week. Every piece must be placed from the tray as dealt.',
    dense: true,
    hold: false,
    undos: 1,
    dealBias: 'hard',
  },
  {
    id: 'rising_tide',
    name: 'Rising Tide',
    blurb: 'Score pressure',
    howto: 'Crowded start, and piece size ramps up as your score climbs — like Expert Play.',
    dense: true,
    hold: true,
    undos: 1,
    dealBias: 'rising',
  },
  {
    id: 'thrifty',
    name: 'Thrifty',
    blurb: 'No undos',
    howto: 'No undos this week. Every placement is final — think before you drop.',
    dense: true,
    hold: true,
    undos: 0,
    dealBias: 'hard',
  },
] as const;

function hashWeek(week: string): number {
  let h = 2166136261;
  for (let i = 0; i < week.length; i++) {
    h ^= week.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable mandate for the given ISO week — same for every player. */
export function getWeeklyMandate(week = weekKey()): WeeklyMandate {
  const idx = hashWeek(week) % WEEKLY_MANDATES.length;
  return WEEKLY_MANDATES[idx]!;
}
