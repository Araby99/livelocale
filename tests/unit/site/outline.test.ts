// @vitest-environment jsdom
import { markHardcoded } from '../../../site/src/slider/outline';

it('outlines only elements whose own text matches', () => {
  document.body.innerHTML =
    '<div dir="rtl"><button> Start free\n trial </button><p>ابدأ <b>Start free trial now</b></p></div>';
  expect(markHardcoded(document.body, ['Start free trial'])).toBe(1);
  expect(document.querySelector('button')!.classList.contains('is-untranslated')).toBe(true);
  expect(document.querySelector('b')!.classList.contains('is-untranslated')).toBe(false);
});
