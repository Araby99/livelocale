// tests/unit/site/hero-model.test.ts
// @vitest-environment node
import {
  MISTAKES,
  applyEdit,
  isFixed,
  progress,
  wordDiff,
  leftLabel,
  normalizeFix,
} from '../../../site/src/hero/model';

it('plants the three mistakes from the copy', () =>
  expect(MISTAKES.map((m) => [m.key, m.wrong, m.right])).toEqual([
    ['hero.title', 'colecting', 'collecting'],
    ['hero.lede', 'rite', 'right'],
    ['hero.ci', 'traducido', 'translated'],
  ]));

it('counts a fix typed with extra spaces or another case, not another word', () => {
  let edits = applyEdit([], 'hero.title', '  stop   COLLECTING screenshots. ');
  expect(isFixed(edits, 'hero.title')).toBe(true);
  edits = applyEdit(edits, 'hero.lede', 'Anyone on your team fixes text write on the site.');
  expect(isFixed(edits, 'hero.lede')).toBe(false);
  expect(edits).toHaveLength(2);
  expect(progress(edits)).toEqual({ fixed: 1, total: 3, done: false, left: 2 });
  expect(normalizeFix('It’s  “done”')).toBe('it\'s "done"');
});

it('keeps one edit per key and drops an edit back to the original', () => {
  let edits = applyEdit([], 'hero.ci', 'x');
  edits = applyEdit(edits, 'hero.title', 'Stop collecting screenshots.');
  edits = applyEdit(
    edits,
    'hero.ci',
    'You get a pull request. CI catches what was never translated.'
  );
  expect(edits.map((e) => e.key)).toEqual(['hero.ci', 'hero.title']);
  expect(edits[0].from).toBe('You get a pull request. CI catches what was never traducido.');
  expect(applyEdit(edits, 'hero.title', 'Stop colecting screenshots.').map((e) => e.key)).toEqual([
    'hero.ci',
  ]);
});

it('finishes when all three are fixed', () => {
  const edits = MISTAKES.reduce(
    (acc, m) => applyEdit(acc, m.key, m.fixed),
    [] as ReturnType<typeof applyEdit>
  );
  expect(progress(edits)).toEqual({ fixed: 3, total: 3, done: true, left: 0 });
});

it('shows only the changed words', () =>
  expect(
    wordDiff('Anyone fixes text rite on the site.', 'Anyone fixes text right on the site.')
  ).toEqual({ removed: 'rite', added: 'right' }));

it('labels what is left', () =>
  expect([3, 1, 0].map(leftLabel)).toEqual([
    '3 mistakes left on this page',
    '1 mistake left on this page',
    'All fixed',
  ]));
