import { useState, useEffect, useCallback } from 'react';
import { APP_ORIGIN } from '../constants.js';

// Helper to flatten nested JSON objects to dot-separated keys
function flattenObject(obj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (!obj || typeof obj !== 'object') return result;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, flattenObject(obj[key], newKey));
      } else {
        result[newKey] = String(obj[key]);
      }
    }
  }
  return result;
}

export interface UseLocaleDataParams {
  connectionStatus: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

/**
 * Owns all translation data: active locale, locales list, full dictionaries,
 * keys metadata, fetchers, and derived coverage percentage.
 */
export const useLocaleData = ({ connectionStatus, iframeRef }: UseLocaleDataParams) => {
  const [locale, setLocale] = useState<string>('en');

  // Dynamic locales list state
  const [locales, setLocales] = useState<string[]>([]);
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [codeKeys, setCodeKeys] = useState<string[]>([]);

  // Phase 2: Full locale keys searchable state
  const [localeData, setLocaleData] = useState<Record<string, string>>({});
  const [enLocaleData, setEnLocaleData] = useState<Record<string, string>>({});

  // Fetch locales list dynamically from the server
  const fetchLocales = useCallback(async (selectDefault?: boolean) => {
    try {
      const response = await fetch(`${APP_ORIGIN}/api/i18n-lens/mutate`);
      if (!response.ok) {
        throw new Error(`Failed to load locales: ${response.statusText}`);
      }
      const list = await response.json();
      if (Array.isArray(list)) {
        setLocales(list);
        if (selectDefault && list.length > 0) {
          setLocale((prev) =>
            list.includes(prev) ? prev : list.includes('en') ? 'en' : list[0] || 'en'
          );
        }
      }
    } catch (err: any) {
      console.warn('[i18n-lens] Failed to fetch locales list:', err.message);
    }
  }, []);

  // Fetch all keys from locales and codebase
  const fetchKeysMetadata = useCallback(async () => {
    try {
      const response = await fetch(`${APP_ORIGIN}/api/i18n-lens/mutate?action=keys`);
      if (!response.ok) {
        throw new Error(`Failed to load keys metadata: ${response.statusText}`);
      }
      const data = await response.json();
      if (data && Array.isArray(data.allKeys)) {
        setAllKeys(data.allKeys);
      }
      if (data && Array.isArray(data.codeKeys)) {
        setCodeKeys(data.codeKeys);
      }
    } catch (err: any) {
      console.warn('[i18n-lens] Failed to fetch keys metadata:', err.message);
    }
  }, []);

  // Fetch full dictionary for active locale (Phase 2)
  const fetchLocaleData = useCallback(async (targetLocale: string) => {
    try {
      const response = await fetch(`${APP_ORIGIN}/api/i18n-lens/mutate?locale=${targetLocale}`);
      if (!response.ok) {
        throw new Error(`Failed to load locale dictionary: ${response.statusText}`);
      }
      const data = await response.json();
      setLocaleData(flattenObject(data));
    } catch (err: any) {
      // Don't block studio UI if fetch fails
      console.warn('[i18n-lens] Failed to load full locale dictionary:', err.message);
    }
  }, []);

  // Fetch locales and then fetch dictionary when connection is successful or when locale changes
  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetchLocales(true);
      fetchKeysMetadata();
    }
  }, [connectionStatus, fetchLocales, fetchKeysMetadata]);

  useEffect(() => {
    if (connectionStatus === 'connected' && locale) {
      fetchLocaleData(locale);
    }
  }, [connectionStatus, locale, fetchLocaleData]);

  // Fetch English reference data once connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetch(`${APP_ORIGIN}/api/i18n-lens/mutate?locale=en`)
        .then((res) => res.json())
        .then((data) => setEnLocaleData(flattenObject(data)))
        .catch((err) =>
          console.warn('[i18n-lens] Failed to load reference English locale:', err.message)
        );
    }
  }, [connectionStatus]);

  // Keep English reference in sync if the active locale is English and gets updated
  useEffect(() => {
    if (locale === 'en') {
      setEnLocaleData(localeData);
    }
  }, [locale, localeData]);

  // Set the locale inside state and URL query parameter if required
  const handleLocaleChange = useCallback(
    (newLocale: string) => {
      setLocale(newLocale);
      if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
          const url = new URL(iframeRef.current.src);
          url.searchParams.set('locale', newLocale);
          iframeRef.current.src = url.toString();
        } catch {}
      }
    },
    [iframeRef]
  );

  // Refresh the locales list, keys metadata, and active dictionary
  const refreshAll = useCallback(async () => {
    await fetchLocales();
    await fetchKeysMetadata();
    await fetchLocaleData(locale);
  }, [fetchLocales, fetchKeysMetadata, fetchLocaleData, locale]);

  // Update the local dictionary cache after a successful save
  const updateLocaleDataCache = useCallback((key: string, value: string) => {
    setLocaleData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // Feature 3: Translation coverage — percentage of all project keys that have
  // a non-empty value in the current locale.
  const totalKeys = allKeys.length;
  const translatedKeys = allKeys.filter((key) => {
    const val = localeData[key];
    return val !== undefined && val.trim() !== '';
  }).length;
  const coveragePercentage = totalKeys > 0 ? Math.round((translatedKeys / totalKeys) * 100) : 100;

  return {
    locale,
    setLocale,
    locales,
    allKeys,
    codeKeys,
    localeData,
    enLocaleData,
    coveragePercentage,
    handleLocaleChange,
    fetchLocales,
    fetchKeysMetadata,
    fetchLocaleData,
    refreshAll,
    updateLocaleDataCache,
  };
};
