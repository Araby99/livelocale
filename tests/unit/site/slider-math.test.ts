// @vitest-environment node
import {
  clampPercent,
  keyStep,
  percentFromPointer,
  valueText,
  SLIDER_START,
} from '../../../site/src/slider/slider-math';

it('clamps and recovers from NaN', () => {
  expect([clampPercent(-3), clampPercent(104), clampPercent(33.333), clampPercent(NaN)]).toEqual([
    0,
    100,
    33.3,
    SLIDER_START,
  ]);
});
it.each([
  ['ArrowLeft', 45],
  ['ArrowDown', 45],
  ['ArrowRight', 55],
  ['ArrowUp', 55],
  ['PageDown', 25],
  ['PageUp', 75],
  ['Home', 0],
  ['End', 100],
  ['a', null],
])('%s from 50 gives %s', (key, out) => expect(keyStep(50, key as string)).toBe(out));
it('stops at the ends', () =>
  expect([keyStep(2, 'ArrowLeft'), keyStep(90, 'PageUp')]).toEqual([0, 100]));
it('maps a pointer to a position inside the box', () => {
  expect(percentFromPointer(150, { left: 100, width: 200 })).toBe(25);
  expect(percentFromPointer(20, { left: 100, width: 200 })).toBe(0);
});
it('reads the Arabic share aloud', () => expect(valueText(30)).toBe('70% Arabic'));
