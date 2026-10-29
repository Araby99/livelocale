# LiveLocale

<div align="center">
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

## 💡 How It Works: Zero-Width Unicode Watermarking

`livelocale` bridges your running application UI with your local JSON translation files using **Zero-Width Unicode Watermarking**.

1. **Watermark Encoding:** In development, when a translation key is looked up, the library prepends an invisible Unicode watermark (using combinations of `\u200D` (ZWJ), `\u200B` (ZWS), and `\u200C` (ZWNJ)) to the text.
2. **DOM Scanning:** A lightweight dev-only browser listener scans the active DOM, decodes the watermarks, and dynamically hooks visual highlights onto translated elements.
3. **Input & Clipboard Sanitization:** To ensure the watermarks never pollute your database, forms, or clipboard, the library automatically intercepts `'copy'`/`'paste'` events and patches controlled input elements at runtime.
4. **Zero Production Footprint:** In production mode, all interceptors, listeners, and wrapper logic are bypassed completely, returning plain strings without overhead.

---

## ✨ Features

- 🎯 **In-Context Visual Editing:** Hover over any translated text to highlight it; click to instantly edit in the visual panel.
- 🔴 **Missing Key Indicators:** Identifies translation keys that are missing in the active locale but exist in the codebase or other translation files, highlighting them with red indicators.
- 🔄 **Smart Fallback Placeholders:** Automatically renders translation placeholders from alternative languages for missing keys in development, keeping them visible and fully click-to-edit inline.
- 📁 **Namespaced Folder Support:** Handles nested multi-file folder layouts (e.g., `locales/en/auth.json`) natively, merging files during load and separating them during mutation.
- 🧼 **Input & Form Sanitization:** Patches controlled inputs and intercepts clipboard actions to strip watermarks in development automatically.
- ⚡ **Atomic File Operations:** Prevents Next.js hot module replacement (HMR) reading corrupt half-written files via atomic temp-to-final writes.
- 🔒 **Secure Local Boundaries:** Restricts directory traversal, verifies origins, and supports deep schemas up to 30 levels of recursion.
- 🤖 **CLI Migration Tool:** Automatically parses and wraps standard `react-i18next` hooks with a single command.
- 🔢 **Plural forms editor:** ICU `plural` / `select` messages are edited one branch at a time, with the categories your locale needs (Arabic gets all six) pre-filled from CLDR rules.
- 🧭 **Namespace-aware key scanning:** `useTranslations('home')`, `getTranslations`, `useTranslation('auth')`, and the wrap helpers are understood, so the Locale Directory shows `home.title`, not a false "missing" `title`.
- 🧩 **Placeholder safety:** Saves that drop or invent a `{placeholder}`, `{{interpolation}}`, `%s`, or `<tag>` are held back with a clear warning, and broken ICU plural/select syntax is rejected, unless you choose Save anyway.
- 🌍 **Preview mode for non-developers:** Run a token-protected Studio against a preview deployment; every save becomes a commit on a GitHub branch and one click opens the pull request.
- 🧾 **Review, commit, undo:** The Studio's Changes panel shows git status and a diff of your locale files, commits them with a message, discards them, and undoes any edit from the session.
- 🩺 **Doctor:** `npx livelocale doctor` finds the usual integration mistakes before you open the Studio.
- ✅ **Translation check for CI:** `npx livelocale check` fails the build on missing keys, placeholder drift between locales, and broken ICU syntax, and lists keys nothing uses.
- 🛑 **Safety switches:** `LIVELOCALE=off` kill switch, and automatic shut-off on hosting platforms so a staging build can never leak watermarks.
- 🧭 **App Router and Pages Router:** One handler works with both `route.ts` and `pages/api` signatures.
- 🌐 **Works beyond localhost:3000:** Point the Studio at any port or hostname with `--app` or `?app=`, and allow Codespaces or custom origins with one env var.

---

## ⚡ Quick Setup

### 1. Install Dependency

```bash
npm install livelocale
```

---

### 2. Add the Client Listener

Mount the `LiveLocaleProvider` inside your root layout. This launches the dev-mode DOM scanners and intercepts clipboard copy/paste actions.

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

---

### 3. Initialize Server Mutation Handler

Initialize the server-side API endpoints automatically by running:

```bash
npx livelocale init
```

_The CLI will check for TypeScript/JavaScript and write the appropriate mutation file (`/app/api/livelocale/route.ts` or `/pages/api/livelocale.ts`) directly into your project._

> [!NOTE]
> For manual setup, create `app/api/livelocale/route.ts` with:
>
> ```typescript
> import { createLiveLocaleHandler } from 'livelocale/server';
> import * as path from 'path';
>
> const handler = createLiveLocaleHandler({
>   localesPath: path.resolve('./locales'),
> });
>
> export const GET = handler;
> export const POST = handler;
> export const OPTIONS = handler;
> ```
>
> For the **Pages Router**, create `pages/api/livelocale.ts` instead and default-export the
> same handler. It accepts the `(req, res)` signature automatically:
>
> ```typescript
> import { createLiveLocaleHandler } from 'livelocale/server';
> import * as path from 'path';
>
> export default createLiveLocaleHandler({ localesPath: path.resolve('./locales') });
> ```

---

### 4. Enable Key Watermarking

Wrap translation lookups to inject dev-only watermarks.

#### Option A: Server Components (Direct Loader)

Use `createTranslations` to load flat JSON files or directory-based namespaces:

