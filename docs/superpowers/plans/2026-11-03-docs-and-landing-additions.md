# livelocale Docs and Landing Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a docs section at `<base>docs/` whose front door is a getting-started path, three new landing sections with Docs links, and the launch gates (Lighthouse, accessibility, WebKit and Firefox, social card, `site/LAUNCH.md`), so the site can go live at `livelocale.js.org`.

**Architecture:** VitePress builds `site/docs/` into `site/dist/docs/` after the landing build, inside the existing `site/scripts/build.mjs` and the existing Pages workflow. A custom theme extends `vitepress/theme-without-fonts` with the hunk tokens and fonts the landing page already ships, replaces the nav title with the landing page's brand mark, and renders three docs-only blocks: `DocShot` and `DocClip` (media produced by `site/scripts/record-docs.mjs` from the real Studio) and `cli` fences (output produced at build time by running the built CLI on fixtures). Two guards keep the docs honest: a CLI reference coverage test against `livelocale --help` and a link test over the built HTML.

**Tech Stack:** VitePress 1.6.4 (Vue 3, its own nested Vite 5, local MiniSearch search), Vite 8 for the landing page, Fontsource, ffmpeg-static, Playwright (capture, E2E in Chromium, WebKit and Firefox), `@axe-core/playwright`, Lighthouse with `chrome-launcher`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-docs-and-landing-additions-design.md` (with `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and brand spec `docs/superpowers/specs/2026-11-01-brand-and-landing-design.md` §2). Takes over Tasks 18–20 of `docs/superpowers/plans/2026-11-01-brand-and-landing.md`; that plan's Task 17 clip work is replaced by Task 2 here.

## Global Constraints

- Docs live in `site/`, build to `site/dist/docs/`, deploy with the landing page through `.github/workflows/site.yml`, behind the same `SITE_LIVE` gate, on the same `/livelocale/` base until the js.org domain (spec §3.1). Docs base = `siteConfig(env).base + 'docs/'`.
- VitePress is a devDependency of `site/package.json` only, pinned `"vitepress": "1.6.4"`; `site/package.json` also gains `"vite": "^8.0.14"` so the landing build keeps Vite 8 while VitePress uses its own nested Vite 5. Other new packages (`lighthouse`, `chrome-launcher`) also go only in `site/package.json`. Root `package.json` dependencies and devDependencies do not change (`@axe-core/playwright` is already there); the library's `dependencies` stay empty; nothing reaches the npm package.
- The theme imports `vitepress/theme-without-fonts` (the default entry bundles Inter). Fonts are the landing page's: `site/src/styles/fonts.css`; tokens: `site/src/styles/tokens.css`.
- Dark only (`appearance: 'force-dark'`), one theme. Martian Mono headings, IBM Plex Sans body, IBM Plex Mono code, IBM Plex Sans Arabic second in every stack. Colours only from `DESIGN.md`: Night `#0C0D0F`, Surface `#16181D`, Rule `#2A2D33`, Edge `#6B6F7A`, Paper `#E8E4D9`, Comment `#8C887D`, Ghost `#6E6B64` (strike line only), Patch `#FFB224` (fills and the focus ring only), Patch Lit `#FFC150`, Patch Underside `#8A5600`, Wash `#2E2412`, Hunk `#4FC3DC`, Exit 1 `#FF5468` (word or dashed outline only), Exit 0 `#6FD69A` (with a check glyph). No glows, blurs, gradients or purple. Focus ring: 2px solid Patch, 3px offset, 4px radius.
- Code blocks by the one-job rules: keys and paths in Hunk, `+` lines on Wash with the `+` as a Patch fill, failures in Exit 1, success in Exit 0 (spec §3.1).
- Local search only (`search: { provider: 'local' }`). No third-party request at runtime, no analytics (PRODUCT.md). English only.
- External links allowed in the docs and on the landing page: `https://github.com/Araby99/livelocale` (and paths under it), `https://www.npmjs.com/package/livelocale`, `https://github.com/Araby99/tidewell` (and paths under it), `https://js.org/`, `https://livelocale.js.org/` (spec §3.4). Any other URL may appear as text in code, never as a link.
- "Every factual statement in the docs and the landing FAQ must be true of 0.11.0's code or README; the builder verifies, and anything unverifiable is left out, not guessed" (spec §3.4). Content tasks list each claim with its source (README section, code path, or command run) in their task report.
- "Terminal output in the docs comes from running the real CLI at build or capture time, never typed by hand" (§3.3). Every raster carries a provenance sidecar `<file>.json` (`{ prompt, createdAt }`, prompt starting `SOURCED, not generated.`), like the hero media.
- Clips: muted, `playsinline`, poster frame, a visible pause control, no autoplay under `prefers-reduced-motion: reduce`, lazy loading (§3.3).
- Voice: brand spec §2.5 (short, direct, sentence case, no hype). The word "PM" is never used. No competitor names on the landing page. No testimonials, user counts, star counts or benchmarks.
- WCAG 2.2 AA; works from 360px wide with no horizontal page scroll; keyboard reachable with the visible ring; reduced motion respected.
- Lighthouse mobile performance ≥ 90, median of 3 runs, on the landing page and the getting-started pages (§5.1).
- Non-goals (§6): no Arabic docs, no analytics, no versioned docs, no product changes under `src/` (no `npx livelocale theme`, no annotations output).
- Commit messages are conventional and never mention Claude, Anthropic or AI: no `Co-Authored-By` trailer, no "Generated with" line.
- Gate before every commit: `npm run typecheck`, `npm run lint`, `npm run format:check` (fix with `npm run format:write`), `npm run site:typecheck` all exit 0.
- Test conventions: vitest files in `tests/unit/site/` start with `// @vitest-environment node`; Playwright site specs in `tests/site/` run with `npm run test:site` (builds the whole site under `/livelocale/`). A `.mjs` module imported by a TS test gets a sibling `.d.mts` declaration (pattern: `site/scripts/hero-cuts.d.mts`). Unit tests run in the main CI after `npm run build` and `npm ci --prefix site`, so they may run the built CLI but must not need `site/dist`; anything reading the built site is a Playwright spec.
- Work on branch `feat/landing` (already merged with `main` at 0.11.0). Never push; never open pull requests.

## Review Focus

1. **The docs on the `/livelocale/` sub-path.** One root-relative URL in the theme, a component or a docs-to-landing link 404s on Pages before the domain switch. Expected: every docs request stays under `/livelocale/`. Pinned in Task 1, `serves every docs request under the /livelocale/ base`, and Task 4, `finds no broken link or anchor in the built site`.
2. **A 360px phone on a reference page** with the `init --share` stack table, a flags table and long `cli` blocks. Expected: tables and code scroll inside their own box, the page never scrolls sideways. Pinned in Task 1, `has no horizontal scroll at 360 px on the docs front door`, and Task 18, `has no horizontal scroll at 360 px on every docs page`.
3. **The CLI moves on (a flag added, an exit code changed) or a fixture rots.** Expected: the build or a test fails instead of shipping stale docs. Pinned in Task 3, `fails the build when a snippet exits with another code`, and Task 5, `documents every command and flag the CLI prints`.
4. **A reader with reduced motion or JavaScript off.** Expected: shots, clip posters and every step render; no clip plays by itself. Pinned in Task 2, `keeps a clip on its poster under reduced motion`, and Task 1, `renders the docs front door without JavaScript`.
5. **A reader searching the offline docs for a flag** (`hardcoded`, `--share`) in any engine. Expected: the reference page is a result and nothing is fetched outside the base. Pinned in Task 1, `finds the check reference with the offline search`, run in WebKit and Firefox by Task 17.

## Decisions made by this plan (Claude's call within the spec)

- **URL map** (all under `<base>docs/`, `cleanUrls: false`, so pages end in `.html` as `tests/site/fixtures/serve.mjs` and Pages serve them): `index.html` (Get started: pick your stack, what next), `start/nextjs.html`, `start/vite.html`, `start/static-host.html`; `guides/share-links.html`, `guides/ci-check.html`, `guides/studio.html`, `guides/preview-mode.html`, `guides/teams.html`, `guides/migrate.html`; `how-it-works/watermarking.html`, `how-it-works/safety-switches.html`, `how-it-works/watermark-pitfalls.html`, `how-it-works/security.html`, `how-it-works/risks-and-limits.html`; `reference/cli/index.html` plus one page per command (`init`, `studio`, `doctor`, `check`, `pack`, `build`, `apply`, `migrate`), `reference/configuration.html`, `reference/environment.html`, `reference/changelog.html`.
- **"The getting-started page" for Lighthouse** is measured as two URLs: the front door `docs/` and the heaviest stack page `docs/start/nextjs.html`.
- **Media** go to `site/media/docs/` (beside `site/media/hero/`), imported through Vite so they are hashed; sidecars and `manifest.json` stay unpublished.
- **Studio captures**: dev Studio on `playground/` (Next.js, `next dev -p 3100`) and `playground-vite/` (`vite --port 5180`), Studio on `--port 3110`; share Studio on the Tidewell stage packed as `record-hero.mjs` does. `record-hero.mjs` is not changed.
- **CLI snippets** run at build time on fixtures in `site/scripts/docs/fixtures/`, output to the gitignored `site/.cache/docs-cli/`.
- **Header**: VitePress's `VPNavBarTitle` is replaced by `SiteBrand.vue`, which carries the landing header's mark SVG byte for byte (a unit test compares them) and links to the landing page; the nav holds the same two links, GitHub and Docs.
- **Changelog page** renders `CHANGELOG.md` from its first `## [` heading, so the preamble's keepachangelog.com and semver.org links (outside the allowlist) are not linked.
- **Go-live README** is prepared now as `site/launch/README.md` and copied over `README.md` on go-live day (§3.5), so `README.md` never links to docs that are not public.
- **0.11.1 stays README-only**, as the spec says: `package.json` `homepage` (still the GitHub README) is not changed by this plan; the owner may fold it into that release.
- **VitePress 1.6.4, not 2.0 alpha**: the stable line, kept off the landing build's Vite 8 by listing `vite` in `site/package.json` (VitePress 1 resolves its own nested Vite 5).

---

### Task 1: VitePress scaffold, the hunk theme and the shared header

**Files:**

- Create: `site/docs/.vitepress/config.ts`, `site/docs/.vitepress/theme/index.ts`, `site/docs/.vitepress/theme/SiteBrand.vue`, `site/docs/.vitepress/theme/docs.css`, `site/docs/.vitepress/hunk-shiki.json`, `site/src/lib/docs-config.ts`, `site/docs/index.md` (front door stub: title, one paragraph, the three stack links as plain text until Task 5)
- Modify: `site/package.json` (devDependencies `vitepress` `1.6.4`, `vite` `^8.0.14`; script `"docs:dev": "vitepress dev docs"`; Task 3 prefixes it with the snippet run), `site/package-lock.json`, `site/scripts/build.mjs` (after the demo copy: `vitepress build docs`), `site/tsconfig.json` (include `docs/.vitepress/**/*.ts`), `.gitignore` (`/site/docs/.vitepress/cache/`, `/site/.cache/`), `site/README.md` (a "Docs" section: dev, build, where pages live)
- Test: `tests/unit/site/docs-config.test.ts`, `tests/unit/site/docs-pages.test.ts`, `tests/unit/site/header-mark.test.ts` (add one case), `tests/site/docs.spec.ts`

