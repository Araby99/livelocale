import { existsSync, statSync, promises as fs } from 'fs';
import * as path from 'path';
import { FLAG_SCRIPT } from '../core/flag-script.js';
import { LOCALE_RE } from '../core/validate.js';
import {
  SHARE_DIR,
  SHARE_FLAG_FILE,
  SHARE_LOCALES_DIR,
  SHARE_MANIFEST_FILE,
  SHARE_MANIFEST_FORMAT,
  type LocalesLayout,
  type ShareManifest,
} from '../core/share-manifest.js';
import { resolveBuildInfo, type GitRunner } from './build-info.js';
import { detectBuildTarget } from './build-target.js';
import { KeyScanner } from './key-scanner.js';
import { moduleDir } from './module-dir.js';
import { PackError } from './pack-error.js';
import {
  basePathOf,
  flagSrcFor,
  injectFlagScript,
  normalizeBase,
  shareUrlPathFor,
} from './share-html.js';

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

export const RELATIVE_BASE_WARNING =
  'The app base is relative (./), so flag.js is linked per HTML file. Pages served by a client-side route fallback cannot load it; build with an absolute base (--base /path/) if the app has such routes.';

export interface PackOptions extends Omit<ShareDataOptions, 'basePath'> {
  /** The build output folder: absolute, or relative to `projectDir`. */
  outDir: string;
  /** The raw app base (`/`, `/app/`, `./`). Defaults to the detected stack's base, else `/`. */
  base?: string;
  /** `'auto'` (default) skips injection for Next projects or when `<outDir>/_next` exists. */
  injectHtml?: boolean | 'auto';
  /** The built Studio. Defaults to `resolveStudioDir()`. */
  studioDir?: string;
}

export interface PackResult {
  shareDir: string;
  manifest: ShareManifest;
  /** POSIX paths relative to the output folder, sorted. */
  htmlInjected: string[];
  shareUrlPath: string;
  warnings: string[];
}

/** Where the built Studio may sit: beside the bundle in `dist/`, or `dist/studio` from source. */
export function defaultStudioCandidates(): string[] {
  const here = moduleDir();
  return [path.resolve(here, '../studio'), path.resolve(here, '../../dist/studio')];
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** The first candidate that holds a built Studio (`index.html` and `assets/`), or null. */
export function resolveStudioDir(candidates: string[] = defaultStudioCandidates()): string | null {
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'index.html')) && isDirectory(path.join(dir, 'assets'))) {
      return dir;
    }
  }
  return null;
}

/** True when `shareDir` is absent, or holds a `manifest.json` with a numeric `format`. */
async function ownsShareDir(shareDir: string): Promise<boolean> {
  try {
    await fs.lstat(shareDir);
  } catch {
    return true;
  }
  try {
    const manifest: unknown = JSON.parse(
      await fs.readFile(path.join(shareDir, SHARE_MANIFEST_FILE), 'utf-8')
    );
    return isPlainObject(manifest) && typeof manifest['format'] === 'number';
  } catch {
    return false;
  }
}

/** Every `*.html` file under `outDir` outside the share folder, skipping symlinks. POSIX, sorted. */
async function findHtmlFiles(outDir: string, shareDir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== shareDir) await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        found.push(toPosix(path.relative(outDir, full)));
      }
    }
  };
  await walk(outDir);
  return found.sort();
}

/**
 * Writes the share folder (`<outDir>/livelocale/`): the Studio, `manifest.json`, the locale
 * dictionaries and `flag.js`, then links `flag.js` from every app HTML file. Everything is
 * validated before the first write, and nothing outside the share folder is written except
 * the flag tag in HTML.
 */
export async function packOutput(options: PackOptions): Promise<PackResult> {
  const {
    outDir: outOption,
    base: baseOption,
    injectHtml = 'auto',
    studioDir: studioOption,
    ...shareOptions
  } = options;
  const projectDir = path.resolve(options.projectDir);
  const outDir = path.resolve(projectDir, outOption);
  if (!isDirectory(outDir)) {
    throw new PackError(
      'OUT_DIR_NOT_FOUND',
      `Build output not found: ${outDir}. Run your build first.`
    );
  }

  const target = detectBuildTarget(projectDir);
  const base = normalizeBase(baseOption ?? target.base ?? '/');

  const candidates =
    studioOption !== undefined
      ? [path.resolve(projectDir, studioOption)]
      : defaultStudioCandidates();
  const studioDir = resolveStudioDir(candidates);
  if (studioDir === null) {
    throw new PackError(
      'STUDIO_NOT_FOUND',
      `LiveLocale Studio files are missing from the installed package (looked in ${candidates.join(', ')}). Reinstall livelocale.`
    );
  }

  const data = await collectShareData({ ...shareOptions, projectDir, basePath: basePathOf(base) });

  const shareDir = path.join(outDir, SHARE_DIR);
  if (!(await ownsShareDir(shareDir))) {
    throw new PackError(
      'SHARE_DIR_TAKEN',
      `${toPosix(path.relative(projectDir, outDir))}/${SHARE_DIR}/ already exists and was not written by LiveLocale. Move it away and run again.`
    );
  }

  await fs.rm(shareDir, { recursive: true, force: true });
  await fs.cp(studioDir, shareDir, { recursive: true });
  await fs.writeFile(
    path.join(shareDir, SHARE_MANIFEST_FILE),
    JSON.stringify(data.manifest, null, 2) + '\n',
    'utf-8'
  );
  const localesDir = path.join(shareDir, SHARE_LOCALES_DIR);
  await fs.mkdir(localesDir, { recursive: true });
  for (const locale of data.manifest.locales) {
    await fs.writeFile(
      path.join(localesDir, `${locale}.json`),
      JSON.stringify(data.dictionaries[locale]),
      'utf-8'
    );
  }
  await fs.writeFile(path.join(shareDir, SHARE_FLAG_FILE), FLAG_SCRIPT, 'utf-8');

  const inject =
    injectHtml === 'auto'
      ? target.kind !== 'next' && !existsSync(path.join(outDir, '_next'))
      : injectHtml;
  const htmlInjected = inject ? await findHtmlFiles(outDir, shareDir) : [];
  for (const rel of htmlInjected) {
    const file = path.join(outDir, ...rel.split('/'));
    const html = await fs.readFile(file, 'utf-8');
    const injected = injectFlagScript(html, flagSrcFor(base, rel));
    if (injected !== html) await fs.writeFile(file, injected, 'utf-8');
  }

  const warnings = [...data.warnings];
  if (base.kind === 'relative') warnings.push(RELATIVE_BASE_WARNING);

  return {
    shareDir,
    manifest: data.manifest,
    htmlInjected,
    shareUrlPath: shareUrlPathFor(base),
    warnings,
  };
}
