// @vitest-environment node
import {
  docsBase,
  landingHref,
  SIDEBAR,
  NAV,
  TITLE_TEMPLATE,
  docsPageFiles,
} from '../../../site/src/lib/docs-config';

it('puts the docs under the site base', () => {
  expect(docsBase({})).toBe('/livelocale/docs/');
  expect(docsBase({ SITE_URL: 'https://livelocale.js.org/' })).toBe('/docs/');
  expect(landingHref('/livelocale/docs/')).toBe('/livelocale/');
  expect(landingHref('/docs/')).toBe('/');
});

it('lists every docs page in the sidebar exactly once, and nothing else', () => {
  const linked = SIDEBAR.flatMap((g) => g.items.map((i) => i.link));
  const pages = docsPageFiles('site/docs').map((f) => '/' + f.replace(/(index)?\.md$/, ''));
  expect(new Set(linked).size).toBe(linked.length);
  expect([...linked].sort()).toEqual([...pages].sort());
  expect(SIDEBAR.map((g) => g.text)).toEqual([
    'Get started',
    'Guides',
    'How it works',
    'Reference',
  ]);
});

it('finds pages in subfolders and skips the .vitepress folder', () => {
  const files = docsPageFiles('site/docs');
  expect(files).toContain('index.md');
  expect(files.every((f) => !f.startsWith('.vitepress') && !f.includes('\\'))).toBe(true);
});

it('carries the landing nav and the page title template', () => {
  expect(NAV).toEqual([
    { text: 'GitHub', link: 'https://github.com/Araby99/livelocale' },
    { text: 'Docs', link: '/' },
  ]);
  expect(TITLE_TEMPLATE).toBe(':title | livelocale docs');
});
