# Studio Page Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An address field with recent and site-page suggestions in the Studio's preview bar that always shows the current page, opens any page of the site in the current language, and makes Reload reload the page you are on.

**Architecture:** The client runtime reports every location change (`LOCATION_CHANGED`), says when its document goes away (`LEAVING`), and obeys a same-origin `NAVIGATE`. `pack` lists the site's HTML pages in the manifest as an optional `pages` field, read leniently. The Studio side is a pure path model (`page-address.ts`), a recent-pages store (`recent-pages.ts`), a presentational combobox (`AddressBar.tsx`) and one hook (`usePageNavigation.ts`) that wires them to the iframe.

**Tech Stack:** TypeScript, React 18, Vite (Studio), tsup (package), Vitest + Testing Library (jsdom), Playwright + axe-core.

**Spec:** `docs/superpowers/specs/2026-11-03-studio-page-navigation-design.md`

## Global Constraints

- No runtime dependencies (`node -p "require('./package.json').dependencies"` prints `undefined`); `src/core` stays browser-safe (`tests/unit/core-browser-safe.test.ts`).
- Manifest backward compatible: `pages` is optional; a 0.12 Studio works with a 0.11 manifest (no site pages group); a 0.11 Studio ignores `pages`. A malformed `pages` never makes a manifest invalid (it is a convenience; the share Studio must not go dark over it): `isShareManifest` ignores it and the Studio reads it only through `manifestPages` (Task 3).
- Message validation and origin checks are as strict as the existing protocol; the client never navigates to another origin.
- Existing behaviour and tests stay green; the server-mode Studio works as in 0.11 apart from the new field.
- Caps: suggestions show at most 8; recent pages keep at most 20; the manifest lists at most 2,000 pages (more are truncated with a warning).
- Copy: every new string is an en/ar catalogue key (`src/studio/i18n/en.ts`, `ar.ts`); the owner reviews the new Arabic before `latest`.
- 0.11 accessibility rules (plan 2026-11-01, "Accessibility tasks: shared rules") apply: focus is drawn only by the global `:focus-visible` rule (no `focus:` outline/ring/border utilities, no `outline-none`); colours only from the token classes (`studio-colour-guard.test.ts`); E2E reaches controls by id or test id and waits on `connection-status` `data-status="connected"`, never on English text; unit tests render outside a provider and may query English names.
- Commit messages never mention Claude, Anthropic or AI; no `Co-Authored-By`, no "Generated with".
- E2E servers (`playwright.config.ts`): Next playground on 3000, Studio dev on 3010, `playground-vite/dist` (built with `share: true`) on 3020, all with `reuseExistingServer` outside CI. Both playgrounds consume the package as `file:..`, so run `npm run build` before E2E and make sure nothing stale holds those ports (the owner's own Studio dev may sit on `[::1]:3010`; ask before stopping it).

## Review Focus

1. A typed `//evil.example`, `/\evil.example`, `http://localhost:3020.evil.example/` or `http://u:p@localhost:3000/` must be refused, not opened: the URL parser treats `\` as `/` and `//` as a host (Task 4 test `refuses inputs that resolve to another origin`, Task 2 `navigationHref` refusals).
2. In share mode under `/livelocale-demo/`, `/../other-site/`, `/%2e%2e/other-site/` or a full same-origin URL outside the base must be refused, since another site may live on the same origin; so must the share folder itself (`/livelocale/index.html`), which would load the Studio inside its own preview (Task 4 test `refuses paths outside the base or into the share folder`).
3. After the preview lands on a page without the livelocale client (the static host's 404, an un-instrumented page), the next typed path and Reload must still work: a `NAVIGATE` posted to that page is lost, and `connectionStatus` never leaves `connected` (Task 1 `LEAVING`, Task 7 test `falls back to the iframe src once the client has left`, Task 8 test `recovers after a page without the client`).
4. Switching the Studio's language (server mode) after opening `/pricing` must stay on `/pricing`: 0.11 rebuilds the frame from `iframe.src`, which `NAVIGATE` never updates (Task 7 test `switching the language keeps the current page`).
5. Arabic or other non-ASCII slugs must show readably (`/مدونة/`, not `/%D9%85...`), keep their segment order in the list, and match the same page from the manifest and from recent pages, while ASCII escapes (`%25`, `%20`, `%23`) stay encoded so the shown path round-trips (Task 3 tests `lists non-ASCII pages as written`, `escapes what a path cannot hold`; Task 4 test `shows non-ASCII paths decoded`; Task 6 test `keeps path segments in order`).

---

### Task 1: Client reports every location change, and when it leaves

**Files:**

- Create: `src/client/location-watch.ts`
- Modify: `src/client/iframe-bridge.ts` (message types, `toLocationUrl`, sanitising), `src/client/index.ts` (start the watcher; `READY` url adds `location.hash`; `LEAVING` on `pagehide`; `READY` again on a back-forward-cache `pageshow`)
- Modify: `src/studio/features/dashboard/hooks/useConnection.ts` (handle `LOCATION_CHANGED` and `LEAVING`, expose `locationKnown`, `locationSeq`)
- Test: `tests/unit/location-watch.test.ts` (new), `tests/unit/studio-hooks.test.tsx` (`useConnection` block), `tests/integration/client-same-origin.test.ts`

**Interfaces:**

- Produces: `ClientMessageType` gains `'LOCATION_CHANGED'` (payload `{ url?: string }`) and `'LEAVING'` (no payload).
- Produces: `MAX_LOCATION_LENGTH = 2048`; `toLocationUrl(payload: unknown): string | null` in `iframe-bridge.ts`: the `url` own string of an object payload when it starts with `/`, does not start with `//` or `/\`, and is at most `MAX_LOCATION_LENGTH` long; else null. Never throws.
- Produces: `sendToParent('READY' | 'LOCATION_CHANGED', payload)` sends `{ url }` when `toLocationUrl(payload)` is non-null and `{}` otherwise. Neither message is ever dropped: a page whose address is too long (or whose path starts with `//`) must still connect, and the Studio must learn that it no longer knows the location.
- Produces: `watchLocation(win: Window, report: (url: string) => void, schedule?: (cb: () => void) => void): () => void` in `location-watch.ts`. Default `schedule` is `win.requestAnimationFrame`, or `setTimeout(cb, 16)` where that is missing (jsdom without `pretendToBeVisual`). It installs at most one wrapper each on `win.history.pushState`/`replaceState`; the set of subscribers lives on the wrapper under `Symbol.for('livelocale.locationWatch')`, so a second watcher, a second copy of the module (two bundles, HMR, `vi.resetModules`) subscribes to the existing wrapper instead of wrapping again. The wrapper is `function (this: History, ...args) { const result = original.apply(this, args); notify(); return result; }`: it passes `this`, the arguments and the return value through, rethrows what the original throws (then nothing is scheduled), and never calls `report` synchronously. Each watcher also listens to `popstate` and `hashchange`, coalesces to one scheduled report of `pathname + search + hash` read when the callback runs, and skips a report equal to its last one (initially the URL at start, which `READY` carries). A throwing `report` is caught so it cannot break the app's navigation. The cleanup removes its listeners and its subscriber; the last one out puts the originals back only when `win.history.pushState`/`replaceState` are still the wrappers (another library may have wrapped on top; then the wrapper stays and forwards with no subscribers).
- Produces: `useConnection` returns, in addition, `locationKnown: boolean` and `locationSeq: number`. From the app origin only: `READY` sets `connected` (as today) whatever its payload; with a valid url (`toLocationUrl`) it sets `currentPath`, `locationKnown = true`, increments `locationSeq`, resets `visibleKeys` and runs `localeFromUrl(...)` → `onLocaleDetected` as today; without one it sets `locationKnown = false`. `LOCATION_CHANGED` with a valid url does the same minus the `connected` and `visibleKeys` changes (the interceptor's mutation observer reports the new keys); without one it sets `locationKnown = false`. `LEAVING` sets `locationKnown = false` and changes nothing else (no `connecting` overlay on every link click). `locationKnown` therefore means "the document now in the frame has a live client at `currentPath`", which Task 7 uses to choose between `NAVIGATE` and the iframe `src`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/location-watch.test.ts` (`// @vitest-environment jsdom`), with a manual scheduler `const queue: (() => void)[] = []; const schedule = (cb) => queue.push(cb); const flush = () => queue.splice(0).forEach((cb) => cb());`, every watcher cleaned up in `afterEach`:

- `reports pushState, replaceState, popstate and hashchange`: after `history.pushState({}, '', '/a?x=1')` and `flush()`, `report` was called with `'/a?x=1'`; same for `replaceState('/b')`, `location.hash = '#h'` + dispatched `hashchange` (`'/b#h'`), and a dispatched `popstate` after `History.prototype.replaceState.call(history, {}, '', '/c')` (bypassing the wrapper) → `'/c'`.
- `coalesces a burst into one report and skips unchanged URLs`: ten `pushState`s to `/1`…`/10` then `flush()` → exactly one call, `'/10'`; `replaceState` to the current URL then `flush()` → no call.
- `passes this, arguments and the return value through`: before watching, `history.pushState = vi.fn(function (this: unknown) { return 'r'; })`; after watching, `history.pushState(1, '', '/x')` returns `'r'` and the fake saw `this === history` and args `[1, '', '/x']`; with a fake that throws `new Error('boom')`, `history.pushState(...)` throws `boom` and `queue` stays empty.
- `wraps history once and restores it on cleanup`: two `watchLocation` calls leave one wrapper (each watcher's `report` called once per change, the original once per `pushState`); after both cleanups `history.pushState` is the original function; when another function was assigned over the wrapper before cleanup, cleanup leaves that function in place.
- `shares one wrapper across module copies`: `watchLocation` from the module, then `vi.resetModules()` and `watchLocation` from a fresh `await import(...)` → still one wrapper (original called once per `pushState`), both reports fire.
- `a throwing report does not break navigation`: `report` throws → `pushState` returns normally, `flush()` does not throw.

`tests/unit/studio-hooks.test.tsx`, `useConnection` block:

- `follows LOCATION_CHANGED from the app origin`: after `READY { url: '/' }` then `LOCATION_CHANGED { url: '/fr/pricing' }`, `currentPath === '/fr/pricing'`, `locationSeq === 2`, `locationKnown === true`, `onLocaleDetected` called with `'fr'`.
- `ignores foreign LOCATION_CHANGED and forgets the location on a malformed one`: a well-formed `LOCATION_CHANGED` from another origin changes nothing (`locationKnown` stays true); payloads `{ url: '//evil.example/' }`, `{ url: 'https://x/' }`, `{ url: 42 }`, `{}`, `{ url: '/' + 'a'.repeat(2048) }` each leave `currentPath` and `locationSeq` unchanged and set `locationKnown` to false.
- `connects on a READY without a usable url`: `READY {}` → `connectionStatus === 'connected'`, `locationKnown === false`, `currentPath === '/'`.
- `forgets the location on LEAVING`: `READY { url: '/a' }` then `LEAVING` → `locationKnown === false`, `connectionStatus === 'connected'`, `currentPath === '/a'`, `locationSeq === 1`.

`tests/integration/client-same-origin.test.ts` (it already boots `src/client/index.ts` under a fake same-origin parent):

- `reports a client-side navigation`: after boot, `history.pushState({}, '', '/next?x=1')` → `await vi.waitFor(...)` sees `parent.postMessage` with `{ source: 'livelocale-client', type: 'LOCATION_CHANGED', payload: { url: '/next?x=1' } }` on `OWN`.
- `says when the page goes away and greets again from the back-forward cache`: dispatching `new Event('pagehide')` posts `{ type: 'LEAVING' }`; dispatching `new PageTransitionEvent('pageshow', { persisted: true })` posts `READY` again with the current url; a `pageshow` with `persisted: false` posts nothing.
- The existing `READY { url: '/' }` assertion stays unchanged (the hash is empty).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/unit/location-watch.test.ts tests/unit/studio-hooks.test.tsx tests/integration/client-same-origin.test.ts`
Expected: FAIL (`location-watch.js` not found; `locationSeq` undefined; no `LOCATION_CHANGED` posted).

- [ ] **Step 3: Implement** `watchLocation`, `toLocationUrl`, the `READY`/`LOCATION_CHANGED` sanitising in `sendToParent`, and in `src/client/index.ts`: `READY` with `pathname + search + hash`, then `watchLocation(window, (url) => bridge.sendToParent('LOCATION_CHANGED', { url }))`, `pagehide` → `sendToParent('LEAVING')`, `pageshow` with `persisted` → `READY` again; then the `useConnection` changes.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/unit/location-watch.test.ts tests/unit/studio-hooks.test.tsx tests/unit/studio-origin.test.ts tests/integration/client-same-origin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/location-watch.ts src/client/iframe-bridge.ts src/client/index.ts src/studio/features/dashboard/hooks/useConnection.ts tests/unit/location-watch.test.ts tests/unit/studio-hooks.test.tsx tests/integration/client-same-origin.test.ts
git commit -m "feat(client): report client-side navigations to the Studio"
```

---

### Task 2: Client obeys NAVIGATE on its own origin only

**Files:**

- Modify: `src/client/iframe-bridge.ts` (`StudioMessageType`, `navigationHref`, `followNavigation`), `src/client/index.ts` (handle `NAVIGATE`)
- Test: `tests/unit/studio-origin.test.ts` (new `describe('navigationHref')` and `describe('followNavigation')`)

**Interfaces:**

- Consumes: Task 1 `MAX_LOCATION_LENGTH`.
- Produces: `StudioMessageType` gains `'NAVIGATE'`, payload `{ url: string }` (an absolute URL).
- Produces: `navigationHref(payload: unknown, ownOrigin: string): string | null` in `iframe-bridge.ts`: the parsed `href` when the payload is an object whose own `url` is a string of at most `MAX_LOCATION_LENGTH` that parses (no base URL, so relative and protocol-relative input throws) as an `http:`/`https:` URL whose `origin === ownOrigin` and whose `username` and `password` are empty; else null. Never throws.
- Produces: `followNavigation(loc: Pick<Location, 'href' | 'assign' | 'reload'>, href: string): void`: `loc.reload()` when `href === loc.href`, else `loc.assign(href)`. (Assigning the current URL when it has a hash is a fragment navigation that reloads nothing, so Reload on `/b#faq` would otherwise do nothing and leave the Studio waiting.)
- Produces: the client's listener (already origin-checked against the Studio by `listenToParent`) calls `followNavigation(window.location, href)` for a non-null `navigationHref(payload, window.location.origin)` and ignores the message otherwise. No open redirect: the only reachable targets are the app's own origin, which the Studio's sender could already load by setting the iframe `src`.

- [ ] **Step 1: Write the failing tests**
  - `navigationHref` with own origin `http://localhost:3020`: `{ url: 'http://localhost:3020/about/?locale=ar#top' }` → same href.
  - Refused (null): `url` of `'http://evil.example/'`, `'http://localhost:3021/'`, `'https://localhost:3020/'`, `'http://localhost:3020.evil.example/'`, `'http://u:p@localhost:3020/'`, `'javascript:alert(1)'`, `'data:text/html,x'`, `'//evil.example/'`, `'/about/'` (relative), `'http://localhost:3020/' + 'a'.repeat(2048)`; payloads `{ url: 1 }`, `null`, `'http://localhost:3020/'` (a bare string), and an inherited `url` (`Object.create({ url: 'http://localhost:3020/' })`).
  - `followNavigation`: with `loc = { href: 'http://a/b#faq', assign: vi.fn(), reload: vi.fn() }`, `'http://a/b#faq'` → `reload` once, `assign` never; `'http://a/c'` → `assign('http://a/c')`, `reload` never.
- [ ] **Step 2: Run it to see it fail** — `npx vitest run tests/unit/studio-origin.test.ts`, FAIL (`navigationHref` is not exported).
- [ ] **Step 3: Implement** `navigationHref`, `followNavigation` and the `NAVIGATE` branch in `src/client/index.ts`.
- [ ] **Step 4: Run it to see it pass** — same command, PASS.
- [ ] **Step 5: Commit** — `git add src/client/iframe-bridge.ts src/client/index.ts tests/unit/studio-origin.test.ts`, `git commit -m "feat(client): open Studio-requested pages on the app's own origin"`.

---

### Task 3: The manifest lists the site's pages

**Files:**

- Create: `src/core/page-path.ts` (`readablePath`; browser-safe, shared by `pack` and the Studio)
- Modify: `src/core/share-manifest.ts` (`pages?`, `MAX_MANIFEST_PAGES`, `manifestPages`)
- Modify: `src/server/pack.ts` (`pagePathOf`, collect pages from every HTML document whether or not flags are injected, warning)
- Test: `tests/unit/page-path.test.ts` (new), `tests/unit/share-manifest.test.ts`, `tests/unit/pack.test.ts`, `tests/integration/vite-share-build.test.ts`

**Interfaces:**

- Produces: `readablePath(path: string): string` in `src/core/page-path.ts`: decodes only the percent-encoded UTF-8 sequences of non-ASCII characters (runs of `%80`–`%FF` bytes; a run that is not valid UTF-8 stays as given) and leaves every ASCII escape (`%20`, `%23`, `%25`, `%2F`, `%3F`) encoded, so the result parses back to the same URL. Never throws.
- Produces: `ShareManifest.pages?: string[]` — sorted (code units), site-relative paths (relative to `basePath`), each starting with `/`; absent when no HTML document was found (a Next.js `build` packs into `public/` before the build, so it has none).
- Produces: `MAX_MANIFEST_PAGES = 2000` in `share-manifest.ts`. `isShareManifest` does not look at `pages` (its "unknown fields are ignored" rule covers it), so a malformed `pages` from any build never blocks a share link.
- Produces: `manifestPages(manifest: object): string[]` in `share-manifest.ts`: the own `pages` array's string entries that start with `/` and not with `//`, de-duplicated, at most the first `MAX_MANIFEST_PAGES`; `[]` when absent or not an array. The Studio reads pages only through it.
- Produces: `pagePathOf(rel: string): string` in `pack.ts` (exported for tests): POSIX `rel` of an HTML file → `'/'` for `index.html`, `'/<dir>/'` for `<dir>/index.html`, else `'/' + rel` (keeps `.html`, which every static host serves); then `%`, `?` and `#` are escaped (`%25`, `%3F`, `%23`) and the result is put through `new URL(p, 'http://p').pathname` and `readablePath`, so it equals the form the Studio shows for the same page (spaces become `%20` in both).
- Produces: `pagesTruncatedWarning(total: number): string` in `pack.ts` = `` `The site has ${total} HTML pages; the manifest lists the first ${MAX_MANIFEST_PAGES} for the Studio's page suggestions.` ``, pushed onto `PackResult.warnings` (printed by `printPackSummary` in `src/codemod/index.ts` and logged by the Vite plugin; no change there).
- `packOutput` finds the HTML documents (`findHtmlFiles` + `isHtmlDocument`) before writing `manifest.json`, maps them with `pagePathOf`, sorts the mapped paths (mapping changes the order: `a/index.html` → `/a/` sorts after `a-b.html` → `/a-b.html`), keeps the first `MAX_MANIFEST_PAGES`, writes `{ ...data.manifest, pages }` (`PackResult.manifest` is the written one), and injects flags into the same document list only when `inject` is true; `htmlInjected` is unchanged.

- [ ] **Step 1: Write the failing tests**

`page-path.test.ts`: `readablePath('/%D9%85%D8%AF%D9%88%D9%86%D8%A9/')` → `'/مدونة/'`; `'/50%25/a%20b%23c'` unchanged; `'/%E0%A4%A/'` and `'/%FF/'` unchanged; `'/caf%C3%A9?q=%C3%A9#%C3%A9'` → `'/café?q=é#é'`.

`share-manifest.test.ts`: `accepts a manifest without pages (0.11)`; `accepts sorted site pages` (`pages: ['/', '/about/']`); `ignores a malformed pages` (`pages: '/'`, `['about']`, `['/', 3]` each keep `isShareManifest` true); `manifestPages reads pages leniently`: absent → `[]`, `'/'` → `[]`, `['/', 3, 'about', '//evil', '/', '/a']` → `['/', '/a']`, 2,001 entries → 2,000, an inherited `pages` (`Object.create({ pages: ['/'] })`) → `[]`.

`pack.test.ts`:

- `lists every HTML page in the manifest`: the existing fixture (`index.html`, `docs/a.html`) gives `r.manifest.pages` `['/', '/docs/a.html']` and the same in the written `manifest.json`.
- `lists pages when flags are not injected`: with `injectHtml: false`, `htmlInjected` is `[]` and `manifest.pages` is still `['/', '/docs/a.html']`.
- `maps index files to folder paths`: `pagePathOf('index.html') === '/'`, `pagePathOf('blog/hello/index.html') === '/blog/hello/'`, `pagePathOf('404.html') === '/404.html'`.
- `escapes what a path cannot hold`: `pagePathOf('a#b.html') === '/a%23b.html'`, `pagePathOf('50%.html') === '/50%25.html'`, `pagePathOf('my page.html') === '/my%20page.html'`.
- `lists non-ASCII pages as written`: an `out/مدونة/index.html` gives `'/مدونة/'` in `pages`.
- `sorts the mapped paths`: `a-b.html` and `a/index.html` give `['/a-b.html', '/a/']`.
- `omits pages when there is no HTML document`: an output with only `app.js` has no `pages` key in `manifest.json`.
- `caps pages at 2,000 with a warning`: 2,001 `p<n>.html` files → `pages.length === 2000`, `pages` equals the first 2,000 of the sorted mapped list, `warnings` contains `pagesTruncatedWarning(2001)`.

`vite-share-build.test.ts`, `vite build writes livelocale/ and links the page`: add `expect(m.pages).toEqual(['/'])`.

- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/unit/page-path.test.ts tests/unit/share-manifest.test.ts tests/unit/pack.test.ts`, FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run them to see them pass** — same command plus `tests/unit/pack-manifest.test.ts tests/unit/core-browser-safe.test.ts tests/unit/vite-plugin-share.test.ts tests/integration/vite-share-build.test.ts` (the last needs `dist/studio`, so `npm run build` first or it skips), PASS.
- [ ] **Step 5: Commit** — `git add src/core/page-path.ts src/core/share-manifest.ts src/server/pack.ts tests/unit/page-path.test.ts tests/unit/share-manifest.test.ts tests/unit/pack.test.ts tests/integration/vite-share-build.test.ts`, `git commit -m "feat(pack): list the site's pages in the share manifest"`.

---

### Task 4: The Studio's path model

**Files:**

- Create: `src/studio/page-address.ts`
- Modify: `src/studio/runtime.ts` (`appBasePath`; `urlLocaleOptions` uses it)
- Test: `tests/unit/page-address.test.ts` (new), `tests/unit/studio-runtime.test.ts`

**Interfaces:**

- Consumes: `localeFromUrl`, `urlWithLocale` (`src/studio/locale-inference.ts`); Task 3 `readablePath`; `SHARE_DIR` (`src/core/share-manifest.ts`).
- Produces in `runtime.ts`: `appBasePath(): string` — static: `manifest.basePath ?? new URL(appUrl).pathname`, put through `new URL(base, 'http://p').pathname` so it is in the encoded form `URL.pathname` compares against; server: `'/'`. `urlLocaleOptions()` keeps its output, built from `appBasePath()`.
- Produces in `page-address.ts`:
  - `interface AddressContext { appOrigin: string; base: string; hideLocale: string | null; shareDir: string | null }` (`base` starts and ends with `/`, encoded; `hideLocale` is the Studio's locale in server mode, null in share mode; `shareDir` is `base + SHARE_DIR + '/'` in share mode, null in server mode).
  - `toDisplayPath(appPath: string, ctx: AddressContext): string` — drops the `livelocale-origin` query parameter, drops `locale` when its value equals `ctx.hideLocale`, strips `ctx.base` to a leading `/` (a path outside the base is shown whole), keeps the hash, and passes the result through `readablePath`. Other query parameters keep their order and encoding (rebuild the search only when a parameter was dropped).
  - `resolveAddress(input: string, ctx: AddressContext): string | null` — the absolute app path (`pathname + search + hash`) to open, or null for a refusal. Trimmed; empty → `ctx.base`; a value with a scheme (`/^[a-z][a-z\d+.-]*:/i`) must be an `http(s)` URL on `ctx.appOrigin` and is used as is; anything else gets a missing leading `/` added and is taken relative to the base (`ctx.base + value.slice(1)`). The result is resolved with `new URL(candidate, ctx.appOrigin)` and refused unless its `origin === ctx.appOrigin`, its `username` and `password` are empty, its `pathname` starts with `ctx.base` (or equals `ctx.base` without the trailing `/`), and, when `ctx.shareDir` is set, its `pathname` does not start with `ctx.shareDir`. All checks run on the parsed URL, after the parser has applied `\`, `%2e%2e`, tab and newline removal.
  - `withPageLocale(target: string, current: string, locale: string, options: { basePath?: string; locales?: readonly string[] }): string` — `target` unchanged when it already names a locale (`localeFromUrl(target, options) !== null`) or when `current` names none; else `urlWithLocale(target, locale, options) ?? target`. (Keeps the language the preview shows; never adds `?locale=` to a site whose addresses carry no locale.)
  - `frameSrc(appPath: string, appOrigin: string, studioOrigin: string): string` — absolute URL of `appPath` on `appOrigin` with `livelocale-origin=<studioOrigin>` set in its query (replacing one already there).

- [ ] **Step 1: Write the failing tests** (`dev = { appOrigin: 'http://localhost:3000', base: '/', hideLocale: 'ar', shareDir: null }`, `share = { appOrigin: 'http://localhost:3020', base: '/livelocale-demo/', hideLocale: null, shareDir: '/livelocale-demo/livelocale/' }`):
  - `toDisplayPath`: `'/?livelocale-origin=http%3A%2F%2Flocalhost%3A3010'` (dev) → `'/'`; `'/pricing?locale=ar&tab=2#faq'` (dev) → `'/pricing?tab=2#faq'`; `'/pricing?locale=fr'` (dev) → `'/pricing?locale=fr'`; `'/?q=a%20b&livelocale-origin=x'` (dev) → `'/?q=a%20b'`; `'/livelocale-demo/pricing'` (share) → `'/pricing'`; `'/livelocale-demo/'` → `'/'`; `'/elsewhere/'` (share) → `'/elsewhere/'`.
  - `shows non-ASCII paths decoded`: `'/%D9%85%D8%AF%D9%88%D9%86%D8%A9/'` (dev) → `'/مدونة/'`; `'/%E0%A4%A/'` and `'/50%25'` stay as given.
  - `resolveAddress` accepts: `'pricing'` (share) → `'/livelocale-demo/pricing'`; `'/blog/hello/?x=1#h'` (share) → `'/livelocale-demo/blog/hello/?x=1#h'`; `''` (share) → `'/livelocale-demo/'`; `'?x=1'` (share) → `'/livelocale-demo/?x=1'`; `'http://localhost:3020/livelocale-demo/about/'` (share) → `'/livelocale-demo/about/'`; `'/مدونة/'` (dev) → `'/%D9%85%D8%AF%D9%88%D9%86%D8%A9/'`; `'/50%25'` (dev) → `'/50%25'` (a shown path round-trips).
  - `refuses inputs that resolve to another origin`: `'//evil.example/'`, `'/\\evil.example/'`, `'\\\\evil.example'`, `'http://localhost:3000.evil.example/'`, `'https://localhost:3000/'`, `'http://u:p@localhost:3000/'`, `'javascript:alert(1)'`, `'data:text/html,x'`, `'mailto:a@b.c'` → null (dev); `'java\tscript:alert(1)'` and `' //evil.example/'` (dev) → null or a string starting with `/` and not `//` (never a scheme or another host).
  - `refuses paths outside the base or into the share folder`: `'/../other-site/'`, `'/%2e%2e/other-site/'`, `'http://localhost:3020/other-site/'`, `'/livelocale/index.html'`, `'/livelocale/'` → null (share); `'http://localhost:3020/livelocale-demo'` → `'/livelocale-demo'`; `'/livelocale/index.html'` (dev, no share folder) → `'/livelocale/index.html'`.
  - `withPageLocale`: `('/about/', '/?locale=ar', 'ar', {})` → `'/about/?locale=ar'`; `('/about/', '/', 'ar', {})` → `'/about/'`; `('/fr/about', '/ar/', 'ar', {})` → `'/fr/about'`; with `o = { basePath: '/livelocale-demo/', locales: ['en', 'ar'] }`: `('/livelocale-demo/about/', '/livelocale-demo/ar/', 'ar', o)` → `'/livelocale-demo/about/?locale=ar'`.
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
  - `readRecentPages(scope: string): string[]` — the stored JSON array's string entries that start with `/` and not `//`, de-duplicated, at most 20; `[]` for anything unreadable.
  - `rememberPage(scope: string, displayPath: string): string[]` — stores the path without its hash, first, de-duplicated, at most 20; returns the new list.
  - `suggestPages(query: string, recent: readonly string[], site: readonly string[]): { recent: string[]; site: string[] }` — case-insensitive substring match of the trimmed query (empty matches all); recent first, site pages minus those already in recent; at most 8 in total. (`site` is already capped by `manifestPages`.)

- [ ] **Step 1: Write the failing tests** (jsdom, `localStorage.clear()` before each; `writePref`'s in-memory copy outlives `localStorage.clear()`, so each test uses its own scope name):
  - `remembers most recent first, without duplicates or hash`: remember `/a`, `/b`, `/a#x` → `['/a', '/b']`; `readRecentPages` gives the same; a second scope stays empty.
  - `keeps at most 20`: 25 paths → 20, newest first.
  - `survives corrupt or blocked storage`: stored `'not json'`, `'{}'`, `'[1,"x","/ok",null,"//evil"]'`, and 500 entries give `[]`, `[]`, `['/ok']`, 20 entries; with `localStorage.getItem`/`setItem` stubbed to throw and a fresh scope, `rememberPage` returns `['/a']` and `readRecentPages` returns `['/a']` (memory fallback), neither throws.
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

- Consumes: Task 5 `suggestPages`.
- Produces: `export type NavigateResult = 'ok' | 'refused';` and
  `export interface AddressBarProps { path: string; pendingPath: string | null; recent: readonly string[]; sitePages: readonly string[]; onNavigate: (input: string) => NavigateResult; }` and `AddressBar(props: AddressBarProps)`. `path` and `pendingPath` are display paths; the field shows `pendingPath ?? path` while not being edited.
- Produces DOM contract (E2E and Task 7 rely on it), ARIA 1.2 combobox with a listbox popup:
  - Input `id="studio-address"`, `data-testid="address-field"`, `type="text"`, `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls="studio-address-list"`, `aria-activedescendant` only while the list is open and an option is active (absent otherwise), `autoComplete="off"` (the browser's own suggestions would cover the listbox), `spellCheck={false}`, `autoCapitalize="off"`, `dir="ltr"`, monospace, `aria-label={t('viewer.address_label')}`.
  - Listbox `id="studio-address-list"` `role="listbox"` `aria-label={t('viewer.address_label')}` (axe `aria-input-field-name` needs a name), rendered only while open with options. Groups `role="group"` with `aria-labelledby` pointing at their label, a `role="presentation"` element (not a heading: a listbox may only own groups and options) with `id="studio-address-recent"` / `id="studio-address-site"`; a group renders only when it has options. Options `role="option"`, `id="studio-address-option-<n>"` (numbered across both groups), `data-testid="address-option"`, `data-path=<path>`, `aria-selected="true"` on the active one only; the path text is `dir="ltr"` with each segment between `/`s in its own `<bdi>`, so `/مدونة/مقال/` keeps its segment order (the input's value cannot hold markup and shows the plain string).
  - Refusal: `aria-invalid="true"` on the input and a message `id="studio-address-error"` `role="alert"` referenced by `aria-describedby` (both absent otherwise).
  - Empty state (open, no options at all, empty query): `id="studio-address-empty"` `role="status"`, a sibling of the input (not inside a listbox), and `aria-expanded="false"`.
- Behaviour: focus, typing or Alt+ArrowDown opens the list with `suggestPages(query, recent, sitePages)` (query is empty right after focus, so all pages show); ArrowDown/ArrowUp move the active option (wrapping; from none, ArrowDown picks the first and ArrowUp the last); Enter navigates the active option's path, else the typed value, and is ignored while an IME composition is in progress (`event.nativeEvent.isComposing`); a click on an option navigates its path, and options call `preventDefault()` on `mousedown` so the input keeps focus and its blur does not close the list first; Escape closes an open list, a second Escape restores `path` (focus stays); blur restores `path`, clears a refusal and closes. On `'refused'` the typed text stays with the error; the next edit clears the error. On `'ok'` the list closes and the edit ends.
- Copy (English pinned for tests; Arabic for owner review):

| key                      | en                                      | ar                                    |
| ------------------------ | --------------------------------------- | ------------------------------------- |
| `viewer.address_label`   | `Page address`                          | `عنوان الصفحة`                        |
| `viewer.address_refused` | `Only pages on this site can open here` | `لا تُفتح هنا إلا صفحات هذا الموقع`   |
| `viewer.pages_recent`    | `Recent pages`                          | `الصفحات الأخيرة`                     |
| `viewer.pages_site`      | `Site pages`                            | `صفحات الموقع`                        |
| `viewer.pages_empty`     | `No pages yet: open one in the preview` | `لا صفحات بعد: افتح صفحة في المعاينة` |

- [ ] **Step 1: Write the failing tests** in `address-bar.test.tsx` (render outside a provider, `fireEvent`; props `path '/pricing'`, `pendingPath null`, `recent ['/b']`, `sitePages ['/', '/b', '/c']`, `onNavigate vi.fn(() => 'ok')` unless a test says otherwise; options in order are `/b`, `/`, `/c`):
  - `shows the current path, or the pending one`: input value `/pricing`, `dir="ltr"`, `autocomplete="off"`, name `Page address`, no `aria-activedescendant`; with `pendingPath '/about/'` → `/about/`.
  - `lists recent then site pages in labelled groups`: focus → `aria-expanded="true"`, listbox named `Page address`, group named `Recent pages` holds `/b`, group named `Site pages` holds `/`, `/c`.
  - `filters by what is typed`: typing `c` leaves only `/c`.
  - `moves with arrows and opens the active option on Enter`: ArrowDown twice → `aria-activedescendant="studio-address-option-1"` and that option `aria-selected="true"`; Enter → `onNavigate('/')`; ArrowUp from no active option picks `studio-address-option-2`.
  - `opens an option on click`: `mouseDown` on the `/c` option is default-prevented (`fireEvent.mouseDown` returns false), then `click` → `onNavigate('/c')`, the input is still `document.activeElement`.
  - `navigates the typed value on Enter`: type `pricing`, Enter → `onNavigate('pricing')`; an Enter `keyDown` with `isComposing: true` calls nothing.
  - `shows the refusal and keeps the text`: `onNavigate` returns `'refused'` → `role="alert"` text `Only pages on this site can open here`, `aria-invalid="true"`, value kept; typing again removes the alert; a refusal followed by blur removes it too.
  - `Escape closes, then restores; blur restores`: type `x`, Escape → `aria-expanded="false"`, value `x`; Escape → `/pricing`, input still `document.activeElement`; type `y`, blur → `/pricing`.
  - `shows the empty state with no pages`: focus with no recent and no site pages → status `No pages yet: open one in the preview`, `aria-expanded="false"`, no listbox.
  - `keeps path segments in order`: `recent ['/مدونة/مقال/']`, focus → that option holds two `bdi` elements with texts `مدونة`, `مقال` in that order.
  - `studio-accessible-names.test.tsx`: `names the page address field` (`AddressBar` with minimal props has an accessible name; `studio-colour-guard` and `studio-focus-ring` scans include the new file automatically — confirm both stay green).
- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/unit/address-bar.test.tsx tests/unit/studio-accessible-names.test.tsx`, FAIL.
- [ ] **Step 3: Implement** `AddressBar` with token classes only (`bg-raised`, `border-line`, `text-fg`, `text-fg-muted`, `text-danger-fg`, `bg-raised-hover` for the active option) and the catalogue keys.
- [ ] **Step 4: Run them to see them pass** — `npx vitest run tests/unit/address-bar.test.tsx tests/unit/studio-accessible-names.test.tsx tests/unit/studio-i18n.test.ts tests/unit/studio-no-hardcoded-copy.test.ts tests/unit/studio-colour-guard.test.ts tests/unit/studio-focus-ring.test.ts tests/unit/studio-logical-properties.test.ts`, PASS.
- [ ] **Step 5: Commit** — `git add src/studio/features/dashboard/components/AddressBar.tsx src/studio/i18n/en.ts src/studio/i18n/ar.ts tests/unit/address-bar.test.tsx tests/unit/studio-accessible-names.test.tsx`, `git commit -m "feat(studio): page address combobox"`.

---

### Task 7: Navigation wiring, the reload fix and the language switch

**Files:**

- Create: `src/studio/features/dashboard/hooks/usePageNavigation.ts`
- Modify: `src/studio/features/dashboard/components/IframeViewer.tsx` (dots → `AddressBar`, reload from the hook, `navigation` prop), `src/studio/features/dashboard/hooks/useLocaleData.ts` (optional `showLocale`), `src/studio/features/dashboard/hooks/useStudio.ts` (call the hook, route both language switches and the review's `reloadFrame` through it, return `navigation`), `src/studio/app.tsx` (pass it)
- Test: `tests/unit/page-navigation-hook.test.tsx` (new), `tests/unit/studio-locale-hooks.test.tsx`, `tests/unit/studio-connection-help.test.tsx`, `tests/unit/studio-accessible-names.test.tsx` (props)

**Interfaces:**

- Consumes: Task 1 `useConnection` (`currentPath`, `locationKnown`, `locationSeq`, `sendToIframe`, `iframeRef`); Task 2 `NAVIGATE`; Task 3 `manifestPages`; Task 4 `AddressContext`, `toDisplayPath`, `resolveAddress`, `withPageLocale`, `frameSrc`, `appBasePath`, `urlLocaleOptions`; `urlWithLocale`; Task 5 `recentPagesScope`, `readRecentPages`, `rememberPage`; Task 6 `AddressBarProps`, `NavigateResult`.
- Produces: `NAVIGATION_TIMEOUT_MS = 15000` and
  `usePageNavigation(input: { iframeRef: React.RefObject<HTMLIFrameElement>; currentPath: string; locationKnown: boolean; locationSeq: number; locale: string; sendToIframe: (type: string, payload?: unknown) => void }): PageNavigation` with
  `interface PageNavigation extends AddressBarProps { isNavigating: boolean; reload: () => void; showLocale: (locale: string) => void }`.
  - `ctx: AddressContext = { appOrigin: getAppOrigin(), base: appBasePath(), hideLocale: runtime.kind === 'server' ? locale : null, shareDir: runtime.kind === 'static' ? appBasePath() + SHARE_DIR + '/' : null }`; `path = toDisplayPath(currentPath, ctx)`.
  - `recent` re-read after `rememberPage(scope, path)` on every `locationSeq` change while `locationKnown`; `sitePages = manifestPages(manifest)` for a static runtime, else `[]`.
  - `onNavigate(input)`: `resolveAddress` null → `'refused'`; else `target = withPageLocale(resolved, currentPath, locale, urlLocaleOptions())`, `pendingPath = toDisplayPath(target, ctx)`, then `go(target)` → `'ok'`.
  - `go(appPath)`: `locationKnown` (a live client is in the frame now) → `sendToIframe('NAVIGATE', { url: new URL(appPath, appOrigin).href })`; otherwise `iframeRef.current.src = frameSrc(appPath, appOrigin, window.location.origin)`. Deciding on `locationKnown` rather than `connectionStatus` is what keeps navigation working after the frame reached a page without the client (`connectionStatus` stays `connected` for good after the first `READY`).
  - `reload()`: `locationKnown` → `go(currentPath)` with `pendingPath = path` (the client turns an identical href into `location.reload()`, Task 2); otherwise re-assigns `iframeRef.current.src` as 0.11 did.
  - `showLocale(l)`: `next = urlWithLocale(currentPath, l, urlLocaleOptions())`; when non-null, `pendingPath = toDisplayPath(next, ctx)` and `go(next)`.
  - `pendingPath` clears on the next `locationSeq` change or after `NAVIGATION_TIMEOUT_MS`; `isNavigating = pendingPath !== null`.
- Produces: `useLocaleData` takes an optional `showLocale?: (locale: string) => void`; when given, `handleLocaleChange` calls it after `setLocale` instead of rewriting `iframeRef.current.src` (which `NAVIGATE` never updates, so 0.11's rewrite would jump back to the first page). Without it, behaviour is unchanged (the existing `studio-locale-hooks` test keeps passing).
- Produces: in `useStudio`, `usePageNavigation` runs after `useLocaleData` (it needs `locale`), so both consumers reach it through a ref filled each render, the file's existing pattern (`setLocaleRef`): `useLocaleData({ ..., showLocale: (l) => showLocaleRef.current(l) })`, and `showLocaleInFrame` (share mode) becomes `(l) => showLocaleRef.current(l)`; the review's `reloadFrame` becomes `navigation.reload`; `useStudio` returns `navigation`.
- Produces: `IframeViewer` takes `navigation: PageNavigation` instead of `currentPath`; the reload button gets `data-testid="reload-frame"`, is `disabled={navigation.isNavigating}` and calls `navigation.reload`; `AddressBar` sits where the window dots were, `flex-1 min-w-0`, and the status/reload group keeps its natural width (drop the two `w-1/3`).

- [ ] **Step 1: Write the failing tests** in `page-navigation-hook.test.tsx` (`renderHook` with `rerender` for new hook input, fake timers, a server runtime on `http://localhost:3000`, and a static runtime via `setStudioRuntime` with `appOrigin 'http://localhost:3020'`, `basePath '/livelocale-demo/'`, `pages ['/', '/about/']`; `resetStudioRuntime()` and `localStorage.clear()` after each; "known" means `locationKnown true`):
  - `sends NAVIGATE while the client is known`: known, `currentPath '/'`, `onNavigate('/pricing')` → `'ok'`, `sendToIframe` called with `('NAVIGATE', { url: 'http://localhost:3000/pricing' })`, `pendingPath '/pricing'`, `isNavigating true`.
  - `keeps the preview's language`: `currentPath '/?locale=ar'`, `locale 'ar'` → `NAVIGATE` url `http://localhost:3000/pricing?locale=ar`, `path` shown is `/`.
  - `falls back to the iframe src once the client has left`: `locationKnown false` → no `sendToIframe`; `iframeRef.current.src === 'http://localhost:3000/pricing?livelocale-origin=' + encodeURIComponent(location.origin)`.
  - `refuses another origin`: `onNavigate('//evil.example/')` → `'refused'`, nothing sent, src untouched.
  - `shows share paths relative to the base and lists site pages`: static, `currentPath '/livelocale-demo/about/'` → `path '/about/'`, `sitePages ['/', '/about/']`; `onNavigate('/')` sends `http://localhost:3020/livelocale-demo/`; `onNavigate('/livelocale/')` → `'refused'`.
  - `reload reopens the current page`: known with `currentPath '/b?x=1'`, `reload()` sends `NAVIGATE` for `http://localhost:3000/b?x=1`; with `locationKnown false` it re-assigns the existing `src` and sends nothing.
  - `switching the language keeps the current page`: known, `currentPath '/pricing'`, `showLocale('ar')` → `NAVIGATE` url `http://localhost:3000/pricing?locale=ar`; static with `currentPath '/livelocale-demo/en/about/'` and manifest locales `['ar', 'en']`, `showLocale('ar')` → `http://localhost:3020/livelocale-demo/ar/about/`.
  - `clears pending on the next location or after the timeout`: `pendingPath` null after rerender with `locationSeq + 1`; in a second case, still set after `vi.advanceTimersByTime(14999)`, null after one more ms with no new location.
  - `remembers each reported page`: rerenders with `locationSeq` 1 (`/a`) and 2 (`/b`) → `recent ['/b', '/a']`; a rerender with `locationKnown false` remembers nothing.
  - `studio-locale-hooks.test.tsx`: `hands the language switch to showLocale when given`: `useLocaleData({ ..., showLocale })`, `handleLocaleChange('ar')` → `showLocale('ar')`, `locale 'ar'`, the iframe `src` unchanged.
  - `studio-connection-help.test.tsx` / `studio-accessible-names.test.tsx`: replace `currentPath` with a `navigation` stub (`{ path: '/', pendingPath: null, recent: [], sitePages: [], onNavigate: vi.fn(() => 'ok'), isNavigating: false, reload: vi.fn(), showLocale: vi.fn() }`); add `reload is disabled while navigating` (`isNavigating: true` → the `Reload Frame` button is disabled) and `reload calls navigation.reload`.
- [ ] **Step 2: Run them to see them fail** — `npx vitest run tests/unit/page-navigation-hook.test.tsx tests/unit/studio-locale-hooks.test.tsx tests/unit/studio-connection-help.test.tsx tests/unit/studio-accessible-names.test.tsx`, FAIL.
- [ ] **Step 3: Implement** the hook, the `useLocaleData` option, and the `IframeViewer`/`useStudio`/`app.tsx` changes.
- [ ] **Step 4: Run the whole unit suite and typecheck** — `npm test; npm run typecheck; npm run lint`, all exit 0.
- [ ] **Step 5: Commit** — `git add src/studio/features/dashboard src/studio/app.tsx tests/unit/page-navigation-hook.test.tsx tests/unit/studio-locale-hooks.test.tsx tests/unit/studio-connection-help.test.tsx tests/unit/studio-accessible-names.test.tsx`, `git commit -m "feat(studio): open any page from the preview's address field"`.

---

### Task 8: End-to-end in dev and share mode, axe on the open list

**Files:**

- Create: `tests/e2e/page-navigation.spec.ts`
- Modify: `tests/e2e/a11y-axe.spec.ts` (one dev screen, one share test per variant)

**Interfaces:**

- Consumes: Task 6 DOM contract; Task 7 `reload-frame`; `connection-status`; `openStudio`-style tips dismissal by ids (`#studio-tips-name`, `#studio-tips-start`); the static fixture on 3020 (`playground-vite` has `/` and `/about/`, `#to-about` links to `/about/`; the fixture server answers a missing path with a plain-text 404, a page without the client).
- Helper in the spec: `frameUrl(page) = (await (await page.locator('#app-preview-iframe').elementHandle())!.contentFrame())!.url()`.

- [ ] **Step 1: Prepare servers.** `npm run build`. Check ports 3000/3010/3020 (`netstat -ano | findstr ":3000 :3010 :3020"`); anything listening is reused by `reuseExistingServer` and may be stale (a Next dev server on 3000 started before the build can keep serving the old client from `playground/.next`). Stop only servers this session started; ask the owner before stopping anything else (their own Studio dev may hold `[::1]:3010`, and Playwright's port probe reuses it). If a kept 3020 server is stale, run `npm run build --prefix playground-vite` so it serves the new build.
- [ ] **Step 2: Write the tests** in `page-navigation.spec.ts` (every step waits on `connection-status` `data-status="connected"` or on `frameUrl`, never on English text):
  - dev `shows the page and follows client-side navigation`: open `http://localhost:3010`, connected; `#studio-address` has value `/`; in the frame `history.pushState({}, '', '/?tab=2')` → field value `/?tab=2` (no `livelocale-origin`).
  - dev `opens a typed path and reload stays there`: fill `#studio-address` with `/?tab=3`, Enter → `frameUrl` matches `/\/\?tab=3/`; click `[data-testid="reload-frame"]` once it is enabled → `frameUrl` still matches `?tab=3`.
  - dev `refuses another origin`: type `//example.com/`, Enter → `#studio-address-error` visible, `frameUrl` unchanged.
  - dev `leaves room for the field`: at 800×600, `#studio-address` is at least 160 px wide and `document.documentElement.scrollWidth <= innerWidth`.
  - share `lists site pages and opens one`: open `http://localhost:3020/livelocale/index.html`, dismiss tips, connected; focus `#studio-address` → the group labelled by `#studio-address-site` contains an option with `data-path="/about/"`; ArrowDown to it, Enter → `frameUrl` ends with `/about/` (plus any `?locale=`), field value `/about/`; focus again → the recent group lists `/about/` first.
  - share `follows a link click`: click `#to-about` inside the frame → field value `/about/`.
  - share `recovers after a page without the client`: type `/missing/`, Enter → `frameUrl` ends with `/missing/`; type `/about/`, Enter → `frameUrl` ends with `/about/` and the field shows `/about/` (the second navigation goes through the iframe `src`, since `LEAVING` cleared `locationKnown`).
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
- [ ] **Step 3: Translation-Test (dev Studio).** `git clone https://github.com/Araby99/Translation-Test <scratchpad>/tt`, `npm ci`, `npm i -D livelocale@next --no-save`, start its dev server and Studio as its README says. Check: the field shows `/`; clicking an in-app link updates it; typing a path opens it; Reload stays on it; switching the language stays on it; a foreign URL is refused; switching the Studio to Arabic mirrors the bar with the field still left-to-right.
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
- [ ] **Step 5: Hand off.** Once the owner says yes in chat, push `release/0.12.0` and open a PR titled `chore: release 0.12.0` (same no-attribution rule). Tell the owner: merge it, then create the GitHub release `v0.12.0` from the merge commit. Afterwards (owner, spec §6): regenerate the docs captures with their one command (the hero video is kept, not re-recorded), add the "Go to a page" section to the Studio guide, then put the site live.
