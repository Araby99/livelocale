'use client';

import { useEffect } from 'react';
import { isLensEnabled } from '../core/env.js';

/**
 * Next-i18n-lens provider component.
 * Dynamically imports next-i18n-lens/client at runtime in the browser
 * when running in development mode.
 *
 * Render this component in your root layout.
 */
export function I18nLensProvider(): null {
  useEffect(() => {
    if (isLensEnabled()) {
      import('../client/index.js').catch((err) => {
        console.error('Failed to load next-i18n-lens client:', err);
      });
    }
  }, []);

  return null;
}

// Alias for backwards compatibility or developer preferences
export const ClientInitializer = I18nLensProvider;
