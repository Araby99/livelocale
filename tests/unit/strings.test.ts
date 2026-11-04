// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { trimTrailingSlashes } from '../../src/core/strings.js';

describe('trimTrailingSlashes', () => {
  it.each([
    ['', ''],
    ['/', ''],
    ['a', 'a'],
    ['a/', 'a'],
    ['a///', 'a'],
    ['/a/b//', '/a/b'],
    ['https://api.github.com/', 'https://api.github.com'],
    ['a//b', 'a//b'],
  ])('trims %j to %j', (input, expected) => expect(trimTrailingSlashes(input)).toBe(expected));

  it('stays linear on many slashes that do not end the string', () => {
    const input = `${'/'.repeat(200_000)}x`;
    const start = performance.now();
    expect(trimTrailingSlashes(input)).toBe(input);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
