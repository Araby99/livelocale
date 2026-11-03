// The docs site: VitePress builds site/docs/ into site/dist/docs/ under <site base>docs/, after the
// landing build (site/scripts/build.mjs), so SITE_URL sets both bases.
import { fileURLToPath } from 'node:url';
import { defineConfig, type MarkdownOptions } from 'vitepress';
import { docsBase, landingHref, NAV, SIDEBAR, TITLE_TEMPLATE } from '../../src/lib/docs-config';
import { cliFence } from './cli-fence';
import hunk from './hunk-shiki.json';

const base = docsBase(process.env);
const landing = landingHref(base);

export default defineConfig({
  base,
  outDir: fileURLToPath(new URL('../../dist/docs', import.meta.url)),
  cleanUrls: false,
  appearance: 'force-dark',
  lang: 'en',
  title: 'livelocale',
  titleTemplate: TITLE_TEMPLATE,
  head: [
    ['link', { rel: 'icon', href: `${landing}favicon.svg`, type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#0C0D0F' }],
  ],
  // JSON widens the theme's "type": "dark" to string, so the import needs the cast.
  markdown: {
    theme: hunk as NonNullable<MarkdownOptions['theme']>,
    // ```cli <name> fences show a real CLI run that cli-snippets.mjs recorded before the build.
    config: (md) =>
      cliFence(md, { dir: fileURLToPath(new URL('../../.cache/docs-cli', import.meta.url)) }),
  },
  themeConfig: {
    // The brand in the header (SiteBrand.vue) links to the landing page, outside the docs base.
    logoLink: landing,
    nav: NAV,
    sidebar: SIDEBAR,
    search: { provider: 'local' },
    outline: [2, 3],
  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^.*\/VPNavBarTitle\.vue$/,
          replacement: fileURLToPath(new URL('./theme/SiteBrand.vue', import.meta.url)),
        },
      ],
    },
  },
});
