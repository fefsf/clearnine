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
    if (!isGithubUpdateUrl(options.url)) {
      return Promise.resolve({ status: 'failed', message: 'Update URL is not from GitHub' });
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
