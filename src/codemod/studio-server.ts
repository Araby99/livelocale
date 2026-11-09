import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { APP_STATUS_PATH, probeAppFromServer } from '../core/app-probe.js';

export interface StudioConfig {
  /** Origin of the application being edited, e.g. `http://localhost:3001`. */
  appOrigin: string;
}

export interface StudioServerOptions extends StudioConfig {
  /** Directory containing the built Studio assets (index.html + assets/). */
  studioDir: string;
  /** Fetch used to probe the app for the Studio's connection help; injectable for tests. */
  fetchImpl?: typeof fetch;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Any localhost origin (any port) is trusted — remote websites are not (RULE SEC-009). */
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Injects `window.__LIVELOCALE_CONFIG__` into the Studio's index.html so the
 * app origin can be chosen at run time instead of at build time.
 *
 * RULE SEC-008: "<" and the U+2028/U+2029 line terminators are escaped so no
 * config value can terminate the script tag.
 */
export function injectStudioConfig(html: string, config: StudioConfig): string {
  const safeJson = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
  const script = `<script>window.__LIVELOCALE_CONFIG__ = ${safeJson};</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}\n</head>`);
  }
  return `${script}\n${html}`;
}

/** Host names the app-status endpoint answers under (blocks DNS-rebinding pages). */
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * `GET /__livelocale/app-status?path=/x`: what the configured app answers at `/x` and at its
 * LiveLocale API, so the Studio can say why its frame never connected (a browser cannot read a
 * cross-origin frame's status). RULE SEC-013: the app origin is fixed at start-up and the path
 * must stay on it (`appProbeUrl`), requests are GET without credentials or bodies, each has a
 * timeout, and only same-origin callers on a local host name are answered.
 */
function sendAppStatus(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  appOrigin: string,
  fetchImpl: typeof fetch | undefined
): void {
  const host = req.headers.host || '';
  const site = req.headers['sec-fetch-site'];
  const origin = req.headers.origin;
  const sameOrigin = (!site || site === 'same-origin') && (!origin || origin === `http://${host}`);
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return json(405, { error: 'Method Not Allowed' });
  if (!LOCAL_HOST_RE.test(host) || !sameOrigin) return json(403, { error: 'Forbidden' });
  if (typeof fetchImpl !== 'function') return json(501, { error: 'fetch is unavailable' });

  const query = new URLSearchParams((req.url || '').split('?')[1] || '');
  probeAppFromServer(appOrigin, query.get('path'), {
    fetch: fetchImpl,
    studioOrigin: `http://${host}`,
  }).then(
    (probe) => (probe ? json(200, probe) : json(400, { error: 'Bad path' })),
    () => json(500, { error: 'Probe failed' })
  );
}

/**
 * Creates (but does not start) the static HTTP server that hosts the Studio.
 */
export function createStudioServer(options: StudioServerOptions): http.Server {
  const studioDir = path.resolve(options.studioDir);
  const indexPath = path.join(studioDir, 'index.html');
  const config: StudioConfig = { appOrigin: options.appOrigin };

  const sendIndex = (res: http.ServerResponse) => {
    fs.readFile(indexPath, 'utf-8', (err, html) => {
      if (err) {
        res.statusCode = 500;
        res.end(`Server Error: ${err.code}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html']!, 'Cache-Control': 'no-store' });
      res.end(injectStudioConfig(html, config));
    });
  };

  return http.createServer((req, res) => {
    if ((req.url || '').split('?')[0] === APP_STATUS_PATH) {
      sendAppStatus(req, res, config.appOrigin, options.fetchImpl ?? globalThis.fetch);
      return;
    }

    const origin = req.headers.origin || '';
    if (LOCALHOST_ORIGIN_RE.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    // RULE SEC-010: PATH CONTAINMENT — resolve the requested path and verify
    // it stays inside the studio directory (blocks /../../etc/passwd escapes).
    const urlPath = req.url?.split('?')[0] || '/';
    let filePath: string;
    try {
      filePath = path.resolve(studioDir, `.${decodeURIComponent(urlPath)}`);
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    // A path inside studioDir is relative to it without climbing out (`..`) or
    // switching drives (an absolute result on Windows). The prefix test also
    // refuses a top-level file whose name starts with `..` (such as `..x.js`);
    // the Studio build never emits one, and this form is the containment guard
    // CodeQL recognises.
    const relativePath = path.relative(studioDir, filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    // Root, directories, and unknown paths all serve the SPA shell.
    if (
      urlPath === '/' ||
      filePath === studioDir ||
      filePath === indexPath ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      sendIndex(res);
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.statusCode = 500;
        res.end(`Server Error: ${err.code}`);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
}
