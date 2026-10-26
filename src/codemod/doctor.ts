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
  /** Bearer token for an app that requires one (preview mode). Defaults to `LIVELOCALE_TOKEN`. */
  token?: string;
  /** Injectable fetch for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const ROUTE_CANDIDATES = [
  'app/api/livelocale/route.ts',
  'app/api/livelocale/route.js',
  'src/app/api/livelocale/route.ts',
  'src/app/api/livelocale/route.js',
  'pages/api/livelocale.ts',
  'pages/api/livelocale.js',
  'src/pages/api/livelocale.ts',
  'src/pages/api/livelocale.js',
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

const API_ROUTE = '/api/livelocale';

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
    detail: `No route file found at ${ROUTE_CANDIDATES[0]} (or the src/ and pages/ variants). Run: npx livelocale init`,
  };
}

function checkProvider(root: string): Finding {
  const existing = LAYOUT_CANDIDATES.filter((rel) => fs.existsSync(path.join(root, rel)));
  if (existing.length === 0) {
    return {
      level: 'warn',
      title: 'LiveLocaleProvider mounted',
      detail:
        'No root layout (app/layout.*) or pages/_app.* found, so the provider could not be verified.',
    };
  }
  const mounted = existing.find((rel) => /LiveLocaleProvider/.test(readText(path.join(root, rel))));
  if (mounted) return { level: 'ok', title: 'LiveLocaleProvider mounted', detail: mounted };
  return {
    level: 'warn',
    title: 'LiveLocaleProvider mounted',
    detail: `Add <LiveLocaleProvider /> from 'livelocale/react' to ${existing[0]} so the Studio can talk to the page.`,
  };
}

function checkMiddleware(root: string): Finding {
  const found = firstExisting(root, MIDDLEWARE_CANDIDATES);
  if (!found) return { level: 'ok', title: 'Middleware matcher', detail: 'no middleware file' };
  const text = readText(path.join(root, found));
  if (text.includes('api/livelocale')) {
    return { level: 'ok', title: 'Middleware matcher', detail: `${found} excludes ${API_ROUTE}` };
  }
  return {
    level: 'warn',
    title: 'Middleware matcher',
    detail: `${found} does not mention api/livelocale. If it enforces auth or redirects, exclude the route: matcher: ['/((?!api/livelocale).*)']`,
  };
}

/** The default Studio origin inside a frame-ancestors source or config text. */
const STUDIO_ORIGIN_RE = /(?:localhost|127\.0\.0\.1):3010(?!\d)/;

/** True when a frame-ancestors directive lets the default Studio embed the page. */
function allowsStudio(frameAncestors: string): boolean {
  const sources = frameAncestors.split(/\s+/).slice(1);
  return sources.includes('*') || sources.some((src) => STUDIO_ORIGIN_RE.test(src));
}

function checkFrameHeaders(root: string): Finding {
  const found = firstExisting(root, NEXT_CONFIG_CANDIDATES);
  if (!found)
    return { level: 'ok', title: 'Frame-blocking headers in next.config', detail: 'none' };
  const text = readText(path.join(root, found));
  if (STUDIO_ORIGIN_RE.test(text)) {
    return {
      level: 'ok',
      title: 'Frame-blocking headers in next.config',
      detail: `${found} sets frame headers that name the Studio origin`,
    };
  }
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
  url: string,
  token?: string
): Promise<{ ok: true; res: Response } | { ok: false; error: string }> {
  try {
    // Preview deployments answer in cold starts and GitHub round trips; allow more time there.
    const signal =
      typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(15000) : undefined;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetchImpl(url, { signal, redirect: 'manual', headers });
    return { ok: true, res };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Describes a redirect to a hosting provider's login page (Vercel Deployment
 * Protection, Netlify password protection, …), or returns null for any other response.
 */
function loginWall(res: Response, origin: string): string | null {
  if (res.status < 300 || res.status >= 400) return null;
  const location = res.headers.get('location') || '';
  let target: URL;
  try {
    target = new URL(location, origin);
  } catch {
    return null;
  }
  if (target.origin === new URL(origin).origin) return null;
  if (/(^|\.)vercel\.com$/i.test(target.hostname)) {
    return 'Vercel Deployment Protection redirects visitors to a Vercel login. Turn off Vercel Authentication for preview deployments (Project Settings → Deployment Protection).';
  }
  return `The app redirects to ${target.host}, which looks like a hosting login wall. Allow the Studio through it or turn it off for this deployment.`;
}

async function checkServerInfo(
  origin: string,
  fetchImpl: typeof fetch,
  token: string | undefined
): Promise<Finding[]> {
  const res = await probe(fetchImpl, `${origin}${API_ROUTE}?action=info`, token);
  if (!res.ok || res.res.status !== 200) return [];
  let info: any = null;
  try {
    info = await res.res.json();
  } catch {}
  if (!info || typeof info.mode !== 'string') return [];
  const findings: Finding[] = [
    {
      level: 'ok',
      title: 'Server mode',
      detail: `${info.mode}${info.authRequired ? ', token required' : ''}${info.git ? ', git actions available' : ''}`,
    },
  ];
  for (const problem of Array.isArray(info.problems) ? info.problems : []) {
    findings.push({ level: 'fail', title: 'Repository access', detail: String(problem) });
  }
  return findings;
}

async function checkLive(
  appOrigin: string,
  fetchImpl: typeof fetch,
  token: string | undefined
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const origin = appOrigin.replace(/\/+$/, '');

  const api = await probe(fetchImpl, `${origin}${API_ROUTE}`, token);
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
      findings.push(...(await checkServerInfo(origin, fetchImpl, token)));
    } else if (res.status === 401) {
      findings.push({
        level: 'fail',
        title: 'Mutation API',
        detail: token
          ? 'The server rejected the access token. Check LIVELOCALE_TOKEN on the deployment.'
          : 'The server requires an access token (preview mode). Re-run with --token <token> or set LIVELOCALE_TOKEN.',
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
        detail: `HTTP 404 at ${origin}${API_ROUTE}. The route handler is not served; run npx livelocale init and restart the dev server.`,
      });
    } else if (res.status >= 300 && res.status < 400) {
      const wall = loginWall(res, origin);
      findings.push({
        level: 'fail',
        title: 'Mutation API',
        detail: wall
          ? `${wall} The Studio cannot reach the app through it.`
          : `HTTP ${res.status} redirect at ${API_ROUTE}; auth middleware is probably intercepting it. Exclude api/livelocale from the matcher.`,
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
  const pageWall = page.ok ? loginWall(page.res, origin) : null;
  if (pageWall) {
    findings.push({ level: 'fail', title: 'Studio can embed the app', detail: pageWall });
  } else if (page.ok) {
    const csp = page.res.headers.get('content-security-policy') || '';
    const xfo = page.res.headers.get('x-frame-options') || '';
    const blockers: string[] = [];
    const frameAncestors = csp.match(/frame-ancestors[^;]*/i)?.[0];
    if (frameAncestors && !allowsStudio(frameAncestors.trim())) {
      blockers.push(`Content-Security-Policy: ${frameAncestors}`);
    }
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
      const token = options.token ?? process.env['LIVELOCALE_TOKEN'] ?? undefined;
      findings.push(...(await checkLive(options.appOrigin, fetchImpl, token || undefined)));
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
