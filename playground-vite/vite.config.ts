import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { liveLocaleVite } from 'livelocale/vite';

// The static share fixture: `vite build` writes the app and the share Studio into dist/.
export default defineConfig({
  plugins: [react(), liveLocaleVite({ localesPath: './locales', share: true })],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        about: resolve(import.meta.dirname, 'about/index.html'),
      },
    },
  },
});
