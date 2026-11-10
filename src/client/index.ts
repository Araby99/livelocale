'use client';

import { DOMInterceptor } from './dom-interceptor.js';
import {
  CLIENT_FEATURES,
  IframeBridge,
  followNavigation,
  navigationHref,
  readSameOriginParent,
  resolveStudioOrigin,
} from './iframe-bridge.js';
import {
  applyPreview,
  commitPreview,
  forgetPreviews,
  restorePreview,
  restorePreviews,
} from './preview.js';
import { watchLocation } from './location-watch.js';
import { isLiveLocaleEnabled } from '../core/env.js';

export { DOMInterceptor } from './dom-interceptor.js';
export {
  IframeBridge,
  type TranslationPayload,
  type ClientMessageType,
  type StudioMessageType,
  type VisibleText,
} from './iframe-bridge.js';
export {
  encodeKey,
  decodeKey,
  stripWatermark,
  sanitizeZeroWidth,
  removeWatermarks,
  hasWatermark,
  unwrap,
} from './watermark.js';

// wrapTranslationEngine lives in wrap.ts (no 'use client') so it can also be imported
// through 'livelocale/wrap', which works in Server, Client and shared components and
// does not carry this in-page client into a production bundle.
export { wrapTranslationEngine, wrapNextIntl, type WrapOptions } from './wrap.js';

/// ─── Start ──────────────────────────────────────────────────────────────────

/** The running client, on `window` so a second copy of this module finds it. */
interface ClientHandle {
  bridge: IframeBridge;
  interceptor: DOMInterceptor;
  /** Rescans the page when its `<body>` was replaced (Astro view transitions). */
  refresh?: () => void;
}

/**
 * Starts the in-page client: the element picker, the live preview and the link to the
 * Studio. It starts only in the browser, while LiveLocale is on, and only when the page is
 * framed (inside the Studio); otherwise it does nothing and returns `false`.
 *
 * Importing `livelocale/client` already calls it, so most apps never do. Call it yourself
 * when your page replaces `<body>` without a full load (Astro view transitions do): a
 * second call never starts a second client, it rescans the new body.
 *
 * @example
 * // A page without React: plain Vite, Vue, Svelte.
 * import { startLiveLocale } from 'livelocale/client';
 * startLiveLocale();
 */
export function startLiveLocale(): boolean {
  if (typeof window === 'undefined' || !isLiveLocaleEnabled() || window.parent === window) {
    return false;
  }
  const running = (window as any).__LIVELOCALE_CLIENT__ as ClientHandle | undefined;
  if (running) {
    running.refresh?.();
    return true;
  }

  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {}
  const allowedOrigin = resolveStudioOrigin(
    window.location.search,
    storage,
    readSameOriginParent(window)
  );

  const bridge = new IframeBridge(allowedOrigin);
  const interceptor = new DOMInterceptor(
    (payload) => {
      bridge.sendToParent('ELEMENT_SELECTED', payload);
    },
    (keys) => {
      bridge.sendToParent('VISIBLE_KEYS_CHANGED', keys);
      bridge.sendToParent('RENDERED_KEYS_CHANGED', interceptor.getRenderedKeys());
      bridge.sendToParent('VISIBLE_TEXTS_CHANGED', interceptor.getVisibleTexts());
    },
    () => {
      bridge.sendToParent('TAP_UNKEYED');
    }
  );

  interceptor.init();
  let scannedBody = document.body;

  const locationUrl = () =>
    window.location.pathname + window.location.search + window.location.hash;

  // Send a READY message to the parent studio
  bridge.sendToParent('READY', { url: locationUrl(), features: CLIENT_FEATURES });

  // Report client-side navigations, say when this document goes away (the
  // next one may have no client to answer), and greet again when the
  // back-forward cache restores it.
  watchLocation(window, (url) => bridge.sendToParent('LOCATION_CHANGED', { url }));
  window.addEventListener('pagehide', () => bridge.sendToParent('LEAVING'));
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      bridge.sendToParent('READY', { url: locationUrl(), features: CLIENT_FEATURES });
    }
  });

  // Listen to studio commands
  bridge.listenToParent((type, payload) => {
    if (type === 'APPLY_PREVIEW' || type === 'COMMIT_PREVIEW') {
      if (payload && typeof payload.key === 'string' && typeof payload.value === 'string') {
        // The stored value the page shows now, when the Studio knows it: lets rich text be matched.
        const source = typeof payload.source === 'string' ? payload.source : undefined;
        if (type === 'APPLY_PREVIEW') applyPreview(payload.key, payload.value, source);
        else commitPreview(payload.key, payload.value, source);
      }
    } else if (type === 'RESTORE_PREVIEW') {
      // One key's unsaved text was discarded; the selection and its highlight stay.
      if (payload && typeof payload.key === 'string') restorePreview(payload.key);
    } else if (type === 'CLEAR_SELECTION') {
      // Revert any live preview, then re-trigger/reset interceptor highlight states
      restorePreviews();
      interceptor.destroy();
      interceptor.init();
    } else if (type === 'NAVIGATE') {
      const href = navigationHref(payload, window.location.origin);
      if (href !== null) followNavigation(window.location, href);
    } else if (type === 'SET_EDIT_MODE') {
      if (payload && typeof payload.on === 'boolean') {
        interceptor.setEditMode(payload.on);
      }
    } else if (type === 'SELECT_KEY') {
      if (payload && typeof payload.key === 'string') {
        interceptor.selectKey(payload.key);
      }
    } else if (type === 'REVEAL_KEY') {
      if (
        payload &&
        typeof payload.key === 'string' &&
        typeof payload.bottomInset === 'number' &&
        Number.isFinite(payload.bottomInset) &&
        payload.bottomInset >= 0
      ) {
        interceptor.revealKey(payload.key, payload.bottomInset);
      }
    } else if (type === 'JUMP_TO_KEY') {
      // A key opened from the Studio's Keys list: show it, and say whether it is on the page.
      const bottomInset = payload?.bottomInset ?? 0;
      if (
        payload &&
        typeof payload.key === 'string' &&
        typeof bottomInset === 'number' &&
        Number.isFinite(bottomInset) &&
        bottomInset >= 0
      ) {
        const result = interceptor.jumpToKey(payload.key, bottomInset);
        bridge.sendToParent('KEY_JUMPED', { key: payload.key, result });
      }
    }
  });

  const refresh = () => {
    if (document.body === scannedBody) return;
    // The old body, with its observer and overlay, is gone: start over on the new one.
    forgetPreviews();
    interceptor.destroy();
    interceptor.init();
    scannedBody = document.body;
  };

  // Attach reference to window for developer inspection/diagnostics
  const handle: ClientHandle = { bridge, interceptor, refresh };
  (window as any).__LIVELOCALE_CLIENT__ = handle;
  return true;
}

// ─── Auto-initialization ────────────────────────────────────────────────────

// Start on import when running in the browser, with LiveLocale on, and only when the page
// is embedded inside the studio iframe (not accessed directly).
startLiveLocale();
