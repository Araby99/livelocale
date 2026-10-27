import { useEffect, useState } from 'react';

/** At this width and above the Studio shows its three columns side by side. */
export const WIDE_LAYOUT_QUERY = '(min-width: 1280px)';

const queryList = (query: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;

/** Whether `query` matches now, following changes; `fallback` when matchMedia is missing. */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState(() => queryList(query)?.matches ?? fallback);

  useEffect(() => {
    const list = queryList(query);
    if (!list) {
      setMatches(fallback);
      return;
    }
    setMatches(list.matches);
    const onChange = (event: { matches: boolean }) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query, fallback]);

  return matches;
}
