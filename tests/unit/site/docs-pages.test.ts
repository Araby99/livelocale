// @vitest-environment node
import * as fs from 'node:fs';
import { join } from 'node:path';
import { docsPageFiles } from '../../../site/src/lib/docs-config';

const DOCS = 'site/docs';
// The plan's one competitor list (Global Constraints); bare "Phrase" is allowed.
const COMPETITORS =
  /\b(Tolgee|Locize|Lokalise|Crowdin|Transifex|POEditor|Weblate|SimpleLocalize|Phrase (Strings|TMS))\b/;
const HYPE = /seamless|empower|revolutioni[sz]e|blazing|supercharge/i;

interface Page {
  file: string;
  data: Record<string, string>;
  text: string;
}

/** Reads a page and its frontmatter (flat `key: value` lines, quotes optional). */
function readPage(file: string): Page {
  const text = fs.readFileSync(join(DOCS, file), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  const data: Record<string, string> = {};
  for (const line of (match?.[1] ?? '').split(/\r?\n/)) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (pair) data[pair[1]!] = pair[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { file, data, text };
}

const pages = docsPageFiles(DOCS).map(readPage);

it('finds the docs pages', () => {
  expect(pages.length).toBeGreaterThan(0);
});

it('gives every docs page its own title and description', () => {
  const problems: string[] = [];
  for (const { file, data } of pages) {
    if (!data.title) problems.push(`${file}: no title`);
    const length = data.description?.length ?? 0;
    if (length < 50 || length > 160) problems.push(`${file}: description is ${length} characters`);
  }
  expect(problems).toEqual([]);
  const titles = pages.map((p) => p.data.title);
  const descriptions = pages.map((p) => p.data.description);
  expect(new Set(titles).size).toBe(titles.length);
  expect(new Set(descriptions).size).toBe(descriptions.length);
});

it('keeps the voice: no "PM", no hype words, no competitor names', () => {
  const problems: string[] = [];
  // The whole file, frontmatter included: the description is the search snippet.
  for (const { file, text } of pages) {
    if (/\bPM\b/.test(text)) problems.push(`${file}: PM`);
    const hype = HYPE.exec(text);
    if (hype) problems.push(`${file}: ${hype[0]}`);
    const competitor = COMPETITORS.exec(text);
    if (competitor) problems.push(`${file}: ${competitor[0]}`);
  }
  expect(problems).toEqual([]);
});
