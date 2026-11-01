import { promises as fs } from 'fs';
import * as path from 'path';
import { parseGitignore, type GitignoreMatcher } from '../../core/gitignore.js';
import { IGNORE_DIRS, MAX_SOURCE_BYTES } from '../../server/key-scanner.js';

/** Files that can hold JSX. `.ts` is left out: TypeScript forbids JSX there. */
export const COMPONENT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.tsx',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
]);

/** Folders of tests, mocks, fixtures and stories, skipped on top of `IGNORE_DIRS`. */
export const SKIPPED_DIRS: ReadonlySet<string> = new Set([
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'fixtures',
  'e2e',
  'cypress',
  '.storybook',
]);

const SKIPPED_FILE_RE = /\.(?:test|spec|stories|cy|e2e)\.[^./]+$/;

const NO_IGNORES: GitignoreMatcher = { ignores: () => false };

async function loadGitignore(projectDir: string): Promise<GitignoreMatcher> {
  try {
    return parseGitignore(await fs.readFile(path.join(projectDir, '.gitignore'), 'utf-8'));
  } catch {
    return NO_IGNORES;
  }
}

/** Component files to scan for hardcoded text: sorted, project-relative, `/`-separated. */
export async function listComponentFiles(projectDir: string): Promise<string[]> {
  const root = path.resolve(projectDir);
  const gitignore = await loadGitignore(root);
  const files: string[] = [];
  const toRel = (fullPath: string) => path.relative(root, fullPath).split(path.sep).join('/');

  const walk = async (dir: string): Promise<void> => {
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const rel = toRel(fullPath);
      if (item.isDirectory()) {
        if (IGNORE_DIRS.has(item.name) || SKIPPED_DIRS.has(item.name)) continue;
        if (gitignore.ignores(rel, true)) continue;
        await walk(fullPath);
        continue;
      }
      if (!item.isFile()) continue;
      if (!COMPONENT_EXTENSIONS.has(path.extname(item.name))) continue;
      if (item.name.endsWith('.d.ts') || SKIPPED_FILE_RE.test(item.name)) continue;
      if (gitignore.ignores(rel, false)) continue;
      try {
        if ((await fs.stat(fullPath)).size > MAX_SOURCE_BYTES) continue;
      } catch {
        continue;
      }
      files.push(rel);
    }
  };

  await walk(root);
  return files.sort();
}
