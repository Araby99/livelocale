// The hero video: the poster is a <picture> in the HTML (the LCP, a frame with the fix already
// made); the sources attach once the window has loaded and the video is on screen, so the video's
// bytes never compete with the poster, the CSS and the headline font before the first paint, and it
// is still playing within the first seconds. A chapter or Play click attaches them at once. A
// phone gets the narrow 4:5 cut, anything wider the 2:1 cut. It pauses offscreen and in a hidden tab, never starts by itself under
// prefers-reduced-motion, and keeps its chapter chips in step with the frame on screen.

export interface DemoSources {
  webm: string;
  mp4: string;
}

export interface DemoCuts {
  wide: DemoSources;
  narrow: DemoSources;
}

/** The viewport the narrow cut is for; it matches the CSS that frames it at 4:5. */
export const NARROW_QUERY = '(max-width: 639px)';

/** The cut for a viewport: the narrow one on a phone, the wide one anywhere else. */
export function pickCut(cuts: DemoCuts, narrow: boolean): DemoSources {
  return narrow ? cuts.narrow : cuts.wide;
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

export function startDemoVideo(root: HTMLElement, cuts: DemoCuts, duration: number): void {
  const video = root.querySelector<HTMLVideoElement>('video');
  const toggle = root.querySelector<HTMLButtonElement>('[data-playback]');
  const label = toggle?.querySelector<HTMLElement>('.playback-label');
  const chips = [...root.querySelectorAll<HTMLButtonElement>('.chapter')];
  if (!video || !toggle || !label) return;

  const chapters = readChapters(
    chips.map((chip) => Number(chip.dataset.start)),
    duration
  );
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let wanted = !reduced.matches; // what the visitor asked for: play, or stay still
  let attached = false;
  let onScreen = false;
  let loaded = document.readyState === 'complete';

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
    const sources = pickCut(cuts, window.matchMedia(NARROW_QUERY).matches);
    for (const [src, type] of [
      [sources.webm, 'video/webm'],
      [sources.mp4, 'video/mp4'],
    ] as const) {
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.append(source);
    }
    video.load();
  };

  const sync = () => {
    if (wanted && onScreen && !document.hidden && (loaded || attached)) {
      attach();
      video.play().catch(() => {
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

  const seek = (start: number) => {
    const go = () => {
      video.currentTime = start + 0.01; // past the previous chapter's last frame
      paint(video.currentTime);
    };
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) go();
    else video.addEventListener('loadedmetadata', go, { once: true });
  };

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

  reduced.addEventListener('change', () => {
    if (reduced.matches) wanted = false;
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  if (!loaded)
    window.addEventListener(
      'load',
      () => {
        loaded = true;
        sync();
      },
      { once: true }
    );

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
