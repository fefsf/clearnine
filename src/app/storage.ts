/** localStorage write with one-shot failure notification. */

type FailHandler = (message: string) => void;

let failHandler: FailHandler | null = null;
let warnedThisSession = false;

export function setStorageFailHandler(handler: FailHandler | null): void {
  failHandler = handler;
}

/** Reset the once-per-session toast latch (tests). */
export function resetStorageFailWarning(): void {
  warnedThisSession = false;
}

export function writeLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    if (!warnedThisSession) {
      warnedThisSession = true;
      failHandler?.(
        'Storage is full — progress may not save. Free space or clear site data.',
      );
    }
    return false;
  }
}
