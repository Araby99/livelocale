import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus, SelectedElement } from '../types/index.js';
import { APP_ORIGIN } from '../constants.js';

export interface ConnectionHandlers {
  onElementSelected: (element: SelectedElement) => void;
  onLocaleDetected: (locale: string) => void;
  onError: (message: string) => void;
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
      if (event.origin !== APP_ORIGIN) {
        return;
      }

      if (event.data?.source !== 'i18n-lens-client') {
        return;
      }

      const { type, payload } = event.data;

      if (type === 'READY') {
        setConnectionStatus('connected');
        setCurrentPath(payload.url || '/');
        // Reset visible keys on page navigation so the sidebar shows all keys briefly
        setVisibleKeys(null);
        // Extract locale if embedded in URL path or query params
        try {
          const urlObj = new URL(payload.url, APP_ORIGIN);
          const qLocale = urlObj.searchParams.get('locale');
          if (qLocale) {
            handlersRef.current.onLocaleDetected(qLocale);
          } else {
            const segments = urlObj.pathname.split('/');
            const possibleLocale = segments[1];
            if (possibleLocale && possibleLocale.length === 2) {
              handlersRef.current.onLocaleDetected(possibleLocale);
            }
          }
        } catch (e) {}
      } else if (type === 'ELEMENT_SELECTED') {
        handlersRef.current.onElementSelected(payload);
      } else if (type === 'ERROR') {
        handlersRef.current.onError(payload.error || 'Client-side error occurred.');
      } else if (type === 'VISIBLE_KEYS_CHANGED') {
        // payload is a string[] of translation keys visible on the current page
        if (Array.isArray(payload)) {
          setVisibleKeys(payload as string[]);
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
        { source: 'i18n-lens-studio', type, payload },
        APP_ORIGIN
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
