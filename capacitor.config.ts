import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stormalert.app',
  appName: 'Storm Alert',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
