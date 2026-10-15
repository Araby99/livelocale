# 🔍 next-i18n-lens

<div align="center">
  <p><strong>Click, Edit, and Translate. Locally.</strong></p>
  <p>A local-first, zero-dependency visual translation studio for Next.js (App Router) and React.</p>
  
  <p align="center">
    <a href="https://github.com/Araby99/next-i18n-lens/actions/workflows/ci.yml"><img src="https://github.com/Araby99/next-i18n-lens/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
    <a href="https://www.npmjs.com/package/next-i18n-lens"><img src="https://img.shields.io/npm/v/next-i18n-lens.svg?style=flat-square" alt="NPM Version" /></a>
    <a href="https://www.npmjs.com/package/next-i18n-lens"><img src="https://img.shields.io/npm/dm/next-i18n-lens.svg?style=flat-square" alt="NPM Downloads" /></a>
    <a href="https://github.com/Araby99/next-i18n-lens/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/next-i18n-lens.svg?style=flat-square" alt="License" /></a>
  </p>
</div>

---

## 💡 How It Works: Zero-Width Unicode Watermarking

`next-i18n-lens` bridges your running application UI with your local JSON translation files using **Zero-Width Unicode Watermarking**.

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
- 🩺 **Doctor:** `npx next-i18n-lens doctor` finds the usual integration mistakes before you open the Studio.
- 🛑 **Safety switches:** `I18N_LENS=off` kill switch, and automatic shut-off on hosting platforms so a staging build can never leak watermarks.
- 🧭 **App Router and Pages Router:** One handler works with both `route.ts` and `pages/api` signatures.
- 🌐 **Works beyond localhost:3000:** Point the Studio at any port or hostname with `--app` or `?app=`, and allow Codespaces or custom origins with one env var.

---

## ⚡ Quick Setup

### 1. Install Dependency

```bash
npm install next-i18n-lens
```

---

### 2. Add the Client Listener

Mount the `I18nLensProvider` inside your root layout. This launches the dev-mode DOM scanners and intercepts clipboard copy/paste actions.

```tsx
// app/layout.tsx
import { I18nLensProvider } from 'next-i18n-lens/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <I18nLensProvider />
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
npx next-i18n-lens init
```

_The CLI will check for TypeScript/JavaScript and write the appropriate mutation file (`/app/api/i18n-lens/mutate/route.ts` or `/pages/api/i18n-lens/mutate.ts`) directly into your project._

> [!NOTE]
> For manual setup, create `app/api/i18n-lens/mutate/route.ts` with:
>
> ```typescript
> import { createI18nLensHandler } from 'next-i18n-lens/server';
> import * as path from 'path';
>
> const handler = createI18nLensHandler({
>   localesPath: path.resolve('./locales'),
> });
>
> export const GET = handler;
> export const POST = handler;
> export const OPTIONS = handler;
> ```
>
> For the **Pages Router**, create `pages/api/i18n-lens/mutate.ts` instead and default-export the
> same handler. It accepts the `(req, res)` signature automatically:
>
> ```typescript
> import { createI18nLensHandler } from 'next-i18n-lens/server';
> import * as path from 'path';
>
> export default createI18nLensHandler({ localesPath: path.resolve('./locales') });
> ```

---

### 4. Enable Key Watermarking

Wrap translation lookups to inject dev-only watermarks.

#### Option A: Server Components (Direct Loader)

Use `createTranslations` to load flat JSON files or directory-based namespaces:

```tsx
import { createTranslations } from 'next-i18n-lens/server';

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
import { wrapTranslationEngine } from 'next-i18n-lens/client';

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
npx next-i18n-lens studio --port 3010 --app http://localhost:3000
```

Open `http://localhost:3010` to view the Studio, loaded with your app. `--app` defaults to
`http://localhost:3000`; you can also switch apps without restarting by opening
`http://localhost:3010/?app=http://localhost:3001`.

---

### 6. Check your setup

```bash
npx next-i18n-lens doctor --app http://localhost:3000
```

The doctor verifies the route handler, the provider mount, middleware matchers, frame-blocking
headers, and locale JSON, then probes the running app. It exits non-zero on blocking problems, so
it can also run in CI.

---

## 🛠️ CLI Reference

### `init`

Generates API route handlers based on your router structure (App vs Pages Router) and configuration language (TypeScript vs JavaScript).

```bash
npx next-i18n-lens init [--dir <path>]
```

### `studio`

Spins up a lightweight, CORS-enabled HTTP server serving the Visual Studio assets statically.

```bash
npx next-i18n-lens studio [--port <number>] [--app <origin>]
```

- `--port` — port for the Studio itself (default `3010`).
- `--app` — origin of the app being edited (default `http://localhost:3000`).

