// @vitest-environment node
import * as fs from 'node:fs';
import { chapterAt, chapterProgress, readChapters } from '../../../site/src/demo-video';
import { doorFromHash } from '../../../site/src/doors';

const recorded = JSON.parse(fs.readFileSync('site/media/hero/chapters.json', 'utf8')) as {
  duration: number;
  chapters: Array<{ title: string; start: number }>;
};

it("keeps the chips in step with the recorder's chapters", () => {
  const html = fs.readFileSync('site/index.html', 'utf8');
  const chips = [
    ...html.matchAll(
      /class="chapter" data-start="([\d.]+)">[\s\S]*?class="chapter-title">([^<]+)</g
    ),
  ].map((m) => ({ title: m[2], start: Number(m[1]) }));
  expect(chips).toEqual(recorded.chapters);
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

it('reads the door from the hash', () => {
  expect(doorFromHash('#fixer')).toBe('fixer');
  expect(doorFromHash('#developer')).toBe('developer');
  expect(doorFromHash('')).toBe('developer');
  expect(doorFromHash('#anything')).toBe('developer');
});
