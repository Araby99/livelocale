// @vitest-environment node
// The one page written for the person who fixes or translates text on a share link (marketing,
// translators, clients), not for the developer who set the link up. It speaks the Studio's own
// words, so it reads them from the catalogue and fails when a label it names changes.
import * as fs from 'node:fs';
import { SIDEBAR } from '../../../site/src/lib/docs-config';
import { en } from '../../../src/studio/i18n/en';

const DOCS = 'site/docs';
const FILE = 'guides/fix-text.md';

function page(file: string): string {
  return fs.readFileSync(`${DOCS}/${file}`, 'utf8');
}

const md = page(FILE);
/** The page without its frontmatter, with whitespace collapsed so wrapped sentences match. */
const body = md.replace(/^---[\s\S]*?\n---\r?\n/, '');
const prose = body.replace(/\s+/g, ' ');

/** The `## ` headings of a page, in order. */
function sections(text: string): string[] {
  return [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
}

/** The text of a `## heading` section, up to the next `## `. */
function section(heading: string): string {
  return (body.split(`\n## ${heading}\n`)[1]?.split(/^## /m)[0] ?? '').replace(/\s+/g, ' ');
}

/** A catalogue string with its `{placeholders}` cut off, as the page quotes it. */
function label(key: keyof typeof en): string {
  const value = en[key];
  if (typeof value !== 'string') throw new Error(`${key} is not a plain string`);
  return value.split(/\s*[·{]/)[0]!.trim();
}

it('sits in the guides right after the share links guide', () => {
  const guides = SIDEBAR.find((g) => g.text === 'Guides')!.items.map((i) => i.link);
  const at = guides.indexOf('/guides/share-links');
  expect(guides[at + 1]).toBe('/guides/fix-text');
});

it('walks through the job in order', () => {
  expect(md).toMatch(/^# Fix text with a share link$/m);
  expect(sections(body)).toEqual([
    'Open the link',
    'Pick a text',
    'Fix it and save',
    'Find what is still missing',
    'Numbers and placeholders',
    'Send to developer',
    'After you send',
    'On a phone',
  ]);
});

it('has no code and no developer words', () => {
  expect(body).not.toMatch(/^\s*(```|~~~)/m);
  expect(body).not.toMatch(/`/);
  const jargon =
    /\b(git|commit|branch|repo|repository|merge|JSON|locale|key|keys|namespace|CLI|npx|terminal|iframe|ICU|deploy\w*)\b/i;
  expect(jargon.exec(prose)?.[0]).toBeUndefined();
  // One sentence, and only one, says how the developer receives the changes.
  expect(prose.match(/pull request/g)).toHaveLength(1);
});

it('uses the Studio labels as the Studio shows them now', () => {
  for (const key of [
    'touch.edit',
    'touch.browse',
    'editor.key',
    'editor.save',
    'editor.save_anyway',
    'editor.keep_editing',
    'editor.locale',
    'header.coverage',
    'keys.title',
    'keys.missing',
    'phone.next_missing',
    'header.changes',
    'header.send',
    'send.copy',
    'send.share',
    'send.download',
    'draft_list.status_unsent',
    'draft_list.status_sent',
    'draft_list.status_live',
    'draft_list.download',
    'draft_list.restore',
    'editor.edit_raw',
  ] as const) {
    expect(prose, key).toContain(`**${label(key)}`);
  }
  // Labels the Studio no longer shows.
  for (const old of [
    'Save Changes',
    'Locale Directory',
    'Translation Key',
    'Fallback Value',
    'Translation Output',
    'Reload Frame',
    'All Keys',
    'Page Keys',
  ]) {
    expect(prose, old).not.toContain(old);
  }
});

it('repeats the first-visit tips, since the Studio shows them only once', () => {
  const open = section('Open the link');
  expect(open).toMatch(/only on your first visit/);
  expect(open).toContain('this page');
});

it('explains plural forms and placeholders in plain words', () => {
  const words = section('Numbers and placeholders');
  expect(words).toContain('**#**');
  expect(words).toContain('{name}');
  expect(words).toMatch(/needed for Arabic/);
  expect(words).toMatch(/Keep each placeholder/i);
});

it('says Save keeps the change in this browser and Send hands it over', () => {
  expect(section('Fix it and save')).toMatch(/in this browser/);
  const after = section('After you send');
  expect(after).toContain(`**${label('draft_list.status_sent')}**`);
  expect(after).toContain(`**${label('draft_list.status_live')}**`);
});

it('is linked from the share links steps and the docs home', () => {
  const steps = page('guides/share-links.md').split('\n## What the person fixing text does\n')[1]!;
  expect(steps.split(/^## /m)[0]).toContain('(./fix-text.md)');
  const next = page('index.md').split(/^## What next$/m)[1]!;
  expect(next).toContain('(./guides/fix-text.html)');
});
