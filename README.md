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
npx livelocale doctor [--dir <path>] [--locales <path>] [--app <origin>] [--token <token>]
```

- `--locales` — locales directory relative to the project (default `locales`).
- `--app` — also check that the mutation API answers and that pages are embeddable.
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
`LIVELOCALE=preview` alone is enough; no `NEXT_PUBLIC_` variable is needed there. The plugin runs
on the Vite dev server only: a static `vite build` served by Apache, Nginx or a CDN has no server for
the Studio to save through, so preview mode does not work there yet.

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
   `isLiveLocaleEnabled` (`ClientInitializer` is gone).
3. Move the route file: `app/api/i18n-lens/mutate/route.ts` → `app/api/livelocale/route.ts`
   (Pages Router: `pages/api/i18n-lens/mutate.ts` → `pages/api/livelocale.ts`), or run
   `npx livelocale init` again.
4. Rename environment variables: `I18N_LENS` → `LIVELOCALE`, `NEXT_PUBLIC_I18N_LENS` →
   `NEXT_PUBLIC_LIVELOCALE`, `I18N_LENS_TOKEN` → `LIVELOCALE_TOKEN`, `I18N_LENS_ALLOWED_ORIGINS` →
   `LIVELOCALE_ALLOWED_ORIGINS`. Old names are ignored, so a forgotten kill switch stops working:
   check your hosting settings.
5. The CLI is `npx livelocale` (`doctor`, `check`, `studio`, `init`, `migrate`).

## ⚖️ License

MIT License. See [LICENSE](file:///e:/works/livelocale/LICENSE) for more details.
