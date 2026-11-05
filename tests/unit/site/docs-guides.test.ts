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
      'Go to a page',
      'Plural forms',
      'Placeholder safety',
      'Light and dark',
      'Right-to-left sites',
      'Keyboard',
      'On a phone',
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
    'guides/ai-agents.md',
    [
      'What the skill does',
      'Install it in Claude Code',
      'Use it with other agents',
      'Docs for agents that read them',
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

it('shows editing from a phone in the Studio guide', () => {
  const md = page('guides/studio.md');
  const phone = md.slice(md.indexOf('## On a phone'));
  expect(phone).toContain('<DocShot name="studio-phone"');
  for (const word of ['**Edit**', '**Browse**', '**Share link…**', '**Next missing']) {
    expect(phone).toContain(word);
  }
});

it('never says a share link only views on a phone', () => {
  const pages = [
    'how-it-works/risks-and-limits.md',
    'guides/studio.md',
    'guides/share-links.md',
    'start/static-host.md',
  ];
  for (const file of pages) {
    const prose = page(file).replace(/\s+/g, ' ');
    expect(prose, file).not.toMatch(/desktop only|can only view|in a desktop browser/i);
  }
});
