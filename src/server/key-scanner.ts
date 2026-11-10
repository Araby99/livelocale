import { promises as fs } from 'fs';
import * as path from 'path';
import { isSafeLocaleSegment, KEY_RE } from '../core/validate.js';
import { parseJsonText } from '../core/json-path.js';
import { getDisabledReason } from '../core/env.js';
import { parseGitignore, type GitignoreMatcher } from '../core/gitignore.js';

export const IGNORE_DIRS = new Set([
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
  // Astro's generated types and content cache.
  '.astro',
]);

/** `.astro` files are read whole: frontmatter and template expressions use the same `t` syntax. */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.astro']);

/** Files above this size are almost certainly bundles or fixtures, not components. */
export const MAX_SOURCE_BYTES = 1_000_000;

/** Property reads hang off a translator name: `t.home.title`, `t?.nav?.home`. */
const PROP_CHAIN = String.raw`(?:\??\.[a-zA-Z0-9_]+)+`;
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

/**
 * Maps names bound to one namespace of `createTranslations` to that namespace:
 *   const t = createTranslations(locale, { namespace: 'home' })
 * Property reads on them (`t.hero.title`) are keys under the namespace (`home.hero.title`).
 */
function objectBindings(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = new RegExp(
    DECL +
      String.raw`(?<name>\w+)\s*=\s*(?:await\s+)?createTranslations\(` +
      // Only the call's own arguments (nested parentheses included), never past its closing
      // `)`: in code without semicolons the next statement must stay out of reach.
      String.raw`(?:[^()]|\((?:[^()]|\([^()]*\))*\))*?\bnamespace:\s*` +
      STR,
    'g'
  );
  for (const m of content.matchAll(re)) {
    const namespace = stringArg(m);
    if (namespace && KEY_RE.test(namespace)) map.set(m.groups!['name']!, namespace);
  }
  return map;
}

/**
 * The key references in source files, apart by how they are written:
 * - `calls`: string arguments of a translator call, `t('home.title')`. A string argument is
 *   meant as a key, so a call key no locale has is reported as missing.
 * - `props`: property reads, `t.home.title`. Any variable named `t` matches (a DOM element in
 *   a plain script, the `t.me` of a Telegram link), so `resolveCodeKeys` keeps a property
 *   read only when the locales know its first segment.
 * - `translatorProps`: property reads in a file that gets `t` from a translation source (see
 *   `takesTranslations`). There, `t` is a translation object, so a read whose first segment
 *   no locale knows is a missing key, not a DOM method.
 * - `scoped`: the property reads of a file that passes plain names as string arguments to
 *   a call whose result it keeps, such as the `'home'` of `const { t } = i18n(Astro, 'home')`
 *   or `t={getT('home', locale)}`, with those names. When one of them is a namespace, its
 *   reads are looked up in that namespace first.
 */
export interface KeyReferences {
  calls: string[];
  props: string[];
  translatorProps?: string[];
  scoped: ScopedReads[];
}

/** Property reads of the files that pass the same `hints` as string arguments. */
export interface ScopedReads {
  hints: string[];
  props: string[];
  /** The files get `t` from a translation source: see `KeyReferences.translatorProps`. */
  translator?: boolean;
}

