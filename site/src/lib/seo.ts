// What search engines and AI assistants read about the site: the robots rule, robots.txt, the
// sitemap, the JSON-LD graphs and the one-paragraph summary. Pure functions of SITE_URL and the
// page facts, with no imports, so the Vite config, the VitePress config and the Node build script
// (site/scripts/build.mjs) all share them.

/** The name, always lowercase, as the wordmark and the npm package spell it (DESIGN.md). */
export const NAME = 'livelocale';
export const REPO_URL = 'https://github.com/Araby99/livelocale';
export const NPM_URL = 'https://www.npmjs.com/package/livelocale';
export const LICENSE_URL = 'https://opensource.org/licenses/MIT';
/** The package author in package.json, the repository owner. */
export const AUTHOR = { name: 'Araby99', url: 'https://github.com/Araby99' };

/**
 * The answer-first summary: what livelocale is, who it is for and how it works. The llms.txt
 * blockquote and the JSON-LD descriptions use it; the landing page's first paragraph and the docs
 * front door say the same in their own words (tests/unit/site/seo.test.ts).
 */
export const SUMMARY =
  'livelocale is a free, open-source npm package for React sites on Next.js, Vite or any static host: anyone on the team holds Alt, clicks the wrong text on the running site and fixes it in any language, and the developer gets the fix as a JSON edit or a pull request.';

/** The share image's text alternative, on the landing page and every docs page. */
export const OG_IMAGE_ALT =
  'livelocale: Stop collecting screenshots. The npm install livelocale command beside the share Studio on a pricing page.';

/** Crawlers named in robots.txt; each is allowed exactly like every other agent. */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
];

/**
 * True for the hidden GitHub Pages preview (`https://araby99.github.io/livelocale/`): until the
 * domain switch (site/LAUNCH.md) that URL must stay out of search results.
 */
export function isPreview(siteUrl: string): boolean {
  return new URL(siteUrl).hostname.endsWith('.github.io');
}

/** The robots meta every page carries: noindex on the preview, indexable everywhere else. */
export function robotsContent(siteUrl: string): string {
  return isPreview(siteUrl)
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1';
}

/**
 * Puts `<meta name="robots" content="…">` in `<head>`, after the charset meta when there is one,
 * unless the page already has a robots meta.
 */
export function withRobotsMeta(html: string, content: string): string {
  if (/<meta\s+name="robots"/i.test(html)) return html;
  const at = /<meta\s+charset[^>]*>/i.exec(html) ?? /<head[^>]*>/i.exec(html);
  if (!at) throw new Error('no <head> to put the robots meta in');
  const end = at.index + at[0].length;
  return `${html.slice(0, end)}<meta name="robots" content="${content}">${html.slice(end)}`;
}

/** robots.txt under the site base: every agent, the named AI crawlers included, may read it all. */
export function robotsTxt(siteUrl: string): string {
  const groups = ['*', ...AI_CRAWLERS].map((agent) => `User-agent: ${agent}\nAllow: /\n`);
  return `${groups.join('\n')}\nSitemap: ${siteUrl}sitemap.xml\n`;
}

export interface SitemapEntry {
  url: string;
  /** An ISO 8601 date-time. */
  lastmod: string;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A sitemaps.org urlset with one <url> per entry, in the given order. */
export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map(
    (e) =>
      `  <url>\n    <loc>${escapeXml(e.url)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** The text of an HTML fragment as a reader sees it: tags dropped, entities decoded, spaces collapsed. */
export function htmlText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Faq {
  question: string;
  answer: string;
}

/**
 * The landing page's FAQ as it reads on the page: each <summary> and the paragraph under it, without
 * the paragraph's closing "read more" link, whose label would run on from the answer's last sentence.
 */
export function faqFromHtml(html: string): Faq[] {
  const section = /<section[^>]*\bid="faq"[^>]*>([\s\S]*?)<\/section>/.exec(html);
  if (!section) throw new Error('index.html has no FAQ section (id="faq")');
  const faq = [...section[1]!.matchAll(/<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map(
    (m) => ({
      question: htmlText(m[1]!),
      answer: htmlText(m[2]!.replace(/<a\b[^>]*>[\s\S]*?<\/a>\s*$/, '')),
    })
  );
  if (faq.length === 0) throw new Error('the FAQ section has no <summary> and <p> pairs');
  return faq;
}

const ids = (siteUrl: string) => ({
  website: `${siteUrl}#website`,
  software: `${siteUrl}#software`,
  author: `${siteUrl}#author`,
});

/** The landing page's JSON-LD: the website, the software, its author and the FAQ. */
export function landingJsonLd(opts: {
  siteUrl: string;
  version: string;
  description: string;
  faq: Faq[];
}): object {
  const { siteUrl, version, description, faq } = opts;
  const id = ids(siteUrl);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': id.website,
        url: siteUrl,
        name: NAME,
        description,
        inLanguage: 'en',
        publisher: { '@id': id.author },
      },
      { '@type': 'Person', '@id': id.author, name: AUTHOR.name, url: AUTHOR.url },
      {
        '@type': ['SoftwareApplication', 'SoftwareSourceCode'],
        '@id': id.software,
        name: NAME,
        description: SUMMARY,
        url: siteUrl,
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'Localization',
        operatingSystem: 'Windows, macOS, Linux',
        softwareRequirements: 'Node.js 18 or later',
        softwareVersion: version,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isAccessibleForFree: true,
        license: LICENSE_URL,
        codeRepository: REPO_URL,
        downloadUrl: NPM_URL,
        installUrl: NPM_URL,
        programmingLanguage: 'TypeScript',
        image: `${siteUrl}og-image.png`,
        sameAs: [REPO_URL, NPM_URL],
        author: { '@id': id.author },
      },
      {
        '@type': 'FAQPage',
        '@id': `${siteUrl}#faq`,
        url: siteUrl,
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
    ],
  };
}

/** A docs page's JSON-LD: the page as a TechArticle and its place under the docs. */
export function docsJsonLd(opts: {
  siteUrl: string;
  url: string;
  headline: string;
  description: string;
  dateModified: string;
}): object {
  const { siteUrl, url, headline, description, dateModified } = opts;
  const id = ids(siteUrl);
  const docs = `${siteUrl}docs/`;
  const crumbs = [
    { name: NAME, item: siteUrl },
    { name: 'Docs', item: docs },
    ...(url === docs ? [] : [{ name: headline, item: url }]),
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline,
        description,
        url,
        mainEntityOfPage: url,
        inLanguage: 'en',
        dateModified,
        image: `${siteUrl}og-image.png`,
        author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
        isPartOf: { '@type': 'WebSite', '@id': id.website, name: NAME, url: siteUrl },
        about: { '@type': 'SoftwareApplication', '@id': id.software, name: NAME },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.name,
          item: c.item,
        })),
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json">: `<` escaped so no string can close the tag. */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
