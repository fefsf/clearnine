import { APP_VERSION } from './version';

const RELEASES_URL = 'https://api.github.com/repos/fefsf/clearnine/releases/latest';
const CHECK_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STORAGE_LAST_CHECK = 'clearnine-update-last-check';
const STORAGE_SKIPPED = 'clearnine-update-skipped';

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
  try {
    localStorage.setItem(STORAGE_SKIPPED, version);
  } catch {
    /* ignore */
  }
}

function shouldAutoCheck(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_CHECK);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last >= CHECK_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markChecked(): void {
  try {
    localStorage.setItem(STORAGE_LAST_CHECK, String(Date.now()));
  } catch {
    /* ignore */
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
}): Promise<UpdateCheckResult> {
  const force = opts?.force ?? false;
  const respectSkip = opts?.respectSkip ?? true;

  if (!force && !shouldAutoCheck()) {
    return { status: 'up-to-date' };
  }

  if (!navigator.onLine) {
    return { status: 'offline' };
  }

  try {
    const info = await fetchLatestRelease();
    markChecked();
    if (!info || !isNewerVersion(info.version)) {
      return { status: 'up-to-date' };
    }
    if (respectSkip && getSkippedVersion() === info.version) {
      return { status: 'skipped', info };
    }
    return { status: 'update', info };
  } catch (err) {
    // Do not stamp cooldown on failure — auto-check should retry next launch.
    const message = err instanceof Error ? err.message : 'Could not reach GitHub';
    return { status: 'error', message };
  }
}
