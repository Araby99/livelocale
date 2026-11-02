// @vitest-environment node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runSampleCheck } from '../../../site/scripts/hardcoded-report.mjs';
import { readFindings, summaryLine } from '../../../site/src/slider/report';

const CLI = 'dist/codemod/index.js';
const hasBuild = fs.existsSync(CLI);

it('shapes untranslated keys and hardcoded text into outline targets', () => {
  const f = readFindings({
    issues: [
      { kind: 'untranslated', locale: 'ar', key: 'plans.upgrade' },
      { kind: 'hardcoded', text: 'Start free trial' },
      { kind: 'unused', key: 'x' },
    ],
  });
  expect(f).toEqual({ keys: ['plans.upgrade'], texts: ['Start free trial'], count: 2 });
  expect(summaryLine(f)).toBe('✖ 2 strings never translated: found by check --hardcoded');
});

it.skipIf(!hasBuild)('finds exactly the two planted strings in the sample', () => {
  const { report, output } = runSampleCheck({ cli: CLI, sampleDir: 'site/sample' });
  expect(readFindings(report as never)).toEqual({
    keys: ['plans.upgrade'],
    texts: ['Start free trial'],
    count: 2,
  });
  expect(output).toContain('Start free trial');
  expect(output).not.toContain(path.resolve('site/sample'));
});

it.skipIf(!hasBuild)('rejects a run that finds nothing or cannot run', () => {
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
