import { useState, useMemo } from 'react';

export interface UseKeySearchParams {
  allKeys: string[];
  visibleKeys: string[] | null;
  localeData: Record<string, string>;
}

/**
 * Owns the searchable keys directory: search term, page-scope filter, and
 * the filtered key list.
 */
export const useKeySearch = ({ allKeys, visibleKeys, localeData }: UseKeySearchParams) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterPageOnly, setFilterPageOnly] = useState<boolean>(false);

  // Filter dictionary keys based on search input (Phase 2)
  // Also filter by visible page keys (Feature 2) when the iframe has reported them.
  const filteredKeys = useMemo(() => {
    return allKeys.filter((key) => {
      // Contextual filter: only show keys present on the current page
      if (filterPageOnly && visibleKeys !== null && !visibleKeys.includes(key)) {
        return false;
      }
      const val = localeData[key] || '';
      return (
        key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        val.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [allKeys, visibleKeys, localeData, searchTerm, filterPageOnly]);

  return {
    searchTerm,
    setSearchTerm,
    filterPageOnly,
    setFilterPageOnly,
    filteredKeys,
  };
};
