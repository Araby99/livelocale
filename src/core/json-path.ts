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
      `[i18n-lens] Key depth limit exceeded. Maximum depth is ${MAX_KEY_DEPTH} levels.`
    );
  }

  if (keys.some((k) => DANGEROUS_KEY_SEGMENTS.has(k))) {
    throw new Error(
      `[i18n-lens] Forbidden key segment in path: "${keyPath}". Segment names like __proto__, constructor, and prototype are not allowed.`
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
