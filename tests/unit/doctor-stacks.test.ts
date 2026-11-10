// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { devServerPort, hasFailures, runDoctor, type Finding } from '../../src/codemod/doctor.js';

function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

const byTitle = (findings: Finding[], fragment: string) =>
  findings.find((f) => f.title.toLowerCase().includes(fragment.toLowerCase()));

const VITE_CONFIG = `import { defineConfig } from 'vite';
import { liveLocaleVite } from 'livelocale/vite';
export default defineConfig({ plugins: [liveLocaleVite({ localesPath: './locales' })] });`;

describe('runDoctor — stacks', () => {
  let project: string;
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-doctor-stack-'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(project, { recursive: true, force: true });
  });

  describe('on a Vite project', () => {
    const viteProject = () => {
      write(project, 'package.json', JSON.stringify({ devDependencies: { vite: '7.0.0' } }));
      write(project, 'vite.config.ts', VITE_CONFIG);
      write(
        project,
        'src/main.tsx',
        `import { LiveLocaleProvider } from 'livelocale/react';\ncreateRoot(el).render(<><LiveLocaleProvider /><App /></>);`
      );
      write(project, 'locales/en.json', JSON.stringify({ a: 'A' }));
    };

    it('passes a healthy setup without asking for Next.js files', async () => {
      viteProject();
      const findings = await runDoctor({ projectDir: project });
      expect(hasFailures(findings)).toBe(false);
      expect(findings.map((f) => f.title)).toEqual([
        'Vite plugin',
        'LiveLocaleProvider mounted',
        'Locale files',
      ]);
      expect(byTitle(findings, 'vite plugin')).toEqual({
        level: 'ok',
        title: 'Vite plugin',
        detail: 'vite.config.ts uses liveLocaleVite from livelocale/vite',
      });
      expect(byTitle(findings, 'provider')).toMatchObject({ level: 'ok', detail: 'src/main.tsx' });
    });

    it('accepts startLiveLocale in place of the provider', async () => {
      viteProject();
      write(
        project,
        'src/main.tsx',
        `import { startLiveLocale } from 'livelocale/client';\nstartLiveLocale();`
      );
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'provider')).toMatchObject({ level: 'ok', detail: 'src/main.tsx' });
    });

    it('fails without the plugin and says how to add it', async () => {
      viteProject();
      write(project, 'vite.config.ts', `export default { plugins: [react()] };`);
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'vite plugin')).toEqual({
        level: 'fail',
        title: 'Vite plugin',
        detail:
          "vite.config.ts does not use livelocale/vite. Add liveLocaleVite({ localesPath: './locales' }) from 'livelocale/vite' to plugins.",
      });
    });

    it('warns when nothing starts LiveLocale in the app', async () => {
      viteProject();
      write(project, 'src/main.tsx', `createRoot(el).render(<App />);`);
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'provider')).toEqual({
        level: 'warn',
        title: 'LiveLocaleProvider mounted',
        detail:
          "Add <LiveLocaleProvider /> from 'livelocale/react' to src/main.tsx (or call startLiveLocale() from 'livelocale/client') so the Studio can talk to the page.",
      });
    });
  });

  describe('on a next-intl App Router project', () => {
    const nextIntlProject = () => {
      write(project, 'package.json', JSON.stringify({ dependencies: { next: '15.0.0' } }));
      write(project, 'src/app/api/livelocale/route.ts', 'export const GET = () => {};');
      write(
        project,
        'src/app/[locale]/layout.tsx',
        `import { LiveLocaleProvider } from 'livelocale/react';\nexport default () => <LiveLocaleProvider />;`
      );
      write(project, 'messages/en.json', JSON.stringify({ a: 'A' }));
    };

    it('finds the provider in app/[locale]/layout', async () => {
      nextIntlProject();
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'provider')).toMatchObject({
        level: 'ok',
        detail: 'src/app/[locale]/layout.tsx',
      });
    });

    it('accepts the standard next-intl matcher, which leaves out all of /api', async () => {
      nextIntlProject();
      write(
        project,
        'src/middleware.ts',
        `export const config = { matcher: '/((?!api|trpc|_next|_vercel|.*\\\\..*).*)' };`
      );
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'middleware')).toMatchObject({ level: 'ok' });
    });

    it('asks to extend a matcher instead of printing one that replaces it', async () => {
      nextIntlProject();
      write(
        project,
        'src/middleware.ts',
        `export const config = { matcher: '/((?!_next|_vercel|.*\\\\..*).*)' };`
      );
      const mw = byTitle(await runDoctor({ projectDir: project }), 'middleware');
      expect(mw).toEqual({
        level: 'warn',
        title: 'Middleware matcher',
        detail:
          'src/middleware.ts does not leave out /api/livelocale. If it enforces auth or redirects, add api/livelocale to the paths its matcher already leaves out, for example (?!api/livelocale|_next|...).',
      });
    });

    it('finds messages/ without --locales and says so', async () => {
      nextIntlProject();
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'locale files')).toEqual({
        level: 'ok',
        title: 'Locale files',
        detail:
          'messages (found it; pass --locales to pick another): 1 flat locale file(s), 1 file(s) parse',
      });
    });
  });

  describe('locale files', () => {
    beforeEach(() => {
      write(project, 'package.json', JSON.stringify({ dependencies: { next: '15.0.0' } }));
    });

    it('shows a nested locales folder with forward slashes, as check does', async () => {
      write(project, 'src/locales/en.json', '{"a":"A"}');
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'locale files')?.detail).toBe(
        'src/locales (found it; pass --locales to pick another): 1 flat locale file(s), 1 file(s) parse'
      );
    });

    it('reads a file that starts with a byte-order mark', async () => {
      write(project, 'locales/en.json', '\uFEFF{"a":"A"}');
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'locale files')?.level).toBe('ok');
    });

    it('warns about locale-looking files skipped for their name', async () => {
      write(project, 'locales/en.json', '{"a":"A"}');
      write(project, 'locales/english.json', '{"a":"A"}');
      write(project, 'locales/backup/en.json', '{"a":"A"}');
      const findings = await runDoctor({ projectDir: project });
      expect(byTitle(findings, 'locale names')).toEqual({
        level: 'warn',
        title: 'Locale names',
        detail:
          'Not read: backup/, english.json. A locale name looks like en, pt-BR or zh-Hant-TW.',
      });
    });
  });
});

describe('devServerPort', () => {
  let project: string;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-doctor-port-'));
  });
  afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

  it.each([
    [{ devDependencies: { vite: '7.0.0' } }, 5173],
    [{ dependencies: { astro: '5.0.0' } }, 4321],
    [{ dependencies: { next: '15.0.0' } }, 3000],
  ])('suggests the default dev port for %j', (pkg, port) => {
    write(project, 'package.json', JSON.stringify(pkg));
    expect(devServerPort(project)).toBe(port);
  });
});
