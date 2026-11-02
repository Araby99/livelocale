// Static server for the built site: serves <root> under <base> (as GitHub Pages serves a project
// site) and 404s everything else, so a root-relative URL fails the tests instead of working by
// accident. Text responses are gzipped when the client accepts it, as Pages does.
// Usage: node tests/site/fixtures/serve.mjs <root> <port> <base>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const GZIP = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

const [rootArg, portArg, baseArg = '/'] = process.argv.slice(2);
if (!rootArg || !portArg) {
  console.error('usage: node serve.mjs <root> <port> <base>');
  process.exit(1);
}
const root = resolve(rootArg);
const base = baseArg.endsWith('/') ? baseArg : `${baseArg}/`;

async function findFile(pathname) {
  const file = resolve(join(root, decodeURIComponent(pathname)));
  if (file !== root && !file.startsWith(root + sep)) return null;
  const info = await stat(file).catch(() => null);
  if (info?.isFile()) return file;
  if (info?.isDirectory()) {
    const index = join(file, 'index.html');
    if ((await stat(index).catch(() => null))?.isFile()) return index;
  }
  return null;
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (`${pathname}/` === base) {
    res.writeHead(301, { Location: base });
    res.end();
    return;
  }
  if (!pathname.startsWith(base)) return notFound(res);
  const file = await findFile(pathname.slice(base.length)).catch(() => null);
  if (!file) return notFound(res);

  const ext = extname(file).toLowerCase();
  let body = await readFile(file);
  const headers = { 'Content-Type': MIME[ext] ?? 'application/octet-stream' };
  if (GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    body = gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(Number(portArg), () => {
  console.log(`serving ${root} at http://localhost:${portArg}${base}`);
});