```tsx
import { createTranslations } from 'livelocale/server';

export default async function Page({ searchParams }) {
  const { locale = 'en' } = await searchParams;
  const t = createTranslations(locale, {
    supportedLocales: ['en', 'ar', 'es'],
    localesDir: './locales',
  });

  return <h1>{t.home?.welcome}</h1>;
}
```

#### Option B: Client-side Hooks (react-i18next or next-intl)

Wrap hook return values with `wrapTranslationEngine`:

```tsx
'use client';
import { useTranslation } from 'react-i18next';
import { wrapTranslationEngine } from 'livelocale/client';

export default function Page() {
  const { t: rawT } = useTranslation('auth');
  const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' });

  return <h1>{t('login.title')}</h1>;
}
```

---

### 5. Launch the Visual Studio

Boot the editing studio next to your local development server:

```bash
npx livelocale studio --port 3010 --app http://localhost:3000
```

Open `http://localhost:3010` to view the Studio, loaded with your app. `--app` defaults to
`http://localhost:3000`; you can also switch apps without restarting by opening
`http://localhost:3010/?app=http://localhost:3001`.

---

### 6. Check your setup

```bash
npx livelocale doctor --app http://localhost:3000
```

The doctor verifies the route handler, the provider mount, middleware matchers, frame-blocking
headers, and locale JSON, then probes the running app. It exits non-zero on blocking problems, so
it can also run in CI.

---

## 🛠️ CLI Reference

### `init`

Generates API route handlers based on your router structure (App vs Pages Router) and configuration language (TypeScript vs JavaScript).

```bash
npx livelocale init [--dir <path>]
```

### `init --share`

Sets up the share link for your stack and, on a GitHub remote, writes
`.github/workflows/livelocale.yml`, which turns change links into pull requests. It prints every
file it creates, updates, leaves unchanged or skips, then what is left for you to do.

```bash
npx livelocale init --share [--locales <path>] [--source <locale>] [--branches <a,b>] [--overwrite] [--dir <path>]
```

