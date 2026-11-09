# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-11-09

1.1.0 adds Astro support and two Studio improvements, and fixes missing translations rendering as `undefined` in production. Nothing documented changed incompatibly.

### Minor Changes

- **Added**
  - First-party Astro support without React: `liveLocale({ localesPath })` from the new `livelocale/astro` entry serves the Studio's API in `astro dev`, puts the mode flag and the fallback dictionary in every page, and loads the in-page client; a normal `astro build` gets none of it. `startLiveLocale()` in `livelocale/client` boots the client on any page without React, and `livelocale check` now reads `.astro` files for keys and for hardcoded text. `init` and `doctor` detect Astro projects.
  - `createTranslations` has a `plain: true` option that returns a plain object with every key filled in, safe to pass as props or `JSON.stringify`.
  - Picking a key from the Studio's Keys list now scrolls the page to its text and outlines it, or says when the text is hidden or not on this page.
  - When the Studio cannot connect to the app, it now says what the app answered before the usual causes: nothing listening at the app's address, the HTTP status of the page (such as "The app answered 500 at /en") or of `/api/livelocale`, a redirect to a sign-in page, a header that forbids framing, or a page that loaded without starting the LiveLocale client. **Check again** asks once more. `npx livelocale studio` answers this through a new same-origin endpoint that only probes the app origin it was started with; a share-link Studio reads the page's status itself.
- **Fixed**
  - `createTranslations` now fills keys missing from a locale with the `fallbackLocale` text in production too; they rendered as `undefined`. A locale's own arrays are kept whole. In development `fallbackLocale` now wins over the other locales, and the fallback the Vite plugin puts in the page prefers `sourceLocale`, whatever order the locale folders are listed in.

## [1.0.0] - 2026-11-08

