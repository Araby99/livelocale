import { test, expect } from '@playwright/test';
import { scrollThrough } from './fixtures/scroll';

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

// The Global Constraints' one competitor list (also in tests/unit/site/docs-pages.test.ts).
const COMPETITORS =
  /\b(Tolgee|Locize|Lokalise|Crowdin|Transifex|POEditor|Weblate|SimpleLocalize|Phrase (Strings|TMS))\b/;

test('compares the mechanism without naming anyone', async ({ page }) => {
  await page.goto('./');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Why not a hosted translation platform?' })
  ).toBeVisible();
  const table = page.locator('#compare table');
  await expect(table.locator('caption')).toBeAttached();
  await expect(table.locator('thead th[scope="col"]')).toHaveText([
    'livelocale',
    'A hosted translation platform',
  ]);
  const rows = page.locator('#compare tbody th[scope="row"]');
  await expect(rows).toHaveText([
    'Where the edit goes',
    'Account needed',
    'Server needed',
    'Cost',
    'Lock-in',
  ]);
  await expect(page.locator('body')).not.toContainText(COMPETITORS);
});

test('answers the seven questions, each with its docs link', async ({ page }) => {
  await page.goto('./');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Questions developers ask' })
  ).toBeVisible();
  await expect(page.locator('#faq summary')).toHaveText([
    'Does anything ship to production?',
    'Is it secure?',
    "We don't use GitHub. Does it work?",
    'Which i18n libraries does it work with?',
    'Does it work with a static export?',
    'What does it cost?',
    'Is my content sent anywhere?',
  ]);
  const hrefs: string[] = [];
  for (const d of await page.locator('#faq details').all()) {
    await expect(d.locator('a')).toHaveCount(1);
    hrefs.push((await d.locator('a').getAttribute('href'))!);
  }
  expect(hrefs).toEqual([
    'docs/how-it-works/safety-switches.html',
    'docs/how-it-works/security.html',
    'docs/guides/share-links.html#other-git-hosts',
    'docs/',
    'docs/reference/cli/build.html',
    'https://github.com/Araby99/livelocale/blob/main/LICENSE',
    'docs/how-it-works/security.html#share-links',
  ]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('opens an answer from its question', async ({ page }) => {
    await page.goto('./');
    const first = page.locator('#faq details').first();
    await expect(first.locator('a')).toBeHidden();
    await first.locator('summary').click();
    await expect(first.locator('a')).toBeVisible();
  });
});

test('has no horizontal scroll at 360 px with the comparison table', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('./');
  await scrollThrough(page);
  await expect(page.locator('#compare table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  // The table scrolls inside its own box instead of the page.
  const box = page.locator('#compare .compare-scroll');
  expect(await box.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
  expect(await box.evaluate((el) => el.clientWidth)).toBeLessThanOrEqual(360);
});

// `init` installs nothing and sets up only Next.js, so the close's copy of it says to install first
// and sends a Vite reader to the Vite page.
test('says to install first and where Vite goes next to the closing init command', async ({
  page,
}) => {
  await page.goto('./');
  const close = page.locator('.start[data-door="developer"] .start-body');
  await expect(close.locator('[data-copy="npx livelocale init"]')).toBeAttached();
  await expect(close).toContainText('npm install livelocale');
  await expect(close.locator('a[href="docs/start/vite.html"]')).toBeAttached();
});
