// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { studioFiles } from './helpers/studio-files';

const css = readFileSync('src/studio/index.css', 'utf8');
const AD_HOC =
  /(?<![\w-])(?:focus:outline-(?:hidden|none)|focus:ring-[\w/.[\]#-]+|focus:border-[\w/.[\]#-]+|outline-none|outline-hidden)(?![\w-])/g;

it('draws a 2px ring in the focus colour on :focus-visible', () =>
  expect(css).toMatch(
    /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\);[^}]*outline-offset:\s*2px;/
  ));

it('draws the ring inset inside scroll containers, where an outside ring is clipped', () =>
  expect(css).toMatch(/\.overflow-y-auto :focus-visible[^{]*\{[^}]*outline-offset:\s*-2px;/));

it('leaves no ad-hoc focus classes in Studio components', () => {
  const hits = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(AD_HOC)].map((m) => `${f}: ${m[0]}`)
  );
  expect(hits).toEqual([]);
});
