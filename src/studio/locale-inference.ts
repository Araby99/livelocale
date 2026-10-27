import type { VisibleText } from '../client/iframe-bridge.js';

/** Where the Studio's target locale came from. */
export type LocaleSource = 'content' | 'url' | 'manual' | 'remembered';

/** The locale edits are written to, and why; `source: null` means nothing has decided it yet. */
export interface CurrentLocale {
  locale: string;
  source: LocaleSource | null;
}

/** A decided locale, or the locales the translator must pick from. */
export type LocaleChoice = (CurrentLocale & { source: LocaleSource }) | { pick: string[] };

/** Every text each locale may show for a key, built or drafted: `locale → key → texts`. */
export type TextCandidates = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/**
 * The locale a page address names. Without `locales` it is the `?locale=`
 * value, else a two-letter first path segment. With `locales`, the
 * `basePath` prefix is stripped first and the `?locale=` value or the first
 * segment must match a listed locale case-insensitively; the listed
 * spelling is returned.
 */
export function localeFromUrl(
  url: string,
  options: { basePath?: string; locales?: readonly string[] } = {}
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, 'http://localhost');
  } catch {
    return null;
  }
  const query = parsed.searchParams.get('locale');
  const { basePath, locales } = options;

  if (!locales) {
    if (query) return query;
    const segment = parsed.pathname.split('/')[1];
    return segment && segment.length === 2 ? segment : null;
  }

  const listed = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const lower = value.toLowerCase();
    return locales.find((locale) => locale.toLowerCase() === lower) ?? null;
  };
  const fromQuery = listed(query);
  if (fromQuery) return fromQuery;

  const base = basePath ?? '/';
  if (!parsed.pathname.startsWith(base)) return null;
  return listed(parsed.pathname.slice(base.length).split('/')[0]);
}

/** Text in a comparable form: NFC, whitespace collapsed, trimmed, lower case. For matching only. */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The locales, sorted, whose candidates for `key` include one of `texts`. Empty text never matches. */
export function matchLocalesByText(
  key: string,
  texts: readonly string[],
  candidates: TextCandidates
): string[] {
  const wanted = new Set(texts.map(normalizeText).filter((text) => text !== ''));
  if (wanted.size === 0) return [];
  const matches: string[] = [];
  for (const locale of Object.keys(candidates)) {
    const byKey = candidates[locale];
    if (!byKey || !hasOwn(byKey, key)) continue;
    const values = byKey[key] ?? [];
    if (values.some((value) => wanted.has(normalizeText(value)))) matches.push(locale);
  }
  return matches.sort();
}

/** The locales, sorted, that match the most visible texts (at least one). */
export function matchLocalesByVisibleTexts(
  texts: readonly VisibleText[],
  candidates: TextCandidates
): string[] {
  const counts = new Map<string, number>();
  for (const { key, text } of texts) {
    for (const locale of matchLocalesByText(key, [text], candidates)) {
      counts.set(locale, (counts.get(locale) ?? 0) + 1);
    }
  }
  const best = Math.max(0, ...counts.values());
  if (best === 0) return [];
  return [...counts.keys()].filter((locale) => counts.get(locale) === best).sort();
}

/**
 * The locale an Alt+Click edits. A manual choice is kept; a single match
 * wins; otherwise a decided locale is kept when it fits, else the
 * translator picks from the matches (or from every locale when none match).
 */
export function chooseLocaleOnClick(
  matches: readonly string[],
  current: CurrentLocale,
  locales: readonly string[]
): LocaleChoice {
  const { locale, source } = current;
  if (source === 'manual') return { locale, source };
  if (matches.length === 1) return { locale: matches[0] as string, source: 'content' };
  if (matches.length > 1) {
    return source !== null && matches.includes(locale)
      ? { locale, source }
      : { pick: [...matches] };
  }
  return source !== null ? { locale, source } : { pick: [...locales] };
}

/** After the app navigates: a URL locale replaces any automatic source, never a manual one. */
export function chooseLocaleOnNavigation(
  urlLocale: string | null,
  current: CurrentLocale
): CurrentLocale {
  if (current.source === 'manual' || urlLocale === null) return current;
  return { locale: urlLocale, source: 'url' };
}

/** After the page's visible texts change; a remembered locale is confirmed only when they agree. */
export function chooseLocaleOnPageTexts(
  matches: readonly string[],
  current: CurrentLocale
): CurrentLocale {
  if (current.source === 'manual') return current;
  if (matches.length === 1) return { locale: matches[0] as string, source: 'content' };
  if (current.source === 'remembered' && matches.includes(current.locale)) {
    return { locale: current.locale, source: 'content' };
  }
  return current;
}

/** The one locale the text points to when it contradicts a manual choice, else null. */
export function localeMismatch(matches: readonly string[], current: CurrentLocale): string | null {
  if (current.source !== 'manual' || matches.length !== 1) return null;
  const match = matches[0] as string;
  return match === current.locale ? null : match;
}

/** True when the page content, its address or the translator decided the locale. */
export function isLocaleConfirmed(current: CurrentLocale): boolean {
  return current.source === 'content' || current.source === 'url' || current.source === 'manual';
}
