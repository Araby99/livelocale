// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { it, expect } from 'vitest';

const BROWSER_SAFE = [
  'src/core/save-rules.ts',
  'src/core/change-link.ts',
  'src/core/json-path.ts',
  'src/core/placeholders.ts',
  'src/core/validate.ts',
  'src/core/apply-plan.ts',
];

it.each(BROWSER_SAFE)('%s stays browser-safe', (file) => {
  const text = readFileSync(file, 'utf8');
  expect(text).not.toMatch(
    /from ['"](node:)?(fs|path|zlib|buffer|crypto|module|os|child_process)['"]/
  );
  expect(text).not.toMatch(/\bBuffer\b|\bprocess\./);
  expect(text).not.toMatch(/\(\?<[=!]/); // regex lookbehind breaks Safari < 16.4 at parse time
});

/** Every `.ts` and `.tsx` file under `dir`. A plain walk, because Node 18 has no `fs.globSync`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

it('keeps change-link-node out of browser code', () => {
  const files = [
    ...sourceFiles('src/studio'),
    ...sourceFiles('src/client'),
    'src/core/change-link.ts',
  ];
  expect(files).toEqual(expect.arrayContaining(['src/studio/app.tsx', 'src/client/index.ts']));
  expect(files.filter((file) => /change-link-node/.test(readFileSync(file, 'utf8')))).toEqual([]);
});
