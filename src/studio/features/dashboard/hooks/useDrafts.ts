import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Draft } from '../../../transport/drafts.js';
import {
  DRAFTS_CHANGED_EVENT,
  type ReconcileResult,
  type StaticTransport,
} from '../../../transport/static.js';

/** The header counter's text: '1 change not sent' or '<n> changes not sent'. */
export function unsentLabel(n: number): string {
  return n === 1 ? '1 change not sent' : `${n} changes not sent`;
}

/**
 * The share link's saved drafts, reloaded whenever the transport announces a
 * change. Without a transport (server stacks) it holds nothing and calls nothing.
 * `liveNow` holds drafts the rebuilt site already shows, until dismissed.
 */
export function useDrafts(transport: StaticTransport | null) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [liveNow, setLiveNow] = useState<Draft[]>(() => transport?.initialReconcile?.live ?? []);

  const noteReconcile = useCallback((result: ReconcileResult) => {
    if (result.live.length > 0) setLiveNow((current) => [...current, ...result.live]);
  }, []);

  const dismissLiveNow = useCallback(() => setLiveNow([]), []);

  const refresh = useCallback(async () => {
    if (!transport) return;
    setDrafts(await transport.listDrafts());
  }, [transport]);

  useEffect(() => {
    if (!transport) return;
    let active = true;
    const load = () => {
      transport
        .listDrafts()
        .then((list) => {
          if (active) setDrafts(list);
        })
        .catch(() => {});
    };
    load();
    transport.events.addEventListener(DRAFTS_CHANGED_EVENT, load);
    return () => {
      active = false;
      transport.events.removeEventListener(DRAFTS_CHANGED_EVENT, load);
    };
  }, [transport]);

  const discard = useCallback(
    async (d: Draft): Promise<Draft | undefined> => transport?.discardDraft(d.locale, d.key),
    [transport]
  );

  const markSent = useCallback(
    async (ds: readonly Draft[]): Promise<void> => {
      if (!transport) return;
      await transport.markDraftsSent(ds.map(({ locale, key }) => ({ locale, key })));
    },
    [transport]
  );

  const { unsentCount, sentCount } = useMemo(() => {
    const unsent = drafts.filter((d) => d.status === 'unsent').length;
    return { unsentCount: unsent, sentCount: drafts.length - unsent };
  }, [drafts]);

  return {
    drafts,
    unsentCount,
    sentCount,
    refresh,
    discard,
    markSent,
    liveNow,
    noteReconcile,
    dismissLiveNow,
  };
}
