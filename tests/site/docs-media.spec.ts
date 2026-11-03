import { test, expect, type Page } from '@playwright/test';

// The page that carries a DocShot and a DocClip below the fold.
const PAGE = 'docs/index.html';
const CLIP = '.doc-clip';

const isClipFile = (url: string) => /\.(webm|mp4)(\?|$)/.test(url);
const paused = (page: Page) =>
  page.locator(`${CLIP} video`).evaluate((v: HTMLVideoElement) => v.paused);

test('loads no clip before it nears the screen', async ({ page }) => {
  const clipRequests: string[] = [];
  page.on('request', (r) => {
    if (isClipFile(r.url())) clipRequests.push(r.url());
  });
  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  // The clip starts well below the fold plus the 200px the observer looks ahead.
  const top = await page.locator(CLIP).evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(page.viewportSize()!.height + 200);
  expect(clipRequests).toEqual([]);
  const video = page.locator(`${CLIP} video`);
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('poster', /\.poster\.[\w-]+\.webp$/);
  expect(await video.evaluate((v: HTMLVideoElement) => v.autoplay)).toBe(false);
  await expect(page.locator(`${CLIP} source[src]`)).toHaveCount(0);
  await expect(page.locator('.doc-shot img')).toHaveAttribute('loading', 'lazy');
});

test('plays a clip on screen and pauses it from the keyboard', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator(CLIP).scrollIntoViewIfNeeded();
  await expect.poll(() => paused(page), { timeout: 8000 }).toBe(false);
  const pause = page.getByRole('button', { name: 'Pause clip' });
  const box = (await pause.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await pause.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => paused(page)).toBe(true);
  await expect(page.getByRole('button', { name: 'Play clip' })).toBeVisible();
  // a clip the reader paused stays paused when it scrolls away and back
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator(CLIP).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  expect(await paused(page)).toBe(true);
});

test.describe('reduced motion', () => {
  // reducedMotion is a context option, not a top-level test option
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('keeps a clip on its poster under reduced motion', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator(CLIP).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    const video = page.locator(`${CLIP} video`);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true
    );
    expect(await paused(page)).toBe(true);
    expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(0);
    await expect(video).toHaveAttribute('poster', /\.poster\.[\w-]+\.webp$/);
    await expect(page.getByRole('button', { name: 'Play clip' })).toBeVisible();
  });
});
