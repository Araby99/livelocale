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
  [
    'guides/studio.md',
    [
      'Edit',
      'Review and commit',
      'Plural forms',
      'Placeholder safety',
      'Light and dark',
      'Arabic and right to left',
      'Keyboard',
    ],
  ],
  [
    'guides/preview-mode.md',
    [
      'How it fits together',
      'Set up the server',
      'Set the environment',
      'Open the Studio on the preview',
      'Check the deployment',
      'Behaviour worth knowing',
      'What preview mode does not do',
    ],
  ],
  [
    'guides/teams.md',
    [
      'App on another port or hostname',
      'Studio away from localhost',
      'A Content-Security-Policy blocks the iframe',
      'Auth middleware redirects the API',
      'Namespaced hooks',
      'Monorepos',
      'Not sure which applies',
    ],
  ],
  [
    'guides/migrate.md',
    [
      'Install the new package',
      'Rename the exports',
      'Move the API route',
      'Rename the environment variables',
      'Use the new CLI',
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
