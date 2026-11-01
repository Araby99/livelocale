> **Status: approved by the owner on 2026-11-01.** Produced from a design conversation with the owner and a builder check. The owner's words are marked as theirs; decisions in §12 were confirmed by the owner; the remaining "Claude's call" items may still be overridden.

# LiveLocale 0.11.0: launch features

## 1. Intent

LiveLocale is about to be launched publicly. The owner's success measure for the launch is simple: **people try it and download it** (the six-month kill criteria are ≥100 weekly downloads at month 3 and ≥500 at month 6).

The first person to find LiveLocale is, in the owner's words, "a developer who is really pissed off because of the ache of a multi-language website". That ache has two moments, both described by the owner:

1. **Before launch: corrections by screenshot.** Someone on the team sends "tons of screenshots" of sections with the right wording, often for places the developer can't even find. The developer becomes the copy-paste layer between screenshots and JSON files. (Already solved by the share link and one-click pull requests in 0.9/0.10.)
2. **On launch day: surprises.** "Hardcoded text, an English-only word, or a missing key" discovered in production.

The launch pitch built from this (approved by the owner, without naming the "PM", which the owner rejected as too narrow):

> **Stop collecting screenshots. Stop finding untranslated text on launch day.**
> Anyone on your team fixes text right on the site. You get a pull request. CI catches what was never translated.

0.11.0 makes the second half of that pitch true and makes the Studio comfortable for the non-developer who fixes text.

## 2. Goals

In priority order (the owner named `check --hardcoded` as the one feature they would be most embarrassed to launch without):

1. **`livelocale check --hardcoded`** finds user-visible text that never went through translation, and text stuck in the wrong language in locale files, and fails CI on it.
2. **The Studio in Arabic**, with a right-to-left layout, switchable from English.
3. **Accessibility basics** in the Studio: visible keyboard focus, labels on controls, readable contrast, everything reachable by keyboard.
4. **A light theme** for the Studio that follows the system setting, with a toggle.

## 3. Non-goals

- Branding, the logo, colours, the landing page and the live demo. They are a separate project, designed next (the light theme will adopt the brand colours once they exist; until then it uses neutral tokens).
- More Studio languages than English and Arabic.
- Detecting hardcoded text in non-JSX templates (Vue, Svelte, Angular, plain HTML files) and in server-only strings such as log messages.
- A full WCAG audit or certification.
- Auto-fixing hardcoded text (extracting it into keys). Reporting only.

## 4. Anti-goals

- **A noisy checker.** If the first `check --hardcoded` run on a real project prints hundreds of false alarms (class names, ids, URLs, test files), developers turn it off and the launch pitch is a lie. Precision beats recall.
- **Breaking the zero-runtime-dependency promise.** No new entry in `dependencies`.
- **Changing what `check` does without the flag.** Existing CI pipelines must not start failing after an upgrade.
- **Making the Studio harder for developers** (e.g. forcing Arabic or a light theme on people who did not choose it).

## 5. Feature: `check --hardcoded`

### 5.1 What it flags (agreed with the owner)

The owner said hardcoded text can hide "anywhere, no special thing to remember", so the check covers everything a user can see:

