import { APP_VERSION } from './version';
import { dailyPlayStreak, migrateProfile, type GameMode } from '../game/stats';

/**
 * Local progress backup (no cloud).
 *
 * Included: `clearnine-profile` (scores, stats, settings, tutorial flags,
 * leaderboard name and opt-in) and in-progress saves for classic, daily,
 * weekly, and blitz, including the expert-tagged keys.
 *
 * Excluded: `clearnine-device-id` (so a restore on another phone does not
 * clone leaderboard identity), update check / skip / snooze keys, legacy
 * keys, and `clearnine-pending-finalize`. That pending key is cleared on
 * import so a half-finished run on this phone is not credited on top of
 * the restored profile.
 */
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_PROFILE_KEY = 'clearnine-profile';
export const MAX_BACKUP_CHARS = 2 * 1024 * 1024;

const PENDING_FINALIZE_KEY = 'clearnine-pending-finalize';

const SAVE_SPECS: { key: string; mode: GameMode; expert: boolean }[] = [
  { key: 'clearnine-save-classic', mode: 'classic', expert: false },
  { key: 'clearnine-save-classic-expert', mode: 'classic', expert: true },
  { key: 'clearnine-save-daily', mode: 'daily', expert: false },
  { key: 'clearnine-save-daily-expert', mode: 'daily', expert: true },
  { key: 'clearnine-save-weekly', mode: 'weekly', expert: false },
  { key: 'clearnine-save-weekly-expert', mode: 'weekly', expert: true },
  { key: 'clearnine-save-blitz', mode: 'blitz', expert: false },
  { key: 'clearnine-save-blitz-expert', mode: 'blitz', expert: true },
];

const ALLOWED_KEYS: readonly string[] = [BACKUP_PROFILE_KEY, ...SAVE_SPECS.map((spec) => spec.key)];
const ALLOWED = new Set<string>(ALLOWED_KEYS);

const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type BackupStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type BackupFile = {
  app: 'ClearNine';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: Record<string, string | object>;
};

export type BackupSummary = {
  bestClassic: number;
  bestClassicExpert: number;
  bestBlitz: number;
  gamesPlayed: number;
  dailyStreak: number;
};

export type BackupParseResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string };

export type BackupApplyResult =
  | { ok: true; summary: BackupSummary }
  | { ok: false; error: string };

type JsonObject = Record<string, unknown>;

type PieceJson = {
  id: string;
  cells: { r: number; c: number }[];
  weight: number;
};

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function stamp(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return new Date().toISOString();
  return now.toISOString();
}

function readStoredObject(storage: BackupStorage, key: string): JsonObject | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readObject(value: unknown): JsonObject | null {
  let current = value;
  if (typeof current === 'string') {
    if (current.length === 0 || current.length > MAX_BACKUP_CHARS) return null;
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return null;
    }
  }
  return isPlainObject(current) ? current : null;
}

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    return null;
  }
  return Math.floor(value);
}

function readBoard(value: unknown): number[][] | null {
  if (!Array.isArray(value) || value.length !== 9) return null;
  const board: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 9) return null;
    const next: number[] = [];
    for (const cell of row) {
      if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 8) return null;
      next.push(cell);
    }
    board.push(next);
  }
  return board;
}

function readPiece(value: unknown): PieceJson | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 40) return null;
  if (/[\u0000-\u001F]/.test(value.id)) return null;
  if (!Array.isArray(value.cells) || value.cells.length < 1 || value.cells.length > 16) return null;
  const cells: { r: number; c: number }[] = [];
  for (const cell of value.cells) {
    if (!isPlainObject(cell)) return null;
    if (typeof cell.r !== 'number' || typeof cell.c !== 'number') return null;
    if (!Number.isInteger(cell.r) || !Number.isInteger(cell.c)) return null;
    if (cell.r < 0 || cell.r > 8 || cell.c < 0 || cell.c > 8) return null;
    cells.push({ r: cell.r, c: cell.c });
  }
  let weight = 1;
  if (value.weight !== undefined) {
    if (typeof value.weight !== 'number' || !Number.isFinite(value.weight) || value.weight <= 0) {
      return null;
    }
    if (value.weight > 1000) return null;
    weight = value.weight;
  }
  return { id: value.id, cells, weight };
}

