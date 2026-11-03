<div align="center">
  <h1>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">
      <img src="brand/logo.svg" alt="livelocale" height="64">
    </picture>
  </h1>
  <p><strong>Click any text in your app. Fix the translation. Ship it as a pull request.</strong></p>
  <p>Keep next-intl or react-i18next. LiveLocale adds in-context editing for Next.js and React + Vite: no account, no server, no browser extension. Your translations stay as JSON in git.</p>
  
  <p align="center">
    <a href="https://github.com/Araby99/livelocale/actions/workflows/ci.yml"><img src="https://github.com/Araby99/livelocale/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
    <a href="https://www.npmjs.com/package/livelocale"><img src="https://img.shields.io/npm/v/livelocale.svg?style=flat-square" alt="NPM Version" /></a>
    <a href="https://www.npmjs.com/package/livelocale"><img src="https://img.shields.io/npm/dm/livelocale.svg?style=flat-square" alt="NPM Downloads" /></a>
    <a href="https://github.com/Araby99/livelocale/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/livelocale.svg?style=flat-square" alt="License" /></a>
  </p>
</div>

---

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

## Docs

- [Get started](https://livelocale.js.org/docs/): Next.js, Vite + React, or any static host.
- [Next.js, step by step](https://livelocale.js.org/docs/start/nextjs.html): what each step should show.
- [Share links](https://livelocale.js.org/docs/guides/share-links.html): fixes from the deployed site, no account and no install.
- [Catch untranslated text in CI](https://livelocale.js.org/docs/guides/ci-check.html): missing keys, placeholder drift and hardcoded text.
- [CLI reference](https://livelocale.js.org/docs/reference/cli/index.html): every command and flag.

## License

MIT License. See [LICENSE](LICENSE) for more details.
