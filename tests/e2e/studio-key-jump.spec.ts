import { devices, expect, test, type FrameLocator, type Page } from '@playwright/test';

// The static share fixture (playground-vite built with `share: true`): a key picked from the
// Keys list opens in the editor and the framed page scrolls to it.
const SHARE = 'http://localhost:3020/livelocale/index.html';

const frame = (page: Page): FrameLocator => page.frameLocator('#app-preview-iframe');
const keyed = (page: Page, key: string) => frame(page).locator(`[data-i18n-key="${key}"]`);
const overlay = (page: Page) => frame(page).locator('#livelocale-highlighter-overlay');
const note = (page: Page) => page.getByTestId('key-jump-note');

/** The Keys list row for `key`; its name starts with the key and goes on with the value. */
const keyRow = (page: Page, key: string) =>
  page.getByTestId('keys-directory').getByRole('button', {
    name: new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
  });

/** Gets past the first-run tips, if they show, with a click or a tap. */
async function dismissTips(page: Page, tap: boolean): Promise<void> {
  const name = page.locator('#studio-tips-name');
  const tipsShown = await name.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false
  );
  if (!tipsShown) return;
  await name.fill('Sara');
  const start = page.locator('#studio-tips-start');
  await (tap ? start.tap() : start.click());
  await expect(name).toBeHidden();
}

/**
 * Makes the page taller than the frame, with the footer far below the fold and room after
 * it, so the page can scroll it to any height.
 */
async function pushFooterDown(page: Page): Promise<void> {
  await expect(keyed(page, 'home.footer')).toBeVisible({ timeout: 15_000 });
  await frame(page)
    .locator('main')
    .evaluate((main) => {
      const spacer = () => {
        const div = document.createElement('div');
        div.style.height = '3000px';
        return div;
      };
      main.insertBefore(spacer(), main.querySelector('footer'));
      main.append(spacer());
    });
}

/** Whether the element with `key` sits fully inside the frame, above `bottomInset` px. */
const inFrameView = (page: Page, key: string, bottomInset = 0) =>
  keyed(page, key).evaluate((el, inset) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight - inset;
  }, bottomInset);

/** The language picker a share link may ask for before the first edit. */
async function chooseLanguageIfAsked(page: Page): Promise<void> {
  const picker = page.getByRole('dialog', { name: 'Which language are you editing?' });
  const asked = await picker.waitFor({ timeout: 1_500 }).then(
    () => true,
    () => false
  );
  if (asked) {
    await picker.getByRole('button', { name: 'en', exact: true }).click();
  }
}

test.describe('desktop', () => {
  async function openStudio(page: Page): Promise<void> {
    await page.goto(SHARE);
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 30_000 });
    await dismissTips(page, false);
  }

  test('a click on a key opens it and scrolls the page to its text, outlined', async ({ page }) => {
    await openStudio(page);
    await pushFooterDown(page);
    expect(await inFrameView(page, 'home.footer')).toBe(false);

    await keyRow(page, 'home.footer').click();
    await chooseLanguageIfAsked(page);

    await expect(page.locator('#studio-translation-input')).toHaveValue('Made with care in Cairo');
    await expect.poll(() => inFrameView(page, 'home.footer')).toBe(true);
    // The Alt+Click look: the overlay sits on the text with a solid border.
    await expect
      .poll(async () => {
        const text = await keyed(page, 'home.footer').boundingBox();
        const box = await overlay(page).boundingBox();
        return text !== null && box !== null && Math.abs(text.y - box.y) < 2;
      })
      .toBe(true);
    expect(await overlay(page).evaluate((el) => (el as HTMLElement).style.border)).toContain(
      'solid'
    );
    await expect(note(page)).toHaveText('');
  });

  test('a keyboard pick keeps the focus and the typing in the editor while the page scrolls', async ({
    page,
  }) => {
    await openStudio(page);
    await pushFooterDown(page);
    // Settle the share link's language first, so the pick completes at once.
    await keyRow(page, 'home.title').click();
    await chooseLanguageIfAsked(page);
    await expect(page.locator('#studio-translation-input')).toHaveValue(/static playground/);

    await keyRow(page, 'home.footer').focus();
    await page.keyboard.press('Enter');
    const input = page.locator('#studio-translation-input');
    await expect(input).toBeFocused();
    await page.keyboard.type(' today');
    await expect.poll(() => inFrameView(page, 'home.footer')).toBe(true);
    // Nothing the page sends back resets the draft or moves the focus.
    await page.waitForTimeout(800);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Made with care in Cairo today');
  });

  test('a key in a closed menu says so, and the page does not move', async ({ page }) => {
    await openStudio(page);
    await keyRow(page, 'home.menu_item').click();
    await chooseLanguageIfAsked(page);
    await expect(page.locator('#studio-translation-input')).toHaveValue('Pricing');
    await expect(note(page)).toContainText('hidden right now');
    expect(
      await frame(page)
        .locator('html')
        .evaluate(() => window.scrollY)
    ).toBe(0);
  });

  test('a hidden key after a shown one removes the outline from the first text', async ({
    page,
  }) => {
    await openStudio(page);
    await keyRow(page, 'home.title').click();
    await chooseLanguageIfAsked(page);
    await expect(page.locator('#studio-translation-input')).toHaveValue(/static playground/);
    await expect
      .poll(() => overlay(page).evaluate((el) => (el as HTMLElement).style.opacity))
      .toBe('1');

    await keyRow(page, 'home.menu_item').click();
    await expect(page.locator('#studio-translation-input')).toHaveValue('Pricing');
    await expect(note(page)).toContainText('hidden right now');
    // The page no longer points at home.title while the editor shows home.menu_item.
    await expect
      .poll(() => overlay(page).evaluate((el) => (el as HTMLElement).style.opacity))
      .toBe('0');
  });

  test('a key that is not on this page says so; the next pick clears the note', async ({
    page,
  }) => {
    await openStudio(page);
    await expect(keyed(page, 'home.footer')).toBeVisible({ timeout: 15_000 });
    await keyed(page, 'home.footer').evaluate((el) => el.remove());

    await keyRow(page, 'home.footer').click();
    await chooseLanguageIfAsked(page);
    await expect(note(page)).toHaveText(
      'This text is not on this page. You can still edit it here.'
    );

    await keyRow(page, 'home.title').click();
    await expect(page.locator('#studio-translation-input')).toHaveValue(/static playground/);
    await expect(note(page)).toHaveText('');
  });
});

