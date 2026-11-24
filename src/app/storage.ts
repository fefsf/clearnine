/** localStorage write that tells the player when a save fails (at most once a minute). */

type FailHandler = (message: string) => void;

let failHandler: FailHandler | null = null;
/** When the last warning was shown. Repeats are spaced out, not silenced for good. */
let lastWarnedAt = 0;
const WARN_GAP_MS = 60_000;

export function setStorageFailHandler(handler: FailHandler | null): void {
  failHandler = handler;
}

/** Reset the warning timer (tests). */
export function resetStorageFailWarning(): void {
  lastWarnedAt = 0;
}

export function writeLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    const now = Date.now();
    if (lastWarnedAt === 0 || now - lastWarnedAt >= WARN_GAP_MS) {
      lastWarnedAt = now;
      failHandler?.(
        'Storage is full — progress may not save. Free space or clear site data.',
      );
    }
    return false;
  }
}
