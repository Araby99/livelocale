import * as fs from 'fs';
import * as path from 'path';
import { LOCALE_RE } from '../core/validate.js';
import { comparePlaceholders, validateMessageSyntax } from '../core/placeholders.js';
import { KeyScanner } from '../server/key-scanner.js';

export type IssueKind =
  | 'invalid-json'
  | 'missing-in-locale'
  | 'missing-from-code'
  | 'placeholder-mismatch'
  | 'syntax'
  | 'empty'
  | 'unused';

export type IssueLevel = 'fail' | 'warn';

export interface CheckIssue {
  kind: IssueKind;
  level: IssueLevel;
  locale?: string;
  key?: string;
  /** Locale file (or folder) relative to the project, for invalid JSON. */
  file?: string;
  message: string;
}

export interface CheckOptions {
  /** Project root to scan for source files. */
  projectDir: string;
  /** Locales directory, absolute or relative to `projectDir`. Defaults to `locales`. */
  localesPath?: string;
  /** Locale the others are compared against. Defaults to `en` when present, else the first locale. */
  sourceLocale?: string;
  /** Report keys that exist in locale files but are never referenced in code. Defaults to true. */
  unused?: boolean;
  /** Treat warnings (unused and empty values) as failures. */
  strict?: boolean;
}

export interface CheckReport {
  localesDir: string;
  sourceLocale: string | null;
  locales: string[];
  codeKeyCount: number;
  issues: CheckIssue[];
}

/** i18next plural suffixes; `t('items')` resolves `items_one`, `items_other`, … at run time. */
const PLURAL_SUFFIX_RE = /_(?:ordinal_)?(?:zero|one|two|few|many|other)$/;

const KIND_ORDER: IssueKind[] = [
  'invalid-json',
  'syntax',
  'missing-from-code',
  'missing-in-locale',
  'placeholder-mismatch',
  'empty',
  'unused',
];

const KIND_TITLE: Record<IssueKind, string> = {
  'invalid-json': 'Locale files that are not valid JSON',
  syntax: 'Broken ICU message syntax',
  'missing-from-code': 'Keys used in code but missing from a locale',
  'missing-in-locale': 'Keys missing compared to the source locale',
  'placeholder-mismatch': 'Placeholders that differ from the source locale',
  empty: 'Empty translations',
  unused: 'Keys never referenced in code',
};

interface LocaleData {
  /** Leaf key → value. Non-string leaves (numbers, arrays) are kept but not validated. */
  leaves: Map<string, unknown>;
  /** Every intermediate object path, so `t.home` counts as a reference to `home.*`. */
  branches: Set<string>;
}

function listLocales(localesDir: string): string[] {
  const locales = new Set<string>();
  for (const item of fs.readdirSync(localesDir, { withFileTypes: true })) {
    if (item.isDirectory() && LOCALE_RE.test(item.name)) locales.add(item.name);
    else if (item.isFile() && item.name.endsWith('.json')) {
      const name = path.basename(item.name, '.json');
      if (LOCALE_RE.test(name)) locales.add(name);
    }
  }
  return Array.from(locales).sort();
}

function flatten(obj: unknown, prefix: string, data: LocaleData): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      data.branches.add(full);
      flatten(value, full, data);
    } else {
      data.leaves.set(full, value);
    }
  }
}

/**
 * Reads one locale the way the runtime does: a flat `{locale}.json`, or every
 * `*.json` inside `{locale}/` merged under its file name as the namespace.
 */
function readLocale(
  localesDir: string,
  locale: string,
  projectDir: string,
  issues: CheckIssue[]
): LocaleData {
  const data: LocaleData = { leaves: new Map(), branches: new Set() };
  const rel = (p: string) => path.relative(projectDir, p).split(path.sep).join('/');
  const parse = (file: string): unknown => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (err: any) {
      issues.push({
        kind: 'invalid-json',
        level: 'fail',
        locale,
        file: rel(file),
        message: err?.message ?? String(err),
      });
      return undefined;
    }
  };

  const dir = path.join(localesDir, locale);
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.json')) continue;
      const ns = path.basename(file, '.json');
      const parsed = parse(path.join(dir, file));
      if (parsed === undefined) continue;
      data.branches.add(ns);
      flatten(parsed, ns, data);
    }
  } else {
    flatten(parse(path.join(localesDir, `${locale}.json`)), '', data);
  }
  return data;
}

/** True when `key` resolves in `data`: as a leaf, an object, or an i18next plural family. */
function hasKey(data: LocaleData, key: string): boolean {
  if (data.leaves.has(key) || data.branches.has(key)) return true;
  for (const leaf of data.leaves.keys()) {
    if (leaf.startsWith(`${key}_`) && PLURAL_SUFFIX_RE.test(leaf)) return true;
  }
  return false;
}

/** True when a locale key is reached by some code reference (directly, via a parent object, or as a plural form). */
function isReferenced(key: string, codeKeys: Set<string>): boolean {
  const base = key.replace(PLURAL_SUFFIX_RE, '');
  for (const candidate of base === key ? [key] : [key, base]) {
    if (codeKeys.has(candidate)) return true;
    let dot = candidate.lastIndexOf('.');
    while (dot > 0) {
      if (codeKeys.has(candidate.slice(0, dot))) return true;
      dot = candidate.lastIndexOf('.', dot - 1);
    }
  }
  return false;
}

