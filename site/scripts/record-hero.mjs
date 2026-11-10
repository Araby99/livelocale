// Records the landing page's hero video on the real share Studio (spike: realtime capture at 2x,
// with a camera move added in post). One command from the repo root:
//
//   node site/scripts/record-hero.mjs
//
// It builds the Tidewell stage site (site/stage), packs it with `livelocale pack`, serves it on a
// port in 5170-5179 (reached as http://tidewell.example through a Chromium host-resolver rule, so
// the Send dialog prints a believable link), opens the share Studio in headless Chromium at
// 1600x1000, DPR 2, and plays the storyboard with an injected cursor, click ripple and keycaps
// (top page only, all pointer-events:none). Frames come from CDP Page.startScreencast with their
// own timestamps and are encoded to constant 60 fps with ffmpeg-static. The camera (an eased crop
// keyed to the beats the actor logs) is applied in ffmpeg; the UI itself is never touched. The take
// ends on the Send dialog's real "Open on GitHub" click, then dissolves into the real pull request
// (PR_URL, on the public demo repo) recorded the same way: its Conversation tab, a click on Files
// changed, and a cut to the diffs. The loop seam dips to the stage colour and fades back into
// frame 0. Output goes to site/media/hero/.
//
//   node site/scripts/record-hero.mjs --phone
//
// records the phone take instead: the same stage and pull request on an emulated phone (390x844,
// DPR 3, touch, the Pixel 7's user agent), so the Studio shows its real phone layout (tap to edit,
// the editor and Send as bottom sheets). Taps show as a touch ripple (no cursor, no keycaps) and
// there is no camera: the frame is the whole phone screen, encoded at 2x. It writes
// hero-phone.{mp4,webm}, chapters-phone.json and poster-phone.webp (through hero-frames.mjs).
// HERO_MP4_CRF (default 25) and HERO_WEBM_CRF (default 40) override the phone take's H.264 and VP9
// quality: raise them for a smaller file, lower them for a sharper one (the desktop take keeps its
// fixed 23 and 38). After a phone take, copy the starts in chapters-phone.json into the chips'
// data-start-phone in site/index.html (a unit test checks they match).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutFrames } from './hero-frames.mjs';

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT_DIR = resolve(SITE_DIR, '..');
const STAGE_DIR = join(SITE_DIR, 'stage');
const OUT_DIR = join(SITE_DIR, 'media', 'hero');
const require = createRequire(import.meta.url);
const VITE_BIN = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const FFMPEG = require('ffmpeg-static');
const { chromium, devices } = require(join(ROOT_DIR, 'node_modules', 'playwright'));

const PHONE = process.argv.includes('--phone');
const VIEW = PHONE ? { width: 390, height: 844 } : { width: 1600, height: 1000 };
const DPR = Number(process.env.HERO_DPR ?? (PHONE ? 3 : 2));
// The encoded frame: the desktop take at 1x after its camera crop, the phone take at 2x (no camera).
const OUT = PHONE ? { width: VIEW.width * 2, height: VIEW.height * 2 } : VIEW;
// What each take writes into site/media/hero/ (null: not written by that take).
const OUTPUT = PHONE
  ? {
      mp4: 'hero-phone.mp4',
      webm: 'hero-phone.webm',
      chapters: 'chapters-phone.json',
      poster: null,
      contact: null,
    }
  : {
      mp4: 'hero.mp4',
      webm: 'hero.webm',
      chapters: 'chapters.json',
      poster: 'poster.png',
      contact: 'contact.png',
    };
// Headless Chromium paints only about 8 screencast frames a second at DPR 2, so the take is acted
// SLOW times slower than the video plays (CSS animations slowed to match through CDP) and the frame
// timestamps are divided by SLOW again. The product's own JS timers are not slowed, so they run
// SLOW times faster on screen (the "Saved!" flash is the only one that shows). The phone take,
// at DPR 3, paints about 4.5 a second, so it is acted 5 times slower.
const SLOW = Number(process.env.HERO_SLOW ?? (PHONE ? 5 : 3));
const PORTS = [5170, 5171, 5172, 5173, 5174, 5175, 5176, 5177, 5178, 5179];
// RFC 2606 reserves .example, so this host can never belong to a real company.
const HOST = 'tidewell.example';
const DIP = 0.25; // seconds the last shot fades to the stage colour
const RISE = 0.2; // seconds frame 0 then fades in from it, so the loop restarts on frame 0
const DIP_COLOUR = '0xf7f4ee'; // the stage's --paper

// The public demo repository the stage is published as (github.com/Araby99/tidewell). The pack runs
// with the build identity a CI build of its main branch would have, so the change link names that
// repository, branch and commit, and the Send dialog offers the real "Open on GitHub" button (which
// needs exposeRepo). site/stage holds the same locales and markup as that commit.
const DEMO_REPO = 'Araby99/tidewell';
const DEMO_BRANCH = 'main';
const DEMO_BASE = 'f10ae325b76b19a31df9b3cc1139d24808509579';
const PACK_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GITHUB_'))),
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: DEMO_REPO,
  GITHUB_REF_TYPE: 'branch',
  GITHUB_REF_NAME: DEMO_BRANCH,
  GITHUB_SHA: DEMO_BASE,
};

