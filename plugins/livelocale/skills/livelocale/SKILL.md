---
name: livelocale
description: Set up and use livelocale, the npm package that lets anyone fix a React site's text on the running site (Alt+Click in the Studio) and turns the fixes into locale-file edits or pull requests. Use when adding livelocale to a Next.js App Router, Vite + React, Astro or static-host project; when turning on share links (init --share, change links, the GitHub workflow); when adding npx livelocale check or check --hardcoded to CI; when fixing a livelocale setup that does not work (blank preview, no clickable text, 404 from the API, doctor failures); or when migrating from next-i18n-lens.
---

# livelocale

livelocale (npm `livelocale`, MIT, no runtime dependencies, Node.js 18 or later) adds a Studio to a React app: a person holds Alt, clicks wrong text on the real page, fixes it in any language, and the fix lands in the app's JSON locale files, or arrives as a pull request from a deployed site. `npx livelocale check` fails CI on missing keys, and `--hardcoded` also on text that never went through translation.

The docs are the source of truth; each step below links its page. Every docs page is also served as Markdown (same URL ending in `.md`), and all of them in one file at https://livelocale.js.org/llms-full.txt.

## 1. Decide the stack

Look at the project before changing anything:

| What you find                                                  | Path to follow                                     |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `next` in `package.json`, an `app/` (or `src/app/`) folder     | Next.js (section 2)                                |
| `astro` in `package.json`, an `astro.config.*`                 | Astro (end of section 3), React or not             |
| `vite` and `react` in `package.json`, a `vite.config.*`        | Vite + React (section 3)                           |
| `react-scripts`, `webpack` or `@rsbuild/core`, no Vite or Next | Share links only (section 4, read its first lines) |
| The user wants non-developers to fix text on the deployed site | First the dev setup above, then share links (4)    |
| The user only wants CI to catch missing or untranslated text   | CI check only (section 5); nothing else is needed  |
| `next-i18n-lens` in `package.json` (0.7.0 or earlier)          | Migrate first (below), then the path for the stack |

Also find the locale folder: JSON files such as `locales/en.json` or `locales/en/common.json`. The CLI defaults to `locales`; when the files live elsewhere (`messages`, `src/locales`, `public/locales`), pass `--locales <path>` to `check` and `doctor`, and set the same folder as `localesPath` in code.

livelocale was published as `next-i18n-lens` up to 0.7.0, and 0.8.0 renamed the package, the exports, the API route and the environment variables with no aliases. On such a project follow https://livelocale.js.org/docs/guides/migrate.html before anything else.

livelocale reads JSON catalogues used by react-i18next, next-intl or the app's own `t` function. Keep the existing i18n library; livelocale wraps it, it does not replace it.

## 2. Next.js (App Router)

Docs: https://livelocale.js.org/docs/start/nextjs.html

1. Install as a regular dependency (the app imports it at run time), then confirm the CLI runs:

   ```bash
   npm install livelocale
   npx livelocale --help
   ```

2. Mount the provider once in the root layout. It takes no props and renders nothing:

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

3. Write the API route the Studio saves through:

   ```bash
   npx livelocale init
   ```

   It writes `app/api/livelocale/route.ts` (or the `src/app/` or Pages Router `pages/api/livelocale.ts` file). The route reads `./locales`; if the files live elsewhere, change `localesPath` in that file.

4. Wrap the translations. Only wrapped strings carry the invisible watermark the Studio clicks on.
   - Server Components: `createTranslations(locale, { supportedLocales: ['en', 'ar'], localesDir: './locales' })` from `livelocale/server`, then read `t.home?.title`.
   - react-i18next: `const t = wrapTranslationEngine(rawT, { keyPrefix: 'auth' })` from `livelocale/client`, where `rawT` comes from `useTranslation('auth')`. The `keyPrefix` must match the namespace.
   - next-intl: `wrapNextIntl(useTranslations('home'), 'home')` from `livelocale/client`.
   - Many existing react-i18next call sites: `npx livelocale migrate --dry-run`, then `npx livelocale migrate` (needs `typescript` installed).

5. Verify: `npx livelocale doctor`. It exits 1 on a blocking problem and names the file to fix; warnings alone exit 0.

6. Run `npx next dev`, and in a second terminal `npx livelocale studio`. Open `http://localhost:3010`; the status reads **Active** when the page answers. With the app running, `npx livelocale doctor --app http://localhost:3000` also probes the route and the frame headers.

