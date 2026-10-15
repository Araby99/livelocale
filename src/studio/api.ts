import { APP_ORIGIN } from './features/dashboard/constants.js';

const API = `${APP_ORIGIN}/api/i18n-lens/mutate`;

/** sessionStorage key for the bearer token (preview mode). */
export const TOKEN_STORAGE_KEY = 'i18n-lens-token';
/** Dispatched on `window` when the API answers 401, so the UI can ask for a token. */
export const UNAUTHORIZED_EVENT = 'i18n-lens:unauthorized';
/** Dispatched on `window` after `setToken` so data hooks can refetch. */
export const TOKEN_CHANGED_EVENT = 'i18n-lens:token-changed';

export type LensMode = 'off' | 'development' | 'preview';

export type GitChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed';

export interface GitChange {
  path: string;
  status: GitChangeStatus;
}

export interface GitState {
  available: boolean;
  isRepo: boolean;
  branch: string | null;
  changes: GitChange[];
  diff: string;
  /** `local` = git CLI on this machine; `github` = branch + pull request through the API. */
  mode?: 'local' | 'github';
  pullRequestUrl?: string | null;
}

export interface ServerInfo {
  mode: LensMode;
  authRequired: boolean;
  git: boolean;
}

/** 422 from the server: placeholder mismatch or message syntax problem. */
export class ValidationError extends Error {
  readonly code: string;
  readonly details: { missing: string[]; extra: string[] };
  constructor(message: string, code: string, details?: { missing?: string[]; extra?: string[] }) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.details = { missing: details?.missing ?? [], extra: details?.extra ?? [] };
  }
}

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

// ─── Token storage ──────────────────────────────────────────────────────────

let memoryToken: string | null = null;

export function getToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// ─── Transport ──────────────────────────────────────────────────────────────

async function parse<T>(response: Response): Promise<T> {
  let body: any = null;
  try {
    body = await response.json();
  } catch {}
  if (response.status === 401) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new UnauthorizedError(body?.error || 'Unauthorized');
  }
  if (response.status === 422) {
    throw new ValidationError(
      body?.error || 'The translation was rejected.',
      body?.code || 'VALIDATION',
      body?.details
    );
  }
  if (!response.ok) {
    throw new Error(body?.error || `Server responded with status ${response.status}`);
  }
  return body as T;
}

function get<T>(query = ''): Promise<T> {
  const url = `${API}${query}`;
  const request = getToken() ? fetch(url, { headers: headers() }) : fetch(url);
  return request.then((r) => parse<T>(r));
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parse<T>(response);
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export const fetchInfo = () => get<ServerInfo>('?action=info');
export const fetchLocales = () => get<string[]>();
export const fetchKeysMetadata = () =>
  get<{ allKeys: string[]; codeKeys: string[] }>('?action=keys');
export const fetchLocaleDictionary = (locale: string) =>
  get<Record<string, any>>(`?locale=${encodeURIComponent(locale)}`);
export const fetchGitState = () => get<GitState>('?action=git');

export interface SaveOptions {
  /** Reference text (usually the source language) used for placeholder parity checks. */
  reference?: string;
  /** Save even if placeholders or syntax do not pass validation. */
  force?: boolean;
}

export const saveTranslation = (
  locale: string,
  key: string,
  value: string,
  options: SaveOptions = {}
) =>
  post<{ success: true; key: string; locale: string }>({
    locale,
    key,
    value,
    ...(options.reference !== undefined ? { reference: options.reference } : {}),
    ...(options.force ? { force: true } : {}),
  });
export const addLocaleRequest = (locale: string) =>
  post<{ success: true; locale: string }>({ action: 'addLocale', locale });
export const renameLocaleRequest = (locale: string, newLocale: string) =>
  post<{ success: true }>({ action: 'renameLocale', locale, newLocale });
export const deleteLocaleRequest = (locale: string) =>
  post<{ success: true }>({ action: 'deleteLocale', locale });
export const commitLocales = (message: string) =>
  post<{ success: true; hash: string }>({ action: 'commit', message });
export const discardLocales = () => post<{ success: true }>({ action: 'discard' });
