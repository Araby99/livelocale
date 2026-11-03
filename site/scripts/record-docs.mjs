// Records the docs' screenshots and clips from the real product. One command from the repo root:
//
//   node site/scripts/record-docs.mjs [names…]
//
// With no names it shoots everything in SHOTS and CLIPS (site/scripts/docs/media.mjs); names
// re-shoot only those and keep the rest of the manifest. It needs the built CLI (`npm run build`)
// and both playground installs (`npm ci --prefix playground`, `npm ci --prefix playground-vite`).
//
// The dev shots film the real dev Studio (`livelocale studio --port 3110`) editing the Next.js
// playground (`next dev -p 3100`) or the Vite playground (`vite --port 5180`, picked with the
// Studio's ?app=). The share shots and the clips film the share Studio packed into the Tidewell
// stage site, served on a port in 5170-5179 and browsed as http://tidewell.example (a Chromium
// host-resolver rule). Saves in the dev Studio write the playgrounds' locale files, so those are
// snapshotted first and put back after every capture and when the run ends.
//
// Shots: Chromium at 1440x900, DPR 2, a PNG converted to WebP q82 at 1200 px wide. Clips:
// Playwright's recordVideo at 1280x720, trimmed to the action and encoded to VP9 WebM and H.264
// MP4 (+faststart, no audio), with the last frame as the WebP poster. Every raster gets a
// provenance sidecar (<file>.json); site/media/docs/manifest.json lists sizes for DocShot and
// DocClip. No cursor or overlay is injected: everything on screen is the product.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packStage, serveDir, snapshotFiles } from './capture-lib.mjs';
import { CLIPS, SHOTS, provenance } from './docs/media.mjs';
import { webpSize } from './docs/webp-size.mjs';

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT_DIR = resolve(SITE_DIR, '..');
const OUT_DIR = join(SITE_DIR, 'media', 'docs');
const MANIFEST = join(OUT_DIR, 'manifest.json');
const CHANGE_LINK = join(SITE_DIR, 'scripts', 'docs', 'fixtures', 'change-link.txt');
const CLI = join(ROOT_DIR, 'dist', 'codemod', 'index.js');
const PLAYGROUND = join(ROOT_DIR, 'playground');
const PLAYGROUND_VITE = join(ROOT_DIR, 'playground-vite');

const SHOT_VIEW = { width: 1440, height: 900 };
const SHOT_WIDTH = 1200;
const CLIP_VIEW = { width: 1280, height: 720 };
const NEXT_PORT = 3100;
const VITE_PORT = 5180;
const STUDIO_PORT = 3110;
const STAGE_PORTS = [5170, 5171, 5172, 5173, 5174, 5175, 5176, 5177, 5178, 5179];
// RFC 2606 reserves .example, so this host can never belong to a real company.
const HOST = 'tidewell.example';
const ORIGINS = { next: `http://localhost:${NEXT_PORT}`, vite: `http://localhost:${VITE_PORT}` };

// The share stage is packed with the build identity of the public demo repository's main branch
// (github.com/Araby99/tidewell), as record-hero.mjs packs it, so the change link names it and the
// Send dialog offers Open on GitHub.
const PACK_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GITHUB_'))),
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'Araby99/tidewell',
  GITHUB_REF_TYPE: 'branch',
  GITHUB_REF_NAME: 'main',
  GITHUB_SHA: 'f10ae325b76b19a31df9b3cc1139d24808509579',
};

const PREREQUISITES = [
  { path: CLI, command: 'npm run build' },
  { path: join(ROOT_DIR, 'dist', 'studio', 'index.html'), command: 'npm run build' },
  { path: join(PLAYGROUND, 'node_modules', 'next'), command: 'npm ci --prefix playground' },
  {
    path: join(PLAYGROUND_VITE, 'node_modules', 'vite'),
    command: 'npm ci --prefix playground-vite',
  },
  { path: join(SITE_DIR, 'node_modules', 'ffmpeg-static'), command: 'npm ci --prefix site' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── processes ───────────────────────────────────────────────────────────────

/** Starts a long-running node process and resolves once `url` answers; returns a stopper. */
async function startServer(label, args, cwd, url) {
  const answers = () =>
    fetch(url).then(
      (r) => r.status < 500,
      () => false
    );
  // never film a server this run did not start
  if (await answers()) throw new Error(`${url} is already in use: stop what runs there first`);
  const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const exited = new Promise((r) => child.once('exit', r));
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`${label} exited:\n${log}`);
    if (await answers()) break;
    if (Date.now() > deadline) throw new Error(`${label} did not answer at ${url}:\n${log}`);
    await sleep(500);
  }
  console.log(`${label} is up at ${url}`);
  return async () => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else child.kill('SIGTERM');
    await exited;
  };
}

