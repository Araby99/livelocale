// The docs site: VitePress builds site/docs/ into site/dist/docs/ under <site base>docs/, after the
// landing build (site/scripts/build.mjs), so SITE_URL sets both bases.
import { fileURLToPath } from 'node:url';
import { defineConfig, type MarkdownOptions } from 'vitepress';
import { docsBase, landingHref, NAV, SIDEBAR, TITLE_TEMPLATE } from '../../src/lib/docs-config';
import { changelogPage } from './changelog';
import { cliFence } from './cli-fence';
import { searchA11y } from './search-a11y';
import hunk from './hunk-shiki.json';

const base = docsBase(process.env);
const landing = landingHref(base);
/** The h1's face (Martian Mono 700, Latin), preloaded on every page as the landing page does. */
const HEADLINE_FONT = /^assets\/martian-mono-latin-700-normal[\w.-]*\.woff2$/;

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
  transformHead({ assets }) {
    const font = assets.find(
      (asset) => asset.startsWith(base) && HEADLINE_FONT.test(asset.slice(base.length))
    );
    if (!font) throw new Error('the headline font (martian-mono-latin-700-normal) is missing');
    return [
      ['link', { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: font }],
    ];
  },
  // JSON widens the theme's "type": "dark" to string, so the import needs the cast.
  markdown: {
    theme: hunk as NonNullable<MarkdownOptions['theme']>,
    // ```cli <name> fences show a real CLI run that cli-snippets.mjs recorded before the build.
    // reference/changelog.md's marker becomes CHANGELOG.md from its first release on.
    config: (md) => {
      cliFence(md, { dir: fileURLToPath(new URL('../../.cache/docs-cli', import.meta.url)) });
      changelogPage(md, { file: fileURLToPath(new URL('../../../CHANGELOG.md', import.meta.url)) });
    },
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
    plugins: [searchA11y()],
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
