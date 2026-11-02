// Copies the icons and the og-image from brand/ into site/public/, so the site serves the same
// files the brand build produced (the copies are gitignored; brand/ is the source of truth).
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BRAND_DIR = new URL('../../brand/', import.meta.url);
const PUBLIC_DIR = new URL('../public/', import.meta.url);

export const BRAND_FILES = [
  'favicon.svg',
  'favicon-16.png',
  'favicon-32.png',
  'apple-touch-icon.png',
  'og-image.png',
];

/** Copies every file in BRAND_FILES from brand/ to site/public/. */
export async function syncBrand() {
  await mkdir(PUBLIC_DIR, { recursive: true });
  for (const name of BRAND_FILES) {
    await copyFile(new URL(name, BRAND_DIR), new URL(name, PUBLIC_DIR));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await syncBrand();
  console.log(`copied ${BRAND_FILES.length} brand files into site/public/`);
}