- **Hardcoded UI text in components** (`.tsx`, `.jsx`; `.ts`/`.js` files that contain JSX):
  - visible JSX text, e.g. `<button>Save</button>`;
  - user-facing attributes: `alt`, `title`, `placeholder`, `aria-label`, `label` (and `aria-description`, `aria-placeholder`, `aria-roledescription`, `aria-valuetext`: Claude's call);
  - string literals passed directly as JSX children in expressions, e.g. `{'Save'}` or `{cond ? 'Yes' : 'No'}` (Claude's call; template literals with only static text count too).
- **Text in the wrong language in locale files**, for every non-source locale:
  - a value identical to the source-locale value for the same key (`untranslated`);
  - in a locale whose script is not Latin (e.g. `ar`, `fa`, `he`, `ru`, `zh`, `ja`, `ko`, `hi`, `th`, `el`, `uk`), a value whose letters are mostly Latin (`wrong-script`). "Mostly" = more than half of the letters after removing placeholders, ICU syntax, URLs and markup. (Claude's call on the threshold and the locale list.)

### 5.2 What it ignores (agreed with the owner: "quiet")

- Text already passed through a translation call the scanner recognises (`t()`, `t.rich` etc., see `src/server/key-scanner.ts`).
- Text with no letters (numbers, punctuation, symbols, emoji), single characters, and code-like strings: URLs, emails, file paths, CSS class lists in `className`/`class`, ids, `data-*` and `key`/`ref`/`style`/`href`/`src`/`type`/`role`/`name`/`id` attributes, kebab/camel/snake-case identifiers.
- Files: tests and stories (`*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__/`, `__mocks__/`), `.d.ts`, and the scanner's existing ignored folders and gitignore.
- **Opt-outs, so brand names and intentional English never block CI:**
  - a comment `// livelocale-ignore-next-line` (and `{/* livelocale-ignore-next-line */}` in JSX), and `livelocale-ignore-file` at the top of a file;
  - an allow-list of words that never count (e.g. `LiveLocale`, `GitHub`, product names), given as repeatable `--allow <word>` and read from a `livelocale.allow` text file at the project root if present (one entry per line). (Claude's call on the file name and format; no new config system.)
- Locale-file checks skip values that are empty (already reported by `check` as `empty`), and values that are allowed to equal the source: allow-list words, values with no letters, and keys listed in the allow file as `key:<dotted.key>` (Claude's call).

### 5.3 How it reports

- New issue kinds: `hardcoded` (with `file`, `line`, `column`, the text shortened to ~60 characters), `untranslated` and `wrong-script` (with `locale`, `key`, `file`).
- Level: `hardcoded` is `fail`; `untranslated` and `wrong-script` are `warn` by default and `fail` with `--strict`, matching how `check` treats `empty` today (Claude's call: identical values are often legitimate, e.g. "OK", brand names).
- Human output keeps today's grouping by issue kind, so 0.10.x output does not change. Inside the `hardcoded` group, findings are sub-grouped by file with line numbers, and the group ends with a per-file count summary; `untranslated` and `wrong-script` list `locale  key` like today's locale issues. The existing 25-lines-per-group cap applies per kind, with "and N more" (owner agreed: a big project must not be overwhelming on the first run). (Claude's call after the builder check.)
- `--json` output includes the new issue fields. Exit code 1 on any fail-level issue, as today.
- Without `--hardcoded`, `check` behaves exactly as in 0.10.x (anti-goal). `livelocale check --hardcoded` runs all existing checks plus the new ones.
- New flag `--hardcoded-only` to run just the new checks is **not** added (YAGNI); teams combine `--hardcoded` with `--no-unused` as needed.

### 5.4 How it parses (Claude's call)

The scanner today is regex-only and the package has no runtime dependencies. Hardcoded-text detection needs to understand JSX, which regex does poorly.

- Use the TypeScript compiler API **from the user's own project** when `typescript` resolves from the project directory (nearly every Next.js and Vite TypeScript project has it), loaded with a lazy dynamic `import()` so the package keeps zero dependencies. `typescript` is added as an optional peer dependency (`peerDependenciesMeta: { typescript: { optional: true } }`).
- Without `typescript` available, `check --hardcoded` still runs every other check (including the locale-file checks below), prints their findings, then prints one clear message ("install typescript as a dev dependency to enable hardcoded-text detection") and exits with code 2 (a setup error, distinct from findings). In `--json`, the report gains `"setupProblems": ["..."]`. (Claude's call after the builder check.) Claude's call: a second, home-grown JSX tokenizer is not built; it would be the noisiest part of the feature and the population without `typescript` is small.
- Locale-file checks (`untranslated`, `wrong-script`) need no parser and always run with `--hardcoded`.

### 5.5 Docs

README section "Catch untranslated text before launch" with a CI example, the opt-out comment, the allow file, and the honest limits (JSX only; dynamic strings built at runtime are not seen).

## 6. Feature: the Studio in Arabic

- All user-visible Studio copy (about 150 strings, today hardcoded English JSX in `src/studio/features/dashboard/components/*.tsx`) moves into one strings catalogue with `en` and `ar` entries. A missing Arabic entry falls back to English (and a unit test fails if any key lacks an Arabic entry).
- A language switch in the Studio header (English / العربية), remembered per browser (localStorage, wrapped in try/catch). Defaults (Claude's call after the builder check, to honour the anti-goal of not forcing a change on current users): the **dev/preview Studio** stays English until the person chooses; the **share Studio** (the non-developer's link) follows the browser's language (`navigator.language` starting with `ar` → Arabic).
- Arabic sets `dir="rtl"` and `lang="ar"` on the Studio root; layout uses logical properties (start/end) so panels, drawers, icons with direction and the editor mirror correctly. Translation values keep `dir="auto"` as today.
- The share Studio (static mode) and the dev Studio both get it. Copy quality: Arabic strings are written in clear Modern Standard Arabic; the owner reviews them before release (the owner is a native speaker).
- The first-run tips and Send dialog, which the non-developer sees first, are the priority for natural wording.

## 7. Feature: accessibility basics

- A global, visible keyboard focus style (`:focus-visible` ring) for every interactive element, replacing today's ad-hoc focus classes.
- Every icon-only button and every input has an accessible name.
- Text and controls meet WCAG AA contrast (4.5:1 for text, 3:1 for UI parts) in both themes.
- Everything reachable and usable by keyboard: panels, drawers, the key list, the editor, dialogs (dialogs already trap focus via `useDialog`).
- Status changes that matter (saved, sent, errors) are announced via existing `role="status"`/`role="alert"` regions where missing.
- An automated check in the E2E suite (axe-core run as a devDependency in Playwright) fails on serious/critical violations on the main Studio screens (Claude's call; devDependency only).

## 8. Feature: light theme

- The Studio's components move from hardcoded dark palette classes (about 200 `slate-…`/`bg-[#…]` uses) to the existing semantic theme tokens in `src/studio/index.css`, which already define light (`:root`) and dark (`.dark`) values.
- A toggle (system / light / dark) in the header, remembered per browser. Defaults (Claude's call after the builder check): the **dev/preview Studio** stays dark until the person chooses, so current users see no change; the **share Studio** follows the system setting (`prefers-color-scheme`).
- Dark mode must look as it does today (no visual regression for current users); light mode uses neutral tokens until the brand colours exist.

## 9. Constraints

- No runtime dependencies (optional peer `typescript` only; devDependencies allowed: `axe-core`/`@axe-core/playwright`).
- Node ≥ 18; browser-safe core rules from the share-link plan still apply to `src/core`.
- `check` without `--hardcoded` and the server-mode Studio flows behave as in 0.10.x; existing tests stay green.
- Release as `0.11.0` (minor), with a `next` prerelease build and a smoke check of `check --hardcoded` on the demo repo Translation-Test before `latest`.

## 10. Left to the builder

- The exact list of user-facing attributes beyond the agreed ones, the identifier heuristics, and the Latin-script threshold tuning, as long as precision stays high on the repo's own playgrounds and the demo repo (they are the noise benchmark: zero false alarms on intentionally translated code).
- The strings-catalogue module shape and file layout in the Studio.
- How the theme and language toggles are laid out in the header (one settings menu is fine).
- The order of work, as long as `check --hardcoded` lands first.

## 11. Next project (not in this design)

Branding and the landing page: logo, colours, voice; a visual site on `livelocale.js.org` (free; owner approved; `livelocale.dev` is unregistered and can be bought later) with a hero GIF, short clips, Studio screenshots and a live demo of the share Studio; launch posts on Reddit (r/nextjs, r/reactjs, r/webdev), LinkedIn (English and one Arabic post), Show HN, dev.to and "awesome" lists. Arabic Facebook groups are excluded (owner's call).

## 12. Decisions confirmed by the owner (2026-11-01, after the builder check)

1. **Arabic coverage.** Everything the Studio itself shows becomes Arabic: component copy, the share modules (Send, backup, GitHub issue, review checks rendered by the Studio) and the hooks' user-facing messages. **Error messages that come from the server or the shared validation core stay English in 0.11.0** (no change to the server API or `src/core`); an Arabic screen may occasionally show an English server error.
2. **Parser.** `check --hardcoded` uses the project's own `typescript` package (optional peer dependency, lazy import). No home-grown JSX tokenizer. Without `typescript`, the other checks run and the command exits 2 with a clear setup message (§5.4).
3. **Levels.** `untranslated` and `wrong-script` are warnings by default and fail with `--strict`; `hardcoded` always fails (§5.3).
