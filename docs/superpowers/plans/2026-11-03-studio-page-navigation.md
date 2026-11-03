# Studio Page Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An address field with recent and site-page suggestions in the Studio's preview bar that always shows the current page, opens any page of the site in the current language, and makes Reload reload the page you are on.

**Architecture:** The client runtime reports every location change (`LOCATION_CHANGED`) and obeys a same-origin `NAVIGATE`. `pack` lists the site's HTML pages in the manifest as an optional `pages` field. The Studio side is a pure path model (`page-address.ts`), a recent-pages store (`recent-pages.ts`), a presentational combobox (`AddressBar.tsx`) and one hook (`usePageNavigation.ts`) that wires them to the iframe.

**Tech Stack:** TypeScript, React 18, Vite (Studio), tsup (package), Vitest + Testing Library (jsdom), Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-11-03-studio-page-navigation-design.md`

## Global Constraints

- No runtime dependencies (`node -p "require('./package.json').dependencies"` prints `undefined`); `src/core` stays browser-safe (`tests/unit/core-browser-safe.test.ts`).
- Manifest backward compatible: `pages` is optional; a 0.12 Studio works with a 0.11 manifest (no site pages group); a 0.11 Studio ignores `pages`.
- Message validation and origin checks are as strict as the existing protocol; the client never navigates to another origin.
- Existing behaviour and tests stay green; the server-mode Studio works as in 0.11 apart from the new field.
- Caps: suggestions show at most 8; recent pages keep at most 20; the manifest lists at most 2,000 pages (more are truncated with a warning).
- Copy: every new string is an en/ar catalogue key (`src/studio/i18n/en.ts`, `ar.ts`); the owner reviews the new Arabic before `latest`.
- 0.11 accessibility rules (plan 2026-11-01, "Accessibility tasks: shared rules") apply: focus is drawn only by the global `:focus-visible` rule (no `focus:` outline/ring/border utilities, no `outline-none`); colours only from the token classes (`studio-colour-guard.test.ts`); E2E reaches controls by id or test id and waits on `connection-status` `data-status="connected"`, never on English text; unit tests render outside a provider and may query English names.
- Commit messages never mention Claude, Anthropic or AI; no `Co-Authored-By`, no "Generated with".
- E2E servers (`playwright.config.ts`): Next playground on 3000, Studio dev on 3010, `playground-vite/dist` (built with `share: true`) on 3020, all with `reuseExistingServer` outside CI. Both playgrounds consume the package as `file:..`, so run `npm run build` before E2E and make sure nothing stale holds those ports (the owner's own Studio dev may sit on `[::1]:3010`; ask before stopping it).

## Review Focus

1. A typed `//evil.example`, `/\evil.example` or `http://localhost:3020.evil.example/` must be refused, not opened: the URL parser treats `\` as `/` and `//` as a host (Task 4 test `refuses inputs that resolve to another origin`).
2. In share mode under `/livelocale-demo/`, `/../other-site/` or a full same-origin URL outside the base must be refused, since another site may live on the same origin (Task 4 test `refuses paths outside the base`).
3. A corrupt recent-pages value in `localStorage` (not JSON, not an array, non-string or non-`/` entries, 500 entries) or a throwing `localStorage` must give a clean list, never an exception (Task 5 test `survives corrupt or blocked storage`).
4. A client-side router firing several `pushState`s in one frame, or `replaceState` to the same URL, must send one message or none (Task 1 test `coalesces a burst into one report and skips unchanged URLs`).
5. Arabic or other non-ASCII slugs must show readably (`/مدونة/`, not `/%D9%85...`) and match the same page from the manifest and from recent pages (Task 4 test `shows non-ASCII paths decoded`, Task 3 test `lists non-ASCII pages as written`).

---

### Task 1: Client reports every location change

**Files:**

- Create: `src/client/location-watch.ts`
- Modify: `src/client/iframe-bridge.ts` (message type, `toLocationUrl`, sanitising), `src/client/index.ts` (start the watcher; `READY` url adds `location.hash`)
- Modify: `src/studio/features/dashboard/hooks/useConnection.ts` (handle `LOCATION_CHANGED`, expose `locationKnown`, `locationSeq`)
- Test: `tests/unit/location-watch.test.ts` (new), `tests/unit/studio-hooks.test.tsx` (`useConnection` block)

**Interfaces:**

