// Islands load lazily: each one's code is fetched only when its container nears the viewport.

/**
 * Calls load once, when el comes within rootMargin of the viewport. Without IntersectionObserver
 * it calls load at once.
 */
export function loadWhenNear(
  el: Element,
  load: () => Promise<unknown>,
  rootMargin = '300px'
): void {
  if (typeof IntersectionObserver === 'undefined') {
    void load();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    },
    { rootMargin }
  );
  observer.observe(el);
}
