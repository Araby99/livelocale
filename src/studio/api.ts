import { getAppOrigin } from './runtime.js';

/** The app's LiveLocale API, read from the runtime on every request. */
const apiUrl = () => `${getAppOrigin()}/api/livelocale`;

/** sessionStorage key for the bearer token (preview mode). */
export const TOKEN_STORAGE_KEY = 'livelocale-token';
/** Dispatched on `window` when the API answers 401, so the UI can ask for a token. */
export const UNAUTHORIZED_EVENT = 'livelocale:unauthorized';
/** Dispatched on `window` after `setToken` so data hooks can refetch. */
export const TOKEN_CHANGED_EVENT = 'livelocale:token-changed';

export type LiveLocaleMode = 'off' | 'development' | 'preview' | 'static';

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
  /**
   * `local` = git CLI on this machine; `github` = branch + pull request through the API;
   * `static` = a share link with no server, where edits are drafts in the browser.
   */
  mode?: 'local' | 'github' | 'static';
  pullRequestUrl?: string | null;
}

export interface ServerInfo {
  mode: LiveLocaleMode;
  authRequired: boolean;
  git: boolean;
  /** Setup problems found by the server, such as a token without write access. */
  problems?: string[];
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
  const url = `${apiUrl()}${query}`;
  const request = getToken() ? fetch(url, { headers: headers() }) : fetch(url);
  return request.then((r) => parse<T>(r));
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parse<T>(response);
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export interface SaveOptions {
  /** Reference text (usually the source language) used for placeholder parity checks. */
  reference?: string;
  /** Save even if placeholders or syntax do not pass validation. */
  force?: boolean;
}

/** Everything the Studio asks of its backend: the app's HTTP API, or drafts on a static host. */
export interface StudioTransport {
  fetchInfo(): Promise<ServerInfo>;
  fetchLocales(): Promise<string[]>;
  fetchKeysMetadata(): Promise<{ allKeys: string[]; codeKeys: string[] }>;
  fetchLocaleDictionary(locale: string): Promise<Record<string, any>>;
  fetchGitState(): Promise<GitState>;
  saveTranslation(
    locale: string,
    key: string,
    value: string,
    options?: SaveOptions
  ): Promise<{ success: true; key: string; locale: string }>;
  addLocaleRequest(locale: string): Promise<{ success: true; locale: string }>;
  renameLocaleRequest(locale: string, newLocale: string): Promise<{ success: true }>;
  deleteLocaleRequest(locale: string): Promise<{ success: true }>;
  commitLocales(message: string): Promise<{ success: true; hash: string }>;
  discardLocales(): Promise<{ success: true }>;
}

/** The app's LiveLocale API over HTTP (server stacks). */
const httpTransport: StudioTransport = {
  fetchInfo: () => get<ServerInfo>('?action=info'),
  fetchLocales: () => get<string[]>(),
  fetchKeysMetadata: () => get<{ allKeys: string[]; codeKeys: string[] }>('?action=keys'),
  fetchLocaleDictionary: (locale) =>
    get<Record<string, any>>(`?locale=${encodeURIComponent(locale)}`),
  fetchGitState: () => get<GitState>('?action=git'),
  saveTranslation: (locale, key, value, options = {}) =>
    post<{ success: true; key: string; locale: string }>({
      locale,
      key,
      value,
      ...(options.reference !== undefined ? { reference: options.reference } : {}),
      ...(options.force ? { force: true } : {}),
    }),
  addLocaleRequest: (locale) =>
    post<{ success: true; locale: string }>({ action: 'addLocale', locale }),
  renameLocaleRequest: (locale, newLocale) =>
    post<{ success: true }>({ action: 'renameLocale', locale, newLocale }),
  deleteLocaleRequest: (locale) => post<{ success: true }>({ action: 'deleteLocale', locale }),
  commitLocales: (message) => post<{ success: true; hash: string }>({ action: 'commit', message }),
  discardLocales: () => post<{ success: true }>({ action: 'discard' }),
};

let activeTransport: StudioTransport = httpTransport;

/** Replace the transport every endpoint below uses; `null` restores the HTTP transport. */
export function setStudioTransport(transport: StudioTransport | null): void {
  activeTransport = transport ?? httpTransport;
}

export const fetchInfo = () => activeTransport.fetchInfo();
export const fetchLocales = () => activeTransport.fetchLocales();
export const fetchKeysMetadata = () => activeTransport.fetchKeysMetadata();
export const fetchLocaleDictionary = (locale: string) =>
  activeTransport.fetchLocaleDictionary(locale);
export const fetchGitState = () => activeTransport.fetchGitState();
export const saveTranslation = (
  locale: string,
  key: string,
  value: string,
  options: SaveOptions = {}
) => activeTransport.saveTranslation(locale, key, value, options);
export const addLocaleRequest = (locale: string) => activeTransport.addLocaleRequest(locale);
export const renameLocaleRequest = (locale: string, newLocale: string) =>
  activeTransport.renameLocaleRequest(locale, newLocale);
export const deleteLocaleRequest = (locale: string) => activeTransport.deleteLocaleRequest(locale);
export const commitLocales = (message: string) => activeTransport.commitLocales(message);
export const discardLocales = () => activeTransport.discardLocales();
