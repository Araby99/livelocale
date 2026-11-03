// @vitest-environment node
import * as fs from 'node:fs';

const DOCS = 'site/docs';

function page(file: string): string {
  return fs.readFileSync(`${DOCS}/${file}`, 'utf8');
}

/** The `## ` headings of a page, in order, skipping fenced code. */
function sections(md: string): string[] {
  const headings: string[] = [];
  let fence: string | null = null;
  for (const line of md.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence === null && line.startsWith('## ')) headings.push(line.slice(3).trim());
  }
  return headings;
}

it.each([
  [
    'guides/share-links.md',
    [
      'Set up',
      'The one-checkbox setting',
      'What the person fixing text does',
      'What the developer gets',
      'Other git hosts',
      'Hosting notes',
    ],
  ],
  [
    'guides/ci-check.md',
    [
      'Run the check',
      'Find hardcoded text',
      'The three kinds',
      'Strict mode',
      'Opt-outs',
      'GitHub Actions',
      'What it does not see',
    ],
  ],
])('%s covers its sections in order', (file, headings) => {
  expect(sections(page(file))).toEqual(headings);
});

it('names every opt-out the check accepts', () => {
  const md = page('guides/ci-check.md');
  for (const optOut of [
    'livelocale-ignore-next-line',
    'livelocale-ignore-file',
    '--allow',
    'livelocale.allow',
    '--strict',
  ]) {
    expect(md).toContain(optOut);
  }
});
