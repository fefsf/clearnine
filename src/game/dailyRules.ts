import { addDays, hashString } from './rng';

/**
 * Today’s Puzzle rule. The goal is a bonus: meeting it never ends the run.
 * `modifier` changes calm Daily only. Expert Daily keeps its own starters
 * and hard deals, and uses the goal by itself.
 */
export type DailyGoal =
  | { type: 'score'; target: number }
  | { type: 'lines'; target: number }
  | { type: 'regions'; target: number }
  | { type: 'combos'; target: number };

export type DailyRuleModifier = {
  /** Skip starter blocks so the board begins empty. */
  emptyBoard?: boolean;
  /** Piece-deal bias the calm engine already supports. */
  deal?: 'small' | 'giants' | 'hard';
};

export type DailyRule = {
  id: string;
  name: string;
  blurb: string;
  goal: DailyGoal;
  modifier?: DailyRuleModifier;
};

export type DailyGoalCounters = {
  lines: number;
  regions: number;
  combos: number;
  score: number;
  met: boolean;
};

export const DAILY_RULES: readonly DailyRule[] = [
  {
    id: 'line_up',
    name: 'Line Up',
    blurb: 'Clear 12 lines',
    goal: { type: 'lines', target: 12 },
  },
  {
    id: 'square_dance',
    name: 'Square Dance',
    blurb: 'Seal 6 regions',
    goal: { type: 'regions', target: 6 },
  },
  {
    id: 'combo_day',
    name: 'Combo Day',
    blurb: 'Make 3 combos of ×2+',
    goal: { type: 'combos', target: 3 },
  },
  {
    id: 'steady_hands',
    name: 'Steady Hands',
    blurb: 'Reach 600 points',
    goal: { type: 'score', target: 600 },
  },
  {
    id: 'tiny_tuesday',
    name: 'Tiny Tuesday',
    blurb: 'Small pieces · clear 8 lines',
    goal: { type: 'lines', target: 8 },
    modifier: { deal: 'small' },
  },
  {
    id: 'big_day',
    name: 'Big Day',
    blurb: 'Big pieces · score 500',
    goal: { type: 'score', target: 500 },
    modifier: { deal: 'giants' },
  },
  {
    id: 'clean_slate',
    name: 'Clean Slate',
    blurb: 'Empty board · clear 8 lines',
    goal: { type: 'lines', target: 8 },
    modifier: { emptyBoard: true },
  },
  {
    id: 'ten_deep',
    name: 'Ten Pieces Deep',
    blurb: 'Tougher pieces · clear 10 lines',
    goal: { type: 'lines', target: 10 },
    modifier: { deal: 'hard' },
  },
];

const RULE_EPOCH = '2020-01-01';
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const indexByDate = new Map<string, number>();
let filledThrough = '';

function isDateKey(key: string): boolean {
  if (!DATE_KEY.test(key)) return false;
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function hashPick(dateKey: string, avoid: number): number {
  const count = DAILY_RULES.length;
  let index = hashString(`clearnine-daily-rule-${dateKey}`) % count;
  if (index === avoid) index = (index + 1) % count;
  return index;
}

/** Fill the forward chain so each day avoids the previous day's rule. */
function fillForward(until: string): void {
  if (indexByDate.has(until) && filledThrough >= until) return;
  const resume = filledThrough !== '' && filledThrough < until && indexByDate.has(filledThrough);
  let cursor = resume ? addDays(filledThrough, 1) : RULE_EPOCH;
  let prev = resume ? (indexByDate.get(filledThrough) ?? -1) : -1;
  let guard = 0;
  while (cursor <= until && guard < 20000) {
    const index = hashPick(cursor, prev);
    indexByDate.set(cursor, index);
    prev = index;
    filledThrough = cursor;
    const next = addDays(cursor, 1);
    if (next <= cursor) break;
    cursor = next;
    guard += 1;
  }
}

/** Days before the epoch walk backward, each one avoiding the next day. */
function fillBackward(until: string): void {
  if (indexByDate.has(until)) return;
  fillForward(RULE_EPOCH);
  let nextIndex = indexByDate.get(RULE_EPOCH) ?? hashPick(RULE_EPOCH, -1);
  let cursor = addDays(RULE_EPOCH, -1);
  let guard = 0;
  while (cursor >= until && guard < 20000) {
    if (!indexByDate.has(cursor)) indexByDate.set(cursor, hashPick(cursor, nextIndex));
    nextIndex = indexByDate.get(cursor) ?? nextIndex;
    const earlier = addDays(cursor, -1);
    if (earlier >= cursor) break;
    cursor = earlier;
    guard += 1;
  }
}

/** Stable rule for a calendar day — the same for every player. */
export function getDailyRule(dateKey: string): DailyRule {
  const count = DAILY_RULES.length;
  if (!isDateKey(dateKey)) {
    return DAILY_RULES[hashString(`clearnine-daily-rule-${dateKey}`) % count]!;
  }
  if (dateKey >= RULE_EPOCH) fillForward(dateKey);
  else fillBackward(dateKey);
  const index = indexByDate.get(dateKey);
  if (index === undefined) {
    return DAILY_RULES[hashString(`clearnine-daily-rule-${dateKey}`) % count]!;
  }
  return DAILY_RULES[index]!;
}

export function dailyGoalValue(
  rule: DailyRule,
  progress: Pick<DailyGoalCounters, 'lines' | 'regions' | 'combos' | 'score'>,
): number {
  const raw =
    rule.goal.type === 'lines'
      ? progress.lines
      : rule.goal.type === 'regions'
        ? progress.regions
        : rule.goal.type === 'combos'
          ? progress.combos
          : progress.score;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

export function dailyGoalIsMet(
  rule: DailyRule,
  progress: Pick<DailyGoalCounters, 'lines' | 'regions' | 'combos' | 'score'>,
): boolean {
  return dailyGoalValue(rule, progress) >= rule.goal.target;
}

const GOAL_LABEL = {
  lines: 'Lines',
  regions: 'Regions',
  combos: 'Combos',
  score: 'Score',
} as const;

/** `Lines 7 / 12` */
export function formatDailyGoalProgress(
  rule: DailyRule,
  progress: Pick<DailyGoalCounters, 'lines' | 'regions' | 'combos' | 'score'>,
): string {
  return `${GOAL_LABEL[rule.goal.type]} ${dailyGoalValue(rule, progress)} / ${rule.goal.target}`;
}

function goalPhrase(rule: DailyRule): string {
  const target = rule.goal.target;
  switch (rule.goal.type) {
    case 'lines':
      return `Clear ${target} lines`;
    case 'regions':
      return `Seal ${target} regions`;
    case 'combos':
      return `Make ${target} combos`;
    case 'score':
      return `Reach ${target} points`;
  }
}

/** Player-facing blurb. Expert Daily drops piece and board modifiers. */
export function dailyRuleBlurb(rule: DailyRule, expert = false): string {
  if (expert && rule.modifier) return goalPhrase(rule);
  return rule.blurb;
}

export function formatDailyHud(
  rule: DailyRule,
  progress: DailyGoalCounters,
  expert = false,
): string {
  const pace = formatDailyGoalProgress(rule, progress);
  const live = progress.met ? `${pace} ✓` : pace;
  return `${rule.name} · ${dailyRuleBlurb(rule, expert)} · ${live}`;
}

export function formatDailyOver(rule: DailyRule, progress: DailyGoalCounters): string {
  const pace = formatDailyGoalProgress(rule, progress);
  return progress.met
    ? `Goal complete — ${rule.name} · ${pace}`
    : `Goal not met — ${rule.name} · ${pace}`;
}
