import { encodeKey } from './watermark.js';
import { isLiveLocaleEnabled } from '../core/env.js';

export interface WrapOptions {
  /**
   * A dot-separated key prefix to prepend to all resolved key paths.
   *
   * Use this when wrapping a namespaced translation function (e.g.
   * react-i18next `useTranslation('home')` or next-intl `useTranslations('home')`)
   * so that the watermarked key matches the actual path in your locale JSON file.
   *
   * @example
   * const { t: rawT } = useTranslation('home');
   * const t = wrapTranslationEngine(rawT, { keyPrefix: 'home' });
   * // t('title') encodes as 'home.title' — matches the JSON structure
   */
  keyPrefix?: string;

  /**
   * Optional fallback translations to use when the target key is missing.
   *
   * Only read while LiveLocale is on: in production `wrapTranslationEngine` returns the
   * engine itself, so a fallback must already be part of what the engine returns.
   * `createTranslations` does that for you.
   */
  fallback?: Record<string, any>;
}

/**
 * Helper that extracts a dot-notated key string from an argument (string or object descriptor).
 */
function extractKey(arg: unknown, keyPrefix: string): string {
  if (typeof arg === 'string') {
    return keyPrefix ? `${keyPrefix}.${arg}` : arg;
  }
  if (arg && typeof arg === 'object') {
    const obj = arg as Record<string, any>;
    if (typeof obj.id === 'string' && obj.id.trim() !== '') {
      return keyPrefix ? `${keyPrefix}.${obj.id}` : obj.id;
    }
    if (typeof obj.key === 'string' && obj.key.trim() !== '') {
      return keyPrefix ? `${keyPrefix}.${obj.key}` : obj.key;
    }
  }
  return keyPrefix;
}

/**
 * Wraps any translation function or record (e.g. from next-intl, react-i18next,
 * FormatJS, or a plain locale object loaded server-side) with a JavaScript Proxy
 * that automatically encodes translation keys as invisible zero-width watermark
 * prefixes in development. In production the proxy is transparent — the original
 * engine is returned as-is.
 */
export function wrapTranslationEngine<T extends object>(engine: T, options: WrapOptions = {}): T {
  if (!isLiveLocaleEnabled()) {
    return engine;
  }

  return buildProxy(engine, options.keyPrefix ?? '', options);
}

/**
 * Dedicated convenience wrapper for `next-intl` (App Router and Pages Router).
 * Automatically wraps `useTranslations(namespace)` or `getTranslations(namespace)`.
 *
 * @example
 * ```tsx
 * const t = wrapNextIntl(useTranslations('auth'), 'auth');
 * return <h1>{t('login.title')}</h1>;
 * ```
 */
export function wrapNextIntl<T extends object>(t: T, namespace?: string): T {
  return wrapTranslationEngine(t, { keyPrefix: namespace });
}

