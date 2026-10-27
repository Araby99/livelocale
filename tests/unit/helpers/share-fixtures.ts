import { vi, type Mock } from 'vitest';
import type { ShareManifest } from '../../../src/core/share-manifest.js';

/** Fixed commit ids for share tests. */
export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);

/** A Studio served from a static host, and the app one folder above it. */
export const STUDIO_URL = 'https://www.acme.com/livelocale/index.html';
export const APP_URL = 'https://www.acme.com/';

export const MANIFEST: ShareManifest = {
  format: 1,
  branch: 'main',
  defaultBranch: 'main',
  base: SHA_A,
  localesPath: 'src/locales',
  layout: 'flat',
  sourceLocale: 'en',
  basePath: '/',
  locales: ['ar', 'en'],
  codeKeys: ['home.greet', 'home.title', 'home.unused'],
};

export const EN = { home: { title: 'Welcome', greet: 'Hello {name}' } } as const;
export const AR = { home: { title: 'مرحبا', greet: 'أهلا {name}' } } as const;

export type FetchStub = typeof fetch & Mock<Parameters<typeof fetch>, ReturnType<typeof fetch>>;

/**
 * A `fetch` that serves `files`, keyed by absolute URL, and answers 404 for anything else.
 * A string becomes a fresh 200 response on every call; a `Response` is cloned per call.
 */
export function fetchStub(files: Record<string, string | Response>): FetchStub {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const file = Object.prototype.hasOwnProperty.call(files, url) ? files[url] : undefined;
    if (file === undefined) return new Response('', { status: 404 });
    return typeof file === 'string' ? new Response(file) : file.clone();
  }) as FetchStub;
}
