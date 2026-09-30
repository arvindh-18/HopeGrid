// capacitor.config.ts — the HopeGrid Android app (Capacitor 6): the same React app as the website, packaged from dist/.
// The server address is set inside the app (Menu → Server) or at build time with VITE_SERVER_URL (src/lib/serverUrl.ts).
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.hopegrid',
  appName: 'HopeGrid',
  webDir: 'dist',
  android: {
    // Pages are served from https://localhost inside the app; the server allows this origin (server/cors.ts).
    allowMixedContent: false,
  },
  backgroundColor: '#212121',
};

export default config;
