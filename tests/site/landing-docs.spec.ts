import { test, expect } from '@playwright/test';

test('sends every Docs link to the docs, not the README', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('a[href*="#readme"]')).toHaveCount(0);
  await expect(page.locator('.site-nav').getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'docs/'
  );
  await expect(page.locator('.site-footer').getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'docs/'
  );
  await page.locator('.site-nav').getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/livelocale\/docs\/$/);
});

test('claims only what init and the install do in 0.11.0', async ({ page }) => {
  await page.goto('./');
  const story = page.locator('#developer');
  await expect(story).toContainText('npm i livelocale');
  await expect(story).not.toContainText(/npm i -D|dev dependency|beside next dev or vite/);
  await expect(story).toContainText('on Vite you add the plugin');
});
