import * as path from 'path';
import { isSafeLocaleSegment } from './validate.js';

/**
 * Resolves a locale code to a safe `{locale}.json` path inside `basePath`,
 * rejecting path traversal attempts.
 */
export function resolveSafeLocalePath(basePath: string, locale: string): string {
  if (!isSafeLocaleSegment(locale)) {
    throw new Error('Path traversal attempt');
  }
  const resolvedBasePath = path.resolve(basePath);
  const filePath = path.resolve(resolvedBasePath, `${locale}.json`);
  if (!filePath.startsWith(resolvedBasePath)) {
    throw new Error('Path traversal attempt');
  }
  return filePath;
}
