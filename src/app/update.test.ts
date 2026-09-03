import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, isNewerVersion, isSnoozed, skipVersion, snoozeVersion } from './update';

describe('isNewerVersion', () => {
  it('treats a higher patch as newer', () => {
    expect(isNewerVersion('1.12.15', '1.12.14')).toBe(true);
    expect(isNewerVersion('1.12.14', '1.12.15')).toBe(false);
    expect(isNewerVersion('1.12.14', '1.12.14')).toBe(false);
  });
});

describe('checkForUpdate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function stubRelease(version: string): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          tag_name: `v${version}`,
          name: `ClearNine v${version}`,
          html_url: `https://github.com/fefsf/clearnine/releases/tag/v${version}`,
          body: 'notes',
          assets: [
            {
              name: `ClearNine-v${version}.apk`,
              browser_download_url: `https://github.com/fefsf/clearnine/releases/download/v${version}/ClearNine-v${version}.apk`,
            },
          ],
        }),
      })),
    );
  }

  it('always fetches on launch even if a previous check was recent', async () => {
    localStorage.setItem('clearnine-update-last-check', String(Date.now()));
    stubRelease('99.0.0');
    const result = await checkForUpdate({ force: false });
    expect(result.status).toBe('update');
    expect(fetch).toHaveBeenCalled();
  });

  it('does not auto-prompt a snoozed version, but Settings force still does', async () => {
    stubRelease('99.0.0');
    snoozeVersion('99.0.0');
    expect(isSnoozed('99.0.0')).toBe(true);
    const auto = await checkForUpdate({ force: false });
    expect(auto.status).toBe('skipped');
    const forced = await checkForUpdate({ force: true, respectSkip: false });
    expect(forced.status).toBe('update');
  });

  it('treats GitHub as current when the installed APK already matches', async () => {
    stubRelease('1.12.19');
    const result = await checkForUpdate({
      force: false,
      installedVersion: '1.12.19',
    });
    expect(result.status).toBe('up-to-date');
  });

  it('does not auto-prompt a skipped version', async () => {
    stubRelease('99.0.0');
    skipVersion('99.0.0');
    const auto = await checkForUpdate({ force: false, respectSkip: true });
    expect(auto.status).toBe('skipped');
  });
});
