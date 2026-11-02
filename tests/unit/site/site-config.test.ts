// @vitest-environment node
import { siteConfig, DEFAULT_SITE_URL } from '../../../site/src/lib/site-config';

it('defaults to the Pages project URL', () =>
  expect(siteConfig({})).toEqual({ siteUrl: DEFAULT_SITE_URL, base: '/livelocale/' }));
it('derives the base from SITE_URL and adds the trailing slash', () =>
  expect(siteConfig({ SITE_URL: 'https://livelocale.js.org' })).toEqual({
    siteUrl: 'https://livelocale.js.org/',
    base: '/',
  }));
it('allows http only for localhost', () => {
  expect(siteConfig({ SITE_URL: 'http://localhost:4173/livelocale/' }).base).toBe('/livelocale/');
  expect(() => siteConfig({ SITE_URL: 'http://example.com/' })).toThrow(
    'SITE_URL must be an https URL'
  );
});
