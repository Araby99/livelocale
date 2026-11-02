// @vitest-environment node
import {
  MARKER,
  injectCheckExcerpt,
  renderCheckExcerpt,
  renderLine,
} from '../../../site/scripts/check-excerpt.mjs';

const OUTPUT = [
  '',
  '🔎 LiveLocale check — ',
  '🌐 Locales: ar, en (source: en) · 4 key(s) referenced in code',
  '--------------------------------------------------',
  '✖ Hardcoded text not passed through translation (1)',
  '   PricingHero.tsx',
  '      13:23  "Book a demo"',
  '   Per file: PricingHero.tsx 1',
  '⚠ Translations identical to the source locale (1)',
  '   [ar] hero.note — Same text as en.',
  '--------------------------------------------------',
  '❌ 1 problem(s), 1 warning(s).',
  '',
].join('\n');

it('keeps the CLI lines and drops only the run header and the rules', () => {
  const html = renderCheckExcerpt({ output: OUTPUT, status: 1 });
  const text = html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"');
  expect(text.split('\n')).toEqual([
    '$ npx livelocale check --hardcoded',
    '✖ Hardcoded text not passed through translation (1)',
    '   PricingHero.tsx',
    '      13:23  "Book a demo"',
    '   Per file: PricingHero.tsx 1',
    '⚠ Translations identical to the source locale (1)',
    '   [ar] hero.note — Same text as en.',
    '❌ 1 problem(s), 1 warning(s).',
    '# exit 1',
  ]);
});

it('gives each part its one-job colour', () => {
  expect(renderLine('✖ Hardcoded')).toBe('<span class="c-fail">✖ Hardcoded</span>');
  expect(renderLine('      13:23  "Book a demo"')).toBe(
    '      <span class="c-loc">13:23</span>  <span class="c-hardcoded">&quot;Book a demo&quot;</span>'
  );
  expect(renderLine('   [ar] hero.note — Same text as en.')).toBe(
    '   <span class="c-locale">[ar]</span> <span class="c-key">hero.note</span><span class="c-comment"> — Same text as en.</span>'
  );
  expect(renderLine('   PricingHero.tsx')).toBe('   <span class="c-file">PricingHero.tsx</span>');
  expect(renderLine('⚠ Same')).toBe(
    '<span class="c-warn-glyph">⚠</span> <span class="c-warn">Same</span>'
  );
  expect(renderLine('<b>')).toBe('<span class="c-comment">&lt;b&gt;</span>');
});

it('refuses an empty run and a page without the marker', () => {
  expect(() => renderCheckExcerpt({ output: '🔎 x\n-----------\n', status: 1 })).toThrow(
    'printed nothing'
  );
  expect(() => injectCheckExcerpt('<pre></pre>', { output: OUTPUT, status: 1 })).toThrow(
    'marker missing'
  );
  expect(injectCheckExcerpt(`<pre>${MARKER}</pre>`, { output: OUTPUT, status: 1 })).toContain(
    'c-hardcoded'
  );
});
