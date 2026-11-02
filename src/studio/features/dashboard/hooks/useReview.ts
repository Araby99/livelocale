import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChangeLinkError,
  decodeChangeLink,
  findChangeToken,
  type ChangeSet,
} from '../../../../core/change-link.js';
import type { LocaleTarget } from '../../../../core/apply-plan.js';
import type { LocalesLayout } from '../../../../core/share-manifest.js';
import { sourceReference } from '../../../../core/save-rules.js';
import { saveTranslation, type LiveLocaleMode } from '../../../api.js';
import { describeLinkError } from '../../../share/send.js';
import { REVIEW_STATUS_KEYS, buildReviewRows, type ReviewRow } from '../../../share/review.js';
import { useStudioText } from '../../../i18n/StudioLanguage.js';
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

/** What happened to one row when the review was applied to the local files. */
export type ApplyResult =
  | { state: 'applied' }
  | { state: 'skipped'; reason: string }
  | { state: 'failed'; message: string };

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
  /** Called after each row saved to the local files. */
  onApplied?: (c: {
    locale: string;
    key: string;
    previousValue: string;
    nextValue: string;
  }) => void;
}

const LINK_HASH_PREFIX = '#lc1.';

/** Reads every locale the set touches plus the source locale; a locale that fails is null. */
async function loadTargets(
  props: UseReviewParams,
  set: ChangeSet,
  sourceLocale: string
): Promise<Map<string, LocaleTarget>> {
  const layout: LocalesLayout = props.mode === 'static' ? props.layout : 'flat';
  const wanted = [...new Set([...set.edits.map((e) => e.locale), sourceLocale])];
  const loaded = await Promise.allSettled(wanted.map((l) => props.readLocale(l)));
  const targets = new Map<string, LocaleTarget>();
  wanted.forEach((l, i) => {
    const result = loaded[i]!;
    targets.set(l, result.status === 'fulfilled' ? { layout, dict: result.value } : null);
  });
  return targets;
}

/**
 * Review mode: a change link opened from the URL hash (or pasted), planned
 * against the current build and shown read-only. The proposed values of the
 * current locale are overlaid on the app; nothing is saved.
 */
