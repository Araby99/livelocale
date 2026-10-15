import { promises as fs } from 'fs';
import * as path from 'path';
import { resolveSafeLocalePath } from '../core/safe-path.js';
import { getDisabledReason } from '../core/env.js';
import {
  isValidKeyFormat,
  isValidLocaleFormat,
  isValidValueFormat,
  isSafeKeyPath,
} from '../core/validate.js';

/**
 * Platform-agnostic port for translation file operations. The Next.js and
 * Vite adapters both depend on this narrow contract (DIP) instead of the
 * concrete FileMutator implementation.
 */
export interface MutationGateway {
  updateLocaleKey(basePath: string, locale: string, key: string, value: string): Promise<void>;
  listLocales(basePath: string): Promise<string[]>;
  addLocale(basePath: string, locale: string): Promise<void>;
  renameLocale(basePath: string, locale: string, newLocale: string): Promise<void>;
  deleteLocale(basePath: string, locale: string): Promise<void>;
  getKeysMetadata(basePath: string): Promise<{ allKeys: string[]; codeKeys: string[] }>;
}

export type GitChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed';

export interface GitChange {
  /** Path relative to the repository root, forward slashes. */
  path: string;
  status: GitChangeStatus;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  changes: GitChange[];
}

/**
 * Optional port for version-control operations scoped to the locales
 * directory. Implemented by `GitClient`; absent when git integration is off.
 */
export interface GitGateway {
  status(localesPath: string): Promise<GitStatus>;
  diff(localesPath: string): Promise<string>;
  commit(localesPath: string, message: string): Promise<{ hash: string }>;
  discard(localesPath: string): Promise<void>;
}

export interface RouterRequest {
  method: string;
  url: string;
  origin: string;
  /** Raw request body for body-carrying methods; parsed by the router. */
  bodyText?: string;
  /** Value of the Content-Type header (lowercased), if any. */
  contentType?: string;
}

export interface RouterResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

export interface MutationRouterOptions {
  localesPath: string;
  allowedOrigins?: string[];
  /** Enables the `git` read action and the `commit` / `discard` write actions. */
  git?: GitGateway;
}

export interface MutationRouter {
  handle(request: RouterRequest): Promise<RouterResponse>;
}

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3010', 'http://127.0.0.1:3010'];

/** Maximum accepted request body size (1 MB) — far above any realistic payload. */
export const MAX_BODY_BYTES = 1_000_000;

/** Commit messages longer than this are rejected. */
export const MAX_COMMIT_MESSAGE_LENGTH = 500;

/** Any localhost origin (any port) is trusted — remote websites are not. */
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const json = (
  status: number,
  headers: Record<string, string>,
  payload: unknown
): RouterResponse => ({
  status,
  headers,
  body: JSON.stringify(payload),
});

/**
 * The single implementation of the i18n-lens mutation API.
 *
 * Both the Next.js route handler and the Vite dev-server middleware are thin
 * adapters over this router, so validation, CORS, and error handling live in
 * exactly one place (OCP).
 */
