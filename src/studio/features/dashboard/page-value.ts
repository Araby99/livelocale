/** The text a stored value shows on the page: tags removed, common entities decoded. */
function shownText(value: string): string {
  // Repeat until nothing changes: one pass over `<scr<b>ipt>` would leave `<script>`.
  let text = value;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, '');
  } while (text !== previous);
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** A letter or digit: text that is more than a separator. */
const WORDLIKE_RE = /[\p{L}\p{N}]/u;

function comparable(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * The value the editor starts from for a picked key. The stored value of the
 * edited locale when there is one. Otherwise the page text, which has lost any
 * markup (a rich-text value rendered with `set:html` shows `<strong>` as bold,
 * so the page text has no tags): when another stored value (the reference
 * locale's, which the page falls back to) shows exactly that text, that value
 * is used instead, so saving never drops its markup.
 *
 * `markedText` is the text the watermark marks in its own text node (the
 * pick's `fallbackValue`). The page text may hold more than the translation
 * (`{t.title} <span>_</span>`), so a stored value that shows exactly the
 * marked text is used too. The marked text runs to the next translation in the
 * node, so it may end in the page's own separator (`{t.terms} · {t.privacy}`
 * marks `Terms ·`): a stored value it starts with, followed only by
 * punctuation or symbols, is used as well.
 */
export function editorValueFor(
  stored: string | undefined,
  pageText: string,
  candidates: ReadonlyArray<string | undefined>,
  markedText?: string
): string {
  if (stored !== undefined) return stored;
  const page = comparable(pageText);
  const marked = markedText === undefined ? '' : comparable(markedText);
  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const text = comparable(shownText(candidate));
    if (text === '') continue;
    if (text === page || text === marked) return candidate;
    if (marked.startsWith(text) && !WORDLIKE_RE.test(marked.slice(text.length))) return candidate;
  }
  return pageText;
}
