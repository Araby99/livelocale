// The hero video: the poster is a <picture> in the HTML (the LCP, a frame with the fix already
// made). Autoplay is held until about 2 s after the window has loaded and the main thread is idle,
// and the sources attach only then and while the video is on screen, so the video's bytes never
// compete with the poster, the CSS and the headline font and the poster stays the page's largest
// paint. A chapter or Play click attaches them and plays at once. A phone gets the tall phone take
// (the phone Studio, filmed on a phone screen) and its own chapter times; anything wider the 2:1
// cut. Crossing the breakpoint swaps the take and the chapters, keeping the place in the story. It
// pauses offscreen and in a hidden tab, never starts by itself under prefers-reduced-motion, and
// keeps its chapter chips in step with the frame on screen.

export interface DemoSources {
  webm: string;
  mp4: string;
}

export interface DemoCuts {
  wide: DemoSources;
  phone: DemoSources;
}

/** Each take's length in seconds (the chapter chips carry each take's start times). */
export interface DemoDurations {
  wide: number;
  phone: number;
}

/** How long after the window's load event autoplay waits (then for an idle moment). */
const AUTOPLAY_HOLD_MS = 2000;

/** The viewport the phone take is for; it matches the CSS that frames it as a phone screen. */
export const PHONE_QUERY = '(max-width: 639px)';

/** The take for a viewport: the phone one on a phone, the wide one anywhere else. */
export function pickCut<T>(cuts: { wide: T; phone: T }, phone: boolean): T {
  return phone ? cuts.phone : cuts.wide;
}

export interface Chapter {
  start: number;
  end: number;
}

/** The chapter at time t: the last one started, or the first before any has. */
export function chapterAt(chapters: readonly Chapter[], t: number): number {
  let index = 0;
  chapters.forEach((c, i) => {
    if (t >= c.start) index = i;
  });
  return index;
}

/** How far through chapter i the time t is, from 0 to 1. */
export function chapterProgress(chapters: readonly Chapter[], i: number, t: number): number {
  const c = chapters[i];
  if (!c || c.end <= c.start) return 0;
  return Math.min(1, Math.max(0, (t - c.start) / (c.end - c.start)));
}

/** Reads the chips' start times; each chapter ends where the next starts, the last at duration. */
export function readChapters(starts: readonly number[], duration: number): Chapter[] {
  return starts.map((start, i) => ({ start, end: starts[i + 1] ?? duration }));
}

/** The same place in another take: the same chapter, the same share of the way through it. */
export function samePlace(from: readonly Chapter[], to: readonly Chapter[], t: number): number {
  const i = chapterAt(from, t);
  const target = to[i];
  if (!target) return 0;
  // before the first chapter starts, keep the offset from the start of the take
  if (t < (from[0]?.start ?? 0)) return Math.min(t, target.start);
  return target.start + chapterProgress(from, i, t) * (target.end - target.start);
}

