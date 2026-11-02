// tests/unit/site/input-mode.test.ts
// @vitest-environment node
import { prefersTouch, TOUCH_QUERY } from '../../../site/src/lib/input-mode';
it('asks for a coarse pointer without hover', () => {
  const seen: string[] = [];
  expect(prefersTouch((q) => (seen.push(q), { matches: true }))).toBe(true);
  expect(seen).toEqual([TOUCH_QUERY]);
  expect(prefersTouch(() => ({ matches: false }))).toBe(false);
});
