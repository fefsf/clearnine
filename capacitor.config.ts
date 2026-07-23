import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clearnine.puzzle',
  appName: 'ClearNine',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
