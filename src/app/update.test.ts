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

  it('does not hit GitHub when the last automatic check was recent', async () => {
    localStorage.setItem('clearnine-update-last-check', String(Date.now()));
    stubRelease('99.0.0');
    const result = await checkForUpdate({ force: false });
    expect(result.status).toBe('up-to-date');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records a successful check and skips the network for 24 hours', async () => {
    stubRelease('99.0.0');
    const first = await checkForUpdate({ force: false });
    expect(first.status).toBe('update');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Number(localStorage.getItem('clearnine-update-last-check'))).toBeGreaterThan(0);

    vi.mocked(fetch).mockClear();
    const second = await checkForUpdate({ force: false });
    expect(second.status).toBe('up-to-date');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets Settings force a check during the backoff window', async () => {
    localStorage.setItem('clearnine-update-last-check', String(Date.now()));
    stubRelease('99.0.0');
    const result = await checkForUpdate({ force: true, respectSkip: false });
    expect(result.status).toBe('update');
    expect(fetch).toHaveBeenCalled();
  });

  it('checks again once the backoff has elapsed', async () => {
    localStorage.setItem('clearnine-update-last-check', String(Date.now() - 25 * 60 * 60 * 1000));
    stubRelease('99.0.0');
    const result = await checkForUpdate({ force: false });
    expect(result.status).toBe('update');
    expect(fetch).toHaveBeenCalled();
  });

  it('does not record a check when GitHub cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const result = await checkForUpdate({ force: false });
    expect(result.status).toBe('error');
    expect(localStorage.getItem('clearnine-update-last-check')).toBeNull();
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
