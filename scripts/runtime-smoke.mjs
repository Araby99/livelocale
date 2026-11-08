// Proves the BUILT package runs on the Node version that runs this script (CI: Node 18, the
// engines floor). Dev tooling may need a newer Node, so CI builds first, then switches Node and
// runs only this. Run: node scripts/runtime-smoke.mjs (after npm run build).
//
// The package is copied into a sandbox outside the repository, so only its runtime code is
// reachable: no devDependencies. The one entry that imports a peer (livelocale/react imports
// react) gets the repository's react linked in, as a consumer would install it.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const ENTRIES = ['.', './client', './server', './react', './vite'];
/** Peers an entry imports at run time, linked into the sandbox from the repository. */
const RUNTIME_PEERS = ['react'];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-smoke-'));
try {
  const pkgDir = path.join(sandbox, 'node_modules', 'livelocale');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(pkgDir, 'package.json'));
  fs.cpSync(path.join(ROOT, 'dist'), path.join(pkgDir, 'dist'), { recursive: true });
  for (const peer of RUNTIME_PEERS) {
    const from = path.join(ROOT, 'node_modules', peer);
    if (fs.existsSync(from)) {
      fs.symlinkSync(from, path.join(sandbox, 'node_modules', peer), 'junction');
    }
  }
  const cli = path.join(pkgDir, 'dist', 'codemod', 'index.js');
  const run = (args, cwd = sandbox) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: '' },
    });

  console.log(`Node ${process.version}, livelocale ${pkg.version}`);

  const version = run(['--version']);
  check('livelocale --version', version.status === 0 && version.stdout.trim() === pkg.version);
  const help = run(['--help']);
  check('livelocale --help', help.status === 0 && help.stdout.includes('Usage:'));
  const typo = run(['check', '--strictt']);
  check(
    'check --strictt is a usage error',
    typo.status === 2 && typo.stderr.includes('Did you mean --strict?'),
    `exit ${typo.status}`
  );

  // A clean project, the same project with a missing key, and one without locales.
  const project = path.join(sandbox, 'project');
  fs.mkdirSync(path.join(project, 'locales'), { recursive: true });
  fs.writeFileSync(path.join(project, 'locales', 'en.json'), '{"hello":"Hi"}');
  fs.writeFileSync(path.join(project, 'locales', 'ar.json'), '{"hello":"مرحبا"}');
  const clean = run(['check', '--no-unused'], project);
  check('check on clean locales exits 0', clean.status === 0, `exit ${clean.status}`);
  fs.writeFileSync(path.join(project, 'locales', 'ar.json'), '{}');
  const broken = run(['check', '--no-unused', '--json'], project);
  check('check on a missing key exits 1', broken.status === 1, `exit ${broken.status}`);
  const missing = run(['check', '--locales', 'nope', '--json'], project);
  let missingReport = {};
  try {
    missingReport = JSON.parse(missing.stdout);
  } catch {}
  check(
    'check without a locales folder exits 2 with a JSON error',
    missing.status === 2 && typeof missingReport.error === 'string',
    `exit ${missing.status}`
  );

  // The repository's own demo locales: the check must run (0 or 1), never fail to start.
  for (const demo of ['playground', 'playground-vite']) {
    const r = run(['check', '--dir', path.join(ROOT, demo)]);
    check(`check on ${demo}/locales runs`, r.status === 0 || r.status === 1, `exit ${r.status}`);
  }

  // Every entry point, as ESM import and as CJS require, resolved by package name.
  for (const entry of ENTRIES) {
    const specifier = entry === '.' ? 'livelocale' : `livelocale/${entry.slice(2)}`;
    const esm = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(specifier)}); if (!Object.keys(m).length) process.exit(3);`,
      ],
      { cwd: sandbox, encoding: 'utf8' }
    );
    check(`import ${specifier}`, esm.status === 0, esm.stderr.trim().split('\n')[0]);
    const cjs = spawnSync(
      process.execPath,
      [
        '-e',
        `const m = require(${JSON.stringify(specifier)}); if (!Object.keys(m).length) process.exit(3);`,
      ],
      { cwd: sandbox, encoding: 'utf8' }
    );
    check(`require ${specifier}`, cjs.status === 0, cjs.stderr.trim().split('\n')[0]);
  }
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} runtime check(s) failed on Node ${process.version}.`);
  process.exit(1);
}
console.log(`\nThe built package runs on Node ${process.version}.`);
