import { encodeKey } from './watermark.js';

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
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'development') {
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

function buildProxy<T extends object>(target: T, keyPrefix: string, options: WrapOptions): T {
  return new Proxy(target, {
    get(obj, prop: string | symbol) {
      if (typeof prop !== 'string') {
        const val = Reflect.get(obj, prop);
        return typeof val === 'object' && val !== null
          ? buildProxy(val as object, keyPrefix, options)
          : val;
      }

      let val = Reflect.get(obj, prop);
      const fullKey = keyPrefix ? `${keyPrefix}.${prop}` : prop;

      // If val is missing, try looking it up in fallback
      const fallbackObj =
        options.fallback ??
        (typeof window !== 'undefined' ? (window as any).__i18n_lens_fallback__ : undefined);
      if (val === undefined && fallbackObj) {
        const fbVal = getNestedProperty(fallbackObj, fullKey);
        if (fbVal !== undefined) {
          val = fbVal;
        }
      }

      // Leaf string value – encode it with its full key path
      if (typeof val === 'string') {
        return encodeKey(val, fullKey);
      }

      // Function (e.g. t() or t.raw() or t.rich() from next-intl) – wrap the call result
      if (typeof val === 'function') {
        return (...args: unknown[]) => {
          const result = (val as (...args: unknown[]) => unknown).apply(obj, args);
          const calledKey = extractKey(args[0], fullKey);

          let resolvedValue = result;
          const isMissing =
            resolvedValue === undefined ||
            resolvedValue === null ||
            resolvedValue === '' ||
            (typeof resolvedValue === 'string' &&
              (resolvedValue === args[0] || resolvedValue === calledKey));

          if (isMissing && fallbackObj && calledKey) {
            const fbVal = getNestedProperty(fallbackObj, calledKey);
            if (fbVal !== undefined) {
              resolvedValue = fbVal;
            }
          }

          if (typeof resolvedValue === 'string' && calledKey) {
            return encodeKey(resolvedValue, calledKey);
          }
          return resolvedValue;
        };
      }

      // Nested object – recurse with updated key path
      if (typeof val === 'object' && val !== null) {
        return buildProxy(val as object, fullKey, options);
      }

      return val;
    },

    // Allow the proxy to be called directly (e.g. t('key') or t('key', { name: 'value' }))
    apply(target: any, thisArg, args: unknown[]) {
      const result = Reflect.apply(target, thisArg, args);
      const calledKey = extractKey(args[0], keyPrefix);

      const fallbackObj =
        options.fallback ??
        (typeof window !== 'undefined' ? (window as any).__i18n_lens_fallback__ : undefined);
      let resolvedValue = result;
      const isMissing =
        resolvedValue === undefined ||
        resolvedValue === null ||
        resolvedValue === '' ||
        (typeof resolvedValue === 'string' &&
          (resolvedValue === args[0] || resolvedValue === calledKey));

      if (isMissing && fallbackObj && calledKey) {
        const fbVal = getNestedProperty(fallbackObj, calledKey);
        if (fbVal !== undefined) {
          resolvedValue = fbVal;
        }
      }

      if (typeof resolvedValue === 'string' && calledKey) {
        return encodeKey(resolvedValue, calledKey);
      }
      return resolvedValue;
    },
  });
}
