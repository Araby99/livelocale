import type { Page } from '@playwright/test';

/**
 * Scrolls from the top to the bottom one viewport at a time, one animation frame per step, so
 * every lazy image and the on-screen video logic fire; then waits for the network to idle.
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
  await page.waitForLoadState('networkidle');
}
