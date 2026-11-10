/**
 * Languages written right to left. A fixed list, not `Intl.Locale#getTextInfo`: Firefox does
 * not have that yet, and the answer must not change with the browser.
 */
const RTL_LANGUAGES = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'ks',
  'ps',
  'sd',
  'syr',
  'ug',
  'ur',
  'yi',
]);

/** Whether text in `locale` runs right to left (`ar`, `ar-EG`, `he`, …). */
export function isRtlLocale(locale: string): boolean {
  const language = locale.toLowerCase().split(/[-_]/)[0] ?? '';
  return RTL_LANGUAGES.has(language);
}
