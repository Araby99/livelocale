'use client';

import { useEffect } from 'react';
import { isLiveLocaleEnabled } from '../core/env.js';

/**
 * LiveLocale provider component.
 * Dynamically imports livelocale/client at runtime in the browser
 * when running in development mode.
 *
 * Render this component in your root layout.
 */
export function LiveLocaleProvider(): null {
  useEffect(() => {
    if (isLiveLocaleEnabled()) {
      import('../client/index.js').catch((err) => {
        console.error('Failed to load livelocale client:', err);
      });
    }
  }, []);

  return null;
}
