import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus, SelectedElement } from '../types/index.js';
import { getAppOrigin } from '../constants.js';
import { MAX_VISIBLE_TEXTS, type VisibleText } from '../../../../client/iframe-bridge.js';
import { localeFromUrl } from '../../../locale-inference.js';
import { urlLocaleOptions } from '../../../runtime.js';

export interface ConnectionHandlers {
  onElementSelected: (element: SelectedElement) => void;
  onLocaleDetected: (locale: string) => void;
  onError: (message: string) => void;
  /** Key/text pairs the page shows now, for locale inference. */
  onVisibleTexts?: (texts: VisibleText[]) => void;
}

/** The well-formed `{ key, text }` entries of a payload, at most MAX_VISIBLE_TEXTS. */
function toVisibleTexts(payload: unknown[]): VisibleText[] {
  const texts: VisibleText[] = [];
  for (const entry of payload) {
    if (texts.length >= MAX_VISIBLE_TEXTS) break;
    if (!entry || typeof entry !== 'object') continue;
    const { key, text } = entry as { key?: unknown; text?: unknown };
    if (typeof key === 'string' && typeof text === 'string') texts.push({ key, text });
  }
  return texts;
}

/**
 * Owns the iframe bridge: connection status, message listener with origin
 * validation, and outbound commands to the embedded app preview.
 */
export const useConnection = (handlers: ConnectionHandlers) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [visibleKeys, setVisibleKeys] = useState<string[] | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Keep the latest handlers without re-subscribing the window listener.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Handle postMessage events from the embedded client iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate incoming message origin
      if (event.origin !== getAppOrigin()) {
        return;
      }

      if (event.data?.source !== 'livelocale-client') {
        return;
      }

      const { type, payload } = event.data;

      if (type === 'READY') {
        setConnectionStatus('connected');
        setCurrentPath(payload.url || '/');
        // Reset visible keys on page navigation so the sidebar shows all keys briefly
        setVisibleKeys(null);
        const locale = localeFromUrl(payload.url || '/', urlLocaleOptions());
        if (locale) handlersRef.current.onLocaleDetected(locale);
      } else if (type === 'ELEMENT_SELECTED') {
        handlersRef.current.onElementSelected(payload);
      } else if (type === 'ERROR') {
        handlersRef.current.onError(payload.error || 'Client-side error occurred.');
      } else if (type === 'VISIBLE_KEYS_CHANGED') {
        // payload is a string[] of translation keys visible on the current page
        if (Array.isArray(payload)) {
          setVisibleKeys(payload as string[]);
        }
      } else if (type === 'VISIBLE_TEXTS_CHANGED') {
        if (Array.isArray(payload)) {
          handlersRef.current.onVisibleTexts?.(toVisibleTexts(payload));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Helper to send message to iframe
  const sendToIframe = useCallback((type: string, payload?: any) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { source: 'livelocale-studio', type, payload },
        getAppOrigin()
      );
    }
  }, []);

  return {
    connectionStatus,
    currentPath,
    visibleKeys,
    iframeRef,
    sendToIframe,
  };
};
