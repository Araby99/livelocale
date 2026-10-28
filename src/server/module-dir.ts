import { readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** The folder of the running module: `__dirname` in CommonJS, else derived from `import.meta.url`. */
export function moduleDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return path.dirname(fileURLToPath((import.meta as any).url));
}

/** The version in livelocale's own package.json, two folders above the running module. */
export function readOwnVersion(): string {
  const file = path.resolve(moduleDir(), '../../package.json');
  const pkg: unknown = JSON.parse(readFileSync(file, 'utf-8'));
  const version = (pkg as { version?: unknown } | null)?.version;
  if (typeof version !== 'string' || version === '') {
    throw new Error(`No version in ${file}.`);
  }
  return version;
}
