// Cuts the landing page's stills out of the hero recording (site/media/hero/hero.mp4, made by
// record-hero.mjs from the Tidewell stage site): the WebP poster the video shows before it plays,
// and one frame per story step. Nothing here is drawn or generated; every pixel is from the take.
// Run after a new recording: node site/scripts/hero-frames.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FFMPEG = require('ffmpeg-static');
const HERO = fileURLToPath(new URL('../media/hero/', import.meta.url));
const VIDEO = `${HERO}hero.mp4`;

/** The stills, by file name: the second of the take they are cut at, their width, an optional crop. */
export const FRAMES = {
  'poster.webp': { at: 0, width: 1200 },
  'frames/open-link.webp': { at: 0.5, width: 1200, crop: 'crop=iw:ih*0.56:0:0' },
  'frames/alt-click.webp': { at: 2.3, width: 1200 },
  'frames/arabic.webp': { at: 10.4, width: 1200 },
  'frames/pull-request.webp': { at: 14.8, width: 1200 },
};

/** Writes one WebP still per entry of FRAMES into site/media/hero/. */
export function cutFrames() {
  mkdirSync(`${HERO}frames`, { recursive: true });
  for (const [name, { at, width, crop }] of Object.entries(FRAMES)) {
    const filter = [crop, `scale=${width}:-2`].filter(Boolean).join(',');
    const run = spawnSync(
      FFMPEG,
      [
        ...['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(at), '-i', VIDEO],
        ...['-frames:v', '1', '-vf', filter, '-c:v', 'libwebp', '-quality', '82'],
        `${HERO}${name}`,
      ],
      { stdio: 'inherit' }
    );
    if (run.status !== 0) throw new Error(`ffmpeg could not cut ${name} at ${at} s`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cutFrames();
  console.log(`cut ${Object.keys(FRAMES).length} stills from hero.mp4`);
}