### `doctor`

Inspects the project for the integration problems the Studio cannot recover from, and optionally
probes the running app.

```bash
npx next-i18n-lens doctor [--dir <path>] [--locales <path>] [--app <origin>]
```

- `--locales` — locales directory relative to the project (default `locales`).
- `--app` — also check that the mutation API answers and that pages are embeddable.

### `migrate`

Performs static analysis to scan and automatically wrap existing `react-i18next` hooks with `wrapTranslationEngine`.

```bash
npx next-i18n-lens migrate [--dir <path>] [--exclude <dirs>] [--dry-run]
```

`migrate` needs the `typescript` package to parse your source. It is an optional dependency so
JavaScript-only projects are not forced to install it; `init` and `studio` never need it.

---

## ⚙️ Non-Next.js Integration (React + Vite SPA)

If you are using a standard React Client-Side SPA (like Vite), you don't have Next.js API endpoints. You can use the built-in Vite plugin inside `vite.config.ts` to automatically capture the mutation endpoints:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { i18nLensVite } from 'next-i18n-lens/vite';

export default defineConfig({
  plugins: [
    react(),
    i18nLensVite({
      localesPath: './locales', // path to your locales directory
    }),
  ],
});
```

---

## 🛑 Safety switches

Everything runs only when `NODE_ENV=development`. Two more guards exist for teams:

- **Kill switch.** `I18N_LENS=off` disables watermarking, the mutation API, and the client scanner.
  Client bundles read `NEXT_PUBLIC_I18N_LENS=off` instead, because Next.js only inlines public
  variables.
- **Deployed-platform guard.** If the server detects Vercel (preview or production), Netlify,
  Kubernetes, Render, Fly.io, Railway, or Heroku while `NODE_ENV` is still `development`, the tool
  switches itself off and logs one warning. Local `vercel dev` and `netlify dev` are unaffected.
  Set `I18N_LENS=force` to override on purpose.

## 🪄 When the watermark bites

In development every translated string starts with invisible characters. Most code never notices,
but anything that treats the string as data will:

| Symptom                                                                     | Cause                                              | Fix                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `t('yes') === 'Yes'` is false                                               | equality on a watermarked string                   | `unwrap(t('yes')) === 'Yes'`                                  |
| `maxLength` or `.length` checks are off by a few                            | invisible prefix counts as characters              | `unwrap(value).length`                                        |
| `<title>`, `aria-label`, `alt`, `placeholder` show odd spacing in dev tools | attributes do not strip the prefix                 | pass `unwrap(...)` to attributes, or leave it: it is dev-only |
| Screenshot or snapshot tests differ between dev and prod                    | watermarks only exist in development               | run those tests with `I18N_LENS=off`                          |
| A value saved from a form contains zero-width characters                    | input sanitizers were bypassed (custom components) | call `sanitizeZeroWidth` before submitting                    |

`unwrap` and `sanitizeZeroWidth` are exported from both `next-i18n-lens/client` and
`next-i18n-lens/server`. `unwrap` is deep: it cleans strings inside arrays and objects and never
mutates its input.

## 🏢 Running in team and enterprise setups

The defaults assume `localhost:3000` for the app and `localhost:3010` for the Studio. Anything else
needs one of the knobs below.

**App on another port or hostname.** Start the Studio with `--app https://app.dev.local:3000`, or
open the Studio with `?app=<origin>`.

**Studio not on localhost (GitHub Codespaces, Gitpod, a shared dev box).** The mutation API only
accepts writes from localhost origins unless told otherwise. Either pass `allowedOrigins` to
`createI18nLensHandler`, or set an environment variable in the app's dev process:

```bash
I18N_LENS_ALLOWED_ORIGINS="https://abc-3010.app.github.dev,https://studio.dev.local"
```

**Content-Security-Policy blocks the iframe.** If your app sends `frame-ancestors 'none'` or
`X-Frame-Options: DENY` in development, the Studio cannot embed it. Relax the header only when
`NODE_ENV === 'development'`, for example by allowing `frame-ancestors 'self' http://localhost:3010`.

**Auth middleware redirects the API.** Exclude `/api/i18n-lens` from your middleware matcher so the
Studio can reach the mutation route without a session:

```typescript
export const config = { matcher: ['/((?!api/i18n-lens).*)'] };
```

**Not sure which of these applies?** Run `npx next-i18n-lens doctor --app <origin>`; it names
the exact file and header involved.

**Monorepos.** `localesPath` is resolved relative to the process working directory of the app, so
point it at the package that owns the locale files, for example `path.resolve('./src/locales')`.

---

## ⚖️ License

MIT License. See [LICENSE](file:///e:/works/next-i18n-lens/LICENSE) for more details.
