import { test, expect, type Page } from '@playwright/test';
import { SIDEBAR } from '../../site/src/lib/docs-config';

// The Studio guide carries DocShots and the arabic-switch DocClip below the fold.
const PAGE = 'docs/guides/studio.html';
const CLIP = '.doc-clip';
const POSTER = /arabic-switch\.poster\.[\w-]+\.webp$/;

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
  await expect(video).toHaveAttribute('poster', POSTER);
  expect(await video.evaluate((v: HTMLVideoElement) => v.autoplay)).toBe(false);
  await expect(page.locator(`${CLIP} source[src]`)).toHaveCount(0);
  // the page's lead shot is in the first screen and loads at once; every other shot waits
  await expect(page.locator('.doc-shot[data-lead] img')).toHaveAttribute('loading', 'eager');
  const shots = await page.locator('.doc-shot:not([data-lead]) img').all();
  expect(shots.length).toBeGreaterThan(0);
  for (const shot of shots) await expect(shot).toHaveAttribute('loading', 'lazy');
});

// Every Get started and Guide page opens with the product: a real capture from the docs media,
// whole inside the first 1440 x 900 screen.
const OPENING = SIDEBAR.filter((g) => ['Get started', 'Guides'].includes(g.text)).flatMap((g) =>
  g.items.map((i) => i.link)
);

for (const link of OPENING) {
  test(`opens ${link} with a product capture in the first screen`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`docs${link.endsWith('/') ? link : link + '.html'}`);
    const media = page.locator('.doc-shot img, .doc-clip video').first();
    await expect(media).toBeVisible();
    const src = await media.evaluate((el) =>
      el instanceof HTMLVideoElement ? el.poster : (el as HTMLImageElement).src
    );
    expect(src).toMatch(/\/docs\/assets\/[\w.-]+\.webp$/);
    const box = (await media.boundingBox())!;
    expect(box.y, link).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, link).toBeLessThanOrEqual(900);
  });
}

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
    await expect(video).toHaveAttribute('poster', POSTER);
    await expect(page.getByRole('button', { name: 'Play clip' })).toBeVisible();
  });
});
