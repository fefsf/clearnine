import { writeLocal } from './storage';
import { APP_VERSION } from './version';

const RELEASES_URL = 'https://api.github.com/repos/fefsf/clearnine/releases/latest';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const STORAGE_SKIPPED = 'clearnine-update-skipped';
const STORAGE_SNOOZE = 'clearnine-update-snooze';
/** Written after a successful GitHub check. Automatic checks honor a 24h gap. */
const STORAGE_LAST_CHECK = 'clearnine-update-last-check';
/** Short on purpose: a 24h gap hid brand-new releases from the launch prompt. */
const CHECK_BACKOFF_MS = 60 * 60 * 1000;
/** App version that wrote the last-check stamp; a new install re-checks right away. */
const STORAGE_LAST_CHECK_VERSION = 'clearnine-update-last-check-version';
/** Latest release seen, so a backoff launch can still prompt for a known update. */
const STORAGE_LAST_INFO = 'clearnine-update-last-info';

export type UpdateInfo = {
  version: string;
  tag: string;
  name: string;
  releaseUrl: string;
  apkUrl: string | null;
  notes: string;
};

function normalizeVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part.replace(/\D/g, ''), 10) || 0);
}

/** Returns true if remote is newer than local (e.g. 1.9 > 1.8). */
export function isNewerVersion(remote: string, local: string = APP_VERSION): boolean {
  const a = normalizeVersion(remote);
  const b = normalizeVersion(local);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function getSkippedVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_SKIPPED);
  } catch {
    return null;
  }
}

export function skipVersion(version: string): void {
  writeLocal(STORAGE_SKIPPED, version);
}

/** Don’t auto-prompt this version again until the snooze window ends. */
export function snoozeVersion(version: string): void {
  writeLocal(STORAGE_SNOOZE, JSON.stringify({ version, at: Date.now() }));
}

function lastUpdateCheckAt(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_CHECK);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

/** True when an automatic check should wait. A future/garbage stamp does not block. */
function inUpdateBackoff(now: number = Date.now()): boolean {
  const last = lastUpdateCheckAt();
  if (last == null) return false;
  try {
    const stampedBy = localStorage.getItem(STORAGE_LAST_CHECK_VERSION);
    if (stampedBy && stampedBy !== APP_VERSION) return false;
  } catch {
    /* ignore */
  }
  const elapsed = now - last;
  return elapsed >= 0 && elapsed < CHECK_BACKOFF_MS;
}

function markUpdateChecked(info: UpdateInfo | null, now: number = Date.now()): void {
  writeLocal(STORAGE_LAST_CHECK, String(now));
  writeLocal(STORAGE_LAST_CHECK_VERSION, APP_VERSION);
  writeLocal(STORAGE_LAST_INFO, info ? JSON.stringify(info) : '');
}

function readCachedInfo(): UpdateInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_INFO);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<UpdateInfo>;
    if (typeof data.version !== 'string' || typeof data.tag !== 'string') return null;
    return {
      version: data.version,
      tag: data.tag,
      name: typeof data.name === 'string' ? data.name : data.tag,
      releaseUrl: typeof data.releaseUrl === 'string' ? data.releaseUrl : '',
      apkUrl: typeof data.apkUrl === 'string' ? data.apkUrl : null,
      notes: typeof data.notes === 'string' ? data.notes : '',
    };
  } catch {
    return null;
  }
}

export function isSnoozed(version: string, now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_SNOOZE);
    if (!raw) return false;
    const data = JSON.parse(raw) as { version?: string; at?: number };
    if (data.version !== version || typeof data.at !== 'number') return false;
    return now - data.at < SNOOZE_MS;
  } catch {
    return false;
  }
}

type GhRelease = {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  assets?: { name?: string; browser_download_url?: string }[];
};

export async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  const res = await fetch(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`Update check failed (${res.status})`);
  const data = (await res.json()) as GhRelease;
  const tag = data.tag_name?.trim();
  if (!tag) return null;

  const apk =
    data.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk')) ?? null;

  return {
    version: tag.replace(/^v/i, ''),
    tag,
    name: data.name?.trim() || tag,
    releaseUrl: data.html_url || 'https://github.com/fefsf/clearnine/releases/latest',
    apkUrl: apk?.browser_download_url ?? null,
    notes: (data.body ?? '').trim(),
  };
}

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | { status: 'update'; info: UpdateInfo }
  | { status: 'skipped'; info: UpdateInfo }
  | { status: 'error'; message: string }
  | { status: 'offline' };

export async function checkForUpdate(opts?: {
  force?: boolean;
  respectSkip?: boolean;
  /** Native PackageManager versionName when the APK already updated but JS did not. */
  installedVersion?: string;
}): Promise<UpdateCheckResult> {
  const force = opts?.force ?? false;
  const respectSkip = opts?.respectSkip ?? true;
  const local = opts?.installedVersion?.trim() || APP_VERSION;

  // Settings passes force and must ignore the launch backoff. During backoff we
  // skip the network but still evaluate the release we already know about, so a
  // manual check followed by a relaunch still prompts.
  const backoff = !force && inUpdateBackoff();
  if (backoff && !readCachedInfo()) {
    return { status: 'up-to-date' };
  }

  if (!backoff && !navigator.onLine) {
    return { status: 'offline' };
  }

  try {
    let info: UpdateInfo | null;
    if (backoff) {
      info = readCachedInfo();
    } else {
      info = await fetchLatestRelease();
      markUpdateChecked(info);
    }
    if (!info || !isNewerVersion(info.version, local)) {
      return { status: 'up-to-date' };
    }
    if (respectSkip && getSkippedVersion() === info.version) {
      return { status: 'skipped', info };
    }
    // Settings (force) still shows; launch won't nag the same version after "later".
    if (!force && isSnoozed(info.version)) {
      return { status: 'skipped', info };
    }
    return { status: 'update', info };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reach GitHub';
    return { status: 'error', message };
  }
}
