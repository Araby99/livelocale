/**
 * Watches the page's address for client-side navigations (`history.pushState`,
 * `history.replaceState`, `popstate`, `hashchange`) and reports each new
 * `pathname + search + hash`, at most once per scheduled frame.
 */

/** Where the wrapper keeps its subscribers, shared by every copy of this module. */
const WATCH_STATE = Symbol.for('livelocale.locationWatch');

type HistoryMethod = 'pushState' | 'replaceState';
type HistoryFn = (this: History, ...args: unknown[]) => unknown;

interface WrapperState {
  subscribers: Set<() => void>;
  original: HistoryFn;
  wrapper: HistoryFn;
}

type Wrapped = HistoryFn & { [WATCH_STATE]?: WrapperState };

/** The wrapper on `history[method]`, installing it when the current function is not one. */
function subscribe(history: History, method: HistoryMethod, notify: () => void): () => void {
  const current = history[method] as unknown as Wrapped;
  let state = current[WATCH_STATE];
  if (!state) {
    const original = current;
    const subscribers = new Set<() => void>();
    const wrapper: Wrapped = function (this: History, ...args: unknown[]) {
      const result = original.apply(this, args);
      subscribers.forEach((cb) => cb());
      return result;
    };
    state = { subscribers, original, wrapper };
    wrapper[WATCH_STATE] = state;
    history[method] = wrapper as unknown as History[HistoryMethod];
  }
  const own = state;
  own.subscribers.add(notify);
  return () => {
    own.subscribers.delete(notify);
    // Put the original back only if nobody wrapped on top of ours since.
    if (own.subscribers.size === 0 && (history[method] as unknown) === own.wrapper) {
      history[method] = own.original as unknown as History[HistoryMethod];
    }
  };
}

function defaultSchedule(win: Window): (cb: () => void) => void {
  if (typeof win.requestAnimationFrame === 'function') {
    return (cb) => {
      win.requestAnimationFrame(() => cb());
    };
  }
  return (cb) => {
    setTimeout(cb, 16);
  };
}

/**
 * Calls `report` with the page's new `pathname + search + hash` after each
 * client-side navigation, coalescing a burst into one report per `schedule`
 * callback and skipping a URL equal to the last one reported (initially the
 * URL at start). `report` is never called synchronously and a throwing
 * `report` is swallowed, so the app's navigation never breaks. Returns the
 * cleanup.
 */
export function watchLocation(
  win: Window,
  report: (url: string) => void,
  schedule: (cb: () => void) => void = defaultSchedule(win)
): () => void {
  const read = () => win.location.pathname + win.location.search + win.location.hash;
  let last = read();
  let pending = false;
  let stopped = false;

  const run = () => {
    pending = false;
    if (stopped) return;
    const url = read();
    if (url === last) return;
    last = url;
    try {
      report(url);
    } catch {}
  };

  const notify = () => {
    if (pending || stopped) return;
    pending = true;
    try {
      schedule(run);
    } catch {
      pending = false;
    }
  };

  const unsubscribePush = subscribe(win.history, 'pushState', notify);
  const unsubscribeReplace = subscribe(win.history, 'replaceState', notify);
  win.addEventListener('popstate', notify);
  win.addEventListener('hashchange', notify);

  return () => {
    if (stopped) return;
    stopped = true;
    win.removeEventListener('popstate', notify);
    win.removeEventListener('hashchange', notify);
    unsubscribePush();
    unsubscribeReplace();
  };
}
