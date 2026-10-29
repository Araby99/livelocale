import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { encodeChangeLink } from '../../src/core/change-link.js';

const EN_LOCALE_FILE = path.resolve('./playground/locales/en.json');

test.describe('Import change link in the dev Studio', () => {
  let originalContent: string;

  test.beforeEach(async () => {
    // RULE TST-006: snapshot the locale file so it can be restored after the test.
    originalContent = await fs.readFile(EN_LOCALE_FILE, 'utf-8');
  });

  test.afterEach(async () => {
    // RULE TST-006: always restore the original locale file.
    await fs.writeFile(EN_LOCALE_FILE, originalContent, 'utf-8');
  });

  test('applies a pasted change link to the local files', async ({ page }) => {
    // The dev servers may still be compiling the app on the first visit.
    test.setTimeout(120_000);
    const token = await encodeChangeLink({
      branch: '',
      base: '',
      src: 'en',
      by: '',
      note: '',
      edits: [
        {
          locale: 'en',
          key: 'home.welcome_msg',
          from: 'Welcome Back to Production',
          to: 'Welcome back, translator',
          force: false,
        },
      ],
    });

    await page.goto('http://localhost:3010');
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });

    await page.locator('#studio-import-button').click();
    await page.locator('#studio-import-text').fill(token);
    await page.getByRole('button', { name: 'Review changes' }).click();

    const row = page.getByTestId('review-panel').locator('tbody tr', {
      hasText: 'home.welcome_msg',
    });
    await expect(row).toContainText('Ready');

    await page.locator('#studio-apply-local').click();
    await expect(row.getByTestId('apply-result')).toHaveText('Applied');

    const saved = JSON.parse(await fs.readFile(EN_LOCALE_FILE, 'utf-8'));
    expect(saved.home.welcome_msg).toBe('Welcome back, translator');
  });
});