function getNestedProperty(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (path in obj) {
    return obj[path];
  }
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function isContainer(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

/**
 * Resolves a translation record against `fallback` into a plain object, with the values a
 * read through `wrapTranslationEngine(record, { keyPrefix, fallback })` gives: a key the
 * record lacks (`undefined`) takes the fallback's value at the same full key path, and a
 * record value, even `null` or `''`, wins. With `watermark`, every string is encoded with
 * its full key path, as the proxy does. A record array keeps its own length, as the proxy's
 * `length` and iteration do: the fallback never adds items to it. Other values
 * pass through.
 *
 * The result holds every key of the record and of the fallback, so it is safe to
 * JSON-serialize or pass as props. Without `watermark`, subtrees that need no merging are
 * shared with the inputs rather than copied: treat the result as read-only.
 *
 * @internal Not part of the public API: semver does not cover it and it may change in any
 * release. See https://livelocale.js.org/docs/reference/stability.html
 */
export function resolveTranslations(
  record: Record<string, any>,
  options: Pick<WrapOptions, 'keyPrefix' | 'fallback'> & { watermark: boolean }
): Record<string, any> {
  const prefix = options.keyPrefix ?? '';
  const fallbackNode = prefix ? getNestedProperty(options.fallback, prefix) : options.fallback;
  return resolveNode(record, fallbackNode, prefix, options.fallback, options.watermark);
}

function resolveNode(
  target: Record<string, any>,
  fallbackNode: unknown,
  keyPrefix: string,
  fallback: Record<string, any> | undefined,
  watermark: boolean
): Record<string, any> {
  // Nothing to fill and nothing to encode: hand back the record itself.
  if (!watermark && !isContainer(fallbackNode)) return target;

  const keys = new Set(Object.keys(target));
  // An array is kept whole, never extended or turned into an object by the fallback: the
  // proxy takes `length` and iteration from the record's own array.
  if (isContainer(fallbackNode) && !Array.isArray(fallbackNode) && !Array.isArray(target)) {
    for (const key of Object.keys(fallbackNode)) keys.add(key);
  }

  const out: Record<string, any> = Array.isArray(target) ? [] : {};
  for (const key of keys) {
    const fullKey = keyPrefix ? `${keyPrefix}.${key}` : key;
    let val = target[key];
    const fromFallback = val === undefined && fallback !== undefined;
    if (fromFallback) val = getNestedProperty(fallback, fullKey);

    if (fromFallback && !watermark) {
      // A whole subtree taken from the fallback has nothing left to fill.
      if (val !== undefined) out[key] = val;
    } else if (typeof val === 'string') {
      out[key] = watermark ? encodeKey(val, fullKey) : val;
    } else if (isContainer(val)) {
      out[key] = resolveNode(
        val,
        getNestedProperty(fallback, fullKey),
        fullKey,
        fallback,
        watermark
      );
    } else if (val !== undefined) {
      out[key] = val;
    }
  }
  return out;
}

/** `options.fallback`, else, in the browser, the strings the dev server put into the page. */
function fallbackSource(options: WrapOptions): Record<string, any> | undefined {
  return (
    options.fallback ??
    (typeof window !== 'undefined' ? (window as any).__livelocale_fallback__ : undefined)
  );
}

/**
 * Set on the page, next to `__livelocale_fallback__`, when the dev server put only some
 * namespaces in it (the `fallbackNamespaces` option).
 *
 * @internal
 */
export const FALLBACK_PARTIAL_GLOBAL = '__livelocale_fallback_partial__';

const warnedNamespaces = new Set<string>();

/**
 * `key` in the fallback. When the page's strings hold only some namespaces and this key's
 * namespace is not one of them, it says so in the console, once per namespace, so a
 * client-side read the dev server left out does not go blank without a word.
 */
function fromFallback(fallbackObj: Record<string, any>, key: string, options: WrapOptions) {
  const value = getNestedProperty(fallbackObj, key);
  if (value !== undefined || options.fallback !== undefined || typeof window === 'undefined') {
    return value;
  }
  // A key under a namespace only: a read of a top-level name is also how React, JSON and
  // promises probe an object (`$$typeof`, `toJSON`, `then`).
  const dot = key.indexOf('.');
  const ns = key.slice(0, dot);
  if (dot > 0 && (window as any)[FALLBACK_PARTIAL_GLOBAL] === true && !(ns in fallbackObj)) {
    if (!warnedNamespaces.has(ns)) {
      warnedNamespaces.add(ns);
      console.warn(
        `[livelocale] "${key}" is missing, and this page's fallback strings leave out the "${ns}" namespace. Add "${ns}" to the fallbackNamespaces option of the livelocale plugin or integration.`
      );
    }
  }
  return value;
}

/**
 * The keys the fallback adds at this level of a record: those of the fallback object at the
 * same key path. None for an array or a function, whose shape is the engine's own (as in
 * `resolveTranslations`), and none for a record that cannot take new keys, since a Proxy may
 * not report a key its non-extensible target lacks.
 */
function fallbackOnlyKeys(target: object, keyPrefix: string, options: WrapOptions): string[] {
  if (typeof target !== 'object' || Array.isArray(target) || !Object.isExtensible(target)) {
    return [];
  }
  const fallbackObj = fallbackSource(options);
  const node = keyPrefix ? getNestedProperty(fallbackObj, keyPrefix) : fallbackObj;
  if (!isContainer(node) || Array.isArray(node)) return [];
  return Object.keys(node).filter(
    (key) => !Object.prototype.hasOwnProperty.call(target, key) && node[key] !== undefined
  );
}

/**
 * Calls a translation function and watermarks a string result with the key its text belongs
 * to. A result that looks missing (empty, or the key echoed back) is filled from the fallback.
 */
function watermarkCall(
  fn: (...args: unknown[]) => unknown,
  thisArg: unknown,
  args: unknown[],
  keyPrefix: string,
  options: WrapOptions
): unknown {
  const { result, key, echoes } = callEngine(fn, thisArg, args, keyPrefix);
  let resolvedValue = result;
  const isMissing =
    resolvedValue === undefined ||
    resolvedValue === null ||
    resolvedValue === '' ||
    (typeof resolvedValue === 'string' && echoes.includes(resolvedValue));

  const fallbackObj = fallbackSource(options);
  if (isMissing && fallbackObj && key) {
    const fbVal = fromFallback(fallbackObj, key, options);
    if (fbVal !== undefined) {
      resolvedValue = fbVal;
    }
  }

  if (typeof resolvedValue === 'string' && key) {
    return encodeKey(resolvedValue, key);
  }
  return resolvedValue;
}

interface EngineCall {
  result: unknown;
  /** The full key the text belongs to. */
  key: string;
  /** What the engine returns in place of text for a missing key. */
  echoes: unknown[];
}

function callEngine(
  fn: (...args: unknown[]) => unknown,
  thisArg: unknown,
  args: unknown[],
  keyPrefix: string
): EngineCall {
  // Only i18next's own t is asked for details: any other t sees exactly the call it got.
  const fixed = isFixedT(fn) ? fn : undefined;
  const detailed = fixed && withReturnDetails(args);
  let result = Reflect.apply(fn, thisArg, detailed ? detailed.args : args);
  if (fixed && detailed && isDetails(result)) {
    if (typeof result.res === 'string') {
      return fromDetails(fixed, args, detailed.options, result, keyPrefix);
    }
    // An object or array came back (`returnObjects` set in init): i18next nests a details
    // object in place of each string, so the plain result is read again.
    result = Reflect.apply(fn, thisArg, args);
  }
  const key = extractKey(args[0], keyPrefix);
  return { result, key, echoes: [args[0], key] };
}

function fromDetails(
  t: FixedT,
  args: unknown[],
  options: Record<string, any>,
  details: Details,
  keyPrefix: string
): EngineCall {
  const missing = isMissingDetails(details, args, options);
  const key = joinKey(
    namespaceOverride(t, details.usedNS, args[0], options, missing) ?? keyPrefix,
    pluralForLanguage(details.exactUsedKey, options.lng ?? t.lng, details.usedLng, options)
  );
  return {
    result: details.res,
    key,
    echoes: [args[0], details.usedKey, details.exactUsedKey, key],
  };
}

/** Whether i18next gave back the key itself, or the call's default value, for no text. */
function isMissingDetails(d: Details, args: unknown[], options: Record<string, any>): boolean {
  const defaultValue = typeof args[1] === 'string' ? args[1] : options.defaultValue;
  return d.res === d.usedKey || d.res === d.exactUsedKey || d.res === defaultValue;
}

function joinKey(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

/**
 * A t from i18next's `getFixedT`, which react-i18next's `useTranslation` returns. i18next
 * assigns it own `lng`, `ns` and `keyPrefix` properties, even when they are undefined.
 */
interface FixedT {
  (...args: unknown[]): unknown;
  lng?: string;
  ns?: string | readonly string[];
  keyPrefix?: string;
}

function isFixedT(fn: unknown): fn is FixedT {
  const own = (prop: string) => Object.prototype.hasOwnProperty.call(fn, prop);
  return typeof fn === 'function' && own('lng') && own('ns') && own('keyPrefix');
}

/** What an i18next t returns with `returnDetails: true`. */
interface Details {
  res: unknown;
  usedKey: string;
  /** The key with its plural or context suffix and i18next's own keyPrefix. */
  exactUsedKey: string;
  usedLng?: string;
  usedNS?: string;
}

function isDetails(value: unknown): value is Details {
  return (
    isContainer(value) &&
    'res' in value &&
    typeof value.usedKey === 'string' &&
    typeof value.exactUsedKey === 'string'
  );
}

/**
 * The call's arguments with `returnDetails: true` in a copy of its options, for each of
 * i18next's call shapes: `(key)`, `(key, options)` and `(key, defaultValue, options)`. None
 * when the call wants objects back, since details then nest inside them, or asked for the
 * details itself.
 */
function withReturnDetails(
  args: unknown[]
): { args: unknown[]; options: Record<string, any> } | undefined {
  const at = typeof args[1] === 'string' ? 2 : 1;
  const given = args[at];
  if (given !== undefined && !isContainer(given)) return undefined;
  if (given?.returnObjects || given?.returnDetails) return undefined;

  const detailedArgs = args.slice();
  detailedArgs[at] = { ...given, returnDetails: true };
  return { args: detailedArgs, options: given ?? {} };
}

/**
 * The namespace that takes the place of livelocale's keyPrefix when the call resolved
 * outside the t's own namespace (`t('title', { ns: 'home' })`, `t('home:title')`). A t with
 * no namespace of its own reads i18next's default one, which it does not expose, and for a
 * missing key i18next reports the last namespace it tried, not one the key is in: in both
 * cases only a namespace the call asked for counts.
 */
function namespaceOverride(
  t: FixedT,
  usedNS: string | undefined,
  keyArg: unknown,
  options: Record<string, any>,
  missing: boolean
): string | undefined {
  const own = Array.isArray(t.ns) ? t.ns[0] : t.ns;
  if (!usedNS || usedNS === own) return undefined;
  if (own !== undefined && !missing) return usedNS;

  const keys = Array.isArray(keyArg) ? keyArg : [keyArg];
  const asked =
    [options.ns].flat().includes(usedNS) ||
    keys.some((key) => typeof key === 'string' && key.startsWith(`${usedNS}:`));
  return asked ? usedNS : undefined;
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * Text from the fallback language carries that language's plural suffix: English `_other`
 * for 5, where an Arabic page's file needs `_few`. The suffix is recomputed for the page's
 * language (the call's `lng`, else the t's), so a save lands on the key the page reads.
 */
function pluralForLanguage(
  key: string,
  lng: string | undefined,
  usedLng: string | undefined,
  options: Record<string, any>
): string {
  const count = options.count;
  if (typeof count !== 'number' || options.ordinal || !lng || usedLng === lng) return key;
  if (!PLURAL_SUFFIX.test(key)) return key;
  try {
    const rules = new Intl.PluralRules(lng.replace(/_/g, '-'));
    return key.replace(PLURAL_SUFFIX, `_${rules.select(count)}`);
  } catch {
    // A language Intl does not know (i18next's 'cimode'): keep i18next's own key.
    return key;
  }
}

function buildProxy<T extends object>(target: T, keyPrefix: string, options: WrapOptions): T {
  // Without these traps, `Object.keys`, `Object.values`, `Object.entries`, spread, `in` and
  // `JSON.stringify` see only the record's own keys, while a read also finds the keys only
  // the fallback has: a half-translated namespace then enumerates fewer keys in development
  // than the merged object production gets. The fallback keys are reported as ordinary
  // configurable data properties holding the value a read gives.
  return new Proxy(target, {
    get: (obj, prop) => readProp(obj, prop),

    has(obj, prop) {
      if (Reflect.has(obj, prop)) return true;
      return typeof prop === 'string' && fallbackOnlyKeys(obj, keyPrefix, options).includes(prop);
    },

    ownKeys(obj) {
      const own = Reflect.ownKeys(obj);
      const extra = fallbackOnlyKeys(obj, keyPrefix, options);
      if (extra.length === 0) return own;
      // String keys first, as an ordinary object lists them, then its symbols.
      const strings = own.filter((key) => typeof key === 'string');
      const symbols = own.filter((key) => typeof key !== 'string');
      return [...strings, ...extra, ...symbols];
    },

    getOwnPropertyDescriptor(obj, prop) {
      const desc: PropertyDescriptor | undefined = Reflect.getOwnPropertyDescriptor(obj, prop);
      if (desc) {
        // A configurable data property may report another value; a non-configurable one
        // (an array's `length`, a frozen record) must report its own.
        if (desc.configurable && 'value' in desc) desc.value = readProp(obj, prop);
        return desc;
      }
      if (typeof prop === 'string' && fallbackOnlyKeys(obj, keyPrefix, options).includes(prop)) {
        return { value: readProp(obj, prop), writable: true, enumerable: true, configurable: true };
      }
      return undefined;
    },

    // Allow the proxy to be called directly (e.g. t('key') or t('key', { name: 'value' }))
    apply(target: any, thisArg, args: unknown[]) {
      return watermarkCall(target, thisArg, args, keyPrefix, options);
    },
  });

  // A function declaration, hoisted, so the traps above can call it.
  function readProp(obj: T, prop: string | symbol): unknown {
    if (typeof prop !== 'string') {
      const val = Reflect.get(obj, prop);
      return typeof val === 'object' && val !== null
        ? buildProxy(val as object, keyPrefix, options)
        : val;
    }

    let val = Reflect.get(obj, prop);
    const fullKey = keyPrefix ? `${keyPrefix}.${prop}` : prop;

    // If val is missing, try looking it up in fallback
    const fallbackObj = fallbackSource(options);
    if (val === undefined && fallbackObj) {
      const fbVal = fromFallback(fallbackObj, fullKey, options);
      if (fbVal !== undefined) {
        val = fbVal;
      }
    }

    // Leaf string value – encode it with its full key path
    if (typeof val === 'string') {
      return encodeKey(val, fullKey);
    }

    // Function (e.g. t() or t.raw() or t.rich() from next-intl) – wrap the call result.
    // A member of a t itself (next-intl's t.raw('title')) reads the same keys as the t, so
    // its calls keep the t's prefix rather than taking the member's name into the key.
    if (typeof val === 'function') {
      const callPrefix = typeof obj === 'function' ? keyPrefix : fullKey;
      const member = val as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => watermarkCall(member, obj, args, callPrefix, options);
    }

    // Nested object – recurse with updated key path
    if (typeof val === 'object' && val !== null) {
      return buildProxy(val as object, fullKey, options);
    }

    return val;
  }
}
