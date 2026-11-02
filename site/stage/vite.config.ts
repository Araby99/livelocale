import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Tidewell, the fictional pricing site the hero video is recorded on. It is served at the site
// root by site/scripts/record-hero.mjs, then `livelocale pack` adds the share Studio to dist/.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
