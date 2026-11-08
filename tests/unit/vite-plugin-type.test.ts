// @vitest-environment node
import { it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '../..');

/** Type errors of `source`, compiled with the repo's compiler options from a folder in tests/. */
function typeErrors(source: string): string[] {
  const dir = fs.mkdtempSync(path.join(__dirname, '.type-probe-'));
  try {
    const file = path.join(dir, 'probe.ts');
    fs.writeFileSync(file, source, 'utf-8');
    const config = ts.readConfigFile(path.join(REPO_ROOT, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, REPO_ROOT);
    const program = ts.createProgram([file], { ...options, rootDir: REPO_ROOT, noEmit: true });
    return ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === file.split(path.sep).join('/'))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, os.EOL));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

it(
  "types liveLocaleVite() as Vite's Plugin, not its internal hooks",
  () =>
    expect(
      typeErrors(`
      import type { Plugin } from 'vite';
      import { liveLocaleVite } from '../../../src/server/vite-plugin.js';
      type Equal<A, B> =
        (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
      const exact: Equal<ReturnType<typeof liveLocaleVite>, Plugin> = true;
      export { exact };
    `)
    ).toEqual([]),
  60_000
);