export function startDemoVideo(root: HTMLElement, cuts: DemoCuts, durations: DemoDurations): void {
  const video = root.querySelector<HTMLVideoElement>('video');
  const toggle = root.querySelector<HTMLButtonElement>('[data-playback]');
  const label = toggle?.querySelector<HTMLElement>('.playback-label');
  const chips = [...root.querySelectorAll<HTMLButtonElement>('.chapter')];
  if (!video || !toggle || !label) return;

  const takes = {
    wide: readChapters(
      chips.map((chip) => Number(chip.dataset.start)),
      durations.wide
    ),
    phone: readChapters(
      chips.map((chip) => Number(chip.dataset.startPhone ?? chip.dataset.start)),
      durations.phone
    ),
  };
  const phoneQuery = window.matchMedia(PHONE_QUERY);
  let isPhone = phoneQuery.matches; // the take attached (or to attach) and its chapters
  let chapters = pickCut(takes, isPhone);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let wanted = !reduced.matches; // what the visitor asked for: play, or stay still
  let attached = false;
  let onScreen = false;
  let held = true; // autoplay waits for the hold after load; a click does not

  video.muted = true; // the attribute alone is not always reflected as the property

  const render = () => {
    const playing = !video.paused;
    root.dataset.state = playing ? 'playing' : 'paused';
    if (playing) root.dataset.started = '';
    label.textContent = wanted ? 'Pause' : 'Play';
    toggle.dataset.action = wanted ? 'pause' : 'play';
    toggle.setAttribute('aria-label', wanted ? 'Pause the demo video' : 'Play the demo video');
  };

  const attach = () => {
    if (attached) return;
    attached = true;
    const sources = pickCut(cuts, isPhone);
    // MP4 (H.264) first: every Safari and Chrome plays it, and it is the smaller cut here.
    for (const [src, type] of [
      [sources.mp4, 'video/mp4'],
      [sources.webm, 'video/webm'],
    ] as const) {
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.append(source);
    }
    video.load();
  };

  const sync = () => {
    if (wanted && onScreen && !document.hidden && (!held || attached)) {
      attach();
      video.play().catch((error: unknown) => {
        // A pause() that interrupts a slow load (scrolled away, tab hidden) rejects with
        // AbortError: keep wanting playback, so the video resumes back on screen.
        if ((error as { name?: unknown } | null)?.name === 'AbortError') return;
        // Data saver or low-power mode refused: leave the poster and offer Play.
        wanted = false;
        render();
      });
    } else if (!video.paused) {
      video.pause();
    }
    render();
  };

  toggle.addEventListener('click', () => {
    wanted = !wanted;
    if (wanted) attach();
    sync();
  });

  // A seek asked for before the attached take has its metadata (a chip clicked on a slow load)
  // waits here, in the attached take's time, until loadedmetadata. One target, not a queue of
  // listeners: a later chip click replaces it, and a take swap carries it over (the element
  // still reports 0 then), so neither an old take's seek nor a stale 0 lands on the new take.
  let pending: number | null = null;
  const go = (t: number) => {
    pending = null;
    video.currentTime = t;
    paint(video.currentTime);
  };
  /** Where the story is: the seek still waiting, else the frame on screen. */
  const place = () => pending ?? video.currentTime;
  const seekTo = (t: number) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) go(t);
    else pending = t;
  };
  video.addEventListener('loadedmetadata', () => {
    if (pending !== null) go(pending);
  });
  // past the previous chapter's last frame
  const seek = (start: number) => seekTo(start + 0.01);

  chips.forEach((chip, i) =>
    chip.addEventListener('click', () => {
      wanted = true;
      attach();
      seek(chapters[i]?.start ?? 0);
      sync();
    })
  );

  // Chapter state, frame by frame where requestVideoFrameCallback exists.
  const paint = (t: number) => {
    const current = chapterAt(chapters, t);
    chips.forEach((chip, i) => {
      const progress = i === current ? chapterProgress(chapters, i, t) : 0;
      chip.style.setProperty('--progress', progress.toFixed(3));
      if (i === current) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
    });
  };
  paint(0);

  type FrameVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  };
  const fv = video as FrameVideo;
  if (typeof fv.requestVideoFrameCallback === 'function') {
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      paint(meta.mediaTime);
      fv.requestVideoFrameCallback?.(onFrame);
    };
    fv.requestVideoFrameCallback(onFrame);
  } else {
    video.addEventListener('timeupdate', () => paint(video.currentTime));
  }
  video.addEventListener('seeked', () => paint(video.currentTime));
  video.addEventListener('play', render);
  video.addEventListener('pause', render);

  // Across the breakpoint: the other take and its chapters, at the same place in the story.
  phoneQuery.addEventListener('change', () => {
    if (phoneQuery.matches === isPhone) return;
    const from = chapters;
    isPhone = phoneQuery.matches;
    chapters = pickCut(takes, isPhone);
    if (!attached) {
      paint(0);
      return;
    }
    const at = samePlace(from, chapters, place());
    video.querySelectorAll('source').forEach((source) => source.remove());
    attached = false;
    attach();
    seekTo(at);
    sync();
    // Paused, nothing loads (preload="none"), so the new take has no frame to show: bring back
    // the poster (the <picture> already picks this viewport's) until it plays again.
    if (video.paused) delete root.dataset.started;
  });

  reduced.addEventListener('change', () => {
    if (reduced.matches) wanted = false;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  const release = () => {
    held = false;
    sync();
  };
  const hold = () =>
    setTimeout(() => {
      if (typeof requestIdleCallback === 'function')
        requestIdleCallback(release, { timeout: 1000 });
      else release();
    }, AUTOPLAY_HOLD_MS);
  if (document.readyState === 'complete') hold();
  else window.addEventListener('load', hold, { once: true });

  if (typeof IntersectionObserver === 'undefined') {
    onScreen = true;
    sync();
  } else {
    new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      },
      { threshold: 0.25 }
    ).observe(video);
  }
  render();
}
