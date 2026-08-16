import { promises as fs } from 'fs';
import * as path from 'path';
import { isSafeLocaleSegment } from '../core/validate.js';

const IGNORE_DIRS = [
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
];

const CALL_RE = /\bt\(\s*['"`]([a-zA-Z0-9._-]+)['"`]\s*\)/g;
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
]);

/**
 * Read-only analysis of translation keys: scans the codebase for `t(...)`
 * references and compiles the set of keys present in locale files.
 */
export class KeyScanner {
  /**
   * Scans codebase directory recursively for references to translation keys.
   */
  async scanCodebaseKeys(basePath: string): Promise<string[]> {
    if (process.env['NODE_ENV'] !== 'development') {
      throw new Error('[i18n-lens] KeyScanner can only be executed in development mode.');
    }

    const resolvedBasePath = path.resolve(basePath);
    const projectRoot = path.dirname(resolvedBasePath);
    const keysSet = new Set<string>();

    const scanDir = async (dir: string) => {
      let items: any[] = [];
      try {
        items = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (!IGNORE_DIRS.includes(item.name)) {
            await scanDir(fullPath);
          }
        } else if (item.isFile()) {
          const ext = path.extname(item.name);
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');

              let match;
              CALL_RE.lastIndex = 0;
              while ((match = CALL_RE.exec(content)) !== null) {
                if (match[1]) {
                  keysSet.add(match[1]);
                }
              }

              let propMatch;
              PROP_RE.lastIndex = 0;
              while ((propMatch = PROP_RE.exec(content)) !== null) {
                const rawMatch = propMatch[0];
                const clean = rawMatch.replace(/\bt/, '').replace(/\?/g, '');
                const segments = clean
                  .split('.')
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (segments.length > 0 && !segments.some((s) => IGNORE_PROPS.has(s))) {
                  keysSet.add(segments.join('.'));
                }
              }
            } catch {}
          }
        }
      }
    };

    await scanDir(projectRoot);
    return Array.from(keysSet).sort();
  }

  /**
   * Scans all locale files/folders to compile the set of all keys currently in locales.
   */
  async scanLocalesKeys(
    basePath: string,
    listLocales: (base: string) => Promise<string[]>
  ): Promise<string[]> {
    if (process.env['NODE_ENV'] !== 'development') {
      throw new Error('[i18n-lens] KeyScanner can only be executed in development mode.');
    }

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
