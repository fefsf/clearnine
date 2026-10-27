import { describe, expect, it, vi } from 'vitest';
import { ApkInstaller, isGithubUpdateUrl } from './apk-installer';

describe('isGithubUpdateUrl', () => {
  it('allows GitHub HTTPS hosts used by releases and APK redirects', () => {
    expect(isGithubUpdateUrl('https://github.com/fefsf/clearnine/releases/latest')).toBe(true);
    expect(isGithubUpdateUrl('https://api.github.com/repos/fefsf/clearnine/releases/latest')).toBe(true);
    expect(isGithubUpdateUrl('https://release-assets.githubusercontent.com/file.apk')).toBe(true);
    expect(isGithubUpdateUrl('https://github-cloud.s3.amazonaws.com/x')).toBe(true);
    expect(
      isGithubUpdateUrl('https://github-production-release-asset-2e65be.s3.amazonaws.com/x'),
    ).toBe(true);
  });

  it('rejects other hosts and schemes', () => {
    expect(isGithubUpdateUrl('http://github.com/fefsf/clearnine')).toBe(false);
    expect(isGithubUpdateUrl('https://evil.example/phish')).toBe(false);
    expect(isGithubUpdateUrl('https://github.com.evil.com/x')).toBe(false);
    expect(isGithubUpdateUrl('https://notgithub.com/x')).toBe(false);
    expect(isGithubUpdateUrl('not a url')).toBe(false);
  });
});

describe('ApkInstaller.openUrl', () => {
  it('does not open a non-GitHub url', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await ApkInstaller.openUrl({ url: 'https://evil.example/phish' });
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
