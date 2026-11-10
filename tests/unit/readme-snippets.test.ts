// @vitest-environment node
import * as fs from 'node:fs';

// Both READMEs: the long one on main and the short one site/launch/README.md swaps in. A snippet
// someone copies from either has to work where they paste it.
const READMES = ['README.md', 'site/launch/README.md'].filter((file) => fs.existsSync(file));

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

/** The ts/tsx/js/jsx fenced blocks of a Markdown file. */
function codeBlocks(md: string): string[] {
  return [...md.matchAll(/^```(?:tsx?|jsx?)\n([\s\S]*?)^```/gm)].map((m) => m[1]);
}

it.each(READMES)('%s names an import for wrapNextIntl that works in a Server Component', (file) => {
  // livelocale/client is a 'use client' module, so a Server Component (the default page in the
  // App Router) cannot call it. livelocale/wrap works in Server and Client Components.
  const md = read(file);
  for (const paragraph of md.split(/\n\s*\n/)) {
    if (!paragraph.includes('wrapNextIntl(')) continue;
    expect(paragraph, paragraph).toContain('livelocale/wrap');
  }
});

it.each(READMES)('%s imports wrapTranslationEngine in every snippet that calls it', (file) => {
  for (const block of codeBlocks(read(file))) {
    if (!block.includes('wrapTranslationEngine(')) continue;
    expect(block, block).toMatch(
      /import \{[^}]*\bwrapTranslationEngine\b[^}]*\} from 'livelocale\/(?:wrap|client)';/
    );
  }
});

it('points the README questions link at the Questions section', () => {
  const md = read('README.md');
  const link = /\[Questions[^\]]*\]\(CONTRIBUTING\.md#([\w-]+)\)/.exec(md);
  expect(link?.[1]).toBe('questions');
  expect(read('CONTRIBUTING.md')).toMatch(/^## Questions$/m);
});
