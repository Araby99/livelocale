// The one build setting: SITE_URL. The Vite base is its pathname, so the same build works on the
// GitHub Pages project path (/livelocale/) and on a custom domain (/).

export const DEFAULT_SITE_URL = 'https://araby99.github.io/livelocale/';

export interface SiteConfig {
  siteUrl: string;
  base: string;
}

/** Reads SITE_URL (default: the Pages project URL) and returns it with a trailing slash. */
export function siteConfig(env: { SITE_URL?: string }): SiteConfig {
  const value = env.SITE_URL || DEFAULT_SITE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SITE_URL must be an https URL (http only for localhost): ${value}`);
  }
  const allowed =
    url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost');
  if (!allowed) {
    throw new Error(`SITE_URL must be an https URL (http only for localhost): ${value}`);
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.search = '';
  url.hash = '';
  return { siteUrl: url.href, base: url.pathname };
}
