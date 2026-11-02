// Records the landing page's hero video on the real share Studio (spike, Tier A of the research:
// realtime 1x capture). One command from the repo root:
//
//   node site/scripts/record-hero.mjs
//
// It builds the Tidewell stage site (site/stage), packs it with `livelocale pack`, serves it on a
// port in 5170-5179, opens the share Studio in headless Chromium at 1600x1000 and plays the
// storyboard with an injected cursor, click ripple and Alt keycap (top page only, all
// pointer-events:none). Frames come from CDP Page.startScreencast with their own timestamps and
// are encoded to constant 60 fps with ffmpeg-static. Output goes to site/media/hero/.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT_DIR = resolve(SITE_DIR, '..');
const STAGE_DIR = join(SITE_DIR, 'stage');
const OUT_DIR = join(SITE_DIR, 'media', 'hero');
const require = createRequire(import.meta.url);
const VITE_BIN = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const FFMPEG = require('ffmpeg-static');
const { chromium } = require(join(ROOT_DIR, 'node_modules', 'playwright'));

const VIEW = { width: 1600, height: 1000 };
const PORTS = [5170, 5171, 5172, 5173, 5174, 5175, 5176, 5177, 5178, 5179];
const FADE = 0.5; // seconds of crossfade from the last frame back to the first
const HOLD_FIRST = 0.2; // seconds the first frame is held after the fade

// ─── build and pack ──────────────────────────────────────────────────────────

function run(cmd, args, cwd) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
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
    ],
    SITE_DIR
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

// ─── overlay (cursor, ripple, Alt keycap), injected into the top page only ──

const OVERLAY = () => {
  if (window.top !== window) return;
  const install = () => {
    const root = document.createElement('div');
    root.setAttribute('data-recorder-overlay', '');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    root.innerHTML = `
      <style>
        [data-recorder-overlay] * { pointer-events: none; }
        .rec-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px;
          transform-origin: 3px 2px; will-change: transform;
          filter: drop-shadow(0 2px 3px rgba(0,0,0,.28)); transition: scale 120ms ease; }
        .rec-cursor.down { scale: .86; }
        .rec-ripple { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px;
          border-radius: 50%; border: 2.5px solid rgba(232, 160, 32, .95);
          background: rgba(250, 190, 60, .18);
          animation: rec-ripple 480ms cubic-bezier(.2,.7,.3,1) forwards; }
        @keyframes rec-ripple { from { transform: scale(.42); opacity: .9 } to { transform: scale(1); opacity: 0 } }
        .rec-key { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 6px;
          padding: 5px 12px 6px; border-radius: 9px; background: #fff; color: #17181c;
          font: 600 16px/1 ui-sans-serif, "Segoe UI", system-ui, sans-serif; letter-spacing: .01em;
          border: 1px solid #d7d9de; box-shadow: 0 3px 0 #c4c7ce, 0 10px 24px -8px rgba(0,0,0,.35);
          opacity: 0; scale: .8; transition: opacity 160ms ease, scale 200ms cubic-bezier(.3,1.5,.6,1); }
        .rec-key.on { opacity: 1; scale: 1; }
        .rec-key.press { translate: 0 2px; box-shadow: 0 1px 0 #c4c7ce, 0 6px 16px -8px rgba(0,0,0,.35); }
      </style>
      <div class="rec-key">Alt</div>
      <svg class="rec-cursor" viewBox="0 0 26 26"><path d="M3 2 L3 21.5 L8.2 16.6 L11.6 24.2 L15 22.7 L11.7 15.3 L18.8 15.1 Z"
        fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(root);
    const cursor = root.querySelector('.rec-cursor');
    const key = root.querySelector('.rec-key');
    let x = -100;
    let y = -100;
    const place = () => {
      cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
      key.style.transform = `translate(${x + 20}px, ${y + 26}px)`;
    };
    window.__rec = {
      move(nx, ny) {
        x = nx;
        y = ny;
        place();
      },
      down() {
        cursor.classList.add('down');
        const ripple = document.createElement('div');
        ripple.className = 'rec-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        root.insertBefore(ripple, key);
        setTimeout(() => ripple.remove(), 600);
        key.classList.add('press');
      },
      up() {
        cursor.classList.remove('down');
        key.classList.remove('press');
      },
      key(on) {
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
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function actor(page) {
  let cx = VIEW.width * 0.86;
  let cy = VIEW.height * 0.78;
  const overlay = (fn, ...args) => page.evaluate(([f, a]) => window.__rec[f](...a), [fn, args]);

  return {
    async place(x, y) {
      cx = x;
      cy = y;
      await page.mouse.move(x, y);
      await overlay('move', x, y);
    },
    get pos() {
      return { x: cx, y: cy };
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
        await overlay('down');
        await page.mouse.down({ clickCount: i + 1 });
        await sleep(70);
        await page.mouse.up({ clickCount: i + 1 });
        await overlay('up');
        if (i + 1 < count) await sleep(60);
      }
    },
    /** Visual-only press, for controls driven another way (a native select). */
    async tap() {
      await overlay('down');
      await sleep(90);
      await overlay('up');
    },
    async altDown() {
      await overlay('key', true);
      await page.keyboard.down('Alt');
    },
    async altUp() {
      await page.keyboard.up('Alt');
      await overlay('key', false);
    },
    /** Types one character at a time on a wall-clock schedule, so slow renders do not stretch it. */
    async type(text, base = 85, jitter = 25) {
      let due = Date.now();
      for (const ch of text) {
        await page.keyboard.insertText(ch);
        due += base + (Math.random() * 2 - 1) * jitter;
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
  const frames = [];
  let firstWall = null;
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (firstWall === null) firstWall = Date.now();
    frames.push({ ts: metadata.timestamp, data: Buffer.from(data, 'base64') });
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: VIEW.width,
    maxHeight: VIEW.height,
    everyNthFrame: 1,
  });
  // wait for the first frame so chapter times can be measured from it
  while (firstWall === null) await sleep(5);
  return {
    frames,
    /** Seconds of video since the first frame. */
    now: () => (Date.now() - firstWall) / 1000,
    async stop() {
      const end = frames.length ? frames[0].ts + (Date.now() - firstWall) / 1000 : 0;
      await cdp.send('Page.stopScreencast');
      return end;
    },
  };
}

// ─── ffmpeg ──────────────────────────────────────────────────────────────────

function ffmpeg(args) {
  const res = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (res.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed`);
}

