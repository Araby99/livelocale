import * as fs from 'node:fs';
import { posix } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { AI_CRAWLERS, OG_IMAGE_ALT, robotsContent } from '../../site/src/lib/seo';

// What search engines and AI assistants read: every built page's head, its JSON-LD, the sitemap,
// robots.txt, llms.txt, llms-full.txt and each docs page's Markdown copy. The suite builds for
// http://localhost:4173/livelocale/, which is not the github.io preview, so the pages are
// indexable here (the preview's noindex is tests/unit/site/seo.test.ts).
const SITE = 'http://localhost:4173/livelocale/';
const DIST = 'site/dist';

/** Every built content page under DIST (the 404s and the live demo are not content). */
function builtPages(): string[] {
  const docs = fs
    .readdirSync(posix.join(DIST, 'docs'), { recursive: true, encoding: 'utf8' })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.html') && file !== '404.html')
    .map((file) => `docs/${file}`)
    .sort();
  return ['index.html', ...docs];
}

/** A built page's public URL: `docs/index.html` → `<site>docs/`, others keep their `.html`. */
const urlOf = (page: string) => `${SITE}${page.replace(/(^|\/)index\.html$/, '$1')}`;

interface Head {
  lang: string;
  title: string;
  meta: Record<string, string>;
  canonical: string[];
  markdown: string[];
  h1: number;
  imagesWithoutAlt: string[];
  jsonLd: string[];
}

async function readHead(page: Page): Promise<Head> {
  return page.evaluate(() => {
    const meta: Record<string, string> = {};
    for (const m of document.querySelectorAll('meta')) {
      const key = m.getAttribute('property') ?? m.getAttribute('name');
      if (key) meta[key] = m.content;
    }
    const hrefs = (sel: string) =>
      [...document.querySelectorAll<HTMLLinkElement>(sel)].map((l) => l.href);
    return {
      lang: document.documentElement.lang,
      title: document.title,
      meta,
      canonical: hrefs('link[rel="canonical"]'),
      markdown: hrefs('link[rel="alternate"][type="text/markdown"]'),
      h1: document.querySelectorAll('h1').length,
      imagesWithoutAlt: [...document.images]
        .filter((i) => !i.hasAttribute('alt'))
        .map((i) => i.src),
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => s.textContent ?? ''
      ),
    };
  });
}

type Node = Record<string, unknown> & { '@type': string | string[] };
const graph = (head: Head): Node[] =>
  head.jsonLd.flatMap((text) => (JSON.parse(text) as { '@graph': Node[] })['@graph']);
const ofType = (nodes: Node[], type: string) =>
  nodes.find((n) => ([] as string[]).concat(n['@type']).includes(type));

test('gives every built page the full head: title, description, canonical, share tags, one h1', async ({
  page,
}) => {
  const pages = builtPages();
  expect(pages.length).toBeGreaterThan(20);
  const titles = new Set<string>();
  for (const file of pages) {
    const url = urlOf(file);
    await page.goto(url);
    const head = await readHead(page);
    expect(head.lang, url).toBe('en');
    expect(head.title.length, `${url}: ${head.title}`).toBeLessThanOrEqual(60);
    expect(titles.has(head.title), `${url}: duplicate title`).toBe(false);
    titles.add(head.title);
    const description = head.meta.description ?? '';
    expect(description.length, url).toBeGreaterThanOrEqual(50);
    expect(description.length, url).toBeLessThanOrEqual(160);
    expect(head.canonical, url).toEqual([url]);
    expect(head.meta.robots, url).toBe(robotsContent(SITE));
    expect(head.meta['theme-color'], url).toBe('#0C0D0F');
    expect(head.meta['og:url'], url).toBe(url);
    expect(head.meta['og:site_name'], url).toBe('livelocale');
    expect(head.meta['og:title'], url).toBeTruthy();
    expect(head.meta['og:description'], url).toBeTruthy();
    expect(head.meta['og:image'], url).toBe(`${SITE}og-image.png`);
    expect(head.meta['og:image:width'], url).toBe('1200');
    expect(head.meta['og:image:height'], url).toBe('630');
    expect(head.meta['og:image:alt'], url).toBe(OG_IMAGE_ALT);
    expect(head.meta['twitter:card'], url).toBe('summary_large_image');
    expect(head.meta['twitter:title'], url).toBe(head.meta['og:title']);
    expect(head.meta['twitter:description'], url).toBe(head.meta['og:description']);
    expect(head.meta['twitter:image'], url).toBe(head.meta['og:image']);
    expect(head.meta['twitter:image:alt'], url).toBe(OG_IMAGE_ALT);
    expect(head.h1, url).toBe(1);
    expect(head.imagesWithoutAlt, url).toEqual([]);
    expect(head.jsonLd.length, url).toBeGreaterThan(0);
  }
});

