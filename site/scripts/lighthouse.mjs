// The mobile Lighthouse gate over the built site (site/dist): serves it under the /livelocale/
// base as Pages does, runs Lighthouse three times on each of LH_PATHS (the landing page, the docs
// front door and the heaviest getting-started page) with Lighthouse's default mobile emulation and
// simulated throttling, prints every run and the median per path, and exits 1 when a path's
// median performance or accessibility is under 0.9.
// Run after `npm run site:build`: npm run lighthouse --prefix site
//
// lighthouse and chrome-launcher need Node >= 22.19, so they are imported inside the main branch
// only: the unit test imports this module on Node 20.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The pages the gate measures, relative to the base. */
export const LH_PATHS = ['', 'docs/', 'docs/start/nextjs.html'];

const ROOT_DIR = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 4174;
const BASE = '/livelocale/';
const ORIGIN = `http://localhost:${PORT}${BASE}`;
const RUNS = 3;
const FLOOR = 0.9;
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const GATED = ['performance', 'accessibility'];
// Lighthouse 13 has no largest-contentful-paint-element audit: the LCP element is a node item in
// lcp-breakdown-insight. Both are carried, so the selector is found on either version.
const LCP_ELEMENT_AUDITS = ['largest-contentful-paint-element', 'lcp-breakdown-insight'];
const LCP_AUDITS = ['largest-contentful-paint', ...LCP_ELEMENT_AUDITS];

/** One failure line per category whose score is null or under `min`, e.g. `performance 0.84 < 0.9`. */
export function assertScores(lhr, min) {
  return Object.entries(lhr.categories)
    .filter(([, { score }]) => score === null || score < min)
    .map(([name, { score }]) => `${name} ${score} < ${min}`);
}

const rank = (score) => score ?? -Infinity;
/** The middle index of `n` sorted values (the lower middle when `n` is even). */
const middle = (n) => Math.floor((n - 1) / 2);

/**
 * Per category, the median score of the runs (a null score sorts lowest), with the LCP audits of
 * the run whose performance score is the median.
 */
export function medianLhr(runs) {
  const names = [...new Set(runs.flatMap((run) => Object.keys(run.categories)))];
  const categories = Object.fromEntries(
    names.map((name) => {
      const scores = runs.map((run) => run.categories[name]?.score ?? null);
      scores.sort((a, b) => rank(a) - rank(b));
      return [name, { score: scores[middle(scores.length)] }];
    })
  );
  const byPerformance = [...runs].sort(
    (a, b) =>
      rank(a.categories.performance?.score ?? null) - rank(b.categories.performance?.score ?? null)
  );
  const audits = byPerformance[middle(byPerformance.length)]?.audits ?? {};
  const lcp = Object.fromEntries(
    LCP_AUDITS.filter((id) => audits[id]).map((id) => [id, audits[id]])
  );
  return { categories, audits: lcp };
}

/** The first node item's selector anywhere in an audit's details (the LCP element's CSS selector). */
function findSelector(details) {
  if (!details || typeof details !== 'object') return undefined;
  if (details.type === 'node' && typeof details.selector === 'string') return details.selector;
  if (typeof details.node?.selector === 'string') return details.node.selector;
  for (const value of Object.values(details)) {
    const found = findSelector(value);
    if (found) return found;
  }
  return undefined;
}

function describe(lhr) {
  const scores = CATEGORIES.map((name) => `${name} ${lhr.categories[name]?.score ?? null}`);
  const lcp = lhr.audits?.['largest-contentful-paint']?.numericValue;
  const element = LCP_ELEMENT_AUDITS.map((id) => findSelector(lhr.audits?.[id]?.details)).find(
    Boolean
  );
  return `${scores.join('  ')}  LCP ${lcp === undefined ? '?' : Math.round(lcp)} ms  ${element ?? '(no LCP element)'}`;
}

async function answers(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, server, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`the site server exited (${server.exitCode})`);
    if (await answers(url)) return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`${url} did not answer within ${timeoutMs} ms`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (await answers(ORIGIN)) {
    console.error(`something already answers on ${ORIGIN}; stop it and run again`);
    process.exit(1);
  }
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  const require = createRequire(import.meta.url);
  const { chromium } = require(join(ROOT_DIR, 'node_modules', 'playwright'));

  const server = spawn(
    process.execPath,
    ['tests/site/fixtures/serve.mjs', 'site/dist', String(PORT), BASE],
    { cwd: ROOT_DIR, stdio: ['ignore', 'ignore', 'inherit'] }
  );
  const failures = [];
  try {
    await waitFor(ORIGIN, server);
    for (const path of LH_PATHS) {
      const url = ORIGIN + path;
      const runs = [];
      for (let i = 1; i <= RUNS; i++) {
        const chrome = await chromeLauncher.launch({
          chromePath: chromium.executablePath(),
          chromeFlags: ['--headless=new', '--no-sandbox'],
        });
        try {
          const result = await lighthouse(url, {
            port: chrome.port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: CATEGORIES,
          });
          if (!result) throw new Error(`Lighthouse returned no result for ${url}`);
          runs.push(result.lhr);
          console.log(`${url} run ${i}: ${describe(result.lhr)}`);
        } finally {
          await chrome.kill();
        }
      }
      const median = medianLhr(runs);
      console.log(`${url} median: ${describe(median)}`);
      const gated = {
        categories: Object.fromEntries(
          GATED.map((name) => [name, median.categories[name] ?? { score: null }])
        ),
      };
      for (const line of assertScores(gated, FLOOR)) failures.push(`${url}: ${line}`);
    }
  } finally {
    server.kill();
  }
  if (failures.length) {
    console.error(`Lighthouse gate failed:\n${failures.map((line) => `  ${line}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Lighthouse gate passed');
}
