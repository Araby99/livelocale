import { APP_ORIGIN } from './features/dashboard/constants.js';

const API = `${APP_ORIGIN}/api/i18n-lens/mutate`;

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
}

async function parse<T>(response: Response): Promise<T> {
  let body: any = null;
  try {
    body = await response.json();
  } catch {}
  if (!response.ok) {
    throw new Error(body?.error || `Server responded with status ${response.status}`);
  }
  return body as T;
}

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parse<T>(response);
}

export function fetchGitState(): Promise<GitState> {
  return fetch(`${API}?action=git`).then((r) => parse<GitState>(r));
}

export function commitLocales(message: string): Promise<{ success: true; hash: string }> {
  return post({ action: 'commit', message });
}

export function discardLocales(): Promise<{ success: true }> {
  return post({ action: 'discard' });
}

export function saveTranslation(
  locale: string,
  key: string,
  value: string
): Promise<{ success: true; key: string; locale: string }> {
  return post({ locale, key, value });
}
