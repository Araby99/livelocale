export type ClientMessageType = 'ELEMENT_SELECTED' | 'READY' | 'ERROR' | 'VISIBLE_KEYS_CHANGED';
export type StudioMessageType = 'APPLY_PREVIEW' | 'COMMIT_PREVIEW' | 'CLEAR_SELECTION';

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
