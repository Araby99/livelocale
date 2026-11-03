// A short muted product clip that loads lazily, plays only while it is on screen, never plays by
// itself under reduced motion, and has a visible pause control. Used by the docs' DocClip.vue and
// the landing page. The markup it expects:
//
//   <figure>
//     <video muted loop playsinline preload="none" poster="…">
//       <source data-src="….webm" type="video/webm" /> <source data-src="….mp4" type="video/mp4" />
//     </video>
//     <button type="button" class="clip-toggle" aria-label="Play clip">…</button>
//   </figure>

/** How much of the clip must be on screen before it plays. */
const VISIBLE = 0.5;
const REDUCED = '(prefers-reduced-motion: reduce)';

/**
 * Whether a clip plays by itself: at least half of it is on screen, the reader allows motion and
 * has not paused it.
 */
export function shouldPlay(ratio: number, reduced: boolean, pausedByUser: boolean): boolean {
  return ratio >= VISIBLE && !reduced && !pausedByUser;
}

/**
 * Wires one clip figure: its sources attach when it first comes within 200px of the viewport, it
 * plays while at least half visible, and its toggle button pauses and plays it. Returns a
 * disposer that removes every observer and listener.
 */
export function startClip(figure: HTMLElement, win: Window): () => void {
  const video = figure.querySelector('video');
  const toggle = figure.querySelector<HTMLButtonElement>('button.clip-toggle');
  if (!video || !toggle) return () => {};
  const motion = win.matchMedia(REDUCED);
  // 'auto' follows shouldPlay; 'paused' and 'playing' are the reader's own choice.
  let choice: 'auto' | 'paused' | 'playing' = 'auto';
  let ratio = 0;
  let attached = false;

  const attach = () => {
    if (attached) return;
    attached = true;
    for (const source of video.querySelectorAll<HTMLSourceElement>('source[data-src]')) {
      source.src = source.dataset.src ?? '';
    }
    video.load();
  };
  const play = () => {
    attach();
    video.play().catch(() => {});
  };
  const update = () => {
    const wanted =
      choice === 'playing'
        ? ratio >= VISIBLE
        : shouldPlay(ratio, motion.matches, choice === 'paused');
    if (wanted && video.paused) play();
    else if (!wanted && !video.paused) video.pause();
  };
  const label = () => {
    const playing = !video.paused;
    toggle.setAttribute('aria-label', playing ? 'Pause clip' : 'Play clip');
    toggle.dataset.state = playing ? 'playing' : 'paused';
  };
  const onToggle = () => {
    if (video.paused) {
      choice = 'playing';
      play();
    } else {
      choice = 'paused';
      video.pause();
    }
  };

  label();
  video.addEventListener('play', label);
  video.addEventListener('pause', label);
  toggle.addEventListener('click', onToggle);
  motion.addEventListener('change', update);
  const removeListeners = () => {
    video.removeEventListener('play', label);
    video.removeEventListener('pause', label);
    toggle.removeEventListener('click', onToggle);
    motion.removeEventListener('change', update);
  };

  const Observer = (win as Window & typeof globalThis).IntersectionObserver;
  if (!Observer) {
    // no observer: treat the clip as on screen
    ratio = 1;
    update();
    return removeListeners;
  }
  const near = new Observer(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        attach();
        near.disconnect();
      }
    },
    { rootMargin: '200px' }
  );
  const seen = new Observer(
    (entries) => {
      for (const entry of entries) ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      update();
    },
    { threshold: [0, VISIBLE, 1] }
  );
  near.observe(figure);
  seen.observe(figure);

  return () => {
    near.disconnect();
    seen.disconnect();
    removeListeners();
  };
}
