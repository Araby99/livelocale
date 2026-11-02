// Rasterises the brand PNGs into brand/ with the repo's Playwright Chromium
// (run: npm run brand:build from the repo root, after build-svgs.mjs).
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { markSvg, smallMarkSvg } from './marks.mjs';

const BRAND_DIR = fileURLToPath(new URL('../../../brand/', import.meta.url));
const TEMPLATES = new URL('../../../brand/src/', import.meta.url);
const PAPER = '#FFF8F0';

export const PNG_TARGETS = [
  { file: 'favicon-16.png', width: 16, height: 16 },
  { file: 'favicon-32.png', width: 32, height: 32 },
  { file: 'apple-touch-icon.png', width: 180, height: 180 },
  { file: 'avatar-512.png', width: 512, height: 512 },
  { file: 'og-image.png', width: 1200, height: 630 },
];

/** A page showing one SVG at `size` px, centred on `background` (transparent when omitted). */
function svgPage(svg, size, background) {
  const fill = background ? `background:${background};` : '';
  return `<!doctype html><html><body style="margin:0;${fill}display:grid;place-items:center;width:100vw;height:100vh">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
}

/** How each target is produced: inline HTML or a template URL, and whether it keeps transparency. */
function sources(studioShot) {
  const og = new URL('og.html', TEMPLATES);
  if (studioShot) og.search = `?shot=${encodeURIComponent(pathToFileURL(studioShot).href)}`;
  return {
    'favicon-16.png': { html: svgPage(smallMarkSvg(), 16), transparent: true },
    'favicon-32.png': { html: svgPage(markSvg('light'), 32), transparent: true },
    'apple-touch-icon.png': { html: svgPage(markSvg('light'), 140, PAPER), transparent: false },
    'avatar-512.png': { url: new URL('avatar.html', TEMPLATES).href, transparent: false },
    'og-image.png': { url: og.href, transparent: false },
  };
}

/** Renders every PNG_TARGETS file into `outDir`; `studioShot` puts a Studio screenshot in the og-image. */
export async function renderPngs(outDir, opts = {}) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    await mkdir(outDir, { recursive: true });
    const plan = sources(opts.studioShot);
    for (const { file, width, height } of PNG_TARGETS) {
      const source = plan[file];
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      if (source.url) await page.goto(source.url);
      else await page.setContent(source.html);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
      });
      await page.screenshot({ path: join(outDir, file), omitBackground: source.transparent });
      await page.close();
      console.log(`wrote ${file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await renderPngs(BRAND_DIR);
}
