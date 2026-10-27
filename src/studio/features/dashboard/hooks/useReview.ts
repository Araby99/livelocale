import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChangeLinkError,
  decodeChangeLink,
  findChangeToken,
  type ChangeSet,
} from '../../../../core/change-link.js';
import type { LocaleTarget } from '../../../../core/apply-plan.js';
import type { LocalesLayout } from '../../../../core/share-manifest.js';
import type { LiveLocaleMode } from '../../../api.js';
import { describeLinkError } from '../../../share/send.js';
import { buildReviewRows, type ReviewRow } from '../../../share/review.js';
import type { ConnectionStatus } from '../types/index.js';

/** Where a reviewed link would be applied: a pull request on GitHub, or the local files. */
export type ReviewTarget = 'github' | 'local';

export interface ReviewState {
  token: string;
  set: ChangeSet;
  rows: ReviewRow[];
  sourceLocale: string;
  target: ReviewTarget;
}

export interface UseReviewParams {
  mode: LiveLocaleMode | null;
  locale: string;
  locales: string[];
  sourceLocale: string | null;
  layout: LocalesLayout;
  /** Static: the built values without drafts (`transport.readBuiltLocale`); else `fetchLocaleDictionary`. */
  readLocale: (l: string) => Promise<Record<string, unknown>>;
  connectionStatus: ConnectionStatus;
  currentPath: string;
  visibleKeys: string[] | null;
  sendToIframe: (type: string, payload?: unknown) => void;
  reloadFrame: () => void;
}

const LINK_HASH_PREFIX = '#lc1.';
const NO_LINK = 'No change link found. A change link contains "lc1.".';

const sourceFailed = (sourceLocale: string) =>
  `The source locale "${sourceLocale}" could not be loaded.`;

/**
 * Review mode: a change link opened from the URL hash (or pasted), planned
 * against the current build and shown read-only. The proposed values of the
 * current locale are overlaid on the app; nothing is saved.
 */
export function useReview(p: UseReviewParams): {
  review: ReviewState | null;
  error: string | null;
  isLoading: boolean;
  focusKey: string | null;
  setFocusKey(k: string | null): void;
  openReview(input: string): Promise<boolean>;
  closeReview(): void;
} {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Latest props for the async open and the hash listener.
  const propsRef = useRef(p);
  propsRef.current = p;
  // Tokens already opened from the hash, so each one opens only once.
  const openedRef = useRef(new Set<string>());
  // Only the latest open may set state.
  const requestRef = useRef(0);

  const openReview = useCallback(async (input: string): Promise<boolean> => {
    const request = ++requestRef.current;
    const isCurrent = () => request === requestRef.current;
    setError(null);
    setIsLoading(true);
    try {
      let set: ChangeSet;
      let token: string;
      try {
        set = await decodeChangeLink(input);
        token = findChangeToken(input);
      } catch (err) {
        if (isCurrent()) {
          setError(
            err instanceof ChangeLinkError && err.code === 'NOT_FOUND'
              ? NO_LINK
              : describeLinkError(err)
          );
        }
        return false;
      }

      const props = propsRef.current;
      const target: ReviewTarget = props.mode === 'development' ? 'local' : 'github';
      const sourceLocale = props.sourceLocale ?? (props.locales.includes(set.src) ? set.src : 'en');
      const layout: LocalesLayout = props.mode === 'static' ? props.layout : 'flat';

      const wanted = [...new Set([...set.edits.map((e) => e.locale), sourceLocale])];
      const loaded = await Promise.allSettled(wanted.map((l) => props.readLocale(l)));
      const targets = new Map<string, LocaleTarget>();
      wanted.forEach((l, i) => {
        const result = loaded[i]!;
        targets.set(l, result.status === 'fulfilled' ? { layout, dict: result.value } : null);
      });
      if (!targets.get(sourceLocale)) {
        if (isCurrent()) setError(sourceFailed(sourceLocale));
        return false;
      }

      const rows = buildReviewRows({ set, sourceLocale, targets });
      if (!isCurrent()) return false;
      openedRef.current.add(token);
      setFocusKey(null);
      setReview({ token, set, rows, sourceLocale, target });
      return true;
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  // Entry: a link in the URL hash, on mount and on every hash change.
  useEffect(() => {
    if (p.mode === null) return;
    const openFromHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith(LINK_HASH_PREFIX)) return;
      const input = hash.slice(1);
      let token: string;
      try {
        token = findChangeToken(input);
      } catch {
        token = input;
      }
      if (openedRef.current.has(token)) return;
      openedRef.current.add(token);
      void openReview(input);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [p.mode, openReview]);

  // Overlay the proposed values of the current locale; re-run after navigation.
  useEffect(() => {
    if (review === null || p.connectionStatus !== 'connected') return;
    for (const row of review.rows) {
      if (row.locale !== p.locale || row.status === 'invalid') continue;
      p.sendToIframe('COMMIT_PREVIEW', { key: row.key, value: row.to });
    }
  }, [review, p.connectionStatus, p.currentPath, p.visibleKeys, p.locale]);

  const closeReview = useCallback(() => {
    requestRef.current++;
    setReview(null);
    setError(null);
    setFocusKey(null);
    setIsLoading(false);
    if (window.location.hash.startsWith(LINK_HASH_PREFIX)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    propsRef.current.reloadFrame();
  }, []);

  return { review, error, isLoading, focusKey, setFocusKey, openReview, closeReview };
}
