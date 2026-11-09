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
 * value is shown as plain text, as the page would show it.
 */
import { containsWatermark, removeWatermarks } from './watermark.js';
import { inInertParent, keyedSegments, segmentText } from './keyed-text.js';

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
  /** The node's text after the last render, to notice the app changing it. */
  rendered: string;
  previews: Map<string, PreviewValue>;
  /** Saved values: kept on the page, rendered again when other previews change. */
  committed: Map<string, PreviewValue>;
}

/** What a node should look like. */
interface Desired {
  text: string;
  /** True when the siblings after the node are replaced by `insert`. */
  rich: boolean;
  insert: Node[];
}

const entries = new Map<Text, Entry>();

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

/** Whether every element in `nodes`, at any depth, is an allowed inline tag. */
function onlyInline(nodes: readonly Node[]): boolean {
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
 * sibling holds another translation, or a sibling is not inline markup. Then
 * either the stored value has markup and shows exactly the text found there,
 * or the typed value has markup and markup follows the text node.
 */
function isRichExtent(segText: string, siblings: readonly Node[], preview: PreviewValue): boolean {
  if (hasMarkup(segText)) return false;
  if (siblings.some((node) => containsWatermark(node.textContent ?? ''))) return false;
  if (!onlyInline(siblings)) return false;
  if (preview.source !== undefined && hasMarkup(preview.source)) {
    const shown = segText + siblings.map((node) => node.textContent ?? '').join('');
    if (normalize(markupText(preview.source)) === normalize(shown)) return true;
  }
  return hasMarkup(preview.value) && siblings.some((node) => node.nodeType === Node.ELEMENT_NODE);
}

// ─── Rendering ─────────────────────────────────────────────────────────────

/**
 * The page's own text after a plain translation in the same node, which the
 * preview keeps. When the stored value is known and the marked text starts
 * with it, everything after it (`{t.terms} · {t.privacy}`, `{t.more} →`).
 * Otherwise only the trailing whitespace (`{t.title}\n  <span>`): the rest
 * cannot be told apart from the translation.
 */
function pageTextAfter(segText: string, preview: PreviewValue): string {
  const source = preview.source === undefined ? '' : removeWatermarks(preview.source);
  if (source !== '' && !hasMarkup(source) && segText.startsWith(source)) {
    return segText.slice(source.length);
  }
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
  segments.forEach((segment, i) => {
    const preview = entry.previews.get(segment.key) ?? entry.committed.get(segment.key);
    if (!preview) return;
    const segText = segmentText(original, segment);
    text += original.slice(cursor, segment.end);
    cursor = segment.textEnd;
    const last = i === segments.length - 1;
    if (last && isRichExtent(segText, originalSiblings(node, entry), preview)) {
      const nodes = sanitizeMarkup(preview.value);
      if (nodes[0]?.nodeType === Node.TEXT_NODE) text += nodes.shift()!.nodeValue ?? '';
      rich = true;
      insert = nodes;
    } else {
      text += removeWatermarks(preview.value) + pageTextAfter(segText, preview);
    }
  });
  text += original.slice(cursor);
  return { text, rich, insert };
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
    // The app rendered new text into the node: start over from what it shows now.
    for (const each of entry.inserted) each.parentNode?.removeChild(each);
    entries.delete(node);
    entry = undefined;
  }
  if (!entry) {
    const text = node.nodeValue ?? '';
    entry = {
      original: text,
      removed: [],
      inserted: [],
      rendered: text,
      previews: new Map(),
      committed: new Map(),
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
    entry.previews.set(key, { value, source });
    entry.committed.delete(key);
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
  for (const [node, entry] of entries) {
    const preview = entry.previews.get(key);
    if (!preview) continue;
    entry.previews.delete(key);
    if (entry.previews.size === 0) {
      // Nothing else to put back here: the page keeps the saved value as its own.
      entries.delete(node);
    } else {
      entry.committed.set(key, preview);
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
}
