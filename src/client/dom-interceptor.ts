import {
  decodeKey,
  stripWatermark,
  removeWatermarks,
  containsWatermark,
  WATERMARK_DELIMITER,
} from './watermark.js';
import { isLiveLocaleEnabled } from '../core/env.js';
import { MAX_VISIBLE_TEXTS, MAX_VISIBLE_TEXT_LENGTH, type VisibleText } from './iframe-bridge.js';

// Debounce helper: delays executing fn until after wait ms have elapsed
// since the last call. Returns a cancel function.
function debounce<T extends (...args: any[]) => void>(fn: T, wait: number): T & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced as T & { cancel(): void };
}

export class DOMInterceptor {
  private onElementSelected: (payload: {
    key: string;
    fallbackValue: string;
    currentValue: string;
  }) => void;
  private onVisibleKeysChanged?: (keys: string[]) => void;

  private hoveredElement: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private inputSanitizersAttached: boolean = false;

  // ─── Floating Overlay ────────────────────────────────────────────────────
  private overlay: HTMLDivElement | null = null;
  private overlayBadge: HTMLSpanElement | null = null;

  // ─── Alt key state ───────────────────────────────────────────────────────
  private isAltHeld: boolean = false;

  // Debounced key-broadcast to avoid flooding the parent on rapid DOM mutations
  private broadcastVisibleKeys: (() => void) & { cancel(): void };

  constructor(
    onElementSelected: (payload: {
      key: string;
      fallbackValue: string;
      currentValue: string;
    }) => void,
    onVisibleKeysChanged?: (keys: string[]) => void
  ) {
    this.onElementSelected = onElementSelected;
    this.onVisibleKeysChanged = onVisibleKeysChanged;

    this.broadcastVisibleKeys = debounce(() => {
      if (this.onVisibleKeysChanged) {
        this.onVisibleKeysChanged(this.getActiveKeys());
      }
    }, 200);
  }

  /**
   * Returns the unique set of translation keys currently visible in the DOM.
   */
  getActiveKeys(): string[] {
    const elements = document.querySelectorAll<HTMLElement>('[data-i18n-key]');
    const keys = new Set<string>();
    elements.forEach((el) => {
      const key = el.getAttribute('data-i18n-key');
      if (key) keys.add(key);
    });
    return Array.from(keys);
  }

