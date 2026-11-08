// Cuts the landing page's stills out of the hero recordings and writes each one's provenance
// sidecar (<name>.json). Each poster comes from the video it stands in for (the wide cut from
// hero-cuts.mjs, or the phone take), so it matches that video pixel for pixel; the story frames
// come from the master take (hero.mp4, made by record-hero.mjs from the Tidewell stage site).
// Nothing here is drawn or generated; every pixel is from a take. Run after hero-cuts.mjs:
// node site/scripts/hero-frames.mjs [still names...] (all of them by default). The phone take
// (record-hero.mjs --phone) cuts its own poster through cutFrames(['poster-phone.webp']).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FFMPEG = require('ffmpeg-static');
const HERO = fileURLToPath(new URL('../media/hero/', import.meta.url));

const PHONE_TAKE =
  "the real phone hero recording site/media/hero/hero-phone.mp4, made by site/scripts/record-hero.mjs --phone: headless Chromium emulating a 390x844 touch phone, filming the real livelocale share Studio's phone layout on the fictional Tidewell stage site (site/stage, browsed as tidewell.example) and ending on the real public pull request https://github.com/Araby99/tidewell/pull/2. The touch ripple is the recorder's overlay; everything else is the product.";

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
  'poster-phone.webp': {
    from: 'hero-phone.mp4',
    at: 3.5,
    width: 780,
    use: 'the phone video poster (the phone LCP): the phone Studio with the headline fixed to "Plans that grow with you" and saved in the editor sheet',
  },
  'frames/open-link.webp': {
    from: 'hero.mp4',
    at: 0.3,
    width: 786,
    crop: 'crop=786:512:346:88',
    use: "fixer step 1: the Tidewell page inside the Studio's preview, as a change link opens it and before the first Alt+Click (the preview panel only, so it reads at step size)",
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

/**
 * Writes one WebP still and its provenance sidecar per entry of FRAMES (or only those named) into
 * site/media/hero/.
 */
export function cutFrames(names = Object.keys(FRAMES)) {
  mkdirSync(`${HERO}frames`, { recursive: true });
  for (const name of names) {
    if (!FRAMES[name]) throw new Error(`no still named ${name}`);
    const { from, at, width, crop, use } = FRAMES[name];
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
        : from === 'hero-phone.mp4'
          ? PHONE_TAKE
          : `${TAKE} This still is from site/media/hero/${from}, the shipping cut site/scripts/hero-cuts.mjs makes from that recording.`;
    const prompt = `SOURCED, not generated. The frame at ${at} s of ${source} Cut with ffmpeg-static by site/scripts/hero-frames.mjs${crop ? ` (${crop})` : ''}, WebP q82, ${width} px wide. Ships as ${use}.`;
    writeFileSync(
      `${HERO}${name}.json`,
      `${JSON.stringify({ prompt, createdAt: new Date().toISOString() }, null, 2)}\n`
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = process.argv.slice(2);
  cutFrames(names.length > 0 ? names : undefined);
  console.log(
    `cut ${names.length > 0 ? names.join(', ') : `${Object.keys(FRAMES).length} stills`}`
  );
}
