import { useState, useMemo } from 'react';
import { isMissingValue } from '../next-missing.js';

export interface UseKeySearchParams {
  allKeys: string[];
  visibleKeys: string[] | null;
  localeData: Record<string, string>;
}

/** Which texts the list shows: all of them, the ones on this page, or the ones still missing. */
export type KeyScope = 'all' | 'page' | 'missing';

/**
 * Owns the searchable keys directory: search term, the scope (All, On this page, Missing),
 * and the filtered key list.
 */
export const useKeySearch = ({ allKeys, visibleKeys, localeData }: UseKeySearchParams) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [scope, setScope] = useState<KeyScope>('all');

  // Every text the edited language still lacks, on any page: the translator's work queue.
  const missingCount = useMemo(
    () => allKeys.filter((key) => isMissingValue(localeData[key])).length,
    [allKeys, localeData]
  );

  // Filter dictionary keys based on search input (Phase 2)
  // Also filter by visible page keys (Feature 2) when the iframe has reported them.
  const filteredKeys = useMemo(() => {
    return allKeys.filter((key) => {
      // Contextual filter: only show keys present on the current page
      if (scope === 'page' && visibleKeys !== null && !visibleKeys.includes(key)) {
        return false;
      }
      if (scope === 'missing' && !isMissingValue(localeData[key])) return false;
      const val = localeData[key] || '';
      return (
        key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        val.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [allKeys, visibleKeys, localeData, searchTerm, scope]);

  return {
    searchTerm,
    setSearchTerm,
    filterPageOnly: scope === 'page',
    // Turning a scope off goes back to All.
    setFilterPageOnly: (on: boolean) => setScope(on ? 'page' : 'all'),
    filterMissing: scope === 'missing',
    setFilterMissing: (on: boolean) => setScope(on ? 'missing' : 'all'),
    missingCount,
    filteredKeys,
  };
};
