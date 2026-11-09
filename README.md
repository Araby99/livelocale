<div align="center">
  <h1>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">
      <img src="brand/logo.svg" alt="livelocale" height="64">
    </picture>
  </h1>
  <p><strong>The editing and review layer on top of next-intl or react-i18next.</strong></p>
  <p>Your content people fix text on the real site, and you get each fix as an edit to your JSON locale files in git, or as a pull request. For Next.js, React + Vite and Astro: no account, no server, no browser extension.</p>

  <p align="center">
    <a href="https://github.com/Araby99/livelocale/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/Araby99/livelocale/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI Status" /></a>
    <a href="https://www.npmjs.com/package/livelocale"><img src="https://img.shields.io/npm/v/livelocale.svg?style=flat-square" alt="NPM Version" /></a>
    <a href="https://www.npmjs.com/package/livelocale"><img src="https://img.shields.io/npm/dm/livelocale.svg?style=flat-square" alt="NPM Downloads" /></a>
    <a href="https://github.com/Araby99/livelocale/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/livelocale.svg?style=flat-square" alt="License" /></a>
  </p>
</div>

---

**It is not an i18n library.** next-intl or react-i18next keeps doing routing, locale detection,
date and number formatting and message rendering; livelocale only edits and reviews the text.

- **Freelancing?** Your client fixes their own copy through a
  [share link](https://livelocale.js.org/docs/guides/share-links.html), and you review a pull
  request instead of collecting screenshots.
- **Only want CI?** [`npx livelocale check --hardcoded`](https://livelocale.js.org/docs/guides/ci-check.html)
  works without the Studio. Translating on your own? The CI check alone catches missing keys and
  hard-coded text.

Run your app beside the livelocale Studio, hold Alt and click a line of text, and fix it. The save
goes straight into your locale JSON file as an ordinary edit you commit. In development every
translated string carries an invisible watermark, so the Studio knows which key you clicked; in
production nothing is added. Share links let someone without a checkout fix text on your deployed
site and send the change back as a pull request.

**Docs: [livelocale.js.org/docs](https://livelocale.js.org/docs/)**

## Install

```bash
npm install livelocale
```

It is a dependency, not a dev dependency: your app imports `livelocale/react` and
`livelocale/server` at run time. livelocale needs Node.js 18 or later.

## 30 seconds with Next.js

Render the provider once in your root layout:

```tsx
// app/layout.tsx
import { LiveLocaleProvider } from 'livelocale/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LiveLocaleProvider />
        {children}
      </body>
    </html>
  );
}
```

Let `init` write the API route the Studio saves through, then load your strings with
`createTranslations`:

```bash
npx livelocale init
```

```tsx
// app/page.tsx
import { createTranslations } from 'livelocale/server';

export default async function Page({ searchParams }) {
  const { locale = 'en' } = await searchParams;
  const t = createTranslations(locale, {
    supportedLocales: ['en', 'ar'],
    localesDir: './locales',
  });

  return <h1>{t.home?.title}</h1>;
}
```

Start the app, and the Studio in a second terminal:

```bash
npx next dev
npx livelocale studio
```

Open `http://localhost:3010`, hold Alt (Option on a Mac), click a line of text and press
**Save Changes**. `git diff locales/` shows the fix.

## Supported versions

| Needs                                     | Tested in CI                               |
| ----------------------------------------- | ------------------------------------------ |
| Node.js 18 or later                       | Node.js 20 and 24; the built package on 18 |
| Next.js 13 or later                       | Next.js 16                                 |
| React 18 or later                         | React 18                                   |
| Vite 5 or later                           | Vite 8                                     |
| Astro 5 or later                          | Astro 7 (unit tests and the playground)    |
| TypeScript 4.7 to 6 (`check --hardcoded`) | TypeScript 5                               |

From 1.0 on, livelocale follows semantic versioning, and share links people already sent keep
working in newer versions. [Versioning and stability](https://livelocale.js.org/docs/reference/stability.html)
lists what that covers and what is internal.

## Docs

- [Get started](https://livelocale.js.org/docs/): Next.js, Vite + React, Astro, or any static host.
- [Next.js, step by step](https://livelocale.js.org/docs/start/nextjs.html): what each step should show.
- [Share links](https://livelocale.js.org/docs/guides/share-links.html): fixes from the deployed site, no account and no install.
- [Catch untranslated text in CI](https://livelocale.js.org/docs/guides/ci-check.html): missing keys, placeholder drift and hardcoded text.
- [CLI reference](https://livelocale.js.org/docs/reference/cli/index.html): every command and flag.
- [Versioning and stability](https://livelocale.js.org/docs/reference/stability.html): what semver covers, and the versions CI tests.

## Contributing

- [Contributing guide](CONTRIBUTING.md): setup, checks and changesets.
- [Security policy](SECURITY.md): report a vulnerability privately.
- [Code of Conduct](CODE_OF_CONDUCT.md): how we work together.

## License

MIT License. See [LICENSE](LICENSE) for more details.
