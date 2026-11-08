// @vitest-environment jsdom
import * as fs from 'node:fs';
import {
  PHONE_QUERY,
  chapterAt,
  chapterProgress,
  pickCut,
  readChapters,
  samePlace,
  startDemoVideo,
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
    const wide = /class="chapter-wide(?: chapter-full)?">([^<]+)</.exec(body)?.[1];
    // a full title (chapter-full) stays the accessible name on a phone; its short label is only seen
    const full = /class="chapter-wide chapter-full">/.test(body);
    const short = /class="chapter-phone" aria-hidden="true">([^<]+)</.exec(body)?.[1];
    const narrow = /class="chapter-phone">([^<]+)</.exec(body)?.[1];
    const both = /class="chapter-title">([^<]+)</.exec(body)?.[1];
    return {
      wide: { title: wide ?? both, start: Number(m[1]) },
      phone: { title: full ? wide : (narrow ?? both), start: Number(m[2]) },
      label: short ?? narrow ?? both,
    };
  });
}

it("keeps the chips in step with the recorder's chapters, for both takes", () => {
  const found = chips();
  expect(found).toHaveLength(3);
  expect(found.map((c) => c.wide)).toEqual(recorded.chapters);
  expect(found.map((c) => c.phone)).toEqual(phone.chapters);
});

it('shows a short label on a phone where a full title would wrap, keeping the full one as the name', () => {
  expect(chips().map((c) => c.label)).toEqual([
    'Tap the text',
    'Every language',
    'Get a pull request',
  ]);
  const css = fs.readFileSync('site/src/styles/sections.css', 'utf8');
  const phoneRules = css.slice(css.indexOf('.chapter-wide.chapter-full {'));
  expect(phoneRules).toMatch(
    /^\.chapter-wide\.chapter-full \{\s+display: inline;\s+position: absolute;/
  );
  expect(phoneRules).toContain('clip-path: inset(50%);');
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

describe('across the breakpoint', () => {
  type Listener = () => void;
  let phoneMatches: boolean;
  let phoneListeners: Listener[];

  /** The hero as the HTML has it, with the media calls stubbed (jsdom plays nothing). */
  function mount() {
    document.body.innerHTML = `
      <figure data-demo>
        <video muted loop playsinline preload="none"></video>
        <button class="chapter" data-start="1" data-start-phone="2">1</button>
        <button class="chapter" data-start="5" data-start-phone="4">2</button>
        <button data-playback><span class="playback-label">Play</span></button>
      </figure>`;
    const root = document.querySelector<HTMLElement>('[data-demo]')!;
    const video = root.querySelector('video')!;
    let paused = true;
    let time = 0;
    let ready = 0; // HAVE_NOTHING until a test says the metadata has loaded
    Object.defineProperty(video, 'paused', { get: () => paused });
    Object.defineProperty(video, 'readyState', { get: () => ready });
    Object.defineProperty(video, 'currentTime', {
      get: () => time,
      set: (t: number) => {
        time = t;
      },
    });
    video.play = vi.fn(() => {
      paused = false;
      video.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    video.pause = vi.fn(() => {
      paused = true;
      video.dispatchEvent(new Event('pause'));
    });
    video.load = vi.fn(() => {
      // load() pauses a playing element and forgets the old take (the media element load
      // algorithm): no metadata, back to 0
      if (!paused) video.pause();
      ready = 0;
      time = 0;
    });
    startDemoVideo(
      root,
      { wide: { webm: 'w.webm', mp4: 'w.mp4' }, phone: { webm: 'p.webm', mp4: 'p.mp4' } },
      { wide: 10, phone: 8 }
    );
    /** The attached take's metadata arrives, as the browser fires it. */
    const metadata = () => {
      ready = 1;
      video.dispatchEvent(new Event('loadedmetadata'));
    };
    return {
      root,
      video,
      metadata,
      toggle: root.querySelector<HTMLButtonElement>('[data-playback]')!,
    };
  }

  const cross = (phone: boolean) => {
    phoneMatches = phone;
    phoneListeners.forEach((l) => l());
  };
  const srcs = (video: HTMLVideoElement) =>
    [...video.querySelectorAll('source')].map((s) => s.getAttribute('src'));

  beforeEach(() => {
    vi.useFakeTimers();
    phoneMatches = false;
    phoneListeners = [];
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query === PHONE_QUERY ? phoneMatches : false;
      },
      addEventListener: (_: string, l: Listener) => {
        if (query === PHONE_QUERY) phoneListeners.push(l);
      },
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows the poster again when the take changes while paused', () => {
    const { root, video, toggle } = mount();
    root.querySelector<HTMLButtonElement>('.chapter')!.click();
    expect(video.paused).toBe(false);
    expect(root.dataset.started).toBe('');
    toggle.click(); // Pause: the frame on screen stays, the poster stays hidden
    expect(video.paused).toBe(true);
    expect(root.dataset.started).toBe('');

    cross(true);
    expect(srcs(video)).toEqual(['p.mp4', 'p.webm']);
    expect(video.paused).toBe(true);
    expect(root.dataset.started).toBeUndefined(); // nothing loads while paused: the poster shows

    toggle.click(); // Play again: the new take plays and the poster fades
    expect(video.paused).toBe(false);
    expect(root.dataset.started).toBe('');
  });

  it('keeps playing, poster hidden, when the take changes while playing', () => {
    const { root, video } = mount();
    root.querySelectorAll<HTMLButtonElement>('.chapter')[1]!.click();
    cross(true);
    expect(srcs(video)).toEqual(['p.mp4', 'p.webm']);
    expect(video.paused).toBe(false);
    expect(root.dataset.started).toBe('');
  });

  // On a slow load the chip's seek is still waiting for metadata when the breakpoint is crossed:
  // the swap must carry that chapter over, not the 0 the unloaded element reports.
  it('keeps a chapter picked before the take loaded when the take changes', () => {
    const { root, video, metadata } = mount();
    root.querySelectorAll<HTMLButtonElement>('.chapter')[1]!.click(); // wide chapter 2, at 5
    expect(video.currentTime).toBe(0); // no metadata yet: the seek waits
    cross(true);
    metadata(); // the phone take's metadata
    // phone chapter 2 (4 to 8), the same share of the way in as 5.01 is through 5 to 10
    expect(video.currentTime).toBeCloseTo(4.008, 5);
    expect(root.querySelectorAll('.chapter')[1]!.getAttribute('aria-current')).toBe('step');
  });

  it('applies a waiting seek once, not again on a later load', () => {
    const { root, video, metadata } = mount();
    root.querySelectorAll<HTMLButtonElement>('.chapter')[1]!.click();
    metadata();
    expect(video.currentTime).toBeCloseTo(5.01, 5);
    video.currentTime = 1.5; // played on, looped back to chapter 1
    cross(true);
    metadata();
    expect(video.currentTime).toBeCloseTo(
      samePlace(
        [
          { start: 1, end: 5 },
          { start: 5, end: 10 },
        ],
        [
          { start: 2, end: 4 },
          { start: 4, end: 8 },
        ],
        1.5
      ),
      5
    );
    video.currentTime = 6;
    video.dispatchEvent(new Event('loadedmetadata')); // a stray later event moves nothing
    expect(video.currentTime).toBe(6);
  });
});
