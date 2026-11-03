// The docs site: VitePress builds site/docs/ into site/dist/docs/ under <site base>docs/, after the
// landing build (site/scripts/build.mjs), so SITE_URL sets both bases.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig, type HeadConfig, type MarkdownOptions } from 'vitepress';
import { docsBase, landingHref, NAV, SIDEBAR, TITLE_TEMPLATE } from '../../src/lib/docs-config';
import { siteConfig } from '../../src/lib/site-config';
import { docsJsonLd, jsonLdScript, OG_IMAGE_ALT, robotsContent } from '../../src/lib/seo';
import {
  docsMarkdownUrl,
  docsPageUrl,
  docsSources,
  gitLastModified,
  writeSeoFiles,
} from '../../src/lib/seo-files';
import { changelogBody, changelogPage } from './changelog';
import { cliFence } from './cli-fence';
import { inlineCodeVPre } from './inline-code';
import { searchA11y } from './search-a11y';
import hunk from './hunk-shiki.json';

const base = docsBase(process.env);
const landing = landingHref(base);
const { siteUrl } = siteConfig(process.env);
/** The h1's face (Martian Mono 700, Latin), preloaded on every page as the landing page does. */
const HEADLINE_FONT = /^assets\/martian-mono-latin-700-normal[\w.-]*\.woff2$/;

const REPO_DIR = fileURLToPath(new URL('../../../', import.meta.url));
const CHANGELOG = fileURLToPath(new URL('../../../CHANGELOG.md', import.meta.url));
const robots = robotsContent(siteUrl);

export default defineConfig({
  base,
  outDir: fileURLToPath(new URL('../../dist/docs', import.meta.url)),
  cleanUrls: false,
  appearance: 'force-dark',
  lang: 'en',
  title: 'livelocale',
  titleTemplate: TITLE_TEMPLATE,
  head: [['link', { rel: 'icon', href: `${landing}favicon.svg`, type: 'image/svg+xml' }]],
  // Each page's head: its robots rule, canonical URL, Markdown copy, share tags (its own title,
  // description and URL, the site's one share image) and JSON-LD (a TechArticle and its
  // breadcrumbs). VitePress's 404 page gets the robots rule only, as noindex.
  transformHead({ assets, pageData, title, description }) {
    const font = assets.find(
      (asset) => asset.startsWith(base) && HEADLINE_FONT.test(asset.slice(base.length))
    );
    if (!font) throw new Error('the headline font (martian-mono-latin-700-normal) is missing');
    const preload: HeadConfig = [
      'link',
      { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: font },
    ];
    const themeColor: HeadConfig = ['meta', { name: 'theme-color', content: '#0C0D0F' }];
    if (pageData.isNotFound || pageData.relativePath === '404.md')
      return [preload, themeColor, ['meta', { name: 'robots', content: 'noindex' }]];
    const url = docsPageUrl(siteUrl, pageData.relativePath);
    const image = `${siteUrl}og-image.png`;
    return [
      preload,
      themeColor,
      ['meta', { name: 'robots', content: robots }],
      ['link', { rel: 'canonical', href: url }],
      [
        'link',
        {
          rel: 'alternate',
          type: 'text/markdown',
          href: docsMarkdownUrl(siteUrl, pageData.relativePath),
          title: `${pageData.title} as Markdown`,
        },
      ],
      ['meta', { property: 'og:type', content: 'article' }],
      ['meta', { property: 'og:site_name', content: 'livelocale' }],
      ['meta', { property: 'og:locale', content: 'en_US' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:image', content: image }],
      ['meta', { property: 'og:image:type', content: 'image/png' }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:image:alt', content: OG_IMAGE_ALT }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: image }],
      ['meta', { name: 'twitter:image:alt', content: OG_IMAGE_ALT }],
      [
        'script',
        { type: 'application/ld+json' },
        jsonLdScript(
          docsJsonLd({
            siteUrl,
            url,
            headline: pageData.title,
            description,
            dateModified: gitLastModified(docsSources(pageData.relativePath), REPO_DIR),
          })
        ),
      ],
    ];
  },
  // After the docs are built (the landing page is already in site/dist): the Markdown copies,
  // llms.txt, llms-full.txt, sitemap.xml and robots.txt (src/lib/seo-files.ts).
  buildEnd() {
    writeSeoFiles({
      siteUrl,
      distDir: fileURLToPath(new URL('../../dist', import.meta.url)),
      docsDir: fileURLToPath(new URL('..', import.meta.url)),
      repoDir: REPO_DIR,
      cliDir: fileURLToPath(new URL('../../.cache/docs-cli', import.meta.url)),
      mediaManifest: fileURLToPath(new URL('../../media/docs/manifest.json', import.meta.url)),
      sidebar: SIDEBAR,
      changelog: () => changelogBody(readFileSync(CHANGELOG, 'utf8')),
    });
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
