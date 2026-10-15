import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { injectStudioConfig, createStudioServer } from '../../src/codemod/studio-server.js';

const INDEX_HTML = `<!DOCTYPE html><html><head><title>Studio</title></head><body><div id="root"></div></body></html>`;

function request(
  port: number,
  rawPath: string
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('injectStudioConfig', () => {
  it('should inject a window.__I18N_LENS_CONFIG__ script before </head>', () => {
    const out = injectStudioConfig(INDEX_HTML, { appOrigin: 'http://localhost:3001' });
    expect(out).toContain('window.__I18N_LENS_CONFIG__');
    expect(out).toContain('"appOrigin":"http://localhost:3001"');
    expect(out.indexOf('__I18N_LENS_CONFIG__')).toBeLessThan(out.indexOf('</head>'));
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
    studioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-lens-studio-'));
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
    expect(res.body).toContain('__I18N_LENS_CONFIG__');
  });

  it('should refuse paths that escape the studio directory', async () => {
    const res = await request(port, '/..%2F..%2Fpackage.json');
    expect(res.status).toBe(403);
  });
});
