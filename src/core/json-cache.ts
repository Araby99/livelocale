import { readFileSync, statSync } from 'fs';

interface CacheEntry {
  mtimeMs: number;
  size: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();

/** Drops every cached parse. Exposed for tests and for tooling that rewrites locale files. */
export function clearJsonCache(): void {
  cache.clear();
}

/**
 * Reads and parses a JSON file, reusing the previous parse while the file's
 * mtime and size are unchanged. One `stat` per call replaces a full read and
 * parse on every server render. Throws like `readFileSync` / `JSON.parse` do.
 *
 * Callers must treat the returned object as read-only: it is shared between calls.
 */
export function readJsonCached(filePath: string): any {
  let mtimeMs: number | undefined;
  let size: number | undefined;
  try {
    const stat = statSync(filePath);
    if (typeof stat?.mtimeMs === 'number') {
      mtimeMs = stat.mtimeMs;
      size = stat.size;
    }
  } catch {
    // Missing file: fall through so readFileSync raises the real error.
  }

  if (mtimeMs !== undefined) {
    const hit = cache.get(filePath);
    if (hit && hit.mtimeMs === mtimeMs && hit.size === size) {
      return hit.data;
    }
  }

  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (mtimeMs !== undefined && size !== undefined) {
    cache.set(filePath, { mtimeMs, size, data });
  }
  return data;
}
