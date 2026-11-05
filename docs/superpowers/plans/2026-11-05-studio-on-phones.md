# Studio on Phones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person opens a share link on a phone, taps the wrong text on the real page, fixes it in a bottom sheet, and sends the change to the developer.

**Architecture:** The in-site client (`src/client/`) learns an Edit mode that freezes the site and turns taps into selections, plus a visibility-aware key report and a "select this key" command. The Studio (`src/studio/`) detects touch devices, drives Edit mode over the existing `postMessage` bridge, and on phones renders a phone shell (thin top bar, Edit/Browse switch, bottom sheets for the editor and Send) around the same editor and send components.

**Tech Stack:** TypeScript, React 18, Tailwind tokens already in the Studio, Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-studio-on-phones-design.md`

## Global Constraints

- Desktop behaviour is unchanged: Alt+Click, hover outlines, three columns at `(min-width: 1280px)`, drawers below it.
- A desktop with a mouse never sees the Edit/Browse switch, even in a narrow window.
- Touch-first = `(pointer: coarse)`. Phone = touch-first AND `Math.min(screen.width, screen.height) < 768` (decided by the device, so rotation never swaps layouts).
- On a phone the Studio opens in **Edit**. The switch keeps the last choice across page changes; only a fresh Studio load starts in Edit. Not persisted to storage.
- **Edit freezes the whole site:** no tap on any target reaches the site. Scrolling with a finger still works (never `preventDefault` on `touchstart`).
- All Studio copy goes through `src/studio/i18n/en.ts` + `t(key)` (enforced by `tests/unit/studio-no-hardcoded-copy.test.ts`).
- Touch targets at least 44 × 44 px. Sheets are labelled dialogs; focus moves in on open and back on close.
- Production stays free of all of it: existing safety-switch tests must keep passing; new client code lives behind the same `isLiveLocaleEnabled()` + iframe guard as today.
- Commit messages: conventional style, no AI attribution lines.

## Review Focus

1. **`CLEAR_SELECTION` re-inits the interceptor** (`interceptor.destroy(); interceptor.init()` in `src/client/index.ts`): Edit mode must survive that, or the site unfreezes after the first save. Test in Task 1.
2. **Every new page sends `READY`**: after browsing to another page the Studio must re-send the current mode, or the new page is live while the switch says Edit. Test in Task 2.
3. **Same key rendered twice** (desktop nav + mobile nav): tap selection uses the tapped element; Next missing and `SELECT_KEY` use the first _visible_ element. Test in Task 1.
4. **Keyboard covers the field** on real phones: the sheet must follow `visualViewport`. Unit-test the offset math in Task 4; manual phone check is in Task 8.
5. **Old client without Edit mode**: switch hidden, view-only behaviour kept. Test in Task 2.

---

### Task 1: Client Edit mode, visibility and select-by-key

**Files:**

- Modify: `src/client/iframe-bridge.ts` (message types + payload validation in `sendToParent`)
- Modify: `src/client/dom-interceptor.ts`
- Modify: `src/client/index.ts`
- Test: `tests/unit/dom-interceptor-edit-mode.test.ts` (new), `tests/unit/iframe-bridge.test.ts` (extend if it exists, else add cases to the new file)

**Interfaces:**

- Produces (bridge types):
  - `StudioMessageType` adds `'SET_EDIT_MODE'` (payload `{ on: boolean }`), `'SELECT_KEY'` (payload `{ key: string }`) and `'REVEAL_KEY'` (payload `{ key: string; bottomInset: number }` — scroll so the first visible element with that key sits fully above `bottomInset` CSS px from the frame's bottom; no selection, no-op if already visible there).
  - `ClientMessageType` adds `'RENDERED_KEYS_CHANGED'` (payload `string[]`, keys whose first _visible_ element exists, document order, same key regex as `VISIBLE_KEYS_CHANGED`) and `'TAP_UNKEYED'` (no payload).
  - `READY` payload becomes `{ url: string; features: string[] }`; this version sends `features: ['edit-mode']`.
- Produces (interceptor):
  - `setEditMode(on: boolean): void` — state kept on the instance and re-applied by `init()`.
  - `getRenderedKeys(): string[]`
  - `selectKey(key: string): boolean` — scrolls the first visible element with that key to the centre (`scrollIntoView({ block: 'center' })`), then calls `onElementSelected` with the same payload a tap builds; false if no visible element.
  - Constructor gains an optional third callback `onUnkeyedTap?: () => void`.

- [ ] **Step 1: Write failing tests** in `tests/unit/dom-interceptor-edit-mode.test.ts` (jsdom; build DOM with keyed elements carrying watermarked text as existing `tests/unit/dom-interceptor.test.ts` does):
  - `edit mode: a plain click on keyed text selects it and is cancelled` → `onElementSelected` called with `{ key: 'hero.cta', ... }`; dispatched click `defaultPrevented === true`.
  - `edit mode: a click on an <a href> image link reaches nothing` → a listener on the anchor (bubble phase) is not called; `defaultPrevented === true`; `onElementSelected` not called.
  - `edit mode: a click on unkeyed text calls onUnkeyedTap`; `edit mode: a click on an <img> does not call onUnkeyedTap`.
  - `edit mode: pointerdown, mousedown and touchstart do not reach the site but touchstart is not defaultPrevented`.
  - `edit mode: focusing a site <input> blurs it`.
  - `edit mode survives destroy() + init()`.
  - `browse (edit off): a plain click reaches the site; Alt+click still selects` (desktop path unchanged).
  - `getRenderedKeys skips hidden elements and dedupes in document order` (mock `getClientRects`/`checkVisibility`: an element with `display:none` parent, one with zero rects, a key rendered twice where the first copy is hidden → key still reported via the visible copy).
  - `selectKey uses the first visible element and returns false when none`.
  - `revealKey(key, 400) scrolls by the overlap so the element ends above the inset; no scroll when already clear` (interceptor method `revealKey(key: string, bottomInset: number): void`, mock `getBoundingClientRect` + `window.scrollBy`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/dom-interceptor-edit-mode.test.ts` → FAIL (`setEditMode is not a function`).
