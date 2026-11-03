import { test, expect } from '@playwright/test';

// The landing sections shared by both doors, below the two stories.

test('shows the Arabic section below the stories for both doors', async ({ page }) => {
  for (const hash of ['', '#fixer']) {
    await page.goto(`./${hash}`);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Arabic, right to left, done properly' })
    ).toBeVisible();
  }
});

test('keeps the Arabic clip off the first paint', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./', { waitUntil: 'load' });
  expect(urls.filter((u) => /arabic-switch/.test(u) && !/poster/.test(u))).toEqual([]);
  const video = page.locator('#arabic video');
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('playsinline', '');
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted && !v.autoplay && !!v.poster)).toBe(
    true
  );
  await expect(page.locator('#arabic').getByRole('button', { name: /clip/ })).toBeAttached();
});
