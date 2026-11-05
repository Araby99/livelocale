# The Studio on phones: design

Date: 2026-11-05. Status: draft for owner approval.

## Intent and the why

Today a share link on a phone can only view the site. Alt+Click needs a keyboard, and the docs say so ("Desktop only" in `site/docs/how-it-works/risks-and-limits.md:17`). On a 375 px screen the Studio is also broken in plain ways: the header overflows and pushes **Send to developer** under the logo, and the first-run tips tell the visitor to "Hold Alt/Option and click any text", which is impossible on a phone.

LiveLocale's buyer is a team with marketing or content people (see the CTO review in the 2026-11-05 conversation), and those people read copy on their phones. If they can't act on what they see right then, the "no more screenshots" promise breaks at the exact moment it should work. An outside review also listed "share links are desktop only" as a limitation.

The goal is that **a person opens a share link on their phone, taps the wrong text on the real page, fixes it, and sends the change to the developer**, without a keyboard shortcut, a key list or any setup.

## Who it serves (owner's words, confirmed)

1. **A marketing person reviewing copy on their phone.** They read the real page, spot a wrong line and fix it there and then.
2. **Someone typing new translations on their phone.** For some people the phone is the easy place to type, so they move through a page filling in the missing locale text.

Both work on the page itself. Neither should ever have to start from a list of translation keys.

## Goals

- Tap-to-edit on touch devices, through an **Edit / Browse switch** (owner decided).
- An editor that **slides up from the bottom** as a sheet when text is tapped (owner decided).
- A phone layout where the site gets almost the whole screen and the Studio chrome is a thin top bar plus the bottom switch.
- Sending changes from the phone, with the same change list and link as on desktop.
- Docs, first-run tips and landing claims that no longer say "desktop only".

## Non-goals

- **The dev Studio (`livelocale studio` on localhost) on a phone.** The phone case is the share link. The dev Studio may happen to work at narrow widths, but nothing is built or tested for it.
- **Developer actions on a phone**: reviewing or importing a change link, committing, creating a pull request, managing locales (adding, removing). These stay desktop flows. On a phone, they may be hidden or simply reached through the menu if they already work; they don't need a phone design.
- **A native app or PWA install.**
- **Changing how drafts are stored.** Drafts stay in the browser, as on desktop.

## Anti-goals (would be a failure even if it technically works)

- The visitor lands on the phone and sees a list of keys first, or has to learn what a key is to fix a sentence.
- In Edit mode, a tap on a link or button **navigates the site** or fires the site's own action (a form submit, a menu toggle) instead of selecting the text.
- The phone keyboard covers the field being typed in, or the text being changed.
- Any change to production behaviour. All of this lives in the dev-only/share-only Studio and client paths that are already stripped from production builds; the production bundle must stay free of it (the existing safety-switch tests must keep passing).
- Desktop behaviour changes. Alt+Click, hover outlines and the three-column layout on wide screens stay exactly as they are.

## The experience (approved in mockups, 2026-11-05)

The mockup is in `.superpowers/brainstorm/2946-1793873394/content/phone-flow.html` (gitignored, local only). Its three moments:

### 1. Opening the link: Edit is on

- The site fills the screen between a **thin top bar** and a **bottom bar**.
- The top bar holds: the LiveLocale mark, the **locale chip** (e.g. `EN ▾`, opens the locale picker), and **Send · N** (N = unsent changes). Everything else in today's header (theme, keys directory, page address, help, version) moves into a **⋯ menu** in the top bar. _(My call: the exact set behind ⋯ is the builder's, as long as Send and the locale chip are always visible.)_
- The bottom bar holds the **Edit / Browse switch**. On a phone, the Studio **opens in Edit**.
- In Edit, text that can be fixed (elements with a translation key) is **outlined subtly**, and a one-time hint reads "Tap any text to fix it".
- **Edit freezes the whole site** (owner decided). No tap in Edit ever reaches the site: not on links, buttons, images, icon-only buttons, empty link areas, form fields or anything else. The site never navigates or reacts while Edit is on. A tap on keyed text (including text inside a link or button) selects it. A tap on text **without** a key shows a short notice that this text isn't in the locale files. A tap on something with no text (an image, an icon, empty space) does nothing. _(My call: wording and form of the notice are the builder's.)_ Scrolling the page with a finger must still work normally in Edit. To reach text inside a closed menu, the person switches to Browse, opens the menu, and switches back to Edit; the menu stays open because switching modes doesn't touch the site.
- In **Browse**, the site behaves exactly as it does without LiveLocale: links, menus and toggles all work. This is how the person moves to another page.
- **First-run tips** on touch devices say "Tap any text…" instead of "Hold Alt/Option and click…".

