import {
  decodeKey,
  stripWatermark,
  removeWatermarks,
  containsWatermark,
  WATERMARK_DELIMITER,
} from './watermark.js';
import { isLiveLocaleEnabled } from '../core/env.js';
import {
  MAX_VISIBLE_TEXTS,
  MAX_VISIBLE_TEXT_LENGTH,
  type KeyJumpResult,
  type VisibleText,
} from './iframe-bridge.js';

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

/** Form controls a tap in Edit mode must not focus (focusing pops the phone keyboard). */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** Id of the stylesheet that outlines keyed text in Edit mode. */
const EDIT_STYLE_ID = 'livelocale-edit-style';

/** Attribute on `<html>` while Edit mode is on; the stylesheet keys off it. */
const EDIT_ATTRIBUTE = 'data-livelocale-edit';

/**
 * Attribute on the keyed element picked in Edit mode, drawn as a solid amber outline so the
 * person can see which text the Studio's editor is for. Cleared with the selection.
 */
const PICKED_ATTRIBUTE = 'data-livelocale-picked';

/** Space, in CSS px, kept between a revealed element and the frame's edges. */
const REVEAL_MARGIN = 16;

/** Attribute on the overlay while it pulses on text the Studio jumped to. */
const JUMP_ATTRIBUTE = 'data-livelocale-jump';

/** How long, in ms, the pulse on jumped-to text lasts. */
const JUMP_PULSE_MS = 1400;

/** Whether the person asked the system for less motion. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Whether the element is rendered and visible: not under `display: none`,
 * `visibility: hidden` or zero opacity, and with a non-empty box.
 */
function isRendered(el: HTMLElement): boolean {
  const visible =
    typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : el.getClientRects().length > 0;
  if (!visible) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Whether some of the element's box lies across the frame's width and inside
 * every parent that clips its content (overflow other than `visible`). Text
 * on a carousel slide moved off to the side fails this, though it is rendered.
 */
function isOnScreenSideways(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
  for (let parent = el.parentElement; parent !== null; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement) break;
    const style = window.getComputedStyle(parent);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const box = parent.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (
      rect.right <= box.left ||
      rect.left >= box.right ||
      rect.bottom <= box.top ||
      rect.top >= box.bottom
    ) {
      return false;
    }
  }
  return true;
}

/** Whether the element holds non-blank text directly (not only inside children). */
function hasOwnText(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && (child.nodeValue ?? '').trim() !== '') return true;
  }
  return false;
}

/**
 * The in-page engine the client starts on its own inside the Studio.
 *
 * @internal Not part of the public API: semver does not cover it and it may change in any
 * release. See https://livelocale.js.org/docs/reference/stability.html
 */
export class DOMInterceptor {
  private onElementSelected: (payload: {
    key: string;
    fallbackValue: string;
    currentValue: string;
  }) => void;
  private onVisibleKeysChanged?: (keys: string[]) => void;
  private onUnkeyedTap?: () => void;

  private hoveredElement: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private inputSanitizersAttached: boolean = false;

  // ─── Floating Overlay ────────────────────────────────────────────────────
  private overlay: HTMLDivElement | null = null;
  private overlayBadge: HTMLSpanElement | null = null;

  // ─── Alt key state ───────────────────────────────────────────────────────
  private isAltHeld: boolean = false;

  // ─── Edit mode (touch) ───────────────────────────────────────────────────
  // Kept across destroy()/init() so the Studio's CLEAR_SELECTION, which
  // re-inits the interceptor, never unfreezes the site.
  private editMode: boolean = false;
  private active: boolean = false;
  /** The element carrying `PICKED_ATTRIBUTE`, if any. */
  private pickedElement: HTMLElement | null = null;

  // ─── Jump from the Studio's Keys list ────────────────────────────────────
  /** The element the Studio last jumped to; the overlay shows it as selected. */
  private jumpedElement: HTMLElement | null = null;
  private jumpTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounced key-broadcast to avoid flooding the parent on rapid DOM mutations
  private broadcastVisibleKeys: (() => void) & { cancel(): void };

