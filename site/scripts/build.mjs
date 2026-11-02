// The ordered site build (run: npm run site:build from the repo root). Each step must finish
// before the next; later steps add to site/dist, which is the folder Pages deploys.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBrand } from './sync-brand.mjs';
import { siteConfig } from '../src/lib/site-config.ts';

const SITE_DIR = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const VITE_BIN = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

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
 */
export async function buildSite(env) {
  const { siteUrl } = siteConfig(env);
  await syncBrand();
  await runNode([VITE_BIN, 'build'], { ...env, VITE_SITE_URL: siteUrl });
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
