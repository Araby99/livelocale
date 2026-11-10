/**
 * Live preview: shows a value the translator is typing in the page, without
 * touching the locale files, and puts the page back exactly as it was when the
 * selection is cleared.
 *
 * A translation is found by its watermark, which may sit anywhere in a text
 * node (`© 2026 {t.copy}`, `<a>Home</a> / {t.crumb}`, template whitespace
 * before `{t.title}`). Only the text the watermark marks is replaced: literal
 * page text before it, the watermark itself (so the scanner still keys the
 * element) and any later watermark in the same node are kept.
 *
 * A rich-text value (rendered with Astro's `set:html` or React's
 * `dangerouslySetInnerHTML`) is spread over several nodes: the watermark lands
 * in the first text node and the rest follows as `<strong>`, `<a>` and more
 * text. When the evidence says the element renders the value as HTML, the
 * preview replaces that whole run of nodes with the value parsed as markup,
 * keeping only a small set of inline tags and safe attributes. Otherwise the
 * value is shown as plain text, as the page would show it. Nodes a framework
 * renders itself (React or Vue elements and text, such as next-intl's
 * `t.rich` output) are never taken out: only `set:html` and
 * `dangerouslySetInnerHTML` content, which no framework tracks node by node.
 */
import { containsWatermark, removeWatermarks } from './watermark.js';
import { inInertParent, keyedSegments, segmentText } from './keyed-text.js';
import { formatPreview } from './preview-format.js';

/** A value to show for a key, with the stored value the page renders now, when known. */
export interface PreviewValue {
  value: string;
  /** The value the page shows now (the stored one), so its markup can be matched. */
  source?: string;
}

interface Entry {
  /** The node's text before the first preview. */
  original: string;
  /** Siblings after the node that a rich preview took out, in order. */
  removed: Node[];
  /** Nodes a rich preview put after the node. */
  inserted: Node[];
  /** The value a rich preview shows now: the stored value as far as the page is concerned. */
  richValue?: string;
  /** The node's text after the last render, to notice the app changing it. */
  rendered: string;
  previews: Map<string, PreviewValue>;
  /** Saved values: kept on the page, rendered again when other previews change. */
  committed: Map<string, PreviewValue>;
  /** Values a save left in `original` as the node's own text, by key, when it still shows them. */
  saved?: ReadonlyMap<string, string>;
  /**
   * The first stored value the Studio sent for each key while this entry lived: what
   * `original` shows. Later sends carry the last saved or undone value instead.
   */
  bases: Map<string, string>;
}

/** What a node should look like. */
interface Desired {
  text: string;
  /** True when the siblings after the node are replaced by `insert`. */
  rich: boolean;
  insert: Node[];
  /** The value rendered as markup, when `rich`. */
  richValue?: string;
}

const entries = new Map<Text, Entry>();

/**
 * The last value saved on this page for each key. After a save the page shows
 * it as its own text, so it tells where that translation ends in a node the
 * next time the key is previewed, even when the Studio sends no `source`.
 */
const committedValues = new Map<string, string>();

/**
 * What a save left in a node it then let go of: the node's text then and the values it shows.
 * Per node, not per key: a node the app renders again (a client-side navigation, a re-render)
 * shows the stored value again, and matching the saved value against it would misread it.
 */
// Never reset: keyed by node, a record outlives a body swap only for a node the swap kept
// (Astro's transition:persist), and entryFor ignores it once the node's text changed.
const savedOn = new WeakMap<Text, { text: string; values: Map<string, string> }>();

// ─── Markup ────────────────────────────────────────────────────────────────

/** Inline tags a previewed value may keep; anything else is unwrapped to its text. */
const ALLOWED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'code',
  'del',
  'em',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
  'wbr',
]);

/** Elements dropped with everything inside them. */
const DROPPED_TAGS = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'noscript',
  'svg',
  'math',
  'textarea',
  'title',
  'link',
  'meta',
  'base',
]);

