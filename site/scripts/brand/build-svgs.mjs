// Generates the brand SVGs into brand/ (run: npm run brand:build from the repo root).
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { faviconSvg, logoSvg, markSvg } from './marks.mjs';
import { wordmarkPath } from './wordmark.mjs';

const BRAND_DIR = fileURLToPath(new URL('../../../brand/', import.meta.url));

/** Every brand SVG keyed by file name, each ending with a newline. */
export async function brandSvgs() {
  const wordmark = await wordmarkPath();
  const svgs = {
    'logo.svg': logoSvg('light', wordmark),
    'logo-dark.svg': logoSvg('dark', wordmark),
    'mark.svg': markSvg('light'),
    'mark-dark.svg': markSvg('dark'),
    'favicon.svg': faviconSvg(),
  };
  return Object.fromEntries(Object.entries(svgs).map(([name, svg]) => [name, `${svg}\n`]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await mkdir(BRAND_DIR, { recursive: true });
  for (const [name, content] of Object.entries(await brandSvgs())) {
    await writeFile(BRAND_DIR + name, content);
    console.log(`wrote brand/${name}`);
  }
}
