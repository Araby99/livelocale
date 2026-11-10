import * as fs from 'fs';
import * as path from 'path';
import { LOCALE_RE } from '../core/validate.js';
import { parseJsonText } from '../core/json-path.js';
import {
  LOCALES_CANDIDATES,
  resolveLocalesPath,
  skippedLocaleEntries,
} from '../core/locale-folder.js';
import {
  comparePlaceholders,
  optionalPlaceholdersFor,
  validateMessageSyntax,
} from '../core/placeholders.js';
import { KeyScanner, resolveCodeKeys, type LocaleKeyIndex } from '../server/key-scanner.js';
import { readAllowList } from './hardcoded/allow-list.js';
import { isAstroFile, listComponentFiles } from './hardcoded/files.js';
import { loadProjectTypeScript, type ProjectTypeScript } from './hardcoded/load-typescript.js';
import { findAstroHardcodedText } from './hardcoded/scan-astro.js';
import { findHardcodedText } from './hardcoded/scan-jsx.js';
import {
  hasLetters,
  isMostlyLatin,
  isNonLatinLocale,
  primaryLanguage,
} from './hardcoded/locale-script.js';

/** A JSX element or fragment needs a `<` before a letter or `>`; a file without one has none. */
const MAY_HOLD_JSX = /<[A-Za-z>]/;

export type IssueKind =
  | 'invalid-json'
  | 'not-a-locale'
  | 'missing-in-locale'
  | 'missing-from-code'
  | 'placeholder-mismatch'
  | 'plural-missing-other'
  | 'syntax'
  | 'empty'
  | 'unused'
  | 'hardcoded'
  | 'untranslated'
  | 'wrong-script';

export type IssueLevel = 'fail' | 'warn';

export interface CheckIssue {
  kind: IssueKind;
  level: IssueLevel;
  locale?: string;
  key?: string;
  /** Locale file (or folder) relative to the project, for invalid JSON. */
  file?: string;
  /** 1-based position in `file`, for hardcoded text. */
  line?: number;
  column?: number;
  /** Source-code text, already shortened, for hardcoded text. */
  text?: string;
  message: string;
}

export interface CheckOptions {
  /** Project root to scan for source files. */
  projectDir: string;
  /**
   * Locales directory, absolute or relative to `projectDir`. Defaults to the first known folder
   * that holds locale files (see `LOCALES_CANDIDATES`), else `locales`.
   */
  localesPath?: string;
  /** Locale the others are compared against. Defaults to `en` when present, else the first locale. */
  sourceLocale?: string;
  /** Report keys that exist in locale files but are never referenced in code. Defaults to true. */
  unused?: boolean;
  /** Treat warnings (unused and empty values) as failures. */
  strict?: boolean;
  /** Also report text that never went through translation. Defaults to false. */
  hardcoded?: boolean;
  /** Extra allowed words and phrases, on top of `livelocale.allow`. */
  allow?: string[];
}

export interface CheckReport {
  localesDir: string;
  /** The locales folder found without `--locales`, relative to the project; unset when given. */
  detectedLocalesPath?: string;
  sourceLocale: string | null;
  locales: string[];
  codeKeyCount: number;
  issues: CheckIssue[];
  /** Problems that kept a check from running; set only when non-empty. */
  setupProblems?: string[];
}

/** i18next plural suffixes; `t('items')` resolves `items_one`, `items_other`, … at run time. */
const PLURAL_SUFFIX_RE = /_(?:ordinal_)?(?:zero|one|two|few|many|other)$/;

const KIND_ORDER: IssueKind[] = [
  'invalid-json',
  'not-a-locale',
  'syntax',
  'missing-from-code',
  'missing-in-locale',
  'placeholder-mismatch',
  'plural-missing-other',
  'hardcoded',
  'empty',
  'untranslated',
  'wrong-script',
  'unused',
];

const KIND_TITLE: Record<IssueKind, string> = {
  'invalid-json': 'Locale files that are not valid JSON',
  'not-a-locale': 'Files and folders not read because their name is not a locale code',
  syntax: 'Broken ICU message syntax',
  'missing-from-code': 'Keys used in code but missing from a locale',
  'missing-in-locale': 'Keys missing compared to the source locale',
  'placeholder-mismatch': 'Placeholders that differ from the source locale',
  'plural-missing-other': 'Plural forms without their _other form',
  empty: 'Empty translations',
  unused: 'Keys never referenced in code',
  hardcoded: 'Hardcoded text not passed through translation',
  untranslated: 'Translations identical to the source locale',
  'wrong-script': 'Translations mostly in Latin letters for a non-Latin locale',
};

