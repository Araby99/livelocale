import type { Message } from './catalogue.js';

/** English Studio copy: the source catalogue. Every key's Arabic lives in `ar.ts`. */
export const en = {
  'language.switch_to_ar': 'Show the Studio in Arabic',
  'language.switch_to_en': 'Show the Studio in English',
} as const satisfies Record<string, Message>;
