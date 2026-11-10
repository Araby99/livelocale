import type { PluralType } from '../../../core/icu-plural.js';

/** Whole numbers checked for each category; a range that reaches this one is open-ended. */
const LIMIT = 1000;
/** Ranges listed before the rest is shortened to an ellipsis. */
const MAX_RANGES = 3;
/** Fractions tried, in order; the first one in a category is shown after its whole numbers. */
const FRACTIONS = [1.5, 0.5, 2.5];

const ELLIPSIS = '…';

/** The ranges of consecutive whole numbers in `numbers` (sorted, ascending). */
function ranges(numbers: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const n of numbers) {
    const last = out[out.length - 1];
    if (last && last[1] === n - 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

/** "3–10, 103–110, 203–210, …": the first ranges of a category, then an ellipsis if more follow. */
function describe(numbers: number[]): string[] {
  const all = ranges(numbers);
  const parts: string[] = [];
  for (const [start, end] of all.slice(0, MAX_RANGES)) {
    if (end === LIMIT) {
      // Runs past what was checked: a few numbers, then "and so on".
      for (let n = start; n <= Math.min(end, start + 2); n++) parts.push(String(n));
      parts.push(ELLIPSIS);
      return parts;
    }
    if (end - start >= 2) parts.push(`${start}–${end}`);
    else for (let n = start; n <= end; n++) parts.push(String(n));
  }
  if (all.length > MAX_RANGES) parts.push(ELLIPSIS);
  return parts;
}

/**
 * Example numbers for each plural category of `locale`, from the browser's own plural rules:
 * Arabic `few` is "3–10, 103–110, 203–210, …". A translator sees which noun form goes where
 * without knowing the CLDR names. Empty for `select`, which is not about numbers, and for a
 * locale the browser cannot read.
 */
export function pluralExamples(locale: string, type: PluralType): Record<string, string> {
  if (type === 'select') return {};
  let rules: Intl.PluralRules;
  try {
    // Intl reads only the hyphen form: pt_BR is pt-BR to it.
    rules = new Intl.PluralRules(locale.replace(/_/g, '-'), {
      type: type === 'selectordinal' ? 'ordinal' : 'cardinal',
    });
  } catch {
    return {};
  }
  const byCategory = new Map<string, number[]>();
  for (let n = 0; n <= LIMIT; n++) {
    const category = rules.select(n);
    const numbers = byCategory.get(category);
    if (numbers) numbers.push(n);
    else byCategory.set(category, [n]);
  }
  const examples: Record<string, string> = {};
  for (const category of rules.resolvedOptions().pluralCategories) {
    const parts = describe(byCategory.get(category) ?? []);
    const fraction = FRACTIONS.find((f) => rules.select(f) === category);
    if (fraction !== undefined) parts.push(String(fraction));
    if (parts.length > 0) examples[category] = parts.join(', ');
  }
  return examples;
}
