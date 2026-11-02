import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every file under `dir` whose name matches `ext` (default `.ts`/`.tsx`), recursive, sorted, with forward slashes. */
export function studioFiles(dir: string, ext: RegExp = /\.tsx?$/): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const file = join(dir, name).replace(/\\/g, '/');
      if (statSync(file).isDirectory()) return studioFiles(file, ext);
      return ext.test(file) ? [file] : [];
    })
    .sort();
}