| Stack                      | Build change                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRA / webpack / Rsbuild    | `"build": "react-scripts build && livelocale pack build"`. This is an explicit `&&`, not a `postbuild` hook, because Yarn Berry and some pnpm versions skip pre/post scripts, and hosts that call the bundler directly skip them too ([yarn](https://v2.yarnpkg.com/advanced/lifecycle-scripts), [pnpm](https://pnpm.io/cli/run)). |
| Next.js `output: 'export'` | `"build:preview": "livelocale build --preview -- next build"`, deployed to a staging location, because the HTML is pre-rendered and must be watermarked at build time.                                                                                                                                                             |
| Next.js on Vercel/Node     | For the Preview environment, use the build command `livelocale build --preview -- next build`. It packs into a gitignored `public/livelocale/`.                                                                                                                                                                                    |
| Custom CI                  | `LIVELOCALE=preview <your build>` (only for SSR/SSG), then `npx livelocale pack <outDir>`.                                                                                                                                                                                                                                         |

For Vite it adds `share: true` to your `liveLocaleVite({ ... })` call. The scripts it writes also
pass `--locales` and `--source`; webpack and Rsbuild pack `dist`.

- `--locales` — locales directory relative to the project (default: the first of `locales`,
  `src/locales`, `public/locales`, `src/i18n/locales` and `messages` that holds locale JSON).
- `--source` — source locale (default `en`).
- `--branches` — branches a change link may target (default: the repository's default branch, at
  most 10). Merge the workflow into each of them too: a pull request into a branch runs that
  branch's copy of the workflow.
- `--overwrite` — replace an existing workflow file whose content differs (it is skipped otherwise).
- On another git host no workflow is written; use `npx livelocale apply "<link>" --pr`.

Commit and push the result: the workflow must be on the default branch.

### `studio`

Spins up a lightweight, CORS-enabled HTTP server serving the Visual Studio assets statically.

```bash
npx livelocale studio [--port <number>] [--app <origin>]
```

- `--port` — port for the Studio itself (default `3010`).
- `--app` — origin of the app being edited (default `http://localhost:3000`).

### `doctor`

Inspects the project for the integration problems the Studio cannot recover from, and optionally
probes the running app.

```bash
npx livelocale doctor [--dir <path>] [--locales <path>] [--app <url>] [--share] [--token <token>]
```

- `--locales` — locales directory relative to the project (default `locales`).
- `--app` — also check that the mutation API answers and that pages are embeddable. A path is
  the app base: `--app https://user.github.io/repo/` probes a GitHub Pages project site (a
  trailing `index.html` is dropped).
- `--share` — run the share link probes even when `<base>livelocale/manifest.json` does not
  answer. They also run on their own whenever the manifest answers with JSON. They check the
  Studio page, the manifest, `flag.js` and its tag first in `<head>`, frame headers
  (`X-Frame-Options: DENY` or `frame-ancestors 'none'` breaks the Studio; `SAMEORIGIN` is fine),
  `script-src`, and service workers, then print `🔗 Share link: <base>livelocale/index.html`.
  When a Workbox service worker (vite-plugin-pwa, workbox-webpack-plugin) would answer the Studio
  with your app shell, add this line to its Workbox options:
  `navigateFallbackDenylist: [/^\/livelocale\//]`.
- `--token` — access token for a preview deployment (defaults to `LIVELOCALE_TOKEN`); with it the
  doctor also reports the server mode and repository access problems.

### `check`

A read-only consistency check of your translations, built for CI. It runs in any `NODE_ENV`.

```bash
npx livelocale check [--dir <path>] [--locales <path>] [--source <locale>] [--no-unused] [--strict] [--json]
```

| Finding                                                                         | Level   |
| ------------------------------------------------------------------------------- | ------- |
| Locale file is not valid JSON                                                   | problem |
| Broken ICU syntax (unbalanced braces, `plural` without `other`)                 | problem |
| Key used in code but missing from a locale                                      | problem |
| Key in the source locale but missing from another locale                        | problem |
| Placeholders differ from the source locale (`{name}`, `{{count}}`, `%s`, `<b>`) | problem |
| Empty value                                                                     | warning |
| Key never referenced in code                                                    | warning |

- `--source` — locale the others are compared against (default `en`, else the first locale).
- `--no-unused` — skip the unused-key report. Keys built at run time (``t(`status.${s}`)``) cannot be
  detected, so review this list before deleting anything.
- `--strict` — treat warnings as problems.
- `--json` — print the full report for other tools.

The command exits with code 1 when there are problems. Code references resolve namespaces the same
way the Studio does, an object access such as `t.home` covers every key under `home`, and i18next
plural families (`items_one`, `items_other`, …) count as one key, so Arabic's six forms against
English's two are not reported.

```yaml
# .github/workflows/i18n.yml
- run: npx livelocale check
```

### `pack`

Turns a finished static build into a share link: it writes the Studio, `manifest.json`, the locale
files and `flag.js` into `<outDir>/livelocale/` and links `flag.js` from every HTML page. Run it
after your build, for example `"build": "vite build && livelocale pack dist"`.

```bash
npx livelocale pack <outDir> [--dir <path>] [--locales <path>] [--source <locale>] [--base <path>] [--expose-repo] [--no-inject]
```

- `<outDir>` — the built site folder, relative to `--dir` (for example `dist`, `build` or `out`).
- `--locales` — locales directory relative to the project (default `locales`).
- `--source` — source locale (default `en`, else the first locale).
- `--base` — site path the app is served from, such as `/repo/` (default: detected from the
  project, else `/`). A relative base (`./`) prints a warning; pass an absolute one if the app has
  client-side routes.
- `--expose-repo` — put the GitHub `owner/repo` into `livelocale/manifest.json` (off by default).
- `--no-inject` — do not add the `flag.js` script to HTML files. Next.js outputs are never injected.

The share link is `<your site><base>livelocale/index.html`. Nothing is written outside
`<outDir>/livelocale/` except that one script tag, and an existing `livelocale/` folder is replaced
only when pack wrote it.

### `build`

Runs your build command and packs its output in one step. The environment variables work the same
on Windows, macOS and Linux, so no `cross-env` is needed.

```bash
npx livelocale build [--preview] [--out <dir>] [pack options] -- <your build command>
```

- `--preview` — run the command with `LIVELOCALE=preview` and `NEXT_PUBLIC_LIVELOCALE=preview`, so
  server-rendered and pre-rendered pages carry watermarks.
- `--out` — the build output folder (default: the first of `dist/`, `build/` or `out/` that holds an
  `index.html` written by this build). Next.js projects always pack into `public/livelocale/`
  before the build runs, so Next copies it into the output.
- `--dir`, `--locales`, `--source`, `--base` and `--expose-repo` work as they do for `pack`.

| Stack                      | Build change                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js `output: 'export'` | `"build:preview": "livelocale build --preview -- next build"`, deployed to a staging location, because the HTML is pre-rendered and must be watermarked at build time. |
| Next.js on Vercel/Node     | For the Preview environment, use the build command `livelocale build --preview -- next build`. It packs into a gitignored `public/livelocale/`.                        |
| Custom CI                  | `LIVELOCALE=preview <your build>` (only for SSR/SSG), then `npx livelocale pack <outDir>`.                                                                             |

A static export stops before building when `app/api/livelocale/route.*` exports POST, because export
mode only allows GET route handlers; the share link does not need that route.

### `apply`

Applies a LiveLocale change link (the `lc1.` link a translator sends from the share link) to your
locale files. Every edit is checked again against your own files and source locale before anything
is written.

```bash
npx livelocale apply "<link>" [--pr] [--dir <path>] [--locales <path>] [--source <locale>] [--force] [--dry-run]
npx livelocale apply changes.txt
npx livelocale apply - < changes.txt
npx livelocale apply --clipboard
```

- The input is the change link itself (or the Studio link that carries it), a file that holds it
  (the change file Send offers, or a saved email or issue), `-` to read standard input, or
  `--clipboard` to read the clipboard. Pass the link or `--clipboard`, not both.
- cmd.exe cuts command lines at 8,191 characters, so on Windows pass a long link as a file or with
  `--clipboard`.
- `--pr` — commit the changes on a new `livelocale/apply-<time>` branch, push it and open a pull
  request.
- `--locales` and `--source` work as they do for `check` (default `locales`, and `en`, else the
  first locale).
- `--dry-run` — plan the edits and print the summary without writing any file.
- `--force` — also apply edits the translator saved with "Save anyway" (for example a dropped
  placeholder). Without it they are reported as `needs --force` and skipped.

The summary lists each edit's locale, key and status (applied, already done, conflict, needs
--force or rejected) and never prints translation values. The exit code is 0 when every edit was
applied or already done, and 1 when any edit is a conflict, needs `--force` or was rejected, or
when the link cannot be read.

#### `apply --github-event`

```bash
npx livelocale apply --github-event --locales <path> --source <locale> [--branches <a,b>] [--dir <path>]
```

For the generated `.github/workflows/livelocale.yml` workflow only; do not run it yourself. It reads
the issue, comment, dispatch or pull request event from `$GITHUB_EVENT_PATH` (never from the
command line) and needs `GITHUB_TOKEN`.

- Only a maintainer (OWNER, MEMBER or COLLABORATOR, or write access) makes it write. Anyone else
  gets the reply "Waiting for a maintainer: comment `/livelocale apply`".
- It writes one commit on a `livelocale/issue-<n>` branch (`livelocale/run-<id>` for a manual
  run), opens or reuses the pull request, and comments the link on the issue. When the repository
  does not let GitHub Actions open pull requests, the comment carries a one-click compare link
  instead.
- `--locales` and `--dir` are relative to the repository root. `--branches` lists the branches a
  link may target (default: the repository's default branch); a link made from any other branch
  targets the default branch, and the comment says so.
- `--force` is not accepted; a maintainer comments `/livelocale apply --force` instead.
- When the pull request is merged or closed, it closes the issue.

### `migrate`

Performs static analysis to scan and automatically wrap existing `react-i18next` hooks with `wrapTranslationEngine`.

```bash
npx livelocale migrate [--dir <path>] [--exclude <dirs>] [--dry-run]
```

`migrate` needs the `typescript` package to parse your source. It is an optional dependency so
JavaScript-only projects are not forced to install it; `init` and `studio` never need it.

---

## ⚙️ Non-Next.js Integration (React + Vite SPA)

If you are using a standard React Client-Side SPA (like Vite), you don't have Next.js API endpoints. You can use the built-in Vite plugin inside `vite.config.ts` to automatically capture the mutation endpoints:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { liveLocaleVite } from 'livelocale/vite';

export default defineConfig({
  plugins: [
    react(),
    liveLocaleVite({
      localesPath: './locales', // path to your locales directory
    }),
  ],
});
```

### Share link from `vite build`

Set `share: true` and `vite build` also writes a share link: the Studio, `manifest.json`, the
locale files and `flag.js` go into `<outDir>/livelocale/`, and `index.html` loads
`<base>livelocale/flag.js` first in `<head>`. Deploy the output anywhere static and send
`<origin><base>livelocale/index.html`. Without `share` the build output is unchanged.

```typescript
liveLocaleVite({
  localesPath: './locales',
  share: true, // write <outDir>/livelocale/ on vite build (default: false)
  exposeRepo: false, // put the GitHub owner/repo into the manifest (default: false)
  sourceLocale: 'en', // default: en when present, else the first locale
  shareBase: '/app/', // the site path the HTML is served from (default: Vite base)
});
```

| Option         | Default                                  | What it does                                                                                                                               |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `share`        | `false`                                  | Write the share Studio into `<outDir>/livelocale/` on `vite build`. SSR and library builds are skipped.                                    |
| `exposeRepo`   | `false`                                  | Put the GitHub `owner/repo` into the published manifest and the change link. Leave it off for a private repository.                        |
| `sourceLocale` | `en` when present, else the first locale | The locale placeholders are checked against.                                                                                               |
| `shareBase`    | Vite `base`                              | The path the HTML is served from. Set it when `base` is a full URL (a CDN), which the build otherwise rejects with `BAD_BASE`, or differs. |

A relative `base` (`./`) links `flag.js` per HTML file and prints a warning: pages served by a
client-side route fallback cannot load it, so prefer an absolute `base` for apps with such routes.

---

## 🧾 Reviewing and committing from the Studio

Every save writes to disk immediately. The **Changes** button in the Studio header opens a panel
that keeps those writes reviewable:

- **Locale files** lists what git sees as modified, added, or deleted under your locales directory,
  with the current branch and an on-demand diff.
- **Commit** stages and commits _only_ the locales directory with the message you type. Other
  work in your tree is never touched. Push when you are ready.
- **Discard** reverts the locales directory to the last commit (tracked files restored, new locale
  files removed) after a confirmation.
- **This session** lists each edit you saved with its previous and new value. **Undo** writes the
  previous value back through the normal save path.

Git integration needs the `git` command on PATH and the locales directory inside a repository. It
is on by default and can be turned off per handler:

```typescript
createLiveLocaleHandler({ localesPath: path.resolve('./locales'), git: false });
```

Rewrites keep your files diff-friendly: the existing indentation unit (tabs, 2 or 4 spaces) and
trailing newline are preserved.

## 🔢 Editing plural forms

When a message is a single ICU `plural`, `select`, or `selectordinal` argument, optionally with text
around it, the editor replaces the textarea with one field per branch:

- Fields are the union of the branches already in the message (including explicit cases such as
  `=0`) and the CLDR categories of the active locale, from `Intl.PluralRules`. English shows
  `one` and `other`; Arabic shows `zero`, `one`, `two`, `few`, `many`, `other`; Japanese shows
  `other` only. Required categories that are still empty are flagged.
- `#` stands for the number. Text before and after the argument is editable separately.
- Empty branches are dropped from the saved message, except `other`, which ICU requires.
- **Edit raw** switches back to the plain textarea at any time.

## 🧩 Placeholder safety

Most production incidents caused by copy edits come from a placeholder that went missing. The
Studio and the API guard against that:

- The editor shows the placeholders found in the reference text as chips. A chip turns red when
  your translation no longer contains it and amber when you introduce one the reference lacks.
- On save, the server compares the placeholder sets of the reference and the new value. A
  mismatch answers `422 PLACEHOLDER_MISMATCH` and the Studio shows the reason with **Save
  anyway** and **Keep editing**.
- Structurally broken ICU messages (unbalanced braces, a `plural`/`select` without an `other`
  branch) answer `422 MESSAGE_SYNTAX` with the same override.

Recognised syntaxes: ICU/next-intl/react-intl `{name}`, `{count, plural, …}` (with apostrophe
quoting), i18next `{{name}}` and `$t(key)`, printf `%s` / `%1$s`, and rich-text tags such as
`<b>` or `<0>`. The reference is the source-language value for other locales, and the previous
value when you edit the source language itself.

For API clients: send `reference` with the POST to enable the check, and `force: true` to bypass
it. Without `reference` only the syntax check runs.

## 🔗 Share link on any host

Translators fix text on your live site with no account, and every fix becomes a pull request with one click.

A share link needs no server, no account and no credential anywhere. The Studio ships inside your
build at `<base>livelocale/`, so any host that serves the site serves the Studio too: Apache,
Nginx, S3, GitHub Pages, Netlify, Cloudflare Pages or Vercel. The translator's fixes stay in their
own browser until they send you a change link. On GitHub you turn that link into a pull request
with one click; on any other git host, with one command.

### Setup

1. Run `npx livelocale init --share` in your project. It sets up the build for your stack (see the
   table below) and, on a GitHub remote, writes `.github/workflows/livelocale.yml`. See
   [`init --share`](#init---share) for its options.
2. Commit and push the result. The workflow must be on the default branch, because GitHub runs
   issue and comment workflows only from there.
3. On GitHub, tick the one setting below.
4. Deploy as usual, then check the deployment and print the share link (next step).

On a GitHub remote, `init --share` writes this workflow (`X.Y.Z` is the livelocale version you
installed, `locales`, `en` and `main` come from your project):

````yaml
# Written by `npx livelocale init --share`. Turns LiveLocale change links into pull requests.
# livelocale reads the link from the event file; it never reaches a shell command.
name: LiveLocale
on:
  issues: { types: [opened] }
  issue_comment: { types: [created] }
  pull_request: { types: [closed] }
  workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }
permissions: { contents: write, pull-requests: write, issues: write }
concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }
jobs:
  apply:
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'issues' && contains(github.event.issue.body, '```livelocale')) ||
      (github.event_name == 'issue_comment' && !github.event.issue.pull_request &&
       startsWith(github.event.comment.body, '/livelocale')) ||
      (github.event_name == 'pull_request' && startsWith(github.event.pull_request.head.ref, 'livelocale/issue-') &&
       github.event.pull_request.base.ref != github.event.repository.default_branch)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with: { persist-credentials: false }
      - run: npx --yes livelocale@X.Y.Z apply --github-event --locales locales --source en --branches main
        env: { GITHUB_TOKEN: '${{ github.token }}' }