// Camera boxes in 1x page coordinates, all 1.6:1 like the frame.
const CAM = {
  full: { x: 0, y: 0, w: 1600, h: 1000 },
  // the preview's top half and the editor; drops the Texts list and the card grid
  edit: { x: 348, y: 64, w: 1228, h: 767.5 },
  // the Send dialog: name, both diff rows, the link, the buttons and Open on GitHub
  send: { x: 320, y: 200, w: 960, h: 600 },
  // GitHub, the pull request's Conversation tab: title, bot author, the apply table, the tabs
  prConversation: { x: 168, y: 178, w: 912, h: 570 },
  // GitHub, Files changed: the title, the file tree and both locale diffs
  prFiles: { x: 16, y: 178, w: 1264, h: 790 },
};
// The real pull request the workflow opened from the issue this Studio flow files (issue #1). The
// ending is recorded from it as is: public, headless, not signed in.
const PR_URL = 'https://github.com/Araby99/tidewell/pull/2';
const XFADE = 0.3; // seconds the Studio dissolves into the pull request
// Where the keycaps sit: bottom-centre of the preview, inside the `edit` box and clear of outlines.
const KEY_SPOT = { x: 740, y: 770 };

// ─── build and pack ──────────────────────────────────────────────────────────

function run(cmd, args, cwd, env = process.env) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, env, stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))
    );
  });
}

async function buildStage() {
  if (!existsSync(join(ROOT_DIR, 'dist', 'codemod', 'index.js'))) {
    console.log('livelocale is not built yet: running npm run build in the repo root');
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], ROOT_DIR);
  }
  await run(process.execPath, [VITE_BIN, 'build', '--config', 'stage/vite.config.ts'], SITE_DIR);
  // Spawned from node, so Git Bash never rewrites the `/` base into a Windows path.
  await run(
    process.execPath,
    [
      join(ROOT_DIR, 'dist', 'codemod', 'index.js'),
      'pack',
      'dist',
      '--dir',
      'stage',
      '--locales',
      'locales',
      '--source',
      'en',
      '--base',
      '/',
      '--expose-repo',
    ],
    SITE_DIR,
    PACK_ENV
  );
}

// ─── static server ───────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serve(root) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(join(root, path));
    const info = file.startsWith(root + sep) ? await stat(file).catch(() => null) : null;
    if (!info?.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(file));
  });
  return new Promise((ok, fail) => {
    const tryPort = (i) => {
      if (i >= PORTS.length) return fail(new Error('ports 5170-5179 are all in use'));
      server.once('error', () => tryPort(i + 1));
      server.listen(PORTS[i], '127.0.0.1', () => ok({ server, port: PORTS[i] }));
    };
    tryPort(0);
  });
}

// ─── overlay (cursor, ripple, keycap; or only a touch ripple), top page only ──