- Produces: `ClientMessageType` gains `'LOCATION_CHANGED'`, payload `{ url: string }`.
- Produces: `MAX_LOCATION_LENGTH = 2048`; `toLocationUrl(payload: unknown): string | null` in `iframe-bridge.ts`: the `url` own string of an object payload when it starts with `/`, does not start with `//` or `/\`, and is at most `MAX_LOCATION_LENGTH` long; else null. Both `sendToParent('LOCATION_CHANGED' | 'READY')` and the Studio use it.
- Produces: `watchLocation(win: Window, report: (url: string) => void, schedule?: (cb: () => void) => void): () => void` in `location-watch.ts`. Default `schedule` is `win.requestAnimationFrame`. Wraps `history.pushState`/`replaceState` once (a marker property on the wrapper prevents double wrapping; the wrapper always calls the original first), listens to `popstate` and `hashchange`, coalesces to one scheduled report of `pathname + search + hash`, and skips a report equal to the last one (initially the URL at start, which `READY` carries). The cleanup removes listeners and restores the originals when its wrappers are still installed.
- Produces: `useConnection` returns, in addition, `locationKnown: boolean` (false until the first `READY`) and `locationSeq: number` (incremented on every accepted `READY` or `LOCATION_CHANGED`). `currentPath` updates from both. `LOCATION_CHANGED` also runs `localeFromUrl(...)` → `onLocaleDetected` like `READY`, but does not reset `visibleKeys` (the interceptor's mutation observer reports the new keys).

- [ ] **Step 1: Write the failing tests**

`tests/unit/location-watch.test.ts` (jsdom), with a manual scheduler `const queue: (() => void)[] = []; const schedule = (cb) => queue.push(cb); const flush = () => queue.splice(0).forEach((cb) => cb());`:

- `reports pushState, replaceState, popstate and hashchange`: after `history.pushState({}, '', '/a?x=1')` and `flush()`, `report` was called with `'/a?x=1'`; same for `replaceState('/b')`, `location.hash = '#h'` + dispatched `hashchange` (`'/b#h'`), and a dispatched `popstate` after `history.replaceState({}, '', '/c')` through the saved original.
- `coalesces a burst into one report and skips unchanged URLs`: ten `pushState`s to `/1`…`/10` then `flush()` → exactly one call, `'/10'`; `replaceState` to the current URL then `flush()` → no call.
- `wraps history once and restores it on cleanup`: two `watchLocation` calls leave `history.pushState` wrapped once (one `report` per change per watcher, original called once per `pushState`); after both cleanups `history.pushState` is the original function.

`tests/unit/studio-hooks.test.tsx`, `useConnection` block:

- `follows LOCATION_CHANGED from the app origin`: after `READY { url: '/' }` then `LOCATION_CHANGED { url: '/fr/pricing' }`, `currentPath === '/fr/pricing'`, `locationSeq === 2`, `locationKnown === true`, `onLocaleDetected` called with `'fr'`.
- `ignores malformed or foreign LOCATION_CHANGED`: payloads `{ url: '//evil.example/' }`, `{ url: 'https://x/' }`, `{ url: 42 }`, `{ url: '/' + 'a'.repeat(2048) }`, and a well-formed one from another origin leave `currentPath` and `locationSeq` unchanged.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/location-watch.test.ts tests/unit/studio-hooks.test.tsx`
Expected: FAIL (`location-watch.js` not found; `locationSeq` undefined).

- [ ] **Step 3: Implement** `watchLocation`, `toLocationUrl`, the `LOCATION_CHANGED` branch in `sendToParent` (drop the message when `toLocationUrl(payload)` is null, send `{ url }`), and in `src/client/index.ts` start `watchLocation(window, (url) => bridge.sendToParent('LOCATION_CHANGED', { url }))` after `READY`; then the `useConnection` changes.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/unit/location-watch.test.ts tests/unit/studio-hooks.test.tsx tests/unit/studio-origin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/location-watch.ts src/client/iframe-bridge.ts src/client/index.ts src/studio/features/dashboard/hooks/useConnection.ts tests/unit/location-watch.test.ts tests/unit/studio-hooks.test.tsx
git commit -m "feat(client): report client-side navigations to the Studio"
```

---

### Task 2: Client obeys NAVIGATE on its own origin only

**Files:**

- Modify: `src/client/iframe-bridge.ts` (`StudioMessageType`, `navigationHref`), `src/client/index.ts` (handle `NAVIGATE`)
- Test: `tests/unit/studio-origin.test.ts` (new `describe('navigationHref')`)

**Interfaces:**

- Produces: `StudioMessageType` gains `'NAVIGATE'`, payload `{ url: string }` (an absolute URL).
- Produces: `navigationHref(payload: unknown, ownOrigin: string): string | null` in `iframe-bridge.ts`: the parsed `href` when the payload is an object whose own `url` is a string of at most `MAX_LOCATION_LENGTH` that parses as an `http:`/`https:` URL whose `origin === ownOrigin`; else null. Never throws.
- Produces: the client's listener (already origin-checked against the Studio by `listenToParent`) calls `window.location.assign(href)` for a non-null `navigationHref(payload, window.location.origin)` and ignores the message otherwise.

- [ ] **Step 1: Write the failing test** `navigationHref` cases, own origin `http://localhost:3020`:
  - `'http://localhost:3020/about/?locale=ar#top'` → same href.
  - Refused (null): `'http://evil.example/'`, `'http://localhost:3021/'`, `'https://localhost:3020/'`, `'javascript:alert(1)'`, `'data:text/html,x'`, `'//evil.example/'`, `'/about/'` (relative), `{ url: 1 }`, `null`, `'http://localhost:3020/' + 'a'.repeat(2048)`, and an inherited `url` (`Object.create({ url: 'http://localhost:3020/' })`).
- [ ] **Step 2: Run it to see it fail** — `npx vitest run tests/unit/studio-origin.test.ts`, FAIL (`navigationHref` is not exported).
- [ ] **Step 3: Implement** `navigationHref` and the `NAVIGATE` branch in `src/client/index.ts`.
- [ ] **Step 4: Run it to see it pass** — same command, PASS.
- [ ] **Step 5: Commit** — `git add src/client/iframe-bridge.ts src/client/index.ts tests/unit/studio-origin.test.ts`, `git commit -m "feat(client): open Studio-requested pages on the app's own origin"`.

---

### Task 3: The manifest lists the site's pages

**Files:**

- Modify: `src/core/share-manifest.ts` (`pages?`, `MAX_MANIFEST_PAGES`, validation)
- Modify: `src/server/pack.ts` (`pagePathOf`, collect pages from every HTML document whether or not flags are injected, warning)
- Test: `tests/unit/share-manifest.test.ts`, `tests/unit/pack.test.ts`

**Interfaces:**

