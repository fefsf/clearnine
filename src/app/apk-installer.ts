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

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller', {
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

export { ApkInstaller };
