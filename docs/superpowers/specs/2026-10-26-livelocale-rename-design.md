# Rename: next-i18n-lens / "i18n Lens" → LiveLocale

Date: 2026-10-26 · Owner: Ahmed Araby · Status: draft for approval

## Why

"i18n Lens" collides with active projects in the same niche: `@i18nlens/cli` (command `i18nlens`, the
"I18n Lens" Zed extension), naver/i18n-Lens, the `i18n-lens` npm CLI, and the brand-new `localelens`
package with a near-identical pitch. The `next-` prefix also wrongly says the tool is Next.js-only (it
supports Vite SPAs). The owner chose **LiveLocale**: free on npm and GitHub, says what it does, friendly
for non-coders. `next-i18n-lens` has about 4 downloads a month, so a clean break costs almost nothing.

The rename is the first step of the go-to-market plan in `reports/LiveLocale competitive landscape.md`
(demo site, framework recipes, launch). The next milestone, a Studio served from the app itself so
translators get a share link, will be designed separately and builds on these names.

## Goals

- Nothing user-facing or internal says "i18n-lens", "i18n Lens", `I18N_LENS` or `I18nLens` anymore
  (the owner's explicit choice). Exceptions: CHANGELOG history, the migration section, and the
  deprecation message on the old npm package.
- One release, `livelocale@0.8.0`, that is otherwise feature-identical to `next-i18n-lens@0.7.0`.
- The old package points people to the new one.

## Non-goals

- No logo, colours, typography or visual identity work (separate branding track).
- No share-link Studio (next milestone).
- No new features, no behaviour changes beyond names.

## Anti-goals

- Keeping old names working through aliases or fallbacks in the new package (the owner chose a clean
  break, so code must not read `I18N_LENS*` or answer on `/api/i18n-lens`).
- A rename that silently weakens a safety switch. The kill switch, preview-mode token requirement and
  deployed-platform guard must behave exactly as before under their new names.

## Name map (decided)

| Kind                               | Old                                                                                                 | New                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| npm package                        | `next-i18n-lens`                                                                                    | `livelocale`                                                                                       |
| Subpath exports                    | `next-i18n-lens/{client,server,react,vite}`                                                         | `livelocale/{client,server,react,vite}`, plus `"./package.json"`                                   |
| CLI binary                         | `next-i18n-lens`                                                                                    | `livelocale`                                                                                       |
| Brand text                         | i18n Lens, i18n Lens Studio                                                                         | LiveLocale, LiveLocale Studio                                                                      |
| React component                    | `I18nLensProvider`                                                                                  | `LiveLocaleProvider`                                                                               |
| Handler factory / type             | `createI18nLensHandler`, `I18nLensHandler`                                                          | `createLiveLocaleHandler`, `LiveLocaleHandler`                                                     |
| Internal handler fn                | `i18nLensMutationHandler`                                                                           | `liveLocaleHandler`                                                                                |
| Vite plugin                        | `i18nLensVite`                                                                                      | `liveLocaleVite`                                                                                   |
| Mode helpers                       | `getLensMode`, `isLensEnabled`, type `LensMode`                                                     | `getLiveLocaleMode`, `isLiveLocaleEnabled`, type `LiveLocaleMode`                                  |
| React alias                        | `ClientInitializer` (alias of the provider)                                                         | removed; `LiveLocaleProvider` only                                                                 |
| Server env                         | `I18N_LENS` (off/preview/force)                                                                     | `LIVELOCALE`                                                                                       |
| Client env                         | `NEXT_PUBLIC_I18N_LENS`                                                                             | `NEXT_PUBLIC_LIVELOCALE`                                                                           |
| Token env                          | `I18N_LENS_TOKEN`                                                                                   | `LIVELOCALE_TOKEN`                                                                                 |
| Extra origins env                  | `I18N_LENS_ALLOWED_ORIGINS`                                                                         | `LIVELOCALE_ALLOWED_ORIGINS`                                                                       |
| API route                          | `/api/i18n-lens/mutate` (`app/api/i18n-lens/mutate/route.ts`, `pages/api/i18n-lens/mutate.ts`)      | `/api/livelocale` (`app/api/livelocale/route.ts`, `pages/api/livelocale.ts`)                       |
| Window globals                     | `__I18N_LENS_CONFIG__`, `__I18N_LENS_FLAG__`, `__i18n_lens_fallback__`, `__NEXT_I18N_LENS_CLIENT__` | `__LIVELOCALE_CONFIG__`, `__LIVELOCALE_FLAG__`, `__livelocale_fallback__`, `__LIVELOCALE_CLIENT__` |
| Prototype marker                   | `__i18nLensSanitized__`                                                                             | `__liveLocaleSanitized__`                                                                          |
| Iframe query param                 | `i18n-lens-origin`                                                                                  | `livelocale-origin`                                                                                |
| postMessage sources                | `i18n-lens-client`, `i18n-lens-studio`                                                              | `livelocale-client`, `livelocale-studio`                                                           |
| Storage / DOM ids                  | `i18n-lens-token`, `i18n-lens-highlighter-overlay`                                                  | `livelocale-token`, `livelocale-highlighter-overlay`                                               |
| Log / error prefix                 | `[i18n-lens]`                                                                                       | `[livelocale]`                                                                                     |
| Default GitHub branch in docs/demo | `i18n/preview-edits`                                                                                | unchanged (not brand-bearing)                                                                      |
| DOM attributes                     | `data-i18n-key`, `data-i18n-template`                                                               | unchanged (generic, not brand-bearing)                                                             |
| GitHub repo                        | `Araby99/next-i18n-lens`                                                                            | `Araby99/livelocale` (GitHub redirects old URLs)                                                   |

## Release and migration (decided)

1. Code and docs renamed in this repo; tests, E2E, the packaged-CLI test and the playground all pass.
   `git grep -iE "i18n[-_ ]?lens|I18nLens|I18N_LENS|LensMode|isLensEnabled|getLensMode"` finds only
   CHANGELOG history, the migration section, and design documents under `docs/superpowers/`.
2. CHANGELOG gets a `0.8.0` entry: "Renamed to LiveLocale", the full name map, and a short migration
   checklist (install `livelocale`, update imports, move the route file, rename env vars).
3. The GitHub repo is renamed to `livelocale`; `package.json` repository/homepage/bugs URLs follow.
4. **First publish of `livelocale` is done once by the owner from his machine** (npm only allows
   configuring trusted publishing for a package that already exists). Then the owner adds the trusted
   publisher for `livelocale` on npmjs.com, and later releases go through `publish.yml` as today.
5. After `livelocale@0.8.0` is live: `npm deprecate next-i18n-lens "Renamed to livelocale: npm i livelocale"`.
   No re-export shim package (old export names change too, and the user base is negligible).
6. The demo repo `Araby99/Translation-Test` moves to `livelocale` and the new route/env names. On
   Vercel, the non-secret variables are renamed by Claude via the CLI; the owner renames the two
   secrets (`I18N_LENS_TOKEN` → `LIVELOCALE_TOKEN`; `GITHUB_TOKEN` keeps its name).

### Who does what, in order

| Step                                                                                                                                                                                                                | Who                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Rename code, docs, tests; changeset; commit `chore: release 0.8.0`; push `main`; CI green                                                                                                                           | Claude                            |
| Rename the GitHub repo to `Araby99/livelocale` (`gh repo rename`), before the first publish so `package.json` URLs resolve                                                                                          | Claude                            |
| First `npm publish` of `livelocale@0.8.0` from his machine; add the trusted publisher for `livelocale`                                                                                                              | Owner                             |
| Tag `v0.8.0` and create the GitHub release (notes from CHANGELOG). `publish.yml` gains a guard that skips publishing when that version is already on npm, so the release cannot clash with the manual first publish | Claude                            |
| `npm deprecate next-i18n-lens …` (needs the owner's npm login)                                                                                                                                                      | Owner, command provided by Claude |
| Demo repo (`Araby99/Translation-Test`, cloned in Claude's scratchpad, installs from npm): switch to `livelocale@^0.8.0`, move the route file, rename env names in code and README; only after 0.8.0 is on npm       | Claude                            |
| Vercel: rename the four non-secret variables with the already logged-in CLI, then redeploy the preview branch (`NEXT_PUBLIC_LIVELOCALE` is baked in at build time)                                                  | Claude                            |
| Vercel: rename the `I18N_LENS_TOKEN` secret to `LIVELOCALE_TOKEN`                                                                                                                                                   | Owner                             |

### Repository hygiene

The business research (`reports/`, `research_notes/`) stays out of the public repo: both folders are
added to `.gitignore`. Design documents under `docs/superpowers/specs/` are committed and may mention
old names as history.

## Constraints

- Zero runtime dependencies stays; MIT stays; Node ≥ 18 stays.
- The `init` command must write the new route file paths; `doctor` must look for them.
- Safety parity: unit tests that cover the kill switch, preview token, platform guard and origin checks
  are renamed, not weakened, and must still pass.

## Calls made by Claude (owner may override)

- API route shortened to `/api/livelocale` (it already serves GET and POST, "mutate" was inaccurate).
- Clean break, no compatibility aliases or warnings for old env vars, matching "nothing says i18n-lens".
- Version continues at `0.8.0` rather than restarting at `0.1.0` or jumping to `1.0.0`, so the changelog
  history stays meaningful.
- No shim package; old package is only deprecated.
- Mode helpers renamed and the `ClientInitializer` alias dropped, so no "Lens" survives in the public API.
- `publish.yml` skips `npm publish` when the version already exists on npm.
- Competitive research is kept out of the public repo (gitignored).

## Left to the builder

- Order of edits, file moves, and how tests are updated.
- Exact wording of the README rewrite, migration notes and deprecation message.
- Whether the playground's route file is moved or regenerated with `init`.

## Owner actions (cannot be done by Claude)

- First `npm publish` of `livelocale` from his machine, then trusted-publisher setup for it.
- `npm deprecate next-i18n-lens …` once `livelocale@0.8.0` is live.
- Renaming the `I18N_LENS_TOKEN` secret on Vercel.
- Optional: trademark search for "LiveLocale" (USPTO/EUIPO) and registering `livelocale.dev`.
