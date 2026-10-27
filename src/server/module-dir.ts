import * as path from 'path';
import { fileURLToPath } from 'url';

/** The folder of the running module: `__dirname` in CommonJS, else derived from `import.meta.url`. */
export function moduleDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  return path.dirname(fileURLToPath((import.meta as any).url));
}