interface LocaleData {
  /** Leaf key → value. Non-string leaves (numbers, arrays) are kept but not validated. */
  leaves: Map<string, unknown>;
  /** Every intermediate object path, so `t.home` counts as a reference to `home.*`. */
  branches: Set<string>;
  /** Leaf key → locale file it came from, relative to the project and `/`-separated. */
  files: Map<string, string>;
  /**
   * What could not be read: `''` for the whole locale (a flat file), else the namespaces of
   * the folder files that failed. Keys under them are not reported as missing, since the
   * invalid file is the one problem to fix.
   */
  unreadable: Set<string>;
}

/** Why a parsed locale file is not a JSON object, or null when it is one. */
function rootProblem(parsed: unknown): string | null {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return null;
  const what = Array.isArray(parsed) ? 'a list' : parsed === null ? 'null' : `a ${typeof parsed}`;
  return `The file must hold a JSON object ({ ... }), not ${what}.`;
}

/** True when `key` lies in a part of `data` whose file could not be read. */
function isUnreadable(data: LocaleData, key: string): boolean {
  if (data.unreadable.has('')) return true;
  for (const ns of data.unreadable) if (key === ns || key.startsWith(`${ns}.`)) return true;
  return false;
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

/** True when `locale` has a file to read: its `{locale}.json`, or a `*.json` inside `{locale}/`. */
function hasLocaleFile(localesDir: string, locale: string): boolean {
  const dir = path.join(localesDir, locale);
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    return fs.readdirSync(dir).some((file) => file.endsWith('.json'));
  }
  return fs.existsSync(path.join(localesDir, `${locale}.json`));
}

/** The error for a locales folder with no locale file, naming JSON entries skipped for their name. */
function noLocaleFilesError(localesDir: string): Error {
  const skipped: string[] = [];
  for (const item of fs.readdirSync(localesDir, { withFileTypes: true })) {
    if (item.isDirectory() && !item.name.startsWith('.') && !LOCALE_RE.test(item.name)) {
      skipped.push(`${item.name}/`);
    } else if (item.isFile() && item.name.endsWith('.json')) {
      if (!LOCALE_RE.test(path.basename(item.name, '.json'))) skipped.push(item.name);
    }
  }
  skipped.sort();
  const hint =
    skipped.length === 0
      ? ''
      : ` Skipped ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ', ...' : ''}: a locale name looks like en, ar or pt-BR.`;
  return new Error(
    `No locale files found in ${localesDir}. Point --locales at the folder with en.json, ar.json, ...${hint}`
  );
}