export function createMutationRouter(
  mutator: MutationGateway,
  options: MutationRouterOptions
): MutationRouter {
  // Extra origins may be supplied at run time (GitHub Codespaces, Gitpod,
  // custom HTTPS dev hostnames) without touching code:
  //   I18N_LENS_ALLOWED_ORIGINS="https://abc-3010.app.github.dev,https://studio.dev.local"
  const envOrigins = (process.env['I18N_LENS_ALLOWED_ORIGINS'] || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedOrigins = [...(options.allowedOrigins || DEFAULT_ALLOWED_ORIGINS), ...envOrigins];
  const localesPath = options.localesPath;
  const git = options.git;

  const isOriginAllowed = (origin: string): boolean =>
    allowedOrigins.includes(origin) || LOCALHOST_ORIGIN_RE.test(origin);

  const resolveAllowedOrigin = (origin: string): string => {
    return isOriginAllowed(origin) ? origin : allowedOrigins[0] || '';
  };

  const corsHeaders = (origin: string): Record<string, string> => ({
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin),
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  });

  // ─── GET: Fetch locale dictionary, list locales, or fetch keys metadata ───

  async function handleGet(
    urlObj: URL,
    basePath: string,
    headers: Record<string, string>
  ): Promise<RouterResponse> {
    const locale = urlObj.searchParams.get('locale');
    const action = urlObj.searchParams.get('action');

    if (action === 'git') {
      if (!git) {
        return json(200, headers, {
          available: false,
          isRepo: false,
          branch: null,
          changes: [],
          diff: '',
        });
      }
      try {
        const status = await git.status(basePath);
        const diff = status.isRepo && status.changes.length > 0 ? await git.diff(basePath) : '';
        return json(200, headers, { available: true, ...status, diff });
      } catch (err: any) {
        return json(500, headers, {
          error: `Failed to read git status: ${err.message}`,
          code: 'GIT_STATUS_FAILED',
        });
      }
    }

    if (action === 'keys') {
      try {
        const metadata = await mutator.getKeysMetadata(basePath);
        return json(200, headers, metadata);
      } catch (err: any) {
        return json(500, headers, {
          error: `Failed to fetch keys metadata: ${err.message}`,
          code: 'KEYS_METADATA_FAILED',
        });
      }
    }

    if (!locale) {
      try {
        const localesList = await mutator.listLocales(basePath);
        return json(200, headers, localesList);
      } catch (err: any) {
        return json(500, headers, {
          error: `Failed to list locales: ${err.message}`,
          code: 'LIST_LOCALES_FAILED',
        });
      }
    }

    if (!isValidLocaleFormat(locale)) {
      return json(400, headers, {
        error: 'Invalid locale string parameter.',
        code: 'INVALID_LOCALE_FORMAT',
      });
    }

    try {
      const localePath = path.resolve(basePath, locale);
      let isDir = false;
      try {
        const stats = await fs.stat(localePath);
        isDir = stats.isDirectory();
      } catch {}

      if (isDir) {
        const files = await fs.readdir(localePath);
        const merged: Record<string, any> = {};
        for (const file of files) {
          if (file.endsWith('.json')) {
            const ns = path.basename(file, '.json');
            try {
              const content = await fs.readFile(path.join(localePath, file), 'utf-8');
              merged[ns] = JSON.parse(content);
            } catch {}
          }
        }
        return json(200, headers, merged);
      } else {
        const filePath = resolveSafeLocalePath(basePath, locale);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return json(200, headers, JSON.parse(fileContent));
      }
    } catch (readErr: any) {
      return json(404, headers, {
        error: `Failed to load locale: ${readErr.message}`,
        code: 'LOCALE_LOAD_FAILED',
      });
    }
  }

  // ─── POST: Mutate a translation key or manage locales ────────────────────

  async function handlePost(
    bodyText: string | undefined,
    basePath: string,
    headers: Record<string, string>
  ): Promise<RouterResponse> {
    let body: any;
    try {
      body = JSON.parse(bodyText ?? '');
    } catch {
      return json(400, headers, {
        error: 'Invalid JSON request body',
        code: 'BAD_REQUEST',
      });
    }

    const { locale, key, value, action, newLocale, message } = body || {};

    if (action === 'commit' || action === 'discard') {
      if (!git) {
        return json(501, headers, {
          error: 'Git integration is not enabled for this handler.',
          code: 'GIT_UNAVAILABLE',
        });
      }
      if (action === 'commit') {
        const text = typeof message === 'string' ? message.trim() : '';
        if (!text || text.length > MAX_COMMIT_MESSAGE_LENGTH) {
          return json(400, headers, {
            error: `Commit message must be 1-${MAX_COMMIT_MESSAGE_LENGTH} characters.`,
            code: 'INVALID_COMMIT_MESSAGE',
          });
        }
        try {
          const result = await git.commit(basePath, text);
          return json(200, headers, { success: true, hash: result.hash });
        } catch (err: any) {
          return json(409, headers, { error: err.message, code: 'GIT_COMMIT_FAILED' });
        }
      }
      try {
        await git.discard(basePath);
        return json(200, headers, { success: true });
      } catch (err: any) {
        return json(500, headers, { error: err.message, code: 'GIT_DISCARD_FAILED' });
      }
    }

    if (action === 'addLocale') {
      if (!isValidLocaleFormat(locale)) {
        return json(400, headers, {
          error: 'Invalid locale string parameter.',
          code: 'INVALID_LOCALE_FORMAT',
        });
      }
      await mutator.addLocale(basePath, locale);
      return json(200, headers, { success: true, locale });
    }

    if (action === 'renameLocale') {
      if (!isValidLocaleFormat(locale) || !isValidLocaleFormat(newLocale)) {
        return json(400, headers, {
          error: 'Invalid oldLocale or newLocale parameter.',
          code: 'INVALID_LOCALE_FORMAT',
        });
      }
      await mutator.renameLocale(basePath, locale, newLocale);
      return json(200, headers, { success: true, locale, newLocale });
    }

    if (action === 'deleteLocale') {
      if (!isValidLocaleFormat(locale)) {
        return json(400, headers, {
          error: 'Invalid locale string parameter.',
          code: 'INVALID_LOCALE_FORMAT',
        });
      }
      await mutator.deleteLocale(basePath, locale);
      return json(200, headers, { success: true, locale });
    }

    if (!isValidLocaleFormat(locale)) {
      return json(400, headers, {
        error: 'Invalid locale string parameter.',
        code: 'INVALID_LOCALE_FORMAT',
      });
    }

    if (!isValidKeyFormat(key)) {
      return json(400, headers, {
        error:
          'Invalid key path. Must be 1-200 characters containing alphanumeric, dots, underscores, or hyphens.',
        code: 'INVALID_KEY_FORMAT',
      });
    }

    if (!isSafeKeyPath(key)) {
      return json(400, headers, {
        error:
          'Forbidden key path: segments like __proto__, constructor, or prototype are not allowed.',
        code: 'INVALID_KEY_FORMAT',
      });
    }

    if (!isValidValueFormat(value)) {
      return json(400, headers, {
        error: 'Invalid value. Must be a string less than 10000 characters.',
        code: 'INVALID_VALUE_FORMAT',
      });
    }

    await mutator.updateLocaleKey(basePath, locale, key, value);

    return json(200, headers, { success: true, key, locale });
  }

  return {
    async handle(request: RouterRequest): Promise<RouterResponse> {
      const headers = corsHeaders(request.origin);

      // RULE GEN-001: DEVELOPMENT-ONLY ENFORCEMENT
      const disabledReason = getDisabledReason();
      if (disabledReason !== null) {
        return json(403, headers, {
          error: `Forbidden: i18n Lens is disabled — ${disabledReason}. It only runs in development mode.`,
          code: 'FORBIDDEN',
        });
      }

      // RULE SEC-006: CSRF PREVENTION — hard-reject writes from disallowed origins
      // (browsers always send Origin on cross-origin POSTs, including no-cors ones).
      if (request.method === 'POST' && request.origin && !isOriginAllowed(request.origin)) {
        return json(403, headers, {
          error: 'Forbidden: request origin is not allowed.',
          code: 'FORBIDDEN_ORIGIN',
        });
      }

      // RULE SEC-006: require a JSON content type on writes so the no-cors
      // "text/plain" CSRF vector cannot bypass validation via simple requests.
      if (
        request.method === 'POST' &&
        request.contentType &&
        !request.contentType.includes('application/json')
      ) {
        return json(415, headers, {
          error: 'Content-Type must be application/json.',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        });
      }

      try {
        if (request.method === 'OPTIONS') {
          return { status: 204, headers, body: null };
        }

        if (request.method === 'GET') {
          const urlObj = new URL(request.url, 'http://localhost');
          return await handleGet(urlObj, localesPath, headers);
        }

        if (request.method === 'POST') {
          return await handlePost(request.bodyText, localesPath, headers);
        }

        // Unsupported method
        return json(405, headers, {
          error: 'Method Not Allowed',
          code: 'METHOD_NOT_ALLOWED',
        });
      } catch (err: any) {
        return json(500, headers, {
          error: err.message || 'Internal Server Error',
          code: 'INTERNAL_ERROR',
        });
      }
    },
  };
}
