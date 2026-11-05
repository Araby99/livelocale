---
title: Vite + React
description: Add livelocale to a Vite and React app with the Vite plugin, open the Studio beside vite, and fix your first line of text into the locale file.
---

# Vite + React

Five steps from `npm install` to a fixed line of text in your locale file. Each step shows what you should see when it worked. You need a Vite app with React and its translations in JSON files under `locales/`.

<DocShot lead name="vite-alt-click" alt="The headline Alt+Clicked in the Vite preview: the editor is open on home.title, with the reference Welcome to the static playground and the fix Welcome to the Vite playground typed, above Save Changes." caption="Where step 4 ends: the key under the cursor, open in the editor." />

## 1. Install livelocale

```bash
npm install livelocale
```

It is a dependency, not a dev dependency: your app imports `livelocale/react` and `livelocale/client` at run time. Then check that the CLI answers:

```bash
npx livelocale --help
```

It worked when it prints its usage, starting with:

```cli help-head

```

::: details Didn't work?

- Run both commands in the folder that holds your app's `package.json`, so `npx` finds the copy npm just installed.
- livelocale needs Node.js 18 or later.
- Once `vite` runs with the plugin (steps 2 and 3), `npx livelocale doctor --app http://localhost:5173` checks the setup for you.

:::

## 2. Add the plugin, the provider and the wrapper

`init` writes an API route for Next.js only. On Vite you add the plugin by hand: it serves the same API from the Vite dev server, so the Studio can read and write your locale files.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { liveLocaleVite } from 'livelocale/vite';

export default defineConfig({
  plugins: [react(), liveLocaleVite({ localesPath: './locales' })],
});
```

Render `LiveLocaleProvider` once, at the root of your app. It renders nothing. In development it loads the in-page client, which starts only when your page is inside the Studio.

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { LiveLocaleProvider } from 'livelocale/react';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <>
    <LiveLocaleProvider />
    <App />
  </>
);
```

The Studio finds a string by an invisible watermark, added in development to every string that goes through livelocale. Wrap the `t` function your app looks text up with in `wrapTranslationEngine`. With `react-i18next`:

```tsx
import { useTranslation } from 'react-i18next';
import { wrapTranslationEngine } from 'livelocale/client';

export default function Login() {
  const { t: rawT } = useTranslation('auth');
  const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' });

  return <h1>{t('login.title')}</h1>;
}
```

A `t` of your own works the same way: `const t = wrapTranslationEngine(translate)`. Then check that every key your code asks for is in every locale file:

```bash
npx livelocale check
```

```cli check-clean

```

Every option of the plugin is on the [configuration reference](../reference/configuration.md#livelocalevite).

::: details Didn't work?

- `check` lists each missing key and the locale it is missing from; add it to that file and run it again. If your files live elsewhere, run `npx livelocale check --locales <path>` and set the same folder as `localesPath` in `vite.config.ts`.
- `localesPath` is resolved from the folder you start `vite` in, so start it from the app's folder.
- Text you never wrap carries no watermark, so the Studio cannot pick it. `npx livelocale check --hardcoded` lists the text in your components that never goes through translation; see [Catch untranslated text in CI](../guides/ci-check.md).
- With a namespace, give the wrapper the same prefix (`keyPrefix: 'auth'`), so `t('login.title')` maps to `auth.login.title` in your file.
- Once `vite` runs (next step), `npx livelocale doctor --app http://localhost:5173` probes the plugin's API on the dev server.

:::

## 3. Start the app and the Studio

Run Vite as usual, and the Studio in a second terminal, pointed at Vite's port:

```bash
npx vite
```

```bash
npx livelocale studio --app http://localhost:5173
```

Open `http://localhost:3010`. The Studio loads your app in the middle, the Locale Directory lists your keys, and the status reads **Active** once the page answers.

<DocShot name="vite-studio-open" alt="The Studio beside the running Vite playground: the Locale Directory lists two keys, home.greet and home.title, the preview shows the page with status Active, and the editor says Select an Element." caption="The Studio, open beside vite." />

::: details Didn't work?

With the app running, run `npx livelocale doctor --app http://localhost:5173`. On a Vite app, read its **Mutation API** and **Studio can embed the app** lines: the file checks above them look for Next.js files (`app/api/livelocale/route.ts`, `app/layout.tsx`), which a Vite app does not have.

- **Mutation API** says the app is not reachable: `vite` is not running, or it runs on another port. Pass that port to both commands.
- **Mutation API** reports HTTP 404: the plugin is not loaded. Check `liveLocaleVite(...)` is in `plugins` in `vite.config.ts` and restart `vite`.
- **Studio can embed the app** warns about `frame-ancestors` or `X-Frame-Options`: the preview stays blank. Allow `http://localhost:3010` in the headers your dev server sends.
- Port 3010 is taken: add `--port <number>` to `studio`. More setups are in [Teams and enterprise setups](../guides/teams.md).

:::

## 4. Alt+Click and fix

Hold Alt (Option on a Mac) and click a line of text in the preview. The editor opens on its key, with the reference text and the translation. Type the fix and press **Save Changes**. It worked when the editor looks like the shot at the top of this page.

::: details Didn't work?

- The click follows the link or does nothing: that text is not wrapped (step 2), or you clicked without holding Alt.
- No text responds at all: livelocale runs only while `NODE_ENV` is `development`, which the `vite` dev server sets; `vite build` and `vite preview` do not. `LIVELOCALE=off` turns it off; see [Safety switches](../how-it-works/safety-switches.md).
- Run `npx livelocale doctor --app http://localhost:5173` to check the plugin's API again.

:::

## 5. See the file change

The save is written to your locale file at once. Open **Changes** in the Studio header: the locale file is listed as modified, with its diff, and **This session** keeps the edit with **Undo**.

<DocShot name="vite-saved-file" alt="The Changes panel after a save in the Vite playground: playground-vite/locales/en.json is listed as modified, its git diff shows the old one-line file struck and the new title added, and This session lists the edit from Welcome to the static playground to Welcome to the Vite playground with Undo." caption="The file, its diff and the edit you can undo." />

It is an ordinary file edit: `git diff locales/` shows the same change in your terminal, and you commit it like any other. The Studio can commit the locales folder for you too; see [The Studio](../guides/studio.md#review-and-commit).

::: details Didn't work?

- **Save Changes** shows a placeholder warning: the fix dropped or added a `{placeholder}`. Put it back, or choose **Save anyway**.
- The Studio runs away from `localhost` (Codespaces, Gitpod, a shared dev box): the API accepts writes only from `localhost` unless told otherwise. Add the Studio's origin to `LIVELOCALE_ALLOWED_ORIGINS` and restart `vite`; see [Teams and enterprise setups](../guides/teams.md#studio-away-from-localhost).
- The Changes panel shows no git status: it needs `git` on your `PATH` and the locales folder inside a repository.
- Run `npx livelocale doctor --app http://localhost:5173`; its **Mutation API** line says how many locales the API serves.

:::

## What next

- [Share links](../guides/share-links.html): let someone fix text on the deployed site, with no account and no install.
- [Catch untranslated text in CI](../guides/ci-check.html): fail the build on missing keys, placeholder drift and hardcoded text.
- [Right-to-left sites](../guides/studio.html#right-to-left-sites): edit an Arabic or Hebrew site that flips right to left under the Studio.
