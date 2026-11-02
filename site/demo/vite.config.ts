import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../src/lib/site-config';

// The hero demo app. `livelocale pack` adds the share Studio to dist/ after this build, and
// site/scripts/build.mjs copies the result to site/dist/demo/.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: `${siteConfig(process.env).base}demo/`,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
