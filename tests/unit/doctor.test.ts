// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runDoctor, formatFindings, hasFailures, type Finding } from '../../src/codemod/doctor.js';

function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function healthyAppRouterProject(root: string) {
  write(root, 'package.json', JSON.stringify({ name: 'demo', dependencies: { next: '15.0.0' } }));
  write(
    root,
    'app/layout.tsx',
    `import { I18nLensProvider } from 'next-i18n-lens/react'; export default () => <I18nLensProvider />;`
  );
  write(root, 'app/api/i18n-lens/mutate/route.ts', `export const GET = () => {};`);
  write(root, 'locales/en.json', JSON.stringify({ home: { title: 'Hi' } }));
  write(root, 'locales/ar.json', JSON.stringify({ home: { title: 'مرحبا' } }));
}

const byTitle = (findings: Finding[], fragment: string) =>
  findings.find((f) => f.title.toLowerCase().includes(fragment.toLowerCase()));

describe('runDoctor — static checks', () => {
  let project: string;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-lens-doctor-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('reports a healthy App Router project with no failures', async () => {
    healthyAppRouterProject(project);
    const findings = await runDoctor({ projectDir: project });
    expect(hasFailures(findings)).toBe(false);
    expect(byTitle(findings, 'route handler')?.level).toBe('ok');
    expect(byTitle(findings, 'provider')?.level).toBe('ok');
    expect(byTitle(findings, 'locale')?.level).toBe('ok');
  });

  it('fails when the mutation route handler is missing and points at init', async () => {
    healthyAppRouterProject(project);
    fs.rmSync(path.join(project, 'app', 'api'), { recursive: true });
    const findings = await runDoctor({ projectDir: project });
    const route = byTitle(findings, 'route handler');
    expect(route?.level).toBe('fail');
    expect(route?.detail).toContain('next-i18n-lens init');
  });

  it('accepts a Pages Router route file', async () => {
    healthyAppRouterProject(project);
    fs.rmSync(path.join(project, 'app'), { recursive: true });
    write(project, 'pages/_app.tsx', `<I18nLensProvider />`);
    write(project, 'pages/api/i18n-lens/mutate.js', `export default () => {};`);
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'route handler')?.level).toBe('ok');
    expect(byTitle(findings, 'provider')?.level).toBe('ok');
  });

  it('warns when the provider is not mounted in a layout', async () => {
    healthyAppRouterProject(project);
    write(project, 'app/layout.tsx', `export default ({ children }) => children;`);
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'provider')?.level).toBe('warn');
  });

  it('warns when middleware exists without excluding /api/i18n-lens', async () => {
    healthyAppRouterProject(project);
    write(project, 'middleware.ts', `export const config = { matcher: ['/((?!_next).*)'] };`);
    const findings = await runDoctor({ projectDir: project });
    const mw = byTitle(findings, 'middleware');
    expect(mw?.level).toBe('warn');
    expect(mw?.detail).toContain('api/i18n-lens');
  });

  it('passes middleware that already excludes the route', async () => {
    healthyAppRouterProject(project);
    write(
      project,
      'src/middleware.ts',
      `export const config = { matcher: ['/((?!api/i18n-lens).*)'] };`
    );
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'middleware')?.level).toBe('ok');
  });

  it('warns when next.config sets frame-ancestors or X-Frame-Options', async () => {
    healthyAppRouterProject(project);
    write(
      project,
      'next.config.mjs',
      `export default { headers: async () => [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] };`
    );
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'frame')?.level).toBe('warn');
  });

  it('accepts a next.config whose frame-ancestors names the Studio origin', async () => {
    healthyAppRouterProject(project);
    write(
      project,
      'next.config.mjs',
      `export default { headers: async () => [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self' http://localhost:3010" }] };`
    );
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'frame')?.level).toBe('ok');
  });

  it('fails on invalid locale JSON and names the file', async () => {
    healthyAppRouterProject(project);
    write(project, 'locales/es.json', '{ not json');
    const findings = await runDoctor({ projectDir: project });
    const locales = byTitle(findings, 'locale');
    expect(locales?.level).toBe('fail');
    expect(locales?.detail).toContain('es.json');
  });

  it('fails when the locales directory is missing', async () => {
    healthyAppRouterProject(project);
    fs.rmSync(path.join(project, 'locales'), { recursive: true });
    const findings = await runDoctor({ projectDir: project });
    expect(byTitle(findings, 'locale')?.level).toBe('fail');
  });

  it('respects a custom locales path', async () => {
    healthyAppRouterProject(project);
    fs.renameSync(path.join(project, 'locales'), path.join(project, 'i18n'));
    const findings = await runDoctor({ projectDir: project, localesPath: 'i18n' });
    expect(byTitle(findings, 'locale')?.level).toBe('ok');
  });
});

