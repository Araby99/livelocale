// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ASTRO_GUIDE_URL, astroInitSteps, isAstroProject } from '../../src/codemod/init-astro.js';

describe('livelocale init on Astro', () => {
  const dirs: string[] = [];
  const dir = (files: Record<string, string>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-init-astro-'));
    dirs.push(root);
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
  };

  afterEach(() => {
    for (const root of dirs.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('tells an Astro project, which has src/pages too, from a Next.js Pages Router one', () => {
    expect(isAstroProject(dir({ 'astro.config.mjs': '', 'src/pages/index.astro': '' }))).toBe(true);
    expect(
      isAstroProject(
        dir({
          'package.json': JSON.stringify({ dependencies: { next: '^16' } }),
          'src/pages/a.tsx': '',
        })
      )
    ).toBe(false);
  });

  it('prints the integration, frontmatter loading and Studio steps instead of a route file', () => {
    const steps = astroInitSteps();
    expect(steps).toContain("import liveLocale from 'livelocale/astro';");
    expect(steps).toContain("integrations: [liveLocale({ localesPath: './locales' })]");
    expect(steps).toContain("import { createTranslations } from 'livelocale/server';");
    expect(steps).toContain('npx livelocale studio --app http://localhost:4321');
    expect(steps).toContain(ASTRO_GUIDE_URL);
    expect(steps).not.toContain('route');
  });
});
