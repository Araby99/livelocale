# LiveLocale Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `livelocale@0.8.0`: the same features as `next-i18n-lens@0.7.0` under the LiveLocale name everywhere, with no old-name aliases.

**Architecture:** A mechanical rename driven by the spec's name map, done layer by layer (core/client → server → Studio → CLI/packaging → playground/E2E → docs), each layer leaving the test suite green. Then the outward rollout (repo rename, owner's first publish, release, demo, Vercel).

**Tech Stack:** TypeScript, tsup, Vite (Studio), Vitest, Playwright, Changesets, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-livelocale-rename-design.md`

## Global Constraints

- Every identifier in the spec's "Name map" table changes exactly as listed there; no compatibility aliases, fallbacks or warnings for old names.
- `data-i18n-key`, `data-i18n-template` and the default branch `i18n/preview-edits` do not change.
- Zero runtime dependencies, MIT, Node ≥ 18.
- Acceptance grep: `git grep -inE "i18n[-_ ]?lens|I18nLens|I18N_LENS|LensMode|isLensEnabled|getLensMode"` matches only `CHANGELOG.md` history, the CHANGELOG migration section, and `docs/superpowers/`.
- Commits never mention Claude/AI and carry no Co-Authored-By trailer (owner's global rule).

## Review Focus

1. Kill switch under the new name: `LIVELOCALE=off` disables everything, and an old `I18N_LENS=preview` must leave the tool **off** in production (old names ignored, not honoured). Test owned by Task 1.
2. Preview mode without `LIVELOCALE_TOKEN` still refuses to serve. Test owned by Task 2.
3. Client and Studio agree on the renamed bridge protocol (`livelocale-client` / `livelocale-studio`, `livelocale-origin`); a mismatch silently leaves the Studio on "Connecting". Covered by Task 1's bridge test plus Task 5's E2E run.
4. The packaged CLI runs as `livelocale` from outside the repo, and `init` writes `app/api/livelocale/route.ts` / `pages/api/livelocale.ts` that `doctor` then finds. Task 4.
5. The Vite plugin serves the API at `/api/livelocale` and injects `__LIVELOCALE_FLAG__`. Task 2.

---

### Task 1: Core environment and client runtime

**Files:**

- Modify: `src/core/env.ts`, `src/client/*.ts`, `src/react/index.tsx`
- Test: `tests/unit/env.test.ts`, `tests/unit/dom-interceptor.test.ts`, `tests/unit/wrap.test.ts`, `tests/unit/watermark.test.ts`, `tests/integration/iframe-communication.test.ts`

**Interfaces:**

- Produces: `getLiveLocaleMode(): LiveLocaleMode`, `isLiveLocaleEnabled(): boolean`, `type LiveLocaleMode = 'off' | 'development' | 'preview'`, `getDisabledReason()` (unchanged name), `BROWSER_FLAG_GLOBAL = '__LIVELOCALE_FLAG__'`; env names `LIVELOCALE`, `NEXT_PUBLIC_LIVELOCALE`; React export `LiveLocaleProvider` only (no `ClientInitializer`); window globals `__livelocale_fallback__`, `__LIVELOCALE_CLIENT__`; marker `__liveLocaleSanitized__`; bridge sources `livelocale-client` / `livelocale-studio`; query param `livelocale-origin`; overlay id `livelocale-highlighter-overlay`; log prefix `[livelocale]`.

- [ ] **Step 1:** Rename tests first: update env/bridge/wrap/interceptor tests to the new names, and add to `tests/unit/env.test.ts`:
      `it('ignores the old I18N_LENS variables')` — with `NODE_ENV=production`, `I18N_LENS=preview`, `NEXT_PUBLIC_I18N_LENS=preview` stubbed, `expect(getLiveLocaleMode()).toBe('off')`; and with `LIVELOCALE=preview`, `expect(getLiveLocaleMode()).toBe('preview')`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/env.test.ts tests/integration/iframe-communication.test.ts` — expect FAIL (names not found).
- [ ] **Step 3:** Rename in `src/core/env.ts`, `src/client/*`, `src/react/index.tsx` per the Interfaces block.
- [ ] **Step 4:** Run `npx vitest run tests/unit/env.test.ts tests/unit/dom-interceptor.test.ts tests/unit/wrap.test.ts tests/unit/watermark.test.ts tests/integration/iframe-communication.test.ts` — expect PASS.
- [ ] **Step 5:** `npx tsc --noEmit` passes for these files (later layers may still fail until Task 2–4; commit together with Task 4 if the build must stay green on each commit).

### Task 2: Server layer

**Files:**

- Modify: `src/server/{next-handler,vite-plugin,router,github-gateway,file-mutator,key-scanner,translations,index}.ts`
- Test: `tests/unit/{next-handler,pages-handler,vite-plugin,router-*,github-gateway,file-mutator,key-scanner,translations}.test.ts`

**Interfaces:**

- Consumes: Task 1 names.
- Produces: `createLiveLocaleHandler(config: HandlerConfig): LiveLocaleHandler`, inner function `liveLocaleHandler`; `liveLocaleVite(config: VitePluginConfig)` with plugin name `livelocale` and middleware path `/api/livelocale`; token env `LIVELOCALE_TOKEN`; origins env `LIVELOCALE_ALLOWED_ORIGINS`; `src/server/index.ts` re-exports `getLiveLocaleMode`, `isLiveLocaleEnabled`, `type LiveLocaleMode`.

- [ ] **Step 1:** Update the listed tests to the new names; add to `tests/unit/router-info.test.ts`: `it('refuses to serve preview mode without LIVELOCALE_TOKEN')` — `LIVELOCALE=preview`, `NODE_ENV=production`, no token → `?action=info` status is not 200 and the error mentions `LIVELOCALE_TOKEN`. Add to `tests/unit/vite-plugin.test.ts`: the middleware answers `/api/livelocale` and the transformed HTML contains `window.__LIVELOCALE_FLAG__`.
- [ ] **Step 2:** Run those tests — expect FAIL.
- [ ] **Step 3:** Rename in the server files.
- [ ] **Step 4:** Run `npx vitest run tests/unit` — expect PASS for all server tests.

### Task 3: Studio

**Files:**

- Modify: `src/studio/{api,config}.ts`, `src/studio/index.html`, `src/studio/features/dashboard/**`
- Test: `tests/unit/studio-*.test.ts*`, `tests/unit/studio-connection-help.test.tsx`, `tests/unit/translation-editor.test.tsx`

**Interfaces:**

- Consumes: bridge names from Task 1, route `/api/livelocale` from Task 2.
- Produces: API base `${APP_ORIGIN}/api/livelocale`; sessionStorage key `livelocale-token`; injected global `__LIVELOCALE_CONFIG__`; visible brand "LiveLocale" / title "LiveLocale · Studio"; token modal and help text name `LIVELOCALE_TOKEN`, `NEXT_PUBLIC_LIVELOCALE` and `npx livelocale doctor`.

- [ ] **Step 1:** Update Studio tests to the new strings (API URL, storage key, doctor command text).
- [ ] **Step 2:** Run them — expect FAIL.
- [ ] **Step 3:** Rename in the Studio sources (do not reformat `index.html` beyond the title).
- [ ] **Step 4:** Run `npx vitest run tests/unit` — expect PASS.

### Task 4: CLI and packaging

**Files:**

- Modify: `src/codemod/{index,doctor,check,studio-server,transform}.ts`, `package.json`, `tsup.config.ts` (if names appear), `.github/workflows/publish.yml`
- Test: `tests/unit/{doctor,check,codemod,studio-server}.test.ts`, `tests/integration/cli-package.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: package `livelocale` version `0.8.0` (via changeset in Task 6), `bin: { "livelocale": "dist/codemod/index.js" }`, exports adds `"./package.json": "./package.json"`; repository/homepage/bugs URLs `https://github.com/Araby99/livelocale`; `init` writes `app/api/livelocale/route.ts` (or `src/app/…`, `.js`) and `pages/api/livelocale.ts`; `doctor` route/provider candidates use the new paths and `LiveLocaleProvider`; `migrate` imports `livelocale/client`; help text says `npx livelocale`.

- [ ] **Step 1:** Update CLI tests; add to `tests/unit/doctor.test.ts`: a project with `app/api/livelocale/route.ts` and `LiveLocaleProvider` in `app/layout.tsx` passes the route and provider checks, and one with only the old `app/api/i18n-lens/mutate/route.ts` fails the route check. Update `tests/integration/cli-package.test.ts` to invoke the `livelocale` bin.
- [ ] **Step 2:** Run them — expect FAIL.
- [ ] **Step 3:** Rename in CLI sources and `package.json`. In `publish.yml`, before `npm publish`, add a step that runs `npm view "livelocale@$(node -p "require('./package.json').version")" version` and skips publishing when it prints a version.
- [ ] **Step 4:** Run `npm run build && npx vitest run` — expect all PASS; `node dist/codemod/index.js --help` prints `npx livelocale`.
- [ ] **Step 5:** Commit Tasks 1–4 together: `refactor: rename the package and its APIs to LiveLocale`.

### Task 5: Playground and E2E

**Files:**

- Move: `playground/app/api/i18n-lens/mutate/route.ts` → `playground/app/api/livelocale/route.ts`
- Modify: `playground/app/{layout,page}.tsx`, `playground/package.json` (dependency `"livelocale": "file:.."`), `tests/e2e/visual-sync.spec.ts`, `playwright.config.ts` if names appear

- [ ] **Step 1:** Apply the moves/renames; reinstall the playground link (`npm install --prefix playground`).
- [ ] **Step 2:** Run `npx playwright test` on free ports (the owner's own dev servers may hold 3000/3010; stop nothing of theirs) — expect 8 passed.
- [ ] **Step 3:** Commit: `test: move the playground and E2E suite to LiveLocale names`.

### Task 6: Docs, changelog, hygiene

**Files:**

- Modify: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `.gitignore`, `.changeset/` (new major-in-0.x changeset), `.github/` templates if they mention the name

- [ ] **Step 1:** Rewrite docs with the new names; README title "LiveLocale", one-line "formerly next-i18n-lens" note, install `npm install livelocale`.
- [ ] **Step 2:** Changeset (`minor`) whose text is the 0.8.0 entry: "Renamed to LiveLocale", the name map, and a migration checklist (install, imports, route file, env vars, CLI command). Run `npx changeset version`, then hand-format CHANGELOG to `## [0.8.0] - <date>` under the preamble (house style).
- [ ] **Step 3:** Add `reports/` and `research_notes/` to `.gitignore`.
- [ ] **Step 4:** Run the acceptance grep from Global Constraints — expect matches only in allowed places; run `npm run format:check && npm run lint && npm run typecheck && npm run build && npx vitest run`.
- [ ] **Step 5:** Commit: `chore: release 0.8.0` (includes `docs/superpowers/` spec and plan).

### Task 7: Rollout

- [ ] **Step 1:** Push `main`; wait for CI green.
- [ ] **Step 2:** `gh repo rename livelocale -R Araby99/next-i18n-lens --yes`; update the local `origin` URL.
- [ ] **Step 3:** Hand off to the owner: first `npm publish` of `livelocale@0.8.0` from his machine, then the trusted publisher for `livelocale`.
- [ ] **Step 4:** After `npm view livelocale version` prints `0.8.0`: `gh release create v0.8.0` (publish workflow skips the existing version); give the owner the `npm deprecate next-i18n-lens "Renamed to livelocale: npm i livelocale"` command.
- [ ] **Step 5:** Demo repo: install `livelocale@^0.8.0`, move the route to `app/api/livelocale/route.ts`, rename env names in code and README, `check` + build, push with author `ahmed.araby7956@gmail.com`.
- [ ] **Step 6:** Vercel: rename the four non-secret Preview variables via CLI; owner renames `I18N_LENS_TOKEN` → `LIVELOCALE_TOKEN`; redeploy the preview branch; `npx livelocale doctor --app <preview> --token …` is clean.
