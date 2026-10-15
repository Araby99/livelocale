# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
