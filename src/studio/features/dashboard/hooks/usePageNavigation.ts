import { useEffect, useMemo, useRef, useState } from 'react';
import { manifestPages, SHARE_DIR } from '../../../../core/share-manifest.js';
import { appBasePath, getAppOrigin, getStudioRuntime, urlLocaleOptions } from '../../../runtime.js';
import { urlWithLocale } from '../../../locale-inference.js';
import {
  frameSrc,
  resolveAddress,
  toDisplayPath,
  withPageLocale,
  type AddressContext,
} from '../../../page-address.js';
import { readRecentPages, recentPagesScope, rememberPage } from '../../../recent-pages.js';
import type { AddressBarProps, NavigateResult } from '../components/AddressBar.js';

/** How long a navigation shows as pending without a new location from the client. */
export const NAVIGATION_TIMEOUT_MS = 15000;

export interface PageNavigationInput {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  /** The app path the client last reported. */
  currentPath: string;
  /** True while the document in the frame has a live client at `currentPath`. */
  locationKnown: boolean;
  /** Bumped on every location the client reports. */
  locationSeq: number;
  /** The Studio's active locale. */
  locale: string;
  sendToIframe: (type: string, payload?: unknown) => void;
}

export interface PageNavigation extends AddressBarProps {
  isNavigating: boolean;
  /** Reloads the page the preview is on. */
  reload: () => void;
  /** Shows the current page in `locale`, marked the way the site marks languages. */
  showLocale: (locale: string) => void;
}

/**
 * Wires the address field to the preview: shows the current page, remembers visited pages,
 * and opens a page with `NAVIGATE` while a client is in the frame, else through the iframe src.
 */
export function usePageNavigation({
  iframeRef,
  currentPath,
  locationKnown,
  locationSeq,
  locale,
  sendToIframe,
}: PageNavigationInput): PageNavigation {
  const runtime = getStudioRuntime();
  const appOrigin = getAppOrigin();
  const ctx: AddressContext = {
    appOrigin,
    base: appBasePath(),
    hideLocale: runtime.kind === 'server' ? locale : null,
    shareDir: runtime.kind === 'static' ? appBasePath() + SHARE_DIR + '/' : null,
  };
  const path = toDisplayPath(currentPath, ctx);

  const scope = recentPagesScope(
    runtime.kind === 'static'
      ? { kind: 'static', manifest: runtime.manifest, appUrl: runtime.appUrl }
      : { kind: 'server', appOrigin }
  );
  const manifest = runtime.kind === 'static' ? runtime.manifest : null;
  const sitePages = useMemo(() => (manifest ? manifestPages(manifest) : []), [manifest]);

  const [recent, setRecent] = useState<string[]>(() => readRecentPages(scope));
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const startPending = (displayPath: string) => {
    clearTimer();
    setPendingPath(displayPath);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPendingPath(null);
    }, NAVIGATION_TIMEOUT_MS);
  };

  // Each reported location ends a pending navigation and, with a live client, joins the
  // recent pages. The location the hook starts with is not a report.
  const seenSeq = useRef(locationSeq);
  useEffect(() => {
    if (seenSeq.current === locationSeq) return;
    seenSeq.current = locationSeq;
    clearTimer();
    setPendingPath(null);
    if (locationKnown) {
      rememberPage(scope, path);
      setRecent(readRecentPages(scope));
    }
  }, [locationSeq]);

  useEffect(() => clearTimer, []);

  // A NAVIGATE posted to a page without the client is lost, so only a known client gets one.
  const go = (appPath: string) => {
    if (locationKnown) {
      sendToIframe('NAVIGATE', { url: new URL(appPath, appOrigin).href });
      return;
    }
    const frame = iframeRef.current;
    if (frame) frame.src = frameSrc(appPath, appOrigin, window.location.origin);
  };

  const onNavigate = (input: string): NavigateResult => {
    const resolved = resolveAddress(input, ctx);
    if (resolved === null) return 'refused';
    const target = withPageLocale(resolved, currentPath, locale, urlLocaleOptions());
    startPending(toDisplayPath(target, ctx));
    go(target);
    return 'ok';
  };

  const reload = () => {
    if (locationKnown) {
      startPending(path);
      go(currentPath);
      return;
    }
    const frame = iframeRef.current;
    if (frame) frame.src = frame.src;
  };

  const showLocale = (nextLocale: string) => {
    const next = urlWithLocale(currentPath, nextLocale, urlLocaleOptions());
    if (next === null) return;
    // Shown as it will be once the Studio's locale is the new one.
    const shown = runtime.kind === 'server' ? { ...ctx, hideLocale: nextLocale } : ctx;
    startPending(toDisplayPath(next, shown));
    go(next);
  };

  return {
    path,
    pendingPath,
    recent,
    sitePages,
    onNavigate,
    isNavigating: pendingPath !== null,
    reload,
    showLocale,
  };
}
