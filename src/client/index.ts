'use client';

import { DOMInterceptor } from './dom-interceptor.js';
import { IframeBridge } from './iframe-bridge.js';
import { decodeKey } from './watermark.js';
import { isLensEnabled } from '../core/env.js';

export { DOMInterceptor } from './dom-interceptor.js';
export {
  IframeBridge,
  type TranslationPayload,
  type ClientMessageType,
  type StudioMessageType,
} from './iframe-bridge.js';
export {
  encodeKey,
  decodeKey,
  stripWatermark,
  sanitizeZeroWidth,
  hasWatermark,
} from './watermark.js';

// wrapTranslationEngine lives in wrap.ts (no 'use client') so it can also be
// imported by Server Components via 'next-i18n-lens/server'.
export { wrapTranslationEngine, wrapNextIntl, type WrapOptions } from './wrap.js';

// ─── Live preview support ───────────────────────────────────────────────────

// Text nodes mutated by APPLY_PREVIEW, keyed to their original value so the
// preview can be reverted when the selection is cleared.
const previewNodes = new Map<Text, string>();

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

    if (!previewNodes.has(node)) {
      previewNodes.set(node, raw);
    }
    // Preserve the watermark prefix, swap only the visible text
    node.nodeValue = raw.slice(0, raw.length - decoded.cleanText.length) + value;
  });
}

/** Restores all previewed text nodes to their pre-preview values. */
function restorePreviews(): void {
  previewNodes.forEach((original, node) => {
    node.nodeValue = original;
  });
  previewNodes.clear();
}

// ─── Auto-initialization ────────────────────────────────────────────────────

// Auto-initialize the interceptor if running in the browser, in development mode,
// AND only when the page is embedded inside the studio iframe (not accessed directly).
if (
  typeof window !== 'undefined' &&
  isLensEnabled() &&
  window.parent !== window // <-- iframe guard: only activate inside the studio
) {
  const urlParams = new URLSearchParams(window.location.search);
  const allowedOrigin = urlParams.get('i18n-lens-origin') || 'http://localhost:3010';

  const bridge = new IframeBridge(allowedOrigin);
  const interceptor = new DOMInterceptor(
    (payload) => {
      bridge.sendToParent('ELEMENT_SELECTED', payload);
    },
    (keys) => {
      bridge.sendToParent('VISIBLE_KEYS_CHANGED', keys);
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
    } else if (type === 'CLEAR_SELECTION') {
      // Revert any live preview, then re-trigger/reset interceptor highlight states
      restorePreviews();
      interceptor.destroy();
      interceptor.init();
    }
  });

  // Attach reference to window for developer inspection/diagnostics
  (window as any).__NEXT_I18N_LENS_CLIENT__ = {
    bridge,
    interceptor,
  };
}
