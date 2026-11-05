// @vitest-environment node
import * as fs from 'node:fs';
import { DEFAULT_SITE_URL } from '../../../site/src/lib/site-config';
import { SIDEBAR } from '../../../site/src/lib/docs-config';
import {
  AI_CRAWLERS,
  SUMMARY,
  docsJsonLd,
  faqFromHtml,
  htmlText,
  isPreview,
  jsonLdScript,
  landingJsonLd,
  robotsContent,
  robotsTxt,
  sitemapXml,
  withRobotsMeta,
} from '../../../site/src/lib/seo';
import {
  absoluteHref,
  docsMarkdown,
  type MarkdownContext,
} from '../../../site/src/lib/docs-markdown';
import {
  docsMarkdownUrl,
  docsPageUrl,
  docsPages,
  frontmatter,
  llmsTxt,
  sidebarFile,
} from '../../../site/src/lib/seo-files';

const LIVE = 'https://livelocale.js.org/';

it('keeps the github.io preview out of search results and indexes the live site', () => {
  expect(isPreview(DEFAULT_SITE_URL)).toBe(true);
  expect(robotsContent(DEFAULT_SITE_URL)).toBe('noindex, nofollow');
  expect(isPreview(LIVE)).toBe(false);
  expect(robotsContent(LIVE)).toMatch(/^index, follow/);
  expect(robotsContent('http://localhost:4173/livelocale/')).toMatch(/^index, follow/);
});

it('documents the preview noindex and the crawler files in the launch checklist', () => {
  const launch = fs.readFileSync('site/LAUNCH.md', 'utf8');
  expect(launch).toContain('noindex');
  expect(launch).toContain('sitemap.xml');
  expect(launch).toContain('llms.txt');
});

it('puts the robots meta after the charset, once', () => {
  const html = '<html><head><meta charset="utf-8" /><title>x</title></head></html>';
  const out = withRobotsMeta(html, 'noindex');
  expect(out).toBe(
    '<html><head><meta charset="utf-8" /><meta name="robots" content="noindex"><title>x</title></head></html>'
  );
  expect(withRobotsMeta(out, 'index')).toBe(out);
});

it('writes robots.txt with the sitemap and the AI crawlers allowed', () => {
  const text = robotsTxt(LIVE);
  expect(text.startsWith('User-agent: *\nAllow: /\n')).toBe(true);
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']) {
    expect(AI_CRAWLERS).toContain(bot);
    expect(text).toContain(`User-agent: ${bot}\nAllow: /\n`);
  }
  expect(text).not.toContain('Disallow');
  expect(text.trimEnd().endsWith(`Sitemap: ${LIVE}sitemap.xml`)).toBe(true);
});

it('writes a sitemaps.org urlset', () => {
  const xml = sitemapXml([{ url: `${LIVE}docs/?a=1&b=2`, lastmod: '2026-11-03T00:00:00.000Z' }]);
  expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  expect(xml).toContain(`<loc>${LIVE}docs/?a=1&amp;b=2</loc>`);
  expect(xml).toContain('<lastmod>2026-11-03T00:00:00.000Z</lastmod>');
});

it('reads the FAQ off the landing page as it reads on screen', () => {
  const faq = faqFromHtml(fs.readFileSync('site/index.html', 'utf8'));
  expect(faq.length).toBeGreaterThan(4);
  expect(faq[0]!.question).toBe('Does anything ship to production?');
  expect(faq.find((f) => f.question.startsWith('We don'))!.answer).toContain(
    'npx livelocale apply "<link>" --pr'
  );
  for (const f of faq) expect(f.answer).not.toMatch(/<\/|<code|<a |&[a-z]+;/);
  // the "read more" link under each answer is not part of it
  for (const f of faq) expect(f.answer, f.question).toMatch(/\.$/);
  expect(faq[0]!.answer).not.toContain('Read about the safety switches');
  expect(htmlText('a <code>b</code>&amp;\n c')).toBe('a b& c');
});

it('builds the landing JSON-LD with no invented organisation', () => {
  const data = landingJsonLd({ siteUrl: LIVE, version: '0.11.0', description: 'd', faq: [] });
  const text = JSON.stringify(data);
  expect(text).not.toContain('Organization');
  expect(text).not.toContain('aggregateRating');
  expect(jsonLdScript({ a: '</script>' })).toBe('{"a":"\\u003c/script>"}');
});

it('gives the docs front door two breadcrumbs and every other page three', () => {
  const crumbs = (url: string) =>
    (
      docsJsonLd({ siteUrl: LIVE, url, headline: 'h', description: 'd', dateModified: 'x' }) as {
        '@graph': { itemListElement?: unknown[] }[];
      }
    )['@graph'][1]!.itemListElement!;
  expect(crumbs(`${LIVE}docs/`)).toHaveLength(2);
  expect(crumbs(`${LIVE}docs/start/nextjs.html`)).toHaveLength(3);
});

it('says what livelocale is first, on the landing page and the docs front door', () => {
  expect(SUMMARY.startsWith('livelocale is a free, open-source npm package for React sites')).toBe(
    true
  );
  const lede = /<p class="hero-lede">([\s\S]*?)<\/p>/.exec(
    fs.readFileSync('site/index.html', 'utf8')
  )![1]!;
  expect(htmlText(lede)).toMatch(
    /^livelocale sits on top of next-intl or react-i18next\. .+pull request\.$/
  );
  const front = fs.readFileSync('site/docs/index.md', 'utf8');
  const first = front
    .slice(front.indexOf('\n# '))
    .split('\n')
    .find((l) => l && !l.startsWith('#'))!;
  expect(first).toMatch(/^livelocale is a free, open-source npm package for React sites/);
});

