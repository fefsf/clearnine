import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type ApkInstallResult =
  | { status: 'ok' }
  | { status: 'need-permission' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export type DownloadProgress = { received: number; total: number };

export interface ApkInstallerPlugin {
  downloadAndInstall(options: { url: string }): Promise<ApkInstallResult>;
  cancelDownload(): Promise<void>;
  openUrl(options: { url: string }): Promise<void>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: DownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

/**
 * HTTPS GitHub hosts only. Keep in sync with ApkInstallerPlugin.isAllowedUrl.
 * Release pages are github.com; APK redirects use githubusercontent or GitHub's S3 bucket.
 */
export function isGithubUpdateUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'github.com' || host.endsWith('.github.com')) return true;
  if (host === 'objects.githubusercontent.com' || host.endsWith('.githubusercontent.com')) return true;
  if (host === 'github-cloud.s3.amazonaws.com') return true;
  return host.endsWith('.amazonaws.com') && host.includes('github-production-release-asset');
}

/** Release assets of this project only. Keep in sync with RELEASE_ASSET_PREFIX in the plugin. */
const RELEASE_ASSET_PREFIX = 'https://github.com/fefsf/clearnine/releases/download/';

/**
 * The only place an update APK may be fetched from. The text must start with
 * the release path and must not climb out of it with dot segments or escapes.
 */
export function isReleaseApkUrl(raw: string): boolean {
  if (!isGithubUpdateUrl(raw) || !raw.startsWith(RELEASE_ASSET_PREFIX)) return false;
  const rest = raw.slice(RELEASE_ASSET_PREFIX.length);
  return rest.length > 0 && !rest.includes('..') && !/[%\\?#@]/.test(rest);
}

const ApkInstallerRaw = registerPlugin<ApkInstallerPlugin>('ApkInstaller', {
  web: {
    async downloadAndInstall(options: { url: string }): Promise<ApkInstallResult> {
      window.open(options.url, '_blank', 'noopener');
      return { status: 'ok' };
    },
    async cancelDownload(): Promise<void> {},
    async openUrl(options: { url: string }): Promise<void> {
      window.open(options.url, '_blank', 'noopener');
    },
    async addListener(): Promise<PluginListenerHandle> {
      return { remove: async () => {} };
    },
  },
});

export const ApkInstaller: ApkInstallerPlugin = {
  downloadAndInstall(options) {
    if (!isReleaseApkUrl(options.url)) {
      return Promise.resolve({ status: 'failed', message: 'Update URL is not a ClearNine release' });
    }
    return ApkInstallerRaw.downloadAndInstall(options);
  },
  cancelDownload() {
    return ApkInstallerRaw.cancelDownload();
  },
  openUrl(options) {
    // Resolve instead of rejecting so callers do not fall back to window.open.
    if (!isGithubUpdateUrl(options.url)) return Promise.resolve();
    return ApkInstallerRaw.openUrl(options);
  },
  addListener(eventName, listenerFunc) {
    return ApkInstallerRaw.addListener(eventName, listenerFunc);
  },
};