- [ ] **Step 3: Implement.** Visibility = `el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? el.getClientRects().length > 0`, AND non-zero bounding box. Edit-mode listeners on `window`, capture phase: `click` → preventDefault + stopPropagation, then select if `target.closest('[data-i18n-key]')`, else `onUnkeyedTap` if the target has a non-blank direct text node child; `pointerdown`/`mousedown`/`touchstart` (passive) → stopPropagation only; `focusin` on input/textarea/select/contenteditable → `blur()`. Outlines: toggle `data-livelocale-edit` on `<html>` and inject one stylesheet rule `html[data-livelocale-edit] [data-i18n-key]{outline:1px dashed rgba(79,195,220,.7);outline-offset:2px}`. In `index.ts`: handle `SET_EDIT_MODE`/`SELECT_KEY`, send `RENDERED_KEYS_CHANGED` next to `VISIBLE_KEYS_CHANGED`, wire `onUnkeyedTap` → `TAP_UNKEYED`, add `features` to both `READY` sends.
- [ ] **Step 4: Run** the new test file plus `npx vitest run tests/unit/dom-interceptor.test.ts tests/unit/iframe-bridge*.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(client): edit mode that freezes the site and selects tapped text`

### Task 2: Studio connection, touch detection, edit-mode state, Next missing

**Files:**

- Modify: `src/studio/features/dashboard/hooks/useConnection.ts`, `src/studio/features/dashboard/hooks/useStudio.ts`
- Create: `src/studio/features/dashboard/hooks/useTouchDevice.ts`, `src/studio/features/dashboard/next-missing.ts`
- Test: `tests/unit/studio-edit-mode.test.tsx`, `tests/unit/next-missing.test.ts`

**Interfaces:**