## 3. Vite + React

Docs: https://livelocale.js.org/docs/start/vite.html

1. `npm install livelocale`, then `npx livelocale --help`.
2. Do not run `npx livelocale init` here: it writes a Next.js route. Add the Vite plugin instead; it serves the same API from the Vite dev server:

   ```ts
   // vite.config.ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import { liveLocaleVite } from 'livelocale/vite';

   export default defineConfig({
     plugins: [react(), liveLocaleVite({ localesPath: './locales' })],
   });
   ```

   `localesPath` resolves from the folder `vite` starts in.

3. Render `<LiveLocaleProvider />` (from `livelocale/react`) once at the root, beside `<App />` in `src/main.tsx`.
4. Wrap the `t` function with `wrapTranslationEngine` from `livelocale/client`, as in section 2; a `t` of your own works too: `wrapTranslationEngine(translate)`.
5. Verify the keys: `npx livelocale check` exits 0 when every key the code uses exists in every locale.
6. Run `npx vite`, then `npx livelocale studio --app http://localhost:5173` (without `--app` the Studio looks for the app on port 3000). Check with `npx livelocale doctor --app http://localhost:5173`: on Vite read its **Mutation API** and **Studio can embed the app** lines; the file checks above them look for Next.js files a Vite app does not have.

### Astro

Docs: https://livelocale.js.org/docs/start/astro.html

1. `npm install livelocale`. Do not run `npx livelocale init`: on Astro it writes nothing and prints these steps.
2. Add the integration in `astro.config.mjs`: `import liveLocale from 'livelocale/astro'`, then `integrations: [liveLocale({ localesPath: './locales' })]`. It serves the API in `astro dev`, puts the mode and the fallback strings in every page, and loads the in-page client. No `LiveLocaleProvider`, no React.
3. Load translations in each page's frontmatter: `createTranslations(locale, { supportedLocales: ['en', 'ar'] })` from `livelocale/server`, then `{t.home.title}` in the template. Set `lang` and `dir` on `<html>` for right-to-left locales.
4. Run `npx astro dev`, then `npx livelocale studio --app http://localhost:4321`. `npx livelocale doctor` checks the integration; add `--app http://localhost:4321` to probe the running site.

## 4. Share links (any static host)

Docs: https://livelocale.js.org/docs/start/static-host.html and https://livelocale.js.org/docs/guides/share-links.html

Share links ship the Studio inside the built site at `<base>livelocale/`, so someone with no git account can fix text on the deployed site and send a change link. The text must already go through the wrapper (section 2 step 4 or section 3 step 4). On CRA, webpack or Rsbuild, livelocale has no dev save route or plugin, so share links are the way in: install livelocale, render `<LiveLocaleProvider />` (from `livelocale/react`) once at the root, wrap `t` with `wrapTranslationEngine` as in section 3 step 4, then run the steps below.

1. `npx livelocale init --share`. It changes the build for the stack and, on a GitHub remote, writes `.github/workflows/livelocale.yml`. Options: `--locales <path>`, `--source <locale>`, `--branches <a,b>`, `--overwrite` (replace an existing workflow). What it changes:
   - Vite: adds `share: true` to `liveLocaleVite({ ... })` (the plugin must already be there).
   - CRA: appends `&& livelocale pack build --locales <path> --source <locale>` to the `build` script; webpack and Rsbuild: the same, packing `dist`.
   - Next.js: adds a `build:preview` script, `livelocale build --preview --locales <path> --source <locale> -- next build`. Use `npm run build:preview` only as the build command of a staging or preview deployment, never production: it watermarks the text of every page. Keep the plain `next build` (no Studio) for production.
   - Next.js with `output: 'export'`: `init --share` also says to delete `app/api/livelocale/route.ts`, because a static export rejects POST routes and `livelocale build` stops while the file exists. Delete it. Without the route the dev Studio cannot save to the locale files on that app; fixes reach them through change links and `npx livelocale apply` (step 4).
   - Astro: adds a `build:preview` script, `livelocale build --preview --locales <path> --source <locale> -- astro build`. Staging only, as on Next.js: Astro renders the text at build time, so that build is watermarked.
   - Custom CI: build with `LIVELOCALE=preview` (only for SSR and SSG), then `npx livelocale pack <outDir>`.
