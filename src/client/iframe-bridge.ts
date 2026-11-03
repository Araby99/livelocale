export type ClientMessageType =
  | 'ELEMENT_SELECTED'
  | 'READY'
  | 'ERROR'
  | 'VISIBLE_KEYS_CHANGED'
  | 'VISIBLE_TEXTS_CHANGED'
  | 'LOCATION_CHANGED'
  | 'LEAVING';
export type StudioMessageType = 'APPLY_PREVIEW' | 'COMMIT_PREVIEW' | 'CLEAR_SELECTION' | 'NAVIGATE';

/** Where `livelocale studio` runs unless the Studio says otherwise. */
export const DEFAULT_STUDIO_ORIGIN = 'http://localhost:3010';

/** Session key that keeps the Studio origin across in-app navigation within one tab. */
export const STUDIO_ORIGIN_STORAGE_KEY = 'livelocale-studio-origin';

function toHttpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The origin of this page when its parent window is a different window with
 * the identical readable origin (a Studio served from the same host), else
 * `null`. Returns `toHttpOrigin(win.location.origin)` only when that is
 * non-null and equals `win.parent.location.origin`; a top-level page, a
 * missing parent, a cross-origin parent (whose `location` throws), a parent
 * on another origin and an opaque `'null'` origin all give `null`. Never throws.
 */
export function readSameOriginParent(win: Window): string | null {
  try {
    const parent = win.parent;
    if (!parent || parent === win) return null;
    const own = toHttpOrigin(win.location.origin);
    if (!own) return null;
    return parent.location.origin === own ? own : null;
  } catch {
    return null;
  }
}

/**
 * The origin of the Studio that embeds this page, in this order:
 *
 * 1. `sameOriginParent`, when it is an http(s) origin. `sendToParent` always
 *    posts to `window.parent`, so a readable same-origin parent is the only
 *    origin that can receive the messages; it wins over a stale query value or
 *    remembered origin. This branch neither reads nor writes storage.
 * 2. `?livelocale-origin=` on the iframe URL, which the Studio passes. The
 *    app's own links drop that parameter, so it is remembered for the tab;
 *    without it, messages after the first navigation would go to the default
 *    origin and be discarded.
 * 3. The origin remembered for the tab.
 * 4. `DEFAULT_STUDIO_ORIGIN`.
 */
export function resolveStudioOrigin(
  search: string,
  storage: Storage | null,
  sameOriginParent?: string | null
): string {
  const fromParent = toHttpOrigin(sameOriginParent);
  if (fromParent) return fromParent;
  const fromQuery = toHttpOrigin(new URLSearchParams(search).get('livelocale-origin'));
  if (fromQuery) {
    try {
      storage?.setItem(STUDIO_ORIGIN_STORAGE_KEY, fromQuery);
    } catch {}
    return fromQuery;
  }
  let remembered: string | null = null;
  try {
    remembered = toHttpOrigin(storage?.getItem(STUDIO_ORIGIN_STORAGE_KEY));
  } catch {}
  return remembered ?? DEFAULT_STUDIO_ORIGIN;
}

/** A key on the page with the text it shows now; the Studio infers the page locale from these. */
export interface VisibleText {
  key: string;
  text: string;
}

/** Most visible key/text pairs one VISIBLE_TEXTS_CHANGED message carries. */
export const MAX_VISIBLE_TEXTS = 100;

/** Longest text, in UTF-16 code units, one visible key/text pair carries. */
export const MAX_VISIBLE_TEXT_LENGTH = 200;

const KEY_PATTERN = /^[a-zA-Z0-9._-]+$/;

/** Longest page location, in UTF-16 code units, READY and LOCATION_CHANGED carry. */
export const MAX_LOCATION_LENGTH = 2048;

/** C0 and C1 control characters and DEL, which a URL parser strips or reads specially. */
const LOCATION_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

/** An origin a reported path is resolved against, to check that it stays on it. */
const LOCATION_PROBE_ORIGIN = 'http://livelocale.invalid';

/**
 * The `url` own string of an object payload when it is a same-origin path:
 * starts with `/`, not with `//`; holds no C0/C1 control character or DEL
 * anywhere and no backslash before its query or hash (a URL parser drops tabs
 * and newlines and reads `\` as `/`, so `/\t/host` or `/\host` would name a
 * host); still resolves on the origin it is read against; and is at most
 * MAX_LOCATION_LENGTH long. Else `null`. Never throws.
 */
