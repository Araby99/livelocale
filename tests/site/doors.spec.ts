import { test, expect } from '@playwright/test';

test('opens on the developer door and switches by click, keeping the hash @cross', async ({
  page,
}) => {
  await page.goto('./');
  const developer = page.locator('#developer');
  const fixer = page.locator('#fixer');
  await expect(page.getByRole('radio', { name: 'I ship the site' })).toBeChecked();
  await expect(developer).toBeVisible();
  await expect(fixer).toBeHidden();
  await page.getByRole('radio', { name: 'I fix the text' }).click();
  await expect(page.getByRole('radio', { name: 'I fix the text' })).toBeChecked();
  await expect(fixer).toBeVisible();
  await expect(developer).toBeHidden();
  expect(new URL(page.url()).hash).toBe('#fixer');
  await expect(
    fixer.getByRole('heading', { name: 'Hold Alt and click the wrong text' })
  ).toBeVisible();
});

test('switches with the arrow keys @cross', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('radio', { name: 'I ship the site' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'I fix the text' })).toBeChecked();
  await expect(page.locator('#fixer')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#fixer');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#developer')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#developer');
});

test('ends each door on its own close: npx for the developer, the live demo for the fixer', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Start in two minutes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fix your first string now' })).toBeHidden();
  await page.getByRole('radio', { name: 'I fix the text' }).click();
  await expect(page.getByRole('heading', { name: 'Start in two minutes' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Fix your first string now' })).toBeVisible();
  const primary = page.locator('.start .button-patch');
  await expect(primary).toHaveText('Open the live demo');
  await expect(primary).toHaveAttribute('href', 'demo/livelocale/index.html');
  await expect(primary).toHaveCSS('background-color', 'rgb(255, 178, 36)');
  await expect(page.locator('#fixer img[src*="send-"]')).toBeVisible();
});

test('opens the door a link names', async ({ page }) => {
  await page.goto('./#fixer');
  await expect(page.getByRole('radio', { name: 'I fix the text' })).toBeChecked();
  await expect(page.locator('#fixer')).toBeVisible();
  await expect(page.locator('#developer')).toBeHidden();
});

test('copies the install command with a real copied state', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  const copy = page.locator('.hero [data-copy]');
  await copy.click();
  await expect(copy).toHaveAttribute('data-state', 'copied');
  await expect(copy.locator('.cmd-label')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npx livelocale init');
  await expect(page.locator('[data-announcer]')).toHaveText('Copied npx livelocale init');
});
