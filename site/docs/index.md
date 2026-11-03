---
title: Get started
description: Set up livelocale in your app, then fix text on the real site and get the change back as a file edit or a pull request.
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
    title: 'Any static host (share links)',
    text: 'Ship the Studio inside your build; anyone fixes text on the deployed site and you get a pull request.',
    href: './start/static-host.html',
  },
];
</script>

# Get started

livelocale lets anyone on your team fix your site's text on the site itself, in every language, and turns each fix into a file edit or a pull request.

## Pick your stack

<StackPicker :stacks="stacks" />

## What next

- [Share links](./guides/share-links.html): let someone fix text on the deployed site, with no account and no install.
- [Catch untranslated text in CI](./guides/ci-check.html): fail the build on missing keys, placeholder drift and hardcoded text.
- [Arabic and right to left](./guides/studio.html#arabic-and-right-to-left): edit an Arabic site in a Studio that reads right to left.
