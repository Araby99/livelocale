// @vitest-environment node
import { pileProgress, supportsScrollTimeline } from '../../../site/src/pile/pile';
it('maps scroll position to progress', () => {
  expect([
    pileProgress(100, 2000, 800),
    pileProgress(-600, 2000, 800),
    pileProgress(-1500, 2000, 800),
  ]).toEqual([0, 0.5, 1]);
  expect(pileProgress(0, 500, 800)).toBe(1);
});
it('asks for view timelines', () =>
  expect(
    supportsScrollTimeline({ supports: (p, v) => p === 'animation-timeline' && v === 'view()' })
  ).toBe(true));