/**
 * Read-only consistency check of a project's translations, meant for CI:
 * missing keys, broken ICU syntax, placeholder drift between locales, empty
 * values, and keys nothing references.
 */
export async function runCheck(options: CheckOptions): Promise<CheckReport> {
  const projectDir = path.resolve(options.projectDir);
  const localesDir = path.resolve(projectDir, options.localesPath ?? 'locales');
  const issues: CheckIssue[] = [];
  const strict = options.strict ?? false;
  const warn: IssueLevel = strict ? 'fail' : 'warn';

  if (!fs.existsSync(localesDir) || !fs.statSync(localesDir).isDirectory()) {
    throw new Error(`Locales directory not found: ${localesDir}`);
  }

  const locales = listLocales(localesDir);
  const data = new Map(locales.map((l) => [l, readLocale(localesDir, l, projectDir, issues)]));

  const sourceLocale =
    options.sourceLocale ?? (locales.includes('en') ? 'en' : (locales[0] ?? null));
  if (sourceLocale && !data.has(sourceLocale)) {
    throw new Error(
      `Source locale "${sourceLocale}" not found in ${localesDir} (found: ${locales.join(', ') || 'none'}).`
    );
  }

  const scanner = new KeyScanner({ requireEnabled: false });
  const codeKeys = new Set(await scanner.scanSourceKeys(projectDir));

  for (const [locale, localeData] of data) {
    for (const [key, value] of localeData.leaves) {
      if (typeof value !== 'string') continue;
      const error = validateMessageSyntax(value);
      if (error) {
        issues.push({ kind: 'syntax', level: 'fail', locale, key, message: error });
      }
      if (value.trim() === '') {
        issues.push({ kind: 'empty', level: warn, locale, key, message: 'Value is empty.' });
      }
    }

    for (const key of codeKeys) {
      if (!hasKey(localeData, key)) {
        issues.push({
          kind: 'missing-from-code',
          level: 'fail',
          locale,
          key,
          message: `Used in code but not defined in ${locale}.`,
        });
      }
    }
  }

  if (sourceLocale) {
    const source = data.get(sourceLocale)!;
    for (const [locale, localeData] of data) {
      if (locale === sourceLocale) continue;
      for (const [key, sourceValue] of source.leaves) {
        if (!localeData.leaves.has(key)) {
          // Keys the code uses are already reported as missing-from-code, and plural
          // families differ legitimately between languages (Arabic has six forms).
          if (codeKeys.has(key) || PLURAL_SUFFIX_RE.test(key)) continue;
          issues.push({
            kind: 'missing-in-locale',
            level: 'fail',
            locale,
            key,
            message: `Defined in ${sourceLocale} but not in ${locale}.`,
          });
          continue;
        }

        const value = localeData.leaves.get(key);
        if (typeof sourceValue !== 'string' || typeof value !== 'string' || value === '') continue;
        const cmp = comparePlaceholders(sourceValue, value);
        if (!cmp.ok) {
          const parts: string[] = [];
          if (cmp.missing.length) parts.push(`missing ${cmp.missing.join(', ')}`);
          if (cmp.extra.length) parts.push(`extra ${cmp.extra.join(', ')}`);
          issues.push({
            kind: 'placeholder-mismatch',
            level: 'fail',
            locale,
            key,
            message: `${parts.join('; ')} (compared to ${sourceLocale}).`,
          });
        }
      }
    }

    if (options.unused ?? true) {
      for (const key of source.leaves.keys()) {
        if (!isReferenced(key, codeKeys)) {
          issues.push({
            kind: 'unused',
            level: warn,
            locale: sourceLocale,
            key,
            message: 'Not referenced in code (dynamic keys cannot be detected).',
          });
        }
      }
    }
  }

  issues.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.locale ?? '').localeCompare(b.locale ?? '') ||
      (a.key ?? a.file ?? '').localeCompare(b.key ?? b.file ?? '')
  );

  return {
    localesDir,
    sourceLocale,
    locales,
    codeKeyCount: codeKeys.size,
    issues,
  };
}

export function hasCheckFailures(report: CheckReport): boolean {
  return report.issues.some((i) => i.level === 'fail');
}

/** Human-readable report, grouped by issue kind, with at most `limit` lines per group. */
export function formatCheckReport(report: CheckReport, limit = 25): string {
  const lines: string[] = [];
  for (const kind of KIND_ORDER) {
    const group = report.issues.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    const glyph = group.some((i) => i.level === 'fail') ? '✖' : '⚠';
    lines.push(`${glyph} ${KIND_TITLE[kind]} (${group.length})`);
    for (const issue of group.slice(0, limit)) {
      const where = issue.key
        ? `${issue.locale ? `[${issue.locale}] ` : ''}${issue.key}`
        : (issue.file ?? issue.locale ?? '');
      lines.push(`   ${where} — ${issue.message}`);
    }
    if (group.length > limit) lines.push(`   …and ${group.length - limit} more`);
  }
  return lines.join('\n');
}
