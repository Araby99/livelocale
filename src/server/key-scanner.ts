import { promises as fs } from 'fs';
import * as path from 'path';
import { isSafeLocaleSegment } from '../core/validate.js';
import { getDisabledReason } from '../core/env.js';
import { parseGitignore, type GitignoreMatcher } from '../core/gitignore.js';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'coverage',
  'test-results',
  'out',
  '.idea',
  '.vscode',
  '.turbo',
  '.cache',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Files above this size are almost certainly bundles or fixtures, not components. */
const MAX_SOURCE_BYTES = 1_000_000;

const PROP_RE = /\bt(?:\??\.[a-zA-Z0-9_]+)+/g;
const IGNORE_PROPS = new Set([
  'toString',
  'length',
  'constructor',
  'prototype',
  'map',
  'forEach',
  'filter',
  'reduce',
  'call',
  'apply',
  'bind',
  'name',
  'displayName',
  'raw',
  'rich',
  'markup',
  'has',
]);

const KEY_SHAPE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const DECL = String.raw`(?:const|let|var)\s+`;
/** A string literal in any quote style; read the value with `stringArg(match)`. */
const STR = String.raw`(?:'(?<s1>[^']*)'|"(?<s2>[^"]*)"|\x60(?<s3>[^\x60]*)\x60)`;
const stringArg = (m: RegExpMatchArray): string | undefined =>
  m.groups?.['s1'] ?? m.groups?.['s2'] ?? m.groups?.['s3'];

/** Translator-method names whose first argument is a key. */
const METHODS = String.raw`(?:\.(?:rich|raw|markup|has))?`;

/**
 * Maps translator variable names to their key prefix (namespace) from the
 * declarations in a file:
 *   const t = useTranslations('home')            // next-intl (also getTranslations, await)
 *   const { t } = useTranslation('auth')          // react-i18next
 *   const t = wrapTranslationEngine(x, { keyPrefix: 'auth' })
 *   const t = wrapNextIntl(x, 'checkout')
 * Scope is not tracked; the last declaration of a name in the file wins.
 */
function namespaceBindings(content: string): Map<string, string> {
  const map = new Map<string, string>();

  const hookRe = new RegExp(
    DECL +
      String.raw`(?<name>\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:` +
      STR +
      String.raw`)?\s*\)`,
    'g'
  );
  for (const m of content.matchAll(hookRe)) map.set(m.groups!['name']!, stringArg(m) ?? '');

  const wrapNextIntlRe = new RegExp(
    DECL + String.raw`(?<name>\w+)\s*=\s*wrapNextIntl\([^;]*?,\s*` + STR + String.raw`\s*\)`,
    'g'
  );
  for (const m of content.matchAll(wrapNextIntlRe)) {
    map.set(m.groups!['name']!, stringArg(m) ?? '');
  }

  const wrapEngineRe = new RegExp(
    DECL + String.raw`(?<name>\w+)\s*=\s*wrapTranslationEngine\([^;]*?keyPrefix:\s*` + STR,
    'g'
  );
  for (const m of content.matchAll(wrapEngineRe)) {
    map.set(m.groups!['name']!, stringArg(m) ?? '');
  }

  const i18nextRe = new RegExp(
    DECL + String.raw`\{(?<bindings>[^}]*)\}\s*=\s*useTranslation\(\s*(?:` + STR + String.raw`)?`,
    'g'
  );
  for (const m of content.matchAll(i18nextRe)) {
    const binding = /\bt\s*(?::\s*(\w+))?/.exec(m.groups!['bindings']!);
    if (binding) map.set(binding[1] ?? 't', stringArg(m) ?? '');
  }

  return map;
}

/** Extracts translation key references from one source file's text. */
export function extractKeys(content: string): string[] {
  const keys = new Set<string>();
  const bindings = namespaceBindings(content);
  const translators = new Set<string>(['t', ...bindings.keys()]);

  for (const name of translators) {
    const prefix = bindings.get(name) ?? '';
    const callRe = new RegExp(String.raw`\b` + name + METHODS + String.raw`\(\s*` + STR, 'g');
    for (const m of content.matchAll(callRe)) {
      const key = stringArg(m);
      if (!key || key.includes('${') || !KEY_SHAPE.test(key)) continue;
      keys.add(prefix ? `${prefix}.${key}` : key);
    }
  }

  let match: RegExpExecArray | null;
  PROP_RE.lastIndex = 0;
  while ((match = PROP_RE.exec(content)) !== null) {
    const clean = match[0].replace(/\bt/, '').replace(/\?/g, '');
    const segments = clean
      .split('.')
      .map((seg) => seg.trim())
      .filter(Boolean);
    if (segments.length > 0 && !segments.some((seg) => IGNORE_PROPS.has(seg))) {
      keys.add(segments.join('.'));
    }
  }

  return Array.from(keys).sort();
}

interface CachedFile<T> {
  mtimeMs: number;
  size: number;
  value: T;
}

const NO_IGNORES: GitignoreMatcher = { ignores: () => false };