  /**
   * Returns one `{ key, text }` per translation key on the page, in document
   * order, with the text it shows now (watermark removed, trimmed, cut to
   * `MAX_VISIBLE_TEXT_LENGTH`). The first element carrying a key wins; its
   * text is the first descendant text node whose watermark names that key.
   * Elements without such a node, and blank texts, are skipped. At most
   * `limit` entries are returned.
   */
  getVisibleTexts(limit: number = MAX_VISIBLE_TEXTS): VisibleText[] {
    const texts: VisibleText[] = [];
    const seen = new Set<string>();
    const elements = document.querySelectorAll<HTMLElement>('[data-i18n-key]');
    for (const el of elements) {
      if (texts.length >= limit) break;
      const key = el.getAttribute('data-i18n-key');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null) !== null) {
        const decoded = decodeKey(node.nodeValue ?? '');
        if (decoded?.key !== key) continue;
        const text = decoded.cleanText.trim().slice(0, MAX_VISIBLE_TEXT_LENGTH);
        if (text) texts.push({ key, text });
        break;
      }
    }
    return texts;
  }

  /**
   * Initializes the DOM event interceptors in development mode.
   * Also launches the watermark scanner and MutationObserver.
   */
  init(): void {
    // RULE CLT-004: INIT GUARD
    if (!isLiveLocaleEnabled()) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    // Inject the floating highlighter overlay into the document body
    this.injectOverlay();

    // Attach listeners on window capture phase (RULE CLT-002)
    window.addEventListener('mouseover', this.handleMouseOver, true);
    window.addEventListener('mouseout', this.handleMouseOut, true);
    window.addEventListener('click', this.handleClick, true);
    window.addEventListener('copy', this.handleCopy, true);
    window.addEventListener('paste', this.handlePaste, true);
    window.addEventListener('scroll', this.handleScroll, true);
    window.addEventListener('resize', this.handleResize, false);
    window.addEventListener('keydown', this.handleKeyDown, true);
    window.addEventListener('keyup', this.handleKeyUp, true);

    // Phase 3: Scan existing DOM for watermarked text nodes
    this.scanSubtree(document.body);

    // Phase 3: Observe future DOM mutations for watermarked nodes
    this.attachMutationObserver();

    // Phase 3: Sanitize form inputs/submissions to strip ZW chars
    this.attachInputSanitizers();

    // Broadcast the initial set of visible keys to the studio sidebar
    this.broadcastVisibleKeys();
  }

  /**
   * Cleans up all attached event listeners, the MutationObserver,
   * the floating overlay, and the form-sanitization listeners.
   */
  destroy(): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('mouseover', this.handleMouseOver, true);
    window.removeEventListener('mouseout', this.handleMouseOut, true);
    window.removeEventListener('click', this.handleClick, true);
    window.removeEventListener('copy', this.handleCopy, true);
    window.removeEventListener('paste', this.handlePaste, true);
    window.removeEventListener('scroll', this.handleScroll, true);
    window.removeEventListener('resize', this.handleResize, false);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    window.removeEventListener('keyup', this.handleKeyUp, true);
    window.removeEventListener('beforeinput', this.handleBeforeInput, true);

    // Detach form-submit sanitizer
    document.removeEventListener('submit', this.handleFormSubmit, true);

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.inputSanitizersAttached = false;

    // Remove floating overlay from DOM
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.overlayBadge = null;
    this.hoveredElement = null;

    // Cancel any pending debounced broadcasts
    this.broadcastVisibleKeys.cancel();
  }

  // ─── Floating Overlay ────────────────────────────────────────────────────

  /**
   * Creates and injects a single floating overlay div into the document body.
   * The overlay is positioned using fixed coordinates from getBoundingClientRect()
   * and uses pointer-events: none so it never blocks user interaction.
   */
  private injectOverlay(): void {
    if (this.overlay) return; // Guard against double injection

    const overlay = document.createElement('div');
    overlay.id = 'livelocale-highlighter-overlay';
    overlay.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 0',
      'height: 0',
      'pointer-events: none',
      'z-index: 2147483647', // Maximum z-index
      'box-sizing: border-box',
      'opacity: 0',
      'border-radius: 4px',
      'transition: opacity 120ms ease, top 80ms ease, left 80ms ease, width 80ms ease, height 80ms ease, border-color 150ms ease',
    ].join('; ');

    const badge = document.createElement('span');
    badge.style.cssText = [
      'position: absolute',
      'top: -22px',
      'left: 0',
      'max-width: 280px',
      'white-space: nowrap',
      'overflow: hidden',
      'text-overflow: ellipsis',
      'background: rgba(15, 20, 40, 0.92)',
      'border: 1px solid rgba(99, 102, 241, 0.5)',
      'color: #a5b4fc',
      'font-family: ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size: 10px',
      'font-weight: 600',
      'line-height: 1',
      'padding: 3px 7px',
      'border-radius: 4px',
      'letter-spacing: 0.02em',
      'backdrop-filter: blur(4px)',
      'pointer-events: none',
    ].join('; ');

    overlay.appendChild(badge);
    document.body.appendChild(overlay);

    this.overlay = overlay;
    this.overlayBadge = badge;
  }

  /**
   * Positions the floating overlay to surround the given element.
   * Uses getBoundingClientRect() for fixed-positioned geometry.
   */
  private positionOverlay(element: HTMLElement): void {
    if (!this.overlay) return;

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);
    const borderRadius = computedStyle.borderRadius || '4px';

    this.overlay.style.top = `${rect.top}px`;
    this.overlay.style.left = `${rect.left}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
    this.overlay.style.borderRadius = borderRadius;
    this.overlay.style.opacity = '1';

    this.updateOverlayStyle();
  }

  /**
   * Updates overlay border color and badge text based on current Alt key state.
   */
  private updateOverlayStyle(): void {
    if (!this.overlay || !this.overlayBadge) return;

    const key = this.hoveredElement?.getAttribute('data-i18n-key') || '';

    if (this.isAltHeld) {
      // Alt is held — bright solid border signals "click to edit"
      this.overlay.style.border = '2px solid #3b82f6';
      this.overlay.style.boxShadow =
        '0 0 0 1px rgba(59, 130, 246, 0.3), inset 0 0 0 1px rgba(59, 130, 246, 0.1)';
      this.overlayBadge.style.color = '#93c5fd';
      this.overlayBadge.style.borderColor = 'rgba(59, 130, 246, 0.6)';
      this.overlayBadge.textContent = `✎ Click to edit: ${key}`;
    } else {
      // Hover — subtle dashed border signals "Alt + Click to edit"
      this.overlay.style.border = '1.5px dashed rgba(99, 102, 241, 0.65)';
      this.overlay.style.boxShadow = '0 0 0 1px rgba(99, 102, 241, 0.15)';
      this.overlayBadge.style.color = '#a5b4fc';
      this.overlayBadge.style.borderColor = 'rgba(99, 102, 241, 0.5)';
      this.overlayBadge.textContent = `⌥ Alt+Click to edit: ${key}`;
    }
  }

  /**
   * Hides the floating overlay without removing it from the DOM.
   */
  private hideOverlay(): void {
    if (!this.overlay) return;
    this.overlay.style.opacity = '0';
  }

  // ─── Phase 3: Watermark DOM Scanner ──────────────────────────────────────

  /**
   * Walks all text nodes inside `root` and decodes any watermark prefix.
   * When found, attaches data-i18n-key / data-i18n-template to the
   * immediate parent HTMLElement without mutating the text node itself
   * (hydration safety: RULE CLT-007).
   */
  private scanSubtree(root: Node): void {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null) !== null) {
      this.processTextNode(node);
    }
  }

  private processTextNode(node: Text): void {
    const raw = node.nodeValue ?? '';
    if (!raw.includes(WATERMARK_DELIMITER)) return; // fast bail-out

    const decoded = decodeKey(raw);
    if (!decoded) return;

    const parent = node.parentElement;
    if (!parent) return;

    // RULE CLT-007: Do NOT strip the ZW chars from the text node –
    // doing so would break React's reconciliation / hydration tree.
    // Only annotate the parent element.
    parent.setAttribute('data-i18n-key', decoded.key);

    // Use the clean (visible) text as the fallback template if not already set
    if (!parent.hasAttribute('data-i18n-template')) {
      parent.setAttribute('data-i18n-template', decoded.cleanText.trim());
    }
  }

  /**
   * Attaches a MutationObserver to catch newly rendered / streamed elements.
   */
  private attachMutationObserver(): void {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      let needsBroadcast = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const added of mutation.addedNodes) {
            if (added.nodeType === Node.ELEMENT_NODE) {
              this.scanSubtree(added);
              needsBroadcast = true;
            } else if (added.nodeType === Node.TEXT_NODE) {
              this.processTextNode(added as Text);
              needsBroadcast = true;
            }
          }
        } else if (mutation.type === 'characterData') {
          if (mutation.target.nodeType === Node.TEXT_NODE) {
            this.processTextNode(mutation.target as Text);
            needsBroadcast = true;
          }
        }
      }
      if (needsBroadcast) {
        this.broadcastVisibleKeys();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // ─── Phase 3: Input & Form Sanitization ──────────────────────────────────

  /**
   * Patches input value descriptors and attaches a form submit listener
   * to strip zero-width watermark characters before any data leaves the
   * browser (preventing backend schema validation rejections or storage
   * of invisible chars).
   */
  private attachInputSanitizers(): void {
    if (this.inputSanitizersAttached) return;
    this.inputSanitizersAttached = true;

    // Capture form submissions at the document level
    document.addEventListener('submit', this.handleFormSubmit, true);

    // Intercept `beforeinput` for direct keyboard input into inputs/textareas
    window.addEventListener('beforeinput', this.handleBeforeInput, true);

    // Patch HTMLInputElement.prototype.value getter/setter
    this.patchInputValueDescriptor(HTMLInputElement.prototype);
    this.patchInputValueDescriptor(HTMLTextAreaElement.prototype);
  }

  /**
   * Patches the `value` property descriptor of an input prototype so
   * that reads return sanitized strings even if the user somehow pastes
   * watermark characters.
   */
  private patchInputValueDescriptor(proto: HTMLInputElement | HTMLTextAreaElement): void {
    const original = Object.getOwnPropertyDescriptor(proto, 'value');
    if (!original || !original.get || !original.set) return;

    // Prevent double-patching
    if ((proto as any).__liveLocaleSanitized__) return;
    (proto as any).__liveLocaleSanitized__ = true;

    Object.defineProperty(proto, 'value', {
      get() {
        const raw: string = original.get!.call(this);
        return removeWatermarks(raw);
      },
      set(val: string) {
        const clean = typeof val === 'string' ? removeWatermarks(val) : val;
        original.set!.call(this, clean);
      },
      configurable: true,
    });
  }

  private handleFormSubmit = (event: Event): void => {
    const form = event.target as HTMLFormElement | null;
    if (!form) return;

    const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    inputs.forEach((input) => {
      const cleaned = removeWatermarks(input.value);
      if (cleaned !== input.value) {
        // Use the original setter to set the cleaned value directly
        const proto =
          input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor?.set) {
          descriptor.set.call(input, cleaned);
        }
      }
    });
  };

  private handleBeforeInput = (_event: InputEvent): void => {
    // No-op: direct keyboard input doesn't contain ZW characters.
    // This listener is reserved for future clipboard paste interception.
  };

  // ─── Alt Key Tracking ─────────────────────────────────────────────────────

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Alt') {
      this.isAltHeld = true;
      // Update the overlay style immediately if an element is hovered
      if (this.hoveredElement) {
        this.updateOverlayStyle();
      }
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Alt') {
      this.isAltHeld = false;
      // Revert to the "hover hint" style
      if (this.hoveredElement) {
        this.updateOverlayStyle();
      }
    }
  };

  // ─── Viewport change handlers (reposition overlay on scroll / resize) ─────

  private handleScroll = (): void => {
    if (this.hoveredElement) {
      this.positionOverlay(this.hoveredElement);
    }
  };

  private handleResize = (): void => {
    if (this.hoveredElement) {
      this.positionOverlay(this.hoveredElement);
    }
  };

  // ─── Mouse / Click Handlers ───────────────────────────────────────────────

  private handleMouseOver = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target || typeof target.closest !== 'function') return;

    const keyedElement = target.closest('[data-i18n-key]') as HTMLElement | null;
    if (!keyedElement) {
      // Moved onto a non-keyed element — hide overlay
      if (this.hoveredElement) {
        this.hideOverlay();
        this.hoveredElement = null;
      }
      return;
    }

    // RULE CLT-003: ALWAYS CHECK data-i18n-key EXISTENCE
    const key = keyedElement.getAttribute('data-i18n-key');
    if (key === null) return;

    this.hoveredElement = keyedElement;
    this.positionOverlay(keyedElement);
  };

  private handleMouseOut = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target || typeof target.closest !== 'function') return;

    const relatedTarget = event.relatedTarget as HTMLElement | null;

    // If we're moving into a child of the same keyed element, don't hide
    if (relatedTarget && this.hoveredElement && this.hoveredElement.contains(relatedTarget)) {
      return;
    }

    const keyedElement = target.closest('[data-i18n-key]') as HTMLElement | null;
    if (!keyedElement || keyedElement !== this.hoveredElement) return;

    this.hideOverlay();
    this.hoveredElement = null;
  };

  private handleClick = (event: MouseEvent): void => {
    // Feature 1: Only intercept clicks when Alt key is held.
    // Without Alt, let the event propagate naturally so links and buttons work.
    if (!event.altKey) return;

    const target = event.target as HTMLElement | null;
    if (!target || typeof target.closest !== 'function') return;

    const keyedElement = target.closest('[data-i18n-key]') as HTMLElement | null;
    if (!keyedElement) return;

    // RULE CLT-003: ALWAYS CHECK data-i18n-key EXISTENCE
    const key = keyedElement.getAttribute('data-i18n-key');
    if (key === null) return;

    // RULE CLT-002: EVENT LISTENERS IN CAPTURE PHASE
    event.preventDefault();
    event.stopPropagation();

    // Use innerText, stripping any invisible ZW chars before sending to studio
    const rawText = keyedElement.innerText || '';
    const cleanText = stripWatermark(rawText);

    const fallbackValue = keyedElement.getAttribute('data-i18n-template') || cleanText;
    const currentValue = cleanText;

    this.onElementSelected({
      key,
      fallbackValue,
      currentValue,
    });
  };

  private handleCopy = (event: ClipboardEvent): void => {
    const selection = window.getSelection()?.toString() || '';
    if (containsWatermark(selection)) {
      const clean = removeWatermarks(selection);
      event.clipboardData?.setData('text/plain', clean);
      event.preventDefault();
    }
  };

  private handlePaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (containsWatermark(text)) {
      event.preventDefault();
      const cleaned = removeWatermarks(text);
      const targetInput = event.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (targetInput && 'value' in targetInput) {
        const proto =
          targetInput instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const nativeValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        if (nativeValueSetter) {
          const start = targetInput.selectionStart || 0;
          const end = targetInput.selectionEnd || 0;
          const val = targetInput.value;
          const cleanedValue = val.slice(0, start) + cleaned + val.slice(end);

          nativeValueSetter.call(targetInput, cleanedValue);
          targetInput.selectionStart = targetInput.selectionEnd = start + cleaned.length;

          // Dispatch bubbling input event so React virtual DOM state syncs
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  };
}