async function encode(frames, endTs, work) {
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const name = join(work, `${String(i).padStart(5, '0')}.jpg`).replaceAll('\\', '/');
    await writeFile(name, frames[i].data);
    const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
    list.push(`file '${name}'`, `duration ${Math.max(0.001, next - frames[i].ts).toFixed(6)}`);
  }
  // the concat demuxer ignores the last duration unless the file is repeated
  list.push(list.at(-2));
  const listFile = join(work, 'frames.txt');
  await writeFile(listFile, list.join('\n'));
  const raw = endTs - frames[0].ts;

  // master: VFR frames -> CFR 60, then cross-fade the tail into the first frame for the loop seam
  const first = join(work, '00000.jpg');
  const master = join(work, 'master.mp4');
  const tail = FADE + HOLD_FIRST;
  ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-loop', '1', '-t', String(tail + 0.1), '-i', first,
    '-filter_complex',
    `[0:v]fps=60,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[a];` +
      `[1:v]fps=60,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[b];` +
      `[a][b]xfade=transition=fade:duration=${FADE}:offset=${(raw - FADE).toFixed(3)},trim=duration=${(raw + HOLD_FIRST).toFixed(3)}[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-crf', '10', '-preset', 'veryfast', master,
  ]);
  const duration = raw + HOLD_FIRST;

  const mp4 = join(OUT_DIR, 'hero.mp4');
  const webm = join(OUT_DIR, 'hero.webm');
  ffmpeg([
    '-i', master, '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-crf', '23',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4,
  ]);
  ffmpeg([
    '-i', master, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', '-an', webm,
  ]);
  ffmpeg(['-i', master, '-frames:v', '1', join(OUT_DIR, 'poster.png')]);

  // contact sheet: 12 evenly spaced frames, 400 px wide, tiled 4x3
  const tiles = [];
  for (let i = 0; i < 12; i++) {
    const t = ((duration - 0.05) * i) / 11;
    const tile = join(work, `tile${String(i).padStart(2, '0')}.png`);
    ffmpeg(['-ss', t.toFixed(3), '-i', master, '-frames:v', '1', '-vf', 'scale=400:-2', tile]);
    tiles.push(t);
  }
  ffmpeg([
    '-i', join(work, 'tile%02d.png'),
    '-vf', 'tile=4x3:padding=6:margin=6:color=white', '-frames:v', '1',
    join(OUT_DIR, 'contact.png'),
  ]);
  return { duration, tiles };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  await buildStage();
  await mkdir(OUT_DIR, { recursive: true });
  const { server, port } = await serve(join(STAGE_DIR, 'dist'));
  const origin = `http://127.0.0.1:${port}`;
  console.log(`serving the packed stage on ${origin}`);
  const browser = await chromium.launch();
  const work = await mkdtemp(join(tmpdir(), 'livelocale-hero-'));
  try {
    const context = await browser.newContext({
      viewport: VIEW,
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    });
    await context.addInitScript(OVERLAY);
    const page = await context.newPage();
    await page.goto(`${origin}/livelocale/index.html`);

    // First run: the real welcome tips. Credit a name, then start editing (off camera).
    await page.getByRole('button', { name: 'Start editing' }).waitFor();
    await page.getByLabel(/Your name/).fill('Lina');
    await page.getByRole('button', { name: 'Start editing' }).click();

    const app = () => page.frameLocator('iframe');
    const appFrame = () => page.frames().find((f) => f !== page.mainFrame());
    const waitForApp = async (text) => {
      await app().getByText(text).first().waitFor();
      await appFrame().evaluate(() => document.fonts.ready);
      await sleep(250);
    };
    await waitForApp('Plans that grows with you');
    await page.evaluate(() => document.fonts.ready);

    const me = actor(page);
    const h1 = centre(await app().locator('h1').boundingBox());
    const lede = await app().locator('.lede').boundingBox();
    await me.place(1040, 640);
    await sleep(500);

    const cast = await startScreencast(page);
    const chapters = [];
    const chapter = (title) => chapters.push({ title, start: Number(cast.now().toFixed(2)) });
    const mark = (label) => console.log(`  ${cast.now().toFixed(2)} s  ${label}`);

    // 0-2 s: the Studio on the pricing page, English, with the typo. The cursor drifts in.
    await sleep(400);
    await me.move(900, 520, 700, 0.18);
    await sleep(100);

    // 2-4 s: hold Alt; hover text in the preview and the real outlines follow.
    chapter('Alt+Click the text');
    await appFrame().evaluate(() => window.focus()); // Alt goes to the app, like a real user's
    await me.altDown();
    await sleep(300);
    await me.move(lede.x + lede.width * 0.62, lede.y + lede.height * 0.5, 450);
    await sleep(380);
    await me.move(h1.x + 40, h1.y + 4, 420);
    await sleep(350);

    // 4-7 s: Alt+Click the headline; the editor shows key and value; type the fix; Save.
    mark('headline clicked');
    await me.click();
    await me.altUp();
    const field = page.getByRole('textbox', { name: 'Translation' });
    await page.waitForFunction(() =>
      document.querySelector('textarea')?.value.includes('Plans that grows')
    );
    await sleep(200);
    const caret = await caretAfter(field, 'Plans that grows');
    await me.move(caret.x + 1, caret.y, 500);
    await me.click();
    await sleep(120);
    await page.keyboard.press('Control+Shift+ArrowLeft');
    await sleep(220);
    await me.type('grow', 85);
    await sleep(250);
    const save = centre(await page.getByRole('button', { name: 'Save Changes' }).boundingBox());
    await me.move(save.x, save.y, 480);
    await sleep(60);
    await me.click();
    await sleep(380);

    // 7-10 s: switch the Studio to Arabic; the preview flips right to left.
    chapter('Fix it in every language');
    const select = page.locator('select').first();
    const sel = centre(await select.boundingBox());
    await me.move(sel.x, sel.y, 500);
    await me.tap();
    await select.selectOption('ar');
    await waitForApp('خطط تنمو معك');
    mark('arabic loaded');
    const cta = centre(await app().getByText('Start free trial').boundingBox());
    await me.move(cta.x + 18, cta.y + 4, 480);
    await appFrame().evaluate(() => window.focus());
    await me.altDown();
    await sleep(400);
    await me.click();
    await me.altUp();
    mark('cta clicked');
    await page.waitForFunction(() =>
      document.querySelector('textarea')?.value.includes('Start free trial')
    );
    await sleep(120);
    const box = centre(await field.boundingBox());
    await me.move(box.x + 120, box.y - 20, 380);
    await me.click();
    await page.keyboard.press('Control+A');
    await sleep(160);
    await me.type('ابدأ تجربتك المجانية', 28, 8);
    await sleep(220);
    const save2 = centre(await page.getByRole('button', { name: 'Save Changes' }).boundingBox());
    await me.move(save2.x, save2.y, 420);
    await me.click();
    await sleep(350);

    // 10-13 s: open Send; the real Send dialog with the change link (2 changes).
    chapter('Send it as a pull request');
    const send = centre(
      await page.getByRole('button', { name: /Send to developer/ }).boundingBox()
    );
    await me.move(send.x, send.y, 520);
    await sleep(60);
    await me.click();
    await page.getByRole('dialog').waitFor();
    mark('send dialog open');
    await sleep(250);
    const copy = await page.getByRole('dialog').getByRole('button', { name: 'Copy link' }).boundingBox();
    if (copy) await me.move(copy.x + copy.width / 2, copy.y + copy.height / 2 + 4, 500, 0.06);
    await sleep(700);

    const endTs = await cast.stop();
    const frames = cast.frames;
    console.log(`captured ${frames.length} frames over ${(endTs - frames[0].ts).toFixed(2)} s`);

    if (process.env.HERO_NO_ENCODE) return; // timing runs while tuning the storyboard
    const { duration } = await encode(frames, endTs, work);
    await writeFile(
      join(OUT_DIR, 'chapters.json'),
      `${JSON.stringify({ duration: Number(duration.toFixed(2)), chapters }, null, 2)}\n`
    );
    for (const f of ['hero.mp4', 'hero.webm', 'poster.png', 'contact.png', 'chapters.json']) {
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
