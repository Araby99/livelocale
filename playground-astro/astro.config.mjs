import { defineConfig } from 'astro/config';
import liveLocale from 'livelocale/astro';

// The Astro playground: .astro pages only, no React. The integration serves the Studio's API,
// puts the mode flag and the fallback dictionary in every page, and loads the in-page client
// in `astro dev`. A plain `astro build` gets none of it.
export default defineConfig({
  integrations: [liveLocale({ localesPath: './locales' })],
});
