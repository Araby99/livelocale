import { expect, test, type FrameLocator, type Page } from '@playwright/test';

// The static share fixture (playground-vite built with `share: true`). Its page has a line with
// literal text before the translation in one text node (`© 2026 …`, as Astro renders it) and a
// rich-text value rendered as HTML (as Astro's set:html renders it).
const SHARE = 'http://localhost:3020/livelocale/index.html';
const RICH = 'Edit text <strong>right on the page</strong>, then send it.';

const frame = (page: Page): FrameLocator => page.frameLocator('#app-preview-iframe');
const input = (page: Page) => page.locator('#studio-translation-input');

/** Text with every watermark (U+200B to U+200D) removed. */
const visible = (text: string | null) => (text ?? '').replace(/[\u200B-\u200D]/g, '');

async function openStudio(page: Page): Promise<void> {
  await page.goto(SHARE);
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
}

/** The language picker a share link may ask for before the first edit. */
async function chooseEnglishIfAsked(page: Page): Promise<void> {
  const picker = page.getByRole('dialog', { name: 'Which language are you editing?' });
  const asked = await picker.waitFor({ timeout: 1_500 }).then(
    () => true,
    () => false
  );
  if (asked) await picker.getByRole('button', { name: 'en', exact: true }).click();
}

test('Alt+Click picks a translation that follows literal text, and the preview keeps that text', async ({
  page,
}) => {
  await openStudio(page);
  const line = frame(page).locator('#copyright');
  await expect(line).toHaveAttribute('data-i18n-key', 'home.copyright', { timeout: 15_000 });

  await line.click({ modifiers: ['Alt'] });
  await chooseEnglishIfAsked(page);
  await expect(input(page)).toHaveValue('The static playground');

  await input(page).fill('A new footer');
  await expect.poll(async () => visible(await line.textContent())).toBe('© 2026 A new footer');

  await page.getByRole('button', { name: 'Clear Selection' }).click();
  const discard = page.getByRole('button', { name: 'Discard Edits' });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await expect
    .poll(async () => visible(await line.textContent()))
    .toBe('© 2026 The static playground');
});

test('a rich-text value starts from its markup and previews as markup', async ({ page }) => {
  await openStudio(page);
  const rich = frame(page).locator('#rich');
  await expect(rich).toHaveAttribute('data-i18n-key', 'home.rich', { timeout: 15_000 });
  const before = await rich.innerHTML();

  await rich.click({ modifiers: ['Alt'] });
  await chooseEnglishIfAsked(page);
  await expect(input(page)).toHaveValue(RICH);

  await input(page).fill('Change it <strong>here</strong> <em>today</em>.');
  await expect(rich.locator('strong')).toHaveText('here');
  await expect(rich.locator('em')).toHaveText('today');
  await expect.poll(async () => visible(await rich.textContent())).toBe('Change it here today.');

  await input(page).fill(
    '<img src=x onerror="document.title=\'pwned\'">Safe <b onclick="x()">text</b>'
  );
  await expect(rich.locator('b')).toHaveText('text');
  await expect(rich.locator('img, [onclick], [onerror]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear Selection' }).click();
  const discard = page.getByRole('button', { name: 'Discard Edits' });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await expect.poll(() => rich.innerHTML()).toBe(before);
  expect(await rich.evaluate(() => document.title)).not.toBe('pwned');
});
