// The hero's three deliberate mistakes and the edits a visitor makes to fix them. Pure data
// and functions: the React island renders from these, and nothing here touches the DOM.

export type MistakeKey = 'hero.title' | 'hero.lede' | 'hero.ci';

/** One planted mistake: the full broken and fixed strings, and the words the card and patch show. */
export interface Mistake {
  key: MistakeKey;
  broken: string;
  fixed: string;
  wrong: string;
  right: string;
}

export const MISTAKES: readonly Mistake[] = [
  {
    key: 'hero.title',
    broken: 'Stop colecting screenshots.',
    fixed: 'Stop collecting screenshots.',
    wrong: 'colecting',
    right: 'collecting',
  },
  {
    key: 'hero.lede',
    broken: 'Anyone on your team fixes text rite on the site.',
    fixed: 'Anyone on your team fixes text right on the site.',
    wrong: 'rite',
    right: 'right',
  },
  {
    key: 'hero.ci',
    broken: 'You get a pull request. CI catches what was never traducido.',
    fixed: 'You get a pull request. CI catches what was never translated.',
    wrong: 'traducido',
    right: 'translated',
  },
];

/** One visitor edit: the mistake's broken text and what the visitor typed in its place. */
export interface HeroEdit {
  key: MistakeKey;
  from: string;
  to: string;
}

function mistake(key: MistakeKey): Mistake {
  const found = MISTAKES.find((m) => m.key === key);
  if (!found) throw new Error(`Unknown hero mistake: ${key}`);
  return found;
}

/** Folds the differences a visitor should not be penalised for: Unicode form, curly quotes, spacing, case. */
export function normalizeFix(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Records `to` as the edit for `key`: the newest edit wins and keeps the key's first-edit
 * position. Typing the original text back removes the key's edit.
 */
export function applyEdit(edits: readonly HeroEdit[], key: MistakeKey, to: string): HeroEdit[] {
  const { broken } = mistake(key);
  if (normalizeFix(to) === normalizeFix(broken)) return edits.filter((e) => e.key !== key);
  const edit: HeroEdit = { key, from: broken, to };
  return edits.some((e) => e.key === key)
    ? edits.map((e) => (e.key === key ? edit : e))
    : [...edits, edit];
}

/** Whether the visitor's edit for `key` is the intended fix. */
export function isFixed(edits: readonly HeroEdit[], key: MistakeKey): boolean {
  const edit = edits.find((e) => e.key === key);
  return edit !== undefined && normalizeFix(edit.to) === normalizeFix(mistake(key).fixed);
}

export function progress(edits: readonly HeroEdit[]): {
  fixed: number;
  total: number;
  done: boolean;
  left: number;
} {
  const total = MISTAKES.length;
  const fixed = MISTAKES.filter((m) => isFixed(edits, m.key)).length;
  return { fixed, total, done: fixed === total, left: total - fixed };
}

/** The words that changed between two strings, with the common leading and trailing words stripped. */
export function wordDiff(from: string, to: string): { removed: string; added: string } {
  const a = from.trim().split(/\s+/).filter(Boolean);
  const b = to.trim().split(/\s+/).filter(Boolean);
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a[start] === b[start]) start++;
  let end = 0;
  while (end < max - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  return {
    removed: a.slice(start, a.length - end).join(' '),
    added: b.slice(start, b.length - end).join(' '),
  };
}

export function leftLabel(left: number): string {
  if (left === 0) return 'All fixed';
  return `${left} ${left === 1 ? 'mistake' : 'mistakes'} left on this page`;
}
