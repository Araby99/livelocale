/** The text a stored value shows on the page: tags removed, common entities decoded. */
function shownText(value: string): string {
  return value
    .replace(/<[^<>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

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
 */
export function editorValueFor(
  stored: string | undefined,
  pageText: string,
  candidates: ReadonlyArray<string | undefined>
): string {
  if (stored !== undefined) return stored;
  const wanted = comparable(pageText);
  if (wanted === '') return pageText;
  for (const candidate of candidates) {
    if (candidate !== undefined && comparable(shownText(candidate)) === wanted) return candidate;
  }
  return pageText;
}
