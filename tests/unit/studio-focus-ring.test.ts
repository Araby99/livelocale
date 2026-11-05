// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { studioFiles } from './helpers/studio-files';

const css = readFileSync('src/studio/index.css', 'utf8');
const AD_HOC =
  /(?<![\w-])(?:focus:outline-(?:hidden|none)|focus:ring-[\w/.[\]#-]+|focus:border-[\w/.[\]#-]+|outline-none|outline-hidden)(?![\w-])/g;

it('draws a 2px ring in the focus colour on :focus-visible', () =>
  expect(css).toMatch(
    /:focus-visible,?[^{]*\{[^}]*outline:\s*2px solid var\(--color-focus\);[^}]*outline-offset:\s*2px;/
  ));

it('draws the ring inset inside scroll containers, where an outside ring is clipped', () =>
  expect(css).toMatch(/\.overflow-y-auto :focus-visible[^{]*\{[^}]*outline-offset:\s*-2px;/));

// Dark mode's focus colour is the amber fill itself, so an inset ring on an amber button would vanish.
it('draws the inset ring in the on-fill ink on amber-filled controls', () => {
  expect(css).toMatch(
    /\.overflow-y-auto :is\(\.bg-accent, \.bg-warning-solid\):focus-visible[^{]*\{[^}]*outline-color:\s*var\(--color-on-accent\);/
  );
});

// A file picker styled as a button is a label around a visually hidden input, which clips its ring.
it('rings the label of a visually hidden input', () => {
  expect(css).toMatch(
    /label:has\(> \.sr-only:focus-visible\)[^{]*\{[^}]*outline:\s*2px solid var\(--color-focus\);/
  );
  expect(css).toMatch(
    /\.overflow-y-auto label:has\(> \.sr-only:focus-visible\)[^{]*\{[^}]*outline-offset:\s*-2px;/
  );
});

it('leaves no ad-hoc focus classes in Studio components', () => {
  const hits = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(AD_HOC)].map((m) => `${f}: ${m[0]}`)
  );
  expect(hits).toEqual([]);
});

it('draws the ring inset inside every scrolling overflow utility', () => {
  for (const u of [
    'overflow-y-auto',
    'overflow-auto',
    'overflow-x-auto',
    'overflow-scroll',
    'overflow-x-scroll',
    'overflow-y-scroll',
  ])
    expect(css).toMatch(new RegExp(`\\.${u} :focus-visible[^{]*\\{[^}]*outline-offset:\\s*-2px;`));
});

// An overflow-hidden box clips an outside ring too, but the app shell is one, so it cannot take the
// inset rule. Each one is either reviewed (its controls sit at least 4px inside its edge, or it holds
// none) or pads itself with `p-1 -m-1`, which gives the ring room without moving anything.
const REVIEWED_OVERFLOW_HIDDEN: Record<string, number> = {
  'app.tsx': 2, // app shells: every control sits inside the padded layout or the px-2 phone bars
  'StudioLayout.tsx': 1, // p-2 or p-6 around its children
  'EditorPanel.tsx': 1, // rounded panel: px-6 header, p-4 rows, scroll body is inset
  'KeysDirectory.tsx': 1, // same panel shape
  'ReviewPanel.tsx': 1, // same panel shape
  'IframeViewer.tsx': 1, // px-6 top bar, then the iframe
  'Header.tsx': 1, // the coverage bar, which holds no control
};

it('gives a focus ring room in every overflow-hidden box', () => {
  const unreviewed: string[] = [];
  for (const f of studioFiles('src/studio', /\.tsx$/)) {
    const name = f.split(/[\\/]/).pop()!;
    const boxes = [
      ...readFileSync(f, 'utf8').matchAll(/className=[{`"][^\n]*overflow-hidden[^\n]*/g),
    ]
      .map((m) => m[0])
      .filter((c) => !/(?<![\w-])p-1 -m-1(?![\w-])/.test(c));
    if (boxes.length !== (REVIEWED_OVERFLOW_HIDDEN[name] ?? 0))
      unreviewed.push(`${f}: ${boxes.length} unpadded overflow-hidden box(es)`);
  }
  expect(unreviewed).toEqual([]);
});
