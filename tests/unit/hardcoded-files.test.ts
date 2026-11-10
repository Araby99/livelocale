// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  TYPESCRIPT_MISSING,
  loadProjectTypeScript,
  typescriptUnusable,
} from '../../src/codemod/hardcoded/load-typescript.js';
import { listComponentFiles } from '../../src/codemod/hardcoded/files.js';
import { linkFakeTypeScript, linkTypeScript } from './helpers/project-typescript.js';
import { removeTempDir } from './helpers/temp-dir.js';

function write(root: string, rel: string, content: unknown) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
}

describe('hardcoded scan setup', () => {
  let project: string;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-hc-'));
  });

  afterEach(() => {
    removeTempDir(project);
  });

  it('loads typescript from the project directory, or names the setup problem', async () => {
    expect(await loadProjectTypeScript(project)).toEqual({ problem: TYPESCRIPT_MISSING });
    linkTypeScript(project);
    const loaded = await loadProjectTypeScript(project);
    expect('ts' in loaded && typeof loaded.ts.createSourceFile).toBe('function');
  });

  it('tells an installed typescript without the compiler API apart from a missing one', async () => {
    linkFakeTypeScript(project, '7.0.0');
    expect(await loadProjectTypeScript(project)).toEqual({ problem: typescriptUnusable('7.0.0') });
    expect(typescriptUnusable('7.0.0')).toBe(
      'TypeScript 7.0.0 has no JavaScript compiler API, which hardcoded-text detection needs. Install TypeScript 5 or 6 as a dev dependency: npm install -D typescript@5'
    );
  });

  it('lists component files, skipping tests, stories, mocks, fixtures, e2e, declarations, .ts and ignored folders, with .astro pages', async () => {
    for (const rel of [
      'app/page.tsx',
      'app/page.test.tsx',
      'app/page.spec.jsx',
      'components/Button.stories.jsx',
      'src/__tests__/a.jsx',
      'src/__mocks__/b.js',
      'src/legacy.js',
      'src/util.ts',
      'types/x.d.ts',
      'node_modules/pkg/a.jsx',
      'dist/c.js',
      'generated/b.tsx',
      'src/esm.mjs',
      '.storybook/preview.tsx',
      'e2e/home.jsx',
      'cypress/support/c.jsx',
      'src/__fixtures__/f.tsx',
      'test/fixtures/page.tsx',
      'app/page.cy.tsx',
      'app/page.e2e.jsx',
      'src/pages/index.astro',
      '.astro/content.mjs',
    ])
      write(project, rel, 'export {};');
    write(project, '.gitignore', 'generated/\n');
    expect(await listComponentFiles(project)).toEqual([
      'app/page.tsx',
      'src/esm.mjs',
      'src/legacy.js',
      'src/pages/index.astro',
    ]);
  });
});
