import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { siteConfig } from './src/lib/site-config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  // The pathname of SITE_URL: /livelocale/ on the Pages project URL, / on a custom domain.
  base: siteConfig(process.env).base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { main: fileURLToPath(new URL('index.html', import.meta.url)) },
    },
  },
});