- Produces: `ShareManifest.pages?: string[]` — sorted (code units), site-relative paths (relative to `basePath`), each starting with `/`; absent when no HTML document was found (a Next.js `build` packs into `public/` before the build, so it has none).
- Produces: `MAX_MANIFEST_PAGES = 2000` in `share-manifest.ts`. `isShareManifest` accepts `pages` absent, or an array whose every slot is a string starting with `/` (a malformed `pages` fails like any malformed field). It does not enforce the cap; the Studio slices.
- Produces: `pagePathOf(rel: string): string` in `pack.ts` (exported for tests): POSIX `rel` of an HTML file → `'/'` for `index.html`, `'/<dir>/'` for `<dir>/index.html`, else `'/' + rel` (keeps `.html`, which every static host serves).
- Produces: `pagesTruncatedWarning(total: number): string` in `pack.ts` = `` `The site has ${total} HTML pages; the manifest lists the first ${MAX_MANIFEST_PAGES} for the Studio's page suggestions.` ``, pushed onto `PackResult.warnings` (printed by `printPackSummary` in `src/codemod/index.ts` and logged by the Vite plugin; no change there).
- `packOutput` finds the HTML documents (`findHtmlFiles` + `isHtmlDocument`) before writing `manifest.json`, writes `{ ...data.manifest, pages }` (`PackResult.manifest` is the written one), and injects flags into the same list only when `inject` is true; `htmlInjected` is unchanged.

- [ ] **Step 1: Write the failing tests**

`share-manifest.test.ts`: `accepts a manifest without pages (0.11)`; `accepts sorted site pages` (`pages: ['/', '/about/']`); `rejects malformed pages` (`pages: '/'`, `['about']`, `['/', 3]`, `[, '/']` hole each make `isShareManifest` false).

`pack.test.ts`:

- `lists every HTML page in the manifest`: the existing fixture (`index.html`, `docs/a.html`) gives `r.manifest.pages` `['/', '/docs/a.html']` and the same in the written `manifest.json`.
- `lists pages when flags are not injected`: with `injectHtml: false`, `htmlInjected` is `[]` and `manifest.pages` is still `['/', '/docs/a.html']`.
- `maps index files to folder paths`: `pagePathOf('index.html') === '/'`, `pagePathOf('blog/hello/index.html') === '/blog/hello/'`, `pagePathOf('404.html') === '/404.html'`.
- `lists non-ASCII pages as written`: an `out/مدونة/index.html` gives `'/مدونة/'` in `pages`.
- `omits pages when there is no HTML document`: an output with only `app.js` has no `pages` key in `manifest.json`.
- `caps pages at 2,000 with a warning`: 2,001 `p<n>.html` files → `pages.length === 2000`, `pages` equals the first 2,000 of the sorted list, `warnings` contains `pagesTruncatedWarning(2001)`.

- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/unit/share-manifest.test.ts tests/unit/pack.test.ts`, FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run them to see them pass** — same command plus `tests/unit/pack-manifest.test.ts tests/unit/core-browser-safe.test.ts tests/unit/vite-plugin-share.test.ts`, PASS.
- [ ] **Step 5: Commit** — `git add src/core/share-manifest.ts src/server/pack.ts tests/unit/share-manifest.test.ts tests/unit/pack.test.ts`, `git commit -m "feat(pack): list the site's pages in the share manifest"`.

---

### Task 4: The Studio's path model

**Files:**

- Create: `src/studio/page-address.ts`
- Modify: `src/studio/runtime.ts` (`appBasePath`; `urlLocaleOptions` uses it)
- Test: `tests/unit/page-address.test.ts` (new), `tests/unit/studio-runtime.test.ts`

**Interfaces:**

- Consumes: `localeFromUrl`, `urlWithLocale` (`src/studio/locale-inference.ts`).
- Produces in `runtime.ts`: `appBasePath(): string` — static: `manifest.basePath ?? new URL(appUrl).pathname`; server: `'/'`. `urlLocaleOptions()` keeps its output, built from `appBasePath()`.
- Produces in `page-address.ts`:
  - `interface AddressContext { appOrigin: string; base: string; hideLocale: string | null }` (`base` starts and ends with `/`; `hideLocale` is the Studio's locale in server mode, null in share mode).
  - `toDisplayPath(appPath: string, ctx: AddressContext): string` — drops the `livelocale-origin` query parameter, drops `locale` when its value equals `ctx.hideLocale`, strips `ctx.base` to a leading `/` (a path outside the base is shown whole), keeps the hash, and shows the path `decodeURI`d (left encoded when that throws).
  - `resolveAddress(input: string, ctx: AddressContext): string | null` — the absolute app path (`pathname + search + hash`) to open, or null for a refusal. Trimmed; empty → `ctx.base`; a value with a scheme (`/^[a-z][a-z\d+.-]*:/i`) must be an `http(s)` URL on `ctx.appOrigin` and is used as is; anything else gets a missing leading `/` added and is taken relative to the base (`ctx.base + value.slice(1)`). The result is resolved with `new URL(candidate, ctx.appOrigin)` and refused unless its `origin === ctx.appOrigin` and its `pathname` starts with `ctx.base` (or equals `ctx.base` without the trailing `/`).
  - `withPageLocale(target: string, current: string, locale: string, options: { basePath?: string; locales?: readonly string[] }): string` — `target` unchanged when it already names a locale (`localeFromUrl(target, options) !== null`) or when `current` names none; else `urlWithLocale(target, locale, options) ?? target`. (Keeps the language the preview shows; never adds `?locale=` to a site whose addresses carry no locale.)
  - `frameSrc(appPath: string, appOrigin: string, studioOrigin: string): string` — absolute URL of `appPath` on `appOrigin` with `livelocale-origin=<studioOrigin>` set in its query.

- [ ] **Step 1: Write the failing tests** (`dev = { appOrigin: 'http://localhost:3000', base: '/', hideLocale: 'ar' }`, `share = { appOrigin: 'http://localhost:3020', base: '/livelocale-demo/', hideLocale: null }`):
  - `toDisplayPath`: `'/?livelocale-origin=http%3A%2F%2Flocalhost%3A3010'` (dev) → `'/'`; `'/pricing?locale=ar&tab=2#faq'` (dev) → `'/pricing?tab=2#faq'`; `'/pricing?locale=fr'` (dev) → `'/pricing?locale=fr'`; `'/livelocale-demo/pricing'` (share) → `'/pricing'`; `'/livelocale-demo/'` → `'/'`; `'/elsewhere/'` (share) → `'/elsewhere/'`.
  - `shows non-ASCII paths decoded`: `'/%D9%85%D8%AF%D9%88%D9%86%D8%A9/'` (dev) → `'/مدونة/'`; `'/%E0%A4%A/'` stays as given.
  - `resolveAddress` accepts: `'pricing'` (share) → `'/livelocale-demo/pricing'`; `'/blog/hello/?x=1#h'` (share) → `'/livelocale-demo/blog/hello/?x=1#h'`; `''` (share) → `'/livelocale-demo/'`; `'http://localhost:3020/livelocale-demo/about/'` (share) → `'/livelocale-demo/about/'`; `'/مدونة/'` (dev) → `'/%D9%85%D8%AF%D9%88%D9%86%D8%A9/'`.
  - `refuses inputs that resolve to another origin`: `'//evil.example/'`, `'/\\evil.example/'`, `'\\\\evil.example'`, `'http://localhost:3000.evil.example/'`, `'https://localhost:3000/'`, `'javascript:alert(1)'`, `'data:text/html,x'`, `'mailto:a@b.c'` → null (dev).
  - `refuses paths outside the base`: `'/../other-site/'`, `'http://localhost:3020/other-site/'` → null (share); `'http://localhost:3020/livelocale-demo'` → `'/livelocale-demo'`.
  - `withPageLocale`: `('/about/', '/?locale=ar', 'ar', {})` → `'/about/?locale=ar'`; `('/about/', '/', 'ar', {})` → `'/about/'`; `('/fr/about', '/ar/', 'ar', {})` → `'/fr/about'`; with `{ basePath: '/livelocale-demo/', locales: ['en', 'ar'] }`: `('/livelocale-demo/about/', '/livelocale-demo/ar/', 'ar', o)` → `'/livelocale-demo/about/?locale=ar'`.
  - `frameSrc('/about/?locale=ar', 'http://localhost:3020', 'http://localhost:3010')` → `'http://localhost:3020/about/?locale=ar&livelocale-origin=http%3A%2F%2Flocalhost%3A3010'`.
  - `studio-runtime.test.ts`: `appBasePath()` is `'/'` for a server runtime, the manifest's `basePath` for a static one, and the app URL's path when `basePath` is null.
- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/unit/page-address.test.ts tests/unit/studio-runtime.test.ts`, FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run them to see them pass** — same command plus `tests/unit/locale-inference.test.ts`, PASS.
- [ ] **Step 5: Commit** — `git add src/studio/page-address.ts src/studio/runtime.ts tests/unit/page-address.test.ts tests/unit/studio-runtime.test.ts`, `git commit -m "feat(studio): page address model for the preview"`.

---

### Task 5: Recent pages store and suggestions

**Files:**

- Create: `src/studio/recent-pages.ts`
- Modify: `src/studio/share/browser.ts` (`PrefName` gains `` `recent-pages:${string}` ``)
- Test: `tests/unit/recent-pages.test.ts` (new)

**Interfaces:**

- Consumes: `readPref`/`writePref` (their try/catch and in-memory fallback), `draftScope` (`src/studio/transport/drafts.ts`).
- Produces in `recent-pages.ts`:
  - `RECENT_PAGES_MAX = 20`, `SUGGESTIONS_MAX = 8`.
  - `recentPagesScope(runtime: { kind: 'server'; appOrigin: string } | { kind: 'static'; manifest: Pick<ShareManifest, 'repo'>; appUrl: string }): string` — static: `draftScope(manifest, appUrl)`; server: `'app:' + appOrigin`.
  - `readRecentPages(scope: string): string[]` — the stored JSON array's string entries that start with `/`, de-duplicated, at most 20; `[]` for anything unreadable.
  - `rememberPage(scope: string, displayPath: string): string[]` — stores the path without its hash, first, de-duplicated, at most 20; returns the new list.
  - `suggestPages(query: string, recent: readonly string[], site: readonly string[]): { recent: string[]; site: string[] }` — case-insensitive substring match of the trimmed query (empty matches all); recent first, site pages minus those already in recent; at most 8 in total; site pages come from at most the first `MAX_MANIFEST_PAGES` entries.