export function toLocationUrl(payload: unknown): string | null {
  try {
    if (!payload || typeof payload !== 'object') return null;
    if (!Object.prototype.hasOwnProperty.call(payload, 'url')) return null;
    const url = (payload as { url?: unknown }).url;
    if (typeof url !== 'string' || url.length > MAX_LOCATION_LENGTH) return null;
    if (!url.startsWith('/') || url.startsWith('//')) return null;
    if (LOCATION_CONTROL_RE.test(url)) return null;
    if (/^[^?#]*\\/.test(url)) return null;
    if (new URL(url, LOCATION_PROBE_ORIGIN).origin !== LOCATION_PROBE_ORIGIN) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * The href a NAVIGATE payload asks for when it is safe to follow: the payload
 * is an object whose own `url` is a string of at most MAX_LOCATION_LENGTH that
 * parses on its own (relative and protocol-relative input is refused) as an
 * http(s) URL on `ownOrigin` without credentials; else `null`. Never throws.
 */
export function navigationHref(payload: unknown, ownOrigin: string): string | null {
  try {
    if (!payload || typeof payload !== 'object') return null;
    if (!Object.prototype.hasOwnProperty.call(payload, 'url')) return null;
    const url = (payload as { url?: unknown }).url;
    if (typeof url !== 'string' || url.length > MAX_LOCATION_LENGTH) return null;
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.origin !== ownOrigin || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Opens `href`, reloading when it is the current URL: assigning the current
 * URL with a hash is a fragment navigation that reloads nothing.
 */
export function followNavigation(
  loc: Pick<Location, 'href' | 'assign' | 'reload'>,
  href: string
): void {
  if (href === loc.href) loc.reload();
  else loc.assign(href);
}

export interface TranslationPayload {
  key: string;
  fallbackValue: string;
  currentValue: string;
}

export class IframeBridge {
  private allowedOrigin: string;

  constructor(allowedOrigin: string) {
    this.allowedOrigin = allowedOrigin;
  }

  /**
   * Sends a message from the iframe client to the parent Studio window.
   */
  sendToParent(type: ClientMessageType, payload?: any): void {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) {
      // Not in an iframe context
      return;
    }

    // RULE CLT-006: PAYLOAD SANITIZATION
    if (type === 'ELEMENT_SELECTED') {
      const p = payload as TranslationPayload;
      if (
        !p ||
        typeof p.key !== 'string' ||
        p.key.trim() === '' ||
        !/^[a-zA-Z0-9._-]+$/.test(p.key) ||
        typeof p.currentValue !== 'string'
      ) {
        // Drop invalid payload silently
        return;
      }
    }

    if (type === 'VISIBLE_KEYS_CHANGED') {
      // Validate payload is an array of valid key strings
      if (!Array.isArray(payload)) return;
      const validKeys = (payload as unknown[]).filter(
        (k): k is string => typeof k === 'string' && /^[a-zA-Z0-9._-]+$/.test(k)
      );
      // Replace the payload with the sanitized array
      payload = validKeys;
    }

    if (type === 'VISIBLE_TEXTS_CHANGED') {
      if (!Array.isArray(payload)) return;
      const texts: VisibleText[] = [];
      for (const entry of payload as unknown[]) {
        if (texts.length >= MAX_VISIBLE_TEXTS) break;
        if (!entry || typeof entry !== 'object') continue;
        const { key, text } = entry as { key?: unknown; text?: unknown };
        if (typeof key !== 'string' || !KEY_PATTERN.test(key) || typeof text !== 'string') {
          continue;
        }
        texts.push({ key, text: text.slice(0, MAX_VISIBLE_TEXT_LENGTH) });
      }
      payload = texts;
    }

    if (type === 'READY' || type === 'LOCATION_CHANGED') {
      // Never dropped: the Studio must connect, and learn when the location is unknown.
      const url = toLocationUrl(payload);
      payload = url === null ? {} : { url };
    }

    const message = {
      source: 'livelocale-client',
      type,
      payload,
    };

    window.parent.postMessage(message, this.allowedOrigin);
  }

  /**
   * Sets up a listener for messages originating from the parent Studio dashboard.
   */
  listenToParent(callback: (type: StudioMessageType, payload: any) => void): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const listener = (event: MessageEvent) => {
      // RULE CLT-005: MESSAGE ORIGIN VALIDATION
      if (event.origin !== this.allowedOrigin) {
        return;
      }
      if (event.data?.source !== 'livelocale-studio') {
        return;
      }

      const { type, payload } = event.data;
      callback(type, payload);
    };

    window.addEventListener('message', listener);

    // Return a function to clean up the event listener
    return () => {
      window.removeEventListener('message', listener);
    };
  }
}
