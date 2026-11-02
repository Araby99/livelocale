import type { Page } from '@playwright/test';

/** Selectors that exist once an island has mounted (Tasks 9 and 14 append to this list). */
export const ISLAND_READY: string[] = [];
ISLAND_READY.push('[data-island] [role="slider"]');
ISLAND_READY.push('[data-mistake][tabindex]');

/**
 * Scrolls from the top to the bottom one viewport at a time, one animation frame per step, so
 * every `loadWhenNear` island fires; then waits for each island to mount and the network to idle.
 */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const bottom = () => document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y < bottom(); y += innerHeight) {
      scrollTo(0, y);
      await nextFrame();
    }
    scrollTo(0, bottom());
    await nextFrame();
  });
  for (const selector of ISLAND_READY) {
    await page.locator(selector).first().waitFor({ state: 'attached' });
  }
  await page.waitForLoadState('networkidle');
}