- [ ] **Step 1: Write the failing tests** (jsdom, `localStorage.clear()` before each):
  - `remembers most recent first, without duplicates or hash`: remember `/a`, `/b`, `/a#x` → `['/a', '/b']`; `readRecentPages` gives the same; a second scope stays empty.
  - `keeps at most 20`: 25 paths → 20, newest first.
  - `survives corrupt or blocked storage`: stored `'not json'`, `'{}'`, `'[1,"x","/ok",null]'`, and 500 entries give `[]`, `[]`, `['/ok']`, 20 entries; with `localStorage.getItem`/`setItem` stubbed to throw, `rememberPage` returns `['/a']` and `readRecentPages` returns `['/a']` (memory fallback).
  - `scopes like drafts`: `recentPagesScope({ kind: 'static', manifest: { repo: 'acme/site' }, appUrl: 'https://x.io/demo/' })` → `'acme/site'`; without repo → `'path:/demo/'`; server `http://localhost:3000` → `'app:http://localhost:3000'`.
  - `suggests recent first, then site pages, at most 8`: `suggestPages('', ['/b', '/a'], ['/', '/a', '/c'])` → `{ recent: ['/b', '/a'], site: ['/', '/c'] }`; `suggestPages('ABO', ['/about/'], ['/about/team/'])` → `{ recent: ['/about/'], site: ['/about/team/'] }`; 10 recent + 10 site → `recent.length === 8`, `site.length === 0`.
- [ ] **Step 2: Run it to see it fail** — `npx vitest run tests/unit/recent-pages.test.ts`, FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run it to see it pass** — same command plus `tests/unit/studio-preferences.test.tsx`, PASS.
- [ ] **Step 5: Commit** — `git add src/studio/recent-pages.ts src/studio/share/browser.ts tests/unit/recent-pages.test.ts`, `git commit -m "feat(studio): remember recently visited preview pages"`.

---

### Task 6: The address field combobox

**Files:**

- Create: `src/studio/features/dashboard/components/AddressBar.tsx`
- Modify: `src/studio/i18n/en.ts`, `src/studio/i18n/ar.ts`
- Test: `tests/unit/address-bar.test.tsx` (new), `tests/unit/studio-accessible-names.test.tsx`

**Interfaces:**

- Produces: `export type NavigateResult = 'ok' | 'refused';` and
  `export interface AddressBarProps { path: string; pendingPath: string | null; recent: readonly string[]; sitePages: readonly string[]; onNavigate: (input: string) => NavigateResult; }` and `AddressBar(props: AddressBarProps)`. `path` and `pendingPath` are display paths; the field shows `pendingPath ?? path` while not being edited.
- Produces DOM contract (E2E and Task 7 rely on it): input `id="studio-address"`, `data-testid="address-field"`, `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls="studio-address-list"`, `aria-activedescendant` of the active option, `dir="ltr"`, monospace, `aria-label={t('viewer.address_label')}`; listbox `id="studio-address-list"` `role="listbox"`, groups `role="group"` labelled by headings `id="studio-address-recent"` / `id="studio-address-site"` (a group renders only when it has options); options `role="option"`, `id="studio-address-option-<n>"`, `data-testid="address-option"`, `data-path=<path>`, `aria-selected` on the active one, text `dir="ltr"`. Refusal: `aria-invalid="true"` on the input and a message `id="studio-address-error"` `role="alert"` referenced by `aria-describedby`. Empty state (open, no options at all, empty query): `id="studio-address-empty"` `role="status"`, and `aria-expanded="false"`.
- Behaviour: focus, typing or Alt+ArrowDown opens the list with `suggestPages(query, recent, sitePages)` (query is empty right after focus, so all pages show); ArrowDown/ArrowUp move the active option (wrapping); Enter navigates the active option's path, else the typed value; Escape closes an open list, a second Escape restores `path` (focus stays); blur restores `path` and closes. On `'refused'` the typed text stays with the error; the next edit clears the error. On `'ok'` the list closes and the edit ends.
- Copy (English pinned for tests; Arabic for owner review):

| key                      | en                                      | ar                                    |
| ------------------------ | --------------------------------------- | ------------------------------------- |
| `viewer.address_label`   | `Page address`                          | `عنوان الصفحة`                        |
| `viewer.address_refused` | `Only pages on this site can open here` | `لا تُفتح هنا إلا صفحات هذا الموقع`   |
| `viewer.pages_recent`    | `Recent pages`                          | `الصفحات الأخيرة`                     |
| `viewer.pages_site`      | `Site pages`                            | `صفحات الموقع`                        |
| `viewer.pages_empty`     | `No pages yet: open one in the preview` | `لا صفحات بعد: افتح صفحة في المعاينة` |

- [ ] **Step 1: Write the failing tests** in `address-bar.test.tsx` (render outside a provider, `fireEvent`):
  - `shows the current path, or the pending one`: `path '/pricing'` → input value `/pricing`, `dir="ltr"`, name `Page address`; with `pendingPath '/about/'` → `/about/`.
  - `lists recent then site pages in labelled groups`: focus with `recent ['/b']`, `sitePages ['/', '/b', '/c']` → `aria-expanded="true"`, group `Recent pages` holds `/b`, group `Site pages` holds `/`, `/c`.
  - `filters by what is typed`: typing `c` leaves only `/c`.
  - `moves with arrows and opens the active option on Enter`: ArrowDown twice then Enter → `onNavigate('/')` (second option), `aria-activedescendant` pointed at `studio-address-option-1` before Enter.
  - `navigates the typed value on Enter`: type `pricing`, Enter → `onNavigate('pricing')`.
  - `shows the refusal and keeps the text`: `onNavigate` returns `'refused'` → `role="alert"` text `Only pages on this site can open here`, `aria-invalid="true"`, value kept; typing again removes the alert.
  - `Escape closes, then restores; blur restores`: type `x`, Escape → `aria-expanded="false"`, value `x`; Escape → `/pricing`, input still `document.activeElement`; type `y`, blur → `/pricing`.
  - `shows the empty state with no pages`: focus with no recent and no site pages → status `No pages yet: open one in the preview`, `aria-expanded="false"`.
  - `studio-accessible-names.test.tsx`: `names the page address field` (`AddressBar` with minimal props has an accessible name; `studio-colour-guard` and `studio-focus-ring` scans include the new file automatically — confirm both stay green).
- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/unit/address-bar.test.tsx tests/unit/studio-accessible-names.test.tsx`, FAIL.
- [ ] **Step 3: Implement** `AddressBar` with token classes only (`bg-raised`, `border-line`, `text-fg`, `text-fg-muted`, `text-danger-fg`, `bg-raised-hover` for the active option) and the catalogue keys.
- [ ] **Step 4: Run them to see them pass** — `npx vitest run tests/unit/address-bar.test.tsx tests/unit/studio-accessible-names.test.tsx tests/unit/studio-i18n.test.ts tests/unit/studio-no-hardcoded-copy.test.ts tests/unit/studio-colour-guard.test.ts tests/unit/studio-focus-ring.test.ts tests/unit/studio-logical-properties.test.ts`, PASS.
- [ ] **Step 5: Commit** — `git add src/studio/features/dashboard/components/AddressBar.tsx src/studio/i18n/en.ts src/studio/i18n/ar.ts tests/unit/address-bar.test.tsx tests/unit/studio-accessible-names.test.tsx`, `git commit -m "feat(studio): page address combobox"`.

---

### Task 7: Navigation wiring and the reload fix

**Files:**

- Create: `src/studio/features/dashboard/hooks/usePageNavigation.ts`
- Modify: `src/studio/features/dashboard/components/IframeViewer.tsx` (dots → `AddressBar`, reload from the hook, `navigation` prop), `src/studio/features/dashboard/hooks/useStudio.ts` (call the hook, pass `navigation.reload` as the review's `reloadFrame`, return `navigation`), `src/studio/app.tsx` (pass it)
- Test: `tests/unit/page-navigation-hook.test.tsx` (new), `tests/unit/studio-connection-help.test.tsx`, `tests/unit/studio-accessible-names.test.tsx` (props)

**Interfaces:**

- Consumes: Task 1 `useConnection` (`currentPath`, `locationKnown`, `locationSeq`, `connectionStatus`, `sendToIframe`, `iframeRef`); Task 2 `NAVIGATE`; Task 3 `manifest.pages`; Task 4 `toDisplayPath`, `resolveAddress`, `withPageLocale`, `frameSrc`, `appBasePath`, `urlLocaleOptions`; Task 5 `recentPagesScope`, `readRecentPages`, `rememberPage`; Task 6 `AddressBarProps`, `NavigateResult`.
- Produces: `NAVIGATION_TIMEOUT_MS = 15000` and
  `usePageNavigation(input: { iframeRef: React.RefObject<HTMLIFrameElement>; connectionStatus: ConnectionStatus; currentPath: string; locationKnown: boolean; locationSeq: number; locale: string; sendToIframe: (type: string, payload?: unknown) => void }): PageNavigation` with
  `interface PageNavigation extends AddressBarProps { isNavigating: boolean; reload: () => void }`.
  - `path` = `toDisplayPath(currentPath, ctx)` where `ctx = { appOrigin: getAppOrigin(), base: appBasePath(), hideLocale: runtime.kind === 'server' ? locale : null }`.
  - `recent` re-read after `rememberPage(scope, path)` on every `locationSeq` change while `locationKnown`; `sitePages` = static manifest `pages` (first 2,000) or `[]`.
  - `onNavigate(input)`: `resolveAddress` null → `'refused'`; else `target = withPageLocale(resolved, currentPath, locale, urlLocaleOptions())`, `pendingPath = toDisplayPath(target, ctx)`, then `go(target)` → `'ok'`.
  - `go(appPath)`: connected → `sendToIframe('NAVIGATE', { url: new URL(appPath, appOrigin).href })`; otherwise `iframeRef.current.src = frameSrc(appPath, appOrigin, window.location.origin)`.
  - `reload()`: `locationKnown` → `go(currentPath)` with `pendingPath = path`; otherwise re-assigns `iframeRef.current.src` as 0.11 did.
  - `pendingPath` clears on the next `locationSeq` change or after `NAVIGATION_TIMEOUT_MS`; `isNavigating = pendingPath !== null`.
- Produces: `IframeViewer` takes `navigation: PageNavigation` instead of `currentPath`; the reload button gets `data-testid="reload-frame"`, is `disabled={navigation.isNavigating}` and calls `navigation.reload`; `AddressBar` sits where the window dots were, `flex-1 min-w-0`, and the status/reload group keeps its natural width (drop the two `w-1/3`). `useStudio` returns `navigation`.

- [ ] **Step 1: Write the failing tests** in `page-navigation-hook.test.tsx` (`renderHook`, fake timers, a server runtime on `http://localhost:3000`, and a static runtime via `setStudioRuntime` with `basePath '/livelocale-demo/'`, `pages ['/', '/about/']`; `resetStudioRuntime()` after each):
  - `sends NAVIGATE when connected`: connected, `currentPath '/'`, `onNavigate('/pricing')` → `'ok'`, `sendToIframe` called with `('NAVIGATE', { url: 'http://localhost:3000/pricing' })`, `pendingPath '/pricing'`, `isNavigating true`.
  - `keeps the preview's language`: `currentPath '/?locale=ar'`, `locale 'ar'` → `NAVIGATE` url `http://localhost:3000/pricing?locale=ar`, `path` shown is `/`.
  - `falls back to the iframe src when not connected`: `connectionStatus 'connecting'` → no `sendToIframe`; `iframeRef.current.src === 'http://localhost:3000/pricing?livelocale-origin=' + encodeURIComponent(location.origin)`.
  - `refuses another origin`: `onNavigate('//evil.example/')` → `'refused'`, nothing sent, src untouched.
  - `shows share paths relative to the base and lists site pages`: static, `currentPath '/livelocale-demo/about/'` → `path '/about/'`, `sitePages ['/', '/about/']`; `onNavigate('/')` sends `http://localhost:3020/livelocale-demo/`.
  - `reload reopens the current page`: after a `LOCATION_CHANGED`-style rerender with `currentPath '/b?x=1'`, `reload()` sends `NAVIGATE` for `http://localhost:3000/b?x=1`; before any location (`locationKnown false`) it re-assigns the existing `src`.
  - `clears pending on the next location or after the timeout`: `pendingPath` null after rerender with `locationSeq + 1`; in a second case, null after `vi.advanceTimersByTime(15000)` with no new location.
  - `remembers each reported page`: rerenders with `locationSeq` 1 (`/a`) and 2 (`/b`) → `recent ['/b', '/a']`.
  - `studio-connection-help.test.tsx` / `studio-accessible-names.test.tsx`: replace `currentPath` with a `navigation` stub (`{ path: '/', pendingPath: null, recent: [], sitePages: [], onNavigate: vi.fn(() => 'ok'), isNavigating: false, reload: vi.fn() }`); add `reload is disabled while navigating` (`isNavigating: true` → the `Reload Frame` button is disabled) and `reload calls navigation.reload`.
- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/unit/page-navigation-hook.test.tsx tests/unit/studio-connection-help.test.tsx tests/unit/studio-accessible-names.test.tsx`, FAIL.
- [ ] **Step 3: Implement** the hook, the `IframeViewer`/`useStudio`/`app.tsx` changes.
- [ ] **Step 4: Run the whole unit suite and typecheck** — `npm test; npm run typecheck; npm run lint`, all exit 0.
- [ ] **Step 5: Commit** — `git add src/studio/features/dashboard src/studio/app.tsx tests/unit/page-navigation-hook.test.tsx tests/unit/studio-connection-help.test.tsx tests/unit/studio-accessible-names.test.tsx`, `git commit -m "feat(studio): open any page from the preview's address field"`.

---

### Task 8: End-to-end in dev and share mode, axe on the open list

**Files:**

- Create: `tests/e2e/page-navigation.spec.ts`
- Modify: `tests/e2e/a11y-axe.spec.ts` (one dev screen, one share test per variant)

**Interfaces:**

- Consumes: Task 6 DOM contract; `connection-status`; `openStudio`-style tips dismissal by ids (`#studio-tips-name`, `#studio-tips-start`); the static fixture on 3020 (`playground-vite` has `/` and `/about/`, `#to-about` links to `/about/`).
- Helper in the spec: `frameUrl(page) = (await (await page.locator('#app-preview-iframe').elementHandle())!.contentFrame())!.url()`.

- [ ] **Step 1: Prepare servers.** `npm run build`. Check ports 3000/3010/3020 (`netstat -ano | findstr ":3000 :3010 :3020"`); if something listens, it is reused and may be stale: stop servers this session started; ask the owner before stopping anything else (their own Studio dev may hold 3010). If a stale 3020 server is kept, run `npm run build --prefix playground-vite` so it serves the new build.
- [ ] **Step 2: Write the tests** in `page-navigation.spec.ts`:
  - dev `shows the page and follows client-side navigation`: open `http://localhost:3010`, connected; `#studio-address` has value `/`; in the frame `history.pushState({}, '', '/?tab=2')` → field value `/?tab=2` (no `livelocale-origin`).
  - dev `opens a typed path and reload stays there`: fill `#studio-address` with `/?tab=3`, Enter → `frameUrl` matches `/\/\?tab=3/` and connected again; click `[data-testid="reload-frame"]` → `frameUrl` still matches `?tab=3`.
  - dev `refuses another origin`: type `//example.com/`, Enter → `#studio-address-error` visible, `frameUrl` unchanged.
  - share `lists site pages and opens one`: open `http://localhost:3020/livelocale/index.html`, dismiss tips, connected; focus `#studio-address` → `#studio-address-site` group contains options with `data-path="/about/"`; ArrowDown to it, Enter → `frameUrl` ends with `/about/` (plus any `?locale=`), field value `/about/`; focus again → the recent group lists `/about/` first.
  - share `follows a link click`: click `#to-about` inside the frame → field value `/about/`.
  - share `works in the Arabic Studio`: with `STUDIO_LANGUAGE_KEY='ar'` → `studio-root` `dir="rtl"`, `#studio-address` has `dir="ltr"`, navigation to `/about/` works as above.
- [ ] **Step 3: Add axe coverage** in `a11y-axe.spec.ts`: `DEV_SCREENS.address` (`reach`: focus `#studio-address`, expect `#studio-address-list` visible — the current page is already remembered); in the share describe, `${variant.name} address has no serious axe violations` (dismiss tips, focus `#studio-address`, `#studio-address-list` visible, `noSeriousViolations`). Both run for all four variants (dark/light × en/ar).
- [ ] **Step 4: Run** — `npx playwright test tests/e2e/page-navigation.spec.ts tests/e2e/a11y-axe.spec.ts`, all pass; then `npx playwright test` (whole suite), all pass.
- [ ] **Step 5: Commit** — `git add tests/e2e/page-navigation.spec.ts tests/e2e/a11y-axe.spec.ts`, `git commit -m "test(e2e): page navigation in dev and share Studios"`.