/** The servers each app needs, started on first use and stopped when the run ends. */
function servers() {
  const stops = [];
  const started = new Map();
  const once = (key, start) => {
    if (!started.has(key)) started.set(key, start());
    return started.get(key);
  };
  const studio = () =>
    once('studio', async () => {
      stops.push(
        await startServer(
          'dev Studio',
          [CLI, 'studio', '--port', String(STUDIO_PORT), '--app', ORIGINS.next],
          PLAYGROUND,
          `http://localhost:${STUDIO_PORT}/`
        )
      );
    });
  return {
    async next() {
      await once('next', async () => {
        const bin = join(PLAYGROUND, 'node_modules', 'next', 'dist', 'bin', 'next');
        stops.push(
          await startServer(
            'next dev',
            [bin, 'dev', '-p', String(NEXT_PORT)],
            PLAYGROUND,
            `${ORIGINS.next}/`
          )
        );
      });
      await studio();
    },
    async vite() {
      await once('vite', async () => {
        const bin = join(PLAYGROUND_VITE, 'node_modules', 'vite', 'bin', 'vite.js');
        stops.push(
          await startServer(
            'vite',
            [bin, '--port', String(VITE_PORT), '--strictPort'],
            PLAYGROUND_VITE,
            `${ORIGINS.vite}/`
          )
        );
      });
      await studio();
    },
    async stopAll() {
      for (const stop of stops.reverse()) await stop();
    },
  };
}

// ─── the Studio ──────────────────────────────────────────────────────────────

/** Settles fonts and paint in the Studio and its preview. */
async function settle(page, ms = 600) {
  await page.evaluate(() => document.fonts.ready);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame?.evaluate(() => document.fonts.ready).catch(() => {});
  await sleep(ms);
}

const app = (page) => page.frameLocator('iframe');
/** The editor's translation field (its id holds in both Studio languages). */
const field = (page) => page.locator('#studio-translation-input');

/** Opens the dev Studio on `which` app and waits until the preview is connected. */
async function openDev(page, which) {
  await page.goto(`http://localhost:${STUDIO_PORT}/?app=${encodeURIComponent(ORIGINS[which])}`);
  await page.locator('[data-testid="connection-status"][data-status="connected"]').waitFor();
  await app(page).locator('h1').waitFor();
  await settle(page);
}

/**
 * Opens the share Studio on Tidewell. `tips: 'start'` credits the name Lina and dismisses the
 * first-run tips, `'keep'` leaves them open; `hash` opens a change link (review mode shows no tips).
 */
