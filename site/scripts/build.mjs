// The ordered site build (run: npm run site:build from the repo root). Each step must finish
// before the next; later steps add to site/dist, which is the folder Pages deploys.
import { spawn } from 'node:child_process';
import { cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBrand } from './sync-brand.mjs';
import { writeSampleReport } from './hardcoded-report.mjs';
import { siteConfig } from '../src/lib/site-config.ts';

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const VITE_BIN = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const VITEPRESS_BIN = join(
  dirname(require.resolve('vitepress/package.json')),
  'bin',
  'vitepress.js'
);

/** Runs `node <args>` in site/ with env, rejecting when it exits non-zero. */
function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: SITE_DIR, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`node ${args.join(' ')} exited with ${code}`))
    );
  });
}

/**
 * Builds the whole site into site/dist. SITE_URL in env sets the base (see site-config.ts); its
 * normalised form reaches index.html as %VITE_SITE_URL%, so the share tags carry absolute URLs.
 * The CI excerpt's `check --hardcoded` report runs first (it needs the built CLI in the root dist).
 * Next, the live demo is built: Tidewell, the same stage site the hero video is filmed on, with its
 * two planted mistakes, packed with the share Studio under <base>demo/ (no --expose-repo, so the
 * Studio offers no GitHub action) and copied to site/dist/demo/. Last, VitePress builds the docs
 * into site/dist/docs/ under <base>docs/ (its config reads SITE_URL from env).
 */
export async function buildSite(env) {
  const { siteUrl, base } = siteConfig(env);
  writeSampleReport();
  await syncBrand();
  await runNode([VITE_BIN, 'build'], { ...env, VITE_SITE_URL: siteUrl });
  // --base is passed through node, so Git Bash never rewrites the path.
  await runNode(
    [VITE_BIN, 'build', '--config', 'stage/vite.config.ts', '--base', `${base}demo/`],
    env
  );
  await runNode(
    [
      '../dist/codemod/index.js',
      'pack',
      'dist',
      '--dir',
      'stage',
      '--locales',
      'locales',
      '--source',
      'en',
      '--base',
      `${base}demo/`,
    ],
    env
  );
  await cp(join(SITE_DIR, 'stage', 'dist'), join(SITE_DIR, 'dist', 'demo'), { recursive: true });
  await runNode([VITEPRESS_BIN, 'build', 'docs'], env);
  console.log('site/dist complete');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await buildSite(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