export function useReview(p: UseReviewParams): {
  review: ReviewState | null;
  error: string | null;
  isLoading: boolean;
  /** True when the latest open came from the URL hash rather than a paste. */
  openedFromHash: boolean;
  /**
   * True while Review mode is shown: a review is open, or a link from the URL hash is opening
   * or failed to open. A paste that is opening or failed stays in its own dialog.
   */
  isActive: boolean;
  focusKey: string | null;
  /** Counts every `setFocusKey` call, so a repeat focus of the same key is still seen. */
  focusSeq: number;
  setFocusKey(k: string | null): void;
  openReview(input: string): Promise<boolean>;
  closeReview(): void;
  applyLocal(o: { includeForced: boolean }): Promise<void>;
  applyResults: Record<string, ApplyResult>;
  isApplying: boolean;
} {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [openedFromHash, setOpenedFromHash] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [applyResults, setApplyResults] = useState<Record<string, ApplyResult>>({});
  const [isApplying, setIsApplying] = useState(false);

  // Latest props and Studio text for the async open, the hash listener and the local apply.
  const propsRef = useRef(p);
  propsRef.current = p;
  const { t } = useStudioText();
  const textRef = useRef(t);
  textRef.current = t;
  // Tokens already opened from the hash, so each one opens only once.
  const openedRef = useRef(new Set<string>());
  // Only the latest open may set state.
  const requestRef = useRef(0);
  // The open review and the locale files it was planned against, for a local apply.
  const reviewRef = useRef<{ review: ReviewState; targets: Map<string, LocaleTarget> } | null>(
    null
  );

  const open = useCallback(async (input: string, fromHash: boolean): Promise<boolean> => {
    const request = ++requestRef.current;
    const isCurrent = () => request === requestRef.current;
    const t = textRef.current;
    setOpenedFromHash(fromHash);
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
              ? t('review.no_link')
              : describeLinkError(err, t)
          );
        }
        return false;
      }

      const props = propsRef.current;
      const target: ReviewTarget = props.mode === 'development' ? 'local' : 'github';
      const sourceLocale = props.sourceLocale ?? (props.locales.includes(set.src) ? set.src : 'en');
      const targets = await loadTargets(props, set, sourceLocale);
      if (!targets.get(sourceLocale)) {
        if (isCurrent()) setError(t('review.source_failed', { locale: sourceLocale }));
        return false;
      }

      const rows = buildReviewRows({ set, sourceLocale, targets, t });
      if (!isCurrent()) return false;
      openedRef.current.add(token);
      const opened: ReviewState = { token, set, rows, sourceLocale, target };
      reviewRef.current = { review: opened, targets };
      setFocusKey(null);
      setApplyResults({});
      setReview(opened);
      return true;
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  const openReview = useCallback((input: string) => open(input, false), [open]);

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
      void open(input, true);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [p.mode, open]);

  // Overlay the proposed values of the current locale; re-run after navigation.
  useEffect(() => {
    if (review === null || p.connectionStatus !== 'connected') return;
    for (const row of review.rows) {
      if (row.locale !== p.locale || row.status === 'invalid') continue;
      p.sendToIframe('COMMIT_PREVIEW', { key: row.key, value: row.to });
    }
  }, [review, p.connectionStatus, p.currentPath, p.visibleKeys, p.locale]);

  // Development: save the ready rows (and, when asked, the forced ones) to the local files.
  const applyLocal = useCallback(async ({ includeForced }: { includeForced: boolean }) => {
    const current = reviewRef.current;
    if (current === null || current.review.target !== 'local') return;
    const { review: opened, targets } = current;
    const t = textRef.current;
    const ctx = {
      sourceLocale: opened.sourceLocale,
      source: targets.get(opened.sourceLocale)?.dict ?? {},
    };
    setIsApplying(true);
    try {
      const results: Record<string, ApplyResult> = {};
      for (const row of opened.rows) {
        const forced = row.status === 'needs-force';
        if (row.status !== 'apply' && !(forced && includeForced)) {
          results[row.id] = {
            state: 'skipped',
            reason: forced ? t('review.forced_not_included') : t(REVIEW_STATUS_KEYS[row.status]),
          };
          continue;
        }
        try {
          await saveTranslation(row.locale, row.key, row.to, {
            reference: sourceReference(row.key, ctx) ?? undefined,
            ...(forced ? { force: true } : {}),
          });
          results[row.id] = { state: 'applied' };
          propsRef.current.onApplied?.({
            locale: row.locale,
            key: row.key,
            previousValue: row.from ?? '',
            nextValue: row.to,
          });
        } catch (err) {
          results[row.id] = {
            state: 'failed',
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Plan again against the files as they are now.
      const targetsNow = await loadTargets(propsRef.current, opened.set, opened.sourceLocale);
      if (reviewRef.current !== current) return;
      if (targetsNow.get(opened.sourceLocale)) {
        const rows = buildReviewRows({
          set: opened.set,
          sourceLocale: opened.sourceLocale,
          targets: targetsNow,
          t,
        });
        const rebuilt: ReviewState = { ...opened, rows };
        reviewRef.current = { review: rebuilt, targets: targetsNow };
        setReview(rebuilt);
      }
      setApplyResults(results);
    } finally {
      setIsApplying(false);
    }
  }, []);

  const focusOn = useCallback((k: string | null) => {
    setFocusKey(k);
    setFocusSeq((n) => n + 1);
  }, []);

  const closeReview = useCallback(() => {
    requestRef.current++;
    reviewRef.current = null;
    // A closed link may be imported again.
    openedRef.current.clear();
    setApplyResults({});
    setReview(null);
    setError(null);
    setFocusKey(null);
    setIsLoading(false);
    setOpenedFromHash(false);
    if (window.location.hash.startsWith(LINK_HASH_PREFIX)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    propsRef.current.reloadFrame();
  }, []);

  return {
    review,
    error,
    isLoading,
    openedFromHash,
    isActive: review !== null || (openedFromHash && (isLoading || error !== null)),
    focusKey,
    focusSeq,
    setFocusKey: focusOn,
    openReview,
    closeReview,
    applyLocal,
    applyResults,
    isApplying,
  };
}