**Interfaces:**

- Consumes: `siteConfig(env): { siteUrl, base }` from `site/src/lib/site-config.ts`.
- Produces (in `site/src/lib/docs-config.ts`):
  - `export function docsBase(env: { SITE_URL?: string }): string` — `'/livelocale/docs/'` by default, `'/docs/'` for `https://livelocale.js.org/`.
  - `export function landingHref(docsBase: string): string` — strips the trailing `docs/`.
  - `export interface SidebarGroup { text: string; items: { text: string; link: string }[] }` and `export const SIDEBAR: SidebarGroup[]` — groups `Get started`, `Guides`, `How it works`, `Reference`, links as VitePress paths (`/start/nextjs`), in the URL-map order. Later tasks add their pages here.
  - `export const NAV = [{ text: 'GitHub', link: 'https://github.com/Araby99/livelocale' }, { text: 'Docs', link: '/' }]`.
  - `export const TITLE_TEMPLATE = ':title | livelocale docs'`.
  - `export function docsPageFiles(docsDir: string): string[]` — every `.md` under `site/docs/` except `.vitepress/`, as paths relative to it (`start/nextjs.md`).
- `config.ts`: `base: docsBase(process.env)`, `outDir` = absolute `site/dist/docs`, `cleanUrls: false`, `appearance: 'force-dark'`, `lang: 'en'`, `title: 'livelocale'`, `titleTemplate: TITLE_TEMPLATE`, `markdown.theme` = `hunk-shiki.json`, `themeConfig: { nav: NAV, sidebar: SIDEBAR, search: { provider: 'local' }, outline: [2, 3] }`, no `socialLinks`, no `editLink`, no `lastUpdated`; Vite alias `{ find: /^.*\/VPNavBarTitle\.vue$/, replacement: SiteBrand.vue }`.
- Every docs page has frontmatter `title` and `description` (50–160 characters, unique).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/site/docs-config.test.ts
// @vitest-environment node
import { docsBase, landingHref, SIDEBAR, docsPageFiles } from '../../../site/src/lib/docs-config';
it('puts the docs under the site base', () => {
  expect(docsBase({})).toBe('/livelocale/docs/');
  expect(docsBase({ SITE_URL: 'https://livelocale.js.org/' })).toBe('/docs/');
  expect(landingHref('/livelocale/docs/')).toBe('/livelocale/');
});
it('lists every docs page in the sidebar exactly once, and nothing else', () => {
  const linked = SIDEBAR.flatMap((g) => g.items.map((i) => i.link));
  const pages = docsPageFiles('site/docs').map((f) => '/' + f.replace(/(index)?\.md$/, ''));
  expect(new Set(linked).size).toBe(linked.length);
  expect([...linked].sort()).toEqual([...pages].sort());
  expect(SIDEBAR.map((g) => g.text)).toEqual([
    'Get started',
    'Guides',
    'How it works',
    'Reference',
  ]);
});

// tests/unit/site/docs-pages.test.ts
// @vitest-environment node
// reads each page's frontmatter with a small regex parser (no new package)
it('gives every docs page its own title and description', () => {
  /* unique, description 50–160 chars */
});
it('keeps the voice: no "PM", no hype words, no competitor names', () => {
  // for every page body: not /\bPM\b/, not /seamless|empower|revolutioni[sz]e|blazing|supercharge/i,
  // not /Tolgee|Locize|Lokalise|Crowdin/
});

// tests/unit/site/header-mark.test.ts (new case)
it('carries the landing header mark byte for byte in the docs header', () => {
  // the <svg …>…</svg> inside site/index.html's <header> equals the one in SiteBrand.vue
});

