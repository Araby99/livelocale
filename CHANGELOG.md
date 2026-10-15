# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
