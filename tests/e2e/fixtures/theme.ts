import type { Page } from '@playwright/test';

// Call watchDark(page) before page.goto.
/** Records whether the root carried `dark` at any point, and whether it did when #root first got content. */
export const watchDark = (page: Page) =>
  page.addInitScript(() => {
    const w = window as any;
    w.__sawDark = false;
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('dark')) w.__sawDark = true;
      const root = document.getElementById('root');
      if (root && root.childElementCount > 0 && w.__darkAtFirstRender === undefined)
        w.__darkAtFirstRender = document.documentElement.classList.contains('dark');
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });

export const seen = (page: Page, name: '__sawDark' | '__darkAtFirstRender') =>
  page.evaluate((n) => (window as any)[n], name);
