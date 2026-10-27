import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { FLAG_SCRIPT } from '../../src/core/flag-script.js';

let root: string;
let server: http.Server;
let port: number;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

test.beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-share-flag-'));
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname;
    const file = path.join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname);
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'text/plain' });
    res.end(fs.readFileSync(file));
  });
  // No host: listens on every interface, so both localhost and 127.0.0.1 answer.
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;

  const write = (rel: string, body: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  write(
    'index.html',
    '<!doctype html><html><head><script src="/livelocale/flag.js"></script><title>App</title></head>' +
      '<body><script>document.documentElement.dataset.flag = String(window.__LIVELOCALE_FLAG__)</script></body></html>'
  );
  write('livelocale/flag.js', FLAG_SCRIPT);
  write('livelocale/index.html', '<!doctype html><iframe src="../index.html"></iframe>');
  write('other/index.html', '<!doctype html><iframe src="../index.html"></iframe>');
  write(
    'livelocale/cross.html',
    `<!doctype html><iframe src="http://127.0.0.1:${port}/index.html"></iframe>`
  );
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
});

const site = (rel: string) => `http://localhost:${port}${rel}`;

async function framedFlag(page: Page, rel: string): Promise<string | null> {
  await page.goto(site(rel));
  const app = page.frameLocator('iframe');
  await expect(app.locator('html')).toHaveAttribute('data-flag', /.+/);
  return app.locator('html').getAttribute('data-flag');
}

test('a direct visit stays off', async ({ page }) => {
  await page.goto(site('/index.html'));
  await expect(page.locator('html')).toHaveAttribute('data-flag', 'undefined');
});

test('the Studio frame turns preview on', async ({ page }) => {
  expect(await framedFlag(page, '/livelocale/index.html')).toBe('preview');
});

test('a same-origin frame outside the Studio folder stays off', async ({ page }) => {
  expect(await framedFlag(page, '/other/index.html')).toBe('undefined');
});

test('a cross-origin frame stays off', async ({ page }) => {
  expect(await framedFlag(page, '/livelocale/cross.html')).toBe('undefined');
});
