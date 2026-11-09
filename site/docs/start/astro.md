---
title: Astro
description: Add livelocale to an Astro site with one integration, load translations in the frontmatter, and fix text in the Studio beside astro dev. No React needed.
---

# Astro

Five steps from `npm install` to a fixed line of text in your locale file. Each step shows what you should see when it worked. You need an Astro site with its translations in JSON files under `locales/`. The site needs no React: the integration loads the in-page client itself.

<DocShot lead name="astro-alt-click" alt="The headline Alt+Clicked in the Astro preview: the editor is open on home.title, with the reference Welcome to the Astro playground and the fix Welcome to your Astro site typed, above Save Changes." caption="Where step 4 ends: the key under the cursor, open in the editor." />

## 1. Install livelocale

```bash
npm install livelocale
```

It is a dependency, not a dev dependency: your pages import `livelocale/server` at build and render time. Then check that the CLI answers:

```bash
npx livelocale --help
```

It worked when it prints its usage, starting with:

```cli help-head

```

::: details Didn't work?

- Run both commands in the folder that holds your site's `package.json`, so `npx` finds the copy npm just installed.
- livelocale needs Node.js 18 or later, and works with Astro 5 or later. Astro 6 and 7 need Node.js 22.
- Once `astro dev` runs with the integration (steps 2 and 3), `npx livelocale doctor --app http://localhost:4321` checks the setup for you.

:::

## 2. Add the integration and load your translations

`init` writes no file on Astro. Add the integration to `astro.config.mjs`, one line:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import liveLocale from 'livelocale/astro';

export default defineConfig({
  integrations: [liveLocale({ localesPath: './locales' })],
});
```

In `astro dev` it serves the Studio's API at `/api/livelocale`, puts the mode flag and the fallback dictionary in every page, and loads the in-page client, which starts only when your page is inside the Studio. A normal `astro build` gets none of it. It takes the same options as the [Vite plugin](../reference/configuration.md#livelocalevite).

The Studio finds a string by an invisible watermark, added in development to every string that goes through livelocale. Load a locale in the frontmatter with `createTranslations`. With a folder per locale and a file per page (`locales/en/home.json`), each file is a namespace:

```astro
---
// src/pages/index.astro
import { createTranslations } from 'livelocale/server';

const t = createTranslations('en', { supportedLocales: ['en', 'ar'] });
---

<h1>{t.home.title}</h1>
<p>{t.home.intro}</p>
```

`createTranslations` reads the files from `locales/` in the folder you start `astro` in; pass `localesDir` for another folder. Then check the whole setup:

```bash
npx livelocale doctor
```

```cli doctor-astro

```

::: details Didn't work?

- `npx livelocale doctor` fails **Astro integration**: `liveLocale(...)` from `livelocale/astro` is not in `integrations` in `astro.config.mjs`.
- `localesPath` is resolved from the folder you start `astro` in, so start it from the site's folder.
- Text you never load through `createTranslations` carries no watermark, so the Studio cannot pick it. `npx livelocale check --hardcoded` lists the text in your `.astro` templates that never goes through translation; see [Catch untranslated text in CI](../guides/ci-check.md).

:::

## 3. Start the site and the Studio

Run Astro as usual, and the Studio in a second terminal, pointed at Astro's port:

```bash
npx astro dev
```

```bash
npx livelocale studio --app http://localhost:4321
```

Open `http://localhost:3010`. The Studio loads your site in the middle, the Locale Directory lists your keys, and the status reads **Active** once the page answers.

<DocShot name="astro-studio-open" alt="The Studio beside the running Astro playground: the Locale Directory lists ten keys, the preview shows the home page with status Active, and the editor says Select an Element." caption="The Studio, open beside astro dev." />

::: details Didn't work?

With the site running, run `npx livelocale doctor --app http://localhost:4321`. It also probes the running site.

- **Mutation API** says the site is not reachable: `astro dev` is not running, or it runs on another port. Pass that port to both commands.
- **Mutation API** reports HTTP 404: the integration is not loaded. Check `astro.config.mjs` and restart `astro dev`.
- **Studio can embed the app** warns about `frame-ancestors` or `X-Frame-Options`: the preview stays blank. Allow `http://localhost:3010` in the headers your dev server sends.
- Port 3010 is taken: add `--port <number>` to `studio`. More setups are in [Teams and enterprise setups](../guides/teams.md).

:::

## 4. Alt+Click and fix

Hold Alt (Option on a Mac) and click a line of text in the preview. The editor opens on its key, with the reference text and the translation. Type the fix and press **Save Changes**. It worked when the editor looks like the shot at the top of this page.

::: details Didn't work?

- The click follows the link or does nothing: that text does not come from `createTranslations` (step 2), or you clicked without holding Alt.
- No text responds at all: livelocale runs only while `NODE_ENV` is `development`, which `astro dev` sets; `astro build` and `astro preview` do not. `LIVELOCALE=off` turns it off; see [Safety switches](../how-it-works/safety-switches.md).
- Run `npx livelocale doctor --app http://localhost:4321` to check the integration's API again.

:::

## 5. See the file change

The save is written to your locale file at once. Open **Changes** in the Studio header: the locale file is listed as modified, with its diff, and **This session** keeps the edit with **Undo**. Reload the preview and Astro renders the page again from the new file; no restart is needed.

