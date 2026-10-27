import { promises as fs } from 'fs';
import * as path from 'path';
import { LOCALE_RE } from '../core/validate.js';
import {
  SHARE_MANIFEST_FORMAT,
  type LocalesLayout,
  type ShareManifest,
} from '../core/share-manifest.js';
import { resolveBuildInfo, type GitRunner } from './build-info.js';
import { KeyScanner } from './key-scanner.js';
import { PackError } from './pack-error.js';

export interface ShareDataOptions {
  projectDir: string;
  /** The locales folder, relative to `projectDir`. Defaults to `locales`. */
  localesPath?: string;
  sourceLocale?: string;
  exposeRepo?: boolean;
  basePath: string | null;
  env?: NodeJS.ProcessEnv;
  git?: GitRunner;
}

export interface ShareData {
  manifest: ShareManifest;
  /** Each locale's merged nested dictionary; namespaces are top-level keys. */
  dictionaries: Record<string, Record<string, unknown>>;
  warnings: string[];
}

const NO_REPO_WARNING =
  'exposeRepo is on but no GitHub repository was found; the manifest has no repo.';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toPosix(relative: string): string {
  return relative.split(path.sep).join('/') || '.';
}

/** True when `child` is `parent` or inside it. */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Sets an own property, so a `__proto__` name never reaches the prototype. */
function defineOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Reads one JSON file whose root must be a plain object. Never goes through FileMutator. */
async function readJsonObject(file: string, projectDir: string): Promise<Record<string, unknown>> {
  const shown = toPosix(path.relative(projectDir, file));
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch (error) {
    throw new PackError(
      'INVALID_LOCALE_FILE',
      `${shown} is not a JSON object: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!isPlainObject(parsed)) {
    const kind = Array.isArray(parsed) ? 'an array' : parsed === null ? 'null' : typeof parsed;
    throw new PackError(
      'INVALID_LOCALE_FILE',
      `${shown} is not a JSON object: the root is ${kind}`
    );
  }
  return parsed;
}

/**
 * Collects what the share folder needs: the manifest (build info, locales,
 * layout, code keys) and every locale's dictionary, read straight from disk.
 */
export async function collectShareData(options: ShareDataOptions): Promise<ShareData> {
  const projectDir = path.resolve(options.projectDir);
  const localesDir = path.resolve(projectDir, options.localesPath ?? 'locales');
  const warnings: string[] = [];

  let entries;
  try {
    if (!(await fs.stat(localesDir)).isDirectory()) throw new Error('not a directory');
    entries = await fs.readdir(localesDir, { withFileTypes: true });
  } catch {
    throw new PackError(
      'LOCALES_NOT_FOUND',
      `Locales directory not found: ${localesDir}. Pass --locales <path>.`
    );
  }

  const dirLocales = new Set<string>();
  const fileLocales = new Set<string>();
  for (const entry of entries) {
    if (entry.isDirectory() && LOCALE_RE.test(entry.name)) {
      dirLocales.add(entry.name);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const code = entry.name.slice(0, -'.json'.length);
      if (LOCALE_RE.test(code)) fileLocales.add(code);
    }
  }
  const locales = [...new Set([...dirLocales, ...fileLocales])].sort();
  if (locales.length === 0) {
    throw new PackError(
      'NO_LOCALES',
      `No locale files in ${localesDir} (expected en.json or en/*.json).`
    );
  }
  const layout: LocalesLayout = dirLocales.size > 0 ? 'namespaced' : 'flat';

  const sourceLocale = options.sourceLocale ?? (locales.includes('en') ? 'en' : locales[0]!);
  if (!locales.includes(sourceLocale)) {
    throw new PackError(
      'SOURCE_LOCALE_NOT_FOUND',
      `Source locale "${sourceLocale}" not found in ${localesDir} (found: ${locales.join(', ')}).`
    );
  }

  const dictionaries: Record<string, Record<string, unknown>> = {};
  for (const locale of locales) {
    let dictionary: Record<string, unknown>;
    if (dirLocales.has(locale)) {
      dictionary = {};
      const folder = path.join(localesDir, locale);
      const files = (await fs.readdir(folder, { withFileTypes: true }))
        .filter((file) => file.isFile() && file.name.endsWith('.json'))
        .map((file) => file.name)
        .sort();
      for (const file of files) {
        const namespace = file.slice(0, -'.json'.length);
        defineOwn(dictionary, namespace, await readJsonObject(path.join(folder, file), projectDir));
      }
    } else {
      dictionary = await readJsonObject(path.join(localesDir, `${locale}.json`), projectDir);
    }
    defineOwn(dictionaries, locale, dictionary);
  }

  const info = await resolveBuildInfo({
    cwd: projectDir,
    env: options.env,
    git: options.git,
    includeRepo: options.exposeRepo === true,
  });
  const root =
    info.gitRoot !== null && isInside(info.gitRoot, localesDir) ? info.gitRoot : projectDir;
  const codeKeys = await new KeyScanner({ requireEnabled: false }).scanSourceKeys(projectDir);

  if (options.exposeRepo === true && info.repo === null) warnings.push(NO_REPO_WARNING);

  const manifest: ShareManifest = {
    format: SHARE_MANIFEST_FORMAT,
    ...(options.exposeRepo === true && info.repo !== null ? { repo: info.repo } : {}),
    defaultBranch: info.defaultBranch,
    branch: info.branch,
    base: info.base,
    localesPath: toPosix(path.relative(root, localesDir)),
    layout,
    sourceLocale,
    locales,
    basePath: options.basePath,
    codeKeys: [...codeKeys].sort(),
  };

  return { manifest, dictionaries, warnings };
}
