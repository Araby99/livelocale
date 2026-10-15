// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseGitignore } from '../../src/core/gitignore.js';

describe('parseGitignore', () => {
  const matcher = parseGitignore(`
# comment
generated/
*.log
/build
**/tmp
docs/**/*.snap
!keep.log
  `);

  it('ignores directories by trailing-slash patterns anywhere in the tree', () => {
    expect(matcher.ignores('generated', true)).toBe(true);
    expect(matcher.ignores('packages/web/generated', true)).toBe(true);
    expect(matcher.ignores('generated', false)).toBe(false);
  });

  it('ignores files by extension glob anywhere in the tree', () => {
    expect(matcher.ignores('debug.log', false)).toBe(true);
    expect(matcher.ignores('a/b/debug.log', false)).toBe(true);
    expect(matcher.ignores('debug.txt', false)).toBe(false);
  });

  it('anchors leading-slash patterns to the root', () => {
    expect(matcher.ignores('build', true)).toBe(true);
    expect(matcher.ignores('src/build', true)).toBe(false);
  });

  it('supports ** segments', () => {
    expect(matcher.ignores('x/y/tmp', true)).toBe(true);
    expect(matcher.ignores('docs/a/b/c.snap', false)).toBe(true);
    expect(matcher.ignores('src/a/b/c.snap', false)).toBe(false);
  });

  it('honours negation for later rules', () => {
    expect(matcher.ignores('keep.log', false)).toBe(false);
  });

  it('treats an empty file as ignoring nothing', () => {
    expect(parseGitignore('').ignores('anything', false)).toBe(false);
  });
});
