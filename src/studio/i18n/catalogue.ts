import type { StudioLanguage } from '../preferences.js';
import { en } from './en.js';
import { ar } from './ar.js';

export type { StudioLanguage } from '../preferences.js';

export interface PluralMessage {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}
export type Message = string | PluralMessage;
export type MessageParams = Readonly<Record<string, string | number>>;
export type StringKey = keyof typeof en;
export type Catalogues = {
  en: Readonly<Record<string, Message>>;
  ar: Readonly<Partial<Record<string, Message>>>;
};
export type StudioText = (key: StringKey, params?: MessageParams) => string;

/** First Strong Isolate and Pop Directional Isolate, around values in right-to-left text. */
const FSI = '\u2068';
const PDI = '\u2069';

export function textDirection(lang: StudioLanguage): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

const pluralRules = new Map<StudioLanguage, Intl.PluralRules>();

function pluralRulesFor(lang: StudioLanguage): Intl.PluralRules {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    pluralRules.set(lang, rules);
  }
  return rules;
}

function own(
  catalogue: Readonly<Partial<Record<string, Message>>>,
  key: string
): Message | undefined {
  return Object.prototype.hasOwnProperty.call(catalogue, key) ? catalogue[key] : undefined;
}

function pickForm(lang: StudioLanguage, message: PluralMessage, params?: MessageParams): string {
  const category = pluralRulesFor(lang).select(Number(params?.count)) as keyof PluralMessage;
  return message[category] ?? message.other;
}

/**
 * The text for `key` in `lang`: the Arabic entry when there is one, else the English, else the key.
 * `{name}` placeholders take `params`; a missing param stays as written. In right-to-left text every
 * value is isolated, whichever catalogue answered.
 */
export function formatMessage(
  lang: StudioLanguage,
  catalogues: Catalogues,
  key: string,
  params?: MessageParams
): string {
  const message = (lang === 'ar' ? own(catalogues.ar, key) : undefined) ?? own(catalogues.en, key);
  if (message === undefined) return key;
  const template = typeof message === 'string' ? message : pickForm(lang, message, params);
  if (!params) return template;
  const isolate = textDirection(lang) === 'rtl';
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return placeholder;
    const value = String(params[name]);
    return isolate ? `${FSI}${value}${PDI}` : value;
  });
}

const CATALOGUES: Catalogues = { en, ar };

/** The Studio text function for `lang`, bound to the real catalogues. */
export function textFor(lang: StudioLanguage): StudioText {
  return (key, params) => formatMessage(lang, CATALOGUES, key, params);
}

export const englishText: StudioText = textFor('en');