// tests/site/docs.spec.ts
test('serves every docs request under the /livelocale/ base', async ({ page }) => {
  // goto('docs/'), scrollThrough, open the search box: no response >= 400,
  // every request URL starts with http://localhost:4173/livelocale/ or data:
});
test('wears the landing page: Night, Paper, the same brand and nav', async ({ page }) => {
  // docs/: body background rgb(12, 13, 15), color rgb(232, 228, 217); h1 font-family starts
  // "Martian Mono"; a content link color rgb(79, 195, 220); inline code font-family starts "IBM Plex Mono";
  // .brand svg outerHTML equals the landing page's; nav link names ['GitHub', 'Docs'];
  // the brand link's href resolves to http://localhost:4173/livelocale/
});
test('colours code only from the palette', () => {
  // every color:#xxxxxx in site/dist/docs/**/*.html code blocks is one of
  // #E8E4D9 #8C887D #4FC3DC #6FD69A #FF5468 (case-insensitive)
});
test('finds the check reference with the offline search', async ({ page }) => {
  // Task 17 tags it @cross. Until Task 5 exists it searches "livelocale" and expects a result linking
  // docs/index.html; Task 5 changes the query to "hardcoded" and the target to reference/cli/check.html
});
test('has no horizontal scroll at 360 px on the docs front door', async ({ page }) => {
  /* ≤ 360 */
});
test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('renders the docs front door without JavaScript', async ({ page }) => {
    // h1 visible, sidebar groups visible on desktop, body text present
  });
});
test('reaches the docs controls by keyboard with a visible patch ring', async ({ page }) => {
  // Tab 12 times from the top of docs/: every focused element's outline is solid 2px rgb(255, 178, 36)
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/site/docs-config.test.ts tests/unit/site/docs-pages.test.ts tests/unit/site/header-mark.test.ts && npm run test:site -- docs.spec.ts`
Expected: FAIL with "Failed to load url ../../../site/src/lib/docs-config" (vitest) and 404 on `docs/` (Playwright).

- [ ] **Step 3: Install VitePress and Vite in `site/`, write `docs-config.ts`, `config.ts`, the theme and the stub front door; add the docs build to `build.mjs` after the demo copy, resolving the binary from `vitepress/package.json` like `VITE_BIN`.**

`docs.css` maps VitePress variables onto the hunk tokens (`--vp-c-bg` Night, `--vp-c-bg-soft`/`--vp-c-bg-alt` Surface, `--vp-c-divider` Rule, `--vp-c-text-1` Paper, `--vp-c-text-2` Comment, `--vp-c-brand-1` Hunk for links, `--vp-font-family-base`/`--vp-font-family-mono` from tokens), sets headings in Martian Mono, the active sidebar item as Surface fill with Paper text and an Edge border (the current-chapter-chip treatment, never an amber line), and the shared focus ring on every interactive element. `hunk-shiki.json` is a single dark Shiki theme whose token colours are only Paper, Comment, Hunk (keys, property names, paths), Exit 1 (`invalid`, deleted) and Exit 0; diff `+` lines get Wash rows and a Patch `+` square through `docs.css`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- docs.spec.ts smoke.spec.ts`
Expected: all PASS; `site/dist/docs/index.html` exists.

- [ ] **Step 5: Commit**

```bash
git add site/docs site/src/lib/docs-config.ts site/package.json site/package-lock.json site/scripts/build.mjs site/tsconfig.json site/README.md .gitignore tests/unit/site/docs-config.test.ts tests/unit/site/docs-pages.test.ts tests/unit/site/header-mark.test.ts tests/site/docs.spec.ts
git commit -m "feat(docs): scaffold the VitePress docs on the hunk theme with the landing header"
```

---

### Task 2: Docs media from the real product (`record-docs.mjs`, `DocShot`, `DocClip`)

**Files:**

- Create: `site/scripts/record-docs.mjs`, `site/scripts/capture-lib.mjs` (+ `.d.mts`), `site/scripts/docs/media.mjs` (+ `.d.mts`), `site/scripts/docs/webp-size.mjs` (+ `.d.mts`), `site/src/lib/clip.ts`, `site/docs/.vitepress/theme/DocShot.vue`, `site/docs/.vitepress/theme/DocClip.vue`, `site/media/docs/` (every file the script writes, committed), `site/scripts/docs/fixtures/change-link.txt` (written by the script)
- Modify: `site/docs/.vitepress/theme/index.ts` (register both components), `site/README.md` (a "Docs media" section: prerequisites `npm run build`, `npm ci --prefix playground`, `npm ci --prefix playground-vite`; one command `node site/scripts/record-docs.mjs`; pass names to re-shoot some)
- Test: `tests/unit/site/docs-media.test.ts`, `tests/unit/site/clip.test.ts`, `tests/site/docs-media.spec.ts`

**Interfaces:**

- `capture-lib.mjs`: `export function run(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<void>`; `export function serveDir(root: string, ports: number[]): Promise<{ server: import('node:http').Server; port: number }>`; `export async function packStage(opts: { base: string; exposeRepo: boolean; env?: NodeJS.ProcessEnv }): Promise<string>` (builds `site/stage` and packs it like `record-hero.mjs`'s `buildStage`, returns the dist path); `export async function snapshotFiles(paths: string[]): Promise<() => Promise<void>>` (returns a restore function that writes every file back byte for byte and removes files that did not exist).
- `media.mjs`:
  - `export const SHOTS: Record<ShotName, { app: 'next' | 'vite' | 'share'; locale?: 'ar'; theme?: 'light'; use: string }>` with exactly these names: `next-studio-open`, `next-alt-click`, `next-saved-file`, `vite-studio-open`, `vite-alt-click`, `vite-saved-file`, `share-open-link`, `share-alt-click`, `share-send-dialog`, `share-review-mode`, `studio-plural`, `studio-placeholder-warning`, `studio-arabic`, `studio-light`, `studio-keyboard`.
  - `export const CLIPS: Record<ClipName, { app: 'share'; seconds: number; use: string }>` with `alt-click-edit` (≤ 6 s), `send-link` (≤ 6 s), `arabic-switch` (≤ 6 s).
  - `export interface DocsMedia { shots: Record<string, { file: string; width: number; height: number }>; clips: Record<string, { webm: string; mp4: string; poster: string; width: number; height: number; seconds: number }> }`; the manifest is `site/media/docs/manifest.json`.
  - `export function provenance(name: string, what: string): { prompt: string; createdAt: string }` — prompt starts `SOURCED, not generated.` and names `site/scripts/record-docs.mjs` and the app it filmed.
- `webp-size.mjs`: `export function webpSize(buf: Uint8Array): { width: number; height: number }` (VP8, VP8L and VP8X headers; throws `Not a WebP` otherwise).
- `clip.ts`: `export function shouldPlay(ratio: number, reduced: boolean, pausedByUser: boolean): boolean`; `export function startClip(figure: HTMLElement, win: Window): () => void` — the video is `muted loop playsinline preload="none"` with `poster` and no `autoplay`; sources attach when the figure first nears the viewport (IntersectionObserver, `rootMargin: '200px'`); plays when ≥ 50 % visible; a `<button type="button" class="clip-toggle">` (≥ 44×44 px) is labelled "Pause clip" / "Play clip"; under reduced motion it never plays by itself and the button reads "Play clip"; a clip the reader paused stays paused; returns a disposer. Used by `DocClip.vue` and by the landing page (Task 13).
- `DocShot.vue`: props `name: ShotName`, `alt: string` (required, non-empty), `caption?: string`; renders `<figure class="doc-shot"><img src width height alt loading="lazy" decoding="async"></figure>` with a 1px Rule border at 10px radius; an unknown name throws at build.
- `DocClip.vue`: props `name: ClipName`, `label: string`, `caption?: string`; renders the figure markup `startClip` expects (`<source>` webm then mp4 as `data-src` until attached).
- `record-docs.mjs [names…]`: checks prerequisites (built CLI, playground installs) and exits 1 with the missing command; snapshots `playground/locales/**` and `playground-vite/locales/**` with `snapshotFiles` and restores them in `finally`; Chromium 1440×900, DPR 2, `colorScheme: 'dark'` unless the entry says `light`, `locale: 'en-US'` or `'ar'`, `reducedMotion: 'no-preference'`; shots → WebP q82 at 1200 px wide via ffmpeg-static; clips → `recordVideo` at 1280×720, then ffmpeg to `<name>.webm` (VP9) and `<name>.mp4` (H.264, `+faststart`, no audio) and `<name>.poster.webp` from the last frame; writes each raster's sidecar and `manifest.json`; saves the change link of `share-send-dialog` to `site/scripts/docs/fixtures/change-link.txt`. No cursor overlay; everything on screen is the product.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/site/docs-media.test.ts
// @vitest-environment node
import { SHOTS, CLIPS, provenance } from '../../../site/scripts/docs/media.mjs';
import { webpSize } from '../../../site/scripts/docs/webp-size.mjs';
it('ships every shot and clip in the manifest, at the size the manifest says', () => {
  // manifest keys === SHOTS/CLIPS keys; each file exists; webpSize(file) equals manifest width/height;
  // each clip has webm, mp4 (both 10 KB – 1.5 MB) and a poster
});
it('gives every raster its provenance', () => {
  // each .webp has a .json sidecar whose prompt starts 'SOURCED, not generated.' and contains
  // 'site/scripts/record-docs.mjs'
  expect(provenance('x', 'y').prompt).toMatch(/^SOURCED, not generated\./);
});
it('uses only media that exist, with alt text', () => {
  // every <DocShot name="…" alt="…"> and <DocClip name="…" label="…"> in site/docs/**/*.md names a
  // manifest entry and has a non-empty alt/label
});
it('reads WebP sizes and rejects other files', () => {
  expect(() => webpSize(new TextEncoder().encode('RIFF....WEBX'))).toThrow('Not a WebP');
});

// tests/unit/site/clip.test.ts
// @vitest-environment node
import { shouldPlay } from '../../../site/src/lib/clip';
it('plays only when half visible, motion is allowed and the reader has not paused it', () =>
  expect([
    shouldPlay(0.6, false, false),
    shouldPlay(0.4, false, false),
    shouldPlay(1, true, false),
    shouldPlay(1, false, true),
  ]).toEqual([true, false, false, false]));

// tests/site/docs-media.spec.ts — runs on docs/index.html, where Step 3 puts one DocShot and one
// DocClip; Task 9 moves its target to docs/guides/studio.html (clip arabic-switch) before Task 10
// rewrites the front door
test('loads no clip before it nears the screen', async ({ page }) => {
  /* no .webm/.mp4 request at load */
});
test('plays a clip on screen and pauses it from the keyboard', async ({ page }) => {
  // scroll the clip into view; poll !paused; focus "Pause clip", Enter; poll paused; "Play clip" visible
});
test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('keeps a clip on its poster under reduced motion', async ({ page }) => {
    // scrolled into view, the video stays paused with its poster; button reads "Play clip"
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/site/docs-media.test.ts tests/unit/site/clip.test.ts`
Expected: FAIL with "Failed to load url ../../../site/scripts/docs/media.mjs".

- [ ] **Step 3: Implement `capture-lib.mjs`, `media.mjs`, `webp-size.mjs`, `clip.ts`, the two components and `record-docs.mjs`; put `<DocShot name="next-studio-open" …>` and `<DocClip name="alt-click-edit" …>` on the front door stub.**

- [ ] **Step 4: Record**

Run: `npm run build && npm ci --prefix playground && npm ci --prefix playground-vite && node site/scripts/record-docs.mjs && git status --porcelain playground playground-vite site/stage`
Expected: one line per shot and clip with its size; the `git status` prints nothing (the locale files were restored). Open three shots with the Read tool and confirm each shows the step it is named for.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- docs-media.spec.ts docs.spec.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add site/scripts/record-docs.mjs site/scripts/capture-lib.mjs site/scripts/capture-lib.d.mts site/scripts/docs site/src/lib/clip.ts site/docs site/media/docs site/README.md tests/unit/site/docs-media.test.ts tests/unit/site/clip.test.ts tests/site/docs-media.spec.ts
git commit -m "feat(docs): record docs shots and clips from the real Studio with one command"
```

---

### Task 3: Real CLI output in the docs (`cli` blocks) and the help parser

**Files:**

- Create: `site/scripts/docs/cli-snippets.mjs` (+ `.d.mts`), `site/scripts/docs/terminal.mjs` (+ `.d.mts`), `site/scripts/docs/cli-help.mjs` (+ `.d.mts`), `site/scripts/docs/fixtures/next-app/` (minimal App Router project: `package.json` with `next`, `react`, `livelocale`; `app/layout.tsx` with `<LiveLocaleProvider />`; `app/page.tsx` using a wrapped `t`; `locales/en.json`, `locales/ar.json`), `site/scripts/docs/fixtures/vite-app/` (`package.json`, `vite.config.ts` with `liveLocaleVite`, `src/main.tsx`, `locales/{en,ar}.json`), `site/scripts/docs/fixtures/check-missing/` (`locales/en.json` with a key `ar.json` lacks), `site/docs/.vitepress/cli-fence.ts`, `site/src/styles/terminal.css` (the `.c-*` classes moved out of `sections.css`)
- Modify: `site/src/styles/sections.css` (remove the moved `.c-*` rules), `site/src/main.ts` (import `terminal.css`), `site/docs/.vitepress/config.ts` (`markdown.config` registers the fence), `site/docs/.vitepress/theme/index.ts` (import `terminal.css`), `site/scripts/build.mjs` (run `writeCliSnippets()` before the docs build), `site/package.json` (`docs:dev` runs the snippets first)
- Test: `tests/unit/site/cli-snippets.test.ts`, `tests/unit/site/cli-help.test.ts`

**Interfaces:**

- Consumes: `renderLine(line: string): string` from `site/scripts/check-excerpt.mjs`.
- `cli-snippets.mjs`:
  - `export interface SnippetSpec { fixture: string | null; files?: Record<string, string>; git?: { remote: string }; setup?: string[][]; args: string[]; expect: number }` — `fixture` is a folder under `site/scripts/docs/fixtures/`, `'site/sample'`, `'site/stage'`, or `null` (empty temp dir); `files` copies extra files into the copy (destination → repo path); `setup` runs first with its output discarded; `git.remote` runs `git init -b main` and `git remote add origin <remote>` in the copy.
  - `export const SNIPPETS: Record<string, SnippetSpec>` with exactly: `help` (`null`, `['--help']`, 0), `init-next` (`next-app`, `['init']`, 0), `doctor-next` (`next-app`, setup `[['init']]`, `['doctor']`, 0), `init-share-vite` (`vite-app`, git remote `https://github.com/Araby99/tidewell.git`, `['init', '--share']`, 0), `check-clean` (`vite-app`, `['check']`, 0), `check-missing` (`check-missing`, `['check']`, 1), `check-hardcoded` (`site/sample`, `['check', '--hardcoded']`, 1), `apply-dry-run` (`site/stage`, files `{ 'change-link.txt': 'site/scripts/docs/fixtures/change-link.txt' }` (written by Task 2), `['apply', 'change-link.txt', '--dry-run', '--locales', 'locales']`, 0).
  - `export function runSnippet(name: string, spec: SnippetSpec, cli: string): { command: string; output: string; status: number }` — copies the fixture to a temp dir, runs `node <cli> …args` there, replaces the temp path with `my-app` and backslashes with `/`, throws `snippet <name> exited <n>, expected <m>` on a status mismatch; `command` is `npx livelocale ${args.join(' ')}`.
  - `export function writeCliSnippets(outDir?: string): void` — writes `<outDir>/<name>.json` (default `site/.cache/docs-cli/`).
- `terminal.mjs`: `export function renderTerminal(s: { command: string; output: string; status: number }): string` — `$` prompt line in `c-prompt`, each output line through `renderLine` (help output unchanged in Comment), `# exit` then the status in `c-pass` (0) or `c-fail`.
- `cli-fence.ts`: `export function cliFence(md: MarkdownIt, opts: { dir: string }): void` — a fence whose info is `cli <name>` renders `<pre class="code terminal"><code>…</code></pre>` from `<dir>/<name>.json`; an unknown name throws `no CLI snippet <name>: run node site/scripts/docs/cli-snippets.mjs`.
- `cli-help.mjs`: `export function parseHelp(text: string): Record<string, string[]>` — command name (from the `Commands:` list) → its flags in help order (from `Options for <command>:`), every `--flag` token of the left column, excluding the global `-h, --help`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/site/cli-help.test.ts
// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { parseHelp } from '../../../site/scripts/docs/cli-help.mjs';
const help = spawnSync(process.execPath, ['dist/codemod/index.js', '--help'], {
  encoding: 'utf8',
}).stdout;
it('reads every command and its flags from the real help', () => {
  const cli = parseHelp(help);
  expect(Object.keys(cli)).toEqual([
    'migrate',
    'init',
    'studio',
    'doctor',
    'check',
    'pack',
    'build',
    'apply',
  ]);
  expect(cli.check).toEqual([
    '--dir',
    '--locales',
    '--source',
    '--no-unused',
    '--strict',
    '--hardcoded',
    '--allow',
    '--json',
  ]);
  expect(cli.build).toEqual(['--preview', '--out']);
  expect(cli.init).toContain('--branches');
  expect(Object.values(cli).flat()).not.toContain('--help');
});

// tests/unit/site/cli-snippets.test.ts
// @vitest-environment node
import { SNIPPETS, runSnippet } from '../../../site/scripts/docs/cli-snippets.mjs';
import { renderTerminal } from '../../../site/scripts/docs/terminal.mjs';
const CLI = 'dist/codemod/index.js';
it.each(Object.keys(SNIPPETS))('runs %s with the real CLI and the expected exit code', (name) => {
  const out = runSnippet(name, SNIPPETS[name], CLI);
  expect(out.status).toBe(SNIPPETS[name].expect);
  expect(out.output).not.toMatch(/[A-Z]:\\|\/tmp\/|AppData/); // no machine paths
});
it('fails the build when a snippet exits with another code', () => {
  expect(() =>
    runSnippet('check-missing', { ...SNIPPETS['check-missing'], expect: 0 }, CLI)
  ).toThrow('snippet check-missing exited 1, expected 0');
});
it('colours a failing run in Exit 1 and a passing one in Exit 0', () => {
  expect(
    renderTerminal({ command: 'npx livelocale check', output: '✖ 1 missing key', status: 1 })
  ).toMatch(/c-prompt[\s\S]*c-fail[\s\S]*# exit<\/span> <span class="c-fail">1/);
  expect(renderTerminal({ command: 'npx livelocale check', output: '', status: 0 })).toContain(
    '<span class="c-pass">0</span>'
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run build && npx vitest run tests/unit/site/cli-help.test.ts tests/unit/site/cli-snippets.test.ts`
Expected: FAIL with "Failed to load url ../../../site/scripts/docs/cli-help.mjs".

- [ ] **Step 3: Write the fixtures and the three modules, the fence, move the `.c-*` rules into `terminal.css`; put a `cli check-hardcoded` fence on the front door stub.** If a fixture's real exit code differs from the spec above, fix the fixture to be a correct project of its kind; if 0.11.0 itself behaves otherwise, use its real code in `SNIPPETS` and say so in the task report.

- [ ] **Step 4: Run the tests and the landing suite (the CI excerpt must look unchanged)**

Run: `npx vitest run tests/unit/site && npm run test:site -- static.spec.ts docs.spec.ts`
Expected: all PASS; `site/.cache/docs-cli/` holds 8 JSON files.

- [ ] **Step 5: Commit**

```bash
git add site/scripts/docs site/docs site/src/styles site/src/main.ts site/scripts/build.mjs site/package.json tests/unit/site/cli-help.test.ts tests/unit/site/cli-snippets.test.ts
git commit -m "feat(docs): show real CLI output, run on fixtures when the docs are built"
```

---

### Task 4: The link guard

**Files:**

- Create: `site/scripts/docs/links.mjs` (+ `.d.mts`), `tests/site/links.spec.ts`
- Test: `tests/unit/site/links.test.ts`, `tests/site/links.spec.ts`

**Interfaces:**

- `export const ALLOWED_EXTERNAL: RegExp[]` — the five Global Constraints prefixes, each anchored and ending at `$`, `/`, `#` or `?`.
- `export function extractLinks(html: string): string[]` — every `<a href>` value, entities decoded.
- `export function extractIds(html: string): Set<string>` — every `id` value.
- `export type LinkKind = { kind: 'internal'; file: string; hash: string } | { kind: 'external'; url: string } | { kind: 'skip' }`; `export function classifyLink(href: string, pageUrl: string, base: string, distDir: string): LinkKind` — `mailto:` and `javascript:` → `skip`; same origin under `base` → `internal` with `file` the path in `distDir` (`…/` → `…/index.html`); anything else → `external`.
- `tests/site/links.spec.ts` reads `site/dist/index.html` and every `site/dist/docs/**/*.html` from disk (the suite's web server has built them).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/site/links.test.ts
// @vitest-environment node
import { classifyLink, extractLinks, ALLOWED_EXTERNAL } from '../../../site/scripts/docs/links.mjs';
const page = 'http://localhost:4173/livelocale/docs/start/nextjs.html';
it('resolves relative, base-absolute and anchor links into the built folder', () => {
  expect(
    classifyLink('../guides/ci-check.html#opt-outs', page, '/livelocale/', 'site/dist')
  ).toEqual({ kind: 'internal', file: 'site/dist/docs/guides/ci-check.html', hash: 'opt-outs' });
  expect(classifyLink('/livelocale/', page, '/livelocale/', 'site/dist')).toEqual({
    kind: 'internal',
    file: 'site/dist/index.html',
    hash: '',
  });
});
it('allows only the repo, npm, the Tidewell demo and js.org', () => {
  const ok = (u: string) => ALLOWED_EXTERNAL.some((r) => r.test(u));
  expect(ok('https://github.com/Araby99/livelocale/blob/main/LICENSE')).toBe(true);
  expect(ok('https://github.com/Araby99/tidewell/pull/2')).toBe(true);
  expect(ok('https://www.npmjs.com/package/livelocale')).toBe(true);
  expect(ok('https://github.com/Araby99/livelocale-evil')).toBe(false);
  expect(ok('https://pnpm.io/cli/run')).toBe(false);
});
it('decodes entities in hrefs', () =>
  expect(extractLinks('<a href="a.html#x&amp;y">')).toEqual(['a.html#x&y']));

// tests/site/links.spec.ts
test('finds no broken link or anchor in the built site', () => {
  // for every page: every internal link's file exists and, with a hash, extractIds(file) has it;
  // the failures list (`<page> -> <href>`) is []
});
test('links nowhere outside the allowed hosts', () => {
  /* every external link matches ALLOWED_EXTERNAL */
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/site/links.test.ts`
Expected: FAIL with "Failed to load url ../../../site/scripts/docs/links.mjs".

- [ ] **Step 3: Implement `links.mjs` and the spec.**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/site/links.test.ts && npm run test:site -- links.spec.ts`
Expected: PASS. If the landing page already links outside the allowlist, list it in the task report and stop (do not widen the list).

- [ ] **Step 5: Commit**

```bash
git add site/scripts/docs/links.mjs site/scripts/docs/links.d.mts tests/unit/site/links.test.ts tests/site/links.spec.ts
git commit -m "test(docs): fail on broken docs links, missing anchors and links off the allowed hosts"
```

---

## Content tasks (5–11): how to write and verify

Each content task writes pages for learning (task order, one job per page, short), not the README split into pages (spec §7). Sources are the README sections named per page (line numbers are for `README.md` at 0.11.0) and the code under `src/`. For every factual sentence the implementer either finds it in the named README section, reads the code path that does it, or runs the command; claims that cannot be confirmed are left out. The task report lists each claim with its source. Every page: frontmatter `title` and `description`; added to `SIDEBAR`; links between pages relative; terminal output only through `cli` fences (add a `SNIPPETS` entry in Task 3's module when a page needs another real run); visuals only through `DocShot`/`DocClip` (add an entry to `SHOTS`/`CLIPS` and re-run `node site/scripts/record-docs.mjs <name>` when a page needs another). README links to hosts outside the allowlist (yarn, pnpm, GitHub docs) become plain text.

**Order and links.** The content tasks run Reference, How it works, Guides, then Get started, so that every page links only to pages (and `##` anchors) that already exist; the link guard (Task 4) runs in every content task. A page written later may add a link into an earlier page in its own task. The Get started task replaces the front-door stub entirely, including the stub's test `DocShot`, `DocClip` and `cli` fence.

Two facts to settle before writing, from code: whether `livelocale` installs as a dependency or a devDependency for each stack (the README's Quick Setup says `npm install livelocale`, the landing page says "One dev dependency"; `LiveLocaleProvider` is imported by app code), and what `init` prints in a fresh Next.js project (the `init-next` snippet). If the landing copy is wrong, Task 12 fixes it.

---

### Task 5: Reference: every CLI command and flag

**Files:**

- Create: `site/docs/reference/cli/index.md` (all commands, one line each, and the `cli help` fence), and `init.md`, `studio.md`, `doctor.md`, `check.md`, `pack.md`, `build.md`, `apply.md`, `migrate.md` in `site/docs/reference/cli/`
- Modify: `site/src/lib/docs-config.ts`, `tests/site/docs.spec.ts` (search case now queries `hardcoded`)
- Test: `tests/unit/site/docs-cli-reference.test.ts`

**Interfaces:**

- Consumes: `parseHelp` (Task 3).
- Each command page: `# <command>`, a synopsis `bash` fence, then one `### \`--flag\``heading per flag in help order, each with its argument, default and one or two sentences, from README 203–509 and the command's code in`src/codemod/`. `init.md`documents`init`and`init --share`(with the stack table, which scrolls inside its box on phones).`apply.md`includes`--github-event` as the workflow uses it.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/site/docs-cli-reference.test.ts
// @vitest-environment node
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { parseHelp } from '../../../site/scripts/docs/cli-help.mjs';
const cli = parseHelp(
  spawnSync(process.execPath, ['dist/codemod/index.js', '--help'], { encoding: 'utf8' }).stdout
);
it('documents every command and flag the CLI prints', () => {
  const missing: string[] = [];
  for (const [command, flags] of Object.entries(cli)) {
    const file = `site/docs/reference/cli/${command}.md`;
    if (!fs.existsSync(file)) {
      missing.push(command);
      continue;
    }
    const md = fs.readFileSync(file, 'utf8');
    for (const flag of flags)
      if (!md.includes(`### \`${flag}\``)) missing.push(`${command} ${flag}`);
  }
  expect(missing).toEqual([]);
});
it('documents no flag the CLI does not have', () => {
  // every "### `--x`" heading in reference/cli/<command>.md is in cli[command]
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/site/docs-cli-reference.test.ts`
Expected: FAIL listing all eight commands as missing.

- [ ] **Step 3: Verify each flag's default and behaviour in its command's code, then write the nine pages.**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- docs.spec.ts links.spec.ts`
Expected: all PASS, including `finds the check reference with the offline search`.

- [ ] **Step 5: Commit**

```bash
git add site/docs site/src/lib/docs-config.ts tests/unit/site/docs-cli-reference.test.ts tests/site/docs.spec.ts
git commit -m "docs(site): add a reference page for every CLI command and flag"
```

---

### Task 6: Reference: configuration, environment variables and the changelog

**Files:**

- Create: `site/docs/reference/configuration.md` (`createLiveLocaleHandler` options, `liveLocaleVite` options, `createTranslations`, `wrapTranslationEngine`, `LiveLocaleProvider`, `unwrap`, `sanitizeZeroWidth`, `livelocale.allow`; each option's name, type and default read from the exported types in `src/server/`, `src/vite/`, `src/client/`, `src/react/`), `site/docs/reference/environment.md`, `site/docs/reference/changelog.md`, `site/docs/.vitepress/changelog.ts`
- Modify: `site/docs/.vitepress/config.ts` (register the changelog transform), `site/src/lib/docs-config.ts`
- Test: `tests/unit/site/docs-reference.test.ts`

**Interfaces:**

- `environment.md` documents exactly the variables livelocale reads: `LIVELOCALE` (`off`, `preview`, `force`), `NEXT_PUBLIC_LIVELOCALE`, `LIVELOCALE_TOKEN`, `LIVELOCALE_ALLOWED_ORIGINS`, `NODE_ENV`, and, in one table, the CI and host variables `pack`/`apply`/the platform guard read (from `grep -rhoE "env\.[A-Z][A-Z_]+" src`).
- `changelog.ts`: `export function changelogBody(md: string): string` — the text from the first `## [` heading on; `changelog.md` is `<!-- @changelog -->`, replaced at build by `changelogBody(CHANGELOG.md)` through a markdown-it core rule or VitePress `markdown.config`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/site/docs-reference.test.ts
// @vitest-environment node
import { changelogBody } from '../../../site/docs/.vitepress/changelog';
it('documents every LIVELOCALE variable the code reads', () => {
  // the set of /'(NEXT_PUBLIC_)?LIVELOCALE[A-Z_]*'/ string literals and env.LIVELOCALE* reads in src/
  // is a subset of the `VAR` names in environment.md
});
it('renders the changelog from the first release, without the preamble links', () => {
  const body = changelogBody(fs.readFileSync('CHANGELOG.md', 'utf8'));
  expect(body.startsWith('## [0.11.0]')).toBe(true);
  expect(body).not.toContain('keepachangelog.com');
});
it('documents every liveLocaleVite option', () => {
  // the keys of the plugin's exported options interface in src/vite/ each appear as `key` in configuration.md
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/site/docs-reference.test.ts`
Expected: FAIL with "Failed to load url ../../../site/docs/.vitepress/changelog".

- [ ] **Step 3: Verify every option and variable in code, then write the pages and the transform.**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- links.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/docs tests/unit/site/docs-reference.test.ts site/src/lib/docs-config.ts
git commit -m "docs(site): add the configuration, environment and changelog reference"
```

---

### Task 7: How it works

**Files:**

- Create: `site/docs/how-it-works/watermarking.md` (README 21–30; `src/core/` encoder and the client scanner), `safety-switches.md` (README 950–962; the platform guard's list as the code has it), `watermark-pitfalls.md` (README 963–979), `security.md` (README 823–837 plus the dev mutation API's origin and path checks from `src/server/`), `risks-and-limits.md` (README 838–857, 944–949)
- Modify: `site/src/lib/docs-config.ts`
- Test: `tests/unit/site/docs-how.test.ts`

**Interfaces:**

- `security.md` has `## Share links` and `## The dev server` headings; `safety-switches.md` has `## Kill switch` and `## Hosting platform guard` (the landing FAQ links to these anchors in Task 14; Task 10's "What next" links to `guides/studio.html#arabic-and-right-to-left`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/site/docs-how.test.ts
// @vitest-environment node
it('lists the deployed platforms the guard detects, as the code does', () => {
  // read the platform list from the server guard in src/ (the env names it checks) and expect
  // safety-switches.md to name each platform; and LIVELOCALE=off, NEXT_PUBLIC_LIVELOCALE=off, LIVELOCALE=force
});
it('names the three zero-width characters the watermark uses', () => {
  // watermarking.md contains U+200B, U+200C, U+200D
});
it('keeps the honest risks honest', () => {
  // risks-and-limits.md contains "Desktop only" and "public" (issues in public repos)
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/site/docs-how.test.ts`
Expected: FAIL with "ENOENT … site/docs/how-it-works/safety-switches.md".

- [ ] **Step 3: Verify the facts against the code paths named above, then write the five pages.**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- links.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/docs site/src/lib/docs-config.ts tests/unit/site/docs-how.test.ts
git commit -m "docs(site): explain watermarking, the safety switches, security and the limits"
```

---

### Task 8: Guides: share links and the CI check

**Files:**

- Create: `site/docs/guides/share-links.md`, `site/docs/guides/ci-check.md`
- Modify: `site/src/lib/docs-config.ts`
- Test: `tests/unit/site/docs-guides.test.ts`

**Interfaces:**

- `share-links.md` headings (anchors the landing FAQ links to): `## Set up`, `## The one-checkbox setting`, `## What the person fixing text does`, `## What the developer gets`, `## Other git hosts`, `## Hosting notes`. Sources: README 213–243, 616–857 (the workflow YAML is shown from the README, which prints what `init --share` writes; confirm against `src/codemod/init-share.ts`).
- `ci-check.md` headings: `## Run the check`, `## Find hardcoded text`, `## The three kinds`, `## Strict mode`, `## Opt-outs`, `## GitHub Actions`, `## What it does not see`. Sources: README 279–392, `src/codemod/check.ts`, `src/codemod/hardcoded/`, snippets `check-missing`, `check-hardcoded`, `check-clean`. The three kinds are the three `check --hardcoded` finding types in 0.11.0 (CHANGELOG 0.11.0: JSX text never translated, translations identical to the source, translations in the wrong script).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/site/docs-guides.test.ts
// @vitest-environment node
it.each([
  [
    'guides/share-links.md',
    [
      'Set up',
      'The one-checkbox setting',
      'What the person fixing text does',
      'What the developer gets',
      'Other git hosts',
      'Hosting notes',
    ],
  ],
  [
    'guides/ci-check.md',
    [
      'Run the check',
      'Find hardcoded text',
      'The three kinds',
      'Strict mode',
      'Opt-outs',
      'GitHub Actions',
      'What it does not see',
    ],
  ],
])('%s covers its sections in order', (file, headings) => {
  /* ## headings in this order */
});
it('names every opt-out the check accepts', () => {
  // ci-check.md contains livelocale-ignore-next-line, livelocale-ignore-file, --allow, livelocale.allow, --strict
});
```

Task 9 adds its four pages to the first `it.each`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/site/docs-guides.test.ts`
Expected: FAIL with "ENOENT … site/docs/guides/share-links.md".

- [ ] **Step 3: Verify the facts, then write both pages.**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- links.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/docs site/src/lib/docs-config.ts tests/unit/site/docs-guides.test.ts
git commit -m "docs(site): add the share links and CI check guides"
```

---

### Task 9: Guides: the Studio, preview mode, teams, migrating

**Files:**

- Create: `site/docs/guides/studio.md`, `site/docs/guides/preview-mode.md`, `site/docs/guides/teams.md`, `site/docs/guides/migrate.md`
- Modify: `site/src/lib/docs-config.ts`, `tests/unit/site/docs-guides.test.ts`, `tests/site/docs-media.spec.ts` (target `docs/guides/studio.html` and its `arabic-switch` clip instead of the front door)

**Interfaces:**

- `studio.md` headings: `## Edit`, `## Review and commit`, `## Plural forms`, `## Placeholder safety`, `## Light and dark`, `## Arabic and right to left`, `## Keyboard`. Shots `studio-*`, `next-saved-file`; clip `arabic-switch`. Sources: README 166–190, 558–615, CHANGELOG 0.11.0 and 0.10.1, `src/studio/` (keyboard shortcuts as the code binds them).
- `preview-mode.md`: README 858–949. `teams.md`: README 980–1019. `migrate.md`: README 1020–1039.

- [ ] **Step 1: Add the four pages and their headings to `docs-guides.test.ts`; run to verify it fails**

Run: `npx vitest run tests/unit/site/docs-guides.test.ts`
Expected: FAIL with "ENOENT … site/docs/guides/studio.md".

- [ ] **Step 2: Verify the facts, then write the four pages.**

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- links.spec.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add site/docs site/src/lib/docs-config.ts tests/unit/site/docs-guides.test.ts
git commit -m "docs(site): add the Studio, preview mode, teams and migration guides"
```

---

### Task 10: Get started: the front door and Next.js

**Files:**

- Modify: `site/docs/index.md` (replace the stub), `site/src/lib/docs-config.ts` (`SIDEBAR` Get started group)
- Create: `site/docs/start/nextjs.md`, `site/docs/.vitepress/theme/StackPicker.vue` (three link cards: Next.js (App Router), Vite + React, Any static host (share links); plain links without JavaScript)
- Test: `tests/unit/site/docs-get-started.test.ts`, `tests/site/docs.spec.ts` (one case)

**Interfaces:**

- Consumes: `DocShot`, `DocClip` (Task 2), `cli` fences `init-next`, `doctor-next` (Task 3), `SIDEBAR` (Task 1).
- Page shape the test enforces on every `start/*.md`: each step is an `## N. <verb phrase>` heading; under it the action (commands in `bash` fences, code edits in `tsx`/`ts` fences), then one expected result (a `DocShot`, a `DocClip` or a `cli` fence), then a `::: details Didn't work?` container that mentions `npx livelocale doctor` and the common fixes for that step; the page ends with `## What next` linking `../guides/share-links.html`, `../guides/ci-check.html` and `../guides/studio.html#arabic-and-right-to-left`.
- Next.js steps, in order (README 55–200 and `src/codemod/index.ts` `init`): install; mount `LiveLocaleProvider`; `npx livelocale init`; wrap translations (`createTranslations` for Server Components, `wrapTranslationEngine` for react-i18next/next-intl hooks, and `npx livelocale migrate` for existing react-i18next calls); run `next dev` and `npx livelocale studio`; Alt+Click and fix (`next-alt-click`); see the file change (`next-saved-file`, then `git diff locales/` in prose).
- Front door: one-sentence promise, `StackPicker`, the three "What next" links.

- [ ] **Step 1: Write the failing tests**

````ts
// tests/unit/site/docs-get-started.test.ts
// @vitest-environment node
it.each(['start/nextjs.md'])('%s shows what "it worked" looks like after every step', (file) => {
  // split on /^## \d+\. /m; for each step: has (<DocShot|<DocClip|```cli ) and a
  // '::: details Didn\'t work?' block containing 'npx livelocale doctor'
});
it.each(['start/nextjs.md'])('%s ends with the three next steps', (file) => {
  /* the three hrefs */
});
it('opens the docs on the stack picker, not an overview', () => {
  // index.md contains <StackPicker and the links start/nextjs.html, start/vite.html, start/static-host.html
});

// tests/site/docs.spec.ts (new case)
test('picks a stack from the front door', async ({ page }) => {
  // docs/: click "Next.js (App Router)"; URL ends docs/start/nextjs.html; h1 visible
});
````

Task 11 adds `start/vite.md` and `start/static-host.md` to both `it.each` lists.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/site/docs-get-started.test.ts`
Expected: FAIL with "ENOENT … site/docs/start/nextjs.md".

- [ ] **Step 3: Verify the facts (see "Content tasks"), then write the two pages and `StackPicker.vue`.** Sources: README 21–200, 963–1040 (common fixes), `src/codemod/index.ts`, `src/codemod/doctor.ts` (what each doctor check prints), snippets `init-next`, `doctor-next`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- docs.spec.ts links.spec.ts docs-media.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/docs site/src/lib/docs-config.ts tests/unit/site/docs-get-started.test.ts tests/site/docs.spec.ts
git commit -m "docs(site): add the getting-started front door and the Next.js path"
```

---

### Task 11: Get started: Vite + React and any static host

**Files:**

- Create: `site/docs/start/vite.md`, `site/docs/start/static-host.md`
- Modify: `site/src/lib/docs-config.ts`, `tests/unit/site/docs-get-started.test.ts` (add both files to the `it.each` lists)

**Interfaces:**

- Consumes: Task 10's page shape; shots `vite-*`, `share-*`; clip `alt-click-edit`; snippets `init-share-vite`, `check-clean`.
- Vite steps (README 510–557, `src/vite/`): install; add `liveLocaleVite({ localesPath })` to `vite.config.ts`; mount `LiveLocaleProvider`; wrap translations; run `vite` and `npx livelocale studio --app http://localhost:5173`; Alt+Click and fix; see the file change.
- Static host steps (README 213–243, 616–720, 804–822): `npx livelocale init --share` (`init-share-vite`); commit and push the workflow; tick the one checkbox; deploy; open the share link (`share-open-link`); the person fixing text Alt+Clicks, fixes, Sends (`send-link` clip); the developer gets the pull request (`share-review-mode`). "Didn't work?" points to `npx livelocale doctor --app <url>` (README 255–278).

- [ ] **Step 1: Add both files to the tests; run them to verify they fail**

Run: `npx vitest run tests/unit/site/docs-get-started.test.ts`
Expected: FAIL with "ENOENT … site/docs/start/vite.md".

- [ ] **Step 2: Verify the facts, then write both pages.**

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/unit/site && npm run test:site -- links.spec.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add site/docs site/src/lib/docs-config.ts tests/unit/site/docs-get-started.test.ts
git commit -m "docs(site): add the Vite and static-host getting-started paths"
```

---

### Task 12: Docs links on the landing page

**Files:**

- Modify: `site/index.html` (header "Docs" → `docs/`; developer close "Read the README" → "Read the docs" `docs/`; fixer close: `init --share` sentence links `docs/start/static-host.html`; footer gains "Docs" `docs/` before "MIT licence"; any copy the content tasks' install-command fact check found wrong), `tests/site/static.spec.ts`
- Test: `tests/site/landing-docs.spec.ts`

**Interfaces:**

- Consumes: the docs URL map. No link on the landing page points at `github.com/Araby99/livelocale#readme` any more.

- [ ] **Step 1: Write the failing test**

```ts
// tests/site/landing-docs.spec.ts
test('sends every Docs link to the docs, not the README', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('a[href*="#readme"]')).toHaveCount(0);
  await expect(page.locator('.site-nav').getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'docs/'
  );
  await expect(page.locator('.site-footer').getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'docs/'
  );
  await page.locator('.site-nav').getByRole('link', { name: 'Docs' }).click();
  await expect(page).toHaveURL(/\/livelocale\/docs\/$/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:site -- landing-docs.spec.ts`
Expected: FAIL: `a[href*="#readme"]` count is 2, expected 0.

- [ ] **Step 3: Change the links.** The keyboard test in `static.spec.ts` counts links itself, so it needs no edit.

- [ ] **Step 4: Run the tests**

Run: `npm run test:site -- landing-docs.spec.ts static.spec.ts links.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/index.html tests/site/landing-docs.spec.ts tests/site/static.spec.ts
git commit -m "feat(site): point the landing page's Docs links at the docs"
```

---

### Task 13: Landing: "Arabic, right to left, done properly"

**Files:**

- Modify: `site/index.html` (new `<section class="col arabic" id="arabic" aria-labelledby="arabic-title">` after `</div>` of `.stories`, before the "Works where you already are" section), `site/src/main.ts` (import the clip's `?url` sources and poster from `site/media/docs/`, call `startClip`), `site/src/styles/sections.css`, `tests/site/static.spec.ts` (section order)
- Test: `tests/site/landing-sections.spec.ts`

**Interfaces:**

- Consumes: `startClip(figure, win)` (Task 2), clip `arabic-switch` and its poster.
- Markup: `h2#arabic-title` "Arabic, right to left, done properly"; one or two sentences: the Studio itself speaks Arabic and mirrors, and the site under it flips (CHANGELOG 0.11.0; confirm in `src/studio/`); one `lang="ar" dir="rtl"` sample in IBM Plex Sans Arabic at 1.08em; the clip figure with `width`/`height`, a `<figcaption>` saying it is the real share Studio on Tidewell, and a "Read the Studio guide" link to `docs/guides/studio.html#arabic-and-right-to-left`. Shared by both doors: no `data-door`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/site/landing-sections.spec.ts
test('shows the Arabic section below the stories for both doors', async ({ page }) => {
  for (const hash of ['', '#fixer']) {
    await page.goto(`./${hash}`);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Arabic, right to left, done properly' })
    ).toBeVisible();
  }
});
test('keeps the Arabic clip off the first paint', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('./', { waitUntil: 'load' });
  expect(urls.filter((u) => /arabic-switch/.test(u) && !/poster/.test(u))).toEqual([]);
  const video = page.locator('#arabic video');
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('playsinline', '');
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted && !v.autoplay && !!v.poster)).toBe(
    true
  );
  await expect(page.locator('#arabic').getByRole('button', { name: /clip/ })).toBeAttached();
});
```

And in `static.spec.ts` "renders both stories one after the other and every section": the headings' y order is developer story, fixer story, "Arabic, right to left, done properly", "Works where you already are" (Task 14 inserts its two).

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:site -- landing-sections.spec.ts static.spec.ts`
Expected: FAIL: heading "Arabic, right to left, done properly" not found.

- [ ] **Step 3: Verify the two sentences against the Studio code, then add the section.**

- [ ] **Step 4: Run the tests**

Run: `npm run test:site -- landing-sections.spec.ts static.spec.ts video.spec.ts smoke.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/index.html site/src/main.ts site/src/styles/sections.css tests/site/landing-sections.spec.ts tests/site/static.spec.ts
git commit -m "feat(site): show the Arabic Studio and the right-to-left site flip on the landing page"
```

---

### Task 14: Landing: the comparison and the FAQ

**Files:**

- Modify: `site/index.html` (two sections after `#arabic`, before "Works where you already are"), `site/src/styles/sections.css`, `tests/site/static.spec.ts`, `tests/site/landing-sections.spec.ts`

**Interfaces:**

- `<section id="compare" aria-labelledby="compare-title">`: `h2` "Why not a hosted translation platform?"; a `<table>` with a `<caption>`, column headers `livelocale` and `A hosted translation platform`, and row headers (`<th scope="row">`) exactly: `Where the edit goes`, `Account needed`, `Server needed`, `Cost`, `Lock-in`. The livelocale column states 0.11.0 facts (a pull request in your repository; no account; no server; free, MIT; JSON files in your git). The other column describes the mechanism of a hosted platform generically, with no product named. On phones the table scrolls inside its own box.
- `<section id="faq" aria-labelledby="faq-title">`: `h2` "Questions developers ask"; one `<details>` per question, `<summary>` texts exactly, in order: `Does anything ship to production?`, `Is it secure?`, `We don't use GitHub. Does it work?`, `Which i18n libraries does it work with?`, `Does it work with a static export?`, `What does it cost?`, `Is my content sent anywhere?`. Each answer is two or three short sentences ending in one link: `docs/how-it-works/safety-switches.html`, `docs/how-it-works/security.html`, `docs/guides/share-links.html#other-git-hosts`, `docs/`, `docs/reference/cli/build.html`, `https://github.com/Araby99/livelocale/blob/main/LICENSE`, `docs/how-it-works/security.html#share-links`. Without JavaScript the `<details>` work as they are.
- Sources: the production answer from `src/client/` and `src/server/` mode checks (what runs when `NODE_ENV` is not `development`) and README 950–962; static export from README 213–243 and `livelocale build --preview`; "sent anywhere" from README 799–837.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/site/landing-sections.spec.ts (new cases)
test('compares the mechanism without naming anyone', async ({ page }) => {
  await page.goto('./');
  const rows = page.locator('#compare tbody th[scope="row"]');
  await expect(rows).toHaveText([
    'Where the edit goes',
    'Account needed',
    'Server needed',
    'Cost',
    'Lock-in',
  ]);
  await expect(page.locator('body')).not.toContainText(
    /Tolgee|Locize|Lokalise|Crowdin|Phrase|Transifex/
  );
});
test('answers the seven questions, each with its docs link', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#faq summary')).toHaveText([
    /* the seven questions in order */
  ]);
  for (const d of await page.locator('#faq details').all())
    await expect(d.locator('a')).toHaveCount(1);
});
test('has no horizontal scroll at 360 px with the comparison table', async ({ page }) => {
  /* ≤ 360 */
});
```

And `static.spec.ts` section order becomes: developer, fixer, Arabic, "Why not a hosted translation platform?", "Questions developers ask", "Works where you already are".

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:site -- landing-sections.spec.ts static.spec.ts`
Expected: FAIL: `#compare` not found.

- [ ] **Step 3: Verify each table cell and each answer against its source, then write both sections.**

- [ ] **Step 4: Run the tests**

Run: `npm run test:site -- landing-sections.spec.ts static.spec.ts links.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add site/index.html site/src/styles/sections.css tests/site/landing-sections.spec.ts tests/site/static.spec.ts
git commit -m "feat(site): add the hosted-platform comparison and the developer FAQ"
```

---

### Task 15: The Lighthouse gate

**Files:**

- Create: `site/scripts/lighthouse.mjs` (+ `.d.mts`)
- Modify: `site/package.json` (devDependencies `lighthouse` `^13.6.0`, `chrome-launcher` (current major); script `"lighthouse": "node scripts/lighthouse.mjs"`), `site/package-lock.json`, `site/README.md` ("Performance gate" section)
- Test: `tests/unit/site/lighthouse.test.ts`

**Interfaces:**

- `export const LH_PATHS = ['', 'docs/', 'docs/start/nextjs.html']`
- `export type Lhr = { categories: Record<string, { score: number | null }>; audits?: Record<string, { numericValue?: number }> }`
- `export function assertScores(lhr: Lhr, min: number): string[]` — failure lines like `performance 0.84 < 0.9`.
- `export function medianLhr(runs: Lhr[]): Lhr` — per category the median score (`null` sorts lowest); carries the median run's `largest-contentful-paint` numericValue.
- Running the file serves `site/dist` with `tests/site/fixtures/serve.mjs` on port 4174 under `/livelocale/`, runs Lighthouse 3 times per path (default mobile emulation and simulated throttling; categories performance, accessibility, best-practices, seo) through `chrome-launcher` with `chromePath` = Playwright's `chromium.executablePath()`, prints each run and the median per path (four scores and LCP in ms), and exits 1 if any path's median fails `assertScores(…, 0.9)` on `performance` or `accessibility`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/site/lighthouse.test.ts
// @vitest-environment node
import { assertScores, medianLhr, LH_PATHS } from '../../../site/scripts/lighthouse.mjs';
it('reports each category under the floor', () =>
  expect(
    assertScores(
      {
        categories: {
          performance: { score: 0.84 },
          accessibility: { score: 1 },
          seo: { score: null },
        },
      },
      0.9
    )
  ).toEqual(['performance 0.84 < 0.9', 'seo null < 0.9']));
it('gates on the median of the runs, not one outlier', () => {
  const run = (p: number | null) => ({ categories: { performance: { score: p } } });
  expect(medianLhr([run(0.95), run(0.81), run(0.92)]).categories).toEqual(run(0.92).categories);
  expect(medianLhr([run(null), run(0.93), run(0.91)]).categories).toEqual(run(0.91).categories);
});
it('measures the landing page and the getting-started pages', () =>
  expect(LH_PATHS).toEqual(['', 'docs/', 'docs/start/nextjs.html']));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/site/lighthouse.test.ts`
Expected: FAIL with "Failed to load url ../../../site/scripts/lighthouse.mjs".

- [ ] **Step 3: Implement the script; install the two packages in `site/`.**

- [ ] **Step 4: Run the test and record the baseline**

Run: `npx vitest run tests/unit/site/lighthouse.test.ts && npm run site:build && npm run lighthouse --prefix site`
Expected: 3 tests PASS; the gate prints three medians. It may exit 1 here (landing LCP is about 3.6–4.3 s today); put the three medians and LCPs in the task report for Task 16. Do not add the CI step yet.

- [ ] **Step 5: Commit**

```bash
git add site/scripts/lighthouse.mjs site/scripts/lighthouse.d.mts site/package.json site/package-lock.json site/README.md tests/unit/site/lighthouse.test.ts
git commit -m "test(site): add a mobile Lighthouse gate over the landing and getting-started pages"
```

---

### Task 16: Landing LCP work and the gate in CI

**Files:**

- Modify: `site/src/demo-video.ts`, `site/vite.config.ts` (a `preloadHeadlineFont()` plugin), `site/docs/.vitepress/config.ts` (`transformHead` font preload), `tests/site/video.spec.ts`, `tests/site/smoke.spec.ts`, `.github/workflows/site.yml` (step `npm run lighthouse --prefix site` after `Run Site E2E Tests`), `tests/unit/site/site-workflow.test.ts`, `site/README.md` (the hero section's "attaches it as soon as the page is parsed" sentence)
- Conditional: `site/vite.config.ts` (`inlineCss()` plugin), only per Step 6

**Interfaces:**

- `startDemoVideo` keeps its signature; the sources attach on the window `load` event (or at once when `document.readyState === 'complete'`) and only while the video is on screen, so the video's bytes never compete with the poster, the CSS and the headline font before the first paint. A chapter click still attaches at once.
- `preloadHeadlineFont(): Plugin` — in `transformIndexHtml` with the bundle, adds `<link rel="preload" as="font" type="font/woff2" crossorigin href="<base>assets/martian-mono-latin-700-normal-<hash>.woff2">` (the h1's face) to `<head>` before the stylesheet; throws if the asset is missing.
- Docs `transformHead`: the same preload for the docs pages, found in `context.assets`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/site/smoke.spec.ts (new case)
test('preloads the headline face, and only it', async ({ page }) => {
  for (const path of ['./', 'docs/']) {
    await page.goto(path);
    const fonts = page.locator('link[rel="preload"][as="font"]');
    await expect(fonts).toHaveCount(1);
    await expect(fonts).toHaveAttribute(
      'href',
      /^\/livelocale\/(docs\/)?assets\/martian-mono-latin-700-normal[\w.-]*\.woff2$/
    );
    await expect(fonts).toHaveAttribute('crossorigin', '');
  }
});
// tests/site/video.spec.ts: replace "is playing within the first seconds, before the page has finished loading" with
test('fetches no video before the page has loaded, then plays within the first seconds', async ({
  page,
}) => {
  const early: string[] = [];
  page.on('request', (r) => {
    if (/\.(webm|mp4)/.test(r.url())) early.push(r.url());
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const loaded = page.evaluate(
    () =>
      new Promise((r) => (document.readyState === 'complete' ? r(0) : addEventListener('load', r)))
  );
  expect(early).toEqual([]); // nothing requested before load fired
  await loaded;
  await expect
    .poll(
      () =>
        page
          .locator('[data-demo] video')
          .evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.5),
      { timeout: 4000 }
    )
    .toBe(true);
});
// tests/unit/site/site-workflow.test.ts (new case)
it('runs the Lighthouse gate after the E2E suite', () => {
  expect(wf.indexOf('npm run lighthouse --prefix site')).toBeGreaterThan(
    wf.indexOf('npm run test:site')
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/site/site-workflow.test.ts && npm run test:site -- smoke.spec.ts video.spec.ts`
Expected: FAIL: 0 font preloads; a `.webm` request before load; no lighthouse step.

- [ ] **Step 3: Defer the video sources to `load`.**

- [ ] **Step 4: Add `preloadHeadlineFont()` and the docs `transformHead` preload.**

- [ ] **Step 5: Run the tests and the gate**

Run: `npx vitest run tests/unit/site && npm run test:site -- smoke.spec.ts video.spec.ts docs.spec.ts && npm run lighthouse --prefix site`
Expected: tests PASS; the gate prints each path's median.

- [ ] **Step 6: Only if any median performance is still under 0.90:** read that path's LCP breakdown in the report (`lcp-breakdown-insight`: TTFB, load delay, load duration, render delay) and apply, in this order, re-running the gate after each: (a) inline the landing CSS into `index.html` with an `inlineCss()` plugin (it is about 19 KB, 5 KB gzipped, and render-blocking), with a smoke test `has no render-blocking stylesheet on the landing page` (no `link[rel=stylesheet]` in `<head>`); (b) on the docs, confirm every `DocShot` keeps `loading="lazy"` and the first screen of the measured pages holds no image; (c) anything else the report names, recorded in the task report. Never lower the floor, the number of runs or the throttling.

Expected: median performance ≥ 0.90 and accessibility ≥ 0.90 on all three paths, exit 0.

- [ ] **Step 7: Add the CI step and run the workflow test**

Run: `npx vitest run tests/unit/site/site-workflow.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add site/src/demo-video.ts site/vite.config.ts site/docs/.vitepress/config.ts tests/site/video.spec.ts tests/site/smoke.spec.ts .github/workflows/site.yml tests/unit/site/site-workflow.test.ts site/README.md
git commit -m "perf(site): load the hero video after the first paint and preload the headline font"
```

---

### Task 17: The site suite in WebKit and Firefox

**Files:**

- Modify: `playwright.site.config.ts` (projects `webkit` with `devices['Desktop Safari']` and `firefox` with `devices['Desktop Firefox']`, both `grep: /@cross/`), `.github/workflows/site.yml` (`npx playwright install --with-deps chromium webkit firefox`), `tests/site/video.spec.ts`, `tests/site/doors.spec.ts`, `tests/site/docs.spec.ts` (add `@cross` to titles), `tests/unit/site/site-workflow.test.ts`

**Interfaces:**

- Tagged `@cross`: in `video.spec.ts`, the load-then-play test (Task 16), `attaches webm then mp4, plays, and pauses from the visible button`, `seeks from a chapter chip and marks it current`, `never autoplays: poster and a Play button until asked`, `marks the video up to stay light, with a preloaded poster per cut`; in `doors.spec.ts`, `opens on the developer door and switches by click, keeping the hash` and `switches with the arrow keys`; in `docs.spec.ts`, `finds the check reference with the offline search`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/site/site-workflow.test.ts (new case)
it('installs and runs the three engines', () => {
  expect(wf).toContain('npx playwright install --with-deps chromium webkit firefox');
  const config = fs.readFileSync('playwright.site.config.ts', 'utf8');
  for (const name of ["name: 'webkit'", "name: 'firefox'"]) expect(config).toContain(name);
  expect(config.match(/grep: \/@cross\//g)).toHaveLength(2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/site/site-workflow.test.ts`
Expected: FAIL on the install line.

- [ ] **Step 3: Add the projects, the tags and the install line.**

- [ ] **Step 4: Run the cross-engine tests**

Run: `npx playwright install webkit firefox && npm run test:site -- --project webkit --project firefox`
Expected: 8 tests PASS in each engine. A real difference in the page (not the test) is fixed in the page. If an engine in Playwright's build cannot decode either video format, stop and report it with the `canPlayType` results; do not skip or weaken the test.

- [ ] **Step 5: Commit**

```bash
git add playwright.site.config.ts .github/workflows/site.yml tests/site tests/unit/site/site-workflow.test.ts
git commit -m "test(site): run the video, door and docs search tests in WebKit and Firefox"
```

---

### Task 18: The accessibility gate over the landing page and the docs

**Files:**

- Create: `tests/site/a11y.spec.ts`, `tests/site/narrow.spec.ts`
- Modify: whatever site or theme source the gate finds failing

**Interfaces:**

- Consumes: `SIDEBAR` (Task 1) for the list of docs pages; `scrollThrough` from `tests/site/fixtures/scroll.ts`.
- `audit(page)` = `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()` → `violations.map(v => \`${v.id}: ${v.nodes.map(n => n.target).join(', ')}\`)`.

- [ ] **Step 1: Write the tests**

```ts
// tests/site/a11y.spec.ts
const LANDING: Record<string, (p: Page) => Promise<void>> = {
  'developer door': async (p) => {
    await p.goto('./');
    await scrollThrough(p);
  },
  'fixer door': async (p) => {
    await p.goto('./#fixer');
    await scrollThrough(p);
  },
  'FAQ open': async (p) => {
    await p.goto('./');
    for (const s of await p.locator('#faq summary').all()) await s.click();
  },
};
for (const [name, setup] of Object.entries(LANDING))
  test(`has no WCAG 2.2 AA violations on the landing page: ${name}`, async ({ page }) => {
    await setup(page);
    expect(await audit(page)).toEqual([]);
  });
for (const link of SIDEBAR.flatMap((g) => g.items.map((i) => i.link)))
  test(`has no WCAG 2.2 AA violations on docs ${link}`, async ({ page }) => {
    await page.goto(`docs${link.endsWith('/') ? link : link + '.html'}`);
    expect(await audit(page)).toEqual([]);
  });
test('has no WCAG 2.2 AA violations with the docs search open', async ({ page }) => {
  /* open search, type "check" */
});
test.describe('reduced motion', () => {
  /* landing and docs/guides/studio.html, clips on posters */
});
test.describe('without JavaScript', () => {
  /* landing and docs/ */
});
test('@touch has no WCAG 2.2 AA violations with the docs menu open on a phone', async ({
  page,
}) => {
  /* tap the menu button */
});

// tests/site/narrow.spec.ts
test.use({ viewport: { width: 360, height: 780 } });
test('has no horizontal scroll at 360 px on every docs page', async ({ page }) => {
  // for each SIDEBAR page: scrollWidth ≤ 360 (collect failures, expect [])
});
test('has no horizontal scroll at 360 px on the landing page with every FAQ open', async ({
  page,
}) => {
  /* ≤ 360 */
});
```

- [ ] **Step 2: Run them**

Run: `npm run test:site -- a11y.spec.ts narrow.spec.ts && npm run test:site -- --project touch a11y.spec.ts`
Expected: all pass, or violations listed by rule id and target.

- [ ] **Step 3: Fix every violation and overflow in the source** (never by excluding a rule, a tag or an element). A Ghost contrast failure is fixed by moving that text to Comment, never by lightening Ghost or adding a colour; wide tables and code get `overflow-x: auto` on their own box. Repeat Step 2.

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/site/a11y.spec.ts tests/site/narrow.spec.ts site
git commit -m "test(site): gate the landing page and every docs page on WCAG 2.2 AA and 360 px"
```

---

### Task 19: The new social card and per-page docs share tags

**Files:**

- Modify: `brand/src/og.html` (left: the logo, the diff pair `− final_FINAL_v3.png` / `+ Stop collecting screenshots.` with the one tilted patch on "Stop", the command `npx livelocale init`, `livelocale.js.org`; right: the real poster frame in the page's product window frame, Surface with a 12px radius and the Night address pill `tidewell.example/pricing`), `site/scripts/brand/render-pngs.mjs` (`export const HERO_POSTER` = `site/media/hero/poster.png`; the CLI run passes `{ studioShot: HERO_POSTER }`), `brand/og-image.png` (regenerated), `site/docs/.vitepress/config.ts` (`transformHead`: `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width` 1200, `og:image:height` 630, `og:image:alt`, `twitter:card` `summary_large_image`, `meta name="theme-color"` `#0C0D0F`), `tests/unit/brand/brand-templates.test.ts`, `tests/unit/brand/brand-png.test.ts`
- Test: `tests/site/docs-meta.spec.ts`

**Interfaces:**

- Docs `og:url` = `siteUrl + 'docs/' + page path` (`.html`, `index.html` → folder URL); `og:image` = `siteUrl + 'og-image.png'`; `siteUrl` from `siteConfig(process.env)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/brand/brand-png.test.ts (new case)
import { HERO_POSTER, pngSources } from '../../../site/scripts/brand/render-pngs.mjs';
it('puts the real hero frame in the share image', () => {
  expect(fs.existsSync(HERO_POSTER)).toBe(true);
  expect(pngSources(HERO_POSTER)['og-image.png'].url).toContain(encodeURIComponent('poster.png'));
});
// tests/unit/brand/brand-templates.test.ts: also expect og.html to contain 'npx livelocale init<',
// 'tidewell.example' and 'livelocale.js.org'; still exactly one rotate(

// tests/site/docs-meta.spec.ts
test('gives every docs page its own title, description and absolute share tags', async ({
  page,
  request,
}) => {
  // for each SIDEBAR page: title ends ' | livelocale docs' and is unique; description unique;
  // og:url === http://localhost:4173/livelocale/docs/<page>; og:image === http://localhost:4173/livelocale/og-image.png
  // and request.get(og:image) is 200 image/png
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/brand && npm run test:site -- docs-meta.spec.ts`
Expected: FAIL with "HERO_POSTER is not exported" and a missing `og:url`.

- [ ] **Step 3: Update `og.html`, `render-pngs.mjs` and `transformHead`; regenerate**

Run: `npm run brand:build`
Expected: `wrote og-image.png`. Open `brand/og-image.png` with the Read tool: the diff pair on the left, the real Tidewell frame in the window on the right, nothing cut off.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/brand tests/unit/site && npm run test:site -- docs-meta.spec.ts meta.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add brand/src/og.html brand/og-image.png site/scripts/brand/render-pngs.mjs site/docs/.vitepress/config.ts tests/unit/brand tests/site/docs-meta.spec.ts
git commit -m "feat(site): redo the social card from the real hero frame and tag every docs page"
```

---

### Task 20: `site/LAUNCH.md` and the go-live README

**Files:**

- Create: `site/LAUNCH.md`, `site/launch/README.md`
- Modify: `site/README.md` (link `LAUNCH.md`)
- Test: `tests/unit/site/launch.test.ts`

**Interfaces:**

- `site/LAUNCH.md`: a checkbox list `- [ ] N. (agent|owner) …`, in this order:
  1. (agent) `feat/landing` merged to `main`; on `main` the Site workflow's tests (Chromium, WebKit, Firefox), the accessibility gate and the Lighthouse gate are green; `SITE_LIVE` unset, so nothing has deployed.
  2. (owner) Run the Site workflow once by `workflow_dispatch`: the hidden preview at `https://araby99.github.io/livelocale/` and `https://araby99.github.io/livelocale/docs/`, linked from nowhere.
  3. (owner) Check the preview on a real phone and a computer: the hero video plays muted with a working pause, the door switch, the Arabic clip, the FAQ, the docs search, the Next.js getting-started page, no sideways scroll.
  4. (owner) Open the js.org pull request (`site/README.md`, "Claiming livelocale.js.org") against the preview; wait for the merge.
  5. (owner) Domain switch: repository variable `SITE_URL` = `https://livelocale.js.org/`; Settings → Pages custom domain `livelocale.js.org` with Enforce HTTPS. No `CNAME` file.
  6. (owner) Set the repository variable `SITE_LIVE` to `true`, then run the Site workflow by `workflow_dispatch`; from now on pushes to `main` deploy.
  7. (owner) Check `https://livelocale.js.org/` and `/docs/` on a phone and a computer; paste the URL into the LinkedIn Post Inspector to confirm the og-image.
  8. (agent, on the owner's go) The go-live README commit: copy `site/launch/README.md` over `README.md` and commit `docs: shrink the README to the pitch and links to the docs`.
  9. (owner) The README-only 0.11.1 release, created by the owner as for every release, so npm shows the short README.
  10. (owner) Set the GitHub repository's website to `https://livelocale.js.org/`; set `brand/avatar-512.png` as the GitHub avatar and as the Gravatar of the npm account's email.
- `site/launch/README.md` (spec §3.5): the `<picture>` logo header exactly as `README.md` has it today (the brand test reads it), a one-paragraph pitch, install, a 30-second Next.js example taken from `site/docs/start/nextjs.md`, links to `https://livelocale.js.org/docs/` pages (getting started, share links, CI check, CLI reference), licence.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/site/launch.test.ts
// @vitest-environment node
import * as fs from 'node:fs';
const launch = () => fs.readFileSync('site/LAUNCH.md', 'utf8');
it('lists the launch steps in order, owner-gated', () => {
  const who = [...launch().matchAll(/^- \[ \] \d+\. \((agent|owner)[,)]/gm)].map((m) => m[1]);
  expect(who).toEqual([
    'agent',
    'owner',
    'owner',
    'owner',
    'owner',
    'owner',
    'owner',
    'agent',
    'owner',
    'owner',
  ]);
  const at = (s: string) => launch().indexOf(s);
  expect(at('workflow_dispatch')).toBeLessThan(at('js.org pull request'));
  expect(at('`SITE_URL`')).toBeLessThan(at('`SITE_LIVE` to `true`'));
  expect(at('`SITE_LIVE` to `true`')).toBeLessThan(at('site/launch/README.md'));
  expect(at('site/launch/README.md')).toBeLessThan(at('0.11.1'));
});
it('sets the domain in Pages settings, never with a CNAME file', () => {
  expect(launch()).not.toMatch(/public\/CNAME/);
  expect(fs.existsSync('site/public/CNAME')).toBe(false);
});
it('prepares a short README whose docs links all exist', () => {
  const readme = fs.readFileSync('site/launch/README.md', 'utf8');
  expect(readme.split('\n').length).toBeLessThan(120);
  expect(readme).toContain(
    '<source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">'
  );
  const links = [...readme.matchAll(/https:\/\/livelocale\.js\.org\/docs\/([\w/.-]*)/g)].map(
    (m) => m[1]
  );
  expect(links.length).toBeGreaterThanOrEqual(4);
  for (const l of links)
    expect(fs.existsSync(`site/docs/${(l || 'index.html').replace(/\.html$/, '.md')}`), l).toBe(
      true
    );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/site/launch.test.ts`
Expected: FAIL with "ENOENT … site/LAUNCH.md".

- [ ] **Step 3: Write `site/LAUNCH.md`, `site/launch/README.md` (its install command and example copied from the verified getting-started page) and the `site/README.md` link.**

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/site/launch.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add site/LAUNCH.md site/launch/README.md site/README.md tests/unit/site/launch.test.ts
git commit -m "docs(site): add the launch checklist and the go-live README"
```

---

## Shared contracts

| Interface                                                                                         | Defined in | Used by                                  |
| ------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------- |
| `docsBase`, `landingHref`, `SIDEBAR`, `NAV`, `TITLE_TEMPLATE`, `docsPageFiles`                    | Task 1     | Tasks 5–11 (sidebar), 18, 19             |
| `SiteBrand.vue` (landing mark, byte for byte)                                                     | Task 1     | Task 18                                  |
| `run`, `serveDir`, `packStage`, `snapshotFiles` (`capture-lib.mjs`)                               | Task 2     | Task 2                                   |
| `SHOTS`, `CLIPS`, `DocsMedia`, `provenance`, `webpSize`; `site/media/docs/manifest.json`          | Task 2     | Tasks 7–11, 13                           |
| `shouldPlay`, `startClip` (`site/src/lib/clip.ts`)                                                | Task 2     | Tasks 2, 13                              |
| `DocShot`, `DocClip`                                                                              | Task 2     | Tasks 7–11                               |
| `SnippetSpec`, `SNIPPETS`, `runSnippet`, `writeCliSnippets`, `renderTerminal`, `cli <name>` fence | Task 3     | Tasks 5–11                               |
| `parseHelp`                                                                                       | Task 3     | Task 5                                   |
| `ALLOWED_EXTERNAL`, `extractLinks`, `extractIds`, `classifyLink`                                  | Task 4     | Task 4 spec, every later task's link run |
| `changelogBody`                                                                                   | Task 6     | Task 6                                   |
| `LH_PATHS`, `assertScores`, `medianLhr`                                                           | Task 15    | Task 16                                  |
| `preloadHeadlineFont`                                                                             | Task 16    | Task 16                                  |
| `@cross` tag, `webkit` / `firefox` projects                                                       | Task 17    | Task 17                                  |
| `HERO_POSTER`                                                                                     | Task 19    | Task 19                                  |
