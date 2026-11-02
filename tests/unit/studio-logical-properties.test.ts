// @vitest-environment node
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { it, expect } from 'vitest';
import { classLiterals } from './helpers/class-literals';
import { studioFiles } from './helpers/studio-files';

/** Left/right utilities that do not mirror; their start/end forms do. */
const PHYSICAL =
  /(?<![\w-])-?(?:ml|mr|pl|pr|left|right|border-l|border-r|text-left|text-right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|scroll-ml|scroll-mr)(?:-[\w./[\]#%]+)?(?![\w-])/g;

it('collects class strings from ternaries, calls and class constants', () =>
  expect(
    classLiterals(
      ts,
      "const rowClass = 'pl-2';\n<p className={on ? 'ml-1' : `mr-${n} x`} />",
      'x.tsx'
    ).map((l) => l.text)
  ).toEqual(['pl-2', 'ml-1', 'mr-', ' x']));

it('uses start/end utilities instead of left/right ones', () => {
  const found = studioFiles('src/studio').flatMap((file) =>
    classLiterals(ts, readFileSync(file, 'utf8'), file).flatMap((l) =>
      [...l.text.matchAll(PHYSICAL)].map((p) => `${file}:${l.line}: ${p[0]}`)
    )
  );
  expect(found).toEqual([]);
});
