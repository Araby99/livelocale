# Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every public surface says LiveLocale is an editing and review layer on top of next-intl or react-i18next, for teams first, with proof a reader can check.

**Architecture:** Mostly copy changes on the landing (`site/index.html`), README, package.json, docs and the generated SEO/AI files, plus one new Playwright test proving the watermark doesn't change right-to-left rendering.

**Tech Stack:** Static HTML + Vite site, VitePress docs, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-positioning-design.md`

## Global Constraints

- Positioning statement, audiences (teams → freelancers → CI-only) and "what it isn't" exactly as the spec's "The positioning" section.
- The landing talks to the developer. The doors ("I ship the site" default, "I fix the text") are unchanged. "Who it's for" and "what it isn't" sit outside the doors.
- Headline "Stop collecting screenshots." unchanged. FAQ heading "Questions developers ask" unchanged.
- No competitor names (guarded by `tests/site/landing-sections.spec.ts` COMPETITORS and `tests/unit/site/docs-pages.test.ts`). No claim without a link to code, a test or a doc.
- Solo-translator line only in the CI-only entry and its README line, phrased positively.
- Voice: plain, concrete, no hype (brand comment block at the top of `site/index.html`, `PRODUCT.md`, `DESIGN.md`). Brand name lowercase `livelocale` in site copy, as the site already does.
- Don't weaken guards; update pinned copy in tests deliberately.
- Commit messages: conventional, no AI attribution lines; never `--no-verify`.

## Review Focus

1. **No-JS rendering**: the new section must render and sit in order without JavaScript (`tests/site/static.spec.ts`). Task 2.
2. **Door switch hides it by mistake**: "Who it's for" must stay visible after switching doors both ways. Task 2.
3. **Link rot**: every proof link resolves, including the new anchor `docs/how-it-works/watermarking.html#tested-on-right-to-left-scripts`. Task 2 (site link checks), Task 1 (anchor).
4. **Rendering test flakiness across OSes**: compare within one run (pairs on the same page), no committed baselines. Task 1.
5. **Description length limits**: docs descriptions 50–160 chars, meta description sensible (~150–160), npm description ≤ ~200. Tasks 2–3.

---

### Task 1: Right-to-left rendering proof

**Files:**

- Create: `tests/e2e/watermark-rtl-render.spec.ts` (runs in the existing e2e config; needs no app server: build the page with `page.setContent` and import `encodeKey` from `src/client/watermark.ts`)
- Modify: `site/docs/how-it-works/watermarking.md` (new section `## Tested on right-to-left scripts`, anchor `tested-on-right-to-left-scripts`)

