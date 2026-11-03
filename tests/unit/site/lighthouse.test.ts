// @vitest-environment node
import { expect, it } from 'vitest';
import { assertScores, medianLhr, LH_PATHS } from '../../../site/scripts/lighthouse.mjs';

it('reports each category under the floor', () =>
  expect(
    assertScores(
      {
        categories: {
          performance: { score: 0.84 },
          accessibility: { score: 1 },
          seo: { score: null },
        },
      },
      0.9
    )
  ).toEqual(['performance 0.84 < 0.9', 'seo null < 0.9']));

it('gates on the median of the runs, not one outlier', () => {
  const run = (p: number | null) => ({ categories: { performance: { score: p } } });
  expect(medianLhr([run(0.95), run(0.81), run(0.92)]).categories).toEqual(run(0.92).categories);
  expect(medianLhr([run(null), run(0.93), run(0.91)]).categories).toEqual(run(0.91).categories);
});

it('measures the landing page and the getting-started pages', () =>
  expect(LH_PATHS).toEqual(['', 'docs/', 'docs/start/nextjs.html']));
