import * as fs from 'fs';
import * as path from 'path';

/** Project file listing words, phrases and `key:` entries that `check --hardcoded` ignores. */
export const ALLOW_FILE = 'livelocale.allow';

export interface AllowList {
  /** Words and phrases, deduplicated and sorted longest first (stable). */
  words: string[];
  keys: Set<string>;
}

export const EMPTY_ALLOW: AllowList = { words: [], keys: new Set() };

const KEY_PREFIX = 'key:';

function sortWords(words: Iterable<string>): string[] {
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

export function parseAllowFile(content: string): AllowList {
  const words: string[] = [];
  const keys = new Set<string>();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith(KEY_PREFIX)) {
      const key = line.slice(KEY_PREFIX.length).trim();
      if (key) keys.add(key);
      continue;
    }
    words.push(line);
  }
  return { words: sortWords(words), keys };
}

export function readAllowList(projectDir: string, extra: string[] = []): AllowList {
  let content = '';
  try {
    content = fs.readFileSync(path.join(projectDir, ALLOW_FILE), 'utf-8');
  } catch {
    // A missing allow file means no entries.
  }
  const parsed = parseAllowFile(content);
  return { words: sortWords([...parsed.words, ...extra]), keys: parsed.keys };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces each allowed word or phrase (whole word, case-sensitive) with a space. */
export function removeAllowed(text: string, allow: AllowList): string {
  let out = text;
  for (const word of allow.words) {
    const re = new RegExp('(?<![\\p{L}\\p{N}])' + escapeRegExp(word) + '(?![\\p{L}\\p{N}])', 'gu');
    out = out.replace(re, ' ');
  }
  return out;
}