- Consumes: Task 1 message types.
- Produces:
  - `useTouchDevice(): { isTouch: boolean; isPhone: boolean }` (rules in Global Constraints; `matchMedia` missing → both false).
  - From `useConnection` (and passed through `useStudio`): `supportsEditMode: boolean` (true iff latest `READY` had `'edit-mode'` in `features`), `renderedKeys: string[] | null`, `unkeyedTapSeq: number` (increments per `TAP_UNKEYED`), `setSiteEditMode(on: boolean): void`, `selectKeyInPage(key: string): void`, `revealKeyInPage(key: string, bottomInset: number): void`.
  - `useStudio` also returns `editMode: boolean`, `setEditMode(on: boolean): void` (initial `true`), and re-sends `SET_EDIT_MODE` on every `READY` when `isTouch && supportsEditMode`.
  - `nextMissingKey(input: { renderedKeys: string[]; allPageKeys: string[]; currentKey: string | null; hasValue: (key: string) => boolean }): { kind: 'key'; key: string } | { kind: 'done'; hiddenMissing: number }` — next rendered key after `currentKey` (wrapping) with no value; `hiddenMissing` = keys in `allPageKeys` (from `VISIBLE_KEYS_CHANGED`) missing a value but not in `renderedKeys`.

- [ ] **Step 1: Write failing tests.** `next-missing.test.ts`: `walks rendered gaps in order and wraps`, `skips keys that have a value`, `done counts hidden gaps` (`{ kind: 'done', hiddenMissing: 3 }`), `done with zero hidden`. `studio-edit-mode.test.tsx` (render the hook with a fake iframe/postMessage like existing `tests/unit/studio-hooks.test.tsx`): `READY with edit-mode feature sets supportsEditMode`, `READY without features keeps supportsEditMode false and sends no SET_EDIT_MODE`, `every READY re-sends the current mode` (switch to Browse, second READY → `SET_EDIT_MODE {on:false}`), `TAP_UNKEYED bumps unkeyedTapSeq`, `useTouchDevice: coarse + 390x844 screen → phone; coarse + 1024x1366 → touch only; fine pointer → neither`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/next-missing.test.ts tests/unit/studio-edit-mode.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the hooks and function above.
- [ ] **Step 4: Run** the two files plus `npx vitest run tests/unit/studio-hooks.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(studio): drive edit mode and find the next missing text`

### Task 3: Edit/Browse switch, touch tips, unkeyed notice (tablets and phones)

**Files:**

