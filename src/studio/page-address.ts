import { readablePath } from '../core/page-path.js';
import { localeFromUrl, urlWithLocale } from './locale-inference.js';

/**
 * The Studio's model of a preview page address: what the address field shows for an app path,
 * which app path a typed address opens (or refuses), and the iframe URL for an app path.
 * Pure; every check runs on the parsed URL.
 */

/** What an address is shown and resolved against. */
export interface AddressContext {
  /** Origin of the application under edit. */
  appOrigin: string;
  /** The path the app's pages live under: starts and ends with `/`, encoded. */
  base: string;
  /** The Studio's locale in server mode (its `?locale=` is not shown), null in share mode. */
  hideLocale: string | null;
  /** `base + SHARE_DIR + '/'` in share mode (never opened in the preview), null in server mode. */
  shareDir: string | null;
}

/** The query parameter that tells the client which Studio origin to talk to. */
const ORIGIN_PARAM = 'livelocale-origin';

/** A value that starts with a URL scheme (`http:`, `javascript:`, `mailto:`). */
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** `search` without the parameters `drop` selects, each kept one in its original encoding. */
function filterSearch(search: string, drop: (name: string, value: string) => boolean): string {
  if (search === '' || search === '?') return search;
  const parts = search.slice(1).split('&');
  const kept = parts.filter((part) => {
    const entry = new URLSearchParams(part).entries().next();
    if (entry.done) return true;
    const [name, value] = entry.value;
    return !drop(name, value);
  });
  if (kept.length === parts.length) return search;
  return kept.length === 0 ? '' : `?${kept.join('&')}`;
}

/**
 * The address field's text for `appPath`: without the Studio's `livelocale-origin` parameter or
 * a `locale` equal to `ctx.hideLocale`, relative to `ctx.base` (a path outside it is shown
 * whole), hash kept, non-ASCII characters decoded.
 */
export function toDisplayPath(appPath: string, ctx: AddressContext): string {
  const url = new URL(appPath, ctx.appOrigin);
  const search = filterSearch(
    url.search,
    (name, value) => name === ORIGIN_PARAM || (name === 'locale' && value === ctx.hideLocale)
  );
  let path = url.pathname;
  if (path.startsWith(ctx.base)) path = `/${path.slice(ctx.base.length)}`;
  else if (path === ctx.base.slice(0, -1)) path = '/';
  return readablePath(path + search + url.hash);
}

/**
 * The absolute app path (`pathname + search + hash`) a typed address opens, or null when it is
 * refused: another origin, credentials, outside `ctx.base`, or inside `ctx.shareDir`. A full
 * `http(s)` URL on the app's origin is used as is; anything else is taken relative to the base.
 */
export function resolveAddress(input: string, ctx: AddressContext): string | null {
  const value = input.trim();
  let candidate: string;
  if (value === '') {
    candidate = ctx.base;
  } else if (HAS_SCHEME.test(value)) {
    if (!/^https?:/i.test(value)) return null;
    candidate = value;
  } else {
    const rooted = value.startsWith('/') ? value : `/${value}`;
    candidate = ctx.base + rooted.slice(1);
  }

  let url: URL;
  try {
    url = new URL(candidate, ctx.appOrigin);
  } catch {
    return null;
  }
  if (url.origin !== ctx.appOrigin) return null;
  if (url.username !== '' || url.password !== '') return null;
  const { pathname } = url;
  if (!pathname.startsWith(ctx.base) && pathname !== ctx.base.slice(0, -1)) return null;
  if (ctx.shareDir !== null && inShareDir(pathname, ctx.base, ctx.shareDir)) return null;
  return pathname + url.search + url.hash;
}

/**
 * Whether `pathname` (normalised, under `base`) opens the share folder: its first segment after
 * `base`, percent-decoded and cut at a decoded `/` or `\`, equals the folder's name ignoring
 * case, with or without a trailing slash. Static hosts decode paths and some fold case.
 */
function inShareDir(pathname: string, base: string, shareDir: string): boolean {
  if (!shareDir.startsWith(base)) return pathname.startsWith(shareDir);
  const folder = shareDir.slice(base.length).replace(/\/+$/, '');
  const segment = pathname.slice(base.length).split('/', 1)[0] ?? '';
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A malformed escape stays as typed; the host cannot decode it to the folder either.
  }
  const name = decoded.split(/[/\\]/, 1)[0] ?? '';
  return name.toLowerCase() === folder.toLowerCase();
}

/**
 * `target` in the language the preview shows: unchanged when it names a locale itself or
 * `current` names none, else marked with `locale` the way the site marks it.
 */
export function withPageLocale(
  target: string,
  current: string,
  locale: string,
  options: { basePath?: string; locales?: readonly string[] }
): string {
  if (localeFromUrl(target, options) !== null) return target;
  if (localeFromUrl(current, options) === null) return target;
  return urlWithLocale(target, locale, options) ?? target;
}

/** The iframe URL for `appPath`: on `appOrigin`, with `livelocale-origin=<studioOrigin>` set. */
export function frameSrc(appPath: string, appOrigin: string, studioOrigin: string): string {
  const url = new URL(appPath, appOrigin);
  const search = filterSearch(url.search, (name) => name === ORIGIN_PARAM);
  const param = `${ORIGIN_PARAM}=${encodeURIComponent(studioOrigin)}`;
  url.search = search === '' || search === '?' ? param : `${search}&${param}`;
  return url.href;
}