  constructor(
    onElementSelected: (payload: {
      key: string;
      fallbackValue: string;
      currentValue: string;
    }) => void,
    onVisibleKeysChanged?: (keys: string[]) => void,
    onUnkeyedTap?: () => void
  ) {
    this.onElementSelected = onElementSelected;
    this.onVisibleKeysChanged = onVisibleKeysChanged;
    this.onUnkeyedTap = onUnkeyedTap;

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
   * Returns the unique keys that have at least one rendered, visible element
   * (see `isRendered`), in document order. Keys only inside closed menus,
   * hidden slides or a layout hidden at this width are left out.
   */
  getRenderedKeys(): string[] {
    const keys = new Set<string>();
    document.querySelectorAll<HTMLElement>('[data-i18n-key]').forEach((el) => {
      const key = el.getAttribute('data-i18n-key');
      if (key && !keys.has(key) && isRendered(el)) keys.add(key);
    });
    return Array.from(keys);
  }

  /** The first rendered, visible element carrying `key`, else `null`. */
  private findRenderedElement(key: string): HTMLElement | null {
    for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-key]')) {
      if (el.getAttribute('data-i18n-key') === key && isRendered(el)) return el;
    }
    return null;
  }

  /**
   * Scrolls the first visible element with `key` to the centre and selects
   * it as a tap would. Returns false, selecting nothing, when no element with
   * that key is visible or the interceptor is not running. A key that is no
   * longer visible (a carousel moved on with no DOM change the observer sees)
   * reports the keys again, so the Studio's next try uses a fresh list.
   */
  selectKey(key: string): boolean {
    if (!this.active) return false;
    const el = this.findRenderedElement(key);
    if (!el) {
      this.broadcastVisibleKeys();
      return false;
    }
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
    this.select(el, key);
    return true;
  }

  /**
   * Scrolls so the first visible element with `key` sits fully between the
   * frame's top and `bottomInset` CSS px above its bottom (where the Studio's
   * sheet starts), without selecting it. Does nothing when it already does,
   * or when no element with that key is visible. A tall element keeps its top
   * in view rather than its bottom.
   */
  revealKey(key: string, bottomInset: number): void {
    if (!this.active) return;
    const el = this.findRenderedElement(key);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const limit = window.innerHeight - bottomInset;
    if (rect.top >= 0 && rect.bottom <= limit) return;
    const delta = Math.min(rect.bottom - limit + REVEAL_MARGIN, rect.top - REVEAL_MARGIN);
    window.scrollBy(0, delta);
  }

  /**
   * Scrolls the first visible element with `key` into view and shows it as
   * selected, with a short pulse, for a key the Studio has already opened
   * from its Keys list. Unlike `selectKey` it reports no selection back, so
   * the Studio's focus and any draft stay as they are. With a `bottomInset`
   * (the Studio's phone sheet), the element is centred in the part of the
   * frame above it. Returns what it found: `shown`, `hidden` (on the page but
   * not visible, such as in a closed menu or on a slide moved off to the
   * side; the keys are reported again) or `absent`. When nothing is shown,
   * the previous jump's look and picked marker are removed, so the page never
   * points at other text than the key the Studio opened.
   */
  jumpToKey(key: string, bottomInset: number): KeyJumpResult {
    const el = this.active ? this.findRenderedElement(key) : null;
    if (!el) return this.jumpFoundNothing(key);
    if (!this.isInView(el, bottomInset) || !isOnScreenSideways(el)) {
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
      if (bottomInset > 0 && !this.isInView(el, bottomInset)) {
        const rect = el.getBoundingClientRect();
        const limit = window.innerHeight - bottomInset;
        window.scrollBy(0, rect.top - Math.max(REVEAL_MARGIN, (limit - rect.height) / 2));
      }
    }
    // A carousel slide moved off to the side by a transform, or cut off by a
    // clipping parent, is rendered but cannot be seen.
    if (!isOnScreenSideways(el)) return this.jumpFoundNothing(key);
    if (this.editMode) this.markPicked(el);
    this.showJumped(el);
    return 'shown';
  }

  /** Ends the previous jump's look and says whether `key` is on the page at all. */
  private jumpFoundNothing(key: string): KeyJumpResult {
    if (this.active) {
      this.endJump();
      this.clearPicked();
      this.broadcastVisibleKeys();
    }
    return this.getActiveKeys().includes(key) ? 'hidden' : 'absent';
  }

  /** Removes the selected look of the last jump, if the overlay still shows it. */
  private endJump(): void {
    if (this.jumpTimer !== null) {
      clearTimeout(this.jumpTimer);
      this.jumpTimer = null;
    }
    this.overlay?.removeAttribute(JUMP_ATTRIBUTE);
    if (this.jumpedElement !== null && this.hoveredElement === this.jumpedElement) {
      this.hideOverlay();
      this.hoveredElement = null;
    }
    this.jumpedElement = null;
  }

  /** Whether `el` sits fully between the frame's top and `bottomInset` above its bottom. */
  private isInView(el: HTMLElement, bottomInset: number): boolean {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight - bottomInset;
  }

  /**
   * Draws the overlay around `el` as selected and pulses it once (not under
   * reduced motion). Outside Edit mode the look stays until the pointer moves
   * to other text; in Edit mode it fades with the pulse and the picked outline
   * stays.
   */
  private showJumped(el: HTMLElement): void {
    const overlay = this.overlay;
    if (!overlay) return;
    this.jumpedElement = el;
    this.hoveredElement = el;
    this.positionOverlay(el);
    overlay.setAttribute(JUMP_ATTRIBUTE, '');
    if (!prefersReducedMotion() && typeof overlay.animate === 'function') {
      overlay.animate(
        [
          { boxShadow: '0 0 0 0 rgba(79, 195, 220, 0.6)' },
          { boxShadow: '0 0 0 12px rgba(79, 195, 220, 0)' },
        ],
        { duration: JUMP_PULSE_MS / 2, iterations: 2, easing: 'ease-out' }
      );
    }
    if (this.jumpTimer !== null) clearTimeout(this.jumpTimer);
    this.jumpTimer = setTimeout(() => {
      this.jumpTimer = null;
      overlay.removeAttribute(JUMP_ATTRIBUTE);
      if (this.editMode && this.hoveredElement === el) {
        this.hideOverlay();
        this.hoveredElement = null;
      }
    }, JUMP_PULSE_MS);
  }

  /**
   * Turns Edit mode on or off. In Edit mode no tap reaches the site: a tap on
   * keyed text selects it, a tap on other text calls `onUnkeyedTap`, and
   * anything else does nothing. Scrolling still works. The mode is kept on
   * the instance and re-applied by `init()`.
   */
  setEditMode(on: boolean): void {
    const changed = this.editMode !== on;
    this.editMode = on;
    if (!this.active) return;
    if (on) this.attachEditMode();
    else this.detachEditMode();
    // What is visible may have changed while the person browsed (an opened menu).
    if (changed) this.broadcastVisibleKeys();
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

    this.active = true;
    if (this.editMode) this.attachEditMode();

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
    this.detachEditMode();
    this.active = false;

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

    this.jumpedElement = null;
    if (this.jumpTimer !== null) {
      clearTimeout(this.jumpTimer);
      this.jumpTimer = null;
    }

    // Cancel any pending debounced broadcasts
    this.broadcastVisibleKeys.cancel();
  }

  // ─── Edit Mode ───────────────────────────────────────────────────────────

  private attachEditMode(): void {
    window.addEventListener('pointerdown', this.stopFromSite, true);
    window.addEventListener('pointerup', this.stopFromSite, true);
    window.addEventListener('mousedown', this.stopFromSite, true);
    window.addEventListener('mouseup', this.stopFromSite, true);
    // Passive and never cancelled, so a finger can still scroll the page.
    window.addEventListener('touchstart', this.stopFromSite, { capture: true, passive: true });
    window.addEventListener('touchend', this.stopFromSite, { capture: true, passive: true });
    window.addEventListener('focusin', this.handleEditFocus, true);

    if (!document.getElementById(EDIT_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = EDIT_STYLE_ID;
      style.textContent =
        `html[${EDIT_ATTRIBUTE}] [data-i18n-key]{outline:1px dashed rgba(79,195,220,.7);outline-offset:2px}` +
        `html[${EDIT_ATTRIBUTE}] [data-i18n-key][${PICKED_ATTRIBUTE}]{outline:2px solid #FFB224;outline-offset:3px}`;
      document.head.appendChild(style);
    }
    document.documentElement.setAttribute(EDIT_ATTRIBUTE, '');
    this.hideOverlay();
    this.hoveredElement = null;
  }

  private detachEditMode(): void {
    window.removeEventListener('pointerdown', this.stopFromSite, true);
    window.removeEventListener('pointerup', this.stopFromSite, true);
    window.removeEventListener('mousedown', this.stopFromSite, true);
    window.removeEventListener('mouseup', this.stopFromSite, true);
    window.removeEventListener('touchstart', this.stopFromSite, true);
    window.removeEventListener('touchend', this.stopFromSite, true);
    window.removeEventListener('focusin', this.handleEditFocus, true);
    document.documentElement.removeAttribute(EDIT_ATTRIBUTE);
    document.getElementById(EDIT_STYLE_ID)?.remove();
    // Leaving Edit mode, or destroy() (the Studio's CLEAR_SELECTION), ends the pick.
    this.clearPicked();
  }

  /** Moves the picked-text marker to `element`. */
  private markPicked(element: HTMLElement): void {
    this.clearPicked();
    element.setAttribute(PICKED_ATTRIBUTE, '');
    this.pickedElement = element;
  }

  private clearPicked(): void {
    this.pickedElement?.removeAttribute(PICKED_ATTRIBUTE);
    this.pickedElement = null;
  }

  // Sites open menus on press events; in Edit mode none of them reaches the
  // site. Never preventDefault here: on touchstart it would stop scrolling.
  private stopFromSite = (event: Event): void => {
    event.stopImmediatePropagation();
  };

  private handleEditFocus = (event: FocusEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target || typeof target.matches !== 'function') return;
    if (target.matches(EDITABLE_SELECTOR) || target.isContentEditable) target.blur();
  };

  /** Edit-mode click: cancelled whatever the target, then a selection or the notice. */
  private handleEditClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();

    const target = event.target as HTMLElement | null;
    if (!target || typeof target.closest !== 'function') return;

    const keyedElement = target.closest('[data-i18n-key]') as HTMLElement | null;
    // RULE CLT-003: ALWAYS CHECK data-i18n-key EXISTENCE
    const key = keyedElement?.getAttribute('data-i18n-key');
    if (keyedElement && key) {
      this.select(keyedElement, key);
    } else if (hasOwnText(target)) {
      this.onUnkeyedTap?.();
    }
  }

  /**
   * Reports `element`, which carries `key`, as selected with its clean text. In Edit mode it
   * also gets the picked-text marker; an Alt+Click pick on a desktop does not.
   */
  private select(element: HTMLElement, key: string): void {
    if (this.editMode) this.markPicked(element);

    // Use innerText, stripping any invisible ZW chars before sending to studio
    const rawText = element.innerText || '';
    const cleanText = stripWatermark(rawText);

    const fallbackValue = element.getAttribute('data-i18n-template') || cleanText;
    const currentValue = cleanText;

    this.onElementSelected({
      key,
      fallbackValue,
      currentValue,
    });
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
      'background: #0C0D0F', // Night
      'border: 1px solid #4FC3DC', // Hunk
      'color: #E8E4D9', // Paper
      'font-family: ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size: 10px',
      'font-weight: 600',
      'line-height: 1',
      'padding: 3px 7px',
      'border-radius: 4px',
      'letter-spacing: 0.02em',
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
      // Alt is held — solid Hunk border signals "click to edit"
      this.overlay.style.border = '2px solid #4FC3DC';
      this.overlay.style.boxShadow = 'none';
      this.overlayBadge.style.color = '#E8E4D9';
      this.overlayBadge.style.borderColor = '#4FC3DC';
      this.overlayBadge.textContent = `✎ Click to edit: ${key}`;
    } else if (this.hoveredElement !== null && this.hoveredElement === this.jumpedElement) {
      // Jumped to from the Studio's Keys list — solid Hunk border, as an Alt+Click pick shows
      this.overlay.style.border = '2px solid #4FC3DC';
      this.overlay.style.boxShadow = 'none';
      this.overlayBadge.style.color = '#E8E4D9';
      this.overlayBadge.style.borderColor = '#4FC3DC';
      this.overlayBadge.textContent = `✎ ${key}`;
    } else {
      // Hover — dashed Hunk border signals "Alt + Click to edit"
      this.overlay.style.border = '1.5px dashed #4FC3DC';
      this.overlay.style.boxShadow = 'none';
      this.overlayBadge.style.color = '#E8E4D9';
      this.overlayBadge.style.borderColor = '#4FC3DC';
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
    // A tap fires emulated mouse events; the Alt+Click badge would mislead.
    if (this.editMode) return;

    const target = event.target as HTMLElement | null;
    if (!target || typeof target.closest !== 'function') return;

    const keyedElement = target.closest('[data-i18n-key]') as HTMLElement | null;
    if (!keyedElement) {
      // Moved onto a non-keyed element — hide overlay
      if (this.hoveredElement) {
        this.hideOverlay();
        this.hoveredElement = null;
      }
      this.jumpedElement = null;
      return;
    }

    // RULE CLT-003: ALWAYS CHECK data-i18n-key EXISTENCE
    const key = keyedElement.getAttribute('data-i18n-key');
    if (key === null) return;

    // Other text under the pointer ends the selected look of a jump.
    if (keyedElement !== this.jumpedElement) this.jumpedElement = null;
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
    if (this.editMode) {
      this.handleEditClick(event);
      return;
    }

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

    this.select(keyedElement, key);
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