<DocShot name="astro-saved-file" alt="The Changes panel after a save in the Astro playground: playground-astro/locales/en/home.json is listed as modified, its git diff shows the old title struck and the new one added, and This session lists the edit with Undo." caption="The file, its diff and the edit you can undo." />

It is an ordinary file edit: `git diff locales/` shows the same change in your terminal, and you commit it like any other. The Studio can commit the locales folder for you too; see [The Studio](../guides/studio.md#review-and-commit).

::: details Didn't work?

- **Save Changes** shows a placeholder warning: the fix dropped or added a `{placeholder}`. Put it back, or choose **Save anyway**.
- The Studio runs away from `localhost` (Codespaces, Gitpod, a shared dev box): the API accepts writes only from `localhost` unless told otherwise. Add the Studio's origin to `LIVELOCALE_ALLOWED_ORIGINS` and restart `astro dev`; see [Teams and enterprise setups](../guides/teams.md#studio-away-from-localhost).
- The Changes panel shows no git status: it needs `git` on your `PATH` and the locales folder inside a repository.
- Run `npx livelocale doctor --app http://localhost:4321`; its **Mutation API** line says how many locales the API serves.

:::

## Right-to-left pages

Set `lang` and `dir` on `<html>` from the locale, as you would without livelocale. The watermark is invisible and never changes how Arabic or Hebrew text joins or flows:

```astro
---
// src/pages/ar/index.astro
import { createTranslations } from 'livelocale/server';

const locale = 'ar';
const t = createTranslations(locale, { supportedLocales: ['en', 'ar'] });
---

<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
  <body>
    <h1>{t.home.title}</h1>
  </body>
</html>
```

A key missing from `ar` shows the text of another locale in development, so it stays on the page and you can pick it in the Studio. See [Right-to-left sites](../guides/studio.md#right-to-left-sites) for editing them in the Studio.

## Pass translations to an island

Astro serializes the props of a `client:*` island. Pass `{ plain: true }` to get a plain object of resolved strings, safe to pass as props:

```astro
---
import { createTranslations } from 'livelocale/server';
import Counter from '../components/Counter.tsx';

const t = createTranslations('en', { supportedLocales: ['en', 'ar'], plain: true });
---

<Counter client:load labels={t.counter} />
```

Do not mount `LiveLocaleProvider` in an island: the integration already loads the client on every page.

## One namespace per page

To give each page or component only its own namespace, pass `namespace`. The result is the object of `locales/<locale>/home.json`. Its strings still carry the full key path, so the Studio saves an edit to `home.hero.title`:

```astro
---
import { createTranslations } from 'livelocale/server';

const t = createTranslations('en', {
  supportedLocales: ['en', 'ar'],
  plain: true,
  namespace: 'home',
});
---

<h1>{t.hero.title}</h1>
```

A helper of your own works too, such as `getT(ns, locale)` returning `createTranslations(locale, { plain: true })[ns]`, or `i18n(Astro, 'home')` around it. [`livelocale check`](../reference/cli/check.md#a-t-that-holds-one-namespace) reads `t.hero.title` in both cases, and in an island that gets `t` as a prop, as `home.hero.title`.

## Smaller dev pages

In `astro dev` every page carries every locale's strings by default (`window.__livelocale_fallback__`). On a big site that can add 100 KB or more to each page. Only `wrapTranslationEngine` calls in the browser read these strings. Text rendered in the frontmatter, and `plain: true` props passed to islands, already hold their text. `fallbackNamespaces` cuts the strings to the namespaces each page shows, plus the ones you list:

```js
// astro.config.mjs
integrations: [liveLocale({ localesPath: './locales', fallbackNamespaces: [] })],
```

List a namespace that only browser code reads through `wrapTranslationEngine`, such as a `client:only` island: `fallbackNamespaces: ['checkout']`. If code in the browser reads a key from a namespace the page left out, the browser console names that namespace. The text shows what production shows, so it does not go blank without a warning.

## Strip watermarks in an island

When an island compares, measures or stores a translated string, clean it with `unwrap`, and import it from `livelocale/strip`:

```tsx
// src/components/Counter.tsx
import { unwrap } from 'livelocale/strip';

export default function Counter({ labels }: { labels: { yes: string } }) {
  const isYes = (answer: string) => answer === unwrap(labels.yes);
  // ...
}
```

`livelocale/strip` holds only `unwrap`, `sanitizeZeroWidth` and `removeWatermarks`, with no side effects, so `astro build` ships these few functions. Imported from `livelocale/client`, the same `unwrap` brings the whole in-page client into the island's production chunk, because that entry starts the client when it loads. See [`unwrap`](../reference/configuration.md#unwrap).

## Preview builds and share links

A normal `astro build` has no watermarks and no client. Astro renders the text at build time, so a build the Studio can edit is a preview build, for a staging location only:

```bash
npx livelocale build --preview -- astro build
```

It builds with `LIVELOCALE=preview`, then packs the share Studio into `dist/livelocale/`. Every page loads the client, but it starts only inside the share Studio: the packed `flag.js` decides, so another site that frames yours gets nothing. `npx livelocale init --share` adds it to `package.json` as `build:preview`. See [Share links](../guides/share-links.md).

## What next

- [Share links](../guides/share-links.html): let someone fix text on the deployed site, with no account and no install.
- [Catch untranslated text in CI](../guides/ci-check.html): fail the build on missing keys, placeholder drift and hardcoded text.
- [Right-to-left sites](../guides/studio.html#right-to-left-sites): edit an Arabic or Hebrew site that flips right to left under the Studio.
