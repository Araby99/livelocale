// The docs site: VitePress builds site/docs/ into site/dist/docs/ under <site base>docs/, after the
// landing build (site/scripts/build.mjs), so SITE_URL sets both bases.
import { fileURLToPath } from 'node:url';
import { defineConfig, type MarkdownOptions } from 'vitepress';
import { docsBase, landingHref, NAV, SIDEBAR, TITLE_TEMPLATE } from '../../src/lib/docs-config';
import { siteConfig } from '../../src/lib/site-config';
import { changelogPage } from './changelog';
import { cliFence } from './cli-fence';
import { inlineCodeVPre } from './inline-code';
import { searchA11y } from './search-a11y';
import hunk from './hunk-shiki.json';

const base = docsBase(process.env);
const landing = landingHref(base);
const { siteUrl } = siteConfig(process.env);
/** The h1's face (Martian Mono 700, Latin), preloaded on every page as the landing page does. */
const HEADLINE_FONT = /^assets\/martian-mono-latin-700-normal[\w.-]*\.woff2$/;

/** A page's absolute URL: `guides/studio.md` → `<site>docs/guides/studio.html`, an index → its folder. */
function pageUrl(relativePath: string): string {
  return `${siteUrl}docs/${relativePath.replace(/\.md$/, '.html').replace(/(^|\/)index\.html$/, '$1')}`;
}

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
  ],
  // Each page's share tags: its own title, description and URL, the site's one share image.
  transformHead({ assets, pageData, title, description }) {
    const font = assets.find(
      (asset) => asset.startsWith(base) && HEADLINE_FONT.test(asset.slice(base.length))
    );
    if (!font) throw new Error('the headline font (martian-mono-latin-700-normal) is missing');
    return [
      ['link', { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: font }],
      ['meta', { name: 'theme-color', content: '#0C0D0F' }],
      ['meta', { property: 'og:type', content: 'article' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: pageUrl(pageData.relativePath) }],
      ['meta', { property: 'og:image', content: `${siteUrl}og-image.png` }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:image:alt', content: 'livelocale: Stop collecting screenshots.' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ];
  },
  // JSON widens the theme's "type": "dark" to string, so the import needs the cast.
  markdown: {
    theme: hunk as NonNullable<MarkdownOptions['theme']>,
    // ```cli <name> fences show a real CLI run that cli-snippets.mjs recorded before the build.
    // reference/changelog.md's marker becomes CHANGELOG.md from its first release on.
    // Inline code is v-pre, so `{{name}}` stays literal instead of becoming a Vue interpolation.
    config: (md) => {
      inlineCodeVPre(md);
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
