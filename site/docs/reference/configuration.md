---
title: Configuration
description: Every option of the livelocale route handler, Vite plugin, Astro integration, translation loader and wrappers, with its type and default.
---

# Configuration

livelocale has no config file. You configure it where you call it: the route handler, the Vite plugin, the Astro integration, the translation loader and the wrappers each take an options object. This page lists every option with its type and default. The environment variables are on [their own page](./environment.md).

| Import              | What this page covers from it                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `livelocale/server` | `createLiveLocaleHandler`, `createTranslations`, `wrapTranslationEngine`, `wrapNextIntl`, `getLiveLocaleMode`, `isLiveLocaleEnabled`, `unwrap`, `sanitizeZeroWidth`, `removeWatermarks` |
| `livelocale/client` | `wrapTranslationEngine`, `wrapNextIntl`, `startLiveLocale`, `unwrap`, `sanitizeZeroWidth`, `removeWatermarks`                                                                           |
| `livelocale/react`  | `LiveLocaleProvider`                                                                                                                                                                    |
| `livelocale/vite`   | `liveLocaleVite`                                                                                                                                                                        |
| `livelocale/astro`  | `liveLocale` (the default export)                                                                                                                                                       |
| `livelocale/strip`  | `unwrap`, `sanitizeZeroWidth`, `removeWatermarks`, with no side effects                                                                                                                 |
| `livelocale/wrap`   | `wrapTranslationEngine`, `wrapNextIntl`, with no side effects, for Server and Client Components                                                                                         |

## `createLiveLocaleHandler`

```ts
import { createLiveLocaleHandler } from 'livelocale/server';
import * as path from 'path';

const handler = createLiveLocaleHandler({ localesPath: path.resolve('./locales') });

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
```

The mutation API the Studio talks to, for Next.js. One handler serves the App Router (`app/api/livelocale/route.ts`, exported as `GET`, `POST` and `OPTIONS`) and the Pages Router (`pages/api/livelocale.ts`, as the default export); it tells the two apart on each call. `npx livelocale init` writes this file for you.

| Option           | Type                  | Default            | What it does                                                                                                                                                                                                                   |
| ---------------- | --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `localesPath`    | `string`              | required           | The locales folder. Absolute, or relative to the app's working directory; repository-relative when `github` is set.                                                                                                            |
| `allowedOrigins` | `string[]`            | the local Studio   | Origins the API accepts besides any `localhost` or `127.0.0.1` origin, which it always accepts. Without it, the list is `http://localhost:3010` and `http://127.0.0.1:3010`. `LIVELOCALE_ALLOWED_ORIGINS` adds to either list. |
| `git`            | `boolean`             | `true`             | Gives the Studio git status, commit and discard for the locales folder. Needs the `git` command on `PATH`. Ignored when `github` is set.                                                                                       |
| `authToken`      | `string`              | `LIVELOCALE_TOKEN` | A bearer token every request except the CORS preflight must carry. Mandatory in preview mode: without one the API refuses to serve.                                                                                            |
| `github`         | `GitHubGatewayConfig` | none               | Stores translations on a GitHub branch instead of the local files, for preview mode. Each save is a commit, and the Studio's commit action opens a pull request.                                                               |

### `github`

| Option       | Type     | Default                  | What it does                                                                        |
| ------------ | -------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `repo`       | `string` | required                 | The repository, as `owner/name`.                                                    |
| `branch`     | `string` | required                 | The branch that gets one commit per save. Created from `baseBranch` on first use.   |
| `baseBranch` | `string` | `main`                   | The pull request's target, and the branch `branch` is created from.                 |
| `token`      | `string` | required                 | A GitHub token with `contents: write` and `pull_requests: write` on the repository. |
| `apiBase`    | `string` | `https://api.github.com` | The GitHub API address. Set it for GitHub Enterprise Server.                        |
| `fetchImpl`  | `fetch`  | the global `fetch`       | The `fetch` the gateway calls. For tests.                                           |

## `liveLocaleVite`

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { liveLocaleVite } from 'livelocale/vite';

