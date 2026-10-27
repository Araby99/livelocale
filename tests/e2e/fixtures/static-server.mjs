// A zero-dependency static file server for the share-link E2E, standing in for any static host.
// Usage: node tests/e2e/fixtures/static-server.mjs <root> <port>
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

const [rootArg, portArg] = process.argv.slice(2);
if (!rootArg || !portArg) {
  console.error('Usage: node tests/e2e/fixtures/static-server.mjs <root> <port>');
  process.exit(1);
}
const root = path.resolve(rootArg);
const port = Number(portArg);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

/** Maps a request path to a file under root, or null for an escape or a miss. */
function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = path.resolve(root, `.${decoded}`);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  if (isDirectory(file)) {
    const index = path.join(file, 'index.html');
    return isFile(index) ? index : null;
  }
  if (isFile(file)) return file;
  // SPA fallback: unknown paths without an extension get the app shell.
  if (path.extname(decoded) === '') {
    const shell = path.join(root, 'index.html');
    return isFile(shell) ? shell : null;
  }
  return null;
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' }).end('Method Not Allowed');
    return;
  }
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  // resolveFile refuses any path that decodes to a location outside root (e.g. `..%2f`).
  const file = resolveFile(pathname);
  if (file === null) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not Found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
