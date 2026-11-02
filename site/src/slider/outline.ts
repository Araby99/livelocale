// Outlines the slider sample's text that was written straight into the markup.

const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** An element's own text: its direct text nodes only, not its children's. */
function ownText(el: Element): string {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
  }
  return normalise(text);
}

/** Adds `is-untranslated` to each element whose own text is one of `texts`; returns how many. */
export function markHardcoded(root: Element, texts: readonly string[]): number {
  const wanted = new Set(texts.map(normalise));
  let marked = 0;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const text = ownText(el);
    if (text && wanted.has(text)) {
      el.classList.add('is-untranslated');
      marked += 1;
    }
  }
  return marked;
}