### 2. Tapping text: the editor slides up

- A **bottom sheet** slides up over the lower part of the page, with the rest of the page dimmed but visible.
- It shows: the key in small monospace (present but secondary), the **locale being edited**, the **reference text** (the source locale's value), the **field** for the edited locale (marked "missing" when empty), **Save**, and **Next missing →**.
- The page **updates live as they type**, exactly like the desktop editor (existing preview messages).
- When the phone keyboard opens, the sheet sits **directly above the keyboard**, and the page scrolls so the **picked text stays visible** above the sheet.
- **Next missing →** (my addition, approved as part of the mockup) moves the selection to the **next keyed text on the current page that has no value in the edited locale and is actually rendered and visible** (not inside a closed menu, hidden slide, collapsed section, or a layout hidden at this width), in reading order, scrolling the page to it. When the same key appears more than once, the first visible element is the one used. When no visible gaps are left, it says so honestly and counts the rest, e.g. "Everything you can see is translated. 3 more are in hidden parts of the page (menus, slides)." It must never claim the page is fully translated while hidden gaps remain. It is there for the translator persona. _(My call, after the builder check.)_
- Plural messages open the existing plural editor inside the sheet. Placeholder and save warnings appear as they do on desktop.
- The sheet can be dismissed by swiping it down or tapping the dimmed page. Unsaved typing in the field follows the desktop editor's current rule for unsaved input. _(Builder: match whatever the desktop editor does today.)_

### 3. Tapping Send: review and share

- A sheet with the **same change list** as the desktop Send dialog (key, locale, old → new), the **name field**, and the optional note.
- The primary action is **Share link…**, which opens the phone's own share menu (Web Share API) so the link goes out through WhatsApp, Slack, email and so on. **Copy link** is always available next to it, and is the only action where the Web Share API is missing.
- Everything else about the link is unchanged: same format, same size limits and overflow handling, same GitHub "open" path where it exists today.

## When the phone experience applies

_(My calls; the builder may refine the exact media queries.)_

- **Edit / Browse switch and tap-to-edit**: any **touch-first device** (`pointer: coarse`), at any width. That covers tablets too.
- **Phone layout** (thin top bar, bottom sheet editor and Send sheet): touch-first devices **narrower than 768 px**.
- Touch tablets wider than that keep today's compact layout (drawers), plus the Edit / Browse switch and tap-to-edit.
- A desktop with a mouse never sees the switch, even in a narrow window.
- A phone turned to landscape keeps the phone layout (decide by the device being a touch-first phone, not the current width alone), so rotating never swaps layouts mid-edit. _(My call.)_
- The Edit / Browse switch keeps whatever the person last chose, including across page changes; only opening the Studio fresh starts in Edit. _(My call.)_
- The locale chip and the required first locale pick follow the desktop share Studio's current behaviour. _(My call.)_

## Constraints and facts the builder needs

- **Selection happens inside the customer's site**, not in the Studio. `src/client/dom-interceptor.ts` listens in the capture phase and only acts on clicks with `altKey` (`handleClick`, ~line 535); it reports `ELEMENT_SELECTED` to the Studio via `postMessage` (`src/client/index.ts`, `src/studio/features/dashboard/hooks/useConnection.ts`). Edit mode therefore needs **a new Studio → client message** to turn tap-selection on and off (and to draw or hide the outlines), plus client handling. Today's message types: Studio → client `APPLY_PREVIEW`, `COMMIT_PREVIEW`, `CLEAR_SELECTION`, `NAVIGATE`; client → Studio `READY`, `LOCATION_CHANGED`, `LEAVING`, `ELEMENT_SELECTED`, `ERROR`, `VISIBLE_KEYS_CHANGED`, `VISIBLE_TEXTS_CHANGED`.
- The client and the share Studio ship from the same package version, but the Studio must **degrade safely** if the client never acknowledges Edit mode (e.g. a stale cached client): hide the switch and keep the current view-only behaviour rather than show a switch that does nothing.
- Freezing the site in Edit mode: in the capture phase, cancel **every** `click` (prevent default and stop propagation), whatever the target. Some sites act on `pointerdown`/`touchstart`/`mousedown` (menus); stop propagation of those for every target too, **without** calling `preventDefault` on `touchstart`, so scrolling keeps working. Focusing a site input in Edit mode must not pop the keyboard. Keyboard-triggered site actions are out of scope (phones have no physical keyboard in this flow).
- **Next missing** needs a visibility check the client doesn't do today: `VISIBLE_KEYS_CHANGED` comes from `querySelectorAll('[data-i18n-key]')` (`dom-interceptor.ts:74`) and includes hidden elements. The client must report, or answer on request, which keyed elements are actually rendered and visible, and the Studio needs a new Studio → client "scroll to and select this key" message. Reading order is document order (`getActiveKeys` already returns keys in that order).
- **Keyboard and viewport**: use the `visualViewport` API (resize/scroll) to keep the sheet above the keyboard on iOS Safari and Android Chrome.
- The layout today switches at `WIDE_LAYOUT_QUERY = '(min-width: 1280px)'` (`src/studio/features/dashboard/hooks/useMediaQuery.ts`), with `StudioLayout` turning the outer columns into drawers below that. It is written so crossing the breakpoint never remounts the editor; the phone layout must keep that property (no lost typing on rotation).
- Studio copy goes through the English catalogue (`src/studio/i18n/en.ts`, `t(key)`); `tests/unit/studio-no-hardcoded-copy.test.ts` enforces it.
- Brand and visual system: follow the Studio's existing tokens and components (Patch amber for the primary action, Hunk cyan for keys). Touch targets at least 44 × 44 px. The sheet and switch must be usable with VoiceOver/TalkBack (labelled, focus moves into the sheet and back).
- Drafts on phones: storage can be lost more easily (private tabs, iOS clearing site data for sites not visited in a while). Don't change the storage design, but the risks doc must say this plainly, and the Send count in the top bar keeps unsent work visible.

## Docs and site changes

- Remove "desktop only" and "phones and tablets can only view" from: `site/docs/how-it-works/risks-and-limits.md:17`, `site/docs/guides/studio.md:109`, `site/docs/guides/share-links.md:88` and `:158`, `site/docs/start/static-host.md:51`. Replace with how editing on a phone works (Edit / Browse, tap, sheet, Share link) and the drafts-on-phones caveat.
- Add a short "On a phone" section to the Studio guide, with a phone screenshot recorded by `site/scripts/record-docs.mjs` (new shot, mobile viewport). Whether the landing page also shows the phone flow is **not** part of this work; it can follow.
- CHANGELOG entry under Unreleased.

## Testing expectations

- Unit tests for the client's Edit-mode handling (tap selects keyed text; no tap on any target reaches the site, including image links, icon buttons and unkeyed text; unkeyed text shows the notice; everything works normally in Browse; visibility reporting for Next missing) and for the Studio pieces (switch, sheet, Next missing, Share link with and without the Web Share API).
- Playwright e2e on the **share Studio** with mobile emulation (`hasTouch`, `isMobile`, phone viewport): open in Edit; tap a link's text selects it and does not navigate; Browse follows the link; type, save, page updates; Next missing walks the gaps; Send shows the change list; Copy link works.
- Existing desktop e2e and the production safety-switch tests keep passing unchanged.
- A manual check on a real iPhone (Safari) and a real Android phone (Chrome) before release, especially the keyboard behaviour. _(The owner or the builder does this; emulation does not show the real keyboard.)_

## Left to the builder

The exact media queries, the contents of the ⋯ menu, animation and gesture details of the sheet, the notice for unkeyed text, the message name and shape for Edit mode, component structure, and how the outline is drawn, all within the constraints above.