/** A plain name passed as a string argument: `f('home')`, `i18n(Astro, 'home', x)`. */
const NAME_ARG_RE = /[(,]\s*(['"\x60])([A-Za-z][\w-]*)\1\s*(?=[),])/g;

/**
 * A call whose result is kept: `= f(`, `= await f(`, or a JSX attribute `={f(`. A member call
 * such as `document.getElementById('pricing')` is not one, nor a comparison (`x === f(`).
 */
const BOUND_CALL_RE = /(?<![=!<>])=(?![=>])\s*\{?\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/g;

/**
 * The arguments of the call whose `(` is at `open`, with the inside of nested parentheses
 * left out, wrapped in parentheses again: `(Astro, 'home')`.
 */
function topLevelArguments(content: string, open: number): string {
  let depth = 0;
  let out = '';
  for (let i = open; i < content.length; i++) {
    const ch = content[i]!;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 1 || (depth === 0 && ch === ')') || (depth === 2 && ch === '(')) out += ch;
    if (depth === 0) break;
  }
  return out;
}

/** The plain names passed as string arguments to `args` (from `topLevelArguments`). */
function nameArguments(args: string): string[] {
  return [...args.matchAll(NAME_ARG_RE)].map((m) => m[2]!);
}

/** Drops comments that start a line: `//` lines and block comments such as doc comments. */
function withoutLineComments(content: string): string {
  return content.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Another `t`: a parameter (`(t) =>`, `(t, i) =>`, `t =>`, `function (t)`) or a loop variable. */
const OTHER_T_RES = [
  /\bfunction\b[\w$\s]*\(\s*t\s*[,)]/,
  /\(\s*t\s*(?:,[^()]*)?\)\s*=>/,
  /(?<![\w$.])t\s*=>/,
  /\bfor\s*\(\s*(?:var|let|const)\s+t\b/,
];

/**
 * Whether a file gets `t` from a translation source, so `t` there is a translation object:
 *   function Island({ t }) / ({ t = en, locale }) => / const { t, href } = i18n(Astro, 'home')
 *   const t = createTranslations(locale, …) / const t = getT('home', locale)
 * A `t` from anywhere else (`(t) => t.classList.toggle('on')`) may be anything.
 */
function takesTranslations(content: string, translators: ReadonlySet<string>): boolean {
  // `t` in a destructuring pattern, alone or with a default, followed by `)` (parameters),
  // `:` (a type) or `=` (a destructuring assignment). `{ t: x }` renames `t`: read apart.
  const destructured =
    /\{[^{}();]*?(?<![\w$.])t(?:\s*=\s*[^,{}();]+)?\s*(?:,[^{}();]*)?\}\s*(?:\)|:|=(?![=>]))/;
  if (destructured.test(content)) return true;
  const assigned = new RegExp(DECL + String.raw`t\s*=\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(`, 'g');
  for (const m of content.matchAll(assigned)) {
    const callee = m[1]!;
    if (translators.has(callee)) continue;
    if (callee === 'createTranslations') return true;
    const open = m.index! + m[0].length - 1;
    if (nameArguments(topLevelArguments(content, open)).length > 0) return true;
  }
  return false;
}

/** `<Trans` as a JSX tag name, not `<Translate` or `<TransList`. */
const TRANS_TAG_RE = /<Trans(?=[\s/>])/g;

/**
 * The attribute text of the JSX tag whose name ends at `from`, up to its closing `>`. A `>`
 * inside braces or quotes belongs to an attribute (`components={{ link: <a /> }}`).
 */
function tagAttributes(content: string, from: number): string {
  let depth = 0;
  let quote = '';
  for (let i = from; i < content.length; i++) {
    const ch = content[i]!;
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    } else if (ch === '>' && depth <= 0) {
      return content.slice(from, i);
    }
  }
  return content.slice(from);
}

/** A string attribute: `name="x"`, `name='x'` or `name={'x'}` in any quote style. */
function stringAttribute(attributes: string, name: string): string | undefined {
  // STR appears once, with optional braces: its group names may occur only once per regex,
  // since Node before 23 refuses a regex that names a group twice.
  const re = new RegExp(
    String.raw`(?<![\w-])` + name + String.raw`\s*=\s*\{?\s*` + STR + String.raw`\s*\}?`
  );
  const m = re.exec(attributes);
  return m ? stringArg(m) : undefined;
}

/**
 * The keys of react-i18next `<Trans i18nKey="…">` elements. With an `ns` prop, or a `t` prop
 * bound to a hook with a namespace, the key is exact (a call). Without either, i18next reads it
 * in the default namespace, which the code does not name, so it is looked up like a property
 * read: under whichever namespace has it.
 */
function transKeys(
  content: string,
  bindings: Map<string, string>
): { calls: string[]; props: string[] } {
  const calls: string[] = [];
  const props: string[] = [];
  for (const m of content.matchAll(TRANS_TAG_RE)) {
    const attributes = tagAttributes(content, m.index! + m[0].length);
    const key = stringAttribute(attributes, 'i18nKey');
    if (!key || key.includes('${') || !KEY_RE.test(key)) continue;
    const tName = /(?<![\w-])t\s*=\s*\{\s*(\w+)\s*\}/.exec(attributes)?.[1];
    const ns = stringAttribute(attributes, 'ns') ?? (tName ? bindings.get(tName) : undefined);
    if (ns && KEY_RE.test(ns)) calls.push(`${ns}.${key}`);
    else props.push(key);
  }
  return { calls, props };
}

/** Extracts the translation key references from one source file's text, calls and property reads apart. */
export function extractKeyReferences(content: string): KeyReferences {
  const calls = new Set<string>();
  const props = new Set<string>();
  const translatorProps = new Set<string>();
  // Unprefixed property reads: `strict` ones are reported when their first segment is unknown.
  const unscoped = new Set<string>();
  const strict = new Set<string>();
  const bindings = namespaceBindings(content);
  const translators = new Set<string>(['t', ...bindings.keys()]);
  // Property reads and where `t` comes from are read without whole-line comments, so a usage
  // example in a doc comment is not a read.
  const code = withoutLineComments(content);
  const objects = objectBindings(code);

  for (const name of translators) {
    const prefix = bindings.get(name) ?? '';
    const callRe = new RegExp(String.raw`\b` + name + METHODS + String.raw`\(\s*` + STR, 'g');
    for (const m of content.matchAll(callRe)) {
      const key = stringArg(m);
      if (!key || key.includes('${') || !KEY_RE.test(key)) continue;
      calls.add(prefix ? `${prefix}.${key}` : key);
    }
  }

  const trans = transKeys(code, bindings);
  for (const key of trans.calls) calls.add(key);

  // `const t = common.footer` makes `t` a part of some object: `t.eggLabel` is then also
  // read as `footer.eggLabel`, which `resolveCodeKeys` finds under the `common` namespace.
  const aliasRe = new RegExp(
    DECL + String.raw`t\s*=\s*[A-Za-z_$][\w$]*(?<path>` + PROP_CHAIN + String.raw`)\s*(?:;|$)`,
    'gm'
  );
  const aliases = new Set<string>();
  for (const m of code.matchAll(aliasRe)) {
    aliases.add(m.groups!['path']!.replace(/\?/g, '').slice(1));
  }

  // `const { t: common } = i18n(Astro, 'common')` renames `t`: `common.cta.title` is a read
  // like `t.cta.title`. A renamed `t` of a hook with a namespace is a function, read above.
  const renamed = new Set<string>();
  for (const m of code.matchAll(/\{[^{}]*?\bt\s*:\s*(\w+)[^{}]*\}\s*=/g)) {
    if (!bindings.has(m[1]!)) renamed.add(m[1]!);
  }

  // A renamed `t` or a `t` taken from part of it comes from a translation source too.
  // A file that also binds another `t` (`tabs.forEach(function (t) { … })` in an inline
  // script) may read either, so its `t` reads stay lenient.
  const fromSource = renamed.size > 0 || takesTranslations(code, translators);
  const otherT = OTHER_T_RES.some((re) => re.test(code));

  // `t` reads unprefixed unless a `createTranslations` namespace binds it; another name is
  // read only when such a binding names it, or when it renames `t`.
  for (const name of new Set(['t', ...renamed, ...objects.keys()])) {
    const prefix = objects.get(name) ?? '';
    const alsoUnder = name === 't' && !prefix ? aliases : new Set<string>();
    // When `t` is part of another object, `t.x` itself may not be a key, so only its reads
    // under that part (`footer.x`) are strict.
    const strictHere = fromSource && alsoUnder.size === 0 && (name !== 't' || !otherT);
    // Not the `t.me` of `https://t.me/…`.
    const propRe = new RegExp(String.raw`(?<![/@])\b` + name + PROP_CHAIN, 'g');
    for (const m of code.matchAll(propRe)) {
      const segments = m[0]
        .slice(name.length)
        .replace(/\?/g, '')
        .split('.')
        .map((seg) => seg.trim())
        .filter(Boolean);
      // A helper or a method (`t.rich`, `t.items.map`) ends the key: what comes before it
      // is still read.
      const end = segments.findIndex((seg) => IGNORE_PROPS.has(seg));
      const key = (end === -1 ? segments : segments.slice(0, end)).join('.');
      if (prefix) {
        // The namespace is named, so every read on it is a key.
        translatorProps.add(key ? `${prefix}.${key}` : prefix);
      } else if (key) {
        (strictHere ? strict : unscoped).add(key);
        for (const path of alsoUnder)
          (fromSource && !otherT ? strict : unscoped).add(`${path}.${key}`);
      }
    }
  }

  // Names passed to a call whose result the file keeps, other than a translator call.
  const hints = new Set<string>();
  if (unscoped.size > 0 || strict.size > 0) {
    for (const m of code.matchAll(BOUND_CALL_RE)) {
      if (translators.has(m[1]!)) continue;
      const open = m.index! + m[0].length - 1;
      for (const name of nameArguments(topLevelArguments(content, open))) hints.add(name);
    }
  }
  const scoped: ScopedReads[] = [];
  if (hints.size > 0) {
    const sortedHints = [...hints].sort();
    if (unscoped.size > 0) scoped.push({ hints: sortedHints, props: [...unscoped].sort() });
    if (strict.size > 0) {
      scoped.push({ hints: sortedHints, props: [...strict].sort(), translator: true });
    }
  } else {
    for (const key of unscoped) props.add(key);
    for (const key of strict) translatorProps.add(key);
  }
  for (const key of trans.props) props.add(key);

  const refs: KeyReferences = {
    calls: Array.from(calls).sort(),
    props: Array.from(props).sort(),
    scoped,
  };
  if (translatorProps.size > 0) refs.translatorProps = Array.from(translatorProps).sort();
  return refs;
}

/** Every key reference, as written: calls, property reads and scoped reads together. */
export function allReferencedKeys(refs: KeyReferences): string[] {
  const keys = new Set<string>([...refs.calls, ...refs.props, ...(refs.translatorProps ?? [])]);
  for (const group of refs.scoped) for (const key of group.props) keys.add(key);
  return Array.from(keys).sort();
}

/** Extracts translation key references from one source file's text. */
export function extractKeys(content: string): string[] {
  return allReferencedKeys(extractKeyReferences(content));
}

/** What the locales hold, for `resolveCodeKeys`. */
export interface LocaleKeyIndex {
  /**
   * `'leaf'` when some locale has a value at `key` (a string, a number, an array, or an
   * i18next plural family), `'branch'` when it has an object there, else `undefined`.
   */
  kind(key: string): 'leaf' | 'branch' | undefined;
  /**
   * The namespaces of a folder layout (`<locale>/<namespace>.json`), whose top-level keys
   * are namespaces. Empty for a flat `<locale>.json` layout.
   */
  namespaces: ReadonlySet<string>;
}

/**
 * Turns the code references into the locale keys they reach, for `check`:
 *
 * - A key a locale has stays as it is.
 * - In a folder layout, a key is also read relative to a namespace, as
 *   `createTranslations(locale)[ns]` or a helper around it gives: `hero.title` reaches
 *   `home.hero.title` in every namespace that has `hero.title`. This holds when the first
 *   segment is itself a namespace too: `t.pricing.cta` on the `home` namespace reaches
 *   `home.pricing.cta`, and `pricing.cta` when a `pricing` namespace has `cta`. Code does
 *   not say which object `t` is, so the key counts for each place that has it.
 * - A property read in a file that passes a namespace name as a string argument
 *   (`i18n(Astro, 'home')`) is read in that namespace when it has the first segment:
 *   `t.hero.title` is `home.hero.title` there, and is missing when `home.hero` lacks
 *   `title`, whatever other namespaces hold.
 * - A property read past a value (`t.items.slice`, `t.title.length`) is a read of that value.
 * - A property read whose first segment no locale knows, as a key, a namespace or a key
 *   under a namespace, is not a translation (`t.getAttribute` on a DOM element) and is
 *   dropped, unless the file gets `t` from a translation source (`translatorProps`, or a
 *   scoped group marked `translator`): there it stays, so `check` reports it as missing.
 *   An unknown segment further down is a typo and stays: `t.hero.titel`.
 * - A call key stays exactly as written, found or not.
 */
export function resolveCodeKeys(refs: KeyReferences, index: LocaleKeyIndex): string[] {
  const out = new Set<string>();

  /** Where `key` is: itself, or under each namespace that has it. */
  const locateAnywhere = (key: string): string[] => {
    const found: string[] = index.kind(key) ? [key] : [];
    for (const ns of index.namespaces) {
      if (index.kind(`${ns}.${key}`)) found.push(`${ns}.${key}`);
    }
    return found;
  };

  /**
   * Follows a property read one segment at a time with `locate`. Returns `false` when not
   * even the first segment is found; otherwise adds the keys it reaches, or the missing key
   * (`missing` names it from where the last segment was found).
   */
  const walk = (
    key: string,
    locate: (key: string) => string[],
    missing: (found: string[], rest: string) => string[]
  ): boolean => {
    const segments = key.split('.');
    let found: string[] = [];
    for (let len = 1; len <= segments.length; len++) {
      const next = locate(segments.slice(0, len).join('.'));
      if (next.length === 0) {
        if (len === 1) return false;
        for (const k of missing(found, segments.slice(len - 1).join('.'))) out.add(k);
        return true;
      }
      found = next;
      if (len === segments.length || found.every((k) => index.kind(k) === 'leaf')) break;
    }
    for (const k of found) out.add(k);
    return true;
  };

  // A call key is checked exactly as written (with its hook's namespace in front).
  for (const key of refs.calls) out.add(key);

  const calls = new Set(refs.calls);
  const asWritten = (key: string) => () => [key];
  for (const key of refs.props) {
    if (!calls.has(key)) walk(key, locateAnywhere, asWritten(key));
  }
  for (const key of refs.translatorProps ?? []) {
    if (!calls.has(key) && !walk(key, locateAnywhere, asWritten(key))) out.add(key);
  }

  for (const group of refs.scoped) {
    const namespaces = group.hints.filter((hint) => index.namespaces.has(hint));
    const locateIn = (key: string) =>
      namespaces.map((ns) => `${ns}.${key}`).filter((k) => index.kind(k));
    const underFound = (found: string[], rest: string) => found.map((k) => `${k}.${rest}`);
    for (const key of group.props) {
      if (calls.has(key)) continue;
      if (namespaces.length > 0 && walk(key, locateIn, underFound)) continue;
      if (walk(key, locateAnywhere, asWritten(key)) || !group.translator) continue;
      // No locale knows the first segment of a read on a translation object: missing, in the
      // file's namespace when it names exactly one.
      out.add(namespaces.length === 1 ? `${namespaces[0]}.${key}` : key);
    }
  }

  return Array.from(out).sort();
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
export interface KeyScannerOptions {
  /**
   * Refuse to scan unless LiveLocale is enabled (development or preview mode).
   * Defaults to true; read-only tooling such as `check` turns it off so it can run in CI.
   */
  requireEnabled?: boolean;
}

/**
 * Finds the translation keys used in the source code.
 *
 * @internal Not part of the public API: semver does not cover it and it may change in any
 * release. See https://livelocale.js.org/docs/reference/stability.html
 */
export class KeyScanner {
  private fileCache = new Map<string, CachedFile<KeyReferences>>();
  private gitignoreCache: CachedFile<GitignoreMatcher> | null = null;
  private readonly requireEnabled: boolean;

  constructor(options: KeyScannerOptions = {}) {
    this.requireEnabled = options.requireEnabled ?? true;
  }

  private assertEnabled(): void {
    if (!this.requireEnabled) return;
    const reason = getDisabledReason();
    if (reason !== null) {
      throw new Error(
        `[livelocale] KeyScanner can only be executed in development mode (${reason}).`
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
    return this.scanSourceKeys(path.dirname(path.resolve(basePath)));
  }

  /** Scans every source file under `projectRoot` for translation key references. */
  async scanSourceKeys(projectRoot: string): Promise<string[]> {
    return allReferencedKeys(await this.scanSourceReferences(projectRoot));
  }

  /**
   * Scans every source file under `projectRoot` for translation key references, calls and
   * property reads apart (see `KeyReferences`).
   */
  async scanSourceReferences(projectRoot: string): Promise<KeyReferences> {
    this.assertEnabled();

    projectRoot = path.resolve(projectRoot);
    const gitignore = await this.loadGitignore(projectRoot);
    const calls = new Set<string>();
    const props = new Set<string>();
    const translatorProps = new Set<string>();
    // Files that pass the same names share one group (apart for reads on a translation object).
    const scoped = new Map<string, { hints: string[]; props: Set<string>; translator: boolean }>();
    const seen = new Set<string>();
    const collect = (refs: KeyReferences) => {
      for (const k of refs.calls) calls.add(k);
      for (const k of refs.props) props.add(k);
      for (const k of refs.translatorProps ?? []) translatorProps.add(k);
      for (const group of refs.scoped) {
        const translator = group.translator === true;
        const id = (translator ? '!' : '') + group.hints.join(',');
        let target = scoped.get(id);
        if (!target) {
          target = { hints: group.hints, props: new Set(), translator };
          scoped.set(id, target);
        }
        for (const k of group.props) target.props.add(k);
      }
    };

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
          collect(cached.value);
          continue;
        }

        let content;
        try {
          content = await fs.readFile(fullPath, 'utf-8');
        } catch {
          continue;
        }
        // Outside the try on purpose: a scanner bug must fail loudly, not drop the file's
        // keys so that `check` reports them as unused.
        const refs = extractKeyReferences(content);
        this.fileCache.set(fullPath, { mtimeMs: stat.mtimeMs, size: stat.size, value: refs });
        collect(refs);
      }
    };

    await scanDir(projectRoot);

    // Forget files that disappeared so the cache cannot grow without bound.
    for (const cachedPath of this.fileCache.keys()) {
      if (!seen.has(cachedPath)) this.fileCache.delete(cachedPath);
    }

    return {
      calls: Array.from(calls).sort(),
      props: Array.from(props).sort(),
      translatorProps: Array.from(translatorProps).sort(),
      scoped: [...scoped.values()].map((group) => ({
        hints: group.hints,
        props: Array.from(group.props).sort(),
        ...(group.translator ? { translator: true } : {}),
      })),
    };
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
                data[ns] = parseJsonText(content);
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
              data = parseJsonText(content) as Record<string, any>;
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
