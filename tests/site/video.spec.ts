import { test, expect, type Page } from '@playwright/test';

const video = (page: Page) => page.locator('[data-demo] video');
const playing = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => !v.paused);

test('marks the video up to stay light until it is needed', async ({ page }) => {
  await page.goto('./');
  const attrs = await video(page).evaluate((v: HTMLVideoElement) => ({
    muted: v.hasAttribute('muted'),
    loop: v.hasAttribute('loop'),
    playsinline: v.hasAttribute('playsinline'),
    preload: v.getAttribute('preload'),
    poster: v.getAttribute('poster'),
  }));
  expect(attrs).toMatchObject({ muted: true, loop: true, playsinline: true, preload: 'none' });
  expect(attrs.poster).toMatch(/^\/livelocale\/assets\/poster-.*\.webp$/);
  const preload = page.locator('link[rel="preload"][as="image"]');
  await expect(preload).toHaveAttribute('href', attrs.poster!);
  await expect(preload).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('[data-demo] .window-address')).toHaveText('tidewell.example/pricing');
  await expect(page.getByText('Demo site: Tidewell (fictional)')).toBeVisible();
  await expect(page.locator('.transcript summary')).toHaveText('What the video shows');
});

test('attaches webm then mp4 after load, plays, and pauses from the visible button', async ({
  page,
}) => {
  await page.goto('./');
  await expect(video(page).locator('source')).toHaveCount(2);
  expect(
    await video(page)
      .locator('source')
      .evaluateAll((s) => s.map((e) => (e as HTMLSourceElement).type))
  ).toEqual(['video/webm', 'video/mp4']);
  await expect.poll(() => playing(page)).toBe(true);
  const button = page.locator('[data-playback]');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('Pause');
  await button.click();
  await expect.poll(() => playing(page)).toBe(false);
  await expect(button).toHaveText('Play');
  await button.click();
  await expect.poll(() => playing(page)).toBe(true);
});

test('seeks from a chapter chip and marks it current', async ({ page }) => {
  await page.goto('./');
  const chip = page.getByRole('button', { name: /Get a pull request/ });
  await chip.click();
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(10.63);
  await expect(chip).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: /Alt\+Click the text/ })).not.toHaveAttribute(
    'aria-current',
    'step'
  );
});

test('pauses when the video scrolls off screen', async ({ page }) => {
  await page.goto('./');
  await expect.poll(() => playing(page)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => playing(page)).toBe(false);
});

test.describe('with reduced motion', () => {
  test('never autoplays: poster and a Play button until asked', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true
    );
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500);
    await expect(video(page).locator('source')).toHaveCount(0);
    expect(await playing(page)).toBe(false);
    await expect(page.locator('[data-playback]')).toHaveText('Play');
    await page.locator('[data-playback]').click();
    await expect.poll(() => playing(page)).toBe(true);
  });
});
