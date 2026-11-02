import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Tidewell, the fictional pricing site the hero video is recorded on and the landing page's live
// demo. record-hero.mjs builds it at the root '/'; site/scripts/build.mjs passes --base <base>demo/.
// Either way `livelocale pack` then adds the share Studio to dist/.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
