import { defineConfig } from 'astro/config';
import liveLocale from 'livelocale/astro';

export default defineConfig({
  integrations: [liveLocale({ localesPath: './locales' })],
});
