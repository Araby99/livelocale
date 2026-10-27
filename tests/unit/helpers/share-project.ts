import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface ShareProjectOptions {
  /** `flat` (default): `locales/<code>.json`; `namespaced`: `locales/<code>/home.json`. */
  layout?: 'flat' | 'namespaced';
  /** Extra files, keyed by project-relative POSIX path, written last (they may overwrite). */
  extra?: Record<string, string>;
}

const created: string[] = [];

/**
 * A temporary project with `en` and `ar` locales, a non-locale `locales/schema.json`
 * and `src/page.tsx`, which calls `t('home.title')`. Returns its absolute path.
 */
export function makeShareProject(options: ShareProjectOptions = {}): string {
  const { layout = 'flat', extra = {} } = options;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-share-'));
  created.push(dir);
  const en = { home: { title: 'Hello {name}' } };
  const ar = { home: { title: 'مرحبا {name}' } };
  const files: Record<string, string> =
    layout === 'flat'
      ? { 'locales/en.json': JSON.stringify(en), 'locales/ar.json': JSON.stringify(ar) }
      : {
          'locales/en/home.json': JSON.stringify(en.home),
          'locales/ar/home.json': JSON.stringify(ar.home),
        };
  Object.assign(files, {
    'locales/schema.json': '{}',
    'src/page.tsx': "export const Page = () => t('home.title');\n",
    ...extra,
  });
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf-8');
  }
  return dir;
}

/** Deletes every project `makeShareProject` created. Call it in `afterEach`. */
export function removeShareProjects(): void {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}
