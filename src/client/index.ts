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
import { decodeKey } from './watermark.js';
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

// wrapTranslationEngine lives in wrap.ts (no 'use client') so it can also be
// imported by Server Components via 'livelocale/server'.
export { wrapTranslationEngine, wrapNextIntl, type WrapOptions } from './wrap.js';

// ─── Live preview support ───────────────────────────────────────────────────

// Text nodes mutated by APPLY_PREVIEW, with their original value so the
// preview can be reverted when the selection is cleared.
const previewNodes = new Map<Text, { key: string; original: string }>();

/**
 * Applies a live preview value to every rendered element matching `key`
 * without touching the locale files. Only the visible text after the
 * watermark prefix is replaced, keeping the watermark (and thus the
 * data-i18n-key scanner) intact.
 */
function applyPreview(key: string, value: string): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-i18n-key]');
  elements.forEach((el) => {
    if (el.getAttribute('data-i18n-key') !== key) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const node = walker.nextNode() as Text | null;
    if (!node) return;

    const raw = node.nodeValue ?? '';
    const decoded = decodeKey(raw);
    if (!decoded) return;

    // Preserve the watermark prefix, swap only the visible text
    const next = raw.slice(0, raw.length - decoded.cleanText.length) + value;
    // Skipping unchanged text avoids a mutation, so re-applying is idempotent.
    if (next === raw) return;
    if (!previewNodes.has(node)) {
      previewNodes.set(node, { key, original: raw });
    }
    node.nodeValue = next;
  });
}

/**
 * Makes a saved value the text that stays on the page. In development the
 * dev server re-renders from the edited file anyway; in preview mode the
 * deployment still serves the old text until it is rebuilt, so the Studio
 * re-sends saved values whenever the page reloads or changes.
 */
function commitPreview(key: string, value: string): void {
  applyPreview(key, value);
  previewNodes.forEach((entry, node) => {
    if (entry.key === key) previewNodes.delete(node);
  });
}

/** Restores all previewed text nodes to their pre-preview values. */
function restorePreviews(): void {
  previewNodes.forEach(({ original }, node) => {
    node.nodeValue = original;
  });
  previewNodes.clear();
}

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
    if (type === 'APPLY_PREVIEW') {
      if (payload && typeof payload.key === 'string' && typeof payload.value === 'string') {
        applyPreview(payload.key, payload.value);
      }
    } else if (type === 'COMMIT_PREVIEW') {
      if (payload && typeof payload.key === 'string' && typeof payload.value === 'string') {
        commitPreview(payload.key, payload.value);
      }
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
    }
  });

  const refresh = () => {
    if (document.body === scannedBody) return;
    // The old body, with its observer and overlay, is gone: start over on the new one.
    previewNodes.clear();
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
