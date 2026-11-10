// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runMigrate } from '../../src/codemod/migrate.js';
import {
  loadProjectTypeScript,
  typescriptUnusable,
} from '../../src/codemod/hardcoded/load-typescript.js';
import { linkFakeTypeScript, linkTypeScript } from './helpers/project-typescript.js';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-migrate-ts-'));
  dirs.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text, 'utf-8');
  }
  return dir;
}

const SOURCE = `import { useTranslation } from 'react-i18next';
export function A() {
  const { t } = useTranslation();
  return t('a');
}
`;

describe('TypeScript 7, which has no compiler API in JavaScript', () => {
  it('names the version, what needs it and the fix', () => {
    expect(typescriptUnusable('7.0.2')).toBe(
      'TypeScript 7.0.2 has no JavaScript compiler API, which hardcoded-text detection needs. Install TypeScript 5 or 6 as a dev dependency: npm install -D typescript@5'
    );
    expect(typescriptUnusable('7.0.2', 'migrate')).toBe(
      'TypeScript 7.0.2 has no JavaScript compiler API, which migrate needs. Install TypeScript 5 or 6 as a dev dependency: npm install -D typescript@5'
    );
  });

  it('stops migrate with one message and exit 2, before touching a file', async () => {
    const dir = project({ 'src/a.tsx': SOURCE });
    linkFakeTypeScript(dir, '7.0.2');
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.join(' ')));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await runMigrate({ dir, excludes: ['node_modules'], dryRun: false })).toBe(2);
    expect(errors).toEqual([`❌ ${typescriptUnusable('7.0.2', 'migrate')}`]);
    expect(fs.readFileSync(path.join(dir, 'src/a.tsx'), 'utf-8')).toBe(SOURCE);
  });

  it('migrates with the TypeScript the project has', async () => {
    const dir = project({ 'src/a.tsx': SOURCE });
    linkTypeScript(dir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runMigrate({ dir, excludes: ['node_modules'], dryRun: false })).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'src/a.tsx'), 'utf-8')).toContain(
      'wrapTranslationEngine'
    );
  });

  it('still loads a TypeScript with the compiler API for check', async () => {
    const dir = project({});
    linkTypeScript(dir);
    const loaded = await loadProjectTypeScript(dir);
    expect('ts' in loaded).toBe(true);
  });
});