/** Attributes kept on any allowed tag. Never `style` or an event handler. */
const ALLOWED_ATTRIBUTES = new Set(['class', 'dir', 'lang', 'title']);

/** URL schemes a previewed link may use; a relative URL has none. */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** A tag in the value, the sign it is markup rather than text. */
const MARKUP_RE = /<\/?[a-z][^<>]*>/i;

function hasMarkup(text: string): boolean {
  return MARKUP_RE.test(text);
}

/** Whether every tag in `text` is one a preview may render (no `<link>` or other rich-text tag names). */
function onlyAllowedTags(text: string): boolean {
  for (const match of text.matchAll(/<\/?([a-z][\w-]*)[^<>]*>/gi)) {
    if (!ALLOWED_TAGS.has(match[1]!.toLowerCase())) return false;
  }
  return true;
}

/** Expando prefixes React and Vue put on the DOM nodes they render and keep track of. */
const FRAMEWORK_KEY_PREFIXES = ['__reactFiber$', '__reactProps$', '__reactInternalInstance$'];
const FRAMEWORK_KEYS = ['__vnode', '__vueParentComponent'];

/** Whether a framework rendered `node` itself and expects to find it where it put it. */
function frameworkOwned(node: Node): boolean {
  for (const key of Object.keys(node)) {
    if (FRAMEWORK_KEYS.includes(key)) return true;
    if (FRAMEWORK_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  }
  return false;
}

function isSafeHref(href: string): boolean {
  // Browsers ignore control characters and whitespace inside a scheme ("java\tscript:").
  const compact = href.replace(/[\u0000-\u0020\u007f]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  return scheme === null || SAFE_SCHEMES.has(scheme[1]!.toLowerCase());
}

function cleanChildren(parent: Node): Node[] {
  const out: Node[] = [];
  for (const child of parent.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push(document.createTextNode(child.nodeValue ?? ''));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const source = child as Element;
    const tag = source.localName;
    if (DROPPED_TAGS.has(tag) || source.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    if (!ALLOWED_TAGS.has(tag)) {
      out.push(...cleanChildren(source));
      continue;
    }
    const el = document.createElement(tag);
    for (const attr of source.attributes) {
      const name = attr.name.toLowerCase();
      if (ALLOWED_ATTRIBUTES.has(name)) el.setAttribute(name, attr.value);
      else if (tag === 'a' && name === 'href' && isSafeHref(attr.value))
        el.setAttribute(name, attr.value);
      else if (tag === 'a' && (name === 'target' || name === 'rel'))
        el.setAttribute(name, attr.value);
    }
    if (tag === 'a' && el.hasAttribute('target')) el.setAttribute('rel', 'noopener noreferrer');
    el.append(...cleanChildren(source));
    out.push(el);
  }
  return out;
}

/**
 * Parses `value` as HTML into new nodes of this document, keeping only
 * `ALLOWED_TAGS` with their safe attributes. The value is parsed in an inert
 * `<template>`, so nothing in it runs or loads; scripts, styles and event
 * handlers never reach the page.
 */
export function sanitizeMarkup(value: string): Node[] {
  const template = document.createElement('template');
  template.innerHTML = removeWatermarks(value);
  return cleanChildren(template.content);
}

/** The text a markup value shows, for comparing with the page. */
function markupText(value: string): string {
  return sanitizeMarkup(value)
    .map((node) => node.textContent ?? '')
    .join('');
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Whether every element in `nodes`, at any depth, is an inline tag a rich-text value may use. */
export function onlyInline(nodes: readonly Node[]): boolean {
  return nodes.every((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return true;
    const el = node as Element;
    return ALLOWED_TAGS.has(el.localName) && onlyInline(Array.from(el.childNodes));
  });
}

/**
 * Whether the translation in `segText` runs on through `siblings` (the nodes
 * after its text node, up to the element's end) because the element renders it
 * as HTML. Never when the page shows literal tags (an escaped `{t.x}`), when a
 * sibling holds another translation, a sibling is not inline markup, or a
 * framework rendered the nodes (next-intl `t.rich`). When the stored value is
 * known it decides: it must use only allowed tags and show exactly the text
 * found there; a plain stored value means the page renders text. Only without
 * a stored value (a draft sent again after a reload) does markup in the typed
 * value, followed on the page by markup, count.
 */
function isRichExtent(
  node: Text,
  segText: string,
  siblings: readonly Node[],
  preview: PreviewValue,
  richValue: string | undefined
): boolean {
  if (hasMarkup(segText)) return false;
  if (siblings.some((each) => containsWatermark(each.textContent ?? ''))) return false;
  if (!onlyInline(siblings)) return false;
  if (frameworkOwned(node) || siblings.some(frameworkOwned)) return false;
  if (preview.source !== undefined) {
    if (!hasMarkup(preview.source) || !onlyAllowedTags(preview.source)) return false;
    // The Studio's stored value may be the one a rich preview put on the page.
    if (
      richValue !== undefined &&
      normalize(markupText(preview.source)) === normalize(markupText(richValue))
    )
      return true;
    const shown = segText + siblings.map((each) => each.textContent ?? '').join('');
    return normalize(markupText(preview.source)) === normalize(shown);
  }
  return (
    hasMarkup(preview.value) &&
    onlyAllowedTags(preview.value) &&
    siblings.some((each) => each.nodeType === Node.ELEMENT_NODE)
  );
}

// ─── Rendering ─────────────────────────────────────────────────────────────

/**
 * The page's own text after a plain translation in the same node, which the
 * preview keeps. When the value the page shows is known (the stored value the
 * Studio sends, `base`: the first one it sent while the node's entry lived, or
 * the last value saved here) and the marked text starts with
 * it, everything after it (`{t.terms} · {t.privacy}`, `{t.more} →`).
 * Otherwise only the trailing whitespace (`{t.title}\n  <span>`): the rest
 * cannot be told apart from the translation.
 */
function pageTextAfter(
  segText: string,
  key: string,
  preview: PreviewValue,
  base: string | undefined
): string {
  let best = -1;
  for (const known of [preview.source, base, committedValues.get(key)]) {
    if (known === undefined) continue;
    const shown = removeWatermarks(known);
    if (shown === '' || hasMarkup(shown) || !segText.startsWith(shown)) continue;
    best = Math.max(best, shown.length);
  }
  if (best >= 0) return segText.slice(best);
  return /\s*$/.exec(segText)![0];
}

/** The siblings after `node` as the page had them before any rich preview. */
function originalSiblings(node: Text, entry: Entry): Node[] {
  if (entry.removed.length > 0 || entry.inserted.length > 0) return entry.removed;
  const siblings: Node[] = [];
  for (let next = node.nextSibling; next !== null; next = next.nextSibling) siblings.push(next);
  return siblings;
}

function desiredFor(node: Text, entry: Entry): Desired {
  const original = entry.original;
  const segments = keyedSegments(original);
  let text = '';
  let cursor = 0;
  let rich = false;
  let insert: Node[] = [];
  let richValue: string | undefined;
  segments.forEach((segment, i) => {
    const raw = entry.previews.get(segment.key) ?? entry.committed.get(segment.key);
    if (!raw) return;
    const segText = segmentText(original, segment);
    text += original.slice(cursor, segment.end);
    cursor = segment.textEnd;
    const last = i === segments.length - 1;
    // `{count, plural, …}`, `{year}`: filled with the values the page shows now, not shown raw.
    // The messages `original` may show: the stored value sent now; the first one sent while
    // this entry lived (later sends carry the last saved or undone value); a value a save left
    // as this node's own text. Only values tied to this node: one the app rendered again shows
    // the stored value again. Never the typed value: matched against the page, it would take
    // the old words as its arguments' values. A rich stored value goes on in the elements
    // after the node.
    const known = [raw.source, entry.bases.get(segment.key), entry.saved?.get(segment.key)];
    const markup = last && known.some((each) => each !== undefined && hasMarkup(each));
    const shownText = markup
      ? segText +
        originalSiblings(node, entry)
          .map((each) => each.textContent ?? '')
          .join('')
      : segText;
    const preview = formatPreview(raw.value, known, removeWatermarks(shownText));
    if (
      last &&
      isRichExtent(node, segText, originalSiblings(node, entry), preview, entry.richValue)
    ) {
      const nodes = sanitizeMarkup(preview.value);
      if (nodes[0]?.nodeType === Node.TEXT_NODE) text += nodes.shift()!.nodeValue ?? '';
      rich = true;
      richValue = preview.value;
      insert = nodes;
    } else {
      text +=
        removeWatermarks(preview.value) +
        pageTextAfter(segText, segment.key, preview, entry.bases.get(segment.key));
    }
  });
  text += original.slice(cursor);
  return { text, rich, insert, richValue };
}

function sameNodes(a: readonly Node[], b: readonly Node[]): boolean {
  return a.length === b.length && a.every((node, i) => node.isEqualNode(b[i]!));
}

/** Inserts `nodes` right after `node`, in order. */
function insertAfter(node: Node, nodes: readonly Node[]): void {
  const parent = node.parentNode;
  if (!parent) return;
  const before = node.nextSibling;
  for (const each of nodes) parent.insertBefore(each, before);
}

/** Takes the nodes a rich preview inserted out and puts the page's own siblings back. */
function undoRich(node: Text, entry: Entry): void {
  for (const each of entry.inserted) each.parentNode?.removeChild(each);
  insertAfter(node, entry.removed);
  entry.inserted = [];
  entry.removed = [];
  entry.richValue = undefined;
}

/**
 * Brings `node` to what its previews and saved values ask for. Does nothing
 * when the page already shows that, so sending the same value again causes no
 * DOM mutation (the Studio re-sends saved values whenever the page changes).
 */
function render(node: Text, entry: Entry): void {
  const want = desiredFor(node, entry);
  const isRich = entry.removed.length > 0 || entry.inserted.length > 0;
  if (want.rich && isRich) {
    if (node.nodeValue !== want.text) node.nodeValue = want.text;
    if (!sameNodes(entry.inserted, want.insert)) {
      for (const each of entry.inserted) each.parentNode?.removeChild(each);
      insertAfter(node, want.insert);
      entry.inserted = want.insert;
    }
  } else if (want.rich) {
    const siblings = originalSiblings(node, entry);
    // Already on the page (a saved value sent again after it was committed).
    if (node.nodeValue !== want.text || !sameNodes(siblings, want.insert)) {
      for (const each of siblings) each.parentNode?.removeChild(each);
      entry.removed = siblings;
      // An empty removed list with nothing inserted would read as "not rich".
      insertAfter(node, want.insert);
      entry.inserted = want.insert;
      if (node.nodeValue !== want.text) node.nodeValue = want.text;
    }
  } else {
    if (isRich) undoRich(node, entry);
    if (node.nodeValue !== want.text) node.nodeValue = want.text;
  }
  entry.rendered = node.nodeValue ?? '';
  entry.richValue =
    entry.removed.length > 0 || entry.inserted.length > 0 ? want.richValue : undefined;
}

/** Puts `node` back the way the page had it, or as its saved values left it. */
function restore(node: Text, entry: Entry): void {
  entry.previews.clear();
  if (entry.committed.size > 0) {
    render(node, entry);
    return;
  }
  undoRich(node, entry);
  if (node.nodeValue !== entry.original) node.nodeValue = entry.original;
  entries.delete(node);
}

/** Text nodes on the page holding a translation of `key`, with their entries. */
function nodesFor(key: string): Text[] {
  for (const node of entries.keys()) {
    if (!node.isConnected) entries.delete(node);
  }
  if (!document.body) return [];
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null) !== null) {
    if (inInertParent(node)) continue;
    const text = entries.get(node)?.original ?? node.nodeValue ?? '';
    if (keyedSegments(text).some((segment) => segment.key === key)) nodes.push(node);
  }
  return nodes;
}

function entryFor(node: Text): Entry {
  let entry = entries.get(node);
  if (entry && node.nodeValue !== entry.rendered) {
    // The app rendered new text into the node: put its own siblings back, then
    // start over from what it shows now.
    undoRich(node, entry);
    entries.delete(node);
    entry = undefined;
  }
  if (!entry) {
    const text = node.nodeValue ?? '';
    const record = savedOn.get(node);
    entry = {
      original: text,
      removed: [],
      inserted: [],
      rendered: text,
      previews: new Map(),
      committed: new Map(),
      saved: record?.text === text ? record.values : undefined,
      bases: new Map(),
    };
    entries.set(node, entry);
  }
  return entry;
}

// ─── API ───────────────────────────────────────────────────────────────────

/**
 * Shows `value` wherever `key` is rendered, until `restorePreviews` or
 * `commitPreview`. `source` is the stored value the page shows now; with it, a
 * rich-text value is matched to the nodes it was rendered into.
 */
export function applyPreview(key: string, value: string, source?: string): void {
  for (const node of nodesFor(key)) {
    const entry = entryFor(node);
    // A saved value of the key stays under the preview (previews win in desiredFor), so
    // dropping the preview puts the saved value back, not the text from before the save.
    entry.previews.set(key, { value, source });
    if (source !== undefined && !entry.bases.has(key)) entry.bases.set(key, source);
    render(node, entry);
  }
}

/**
 * Makes a saved value the text that stays on the page. In development the
 * dev server re-renders from the edited file anyway; in preview mode the
 * deployment still serves the old text until it is rebuilt, so the Studio
 * re-sends saved values whenever the page reloads or changes.
 */
export function commitPreview(key: string, value: string, source?: string): void {
  applyPreview(key, value, source);
  committedValues.set(key, value);
  for (const [node, entry] of entries) {
    const preview = entry.previews.get(key);
    if (!preview) continue;
    entry.previews.delete(key);
    const isRich = entry.removed.length > 0 || entry.inserted.length > 0;
    if (entry.previews.size === 0 && !isRich) {
      // Nothing else to put back here: the page keeps the saved value as its own.
      const values = new Map(entry.saved);
      for (const [each, saved] of entry.committed) values.set(each, saved.value);
      values.set(key, preview.value);
      savedOn.set(node, { text: node.nodeValue ?? '', values });
      entries.delete(node);
    } else {
      // Kept while a rich value holds the page's own nodes, so they can be put back.
      entry.committed.set(key, preview);
    }
  }
}

/**
 * Drops the unsaved preview of `key` only, wherever it shows: the node goes back to the
 * page's own text, or to the saved values and other previews it still holds. Used when the
 * typed text is discarded while another text gets picked, so that pick keeps its highlight.
 */
export function restorePreview(key: string): void {
  for (const [node, entry] of [...entries]) {
    if (!node.isConnected) {
      entries.delete(node);
      continue;
    }
    if (!entry.previews.delete(key)) continue;
    if (node.nodeValue !== entry.rendered) {
      // The app has rendered its own text since: that is what the page shows now.
      undoRich(node, entry);
      entries.delete(node);
    } else if (entry.previews.size === 0 && entry.committed.size === 0) {
      undoRich(node, entry);
      if (node.nodeValue !== entry.original) node.nodeValue = entry.original;
      entries.delete(node);
    } else {
      render(node, entry);
    }
  }
}

/** Restores every previewed node, and the nodes a rich preview replaced, to the page's own. */
export function restorePreviews(): void {
  for (const [node, entry] of [...entries]) restore(node, entry);
}

/** Forgets every preview without touching the page (its `<body>` was replaced). */
export function forgetPreviews(): void {
  entries.clear();
  committedValues.clear();
}
