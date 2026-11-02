import type { Message, StringKey } from './catalogue.js';

/** Arabic Studio copy in Modern Standard Arabic. A missing key falls back to English. */
export const ar: Partial<Record<StringKey, Message>> = {
  'common.arrow': '←',
  'language.switch_to_ar': 'عرض الاستوديو بالعربية',
  'language.switch_to_en': 'عرض الاستوديو بالإنجليزية',
};

/** Keys whose Arabic may equal the English (brand-only strings). */
export const SAME_IN_BOTH: ReadonlySet<StringKey> = new Set<StringKey>();