async function openShare(page, { tips = 'start', hash = '' } = {}) {
  await page.goto(`http://${HOST}/livelocale/index.html${hash}`);
  await app(page).locator('h1').waitFor();
  if (tips !== 'none') {
    const name = page.locator('#studio-tips-name');
    await name.waitFor();
    if (tips === 'start') {
      await name.fill('Lina');
      await page.getByRole('dialog').getByRole('button').last().click();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
  }
  await settle(page);
}

/** Holds Alt and clicks `target` (a locator inside the preview), as a person would. */
async function altClick(page, target) {
  const box = await target.boundingBox();
  if (!box) throw new Error('nothing to Alt+Click');
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.evaluate(() => window.focus());
  await page.mouse.move(box.x + Math.min(40, box.width / 2), box.y + box.height / 2);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await field(page).waitFor();
}

/** Replaces the editor's text with `text`, typed. */
async function retype(page, text, delay = 0) {
  await field(page).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(text, { delay });
}

async function save(page) {
  await page.getByRole('button', { name: 'Save Changes' }).click();
}

/** Fixes Tidewell's headline typo ("Plans that grows with you") in the share Studio. */
async function fixHeadline(page, delay = 0) {
  await altClick(page, app(page).locator('h1'));
  await page.waitForFunction(() =>
    document.querySelector('textarea')?.value.includes('Plans that grows')
  );
  await retype(page, 'Plans that grow with you', delay);
}

// ─── what each capture does before the camera fires ──────────────────────────

/** Dev edits: the Next.js welcome line in sentence case, the Vite headline named. */
const DEV_FIX = {
  next: { target: 'p', text: 'Welcome back to production' },
  vite: { target: 'h1', text: 'Welcome to the Vite playground' },
};

async function devAltClick(page, which) {
  await openDev(page, which);
  await altClick(page, app(page).locator(DEV_FIX[which].target).first());
  await retype(page, DEV_FIX[which].text);
  await settle(page, 300);
}

async function devSavedFile(page, which) {
  await devAltClick(page, which);
  await save(page);
  await page.getByText('Saved!').waitFor();
  await page.getByRole('button', { name: 'Changes', exact: true }).click();
  await page.getByText('locales/en.json').first().waitFor();
  await page.getByRole('button', { name: 'Show diff' }).click();
  await page.getByText(`"${DEV_FIX[which].text}"`).first().waitFor();
  await settle(page, 400);
}

const SCENES = {
  'next-studio-open': (page) => openDev(page, 'next'),
  'next-alt-click': (page) => devAltClick(page, 'next'),
  'next-saved-file': (page) => devSavedFile(page, 'next'),
  'vite-studio-open': (page) => openDev(page, 'vite'),
  'vite-alt-click': (page) => devAltClick(page, 'vite'),
  'vite-saved-file': (page) => devSavedFile(page, 'vite'),
  'share-open-link': (page) => openShare(page, { tips: 'keep' }),
  async 'share-alt-click'(page) {
    await openShare(page);
    await fixHeadline(page);
    await settle(page, 300);
  },
  async 'share-send-dialog'(page) {
    await openShare(page);
    await fixHeadline(page);
    await save(page);
    await page.getByRole('button', { name: /Send to developer/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const link = (await dialog.getByLabel('Change link').inputValue()).trim();
    if (!link.includes('#lc1.')) throw new Error(`no change link in the Send dialog: ${link}`);
    await mkdir(join(CHANGE_LINK, '..'), { recursive: true });
    await writeFile(CHANGE_LINK, `${link}\n`);
    console.log(`  change link saved to ${relative(ROOT_DIR, CHANGE_LINK).replaceAll('\\', '/')}`);
    await settle(page, 400);
  },
  async 'share-review-mode'(page) {
    const link = (await readFile(CHANGE_LINK, 'utf8')).trim();
    await openShare(page, { tips: 'none', hash: link.slice(link.indexOf('#')) });
    await page.getByText('Plans that grow with you').first().waitFor();
    await settle(page, 600);
  },
  async 'studio-plural'(page) {
    await openDev(page, 'next');
    await page.getByText('cart.items', { exact: true }).click();
    await page.getByText('Plural forms', { exact: true }).waitFor();
    await settle(page, 300);
  },
  async 'studio-placeholder-warning'(page) {
    await openDev(page, 'next');
    await page.getByText('home.greeting', { exact: true }).click();
    await retype(page, 'Hello there!');
    await save(page);
    await page.getByTestId('save-warning').waitFor();
    await settle(page, 300);
  },
  async 'studio-arabic'(page) {
    await openShare(page);
    await page.locator('select').first().selectOption('ar');
    await app(page).getByText('خطط تنمو معك').waitFor();
    await altClick(page, app(page).locator('h1'));
    await settle(page, 400);
  },
  async 'studio-light'(page) {
    await openShare(page);
    await fixHeadline(page);
    await settle(page, 300);
  },
  async 'studio-keyboard'(page) {
    await openShare(page);
    const search = page.getByPlaceholder('Search keys or values...');
    await search.focus();
    await page.keyboard.type('trial');
    // Tab on to the first matching row, then pick it with Enter
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const onRow = await page.evaluate(() =>
        document.activeElement?.textContent?.includes('hero.cta')
      );
      if (onRow) break;
    }
    await page.keyboard.press('Enter');
    await field(page).waitFor();
    await settle(page, 300);
  },
};

/**
 * Each clip: `setup` runs off camera, `act` is what the clip shows. The video is trimmed to `act`.
 */
const TAKES = {
  'alt-click-edit': {
    setup: (page) => openShare(page),
    async act(page) {
      await sleep(700);
      await altClick(page, app(page).locator('h1'));
      await page.waitForFunction(() =>
        document.querySelector('textarea')?.value.includes('Plans that grows')
      );
      await sleep(700);
      await retype(page, 'Plans that grow with you', 45);
      await sleep(500);
      await save(page);
      await sleep(1200);
    },
  },
  'send-link': {
    async setup(page) {
      await openShare(page);
      await fixHeadline(page);
      await save(page);
      await sleep(800);
    },
    async act(page) {
      await sleep(700);
      await page.getByRole('button', { name: /Send to developer/ }).click();
      await page.getByRole('dialog').waitFor();
      await sleep(3200);
    },
  },
  'arabic-switch': {
    setup: (page) => openShare(page),
    async act(page) {
      await sleep(800);
      await page.locator('#studio-language-toggle').click();
      await sleep(1300);
      await page.locator('select').first().selectOption('ar');
      await app(page).getByText('خطط تنمو معك').waitFor();
      await settle(page, 2200);
    },
  },
};

// ─── encoding ────────────────────────────────────────────────────────────────

let FFMPEG;
function ffmpeg(args) {
  const res = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (res.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed`);
}

async function writeSidecar(file, name, what) {
  await writeFile(`${file}.json`, `${JSON.stringify(provenance(name, what), null, 2)}\n`);
}

async function shoot(browser, name, work) {
  const { locale, theme, use } = SHOTS[name];
  const scheme = theme ?? 'dark';
  const context = await browser.newContext({
    viewport: SHOT_VIEW,
    deviceScaleFactor: 2,
    colorScheme: scheme,
    locale: locale ?? 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'no-preference',
  });
  try {
    await allowStudioFraming(context);
    const page = await context.newPage();
    await SCENES[name](page);
    const png = join(work, `${name}.png`);
    await page.screenshot({ path: png });
    const file = `${name}.webp`;
    const out = join(OUT_DIR, file);
    ffmpeg([
      ...['-i', png, '-vf', `scale=${SHOT_WIDTH}:-2:flags=lanczos`],
      ...['-c:v', 'libwebp', '-quality', '82', out],
    ]);
    const size = webpSize(await readFile(out));
    await writeSidecar(
      out,
      name,
      `A screenshot at ${SHOT_VIEW.width}x${SHOT_VIEW.height}, DPR 2, ${scheme} colour scheme, browser locale ${locale ?? 'en-US'}, converted with ffmpeg-static to WebP q82, ${SHOT_WIDTH} px wide. Ships as the docs shot "${name}": ${use}.`
    );
    return { file, ...size };
  } finally {
    await context.close();
  }
}

async function film(browser, name, work) {
  const { use, seconds: limit } = CLIPS[name];
  const dir = join(work, name);
  const context = await browser.newContext({
    viewport: CLIP_VIEW,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'no-preference',
    recordVideo: { dir, size: CLIP_VIEW },
  });
  let raw;
  let from;
  let to;
  try {
    const page = await context.newPage();
    const zero = Date.now();
    await TAKES[name].setup(page);
    from = (Date.now() - zero) / 1000;
    await TAKES[name].act(page);
    to = (Date.now() - zero) / 1000;
    raw = await page.video().path();
  } finally {
    await context.close();
  }
  const seconds = Number(Math.min(to - from, limit).toFixed(2));
  const trim = ['-ss', from.toFixed(3), '-i', raw, '-t', String(seconds), '-an'];
  const webm = `${name}.webm`;
  const mp4 = `${name}.mp4`;
  const poster = `${name}.poster.webp`;
  ffmpeg([
    ...trim,
    ...['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-pix_fmt', 'yuv420p'],
    join(OUT_DIR, webm),
  ]);
  ffmpeg([
    ...trim,
    ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-profile:v', 'high'],
    ...['-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT_DIR, mp4)],
  ]);
  // the last frame: decode the final half second and keep overwriting one image
  ffmpeg([
    ...['-sseof', '-0.5', '-i', join(OUT_DIR, mp4), '-update', '1', '-f', 'image2'],
    ...['-c:v', 'libwebp', '-quality', '82', join(OUT_DIR, poster)],
  ]);
  const size = webpSize(await readFile(join(OUT_DIR, poster)));
  await writeSidecar(
    join(OUT_DIR, poster),
    name,
    `The last frame of the clip ${webm} / ${mp4} (Playwright recordVideo at ${CLIP_VIEW.width}x${CLIP_VIEW.height}, ${seconds} s, encoded with ffmpeg-static), as WebP q82. Ships as the poster of the docs clip "${name}": ${use}.`
  );
  return { webm, mp4, poster, ...size, seconds };
}

/**
 * The Next.js playground's next.config.js lets only a Studio on :3010 frame it (the owner's dev
 * port). The recorder's Studio runs on :3110, so the same header is passed on with that port.
 */
async function allowStudioFraming(context) {
  await context.route(`${ORIGINS.next}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const headers = response.headers();
    const csp = headers['content-security-policy'];
    if (csp) headers['content-security-policy'] = csp.replaceAll(':3010', `:${STUDIO_PORT}`);
    await route.fulfill({ response, headers });
  });
}

// ─── main ────────────────────────────────────────────────────────────────────

async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath ?? e.path, e.name));
}