test('describes the landing page as the software, its website, its author and its FAQ', async ({
  page,
}) => {
  await page.goto('./');
  const nodes = graph(await readHead(page));
  const app = ofType(nodes, 'SoftwareApplication')!;
  expect(app).toMatchObject({
    name: 'livelocale',
    applicationCategory: 'DeveloperApplication',
    url: SITE,
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: 'https://github.com/Araby99/livelocale',
    downloadUrl: 'https://www.npmjs.com/package/livelocale',
    offers: { '@type': 'Offer', price: '0' },
  });
  expect(app.operatingSystem).toBeTruthy();
  const version = (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string })
    .version;
  expect(app.softwareVersion).toBe(version);
  expect(ofType(nodes, 'WebSite')).toMatchObject({ url: SITE, name: 'livelocale' });
  expect(ofType(nodes, 'Person')).toMatchObject({
    name: 'Araby99',
    url: 'https://github.com/Araby99',
  });
  expect(nodes.some((n) => n['@type'] === 'Organization')).toBe(false);

  // The FAQPage holds exactly the questions and answers the page shows, without the "read more"
  // link that closes each answer.
  const onPage = await page.locator('#faq details').evaluateAll((items) =>
    items.map((d) => {
      const p = d.querySelector('p')!.cloneNode(true) as HTMLElement;
      if (p.lastElementChild?.tagName === 'A') p.lastElementChild.remove();
      return {
        question: d.querySelector('summary')!.textContent!.replace(/\s+/g, ' ').trim(),
        answer: p.textContent!.replace(/\s+/g, ' ').trim(),
      };
    })
  );
  const faq = ofType(nodes, 'FAQPage')!.mainEntity as {
    name: string;
    acceptedAnswer: { text: string };
  }[];
  expect(faq.map((q) => ({ question: q.name, answer: q.acceptedAnswer.text }))).toEqual(onPage);
  expect(onPage.length).toBeGreaterThan(4);
});

test('describes every docs page as a TechArticle with its breadcrumbs', async ({ page }) => {
  for (const file of builtPages().filter((f) => f.startsWith('docs/'))) {
    const url = urlOf(file);
    await page.goto(url);
    const head = await readHead(page);
    const nodes = graph(head);
    const article = ofType(nodes, 'TechArticle')!;
    expect(article, url).toBeTruthy();
    expect(article.headline, url).toBeTruthy();
    expect((article.headline as string).length, url).toBeLessThanOrEqual(110);
    expect(article.description, url).toBe(head.meta.description);
    expect(article.url, url).toBe(url);
    expect(Number.isNaN(Date.parse(article.dateModified as string)), url).toBe(false);
    const crumbs = ofType(nodes, 'BreadcrumbList')!.itemListElement as {
      position: number;
      item: string;
    }[];
    expect(crumbs[0]!.item, url).toBe(SITE);
    expect(crumbs[1]!.item, url).toBe(`${SITE}docs/`);
    expect(crumbs.at(-1)!.item, url).toBe(url);
    expect(
      crumbs.map((c) => c.position),
      url
    ).toEqual(crumbs.map((_, i) => i + 1));
  }
});

test('lists every built page in the sitemap, and each one answers', async ({ request }) => {
  const response = await request.get('sitemap.xml');
  expect(response.status()).toBe(200);
  const xml = await response.text();
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  expect([...locs].sort()).toEqual(builtPages().map(urlOf).sort());
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
  expect(lastmods).toHaveLength(locs.length);
  for (const date of lastmods) expect(Number.isNaN(Date.parse(date)), date).toBe(false);
  for (const loc of locs) expect((await request.get(loc)).status(), loc).toBe(200);
});