describe('runDoctor — live checks', () => {
  let project: string;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-lens-doctor-live-'));
    healthyAppRouterProject(project);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  it('reports the API as reachable when it lists locales', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/i18n-lens/mutate')
        ? jsonResponse(200, ['en', 'ar'])
        : new Response('<html></html>', { status: 200 })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    const api = byTitle(findings, 'mutation api');
    expect(api?.level).toBe('ok');
    expect(api?.detail).toContain('2 locale');
  });

  it('surfaces the server-side disabled reason on a 403', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/i18n-lens/mutate')
        ? jsonResponse(403, {
            error: 'Forbidden: i18n Lens is disabled — I18N_LENS kill switch is set.',
          })
        : new Response('', { status: 200 })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    const api = byTitle(findings, 'mutation api');
    expect(api?.level).toBe('fail');
    expect(api?.detail).toContain('I18N_LENS');
  });

  it('sends the token to a preview deployment and reports access problems', async () => {
    const seen: (string | undefined)[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
      const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
      seen.push(auth);
      if (url.includes('/api/i18n-lens/mutate')) {
        if (auth !== 'Bearer s3cret') return jsonResponse(401, { error: 'Unauthorized' });
        if (url.endsWith('?action=info')) {
          return jsonResponse(200, {
            mode: 'preview',
            authRequired: true,
            git: true,
            problems: ['The token cannot write to acme/site.'],
          });
        }
        return jsonResponse(200, ['en']);
      }
      return new Response('', { status: 200 });
    });
    const run = (token?: string) =>
      runDoctor({
        projectDir: project,
        appOrigin: 'https://preview.example.com',
        token,
        fetchImpl: fetchImpl as any,
      });

    const withoutToken = await run();
    expect(byTitle(withoutToken, 'mutation api')?.detail).toMatch(/--token/);

    const findings = await run('s3cret');
    expect(seen).toContain('Bearer s3cret');
    expect(byTitle(findings, 'mutation api')?.level).toBe('ok');
    expect(byTitle(findings, 'server mode')?.detail).toBe(
      'preview, token required, git actions available'
    );
    expect(byTitle(findings, 'repository access')).toMatchObject({
      level: 'fail',
      detail: 'The token cannot write to acme/site.',
    });
  });

  it('recognises a hosting login wall instead of blaming middleware', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('Protected by Vercel Authentication', {
          status: 302,
          headers: {
            location: 'https://vercel.com/sso-api?url=https%3A%2F%2Fdemo.vercel.app',
            'x-frame-options': 'DENY',
          },
        })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'https://demo.vercel.app',
      fetchImpl: fetchImpl as any,
    });
    expect(byTitle(findings, 'mutation api')?.detail).toMatch(/Vercel Deployment Protection/);
    expect(byTitle(findings, 'mutation api')?.detail).not.toMatch(/middleware/);
    expect(byTitle(findings, 'embed')).toMatchObject({ level: 'fail' });
    expect(byTitle(findings, 'embed')?.detail).not.toMatch(/X-Frame-Options/);
  });

  it('fails clearly when the app is not running', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    const api = byTitle(findings, 'mutation api');
    expect(api?.level).toBe('fail');
    expect(api?.detail).toMatch(/not reachable|running/i);
  });

  it('warns when the app page sends frame-blocking headers', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/i18n-lens/mutate')
        ? jsonResponse(200, ['en'])
        : new Response('', { status: 200, headers: { 'x-frame-options': 'DENY' } })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    expect(byTitle(findings, 'embed')?.level).toBe('warn');
  });

  it.each([
    ["frame-ancestors 'self' http://localhost:3010", 'ok'],
    ['frame-ancestors *', 'ok'],
    ["frame-ancestors 'self' http://localhost:30100", 'warn'],
    ["frame-ancestors 'none'", 'warn'],
  ])('judges the live CSP "%s" as %s', async (csp, level) => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('/api/i18n-lens/mutate')
        ? jsonResponse(200, ['en'])
        : new Response('', { status: 200, headers: { 'content-security-policy': csp } })
    );
    const findings = await runDoctor({
      projectDir: project,
      appOrigin: 'http://localhost:3000',
      fetchImpl: fetchImpl as any,
    });
    expect(byTitle(findings, 'embed')?.level).toBe(level);
  });
});

describe('formatFindings', () => {
  it('renders one line per finding with a status glyph and keeps details indented', () => {
    const text = formatFindings([
      { level: 'ok', title: 'Route handler found' },
      { level: 'warn', title: 'Middleware', detail: 'exclude /api/i18n-lens' },
      { level: 'fail', title: 'Locales', detail: 'missing' },
    ]);
    expect(text).toContain('✅ Route handler found');
    expect(text).toContain('⚠️  Middleware');
    expect(text).toContain('❌ Locales');
    expect(text).toContain('   exclude /api/i18n-lens');
  });
});