- Create: `src/studio/features/dashboard/components/EditBrowseSwitch.tsx`
- Modify: `src/studio/features/dashboard/components/FirstRunTips.tsx`, `src/studio/app.tsx` (switch in `StudioLayout`'s `toolbar` slot for touch non-phones), `src/studio/i18n/en.ts`, `src/studio/features/dashboard/index.ts`
- Test: `tests/unit/edit-browse-switch.test.tsx`, extend `tests/unit/first-run-tips.test.tsx`

**Interfaces:**

- Consumes: `editMode`, `setEditMode`, `supportsEditMode`, `unkeyedTapSeq`, `useTouchDevice`.
- Produces: `<EditBrowseSwitch editMode={boolean} onChange={(on: boolean) => void} />` — a two-option radio group (`role="radiogroup"`, label `t('touch.mode_label')`), options `t('touch.edit')` / `t('touch.browse')`. `<FirstRunTips touch={boolean} … />`.
- Copy (en.ts): `touch.mode_label: 'Tap mode'`, `touch.edit: 'Edit'`, `touch.browse: 'Browse'`, `touch.hint: 'Tap any text to fix it'`, `touch.unkeyed: "This text isn't in your locale files, so it can't be edited here."`, `tips.step1_touch: 'Tap any text on the page. Switch to Browse to move around the site.'`.

- [ ] **Step 1: Write failing tests:** `renders Edit and Browse as a radiogroup with Edit checked`, `choosing Browse calls onChange(false)`, `each option is at least 44px tall` (class check `min-h-11`), `tips show the tap step on touch and the Alt step otherwise`.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement.** App: render the switch only when `isTouch && supportsEditMode`; show `touch.hint` once per Studio load the first time Edit is on; show `touch.unkeyed` as a polite live-region notice for 3 s whenever `unkeyedTapSeq` increases.
- [ ] **Step 4: Run** those tests plus `npx vitest run tests/unit/studio-no-hardcoded-copy.test.ts tests/unit/studio-accessible-names.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(studio): Edit/Browse switch and tap tips on touch devices`

### Task 4: Bottom sheet primitive

**Files:**

- Create: `src/studio/features/dashboard/components/BottomSheet.tsx`, `src/studio/features/dashboard/hooks/useKeyboardInset.ts`
- Test: `tests/unit/bottom-sheet.test.tsx`

**Interfaces:**

- Produces: `<BottomSheet open={boolean} onClose={() => void} labelledBy={string} children />` — `role="dialog"`, `aria-modal="true"`, dimmed backdrop (tap closes), grab handle (drag down > 80 px or flick closes), Escape closes, focus moved in on open and restored on close (reuse `useDialog`/`FOCUSABLE_SELECTOR` from `hooks/useDialog.ts`), `max-h-[85dvh]`, bottom offset = keyboard inset.
- `keyboardInset(layoutHeight: number, vv: { height: number; offsetTop: number }): number` = `Math.max(0, layoutHeight - vv.height - vv.offsetTop)`; `useKeyboardInset(): number` follows `visualViewport` resize/scroll.

- [ ] **Step 1: Write failing tests:** `keyboardInset returns 0 without keyboard and 300 for a 300px keyboard`, `sheet is a labelled modal dialog`, `backdrop click and Escape call onClose`, `focus moves into the sheet and back on close`, `sheet bottom follows the keyboard inset`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(studio): bottom sheet that stays above the phone keyboard`

### Task 5: Phone shell — top bar, editor sheet, Next missing

**Files:**

- Create: `src/studio/features/dashboard/components/PhoneTopBar.tsx`, `src/studio/features/dashboard/components/PhoneShell.tsx`
- Modify: `src/studio/app.tsx`, `src/studio/features/dashboard/components/EditorPanel.tsx` (optional `footer` slot), `src/studio/i18n/en.ts`
- Test: `tests/unit/phone-shell.test.tsx`

**Interfaces:**

- Consumes: Tasks 2–4.
- Produces: `<PhoneTopBar unsentCount locale locales onChooseLocale onSend menu={ReactNode} />` — mark, locale chip (reuses the header's locale picker behaviour), `Send · N` button, ⋯ menu holding theme, keys directory, changes, page address. `<PhoneShell topBar viewer editorSheet sendSheet bottomBar />` layout: viewer fills between top bar and bottom bar. In `app.tsx`, when `isPhone` render `PhoneShell` instead of `Header` + `StudioLayout`; the editor sheet opens on every completed pick (`selectionCount`, as the drawer does today) and contains the same `EditorPanel` with a footer `Next missing →` button.
- Copy: `phone.menu: 'More'`, `phone.send: 'Send · {count}'`, `phone.next_missing: 'Next missing'`, `phone.done_all: 'Everything on this page is translated.'`, `phone.done_hidden: { one: 'Everything you can see is translated. 1 more is in a hidden part of the page (a menu or slide).', other: 'Everything you can see is translated. {count} more are in hidden parts of the page (menus, slides).' }`.

- Keeping the picked text visible: whenever the editor sheet opens, resizes, or the keyboard inset changes, call `revealKeyInPage(selected.key, sheetTopOffsetFromFrameBottom)` (measure the sheet with a `ResizeObserver`).

- [ ] **Step 1: Write failing tests:** `opening the sheet reveals the picked key above it` (asserts `revealKeyInPage` called with the key and the sheet height), `phone shell shows mark, locale chip and Send · N, nothing else in the bar`, `menu holds the theme toggle`, `a pick opens the editor sheet`, `Next missing calls selectKeyInPage with the next gap`, `Next missing with no visible gaps shows done_hidden with the count`, `rotation (resize) does not remount the editor` (type, fire resize, value kept).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** plus `npx vitest run tests/unit/studio-layout.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(studio): phone layout with the editor in a bottom sheet`

### Task 6: Send sheet with the phone's share menu

**Files:**

- Modify: `src/studio/features/dashboard/components/SendDialog.tsx` (accept `presentation: 'dialog' | 'sheet'`; in `'sheet'` render inside `BottomSheet`), `src/studio/app.tsx`, `src/studio/i18n/en.ts`
- Test: extend `tests/unit/send-dialog.test.tsx`

**Interfaces:**

- Produces: `shareLink(url: string, nav: Pick<Navigator, 'share' | 'canShare'>): Promise<'shared' | 'cancelled' | 'unsupported'>` in `SendDialog.tsx` (or a sibling `share-link.ts`). Primary button `t('send.share')` = 'Share link…' only when `navigator.share` exists; `Copy link` always shown. Marking drafts sent follows the existing Copy rule (same `onMarkSent` timing).
- [ ] **Step 1: Write failing tests:** `sheet presentation shows Share link when navigator.share exists`, `without navigator.share only Copy link shows`, `cancelled share (AbortError) does not mark drafts sent`, `successful share marks drafts sent`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(studio): send changes through the phone's share menu`

### Task 7: Phone e2e on the share Studio

**Files:**

- Create: `tests/e2e/studio-phone.spec.ts` (follow the share-Studio setup in `tests/e2e/static-share.spec.ts`; `test.use({ ...devices['Pixel 7'] })`)

- [ ] **Step 1: Write the specs:** `opens in Edit with outlines and the tap hint`; `tapping a link's text selects it and does not navigate` (URL unchanged, sheet shows the key); `tapping an image link does nothing`; `Browse follows the link and the switch stays on Browse on the new page`; `switching back to Edit on the new page freezes it again`; `type and save updates the page`; `Next missing walks the gaps and then reports done`; `Send shows the change list and Copy link`; `desktop project never shows the switch` (add a case in an existing desktop spec).
- [ ] **Step 2: Run** `npx playwright test tests/e2e/studio-phone.spec.ts` → PASS (fix code, not tests, on failure).
- [ ] **Step 3: Run** the full desktop e2e `npx playwright test` → PASS unchanged.
- [ ] **Step 4: Commit** `test(e2e): the Studio on a phone, tap to send`

### Task 8: Docs, phone screenshot, changelog, final checks

**Files:**

- Modify: `site/docs/how-it-works/risks-and-limits.md:17`, `site/docs/guides/studio.md:109` (+ new "On a phone" section), `site/docs/guides/share-links.md:88,158`, `site/docs/start/static-host.md:51`, `site/scripts/record-docs.mjs` + `site/scripts/docs/media.mjs` + `media.d.mts` (new shot `studio-phone`, viewport 390×844, `hasTouch`, `isMobile`), `CHANGELOG.md` (Unreleased → Minor Changes, **Added**)
- Test: existing `tests/unit/site/*` and `tests/site/*`

- [ ] **Step 1:** Replace every "desktop only / phones can only view" line with how phones work (Edit/Browse, tap, sheet, Share link) and the drafts caveat: phones lose browser storage more easily (private tabs, iOS clearing data for sites not visited for a while), so send changes when done.
- [ ] **Step 2:** Record: `npm run build && node site/scripts/record-docs.mjs studio-phone`; view the image to confirm the phone shell with the editor sheet open.
- [ ] **Step 3:** Run `npm run lint && npm run format:check && npm run typecheck && npx vitest run && npm run site:build && npm run test:site` → all PASS.
- [ ] **Step 4: Commit** `docs: editing from a phone`
- [ ] **Step 5 (owner, manual):** check on a real iPhone (Safari) and Android (Chrome): keyboard keeps the field and the picked text visible; Share link opens the share menu.
