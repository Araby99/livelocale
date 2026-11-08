// @vitest-environment node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runSampleCheck } from '../../../site/scripts/hardcoded-report.mjs';

const CLI = 'dist/codemod/index.js';
const hasBuild = fs.existsSync(CLI);
// Each test spawns the built CLI, which loads TypeScript for --hardcoded: a few seconds on a busy
// machine. The 5s default timed out once while the full suite ran in parallel.
const CLI_TIMEOUT = { timeout: 20_000 };

it.skipIf(!hasBuild)('finds exactly the two planted strings in the CI sample', CLI_TIMEOUT, () => {
  const { report, output, status } = runSampleCheck({ cli: CLI, sampleDir: 'site/sample' });
  const issues = (report as { issues: Array<{ kind: string; key?: string; text?: string }> })
    .issues;
  expect(issues.map((i) => [i.kind, i.key ?? i.text])).toEqual([
    ['hardcoded', 'Book a demo'],
    ['untranslated', 'hero.note'],
  ]);
  expect(status).toBe(1);
  expect(output).toContain('"Book a demo"');
  expect(output).not.toContain(path.resolve('site/sample'));
});

it.skipIf(!hasBuild)('rejects a run that finds nothing or cannot run', CLI_TIMEOUT, () => {
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-site-'));
  fs.mkdirSync(path.join(clean, 'locales'));
  fs.writeFileSync(path.join(clean, 'locales/en.json'), '{"a":"Hello"}');
  fs.writeFileSync(path.join(clean, 'locales/ar.json'), '{"a":"مرحبا"}');
  fs.writeFileSync(path.join(clean, 'package.json'), '{}');
  fs.writeFileSync(path.join(clean, 'App.tsx'), "export const A = () => <p>{t('a')}</p>;");
  // no typescript resolves from the temp dir → exit 2
  expect(() => runSampleCheck({ cli: path.resolve(CLI), sampleDir: clean })).toThrow(
    'check --hardcoded could not run'
  );
  fs.symlinkSync(path.resolve('node_modules'), path.join(clean, 'node_modules'), 'junction');
  expect(() => runSampleCheck({ cli: path.resolve(CLI), sampleDir: clean })).toThrow(
    'found nothing in the sample'
  );
});