function readTray(value: unknown): (PieceJson | null)[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const tray: (PieceJson | null)[] = [];
  for (const slot of value) {
    if (slot == null) {
      tray.push(null);
      continue;
    }
    const piece = readPiece(slot);
    if (!piece) return null;
    tray.push(piece);
  }
  return tray;
}

function readRng(value: unknown): { seed: number; counter: number } | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.seed !== 'number' || !Number.isSafeInteger(value.seed)) return null;
  if (typeof value.counter !== 'number' || !Number.isSafeInteger(value.counter)) return null;
  if (value.counter < 0 || value.counter > 1_000_000_000) return null;
  return { seed: value.seed >>> 0, counter: value.counter };
}

/** Keep a save the game can load. Undo frames are dropped; the app does not store them. */
function sanitizeSave(spec: { mode: GameMode; expert: boolean }, value: JsonObject): object | null {
  if (value.mode !== spec.mode) return null;
  const expert = value.expert === undefined ? false : value.expert;
  if (typeof expert !== 'boolean' || expert !== spec.expert) return null;
  const board = readBoard(value.board);
  const tray = readTray(value.tray);
  const rng = readRng(value.rng);
  const score = whole(value.score);
  const streak = whole(value.streak);
  const clears = value.clearsThisGame === undefined ? 0 : whole(value.clearsThisGame);
  const undos = value.undosLeft === undefined ? 0 : whole(value.undosLeft);
  const gameOver = value.gameOver === undefined ? false : value.gameOver;
  if (!board || !tray || !rng || score == null || streak == null || clears == null || undos == null) {
    return null;
  }
  if (typeof gameOver !== 'boolean' || undos > 30) return null;
  let hold: PieceJson | null = null;
  if (value.hold != null) {
    const piece = readPiece(value.hold);
    if (!piece) return null;
    hold = piece;
  }
  const save: JsonObject = {
    mode: spec.mode,
    board,
    tray,
    hold,
    score,
    streak,
    gameOver,
    undosLeft: undos,
    undoStack: [],
    rng,
    clearsThisGame: clears,
    expert: spec.expert,
  };
  if (spec.mode === 'daily') {
    if (typeof value.dailyDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dailyDate)) return null;
    save.dailyDate = value.dailyDate;
  }
  if (spec.mode === 'weekly') {
    if (typeof value.weekKey !== 'string' || !/^\d{4}-W\d{2}$/.test(value.weekKey)) return null;
    save.weekKey = value.weekKey;
  }
  return save;
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 32 && !/[\u0000-\u001F]/.test(value);
}

function inspect(parsed: unknown): BackupParseResult {
  if (!isPlainObject(parsed)) return fail('That backup could not be read.');
  if (parsed.app !== 'ClearNine') {
    return parsed.app === undefined
      ? fail('That backup could not be read.')
      : fail('That file is not a ClearNine backup.');
  }
  if (typeof parsed.schemaVersion !== 'number' || !Number.isInteger(parsed.schemaVersion)) {
    return fail('That backup could not be read.');
  }
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return fail('That backup is from a newer ClearNine.');
  }
  if (parsed.schemaVersion < 1) return fail('That backup could not be read.');
  if (!isVersion(parsed.appVersion)) return fail('That backup could not be read.');
  if (typeof parsed.exportedAt !== 'string' || !ISO_STAMP.test(parsed.exportedAt)) {
    return fail('That backup could not be read.');
  }
  const data = readObject(parsed.data);
  if (!data) return fail('That backup could not be read.');
  for (const key of Object.keys(data)) {
    if (!ALLOWED.has(key)) return fail('That backup has unexpected data.');
  }
  if (!Object.hasOwn(data, BACKUP_PROFILE_KEY)) return fail('That backup is missing your progress.');

  const profileRaw = readObject(data[BACKUP_PROFILE_KEY]);
  if (!profileRaw) return fail('That backup could not be read.');
  const clean: Record<string, string | object> = {
    [BACKUP_PROFILE_KEY]: migrateProfile(profileRaw),
  };
  for (const spec of SAVE_SPECS) {
    if (!Object.hasOwn(data, spec.key)) continue;
    const saveRaw = readObject(data[spec.key]);
    const save = saveRaw ? sanitizeSave(spec, saveRaw) : null;
    if (!save) return fail('A saved game in that backup could not be read.');
    clean[spec.key] = save;
  }
  return {
    ok: true,
    backup: {
      app: 'ClearNine',
      schemaVersion: parsed.schemaVersion,
      appVersion: parsed.appVersion,
      exportedAt: parsed.exportedAt,
      data: clean,
    },
  };
}

