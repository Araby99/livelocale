import { en } from './en.js';

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
export type Catalogue = Readonly<Record<string, Message>>;
export type StudioText = (key: StringKey, params?: MessageParams) => string;

const pluralRules = new Intl.PluralRules('en');

function pickForm(message: PluralMessage, params?: MessageParams): string {
  const category = pluralRules.select(Number(params?.count)) as keyof PluralMessage;
  return message[category] ?? message.other;
}

/**
 * The text for `key` in `catalogue`, else the key. `{name}` placeholders take `params`; a missing
 * param stays as written. A plural message picks its form from `params.count`.
 */
export function formatMessage(catalogue: Catalogue, key: string, params?: MessageParams): string {
  const message = Object.prototype.hasOwnProperty.call(catalogue, key) ? catalogue[key] : undefined;
  if (message === undefined) return key;
  const template = typeof message === 'string' ? message : pickForm(message, params);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
  );
}

/** The Studio text function, bound to the English catalogue. The Studio interface is English only. */
export const englishText: StudioText = (key, params) => formatMessage(en, key, params);

/** Keys whose English text the Studio's own code passes along as a problem or an error message. */
const OWN_MESSAGES: readonly StringKey[] = [
  'setup.manifest_missing',
  'share.storage_problem',
  'share.locale_actions_unsupported',
  'share.commit_unsupported',
  'share.load_failed',
  'share.unknown_language',
  'errors.unauthorized',
  'errors.translation_rejected',
  'errors.server_status',
];

/** The values of `message` when it is `template` with its `{name}` placeholders filled in. */
function matchTemplate(template: string, message: string): Record<string, string> | null {
  const names: string[] = [];
  const pattern = template
    .split(/\{(\w+)\}/)
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(part);
      return '([\\s\\S]+?)';
    })
    .join('');
  const match = new RegExp(`^${pattern}$`).exec(message);
  return match ? Object.fromEntries(names.map((name, i) => [name, match[i + 1] ?? ''])) : null;
}

/**
 * `message` through `t` when it is one of the Studio's own messages (written by code that has no
 * text function, such as the share transport or the API client), with the values it carries kept;
 * any other message, such as a server error, is returned as given.
 */
export function studioMessage(t: StudioText, message: string): string {
  for (const key of OWN_MESSAGES) {
    const params = matchTemplate(englishText(key), message);
    if (params) return t(key, params);
  }
  return message;
}
