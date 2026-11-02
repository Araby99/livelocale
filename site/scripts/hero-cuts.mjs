// Cuts the two shipping versions of the hero video out of the master take (site/media/hero/hero.mp4,
// made by record-hero.mjs): a wide 2:1 cut for desktop and a narrow 4:5 cut for phones. Both keep
// the master's timing frame for frame, so the chapter times in chapters.json hold for either.
//
// The master is 1600x1000 with its own camera moves (the whole Studio, the edit close-up, the Send
// dialog, then GitHub). A single crop cannot follow them, so each cut is a run of shots, each shot
// with its own crop, joined back to back at the master's camera cuts:
//   - wide: the Studio shots lose the idle bottom fifth (the pricing cards); the Send dialog and the
//     pull request, which fill the frame's height, are scaled down whole and set on Surface.
//   - narrow: the Studio shots stack the page (headline and buttons) over the editor, so a phone
//     sees the text change and the field it is typed in; the dialog and GitHub are cut to their
//     readable middle.
// Run after a new recording, then hero-frames.mjs: node site/scripts/hero-cuts.mjs
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FFMPEG = require('ffmpeg-static');
const HERO = fileURLToPath(new URL('../media/hero/', import.meta.url));
const MASTER = `${HERO}hero.mp4`;
const SURFACE = '0x16181D';

/** The master's camera cuts, in seconds: where each shot starts. */
const SHOTS = [
  { start: 0, end: 0.9, camera: 'full' }, // the whole Studio, the typo on the page
  { start: 0.9, end: 5.85, camera: 'edit' }, // Alt+Click, the fix typed and saved
  { start: 5.85, end: 7.3, camera: 'full-ar' }, // the switch to Arabic
  { start: 7.3, end: 11.3, camera: 'edit' }, // the Arabic button filled in
  { start: 11.3, end: 13.8, camera: 'send' }, // Send to developer: Lina, both changes, the link
  { start: 13.8, end: 15.15, camera: 'pr' }, // the pull request's conversation
  { start: 15.15, end: 17.3, camera: 'files' }, // its files changed
  { start: 17.3, end: null, camera: 'full' }, // the loop seam back to frame 0
];

const crop = (w, h, x, y) => `crop=${w}:${h}:${x}:${y}`;
/** Page over editor, each cropped from the master and scaled to the narrow cut's width. */
const stack = (page, editor) => ({ page, editor });

/** Per camera: a filter (string) or a stack of two crops; output 1600x800 (wide), 720x900 (narrow). */
export const CUTS = {
  wide: {
    size: [1600, 800],
    camera: {
      full: crop(1600, 800, 0, 0),
      'full-ar': crop(1600, 800, 0, 0),
      edit: crop(1600, 800, 0, 0),
      send: `scale=1280:800,pad=1600:800:160:0:color=${SURFACE}`,
      pr: `scale=1280:800,pad=1600:800:160:0:color=${SURFACE}`,
      files: `scale=1280:800,pad=1600:800:160:0:color=${SURFACE}`,
    },
  },
  narrow: {
    size: [720, 900],
    camera: {
      full: stack(crop(780, 303, 345, 175), crop(430, 370, 1160, 330)),
      'full-ar': stack(crop(780, 303, 320, 170), crop(430, 370, 1160, 330)),
      edit: stack(crop(1040, 404, 0, 140), crop(520, 449, 1070, 140)),
      send: `${crop(800, 1000, 390, 0)},scale=720:900`,
      pr: `${crop(800, 1000, 20, 0)},scale=720:900`,
      files: `${crop(800, 1000, 380, 0)},scale=720:900`,
    },
  },
};

/** The filter graph for one cut: trim each shot, crop it its way, and concatenate them. */
export function filterGraph(name) {
  const { size, camera } = CUTS[name];
  const [w, h] = size;
  const parts = SHOTS.map((shot, i) => {
    const trim = `trim=start=${shot.start}${shot.end === null ? '' : `:end=${shot.end}`},setpts=PTS-STARTPTS`;
    const how = camera[shot.camera];
    if (typeof how === 'string') return `[0:v]${trim},${how},setsar=1[s${i}]`;
    const pageOut = 280; // both page crops are about 2.6:1; the editor takes the rest
    return [
      `[0:v]${trim},split[a${i}][b${i}]`,
      `[a${i}]${how.page},scale=${w}:${pageOut}[p${i}]`,
      `[b${i}]${how.editor},scale=${w}:${h - pageOut}[e${i}]`,
      `[p${i}][e${i}]vstack,setsar=1[s${i}]`,
    ].join(';');
  });
  const inputs = SHOTS.map((_, i) => `[s${i}]`).join('');
  return `${parts.join(';')};${inputs}concat=n=${SHOTS.length}:v=1:a=0[out]`;
}

const ENCODERS = {
  mp4: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p'],
  webm: ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good'],
};

/** Writes hero-wide.{webm,mp4} and hero-narrow.{webm,mp4} next to the master. */
export function cutVideos(names = Object.keys(CUTS)) {
  for (const name of names) {
    for (const [ext, codec] of Object.entries(ENCODERS)) {
      const out = `${HERO}hero-${name}.${ext}`;
      const run = spawnSync(
        FFMPEG,
        [
          ...['-y', '-hide_banner', '-loglevel', 'error', '-i', MASTER],
          ...['-filter_complex', filterGraph(name), '-map', '[out]', '-an'],
          ...codec,
          ...(ext === 'mp4' ? ['-movflags', '+faststart'] : []),
          out,
        ],
        { stdio: 'inherit' }
      );
      if (run.status !== 0) throw new Error(`ffmpeg could not cut ${out}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = process.argv.slice(2);
  cutVideos(names.length > 0 ? names : undefined);
  console.log(`cut ${names.length > 0 ? names.join(', ') : 'wide, narrow'} from hero.mp4`);
}
