// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

/** Palette classes, arbitrary colour classes, hex literals and colour functions. */
const FIXED_COLOUR = new RegExp(
  [
    String.raw`\b[a-z-]+-(?:${PALETTE})-\d{2,3}\b`,
    String.raw`-\[#[0-9a-fA-F]{3,8}\]`,
    String.raw`#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b`,
    String.raw`\b(?:rgba?|hsla?|oklch)\(`,
  ].join('|'),
  'g'
);

/** Every fixed colour in `source`, in source order. */
function fixedColours(source: string): string[] {
  return [...source.matchAll(FIXED_COLOUR)].map((m) => m[0]);
}

/** Studio files already moved to the brand tokens; Tasks 13–14 extend the list. */
const MIGRATED_FILES = [
  'src/studio/app.tsx',
  ...[
    'Header',
    'StudioLayout',
    'IframeViewer',
    'KeysDirectory',
    'EmptySelection',
    'SetupProblems',
    'EditorPanel',
    'TranslationEditor',
    'PluralEditor',
    'LocaleManager',
    'LocaleRow',
    'LocalePicker',
  ].map((c) => `src/studio/features/dashboard/components/${c}.tsx`),
];

it('uses brand tokens instead of fixed colours', () => {
  expect(
    fixedColours(
      '<p className="bg-slate-900 text-[#fff] hover:bg-raised" style={{ color: "#ff00aa" }}>'
    )
  ).toEqual(['bg-slate-900', '-[#fff]', '#ff00aa']);
  const fixed = MIGRATED_FILES.flatMap((f) =>
    fixedColours(readFileSync(f, 'utf8')).map((m) => `${f}: ${m}`)
  );
  expect(fixed).toEqual([]);
});
