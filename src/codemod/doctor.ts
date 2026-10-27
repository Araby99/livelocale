import * as fs from 'fs';
import * as path from 'path';
import { LOCALE_RE } from '../core/validate.js';
import { FLAG_SCRIPT_SIGNATURE } from '../core/flag-script.js';
import {
  SHARE_DIR,
  SHARE_FLAG_FILE,
  SHARE_MANIFEST_FILE,
  isShareManifest,
} from '../core/share-manifest.js';

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
  /** Absolute URL of the app base, ending in `/`. Defaults to `appOrigin + '/'`. */
  appBase?: string;
  /** Run the share-link probes even when `<base>livelocale/manifest.json` does not answer. */
  share?: boolean;
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

const VITE_CONFIG_CANDIDATES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  'vite.config.cts',
];

/** Files that can configure a Workbox service worker (vite-plugin-pwa or workbox-webpack-plugin). */
const SERVICE_WORKER_CONFIG_CANDIDATES = [
  ...VITE_CONFIG_CANDIDATES,
  'webpack.config.js',
  'webpack.config.cjs',
  'webpack.config.mjs',
  'webpack.config.ts',
  'craco.config.js',
  'craco.config.ts',
  'vue.config.js',
  'config-overrides.js',
  ...NEXT_CONFIG_CANDIDATES,
  'package.json',
];

const API_ROUTE = '/api/livelocale';

/** The Workbox option that keeps the app shell off the share Studio, printed verbatim. */
const DENYLIST_LINE = 'navigateFallbackDenylist: [/^\\/livelocale\\//]';

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