- [ ] **Step 1: Write the spec** with cases: Arabic words whose first/last letters have distinct joined forms (e.g. `بيت`, `محمد`, `ابدأ تجربتك المجانية`), mixed Arabic + Latin + digits (`خطة Pro بـ 29 دولار`), Persian with a real ZWNJ (`می‌خواهم`), Hebrew (`שלום עולם`). For each: render plain and `encodeKey(text, 'k.' + i)` side by side in `dir="rtl"` spans with the same font (use a font the CI runner has, e.g. the Studio's bundled IBM Plex Sans Arabic via `@font-face` from `node_modules` or a system font fallback; wait for `document.fonts.ready`). Assert equal `getBoundingClientRect()` width/height, and equal element screenshots (`Buffer.compare(a, b) === 0`). Control test `a joining character beside a letter does change the rendering`: wrap with `‍` next to the first Arabic letter and assert the screenshot differs.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/watermark-rtl-render.spec.ts` → PASS (the control asserts a difference, so the test is proven able to fail).
- [ ] **Step 3: Docs**: 2–4 sentences under the new heading stating what the test proves and linking the test file on GitHub (`https://github.com/Araby99/livelocale/blob/main/tests/e2e/watermark-rtl-render.spec.ts`). Run `npx vitest run tests/unit/site` → PASS.
- [ ] **Step 4: Commit** `test(e2e): prove the watermark leaves right-to-left rendering unchanged`

### Task 2: Landing page

**Files:**

- Modify: `site/index.html`, `site/src/styles/sections.css` (new section styles in the existing system), `site/src/main.ts` only if door logic needs to exclude the new section
- Test: `tests/site/landing-sections.spec.ts`, `tests/site/static.spec.ts`, plus any `tests/unit/site/*` pinning hero/meta copy

**Interfaces:** Consumes the Task 1 anchor.

- [ ] **Step 1: Tests first.** In `landing-sections.spec.ts`: `shows Who it's for outside the doors` (visible at `./` and `./#fixer`, after toggling doors); `names the three audiences in order` (three items, headings/text in order: team, freelancer, CI check; links: `docs/guides/share-links.html` for team and freelancer as fits, `docs/guides/ci-check.html` for CI); `says it is not an i18n library` (the line is visible for both doors and mentions next-intl and react-i18next); FAQ list gains `Is it an i18n library?` (update the seven-question test to eight, with its docs link); `proof links resolve to their docs` (safety-switches, watermarking#tested-on-right-to-left-scripts, ci-check limits anchor — check the anchor id in `site/docs/guides/ci-check.md`). In `static.spec.ts`: add the new section heading to the no-JS order check.
- [ ] **Step 2: Run** `npm run site:build && npx playwright test --config playwright.site.config.ts tests/site/landing-sections.spec.ts tests/site/static.spec.ts` → FAIL.
- [ ] **Step 3: Implement.** `<title>`, meta description, og/twitter descriptions: team + layer framing. Hero lede: start from the spec draft _"livelocale sits on top of next-intl or react-i18next. Your content people fix text on the real site, and you get a pull request."_ "What it isn't" one line in or directly under the hero, outside the doors. "Who it's for" section (heading e.g. "Who it's for") after the door stories, before `#compare`, outside door control. Fixer story/share-links copy: freelancer line (client fixes their own copy, freelancer reviews a PR). FAQ: new `Is it an i18n library?` answer (no; it keeps your library's routing, formatting, detection; links `docs/`), and the CI limits linked from the CI excerpt or a FAQ answer. Proof line(s) near the comparison or FAQ with the three links.
- [ ] **Step 4: Run** the two specs, then `npm run test:site` (a11y, Lighthouse-adjacent checks, 360 px no horizontal scroll) → PASS.
- [ ] **Step 5: Commit** `feat(site): position livelocale as a layer on top, for teams first`

### Task 3: README, npm, docs, SEO/AI files

**Files:**

- Modify: `README.md` (top block), `package.json` (`description`, `keywords` if useful), `site/docs/index.md` (frontmatter description + intro), `site/docs/guides/share-links.md` (intro), `site/src/lib/seo-files.ts` (llms.txt summary, JSON-LD description)
- Test: `tests/unit/site/seo.test.ts`, `tests/unit/site/docs-*.test.ts`, any README/package description guard

- [ ] **Step 1: Tests first** where a guard exists or is cheap: `seo.test.ts` asserts llms.txt and JSON-LD descriptions mention next-intl and react-i18next and do not say "i18n library" as a self-description; a unit test that `package.json` description mentions both libraries and is ≤ 200 chars.
- [ ] **Step 2: Run** `npx vitest run tests/unit/site` → FAIL on the new assertions.
- [ ] **Step 3: Implement** the copy. README top: lead with the layer + teams line, then "what it isn't", then one line each for freelancers and CI-only (solo-translator phrasing per Global Constraints).
- [ ] **Step 4: Run** `npx vitest run tests/unit/site && npm run site:build && npm run format:check` → PASS.
- [ ] **Step 5: Commit** `docs: lead every surface with the layer-on-top positioning`

### Task 4 (after owner approval only): go live

- [ ] Merge `docs/positioning` into `main`, push (site deploys).
- [ ] `gh repo edit Araby99/livelocale --description "<team + layer framing, ≤ 350 chars>"`.
- [ ] npm `description` ships with the next release (no publish in this plan).
