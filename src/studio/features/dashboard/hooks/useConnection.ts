import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus, SelectedElement } from '../types/index.js';
import { getAppOrigin } from '../constants.js';
import {
  KEY_JUMP_RESULTS,
  MAX_VISIBLE_TEXTS,
  toLocationUrl,
  type KeyJumpResult,
  type VisibleText,
} from '../../../../client/iframe-bridge.js';
import { localeFromUrl } from '../../../locale-inference.js';
import { getStudioRuntime, urlLocaleOptions } from '../../../runtime.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';

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

/** The string entries of a key list payload. */
const toKeys = (payload: unknown[]): string[] =>
  payload.filter((key): key is string => typeof key === 'string');

/** Whether a READY payload lists `feature` among what the client can do. */
const hasFeature = (payload: unknown, feature: string): boolean => {
  const features = (payload as { features?: unknown } | null | undefined)?.features;
  return Array.isArray(features) && features.includes(feature);
};

/** The page's answer to a JUMP_TO_KEY; `seq` makes every answer a new value. */
export interface KeyJumpAnswer {
  key: string;
  result: KeyJumpResult;
  seq: number;
}

/** A KEY_JUMPED payload's key and result, or null when it is malformed. */
const toKeyJump = (payload: unknown): Omit<KeyJumpAnswer, 'seq'> | null => {
  const { key, result } = (payload ?? {}) as { key?: unknown; result?: unknown };
  if (typeof key !== 'string' || !KEY_JUMP_RESULTS.includes(result as KeyJumpResult)) return null;
  return { key, result: result as KeyJumpResult };
};

/**
 * The app path the preview opens first, shown until the client reports one: the path of a
 * `?app=` URL such as `http://localhost:4321/ar/` on a server stack, else `/`.
 */
function initialPath(): string {
  const runtime = getStudioRuntime();
  if (runtime.kind !== 'server') return '/';
  try {
    const url = new URL(runtime.appUrl);
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

/**
 * Owns the iframe bridge: connection status, message listener with origin
 * validation, and outbound commands to the embedded app preview.
 */
export const useConnection = (handlers: ConnectionHandlers) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [visibleKeys, setVisibleKeys] = useState<string[] | null>(null);
  // True while the document in the frame has a live client at `currentPath`.
  const [locationKnown, setLocationKnown] = useState(false);
  // Bumped on every location the client reports, even a repeat of the same path.
  const [locationSeq, setLocationSeq] = useState(0);
  // Bumped on every READY: each new document must be told the Studio's Edit mode again.
  const [readySeq, setReadySeq] = useState(0);
  // The latest client said it understands Edit mode; an older one keeps view-only behaviour.
  const [supportsEditMode, setSupportsEditMode] = useState(false);
  // The latest client can scroll to a key from the Keys list; an older one is never asked.
  const [supportsKeyJump, setSupportsKeyJump] = useState(false);
  // The page's latest answer to a jump request.
  const [keyJumpAnswer, setKeyJumpAnswer] = useState<KeyJumpAnswer | null>(null);
  // Keys with a visible element on the page, in document order (for Next missing).
  const [renderedKeys, setRenderedKeys] = useState<string[] | null>(null);
  // Bumped on every tap on text that has no translation key.
  const [unkeyedTapSeq, setUnkeyedTapSeq] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Keep the latest handlers without re-subscribing the window listener.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  // The listener reads the current language's text without re-subscribing.
  const { t } = useStudioText();
  const textRef = useRef(t);
  textRef.current = t;

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

      // Takes a reported location; returns false (location unknown) when it is unusable.
      const followLocation = (): boolean => {
        const url = toLocationUrl(payload);
        if (url === null) {
          setLocationKnown(false);
          return false;
        }
        setCurrentPath(url);
        setLocationKnown(true);
        setLocationSeq((seq) => seq + 1);
        const locale = localeFromUrl(url, urlLocaleOptions());
        if (locale) handlersRef.current.onLocaleDetected(locale);
        return true;
      };

      if (type === 'READY') {
        setConnectionStatus('connected');
        setSupportsEditMode(hasFeature(payload, 'edit-mode'));
        setSupportsKeyJump(hasFeature(payload, 'key-jump'));
        setRenderedKeys(null);
        setReadySeq((seq) => seq + 1);
        // Reset visible keys on page navigation so the sidebar shows all keys briefly
        if (followLocation()) setVisibleKeys(null);
      } else if (type === 'LOCATION_CHANGED') {
        // The interceptor's mutation observer reports the new page's keys.
        followLocation();
      } else if (type === 'LEAVING') {
        // The next document may have no client; keep the status to avoid a
        // connecting overlay on every link click.
        setLocationKnown(false);
      } else if (type === 'ELEMENT_SELECTED') {
        handlersRef.current.onElementSelected(payload);
      } else if (type === 'ERROR') {
        handlersRef.current.onError(payload.error || textRef.current('errors.client_error'));
      } else if (type === 'VISIBLE_KEYS_CHANGED') {
        // payload is a string[] of translation keys visible on the current page
        if (Array.isArray(payload)) {
          setVisibleKeys(payload as string[]);
        }
      } else if (type === 'RENDERED_KEYS_CHANGED') {
        if (Array.isArray(payload)) {
          setRenderedKeys(toKeys(payload));
        }
      } else if (type === 'KEY_JUMPED') {
        const answer = toKeyJump(payload);
        if (answer) setKeyJumpAnswer((last) => ({ ...answer, seq: (last?.seq ?? 0) + 1 }));
      } else if (type === 'TAP_UNKEYED') {
        setUnkeyedTapSeq((seq) => seq + 1);
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

  // Edit mode freezes the page and turns taps into selections.
  const setSiteEditMode = useCallback(
    (on: boolean) => sendToIframe('SET_EDIT_MODE', { on }),
    [sendToIframe]
  );
  // Scrolls the first visible element with `key` into view and selects it.
  const selectKeyInPage = useCallback(
    (key: string) => sendToIframe('SELECT_KEY', { key }),
    [sendToIframe]
  );
  // Scrolls so the key's text sits above `bottomInset` CSS px from the frame's bottom.
  const revealKeyInPage = useCallback(
    (key: string, bottomInset: number) => sendToIframe('REVEAL_KEY', { key, bottomInset }),
    [sendToIframe]
  );
  // Scrolls to `key` and shows it as selected without selecting it again (see KEY_JUMPED).
  const jumpToKeyInPage = useCallback(
    (key: string, bottomInset: number) => sendToIframe('JUMP_TO_KEY', { key, bottomInset }),
    [sendToIframe]
  );

  return {
    connectionStatus,
    currentPath,
    locationKnown,
    locationSeq,
    readySeq,
    visibleKeys,
    renderedKeys,
    supportsEditMode,
    supportsKeyJump,
    keyJumpAnswer,
    unkeyedTapSeq,
    iframeRef,
    sendToIframe,
    setSiteEditMode,
    selectKeyInPage,
    revealKeyInPage,
    jumpToKeyInPage,
  };
};
