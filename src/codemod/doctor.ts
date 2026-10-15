import * as fs from 'fs';
import * as path from 'path';
import { LOCALE_RE } from '../core/validate.js';

export type FindingLevel = 'ok' | 'warn' | 'fail';

export interface Finding {
  level: FindingLevel;
  title: string;
  detail?: string;
}

export interface DoctorOptions {
  /** Project root to inspect. */
  projectDir: string;
  /** Locales directory, absolute or relative to `projectDir`. Defaults to `locales`. */
  localesPath?: string;
  /** When given, the running app is probed over HTTP. */
  appOrigin?: string;
  /** Injectable fetch for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const ROUTE_CANDIDATES = [
  'app/api/i18n-lens/mutate/route.ts',
  'app/api/i18n-lens/mutate/route.js',
  'src/app/api/i18n-lens/mutate/route.ts',
  'src/app/api/i18n-lens/mutate/route.js',
  'pages/api/i18n-lens/mutate.ts',
  'pages/api/i18n-lens/mutate.js',
  'src/pages/api/i18n-lens/mutate.ts',
  'src/pages/api/i18n-lens/mutate.js',
];

const LAYOUT_CANDIDATES = [
  'app/layout.tsx',
  'app/layout.jsx',
  'app/layout.js',
  'src/app/layout.tsx',
  'src/app/layout.jsx',
  'src/app/layout.js',
  'pages/_app.tsx',
  'pages/_app.jsx',
  'pages/_app.js',
  'src/pages/_app.tsx',
  'src/pages/_app.jsx',
  'src/pages/_app.js',
];

// Next.js 16 renamed middleware.ts to proxy.ts; both are checked.
const MIDDLEWARE_CANDIDATES = [
  'middleware.ts',
  'middleware.js',
  'middleware.mjs',
  'src/middleware.ts',
  'src/middleware.js',
  'proxy.ts',
  'proxy.js',
  'src/proxy.ts',
  'src/proxy.js',
];

const NEXT_CONFIG_CANDIDATES = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'next.config.cjs',
];

const API_ROUTE = '/api/i18n-lens/mutate';

function firstExisting(root: string, candidates: string[]): string | null {
  for (const rel of candidates) {
    if (fs.existsSync(path.join(root, rel))) return rel;
  }
  return null;
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

// ─── Static checks ──────────────────────────────────────────────────────────

function checkRouteHandler(root: string): Finding {
  const found = firstExisting(root, ROUTE_CANDIDATES);
  if (found) return { level: 'ok', title: 'Mutation route handler', detail: found };
  return {
    level: 'fail',
    title: 'Mutation route handler',
    detail: `No route file found at ${ROUTE_CANDIDATES[0]} (or the src/ and pages/ variants). Run: npx next-i18n-lens init`,
  };
}

function checkProvider(root: string): Finding {
  const existing = LAYOUT_CANDIDATES.filter((rel) => fs.existsSync(path.join(root, rel)));
  if (existing.length === 0) {
    return {
      level: 'warn',
      title: 'I18nLensProvider mounted',
      detail:
        'No root layout (app/layout.*) or pages/_app.* found, so the provider could not be verified.',
    };
  }
  const mounted = existing.find((rel) =>
    /I18nLensProvider|ClientInitializer/.test(readText(path.join(root, rel)))
  );
  if (mounted) return { level: 'ok', title: 'I18nLensProvider mounted', detail: mounted };
  return {
    level: 'warn',
    title: 'I18nLensProvider mounted',
    detail: `Add <I18nLensProvider /> from 'next-i18n-lens/react' to ${existing[0]} so the Studio can talk to the page.`,
  };
}

function checkMiddleware(root: string): Finding {
  const found = firstExisting(root, MIDDLEWARE_CANDIDATES);
  if (!found) return { level: 'ok', title: 'Middleware matcher', detail: 'no middleware file' };
  const text = readText(path.join(root, found));
  if (text.includes('api/i18n-lens')) {
    return { level: 'ok', title: 'Middleware matcher', detail: `${found} excludes ${API_ROUTE}` };
  }
  return {
    level: 'warn',
    title: 'Middleware matcher',
    detail: `${found} does not mention api/i18n-lens. If it enforces auth or redirects, exclude the route: matcher: ['/((?!api/i18n-lens).*)']`,
  };
}

function checkFrameHeaders(root: string): Finding {
  const found = firstExisting(root, NEXT_CONFIG_CANDIDATES);
  if (!found)
    return { level: 'ok', title: 'Frame-blocking headers in next.config', detail: 'none' };
  const text = readText(path.join(root, found));
  const hits: string[] = [];
  if (/frame-ancestors/i.test(text)) hits.push('frame-ancestors');
  if (/x-frame-options/i.test(text)) hits.push('X-Frame-Options');
  if (hits.length === 0) {
    return { level: 'ok', title: 'Frame-blocking headers in next.config', detail: 'none' };
  }
  return {
    level: 'warn',
    title: 'Frame-blocking headers in next.config',
    detail: `${found} sets ${hits.join(' and ')}. The Studio embeds your app in an iframe; allow http://localhost:3010 (or your Studio origin) when NODE_ENV is development.`,
  };
}

function checkLocales(root: string, localesPath: string | undefined): Finding {
  const dir = path.resolve(root, localesPath ?? 'locales');
  const rel = path.relative(root, dir) || '.';
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return {
      level: 'fail',
      title: 'Locale files',
      detail: `Directory not found: ${rel}. Create it or pass --locales <path> (and set localesPath in the route handler).`,
    };
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const flat = entries.filter((e) => e.isFile() && e.name.endsWith('.json'));
  const dirs = entries.filter((e) => e.isDirectory() && LOCALE_RE.test(e.name));
  const invalid: string[] = [];
  let fileCount = 0;

  const validate = (file: string, label: string) => {
    fileCount++;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        invalid.push(`${label} (root must be an object)`);
      }
    } catch (err: any) {
      invalid.push(`${label} (${err.message})`);
    }
  };

  for (const f of flat) validate(path.join(dir, f.name), f.name);
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(dir, d.name))) {
      if (f.endsWith('.json')) validate(path.join(dir, d.name, f), `${d.name}/${f}`);
    }
  }

  if (invalid.length > 0) {
    return { level: 'fail', title: 'Locale files', detail: `Invalid JSON: ${invalid.join('; ')}` };
  }
  if (fileCount === 0) {
    return {
      level: 'fail',
      title: 'Locale files',
      detail: `${rel} contains no *.json locale files.`,
    };
  }
  if (flat.length > 0 && dirs.length > 0) {
    return {
      level: 'warn',
      title: 'Locale files',
      detail: `${rel} mixes flat files (${flat.length}) and namespace folders (${dirs.length}); pick one layout.`,
    };
  }
  const layout =
    dirs.length > 0
      ? `${dirs.length} namespaced locale folder(s)`
      : `${flat.length} flat locale file(s)`;
  return {
    level: 'ok',
    title: 'Locale files',
    detail: `${rel}: ${layout}, ${fileCount} file(s) parse`,
  };
}

// ─── Live checks ────────────────────────────────────────────────────────────

async function probe(
  fetchImpl: typeof fetch,
  url: string
): Promise<{ ok: true; res: Response } | { ok: false; error: string }> {
  try {
    const signal =
      typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined;
    const res = await fetchImpl(url, { signal, redirect: 'manual' });
    return { ok: true, res };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function checkLive(appOrigin: string, fetchImpl: typeof fetch): Promise<Finding[]> {
  const findings: Finding[] = [];
  const origin = appOrigin.replace(/\/+$/, '');

  const api = await probe(fetchImpl, `${origin}${API_ROUTE}`);
  if (!api.ok) {
    findings.push({
      level: 'fail',
      title: 'Mutation API',
      detail: `${origin} is not reachable (${api.error}). Is the dev server running?`,
    });
  } else {
    const { res } = api;
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    if (res.status === 200 && Array.isArray(body)) {
      findings.push({
        level: 'ok',
        title: 'Mutation API',
        detail: `${origin}${API_ROUTE} responded with ${body.length} locale(s)`,
      });
    } else if (res.status === 403) {
      findings.push({
        level: 'fail',
        title: 'Mutation API',
        detail: `Server refused the request: ${body?.error || 'HTTP 403'}`,
      });
    } else if (res.status === 404) {
      findings.push({
        level: 'fail',
        title: 'Mutation API',
        detail: `HTTP 404 at ${origin}${API_ROUTE}. The route handler is not served; run npx next-i18n-lens init and restart the dev server.`,
      });
    } else if (res.status >= 300 && res.status < 400) {
      findings.push({
        level: 'fail',
        title: 'Mutation API',
        detail: `HTTP ${res.status} redirect at ${API_ROUTE}; auth middleware is probably intercepting it. Exclude api/i18n-lens from the matcher.`,
      });
    } else {
      findings.push({
        level: 'fail',
        title: 'Mutation API',
        detail: `Unexpected HTTP ${res.status}: ${body?.error || 'no error body'}`,
      });
    }
  }

  const page = await probe(fetchImpl, `${origin}/`);
  if (page.ok) {
    const csp = page.res.headers.get('content-security-policy') || '';
    const xfo = page.res.headers.get('x-frame-options') || '';
    const blockers: string[] = [];
    if (/frame-ancestors/i.test(csp))
      blockers.push(`Content-Security-Policy: ${csp.match(/frame-ancestors[^;]*/i)?.[0]}`);
    if (xfo) blockers.push(`X-Frame-Options: ${xfo}`);
    if (blockers.length > 0) {
      findings.push({
        level: 'warn',
        title: 'Studio can embed the app',
        detail: `${origin}/ sends ${blockers.join(' and ')}. Unless the Studio origin is allowed, the preview iframe will be blank.`,
      });
    } else {
      findings.push({
        level: 'ok',
        title: 'Studio can embed the app',
        detail: 'no frame-blocking headers',
      });
    }
  }

  return findings;
}

// ─── Entry points ───────────────────────────────────────────────────────────

export async function runDoctor(options: DoctorOptions): Promise<Finding[]> {
  const root = path.resolve(options.projectDir);
  const findings: Finding[] = [
    checkRouteHandler(root),
    checkProvider(root),
    checkMiddleware(root),
    checkFrameHeaders(root),
    checkLocales(root, options.localesPath),
  ];

  if (options.appOrigin) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      findings.push({
        level: 'warn',
        title: 'Mutation API',
        detail: 'Live checks need Node 18+ (global fetch).',
      });
    } else {
      findings.push(...(await checkLive(options.appOrigin, fetchImpl)));
    }
  }

  return findings;
}

export function hasFailures(findings: Finding[]): boolean {
  return findings.some((f) => f.level === 'fail');
}

const GLYPH: Record<FindingLevel, string> = { ok: '✅', warn: '⚠️ ', fail: '❌' };

export function formatFindings(findings: Finding[]): string {
  const lines: string[] = [];
  for (const f of findings) {
    lines.push(`${GLYPH[f.level]} ${f.title}`);
    if (f.detail) lines.push(`   ${f.detail}`);
  }
  return lines.join('\n');
}
