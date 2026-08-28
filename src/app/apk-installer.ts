import { registerPlugin } from '@capacitor/core';

export type ApkInstallResult =
  | { status: 'ok' }
  | { status: 'need-permission' }
  | { status: 'failed'; message: string };

export interface ApkInstallerPlugin {
  downloadAndInstall(options: { url: string }): Promise<ApkInstallResult>;
  openUrl(options: { url: string }): Promise<void>;
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller', {
  web: {
    async downloadAndInstall(options: { url: string }): Promise<ApkInstallResult> {
      window.open(options.url, '_blank', 'noopener');
      return { status: 'ok' };
    },
    async openUrl(options: { url: string }): Promise<void> {
      window.open(options.url, '_blank', 'noopener');
    },
  },
});

export { ApkInstaller };
