import { test, expect, type Page } from '@playwright/test';

const video = (page: Page) => page.locator('[data-demo] video');
const playing = (page: Page) => video(page).evaluate((v: HTMLVideoElement) => !v.paused);
// Autoplay waits about 2 s after load and for an idle moment; this covers the hold on a slow host.
const afterHold = { timeout: 8000 };

test('marks the video up to stay light, with a preloaded poster per cut @cross', async ({
  page,
}) => {
  await page.goto('./');
  const attrs = await video(page).evaluate((v: HTMLVideoElement) => ({
    muted: v.hasAttribute('muted'),
    loop: v.hasAttribute('loop'),
    playsinline: v.hasAttribute('playsinline'),
    preload: v.getAttribute('preload'),
  }));
  expect(attrs).toMatchObject({ muted: true, loop: true, playsinline: true, preload: 'none' });
  const wide = await page.locator('[data-demo] .poster img').getAttribute('src');
  const phone = await page.locator('[data-demo] .poster source').getAttribute('srcset');
  expect(wide).toMatch(/^\/livelocale\/assets\/poster-[\w-]+\.webp$/);
  expect(phone).toMatch(/^\/livelocale\/assets\/poster-phone-[\w-]+\.webp$/);
  const preloads = page.locator('link[rel="preload"][as="image"]');
  await expect(preloads).toHaveCount(2);
  await expect(preloads.nth(0)).toHaveAttribute('href', phone!);
  await expect(preloads.nth(0)).toHaveAttribute('media', '(max-width: 639px)');
  await expect(preloads.nth(1)).toHaveAttribute('href', wide!);
  await expect(preloads.nth(1)).toHaveAttribute('media', '(min-width: 640px)');
  for (const p of await preloads.all()) await expect(p).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('[data-demo] .window-address')).toHaveText('tidewell.example/pricing');
  await expect(page.locator('[data-demo] .window-dots')).toHaveCount(0);
  await expect(page.locator('.transcript summary')).toHaveText('What the video shows');
  await expect(page.getByText('Tidewell is a fictional demo site')).toBeAttached();
});

test('fetches no video until about 2 s after the page has loaded, then plays by itself @cross', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit has no Safari media codecs; real Safari is checked on a phone in LAUNCH.md'
  );
  const requests: { url: string; at: number }[] = [];
  let loadedAt = Infinity;
  page.on('load', () => (loadedAt = Date.now()));
  page.on('request', (r) => {
    if (/\.(webm|mp4)/.test(r.url())) requests.push({ url: r.url(), at: Date.now() });
  });
  await page.goto('./', { waitUntil: 'load' });
  // The hold: the poster stays the only hero image through load and for about 2 s after it.
  await page.waitForTimeout(1500);
  expect(requests).toEqual([]);
  await expect
    .poll(
      () => video(page).evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.5),
      afterHold
    )
    .toBe(true);
  expect(requests[0]!.at - loadedAt).toBeGreaterThanOrEqual(1900);
  await expect(page.locator('[data-playback]')).toHaveText('Pause');
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-started', '');
  await expect(page.locator('[data-demo] .poster img')).toHaveCSS('opacity', '0');
});

test('starts at once from a chapter chip or Play during the hold', async ({ page }) => {
  await page.goto('./', { waitUntil: 'load' });
  await page.getByRole('button', { name: /Get a pull request/ }).click();
  await expect(video(page).locator('source')).toHaveCount(2, { timeout: 500 });
  await expect.poll(() => playing(page), { timeout: 1500 }).toBe(true);

  await page.goto('./', { waitUntil: 'load' });
  const button = page.locator('[data-playback]');
  await button.click(); // Pause before the hold ends: it stays still
  await page.waitForTimeout(2500);
  await expect(video(page).locator('source')).toHaveCount(0);
  await expect(button).toHaveText('Play');
  await button.click();
  await expect(video(page).locator('source')).toHaveCount(2, { timeout: 500 });
  await expect.poll(() => playing(page), { timeout: 1500 }).toBe(true);
});

test('fits the playing video, its chips and the pause button in a 1440 x 900 screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  for (const sel of [
    '[data-demo] .screen',
    '.chapters',
    '[data-playback]',
    '.hero-proof',
    '.hero-next',
  ]) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.y + box.height, sel).toBeLessThanOrEqual(900);
  }
  expect((await page.locator('.doors').boundingBox())!.y).toBeLessThan(900);
});

/** Each chip's visible title. */
const chipTitles = (page: Page) =>
  page
    .locator('.chapter .chapter-title')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.trim()));

test('plays the tall phone take on a phone and the wide 2:1 cut on a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentSrc), afterHold)
    .toMatch(/hero-phone-[\w-]+\.mp4$/);
  expect(await chipTitles(page)).toEqual([
    'Tap the text',
    'Fix it in every language',
    'Get a pull request',
  ]);
  await expect(page.getByRole('button', { name: /Tap the text/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Alt\+Click/ })).toHaveCount(0);
  const phone = (await page.locator('[data-demo] .screen').boundingBox())!;
  expect(phone.width / phone.height).toBeCloseTo(390 / 844, 2);
  await expect(page.locator('[data-demo] .window-bar')).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentSrc), afterHold)
    .toMatch(/hero-wide-[\w-]+\.mp4$/);
  expect(await chipTitles(page)).toEqual([
    'Alt+Click the text',
    'Fix it in every language',
    'Get a pull request',
  ]);
  const desk = (await page.locator('[data-demo] .screen').boundingBox())!;
  expect(desk.width / desk.height).toBeCloseTo(2, 1);
  await expect(page.locator('[data-demo] .window-address')).toBeVisible();
});

