# Studio page navigation (0.12.0)

> Status: proposed by Claude on the owner's request ("propose a design yourself", 2026-11-03); the owner skipped the questions. Ships as 0.12.0 before the website goes live. Every decision here is Claude's call unless marked as the owner's.

## 1. Intent

The Studio shows the site in its preview panel but has no way to reach a page except clicking through the site's own links. On a deep site, or a page that takes several clicks to reach, that is slow, and it is the first friction a translator meets. The Studio already learns the current page (`currentPath`) but never shows it, and it misses client-side (router) navigations entirely.

## 2. Goals

1. **See where you are:** an address field in the preview bar shows the current page path, always accurate, including after client-side navigations.
2. **Go anywhere fast:** type a path (`/pricing`) and press Enter; the preview goes there, keeping the Studio's current language.
3. **Back to recent pages:** the field's suggestions list the pages visited in this Studio, most recent first.
4. **Every page of a shared site:** in share mode, the suggestions also list every page of the deployed site, so a translator can reach a page no link leads to.
5. **Reload reloads the page you are on**, not the first page the Studio opened.

## 3. Behaviour

### 3.1 The address field

- Lives in the preview bar (`IframeViewer`), in place of the three decorative window dots, between the left edge and the status/reload group; it grows to fill the free width.
- Shows the path relative to the site's base: in share mode relative to the manifest's `basePath` (so a site under `/livelocale-demo/` shows `/pricing`, not `/livelocale-demo/pricing`); in dev mode the app URL's path plus search, minus the Studio's own `livelocale-origin` parameter and minus a `?locale=` the Studio itself manages. Hash fragments are kept.
- Monospace, `dir="ltr"` in the Arabic Studio too (it is a path), with an accessible name ("Page address" / Arabic equivalent).
- Edit, then **Enter** navigates; **Escape** restores the current path and keeps focus; leaving the field without Enter restores it.
- Input is normalised: a missing leading `/` is added; a full URL is accepted only when it is on the previewed site's origin (then reduced to its path); anything else (another origin, `javascript:`, `data:`, a protocol-relative URL) is refused with an inline message ("Only pages on this site can open here").
- While a navigation is in progress the field shows the target and the reload button is disabled; the status pill already reports connecting/connected.

### 3.2 Suggestions (recent pages and site pages)

- A combobox (ARIA 1.2 combobox with a listbox popup): opening the field (focus, typing, or Alt+Down) shows up to 8 matches, filtered by what is typed.
- **Recent pages:** every page the preview reports is remembered, most recent first, de-duplicated, at most 20, per Studio and per site (keyed like drafts: repo slug, else the app base path), in `localStorage` with the same try/catch rules as the Studio's other preferences; clearing site data clears it.
- **Site pages (share mode only):** `livelocale pack` already finds every HTML document of the build (`htmlInjected`); it now also writes their site-relative paths to the manifest as `pages` (e.g. `/`, `/pricing/`, `/blog/hello/`), sorted, at most 2,000 entries (more are truncated with a warning in the pack output). Suggestions show recent pages first, then matching site pages, under two labelled groups.
- Dev mode has no site page list in 0.12.0 (route discovery for Next.js and Vite apps is a later feature); it shows recent pages only.

### 3.3 Keeping the current path accurate

- The client runtime (`src/client`) reports the location on every change, not only at load: after `history.pushState`/`replaceState` (wrapped once, still calling the originals), on `popstate` and on `hashchange`, debounced to one message per animation frame. The message is a new client→Studio type `LOCATION_CHANGED` with `{ url }` (path + search + hash), validated like the existing messages. `READY` keeps carrying the initial URL.
- The Studio updates `currentPath` from both, so the address field, the locale swap, Page Keys and the review effects all follow client-side navigations.

### 3.4 Navigating

- The Studio sends a new Studio→client message `NAVIGATE` with `{ url }` (an absolute URL on the app's origin built by the Studio from the typed path, with the current locale applied through the existing `urlWithLocale`). The client validates that the target's origin equals its own origin and then calls `location.assign(url)` (a real navigation; it works for every framework and keeps the client's stored Studio origin).
- If the client is not connected (no `READY` yet, or the page has no livelocale client), the Studio falls back to setting the iframe `src` to the same URL plus the `livelocale-origin` parameter (so the next page's client can find the Studio).
- **Reload** uses the current path: it navigates to the current URL the same way instead of re-assigning the original `src`.

### 3.5 Languages and accessibility

- New copy lives in the en/ar catalogue (plural rules, bidi isolation as today): the field's name, the refusal message, the two group labels, the empty state ("No pages yet: open one in the preview"). The owner reviews the new Arabic strings before release.
- Keyboard: Tab reaches the field; arrows move through suggestions; Enter picks; Escape closes the list, then restores the value. The global focus ring applies. The axe gate covers the open listbox in both themes and both languages.

## 4. Non-goals

- Route discovery for dev mode (scanning `app/` or the Vite router) and "pages that use this key".
- Back/forward buttons (the browser's own history inside the frame is not exposed cross-origin).
- Changing how share links or drafts are keyed.

## 5. Constraints

- No runtime dependencies (unchanged rule); browser-safe `src/core` rules apply to the manifest type.
- The manifest stays backward compatible: `pages` is optional; a 0.11 Studio ignores it and a 0.12 Studio works with a 0.11 manifest (no site pages group).
- Message validation and origin checks are as strict as the existing protocol; the client never navigates to another origin.
- Existing behaviour and tests stay green; the server-mode Studio works as in 0.11 apart from the new field.

## 6. Release

0.12.0 (minor) with a changeset, a `next` prerelease smoke-checked on Translation-Test and on the Tidewell demo (address field, suggestions in share mode, navigation, Arabic), then `latest`. After it ships, the website's hero video and docs captures are re-recorded so they show the address field, the docs gain a short "Go to a page" section in the Studio guide, and only then does the site go live (owner, 2026-11-03: before the site goes live).
