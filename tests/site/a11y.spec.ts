import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { SIDEBAR } from '../../site/src/lib/docs-config';
import { scrollThrough } from './fixtures/scroll';

/** Every WCAG 2.2 A/AA violation on the page, one `<rule>: <targets>` entry per rule. Finite CSS
 *  transitions and animations finish first, so colours are measured as they settle, not mid-fade
 *  (as tests/e2e/fixtures/axe.ts does). */
async function audit(page: Page): Promise<string[]> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined))
    )
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
}

/** The docs URL of a sidebar link, relative to the site base (`/` gives `docs/`). */
const docsUrl = (link: string) => `docs${link.endsWith('/') ? link : link + '.html'}`;

const paused = (videos: Locator) =>
  videos.evaluateAll((vs) => vs.map((v) => (v as HTMLVideoElement).paused));

const LANDING: Record<string, (p: Page) => Promise<void>> = {
  'developer door': async (p) => {
    await p.goto('./');
    await scrollThrough(p);
  },
  'fixer door': async (p) => {
    await p.goto('./#fixer');
    await scrollThrough(p);
  },
  'phone, the video framed as a phone': async (p) => {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto('./');
    await scrollThrough(p);
  },
  'FAQ open': async (p) => {
    await p.goto('./');
    for (const s of await p.locator('#faq summary').all()) await s.click();
  },
};

for (const [name, setup] of Object.entries(LANDING))
  test(`has no WCAG 2.2 AA violations on the landing page: ${name}`, async ({ page }) => {
    await setup(page);
    expect(await audit(page)).toEqual([]);
  });

for (const link of SIDEBAR.flatMap((g) => g.items.map((i) => i.link)))
  test(`has no WCAG 2.2 AA violations on docs ${link}`, async ({ page }) => {
    await page.goto(docsUrl(link));
    expect(await audit(page)).toEqual([]);
  });

test('has no WCAG 2.2 AA violations with the docs search open', async ({ page }) => {
  await page.goto('docs/');
  await page.locator('.VPNavBarSearch button').click();
  const input = page.locator('.VPLocalSearchBox input');
  await expect(input).toBeVisible();
  await input.fill('check');
  await expect(page.locator('.VPLocalSearchBox a.result').first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('has no WCAG 2.2 AA violations on the landing page, the video on its poster', async ({
    page,
  }) => {
    await page.goto('./');
    await scrollThrough(page);
    expect(await paused(page.locator('video'))).not.toContain(false);
    expect(await audit(page)).toEqual([]);
  });

  test('has no WCAG 2.2 AA violations on the Studio guide, the clip on its poster', async ({
    page,
  }) => {
    await page.goto('docs/guides/studio.html');
    await scrollThrough(page);
    const clips = page.locator('.doc-clip video');
    expect(await clips.count()).toBeGreaterThan(0);
    expect(await paused(clips)).not.toContain(false);
    expect(await audit(page)).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  // axe runs inside the page, so the browser keeps its script engine; what the page would run is
  // taken away instead: every script request is refused and every <script> element is cut from
  // the HTML. That is the page a browser with JavaScript off renders, as long as the page has no
  // <noscript> (checked below), which such a browser would show.
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', async (route) => {
      const type = route.request().resourceType();
      if (type === 'script') return route.abort();
      if (type !== 'document') return route.continue();
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers['content-encoding'];
      delete headers['content-length'];
      const body = (await response.text()).replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, '');
      await route.fulfill({ response, headers, body });
    });
  });

  for (const url of ['./', 'docs/'])
    test(`has no WCAG 2.2 AA violations without JavaScript on ${url}`, async ({ page }) => {
      await page.goto(url);
      expect(await page.locator('noscript').count()).toBe(0);
      expect(await page.locator('script').count()).toBe(0);
      expect(await audit(page)).toEqual([]);
    });
});

test('@touch has no WCAG 2.2 AA violations with the docs menu open on a phone', async ({
  page,
}) => {
  await page.goto('docs/start/nextjs.html');
  await page.locator('.VPLocalNav .menu').tap();
  await expect(page.locator('.VPSidebar')).toBeInViewport();
  expect(await audit(page)).toEqual([]);
});
