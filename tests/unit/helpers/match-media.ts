import { vi } from 'vitest';

type ChangeListener = (event: { matches: boolean }) => void;

/** Stubs `window.matchMedia` with one list for every query; `fire` changes it and notifies listeners. */
export function fakeMatchMedia(initial: boolean): { fire(matches: boolean): void } {
  const listeners = new Set<ChangeListener>();
  const mql = {
    matches: initial,
    addEventListener: vi.fn((_type: string, l: ChangeListener) => listeners.add(l)),
    removeEventListener: vi.fn((_type: string, l: ChangeListener) => listeners.delete(l)),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql)
  );
  return {
    fire(matches: boolean) {
      mql.matches = matches;
      for (const l of [...listeners]) l({ matches });
    },
  };
}
