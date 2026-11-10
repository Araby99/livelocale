// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { planInitRoute, VITE_GUIDE_URL } from '../../src/codemod/init-route.js';

function write(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

describe('planInitRoute', () => {
  let project: string;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-init-'));
  });
  afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

  it('writes nothing in a Vite app and prints the plugin and provider steps', () => {
    write(project, 'package.json', JSON.stringify({ devDependencies: { vite: '7.0.0' } }));
    write(project, 'vite.config.ts', 'export default {};');
    fs.mkdirSync(path.join(project, 'src/pages'), { recursive: true });
    const plan = planInitRoute(project);
    expect(plan.kind).toBe('vite');
    if (plan.kind !== 'vite') return;
    expect(plan.text).toContain('Vite project detected. Nothing to write');
    expect(plan.text).toContain("import { liveLocaleVite } from 'livelocale/vite';");
    expect(plan.text).toContain("liveLocaleVite({ localesPath: './locales' })");
    expect(plan.text).toContain("import { LiveLocaleProvider } from 'livelocale/react';");
    expect(plan.text).toContain("import { startLiveLocale } from 'livelocale/client';");
    expect(plan.text).toContain(VITE_GUIDE_URL);
  });

  it('puts a detected locales folder into the Vite steps', () => {
    write(project, 'package.json', JSON.stringify({ devDependencies: { vite: '7.0.0' } }));
    write(project, 'src/locales/en.json', '{}');
    const plan = planInitRoute(project);
    expect(plan.kind === 'vite' && plan.text).toContain(
      "liveLocaleVite({ localesPath: './src/locales' })"
    );
  });

  it('writes nothing in a folder with no recognised stack and says what it looked for', () => {
    const plan = planInitRoute(project);
    expect(plan).toEqual({
      kind: 'unknown',
      text: `No Next.js, Vite or Astro app found in ${project}. init looked for next, vite or astro in package.json and for a next.config, vite.config or astro.config file. Run it in your app's folder, or pass the folder: npx livelocale init <folder>.`,
    });
  });

  it('plans an App Router route in a Next.js app', () => {
    write(project, 'package.json', JSON.stringify({ dependencies: { next: '15.0.0' } }));
    write(project, 'tsconfig.json', '{}');
    fs.mkdirSync(path.join(project, 'src/app'), { recursive: true });
    const plan = planInitRoute(project);
    expect(plan).toMatchObject({
      kind: 'next',
      routerType: 'Next.js App Router (src/)',
      targetPath: path.join(project, 'src/app/api/livelocale/route.ts'),
      existing: 'none',
    });
  });

  it('points the route at messages/ in a next-intl app', () => {
    write(project, 'package.json', JSON.stringify({ dependencies: { next: '15.0.0' } }));
    write(project, 'messages/en.json', '{}');
    fs.mkdirSync(path.join(project, 'app'), { recursive: true });
    const plan = planInitRoute(project);
    expect(plan.kind === 'next' && plan.content).toContain(
      "localesPath: path.resolve('./messages')"
    );
  });

  it('notices a route file that is already there', () => {
    write(project, 'package.json', JSON.stringify({ dependencies: { next: '15.0.0' } }));
    fs.mkdirSync(path.join(project, 'app'), { recursive: true });
    const first = planInitRoute(project);
    if (first.kind !== 'next') throw new Error('expected a Next.js plan');
    write(project, 'app/api/livelocale/route.js', first.content);
    expect(planInitRoute(project)).toMatchObject({ existing: 'same' });
    write(project, 'app/api/livelocale/route.js', first.content + '// my custom edits\n');
    expect(planInitRoute(project)).toMatchObject({ existing: 'different' });
  });

  it('calls a route file that git checked out with CRLF line endings up to date', () => {
    write(project, 'package.json', JSON.stringify({ dependencies: { next: '15.0.0' } }));
    fs.mkdirSync(path.join(project, 'app'), { recursive: true });
    const first = planInitRoute(project);
    if (first.kind !== 'next') throw new Error('expected a Next.js plan');
    write(project, 'app/api/livelocale/route.js', first.content.replace(/\n/g, '\r\n'));
    expect(planInitRoute(project)).toMatchObject({ existing: 'same' });
  });

  it('leaves an Astro project to the integration', () => {
    write(project, 'package.json', JSON.stringify({ dependencies: { astro: '5.0.0' } }));
    expect(planInitRoute(project).kind).toBe('astro');
  });
});
