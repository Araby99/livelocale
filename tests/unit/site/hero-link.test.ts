// tests/unit/site/hero-link.test.ts
// @vitest-environment node
import { decodeChangeLink } from '../../../src/core/change-link';
import { nodeInflate } from '../../../src/core/change-link-node';
import { buildDemoLink, demoStudioHref } from '../../../site/src/hero/link';
import { applyEdit, MISTAKES } from '../../../site/src/hero/model';

it('builds a real change link that decodes to the visitor edits', async () => {
  const edits = applyEdit([], 'hero.lede', MISTAKES[1].fixed);
  const href = demoStudioHref('/livelocale/', 'https://araby99.github.io');
  const link = await buildDemoLink(edits, href, 1);
  expect(
    link.startsWith('https://araby99.github.io/livelocale/demo/livelocale/index.html#lc1.')
  ).toBe(true);
  const set = await decodeChangeLink(link, nodeInflate);
  expect(set.repo).toBeUndefined();
  expect(set.edits).toEqual([
    {
      locale: 'en',
      key: 'hero.lede',
      from: MISTAKES[1].broken,
      to: MISTAKES[1].fixed,
      force: false,
    },
  ]);
});
