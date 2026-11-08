// @vitest-environment node
import * as fs from 'node:fs';
import {
  PHONE_QUERY,
  chapterAt,
  chapterProgress,
  pickCut,
  readChapters,
  samePlace,
} from '../../../site/src/demo-video';
import { doorFromHash } from '../../../site/src/doors';

type Recorded = { duration: number; chapters: Array<{ title: string; start: number }> };
const read = (file: string) =>
  JSON.parse(fs.readFileSync(`site/media/hero/${file}`, 'utf8')) as Recorded;
const recorded = read('chapters.json');
const phone = read('chapters-phone.json');

/** The chips as the HTML has them: each one's wide and phone start and title. */
function chips() {
  const html = fs.readFileSync('site/index.html', 'utf8');
  return [
    ...html.matchAll(
      /class="chapter" data-start="([\d.]+)" data-start-phone="([\d.]+)">([\s\S]*?)<\/button>/g
    ),
  ].map((m) => {
    const body = m[3]!;
    const wide = /class="chapter-wide">([^<]+)</.exec(body)?.[1];
    const narrow = /class="chapter-phone">([^<]+)</.exec(body)?.[1];
    const both = /class="chapter-title">([^<]+)</.exec(body)?.[1];
    return {
      wide: { title: wide ?? both, start: Number(m[1]) },
      phone: { title: narrow ?? both, start: Number(m[2]) },
    };
  });
}

it("keeps the chips in step with the recorder's chapters, for both takes", () => {
  const found = chips();
  expect(found).toHaveLength(3);
  expect(found.map((c) => c.wide)).toEqual(recorded.chapters);
  expect(found.map((c) => c.phone)).toEqual(phone.chapters);
});

it('titles the phone chapters for a phone', () => {
  expect(phone.chapters.map((c) => c.title)).toEqual([
    'Tap the text',
    'Fix it in every language',
    'Get a pull request',
  ]);
  const starts = phone.chapters.map((c) => c.start);
  expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  expect(starts.at(-1)!).toBeLessThan(phone.duration);
});

it('finds the chapter and its progress, and wraps back on loop', () => {
  const chapters = readChapters(
    recorded.chapters.map((c) => c.start),
    recorded.duration
  );
  expect(chapters.at(-1)?.end).toBe(recorded.duration);
  expect(chapterAt(chapters, 0)).toBe(0); // before the first beat: still chapter 1
  expect(chapterAt(chapters, 6)).toBe(1);
  expect(chapterAt(chapters, 17)).toBe(2);
  expect(chapterAt(chapters, 0.2)).toBe(0); // the loop came round
  expect(chapterProgress(chapters, 0, 0.8)).toBe(0);
  expect(chapterProgress(chapters, 1, 5.21 + (10.63 - 5.21) / 2)).toBeCloseTo(0.5);
  expect(chapterProgress(chapters, 2, 99)).toBe(1);
});

it('keeps the place in the story when the take changes', () => {
  const wide = readChapters([1, 5, 10], 18);
  const tall = readChapters([2, 4, 8], 16);
  expect(samePlace(wide, tall, 7.5)).toBeCloseTo(6); // half way through chapter 2
  expect(samePlace(wide, tall, 10)).toBeCloseTo(8); // the start of chapter 3
  expect(samePlace(wide, tall, 0.5)).toBeCloseTo(0.5); // before chapter 1: kept
  expect(samePlace(tall, wide, 16)).toBeCloseTo(18); // the very end
});

it('reads the door from the hash', () => {
  expect(doorFromHash('#fixer')).toBe('fixer');
  expect(doorFromHash('#developer')).toBe('developer');
  expect(doorFromHash('')).toBe('developer');
  expect(doorFromHash('#anything')).toBe('developer');
});

it('picks the phone take on a phone and the wide cut elsewhere, at the CSS breakpoint', () => {
  const cuts = {
    wide: { webm: 'w.webm', mp4: 'w.mp4' },
    phone: { webm: 'p.webm', mp4: 'p.mp4' },
  };
  expect(pickCut(cuts, true)).toBe(cuts.phone);
  expect(pickCut(cuts, false)).toBe(cuts.wide);
  const css = fs.readFileSync('site/src/styles/sections.css', 'utf8');
  const phoneFrame = css.slice(css.indexOf(`@media ${PHONE_QUERY} {\n  /* 14px`));
  expect(phoneFrame).toMatch(/^@media[^{]+\{\s+\/\*[^*]+\*\/\s+\.window \{/);
  expect(css).toContain('aspect-ratio: 390 / 844;');
  expect(css).toContain('70svh');
});

it('ships the wide cut and the phone take in both formats, at hero size', () => {
  for (const take of ['hero-wide', 'hero-phone'])
    for (const ext of ['webm', 'mp4']) {
      const { size } = fs.statSync(`site/media/hero/${take}.${ext}`);
      expect(size).toBeGreaterThan(100_000);
      expect(size).toBeLessThan(2.6 * 1024 * 1024);
    }
});

it('no longer ships the old narrow cut', () => {
  for (const file of ['hero-narrow.mp4', 'hero-narrow.webm', 'poster-narrow.webp'])
    expect(fs.existsSync(`site/media/hero/${file}`)).toBe(false);
});