2. Commit and push. The workflow must be on the default branch. Tell the user to tick **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**; it is a repository setting only they can change.
3. After the deploy: `npx livelocale doctor --app <url> --share`. It checks the Studio page, the manifest, `flag.js`, frame headers and service workers, and prints the share link (`<base>livelocale/index.html`).
4. A fixer sends a change link. On GitHub, **Create pull request** in the Studio's review mode opens an issue the workflow turns into a pull request. On another git host, the developer runs `npx livelocale apply "<link>" --pr` (`--dry-run` first to see the change).

## 5. CI: check and check --hardcoded

Docs: https://livelocale.js.org/docs/guides/ci-check.html and https://livelocale.js.org/docs/reference/cli/check.html

`npx livelocale check` is read-only, runs in any `NODE_ENV` and never writes a file. Add it as a step after the dependencies are installed:

```yaml
# .github/workflows/i18n.yml
name: i18n
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npx livelocale check --hardcoded
```

Exit codes: **0** no problem, **1** a problem was found, **2** the check could not run (a mistyped flag, a missing locales folder or one with no locale files, an unknown `--source`, or `--hardcoded` without `typescript`; fix the last with `npm install -D typescript`). Every livelocale command exits 2 on an unknown flag. Problems: invalid JSON, broken ICU, a key missing from a locale, placeholder drift, and with `--hardcoded` JSX text or user-facing attributes (`alt`, `title`, `placeholder`, `aria-label`, `label`) that never went through translation. Warnings (empty values, unused keys, `untranslated`, `wrong-script`) do not fail the run unless `--strict` is passed.

Other flags: `--locales <path>`, `--source <locale>`, `--no-unused` (keys built at run time look unused), `--allow <word>` (repeatable), `--json` (same exit code; when the check could not run, the report has an `error` field).

Opt-outs, when a finding is intended:

- `// livelocale-ignore-next-line`, or `{/* livelocale-ignore-next-line */}` inside JSX, on the line above the text or above the element that holds it.
- `// livelocale-ignore-file` at the top of a file.
- A `livelocale.allow` file at the project root: one word or phrase per line (brand names), `key:<dotted.key>` to exempt a key from `untranslated` and `wrong-script`, `#` for comments.

Fix real findings by moving the text into the locale files and looking it up with `t`; use opt-outs only for text that is the same in every language. Do not add `--strict` unless the user asks: it turns warnings into failures.

## 6. Pitfalls

- livelocale is on only in development (`next dev`, the `vite` dev server, `astro dev`); `vite build`, `vite preview` and production builds have it off, unless `share: true` (section 4) or `LIVELOCALE=preview` turns the share Studio on in that build. `LIVELOCALE=off` (or `NEXT_PUBLIC_LIVELOCALE=off`) turns it off, and a detected hosting platform switches it off too. See https://livelocale.js.org/docs/how-it-works/safety-switches.html
- Text that does not go through the wrapper cannot be clicked in the Studio. `npx livelocale check --hardcoded` lists it.
- A blank preview means the app sends `X-Frame-Options` or `frame-ancestors 'none'`. Any `X-Frame-Options` blocks the Studio, `SAMEORIGIN` too (port 3010 is another origin), and it cannot name an allowed origin. Only when `NODE_ENV` is `development`: send no `X-Frame-Options`, and `Content-Security-Policy: frame-ancestors 'self' http://localhost:3010`.
- An auth middleware that redirects the API: exclude it, `matcher: ['/((?!api/livelocale).*)']`.
- Studio away from `localhost` (Codespaces, Gitpod): set `LIVELOCALE_ALLOWED_ORIGINS` to the Studio origin in the app's dev process, then restart the dev server. See https://livelocale.js.org/docs/guides/teams.html
- App on another port: `npx livelocale studio --app http://localhost:3001`; Studio port taken: `--port <number>`.
- In development every wrapped string starts with invisible characters, so `t('yes') === 'Yes'` and length checks fail. Compare `unwrap(t('yes'))`, and pass form values through `sanitizeZeroWidth` before submitting; both come from `livelocale/client`. Tests that compare text run with `LIVELOCALE=off`. See https://livelocale.js.org/docs/how-it-works/watermark-pitfalls.html
- Never invent flags: the full list is in `npx livelocale --help` and https://livelocale.js.org/docs/reference/cli/

More symptoms and the doctor line that names each one: [references/troubleshooting.md](references/troubleshooting.md).
