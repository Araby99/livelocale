import { DANGEROUS_KEY_SEGMENTS } from './validate.js';

/** RULE SRV-003: deeper key paths are rejected to keep recursion bounded. */
export const MAX_KEY_DEPTH = 30;

/**
 * Sets `value` at the dot-separated `keyPath` inside `obj`, creating
 * intermediate objects as needed. Rejects paths deeper than `MAX_KEY_DEPTH`
 * and any segment that could pollute `Object.prototype` (RULE SEC-005).
 */
export function setNestedProperty(obj: Record<string, any>, keyPath: string, value: string): void {
  const keys = keyPath.split('.');

  if (keys.length > MAX_KEY_DEPTH) {
    throw new Error(
      `[livelocale] Key depth limit exceeded. Maximum depth is ${MAX_KEY_DEPTH} levels.`
    );
  }

  if (keys.some((k) => DANGEROUS_KEY_SEGMENTS.has(k))) {
    throw new Error(
      `[livelocale] Forbidden key segment in path: "${keyPath}". Segment names like __proto__, constructor, and prototype are not allowed.`
    );
  }

  let current = obj;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;

    if (i === keys.length - 1) {
      current[key] = value;
      return;
    }

    if (
      !(key in current) ||
      current[key] === null ||
      typeof current[key] !== 'object' ||
      Array.isArray(current[key])
    ) {
      current[key] = {};
    }

    current = current[key];
  }
}

/** The outcome of reading a dotted key without writing to it. */
export type KeyLookup =
  | { state: 'string'; value: string }
  | { state: 'missing' }
  | { state: 'occupied' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Reads the string at the dot-separated `keyPath` inside `dict` through own
 * properties only, following the same nested walk `setNestedProperty` writes
 * through.
 *
 * - `string`: the path leads to a string value.
 * - `missing`: a segment is absent, or `dict` is not a plain object. Writing
 *   here creates the key.
 * - `occupied`: a write would overwrite data or create a duplicate the app
 *   never reads. That is an intermediate value that is not a plain object, a
 *   final value that is not a string, or, at any level, an own property named
 *   exactly like the rest of the dotted path (a literal key such as `"a.b"`).
 */
export function lookupKey(dict: unknown, keyPath: string): KeyLookup {
  if (!isPlainObject(dict)) return { state: 'missing' };

  const segments = keyPath.split('.');
  const leaf = segments.length - 1;
  let current = dict;

  for (let i = 0; i < leaf; i++) {
    if (hasOwn(current, segments.slice(i).join('.'))) return { state: 'occupied' };

    const segment = segments[i]!;
    if (!hasOwn(current, segment)) return { state: 'missing' };

    const next = current[segment];
    if (!isPlainObject(next)) return { state: 'occupied' };
    current = next;
  }

  const key = segments[leaf]!;
  if (!hasOwn(current, key)) return { state: 'missing' };

  const value = current[key];
  return typeof value === 'string' ? { state: 'string', value } : { state: 'occupied' };
}

/**
 * Detects the indentation unit of an existing JSON document so rewrites keep
 * the project's style (tabs, 2 or 4 spaces). Defaults to two spaces.
 */
export function detectJsonIndent(content: string): string {
  const match = /^([ \t]+)"/m.exec(content);
  if (!match) return '  ';
  const ws = match[1]!;
  return ws.includes('\t') ? '\t' : ws;
}

/**
 * Serializes `data` the way the original `content` was formatted: same
 * indentation unit and the same presence or absence of a trailing newline.
 * New documents get two spaces and a trailing newline.
 */
export function stringifyLike(data: unknown, content: string | null): string {
  const indent = content === null ? '  ' : detectJsonIndent(content);
  const trailing = content === null || content.endsWith('\n') ? '\n' : '';
  return JSON.stringify(data, null, indent) + trailing;
}

/** Flattens a nested dictionary into dot-separated leaf keys. */
export function flattenKeys(obj: unknown, prefix = '', out: Set<string> = new Set()): Set<string> {
  if (!obj || typeof obj !== 'object') return out;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenKeys(value, full, out);
    } else {
      out.add(full);
    }
  }
  return out;
}
