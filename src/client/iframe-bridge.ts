export type ClientMessageType = 'ELEMENT_SELECTED' | 'READY' | 'ERROR' | 'VISIBLE_KEYS_CHANGED';
export type StudioMessageType = 'APPLY_PREVIEW' | 'COMMIT_PREVIEW' | 'CLEAR_SELECTION';

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
 * The origin of the Studio that embeds this page. The Studio passes it as
 * `?livelocale-origin=` on the iframe URL, but the app's own links drop that
 * parameter, so it is remembered for the tab; without it, messages after the
 * first navigation would go to the default origin and be discarded.
 */
export function resolveStudioOrigin(search: string, storage: Storage | null): string {
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
