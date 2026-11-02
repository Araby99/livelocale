// Runs `livelocale check --hardcoded` on the CI sample (site/sample, a cut of the Tidewell pricing
// hero) and writes its true output to site/src/ci/check-output.json, so the developer story shows
// what the real CLI prints. The build fails when the run finds nothing or cannot run, instead of
// shipping an excerpt the tool never wrote.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_DIR = fileURLToPath(new URL('../..', import.meta.url));
export const OUT_FILE = fileURLToPath(new URL('../src/ci/check-output.json', import.meta.url));

/** Runs `node <cli> check <sampleDir> --hardcoded <extra>`, returning its exit code and stdout. */
function check(cli, sampleDir, extra) {
  const run = spawnSync(process.execPath, [cli, 'check', sampleDir, '--hardcoded', ...extra], {
    encoding: 'utf8',
  });
  if (run.error) throw run.error;
  return run;
}

/**
 * Runs the check twice: with --json to prove it found something, without for the human text the
 * page shows. Exit code 1 (findings) is the only success: 0 means the sample found nothing, 2 a
 * setup problem.
 */
export function runSampleCheck({ cli, sampleDir }) {
  const json = check(cli, sampleDir, ['--json']);
  if (json.status === 0) throw new Error('check --hardcoded found nothing in the sample');
  let report;
  try {
    report = JSON.parse(json.stdout);
  } catch {
    throw new Error(`check --hardcoded failed (exit ${json.status}): ${json.stderr.trim()}`);
  }
  if (json.status === 2) {
    throw new Error(`check --hardcoded could not run: ${(report.setupProblems ?? []).join('; ')}`);
  }
  if (json.status !== 1) throw new Error(`check --hardcoded exited with ${json.status}`);

  const text = check(cli, sampleDir, []);
  if (text.status !== 1) throw new Error(`check --hardcoded exited with ${text.status} on rerun`);
  // The header names the absolute sample folder, which differs per machine and leaks local paths.
  const output = text.stdout.split(resolve(sampleDir)).join('').replace(/\\/g, '/');
  return { report, output, status: text.status };
}

/** Checks site/sample with the built CLI and writes `{ output, status }` for the page. */
export function writeSampleReport() {
  const { report, output, status } = runSampleCheck({
    cli: resolve(REPO_DIR, 'dist/codemod/index.js'),
    sampleDir: resolve(REPO_DIR, 'site/sample'),
  });
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify({ output, status }, null, 2)}\n`);
  console.log(`site/src/ci/check-output.json: ${report.issues.length} findings, exit ${status}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    writeSampleReport();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
