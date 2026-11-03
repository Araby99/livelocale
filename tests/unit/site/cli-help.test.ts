// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { parseHelp } from '../../../site/scripts/docs/cli-help.mjs';

const help = spawnSync(process.execPath, ['dist/codemod/index.js', '--help'], {
  encoding: 'utf8',
}).stdout;

it('reads every command and its flags from the real help', () => {
  const cli = parseHelp(help);
  expect(Object.keys(cli)).toEqual([
    'migrate',
    'init',
    'studio',
    'doctor',
    'check',
    'pack',
    'build',
    'apply',
  ]);
  expect(cli.check).toEqual([
    '--dir',
    '--locales',
    '--source',
    '--no-unused',
    '--strict',
    '--hardcoded',
    '--allow',
    '--json',
  ]);
  expect(cli.build).toEqual(['--preview', '--out']);
  expect(cli.init).toContain('--branches');
  expect(Object.values(cli).flat()).not.toContain('--help');
});
