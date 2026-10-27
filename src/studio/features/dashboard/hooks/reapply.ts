import type { LiveLocaleMode } from '../../../api.js';
import type { Draft } from '../../../transport/drafts.js';
import type { HistoryEntry } from './useHistory.js';

/**
 * The values to push back into the app after a reload or navigation, because a
 * hosted build keeps serving the text it was built with.
 * - `preview`: this session's history for `locale`; the newest entry for a key wins.
 * - `static`: every saved draft for `locale`, sent or not, once the locale is confirmed.
 * - any other mode: nothing.
 */
export function valuesToReapply(input: {
  mode: LiveLocaleMode | null;
  locale: string;
  localeConfirmed: boolean;
  history: readonly HistoryEntry[];
  drafts: readonly Draft[];
}): Map<string, string> {
  const { mode, locale, localeConfirmed, history, drafts } = input;
  const values = new Map<string, string>();
  if (mode === 'preview') {
    // History is newest first: walk it oldest first so the newest value wins.
    for (const entry of [...history].reverse()) {
      if (entry.locale === locale) values.set(entry.key, entry.nextValue);
    }
  } else if (mode === 'static' && localeConfirmed) {
    for (const draft of drafts) {
      if (draft.locale === locale) values.set(draft.key, draft.to);
    }
  }
  return values;
}
