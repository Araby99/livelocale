import { test, expect } from '@playwright/test';
import { SIDEBAR } from '../../site/src/lib/docs-config';
import { OG_IMAGE_ALT } from '../../site/src/lib/seo';

const SITE = 'http://localhost:4173/livelocale/';

/** The docs URL of a sidebar link, relative to the site base (`/` gives `docs/`). */
const docsUrl = (link: string) => `docs${link.endsWith('/') ? link : link + '.html'}`;

test('gives every docs page its own title, description and absolute share tags', async ({
  page,
  request,
}) => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const images = new Set<string>();
  for (const link of SIDEBAR.flatMap((g) => g.items.map((i) => i.link))) {
    const url = docsUrl(link);
    await page.goto(url);
    // Every <meta> by its property or name, read once, so a missing tag fails at once.
    const tags = await page.evaluate(() =>
      [...document.querySelectorAll('meta')].map((m) => [
        m.getAttribute('property') ?? m.getAttribute('name'),
        m.content,
      ])
    );
    const meta = (p: string) => tags.find(([key]) => key === p)?.[1];

    const title = await page.title();
    expect(title, url).toMatch(/\S \| livelocale docs$/);
    expect(titles.has(title), `${url}: duplicate title ${title}`).toBe(false);
    titles.add(title);

    const description = meta('description') ?? '';
    expect(description, url).not.toBe('');
    expect(descriptions.has(description), `${url}: duplicate description`).toBe(false);
    descriptions.add(description);

    expect(meta('og:type'), url).toBe('article');
    expect(meta('og:title'), url).toBe(title);
    expect(meta('og:description'), url).toBe(description);
    expect(meta('og:url'), url).toBe(`${SITE}${url}`);
    expect(meta('og:image:width'), url).toBe('1200');
    expect(meta('og:image:height'), url).toBe('630');
    expect(meta('og:image:alt'), url).toBe(OG_IMAGE_ALT);
    expect(meta('twitter:card'), url).toBe('summary_large_image');
    expect(
      tags.filter(([key]) => key === 'theme-color'),
      url
    ).toEqual([['theme-color', '#0C0D0F']]);
    const image = meta('og:image') ?? '';
    expect(image, url).toBe(`${SITE}og-image.png`);
    images.add(image);
  }
  for (const image of images) {
    const response = await request.get(image);
    expect(response.status(), image).toBe(200);
    expect(response.headers()['content-type'], image).toBe('image/png');
  }
});