export function buildBackup(storage: BackupStorage = localStorage, now = new Date()): BackupFile {
  const data: Record<string, string | object> = {};
  const profileRaw = readStoredObject(storage, BACKUP_PROFILE_KEY);
  if (profileRaw) data[BACKUP_PROFILE_KEY] = migrateProfile(profileRaw);
  for (const spec of SAVE_SPECS) {
    const raw = readStoredObject(storage, spec.key);
    if (!raw) continue;
    const save = sanitizeSave(spec, raw);
    if (save) data[spec.key] = save;
  }
  return {
    app: 'ClearNine',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: stamp(now),
    data,
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(text: string): BackupParseResult {
  if (typeof text !== 'string') return fail('That backup could not be read.');
  if (text.length > MAX_BACKUP_CHARS) return fail('That backup is too large.');
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return inspect(JSON.parse(source) as unknown);
  } catch {
    return fail('That backup could not be read.');
  }
}

export function backupSummary(backup: BackupFile): BackupSummary {
  const profile = migrateProfile(backup.data[BACKUP_PROFILE_KEY]);
  return {
    bestClassic: profile.bestClassic,
    bestClassicExpert: profile.bestClassicExpert,
    bestBlitz: profile.bestBlitz,
    gamesPlayed: profile.stats.gamesPlayed,
    dailyStreak: dailyPlayStreak(profile),
  };
}

export function formatBackupSummary(summary: BackupSummary): string {
  const games = summary.gamesPlayed === 1 ? '1 game' : `${summary.gamesPlayed} games`;
  return `Best Play ${summary.bestClassic}. ${games}. Daily streak ${summary.dailyStreak}.`;
}

function encodeValue(value: string | object): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function commitBackup(backup: BackupFile, storage: BackupStorage): BackupApplyResult {
  const previous = new Map<string, string | null>();
  const planned: { key: string; value: string | null }[] = [];
  try {
    for (const key of ALLOWED_KEYS) {
      const raw = backup.data[key];
      planned.push({ key, value: raw == null ? null : encodeValue(raw) });
      previous.set(key, storage.getItem(key));
    }
    previous.set(PENDING_FINALIZE_KEY, storage.getItem(PENDING_FINALIZE_KEY));
    planned.push({ key: PENDING_FINALIZE_KEY, value: null });
  } catch {
    return fail('Could not read current progress.');
  }

  const changed: string[] = [];
  try {
    for (const step of planned) {
      const old = previous.get(step.key) ?? null;
      if (step.value == null) {
        if (old == null) continue;
        storage.removeItem(step.key);
      } else {
        storage.setItem(step.key, step.value);
      }
      changed.push(step.key);
    }
  } catch {
    for (let i = changed.length - 1; i >= 0; i -= 1) {
      const key = changed[i]!;
      const old = previous.get(key) ?? null;
      try {
        if (old == null) storage.removeItem(key);
        else storage.setItem(key, old);
      } catch {
        /* keep restoring the rest */
      }
    }
    return fail('Could not save the backup. Your current progress was kept.');
  }
  return { ok: true, summary: backupSummary(backup) };
}

export function applyBackup(backup: BackupFile, storage: BackupStorage = localStorage): BackupApplyResult {
  let text: string;
  try {
    text = serializeBackup(backup);
  } catch {
    return fail('That backup could not be read.');
  }
  const checked = parseBackup(text);
  if (!checked.ok) return checked;
  return commitBackup(checked.backup, storage);
}
