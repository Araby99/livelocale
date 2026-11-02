import { expect, type Page } from '@playwright/test';

/** Alt+Clicks [data-i18n-key="<key>"] in #app-preview-iframe, fills #studio-translation-input with `value`,
 *  clicks #studio-save-button and waits for [data-testid="save-success"]. */
export async function editKey(page: Page, key: string, value: string): Promise<void> {
  await page
    .frameLocator('#app-preview-iframe')
    .locator(`[data-i18n-key="${key}"]`)
    .click({ modifiers: ['Alt'] });
  await page.locator('#studio-translation-input').fill(value);
  await page.locator('#studio-save-button').click();
  await expect(page.locator('[data-testid="save-success"]')).toBeVisible();
}