export default defineConfig({
  plugins: [react(), liveLocaleVite({ localesPath: './locales' })],
});
```

The Vite plugin. On the dev server it serves the mutation API at `/api/livelocale`, puts every locale's strings into the page so missing keys still render (the `sourceLocale` text wins over the other locales), and copies the server's mode (`development`, `preview` or `off`) into the page so the client bundle runs in the same mode, with no `NODE_ENV` from the bundler. In `vite build` it does nothing unless `share: true` is set, and it never packs an SSR or library build.

| Option               | Type                | Default                                  | What it does                                                                                                                                                                                                                                     |
| -------------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `localesPath`        | `string`            | required                                 | The locales folder, absolute or relative to the working directory.                                                                                                                                                                               |
| `git`                | `boolean`           | `true`                                   | Gives the Studio git status, commit and discard. Needs the `git` command on `PATH`.                                                                                                                                                              |
| `authToken`          | `string`            | `LIVELOCALE_TOKEN`                       | A bearer token every request except the CORS preflight must carry.                                                                                                                                                                               |
| `share`              | `boolean`           | `false`                                  | Writes the share Studio, `manifest.json`, the locale files and `flag.js` into `<outDir>/livelocale/` on `vite build`, and links `flag.js` from every HTML page.                                                                                  |
| `exposeRepo`         | `boolean`           | `false`                                  | Puts the GitHub `owner/repo` into the published manifest. Leave it off for a private repository.                                                                                                                                                 |
| `sourceLocale`       | `string`            | `en` when present, else the first locale | The source locale written into the manifest. On the dev server, its text wins in the strings put into the page for missing keys.                                                                                                                 |
| `shareBase`          | `string`            | Vite `base`                              | The site path the HTML is served from. Set it when `base` is a full URL, or when the HTML is served from a path other than `base`.                                                                                                               |
| `fallbackNamespaces` | `'all' \| string[]` | `'all'`                                  | Which namespaces of the strings put into the page for missing keys each page gets. A list puts in only the namespaces whose keys the page's HTML shows, plus the listed ones. See [Fallback strings in the page](#fallback-strings-in-the-page). |

The plugin has no `allowedOrigins` option. A Studio away from `localhost` is allowed through `LIVELOCALE_ALLOWED_ORIGINS`.

### Fallback strings in the page

The strings the plugin puts into the page (`window.__livelocale_fallback__`) are read in one place only: a `wrapTranslationEngine` call in the browser with no `fallback` of its own, when the engine lacks a key. The Studio does not read them. Text rendered on the server, and `createTranslations` results with `plain: true` passed as props, already hold their text.

With `'all'`, the default, every page carries every locale's strings, which can reach 100 KB or more on a big site. A list such as `fallbackNamespaces: []` keeps only the namespaces whose watermarked keys are in that page's HTML (a namespace is a top-level key: a file name in a folder layout). Add the namespaces that only browser code reads, such as those of a `client:only` island: `fallbackNamespaces: ['checkout']`. In a Vite single-page app the HTML holds no rendered text, so a list keeps exactly the listed namespaces.

With a list, a read in the browser of a key whose namespace the page left out warns once in the console, naming the namespace to add. The text is then what production shows, since `wrapTranslationEngine` adds no fallback in production.

## `liveLocale` (Astro)

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import liveLocale from 'livelocale/astro';

export default defineConfig({
  integrations: [liveLocale({ localesPath: './locales' })],
});
```

