// The docs' place in the site and their navigation. VitePress builds site/docs/ under
// <site base>docs/, so the docs move with SITE_URL exactly as the landing page does.
import { readdirSync } from 'node:fs';
import { siteConfig } from './site-config';

/** The docs' base path: the site base plus `docs/` (`/livelocale/docs/` on the Pages URL). */
export function docsBase(env: { SITE_URL?: string }): string {
  return `${siteConfig(env).base}docs/`;
}

/** The landing page's path, from the docs base (`/livelocale/docs/` gives `/livelocale/`). */
export function landingHref(docsBase: string): string {
  return docsBase.replace(/docs\/$/, '');
}

export interface SidebarGroup {
  text: string;
  items: { text: string; link: string }[];
}

/** Every docs page, once, in reading order. Links are VitePress paths under the docs base. */
export const SIDEBAR: SidebarGroup[] = [
  { text: 'Get started', items: [{ text: 'Pick your stack', link: '/' }] },
  { text: 'Guides', items: [] },
  { text: 'How it works', items: [] },
  {
    text: 'Reference',
    items: [
      { text: 'CLI', link: '/reference/cli/' },
      { text: 'init', link: '/reference/cli/init' },
      { text: 'studio', link: '/reference/cli/studio' },
      { text: 'doctor', link: '/reference/cli/doctor' },
      { text: 'check', link: '/reference/cli/check' },
      { text: 'pack', link: '/reference/cli/pack' },
      { text: 'build', link: '/reference/cli/build' },
      { text: 'apply', link: '/reference/cli/apply' },
      { text: 'migrate', link: '/reference/cli/migrate' },
      { text: 'Configuration', link: '/reference/configuration' },
      { text: 'Environment variables', link: '/reference/environment' },
      { text: 'Changelog', link: '/reference/changelog' },
    ],
  },
];

/** The landing header's two links. */
export const NAV = [
  { text: 'GitHub', link: 'https://github.com/Araby99/livelocale' },
  { text: 'Docs', link: '/' },
];

export const TITLE_TEMPLATE = ':title | livelocale docs';

/** Every `.md` page under the docs folder except `.vitepress/`, relative to it with `/`. */
export function docsPageFiles(docsDir: string): string[] {
  return readdirSync(docsDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => file.endsWith('.md') && !file.startsWith('.vitepress/'))
    .sort();
}