/**
 * Read-only analysis of translation keys: scans the codebase for `t(...)`
 * references and compiles the set of keys present in locale files.
 *
 * Scans are incremental: each source file's extracted keys are cached by
 * mtime and size, so a rescan only re-reads files that changed. The project's
 * root `.gitignore` is honoured in addition to the built-in ignore list.
 */
export class KeyScanner {
  private fileCache = new Map<string, CachedFile<string[]>>();
  private gitignoreCache: CachedFile<GitignoreMatcher> | null = null;

  private assertEnabled(): void {
    const reason = getDisabledReason();
    if (reason !== null) {
      throw new Error(
        `[i18n-lens] KeyScanner can only be executed in development mode (${reason}).`
      );
    }
  }

  private async loadGitignore(projectRoot: string): Promise<GitignoreMatcher> {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    let stat;
    try {
      stat = await fs.stat(gitignorePath);
    } catch {
      this.gitignoreCache = null;
      return NO_IGNORES;
    }
    const hit = this.gitignoreCache;
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return hit.value;
    }
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const matcher = parseGitignore(content);
      this.gitignoreCache = { mtimeMs: stat.mtimeMs, size: stat.size, value: matcher };
      return matcher;
    } catch {
      return NO_IGNORES;
    }
  }

  /**
   * Scans the project (the parent directory of `basePath`) for translation key references.
   */
  async scanCodebaseKeys(basePath: string): Promise<string[]> {
    this.assertEnabled();

    const resolvedBasePath = path.resolve(basePath);
    const projectRoot = path.dirname(resolvedBasePath);
    const gitignore = await this.loadGitignore(projectRoot);
    const keysSet = new Set<string>();
    const seen = new Set<string>();

    const toRel = (fullPath: string) =>
      path.relative(projectRoot, fullPath).split(path.sep).join('/');

    const scanDir = async (dir: string): Promise<void> => {
      let items;
      try {
        items = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          if (IGNORE_DIRS.has(item.name)) continue;
          if (gitignore.ignores(toRel(fullPath), true)) continue;
          await scanDir(fullPath);
          continue;
        }

        if (!item.isFile()) continue;
        if (!SOURCE_EXTENSIONS.has(path.extname(item.name))) continue;
        if (item.name.endsWith('.d.ts')) continue;
        if (gitignore.ignores(toRel(fullPath), false)) continue;

        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }
        if (stat.size > MAX_SOURCE_BYTES) continue;

        seen.add(fullPath);
        const cached = this.fileCache.get(fullPath);
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
          for (const k of cached.value) keysSet.add(k);
          continue;
        }

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const keys = extractKeys(content);
          this.fileCache.set(fullPath, { mtimeMs: stat.mtimeMs, size: stat.size, value: keys });
          for (const k of keys) keysSet.add(k);
        } catch {}
      }
    };

    await scanDir(projectRoot);

    // Forget files that disappeared so the cache cannot grow without bound.
    for (const cachedPath of this.fileCache.keys()) {
      if (!seen.has(cachedPath)) this.fileCache.delete(cachedPath);
    }

    return Array.from(keysSet).sort();
  }

  /**
   * Scans all locale files/folders to compile the set of all keys currently in locales.
   */
  async scanLocalesKeys(
    basePath: string,
    listLocales: (base: string) => Promise<string[]>
  ): Promise<string[]> {
    this.assertEnabled();

    const locales = await listLocales(basePath);
    const keysSet = new Set<string>();

    for (const locale of locales) {
      try {
        const resolvedBasePath = path.resolve(basePath);
        const localePath = path.resolve(resolvedBasePath, locale);

        let isDir = false;
        try {
          const stats = await fs.stat(localePath);
          isDir = stats.isDirectory();
        } catch {}

        let data: Record<string, any> = {};

        if (isDir) {
          const files = await fs.readdir(localePath);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const ns = path.basename(file, '.json');
              try {
                const content = await fs.readFile(path.join(localePath, file), 'utf-8');
                data[ns] = JSON.parse(content);
              } catch {}
            }
          }
        } else {
          try {
            if (!isSafeLocaleSegment(locale)) {
              continue;
            }
            const filePath = path.resolve(resolvedBasePath, `${locale}.json`);
            if (filePath.startsWith(resolvedBasePath)) {
              const content = await fs.readFile(filePath, 'utf-8');
              data = JSON.parse(content);
            }
          } catch {}
        }

        const flatten = (obj: any, prefix = '') => {
          if (!obj || typeof obj !== 'object') return;
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              const newKey = prefix ? `${prefix}.${key}` : key;
              if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                flatten(obj[key], newKey);
              } else {
                keysSet.add(newKey);
              }
            }
          }
        };

        flatten(data);
      } catch {}
    }

    return Array.from(keysSet).sort();
  }

  /**
   * Returns merged lists of keys from codebase and existing locale files.
   */
  async getKeysMetadata(
    basePath: string,
    listLocales: (base: string) => Promise<string[]>
  ): Promise<{ allKeys: string[]; codeKeys: string[] }> {
    const codeKeys = await this.scanCodebaseKeys(basePath);
    const localeKeys = await this.scanLocalesKeys(basePath, listLocales);
    const allKeys = Array.from(new Set([...codeKeys, ...localeKeys])).sort();
    return {
      allKeys,
      codeKeys,
    };
  }
}
