export interface NextMissingInput {
  /** Keys with a visible element on the page, in document order. */
  renderedKeys: string[];
  /** Every key on the page, hidden parts included (VISIBLE_KEYS_CHANGED). */
  allPageKeys: string[];
  /** The key being edited now, if any. */
  currentKey: string | null;
  /** Whether the edited locale has a value for `key`. */
  hasValue: (key: string) => boolean;
}

export type NextMissing = { kind: 'key'; key: string } | { kind: 'done'; hiddenMissing: number };

/**
 * The next text the person can see that still has no value, in reading order after
 * `currentKey` and wrapping round. When none is left, how many gaps sit in hidden parts
 * of the page (menus, slides), so the Studio never claims the page is fully translated.
 */
export function nextMissingKey({
  renderedKeys,
  allPageKeys,
  currentKey,
  hasValue,
}: NextMissingInput): NextMissing {
  const count = renderedKeys.length;
  // Start after the current key; the current key itself comes last, so one still
  // empty is offered again instead of a "done" that would not be true.
  const start = currentKey === null ? -1 : renderedKeys.indexOf(currentKey);
  for (let step = 1; step <= count; step++) {
    const key = renderedKeys[(start + step) % count]!;
    if (!hasValue(key)) return { kind: 'key', key };
  }

  const rendered = new Set(renderedKeys);
  const hidden = new Set(allPageKeys.filter((key) => !rendered.has(key) && !hasValue(key)));
  return { kind: 'done', hiddenMissing: hidden.size };
}

/**
 * Whether a stored value still needs a translation: absent, empty or only spaces. The same
 * rule as the header's coverage meter, so the Missing list and the meter always agree.
 */
export function isMissingValue(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

/**
 * The next key in `keys` after `currentKey` that has no value, wrapping round; null when no
 * other key is missing. The current key is never offered: the person is already on it.
 */
export function nextMissingInList(
  keys: readonly string[],
  currentKey: string | null,
  hasValue: (key: string) => boolean
): string | null {
  const start = currentKey === null ? -1 : keys.indexOf(currentKey);
  for (let step = 1; step <= keys.length; step++) {
    const key = keys[(start + step) % keys.length]!;
    if (key !== currentKey && !hasValue(key)) return key;
  }
  return null;
}
