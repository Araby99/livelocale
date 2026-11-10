import * as fs from 'fs';
import * as path from 'path';
import { LOCALE_RE } from './validate.js';

/**
 * Where projects keep their locale files, in the order the CLI tries them when `--locales` is
 * not given: `locales/` (the LiveLocale default), `messages/` (next-intl), then the react-i18next
 * and Vite conventions.
 */
export const LOCALES_CANDIDATES = [
  'locales',
  'messages',
  'src/locales',
  'public/locales',
  'src/i18n/locales',
  'src/messages',
];

/** The default when no candidate holds a locale file, so the error names a folder. */
export const DEFAULT_LOCALES_PATH = 'locales';

function readEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function holdsJson(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((name) => name.endsWith('.json'));
  } catch {
    return false;
  }
}

/** True when `dir` holds an `<locale>.json` file or a `<locale>/` folder with a `*.json` in it. */
export function holdsLocaleJson(dir: string): boolean {
  return readEntries(dir).some((entry) => {
    if (entry.isFile()) {
      return entry.name.endsWith('.json') && LOCALE_RE.test(entry.name.slice(0, -5));
    }
    return (
      entry.isDirectory() && LOCALE_RE.test(entry.name) && holdsJson(path.join(dir, entry.name))
    );
  });
}

/** The first of LOCALES_CANDIDATES under `projectDir` that holds a locale file, else null. */
export function findLocalesFolder(projectDir: string): string | null {
  return LOCALES_CANDIDATES.find((rel) => holdsLocaleJson(path.join(projectDir, rel))) ?? null;
}

/**
 * The locales path a command uses: `--locales` as given, else the detected folder
 * (`detected: true` when it is not `locales`, so the command can say which one it picked),
 * else `locales`.
 */
export function resolveLocalesPath(
  projectDir: string,
  given: string | undefined
): { path: string; detected: boolean } {
  if (given !== undefined) return { path: given, detected: false };
  const found = findLocalesFolder(projectDir);
  // The default needs no notice: it is what the command used before detection existed.
  return found === null || found === DEFAULT_LOCALES_PATH
    ? { path: DEFAULT_LOCALES_PATH, detected: false }
    : { path: found, detected: true };
}

/**
 * The entries of a locales folder that look like locale data but are skipped for their name:
 * `*.json` files and folders holding a `*.json`, whose name is not a locale code. Folders end in
 * `/`. Hidden entries are left out. Commands print these so a locale is never ignored silently.
 */
export function skippedLocaleEntries(localesDir: string): string[] {
  const skipped: string[] = [];
  for (const entry of readEntries(localesDir)) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isFile()) {
      if (entry.name.endsWith('.json') && !LOCALE_RE.test(entry.name.slice(0, -5))) {
        skipped.push(entry.name);
      }
    } else if (
      entry.isDirectory() &&
      !LOCALE_RE.test(entry.name) &&
      holdsJson(path.join(localesDir, entry.name))
    ) {
      skipped.push(`${entry.name}/`);
    }
  }
  return skipped.sort();
}
