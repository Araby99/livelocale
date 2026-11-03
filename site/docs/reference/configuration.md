---
title: Configuration
description: Every option of the livelocale route handler, Vite plugin, translation loader and wrappers, with its type and default, and the livelocale.allow file.
---

# Configuration

livelocale has no config file. You configure it where you call it: the route handler, the Vite plugin, the translation loader and the wrappers each take an options object. This page lists every option with its type and default. The environment variables are on [their own page](./environment.md).

| Import              | What this page covers from it                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `livelocale/server` | `createLiveLocaleHandler`, `createTranslations`, `wrapTranslationEngine`, `wrapNextIntl`, `getLiveLocaleMode`, `isLiveLocaleEnabled`, `unwrap`, `sanitizeZeroWidth`, `removeWatermarks` |
| `livelocale/client` | `wrapTranslationEngine`, `wrapNextIntl`, `unwrap`, `sanitizeZeroWidth`, `removeWatermarks`                                                                                              |
| `livelocale/react`  | `LiveLocaleProvider`                                                                                                                                                                    |
| `livelocale/vite`   | `liveLocaleVite`                                                                                                                                                                        |

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

The Vite plugin. On the dev server it serves the mutation API at `/api/livelocale`, puts every locale's strings into the page so missing keys still render, and copies the server's `LIVELOCALE` value into the page so the client bundle runs in the same mode. In `vite build` it does nothing unless `share: true` is set, and it never packs an SSR or library build.

| Option         | Type      | Default                                  | What it does                                                                                                                                                    |
| -------------- | --------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localesPath`  | `string`  | required                                 | The locales folder, absolute or relative to the working directory.                                                                                              |
| `git`          | `boolean` | `true`                                   | Gives the Studio git status, commit and discard. Needs the `git` command on `PATH`.                                                                             |
| `authToken`    | `string`  | `LIVELOCALE_TOKEN`                       | A bearer token every request except the CORS preflight must carry.                                                                                              |
| `share`        | `boolean` | `false`                                  | Writes the share Studio, `manifest.json`, the locale files and `flag.js` into `<outDir>/livelocale/` on `vite build`, and links `flag.js` from every HTML page. |
| `exposeRepo`   | `boolean` | `false`                                  | Puts the GitHub `owner/repo` into the published manifest. Leave it off for a private repository.                                                                |
| `sourceLocale` | `string`  | `en` when present, else the first locale | The source locale written into the manifest.                                                                                                                    |
| `shareBase`    | `string`  | Vite `base`                              | The site path the HTML is served from. Set it when `base` is a full URL, or when the HTML is served from a path other than `base`.                              |

The plugin has no `allowedOrigins` option. A Studio away from `localhost` is allowed through `LIVELOCALE_ALLOWED_ORIGINS`.

## `createTranslations`

```tsx
import { createTranslations } from 'livelocale/server';

const t = createTranslations(locale, { supportedLocales: ['en', 'ar', 'es'] });
return <h1>{t.home?.title}</h1>;
```

Loads one locale for a Server Component and returns it as an object. While livelocale is on, every string in it carries its watermark, and keys missing from this locale fall back to the other locales' text, so they still render and stay editable. While it is off, the object is returned as it was read.

It reads `<localesDir>/<locale>.json`, or every `.json` file in `<localesDir>/<locale>/` as one namespace each.

| Option             | Type       | Default                         | What it does                                                                                                               |
| ------------------ | ---------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `localesDir`       | `string`   | `locales` under `process.cwd()` | The locales folder.                                                                                                        |
| `supportedLocales` | `string[]` | `['en']`                        | The locales it accepts. Any other locale gets `fallbackLocale`, so a request cannot reach a file outside the folder.       |
| `fallbackLocale`   | `string`   | `'en'`                          | The locale it loads when the requested one is not supported or its file is missing. With neither file, the result is `{}`. |

## `wrapTranslationEngine` and `wrapNextIntl`

```tsx
import { useTranslation } from 'react-i18next';
import { wrapTranslationEngine } from 'livelocale/client';

const { t: rawT } = useTranslation('auth');
const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' });
```

`wrapTranslationEngine(engine, options)` wraps a translation function or object, such as the `t` of `react-i18next` or `next-intl`, so every string it returns carries the watermark of its key. While livelocale is off it returns `engine` itself. `wrapNextIntl(t, namespace)` is the same call with `keyPrefix: namespace`, for `useTranslations(namespace)` and `getTranslations(namespace)`.

Both are exported from `livelocale/client` and `livelocale/server`.

| Option      | Type                  | Default | What it does                                                                                                                                       |
| ----------- | --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keyPrefix` | `string`              | none    | A dot-separated prefix put before every key, so `t('title')` on the `home` namespace is watermarked as `home.title`, the path in your locale file. |
| `fallback`  | `Record<string, any>` | none    | Text used when a key is missing. Without it, in the browser, the wrapper uses the strings the Vite plugin put into the page.                       |

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

## `getLiveLocaleMode`

```ts
import { getLiveLocaleMode } from 'livelocale/server';

getLiveLocaleMode(); // 'off' | 'development' | 'preview'
```

The mode livelocale runs in, worked out from the environment on every call. `isLiveLocaleEnabled()` is `true` unless the mode is `'off'`. The rules are on the [environment variables page](./environment.md#how-the-mode-is-chosen).

## `unwrap`

```ts
import { unwrap } from 'livelocale/client';

unwrap(t('yes')) === 'Yes';
```

Removes the watermark from a translated value, wherever a string is compared, measured or stored rather than shown. It is deep: strings inside arrays and plain objects are cleaned too, and its input is never changed. Exported from `livelocale/client` and `livelocale/server`.

## `sanitizeZeroWidth`

```ts
import { sanitizeZeroWidth } from 'livelocale/client';

const clean = sanitizeZeroWidth(input.value);
```

Removes every zero-width space, joiner and non-joiner from a string, for a form value about to be submitted. It also removes the ones Persian, Urdu and Thai text needs, so for text a person reads, `removeWatermarks` removes only complete watermarks and keeps the rest. Exported from `livelocale/client` and `livelocale/server`.

## `livelocale.allow`

```text
# livelocale.allow
LiveLocale
GitHub
key:checkout.brand
```

A file at the project root that [`check --hardcoded`](./cli/check.md#hardcoded) reads. Each line is a word or phrase that never counts as hardcoded text, matched as a whole word and case-sensitively. A `key:` line exempts that translation key from the `untranslated` and `wrong-script` checks, for a value that is the same in every language. Blank lines and lines starting with `#` are skipped. Without `--hardcoded` the file is not read; `--allow <word>` adds a word for one run.
