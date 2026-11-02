// Scene 1: the screenshot pile collapses into one pull request as the visitor scrolls. CSS
// scroll-driven animations do the work where the browser has them (`html.sda`); elsewhere a
// scroll listener, running only while the section is on screen, writes `--pile-progress` for
// pile.css to read. Under reduced motion nothing starts and the page keeps the end state.

/** True when the browser runs CSS animations on a view timeline. */
export function supportsScrollTimeline(css: {
  supports(property: string, value: string): boolean;
}): boolean {
  return css.supports('animation-timeline', 'view()');
}

/**
 * How far the pile has collapsed, 0 to 1: 0 while the section's top is at or below the viewport
 * top, 1 once its bottom reaches the viewport bottom. A section no taller than the viewport has
 * nowhere to scroll, so it shows the end state.
 */
export function pileProgress(top: number, height: number, viewport: number): number {
  const distance = height - viewport;
  if (distance <= 0) return 1;
  return Math.min(Math.max(-top / distance, 0), 1);
}

/** Starts the pile animation on section and returns a function that stops it. */
export function startPile(section: HTMLElement, win: Window): () => void {
  // The DOM typings declare CSS and IntersectionObserver on globalThis, not on Window.
  const globals = win as Window & typeof globalThis;
  if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const root = win.document.documentElement;
  if (supportsScrollTimeline(globals.CSS)) {
    root.classList.add('sda');
    return () => root.classList.remove('sda');
  }

  let frame = 0;
  const update = () => {
    frame = 0;
    const { top, height } = section.getBoundingClientRect();
    section.style.setProperty(
      '--pile-progress',
      String(pileProgress(top, height, win.innerHeight))
    );
  };
  const onScroll = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  const stopListening = () => {
    win.removeEventListener('scroll', onScroll);
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  };

  const observer = new globals.IntersectionObserver((entries) => {
    const onScreen = entries.some((entry) => entry.isIntersecting);
    // One last measurement either way, so a fast scroll past the section still lands it at an end.
    update();
    if (onScreen) win.addEventListener('scroll', onScroll, { passive: true });
    else stopListening();
  });
  observer.observe(section);

  return () => {
    observer.disconnect();
    stopListening();
    section.style.removeProperty('--pile-progress');
  };
}