````

It reads the change link only from the event file, never from a shell command, and it has no
`pull_request_target` trigger.

To set up the build by hand instead:

| Stack                      | Build change                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Vite                       | `share: true` in `liveLocaleVite(...)` (see [Share link from `vite build`](#share-link-from-vite-build)).                               |
| CRA, webpack and Rsbuild   | `"build": "<bundler> && livelocale pack build"`, for example `"build": "react-scripts build && livelocale pack build"`.                 |
| Next.js `output: 'export'` | `livelocale build --preview -- next build`, deployed to a staging location, because the HTML is pre-rendered and must be watermarked.   |
| Next.js on Vercel/Node     | `livelocale build --preview -- next build` as the Preview environment's build command. It packs into a gitignored `public/livelocale/`. |
| Custom CI                  | `LIVELOCALE=preview <build>` (only for SSR/SSG), then `npx livelocale pack <outDir>`.                                                   |

For CRA, webpack and Rsbuild, use an explicit `&&`, not a `postbuild` script: Yarn Berry and some
pnpm versions skip pre/post scripts, and hosts that call the bundler directly skip them too.

Deploy the output as usual, then check it and print the share link:

```bash
npx livelocale doctor --app <url>
```

The doctor checks the Studio page, the manifest, `flag.js`, frame headers and service workers, then
prints `🔗 Share link: <base>livelocale/index.html`. Pin that link for your translators.

#### The one-checkbox setting

In the repository's **Settings → Actions → General → Workflow permissions**, tick
**Allow GitHub Actions to create and approve pull requests**. Without it the workflow still
commits the branch, but GitHub refuses to let it open the pull request; the issue comment then
carries a one-click compare link that opens the pull request form already filled in, and you
press **Create pull request** there.

### Translator steps

1. Open the share link in a desktop browser. There is no sign-up, no password and nothing to
   install. If the site has its own login, sign in as usual.
2. On the first visit, read the three tips and, optionally, type your name so you are credited in
   the pull request.
3. Check the language shown at the top. It is detected from the page text; change it if it is
   wrong.
4. Hold **Alt** (Option on Mac) and click the wrong text. The editor shows the source text, the
   current translation, the placeholders that must stay, and one field per plural form.
5. Type the fix and press **Save** (Ctrl+Enter). When a placeholder is missing, a message explains
   it, and **Save anyway** stays available; it marks the edit for the developer.
6. Keep browsing and fixing. Changes survive reloads and closing the tab. A counter shows how many
   are not sent yet ("5 changes not sent"), and **Changes** lists each one with Undo.
7. Click **Send to developer** and add an optional note. Then choose **Copy link** and paste it in
   any chat or email, or **Download file** for a large batch.
8. Sent changes stay in the list, marked "Sent".

### Developer

Open the change link. The Studio opens in **Review mode**, with the proposed edits shown read-only
on the real page and a before/after table with the check results. Then turn it into a pull request.

**On GitHub, with the workflow:**

- Press **Create pull request** in Review mode. It opens a GitHub issue already filled in with the
  change link; press **Submit new issue**. About a minute later the workflow has committed the
  edits on a `livelocale/issue-<n>` branch, opened the pull request and commented its link on the
  issue. Without `exposeRepo: true`, Review mode asks for `owner/repo` the first time and remembers
  it in that browser.
- With issues turned off, or for a link you would rather not file: **Actions → LiveLocale → Run
  workflow**, paste the link and run it. The result is on the run's summary page.
- **The trust gate.** The workflow writes only for a maintainer: the issue author or the
  commenter must be an owner, member or collaborator, or have write access. For anyone else it
  replies "Waiting for a maintainer: comment `/livelocale apply`", and nothing is written until a
  maintainer posts that comment on the issue. Edits the translator saved with "Save anyway" are
  skipped as `needs --force`; comment `/livelocale apply --force` to include them.
- **Base branches.** By default every pull request targets the default branch. To let links made
  from other builds (for example a `staging` deployment) target their own branch, list the
  branches with `npx livelocale init --share --branches main,staging`. A link from any other
  branch targets the default branch, and the comment says so. A pull request into the default
  branch says `Closes #n`, so merging it closes the issue; into another branch it says `Refs #n`,
  because GitHub only closes issues from the default branch, and LiveLocale closes the issue
  itself when that pull request is merged or closed.
  Also merge .github/workflows/livelocale.yml into each extra branch; pull requests into it run workflows from that branch, so LiveLocale cannot close their issues otherwise.

**On any git host, from your machine:**

```bash
npx livelocale apply "<link or file>" --pr
```

This works with your own `git` login: it commits only the locale files on a new
`livelocale/apply-<time>` branch and pushes it. On GitHub it opens the pull request with `gh`;
elsewhere it prints the branch to open a pull or merge request from. Every edit is checked again
against your own files first. For a long link, use `npx livelocale apply --clipboard`, or pass `-` and pipe
the link in (`npx livelocale apply - < changes.txt`). See [`apply`](#apply) for every option.

#### Run CI on LiveLocale PRs without the approval click

Pull requests opened with the workflow's `GITHUB_TOKEN` start their CI in an approval-required
state: someone has to press **Approve workflows to run** on each one. Pull requests opened with a
GitHub App token start CI as usual. To use one:

1. Create a GitHub App with **Contents**, **Pull requests** and **Issues** set to read and write,
   and install it on the repository.
2. Store its ID as the repository variable `LIVELOCALE_APP_ID` and its private key as the secret
   `LIVELOCALE_APP_PRIVATE_KEY`.
3. In `.github/workflows/livelocale.yml`, add this step before the `apply` step and give its token
   to the `apply` step as `GITHUB_TOKEN`:

```yaml
- id: app-token
  uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0
  with:
    {
      app-id: '${{ vars.LIVELOCALE_APP_ID }}',
      private-key: '${{ secrets.LIVELOCALE_APP_PRIVATE_KEY }}',
    }
- run: npx --yes livelocale@X.Y.Z apply --github-event --locales locales --source en --branches main
  env: { GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}' }
```

`init --share` leaves an edited workflow alone unless you pass `--overwrite`.

### Translators with GitHub access

**Open on GitHub** in the Send dialog lets a translator file the issue themselves, so the pull
request opens with no developer click when the translator is a collaborator (otherwise a
maintainer comments `/livelocale apply`). It is available only with `exposeRepo: true`, because it
needs the repository's `owner/repo` in the public manifest. Turn it on for a private repository
whose translators already have GitHub access; with the default, translators use **Copy link** or
**Download file**, and the developer path is unchanged.

### What "Sent" means

In this mode "Sent" means the translator handed the link over; it is not a pull request until a developer applies it.

### Hosting notes

- **S3 and CloudFront:** the link must end in `index.html`, because an S3 REST origin does not
  resolve folder indexes.
- **GitHub Pages:** the folder is `livelocale/`, with no underscore for Jekyll to drop, and a
  project site's `/repo/` base path is handled.
- **Netlify and Cloudflare Pages:** `_headers` must not send DENY (`X-Frame-Options: DENY` or
  `frame-ancestors 'none'`); SAMEORIGIN is fine. Every per-deploy URL is a separate origin with its
  own drafts, so share the branch alias (for example
  `https://staging--site.netlify.app/livelocale/index.html`), not a per-deploy URL.
- **Basic auth and host password protection** carry over, because the Studio is on the same site.
- **Vercel:** Deployment Protection must be off for the deployment you share, or the translator
  must have access to it. `doctor --app` reports the login wall.
- **PWA:** a Workbox service worker (vite-plugin-pwa, workbox-webpack-plugin) can answer the Studio
  with your app shell. Add `navigateFallbackDenylist: [/^\/livelocale\//]` to its Workbox options.
- **Relative bases** (`base: './'`, CRA `homepage: '.'`): pages served by a client-side route
  fallback cannot load `flag.js`, so pack prints "The app base is relative (./), so flag.js is
  linked per HTML file. Pages served by a client-side route fallback cannot load it; build with
  an absolute base (--base /path/) if the app has such routes."

### Security

- **No credential anywhere.** The share link, the build, the host and the browser hold no token.
  Write access stays with the developer's own git login.
- **A leaked link only proposes text.** A developer still has to apply it, and a person has to
  merge the pull request. `apply` re-validates every edit against your own source locale.
- **`exposeRepo: false` by default.** The GitHub `owner/repo` is published only with
  `exposeRepo: true` (or `pack --expose-repo`).
- **The Studio is `noindex`**, so search engines do not list it.
- **`manifest.json` is public.** `<base>livelocale/manifest.json` makes every string and key name
  public, including keys the app does not show.
- **The same-origin risk is accepted.** The Studio frames your app on the same origin, so app
  scripts can read and alter drafts. This is accepted because no secret is stored, and you review
  every edit before it is merged.

### Honest risks

- **Issues in public repositories are public.** A change link filed as an issue, with its text,
  the translator's name and note, is visible to everyone.
- **Bot pull requests wait for a click.** CI on a pull request the workflow opens waits until
  someone presses **Approve workflows to run**, unless you use the
  [App token](#run-ci-on-livelocale-prs-without-the-approval-click).
- **Vercel may refuse the commit.** Vercel can block deployments of commits whose author is not a
  member of the Vercel team. The commit author is the maintainer who triggered the run, with a
  `Translated-by:` trailer for the translator.
- **One-click automation is GitHub-only.** Other git hosts use
  `npx livelocale apply "<link>" --pr`, which works anywhere git works.

### Limits

- **Desktop only.** Alt+Click needs a keyboard; phones and tablets can only view.
- **Drafts live in one browser.** Clearing site data, a private window, or Safari's 7-day cap on
  script-writable storage can lose unsent work. Send often, or use **Download backup** in Changes.
- **One app per repository.**

## 🌍 Preview mode: editing without a checkout

Development mode needs a developer's machine. Preview mode lets a product manager, translator, or
reviewer edit copy against a **deployed preview** of the app, with changes going to a git branch
and a pull request instead of a local file. Nothing is written to the server's filesystem.

### How it fits together

1. The app is deployed from a branch (say `i18n/preview-edits`) with preview mode on.
2. The Studio, hosted anywhere or run locally with `--app <preview-url>`, embeds that deployment.
3. Each save calls the app's mutation API, which commits the change to `i18n/preview-edits`
   through the GitHub API. The live preview in the iframe updates immediately; the deployment
   itself updates when your platform rebuilds the branch.
4. **Open pull request** in the Changes panel proposes the branch to `main`. Reviewers merge.

### Server setup

```typescript
// app/api/livelocale/route.ts
import { createLiveLocaleHandler } from 'livelocale/server';

const handler = createLiveLocaleHandler({
  localesPath: 'locales', // repository-relative in GitHub mode
  allowedOrigins: ['https://i18n-studio.example.com'], // where the Studio is served from
  github: {
    repo: 'acme/site',
    branch: 'i18n/preview-edits',
    baseBranch: 'main',
    token: process.env.GITHUB_TOKEN!, // contents: write, pull requests: write
  },
});

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
```

Environment on the preview deployment:

```bash
LIVELOCALE=preview                 # server: watermark and serve the API in a production build
NEXT_PUBLIC_LIVELOCALE=preview     # client bundle: run the scanner and clipboard guards
LIVELOCALE_TOKEN=<long random>     # required; the Studio asks for it once per browser session
GITHUB_TOKEN=<fine-grained PAT>   # Contents and Pull requests: "Read and write" on the repository
```

The app must also let the Studio embed it. Next.js evaluates `headers()` in `next.config` at
**build** time, so a `frame-ancestors` value that lists the Studio origin has to be present when the
preview is built, not only at run time.

For a Vite app, the Vite plugin mirrors the server's `LIVELOCALE` flag into the page, so
`LIVELOCALE=preview` alone is enough; no `NEXT_PUBLIC_` variable is needed there. Preview mode
runs on the Vite dev server only. For a static `vite build` served by Apache, Nginx or a CDN, use
the share link instead; see [Share link on any host](#-share-link-on-any-host).

Then open the Studio with `?app=https://<preview-url>` (or `studio --app`). It shows a
**PREVIEW** badge, asks for the access token, and the Changes panel switches to branch and
pull-request actions. Code-reference scanning is off in this mode (there is no checkout), so the
Locale Directory lists keys from the locale files only.

Check a preview deployment before handing it to anyone:

```bash
npx livelocale doctor --app https://<preview-url> --token <LIVELOCALE_TOKEN>
```

The server verifies its GitHub token when the Studio connects: a token that cannot write contents
or open pull requests, a missing base branch, or an unknown repository is reported in a banner
in the Studio and by `doctor`, before anyone loses an edit to a failed save.

Behaviour worth knowing:

- **Edits stay visible.** The deployment keeps serving the text it was built with until the
  branch is rebuilt, so the Studio re-applies this session's saved values on reload and navigation.
- **Concurrent saves are safe.** Saves to one file are queued, and a save that loses a race with
  another server instance or another Studio re-reads the file and retries.
- **Discard closes the pull request.** Resetting the branch to the base leaves the pull request
  with no changes, and GitHub closes it.
- **Every save is a commit, and most hosts build every commit.** To save build minutes, skip builds
  for commits that only touch locale files; the Studio already shows saved edits. On Vercel, set
  _Project Settings → Git → Ignored Build Step_ to
  `git diff --quiet HEAD^ HEAD -- . ':(exclude)locales'`.
- **Hosting login walls block the Studio.** Vercel's Deployment Protection (on by default for
  previews) sends the iframe and the API calls to a Vercel login page. Turn off Vercel
  Authentication for the preview deployments you edit; `doctor --app` reports it.

### What preview mode does not do

- It never writes to the deployment's filesystem; the GitHub branch is the only store.
- It does not replace authentication for the app itself. The token only guards the mutation API.
- It is not a production feature. Do not set `LIVELOCALE=preview` on a production deployment.

## 🛑 Safety switches

Everything runs only when `NODE_ENV=development`, or when preview mode is switched on explicitly.
Two more guards exist for teams:

- **Kill switch.** `LIVELOCALE=off` disables watermarking, the mutation API, and the client scanner.
  Client bundles read `NEXT_PUBLIC_LIVELOCALE=off` instead, because Next.js only inlines public
  variables.
- **Deployed-platform guard.** If the server detects Vercel (preview or production), Netlify,
  Kubernetes, Render, Fly.io, Railway, or Heroku while `NODE_ENV` is still `development`, the tool
  switches itself off and logs one warning. Local `vercel dev` and `netlify dev` are unaffected.
  Set `LIVELOCALE=force` to override on purpose.

## 🪄 When the watermark bites

In development every translated string starts with invisible characters. Most code never notices,
but anything that treats the string as data will:

| Symptom                                                                     | Cause                                              | Fix                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `t('yes') === 'Yes'` is false                                               | equality on a watermarked string                   | `unwrap(t('yes')) === 'Yes'`                                  |
| `maxLength` or `.length` checks are off by a few                            | invisible prefix counts as characters              | `unwrap(value).length`                                        |
| `<title>`, `aria-label`, `alt`, `placeholder` show odd spacing in dev tools | attributes do not strip the prefix                 | pass `unwrap(...)` to attributes, or leave it: it is dev-only |
| Screenshot or snapshot tests differ between dev and prod                    | watermarks only exist in development               | run those tests with `LIVELOCALE=off`                         |
| A value saved from a form contains zero-width characters                    | input sanitizers were bypassed (custom components) | call `sanitizeZeroWidth` before submitting                    |

`unwrap` and `sanitizeZeroWidth` are exported from both `livelocale/client` and
`livelocale/server`. `unwrap` is deep: it cleans strings inside arrays and objects and never
mutates its input.

## 🏢 Running in team and enterprise setups

The defaults assume `localhost:3000` for the app and `localhost:3010` for the Studio. Anything else
needs one of the knobs below.

**App on another port or hostname.** Start the Studio with `--app https://app.dev.local:3000`, or
open the Studio with `?app=<origin>`.

**Studio not on localhost (GitHub Codespaces, Gitpod, a shared dev box).** The mutation API only
accepts writes from localhost origins unless told otherwise. Either pass `allowedOrigins` to
`createLiveLocaleHandler`, or set an environment variable in the app's dev process:

```bash
LIVELOCALE_ALLOWED_ORIGINS="https://abc-3010.app.github.dev,https://studio.dev.local"
```

**Content-Security-Policy blocks the iframe.** If your app sends `frame-ancestors 'none'` or
`X-Frame-Options: DENY` in development, the Studio cannot embed it. Relax the header only when
`NODE_ENV === 'development'`, for example by allowing `frame-ancestors 'self' http://localhost:3010`.

**Auth middleware redirects the API.** Exclude `/api/livelocale` from your middleware matcher so the
Studio can reach the mutation route without a session:

```typescript
export const config = { matcher: ['/((?!api/livelocale).*)'] };
```

**Not sure which of these applies?** Run `npx livelocale doctor --app <origin>`; it names
the exact file and header involved.

**Namespaced hooks.** The key scanner reads the namespace from `useTranslations('ns')`,
`getTranslations('ns')`, `useTranslation('ns')`, `wrapNextIntl(…, 'ns')`, and
`wrapTranslationEngine(…, { keyPrefix: 'ns' })` in each file, and prefixes the keys it finds. It
does not follow translator functions passed between files or chosen at run time.

**Monorepos.** `localesPath` is resolved relative to the process working directory of the app, so
point it at the package that owns the locale files, for example `path.resolve('./src/locales')`.

---

## 🔁 Migrating from next-i18n-lens

LiveLocale was published as `next-i18n-lens` up to 0.7.0. Version 0.8.0 renames everything, with no
aliases for the old names:

1. `npm uninstall next-i18n-lens && npm install livelocale`, and import from `livelocale/client`,
   `livelocale/server`, `livelocale/react` and `livelocale/vite`.
2. `I18nLensProvider` → `LiveLocaleProvider`, `createI18nLensHandler` → `createLiveLocaleHandler`,
   `i18nLensVite` → `liveLocaleVite`, `getLensMode` / `isLensEnabled` → `getLiveLocaleMode` /
   `isLiveLocaleEnabled`; types `I18nLensHandler` → `LiveLocaleHandler` and `LensMode` →
   `LiveLocaleMode` (`ClientInitializer` is gone).
3. Move the route file: `app/api/i18n-lens/mutate/route.ts` → `app/api/livelocale/route.ts`
   (Pages Router: `pages/api/i18n-lens/mutate.ts` → `pages/api/livelocale.ts`), or run
   `npx livelocale init` again.
4. Rename environment variables: `I18N_LENS` → `LIVELOCALE`, `NEXT_PUBLIC_I18N_LENS` →
   `NEXT_PUBLIC_LIVELOCALE`, `I18N_LENS_TOKEN` → `LIVELOCALE_TOKEN`, `I18N_LENS_ALLOWED_ORIGINS` →
   `LIVELOCALE_ALLOWED_ORIGINS`. Old names are ignored, so a forgotten kill switch stops working:
   check your hosting settings.
5. The CLI is `npx livelocale` (`doctor`, `check`, `studio`, `init`, `migrate`).

## ⚖️ License

MIT License. See [LICENSE](LICENSE) for more details.