1.0.0 is the first stable release. From here on livelocale follows semantic versioning: the documented imports, options, CLI commands, flags and exit codes, environment variables, the files `init` writes, and the share-link formats (`lc1.` change links, `manifest.json` format 1, `flag.js`) change incompatibly only in a new major version. Change links already sent and share folders already deployed keep working. Nothing documented was removed or renamed. The breaking changes below are about how the CLI treats a wrong command line and which exit code it returns, plus one type; a project whose scripts use only documented flags needs no change. Exports that no docs page uses, such as `FileMutator`, `KeyScanner`, `createMutationRouter`, `IframeBridge`, `encodeKey` and `stripWatermark`, are now marked internal: they still work, but semver does not cover them. The [Versioning and stability](https://livelocale.js.org/docs/reference/stability.html) page lists what is covered, the deprecation policy, and the versions CI tests.

### Major Changes

- **Breaking** (what to do when upgrading from 0.12)
  - Every command rejects an unknown flag with exit code 2 and names the closest known flag (`Unknown option --strictt for livelocale check. Did you mean --strict?`). Up to 0.12, `check`, `doctor`, `migrate`, `init` and `studio` ignored it, so a typo could turn a CI check off. Run your scripts and CI steps once and fix or remove any flag the error names. Write values after a space (`--dir app`, not `--dir=app`).
  - Flags that do not go together, a missing value, and an argument a command does not take exit 2: `apply --branches` without `--github-event`; `init --share my-app` (use `init --share --dir my-app`); `init --locales`, `--source`, `--branches` or `--overwrite` without `--share`; a folder given both as an argument and as `--dir`; a `studio --port` that is not a port number. Fix the command line the error names.
  - Usage errors that exited 1 now exit 2: an unknown or missing command (`livelocale` with no command still prints the help), a bad `--app` on `studio` or `doctor`, `apply` with no link, file, `-` or `--clipboard`, and the `pack`, `build` and `apply` command-line errors. A script that tests for exactly 1 should test for non-zero.
  - `livelocale check` exits 2 whenever it could not run: a missing project folder, a missing locales folder, an unknown `--source`, or a wrong command line (it was 1, the same as "found problems"; `--hardcoded` without TypeScript already exited 2). A locales folder that holds no locale files (no `{locale}.json` and no `*.json` inside a `{locale}/` folder) also exits 2 (`No locale files found in <dir>. Point --locales at the folder with en.json, ar.json, ...`, then any JSON files it skipped because their name is not a locale, such as `en_US.json`); it printed "Translations look good" and exited 0, so a wrong `--locales` passed CI. 1 still means "found problems" and 0 "clean". With `--json` it now prints a report with an `error` field instead of only a message on stderr. If your CI treats 1 and 2 differently, 2 means the check never ran.
  - `livelocale migrate` exits 1 when any file failed to convert (it exited 0). It still converts the other files and lists the failed ones.
  - `liveLocaleVite()` is typed as Vite's `Plugin`, not as its own object with every internal hook. `plugins: [liveLocaleVite(...)]` is unchanged. Code that calls the plugin's hooks by hand needs a cast.

### Minor Changes

- **Added**
  - Share links work on phones and tablets. A switch at the bottom picks **Edit** (tap any text to fix it; the site is frozen, so a tap on a link selects its text instead of following it) or **Browse** (the site works as usual). On a phone the Studio shows a thin top bar with the language and **Send · N**, the editor slides up from the bottom and stays above the keyboard, **Next missing** walks the untranslated text you can see on the page, and **Share link…** sends the change link through the phone's share menu. Desktop behaviour is unchanged.
  - `livelocale --version` (or `-v`). `--help` and `--version` stop at `--`, so `livelocale build -- next build -h` passes `-h` to your build, and are never read as a flag's value: `check -v` prints the version, `check --source -v` is a usage error (`--source needs a value.`). Node.js 18 stays the minimum, and CI now runs the built package on Node 18: the CLI and an import and a require of every entry point.
- **Changed**
  - The Studio's interface is English only. The Arabic translation of the Studio and its language switch in the header are removed. Arabic and other right-to-left sites still edit and preview right to left: pick their locale in the **Locale** menu and the site under the Studio flips.

## [0.12.1] - 2026-11-04

### Patch Changes

- **Fixed**
  - On a share link, the address field no longer shows the `?locale=` the Studio adds for the language you chose, and recent pages no longer list the same page once per language.

## [0.12.0] - 2026-11-04

### Minor Changes

- **Added**
  - The Studio's preview bar has an address field. It shows the page you are on, also after client-side navigation, relative to the site's base path. Type a path and press Enter to open it in the current language; only pages on the previewed site are accepted.
  - The address field suggests the pages you visited recently and, on a share link, every page of the deployed site: `livelocale pack` now lists them as `pages` in `manifest.json` (optional; older Studios ignore it, and the Studio works with older manifests).
- **Fixed**
  - Reload reloads the page you are on, not the first page the Studio opened.

## [0.11.0] - 2026-11-02

### Minor Changes

- **Added**
  - `livelocale check --hardcoded` finds JSX text that never went through translation, translations identical to the source locale, and translations in the wrong script, and fails CI on hardcoded text. It uses your project's own `typescript`; without it the other checks still run and the command exits with code 2. Without the flag, `check` behaves as before.
  - The Studio is available in Arabic with a right-to-left layout. Share links follow the browser language; the switch is in the header.
- **Changed**
  - The Studio has a new look with the LiveLocale brand (the "hunk" colours, Martian Mono and IBM Plex type, and the patch logo) in a light and a dark theme. Share links follow the system setting; the dev Studio starts dark until you choose System, Light or Dark in the header. The fonts ship inside the package with their OFL licences, so the Studio loads nothing from Google.
  - The Studio shows a visible keyboard focus ring, names every control, works fully by keyboard, announces saves, sends and errors, and meets WCAG AA contrast.
  - The Alt+hover outline on your site is now cyan instead of indigo.

## [0.10.1] - 2026-11-01

### Patch Changes

- **Fixed**
  - Studio:
    - Dialogs close on Escape and keep keyboard focus inside them, and the drawer stays open behind a dialog.
    - Alt+Click reopens the Review drawer and scrolls to the row; the row is found in the page language.
    - The language chosen in the share Studio is shown in the app preview and kept after a reload.
    - The reference text stays in the source locale while you switch languages.
    - A draft edited while a rebuild is reconciled is never dropped or overwritten.
    - The copied change block resets when another review opens.
    - The sent link and "Open on GitHub" stay on screen after sending.
    - "Download backup" is disabled until there is a change to back up, and the downloaded file is saved in every browser.
    - Borders and hover states render with Tailwind shades that exist.
  - CLI and pack:
    - `pack`, `build` and `init --share` name the wrong argument in their errors, and `--out` is refused for Next.js.
    - `pack` leaves HTML files without page markup, such as site verification files, untouched.
    - `init --share` keeps one `sourceLocale`, asks `origin` for its default branch and writes through linked folders.
    - Translation keys with an empty path segment (`x.`, `a..b`, `.a`) are rejected.
    - A new URL is flagged regardless of trailing punctuation or scheme and host case.
    - Invisible characters in source are written as `\u` escapes, and lint fails on raw zero-width or bidi characters.
  - apply and the Action:
    - `apply --pr` says the edits are not committed when it fails before its commit.
    - The Action keeps the real apply error when the error comment cannot be posted.
    - The Action honours a link made on the default branch outside `--branches` and ignores a comment event without an issue.
    - A later apply adds to the open fallback pull request of an issue, and a re-run suffixes the fallback branch.
  - Docs:
    - The README describes the Action's fallback branch and how a later apply adds to its open pull request, and finishes the `shareBase` row.

## [0.10.0] - 2026-10-29

### Minor Changes

- **Added**
  - `npx livelocale init --share`, which detects Vite, CRA/webpack, Next export or Next server, edits the build, and writes `.github/workflows/livelocale.yml`.
  - `apply --github-event`, with:
    - the trust gate;
    - one commit per batch on a `livelocale/issue-<n>` branch;
    - PR open or reuse, with the compare-link fallback;
    - check results and escaped tables;
    - `--branches` and closing the issue after merge.
  - "Create pull request" in Review mode.
  - "Open on GitHub" in Send, when `exposeRepo: true`.
  - Import change link in the local Studio.
  - "Live now" and "Changed by someone else" in Changes.
  - The `next` dist-tag prerelease path.
- **Changed**
  - The GitHub REST helpers are shared between the preview gateway and `apply`.

## [0.9.0] - 2026-10-27

### Minor Changes

- **Added**
  - The share link on any host: `liveLocaleVite({ share: true })`, `livelocale pack <outDir>` and `livelocale build [--preview] -- <cmd>` write `livelocale/` (the Studio, `manifest.json`, the locale files and `flag.js`) into the build.
  - A framed-only `flag.js`: visitors who open the site directly never get watermarks.
  - Static Studio mode: drafts kept in IndexedDB, re-applied after reloads, the language detected from the page text, Send to developer (Copy link, Download file), Download and Restore backup, and first-run tips.
  - Review mode for `lc1.` change links.
  - `npx livelocale apply "<link|file|->" [--pr] [--clipboard] [--force] [--dry-run]`.
  - `doctor --app <url>` share probes, which print the share link.
  - The client follows a Studio on the same site after full-page navigations.
  - The client reports visible texts.
- **Changed**
  - The Studio is built with a relative base and self-hosted fonts, and is `noindex`.
  - The Studio uses drawers below 1280px.
  - `FileMutator({ requireEnabled })`, with `FileMutatorOptions` exported from `livelocale/server`.
  - The router's write validation moved to `save-rules` with byte-identical responses.

## [0.8.1] - 2026-10-26

### Patch Changes

- **Fixed**
  - Arabic and Persian text shaped wrongly while LiveLocale was active: the first letter of every translated string was drawn in its connected form, as if a hidden letter came before it. The invisible watermark ended with a zero-width joiner, which is join-causing in Arabic shaping. Watermarks now start and end with the non-joining ZWNJ (bits use ZWSP and ZWJ, which never touch a letter); in a browser the watermarked text now renders pixel-identical to plain text.
  - Copy, paste, form submit and input values no longer delete every zero-width character, which removed the ZWNJ that Persian and Urdu words need (e.g. "می‌خواهم") and the ZWSP Thai uses. Only complete watermarks are removed, through the new exported `removeWatermarks()`.
  - After the embedded app navigated through its own links (for example a language switcher), clicks and locale changes no longer reached a Studio running anywhere other than `http://localhost:3010`: the app's links drop the `?livelocale-origin=` parameter and the client fell back to the default origin. The client now remembers the Studio origin for the browser tab (`resolveStudioOrigin`), accepts only http(s) origins, and still works when storage is blocked. Found while editing the Vercel preview of the demo app with the Studio on port 3011.

## [0.8.0] - 2026-10-26

### Minor Changes

- Renamed to LiveLocale. Same features as next-i18n-lens 0.7.0; every name changes and old names are not honoured.

  **Changed**
  - Package `next-i18n-lens` → `livelocale`, CLI `npx livelocale`.
  - `I18nLensProvider` → `LiveLocaleProvider`, `createI18nLensHandler` / `I18nLensHandler` → `createLiveLocaleHandler` / `LiveLocaleHandler`, `i18nLensVite` → `liveLocaleVite`, `getLensMode` / `isLensEnabled` / `LensMode` → `getLiveLocaleMode` / `isLiveLocaleEnabled` / `LiveLocaleMode`; the `ClientInitializer` alias is removed.
  - Route `/api/i18n-lens/mutate` → `/api/livelocale` (`app/api/livelocale/route.ts`, `pages/api/livelocale.ts`); `init` and `doctor` use the new paths.
  - Environment variables `I18N_LENS`, `NEXT_PUBLIC_I18N_LENS`, `I18N_LENS_TOKEN`, `I18N_LENS_ALLOWED_ORIGINS` → `LIVELOCALE`, `NEXT_PUBLIC_LIVELOCALE`, `LIVELOCALE_TOKEN`, `LIVELOCALE_ALLOWED_ORIGINS`.
  - Window globals, iframe query parameter (`livelocale-origin`), bridge message sources, session storage key and log prefix (`[livelocale]`) renamed.
  - The README's migration section lists the steps; it also now states that preview mode for Vite needs the Vite dev server (static builds are not supported yet).

  **Added**
  - `livelocale/package.json` is exported.
  - The publish workflow skips versions that are already on npm.

## [0.7.0] - 2026-10-26

### Minor Changes

- Milestone seven: a translation check for CI, and preview mode tested against a real deployment.

  **Added**
  - `npx next-i18n-lens check` reports invalid locale JSON, broken ICU syntax, keys used in code but missing from a locale, keys missing compared to the source locale (`--source`, default `en`), placeholder drift against the source locale, empty values, and keys nothing references. Exits 1 on problems; `--strict` promotes warnings, `--no-unused` skips the unused report, `--json` prints the full report. Runs in any `NODE_ENV`, so it works in CI.
  - i18next plural families (`items_one`, `items_other`, …) count as one key, and object access such as `t.home` covers every key under it.
  - `KeyScanner` accepts `{ requireEnabled: false }` and gains `scanSourceKeys(projectRoot)` for read-only tooling.

  **Added (preview mode)**
  - The GitHub gateway checks its own access (`checkAccess`): an empty or rejected token, an unknown repository, a missing base branch, and missing "Contents" or "Pull requests" write permission. Write permissions are probed with empty requests that GitHub rejects as invalid, so nothing is created. `GET ?action=info` returns the result as `problems`, the Studio shows it in a banner, and `GitGateway` gains an optional `checkAccess()`.
  - `doctor --token <token>` (or `I18N_LENS_TOKEN`) checks a preview deployment: server mode, git availability, and repository access problems. A 401 now explains that a token is needed.
  - After eight seconds on "Connecting", the Studio lists the usual causes (app not running, framing blocked, provider missing or off) and the `doctor` command to run.
  - `studio` refuses to start when something already answers on `localhost:<port>`; on Windows a second server could otherwise bind beside it and the browser would silently reach the other one.

  **Fixed**
  - Concurrent saves to one locale file in GitHub mode lost edits with `409`. Saves are now queued per file and a save that loses a race re-reads and retries, so two server instances can write the same file.
  - In preview mode a saved edit disappeared from the page as soon as it was saved, and on every reload, because the deployment still serves the old text. The Studio now keeps saved values on the page (`COMMIT_PREVIEW` bridge message) and re-applies the session's saves after reloads and navigation.
  - `doctor --app` blamed middleware when a hosting login wall (Vercel Deployment Protection) redirected the request; it now names the wall and how to turn it off.
  - `doctor` warned about frame-blocking headers even when `frame-ancestors` allowed the Studio origin.
  - `doctor --app` could crash Node on Windows on exit (`UV_HANDLE_CLOSING`), and `check --json` could truncate piped output; both now set `process.exitCode` instead of calling `process.exit()`.
  - GitHub permission errors say which token permission is missing.

## [0.6.0] - 2026-10-15

### Minor Changes

- Milestone six: accurate keys and plural forms.

  **Added**
  - **Plural forms editor** in the Studio: a message that is a single ICU `plural` / `select` / `selectordinal` argument is edited one branch per field, with the active locale's CLDR categories (via `Intl.PluralRules`) pre-populated and missing required categories flagged. "Edit raw" switches back to the textarea. `core/icu-plural` exports `parsePluralMessage`, `buildPluralMessage` and `pluralCategoriesFor`.
  - **Namespace-aware key scanning**: `extractKeys` resolves the namespace bound to each translator variable from `useTranslations('ns')`, `getTranslations('ns')`, `useTranslation('ns')`, `wrapNextIntl(…, 'ns')` and `wrapTranslationEngine(…, { keyPrefix })`, handles several translator variables per file, `t.rich`/`t.raw`/`t.markup`/`t.has`, and template-literal keys without expressions, while skipping dynamic keys and look-alike identifiers.
  - A playground plural key and an end-to-end test for the structured editor.

## [0.5.0] - 2026-10-15

### Minor Changes

- Milestone five: placeholder-safe editing.

  **Added**
  - **Placeholder safety.** The mutation API compares the placeholders of a new value with the `reference` sent by the client and rejects mismatches with `422 PLACEHOLDER_MISMATCH` (details list missing and extra tokens). Structurally broken ICU messages are rejected with `422 MESSAGE_SYNTAX`. `force: true` bypasses both.
  - The Studio editor shows placeholder chips (present, missing, extra) live, sends the reference with each save, and turns a 422 into a warning with **Save anyway** / **Keep editing**.
  - `core/placeholders` exports `extractPlaceholders`, `comparePlaceholders`, and `validateMessageSyntax` covering ICU/next-intl/react-intl, i18next, printf and rich-text tags.
  - Vite parity for preview mode: the Vite plugin mirrors `I18N_LENS` into the page as `window.__I18N_LENS_FLAG__`, which the client reads when no `NEXT_PUBLIC_` variable is inlined.

  **Changed**
  - The translation textarea, the reference box, and sidebar values use `dir="auto"`, so right-to-left text renders correctly.

## [0.4.0] - 2026-10-15

### Minor Changes

- Milestone four: preview mode for editing without a checkout.

  **Added**
  - **Preview mode.** `I18N_LENS=preview` (server) and `NEXT_PUBLIC_I18N_LENS=preview` (client) enable watermarking and the mutation API in a production build, so a deployed preview can be edited through the Studio. The deployed-platform guard does not apply in this mode; the kill switch still wins.
  - **Bearer-token authentication.** `authToken` (or `I18N_LENS_TOKEN`) makes every request require `Authorization: Bearer <token>`; preview mode refuses to serve without a token. The Studio asks for the token once per browser session and keeps it in sessionStorage.
  - **GitHub gateway.** `createI18nLensHandler({ github: { repo, branch, baseBranch, token } })` stores translations on a repository branch through the GitHub REST API: one commit per save, status and diff from the compare endpoint, **Open pull request** from the Changes panel, and **Reset branch** to discard.
  - `GET ?action=info` reports the server mode, whether a token is required, and whether git actions are available; the Studio shows a PREVIEW badge accordingly.

  **Changed**
  - `MutationGateway` gains `readLocale`; the router no longer reads the filesystem directly. Custom gateways must implement it.
  - Nested-key writing and JSON formatting helpers moved to `core/json-path` and are shared by both gateways.
  - All Studio HTTP calls go through `src/studio/api.ts`.

## [0.3.0] - 2026-10-15

### Minor Changes

- Milestone three: review-ready editing.

  **Added**
  - **Changes panel** in the Studio: git status of the locales directory with branch and on-demand diff, commit with a message (locales directory only), discard with confirmation, and a session history with per-edit **Undo**.
  - `GET ?action=git` and `POST action=commit|discard` on the mutation API behind an optional `GitGateway` port; `GitClient` implements it over the `git` CLI. Both adapters enable it by default; `git: false` turns it off.
  - Unit tests for the remaining Studio hooks (`useLocaleData`, `useLocaleActions`), the new hooks, and the Changes panel; an end-to-end test for the panel and undo.

  **Changed**
  - Locale file rewrites preserve the existing indentation unit (tabs, 2 or 4 spaces) and trailing newline, so Studio edits produce minimal diffs.
  - The first end-to-end test waits for the iframe bridge instead of a fixed timeout.

## [0.2.0] - 2026-10-15

### Minor Changes

- Milestone two: safety, speed, and self-diagnosis.

  **Added**
  - `I18N_LENS=off` kill switch (`NEXT_PUBLIC_I18N_LENS=off` in client bundles) and a deployed-platform guard: on Vercel preview/production, Netlify, Kubernetes, Render, Fly.io, Railway, or Heroku the tool stays off even when `NODE_ENV=development`, with a one-time warning. `I18N_LENS=force` overrides.
  - `npx next-i18n-lens doctor [--app <origin>]` checks the route handler, provider mount, middleware or proxy matcher, frame-blocking headers, and locale JSON, and probes the running app for a reachable mutation API and embeddable pages.
  - `unwrap(value)` deep-strips watermarks from strings, arrays, and objects for code that compares, measures, or serializes translated text.
  - Unit tests for the Studio hooks (`useKeySearch`, `useSelection`, `useConnection`).

  **Changed**
  - `createTranslations` caches parsed locale files by mtime and size; a server render costs one `stat` per file.
  - The key scanner is incremental (per-file mtime cache), honours the root `.gitignore`, skips `.d.ts` and files over 1 MB, and ignores next-intl helper properties.
  - Releases are managed with Changesets.

## [0.1.8] - 2026-10-15

### Added

- `wrapNextIntl` helper and FormatJS-style descriptor support (`t({ id })`) in `wrapTranslationEngine`.
- `init` detects `next-intl` / `react-i18next` and prints the matching next step.
- `studio --app <origin>` flag and `?app=<origin>` query parameter: the app origin is now resolved at run time instead of being baked into the Studio bundle.
- `I18N_LENS_ALLOWED_ORIGINS` environment variable for Studio origins outside localhost (Codespaces, Gitpod, custom hostnames).
- Packaged-CLI integration test that runs the built CLI from outside the repository.
- `ARCHITECTURE.md`, `SECURITY.md`, CODEOWNERS, Dependabot, CodeQL workflow, `.gitattributes`.
- README section on team and enterprise setups (CSP, auth middleware, monorepos, remote dev).

### Changed

- `next`, `react`, and `react-dom` are now optional peer dependencies.
- `typescript` is no longer a runtime dependency; `migrate` loads it lazily and fails with an install hint when absent.
- Coverage thresholds are enforced in CI.
- Studio header and CLI output use the "i18n Lens" product name.

### Fixed

- Pages Router support: `createI18nLensHandler` now accepts the `(req, res)` signature, so the file written by `init` for `pages/api` works.
- `init` and `studio` crashed in JavaScript-only projects because the CLI imported `typescript` eagerly.
- The Studio could only talk to `http://localhost:3000`.
- Studio static server returned a non-standard `550` status on read errors.

## [0.1.7] - 2026-05-29

### Added

- Prettier and ESLint configurations for consistent coding styles.
- GitHub Actions CI/CD workflows for automated builds, typechecking, and testing.
- Playwright E2E testing integration in CI workflow.
- Husky and lint-staged pre-commit hooks to automate styling validation.
- Repository health files (`.editorconfig`, `CONTRIBUTING.md`, PR/Issue Templates).

## [0.1.6] - 2026-05-20

### Added

- Zero-width unicode watermark validation and scanning.
- Integration tests for Vite plugin and DOM Interceptors.
- Fallback placeholders for missing localized strings.

## [0.1.0] - 2026-04-15

### Added

- Initial release of `next-i18n-lens`.
- Live visual translation studio and DOM highlighting listener.
- CLI migration tool for wrapping standard react-i18next hooks.
