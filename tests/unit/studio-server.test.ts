import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { injectStudioConfig, createStudioServer } from '../../src/codemod/studio-server.js';

const INDEX_HTML = `<!DOCTYPE html><html><head><title>Studio</title></head><body><div id="root"></div></body></html>`;

function request(
  port: number,
  rawPath: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: rawPath, method: 'GET', headers },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

const listen = async (server: http.Server): Promise<number> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as any).port;
};

const close = (server: http.Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

describe('injectStudioConfig', () => {
  it('should inject a window.__LIVELOCALE_CONFIG__ script before </head>', () => {
    const out = injectStudioConfig(INDEX_HTML, { appOrigin: 'http://localhost:3001' });
    expect(out).toContain('window.__LIVELOCALE_CONFIG__');
    expect(out).toContain('"appOrigin":"http://localhost:3001"');
    expect(out.indexOf('__LIVELOCALE_CONFIG__')).toBeLessThan(out.indexOf('</head>'));
  });

  it('injects the page to open first when --app has a path', () => {
    const out = injectStudioConfig(INDEX_HTML, {
      appOrigin: 'http://localhost:4321',
      appUrl: 'http://localhost:4321/ar/',
    });
    expect(out).toContain('"appUrl":"http://localhost:4321/ar/"');
  });

  it('should escape "<" so config values cannot break out of the script tag', () => {
    const out = injectStudioConfig(INDEX_HTML, { appOrigin: '</script><script>alert(1)' });
    expect(out).not.toContain('</script><script>alert(1)');
    expect(out).toContain('\\u003c/script>');
  });
});

describe('createStudioServer', () => {
  let studioDir: string;
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    studioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-studio-'));
    fs.writeFileSync(path.join(studioDir, 'index.html'), INDEX_HTML, 'utf-8');
    fs.mkdirSync(path.join(studioDir, 'assets'));
    fs.writeFileSync(path.join(studioDir, 'assets', 'app.js'), 'console.log(1)', 'utf-8');

    server = createStudioServer({ studioDir, appOrigin: 'http://localhost:3001' });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as any).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(studioDir, { recursive: true, force: true });
  });

  it('should serve index.html with the app origin injected', async () => {
    const res = await request(port, '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('"appOrigin":"http://localhost:3001"');
  });

  it('should serve static assets with the right content type', async () => {
    const res = await request(port, '/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.body).toBe('console.log(1)');
  });

  it('should fall back to index.html for unknown SPA routes', async () => {
    const res = await request(port, '/some/client/route');
    expect(res.status).toBe(200);
    expect(res.body).toContain('__LIVELOCALE_CONFIG__');
  });

  it('should refuse paths that escape the studio directory', async () => {
    const res = await request(port, '/..%2F..%2Fpackage.json');
    expect(res.status).toBe(403);
  });

  it('should refuse a sibling directory that shares the studio directory as a prefix', async () => {
    const sibling = `${studioDir}-evil`;
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'secret.txt'), 'secret', 'utf-8');
    try {
      const res = await request(
        port,
        `/..%2F${encodeURIComponent(path.basename(sibling))}%2Fsecret.txt`
      );
      expect(res.status).toBe(403);
      expect(res.body).not.toContain('secret');
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('should refuse traversal written with encoded backslashes', async () => {
    const res = await request(port, '/..%5C..%5Cpackage.json');
    expect(res.body).not.toContain('"name"');
    if (path.sep === '\\') expect(res.status).toBe(403);
  });
});

describe('createStudioServer app-status endpoint', () => {
  let studioDir: string;
  let app: http.Server;
  let appOrigin: string;
  let studio: http.Server;
  let port: number;
  const appRequests: string[] = [];

  beforeAll(async () => {
    studioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-studio-'));
    fs.writeFileSync(path.join(studioDir, 'index.html'), INDEX_HTML, 'utf-8');
    // A broken app: its pages fail and its LiveLocale route is missing.
    app = http.createServer((req, res) => {
      appRequests.push(`${req.method} ${req.url}`);
      if (req.url?.startsWith('/api/livelocale')) {
        res.statusCode = 404;
        res.end('Not Found');
      } else if (req.url === '/') {
        res.writeHead(307, { Location: '/en' });
        res.end();
      } else {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
    appOrigin = `http://127.0.0.1:${await listen(app)}`;
    studio = createStudioServer({ studioDir, appOrigin });
    port = await listen(studio);
  });

  afterAll(async () => {
    await close(studio);
    await close(app);
    fs.rmSync(studioDir, { recursive: true, force: true });
  });

  it("reports the app's status at the framed page and at its API", async () => {
    const res = await request(port, '/__livelocale/app-status?path=%2F');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(JSON.parse(res.body)).toEqual({
      origin: appOrigin,
      path: '/',
      page: { kind: 'status', status: 500 },
      api: { kind: 'status', status: 404 },
    });
    expect(appRequests).toEqual(
      expect.arrayContaining(['GET /', 'GET /en', 'GET /api/livelocale?action=info'])
    );
  });

  it('never probes anything but a path on the configured app origin', async () => {
    appRequests.length = 0;
    for (const bad of ['//example.com/', 'http://example.com/', 'x']) {
      const res = await request(port, `/__livelocale/app-status?path=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
    }
    expect(appRequests).toEqual([]);
  });

  it('answers only same-origin callers on a local host name', async () => {
    appRequests.length = 0;
    const statusFor = async (headers: Record<string, string>) =>
      (await request(port, '/__livelocale/app-status', headers)).status;
    expect(await statusFor({ Host: 'evil.example' })).toBe(403);
    expect(await statusFor({ Origin: 'http://localhost:3000' })).toBe(403);
    expect(await statusFor({ 'Sec-Fetch-Site': 'cross-site' })).toBe(403);
    expect(await statusFor({ 'Sec-Fetch-Site': 'same-origin' })).toBe(200);
    // Only the allowed call reached the app: `/`, its redirect to `/en`, and the API.
    expect(appRequests).toHaveLength(3);
  });

  it('reports a stopped app as unreachable', async () => {
    const stopped = http.createServer();
    const deadOrigin = `http://127.0.0.1:${await listen(stopped)}`;
    await close(stopped);
    const server = createStudioServer({ studioDir, appOrigin: deadOrigin });
    const serverPort = await listen(server);
    try {
      const res = await request(serverPort, '/__livelocale/app-status');
      expect(JSON.parse(res.body)).toMatchObject({
        page: { kind: 'unreachable' },
        api: { kind: 'unreachable' },
      });
    } finally {
      await close(server);
    }
  });
});