---

### Task 9: README note and changeset

**Files:**

- Modify: `README.md` (section "5. Launch the Visual Studio" and the `pack` section)
- Create: `.changeset/studio-page-navigation.md`

- [ ] **Step 1: README.** Under "5. Launch the Visual Studio", one short paragraph: the preview bar's address field shows the current page; type a path and press Enter to open it in the current language; suggestions list recent pages and, on a share link, every page of the site; Reload reloads the page you are on. In the `pack` section, one sentence: `manifest.json` now lists the site's HTML pages (`pages`, at most 2,000) for the Studio's suggestions.
- [ ] **Step 2: Changeset** `.changeset/studio-page-navigation.md`:

```md
---
'livelocale': minor
---

The Studio's preview bar has an address field: it shows the current page (also after client-side navigation), opens a typed path in the current language, suggests recent pages and, on a share link, every page of the site (`pack` now lists them in `manifest.json`). Reload reloads the page you are on.
```

- [ ] **Step 3: Verify** — `npm run format:check; npx vitest run tests/unit/readme-check.test.ts tests/unit/readme-share.test.ts`, exit 0.
- [ ] **Step 4: Commit** — `git add README.md .changeset/studio-page-navigation.md`, `git commit -m "docs: document the Studio's page address field"`.

---

### Task 10: `0.12.0-next` prerelease and the smoke check

**Files:** none in this repo unless the smoke check finds a bug (then the owning task's files and a failing test first).

**Interfaces:**

- Consumes: the Publish workflow's manual run (`.github/workflows/publish.yml`, input `prerelease_base`), which publishes `<base>-next.<run number>` to the `next` dist-tag.
- Produces: a verified `livelocale@next`.

- [ ] **Step 1: Full local gate.** `npm run build; npm run test:coverage; npx playwright test; npm run typecheck; npm run lint; npm run format:check` — all exit 0.
- [ ] **Step 2: Owner actions.** Once the owner says yes in chat, push `feat/0.12` and open a PR to `main` (`gh pr create --base main --head feat/0.12`) titled `feat: 0.12.0 Studio page navigation`; no Claude, Anthropic or AI mention and no `Co-Authored-By` or "Generated with" line in the title, body or any commit (check `git log main..feat/0.12 --format=%B`). The owner merges, then runs Actions → Publish to NPM with `prerelease_base` = `0.12.0` (or, only after a yes in chat, `gh workflow run publish.yml -f prerelease_base=0.12.0`). Verify: `npm view livelocale dist-tags.next` prints `0.12.0-next.<n>`.
- [ ] **Step 3: Translation-Test (dev Studio).** `git clone https://github.com/Araby99/Translation-Test <scratchpad>/tt`, `npm ci`, `npm i -D livelocale@next --no-save`, start its dev server and Studio as its README says. Check: the field shows `/`; clicking an in-app link updates it; typing a path opens it; Reload stays on it; a foreign URL is refused; switching the Studio to Arabic mirrors the bar with the field still left-to-right.
- [ ] **Step 4: Tidewell (share mode).** `git clone https://github.com/Araby99/tidewell <scratchpad>/tidewell`, `npm ci`, `npm i -D livelocale@next --no-save`, build with the share link as its README says and serve the output locally (or use `node <repo>/tests/e2e/fixtures/static-server.mjs <out> 3030`). Check: `livelocale/manifest.json` has `pages` covering the site's pages; the share Studio's suggestions show the Site pages group; picking a deep page opens it in the current language; the address shows the path relative to the base; Arabic as in Step 3.
- [ ] **Step 5: Leave both demos untouched** — nothing is committed or pushed there.
- [ ] **Step 6: Report** to the owner: the prerelease version, each check's result, and the new Arabic strings (Task 6 table) for their review. Any failure: failing test in the owning task, fix, commit `fix(<area>): <what>`, new prerelease, repeat Steps 1–6.

---

### Task 11: Prepare the 0.12.0 release commit

**Files:**

- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md` (by `npm run version`); `.changeset/studio-page-navigation.md` is consumed

**Interfaces:**

- Consumes: Task 10 passed; the owner approved the Arabic strings in chat.
- Produces: one release commit on `release/0.12.0` and its PR. The owner merges it and creates the GitHub release `v0.12.0`; this task never tags, releases or publishes.

- [ ] **Step 1: Confirm both preconditions** in the conversation; stop and ask the owner if either is missing.
- [ ] **Step 2: Apply the changeset** — `git switch main; git pull; git switch -c release/0.12.0; npm run version` — `version` is `0.12.0`, `CHANGELOG.md` starts with `## 0.12.0`, `.changeset/` holds only `README.md` and `config.json`.
- [ ] **Step 3: Verify** — `npm run build; npm test; npx playwright test; npm run typecheck; npm run lint; npm run format:check` all exit 0; `node -p "require('./package.json').dependencies"` prints `undefined`.
- [ ] **Step 4: Commit** — `git add package.json package-lock.json CHANGELOG.md .changeset`, `git commit -m "chore: release 0.12.0"`.
- [ ] **Step 5: Hand off.** Once the owner says yes in chat, push `release/0.12.0` and open a PR titled `chore: release 0.12.0` (same no-attribution rule). Tell the owner: merge it, then create the GitHub release `v0.12.0` from the merge commit. Afterwards (owner, spec §6): re-record the website's hero video and docs captures, add the "Go to a page" docs section, then put the site live.