const OVERLAY = ({ spot, touch }) => {
  if (window.top !== window) return;
  const install = () => {
    const root = document.createElement('div');
    root.setAttribute('data-recorder-overlay', '');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    root.innerHTML = `
      <style>
        [data-recorder-overlay] * { pointer-events: none; }
        .rec-cursor { position: absolute; left: 0; top: 0; width: 45.5px; height: 45.5px;
          transform-origin: 5.25px 3.5px; will-change: translate, scale;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); transition: scale 120ms ease; }
        .rec-cursor.down { scale: .86; }
        .rec-ripple { position: absolute; width: 48px; height: 48px; margin: -24px 0 0 -24px;
          border-radius: 50%; background: rgba(15, 92, 77, .4);
          animation: rec-ripple 350ms cubic-bezier(.2,.7,.3,1) forwards; }
        @keyframes rec-ripple { 0% { transform: scale(0); opacity: 1 } 70% { opacity: 1 }
          100% { transform: scale(1); opacity: 0 } }
        .rec-key { position: absolute; left: ${spot.x}px; top: ${spot.y}px; height: 40px;
          display: flex; align-items: center; padding: 0 18px; border-radius: 10px;
          background: #0f172a; color: #fff; white-space: nowrap;
          font: 600 18px/1 ui-sans-serif, "Segoe UI", system-ui, sans-serif; letter-spacing: .01em;
          box-shadow: 0 3px 0 #000, 0 12px 28px -8px rgba(0,0,0,.45);
          translate: -50% -50%; opacity: 0; scale: .8;
          transition: opacity 160ms ease, scale 200ms cubic-bezier(.3,1.5,.6,1); }
        .rec-key.on { opacity: 1; scale: 1; }
        .rec-key.press { translate: -50% calc(-50% + 2px); box-shadow: 0 1px 0 #000, 0 6px 16px -8px rgba(0,0,0,.45); }
        /* a fingertip: a soft disc where the finger lands, then a ring spreading from it */
        .rec-touch { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px;
          border-radius: 50%; background: rgba(15, 23, 42, .28); border: 2px solid rgba(255,255,255,.85);
          box-shadow: 0 0 0 1px rgba(15, 23, 42, .25);
          animation: rec-touch 520ms cubic-bezier(.2,.7,.3,1) forwards; }
        @keyframes rec-touch { 0% { transform: scale(.55); opacity: 0 } 18% { transform: scale(1); opacity: 1 }
          60% { opacity: 1 } 100% { transform: scale(1.7); opacity: 0 } }
        ${touch ? '.rec-key, .rec-cursor { display: none; }' : ''}
      </style>
      <div class="rec-key">Alt</div>
      <svg class="rec-cursor" viewBox="0 0 26 26"><path d="M3 2 L3 21.5 L8.2 16.6 L11.6 24.2 L15 22.7 L11.7 15.3 L18.8 15.1 Z"
        fill="#111" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(root);
    const cursor = root.querySelector('.rec-cursor');
    const key = root.querySelector('.rec-key');
    let x = -100;
    let y = -100;
    const place = () => {
      // the translate property, not transform: `scale` composes outside `transform`, so a press
      // would also scale the position and pull the cursor toward the top-left corner
      cursor.style.translate = `${x - 5.25}px ${y - 3.5}px`;
    };
    window.__rec = {
      move(nx, ny) {
        x = nx;
        y = ny;
        place();
      },
      down(pressKey) {
        cursor.classList.add('down');
        const ripple = document.createElement('div');
        ripple.className = touch ? 'rec-touch' : 'rec-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        root.insertBefore(ripple, key);
        if (touch)
          ripple.addEventListener('animationend', () => ripple.remove()); // slowed too
        else setTimeout(() => ripple.remove(), 420);
        if (pressKey) key.classList.add('press');
      },
      up() {
        cursor.classList.remove('down');
        key.classList.remove('press');
      },
      key(on, label) {
        if (label) key.textContent = label;
        key.classList.toggle('on', on);
      },
    };
    place();
  };
  if (document.documentElement) install();
  else document.addEventListener('DOMContentLoaded', install);
};

// ─── the storyboard actor ────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Sleeps `ms` of video time. */
const wait = (ms) => sleep(ms * SLOW);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function actor(page) {
  let cx = VIEW.width * 0.86;
  let cy = VIEW.height * 0.78;
  let altHeld = false;
  const overlay = (fn, ...args) => page.evaluate(([f, a]) => window.__rec[f](...a), [fn, args]);

  return {
    overlay,
    async place(x, y) {
      cx = x;
      cy = y;
      await page.mouse.move(x, y);
      await overlay('move', x, y);
    },
    /** Moves along a slightly curved, eased path; duration in ms, timed by the wall clock. */
    async move(x, y, ms = 550, bend = 0.12) {
      const sx = cx;
      const sy = cy;
      const dx = x - sx;
      const dy = y - sy;
      // control point: midpoint pushed sideways, so the path bows a little like a hand's
      const qx = sx + dx / 2 - dy * bend;
      const qy = sy + dy / 2 + dx * bend;
      const start = Date.now();
      ms *= SLOW;
      for (;;) {
        const raw = Math.min(1, (Date.now() - start) / ms);
        const t = easeInOut(raw);
        const px = (1 - t) ** 2 * sx + 2 * (1 - t) * t * qx + t * t * x;
        const py = (1 - t) ** 2 * sy + 2 * (1 - t) * t * qy + t * t * y;
        await Promise.all([page.mouse.move(px, py), overlay('move', px, py)]);
        cx = px;
        cy = py;
        if (raw >= 1) break;
        await sleep(8);
      }
    },
    async click({ count = 1 } = {}) {
      for (let i = 0; i < count; i++) {
        await overlay('down', altHeld);
        await page.mouse.down({ clickCount: i + 1 });
        await wait(70);
        await page.mouse.up({ clickCount: i + 1 });
        await overlay('up');
        if (i + 1 < count) await wait(60);
      }
    },
    /** Visual-only press held for `ms`, for controls driven another way (a native select). */
    async tap(ms = 90) {
      await overlay('down', false);
      await wait(ms);
      await overlay('up');
    },
    /**
     * A finger tap at (x, y) in page coordinates (the phone take): the touch ripple shows where
     * it lands and a real touchstart/touchend goes to whatever is there, iframe included. With
     * `real: false` only the ripple shows, for controls driven another way (a native select).
     */
    async touch(x, y, { real = true, hold = 90 } = {}) {
      cx = x;
      cy = y;
      await overlay('move', x, y);
      await overlay('down', false);
      if (real) await page.touchscreen.tap(x, y);
      await wait(hold);
      await overlay('up');
    },
    async altDown() {
      altHeld = true;
      await overlay('key', true, 'Alt');
      await page.keyboard.down('Alt');
    },
    async altUp() {
      await page.keyboard.up('Alt');
      altHeld = false;
      await overlay('key', false);
    },
    /** Types one character at a time on a wall-clock schedule, so slow renders do not stretch it. */
    async type(text, base = 85, jitter = 25) {
      let due = Date.now();
      for (const ch of text) {
        await page.keyboard.insertText(ch);
        due += (base + (Math.random() * 2 - 1) * jitter) * SLOW;
        await sleep(Math.max(0, due - Date.now()));
      }
    },
  };
}

const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Page position of the caret just after `prefix` on the first line of a textarea. */
async function caretAfter(locator, prefix) {
  return locator.evaluate((el, text) => {
    const cs = getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const r = el.getBoundingClientRect();
    const isRtl = cs.direction === 'rtl';
    const w = ctx.measureText(text).width;
    const x = isRtl
      ? r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) - w
      : r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + w;
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const y = r.top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth) + line / 2;
    return { x, y };
  }, prefix);
}

// ─── screencast ──────────────────────────────────────────────────────────────

async function startScreencast(page) {
  const cdp = await page.context().newCDPSession(page);
  // slow CSS animations and transitions in the Studio and the preview (new documents too)
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / SLOW });
  const frames = [];
  let firstWall = null;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (firstWall === null) firstWall = Date.now();
    frames.push({ ts: metadata.timestamp, data: Buffer.from(data, 'base64') });
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: Number(process.env.HERO_Q ?? 90),
    maxWidth: VIEW.width * DPR,
    maxHeight: VIEW.height * DPR,
    everyNthFrame: 1,
  });
  // wait for the first frame so chapter times can be measured from it
  while (firstWall === null) await sleep(5);
  const now = () => (Date.now() - firstWall) / 1000 / SLOW;
  return {
    frames,
    /** Seconds of video since the first frame. */
    now,
    /** Sleeps until the video clock reaches `t` seconds (no-op if it already has). */
    until: (t) => sleep(Math.max(0, (t - now()) * 1000 * SLOW)),
    async stop() {
      const end = frames.length ? frames[0].ts + now() * SLOW : 0; // wall-clock, like ts
      await cdp.send('Page.stopScreencast');
      return end;
    },
  };
}

// ─── camera ──────────────────────────────────────────────────────────────────

/**
 * Builds an ffmpeg expression in `on` (output frame number) for one box component. Each key eases
 * (smoothstep) from the previous key's box to its own over `ease` seconds starting at `t`.
 */
function camTrack(keys, comp) {
  const T = '(on/60)';
  const n = (v) => Number(v.toFixed(4));
  const value = (i) => n(keys[i].box[comp]);
  const build = (i) => {
    const { t, ease } = keys[i];
    const from = value(i - 1);
    const to = value(i);
    const after =
      i + 1 < keys.length ? `if(lt(${T},${n(keys[i + 1].t)}),${to},${build(i + 1)})` : `${to}`;
    if (ease <= 0 || from === to) return after;
    const p = `((${T}-${n(t)})/${n(ease)})`;
    return `if(lt(${T},${n(t + ease)}),${from}+${n(to - from)}*${p}*${p}*(3-2*${p}),${after})`;
  };
  return keys.length > 1 ? `if(lt(${T},${n(keys[1].t)}),${value(0)},${build(1)})` : `${value(0)}`;
}

function zoompan(keys) {
  // no key may start before the previous one has finished easing
  for (let i = 1; i + 1 < keys.length; i++) {
    keys[i].ease = Math.max(0, Math.min(keys[i].ease, keys[i + 1].t - keys[i].t));
  }
  const w = camTrack(keys, 'w');
  const x = camTrack(keys, 'x');
  const y = camTrack(keys, 'y');
  return (
    `zoompan=z='${VIEW.width}/(${w})':x='${DPR}*(${x})':y='${DPR}*(${y})'` +
    `:d=1:fps=60:s=${OUT.width}x${OUT.height}`
  );
}

/** A shot's framing: its eased camera, or (no keys, the phone take) the whole screen scaled. */
const framing = (keys) => (keys ? zoompan(keys) : `scale=${OUT.width}:${OUT.height}:flags=lanczos`);

// ─── ffmpeg ──────────────────────────────────────────────────────────────────

function ffmpeg(args) {
  const res = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (res.status !== 0) throw new Error(`ffmpeg ${args.slice(0, 12).join(' ')} ... failed`);
}

/** One shot: its VFR screencast frames -> CFR 60 -> its framing, as a near-lossless mp4. */
async function encodeShot({ frames, endTs, camKeys }, work, name) {
  const dir = join(work, name);
  await mkdir(dir, { recursive: true });
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const file = join(dir, `${String(i).padStart(5, '0')}.jpg`).replaceAll('\\', '/');
    await writeFile(file, frames[i].data);
    const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    const seconds = (next - frames[i].ts) / SLOW; // back to video time
    list.push(`file '${file}'`, `duration ${Math.max(0.001, seconds).toFixed(6)}`);
  }
  // the concat demuxer ignores the last duration unless the file is repeated
  list.push(list.at(-2));
  const listFile = join(dir, 'frames.txt');
  await writeFile(listFile, list.join('\n'));
  const duration = (endTs - frames[0].ts) / SLOW;
  const graphFile = join(dir, 'graph.txt');
  await writeFile(
    graphFile,
    `[0:v]fps=60,settb=AVTB,setpts=PTS-STARTPTS,${framing(camKeys)},` +
      `trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v]`
  );
  const out = join(work, `${name}.mp4`);
  ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-filter_complex_script',
    graphFile,
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-crf',
    '10',
    '-preset',
    'veryfast',
    out,
  ]);
  return { file: out, duration, first: join(dir, '00000.jpg') };
}

/**
 * Joins the shots (each later one by a `dissolve` or a hard `cut`), dips the last shot to the
 * stage colour, then fades frame 0 (full frame, like the opening) back in, so the loop restarts on
 * frame 0 and no two layouts are ever on screen together.
 */
async function encode(shots, work) {
  const encoded = [];
  for (let i = 0; i < shots.length; i++) encoded.push(await encodeShot(shots[i], work, `shot${i}`));
  const parts = [];
  let label = '[0:v]';
  let length = encoded[0].duration;
  for (let i = 1; i < shots.length; i++) {
    const next = `[j${i}]`;
    if (shots[i].join === 'dissolve') {
      parts.push(
        `${label}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${(length - XFADE).toFixed(3)}${next}`
      );
      length += encoded[i].duration - XFADE;
    } else {
      parts.push(`${label}[${i}:v]concat=n=2:v=1:a=0${next}`);
      length += encoded[i].duration;
    }
    label = next;
  }
  const raw = length;
  const n = shots.length;
  parts.push(
    `${label}trim=duration=${raw.toFixed(3)},setpts=PTS-STARTPTS,` +
      `fade=t=out:st=${(raw - DIP).toFixed(3)}:d=${DIP}:color=${DIP_COLOUR}[a]`,
    `[${n}:v]scale=${OUT.width}:${OUT.height}:flags=lanczos,fps=60,trim=duration=${RISE},` +
      `setpts=PTS-STARTPTS,setsar=1,format=yuv420p,fade=t=in:st=0:d=${RISE}:color=${DIP_COLOUR}[b]`,
    `[a][b]concat=n=2:v=1:a=0[v]`
  );
  const graphFile = join(work, 'graph.txt');
  await writeFile(graphFile, parts.join(';\n'));
  const master = join(work, 'master.mp4');
  ffmpeg([
    ...encoded.flatMap((e) => ['-i', e.file]),
    '-loop',
    '1',
    '-t',
    String(RISE + 0.1),
    '-i',
    encoded[0].first,
    '-filter_complex_script',
    graphFile,
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-crf',
    '10',
    '-preset',
    'veryfast',
    master,
  ]);
  const duration = raw + RISE;

  const mp4 = join(OUT_DIR, OUTPUT.mp4);
  const webm = join(OUT_DIR, OUTPUT.webm);
  ffmpeg([
    '-i',
    master,
    '-c:v',
    'libx264',
    '-preset',
    'veryslow',
    '-tune',
    'animation',
    '-crf',
    String(PHONE ? Number(process.env.HERO_MP4_CRF ?? 25) : 23),
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    mp4,
  ]);
  ffmpeg([
    '-i',
    master,
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    String(PHONE ? Number(process.env.HERO_WEBM_CRF ?? 40) : 38),
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-an',
    webm,
  ]);
  if (OUTPUT.poster) ffmpeg(['-i', master, '-frames:v', '1', join(OUT_DIR, OUTPUT.poster)]);

  // contact sheet: 12 evenly spaced frames, 400 px wide, tiled 4x3
  for (let i = 0; OUTPUT.contact && i < 12; i++) {
    const t = ((duration - 0.05) * i) / 11;
    const tile = join(work, `tile${String(i).padStart(2, '0')}.png`);
    ffmpeg(['-ss', t.toFixed(3), '-i', master, '-frames:v', '1', '-vf', 'scale=400:-2', tile]);
  }
  if (OUTPUT.contact)
    ffmpeg([
      '-i',
      join(work, 'tile%02d.png'),
      '-vf',
      'tile=4x3:padding=6:margin=6:color=white',
      '-frames:v',
      '1',
      join(OUT_DIR, OUTPUT.contact),
    ]);
  // HERO_KEEP_MASTER=path copies the lossless-ish master out for frame-by-frame review.
  if (process.env.HERO_KEEP_MASTER) {
    await writeFile(process.env.HERO_KEEP_MASTER, await readFile(master));
  }
  return { duration };
}

// ─── the pull request on GitHub ──────────────────────────────────────────────

/** The browser context a take films in: the desktop window, or the emulated phone (touch). */
function contextOptions(extra = {}) {
  return {
    ...(PHONE ? { ...devices['Pixel 7'], screen: VIEW } : {}),
    viewport: VIEW,
    deviceScaleFactor: DPR,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    ...extra,
  };
}

/** Scrolls the page to `y` over `ms` of video time, eased, as a finger's swipe would settle. */
async function scrollTo(page, y, ms) {
  const from = await page.evaluate(() => window.scrollY);
  const start = Date.now();
  const total = ms * SLOW;
  for (;;) {
    const raw = Math.min(1, (Date.now() - start) / total);
    const at = from + (y - from) * easeInOut(raw);
    await page.evaluate((top) => window.scrollTo(0, top), at);
    if (raw >= 1) break;
    await sleep(8);
  }
}

/** Records PR_URL: the Conversation tab, a click on Files changed, then the diffs (two shots). */
async function recordPullRequest(browser) {
  // GitHub's CSP would block the overlay's inline <style>
  const context = await browser.newContext(contextOptions({ bypassCSP: true }));
  try {
    await context.addInitScript(OVERLAY, { spot: KEY_SPOT, touch: PHONE });
    const files = await context.newPage();
    // Files changed loads first, off camera, so the cut after the click lands on a settled page.
    await files.goto(`${PR_URL}/files`, { waitUntil: 'load' });
    await files.locator('text=locales/en.json >> visible=true').first().waitFor();
    if (!PHONE) await files.mouse.move(0, 0);
    const page = await context.newPage();
    await page.goto(PR_URL, { waitUntil: 'load' });
    await page.getByText('wants to merge').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await sleep(1200);

    const tab = page.getByRole('link', { name: /Files changed/ }).first();
    // On a phone the tab strip runs off the right edge: it is scrolled to show Files changed
    // before filming, as a thumb would have swiped it.
    if (PHONE) {
      await tab.evaluate((el) => {
        for (let box = el.parentElement; box; box = box.parentElement) {
          if (box.scrollWidth > box.clientWidth + 1) box.scrollLeft = box.scrollWidth;
        }
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(300);
    }
    const tabAt = centre(await tab.boundingBox());
    const me = actor(page);
    if (!PHONE) await me.place(760, 640); // resting on the apply table
    await sleep(300);

    const cast = await startScreencast(page);
    if (PHONE) {
      await cast.until(1.1);
      await me.touch(tabAt.x, tabAt.y, { real: false, hold: 120 });
      await wait(260);
    } else {
      await cast.until(0.55);
      await me.move(tabAt.x + 6, tabAt.y + 4, 650);
      await wait(120);
      await me.overlay('down', false);
      await wait(80);
      await me.overlay('up');
      await wait(140);
    }
    const convEnd = await cast.stop();
    const conversation = {
      frames: cast.frames,
      endTs: convEnd,
      camKeys: PHONE ? null : [{ t: 0, ease: 0, box: CAM.prConversation }],
    };

    await files.bringToFront();
    await files.evaluate(() => document.fonts.ready);
    const me2 = actor(files);
    if (!PHONE) await me2.place(tabAt.x + 6, tabAt.y + 4);
    const cast2 = await startScreencast(files);
    if (PHONE) {
      // a swipe down to the Arabic diff, then on to the English one
      const top = (name) =>
        files
          .locator(`text=${name} >> visible=true`)
          .first()
          .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      const ar = await top('locales/ar.json');
      const en = await top('locales/en.json');
      await cast2.until(0.5);
      await scrollTo(files, ar - 110, 700);
      await cast2.until(2.4);
      await scrollTo(files, en - 140, 800);
      await cast2.until(4.6);
    } else {
      // the mouse stays where it clicked, then drifts down to the en.json change
      await me2.move(tabAt.x + 40, tabAt.y + 470, 1100, 0.06);
      await cast2.until(2.3);
    }
    const filesEnd = await cast2.stop();
    const filesShot = {
      frames: cast2.frames,
      endTs: filesEnd,
      camKeys: PHONE ? null : [{ t: 0, ease: 0, box: CAM.prFiles }],
    };
    const secs = (x) => (x.endTs - x.frames[0].ts) / SLOW;
    return { conversation, files: filesShot, seconds: secs(conversation) + secs(filesShot) };
  } finally {
    await context.close();
  }
}

// ─── the desktop storyboard ──────────────────────────────────────────────────

/** The desktop take of the Studio: Alt+Click, the camera moves, the Send dialog. */
async function desktopStudio({ page, app, appFrame, waitForApp }) {
  const me = actor(page);
  const h1Box = await app().locator('h1').boundingBox();
  const h1 = centre(h1Box);
  // parked just under the headline, so the typo is the first thing the eye meets
  await me.place(h1.x + 70, h1Box.y + h1Box.height + 16);
  await sleep(400);

  const cast = await startScreencast(page);
  const chapters = [];
  const camKeys = [{ t: 0, ease: 0, box: CAM.full }];
  const chapter = (title) => chapters.push({ title, start: Number(cast.now().toFixed(2)) });
  const mark = (label) => console.log(`  ${cast.now().toFixed(2)} s  ${label}`);
  const cam = (name, ms) => {
    camKeys.push({ t: cast.now(), ease: ms / 1000, box: CAM[name] });
    mark(`camera -> ${name}`);
  };

  // 0-2 s: English, with the typo. The camera pushes in on the preview and the editor at once.
  await cast.until(0.25);
  cam('edit', 1100);
  await me.move(h1.x + 40, h1.y + 4, 380);
  await cast.until(0.8);
  await appFrame().evaluate(() => window.focus()); // Alt goes to the app, like a real user's
  chapter('Alt+Click the text');
  await me.altDown();
  mark('alt down');

  // 2-5 s: Alt+Click the headline; the editor shows key and value; type the fix; Save.
  await cast.until(2.0);
  mark('headline clicked');
  await me.click();
  await me.altUp();
  const field = page.getByRole('textbox', { name: 'Translation' });
  await page.waitForFunction(() =>
    document.querySelector('textarea')?.value.includes('Plans that grows')
  );
  await wait(150);
  const caret = await caretAfter(field, 'Plans that grows');
  await me.move(caret.x + 1, caret.y, 400);
  await me.click();
  await wait(110);
  await page.keyboard.press('Control+Shift+ArrowLeft');
  await wait(160);
  await me.type('grow', 85);
  await wait(180);
  const save = centre(await page.getByRole('button', { name: 'Save', exact: true }).boundingBox());
  await me.move(save.x, save.y, 400);
  await wait(60);
  await me.click();
  await wait(320);
  // the real Clear Selection link, so the editor is empty before the language changes
  const clear = centre(await page.getByRole('button', { name: 'Clear Selection' }).boundingBox());
  await me.move(clear.x, clear.y, 360);
  await me.click();
  await wait(120);

  // 6-10 s: switch the locale to Arabic; the preview flips right to left.
  chapter('Fix it in every language');
  const select = page.locator('select').first();
  const sel = centre(await select.boundingBox());
  await me.move(sel.x, sel.y, 380);
  await me.tap(300);
  cam('full', 700);
  await me.overlay('key', true, 'EN → AR'); // a recording annotation, like the cursor
  const chipOn = cast.now();
  await select.selectOption('ar');
  await waitForApp('خطط تنمو معك');
  mark('arabic loaded');
  const flipped = cast.now();
  await cast.until(chipOn + 0.6);
  await me.overlay('key', false);
  const cta = centre(await app().getByText('Start free trial').boundingBox());
  await cast.until(flipped + 0.9);
  cam('edit', 700);
  await me.move(cta.x + 18, cta.y + 4, 480);
  await appFrame().evaluate(() => window.focus());
  await me.altDown();
  await wait(380);
  await me.click();
  await me.altUp();
  mark('cta clicked');
  // hero.cta has no Arabic value, so the field starts empty; wait for the editor to open on it
  await page.waitForFunction(() => document.querySelector('textarea'));
  await wait(120);
  const box = centre(await field.boundingBox());
  await me.move(box.x + 120, box.y - 20, 380);
  await me.click();
  await page.keyboard.press('Control+A');
  await wait(140);
  await me.type('ابدأ تجربتك المجانية', 28, 8);
  await wait(220);
  const save2 = centre(await page.getByRole('button', { name: 'Save', exact: true }).boundingBox());
  await me.move(save2.x, save2.y, 420);
  await me.click();
  await wait(350);

  // 11-15 s: open Send; the real Send dialog with the change link (2 changes). Hold it.
  chapter('Get a pull request');
  const send = centre(await page.getByRole('button', { name: /Send to developer/ }).boundingBox());
  await me.move(send.x, send.y, 520);
  await wait(60);
  await me.click();
  await page.getByRole('dialog').waitFor();
  mark('send dialog open');
  const opened = cast.now();
  cam('send', 800);
  const copy = await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Copy link' })
    .boundingBox();
  // rest just below Copy link, off the diff rows
  if (copy) await me.move(copy.x + copy.width / 2, copy.y + copy.height + 10, 560, 0.06);
  const github = page.getByRole('dialog').getByRole('link', { name: 'Open on GitHub' });
  const issueUrl = await github.getAttribute('href');
  console.log(`  issue link the Studio built: ${issueUrl}`);
  if (process.env.HERO_ISSUE_OUT) await writeFile(process.env.HERO_ISSUE_OUT, issueUrl);
  // The real link and its real click handler (the batch is marked sent), but the new tab is not
  // opened: headless and signed out, GitHub would only show its sign-in page. The issue that
  // link pre-fills was filed once, by the maintainer, and is what PR_URL came from.
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      (e) => e.target.closest?.('a[href^="https://github.com/"]') && e.preventDefault(),
      true
    )
  );
  await cast.until(opened + 1.25);
  const gh = centre(await github.boundingBox());
  await me.move(gh.x - 8, gh.y + 2, 520);
  await wait(120);
  await me.click();
  mark('open on github clicked');
  await wait(650);

  const endTs = await cast.stop();
  return { frames: cast.frames, endTs, camKeys, chapters };
}

// ─── the phone storyboard ────────────────────────────────────────────────────

/**
 * The phone take of the Studio: tap the headline, fix "grows" in the editor sheet and save;
 * switch the locale chip to Arabic, tap the untranslated button and fill it in; tap Send · 2 and
 * Open on GitHub in the Send sheet. Every gesture is a real tap on the emulated touch screen.
 */
async function phoneStudio({ page, app, waitForApp }) {
  const me = actor(page);
  const field = page.locator('#studio-translation-input');
  const saveButton = page.locator('#studio-save-button');
  /** Taps the middle of `locator` (optionally only showing the ripple). */
  const tapOn = async (locator, options) => {
    const c = centre(await locator.boundingBox());
    await me.touch(c.x, c.y, options);
  };
  await page
    .getByRole('radiogroup', { name: 'Tap mode' })
    .getByRole('radio', { name: 'Edit' })
    .waitFor({ state: 'attached' });

  const cast = await startScreencast(page);
  const chapters = [];
  const chapter = (title) => chapters.push({ title, start: Number(cast.now().toFixed(2)) });
  const mark = (label) => console.log(`  ${cast.now().toFixed(2)} s  ${label}`);

  // 0-5 s: tap the headline; the compact editor sheet slides up; fix "grows"; save.
  await cast.until(0.9);
  chapter('Tap the text');
  const h1 = centre(await app().locator('h1').boundingBox());
  await me.touch(h1.x + 30, h1.y);
  mark('headline tapped');
  await page.waitForFunction(() =>
    document.querySelector('#studio-translation-input')?.value.includes('Plans that grows')
  );
  await wait(700); // the sheet slides up and the page scrolls the headline above it
  const caret = await caretAfter(field, 'Plans that grows');
  await me.touch(caret.x, caret.y);
  // the caret where the finger put it, just after "grows"
  await field.evaluate((el) => {
    const end = el.value.indexOf('grows') + 'grows'.length;
    el.focus();
    el.setSelectionRange(end, end);
  });
  await wait(350);
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() =>
    document.querySelector('#studio-translation-input')?.value.includes('Plans that grow with')
  );
  mark('typo fixed');
  await wait(500);
  await tapOn(saveButton);
  await page.locator('[data-testid="save-success"]').waitFor();
  mark('saved');
  await wait(1100); // hold on the fixed headline in its amber outline

  // close the sheet with a tap on the dimmed page above it
  await me.touch(VIEW.width * 0.5, 150);
  await page.locator('#studio-translation-input').waitFor({ state: 'detached' });
  await wait(250);

  // 6-11 s: the locale chip to Arabic; the page flips right to left; fill the empty button.
  chapter('Fix it in every language');
  const chip = page.getByRole('combobox', { name: 'Language' });
  await tapOn(chip, { real: false, hold: 160 });
  await chip.selectOption('ar');
  await waitForApp('خطط تنمو معك');
  mark('arabic loaded');
  await wait(1000);
  await tapOn(app().getByText('Start free trial').first());
  mark('cta tapped');
  await field.waitFor();
  await wait(700);
  await tapOn(field);
  // the field starts empty; select it anyway, so the Arabic replaces whatever is there
  await field.evaluate((el) => {
    el.focus();
    el.select();
  });
  await wait(250);
  await me.type('ابدأ تجربتك المجانية', 34, 10);
  await wait(400);
  await tapOn(saveButton);
  await page.locator('[data-testid="save-success"]').waitFor();
  mark('arabic saved');
  await wait(900);

  // 12-16 s: Send · 2; the Send sheet lists both changes; Open on GitHub.
  chapter('Get a pull request');
  await tapOn(page.locator('#studio-send-button'));
  const sheet = page.getByRole('dialog', { name: 'Send to developer' });
  await sheet.waitFor();
  mark('send sheet open');
  await wait(1700);
  // As in the desktop take: the real link and its click handler, but no new tab (signed out,
  // GitHub would only show its sign-in page); the pull request that follows came from that issue.
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      (e) => e.target.closest?.('a[href^="https://github.com/"]') && e.preventDefault(),
      true
    )
  );
  const github = sheet.getByRole('link', { name: 'Open on GitHub' });
  if (await github.isVisible()) {
    console.log(`  issue link the Studio built: ${await github.getAttribute('href')}`);
    await tapOn(github);
    mark('open on github tapped');
  } else {
    console.log('  Open on GitHub is not in view in the Send sheet; ending on the change list');
  }
  await wait(700);

  const endTs = await cast.stop();
  return { frames: cast.frames, endTs, camKeys: null, chapters };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  await buildStage();
  await mkdir(OUT_DIR, { recursive: true });
  const { server, port } = await serve(join(STAGE_DIR, 'dist'));
  console.log(`serving the packed stage on 127.0.0.1:${port}, browsed as http://${HOST}`);
  const browser = await chromium.launch({
    args: [
      `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${port}`,
      // without it the headless screencast sends 1x frames even when deviceScaleFactor is 2
      `--force-device-scale-factor=${DPR}`,
    ],
  });
  const work = await mkdtemp(join(tmpdir(), 'livelocale-hero-'));
  try {
    const context = await browser.newContext(contextOptions());
    await context.addInitScript(OVERLAY, { spot: KEY_SPOT, touch: PHONE });
    const page = await context.newPage();
    await page.goto(`http://${HOST}/livelocale/index.html`);

    // First run: the real welcome tips. Credit a name, then start editing (off camera).
    await page.getByRole('button', { name: 'Start editing' }).waitFor();
    await page.getByLabel(/Your name/).fill('Lina');
    await page.getByRole('button', { name: 'Start editing' }).click();

    const app = () => page.frameLocator('iframe');
    const appFrame = () => page.frames().find((f) => f !== page.mainFrame());
    const waitForApp = async (text) => {
      await app().getByText(text).first().waitFor();
      await appFrame().evaluate(() => document.fonts.ready);
    };
    await waitForApp('Plans that grows with you');
    await page.evaluate(() => document.fonts.ready);
    await sleep(250);

    const take = await (PHONE ? phoneStudio : desktopStudio)({ page, app, appFrame, waitForApp });
    const { frames, endTs, camKeys, chapters } = take;
    const seconds = (endTs - frames[0].ts) / SLOW;
    console.log(
      `captured ${frames.length} frames over ${seconds.toFixed(2)} s of video ` +
        `(${(frames.length / seconds).toFixed(1)} fps, acted at 1/${SLOW} speed)`
    );

    const pr = await recordPullRequest(browser);

    if (process.env.HERO_NO_ENCODE) return; // timing runs while tuning the storyboard
    const { duration } = await encode(
      [
        { frames, endTs, camKeys },
        { ...pr.conversation, join: 'dissolve' },
        { ...pr.files, join: 'cut' },
      ],
      work
    );
    console.log(`studio ${seconds.toFixed(2)} s, pull request ${pr.seconds.toFixed(2)} s`);
    await writeFile(
      join(OUT_DIR, OUTPUT.chapters),
      `${JSON.stringify({ duration: Number(duration.toFixed(2)), chapters }, null, 2)}\n`
    );
    // the phone poster is cut from the shipping video, with its provenance sidecar
    if (PHONE) cutFrames(['poster-phone.webp']);
    const written = [...Object.values(OUTPUT), ...(PHONE ? ['poster-phone.webp'] : [])];
    for (const f of written.filter(Boolean)) {
      const { size } = await stat(join(OUT_DIR, f));
      console.log(`${f.padEnd(14)} ${(size / 1024).toFixed(0).padStart(6)} KiB`);
    }
    console.log(`video ${duration.toFixed(2)} s, chapters ${JSON.stringify(chapters)}`);
  } finally {
    await browser.close();
    server.close();
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
