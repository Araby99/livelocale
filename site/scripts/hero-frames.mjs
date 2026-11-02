// Cuts the landing page's stills out of the hero recording and writes each one's provenance
// sidecar (<name>.json). The posters come from the two shipping cuts (hero-cuts.mjs), so each
// matches its video pixel for pixel; the story frames come from the master take (hero.mp4, made by
// record-hero.mjs from the Tidewell stage site). Nothing here is drawn or generated; every pixel is
// from the take. Run after hero-cuts.mjs: node site/scripts/hero-frames.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FFMPEG = require('ffmpeg-static');
const HERO = fileURLToPath(new URL('../media/hero/', import.meta.url));

const TAKE =
  "the real hero recording site/media/hero/hero.mp4, made by site/scripts/record-hero.mjs: headless Chromium filming the real livelocale share Studio on the fictional Tidewell stage site (site/stage, browsed as tidewell.example) and ending on the real public pull request https://github.com/Araby99/tidewell/pull/2. Cursor, click ripple and keycaps are the recorder's overlay; everything else is the product.";

/**
 * The stills, by file name: the video they are cut from, the second, the width, an optional crop
 * (in the source's pixels) and what the still is used for.
 */
export const FRAMES = {
  'poster.webp': {
    from: 'hero-wide.mp4',
    at: 3.5,
    width: 1200,
    use: 'the wide video poster (the desktop LCP): the headline already fixed to "Plans that grow with you", the editor holding the fix',
  },
  'poster-narrow.webp': {
    from: 'hero-narrow.mp4',
    at: 3.5,
    width: 720,
    use: 'the narrow video poster (the phone LCP): the fixed headline over the editor holding the fix',
  },
  'frames/open-link.webp': {
    from: 'hero.mp4',
    at: 0.3,
    width: 1200,
    use: 'fixer step 1: the share Studio around the Tidewell page, as a change link opens it',
  },
  'frames/alt-click.webp': {
    from: 'hero.mp4',
    at: 2.3,
    width: 1200,
    use: 'fixer step 2: the headline outlined after Alt+Click, the editor open on hero.title',
  },
  'frames/send.webp': {
    from: 'hero.mp4',
    at: 12.6,
    width: 850,
    crop: 'crop=850:952:374:22',
    use: 'fixer step 3: the Send to developer dialog with the name Lina, both changes and the change link',
  },
  'frames/pull-request.webp': {
    from: 'hero.mp4',
    at: 14.8,
    width: 1200,
    use: 'developer step 2: pull request #2 on GitHub, opened by the livelocale workflow',
  },
};

/** Writes one WebP still and its provenance sidecar per entry of FRAMES into site/media/hero/. */
export function cutFrames() {
  mkdirSync(`${HERO}frames`, { recursive: true });
  for (const [name, { from, at, width, crop, use }] of Object.entries(FRAMES)) {
    const filter = [crop, `scale=${width}:-2`].filter(Boolean).join(',');
    const run = spawnSync(
      FFMPEG,
      [
        ...['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(at), '-i', `${HERO}${from}`],
        ...['-frames:v', '1', '-vf', filter, '-c:v', 'libwebp', '-quality', '82'],
        `${HERO}${name}`,
      ],
      { stdio: 'inherit' }
    );
    if (run.status !== 0) throw new Error(`ffmpeg could not cut ${name} at ${at} s`);
    const source =
      from === 'hero.mp4'
        ? `${TAKE}`
        : `${TAKE} This still is from site/media/hero/${from}, the shipping cut site/scripts/hero-cuts.mjs makes from that recording.`;
    const prompt = `SOURCED, not generated. The frame at ${at} s of ${source} Cut with ffmpeg-static by site/scripts/hero-frames.mjs${crop ? ` (${crop})` : ''}, WebP q82, ${width} px wide. Ships as ${use}.`;
    writeFileSync(
      `${HERO}${name}.json`,
      `${JSON.stringify({ prompt, createdAt: new Date().toISOString() }, null, 2)}\n`
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cutFrames();
  console.log(`cut ${Object.keys(FRAMES).length} stills`);
}