test.describe('phone', () => {
  // A Pixel 7 screen and touch; a describe block may not set its browser choice.
  const { viewport, screen, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
  test.use({ viewport, screen, userAgent, deviceScaleFactor, isMobile, hasTouch });

  const modeSwitch = (page: Page) => page.getByRole('radiogroup', { name: 'Tap mode' });
  const editorSheet = (page: Page) =>
    page.getByRole('dialog').filter({ has: page.locator('#studio-translation-input') });

  async function openStudio(page: Page): Promise<void> {
    await page.goto(SHARE);
    await expect(modeSwitch(page)).toBeVisible({ timeout: 30_000 });
    await dismissTips(page, true);
  }

  /** Opens the Keys sheet from the More menu and taps the row for `key`. */
  async function pickFromKeysSheet(page: Page, key: string): Promise<void> {
    await page.getByRole('button', { name: 'More' }).tap();
    await page.getByRole('button', { name: 'Keys' }).tap();
    await keyRow(page, key).tap();
    await chooseLanguageIfAsked(page);
  }

  /** Whether the text with `key` sits in the frame above the editor sheet. */
  const aboveSheet = async (page: Page, key: string) => {
    const text = await keyed(page, key).boundingBox();
    const sheet = await editorSheet(page).boundingBox();
    return text !== null && sheet !== null && text.y >= 56 && text.y + text.height <= sheet.y;
  };

  test('in Edit, the keys sheet closes and the text shows above the editor, picked', async ({
    page,
  }) => {
    await openStudio(page);
    await pushFooterDown(page);

    await pickFromKeysSheet(page, 'home.footer');

    await expect(editorSheet(page)).toBeVisible();
    await expect(editorSheet(page)).toContainText('home.footer');
    await expect(page.getByTestId('keys-directory')).toHaveCount(0);
    await expect.poll(() => aboveSheet(page, 'home.footer')).toBe(true);
    await expect(keyed(page, 'home.footer')).toHaveAttribute('data-livelocale-picked', '');
  });

  test('in Browse, the text is still shown above the editor and nothing switches', async ({
    page,
  }) => {
    await openStudio(page);
    await modeSwitch(page).getByText('Browse', { exact: true }).tap();
    await expect(modeSwitch(page).getByRole('radio', { name: 'Browse' })).toBeChecked();
    await pushFooterDown(page);

    await pickFromKeysSheet(page, 'home.footer');

    await expect(editorSheet(page)).toContainText('home.footer');
    await expect.poll(() => aboveSheet(page, 'home.footer')).toBe(true);
    await expect(modeSwitch(page).getByRole('radio', { name: 'Browse' })).toBeChecked();
    await expect(frame(page).locator('html')).not.toHaveAttribute('data-livelocale-edit', '');
  });
});
