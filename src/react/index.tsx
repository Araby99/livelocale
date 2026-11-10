'use client';

import { useEffect } from 'react';
import { isLiveLocaleEnabled } from '../core/env.js';

/**
 * LiveLocale provider component.
 * Dynamically imports livelocale/client at runtime in the browser
 * when LiveLocale is on (development, or a preview or share build).
 *
 * Render this component in your root layout.
 */
export function LiveLocaleProvider(): null {
  useEffect(() => {
    if (isLiveLocaleEnabled()) {
      // Stays a dynamic import in dist (see tsup.config.ts), so the app's bundler puts the
      // client in a lazy chunk that a production page never downloads while LiveLocale is off.
      import('../client/index.js').catch((err) => {
        console.error('Failed to load livelocale client:', err);
      });
    }
  }, []);

  return null;
}