test('points robots.txt at the sitemap and lets every crawler in, AI crawlers by name', async ({
  request,
}) => {
  const text = await (await request.get('robots.txt')).text();
  expect(text).toContain(`Sitemap: ${SITE}sitemap.xml`);
  expect(text).not.toMatch(/Disallow:\s*\S/);
  for (const bot of ['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']) {
    expect(AI_CRAWLERS.includes(bot) || bot === '*', bot).toBe(true);
    expect(text, bot).toContain(`User-agent: ${bot}\nAllow: /\n`);
  }
});

test('serves llms.txt in the llmstxt.org shape, every link resolving', async ({ request }) => {
  const response = await request.get('llms.txt');
  expect(response.status()).toBe(200);
  const text = await response.text();
  const lines = text.split('\n');
  expect(lines[0]).toBe('# livelocale');
  expect(lines[1]).toBe('');
  expect(lines[2]).toMatch(/^> livelocale is /);
  expect(text.match(/^# /gm)).toHaveLength(1);
  const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  expect(sections).toEqual(['Get started', 'Guides', 'How it works', 'Reference', 'Optional']);
  // Every list item under a section is a link with a one-line description.
  const body = text.slice(text.indexOf('\n## '));
  for (const item of body.split('\n').filter((l) => l.startsWith('- ')))
    expect(item).toMatch(/^- \[[^\]]+\]\((https?:\/\/[^)\s]+)\): \S/);
  const links = [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]!);
  expect(links.length).toBeGreaterThan(25);
  for (const link of links) {
    if (link.startsWith(SITE)) expect((await request.get(link)).status(), link).toBe(200);
    else
      expect([
        'https://github.com/Araby99/livelocale',
        'https://www.npmjs.com/package/livelocale',
      ]).toContain(link);
  }
});

test('serves every docs page as Markdown beside it, linked from the page', async ({
  page,
  request,
}) => {
  const full = await (await request.get('llms-full.txt')).text();
  expect(full.startsWith('# livelocale documentation\n')).toBe(true);
  for (const file of builtPages().filter((f) => f.startsWith('docs/'))) {
    const url = urlOf(file);
    await page.goto(url);
    const head = await readHead(page);
    expect(head.markdown, url).toEqual([`${SITE}${file.replace(/\.html$/, '.md')}`]);
    const response = await request.get(head.markdown[0]!);
    expect(response.status(), url).toBe(200);
    expect(response.headers()['content-type'], url).toContain('text/markdown');
    const md = await response.text();
    // The heading's text without VitePress's zero-width anchor link.
    const h1 = (await page.locator('h1').first().textContent())!
      .replace(/[\s\p{Cf}]+/gu, ' ')
      .trim();
    expect(md.split('\n')[0], url).toBe(`# ${h1}`);
    // Nothing only the docs theme can render is left in it.
    for (const leftover of ['<DocShot', '<DocClip', '<StackPicker', '<script setup', '\n:::'])
      expect(md, `${url}: ${leftover}`).not.toContain(leftover);
    expect(md, url).not.toMatch(/```cli /);
    expect(md, url).not.toMatch(/\]\((?!https?:|mailto:)[^)]+\)/);
    expect(full, url).toContain(`Source: ${url}\n\n${md.trim()}`);
  }
});

test('answers a missing address with the landing 404 page, noindex', async ({ page }) => {
  const response = await page.goto('docs/no-such-page.html');
  expect(response!.status()).toBe(404);
  await expect(page).toHaveTitle('Page not found | livelocale');
  await expect(page.locator('h1')).toHaveText('Page not found');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('[data-missing-path]')).toHaveText(
    '/livelocale/docs/no-such-page.html'
  );
  await page.getByRole('link', { name: 'Read the docs' }).click();
  await expect(page).toHaveURL(`${SITE}docs/`);
});

test('keeps the live demo out of search results', async ({ request }) => {
  for (const path of ['demo/index.html', 'demo/livelocale/index.html']) {
    const html = await (await request.get(path)).text();
    expect(html, path).toMatch(/<meta name="robots" content="noindex[^"]*"/);
  }
});
