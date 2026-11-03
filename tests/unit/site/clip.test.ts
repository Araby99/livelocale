// @vitest-environment node
import { shouldPlay } from '../../../site/src/lib/clip';

it('plays only when half visible, motion is allowed and the reader has not paused it', () =>
  expect([
    shouldPlay(0.6, false, false),
    shouldPlay(0.4, false, false),
    shouldPlay(1, true, false),
    shouldPlay(1, false, true),
  ]).toEqual([true, false, false, false]));

it('plays at exactly half visible', () => expect(shouldPlay(0.5, false, false)).toBe(true));
