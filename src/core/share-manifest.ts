/**
 * The share manifest contract: the names inside the share folder
 * (`<base>livelocale/`) and the shape of its `manifest.json`, which `pack`
 * writes and the static Studio and `doctor` read.
 *
 * Browser-safe, as tests/unit/core-browser-safe.test.ts checks.
 */

import { isValidBranchName, isValidRepoSlug } from './change-link.js';
import { LOCALE_RE } from './validate.js';

/** The share folder under the app base. No underscore, because Jekyll drops such folders. */
export const SHARE_DIR = 'livelocale';
export const SHARE_MANIFEST_FILE = 'manifest.json';
export const SHARE_FLAG_FILE = 'flag.js';
export const SHARE_LOCALES_DIR = 'locales';
export const SHARE_MANIFEST_FORMAT = 1;

/** `flat`: one `<code>.json` per locale; `namespaced`: one folder per locale, one file per namespace. */
export type LocalesLayout = 'flat' | 'namespaced';

export interface ShareManifest {
  format: 1;
  /** GitHub `owner/name`. The key is absent unless the build sets `exposeRepo`. */
  repo?: string;
  defaultBranch: string | null;
  /** The branch the site was built from. */
  branch: string | null;
  /** The commit the site was built from: lowercase hex, 40 or 64 characters. */
  base: string | null;
  /** Repo-relative POSIX path of the locales folder, `'.'` for the root. */
  localesPath: string;
  layout: LocalesLayout;
  /** Always one of `locales`. */
  sourceLocale: string;
  /** Sorted. Each code has one file at `./locales/<code>.json`. */
  locales: string[];
  /** The app base, such as `'/'` or `'/repo/'`; null when the app uses a relative base. */
  basePath: string | null;
  /** Sorted keys found in the code by KeyScanner. */
  codeKeys: string[];
}

const BASE_SHA_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** Reads an own property only, so no field ever comes from a prototype. */
function own(obj: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key)
    ? (obj as Record<string, unknown>)[key]
    : undefined;
}

/** True for an array whose every slot passes `test`. A hole fails, which `every` would skip. */
function isArrayOf<T>(value: unknown, test: (item: unknown) => item is T): value is T[] {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) {
    if (!test(value[i])) return false;
  }
  return true;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isLocaleCode(value: unknown): value is string {
  return typeof value === 'string' && LOCALE_RE.test(value);
}

function isNullOr(value: unknown, test: (text: string) => boolean): boolean {
  return value === null || (typeof value === 'string' && test(value));
}

/**
 * True when `value` is a format-1 share manifest. Unknown fields are ignored,
 * so a newer build can add fields. Both branches must pass `isValidBranchName`,
 * the rule the change-set schema applies to a link's branch, and an empty
 * locales list fails because the source locale must be one of them.
 */
export function isShareManifest(value: unknown): value is ShareManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const repo = own(value, 'repo');
  const layout = own(value, 'layout');
  const locales = own(value, 'locales');
  const sourceLocale = own(value, 'sourceLocale');
  return (
    own(value, 'format') === SHARE_MANIFEST_FORMAT &&
    (repo === undefined || (typeof repo === 'string' && isValidRepoSlug(repo))) &&
    isNullOr(own(value, 'defaultBranch'), isValidBranchName) &&
    isNullOr(own(value, 'branch'), isValidBranchName) &&
    isNullOr(own(value, 'base'), (base) => BASE_SHA_RE.test(base)) &&
    typeof own(value, 'localesPath') === 'string' &&
    (layout === 'flat' || layout === 'namespaced') &&
    isArrayOf(locales, isLocaleCode) &&
    typeof sourceLocale === 'string' &&
    locales.includes(sourceLocale) &&
    isNullOr(own(value, 'basePath'), (path) => path.startsWith('/') && path.endsWith('/')) &&
    isArrayOf(own(value, 'codeKeys'), isString)
  );
}

/** The value itself when it is a share manifest, otherwise null (an HTML fallback page, say). */
export function parseShareManifest(value: unknown): ShareManifest | null {
  return isShareManifest(value) ? value : null;
}
