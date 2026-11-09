---
title: Get started
description: Set up livelocale on top of next-intl or react-i18next, then fix text on the real site and get each fix as a file edit or a pull request.
---

<script setup>
const stacks = [
  {
    title: 'Next.js (App Router)',
    text: 'Mount the provider, let init write the API route, and fix text in the Studio beside next dev.',
    href: './start/nextjs.html',
  },
  {
    title: 'Vite + React',
    text: 'Add the Vite plugin, mount the provider, and fix text in the Studio beside vite.',
    href: './start/vite.html',
  },
  {
    title: 'Astro',
    text: 'Add the integration, load translations in the frontmatter, and fix text in the Studio beside astro dev. No React needed.',
    href: './start/astro.html',
  },
  {
    title: 'Any static host (share links)',
    text: 'Ship the Studio inside your build; anyone fixes text on the deployed site and you get a pull request.',
    href: './start/static-host.html',
  },
];
</script>

# Get started

livelocale is a free, open-source layer on top of next-intl or react-i18next for sites on Next.js, Vite, Astro or any static host. Anyone on your team holds Alt, clicks the wrong text on the running site and fixes it in any language, and you get each fix as an edit to your JSON locale files or as a pull request.

It is not an i18n library: next-intl or react-i18next keeps routing, locale detection and formatting. It is built for teams whose content people review copy, for freelancers whose client does, and for any developer who only wants the [CI check](./guides/ci-check.html).

<DocClip name="alt-click-edit" label="Alt+Click the Tidewell headline in the share Studio, fix the typo in the editor and save it." caption="The whole job: Alt+Click the wrong text on the real site, fix it, save." />

## Pick your stack

<StackPicker :stacks="stacks" />

## What next

- [Share links](./guides/share-links.html): let someone fix text on the deployed site, with no account and no install.
- [Catch untranslated text in CI](./guides/ci-check.html): fail the build on missing keys, placeholder drift and hardcoded text.
- [Right-to-left sites](./guides/studio.html#right-to-left-sites): edit an Arabic or Hebrew site that flips right to left under the Studio.
