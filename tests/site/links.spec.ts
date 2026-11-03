import * as fs from 'node:fs';
import { posix } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  ALLOWED_EXTERNAL,
  classifyLink,
  extractIds,
  extractLinks,
} from '../../site/scripts/docs/links.mjs';

// The link guard: reads the built landing page and every built docs page from disk (the suite's
// web server has just built them) and checks every link on them.
const ORIGIN = 'http://localhost:4173';
const BASE = '/livelocale/';
const DIST = 'site/dist';

/** The built pages, as paths under DIST with forward slashes. */
function pages(): string[] {
  const docs = fs
    .readdirSync(posix.join(DIST, 'docs'), { recursive: true, encoding: 'utf8' })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.html'))
    .map((file) => `docs/${file}`)
    .sort();
  return ['index.html', ...docs];
}

/** Every link on every built page, with the page it is on. */
function links(): { page: string; href: string; kind: ReturnType<typeof classifyLink> }[] {
  return pages().flatMap((page) => {
    const html = fs.readFileSync(posix.join(DIST, page), 'utf8');
    return extractLinks(html).map((href) => ({
      page,
      href,
      kind: classifyLink(href, `${ORIGIN}${BASE}${page}`, BASE, DIST),
    }));
  });
}

const ids = new Map<string, Set<string>>();
function idsOf(file: string): Set<string> {
  let found = ids.get(file);
  if (!found) {
    found = extractIds(fs.readFileSync(file, 'utf8'));
    ids.set(file, found);
  }
  return found;
}

test('finds no broken link or anchor in the built site', () => {
  const all = links();
  expect(all.some(({ kind }) => kind.kind === 'internal')).toBe(true);
  const failures = all
    .filter(({ kind }) => {
      if (kind.kind !== 'internal') return false;
      if (!fs.existsSync(kind.file) || !fs.statSync(kind.file).isFile()) return true;
      return kind.hash !== '' && !idsOf(kind.file).has(kind.hash);
    })
    .map(({ page, href }) => `${page} -> ${href}`);
  expect(failures).toEqual([]);
});

test('links nowhere outside the allowed hosts', () => {
  const failures = links()
    .filter(
      ({ kind }) => kind.kind === 'external' && !ALLOWED_EXTERNAL.some((r) => r.test(kind.url))
    )
    .map(({ page, href }) => `${page} -> ${href}`);
  expect(failures).toEqual([]);
});
