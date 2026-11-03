// The changelog page: site/docs/reference/changelog.md holds only a marker, and the build puts
// CHANGELOG.md in its place, so the page always matches the file a release writes.
import { readFileSync } from 'node:fs';
import type { MarkdownRenderer as MarkdownIt } from 'vitepress';

/** The comment a docs page carries where the changelog goes. */
export const CHANGELOG_MARKER = '<!-- @changelog -->';

/**
 * The changelog from its first release heading (`## [`) on. The preamble's links to
 * keepachangelog.com and semver.org are outside the docs' allowed hosts, so they are left out.
 */
export function changelogBody(md: string): string {
  const start = /^## \[/m.exec(md);
  if (!start) throw new Error('CHANGELOG.md has no "## [" release heading');
  return md.slice(start.index);
}

/** Replaces the marker on any page with `changelogBody` of `file`, read on every render. */
export function changelogPage(md: MarkdownIt, opts: { file: string }): void {
  md.core.ruler.before('normalize', 'livelocale-changelog', (state) => {
    if (!state.src.includes(CHANGELOG_MARKER)) return;
    const body = changelogBody(readFileSync(opts.file, 'utf8'));
    state.src = state.src.replace(CHANGELOG_MARKER, () => body);
  });
}
