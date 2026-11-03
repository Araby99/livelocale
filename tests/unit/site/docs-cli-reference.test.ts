// @vitest-environment node
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { parseHelp } from '../../../site/scripts/docs/cli-help.mjs';

const DIR = 'site/docs/reference/cli';
const cli = parseHelp(
  spawnSync(process.execPath, ['dist/codemod/index.js', '--help'], { encoding: 'utf8' }).stdout
);

it('documents every command and flag the CLI prints', () => {
  const missing: string[] = [];
  for (const [command, flags] of Object.entries(cli)) {
    const file = `${DIR}/${command}.md`;
    if (!fs.existsSync(file)) {
      missing.push(command);
      continue;
    }
    const md = fs.readFileSync(file, 'utf8');
    for (const flag of flags)
      if (!md.includes(`### \`${flag}\``)) missing.push(`${command} ${flag}`);
  }
  expect(missing).toEqual([]);
});

it('documents no flag the CLI does not have', () => {
  const extra: string[] = [];
  for (const [command, flags] of Object.entries(cli)) {
    const file = `${DIR}/${command}.md`;
    if (!fs.existsSync(file)) continue;
    const md = fs.readFileSync(file, 'utf8');
    for (const [, flag] of md.matchAll(/^### `(--[^`\s]+)`/gm))
      if (!flags.includes(flag!)) extra.push(`${command} ${flag}`);
  }
  expect(extra).toEqual([]);
});
