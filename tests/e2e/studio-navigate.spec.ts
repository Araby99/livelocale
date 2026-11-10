import { expect, test, type Frame, type Page } from '@playwright/test';

// The static share fixture (playground-vite built with `share: true`): the Studio and
// the app it frames share http://localhost:3020, so the client accepts the Studio's
// messages and NAVIGATE targets on that origin are the app's own pages.
const STATIC = 'http://localhost:3020';

/** Opens the share Studio, gets past the first-run tips, and returns the app's frame. */
async function openStudio(page: Page): Promise<Frame> {
  await page.goto(`${STATIC}/livelocale/index.html`);
  const active = page.getByText('Connected', { exact: true });
  await expect(active).toBeVisible({ timeout: 30_000 });
  const name = page.locator('#studio-tips-name');
  const tipsShown = await name.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false
  );
  if (tipsShown) {
    await name.fill('Sara');
    await page.getByRole('button', { name: 'Start editing' }).click();
    await expect(name).toBeHidden();
  }
  const handle = await page.locator('#app-preview-iframe').elementHandle();
  const frame = await handle!.contentFrame();
  return frame!;
}

/** Posts a NAVIGATE message from the Studio window to the framed app, as the Studio does. */
const navigate = (page: Page, url: string) =>
  page.evaluate(
    ([target, origin]) => {
      const iframe = document.querySelector<HTMLIFrameElement>('#app-preview-iframe')!;
      iframe.contentWindow!.postMessage(
        { source: 'livelocale-studio', type: 'NAVIGATE', payload: { url: target } },
        origin
      );
    },
    [url, STATIC] as const
  );

/** Marks the current document so a reload (a new document) can be told apart. */
const mark = (frame: Frame) =>
  frame.evaluate(() => {
    (window as any).__navMarker = true;
  });
const marked = (frame: Frame) => frame.evaluate(() => (window as any).__navMarker === true);

test.describe('Studio NAVIGATE in the framed app', () => {
  test('reloads the current page when the URL has a #hash', async ({ page }) => {
    const frame = await openStudio(page);
    await frame.evaluate(() => history.pushState(null, '', '/?tab=3#faq'));
    expect(frame.url()).toBe(`${STATIC}/?tab=3#faq`);
    await mark(frame);

    await navigate(page, `${STATIC}/?tab=3#faq`);

    // A fragment-only assign would keep the document (and the marker); a reload drops it.
    await expect.poll(() => marked(frame).catch(() => true), { timeout: 15_000 }).toBe(false);
    expect(frame.url()).toBe(`${STATIC}/?tab=3#faq`);
  });

  test('opens another page on the app origin', async ({ page }) => {
    const frame = await openStudio(page);
    await navigate(page, `${STATIC}/about/`);
    await expect.poll(() => frame.url(), { timeout: 15_000 }).toBe(`${STATIC}/about/`);
  });

  test('ignores a URL on another origin', async ({ page }) => {
    const frame = await openStudio(page);
    const before = frame.url();
    await mark(frame);

    await navigate(page, 'http://localhost:3000/');
    await page.waitForTimeout(1_500);

    expect(frame.url()).toBe(before);
    expect(await marked(frame)).toBe(true);
  });
});