test('frames the phone take as a phone within 70% of the screen height, the door switch peeking under it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const frame = page.locator('[data-demo] .window');
  const box = (await frame.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(844 * 0.7 + 2);
  expect(box.height).toBeGreaterThan(844 * 0.6);
  expect(Math.abs(box.x + box.width / 2 - 195)).toBeLessThanOrEqual(1);
  expect(await frame.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('20px');
  // Scrolled to the frame, the whole phone, its chips, the play button and the door switch show.
  await frame.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY));
  for (const sel of ['[data-demo] .window', '.chapters', '[data-playback]']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.y + b.height, sel).toBeLessThanOrEqual(844);
  }
  expect((await page.locator('.doors').boundingBox())!.y).toBeLessThan(844);
});

test('keeps the phone frame inside a 360 px screen with no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('./');
  const box = (await page.locator('[data-demo] .window').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(360 - 16);
  expect(box.height).toBeLessThanOrEqual(780 * 0.7 + 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('seeks to the phone chapter times on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const chip = page.getByRole('button', { name: /Get a pull request/ });
  const start = Number(await chip.getAttribute('data-start-phone'));
  expect(start).toBeLessThan(Number(await chip.getAttribute('data-start')));
  await chip.click();
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentSrc))
    .toMatch(/hero-phone-[\w-]+\.mp4$/);
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(start);
  await expect(chip).toHaveAttribute('aria-current', 'step');
});

test('swaps the take and its chapters across the 640 px breakpoint and keeps playing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const chip = page.getByRole('button', { name: /Get a pull request/ });
  await chip.click();
  await expect.poll(() => playing(page)).toBe(true);
  // the wider layout moves the video; bring it back on screen, where it plays
  await page.setViewportSize({ width: 1440, height: 900 });
  await video(page).scrollIntoViewIfNeeded();
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentSrc))
    .toMatch(/hero-wide-[\w-]+\.mp4$/);
  await expect(video(page).locator('source')).toHaveCount(2);
  await expect.poll(() => playing(page)).toBe(true);
  const wideStart = Number(await chip.getAttribute('data-start'));
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThanOrEqual(wideStart);
  await expect(chip).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: /Alt\+Click the text/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await video(page).scrollIntoViewIfNeeded();
  await expect
    .poll(() => video(page).evaluate((v: HTMLVideoElement) => v.currentSrc))
    .toMatch(/hero-phone-[\w-]+\.mp4$/);
  await expect.poll(() => playing(page)).toBe(true);
  await expect(chip).toHaveAttribute('aria-current', 'step');
});

test('shows the poster again when the breakpoint is crossed while paused', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: /Get a pull request/ }).click();
  await expect.poll(() => playing(page)).toBe(true);
  await page.locator('[data-playback]').click();
  await expect.poll(() => playing(page)).toBe(false);
  await expect(page.locator('[data-demo]')).toHaveAttribute('data-started', '');

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect
    .poll(() =>
      video(page).evaluate((v: HTMLVideoElement) => v.currentSrc || v.querySelector('source')?.src)
    )
    .toMatch(/hero-wide-[\w-]+\.mp4$/);
  await expect(page.locator('[data-demo]')).not.toHaveAttribute('data-started');
  await expect(page.locator('[data-demo] .poster img')).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-playback]')).toHaveText('Play');
});

test('attaches mp4 then webm, plays, and pauses from the visible button @cross', async ({
  page,
}) => {
  await page.goto('./');
  await expect(video(page).locator('source')).toHaveCount(2, afterHold);
  expect(
    await video(page)
      .locator('source')
      .evaluateAll((s) => s.map((e) => (e as HTMLSourceElement).type))
  ).toEqual(['video/mp4', 'video/webm']);
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

test('seeks from a chapter chip and marks it current @cross', async ({ page, browserName }) => {
  test.skip(
    browserName === 'webkit',
    'Playwright WebKit has no Safari media codecs; real Safari is checked on a phone in LAUNCH.md'
  );
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
  await expect.poll(() => playing(page), afterHold).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => playing(page)).toBe(false);
});

// On a slow connection play() is still pending when the hero scrolls away; pause() then rejects it
// with an AbortError, which is not the browser refusing autoplay, so coming back resumes the video.
test('resumes when a slow-loading video scrolls away and back', async ({ page }) => {
  await page.route(/\.(mp4|webm)(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.goto('./');
  await expect(video(page).locator('source')).toHaveCount(2, afterHold);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => playing(page)).toBe(false);
  await page.waitForTimeout(500);
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => playing(page), { timeout: 10_000 }).toBe(true);
  await expect(page.locator('[data-playback]')).toHaveText('Pause');
});

test.describe('with reduced motion', () => {
  test('never autoplays: poster and a Play button until asked @cross', async ({ page }) => {
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

  test('keeps the phone poster on a phone, with nothing fetched', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    await expect(video(page).locator('source')).toHaveCount(0);
    const poster = page.locator('[data-demo] .poster img');
    await expect(poster).toBeVisible();
    await expect(poster).toHaveCSS('opacity', '1');
    expect(await poster.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(
      /poster-phone-[\w-]+\.webp$/
    );
    await expect(page.locator('[data-playback]')).toHaveText('Play');
  });
});
