import { test, expect } from '@playwright/test';
import { scrollThrough } from './fixtures/scroll';

// The landing sections shared by both doors, below the two stories.

test('shows the locales section below the stories for both doors', async ({ page }) => {
  for (const hash of ['', '#fixer']) {
    await page.goto(`./${hash}`);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Edit every language your site speaks' })
    ).toBeVisible();
  }
});

test('keeps the right-to-left clip off the first paint', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./', { waitUntil: 'load' });
  expect(urls.filter((u) => /rtl-site/.test(u) && !/poster/.test(u))).toEqual([]);
  const video = page.locator('#locales video');
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('playsinline', '');
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted && !v.autoplay && !!v.poster)).toBe(
    true
  );
  await expect(page.locator('#locales').getByRole('button', { name: /clip/ })).toBeAttached();
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

// Who it's for and what it isn't sit outside the doors: every visitor sees them, whichever door.
test("shows Who it's for outside the doors", async ({ page }) => {
  const who = page.getByRole('heading', { level: 2, name: "Who it's for" });
  for (const hash of ['', '#fixer']) {
    await page.goto(`./${hash}`);
    await expect(who).toBeVisible();
  }
  await page.goto('./');
  await page.getByRole('radio', { name: 'I fix the text' }).click();
  await expect(who).toBeVisible();
  await page.getByRole('radio', { name: 'I ship the site' }).click();
  await expect(who).toBeVisible();
  await expect(page.locator('#who')).not.toHaveAttribute('data-door');
  await expect(page.locator('#who [data-door]')).toHaveCount(0);
});

test('names the three audiences in order', async ({ page }) => {
  await page.goto('./');
  const items = page.locator('#who .who-list > li');
  await expect(items).toHaveCount(3);
  await expect(items.locator('h3')).toHaveText([
    /content or marketing people/,
    /freelance/i,
    /CI check/,
  ]);
  const hrefs = await items.evaluateAll((lis) =>
    lis.map((li) => [...li.querySelectorAll('a')].map((a) => a.getAttribute('href')))
  );
  expect(hrefs).toEqual([
    ['docs/guides/studio.html'],
    ['docs/guides/share-links.html'],
    ['docs/guides/ci-check.html'],
  ]);
  await expect(items.nth(2)).toContainText('npx livelocale check --hardcoded');
  await expect(items.nth(2)).toContainText('Translating on your own?');
  await expect(page.locator('body')).not.toContainText(/not for you|more than you need/i);
});

test('says it is not an i18n library', async ({ page }) => {
  for (const hash of ['', '#fixer']) {
    await page.goto(`./${hash}`);
    const line = page.locator('.hero .hero-not');
    await expect(line).toBeVisible();
    await expect(line).toContainText('Not an i18n library');
    await expect(line).toContainText('next-intl');
    await expect(line).toContainText('react-i18next');
  }
  await expect(page.locator('.hero .hero-lede')).toContainText(
    'livelocale sits on top of next-intl or react-i18next.'
  );
});

test('proof links resolve to their docs', async ({ page }) => {
  await page.goto('./');
  const proof = page.locator('#compare .proof-list a');
  expect(await proof.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual([
    'docs/how-it-works/safety-switches.html',
    'docs/how-it-works/watermarking.html#tested-on-right-to-left-scripts',
    'docs/guides/ci-check.html#what-it-does-not-see',
  ]);
  // The CI excerpt in the developer's story links the same limits.
  await expect(
    page.locator('#developer a[href="docs/guides/ci-check.html#what-it-does-not-see"]')
  ).toHaveCount(1);
  for (const [href, heading] of [
    ['docs/how-it-works/safety-switches.html', null],
    [
      'docs/how-it-works/watermarking.html#tested-on-right-to-left-scripts',
      'Tested on right-to-left scripts',
    ],
    ['docs/guides/ci-check.html#what-it-does-not-see', 'What it does not see'],
  ] as const) {
    const res = await page.goto(href);
    expect(res!.status(), href).toBe(200);
    const hash = href.split('#')[1];
    if (hash) await expect(page.locator(`[id="${hash}"]`)).toHaveText(new RegExp(heading!));
  }
});

test('answers the eight questions, each with its docs link', async ({ page }) => {
  await page.goto('./');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Questions developers ask' })
  ).toBeVisible();
  await expect(page.locator('#faq summary')).toHaveText([
    'Does anything ship to production?',
    'Is it secure?',
    "We don't use GitHub. Does it work?",
    'Is it an i18n library?',
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

// The hero's copy is the install itself; the setup that follows is one link away, and the live
// demo stays the second action.
test('copies npm install in the hero and links the next step to Get started', async ({ page }) => {
  await page.goto('./');
  const hero = page.locator('.hero');
  const actions = hero.locator('.actions > *');
  await expect(actions).toHaveCount(2);
  await expect(actions.nth(0)).toHaveAttribute('data-copy', 'npm install livelocale');
  await expect(actions.nth(0).locator('.cmd-text')).toHaveText('$ npm install livelocale');
  await expect(actions.nth(1)).toHaveText('Try the live demo');
  const next = hero.getByRole('link', { name: 'Next: set it up in 2 minutes' });
  await expect(next).toHaveAttribute('href', 'docs/index.html');
  await next.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Get started' })).toBeVisible();
});
