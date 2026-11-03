// Helpers the docs recorder (record-docs.mjs) shares: running a command, serving a folder,
// building and packing the Tidewell stage site, and snapshotting files it will touch so they can
// be put back byte for byte.
import { spawn } from 'node:child_process';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const ROOT_DIR = resolve(SITE_DIR, '..');
const require = createRequire(import.meta.url);
const VITE_BIN = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

/** Runs `cmd args` in `cwd`, inheriting stdio; rejects when it exits non-zero. */
export function run(cmd, args, cwd, env = process.env) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, env, stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))
    );
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Serves `root` on 127.0.0.1 at the first free port of `ports` (a path ending in / is its index). */
export function serveDir(root, ports) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(join(base, path));
    const info = file.startsWith(base + sep) ? await stat(file).catch(() => null) : null;
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
      if (i >= ports.length) return fail(new Error(`ports ${ports.join(', ')} are all in use`));
      server.once('error', () => tryPort(i + 1));
      server.listen(ports[i], '127.0.0.1', () => ok({ server, port: ports[i] }));
    };
    tryPort(0);
  });
}

/**
 * Builds the Tidewell stage site (site/stage) under `base` and packs the share Studio into it
 * with the built CLI, as record-hero.mjs does. `exposeRepo` adds --expose-repo, so the Send dialog
 * offers "Open on GitHub"; `env` is the pack's environment (its build identity). Returns the
 * packed dist folder.
 */
export async function packStage({ base, exposeRepo, env = process.env }) {
  // Spawned from node, so Git Bash never rewrites the `/` base into a Windows path.
  await run(
    process.execPath,
    [VITE_BIN, 'build', '--config', 'stage/vite.config.ts', '--base', base],
    SITE_DIR
  );
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
      base,
      ...(exposeRepo ? ['--expose-repo'] : []),
    ],
    SITE_DIR,
    env
  );
  return join(SITE_DIR, 'stage', 'dist');
}

/**
 * Reads every file in `paths` now and returns a function that puts them back: each file that
 * existed is rewritten byte for byte, each that did not is removed.
 */
export async function snapshotFiles(paths) {
  const saved = await Promise.all(
    paths.map(async (path) => ({ path, bytes: await readFile(path).catch(() => null) }))
  );
  return async () => {
    for (const { path, bytes } of saved) {
      if (bytes === null) await rm(path, { force: true });
      else await writeFile(path, bytes);
    }
  };
}
