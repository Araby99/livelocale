import { findWatermarks, type WatermarkMatch } from './watermark.js';

/**
 * A watermark in a text node and the text it marks: from the end of the
 * watermark (`end`) to the next watermark or the end of the node (`textEnd`).
 * Text before the first watermark, such as `© 2026 ` or template whitespace,
 * belongs to the page, not to the translation.
 */
export interface KeyedSegment extends WatermarkMatch {
  textEnd: number;
}

/** Every watermark in `text` with the extent of the translation it marks, in order. */
export function keyedSegments(text: string): KeyedSegment[] {
  const found = findWatermarks(text);
  return found.map((match, i) => ({
    ...match,
    textEnd: i + 1 < found.length ? found[i + 1]!.start : text.length,
  }));
}

/** The translated text a segment marks, without its watermark. */
export function segmentText(text: string, segment: KeyedSegment): string {
  return text.slice(segment.end, segment.textEnd);
}

/** Elements whose text is never shown as page text: a watermark inside them is not pickable. */
const INERT_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE']);

/** Whether `node` sits directly in an element whose text the page never shows (JSON-LD, CSS). */
export function inInertParent(node: Node): boolean {
  const parent = node.parentElement;
  return parent !== null && INERT_TEXT_PARENTS.has(parent.tagName);
}

/**
 * The first text node under `root`, in document order, whose first watermark
 * names `key`: the node that gave `root` its `data-i18n-key`.
 */
export function findKeyedTextNode(root: Element, key: string): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null) !== null) {
    if (inInertParent(node)) continue;
    const first = findWatermarks(node.nodeValue ?? '')[0];
    if (first?.key === key) return node;
  }
  return null;
}

/** The text of `root` before `node`, plus `node`'s own text before `offset`. */
export function textBefore(root: Element, node: Text, offset: number): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let text = '';
  let current: Text | null;
  while ((current = walker.nextNode() as Text | null) !== null) {
    if (current === node) return text + (node.nodeValue ?? '').slice(0, offset);
    text += current.nodeValue ?? '';
  }
  return text;
}
