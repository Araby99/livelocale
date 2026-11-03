// @vitest-environment node
import {
  classifyLink,
  extractIds,
  extractLinks,
  ALLOWED_EXTERNAL,
} from '../../../site/scripts/docs/links.mjs';

const page = 'http://localhost:4173/livelocale/docs/start/nextjs.html';

it('resolves relative, base-absolute and anchor links into the built folder', () => {
  expect(
    classifyLink('../guides/ci-check.html#opt-outs', page, '/livelocale/', 'site/dist')
  ).toEqual({ kind: 'internal', file: 'site/dist/docs/guides/ci-check.html', hash: 'opt-outs' });
  expect(classifyLink('/livelocale/', page, '/livelocale/', 'site/dist')).toEqual({
    kind: 'internal',
    file: 'site/dist/index.html',
    hash: '',
  });
  expect(classifyLink('#step-2', page, '/livelocale/', 'site/dist')).toEqual({
    kind: 'internal',
    file: 'site/dist/docs/start/nextjs.html',
    hash: 'step-2',
  });
});

it('treats a root-relative link outside the base as external, and skips mail and script links', () => {
  expect(classifyLink('/docs/', page, '/livelocale/', 'site/dist')).toEqual({
    kind: 'external',
    url: 'http://localhost:4173/docs/',
  });
  expect(classifyLink('https://pnpm.io/cli/run', page, '/livelocale/', 'site/dist')).toEqual({
    kind: 'external',
    url: 'https://pnpm.io/cli/run',
  });
  expect(classifyLink('mailto:a@example.com', page, '/livelocale/', 'site/dist')).toEqual({
    kind: 'skip',
  });
  expect(classifyLink('javascript:void(0)', page, '/livelocale/', 'site/dist')).toEqual({
    kind: 'skip',
  });
});

it('allows only the repo, npm, the Tidewell demo and js.org', () => {
  const ok = (u: string) => ALLOWED_EXTERNAL.some((r) => r.test(u));
  expect(ALLOWED_EXTERNAL).toHaveLength(5);
  expect(ok('https://github.com/Araby99/livelocale/blob/main/LICENSE')).toBe(true);
  expect(ok('https://github.com/Araby99/livelocale#readme')).toBe(true);
  expect(ok('https://github.com/Araby99/tidewell/pull/2')).toBe(true);
  expect(ok('https://www.npmjs.com/package/livelocale')).toBe(true);
  expect(ok('https://js.org/')).toBe(true);
  expect(ok('https://livelocale.js.org/docs/')).toBe(true);
  expect(ok('https://github.com/Araby99/livelocale-evil')).toBe(false);
  expect(ok('https://www.npmjs.com/package/livelocale-evil')).toBe(false);
  expect(ok('https://js.org.evil.example/')).toBe(false);
  expect(ok('https://pnpm.io/cli/run')).toBe(false);
});

it('decodes entities in hrefs', () =>
  expect(extractLinks('<a href="a.html#x&amp;y">')).toEqual(['a.html#x&y']));

it('reads only anchor hrefs, in any quoting', () =>
  expect(
    extractLinks(
      `<link href="a.css"><svg><use href="#i-arrow"/></svg><a class="x" href='b.html'>b</a><A HREF=c.html>c</A>`
    )
  ).toEqual(['b.html', 'c.html']));

it('collects every id on the page', () =>
  expect(
    extractIds('<h2 id="opt-outs" tabindex="-1">x</h2><div data-id="no"></div><p id=\'a&amp;b\'>')
  ).toEqual(new Set(['opt-outs', 'a&b'])));