The Astro integration. It takes the options of [`liveLocaleVite`](#livelocalevite). Astro renders its own HTML, so the integration does three things the Vite plugin cannot do there:

- In `astro dev` it adds the Vite plugin, so the mutation API is at `/api/livelocale`.
- A middleware puts the mode flag and every locale's strings into `<head>` of each HTML page. It reads the locale files on every request, so a save shows on the next page load. With [`fallbackNamespaces`](#fallback-strings-in-the-page) set to a list, a page gets only the namespaces its rendered HTML shows, plus the listed ones.
- A page script starts the in-page client with [`startLiveLocale`](#startlivelocale), and starts it again after a view transition swaps the page.

A normal `astro build` gets none of it: no flag, no strings, no client code. A preview build (`LIVELOCALE=preview astro build`, or `npx livelocale build --preview -- astro build`) gets the flag, the strings and the client. `share: true` packs the share Studio into the output of a preview build only, since Astro renders the text at build time; in any other build it prints a warning and packs nothing.

The integration needs Node.js at run time: the middleware reads the locale files from disk.

## `createTranslations`

```tsx
import { createTranslations } from 'livelocale/server';

const t = createTranslations(locale, { supportedLocales: ['en', 'ar', 'es'] });
return <h1>{t.home?.title}</h1>;
```

Loads one locale for a Server Component and returns it as an object. A key missing from this locale takes its text from `fallbackLocale`, in development and in production.

While livelocale is on, every string in it carries its watermark. A key missing from both locales takes the text of another locale, so it still renders and stays editable in the Studio. `fallbackLocale` always wins over the other locales.

While it is off, the result is a plain object: the locale merged over `fallbackLocale`, with no watermarks. The merge is cached until a file changes. An array in the locale is kept as it is, so a list the translator shortened stays short.

It reads `<localesDir>/<locale>.json`, or every `.json` file in `<localesDir>/<locale>/` as one namespace each.

| Option             | Type       | Default                         | What it does                                                                                                                                                                                             |
| ------------------ | ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localesDir`       | `string`   | `locales` under `process.cwd()` | The locales folder.                                                                                                                                                                                      |
| `supportedLocales` | `string[]` | `['en']`                        | The locales it accepts. Any other locale gets `fallbackLocale`, so a request cannot reach a file outside the folder.                                                                                     |
| `fallbackLocale`   | `string`   | `'en'`                          | The locale it loads when the requested one is not supported or its file is missing, and the locale missing keys come from. With neither file, the result is `{}`.                                        |
| `plain`            | `boolean`  | `false`                         | Returns a plain object with every key filled in, instead of a Proxy. Use it to pass the translations as props or to `JSON.stringify` them.                                                               |
| `namespace`        | `string`   | the whole locale                | Returns one namespace: the object under this top-level key (one `<locale>/<namespace>.json` file), or under a dotted path such as `home.hero`. `{}` when neither the locale nor `fallbackLocale` has it. |

### One namespace

```astro
---
const t = createTranslations(locale, { supportedLocales: ['en', 'ar'], plain: true, namespace: 'home' });
---
<h1>{t.hero.title}</h1>
```

The result is the same object as `createTranslations(locale, options).home`, filled from `fallbackLocale` in production and from the other locales in development. Its strings carry the full key path (`home.hero.title`), so the Studio saves an edit to the right file. [`livelocale check`](./cli/check.md#a-t-that-holds-one-namespace) reads `t.hero.title` on it as `home.hero.title`.

### Reading the Proxy like an object

While livelocale is on and `plain` is off, the Proxy lists the keys only the fallback has, as the production object does. `Object.keys`, `Object.values`, `Object.entries`, spread, `in`, `hasOwnProperty` and `JSON.stringify` see the same keys in development and in production. For example, `Object.values(t.faq).find(Array.isArray)` finds a list that a half-translated locale takes from the fallback. Arrays stay arrays (`Array.isArray` is `true`), and an array in the locale keeps its own length. Each value read this way carries its watermark.

### Passing translations to a client component

While livelocale is on, the object is a Proxy, and it builds each value when your code reads it. A serializer that wants plain objects, such as the props of a Next.js Client Component, may refuse it. Pass `plain: true` to get a plain object that already holds every key:

```tsx
const t = createTranslations(locale, { supportedLocales: ['en', 'ar'], plain: true });
return <Header labels={t.header} />;
```

Its strings carry the same watermarks a read through the Proxy gives, so the Studio still finds them. In production it is the same plain object as without `plain`.

## `wrapTranslationEngine` and `wrapNextIntl`

```tsx
import { useTranslation } from 'react-i18next';
import { wrapTranslationEngine } from 'livelocale/client';

const { t: rawT } = useTranslation('auth');
const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' });
```

`wrapTranslationEngine(engine, options)` wraps a translation function or object, such as the `t` of `react-i18next` or `next-intl`, so every string it returns carries the watermark of its key. While livelocale is off it returns `engine` itself. `wrapNextIntl(t, namespace)` is the same call with `keyPrefix: namespace`, for `useTranslations(namespace)` and `getTranslations(namespace)`.

Both are exported from `livelocale/wrap`, `livelocale/client` and `livelocale/server`. `livelocale/wrap` works in a Server Component, a Client Component and a shared component with no directive. `livelocale/client` is a `'use client'` module, so a Server Component cannot call it, and `livelocale/server` reads files with Node, so browser code cannot import it. `livelocale/wrap` does not start the in-page client: `LiveLocaleProvider` or an import of `livelocale/client` still does that.

| Option      | Type                  | Default | What it does                                                                                                                                                                  |
| ----------- | --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyPrefix` | `string`              | none    | A dot-separated prefix put before every key, so `t('title')` on the `home` namespace is watermarked as `home.title`, the path in your locale file.                            |
| `fallback`  | `Record<string, any>` | none    | Text used when a key is missing, while livelocale is on. Without it, in the browser, the wrapper uses the strings the Vite plugin or the Astro integration put into the page. |

While livelocale is off, `wrapTranslationEngine` returns `engine` itself, so `fallback` is not used. Production text then comes from your engine alone: give it a fallback of its own, such as `fallbackLng` in i18next. `createTranslations` already merges `fallbackLocale` in production.

## `LiveLocaleProvider`

```tsx
// app/layout.tsx
import { LiveLocaleProvider } from 'livelocale/react';

<body>
  <LiveLocaleProvider />
  {children}
</body>;
```

Render it once in your root layout. It takes no props and renders nothing. While livelocale is on it loads the in-page client in the browser, and that client starts only when the page is inside the Studio's frame.

## `startLiveLocale`

```ts
import { startLiveLocale } from 'livelocale/client';

startLiveLocale(); // true when the client runs
```

Starts the in-page client without React, for Vue, Svelte or a plain Vite page. It starts only in the browser, while livelocale is on, and only inside the Studio's frame; otherwise it does nothing and returns `false`. The mode comes from the flag the Vite plugin or the Astro integration puts into the page, so it needs no `NODE_ENV` from the bundler.

Calling it twice never starts a second client. After a page swapped its `<body>` without a full load, a second call scans the new one. Importing `livelocale/client` calls it once already.

## `getLiveLocaleMode`

```ts
import { getLiveLocaleMode } from 'livelocale/server';

getLiveLocaleMode(); // 'off' | 'development' | 'preview'
```

The mode livelocale runs in, worked out from the environment on every call. `isLiveLocaleEnabled()` is `true` unless the mode is `'off'`. The rules are on the [environment variables page](./environment.md#how-the-mode-is-chosen).

## `unwrap`

```ts
import { unwrap } from 'livelocale/strip';

unwrap(t('yes')) === 'Yes';
```

Removes the watermark from a translated value, wherever a string is compared, measured or stored rather than shown. It is deep: strings inside arrays and plain objects are cleaned too, and its input is never changed. Exported from `livelocale/strip`, `livelocale/client` and `livelocale/server`.

In code that ships to the browser, import it from `livelocale/strip`. That entry holds only `unwrap`, `sanitizeZeroWidth` and `removeWatermarks` and has no side effects, so a production bundle gets these few functions. `livelocale/client` starts the in-page client when it is imported, so a bundler keeps all of it, with the mode and hosting-platform checks, even when you use only `unwrap`.

## `sanitizeZeroWidth`

```ts
import { sanitizeZeroWidth } from 'livelocale/strip';

const clean = sanitizeZeroWidth(input.value);
```

Removes every zero-width space, joiner and non-joiner from a string, for a form value about to be submitted. It also removes the ones Persian, Urdu and Thai text needs, so for text a person reads, `removeWatermarks` removes only complete watermarks and keeps the rest. Exported from `livelocale/strip`, `livelocale/client` and `livelocale/server`.

## `livelocale.allow`

```text
# livelocale.allow
LiveLocale
GitHub
key:checkout.brand
```

A file at the project root that [`check --hardcoded`](./cli/check.md#hardcoded) reads. Each line is a word or phrase that never counts as hardcoded text, matched as a whole word and case-sensitively. A `key:` line exempts that translation key from the `untranslated` and `wrong-script` checks, for a value that is the same in every language. Blank lines and lines starting with `#` are skipped. Without `--hardcoded` the file is not read; `--allow <word>` adds a word for one run.
