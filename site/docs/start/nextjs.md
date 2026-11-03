---
title: Next.js (App Router)
description: Add livelocale to a Next.js App Router app, open the Studio beside next dev, and fix your first line of text into the locale file.
---

# Next.js (App Router)

Six steps from `npm install` to a fixed line of text in your locale file. Each step shows what you should see when it worked. You need a Next.js app with its translations in JSON files under `locales/`.

## 1. Install livelocale

```bash
npm install livelocale
```

It is a dependency, not a dev dependency: your app imports `livelocale/react` and `livelocale/server` at run time. Then ask the CLI for its commands:

```bash
npx livelocale --help
```

```cli help

```

::: details Didn't work?

- Run both commands in the folder that holds your app's `package.json`, so `npx` finds the copy npm just installed.
- livelocale needs Node.js 18 or later.
- Once the next step is done, `npx livelocale doctor` checks the rest of the setup for you.

:::

## 2. Mount the provider and add the API route

Render `LiveLocaleProvider` once in your root layout. It renders nothing. In development it loads the in-page client, which starts only when your page is inside the Studio.

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

Then let `init` write the API route the Studio saves through:

```bash
npx livelocale init
```

```cli init-next

```

The route reads and writes `./locales`. If your locale files live elsewhere, change `localesPath` in `app/api/livelocale/route.ts`. Every option is on the [`init` reference](../reference/cli/init.md).

::: details Didn't work?

Run `npx livelocale doctor`. It checks the route, the provider, middleware, frame-blocking headers and your locale files, and names the file to fix.

- **Mutation route handler** fails: run `npx livelocale init` in the app's folder. It writes `app/api/livelocale/route.ts`, or the `src/app/` or Pages Router (`pages/api/livelocale.ts`) file when that is your layout.
- **LiveLocaleProvider mounted** warns: add `<LiveLocaleProvider />` from `livelocale/react` to `app/layout.tsx`.
- **Locale files** fails with "Directory not found": create `locales/`, or pass `--locales <path>` to the doctor and set the same folder as `localesPath` in the route.

:::

## 3. Wrap your translations

The Studio finds a string by an invisible watermark, added in development to every string that goes through livelocale. Pick the way your app looks text up.

In Server Components, load a locale with `createTranslations`:

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

With `react-i18next` or `next-intl` hooks, wrap the `t` the hook returns with `wrapTranslationEngine`:

```tsx
'use client';
import { useTranslation } from 'react-i18next';
import { wrapTranslationEngine } from 'livelocale/client';

export default function Login() {
  const { t: rawT } = useTranslation('auth');
  const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' });

  return <h1>{t('login.title')}</h1>;
}
```

For `next-intl`, `wrapNextIntl(useTranslations('home'), 'home')` is the same call with the namespace as the prefix. If your app already calls `react-i18next` in many files, `migrate` wraps them for you (it needs the `typescript` package):

```bash
npx livelocale migrate --dry-run
npx livelocale migrate
```

Now check the whole setup:

```bash
npx livelocale doctor
```

```cli doctor-next

```

::: details Didn't work?

- `npx livelocale doctor` lists what is still missing; fix each line it marks and run it again.
- Text you never wrap carries no watermark, so the Studio cannot pick it. `npx livelocale check --hardcoded` lists the text in your components that never goes through translation; see [Catch untranslated text in CI](../guides/ci-check.md).
- With a namespace, give the wrapper the same prefix (`keyPrefix: 'auth'`), so `t('login.title')` maps to `auth.login.title` in your file.
- `migrate` stops with an error when `typescript` is missing: `npm install -D typescript`. `--dry-run` shows the files it would change first.

:::

## 4. Start the app and the Studio

Run your app as usual, and the Studio in a second terminal:

```bash
npx next dev
```

```bash
npx livelocale studio
```

Open `http://localhost:3010`. The Studio loads your app from `http://localhost:3000` in the middle, the Locale Directory lists your keys, and the status reads **Active** once the page answers.

<DocShot name="next-studio-open" alt="The Studio beside the running Next.js playground: the Locale Directory lists five keys, the preview shows the page with status Active, and the editor says Select an Element." caption="The Studio, open beside next dev." />

::: details Didn't work?

With the app running, run `npx livelocale doctor --app http://localhost:3000`. It also probes the running app.

- **Mutation API** reports HTTP 404: the route is not served yet. Run `npx livelocale init` and restart `next dev`.
- **Mutation API** reports a redirect: auth middleware intercepts the route. Exclude it in the matcher: `matcher: ['/((?!api/livelocale).*)']`.
- **Studio can embed the app** warns about `frame-ancestors` or `X-Frame-Options`: the preview stays blank. Allow `http://localhost:3010` while `NODE_ENV` is `development`.
- Your app is on another port: `npx livelocale studio --app http://localhost:3001`. Port 3010 is taken: add `--port <number>`. More setups are in [Teams and enterprise setups](../guides/teams.md).

:::

## 5. Alt+Click and fix

Hold Alt (Option on a Mac) and click a line of text in the preview. The editor opens on its key, with the reference text and the translation. Type the fix and press **Save Changes**.

<DocShot name="next-alt-click" alt="The welcome line Alt+Clicked in the Next.js preview: the editor is open on home.welcome_msg, with the reference Welcome Back to Production and the fix Welcome back to production typed, above Save Changes." caption="The key under the cursor, open in the editor." />

::: details Didn't work?

- The click follows the link or does nothing: that text is not wrapped (step 3), or you clicked without holding Alt.
- No text responds at all: livelocale runs only while `NODE_ENV` is `development`, which `next dev` sets. `LIVELOCALE=off` (or `NEXT_PUBLIC_LIVELOCALE=off`) turns it off, and a detected hosting platform switches it off too; see [Safety switches](../how-it-works/safety-switches.md).
- Run `npx livelocale doctor --app http://localhost:3000` to check the provider and the route again.

:::

## 6. See the file change

The save is written to your locale file at once. Open **Changes** in the Studio header: the locale file is listed as modified, with its diff, and **This session** keeps the edit with **Undo**.

<DocShot name="next-saved-file" alt="The Changes panel after a save in the Next.js playground: playground/locales/en.json is listed as modified, its git diff shows the old welcome line struck and the new one added, and This session lists the edit with Undo." caption="The file, its diff and the edit you can undo." />

It is an ordinary file edit: `git diff locales/` shows the same change in your terminal, and you commit it like any other. The Studio can commit the locales folder for you too; see [The Studio](../guides/studio.md#review-and-commit).

::: details Didn't work?

- **Save Changes** shows a placeholder warning: the fix dropped or added a `{placeholder}`. Put it back, or choose **Save anyway**.
- The Studio runs away from `localhost` (Codespaces, Gitpod, a shared dev box): the route accepts writes only from `localhost` unless told otherwise. Add the Studio's origin to `LIVELOCALE_ALLOWED_ORIGINS` and restart `next dev`; see [Teams and enterprise setups](../guides/teams.md#studio-away-from-localhost).
- The Changes panel shows no git status: it needs `git` on your `PATH` and the locales folder inside a repository.
- Run `npx livelocale doctor --app http://localhost:3000`; the **Locale files** line says which folder the doctor reads.

:::

## What next

- [Share links](../guides/share-links.html): let someone fix text on the deployed site, with no account and no install.
- [Catch untranslated text in CI](../guides/ci-check.html): fail the build on missing keys, placeholder drift and hardcoded text.
- [Arabic and right to left](../guides/studio.html#arabic-and-right-to-left): edit an Arabic site in a Studio that reads right to left.