function flatten(obj: unknown, prefix: string, file: string, data: LocaleData): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      data.branches.add(full);
      flatten(value, full, file, data);
    } else {
      data.leaves.set(full, value);
      data.files.set(full, file);
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
  const data: LocaleData = {
    leaves: new Map(),
    branches: new Set(),
    files: new Map(),
    unreadable: new Set(),
  };
  const rel = (p: string) => path.relative(projectDir, p).split(path.sep).join('/');
  const parse = (file: string): unknown => {
    let message: string | null;
    let parsed: unknown;
    try {
      // A byte-order mark is common in files saved on Windows, and bundlers ignore it.
      parsed = parseJsonText(fs.readFileSync(file, 'utf-8'));
      message = rootProblem(parsed);
    } catch (err: any) {
      message = err?.message ?? String(err);
    }
    if (message === null) return parsed;
    issues.push({ kind: 'invalid-json', level: 'fail', locale, file: rel(file), message });
    return undefined;
  };

  const dir = path.join(localesDir, locale);
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.json')) continue;
      const ns = path.basename(file, '.json');
      const full = path.join(dir, file);
      const parsed = parse(full);
      if (parsed === undefined) {
        data.unreadable.add(ns);
        continue;
      }
      data.branches.add(ns);
      flatten(parsed, ns, rel(full), data);
    }
  } else {
    const full = path.join(localesDir, `${locale}.json`);
    const parsed = parse(full);
    if (parsed === undefined) data.unreadable.add('');
    flatten(parsed, '', rel(full), data);
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

/**
 * What any locale holds, for reading the code's references: every leaf, object and plural
 * family, and the namespaces of a folder layout (the `*.json` names in `<locale>/` folders).
 */
function localeKeyIndex(localesDir: string, locales: LocaleData[]): LocaleKeyIndex {
  const leaves = new Set<string>();
  const branches = new Set<string>();
  for (const locale of locales) {
    for (const leaf of locale.leaves.keys()) {
      leaves.add(leaf);
      if (PLURAL_SUFFIX_RE.test(leaf)) leaves.add(leaf.replace(PLURAL_SUFFIX_RE, ''));
    }
    for (const branch of locale.branches) branches.add(branch);
  }

  const namespaces = new Set<string>();
  for (const item of fs.readdirSync(localesDir, { withFileTypes: true })) {
    if (!item.isDirectory() || !LOCALE_RE.test(item.name)) continue;
    for (const file of fs.readdirSync(path.join(localesDir, item.name))) {
      if (file.endsWith('.json')) namespaces.add(path.basename(file, '.json'));
    }
  }

  return {
    kind: (key) => (leaves.has(key) ? 'leaf' : branches.has(key) ? 'branch' : undefined),
    namespaces,
  };
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
  const localesPath = resolveLocalesPath(projectDir, options.localesPath);
  const localesDir = path.resolve(projectDir, localesPath.path);
  const issues: CheckIssue[] = [];
  const strict = options.strict ?? false;
  const warn: IssueLevel = strict ? 'fail' : 'warn';

  if (!fs.existsSync(localesDir) || !fs.statSync(localesDir).isDirectory()) {
    const tried =
      options.localesPath === undefined
        ? ` Looked in ${LOCALES_CANDIDATES.join(', ')}. Pass --locales <path>.`
        : '';
    throw new Error(`Locales directory not found: ${localesDir}.${tried}`);
  }

  const locales = listLocales(localesDir);
  if (!locales.some((locale) => hasLocaleFile(localesDir, locale))) {
    throw noLocaleFilesError(localesDir);
  }
  const rel = (p: string) => path.relative(projectDir, p).split(path.sep).join('/');
  for (const entry of skippedLocaleEntries(localesDir)) {
    issues.push({
      kind: 'not-a-locale',
      level: warn,
      file: rel(path.join(localesDir, entry)) + (entry.endsWith('/') ? '/' : ''),
      message: 'Not read: a locale name looks like en, pt-BR or zh-Hant-TW.',
    });
  }
  const data = new Map(locales.map((l) => [l, readLocale(localesDir, l, projectDir, issues)]));

  const sourceLocale =
    options.sourceLocale ?? (locales.includes('en') ? 'en' : (locales[0] ?? null));
  if (sourceLocale && !data.has(sourceLocale)) {
    throw new Error(
      `Source locale "${sourceLocale}" not found in ${localesDir} (found: ${locales.join(', ') || 'none'}).`
    );
  }

  const scanner = new KeyScanner({ requireEnabled: false });
  const codeKeys = new Set(
    resolveCodeKeys(
      await scanner.scanSourceReferences(projectDir),
      localeKeyIndex(localesDir, [...data.values()])
    )
  );
  const allow = options.hardcoded ? readAllowList(projectDir, options.allow) : null;
  let setupProblems: string[] | undefined;

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
      if (!hasKey(localeData, key) && !isUnreadable(localeData, key)) {
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

  // `other` is the one plural form every language has: without it i18next shows the key or the
  // fallback language for most counts. Only families some locale completes with `_other` are
  // checked, so a plain key that happens to end in `_one` is left alone.
  const completeFamilies = new Set<string>();
  for (const localeData of data.values()) {
    for (const key of localeData.leaves.keys()) {
      if (key.endsWith('_other')) completeFamilies.add(key.slice(0, -'_other'.length));
    }
  }
  for (const [locale, localeData] of data) {
    const reported = new Set<string>();
    for (const key of localeData.leaves.keys()) {
      if (!PLURAL_SUFFIX_RE.test(key) || key.endsWith('_other')) continue;
      const family = key.replace(/_(?:zero|one|two|few|many)$/, '');
      if (!completeFamilies.has(family) || reported.has(family)) continue;
      if (localeData.leaves.has(`${family}_other`)) continue;
      reported.add(family);
      issues.push({
        kind: 'plural-missing-other',
        level: warn,
        locale,
        key: `${family}_other`,
        message: 'This plural has other forms but no _other, which every language needs.',
      });
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
          if (isUnreadable(localeData, key)) continue;
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
        const cmp = comparePlaceholders(sourceValue, value, optionalPlaceholdersFor(key));
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

    if (allow) {
      const sourceLanguage = primaryLanguage(sourceLocale);
      for (const [locale, localeData] of data) {
        if (locale === sourceLocale) continue;
        const sameLanguage = primaryLanguage(locale) === sourceLanguage;
        const nonLatin = isNonLatinLocale(locale);
        for (const [key, value] of localeData.leaves) {
          if (typeof value !== 'string' || value.trim() === '' || allow.keys.has(key)) continue;
          if (!hasLetters(value, allow)) continue;
          const file = localeData.files.get(key);
          if (!sameLanguage && source.leaves.get(key) === value) {
            issues.push({
              kind: 'untranslated',
              level: warn,
              locale,
              key,
              file,
              message: `Same text as ${sourceLocale}.`,
            });
          } else if (nonLatin && isMostlyLatin(value, allow)) {
            issues.push({
              kind: 'wrong-script',
              level: warn,
              locale,
              key,
              file,
              message: `Mostly Latin letters for locale ${locale}.`,
            });
          }
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

  if (allow) {
    // TypeScript is loaded only for a file that can hold JSX: .astro files have their own
    // scanner, and a script with no `<` (astro.config.mjs) has nothing the JSX scan reports.
    let loaded: ProjectTypeScript | null = null;
    for (const file of await listComponentFiles(projectDir)) {
      let content: string;
      try {
        content = await fs.promises.readFile(path.join(projectDir, file), 'utf-8');
      } catch {
        continue;
      }
      let findings;
      if (isAstroFile(file)) {
        findings = findAstroHardcodedText(content, allow);
      } else {
        if (!MAY_HOLD_JSX.test(content)) continue;
        loaded ??= await loadProjectTypeScript(projectDir);
        if ('problem' in loaded) {
          setupProblems = [loaded.problem];
          continue;
        }
        findings = findHardcodedText(loaded.ts, content, file, allow);
      }
      for (const finding of findings) {
        issues.push({
          kind: 'hardcoded',
          level: 'fail',
          file,
          line: finding.line,
          column: finding.column,
          text: finding.text,
          message: 'Not passed through a translation call.',
        });
      }
    }
  }

  issues.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.locale ?? '').localeCompare(b.locale ?? '') ||
      (a.key ?? a.file ?? '').localeCompare(b.key ?? b.file ?? '') ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0)
  );

  return {
    localesDir,
    ...(localesPath.detected ? { detectedLocalesPath: localesPath.path } : {}),
    sourceLocale,
    locales,
    codeKeyCount: codeKeys.size,
    issues,
    ...(setupProblems ? { setupProblems } : {}),
  };
}

export function hasCheckFailures(report: CheckReport): boolean {
  return report.issues.some((i) => i.level === 'fail');
}

const PER_FILE_LIMIT = 10;

/** Hardcoded findings: listed under their file, then a per-file count over every finding. */
function formatHardcodedGroup(group: CheckIssue[], limit: number): string[] {
  const lines: string[] = [];
  let currentFile: string | undefined;
  for (const issue of group.slice(0, limit)) {
    if (issue.file !== currentFile) {
      currentFile = issue.file;
      lines.push(`   ${issue.file ?? ''}`);
    }
    lines.push(`      ${issue.line ?? 0}:${issue.column ?? 0}  "${issue.text ?? ''}"`);
  }
  if (group.length > limit) lines.push(`   …and ${group.length - limit} more`);

  const counts = new Map<string, number>();
  for (const issue of group) counts.set(issue.file ?? '', (counts.get(issue.file ?? '') ?? 0) + 1);
  const files = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = files.slice(0, PER_FILE_LIMIT).map(([file, count]) => `${file} ${count}`);
  if (files.length > PER_FILE_LIMIT) shown.push(`+${files.length - PER_FILE_LIMIT} more files`);
  lines.push(`   Per file: ${shown.join(' · ')}`);
  return lines;
}

/** Human-readable report, grouped by issue kind, with at most `limit` lines per group. */
export function formatCheckReport(report: CheckReport, limit = 25): string {
  const lines: string[] = [];
  for (const kind of KIND_ORDER) {
    const group = report.issues.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    const glyph = group.some((i) => i.level === 'fail') ? '✖' : '⚠';
    lines.push(`${glyph} ${KIND_TITLE[kind]} (${group.length})`);
    if (kind === 'hardcoded') {
      lines.push(...formatHardcodedGroup(group, limit));
      continue;
    }
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
