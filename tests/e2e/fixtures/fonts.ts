import type { Page } from '@playwright/test';

/** Families of the faces the page actually loaded (status 'loaded'), quotes stripped, sorted, unique. */
export const loadedFaces = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [
      ...new Set(
        [...document.fonts]
          .filter((f) => f.status === 'loaded')
          .map((f) => f.family.replace(/"/g, ''))
      ),
    ].sort()
  );