/** True when the project builds a static share link, which needs no route handler. */
function buildsStaticShare(root: string): boolean {
  const vite = firstExisting(root, VITE_CONFIG_CANDIDATES);
  const viteText = vite ? readText(path.join(root, vite)) : '';
  if (/liveLocaleVite\s*\(\s*\{[^)]*\bshare\b(?!\s*:\s*false)/.test(viteText)) return true;
  let scripts: unknown;
  try {
    scripts = JSON.parse(readText(path.join(root, 'package.json')) || '{}')?.scripts;
  } catch {
    return false;
  }
  if (typeof scripts !== 'object' || scripts === null) return false;
  return Object.values(scripts).some(
    (cmd) => typeof cmd === 'string' && /\blivelocale\s+(?:pack|build)\b/.test(cmd)
  );
}

function checkRouteHandler(root: string): Finding {
  const found = firstExisting(root, ROUTE_CANDIDATES);
  if (found) return { level: 'ok', title: 'Mutation route handler', detail: found };
  if (buildsStaticShare(root)) {
    return {
      level: 'ok',
      title: 'Mutation route handler',
      detail: 'not needed for the share link (static build)',
    };
  }
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

/**
 * Warns when a Workbox plugin is configured and no config excludes livelocale/ from its
 * navigation fallback. A bare mention of livelocale does not count: a Vite config imports
 * `livelocale/vite` and package.json lists the package. Returns null otherwise (PF-16: an ok
 * finding here would shadow the live `Service worker` probe in title lookups).
 */
function checkServiceWorkerConfig(root: string): Finding | null {
  const files = SERVICE_WORKER_CONFIG_CANDIDATES.filter((rel) =>
    fs.existsSync(path.join(root, rel))
  ).map((rel) => ({ rel, text: readText(path.join(root, rel)) }));
  const pwa = files.find(({ text }) => /VitePWA\s*\(|workbox-webpack-plugin/.test(text));
  if (!pwa) return null;
  if (files.some(({ text }) => /navigateFallbackDenylist[\s\S]{0,300}?livelocale/.test(text))) {
    return null;
  }
  const plugin = /VitePWA\s*\(/.test(pwa.text) ? 'VitePWA' : 'workbox-webpack-plugin';
  return {
    level: 'warn',
    title: 'Service worker config',
    detail: `${pwa.rel} uses ${plugin}, and its navigation fallback would answer livelocale/index.html with your app's page. Add to its Workbox options: ${DENYLIST_LINE}`,
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

// ─── Share probes ───────────────────────────────────────────────────────────

/** `<base>livelocale/index.html`, the link translators open. */
export function shareLinkFor(appBase: string): string {
  return `${appBase}${SHARE_DIR}/index.html`;
}

/**
 * Splits an http(s) app URL into its origin and its base: the query and hash are
 * dropped, a trailing `index.html` is dropped, and the path gains a trailing `/`.
 * Throws for anything that is not an http(s) URL.
 */
export function normalizeAppUrl(value: string): { origin: string; base: string } {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Not an http(s) URL: ${value}`);
  }
  let pathname = url.pathname.replace(/index\.html$/, '');
  if (!pathname.endsWith('/')) pathname += '/';
  return { origin: url.origin, base: `${url.origin}${pathname}` };
}

const STUDIO_TITLE = 'LiveLocale · Studio';
const UPLOAD_HINT = 'Upload the livelocale/ folder from your build output.';

/** One share probe's answer, read once so several findings can share it. */
type Fetched =
  | { url: string; error: string }
  | { url: string; status: number; headers: Headers; body: string; wall: string | null };

type Answer = Extract<Fetched, { status: number }>;

function isAnswer(page: Fetched): page is Answer {
  return !('error' in page);
}

async function fetchPage(fetchImpl: typeof fetch, url: string, origin: string): Promise<Fetched> {
  const res = await probe(fetchImpl, url);
  if (!res.ok) return { url, error: res.error };
  let body = '';
  try {
    body = await res.res.text();
  } catch {}
  return {
    url,
    status: res.res.status,
    headers: res.res.headers,
    body,
    wall: loginWall(res.res, origin),
  };
}

/** The answer itself, or the failing finding when the probe got no answer or hit a login wall. */
function answered(title: string, page: Fetched): Answer | Finding {
  if (!isAnswer(page)) {
    return { level: 'fail', title, detail: `${page.url} is not reachable (${page.error}).` };
  }
  if (page.wall) return { level: 'fail', title, detail: page.wall };
  return page;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function checkStudioPage(studioPage: Fetched, root: Fetched): Finding {
  const title = 'Share Studio page';
  const studio = answered(title, studioPage);
  if ('level' in studio) return studio;
  if (studio.status === 200 && isAnswer(root) && root.status === 200 && studio.body === root.body) {
    return {
      level: 'fail',
      title,
      detail: `The host answered livelocale/index.html with your app's page (SPA fallback or service worker). ${UPLOAD_HINT}`,
    };
  }
  if (studio.status === 200 && studio.body.includes(STUDIO_TITLE)) {
    return { level: 'ok', title, detail: studio.url };
  }
  return {
    level: 'fail',
    title,
    detail: `${studio.url} answered HTTP ${studio.status} without the LiveLocale Studio. ${UPLOAD_HINT}`,
  };
}

function checkManifest(manifestPage: Fetched): Finding {
  const title = 'Share manifest';
  const manifest = answered(title, manifestPage);
  if ('level' in manifest) return manifest;
  if (manifest.status === 404) {
    return {
      level: 'fail',
      title,
      detail: `${manifest.url} answered HTTP 404; did the build run with share: true or livelocale pack?`,
    };
  }
  const parsed = manifest.status === 200 ? parseJson(manifest.body) : { ok: false as const };
  if (parsed.ok && isShareManifest(parsed.value)) {
    const m = parsed.value;
    return {
      level: 'ok',
      title,
      detail: `${m.locales.length} locale(s), source ${m.sourceLocale}, built from ${m.branch ?? 'an unknown branch'} @ ${m.base?.slice(0, 7) ?? 'an unknown commit'}`,
    };
  }
  return {
    level: 'fail',
    title,
    detail: `${manifest.url} answered HTTP ${manifest.status} without a LiveLocale share manifest (format 1). Rebuild with share: true or run livelocale pack.`,
  };
}

const HEAD_OPEN = /<head(?=[\s>])[^>]*>/i;
const HTML_OPEN = /<html(?=[\s>])[^>]*>/i;
const DOCTYPE = /<!doctype\b[^>]*>/i;

/** The attributes of the first element in `<head>` when it is a `<script>`, else null. */
function firstHeadScript(html: string): string | null {
  let start = 0;
  for (const pattern of [HEAD_OPEN, HTML_OPEN, DOCTYPE]) {
    const match = pattern.exec(html);
    if (match) {
      start = match.index + match[0].length;
      break;
    }
  }
  const rest = html.slice(start).replace(/^(?:\s|<!--[\s\S]*?-->)*/, '');
  return /^<script\b([^>]*)>/i.exec(rest)?.[1] ?? null;
}

function flagTagProblem(root: Fetched, base: string, flagUrl: string): string | null {
  const expected = `The first element in <head> of ${base} must be <script src="${flagUrl}"></script> without async. Run livelocale pack on the build output again.`;
  if (!isAnswer(root) || root.status !== 200) return expected;
  const attrs = firstHeadScript(root.body);
  if (attrs === null || /(?:^|\s)async(?=[\s=]|$)/i.test(attrs)) return expected;
  const src = /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
  const value = src ? (src[1] ?? src[2] ?? src[3] ?? '') : '';
  try {
    if (src && new URL(value, base).href === flagUrl) return null;
  } catch {}
  return expected;
}

function checkFlagScript(flagPage: Fetched, root: Fetched, base: string): Finding {
  const title = 'Share flag script';
  const flag = answered(title, flagPage);
  if ('level' in flag) return flag;
  const problems: string[] = [];
  const type = flag.headers.get('content-type') || '';
  if (
    flag.status !== 200 ||
    !/javascript|ecmascript/i.test(type) ||
    !flag.body.startsWith(FLAG_SCRIPT_SIGNATURE)
  ) {
    problems.push(
      `${flag.url} answered HTTP ${flag.status} (${type || 'no content type'}) without the LiveLocale flag script. ${UPLOAD_HINT}`
    );
  }
  const tag = flagTagProblem(root, base, flag.url);
  if (tag) problems.push(tag);
  if (problems.length > 0) return { level: 'fail', title, detail: problems.join(' ') };
  return { level: 'ok', title, detail: `${flag.url} loads first in <head>` };
}

/** The sources of a CSP directive, or null when the policy does not set it. */
function cspSources(csp: string, directive: string): string[] | null {
  for (const part of csp.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name && name.toLowerCase() === directive) return sources;
  }
  return null;
}

/** True when the sources let the page's own origin in. */
function allowsSelf(sources: string[], origin: string): boolean {
  return sources.some((s) => s === "'self'" || s === '*' || s.replace(/\/+$/, '') === origin);
}

function checkShareFrameHeaders(pages: Fetched[], origin: string): Finding {
  const title = 'Share frame headers';
  const blockers: string[] = [];
  for (const page of pages) {
    const answer = answered(title, page);
    if ('level' in answer) return answer;
    const xfo = (answer.headers.get('x-frame-options') || '').trim();
    if (/^deny$/i.test(xfo)) blockers.push(`${page.url} sends X-Frame-Options: ${xfo}`);
    const ancestors = cspSources(
      answer.headers.get('content-security-policy') || '',
      'frame-ancestors'
    );
    if (ancestors && (ancestors.includes("'none'") || !allowsSelf(ancestors, origin))) {
      blockers.push(`${page.url} sends frame-ancestors ${ancestors.join(' ') || "'none'"}`);
    }
  }
  if (blockers.length > 0) {
    return {
      level: 'fail',
      title,
      detail: `${blockers.join('; ')}. The share Studio frames your app from the same origin; use X-Frame-Options: SAMEORIGIN or frame-ancestors 'self'.`,
    };
  }
  return { level: 'ok', title, detail: 'both pages can be framed by the same origin' };
}

function checkShareCsp(pages: Fetched[], origin: string): Finding {
  const title = 'Share CSP';
  const blocked: string[] = [];
  for (const page of pages) {
    const answer = answered(title, page);
    if ('level' in answer) return answer;
    const csp = answer.headers.get('content-security-policy') || '';
    const scriptSrc = cspSources(csp, 'script-src');
    const sources = scriptSrc ?? cspSources(csp, 'default-src');
    if (sources && !allowsSelf(sources, origin)) {
      blocked.push(`${page.url} (${scriptSrc ? 'script-src' : 'default-src'})`);
    }
  }
  if (blocked.length > 0) {
    return {
      level: 'warn',
      title,
      detail: `${blocked.join(', ')} leaves out 'self', so the browser may block livelocale/flag.js and the Studio's scripts. Add 'self' to script-src.`,
    };
  }
  return { level: 'ok', title, detail: "scripts from 'self' are allowed" };
}

/**
 * Worker URLs worth reading: the one the app HTML registers, then the usual file names, both
 * under the app base and at the origin root (`/sw.js`, `/service-worker.js`). The two are the
 * same for a root base; a project site can carry either.
 */
function workerCandidates(root: Fetched, base: string): string[] {
  const urls: string[] = [];
  if (isAnswer(root)) {
    const registered = /serviceWorker\s*\.\s*register\s*\(\s*["'`]([^"'`]+)["'`]/.exec(root.body);
    if (registered) {
      try {
        urls.push(new URL(registered[1]!, base).href);
      } catch {}
    }
  }
  const names = ['sw.js', 'service-worker.js'];
  for (const url of [
    ...names.map((name) => new URL(name, base).href),
    ...names.map((name) => new URL(`/${name}`, base).href),
  ]) {
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

async function checkServiceWorker(
  fetchImpl: typeof fetch,
  root: Fetched,
  base: string,
  origin: string
): Promise<Finding> {
  const title = 'Service worker';
  const found: string[] = [];
  for (const url of workerCandidates(root, base)) {
    const worker = await fetchPage(fetchImpl, url, origin);
    if (!isAnswer(worker)) continue;
    if (worker.wall) return { level: 'fail', title, detail: worker.wall };
    // A host's HTML fallback is not a worker.
    if (worker.status !== 200 || /html/i.test(worker.headers.get('content-type') || '')) continue;
    found.push(url);
    if (
      /createHandlerBoundToURL|navigateFallback/.test(worker.body) &&
      !worker.body.includes('livelocale')
    ) {
      return {
        level: 'warn',
        title,
        detail: `${url} answers navigations with the app shell, so livelocale/index.html would open your app. Add to your Workbox config: ${DENYLIST_LINE}`,
      };
    }
  }
  return {
    level: 'ok',
    title,
    detail: found.length > 0 ? `${found.join(', ')} leaves livelocale/ alone` : 'none found',
  };
}

async function checkShare(
  origin: string,
  base: string,
  fetchImpl: typeof fetch,
  manifest: Fetched
): Promise<Finding[]> {
  const shareUrl = (file: string) => `${base}${SHARE_DIR}/${file}`;
  const [root, studio, flag] = await Promise.all([
    fetchPage(fetchImpl, base, origin),
    fetchPage(fetchImpl, shareLinkFor(base), origin),
    fetchPage(fetchImpl, shareUrl(SHARE_FLAG_FILE), origin),
  ]);
  return [
    checkStudioPage(studio, root),
    checkManifest(manifest),
    checkFlagScript(flag, root, base),
    checkShareFrameHeaders([root, studio], origin),
    checkShareCsp([root, studio], origin),
    await checkServiceWorker(fetchImpl, root, base, origin),
    { level: 'ok', title: 'Share link', detail: shareLinkFor(base) },
  ];
}

/** True when the manifest URL answered 200 with JSON, which marks a share build. */
function looksLikeShareBuild(manifest: Fetched): boolean {
  return isAnswer(manifest) && manifest.status === 200 && parseJson(manifest.body).ok;
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
  const workerConfig = checkServiceWorkerConfig(root);
  if (workerConfig) findings.push(workerConfig);

  const appOrigin = options.appOrigin ?? (options.appBase && new URL(options.appBase).origin);
  if (appOrigin) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      findings.push({
        level: 'warn',
        title: 'Mutation API',
        detail: 'Live checks need Node 18+ (global fetch).',
      });
    } else {
      const origin = appOrigin.replace(/\/+$/, '');
      const base = options.appBase ?? `${origin}/`;
      const manifest = await fetchPage(
        fetchImpl,
        `${base}${SHARE_DIR}/${SHARE_MANIFEST_FILE}`,
        origin
      );
      if (options.share || looksLikeShareBuild(manifest)) {
        // A static share build has no mutation API and is framed by a same-origin Studio.
        findings.push(...(await checkShare(origin, base, fetchImpl, manifest)));
      } else {
        const token = options.token ?? process.env['LIVELOCALE_TOKEN'] ?? undefined;
        findings.push(...(await checkLive(origin, fetchImpl, token || undefined)));
      }
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
