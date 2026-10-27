'use client';

import { DOMInterceptor } from './dom-interceptor.js';
import { IframeBridge, readSameOriginParent, resolveStudioOrigin } from './iframe-bridge.js';
import { decodeKey } from './watermark.js';
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

// ─── Auto-initialization ────────────────────────────────────────────────────

// Auto-initialize the interceptor if running in the browser, in development mode,
// AND only when the page is embedded inside the studio iframe (not accessed directly).
if (
  typeof window !== 'undefined' &&
  isLiveLocaleEnabled() &&
  window.parent !== window // <-- iframe guard: only activate inside the studio
) {
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
      bridge.sendToParent('VISIBLE_TEXTS_CHANGED', interceptor.getVisibleTexts());
    }
  );

  interceptor.init();

  // Send a READY message to the parent studio
  bridge.sendToParent('READY', { url: window.location.pathname + window.location.search });

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
    }
  });

  // Attach reference to window for developer inspection/diagnostics
  (window as any).__LIVELOCALE_CLIENT__ = {
    bridge,
    interceptor,
  };
}