it('maps docs files to their HTML and Markdown URLs', () => {
  expect(sidebarFile('/')).toBe('index.md');
  expect(sidebarFile('/start/nextjs')).toBe('start/nextjs.md');
  expect(sidebarFile('/reference/cli/')).toBe('reference/cli/index.md');
  expect(docsPageUrl(LIVE, 'index.md')).toBe(`${LIVE}docs/`);
  expect(docsPageUrl(LIVE, 'reference/cli/index.md')).toBe(`${LIVE}docs/reference/cli/`);
  expect(docsPageUrl(LIVE, 'guides/studio.md')).toBe(`${LIVE}docs/guides/studio.html`);
  expect(docsMarkdownUrl(LIVE, 'guides/studio.md')).toBe(`${LIVE}docs/guides/studio.md`);
  expect(frontmatter('---\ntitle: "A: b"\ndescription: c d\n---\n# A')).toEqual({
    title: 'A: b',
    description: 'c d',
  });
});

const ctx: MarkdownContext = {
  pageUrl: `${LIVE}docs/start/nextjs.html`,
  docsUrl: `${LIVE}docs/`,
  cliRun: () => ({ command: 'npx livelocale check', output: 'line 1\nline 2', status: 1 }),
  mediaUrl: (kind, name) => `${LIVE}docs/assets/${name}.hash.${kind === 'shot' ? 'webp' : 'mp4'}`,
  changelog: () => '## [1.0.0]\n\n- first',
};

it('turns the docs theme pieces into plain Markdown with absolute links', () => {
  const source = [
    '---',
    'title: T',
    'description: D',
    '---',
    '',
    '<script setup>',
    "const stacks = [{ title: 'Vite', text: 'Add the plugin.', href: './start/vite.html' }];",
    '</script>',
    '',
    '# T',
    '',
    'See [Vite](./vite.html#x), [CLI](../reference/cli/), [top](#top) and `[a](b)`.',
    '',
    '<DocShot lead name="next-alt-click" alt="The editor." caption="Step 5." />',
    '',
    '<DocClip name="send-link" label="Send it." />',
    '',
    '<StackPicker :stacks="stacks" />',
    '',
    "::: details Didn't work?",
    '',
    '- Try again.',
    '',
    ':::',
    '',
    '```cli check-missing',
    '',
    '```',
    '',
    '```tsx',
    '<DocShot name="x" alt="kept in code" />',
    '```',
    '',
    '<!-- @changelog -->',
  ].join('\n');
  expect(docsMarkdown(source, ctx)).toBe(
    [
      '# T',
      '',
      `See [Vite](${LIVE}docs/start/vite.html#x), [CLI](${LIVE}docs/reference/cli/), [top](${LIVE}docs/start/nextjs.html#top) and \`[a](b)\`.`,
      '',
      `![The editor.](${LIVE}docs/assets/next-alt-click.hash.webp)`,
      '',
      '*Step 5.*',
      '',
      `[Video: Send it.](${LIVE}docs/assets/send-link.hash.mp4)`,
      '',
      `- [Vite](${LIVE}docs/start/start/vite.html): Add the plugin.`,
      '',
      "**Didn't work?**",
      '',
      '- Try again.',
      '',
      '```text',
      '$ npx livelocale check',
      'line 1',
      'line 2',
      '# exit 1',
      '```',
      '',
      '```tsx',
      '<DocShot name="x" alt="kept in code" />',
      '```',
      '',
      '## [1.0.0]',
      '',
      '- first',
      '',
    ].join('\n')
  );
  expect(absoluteHref('https://example.com/a', ctx)).toBe('https://example.com/a');
  expect(absoluteHref('/guides/studio.html', ctx)).toBe(`${LIVE}docs/guides/studio.html`);
});

it('writes llms.txt with a section per sidebar group and an Optional section', () => {
  const pages = docsPages({ siteUrl: LIVE, docsDir: 'site/docs', sidebar: SIDEBAR });
  expect(pages).toHaveLength(SIDEBAR.flatMap((g) => g.items).length);
  const text = llmsTxt({ siteUrl: LIVE, sidebar: SIDEBAR, pages });
  expect(text.startsWith(`# livelocale\n\n> ${SUMMARY}\n`)).toBe(true);
  expect([...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual([
    ...SIDEBAR.map((g) => g.text),
    'Optional',
  ]);
  expect(text).toContain(`(${LIVE}docs/start/nextjs.md): `);
  const optional = text.slice(text.indexOf('## Optional'));
  expect(optional).toContain(`(${LIVE}docs/reference/changelog.md)`);
  expect(optional).toContain(`(${LIVE}llms-full.txt)`);
  expect(text.slice(0, text.indexOf('## Optional'))).not.toContain('changelog.md');
});

it('leaves links inside code spans alone, double-backtick spans included', () => {
  const line =
    'Keys (``t(`a.${s}`)``) and `[x](y)`: see the [`check` reference](../reference/cli/check.md).';
  expect(docsMarkdown(`# T\n\n${line}\n`, ctx)).toBe(
    `# T\n\nKeys (\`\`t(\`a.\${s}\`)\`\`) and \`[x](y)\`: see the [\`check\` reference](${LIVE}docs/reference/cli/check.md).\n`
  );
});

it('reads text from tags the same way on nested and unclosed markup, and fast', () => {
  expect(htmlText('<scr<b>ipt>x')).toBe('ipt>x');
  expect(htmlText('a <> b')).toBe('a <> b');
  expect(htmlText('a < b')).toBe('a < b');
  expect(htmlText('&lt;b&gt; <i>x</i>')).toBe('<b> x');
  const start = performance.now();
  htmlText('<'.repeat(100_000));
  expect(performance.now() - start).toBeLessThan(500);
});
