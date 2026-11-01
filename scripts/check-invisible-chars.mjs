// Fails when a raw invisible character sits in src/ or tests/: zero-width space/non-joiner/joiner
// (U+200B-200D), bidi embedding and override controls (U+202A-202E), bidi isolates (U+2066-2069)
// and the byte-order mark (U+FEFF). Reviewers cannot see them (the Trojan Source pattern), and a
// tool that strips them silently changes a regex or a test string. Write them as \u escapes.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['src', 'tests'];
const SKIP_DIRS = new Set(['node_modules', 'dist']);
const INVISIBLE_RE = /[​-‍‪-‮⁦-⁩﻿]/g;

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* files(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

const hits = [];
for (const dir of DIRS) {
  for (const path of files(join(ROOT, dir))) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const match of line.matchAll(INVISIBLE_RE)) {
        const code = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        const file = relative(ROOT, path).split(sep).join('/');
        hits.push(`${file}:${i + 1}:${match.index + 1}: raw U+${code}`);
      }
    });
  }
}

if (hits.length > 0) {
  console.error('Raw invisible characters found; write them as \\u escapes instead:');
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