/** Restores the locale snapshot and removes any locale file a capture created. */
function localeGuard(dirs, restore, before) {
  return async () => {
    await restore();
    for (const dir of dirs) {
      for (const file of await listFiles(dir)) {
        if (!before.has(file)) await rm(file, { force: true });
      }
    }
  };
}

/** Writes the manifest in SHOTS and CLIPS order, dropping names they no longer list. */
async function writeManifest(manifest) {
  const pick = (table, entries) =>
    Object.fromEntries(Object.keys(table).flatMap((n) => (entries[n] ? [[n, entries[n]]] : [])));
  const ordered = { shots: pick(SHOTS, manifest.shots), clips: pick(CLIPS, manifest.clips) };
  await writeFile(MANIFEST, `${JSON.stringify(ordered, null, 2)}\n`);
}

async function main() {
  const missing = PREREQUISITES.filter((p) => !existsSync(p.path));
  if (missing.length) {
    for (const p of missing)
      console.error(`missing ${relative(ROOT_DIR, p.path)}: run ${p.command}`);
    process.exit(1);
  }
  const all = [...Object.keys(SHOTS), ...Object.keys(CLIPS)];
  const asked = process.argv.slice(2);
  const unknown = asked.filter((n) => !all.includes(n));
  if (unknown.length) {
    console.error(`unknown capture ${unknown.join(', ')}; known: ${all.join(', ')}`);
    process.exit(1);
  }
  const names = asked.length ? all.filter((n) => asked.includes(n)) : all;
  const require = createRequire(import.meta.url);
  FFMPEG = require('ffmpeg-static');
  const { chromium } = require(join(ROOT_DIR, 'node_modules', 'playwright'));

  const localeDirs = [join(PLAYGROUND, 'locales'), join(PLAYGROUND_VITE, 'locales')];
  const localeFiles = (await Promise.all(localeDirs.map(listFiles))).flat();
  const restoreLocales = localeGuard(
    localeDirs,
    await snapshotFiles(localeFiles),
    new Set(localeFiles)
  );
  const apps = servers();
  const work = await mkdtemp(join(tmpdir(), 'livelocale-docs-'));
  let stage = null;
  let browser = null;
  try {
    await mkdir(OUT_DIR, { recursive: true });
    const needs = new Set(names.map((n) => (SHOTS[n] ?? CLIPS[n]).app));
    let port = STAGE_PORTS[0];
    if (needs.has('share')) {
      const dist = await packStage({ base: '/', exposeRepo: true, env: PACK_ENV });
      stage = await serveDir(dist, STAGE_PORTS);
      port = stage.port;
      console.log(`serving the packed stage on 127.0.0.1:${port}, browsed as http://${HOST}`);
    }
    if (needs.has('next')) await apps.next();
    if (needs.has('vite')) await apps.vite();
    browser = await chromium.launch({
      args: [
        `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${port}`,
        // the Studio on :3110 frames the dev apps on other localhost ports
        '--disable-features=LocalNetworkAccessChecks',
      ],
    });

    const manifest = JSON.parse(
      await readFile(MANIFEST, 'utf8').catch(() => '{"shots":{},"clips":{}}')
    );
    for (const name of names) {
      try {
        if (SHOTS[name]) manifest.shots[name] = await shoot(browser, name, work);
        else manifest.clips[name] = await film(browser, name, work);
      } finally {
        await restoreLocales();
      }
      const entry = manifest.shots[name] ?? manifest.clips[name];
      const files = [entry.file, entry.webm, entry.mp4, entry.poster].filter(Boolean);
      const sizes = await Promise.all(files.map((f) => stat(join(OUT_DIR, f))));
      const kib = sizes.map((s, i) => `${files[i]} ${(s.size / 1024).toFixed(0)} KiB`).join(', ');
      // written after every capture, so a later failure keeps what is done
      await writeManifest(manifest);
      console.log(
        `${name}: ${entry.width}x${entry.height}${entry.seconds ? `, ${entry.seconds} s` : ''} (${kib})`
      );
    }
  } finally {
    await browser?.close();
    await apps.stopAll();
    stage?.server.close();
    await restoreLocales();
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
