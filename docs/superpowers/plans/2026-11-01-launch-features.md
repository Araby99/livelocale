# LiveLocale 0.11.0 Launch Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 0.11.0: `livelocale check --hardcoded` (fails CI on text that never went through translation), a Studio restyled with the LiveLocale brand in a light and a dark theme, in English and Arabic with a mirrored layout, and accessibility basics with an axe gate.

**Architecture:** `check --hardcoded` is Node-only CLI code under `src/codemod/hardcoded/`, parsing JSX with the user's own `typescript` (optional peer, lazy `require` from the project directory), feeding new issue kinds into the existing `runCheck`/`formatCheckReport`. The Studio gains one preferences module (`src/studio/preferences.ts`) and one header settings slot shared by the language switch and the theme toggle; its colours become semantic brand tokens (`--lc-*` variables for `:root` light and `.dark` dark, exposed to Tailwind as colour names and AA-checked by a unit test), its type becomes the brand's self-hosted Fontsource faces, and the logo replaces today's header tile; every component then moves from fixed palette classes to the tokens, copy moves into an `en`/`ar` catalogue with logical (start/end) layout, and accessibility work lands last so it audits the final UI.

**Tech Stack:** TypeScript, Node ≥ 18, tsup, React 18, Tailwind CSS 4.3.3, Vite (Studio bundle), Vitest (jsdom/node), Playwright, TypeScript compiler API (from the user's project), `@axe-core/playwright` (devDependency), Fontsource devDependencies (`@fontsource/bricolage-grotesque`, `@fontsource/inter` (already present), `@fontsource/jetbrains-mono`, `@fontsource/readex-pro`, `@fontsource/ibm-plex-sans-arabic`), Changesets.

**Spec:** `docs/superpowers/specs/2026-11-01-launch-features-design.md` (amended §8), with the brand from `docs/superpowers/specs/2026-11-01-brand-and-landing-design.md` §2 and §4.

## Global Constraints

Copied verbatim from the launch-features spec (§9, §4, §8, §12); every task's requirements include them:

- No runtime dependencies (optional peer `typescript` only; devDependencies allowed: `axe-core`/`@axe-core/playwright`, and the brand fonts from Fontsource: Bricolage Grotesque, Inter, JetBrains Mono, Readex Pro, IBM Plex Sans Arabic).
- Node ≥ 18; browser-safe core rules from the share-link plan still apply to `src/core`.
- `check` without `--hardcoded` and the server-mode Studio flows behave as in 0.10.x; existing tests stay green.
- Release as `0.11.0` (minor), with a `next` prerelease build and a smoke check of `check --hardcoded` on the demo repo Translation-Test before `latest`.
- **A noisy checker.** If the first `check --hardcoded` run on a real project prints hundreds of false alarms (class names, ids, URLs, test files), developers turn it off and the launch pitch is a lie. Precision beats recall.
- **Breaking the zero-runtime-dependency promise.** No new entry in `dependencies`.
- **Changing what `check` does without the flag.** Existing CI pipelines must not start failing after an upgrade.
- **Making the Studio harder for developers** (e.g. forcing Arabic or a light theme on people who did not choose it). Restyling with the brand is allowed (owner, 2026-11-01).
- The Studio's components move from hardcoded palette classes (about 200 `slate-…`/`bg-[#…]` uses) to one set of semantic colour tokens defined from the brand palette for both themes. Today's colours are not preserved.
- Dark mode no longer has to look as it does today; both themes follow the brand and meet WCAG AA. The defaults above still apply (the dev Studio starts dark, now in the brand's dark theme).
- **Error messages that come from the server or the shared validation core stay English in 0.11.0** (no change to the server API or `src/core`); an Arabic screen may occasionally show an English server error.
- `untranslated` and `wrong-script` are warnings by default and fail with `--strict`; `hardcoded` always fails (§5.3).

Copied verbatim from the brand spec (§2.2–§2.5):

- The wordmark is `livelocale`, all lowercase, set in the heading face.
- Rules: coral is used sparingly, only for the moment that matters. All text meets WCAG AA (4.5:1) on its background; white text is never placed on coral at body size below 18 px bold.
- Fonts are self-hosted (Fontsource packages as devDependencies, bundled into the site and the Studio); nothing loads from Google at runtime.
- `font-family` stacks list the Latin face first and the Arabic face second, so mixed-script text renders each script in its own face; Arabic text gets a slightly larger size and line-height (about 1.08× size, line-height 1.7) for legibility.
- Short, direct, a little blunt; written by a developer who has felt the pain. Plain verbs, sentence case, no hype. Errors and empty states give direction, never apologise.

Project rules (from the repo and the owner):

- Commit messages are conventional and never mention Claude, Anthropic or AI; no `Co-Authored-By` trailer, no "Generated with" line.
- Gate before every commit: `npm run typecheck`, `npm run lint` and `npm run format:check` exit 0 (run `npm run format:write` when the last one fails). `npm run lint` rejects raw invisible characters: write U+2068/U+2069 and similar as `\u` escapes.
- Translation values are never logged (SEC-001); `hardcoded` findings print source-code text only, shortened to 60 characters.
- Coverage thresholds 85/70/85/85 hold (`npm run test:coverage`).
- Studio colours use the Task 10 brand token classes only, with no hex or `rgb()`/`oklch()` literal in a component (guarded per file from Task 12, over the whole Studio from Task 14); Studio type uses `font-heading`, the default `font-sans` and `font-mono` only (Task 11); Studio layout uses start/end utilities only (Task 19 guard); new user-visible Studio copy goes through the catalogue with an Arabic entry once Task 17 has landed (Task 24 guard); components never set `focus:` outline/ring/border utilities once Task 25 has landed.
- Short paths: `components/…` and `hooks/…` are under `src/studio/features/dashboard/`; `i18n/…` is `src/studio/i18n/`.
- Test conventions: node-only test files start with `// @vitest-environment node`, DOM tests with `// @vitest-environment jsdom`. CLI temp projects use `fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-hc-'))` and a local copy of the `write(root, rel, content)` and `keysOf` helpers from `tests/unit/check.test.ts` (copy; do not import across test files). E2E runs stop servers on 3000, 3010 and 3020 first and run `npm run build` before Playwright, because `reuseExistingServer` would serve a stale Studio.

## Review Focus

Inputs the spec implies but no feature test exercised in the drafts; each now has a pinning test in the owning task:

1. **Component files with CRLF line endings or a BOM** (every Windows checkout): `hardcoded` lines and columns must match the editor, and `livelocale-ignore-next-line` must still work. Pinned in Task 4, `reports correct positions and honours ignore comments in CRLF files with a BOM`.
2. **Prettier-formatted JSX under an ignore comment** (`{/* livelocale-ignore-next-line */}` above a `<p>` whose text sits on its own line, or above a multi-line `<img alt="…" />`): the brand text is not reported, so the opt-out works where people put it. Pinned in Task 4, `honours an ignore comment above a multi-line element`.
3. **Locale files with arrays, numbers and plural forms that exist only in the target** (`ar.json` with `items_zero`): non-string leaves skipped without a crash; target-only plural forms checked by `wrong-script`, never by `untranslated`. Pinned in Task 3, `skips non-string leaves and checks Arabic-only plural forms for script only`.
4. **Header settings by keyboard in Arabic** (RTL): the language switch and the theme buttons are reachable by Tab, show the 2px ring, and act on Enter. Pinned in Task 27, `reaches the language and theme controls by keyboard in Arabic`.
5. **First visit to a share link from an Arabic browser under a light system setting**: both defaults apply together; no dark frame, root `dir="rtl"`, tips in Arabic in the brand's Arabic UI face. Pinned in Task 24, `starts light and in Arabic on a first visit from an Arabic browser`.

## Owner flags

Decisions the owner should see before execution:

1. **Task 10 derives the colours the brand does not name.** Brand §2.3 fixes nine colours; the Studio also needs panel and card surfaces, a hover fill, a 3:1 control border, a coral tint, and danger/warning/success/info colours. Task 10 derives them as warm-tinted values beside the brand ones; every pair is AA-checked by a unit test. Task 16 Step 9 captures light and dark screenshots for the owner to look at (not a release blocker; the brand is final).
2. **Coral as text in light uses a darker coral.** Coral `#FF6B4A` on Paper is 2.67:1, below AA for text and below 3:1 for the focus ring. Light coral text (`accent-fg`) and the light focus ring use `#B23A1E` (4.73:1 on `raised-hover` `#EFE3D6`, its lowest, and 5.1:1 or better on the other light surfaces and tints; `warning-fg` is lowest on `raised-hover` too, at 4.69:1; both pass AA, the margin is thin, and any light token edit re-runs the Task 10 pairs); coral fills keep `#FF6B4A` with Ink text on them (6.3:1), never white (brand rule).
3. **Task 11 swaps the Studio fonts** (Outfit out; Bricolage Grotesque, JetBrains Mono, Readex Pro and IBM Plex Sans Arabic in; Inter stays). The fonts are bundled into `dist/studio` and grow the tarball; Task 11 records the `npm pack --dry-run` size before and after in its commit body.
4. **The header shows the wordmark `livelocale` in lower case**, with the patch logo, replacing today's gradient tile, eye icon and "LiveLocale" heading.
5. **Task 32 is blocked on the owner's Arabic copy review** (Task 24 Step 6). The `next` prerelease (Task 31) may ship before that review, carrying unreviewed Arabic copy on `main`; only `latest` waits for it (spec §6: "the owner reviews them before release").
6. **Existing English Studio copy keeps its wording in 0.11.0.** Brand §2.5 asks for sentence case, but today's English copy (`Live Visual Translation Studio`, `All Keys`, `Page Keys`, `Manage Languages`, `Back to Editor`, `Add New Locale`, `Reload Frame`, …) moves into `i18n/en.ts` verbatim (Tasks 20–23), so existing unit and E2E assertions keep passing and the copy move stays reviewable on its own. The voice rule binds **new** English copy only (every key added from Task 17 on is sentence case, e.g. Task 26's `Search keys or values`, `Commit message`); a sentence-case pass over the old copy is a follow-up after 0.11.0. Arabic copy follows the voice rule throughout.
7. **A brief light frame before the Studio script runs.** The built stylesheet is linked in `<head>`, so in the instant before `main.tsx` runs every Studio paints `:root`, the light Paper theme. A dev Studio (which then turns dark) and a share Studio under a dark system therefore flash Paper once while loading. Avoiding it needs an inline script in `src/studio/index.html` or a duplicated dark token block under `prefers-color-scheme`; neither is planned for 0.11.0. From `main.tsx` on, the frames are as pinned in Task 16.

---

# Milestone 1: `check --hardcoded` (spec §5, §12.2, §12.3)

**Milestone constraints:**

- `check` without `--hardcoded` prints, returns and exits exactly as 0.10.x: no new issue kinds, no `setupProblems` key in `--json`, same exit codes.
- `typescript` becomes an optional peer (`"typescript": ">=4.7.0"`, `peerDependenciesMeta.typescript.optional: true`); it stays in `devDependencies` for the repo. tsup already lists it in `external`.
- The project's `typescript` is loaded only when `--hardcoded` is set, with `createRequire(path.join(projectDir, 'package.json'))('typescript')`. (Not `import()`: tsup's CJS build turns `import()` into `require()` of the specifier, which cannot take a project-relative absolute URL; TypeScript ships CommonJS, so both builds load it the same way.)
- Without a usable `typescript`: every other check runs and prints, then the setup problem (Task 5: `TYPESCRIPT_MISSING` when it does not resolve, `typescriptUnusable(version)` when it resolves without a `createSourceFile` function) is printed and the exit code is **2**, which wins over 1. `--json` gains `"setupProblems": [<that message>]`; the key is absent when there is no problem. The peer range stays `>=4.7.0` without an upper cap (see Review notes).
- `src/server/key-scanner.ts` only gains `export` on `IGNORE_DIRS` and `MAX_SOURCE_BYTES`; server mode and `KeyScanner.scanSourceKeys` stay byte-identical.
- Code under `src/codemod/hardcoded/` is Node-only (regex lookbehind and `fs` are fine); nothing under `src/core`, `src/studio` or `src/client` imports it — except tests (Task 24 reuses `findHardcodedText`).

**File map:**

| File                                             | Responsibility                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `src/codemod/hardcoded/allow-list.ts` (new)      | `livelocale.allow` + `--allow` parsing; removing allowed words                  |
| `src/codemod/hardcoded/text-filters.ts` (new)    | Is this string user-visible text? Normalising and shortening                    |
| `src/codemod/hardcoded/locale-script.ts` (new)   | Non-Latin locale list, markup stripping, mostly-Latin test                      |
| `src/codemod/hardcoded/scan-jsx.ts` (new)        | Pure AST walk: one file's text → hardcoded findings                             |
| `src/codemod/hardcoded/load-typescript.ts` (new) | Resolve the project's `typescript` or report the setup problem                  |
| `src/codemod/hardcoded/files.ts` (new)           | Which component files to scan                                                   |
| `src/codemod/check.ts`                           | New kinds, fields, options; locale-file checks; JSX findings; formatting        |
| `src/codemod/check-cli.ts` (new)                 | `check` argument parsing and exit code                                          |
| `src/codemod/index.ts`                           | `runCheckCommand` uses `check-cli.ts`; help lines                               |
| `tests/unit/helpers/project-typescript.ts` (new) | `linkTypeScript(projectDir)` so a temp project resolves the repo's `typescript` |

---

### Task 1: Allow list and the user-visible-text filter

**Files:**

- Create: `src/codemod/hardcoded/allow-list.ts`, `src/codemod/hardcoded/text-filters.ts`
- Test: `tests/unit/hardcoded-text.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `export const ALLOW_FILE = 'livelocale.allow'`
  - `export interface AllowList { words: string[]; keys: Set<string> }` — `words` deduplicated, sorted longest first (stable).
  - `export const EMPTY_ALLOW: AllowList`
  - `export function parseAllowFile(content: string): AllowList`
  - `export function readAllowList(projectDir: string, extra?: string[]): AllowList`
  - `export function removeAllowed(text: string, allow: AllowList): string`
  - `export const MAX_REPORTED_TEXT = 60`
  - `export function normalizeText(raw: string): string`
  - `export function shortenText(text: string): string`
  - `export function isUserText(text: string, allow: AllowList): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
describe('parseAllowFile', () => {
  it('reads words, phrases and key entries, skipping blanks and comments', () => {
    const allow = parseAllowFile(
      '# brands\nGitHub\r\n\n  LiveLocale  \nkey:brand.name\nkey:\nMade in Cairo\n'
    );
    expect(allow.words).toEqual(['Made in Cairo', 'LiveLocale', 'GitHub']);
    expect([...allow.keys]).toEqual(['brand.name']);
  });
});

describe('readAllowList', () => {
  it('merges livelocale.allow with --allow words', () => {
    write(project, 'livelocale.allow', 'GitHub\n');
    expect(readAllowList(project, ['Acme', 'GitHub']).words).toEqual(['GitHub', 'Acme']);
  });
  it('returns an empty list when the file is missing', () =>
    expect(readAllowList(project)).toEqual({ words: [], keys: new Set() }));
});

describe('removeAllowed', () => {
  const allow = parseAllowFile('GitHub\nGitHub Pages\n');
  it('removes whole-word, case-sensitive matches, phrases first', () => {
    expect(removeAllowed('Open on GitHub Pages', allow).trim()).toBe('Open on');
    expect(removeAllowed('MyGitHubApp github', allow)).toBe('MyGitHubApp github');
  });
});

describe('normalizeText and shortenText', () => {
  it('decodes entities and collapses whitespace', () =>
    expect(normalizeText('\n   Welcome&nbsp;back,\n   friend &amp; co  ')).toBe(
      'Welcome back, friend & co'
    ));
  it('keeps 60 characters at most, ending in an ellipsis', () => {
    expect(shortenText('x'.repeat(60))).toBe('x'.repeat(60));
    expect(shortenText('y'.repeat(61))).toBe('y'.repeat(59) + '…');
    expect([...shortenText('مرحبا '.repeat(20))].length).toBe(60);
  });
});

describe('isUserText', () => {
  it.each([
    ['Save changes', true],
    ['save', true],
    ['GitHub', true],
    ['حفظ', true],
    ['x', false],
    ['42', false],
    ['— · ✓ 🎉', false],
    ['https://example.com/docs', false],
    ['www.example.com', false],
    ['mailto:a@b.co', false],
    ['team@example.com', false],
    ['/images/hero.png', false],
    ['./foo', false],
    ['src\\app', false],
    ['hero-image', false],
    ['user_name', false],
    ['MAX_ITEMS', false],
    ['onClick', false],
    ['home.title', false],
  ])('%s → %s', (text, expected) => expect(isUserText(text, EMPTY_ALLOW)).toBe(expected));

  it('ignores text made only of allowed words', () => {
    const allow = parseAllowFile('GitHub\nLiveLocale\n');
    expect(isUserText('GitHub', allow)).toBe(false);
    expect(isUserText('LiveLocale · GitHub', allow)).toBe(false);
    expect(isUserText('Open on GitHub', allow)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/hardcoded-text.test.ts`
Expected: FAIL — cannot resolve `../../src/codemod/hardcoded/allow-list.js`.

- [ ] **Step 3: Implement `allow-list.ts`**

`parseAllowFile`: split on `/\r?\n/`, trim, skip empty lines and lines starting with `#`; `key:<rest>` adds the trimmed rest to `keys` when non-empty; every other line is a word or phrase. `readAllowList` reads `path.join(projectDir, ALLOW_FILE)` (missing → no entries), appends `extra`, deduplicates, sorts. `removeAllowed` replaces each word, in `words` order, with a space using `new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'gu')`.

- [ ] **Step 4: Implement `text-filters.ts`**

`normalizeText`: decode `&nbsp;` (to a space), `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&apos;`, `&#NNN;`, `&#xHH;`; collapse `/\s+/g` to one space; trim. `shortenText` counts code points; above `MAX_REPORTED_TEXT` keep 59 and append `…`. `isUserText` returns false, in this order, when:

1. `removeAllowed(text, allow).trim()` has fewer than 2 code points;
2. it has no `\p{L}` letter;
3. it has no whitespace and matches any of: `^(?:[a-z][a-z\d+.-]*:\/\/|www\.|mailto:|tel:)`i, `^[^\s@]+@[^\s@]+\.[^\s@]+$`, `^(?:\.{0,2}\/|~\/)`, `[\/\\]`, `^[a-z\d]+(?:-[a-z\d]+)+$`, `^[a-z\d]+(?:_[a-z\d]+)+$`, `^[A-Z\d]+(?:_[A-Z\d]+)+$`, `^[a-z]+(?:[A-Z][a-z\d]*)+$`, `^[a-z][\w-]*(?:\.[\w-]+)+$`.

Otherwise true.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/unit/hardcoded-text.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/codemod/hardcoded/allow-list.ts src/codemod/hardcoded/text-filters.ts tests/unit/hardcoded-text.test.ts
git commit -m "feat(check): add the allow list and the user-visible text filter for --hardcoded"
```

---

### Task 2: Script detection for locale values

**Files:**

- Create: `src/codemod/hardcoded/locale-script.ts`
- Test: `tests/unit/hardcoded-locale-script.test.ts`

**Interfaces:**

- Consumes: `AllowList`, `EMPTY_ALLOW`, `parseAllowFile`, `removeAllowed` (Task 1).
- Produces:
  - `export const NON_LATIN_LANGUAGES: ReadonlySet<string>`
  - `export function primaryLanguage(locale: string): string` — lowercase first subtag split on `[-_]`.
  - `export function isNonLatinLocale(locale: string): boolean`
  - `export function stripMarkup(value: string): string`
  - `export function hasLetters(value: string, allow: AllowList): boolean` — `\p{L}` remains after `removeAllowed(stripMarkup(value), allow)`.
  - `export function isMostlyLatin(value: string, allow: AllowList): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
describe('isNonLatinLocale', () => {
  it.each([
    ['ar', true],
    ['ar-EG', true],
    ['fa', true],
    ['he', true],
    ['ru', true],
    ['uk', true],
    ['zh', true],
    ['zh_Hant', true],
    ['ja', true],
    ['ko', true],
    ['hi', true],
    ['th', true],
    ['el', true],
    ['sr-Cyrl', true],
    ['ckb', true],
    ['ckb-IQ', true],
    ['ug', true],
    ['sr', false],
    ['zh-Latn', false],
    ['en', false],
    ['fr-CA', false],
    ['tr', false],
  ])('%s → %s', (locale, expected) => expect(isNonLatinLocale(locale)).toBe(expected));
});

describe('stripMarkup', () => {
  it('removes placeholders, ICU syntax, URLs, emails and tags but keeps message text', () => {
    expect(
      stripMarkup('{count, plural, =0 {لا ملفات} one {# ملف} other {# ملفات}}')
        .replace(/\s+/g, ' ')
        .trim()
    ).toBe('لا ملفات ملف ملفات');
    expect(
      stripMarkup('Hi {{name}}, <b>%1$s</b> see https://x.dev/a or a@b.co $t(common.ok)')
        .replace(/\s+/g, ' ')
        .trim()
    ).toBe('Hi , see or');
  });
});

describe('isMostlyLatin', () => {
  it.each([
    ['Save changes', true],
    ['OK', true],
    ['Hello {name}', true],
    ['حفظ التغييرات', false],
    ['{count, plural, one {# ملف} other {# ملفات}}', false],
    ['مرحبا <b>{name}</b>, see https://example.com/docs', false],
    ['مرحبا Ahmed', false], // 5 Arabic, 5 Latin: not more than half
    ['مرحبا Ahmeds', true], // 5 Arabic, 6 Latin
    ['{name}', false], // no letters at all
  ])('%s → %s', (value, expected) => expect(isMostlyLatin(value, EMPTY_ALLOW)).toBe(expected));

  it('does not count allowed words', () =>
    expect(isMostlyLatin('افتح GitHub Pages', parseAllowFile('GitHub Pages\n'))).toBe(false));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/hardcoded-locale-script.test.ts`
Expected: FAIL — cannot resolve `locale-script.js`.

- [ ] **Step 3: Implement `locale-script.ts`**

`NON_LATIN_LANGUAGES` = `am ar as be bg bn bo ckb dv el fa gu he hi hy ja ka kk km kn ko ky lo mk ml mn mr my ne or pa ps ru sd si ta te tg th ti uk ur ug yi zh`. `isNonLatinLocale`: with a 4-letter script subtag, non-Latin iff it is not `latn` (case-insensitive); otherwise `NON_LATIN_LANGUAGES.has(primaryLanguage(locale))`.

`stripMarkup` replaces with a space, in this order: URLs `\b(?:https?:\/\/|www\.)\S+`; emails `[^\s@]+@[^\s@]+\.[^\s@]+`; i18next nesting `\$t\([^)]*\)`; tags `<\/?[A-Za-z][^>]*>`; `\{\{[^{}]*\}\}`; printf `%(?:\d+\$)?[sdif@]`; simple ICU args `\{\s*\w+\s*\}`; ICU heads `\{\s*\w+\s*,\s*(?:plural|select|selectordinal|number|date|time)\s*(?:,\s*(?:offset:\d+\s*)?)?`; ICU selectors `(?:=\d+|\w+)\s*\{`; then any remaining `{`, `}` and `#`.

`isMostlyLatin`: on `removeAllowed(stripMarkup(value), allow)`, count `\p{L}` and `\p{Script=Latin}` (`u` flag); true iff `letters > 0 && latin * 2 > letters`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/hardcoded-locale-script.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/codemod/hardcoded/locale-script.ts tests/unit/hardcoded-locale-script.test.ts
git commit -m "feat(check): detect translations written mostly in Latin letters for non-Latin locales"
```

---

### Task 3: `untranslated` and `wrong-script` in `runCheck`

**Files:**

- Modify: `src/codemod/check.ts` (types, `KIND_ORDER`, `KIND_TITLE`, `LocaleData`, `readLocale`, `runCheck`, the sort)
- Test: `tests/unit/check-hardcoded.test.ts` (new)

**Interfaces:**

- Consumes: `readAllowList`, `AllowList` (Task 1); `isNonLatinLocale`, `isMostlyLatin`, `hasLetters`, `primaryLanguage` (Task 2).
- Produces (in `check.ts`):
  - `IssueKind` gains `'hardcoded' | 'untranslated' | 'wrong-script'`.
  - `CheckIssue` gains `line?: number; column?: number; text?: string` (1-based; `text` already shortened).
  - `CheckOptions` gains `hardcoded?: boolean` (default false) and `allow?: string[]`.
  - `CheckReport` gains `setupProblems?: string[]` (set only when non-empty; filled in Task 5).
  - `KIND_ORDER` = `invalid-json, syntax, missing-from-code, missing-in-locale, placeholder-mismatch, hardcoded, empty, untranslated, wrong-script, unused`.
  - `KIND_TITLE.hardcoded = 'Hardcoded text not passed through translation'`, `untranslated = 'Translations identical to the source locale'`, `'wrong-script' = 'Translations mostly in Latin letters for a non-Latin locale'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('reports nothing new without --hardcoded', async () => {
  write(project, 'locales/en.json', { a: 'Save' });
  write(project, 'locales/ar.json', { a: 'Save' });
  write(project, 'app/page.tsx', `t('a')`);
  const report = await runCheck({ projectDir: project });
  expect(report.issues).toEqual([]);
  expect('setupProblems' in report).toBe(false);
});

it('warns on a value identical to the source locale', async () => {
  write(project, 'locales/en.json', { home: { title: 'Save' } });
  write(project, 'locales/fr.json', { home: { title: 'Save' } });
  write(project, 'app/page.tsx', `t('home.title')`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true });
  expect(issues.filter((i) => i.kind === 'untranslated')).toEqual([
    {
      kind: 'untranslated',
      level: 'warn',
      locale: 'fr',
      key: 'home.title',
      file: 'locales/fr.json',
      message: 'Same text as en.',
    },
  ]);
});

it('does not report identical values between variants of one language', async () => {
  write(project, 'locales/en.json', { a: 'Colour' });
  write(project, 'locales/en-GB.json', { a: 'Colour' });
  write(project, 'app/page.tsx', `t('a')`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true });
  expect(issues.filter((i) => i.kind === 'untranslated')).toEqual([]);
});

it('reports mostly-Latin text in a non-Latin locale, once per key', async () => {
  write(project, 'locales/en.json', { a: 'Save changes', b: 'Settings' });
  write(project, 'locales/ar.json', { a: 'Save changes', b: 'Open settings', c: 'Extra key' });
  write(project, 'app/page.tsx', `t('a'); t('b'); t('c')`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true, unused: false });
  expect(keysOf(issues, 'untranslated')).toEqual(['ar:a']);
  expect(keysOf(issues, 'wrong-script')).toEqual(['ar:b', 'ar:c']);
  expect(issues.find((i) => i.kind === 'wrong-script')).toMatchObject({
    level: 'warn',
    file: 'locales/ar.json',
    message: 'Mostly Latin letters for locale ar.',
  });
});

it('skips allowed keys, allowed words, values without letters and empty values', async () => {
  write(project, 'livelocale.allow', 'GitHub\nkey:brand.name\n');
  const values = { brand: { name: 'Acme' }, gh: 'GitHub', n: '42 %', e: '' };
  write(project, 'locales/en.json', values);
  write(project, 'locales/ar.json', values);
  write(project, 'app/page.tsx', `t('brand.name'); t('gh'); t('n'); t('e')`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true });
  expect(issues.filter((i) => i.kind === 'untranslated' || i.kind === 'wrong-script')).toEqual([]);
});

it('honours --allow words in locale checks', async () => {
  write(project, 'locales/en.json', { a: 'Acme' });
  write(project, 'locales/ar.json', { a: 'Acme' });
  write(project, 'app/page.tsx', `t('a')`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true, allow: ['Acme'] });
  expect(keysOf(issues, 'untranslated')).toEqual([]);
});

it('--strict makes untranslated and wrong-script fail', async () => {
  write(project, 'locales/en.json', { a: 'Save', b: 'Hi' });
  write(project, 'locales/ar.json', { a: 'Save', b: 'Hello there' });
  write(project, 'app/page.tsx', `t('a'); t('b')`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true, strict: true });
  expect(
    issues.filter((i) => i.kind === 'untranslated' || i.kind === 'wrong-script').map((i) => i.level)
  ).toEqual(['fail', 'fail']);
});

it('names the namespace file for a namespaced locale folder', async () => {
  write(project, 'locales/en/common.json', { ok: 'Save' });
  write(project, 'locales/fr/common.json', { ok: 'Save' });
  write(project, 'app/page.tsx', `t('common.ok')`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true });
  expect(issues.find((i) => i.kind === 'untranslated')?.file).toBe('locales/fr/common.json');
});

// Review Focus 3
it('skips non-string leaves and checks Arabic-only plural forms for script only', async () => {
  write(project, 'locales/en.json', { days: ['Mon', 'Tue'], count: 3, items_one: 'item' });
  write(project, 'locales/ar.json', {
    days: ['Mon', 'Tue'],
    count: 3,
    items_one: 'عنصر',
    items_zero: 'no items',
  });
  write(project, 'app/page.tsx', `t('days'); t('count'); t('items', { count: 1 })`);
  const { issues } = await runCheck({ projectDir: project, hardcoded: true, unused: false });
  expect(keysOf(issues, 'untranslated')).toEqual([]);
  expect(keysOf(issues, 'wrong-script')).toEqual(['ar:items_zero']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/check-hardcoded.test.ts`
Expected: FAIL — the `untranslated` filters return `[]` and `hardcoded` is unknown to the type checker.

- [ ] **Step 3: Implement in `check.ts`**

`LocaleData` gains `files: Map<string, string>` (leaf key → project-relative, `/`-separated locale file); `readLocale` fills it. In `runCheck`, only when `options.hardcoded` and `sourceLocale` is set: `allow = readAllowList(projectDir, options.allow)`; for each non-source locale, for every **string** leaf whose value is non-empty after `trim()`, whose key is not in `allow.keys`, and with `hasLetters(value, allow)`:

- `untranslated` when the source has the same key with the identical string (`===`) and `primaryLanguage(locale) !== primaryLanguage(sourceLocale)`; message `` `Same text as ${sourceLocale}.` ``;
- otherwise `wrong-script` when `isNonLatinLocale(locale) && isMostlyLatin(value, allow)`; message `` `Mostly Latin letters for locale ${locale}.` ``.

Both: level `warn` (`fail` with `strict`), with `locale`, `key`, `file`. The sort comparator appends `|| (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0)`.

- [ ] **Step 4: Run to verify it passes, and the old suite stays green**

Run: `npx vitest run tests/unit/check-hardcoded.test.ts tests/unit/check.test.ts`
Expected: PASS (both files).

- [ ] **Step 5: Commit**

```bash
git add src/codemod/check.ts tests/unit/check-hardcoded.test.ts
git commit -m "feat(check): report untranslated and wrong-script locale values with --hardcoded"
```

---

### Task 4: Find hardcoded text in one JSX file

**Files:**

- Create: `src/codemod/hardcoded/scan-jsx.ts`
- Test: `tests/unit/hardcoded-jsx.test.ts`

**Interfaces:**

- Consumes: `AllowList`, `EMPTY_ALLOW`, `parseAllowFile`, `normalizeText`, `shortenText`, `isUserText` (Task 1).
- Produces:
  - `export type TypeScriptModule = typeof import('typescript')` (type-only import)
  - `export interface HardcodedFinding { line: number; column: number; text: string }` (1-based; `text` normalised and shortened)
  - `export const TEXT_ATTRIBUTES: ReadonlySet<string>` = `alt title placeholder aria-label label aria-description aria-placeholder aria-roledescription aria-valuetext`
  - `export const SKIPPED_ELEMENTS: ReadonlySet<string>` = `Trans code pre kbd samp script style`
  - `export interface ScanOptions { templates?: boolean }` — `templates: true` also reports template literals with substitutions (used only by the Task 24 Studio sweep; the user-facing check never sets it).
  - `export function findHardcodedText(ts: TypeScriptModule, sourceText: string, fileName: string, allow: AllowList, options?: ScanOptions): HardcodedFinding[]` — sorted by line, then column.

- [ ] **Step 1: Write the failing tests**

The test imports `* as ts from 'typescript'` (devDependency) and defines `const scan = (code: string, file = 'c.tsx', allow = EMPTY_ALLOW) => findHardcodedText(ts, code, file, allow).map((f) => \`${f.text}@${f.line}:${f.column}\`)`. Code samples start on line 1.

```ts
it('flags visible JSX text', () =>
  expect(
    scan('const A = () => (\n  <div>\n    <button>Save changes</button>\n  </div>\n);\n')
  ).toEqual(['Save changes@3:13']));

it('flags user-facing attributes only', () =>
  expect(
    scan(
      `const A = () => <><img alt="Team photo" src="/a.png" className="hero image" /><input placeholder={'Search docs'} aria-label={\`Search\`} name="query" title={\`Hi \${n}\`} /><Field label="Email" id="email-field" /></>;`
    )
  ).toEqual(['Team photo@1:29', 'Search docs@1:100', 'Search@1:127', 'Email@1:183']));
// A literal's column is that of its first character inside the quotes.

it('flags string literals that are direct JSX children', () =>
  expect(
    scan(
      "const A = () => <p>{'Yes'}{ok ? 'Saved' : 'Not saved'}{err && 'Something went wrong'}{name ?? 'Guest'}{' '}</p>;"
    ).map((s) => s.split('@')[0])
  ).toEqual(['Yes', 'Saved', 'Not saved', 'Something went wrong', 'Guest']));

it('ignores translated text, code and data', () =>
  expect(
    scan(
      [
        'const A = () => <main>',
        "  {t('home.title')}{t('Save changes')}",
        '  <Trans>Hello <b>world</b></Trans>',
        '  <code>npm install</code><pre>run it</pre>',
        '  <a href="https://x.dev" id="main-link" data-test="hero" role="link">{url}</a>',
        '  <span>42</span><span>×</span><span>&nbsp;</span><i className="icon-save" />',
        "  {format('Not a child literal')}",
        '</main>;',
      ].join('\n')
    )
  ).toEqual([]));

it('reports multi-line text once, at its first letter', () =>
  expect(scan('const A = () => (\n  <p>\n    Welcome back,\n    friend\n  </p>\n);\n')).toEqual([
    'Welcome back, friend@3:5',
  ]));

it('shortens long text to 60 characters', () => {
  const [finding] = findHardcodedText(
    ts,
    `const A = () => <p>${'Lorem ipsum '.repeat(10)}</p>;`,
    'c.tsx',
    EMPTY_ALLOW
  );
  expect([...finding!.text].length).toBe(60);
  expect(finding!.text.endsWith('…')).toBe(true);
});

it('honours ignore-next-line comments in code and in JSX', () =>
  expect(
    scan(
      [
        'const A = () => (',
        '  <div>',
        '    {/* livelocale-ignore-next-line */}',
        '    <span>Acme Inc.</span>',
        '    <span>Contact us</span>',
        '  </div>',
        ');',
        '// livelocale-ignore-next-line',
        'const B = () => <b>Brand</b>;',
        'const C = () => <b>Shown</b>;',
      ].join('\n')
    )
  ).toEqual(['Contact us@5:11', 'Shown@10:20']));

it('honours livelocale-ignore-file only at the top of the file', () => {
  expect(
    scan(
      "'use client';\n// livelocale-ignore-file\nimport x from 'x';\nconst A = () => <p>Hello there</p>;\n"
    )
  ).toEqual([]);
  expect(
    scan("import x from 'x';\n// livelocale-ignore-file\nconst A = () => <p>Hello there</p>;\n")
  ).toEqual(['Hello there@3:20']);
});

it('does not count allowed words', () => {
  const allow = parseAllowFile('GitHub\n');
  expect(
    scan(
      'const A = () => <><span>GitHub</span><span>Open on GitHub</span></>;',
      'c.tsx',
      allow
    ).map((s) => s.split('@')[0])
  ).toEqual(['Open on GitHub']);
});

it('parses JSX in .jsx and .js files', () => {
  expect(scan('const A = () => <p>Hello there</p>;', 'a.jsx')).toEqual(['Hello there@1:20']);
  expect(scan('const A = () => <p>Hello there</p>;', 'a.js')).toEqual(['Hello there@1:20']);
});

// Review Focus 1
it('reports correct positions and honours ignore comments in CRLF files with a BOM', () =>
  expect(
    scan(
      '\uFEFFconst A = () => (\r\n  <div>\r\n    <button>Save changes</button>\r\n    {/* livelocale-ignore-next-line */}\r\n    <b>Brand</b>\r\n  </div>\r\n);\r\n'
    )
  ).toEqual(['Save changes@3:13']));

// Review Focus 2
it('honours an ignore comment above a multi-line element', () =>
  expect(
    scan(
      [
        'const A = () => (',
        '  <div>',
        '    {/* livelocale-ignore-next-line */}',
        '    <p>',
        '      Acme Inc.',
        '    </p>',
        '    {/* livelocale-ignore-next-line */}',
        '    <img',
        '      alt="Acme logo"',
        '    />',
        '    <p>',
        '      Contact us',
        '    </p>',
        '  </div>',
        ');',
      ].join('\n')
    )
  ).toEqual(['Contact us@12:7']));

it('does not let an ignore comment above a parent hide its children', () =>
  expect(
    scan(
      [
        'const A = () => (',
        '  // livelocale-ignore-next-line',
        '  <div>',
        '    <p>Inner text</p>',
        '  </div>',
        ');',
      ].join('\n')
    )
  ).toEqual(['Inner text@4:8']));

it('reports templates with substitutions only when asked', () => {
  const code = 'const A = () => <p title={`${n}% of keys translated`}>{`Hi ${name}`}</p>;';
  expect(scan(code)).toEqual([]);
  expect(
    findHardcodedText(ts, code, 'c.tsx', EMPTY_ALLOW, { templates: true }).map((f) => f.text)
  ).toEqual(['% of keys translated', 'Hi']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/hardcoded-jsx.test.ts`
Expected: FAIL — cannot resolve `scan-jsx.js`.

- [ ] **Step 3: Implement `findHardcodedText`**

Parse with `ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind)`, `kind` = `ScriptKind.TSX` for `.tsx`, `ScriptKind.JSX` for `.jsx/.js/.mjs/.cjs`; walk with `ts.forEachChild`. Candidates:

- `JsxText` whose `normalizeText` passes `isUserText`;
- `JsxAttribute` named in `TEXT_ATTRIBUTES` whose initializer is a `StringLiteral`, or a `JsxExpression` holding a static string;
- `JsxExpression` that is a child of a `JsxElement`/`JsxFragment`, holding a static string.

"Static string", recursively after unwrapping `ParenthesizedExpression`: `StringLiteral`/`NoSubstitutionTemplateLiteral` → candidate; `ConditionalExpression` → `whenTrue` and `whenFalse`; `&&` → right; `||`/`??` → left and right; with `options.templates` only, a `TemplateExpression` → one candidate whose text is its head and span literal texts joined with a space (position: the head's first character). Anything else is not a candidate.

Skip every descendant of a `JsxElement` whose tag name (last segment of a property-access tag such as `i18n.Trans`) is in `SKIPPED_ELEMENTS`. Line and column come from `getLineAndCharacterOfPosition` at the first non-whitespace character of the text (literals: first character inside the quotes). A finding is dropped when the line just before it, or the line just before the start line of its owning element, matches `/(?:\/\/|\/\*)\s*livelocale-ignore-next-line\b/` (lines split on `/\r?\n/`). The owning element is the nearest enclosing `JsxElement`/`JsxSelfClosingElement`/`JsxFragment` for text and child expressions, and the element carrying the attribute for attributes; ancestors further up never count. The file returns `[]` when `/livelocale-ignore-file\b/` occurs before `getStart()` of the first statement that is not a directive (string-literal expression statement), or anywhere when there is no such statement.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/hardcoded-jsx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/codemod/hardcoded/scan-jsx.ts tests/unit/hardcoded-jsx.test.ts
git commit -m "feat(check): find hardcoded JSX text and user-facing attributes with the TypeScript parser"
```

---

### Task 5: Scan the project's components with its own `typescript`

**Files:**

- Create: `src/codemod/hardcoded/load-typescript.ts`, `src/codemod/hardcoded/files.ts`, `tests/unit/helpers/project-typescript.ts`
- Modify: `src/server/key-scanner.ts` (`export` on `IGNORE_DIRS` and `MAX_SOURCE_BYTES`; nothing else), `src/codemod/check.ts` (`runCheck`)
- Test: `tests/unit/hardcoded-files.test.ts` (new), `tests/unit/check-hardcoded.test.ts`

**Interfaces:**

- Consumes: `findHardcodedText`, `TypeScriptModule` (Task 4); `readAllowList` (Task 1); `CheckOptions.hardcoded`/`allow`, `CheckReport.setupProblems`, the `hardcoded` kind (Task 3); `IGNORE_DIRS`, `MAX_SOURCE_BYTES` (`src/server/key-scanner.ts`); `parseGitignore` (`src/core/gitignore.ts`).
- Produces:
  - `export const TYPESCRIPT_MISSING = 'Install typescript as a dev dependency to enable hardcoded-text detection: npm install -D typescript'`
  - `export function typescriptUnusable(version: string): string` — `` `typescript ${version} found but its compiler API is unavailable; hardcoded-text detection needs typescript 4.7–6.x` ``
  - `export type ProjectTypeScript = { ts: TypeScriptModule } | { problem: string }`
  - `export async function loadProjectTypeScript(projectDir: string): Promise<ProjectTypeScript>`
  - `export const COMPONENT_EXTENSIONS: ReadonlySet<string>` = `.tsx .jsx .js .mjs .cjs`
  - `export const SKIPPED_DIRS: ReadonlySet<string>` = `__tests__ __mocks__ __fixtures__ fixtures e2e cypress .storybook` (on top of `IGNORE_DIRS`)
  - `export async function listComponentFiles(projectDir: string): Promise<string[]>` — sorted, project-relative, `/`-separated.
  - Test helpers `export function linkTypeScript(projectDir: string): void` and `export function linkFakeTypeScript(projectDir: string, version: string): void`

- [ ] **Step 1: Write the test helpers**

`linkTypeScript` writes `node_modules/typescript/package.json` (`{"name":"typescript","main":"index.js"}`) and `node_modules/typescript/index.js` = `module.exports = require(<JSON.stringify(require.resolve('typescript'))>);` into `projectDir`. `linkFakeTypeScript` writes the same `package.json` with `"version": <version>` and `index.js` = `module.exports = { version: <JSON.stringify(version)> };` (no `createSourceFile`).

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/hardcoded-files.test.ts
it('loads typescript from the project directory, or names the setup problem', async () => {
  expect(await loadProjectTypeScript(project)).toEqual({ problem: TYPESCRIPT_MISSING });
  linkTypeScript(project);
  const loaded = await loadProjectTypeScript(project);
  expect('ts' in loaded && typeof loaded.ts.createSourceFile).toBe('function');
});

it('tells an installed typescript without the compiler API apart from a missing one', async () => {
  linkFakeTypeScript(project, '7.0.0');
  expect(await loadProjectTypeScript(project)).toEqual({ problem: typescriptUnusable('7.0.0') });
  expect(typescriptUnusable('7.0.0')).toBe(
    'typescript 7.0.0 found but its compiler API is unavailable; hardcoded-text detection needs typescript 4.7–6.x'
  );
});

it('lists component files, skipping tests, stories, mocks, fixtures, e2e, declarations, .ts and ignored folders', async () => {
  for (const rel of [
    'app/page.tsx',
    'app/page.test.tsx',
    'app/page.spec.jsx',
    'components/Button.stories.jsx',
    'src/__tests__/a.jsx',
    'src/__mocks__/b.js',
    'src/legacy.js',
    'src/util.ts',
    'types/x.d.ts',
    'node_modules/pkg/a.jsx',
    'dist/c.js',
    'generated/b.tsx',
    'src/esm.mjs',
    '.storybook/preview.tsx',
    'e2e/home.jsx',
    'cypress/support/c.jsx',
    'src/__fixtures__/f.tsx',
    'test/fixtures/page.tsx',
    'app/page.cy.tsx',
    'app/page.e2e.jsx',
  ])
    write(project, rel, 'export {};');
  write(project, '.gitignore', 'generated/\n');
  expect(await listComponentFiles(project)).toEqual([
    'app/page.tsx',
    'src/esm.mjs',
    'src/legacy.js',
  ]);
});
```

```ts
// tests/unit/check-hardcoded.test.ts (additions)
it('reports hardcoded JSX text as a failure', async () => {
  linkTypeScript(project);
  write(project, 'locales/en.json', { a: 'A' });
  write(
    project,
    'app/page.tsx',
    "const A = () => (\n  <div>\n    <button>Save changes</button>\n    {t('a')}\n  </div>\n);\n"
  );
  const report = await runCheck({ projectDir: project, hardcoded: true });
  expect(report.issues).toEqual([
    {
      kind: 'hardcoded',
      level: 'fail',
      file: 'app/page.tsx',
      line: 3,
      column: 13,
      text: 'Save changes',
      message: 'Not passed through a translation call.',
    },
  ]);
  expect(hasCheckFailures(report)).toBe(true);
  expect('setupProblems' in report).toBe(false);
});

it('sorts hardcoded findings by file, line and column', async () => {
  linkTypeScript(project);
  write(project, 'locales/en.json', {});
  write(project, 'b.tsx', 'const B = () => <p>Second file</p>;');
  write(project, 'a.tsx', 'const A = () => <p>Line one</p>;\nconst C = () => <p>Line two</p>;');
  const { issues } = await runCheck({ projectDir: project, hardcoded: true });
  expect(issues.map((i) => `${i.file}:${i.line}`)).toEqual(['a.tsx:1', 'a.tsx:2', 'b.tsx:1']);
});

it('applies livelocale.allow and --allow to JSX text', async () => {
  linkTypeScript(project);
  write(project, 'locales/en.json', {});
  write(project, 'livelocale.allow', 'GitHub\n');
  write(project, 'a.tsx', 'const A = () => <><b>GitHub</b><b>Acme</b><b>Contact</b></>;');
  const { issues } = await runCheck({ projectDir: project, hardcoded: true, allow: ['Acme'] });
  expect(issues.map((i) => i.text)).toEqual(['Contact']);
});

it('runs the other checks and reports a setup problem without typescript', async () => {
  write(project, 'locales/en.json', { a: 'Save' });
  write(project, 'locales/fr.json', { a: 'Save' });
  write(project, 'app/page.tsx', "const A = () => <p>{t('a')}</p>;");
  const report = await runCheck({ projectDir: project, hardcoded: true });
  expect(report.setupProblems).toEqual([TYPESCRIPT_MISSING]);
  expect(keysOf(report.issues, 'untranslated')).toEqual(['fr:a']);
  expect(report.issues.some((i) => i.kind === 'hardcoded')).toBe(false);
});

it('reports an unusable typescript as its own setup problem', async () => {
  linkFakeTypeScript(project, '7.0.0');
  write(project, 'locales/en.json', { a: 'Save' });
  write(project, 'app/page.tsx', "const A = () => <p>{t('a')}</p>;");
  expect((await runCheck({ projectDir: project, hardcoded: true })).setupProblems).toEqual([
    typescriptUnusable('7.0.0'),
  ]);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/unit/hardcoded-files.test.ts tests/unit/check-hardcoded.test.ts`
Expected: FAIL — cannot resolve `load-typescript.js` / `files.js`.

- [ ] **Step 4: Implement `loadProjectTypeScript`**

`createRequire(path.join(path.resolve(projectDir), 'package.json'))('typescript')` inside `try`; a thrown error → `{ problem: TYPESCRIPT_MISSING }`. `const ts = mod.default ?? mod`: a `createSourceFile` function → `{ ts }`; otherwise `{ problem: typescriptUnusable(String(ts.version ?? 'unknown')) }`. No caching across calls.

- [ ] **Step 5: Implement `listComponentFiles`**

Recursive `fs.promises.readdir` walk mirroring `KeyScanner.scanSourceKeys`: skip directories in `IGNORE_DIRS` and `SKIPPED_DIRS`, honour the root `.gitignore` via `parseGitignore`, keep `COMPONENT_EXTENSIONS`, drop `/\.(?:test|spec|stories|cy|e2e)\.[^./]+$/` and `.d.ts`, drop files above `MAX_SOURCE_BYTES`. `.ts` is not listed: TypeScript forbids JSX in `.ts`.

- [ ] **Step 6: Wire it into `runCheck`**

When `options.hardcoded` (whether or not `sourceLocale` is set): `const loaded = await loadProjectTypeScript(projectDir)`. `{ problem }` → `report.setupProblems = [problem]`. Otherwise, for each listed file read as UTF-8 (skip on read error), push per finding `{ kind: 'hardcoded', level: 'fail', file, line, column, text, message: 'Not passed through a translation call.' }`. Read `allow` once and share it with Task 3's checks.

- [ ] **Step 7: Run to verify it passes, and the server scanner is untouched**

Run: `npx vitest run tests/unit/hardcoded-files.test.ts tests/unit/check-hardcoded.test.ts tests/unit/check.test.ts tests/unit/key-scanner.test.ts tests/unit/extract-keys.test.ts`
Expected: PASS (all five files).

- [ ] **Step 8: Commit**

```bash
git add src/codemod/hardcoded/load-typescript.ts src/codemod/hardcoded/files.ts src/server/key-scanner.ts src/codemod/check.ts tests/unit/helpers/project-typescript.ts tests/unit/hardcoded-files.test.ts tests/unit/check-hardcoded.test.ts
git commit -m "feat(check): scan the project's components with its own typescript for hardcoded text"
```

---

### Task 6: Report hardcoded findings by file

**Files:**

- Modify: `src/codemod/check.ts` (`formatCheckReport`)
- Test: `tests/unit/check-hardcoded.test.ts`

**Interfaces:**

- Consumes: the `hardcoded`, `untranslated` and `wrong-script` issues (Tasks 3, 5).
- Produces: `formatCheckReport(report: CheckReport, limit = 25): string` — signature unchanged; 0.10.x kinds print unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
const report = (issues: CheckIssue[]): CheckReport => ({
  localesDir: '/p/locales',
  sourceLocale: 'en',
  locales: ['en', 'fr'],
  codeKeyCount: 0,
  issues,
});
const hc = (file: string, line: number, column: number, text: string): CheckIssue => ({
  kind: 'hardcoded',
  level: 'fail',
  file,
  line,
  column,
  text,
  message: 'Not passed through a translation call.',
});

it('groups hardcoded findings by file and ends with a per-file count', () =>
  expect(
    formatCheckReport(
      report([
        hc('app/page.tsx', 3, 13, 'Save changes'),
        hc('app/page.tsx', 9, 7, 'Cancel'),
        hc('components/Nav.tsx', 4, 9, 'Home'),
      ])
    )
  ).toBe(
    [
      '✖ Hardcoded text not passed through translation (3)',
      '   app/page.tsx',
      '      3:13  "Save changes"',
      '      9:7  "Cancel"',
      '   components/Nav.tsx',
      '      4:9  "Home"',
      '   Per file: app/page.tsx 2 · components/Nav.tsx 1',
    ].join('\n')
  ));

it('caps hardcoded findings per kind and still counts every file', () => {
  const text = formatCheckReport(
    report([...Array(30)].map((_, i) => hc('a.tsx', i + 1, 1, `Text ${i}`)))
  );
  expect(text.split('\n').filter((l) => l.startsWith('      ')).length).toBe(25);
  expect(text).toContain('   …and 5 more');
  expect(text.endsWith('   Per file: a.tsx 30')).toBe(true);
});

it('lists at most ten files in the per-file count', () => {
  const issues = [...Array(12)].map((_, i) =>
    hc(`f${String(i).padStart(2, '0')}.tsx`, 1, 1, 'Hi there')
  );
  expect(formatCheckReport(report(issues)).split('\n').at(-1)).toBe(
    '   Per file: ' +
      [...Array(10)].map((_, i) => `f${String(i).padStart(2, '0')}.tsx 1`).join(' · ') +
      ' · +2 more files'
  );
});

it('lists untranslated and wrong-script issues like other locale issues', () =>
  expect(
    formatCheckReport(
      report([
        {
          kind: 'untranslated',
          level: 'warn',
          locale: 'fr',
          key: 'home.title',
          file: 'locales/fr.json',
          message: 'Same text as en.',
        },
      ])
    )
  ).toBe(
    '⚠ Translations identical to the source locale (1)\n   [fr] home.title — Same text as en.'
  ));
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/check-hardcoded.test.ts -t "hardcoded findings|per-file|untranslated and wrong-script"`
Expected: FAIL — the hardcoded group prints `   app/page.tsx — Not passed through a translation call.` lines.

- [ ] **Step 3: Implement the `hardcoded` branch in `formatCheckReport`**

For `kind === 'hardcoded'` only: after the usual header, take the first `limit` issues (already sorted); print `   <file>` when the file changes, then `      <line>:<column>  "<text>"`; then `   …and N more` when over `limit`; then `  Per file:` + files by count descending, then path ascending, as `<file> <count>` joined by `·`, at most 10, plus ` · +N more files` when more exist. Every other kind keeps the existing branch.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/check-hardcoded.test.ts tests/unit/check.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/codemod/check.ts tests/unit/check-hardcoded.test.ts
git commit -m "feat(check): group hardcoded findings by file with a per-file count"
```

---

### Task 7: `--hardcoded` and `--allow` on the CLI, exit code 2, optional peer

**Files:**

- Create: `src/codemod/check-cli.ts`
- Modify: `src/codemod/index.ts` (`runCheckCommand`, the `Options for check:` help block), `package.json` (`peerDependencies`, `peerDependenciesMeta`)
- Test: `tests/unit/check-cli.test.ts` (new), `tests/integration/cli-package.test.ts`

**Interfaces:**

- Consumes: `runCheck`, `CheckReport`, `hasCheckFailures` (`check.ts`); `TYPESCRIPT_MISSING` (Task 5); `linkTypeScript` (`tests/unit/helpers/project-typescript.ts`, Task 5).
- Produces:
  - `export interface CheckArgs { dir: string; localesPath?: string; sourceLocale?: string; unused: boolean; strict: boolean; json: boolean; hardcoded: boolean; allow: string[] }`
  - `export function parseCheckArgs(argv: string[]): CheckArgs` — `argv` excludes the `check` word; throws `Error('--allow needs a word.')` when `--allow` has no value or the value starts with `--`.
  - `export function checkExitCode(report: CheckReport): 0 | 1 | 2` — 2 when `setupProblems` is non-empty, else 1 on any fail-level issue, else 0.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/check-cli.test.ts
it('keeps the 0.10.x defaults', () =>
  expect(parseCheckArgs([])).toEqual({
    dir: '.',
    unused: true,
    strict: false,
    json: false,
    hardcoded: false,
    allow: [],
  }));

it('reads --hardcoded and repeatable --allow', () =>
  expect(
    parseCheckArgs([
      'app',
      '--hardcoded',
      '--allow',
      'GitHub',
      '--allow',
      'Made in Cairo',
      '--strict',
    ])
  ).toMatchObject({
    dir: 'app',
    hardcoded: true,
    allow: ['GitHub', 'Made in Cairo'],
    strict: true,
  }));

it('rejects --allow without a word', () => {
  expect(() => parseCheckArgs(['--allow'])).toThrow('--allow needs a word.');
  expect(() => parseCheckArgs(['--allow', '--json'])).toThrow('--allow needs a word.');
});

it('exits 2 on a setup problem, even with failures', () => {
  const base = { localesDir: '', sourceLocale: 'en', locales: ['en'], codeKeyCount: 0 };
  const fail = { kind: 'hardcoded', level: 'fail', message: '' } as const;
  expect(checkExitCode({ ...base, issues: [] })).toBe(0);
  expect(checkExitCode({ ...base, issues: [{ ...fail, level: 'warn' }] })).toBe(0);
  expect(checkExitCode({ ...base, issues: [fail] })).toBe(1);
  expect(checkExitCode({ ...base, issues: [fail], setupProblems: [TYPESCRIPT_MISSING] })).toBe(2);
});
```

```ts
// tests/integration/cli-package.test.ts — new tests in the existing describe, in their own folder
it('should run `check --hardcoded` without typescript: other checks, then exit 2', () => {
  const dir = path.join(sandbox, 'check-consumer');
  fs.mkdirSync(path.join(dir, 'locales'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"check-consumer","private":true}');
  fs.writeFileSync(path.join(dir, 'locales', 'en.json'), '{"hello":"Hi there"}');
  fs.writeFileSync(path.join(dir, 'locales', 'fr.json'), '{"hello":"Hi there"}');
  fs.writeFileSync(
    path.join(dir, 'app', 'page.jsx'),
    "export default () => <h1>{t('hello')}</h1>;"
  );

  const plain = runCli(pkgDir, dir, ['check']);
  expect(plain.status).toBe(0);
  expect(plain.stdout).not.toContain('Translations identical to the source locale');

  const human = runCli(pkgDir, dir, ['check', '--hardcoded']);
  expect(human.status).toBe(2);
  expect(human.stdout).toContain('⚠ Translations identical to the source locale (1)');
  expect(human.stdout).toContain(
    'Install typescript as a dev dependency to enable hardcoded-text detection'
  );

  const json = runCli(pkgDir, dir, ['check', '--hardcoded', '--json']);
  expect(json.status).toBe(2);
  expect(JSON.parse(json.stdout).setupProblems).toEqual([
    'Install typescript as a dev dependency to enable hardcoded-text detection: npm install -D typescript',
  ]);
});

it("should run `check --hardcoded` with the project's own typescript", () => {
  const dir = path.join(sandbox, 'check-consumer-ts');
  fs.mkdirSync(path.join(dir, 'locales'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"check-consumer-ts","private":true}');
  fs.writeFileSync(path.join(dir, 'locales', 'en.json'), '{"hello":"Hi there"}');
  fs.writeFileSync(
    path.join(dir, 'app', 'page.jsx'),
    "export default () => <main>{t('hello')}<h1>Hello there</h1></main>;"
  );
  linkTypeScript(dir); // from tests/unit/helpers/project-typescript.ts

  const json = runCli(pkgDir, dir, ['check', '--hardcoded', '--json']);
  expect(json.status).toBe(1);
  const report = JSON.parse(json.stdout);
  expect('setupProblems' in report).toBe(false);
  expect(report.issues.filter((i: { kind: string }) => i.kind === 'hardcoded')).toEqual([
    {
      kind: 'hardcoded',
      level: 'fail',
      file: 'app/page.jsx',
      line: 1,
      column: 44,
      text: 'Hello there',
      message: 'Not passed through a translation call.',
    },
  ]);
});

it('should declare typescript as an optional peer dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  expect(pkg.peerDependencies.typescript).toBe('>=4.7.0');
  expect(pkg.peerDependenciesMeta.typescript).toEqual({ optional: true });
  expect(pkg.dependencies ?? {}).toEqual({});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/check-cli.test.ts`
Expected: FAIL — cannot resolve `check-cli.js`.

- [ ] **Step 3: Implement `check-cli.ts`, rewire `runCheckCommand`, update `package.json`**

`parseCheckArgs` keeps today's flags and positional dir exactly and adds `--hardcoded` and `--allow <word>`. In `runCheckCommand`: a parse error prints `Error: <message>` and exits 1; `runCheck` gets `hardcoded` and `allow`; the exit code comes from `checkExitCode` in both the `--json` and human paths (through `process.exitCode`); the human path prints `❌ <problem>` per `setupProblems` entry to **stdout** (`console.log`, like the report) after today's summary line. Output without `--hardcoded` stays byte-identical. Help block (replaces the `--strict` line, adds two):

```
  --strict           Treat warnings (unused keys, empty values, untranslated text) as failures
  --hardcoded        Also find text never passed through translation (needs typescript) and
                     translations left identical to the source or in the wrong script
  --allow <word>     Word or phrase that never counts as hardcoded (repeatable; also read
                     from livelocale.allow)
```

`package.json`: `"typescript": ">=4.7.0"` in `peerDependencies`, `"typescript": { "optional": true }` in `peerDependenciesMeta`.

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run tests/unit/check-cli.test.ts tests/unit/check.test.ts tests/unit/check-hardcoded.test.ts`
Expected: PASS.

- [ ] **Step 5: Build and run the packaged-CLI test**

Run: `npm run build; npx vitest run tests/integration/cli-package.test.ts`
Expected: PASS, the three new tests listed (not skipped).

- [ ] **Step 6: Commit**

```bash
git add src/codemod/check-cli.ts src/codemod/index.ts package.json package-lock.json tests/unit/check-cli.test.ts tests/integration/cli-package.test.ts
git commit -m "feat(check): add --hardcoded and --allow, exit 2 when typescript is missing"
```

---

### Task 8: Pin the playgrounds as the noise benchmark

**Files:**

- Test: `tests/unit/check-noise.test.ts` (new)
- Modify (only if the benchmark finds a false alarm): `src/codemod/hardcoded/text-filters.ts`, `src/codemod/hardcoded/scan-jsx.ts` and their tests

**Interfaces:**

- Consumes: `runCheck` with `hardcoded: true` (Tasks 3, 5).
- Produces: nothing new.

- [ ] **Step 1: Write the benchmark test**

```ts
// tests/unit/check-noise.test.ts — the repo's playgrounds are the noise benchmark (spec §10)
const hardcoded = async (dir: string) =>
  (await runCheck({ projectDir: dir, hardcoded: true })).issues
    .filter((i) => i.kind === 'hardcoded')
    .map(({ file, line, column, text }) => ({ file, line, column, text }));

const localeWarnings = async (dir: string) =>
  (await runCheck({ projectDir: dir, hardcoded: true })).issues
    .filter((i) => i.kind === 'untranslated' || i.kind === 'wrong-script')
    .map(({ kind, locale, key }) => `${kind} ${locale}:${key}`);

it('finds nothing in the translated Next.js playground', async () => {
  const report = await runCheck({ projectDir: 'playground', hardcoded: true });
  expect(report.setupProblems).toBeUndefined();
  expect(report.issues.filter((i) => i.kind === 'hardcoded')).toEqual([]);
});

it('finds exactly the two real hardcoded links in the Vite playground', async () =>
  expect(await hardcoded('playground-vite')).toEqual([
    { file: 'src/main.tsx', line: 40, column: 11, text: 'العربية' },
    { file: 'src/main.tsx', line: 43, column: 11, text: 'About' },
  ]));

it.each(['playground', 'playground-vite'])(
  'raises no untranslated or wrong-script warning in %s',
  async (dir) => expect(await localeWarnings(dir)).toEqual([])
);
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/check-noise.test.ts`
Expected: PASS when Tasks 1–5 are precise. Any extra finding is a false alarm: add a failing case for it to `tests/unit/hardcoded-text.test.ts`, `tests/unit/hardcoded-locale-script.test.ts` or `tests/unit/hardcoded-jsx.test.ts`, fix the filter or scanner, and rerun until PASS. Never edit an expected list to absorb a false alarm; if a finding is a real untranslated value in a playground, stop and ask the owner (the playgrounds feed the E2E suite).

- [ ] **Step 3: Precision run on a real component tree**

The Studio's own components (`src/studio/**/*.tsx`, about 150 hardcoded English strings until Tasks 20–23) are a real tree with class lists, ids, test ids and ternaries. Write a throwaway script in the scratchpad (not committed) that walks `src/studio` for `.tsx` files and prints `file:line:column  text` for every `findHardcodedText(ts, source, file, EMPTY_ALLOW)` finding (`ts` = the repo's `typescript`); run it with `npx vite-node <script>`.
Expected: every finding is user-visible English copy. For each finding that is a class list, id, test id, URL, key path or other code-like string, add a failing case with that exact input to `tests/unit/hardcoded-text.test.ts` or `tests/unit/hardcoded-jsx.test.ts`, fix Task 1's filter or Task 4's scanner, and rerun until none is left. Record the final count of findings and of false alarms fixed for the commit body.

- [ ] **Step 4: Smoke check on the demo repo with a local tarball**

Run: `npm run build; npm pack --pack-destination <scratchpad>`, then `git clone https://github.com/Araby99/Translation-Test <scratchpad>/tt-pack`, and in it `npm ci`, `npm i -D <scratchpad>/livelocale-0.10.1.tgz --no-save`, `npx livelocale check --hardcoded; echo $?`.
Expected: exit 0 or 1, never 2; each `hardcoded`, `untranslated` and `wrong-script` finding is real by the Task 31 Step 6 rule. A false alarm gets a failing case and a fix as in Step 3. Nothing is committed or pushed to the demo repo.

- [ ] **Step 5: Run the milestone suite and the gate**

Run: `npx vitest run tests/unit/check-noise.test.ts tests/unit/check.test.ts tests/unit/check-hardcoded.test.ts tests/unit/check-cli.test.ts tests/unit/hardcoded-text.test.ts tests/unit/hardcoded-locale-script.test.ts tests/unit/hardcoded-jsx.test.ts tests/unit/hardcoded-files.test.ts`
Expected: PASS (8 files). Then `npm run test:coverage` exits 0.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/check-noise.test.ts src/codemod/hardcoded tests/unit
git commit -m "test(check): pin the playgrounds as the noise benchmark for --hardcoded

Precision run over the Studio's components: <N> findings, all user-visible copy; <M> false alarms fixed with pinned cases. Demo repo smoke with a local tarball: <counts by kind>."
```

---

# Milestone 2: The Studio (spec §6, §7, §8, §12.1; brand spec §2, §4)

Order inside the milestone: shared settings (Task 9), the brand foundation (Tasks 10–11: colour tokens, type, logo), moving every component to the tokens (Tasks 12–14), the theme toggle (Tasks 15–16), the Studio in Arabic (Tasks 17–24), accessibility basics (Tasks 25–29, last so they audit the final UI). The colour migration, the copy extraction and the logical-property pass rewrite the same `className` strings in the same component files: run them one after another, never in parallel branches.

**Milestone constraints:**

- **Defaults never force a change on current users.** With no remembered choice, the dev/preview Studio starts dark (the brand's dark theme) and English; the share Studio (`isShareStudio()`, Task 9: a static runtime, or a share folder whose manifest is missing) follows `prefers-color-scheme` and starts in Arabic only when the primary subtag of `navigator.language` is Arabic. A remembered choice always wins.
- **Preferences** are read and written only through `src/studio/preferences.ts`, which uses `readPref`/`writePref` (`src/studio/share/browser.ts`: key `livelocale:<name>`, try/catch with a memory fallback). Nothing reads `localStorage` directly.
- **Document root.** Theme toggles only the `dark` class on `document.documentElement` (`classList`, never `className`). Today nothing sets that class, so from Task 10 `main.tsx` adds it unconditionally before `startStudio` (the Studio stays dark while it is restyled), and Task 16 replaces that line with the real theme. Language sets `lang`/`dir` attributes on `document.documentElement` and on the App root (`data-testid="studio-root"`). `src/studio/index.html` changes once only: Task 10 removes the dead `bg-background text-foreground` classes from `<body>` (one line; `body` is painted by `index.css`). Because the built stylesheet is linked in `<head>`, the instant before `main.tsx` runs paints `:root`, the light Paper theme, in every Studio; a dev Studio, or a share Studio under a dark system, shows that light frame once while loading (Owner flag 7).
- **One look, from the brand.** Colours come only from the Task 10 token table and type only from the Task 11 faces. Today's colours are not preserved, so no task pins today's computed colours; E2E checks pin the brand's values instead (Tasks 11, 16, 25).
- **Server mode untouched.** No file under `src/server`, `src/core` or `src/client` changes in this milestone; with no remembered choice, every English string, id, `data-testid` and class order that existing tests read stays the same (colour and font classes excepted).
- **The framed app keeps its own canvas.** `bg-white` on `#app-preview-iframe` stays (the only `white`/`black` colour class left in the Studio, Task 14); the iframe content is never restyled or mirrored.
- **Copy wording.** Existing English copy moves verbatim; new English copy is sentence case (Owner flag 6).

---

### Task 9: Studio preferences module and the header settings slot

**Files:**

- Create: `src/studio/preferences.ts`
- Modify: `src/studio/share/browser.ts` (`PrefName` gains `'studio-language' | 'studio-theme'`), `src/studio/runtime.ts` (`isShareStudio`), `components/Header.tsx` (`settings` slot)
- Test: `tests/unit/studio-preferences.test.tsx` (new), `tests/unit/studio-runtime.test.ts`

**Interfaces:**

- Consumes: `readPref`, `writePref` (`share/browser.ts`); `getStudioRuntime` (`runtime.ts`).
- Produces:

  ```ts
  // src/studio/preferences.ts
  export type StudioLanguage = 'en' | 'ar';
  export type ThemeChoice = 'system' | 'light' | 'dark';
  export const STUDIO_LANGUAGES: readonly StudioLanguage[];            // ['en', 'ar']
  export const THEME_CHOICES: readonly ThemeChoice[];                  // ['system', 'light', 'dark']
  export const STUDIO_LANGUAGE_KEY = 'livelocale:studio-language';     // for E2E addInitScript
  export const STUDIO_THEME_KEY = 'livelocale:studio-theme';
  export function isStudioLanguage(value: unknown): value is StudioLanguage;
  export function isThemeChoice(value: unknown): value is ThemeChoice;
  export function storedLanguage(): StudioLanguage | null;            // readPref('studio-language') if valid
  export function storedThemeChoice(): ThemeChoice | null;            // readPref('studio-theme') if valid
  export function saveLanguage(lang: StudioLanguage): void;
  export function saveThemeChoice(choice: ThemeChoice): void;
  /** Primary subtag (before the first '-' or '_', lowercased) is 'ar' or an Arabic variety. */
  export function prefersArabic(browserLanguage: string | undefined): boolean;
  export function initialStudioLanguage(input: { stored: string | null; isShareStudio: boolean; browserLanguage: string | undefined }): StudioLanguage;
  export function defaultThemeChoice(isShareStudio: boolean): ThemeChoice; // false → 'dark', true → 'system'
  export function initialThemeChoice(input: { stored: string | null; isShareStudio: boolean }): ThemeChoice;
  // src/studio/runtime.ts
  /** True when the Studio runs from a share folder (the non-developer's link), even one whose manifest is missing. */
  export function isShareStudio(): boolean; // getStudioRuntime().kind === 'static' || isAppPreviewBlocked()
  // components/Header.tsx — HeaderProps gains:
  settings?: React.ReactNode;
  ```

  - **Arabic varieties** (pinned): `ar`, `arz`, `ary`, `arq`, `aeb`, `apc`, `ajp`, `acm`, `afb`, `ayl`, `ars`. `arn` (Mapudungun) is not Arabic.
  - **`initialStudioLanguage`**: a stored value accepted by `isStudioLanguage` wins; otherwise `'ar'` only when `isShareStudio && prefersArabic(browserLanguage)`, else `'en'`. **`initialThemeChoice`**: a valid stored value wins, else `defaultThemeChoice(isShareStudio)`.
  - **Header slot**: `settings` renders inside `<div data-testid="header-settings" className="flex items-center gap-2 shrink-0">`, after `#studio-changes-button` and before the version badge, always visible (no `hidden xl:` class), only when set. Later tasks pass `<><LanguageToggle /><ThemeToggle … /></>` in that order. Nothing passes it in this task, so the Studio looks unchanged.

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment jsdom`; `beforeEach` writes `null` to both prefs and clears `localStorage`)

```ts
it.each([
  [{ stored: 'ar', isShareStudio: false, browserLanguage: 'en-US' }, 'ar'],
  [{ stored: 'en', isShareStudio: true, browserLanguage: 'ar-EG' }, 'en'],
  [{ stored: 'fr', isShareStudio: true, browserLanguage: 'ar' }, 'ar'],
  [{ stored: null, isShareStudio: false, browserLanguage: 'ar-EG' }, 'en'],
  [{ stored: null, isShareStudio: true, browserLanguage: 'ar-EG' }, 'ar'],
  [{ stored: null, isShareStudio: true, browserLanguage: 'AR' }, 'ar'],
  [{ stored: null, isShareStudio: true, browserLanguage: 'arz' }, 'ar'],
  [{ stored: null, isShareStudio: true, browserLanguage: 'ar_SA' }, 'ar'],
  [{ stored: null, isShareStudio: true, browserLanguage: 'arn-CL' }, 'en'],
  [{ stored: null, isShareStudio: true, browserLanguage: 'en-US' }, 'en'],
  [{ stored: null, isShareStudio: true, browserLanguage: undefined }, 'en'],
  [{ stored: null, isShareStudio: true, browserLanguage: '' }, 'en'],
])('starts %o in %s', (input, lang) => expect(initialStudioLanguage(input)).toBe(lang));

it('defaults the dev Studio to dark and the share Studio to the system setting', () => {
  expect(initialThemeChoice({ stored: null, isShareStudio: false })).toBe('dark');
  expect(initialThemeChoice({ stored: null, isShareStudio: true })).toBe('system');
  expect(initialThemeChoice({ stored: 'light', isShareStudio: false })).toBe('light');
});

it.each(['Dark', '', 'blue', 'null'])('ignores an unknown remembered theme %j', (v) => {
  localStorage.setItem(STUDIO_THEME_KEY, v);
  expect(storedThemeChoice()).toBeNull();
});

it('stores both choices under their keys and reads them back', () => {
  saveLanguage('ar'); saveThemeChoice('light');
  expect([localStorage.getItem(STUDIO_LANGUAGE_KEY), localStorage.getItem(STUDIO_THEME_KEY)]).toEqual(['ar', 'light']);
  expect([storedLanguage(), storedThemeChoice()]).toEqual(['ar', 'light']);
});

it('keeps working in memory when localStorage throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  saveThemeChoice('light');
  expect(storedThemeChoice()).toBe('light');
});

it('renders the settings slot only when given', () => {
  // render <Header> with the minimal props used by tests/unit/header-review.test.tsx
  expect(renderHeader({}).queryByTestId('header-settings')).toBeNull();
  expect(renderHeader({ settings: <span>x</span> }).getByTestId('header-settings').textContent).toBe('x');
});
```

In `tests/unit/studio-runtime.test.ts`, add `it('reports a static runtime and a share folder without a manifest as the share Studio')` using its existing fixtures: static runtime → `true`; server runtime whose `problems` include `STATIC_MANIFEST_MISSING` → `true`; plain server runtime → `false`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/studio-preferences.test.tsx tests/unit/studio-runtime.test.ts`
Expected: FAIL — cannot resolve `src/studio/preferences.js`.

- [ ] **Step 3: Implement** the Produces block: the two `PrefName` members, `isShareStudio`, `preferences.ts`, the Header slot.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/studio-preferences.test.tsx tests/unit/studio-runtime.test.ts tests/unit/share-browser.test.ts tests/unit/header-review.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio/preferences.ts src/studio/share/browser.ts src/studio/runtime.ts src/studio/features/dashboard/components/Header.tsx tests/unit/studio-preferences.test.tsx tests/unit/studio-runtime.test.ts
git commit -m "feat(studio): add one preferences module and a header settings slot for language and theme"
```

---

### Task 10: Brand colour tokens for light and dark

**Files:**

- Modify: `src/studio/index.css` (replace the placeholder shadcn colour variables and their `--color-*` mappings with the brand tokens; keep the radius scale and `--radius`), `src/studio/main.tsx` (adds the `dark` class before `startStudio`), `src/studio/index.html` (one line: drop `bg-background text-foreground` from `<body>`, keep `antialiased overflow-hidden`)
- Create: `tests/unit/helpers/studio-tokens.ts`, `tests/unit/helpers/contrast.ts`
- Test: `tests/unit/studio-brand-tokens.test.ts` (new)

**Interfaces:**

- Consumes: the brand palette (brand spec §2.3) and the token table below.
- Produces:

  ```ts
  // tests/unit/helpers/studio-tokens.ts
  export type TokenName = 'app' | 'surface' | /* … every row below … */ 'overlay';
  export const TOKENS: Readonly<Record<TokenName, readonly [light: string, dark: string]>>; // 35 entries, hex as in the table
  /** `--*` declarations of the first top-level `<selector> {` block, values trimmed. */
  export function cssDecls(css: string, selector: ':root' | '.dark'): Map<string, string>;
  /** Body of the first `@theme inline {` block. */
  export function themeInline(css: string): string;
  // tests/unit/helpers/contrast.ts
  /** WCAG 2.x contrast ratio of two `#rgb` / `#rrggbb` colours (an 8-digit alpha suffix is rejected with an Error). */
  export function contrastRatio(a: string, b: string): number;
  ```

  - **CSS order** (binding): `@import`s; `@custom-variant dark (&:where(.dark, .dark *));` (so any `dark:` utility follows the theme class and the toggle, never `prefers-color-scheme` directly); the existing `@theme { … }` block (radius, fonts; Task 14 puts the palette reset at its start); then `@theme inline { … }`; then `:root`, `.dark`, `body`. The reset block must come before `@theme inline`, or Task 14's `--color-*: initial` would also clear the brand colours.
  - **CSS shape**: one `@theme inline { --color-<name>: var(--lc-<name>); … }` block for all 35 names, so `bg-surface`, `text-fg`, `border-line`, `fill-accent`, `ring-focus`, `placeholder-fg-muted` … exist; `:root { color-scheme: light; --lc-<name>: <light>; … }`; `.dark { color-scheme: dark; --lc-<name>: <dark>; … }`; `body { background-color: var(--color-app); color: var(--color-fg); … }` (the font line is Task 11's). Values are written exactly as in the table (upper-case hex).
  - **`contrastRatio`**: sRGB channel ≤ 0.04045 → c/12.92, else ((c+0.055)/1.055)^2.4; luminance = 0.2126R + 0.7152G + 0.0722B; ratio = (L1+0.05)/(L2+0.05).
  - **`main.tsx`**: `document.documentElement.classList.add('dark')` as the first statement before `startStudio`, so the Studio stays dark while Tasks 12–14 restyle it. Task 16 replaces this line.

**Brand token table** (binding for the whole milestone; brand-named values marked with their brand name):

| Token           | Role                                                        | Light               | Dark                   |
| --------------- | ----------------------------------------------------------- | ------------------- | ---------------------- |
| `app`           | page background                                             | `#FFF8F0` Paper     | `#1C1714` Espresso     |
| `surface`       | header, panels, dialogs, inputs                             | `#FFFDFA`           | `#231D19`              |
| `raised`        | cards, chips, neutral controls at rest, code blocks         | `#F7EEE4`           | `#2D2520`              |
| `raised-hover`  | hover/active fill of neutral controls                       | `#EFE3D6`           | `#3A302A`              |
| `line`          | borders and dividers                                        | `#E9DCCD` Line      | `#3B312A`              |
| `line-strong`   | input and control outlines (3:1)                            | `#8C7764`           | `#94806F`              |
| `fg`            | text                                                        | `#1D1712` Ink       | `#F6EEE6` Cream        |
| `fg-muted`      | secondary text, hints, placeholders                         | `#6B5B4D` Muted     | `#CBBBAA`              |
| `fg-faint`      | disabled text and `aria-hidden` decoration only             | `#A08B78`           | `#7D6A5B`              |
| `accent`        | coral fill: the primary action of a view, the fix           | `#FF6B4A` Coral     | `#FF7A5C` Coral (dark) |
| `accent-hover`  | hover fill of `accent`                                      | `#FF8264`           | `#FF9478`              |
| `accent-shadow` | logo patch shadow                                           | `#C2472C` Coral sh. | `#9E3A24`              |
| `on-accent`     | text on `accent`                                            | `#1D1712`           | `#1C1714`              |
| `accent-fg`     | coral text: the selected item, links, the text being edited | `#B23A1E`           | `#FF8A6E`              |
| `accent-soft`   | tint behind the selected item                               | `#FFE9E2`           | `#3A231C`              |
| `accent-line`   | border of the selected item                                 | `#F5B9A8`           | `#6E3426`              |
| `focus`         | the focus ring (Task 25)                                    | `#B23A1E`           | `#FF7A5C`              |
| `logo-ink`      | logo lines                                                  | `#1D1712`           | `#F6EEE6`              |
| `danger-fg`     | error text                                                  | `#B42318`           | `#FF8A80`              |
| `danger-bg`     | error box                                                   | `#FDECEA`           | `#3A1E1A`              |
| `danger-line`   | error box border                                            | `#F2B8B0`           | `#6E2E26`              |
| `danger-solid`  | destructive button                                          | `#B42318`           | `#C7362B`              |
| `on-danger`     | text on `danger-solid`                                      | `#FFFFFF`           | `#FFFFFF`              |
| `warning-fg`    | warning text                                                | `#8A5A00`           | `#F5C26B`              |
| `warning-bg`    | warning box                                                 | `#FDF3DC`           | `#3A2E17`              |
| `warning-line`  | warning box border                                          | `#E9CF8F`           | `#6B5426`              |
| `warning-solid` | "Save anyway"-type button                                   | `#8A5A00`           | `#F5C26B`              |
| `on-warning`    | text on `warning-solid`                                     | `#FFFFFF`           | `#1C1714`              |
| `success-fg`    | success text, connected dot                                 | `#1A6B37`           | `#7FD49A`              |
| `success-bg`    | success box                                                 | `#E6F4EA`           | `#183222`              |
| `success-line`  | success box border                                          | `#A7D7B5`           | `#2F5E3E`              |
| `info-fg`       | info text                                                   | `#1E5FA8`           | `#8DBEF5`              |
| `info-bg`       | info box                                                    | `#E7F0FA`           | `#172839`              |
| `info-line`     | info box border                                             | `#A9C7EA`           | `#2E4E73`              |
| `overlay`       | dialog backdrop                                             | `#1D171273`         | `#000000A6`            |

- [ ] **Step 1: Write the failing test** (`// @vitest-environment node`)

```ts
const css = readFileSync('src/studio/index.css', 'utf8');
const decls = { light: cssDecls(css, ':root'), dark: cssDecls(css, '.dark') };
const SURFACES = ['app', 'surface', 'raised', 'raised-hover'];
const TEXT = ['fg', 'fg-muted', 'accent-fg', 'danger-fg', 'warning-fg', 'success-fg', 'info-fg'];
const TINTS = ['accent-soft', 'danger-bg', 'warning-bg', 'success-bg', 'info-bg'];
const PAIRS = [
  ...TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg])),
  ...['fg', 'fg-muted'].flatMap((fg) => TINTS.map((bg) => [fg, bg])),
  ['accent-fg', 'accent-soft'],
  ['danger-fg', 'danger-bg'],
  ['warning-fg', 'warning-bg'],
  ['success-fg', 'success-bg'],
  ['info-fg', 'info-bg'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['on-danger', 'danger-solid'],
  ['on-warning', 'warning-solid'],
] as const;

it('defines every brand token for light and dark', () => {
  for (const [name, [light, dark]] of Object.entries(TOKENS)) {
    expect(decls.light.get(`--lc-${name}`), name).toBe(light);
    expect(decls.dark.get(`--lc-${name}`), name).toBe(dark);
  }
});
it('has 35 tokens', () => expect(Object.keys(TOKENS)).toHaveLength(35));
it('takes the named brand colours verbatim', () => {
  const l = (n: string) => decls.light.get(`--lc-${n}`);
  const d = (n: string) => decls.dark.get(`--lc-${n}`);
  expect(['app', 'fg', 'fg-muted', 'line', 'accent', 'accent-shadow'].map(l)).toEqual([
    '#FFF8F0',
    '#1D1712',
    '#6B5B4D',
    '#E9DCCD',
    '#FF6B4A',
    '#C2472C',
  ]);
  expect(['app', 'fg', 'accent', 'accent-shadow', 'logo-ink'].map(d)).toEqual([
    '#1C1714',
    '#F6EEE6',
    '#FF7A5C',
    '#9E3A24',
    '#F6EEE6',
  ]);
});
it('maps every token into Tailwind with @theme inline', () => {
  for (const name of Object.keys(TOKENS))
    expect(themeInline(css)).toContain(`--color-${name}: var(--lc-${name});`);
});
it('drops the placeholder shadcn colours', () => {
  expect(css).not.toMatch(/hsl\(var\(--/);
  expect(css).not.toMatch(
    /--(?:primary|secondary|card|popover|muted|destructive|background|foreground|border|input|ring|accent)\b/
  );
  const colourNames = [...css.matchAll(/--color-([\w-]+)\s*:/g)].map((m) => m[1]);
  expect(colourNames.filter((n) => !(n in TOKENS) && n !== 'white' && n !== 'black')).toEqual([]);
});
it('writes hex colours only in the theme blocks', () => {
  const outside = css
    .replace(/(?::root|\.dark)\s*\{[^}]*\}/g, '')
    .replace(/@theme\s*\{[^}]*\}/g, (b) =>
      b.replace(/--color-(?:white|black):\s*#[0-9a-fA-F]{3,8};/g, '')
    );
  expect(outside.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
});
it('orders the CSS so the palette reset never clears the brand colours', () => {
  expect(css.indexOf('@custom-variant dark (&:where(.dark, .dark *));')).toBeGreaterThan(-1);
  expect(css.search(/@theme\s*\{/)).toBeLessThan(css.indexOf('@theme inline'));
});
it('leaves no dead shadcn classes on the page body', () =>
  expect(readFileSync('src/studio/index.html', 'utf8')).not.toMatch(
    /bg-background|text-foreground/
  ));
it('tells the browser which scheme each theme is', () => {
  expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light;/);
  expect(css).toMatch(/\.dark\s*\{[^}]*color-scheme:\s*dark;/);
});
it('paints the page from the tokens', () =>
  expect(css).toMatch(
    /body\s*\{[^}]*background-color:\s*var\(--color-app\);[^}]*color:\s*var\(--color-fg\);/
  ));
describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  const c = (n: string) => decls[theme].get(`--lc-${n}`)!;
  it.each(PAIRS)('%s on %s reaches 4.5:1', (fg, bg) =>
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5)
  );
  it.each([
    ...['focus', 'line-strong'].flatMap((ui) => SURFACES.map((bg) => [ui, bg])),
    ...TINTS.map((bg) => ['focus', bg]), // the ring around the selected item and inside message boxes
  ])('%s on %s reaches 3:1', (ui, bg) =>
    expect(contrastRatio(c(ui), c(bg))).toBeGreaterThanOrEqual(3)
  );
  it('never puts white text on coral', () => expect(c('on-accent')).not.toBe('#FFFFFF'));
});
it('computes WCAG ratios', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(contrastRatio('#fff', '#FFFFFF')).toBeCloseTo(1, 5);
  expect(contrastRatio('#FFF8F0', '#1D1712')).toBeCloseTo(16.85, 1);
  expect(() => contrastRatio('#1D171273', '#FFFFFF')).toThrow();
});
it('keeps the Studio dark until the theme toggle lands', () => {
  const main = readFileSync('src/studio/main.tsx', 'utf8');
  const at = main.indexOf("document.documentElement.classList.add('dark')");
  expect(at).toBeGreaterThan(-1);
  expect(at).toBeLessThan(main.indexOf('startStudio('));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/studio-brand-tokens.test.ts`
Expected: FAIL — cannot resolve `./helpers/studio-tokens.js`.

- [ ] **Step 3: Implement** the two helpers, the CSS order and shape above with the table's values, the `main.tsx` line, and the one-line `index.html` edit.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/studio-brand-tokens.test.ts tests/unit/studio-tailwind-shades.test.ts`, then `npm run build`
Expected: PASS (120 contrast cases among them: 94 at 4.5:1, 26 at 3:1); build exit 0. Components still use palette classes, so the Studio looks as before apart from `body`.

- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio/index.css src/studio/main.tsx src/studio/index.html tests/unit/helpers/studio-tokens.ts tests/unit/helpers/contrast.ts tests/unit/studio-brand-tokens.test.ts
git commit -m "feat(studio): add brand colour tokens for light and dark, checked for AA contrast"
```

---

### Task 11: Brand type and the logo in the header

**Files:**

- Modify: `package.json`, `package-lock.json` (devDependencies: add `@fontsource/bricolage-grotesque`, `@fontsource/jetbrains-mono`, `@fontsource/readex-pro`, `@fontsource/ibm-plex-sans-arabic`; remove `@fontsource/outfit`), `src/studio/main.tsx` (font imports), `src/studio/index.css` (type tokens, Arabic sizing), every `src/studio/**/*.tsx` using `font-outfit` (today `ChangesPanel`, `ConfirmModal`, `EditorPanel`, `EmptySelection`, `FirstRunTips`, `Header`; the test is the authority), `components/Header.tsx` (logo and wordmark)
- Create: `components/BrandMark.tsx`, `tests/e2e/brand.spec.ts`, `tests/e2e/fixtures/fonts.ts`
- Test: `tests/unit/studio-brand-type.test.tsx` (new), `tests/unit/header-review.test.tsx`

**Interfaces:**

- Consumes: tokens `logo-ink`, `accent`, `accent-shadow`, `fg`, `fg-muted` (Task 10).
- Produces:

  ```ts
  // components/BrandMark.tsx
  /** The S1 patch mark from brand spec §2.2, coloured by tokens so it follows the theme. */
  export const BrandMark: (props: { className?: string }) => JSX.Element;
  ```

  - **Fonts** (`main.tsx`, Fontsource CSS per subset and weight): keep today's `@fontsource/inter/latin-{300,400,500,600,700}.css`; add `@fontsource/bricolage-grotesque/latin-{700,800}.css`, `@fontsource/jetbrains-mono/latin-500.css`, `@fontsource/readex-pro/arabic-{600,700}.css`, `@fontsource/ibm-plex-sans-arabic/arabic-{400,500,600,700}.css` (700 so `font-bold` Arabic text is not synthesised); remove every `@fontsource/outfit` import.
  - **Type tokens** (in the existing `@theme` block, replacing `--font-outfit`):
    `--font-heading: 'Bricolage Grotesque', 'Readex Pro', system-ui, sans-serif;`
    `--font-sans: 'Inter', 'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif;`
    `--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;`
    `body` uses `font-family: var(--font-sans);`. Arabic sizing: `html[lang='ar'] { font-size: 108%; }` and `html[lang='ar'] body { line-height: 1.7; }` (rem-based sizes scale; explicit `leading-*` classes still win).
  - **Class rule**: every `font-outfit` becomes `font-heading`; `font-mono` keeps its name (now JetBrains Mono).
  - **`BrandMark`** renders the master SVG verbatim in geometry: `<svg data-testid="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">`, a `<g className="fill-logo-ink">` with the six rects of the master (the hairline rect keeps `opacity=".5"`), and `<g transform="rotate(-7 39 32)">` with the shadow rect (`className="fill-accent-shadow"`) then the patch rect (`className="fill-accent"`). No `fill="#…"` attribute.
  - **Header**: the gradient tile and eye icon are replaced by `<BrandMark className="h-8 w-8 shrink-0" />`; the `h1` text becomes `livelocale` with `font-heading font-extrabold text-fg` (no gradient, no `tracking-wide`); the tagline stays.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/studio-brand-type.test.tsx (// @vitest-environment jsdom)
const css = readFileSync('src/studio/index.css', 'utf8');
const main = readFileSync('src/studio/main.tsx', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const fontVar = (name: string) => css.match(new RegExp(`--font-${name}:\\s*([^;]+);`))?.[1];

it('stacks each Latin face before its Arabic face', () => {
  expect(fontVar('heading')).toMatch(/^'Bricolage Grotesque', 'Readex Pro',/);
  expect(fontVar('sans')).toMatch(/^'Inter', 'IBM Plex Sans Arabic',/);
  expect(fontVar('mono')).toMatch(/^'JetBrains Mono',/);
  expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\);/);
});
it('enlarges Arabic text and opens its line height', () => {
  expect(css).toMatch(/html\[lang='ar'\]\s*\{[^}]*font-size:\s*108%;/);
  expect(css).toMatch(/html\[lang='ar'\] body\s*\{[^}]*line-height:\s*1\.7;/);
});
it('bundles the brand faces from Fontsource and nothing from Google', () => {
  for (const f of [
    '@fontsource/bricolage-grotesque/latin-800.css',
    '@fontsource/jetbrains-mono/latin-500.css',
    '@fontsource/readex-pro/arabic-700.css',
    '@fontsource/ibm-plex-sans-arabic/arabic-400.css',
    '@fontsource/inter/latin-400.css',
  ])
    expect(main).toContain(`import '${f}';`);
  expect(main).not.toContain('@fontsource/outfit');
  expect(pkg.devDependencies['@fontsource/outfit']).toBeUndefined();
  for (const p of ['bricolage-grotesque', 'jetbrains-mono', 'readex-pro', 'ibm-plex-sans-arabic'])
    expect(pkg.devDependencies[`@fontsource/${p}`], p).toBeDefined();
  expect(pkg.dependencies).toBeUndefined();
  const google = studioFiles('src/studio', /\.(tsx?|css|html)$/).filter((f) =>
    /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(f, 'utf8'))
  );
  expect(google).toEqual([]);
});
it('uses only the brand font utilities', () => {
  const hits = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    [
      ...readFileSync(f, 'utf8').matchAll(/(?<![\w-])font-(?:outfit|serif|\[[^\]]+\])(?![\w-])/g),
    ].map((m) => `${f}: ${m[0]}`)
  );
  expect(hits).toEqual([]);
});
it('draws the patch mark from the master geometry, coloured by tokens', () => {
  const { container } = render(<BrandMark />);
  const svg = container.querySelector('svg[data-testid="brand-mark"]')!;
  expect([svg.getAttribute('viewBox'), svg.getAttribute('aria-hidden')]).toEqual([
    '0 0 64 64',
    'true',
  ]);
  const box = (r: Element) => ['x', 'y', 'width', 'height'].map((a) => r.getAttribute(a)).join(' ');
  expect([...svg.querySelectorAll('g.fill-logo-ink > rect')].map(box)).toEqual([
    '6 11 20 8',
    '29 11 29 8',
    '6 28 14 8',
    '25 31 29 2',
    '6 45 23 8',
    '32 45 12 8',
  ]);
  expect(svg.querySelector('g.fill-logo-ink > rect:nth-child(4)')!.getAttribute('opacity')).toBe(
    '.5'
  );
  const patch = svg.querySelector('g[transform="rotate(-7 39 32)"]')!;
  expect([...patch.children].map((r) => `${r.getAttribute('class')} ${box(r)}`)).toEqual([
    'fill-accent-shadow 24.5 24.5 30 15',
    'fill-accent 23 23 30 15',
  ]);
  expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}/i);
});
```

```tsx
// tests/unit/header-review.test.tsx (addition; renderHeader is the file's existing helper)
it('shows the patch mark and the lower-case wordmark', () => {
  renderHeader({});
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('livelocale');
  expect(screen.getByTestId('brand-mark')).toBeTruthy();
});
```

`studioFiles` is a small recursive walker defined in this test file (sorted, forward slashes); Task 12 moves it into `tests/unit/helpers/studio-files.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/studio-brand-type.test.tsx tests/unit/header-review.test.tsx`
Expected: FAIL — cannot resolve `…/BrandMark.js`; once it exists, the font stacks and imports are missing.

- [ ] **Step 3: Measure, install, implement.** First `npm run build; npm pack --dry-run` and note "package size" and "unpacked size". Then `npm install --save-dev @fontsource/bricolage-grotesque @fontsource/jetbrains-mono @fontsource/readex-pro @fontsource/ibm-plex-sans-arabic` and `npm uninstall @fontsource/outfit`, then the Produces block.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/studio-brand-type.test.tsx tests/unit/header-review.test.tsx tests/unit/studio-brand-tokens.test.ts`, then `npm run build; npm pack --dry-run`
Expected: PASS; exit 0; `git diff package.json` touches `devDependencies` only; `dist/studio` holds `.woff2` files whose names contain `bricolage-grotesque`, `jetbrains-mono`, `readex-pro`, `ibm-plex-sans-arabic` and `inter`, none containing `outfit`. Note the new sizes for the commit body.

- [ ] **Step 5: Write the E2E brand check** in `tests/e2e/brand.spec.ts`, with a shared helper in `tests/e2e/fixtures/fonts.ts` (Task 24 reuses it)

```ts
// tests/e2e/fixtures/fonts.ts
/** Families of the faces the page actually loaded (status 'loaded'), quotes stripped, sorted, unique. */
export const loadedFaces = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [
      ...new Set(
        [...document.fonts]
          .filter((f) => f.status === 'loaded')
          .map((f) => f.family.replace(/"/g, ''))
      ),
    ].sort()
  );
```

```ts
test('loads the brand faces from the Studio bundle and nothing from Google', async ({ page }) => {
  const thirdParty: string[] = [];
  page.on('request', (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdParty.push(r.url());
  });
  await page.goto('http://localhost:3010');
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  // document.fonts.check() is true when no face matches; only a face with status 'loaded' proves the font arrived.
  expect(await loadedFaces(page)).toEqual(expect.arrayContaining(['Bricolage Grotesque', 'Inter']));
  await expect(page.getByTestId('brand-mark')).toBeVisible();
  expect(thirdParty).toEqual([]);
});
```

- [ ] **Step 6: Run the E2E.** `npm run build`, then `npx playwright test tests/e2e/brand.spec.ts tests/e2e/responsive-layout.spec.ts` — all pass.

- [ ] **Step 7: Commit** (after the gate)

```bash
git add package.json package-lock.json src/studio tests/unit/studio-brand-type.test.tsx tests/unit/header-review.test.tsx tests/e2e/brand.spec.ts tests/e2e/fixtures/fonts.ts
git commit -m "feat(studio): use the brand type and the patch logo in the header

Package size before / after the brand fonts: <before> / <after> (unpacked <before> / <after>)."
```

---

### Task 12: Move the Studio shell to brand tokens

**Files:**

- Modify: `src/studio/app.tsx`; `components/{Header,StudioLayout,IframeViewer,KeysDirectory,EmptySelection,SetupProblems}.tsx`
- Create: `tests/unit/helpers/studio-files.ts` (the walker from Task 11's test and `tests/unit/studio-tailwind-shades.test.ts`, which both import it from now on)
- Test: `tests/unit/studio-colour-guard.test.ts` (new)

**Interfaces:**

- Consumes: `TOKENS` (Task 10); the walker from Task 11.
- Produces:

  ```ts
  // tests/unit/helpers/studio-files.ts
  export function studioFiles(dir: string, ext?: RegExp): string[]; // recursive, sorted, forward slashes, default /\.tsx?$/
  // tests/unit/studio-colour-guard.test.ts (extended by Tasks 13–14)
  const FIXED_COLOUR: RegExp; // palette classes, arbitrary colour classes, colour literals
  const MIGRATED_FILES: string[];
  ```

  - `FIXED_COLOUR` matches a palette class `\b[a-z-]+-(?:<palette>)-\d{2,3}\b` (`<palette>` = `slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose`), an arbitrary colour `-\[#[0-9a-fA-F]{3,8}\]`, a 6- or 8-digit hex literal `#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b`, and a colour function `\b(?:rgba?|hsla?|oklch)\(`.

**Migration map** (binding for Tasks 12–14). Replace by role; keep every variant prefix (`hover:`, `disabled:`, `group-hover:` …); drop opacity suffixes on colour classes (the tokens are solid) except `bg-surface/90` on the header. Only colour classes change, plus the deletions named here; never markup, copy or layout classes.

| Today                                                                                            | Becomes                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-[#0b0f19]`, `bg-[#070a10]`, `from-[#0b0f19] … to-[#070a10]` gradients                        | `bg-app`; the gradient utilities (`bg-linear-*`, `from-*`, `via-*`, `to-*`) are deleted                                                                                                                                                                                               |
| `bg-[#080b11]/90` (header)                                                                       | `bg-surface/90`                                                                                                                                                                                                                                                                       |
| bg `slate-950` (panels, inputs, code)                                                            | `bg-surface`                                                                                                                                                                                                                                                                          |
| bg `slate-950/…` or `black/…` on a full-screen dialog backdrop                                   | `bg-overlay`                                                                                                                                                                                                                                                                          |
| bg `slate-900`, and `slate-800` at rest                                                          | `bg-raised`                                                                                                                                                                                                                                                                           |
| bg `slate-800`/`slate-700` under `hover:`/`active:`                                              | `bg-raised-hover` (same variant)                                                                                                                                                                                                                                                      |
| border/divide/ring `slate-950`/`900`/`800`                                                       | `…-line`                                                                                                                                                                                                                                                                              |
| border/divide/ring `slate-700`/`600`                                                             | `…-line-strong`                                                                                                                                                                                                                                                                       |
| text `slate-50`…`300`; gradient text `from-slate-100 to-slate-300 bg-clip-text text-transparent` | `text-fg` (gradient and clip classes deleted)                                                                                                                                                                                                                                         |
| text/placeholder `slate-400`…`700`                                                               | `text-fg-muted` / `placeholder-fg-muted`; `text-fg-faint` only under `disabled:` or on an `aria-hidden` element                                                                                                                                                                       |
| indigo solid fill (`bg-indigo-600`/`500`, with `text-white`)                                     | `bg-accent hover:bg-accent-hover text-on-accent` — only on the primary action of a view (Save, Send, Start editing, Commit, Apply, Create pull request, Review changes); any other indigo button becomes a neutral one (`bg-raised hover:bg-raised-hover text-fg border border-line`) |
| indigo text on the selected item, a link, or the text being edited                               | `text-accent-fg`                                                                                                                                                                                                                                                                      |
| indigo text elsewhere (key paths, counts, code)                                                  | `text-fg`                                                                                                                                                                                                                                                                             |
| indigo tint bg (`/5`…`/20`) and indigo border                                                    | `bg-accent-soft`, `border-accent-line`                                                                                                                                                                                                                                                |
| `focus:` ring/border indigo                                                                      | `focus:ring-focus` / `focus:border-focus` (removed in Task 25)                                                                                                                                                                                                                        |
| rose text / tint / border / solid fill with `text-white`                                         | `text-danger-fg` / `bg-danger-bg` / `border-danger-line` / `bg-danger-solid text-on-danger`                                                                                                                                                                                           |
| amber, likewise                                                                                  | `warning-fg` / `warning-bg` / `warning-line` / `bg-warning-solid text-on-warning`                                                                                                                                                                                                     |
| emerald text / tint / border; an emerald status dot                                              | `success-fg` / `success-bg` / `success-line`; the dot `bg-success-fg`                                                                                                                                                                                                                 |
| sky, likewise                                                                                    | `info-fg` / `info-bg` / `info-line`                                                                                                                                                                                                                                                   |
| `violet-*`, coloured shadows (`shadow-<colour>-…`)                                               | deleted (neutral `shadow-*` sizes stay)                                                                                                                                                                                                                                               |
| hover on `accent`/`danger-solid`/`warning-solid` fills                                           | `hover:bg-accent-hover`; `hover:bg-danger-solid/90`, `hover:bg-warning-solid/90` (the only other opacity suffixes allowed)                                                                                                                                                            |
| `Header` coverage bar inline gradients                                                           | classes `bg-success-fg` (≥ 80 %), `bg-warning-fg` (≥ 40 %), else `bg-danger-fg`; only `width` stays inline                                                                                                                                                                            |
| `bg-white` on `#app-preview-iframe`                                                              | stays                                                                                                                                                                                                                                                                                 |

A palette class with no row here is not guessed: add a row to this table first (in the plan and the commit body).

- [ ] **Step 1: Write the failing test**

```ts
const MIGRATED_FILES = [
  'src/studio/app.tsx',
  ...[
    'Header',
    'StudioLayout',
    'IframeViewer',
    'KeysDirectory',
    'EmptySelection',
    'SetupProblems',
  ].map((c) => `src/studio/features/dashboard/components/${c}.tsx`),
];
it('uses brand tokens instead of fixed colours', () => {
  expect(
    fixedColours(
      '<p className="bg-slate-900 text-[#fff] hover:bg-raised" style={{ color: "#ff00aa" }}>'
    )
  ).toEqual(['bg-slate-900', '-[#fff]', '#ff00aa']);
  const fixed = MIGRATED_FILES.flatMap((f) =>
    fixedColours(readFileSync(f, 'utf8')).map((m) => `${f}: ${m}`)
  );
  expect(fixed).toEqual([]);
});
```

`fixedColours(source: string): string[]` returns every `FIXED_COLOUR` match in source order.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/studio-colour-guard.test.ts`
Expected: FAIL, listing e.g. `src/studio/app.tsx: -[#0b0f19]`, `…/Header.tsx: -[#080b11]`, `…/Header.tsx: #34d399` (the arbitrary-colour pattern matches from the `-`, as in the unit example).

- [ ] **Step 3: Apply the migration map** to the seven files (e.g. the `app.tsx` root becomes `bg-app text-fg`, the header `bg-surface/90 backdrop-blur-md border-b border-line`).

- [ ] **Step 4: Run the checks**

Run: `npx vitest run tests/unit/studio-colour-guard.test.ts tests/unit/studio-tailwind-shades.test.ts tests/unit/studio-brand-type.test.tsx tests/unit/studio-layout.test.tsx tests/unit/header-review.test.tsx`, then `npm run build` and `npx playwright test tests/e2e/responsive-layout.spec.ts tests/e2e/brand.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/helpers/studio-files.ts tests/unit/studio-colour-guard.test.ts tests/unit/studio-tailwind-shades.test.ts tests/unit/studio-brand-type.test.tsx
git commit -m "feat(studio): restyle the Studio shell with the brand colours"
```

---

### Task 13: Move the editor and locale components to brand tokens

**Files:**

- Modify: `components/{EditorPanel,TranslationEditor,PluralEditor,LocaleManager,LocaleRow,LocalePicker}.tsx`
- Test: `tests/unit/studio-colour-guard.test.ts`

**Interfaces:**

- Consumes: `MIGRATED_FILES`, `fixedColours`, the migration map (Task 12).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test.** Append the six component paths to `MIGRATED_FILES`.
- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-colour-guard.test.ts` — FAIL, listing e.g. `…/TranslationEditor.tsx: bg-amber-600`, `…/LocaleRow.tsx: bg-rose-600`.
- [ ] **Step 3: Apply the migration map** (e.g. Save → `bg-accent hover:bg-accent-hover text-on-accent`; "Save anyway" `bg-amber-600 hover:bg-amber-500 active:bg-amber-700` → `bg-warning-solid hover:bg-warning-solid/90 text-on-warning`; the delete confirm → `bg-danger-solid hover:bg-danger-solid/90 text-on-danger`).
- [ ] **Step 4: Run the checks.** `npx vitest run tests/unit/studio-colour-guard.test.ts tests/unit/translation-editor.test.tsx tests/unit/plural-editor.test.tsx tests/unit/locale-picker.test.tsx tests/unit/studio-locale-hooks.test.tsx`, then `npm run build` and `npx playwright test tests/e2e/visual-sync.spec.ts` — all pass.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-colour-guard.test.ts
git commit -m "feat(studio): restyle the editor and locale components with the brand colours"
```

---

### Task 14: Move the panels and dialogs to brand tokens and guard the whole Studio

**Files:**

- Modify: `components/{ChangesPanel,DraftList,ReviewPanel,SendDialog,ImportChangeDialog,TokenModal,ConfirmModal,FirstRunTips,RepoPrompt,GitHubIssueAction}.tsx`, `src/studio/index.css` (reset the default palette)
- Delete: `tests/unit/studio-tailwind-shades.test.ts` (superseded: no palette shade is left to check)
- Test: `tests/unit/studio-colour-guard.test.ts`

**Interfaces:**

- Consumes: `fixedColours`, the migration map (Task 12); `studioFiles` (Task 12); `TOKENS` (Task 10).
- Produces: three guards every later task must keep green:
  - no fixed colour in any `.ts`/`.tsx` under `src/studio`;
  - no colour utility naming an unknown colour (`unknownColourNames`);
  - the default Tailwind palette is reset, so a palette class that slips past review generates no CSS: the existing `@theme` block (which Task 10 placed before `@theme inline`) starts with `--color-*: initial; --color-white: #fff; --color-black: #000;`, and the built CSS proves the brand colours survived it (Step 4);
  - white text never sits on coral: no `className` literal holds both `bg-accent` and `text-white`.
  - **Known colour names** = `Object.keys(TOKENS)` plus `transparent current inherit`. `white` and `black` are not known: the one allowed use is `bg-white` on `#app-preview-iframe` (an exemption by element id, in the test); every other `text-white`/`bg-black/…` (12 today) moves by the migration map (`text-white` on a solid fill → that fill's `text-on-*`; a `black/…` backdrop → `bg-overlay`). `unknownColourNames` matches `(?<![\w-])(?:[\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring|divide|from|to|via|shadow|placeholder|outline|fill|stroke|caret|accent|decoration)-([a-z][\w-]*?)(?:\/\d+)?(?![\w-])` and reports every capture that is neither a known colour name nor a non-colour suffix of that utility (`NON_COLOUR` in the test: `2xs xs sm md base lg xl 2xl 3xl 4xl inner left center right start end justify wrap nowrap balance pretty ellipsis clip 0 1 2 4 8 t r b l x y s e solid dashed dotted double none hidden collapse separate inset auto clip-text linear-to-r linear-to-tr fixed local scroll cover contain center no-repeat` and anything starting `offset-` or `opacity-`; the `shadow-*` sizes in use today are `2xs xs sm md lg xl 2xl inner none`, all listed).

- [ ] **Step 1: Write the failing tests.** Replace `MIGRATED_FILES` with `studioFiles('src/studio')` and rename the test `uses brand tokens instead of fixed colours anywhere in the Studio`. Add:

```ts
it('names only known colours in colour utilities anywhere in the Studio', () => {
  expect(
    unknownColourNames(
      '<p className="text-fg-mutd bg-surfce border-line text-xs ring-2 shadow-md shadow-inner fill-accent text-white">'
    )
  ).toEqual(['text-fg-mutd', 'bg-surfce', 'text-white']);
  expect(unknownColourNames('<iframe id="app-preview-iframe" className="bg-white" />')).toEqual([]);
  const found = studioFiles('src/studio').flatMap((f) =>
    unknownColourNames(readFileSync(f, 'utf8')).map((c) => `${f}: ${c}`)
  );
  expect(found).toEqual([]);
});
it('never puts white text on a coral fill', () => {
  const both = studioFiles('src/studio').flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/["'`]([^"'`]*)["'`]/g)]
      .filter(
        (m) =>
          /(?<![\w-])bg-accent(?![\w-])/.test(m[1]) && /(?<![\w-])text-white(?![\w-])/.test(m[1])
      )
      .map((m) => `${f}: ${m[1]}`)
  );
  expect(both).toEqual([]);
});
it('resets the default palette before the brand colours are mapped', () => {
  const css = readFileSync('src/studio/index.css', 'utf8');
  expect(css).toMatch(
    /@theme\s*\{\s*--color-\*:\s*initial;\s*--color-white:\s*#fff;\s*--color-black:\s*#000;/
  );
  expect(css.indexOf('--color-*: initial')).toBeLessThan(css.indexOf('@theme inline'));
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-colour-guard.test.ts` — FAIL: the fixed-colour guard lists classes in the ten files above and no other file; `unknownColourNames` is not defined; the reset is missing.
- [ ] **Step 3: Apply the migration map** (dialog backdrops → `bg-overlay`; the Send dialog's Copy and the tips' Start editing → `bg-accent … text-on-accent`). Write `unknownColourNames(source: string): string[]` in the test file (it skips `bg-white` only inside the opening tag that carries `id="app-preview-iframe"`); a non-colour suffix it reports wrongly goes into `NON_COLOUR`, a real typo is fixed in the component. Add the palette reset at the start of the existing `@theme` block in `index.css`. Delete `tests/unit/studio-tailwind-shades.test.ts`.
- [ ] **Step 4: Run the checks.** `npx vitest run` — all pass; `npm run build`, then check the built stylesheet: `grep -l '\.bg-app' dist/studio/assets/*.css` prints a file and `grep -c '\.bg-slate-900' dist/studio/assets/*.css` prints `0` (the brand colours survived the reset and the palette did not); `npx playwright test` — all pass.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add -A src/studio tests/unit
git commit -m "feat(studio): restyle panels and dialogs with the brand colours and forbid fixed colours

The default Tailwind palette is reset in the Studio stylesheet, and the shade-existence test is removed because no palette shade is left to check."
```

---

### Task 15: Resolve and apply the theme (`useTheme`)

**Files:**

- Create: `src/studio/theme.ts`, `hooks/useTheme.ts`, `tests/unit/helpers/match-media.ts`
- Test: `tests/unit/studio-theme.test.ts` (new)

**Interfaces:**

- Consumes: `ThemeChoice`, `initialThemeChoice`, `storedThemeChoice`, `saveThemeChoice`, `STUDIO_THEME_KEY` (Task 9); `useMediaQuery` (`hooks/useMediaQuery.ts`).
- Produces:

  ```ts
  // src/studio/theme.ts
  export type ResolvedTheme = 'light' | 'dark';
  export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';
  export function prefersDark(): boolean; // matchMedia(PREFERS_DARK_QUERY).matches; true without matchMedia
  export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme;
  export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void; // classList.toggle('dark', theme === 'dark')
  // hooks/useTheme.ts
  export function useTheme(isShareStudio: boolean): {
    choice: ThemeChoice;
    resolved: ResolvedTheme;
    setChoice(choice: ThemeChoice): void;
  };
  // tests/unit/helpers/match-media.ts
  export function fakeMatchMedia(initial: boolean): { fire(matches: boolean): void };
  ```

  `useTheme` keeps `choice` in state, initialised from `initialThemeChoice({ stored: storedThemeChoice(), isShareStudio })`; reads the system setting with `useMediaQuery(PREFERS_DARK_QUERY, true)`; applies `resolved` to `document.documentElement` in an effect; `setChoice` calls `saveThemeChoice`.

- [ ] **Step 1: Write the failing test** (`// @vitest-environment jsdom`; `afterEach`: `localStorage.clear()`, `document.documentElement.className = ''`, `vi.unstubAllGlobals()`)

```ts
it('resolves system from the media query', () => {
  expect(resolveTheme('system', true)).toBe('dark');
  expect(resolveTheme('system', false)).toBe('light');
  expect(resolveTheme('light', true)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
});
it('treats a missing matchMedia as a dark system', () => {
  vi.stubGlobal('matchMedia', undefined);
  expect(prefersDark()).toBe(true);
});
it('toggles only the dark class on the root', () => {
  const root = document.documentElement;
  root.classList.add('keep');
  applyTheme(root, 'dark');
  expect([...root.classList]).toEqual(['keep', 'dark']);
  applyTheme(root, 'dark');
  expect([...root.classList]).toEqual(['keep', 'dark']);
  applyTheme(root, 'light');
  expect([...root.classList]).toEqual(['keep']);
});
it('keeps the dev Studio dark under a light system setting', () => {
  fakeMatchMedia(false);
  const { result } = renderHook(() => useTheme(false));
  expect(result.current).toMatchObject({ choice: 'dark', resolved: 'dark' });
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});
it('follows a live system change while the choice is system', () => {
  const mm = fakeMatchMedia(false);
  const { result } = renderHook(() => useTheme(true));
  expect(result.current.resolved).toBe('light');
  act(() => mm.fire(true));
  expect(result.current.resolved).toBe('dark');
  expect(document.documentElement.classList.contains('dark')).toBe(true);
});
it('ignores a system change after an explicit choice and remembers it', () => {
  const mm = fakeMatchMedia(true);
  const { result } = renderHook(() => useTheme(true));
  act(() => result.current.setChoice('light'));
  act(() => mm.fire(true));
  expect(result.current).toMatchObject({ choice: 'light', resolved: 'light' });
  expect(localStorage.getItem(STUDIO_THEME_KEY)).toBe('light');
  expect(document.documentElement.classList.contains('dark')).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-theme.test.ts` — FAIL, `Failed to resolve import "../../src/studio/theme.js"`.
- [ ] **Step 3: Implement** the Produces block. `fakeMatchMedia` reports `matches` and `addEventListener`/`removeEventListener` like the stub in `tests/unit/studio-layout.test.tsx` (that test stays as is).
- [ ] **Step 4: Run to verify it passes.** `npx vitest run tests/unit/studio-theme.test.ts tests/unit/first-run-tips.test.tsx` — PASS; `npm run test:coverage` exits 0 (`theme.ts` counts toward the thresholds).
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio/theme.ts src/studio/features/dashboard/hooks/useTheme.ts tests/unit/helpers/match-media.ts tests/unit/studio-theme.test.ts
git commit -m "feat(studio): resolve a system, light or dark theme and follow live system changes"
```

---

### Task 16: Theme toggle in the header, with defaults by Studio kind

**Files:**

- Create: `components/ThemeToggle.tsx`
- Modify: `src/studio/features/dashboard/index.ts` (exports), `src/studio/app.tsx` (`useTheme`, `settings`), `src/studio/main.tsx` (first-paint apply), `tests/unit/studio-brand-tokens.test.ts` (drop Task 10's `main.tsx` test)
- Test: `tests/unit/theme-toggle.test.tsx` (new), `tests/e2e/theme.spec.ts` (new), `tests/e2e/fixtures/theme.ts` (new)

**Interfaces:**

- Consumes: `useTheme`, `resolveTheme`, `prefersDark`, `applyTheme` (Task 15); `ThemeChoice`, `THEME_CHOICES`, `storedThemeChoice`, `initialThemeChoice`, `STUDIO_THEME_KEY`, `isShareStudio`, Header `settings` (Task 9); the token table (Task 10); `brand-mark` (Task 11).
- Produces:

  ```ts
  // components/ThemeToggle.tsx
  export const THEME_LABELS: Record<ThemeChoice, string>; // { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }; replaced by catalogue keys in Task 21
  export const ThemeToggle: (props: {
    choice: ThemeChoice;
    onChange(choice: ThemeChoice): void;
  }) => JSX.Element;
  ```

  - Markup: `<div role="group" aria-label="Theme">` with one icon `<button type="button" data-theme-choice={c} aria-label={THEME_LABELS[c]} title={THEME_LABELS[c]} aria-pressed={c === choice}>` per `THEME_CHOICES` entry, `h-7 w-7`; the pressed one `bg-raised text-fg border border-line-strong` (the `line-strong` outline gives the 3:1 state cue that a `raised` fill alone, about 1.1:1 on `surface` in light, does not), the others `text-fg-muted border border-transparent hover:bg-raised-hover` (coral is not used here).
  - `main.tsx`: Task 10's unconditional `classList.add('dark')` is replaced. Before `startStudio`: `applyTheme(document.documentElement, resolveTheme(storedThemeChoice() ?? 'system', prefersDark()))` (the Studio kind is unknown until `startStudio` settles; following the system meanwhile means a light share Studio never shows a dark frame and a dark one never shows a light frame). In the `.finally` callback, before `render`: `applyTheme(document.documentElement, resolveTheme(initialThemeChoice({ stored: storedThemeChoice(), isShareStudio: isShareStudio() }), prefersDark()))`. A first-visit dev Studio under a light system shows the light Paper `body` while loading, then paints dark.
  - `app.tsx`: `const theme = useTheme(isShareStudio())`; `settings={<ThemeToggle choice={theme.choice} onChange={theme.setChoice} />}`.
  - `tests/unit/studio-brand-tokens.test.ts`: delete Task 10's `keeps the Studio dark until the theme toggle lands` (the line it pins is gone).

- [ ] **Step 1: Write the failing unit test**

```ts
it('shows the current choice as pressed', () => {
  render(<ThemeToggle choice="dark" onChange={() => {}} />);
  expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Light theme' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'System theme' }).getAttribute('aria-pressed')).toBe('false');
  const outlined = (name: string) =>
    screen.getByRole('button', { name }).className.split(/\s+/).includes('border-line-strong');
  expect([outlined('Dark theme'), outlined('Light theme'), outlined('System theme')]).toEqual([true, false, false]);
});
it('reports the clicked choice', () => {
  const onChange = vi.fn();
  render(<ThemeToggle choice="dark" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Light theme' }));
  expect(onChange).toHaveBeenCalledWith('light');
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/theme-toggle.test.tsx` — FAIL, cannot resolve `…/ThemeToggle.js`.
- [ ] **Step 3: Implement** `ThemeToggle`, the exports (`ThemeToggle`, `THEME_LABELS`, `useTheme`) and the `app.tsx`/`main.tsx` wiring.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/theme-toggle.test.tsx tests/unit/header-review.test.tsx tests/unit/studio-brand-tokens.test.ts` — PASS.
- [ ] **Step 5: Write the E2E test** in `tests/e2e/theme.spec.ts`, with the frame watcher in `tests/e2e/fixtures/theme.ts` (Task 24 reuses it). Brand values as computed colours: Paper `rgb(255, 248, 240)`, Espresso `rgb(28, 23, 20)`, Coral `rgb(255, 107, 74)`, Coral (dark) `rgb(255, 122, 92)`. Readiness is `ACTIVE` visible (90 s); `rootBg` is the computed `backgroundColor` of `#root > div`; `patchFill` the computed `fill` of `[data-testid="brand-mark"] .fill-accent`.

```ts
// tests/e2e/fixtures/theme.ts — call watchDark(page) before page.goto
/** Records whether the root carried `dark` at any point, and whether it did when #root first got content. */
export const watchDark = (page: Page) =>
  page.addInitScript(() => {
    const w = window as any;
    w.__sawDark = false;
    new MutationObserver(() => {
      if (document.documentElement.classList.contains('dark')) w.__sawDark = true;
      const root = document.getElementById('root');
      if (root && root.childElementCount > 0 && w.__darkAtFirstRender === undefined)
        w.__darkAtFirstRender = document.documentElement.classList.contains('dark');
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });
export const seen = (page: Page, name: '__sawDark' | '__darkAtFirstRender') =>
  page.evaluate((n) => (window as any)[n], name);
```

Tests in `theme.spec.ts`, each with its one pinned assertion:

| `colorScheme` | Test                                                                                                       | Pinned assertion                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| light         | `keeps the dev Studio in the brand dark theme until the person chooses` (3010)                             | root has `dark`, `rootBg` = Espresso, `patchFill` = `rgb(255, 122, 92)`                                                                           |
| light         | `shows the share Studio on Paper, with no dark frame before it loads` (3020, `watchDark`)                  | no `dark`, `seen(page, '__sawDark')` is `false`, `rootBg` = Paper, `patchFill` = `rgb(255, 107, 74)`                                              |
| light         | `remembers the chosen theme across a reload` (3010)                                                        | after `[data-theme-choice="light"]` click and reload: `STUDIO_THEME_KEY` = `light`, `rootBg` = Paper, that button `aria-pressed="true"`           |
| light         | `keeps the header on screen in light mode at 800x600` (3010)                                               | `scrollWidth <= innerWidth`; `#studio-changes-button` and `header-settings` visible                                                               |
| dark          | `shows the share Studio dark from its first render and follows a live switch to light` (3020, `watchDark`) | `seen(page, '__darkAtFirstRender')` is `true`, `rootBg` = Espresso; after `emulateMedia({ colorScheme: 'light' })`, `expect.poll(rootBg)` = Paper |
| —             | `captures brand screenshots for the owner` (owner review, not part of the gate)                            | `test.skip(!process.env.REVIEW_SHOTS)`; at 1440x900 with `STUDIO_THEME_KEY` = `dark` then `light`, writes `${REVIEW_SHOTS}/dev-<theme>.png`       |

- [ ] **Step 6: Run the E2E.** `npm run build`, then `npx playwright test tests/e2e/theme.spec.ts tests/e2e/brand.spec.ts tests/e2e/responsive-layout.spec.ts` — all pass (the screenshot test skipped).
- [ ] **Step 7: Run the full suites.** `npm test` and `npx playwright test` — all pass; `visual-sync.spec.ts` and `import-change-link.spec.ts` unchanged.
- [ ] **Step 8: Commit** (after the gate)

```bash
git add src/studio tests/unit/theme-toggle.test.tsx tests/unit/studio-brand-tokens.test.ts tests/e2e/theme.spec.ts tests/e2e/fixtures/theme.ts
git commit -m "feat(studio): add a system, light and dark theme toggle; share Studio follows the system"
```

- [ ] **Step 9: Show the owner the brand (handoff, non-blocking).** `REVIEW_SHOTS=<scratchpad> npx playwright test tests/e2e/theme.spec.ts -g "screenshots"`; send `dev-dark.png` and `dev-light.png` to the owner with one line naming the derived colours (Owner flag 1). Their colour edits, if any, change the Task 10 table and `index.css` together and keep `studio-brand-tokens.test.ts` green, in `fix(studio): <what changed> in the brand tokens`.

---

### Arabic tasks: shared rules (Tasks 17–24)

- **What stays English** (§12.1): messages from the server (`err.message` of an API response) or from `src/core` (`FLAG_MESSAGES`, `PlannedEdit.message`, `ChangeLinkError` messages outside `LINK_ERROR_COPY`); text written for the developer or the repository (`issueTitle`, `PASTE_HERE_BODY`, `changeFileName`, the `livelocale apply` command line).
- **Copy moves verbatim.** Every English string moves into `i18n/en.ts` unchanged, so existing English assertions keep passing. Each task writes the Arabic for every key it adds, in Modern Standard Arabic; the tips and the Send dialog get the most natural wording.
- **Direction.** Translator text (values, `by`, `note`, `from`, `to`) keeps `dir="auto"`. Code-like text (key paths, locale codes, URLs, commands, versions, file names) renders with `dir="ltr"`. The app iframe is not mirrored.
- **Tests in Arabic** wrap the component in `<StudioLanguageProvider initial="ar">`; each test file's existing render helper gains an optional language argument that does this (use the helper names those files already have). Expected Arabic text is read from `textFor('ar')(key, params)` so copy edits from the owner's review do not break tests.
- **Fonts.** The Arabic faces come from Task 11: Readex Pro for headings (`font-heading`), IBM Plex Sans Arabic for the interface (`font-sans`), each second in its stack, so Arabic copy and Arabic translation values render in them in either Studio language; `html[lang='ar']` gets the larger size and line height. No task adds another font.
- **Voice.** Arabic copy follows brand §2.5 in Modern Standard Arabic: short, direct, plain verbs; errors and empty states say what to do next and never apologise.

---

### Task 17: Strings catalogue with plural forms, fallback and bidi isolation

**Files:**

- Create: `i18n/catalogue.ts`, `i18n/en.ts`, `i18n/ar.ts`
- Test: `tests/unit/studio-i18n.test.ts` (new)

**Interfaces:**

- Consumes: `StudioLanguage` (Task 9).
- Produces:

  ```ts
  // i18n/catalogue.ts (re-exports StudioLanguage from src/studio/preferences.ts)
  export interface PluralMessage {
    readonly zero?: string; readonly one?: string; readonly two?: string;
    readonly few?: string; readonly many?: string; readonly other: string;
  }
  export type Message = string | PluralMessage;
  export type MessageParams = Readonly<Record<string, string | number>>;
  export type StringKey = keyof typeof en;
  export type Catalogues = { en: Readonly<Record<string, Message>>; ar: Readonly<Partial<Record<string, Message>>> };
  export type StudioText = (key: StringKey, params?: MessageParams) => string;
  export function textDirection(lang: StudioLanguage): 'ltr' | 'rtl';
  export function formatMessage(lang: StudioLanguage, catalogues: Catalogues, key: string, params?: MessageParams): string;
  export function textFor(lang: StudioLanguage): StudioText; // bound to the real catalogues
  export const englishText: StudioText;                       // textFor('en')
  // i18n/en.ts
  export const en = { … } as const satisfies Record<string, Message>;
  // i18n/ar.ts (imports only the StringKey type, so no runtime cycle)
  export const ar: Partial<Record<StringKey, Message>>;
  export const SAME_IN_BOTH: ReadonlySet<StringKey>; // keys whose Arabic may equal the English (brand-only strings)
  ```

  - **Keys** are `area.name` in snake case (`tips.title`, `send.title`, `header.changes`), one area per component or share module.
  - **Lookup**: `ar[key] ?? en[key]`; an unknown key returns the key. **Plural**: `new Intl.PluralRules(lang).select(Number(params.count))` (one cached instance per language), falling back to `other`. **Placeholders** are `{name}`; a missing param stays as written.
  - **Isolation**: when `textDirection(lang) === 'rtl'`, every interpolated value is wrapped in U+2068 and U+2069 (written as `\u2068`/`\u2069`); English output is never wrapped. The rule depends on the Studio language, not on which catalogue answered.
  - **Seed keys**: `language.switch_to_ar` = en `Show the Studio in Arabic`, ar `عرض الاستوديو بالعربية`; `language.switch_to_en` = en `Show the Studio in English`, ar `عرض الاستوديو بالإنجليزية`.

- [ ] **Step 1: Write the failing test**

```ts
const cat: Catalogues = {
  en: {
    hi: 'Hello {name}',
    only_en: 'Only English {n}',
    editing: 'Editing: {locale}',
    unsent: { one: '1 change not sent', other: '{count} changes not sent' },
  },
  ar: {
    hi: 'أهلًا {name}',
    editing: 'تعديل: {locale}',
    unsent: {
      zero: 'لا توجد تغييرات غير مرسلة',
      one: 'تغيير واحد لم يُرسل',
      two: 'تغييران لم يُرسلا',
      few: '{count} تغييرات لم تُرسل',
      many: '{count} تغييرًا لم يُرسل',
      other: '{count} تغيير لم يُرسل',
    },
  },
};
const FSI = '\u2068',
  PDI = '\u2069';
it('interpolates English without isolates', () =>
  expect(formatMessage('en', cat, 'editing', { locale: 'en-US' })).toBe('Editing: en-US'));
it('isolates every value in Arabic', () =>
  expect(formatMessage('ar', cat, 'editing', { locale: 'en-US' })).toBe(
    `تعديل: ${FSI}en-US${PDI}`
  ));
it('falls back to English for a missing Arabic entry, still isolated', () =>
  expect(formatMessage('ar', cat, 'only_en', { n: 3 })).toBe(`Only English ${FSI}3${PDI}`));
it.each([
  [0, 'لا توجد تغييرات غير مرسلة'],
  [1, 'تغيير واحد لم يُرسل'],
  [2, 'تغييران لم يُرسلا'],
  [3, `${FSI}3${PDI} تغييرات لم تُرسل`],
  [11, `${FSI}11${PDI} تغييرًا لم يُرسل`],
  [100, `${FSI}100${PDI} تغيير لم يُرسل`],
])('picks the Arabic plural form for %i', (count, text) =>
  expect(formatMessage('ar', cat, 'unsent', { count })).toBe(text)
);
it.each([
  [0, '0 changes not sent'],
  [1, '1 change not sent'],
  [2, '2 changes not sent'],
])('picks the English plural form for %i', (count, text) =>
  expect(formatMessage('en', cat, 'unsent', { count })).toBe(text)
);
it('leaves a missing param as written and returns an unknown key', () => {
  expect(formatMessage('en', cat, 'hi')).toBe('Hello {name}');
  expect(formatMessage('en', cat, 'nope')).toBe('nope');
});
it('maps languages to directions', () => {
  expect(textDirection('en')).toBe('ltr');
  expect(textDirection('ar')).toBe('rtl');
});
describe('the real catalogues', () => {
  const keys = Object.keys(en) as StringKey[];
  const names = (m: Message) =>
    new Set(
      [...(typeof m === 'string' ? [m] : Object.values(m)).join(' ').matchAll(/\{(\w+)\}/g)].map(
        (x) => x[1]
      )
    );
  it('has an Arabic entry for every key', () =>
    expect(keys.filter((k) => ar[k] === undefined)).toEqual([]));
  it('uses no placeholder in Arabic that English lacks, and keeps every non-count one', () => {
    for (const k of keys) {
      const enNames = names(en[k]);
      const forms = typeof ar[k] === 'string' ? [ar[k] as string] : Object.values(ar[k]!);
      for (const form of forms) {
        for (const n of names(form)) expect(enNames, `${k}: {${n}}`).toContain(n);
        for (const n of enNames)
          if (n !== 'count') expect(form, `${k}: {${n}}`).toContain(`{${n}}`);
      }
    }
  });
  it('gives every Arabic plural all six forms', () => {
    for (const k of keys)
      if (typeof en[k] !== 'string')
        expect(Object.keys(ar[k] as object).sort(), k).toEqual([
          'few',
          'many',
          'one',
          'other',
          'two',
          'zero',
        ]);
  });
  it('never leaves Arabic equal to English outside SAME_IN_BOTH', () =>
    expect(
      keys.filter((k) => !SAME_IN_BOTH.has(k) && JSON.stringify(ar[k]) === JSON.stringify(en[k]))
    ).toEqual([]));
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-i18n.test.ts` — FAIL, cannot resolve `src/studio/i18n/catalogue.js`.
- [ ] **Step 3: Implement** the three files with the rules and seed keys above.
- [ ] **Step 4: Run to verify it passes.** `npx vitest run tests/unit/studio-i18n.test.ts` — PASS.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio/i18n tests/unit/studio-i18n.test.ts
git commit -m "feat(studio): add an English and Arabic strings catalogue"
```

---

### Task 18: Language provider, the root direction, and the language switch

**Files:**

- Create: `i18n/StudioLanguage.tsx`, `components/LanguageToggle.tsx`
- Modify: `src/studio/main.tsx` (initial language after `startStudio`, provider around `<App />`), `src/studio/app.tsx` (root `lang`/`dir`/`data-testid`, `LanguageToggle` in `settings`)
- Test: `tests/unit/studio-language.test.tsx` (new)

**Interfaces:**

- Consumes: `StudioText`, `textFor`, `textDirection`, `englishText` (Task 17); `StudioLanguage`, `initialStudioLanguage`, `storedLanguage`, `saveLanguage`, `isShareStudio`, Header `settings` (Task 9).
- Produces:

  ```ts
  // i18n/StudioLanguage.tsx
  export interface StudioLanguageState {
    lang: StudioLanguage;
    dir: 'ltr' | 'rtl';
    t: StudioText;
    setLang(lang: StudioLanguage): void;
  }
  export function StudioLanguageProvider(props: {
    initial: StudioLanguage;
    children: React.ReactNode;
  }): JSX.Element;
  /** Outside a provider: English, 'ltr', englishText, and a setLang that does nothing. */
  export function useStudioText(): StudioLanguageState;
  // components/LanguageToggle.tsx
  export const LanguageToggle: () => JSX.Element;
  export const LANGUAGE_AUTONYMS: Readonly<Record<StudioLanguage, string>>; // { en: 'English', ar: 'العربية' }
  ```

  - **`setLang`** calls `saveLanguage(lang)`, updates state, and sets `document.documentElement.lang` and `.dir`; the provider also sets both on mount.
  - **Root**: the App's outer `div` gets `data-testid="studio-root"`, `lang={lang}`, `dir={dir}`; dialogs render inside it.
  - **`main.tsx`**: in the `.finally` callback, next to the theme apply from Task 16 and before `render`, compute `initialStudioLanguage({ stored: storedLanguage(), isShareStudio: isShareStudio(), browserLanguage: navigator.language })` and render `<StudioLanguageProvider initial={…}><App /></StudioLanguageProvider>`. Setting `document.documentElement.lang` to `ar` turns on Task 11's Arabic sizing; no font work happens here.
  - **`LanguageToggle`**: one `<button type="button" id="studio-language-toggle">` showing the _other_ language's autonym in a span with that `lang` (`dir="rtl"` on the Arabic label); `aria-label` = `t('language.switch_to_ar')` or `t('language.switch_to_en')`; click → `setLang(other)`; classes match the Changes button's resting style (`bg-raised hover:bg-raised-hover text-fg border border-line`), brand tokens only.
  - **`app.tsx`**: `settings={<><LanguageToggle /><ThemeToggle … /></>}`.

- [ ] **Step 1: Write the failing test** (`// @vitest-environment jsdom`; `beforeEach` writes `null` to the `studio-language` pref)

```ts
it('is English and left-to-right outside a provider', () => {
  const { result } = renderHook(() => useStudioText());
  expect([result.current.lang, result.current.dir, result.current.t('language.switch_to_ar')])
    .toEqual(['en', 'ltr', 'Show the Studio in Arabic']);
});
it('switches to Arabic, remembers it, and mirrors the document', () => {
  render(<StudioLanguageProvider initial="en"><LanguageToggle /></StudioLanguageProvider>);
  const button = screen.getByRole('button', { name: 'Show the Studio in Arabic' });
  expect(button.textContent).toBe('العربية');
  expect(button.querySelector('[lang="ar"]')).not.toBeNull();
  fireEvent.click(button);
  expect(storedLanguage()).toBe('ar');
  expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['ar', 'rtl']);
  expect(screen.getByRole('button', { name: 'عرض الاستوديو بالإنجليزية' }).textContent).toBe('English');
});
it('still switches when localStorage throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<StudioLanguageProvider initial="en"><LanguageToggle /></StudioLanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Show the Studio in Arabic' }));
  expect(document.documentElement.dir).toBe('rtl');
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-language.test.tsx` — FAIL, cannot resolve `src/studio/i18n/StudioLanguage.js`.
- [ ] **Step 3: Implement** the Produces block.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/studio-language.test.tsx tests/unit/header-review.test.tsx tests/unit/studio-colour-guard.test.ts` — PASS; `git diff package.json` is empty.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-language.test.tsx
git commit -m "feat(studio): switch the Studio between English and Arabic"
```

---

### Task 19: Mirror the layout with logical properties

**Files:**

- Modify: `components/{ChangesPanel,DraftList,EditorPanel,IframeViewer,KeysDirectory,LocaleManager,LocaleRow,PluralEditor,ReviewPanel,SendDialog,SetupProblems,StudioLayout,TranslationEditor}.tsx`, `components/Header.tsx` (locale chip, version badge `dir`), `i18n/en.ts`, `i18n/ar.ts` (`common.arrow`)
- Create: `tests/unit/helpers/class-literals.ts`
- Test: `tests/unit/studio-logical-properties.test.ts` (new), `tests/unit/studio-layout.test.tsx`

**Interfaces:**

- Consumes: `useStudioText` (Task 18); `studioFiles` (Task 12); the repo's own `typescript` (devDependency).
- Produces: one test helper, reused by Task 29, and a rule for every later task: Studio classes use start/end utilities only.

  ```ts
  // tests/unit/helpers/class-literals.ts
  /** Text of every string literal and template-literal head/span text inside a JSX `className`/`class` initializer
   *  (through ternaries, `&&`, calls and arrays), plus every literal initializing a variable or property whose name
   *  matches /class/i. Parsed with ScriptKind.TSX; `line` is 1-based. */
  export function classLiterals(
    ts: typeof import('typescript'),
    source: string,
    file: string
  ): { line: number; text: string; element?: import('typescript').JsxOpeningLikeElement }[];
  ```

  - **Mapping**: `ml-*`→`ms-*`, `mr-*`→`me-*`, `pl-*`→`ps-*`, `pr-*`→`pe-*`, `left-*`→`start-*`, `right-*`→`end-*`, `border-l`→`border-s`, `border-r`→`border-e`, `text-left`→`text-start`, `text-right`→`text-end`, `rounded-l*`→`rounded-s*`, `rounded-r*`→`rounded-e*`. `space-x-*` stays: in Tailwind 4.3.3 it already sets `margin-inline-start/end` and mirrors by itself. Brand colour tokens and variants are untouched.
  - **Arrow**: the `→` between old and new values (`ChangesPanel`, `DraftList`, `SendDialog`) renders `t('common.arrow')` (en `→`, ar `←`) with `aria-hidden="true"`.
  - **`dir="ltr"`** on key paths (`KeysDirectory`, `EditorPanel`, `DraftList`, `ChangesPanel`, `ReviewPanel`, `SendDialog`), the current path (`IframeViewer`), locale codes (`LocaleRow`, `LocaleManager`, the Header chip), the apply command and links (`ReviewPanel`, `SendDialog`), the version badge.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/studio-logical-properties.test.ts
const PHYSICAL =
  /(?<![\w-])-?(?:ml|mr|pl|pr|left|right|border-l|border-r|text-left|text-right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|scroll-ml|scroll-mr)(?:-[\w./[\]#%]+)?(?![\w-])/g;
it('collects class strings from ternaries, calls and class constants', () =>
  expect(
    classLiterals(
      ts,
      "const rowClass = 'pl-2';\n<p className={on ? 'ml-1' : `mr-${n} x`} />",
      'x.tsx'
    ).map((l) => l.text)
  ).toEqual(['pl-2', 'ml-1', 'mr-', ' x']));
it('uses start/end utilities instead of left/right ones', () => {
  const found = studioFiles('src/studio').flatMap((file) =>
    classLiterals(ts, readFileSync(file, 'utf8'), file).flatMap((l) =>
      [...l.text.matchAll(PHYSICAL)].map((p) => `${file}:${l.line}: ${p[0]}`)
    )
  );
  expect(found).toEqual([]);
});
```

```ts
// tests/unit/studio-layout.test.tsx (addition)
it('anchors the compact drawers to the start and end edges', () => {
  renderLayout({ isWide: false, openPanel: 'keys' });
  expect(screen.getByTestId('studio-drawer-keys').className.split(/\s+/)).toContain('start-0');
  expect(screen.getByTestId('studio-drawer-side').className.split(/\s+/)).toContain('end-0');
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-logical-properties.test.ts tests/unit/studio-layout.test.tsx` — FAIL, listing the physical classes (about 40, among them `border-r`, `pr-2`, `left-0`, `right-0`) and the missing `start-0`.
- [ ] **Step 3: Apply** the mapping, the arrow key and the `dir="ltr"` markers.
- [ ] **Step 4: Run the checks.** `npx vitest run tests/unit/studio-logical-properties.test.ts tests/unit/studio-layout.test.tsx tests/unit/studio-colour-guard.test.ts`, then `npm run build` and `npx playwright test tests/e2e/responsive-layout.spec.ts tests/e2e/theme.spec.ts` — all pass (LTR layout and brand colours unchanged).
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-logical-properties.test.ts tests/unit/studio-layout.test.tsx tests/unit/helpers/class-literals.ts
git commit -m "refactor(studio): use logical properties so the layout mirrors in Arabic"
```

---

### Task 20: First-run tips, the Send dialog, and the send and backup modules in Arabic

**Files:**

- Modify: `hooks/useFirstRun.ts`, `components/FirstRunTips.tsx`, `components/SendDialog.tsx`, `hooks/useDrafts.ts`, `hooks/draftActions.ts`, `src/studio/share/send.ts`, `src/studio/share/backup.ts`, `i18n/en.ts`, `i18n/ar.ts` (areas `tips`, `send`, `link_error`, `backup`, `drafts`)
- Test: `tests/unit/first-run-tips.test.tsx`, `tests/unit/send-dialog.test.tsx`, `tests/unit/share-send.test.ts`, `tests/unit/share-backup.test.ts`, `tests/unit/studio-drafts-hook.test.tsx`

**Interfaces:**

- Consumes: `StudioText`, `englishText`, `textFor` (Task 17); `useStudioText`, `StudioLanguageProvider`, `LanguageToggle` (Task 18).
- Produces:

  ```ts
  // hooks/useFirstRun.ts: replaces FIRST_RUN_TIPS
  export const FIRST_RUN_TIP_KEYS: readonly ['tips.step1', 'tips.step2', 'tips.step3'];
  // hooks/useDrafts.ts
  export function unsentLabel(n: number, t?: StudioText): string; // t defaults to englishText
  // share/send.ts
  export function describeLinkError(err: unknown, t?: StudioText): string; // t defaults to englishText
  // share/backup.ts
  export function createBackup(input: { …as today; t?: StudioText }): Promise<{ fileName: string; text: string }>;
  export function restoreBackup(text: string, transport: Pick<StaticTransport, 'restoreDrafts'>, t?: StudioText): Promise<string>;
  ```

  - `LINK_ERROR_COPY` becomes a code → key map (`link_error.not_found`, `link_error.ambiguous`, `link_error.damaged`, `link_error.too_big`, `link_error.unsupported_version`, `link_error.unsupported_environment`); `describeLinkError` returns `err.message` unchanged for anything that is not a known `ChangeLinkError` code.
  - Plural keys: `drafts.unsent` (`{count}`), `backup.restored` (plural on `{count}` = the number added, with `{skipped}`; no separate `{added}`, so the Arabic zero/one/two forms may leave the number out as Task 17's placeholder test allows), `send.overflow` (`{count}`).
  - The tips dialog renders `<LanguageToggle />` at the end of its title row; its Start button gets `id="studio-tips-start"`.
  - **Pinned copy** (en verbatim from today; ar for the owner's review):

    | key               | en                                                                                      | ar                                                                                                                                                                                   |
    | ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `tips.title`      | Welcome to LiveLocale                                                                   | مرحبًا بك في LiveLocale                                                                                                                                                              |
    | `tips.step1`      | Hold Alt/Option and click any text.                                                     | اضغط مع الاستمرار على مفتاح Alt (أو Option في ماك) وانقر على أي نص.                                                                                                                  |
    | `tips.step2`      | Type your fix. The page updates as you type, and your changes are kept in this browser. | اكتب التصحيح، وستتحدّث الصفحة أثناء الكتابة، وتُحفظ تغييراتك في هذا المتصفح.                                                                                                         |
    | `tips.step3`      | When you are done, press Send to developer and paste the link to your developer.        | عند الانتهاء، اضغط «إرسال إلى المطوّر» ثم أرسل الرابط إلى المطوّر.                                                                                                                   |
    | `tips.name_label` | Your name (optional, credited in the pull request)                                      | اسمك (اختياري، يُذكر في طلب الدمج)                                                                                                                                                   |
    | `tips.start`      | Start editing                                                                           | ابدأ التعديل                                                                                                                                                                         |
    | `send.title`      | Send to developer                                                                       | إرسال إلى المطوّر                                                                                                                                                                    |
    | `drafts.unsent`   | one: 1 change not sent / other: {count} changes not sent                                | zero: لا توجد تغييرات غير مرسلة / one: تغيير واحد لم يُرسل / two: تغييران لم يُرسلا / few: {count} تغييرات لم تُرسل / many: {count} تغييرًا لم يُرسل / other: {count} تغيير لم يُرسل |

- [ ] **Step 1: Write the failing tests**

```ts
// first-run-tips.test.tsx
it('shows the tips in Arabic and switches to English from inside the dialog', () => {
  render(<StudioLanguageProvider initial="ar"><Harness /></StudioLanguageProvider>);
  expect(screen.getByRole('dialog').textContent).toContain('مرحبًا بك في LiveLocale');
  for (const k of FIRST_RUN_TIP_KEYS) expect(screen.getByText(textFor('ar')(k))).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'عرض الاستوديو بالإنجليزية' }));
  expect(screen.getByText('Hold Alt/Option and click any text.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start editing' })).toBeTruthy();
});
// send-dialog.test.tsx (existing harness inside the Arabic provider)
it('titles the dialog in Arabic', async () =>
  expect((await openDialog()).getByRole('dialog', { name: 'إرسال إلى المطوّر' })).toBeTruthy());
// share-send.test.ts
it('describes a damaged link in Arabic and keeps an unknown error as written', () => {
  expect(describeLinkError(new ChangeLinkError('CORRUPT', 'x'), textFor('ar'))).toBe(textFor('ar')('link_error.damaged'));
  expect(describeLinkError(new ChangeLinkError('CORRUPT', 'x'), textFor('ar'))).not.toBe(describeLinkError(new ChangeLinkError('CORRUPT', 'x')));
  expect(describeLinkError(new Error('Server said no'), textFor('ar'))).toBe('Server said no');
});
// share-backup.test.ts (existing fake transport returning { added: 2, skipped: 0 })
it('reports a restore in Arabic with the dual form', async () =>
  expect(await restoreBackup(link, transport, textFor('ar'))).toBe(textFor('ar')('backup.restored', { count: 2, skipped: 0 })));
// studio-drafts-hook.test.tsx
it.each([[0, 'لا توجد تغييرات غير مرسلة'], [2, 'تغييران لم يُرسلا']])('labels %i unsent changes in Arabic', (n, text) =>
  expect(unsentLabel(n, textFor('ar'))).toBe(text));
```

Replace `FIRST_RUN_TIPS` in the existing first-run test with `FIRST_RUN_TIP_KEYS.map((k) => englishText(k))`.

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/first-run-tips.test.tsx tests/unit/send-dialog.test.tsx tests/unit/share-send.test.ts tests/unit/share-backup.test.ts tests/unit/studio-drafts-hook.test.tsx` — FAIL on the Arabic cases and the missing `FIRST_RUN_TIP_KEYS`.
- [ ] **Step 3: Move the copy** into the catalogue with the keys and signatures above; components read `t` from `useStudioText()`; `draftActions.ts` and `SendDialog` pass `t` into `restoreBackup`/`describeLinkError`. Write the Arabic for every other `send.*`, `backup.*` and `link_error.*` key.
- [ ] **Step 4: Run.** The same command plus `tests/unit/studio-i18n.test.ts` — PASS, including the completeness tests.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit
git commit -m "feat(studio): show the first-run tips and the Send dialog in Arabic"
```

---

### Task 21: Header, settings, layout, keys list, preview and setup problems in Arabic

**Files:**

- Modify: `components/{Header,StudioLayout,KeysDirectory,IframeViewer,EmptySelection,SetupProblems,ThemeToggle}.tsx`, `src/studio/features/dashboard/index.ts` (drop the `THEME_LABELS` export), `src/studio/app.tsx` (the blocked-preview text and `sideLabel`), `i18n/en.ts`, `i18n/ar.ts` (areas `header`, `theme`, `layout`, `keys`, `viewer`, `empty`, `setup`)
- Test: `tests/unit/header-review.test.tsx`, `tests/unit/studio-layout.test.tsx`, `tests/unit/studio-connection-help.test.tsx`, `tests/unit/theme-toggle.test.tsx`

**Interfaces:**

- Consumes: `useStudioText`, `StudioLanguageProvider` (Task 18); `unsentLabel(n, t)` (Task 20); `STATIC_MANIFEST_MISSING` (`src/studio/config.ts`); `ThemeToggle` (Task 16).
- Produces:
  - The wordmark `livelocale` (Task 11) is the brand and stays as written in both languages (`lang="en"`, `dir="ltr"` on the `h1`); the tagline `Live Visual Translation Studio` becomes `header.tagline`.
  - `PREVIEW` and its title become `header.preview`, `header.preview_title`; the version badge keeps `v{version}` and translates only `(BETA)` (`header.beta`). `SOURCE_HINTS` becomes `header.source_content`, `header.source_url`, `header.source_manual`, `header.source_remembered`; `reviewingLabel` becomes the plural key `header.reviewing` (`{count}`).
  - `THEME_LABELS` is removed, together with its export from `src/studio/features/dashboard/index.ts`; `ThemeToggle` reads `theme.group` (en `Theme`), `theme.system` (`System theme`), `theme.light` (`Light theme`), `theme.dark` (`Dark theme`). English output is unchanged, so Task 16's tests stay as written.
  - `IframeViewer`'s status pill gets `data-testid="connection-status"` and `data-status={connectionStatus}`; in English its text stays `ACTIVE`/`CONNECTING` (keys `viewer.status_connected`, `viewer.status_connecting`), in Arabic it is translated. E2E written from here on waits on `connection-status` having `data-status="connected"`.
  - `SetupProblems` renders `t('setup.manifest_missing')` for a problem `=== STATIC_MANIFEST_MISSING`; any other problem renders as given (server text).
  - `StudioLayout`'s Keys toggle reads `t('layout.keys')`; `app.tsx` passes `sideLabel` as `t('layout.review')` or `t('layout.editor')`.

- [ ] **Step 1: Write the failing tests**

```ts
// header-review.test.tsx (renderArabicHeader = renderHeader inside the Arabic provider)
it.each([1, 2, 11])('shows the Arabic review chip for %i changes', (n) => {
  renderArabicHeader({ reviewCount: n });
  expect(screen.getByTestId('review-chip').textContent).toBe(textFor('ar')('header.reviewing', { count: n }));
});
it('isolates the locale code in the Arabic chip', () => {
  renderArabicHeader({ targetLocale: { locale: 'pt-BR', source: 'url', mismatch: null } });
  expect(screen.getByTestId('target-locale').textContent).toContain('\u2068pt-BR\u2069');
});
// theme-toggle.test.tsx
it('names the theme controls in Arabic', () => {
  render(<StudioLanguageProvider initial="ar"><ThemeToggle choice="light" onChange={() => {}} /></StudioLanguageProvider>);
  expect(screen.getByRole('group', { name: textFor('ar')('theme.group') })).toBeTruthy();
  expect(screen.getByRole('button', { name: textFor('ar')('theme.light') }).getAttribute('aria-pressed')).toBe('true');
});
// studio-connection-help.test.tsx
it('marks the connection status for tests in any language', () => {
  // render IframeViewer with connectionStatus 'connected' inside the Arabic provider
  expect(screen.getByTestId('connection-status').getAttribute('data-status')).toBe('connected');
});
it('shows the missing-manifest problem in Arabic and a server problem as given', () => {
  render(<StudioLanguageProvider initial="ar"><SetupProblems problems={[STATIC_MANIFEST_MISSING, 'Server: locales folder missing']} /></StudioLanguageProvider>);
  expect(screen.getByText(textFor('ar')('setup.manifest_missing'))).toBeTruthy();
  expect(screen.getByText('Server: locales folder missing')).toBeTruthy();
});
// studio-layout.test.tsx
it('labels the Keys toggle in Arabic', () => {
  renderLayout({ isWide: false }, 'ar');
  expect(screen.getByTestId('studio-toggle-keys').textContent).toBe(textFor('ar')('layout.keys'));
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/header-review.test.tsx tests/unit/studio-layout.test.tsx tests/unit/studio-connection-help.test.tsx tests/unit/theme-toggle.test.tsx` — FAIL on the Arabic cases and the missing `connection-status` test id.
- [ ] **Step 3: Move** every user-visible string of the listed files (text, `title`, `aria-label`, `placeholder`) into the catalogue, English verbatim, with Arabic.
- [ ] **Step 4: Run.** The same command plus `tests/unit/studio-i18n.test.ts tests/unit/studio-theme.test.ts` — PASS.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit
git commit -m "feat(studio): show the header, settings, keys list and preview in Arabic"
```

---

### Task 22: Editor side and hook messages in Arabic

**Files:**

- Modify: `components/{EditorPanel,TranslationEditor,PluralEditor,LocaleRow,LocaleManager,LocalePicker,ConfirmModal,TokenModal}.tsx`, `hooks/{useSelection,useLocaleActions,useGit,useStudio,useConnection}.ts`, `hooks/draftActions.ts`, `i18n/en.ts`, `i18n/ar.ts` (areas `editor`, `plural`, `locales`, `picker`, `confirm`, `token`, `errors`)
- Test: `tests/unit/translation-editor.test.tsx`, `tests/unit/plural-editor.test.tsx`, `tests/unit/locale-picker.test.tsx`, `tests/unit/studio-locale-hooks.test.tsx`, `tests/unit/studio-draft-actions.test.ts`

**Interfaces:**

- Consumes: `useStudioText`, `StudioLanguageProvider`, `textFor` (Tasks 17–18).
- Produces:
  - Pure helpers that take deps receive `t: StudioText` in their deps object (`DraftActionDeps.t`, `useLocaleActions({ …, t })`, `useSelection({ …, t })`), defaulting to English; React hooks call `useStudioText()` themselves.
  - Every `err.message || '<fallback>'` keeps `err.message` as written; only the fallback goes through `t`: `errors.undo_failed`, `errors.save_failed`, `errors.add_locale_failed`, `errors.rename_locale_failed`, `errors.delete_locale_failed`, `errors.git_status_failed`, `errors.commit_failed`, `errors.discard_failed`, `errors.locale_unknown`, `errors.client_error`, `errors.backup_share_only`.
  - `PluralEditor` category names (`zero` … `other`) stay ICU keywords with `dir="ltr"`; their descriptions are translated (`plural.desc_one`, …).

- [ ] **Step 1: Write the failing tests**

```ts
// studio-draft-actions.test.ts
it('uses the Arabic fallback only when the error has no message', async () => {
  const deps = makeDeps({ t: textFor('ar'), undoDraft: () => Promise.reject(new Error('')) });
  await undo(deps, draft);
  expect(deps.setError).toHaveBeenLastCalledWith(textFor('ar')('errors.undo_failed'));
  const deps2 = makeDeps({
    t: textFor('ar'),
    undoDraft: () => Promise.reject(new Error('Server: file locked')),
  });
  await undo(deps2, draft);
  expect(deps2.setError).toHaveBeenLastCalledWith('Server: file locked');
});
// studio-locale-hooks.test.tsx — existing useLocaleActions harness (makeParams, jsonResponse)
it('reports a failed add-locale in Arabic when the server gives no message', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('')); // a 500 body without `error` still has a message ("Server responded with status 500")
  const params = makeParams({ t: textFor('ar') });
  const { result } = renderHook(() => useLocaleActions(params));
  await act(async () => {
    await result.current.handleAddLocale('de');
  });
  expect(params.setError).toHaveBeenLastCalledWith(textFor('ar')('errors.add_locale_failed'));
});
// translation-editor / plural-editor / locale-picker: one Arabic render each
it('labels the editor in Arabic', () => {
  renderEditor({}, 'ar');
  expect(screen.getByRole('button', { name: textFor('ar')('editor.save') })).toBeTruthy();
});
it('keeps the ICU category names left-to-right in Arabic', () => {
  renderPlural({}, 'ar');
  expect(screen.getByText('few').closest('[dir]')?.getAttribute('dir')).toBe('ltr');
});
it('titles the locale picker in Arabic', () => {
  renderPicker({}, 'ar');
  expect(screen.getByRole('dialog', { name: textFor('ar')('picker.title') })).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-draft-actions.test.ts tests/unit/studio-locale-hooks.test.tsx tests/unit/translation-editor.test.tsx tests/unit/plural-editor.test.tsx tests/unit/locale-picker.test.tsx` — FAIL on the Arabic cases.
- [ ] **Step 3: Move** the copy and fallbacks into the catalogue as pinned above, with Arabic.
- [ ] **Step 4: Run.** The same command plus `tests/unit/studio-i18n.test.ts tests/unit/studio-hooks.test.tsx` — PASS.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit
git commit -m "feat(studio): show the editor and its messages in Arabic"
```

---

### Task 23: Changes, Review, import and GitHub issue copy in Arabic

**Files:**

- Modify: `components/{ChangesPanel,DraftList,ReviewPanel,RepoPrompt,GitHubIssueAction,ImportChangeDialog}.tsx`, `hooks/useReview.ts`, `src/studio/share/review.ts`, `i18n/en.ts`, `i18n/ar.ts` (areas `changes`, `draft_list`, `review`, `repo`, `issue`, `import`)
- Test: `tests/unit/changes-panel.test.tsx`, `tests/unit/draft-list.test.tsx`, `tests/unit/review-panel.test.tsx`, `tests/unit/share-review.test.ts`, `tests/unit/github-issue-action.test.tsx`, `tests/unit/import-change-dialog.test.tsx`, `tests/unit/studio-review.test.tsx`

**Interfaces:**

- Consumes: `describeLinkError(err, t)` (Task 20); `useStudioText`, `textFor` (Tasks 17–18).
- Produces:

  ```ts
  // share/review.ts: REVIEW_STATUS_LABELS (English map) becomes
  export const REVIEW_STATUS_KEYS: Readonly<Record<EditStatus, StringKey>>;
  // review.status_apply, review.status_already, review.status_conflict, review.status_invalid, review.status_needs_force
  export function buildReviewRows(input: { …as today; t?: StudioText }): ReviewRow[]; // t defaults to englishText
  ```

  - `checksFor` translates only its wrapper (`review.saved_anyway` = `Saved with “Save anyway”.`); `edit.message` and `FLAG_MESSAGES[flag]` stay English.
  - `issueTitle`, `PASTE_HERE_BODY` and `applyCommandFor` output stay English. The `ReviewPanel` hint `Issues turned off? Actions → LiveLocale → Run workflow, then paste the link.` is translated with `{path}` = `Actions → LiveLocale → Run workflow` as a param, so the GitHub menu path stays English and isolated.
  - `useReview`: `NO_LINK`, `FORCED_NOT_INCLUDED` and `sourceFailed` become `review.no_link`, `review.forced_not_included`, `review.source_failed` (`{locale}`); it passes `t` into `buildReviewRows` and `describeLinkError`.

- [ ] **Step 1: Write the failing tests**

```ts
// share-review.test.ts (existing fixture with one needs-force edit carrying a core message)
it('translates its own wrapper and keeps the core message English', () => {
  const [row] = buildReviewRows({ ...fixture, allowForce: false, t: textFor('ar') });
  expect(row.checks[0].message.startsWith(row.message!)).toBe(true);
  expect(row.checks[0].message.endsWith(textFor('ar')('review.saved_anyway'))).toBe(true);
});
it('maps every status to a catalogue key', () =>
  expect(Object.keys(REVIEW_STATUS_KEYS).sort()).toEqual([
    'already',
    'apply',
    'conflict',
    'invalid',
    'needs-force',
  ]));
// review-panel.test.tsx
it('shows status labels in Arabic and the apply command left-to-right', () => {
  renderPanel({}, 'ar');
  expect(screen.getAllByText(textFor('ar')('review.status_apply')).length).toBeGreaterThan(0);
  expect(
    screen
      .getByText(/npx livelocale apply/)
      .closest('[dir]')
      ?.getAttribute('dir')
  ).toBe('ltr');
});
// github-issue-action.test.tsx (existing harness, Arabic provider, captured opened URL)
it('labels the action in Arabic but files an English issue title', () => {
  expect(new URL(openedUrl).searchParams.get('title')).toBe('LiveLocale: 2 translation changes');
});
// import-change-dialog / changes-panel / draft-list: one Arabic render each
it('titles the import dialog in Arabic', () => {
  renderImport({}, 'ar');
  expect(screen.getByRole('dialog', { name: textFor('ar')('import.title') })).toBeTruthy();
});
it('points the change arrow to the left in Arabic', () => {
  renderDraftList({}, 'ar');
  expect(screen.getAllByText('←').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/share-review.test.ts tests/unit/review-panel.test.tsx tests/unit/github-issue-action.test.tsx tests/unit/import-change-dialog.test.tsx tests/unit/changes-panel.test.tsx tests/unit/draft-list.test.tsx tests/unit/studio-review.test.tsx` — FAIL on the new cases and the missing `REVIEW_STATUS_KEYS`.
- [ ] **Step 3: Move** the copy into the catalogue as pinned, with Arabic.
- [ ] **Step 4: Run.** The same command plus `tests/unit/studio-i18n.test.ts` — PASS.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit
git commit -m "feat(studio): show changes, review and import in Arabic"
```

---

### Task 24: Prove no English is left behind, end to end in both Studios

**Files:**

- Create: `tests/e2e/fixtures/share.ts` (`editKey`, moved out of `static-share.spec.ts`)
- Modify: `tests/e2e/static-share.spec.ts` (its inline Alt+Click, type and save sequences call `editKey`); only for strings the sweeps find: `src/studio/**`, `i18n/en.ts`, `i18n/ar.ts`
- Test: `tests/unit/studio-no-hardcoded-copy.test.ts` (new), `tests/e2e/studio-arabic.spec.ts` (new)

**Interfaces:**

- Consumes: `findHardcodedText` with `{ templates: true }`, `parseAllowFile`, `isUserText`, `normalizeText` (Tasks 1, 4) with the repo's own `typescript`; `isMostlyLatin(value, allow)` (Task 2); `studioFiles` (Task 12); `STUDIO_LANGUAGE_KEY` (Task 9); `loadedFaces` (Task 11, `tests/e2e/fixtures/fonts.ts`); `watchDark`, `seen` (Task 16, `tests/e2e/fixtures/theme.ts`); ids `studio-language-toggle`, `studio-tips-start`, `studio-tips-title`, `studio-send-button`, `studio-send-title`, `studio-changes-button`, `studio-translation-input`, `studio-save-button`; test ids `studio-root`, `connection-status`, `studio-drawer-keys`, `studio-toggle-keys`, `studio-drawer-side`, `studio-toggle-side`, `keys-directory`, `changes-panel`, `save-success`.
- Produces: two sweeps, which every later Studio task must keep green, and one E2E helper.

  ```ts
  // tests/e2e/fixtures/share.ts
  /** Alt+Clicks [data-i18n-key="<key>"] in #app-preview-iframe, fills #studio-translation-input with `value`,
   *  clicks #studio-save-button and waits for [data-testid="save-success"]. */
  export async function editKey(page: Page, key: string, value: string): Promise<void>;
  ```

  - **JSX sweep**: `findHardcodedText(ts, source, file, parseAllowFile('LiveLocale\nlivelocale\nEnglish\n'), { templates: true })` over `studioFiles('src/studio', /\.tsx$/)`, dropping only the ICU category names (`zero`, `one`, `two`, `few`, `many`, `other`) found in `PluralEditor.tsx`. Nothing else is exempt (`PREVIEW` is the key `header.preview`). With `templates: true` it sees ``title={`${coveragePercentage}% of keys translated`}`` in `Header.tsx`.
  - **Literal sweep** (spec §6: "All user-visible Studio copy", including copy kept in constants and `.ts` hooks and shown on screens the E2E never opens: ReviewPanel, ImportChangeDialog, LocaleManager and LocaleRow errors, TokenModal, ConfirmModal, GitHubIssueAction, backup messages, error fallbacks): `copyLiterals(ts, source, file)` (in the test file) parses each `studioFiles('src/studio')` file outside `src/studio/i18n/` and returns every string literal, no-substitution template and template head/span text for which `isUserText(normalizeText(text), allow) && isMostlyLatin(text, allow)`, except literals that are: a JSX attribute initializer of `className`, `class`, `id`, `key`, `type`, `role`, `href`, `src` or a `data-*` attribute; an argument of a call to `t`, `textFor(…)`, `require` or `console.*`; a module specifier; a property name; or inside the declaration of `issueTitle`, `PASTE_HERE_BODY`, `applyCommandFor` or `changeFileName` (written for the developer or the repository, Arabic shared rules). Any further exemption is an entry in `const EXEMPT: ReadonlyArray<readonly [file: string, text: string, reason: string]>` in the test, empty when this task lands.
  - **E2E**: on the Arabic idle, editor, changes, tips and send screens, every visible text node inside `studio-root` outside `[dir="ltr"]`, `[dir="auto"]`, `[aria-hidden="true"]` and the iframe must not be `isMostlyLatin` with the allow list `LiveLocale`, `livelocale`, `English`, `GitHub`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/studio-no-hardcoded-copy.test.ts
const allow = parseAllowFile('LiveLocale\nlivelocale\nEnglish\n');
it('keeps every user-visible JSX string in the catalogue', () => {
  const ICU = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((file) =>
    findHardcodedText(ts, readFileSync(file, 'utf8'), file, allow, { templates: true })
      .filter((f) => !(file.endsWith('/PluralEditor.tsx') && ICU.has(f.text)))
      .map((f) => `${file}:${f.line}: ${f.text}`)
  );
  expect(found).toEqual([]);
});
it('finds copy in constants and skips code, class strings and developer text', () => {
  const source = [
    `const NO_LINK = 'Paste a change link first.';`,
    'const issueTitle = (n: number) => `LiveLocale: ${n} translation changes`;',
    `<p className="text-fg px-2" data-testid="x-y">{t('tips.title')}</p>;`,
    `console.warn('Something odd happened');`,
  ].join('\n');
  expect(copyLiterals(ts, source, 'x.tsx').map((l) => l.text)).toEqual([
    'Paste a change link first.',
  ]);
});
it('keeps every user-visible string literal in the catalogue', () => {
  const exempt = new Set(EXEMPT.map(([f, text]) => `${f}: ${text}`));
  const found = studioFiles('src/studio')
    .filter((f) => !f.startsWith('src/studio/i18n/'))
    .flatMap((file) =>
      copyLiterals(ts, readFileSync(file, 'utf8'), file).map((l) => `${file}: ${l.text}`)
    )
    .filter((hit) => !exempt.has(hit));
  expect(found).toEqual([]);
});
```

```ts
// tests/e2e/studio-arabic.spec.ts — the walker is the decision; the tests below use it
const LATIN_OK = parseAllowFile('LiveLocale\nlivelocale\nEnglish\nGitHub\n');
/** Visible text nodes inside studio-root that are not code-like (dir="ltr") or translator values (dir="auto"). */
const visibleCopy = (page: Page) =>
  page.getByTestId('studio-root').evaluate((el) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement!;
      const text = n.textContent!.trim();
      if (!text || parent.closest('[dir="ltr"], [dir="auto"], iframe, [aria-hidden="true"]'))
        continue;
      const box = parent.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || getComputedStyle(parent).visibility === 'hidden')
        continue;
      out.push(text);
    }
    return out;
  });
const expectNoEnglish = async (page: Page, screen: string) =>
  expect(
    (await visibleCopy(page)).filter((t) => isMostlyLatin(t, LATIN_OK)),
    screen
  ).toEqual([]);
const arabicFaces = (page: Page) =>
  loadedFaces(page).then((f) =>
    f.filter((n) => n === 'IBM Plex Sans Arabic' || n === 'Readex Pro')
  );
```

Tests, each waiting for `connection-status` `data-status="connected"` (90 s on 3010, 30 s on 3020) after `goto`:

| Describe (`test.use`)                                                                  | Test                                                                                                                                  | Pinned assertion                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dev Studio (`locale: 'ar-EG'`)                                                         | `stays English for an Arabic browser until the person switches, then remembers Arabic`                                                | `studio-root` `dir` is `ltr`; after `#studio-language-toggle`: `rtl`, `lang="ar"`, `documentElement.dir` `rtl`; still `rtl` after a reload; the toggle again gives `ltr`                                                                                                                                                                                     |
| dev Studio (`locale: 'ar-EG'`)                                                         | `opens the keys drawer on the right and the editor drawer on the left in Arabic` (1024x768)                                           | keys drawer `x + width > 1016`; side drawer `x < 8`; `scrollWidth <= innerWidth` after each                                                                                                                                                                                                                                                                  |
| dev Studio (`locale: 'ar-EG'`)                                                         | `shows no English copy on the idle, editor and changes screens in Arabic` (1440x900, `STUDIO_LANGUAGE_KEY` = `ar` by `addInitScript`) | `expectNoEnglish` on `idle`; on `editor` after picking `home.welcome_msg` from `keys-directory`; on `changes` with `changes-panel` open                                                                                                                                                                                                                      |
| share Studio, Arabic browser (`locale: 'ar-EG'`)                                       | `starts in Arabic and sends a change in Arabic`                                                                                       | `dir="rtl"`; `#studio-tips-title` = `مرحبًا بك في LiveLocale`; after `document.fonts.ready`, `arabicFaces(page)` = `['IBM Plex Sans Arabic', 'Readex Pro']`; `expectNoEnglish` on `tips`; `#studio-tips-start`, `editKey(page, 'home.welcome_msg', 'مرحبا')`, `#studio-send-button`; `#studio-send-title` = `إرسال إلى المطوّر`; `expectNoEnglish` on `send` |
| share Studio, Arabic browser, light system (`locale: 'ar-EG'`, `colorScheme: 'light'`) | `starts light and in Arabic on a first visit from an Arabic browser` (Review Focus 5)                                                 | `watchDark(page)` before `goto`; `dir="rtl"`; no `dark` class and `seen(page, '__sawDark')` is `false`; `#studio-tips-title` in Arabic; `arabicFaces(page)` contains `'IBM Plex Sans Arabic'`                                                                                                                                                                |
| share Studio, English browser (`locale: 'en-US'`)                                      | `starts in English`                                                                                                                   | `studio-root` `dir="ltr"`                                                                                                                                                                                                                                                                                                                                    |

- [ ] **Step 2: Run the sweeps.** `npx vitest run tests/unit/studio-no-hardcoded-copy.test.ts` — the self-check passes; the two Studio sweeps FAIL only on strings Tasks 20–23 missed. If the JSX sweep already passes, temporarily add `<span>Oops</span>` to `EmptySelection.tsx`, confirm the failure names that file and line, and remove it.
- [ ] **Step 3: Move** every reported string into the catalogue, with Arabic; a reported string that really is developer or repository text goes into `EXEMPT` with its reason. Extract `editKey` into `tests/e2e/fixtures/share.ts` and use it in `static-share.spec.ts`. Text the E2E `expectNoEnglish` reports is either catalogue copy still missing (move it) or code-like text without `dir="ltr"` (add the marker, per the Arabic shared rules); server or core messages never appear on these screens.
- [ ] **Step 4: Run everything.** `npx vitest run`, then `npm run build` and `npx playwright test tests/e2e/studio-arabic.spec.ts tests/e2e/static-share.spec.ts tests/e2e/responsive-layout.spec.ts tests/e2e/theme.spec.ts tests/e2e/brand.spec.ts` — all pass (6 in studio-arabic).
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-no-hardcoded-copy.test.ts tests/e2e/studio-arabic.spec.ts tests/e2e/fixtures/share.ts tests/e2e/static-share.spec.ts
git commit -m "test(studio): check that every Studio string is translated, in both Studios"
```

- [ ] **Step 6: Owner copy review (handoff).** Give the owner `src/studio/i18n/ar.ts` beside `src/studio/i18n/en.ts`, tips and Send keys first. Apply their edits in `fix(studio): apply the owner's Arabic copy review`. Task 32 stays blocked until they approve; the Task 31 `next` prerelease does not wait (Owner flag 5). (Accessibility tasks may proceed meanwhile; their new keys join the same review.)

---

### Accessibility tasks: shared rules (Tasks 25–29)

- They run on the final UI: brand tokens, both themes, both languages. Every new accessible name or announcement is a catalogue key with an Arabic entry (the Task 24 sweep and the Task 17 completeness test enforce it); the English values pinned below are what tests query, since tests render outside a provider (English).
- Focus is drawn only by the global `:focus-visible` rule (Task 25); components never set `focus:` outline, ring or border utilities.
- Colours stay inside the Task 10 table: a fix that needs a different colour picks another token of the right role (Task 12 map); a token value moves only with its `TOKENS` row and keeps `studio-brand-tokens.test.ts` green.
- E2E waits on `connection-status` (`data-status="connected"`, Task 21) and reaches controls by id or test id, never by English text or English accessible names, so the Arabic variants work (key paths such as `home.welcome_msg` are code, not copy, and may be matched). Unit tests render outside a provider and may query English names.

---

### Task 25: One visible focus ring for every control

**Files:**

- Modify: `src/studio/index.css` (base-layer `:focus-visible` rule)
- Modify: every `src/studio/**/*.tsx` with ad-hoc focus classes (today `ChangesPanel`, `EditorPanel`, `FirstRunTips`, `ImportChangeDialog`, `KeysDirectory`, `LocaleManager`, `LocaleRow`, `PluralEditor`, `RepoPrompt`, `SendDialog`, plus the `focus:ring-focus`/`focus:border-focus` classes Tasks 12–14 mapped; the test is the authority)
- Create: `tests/e2e/a11y-keyboard.spec.ts`
- Test: `tests/unit/studio-focus-ring.test.ts` (new)

**Interfaces:**

- Consumes: the `focus` token (Task 10: light `#B23A1E`, dark `#FF7A5C`, already 3:1 on every surface by `studio-brand-tokens.test.ts`); `studioFiles` (Task 12); `STUDIO_THEME_KEY` (Task 9); `connection-status` (Task 21).
- Produces: `@layer base { :focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; } .overflow-y-auto :focus-visible, .overflow-auto :focus-visible { outline-offset: -2px; } }` (inside a scroll container an outside ring is clipped by the container's edge, so rows of the key list, drawers and dialogs draw it inset); no component sets its own focus style from here on.

- [ ] **Step 1: Write the failing tests**

```ts
const css = readFileSync('src/studio/index.css', 'utf8');
const AD_HOC =
  /(?<![\w-])(?:focus:outline-(?:hidden|none)|focus:ring-[\w/.[\]#-]+|focus:border-[\w/.[\]#-]+|outline-none|outline-hidden)(?![\w-])/g;

it('draws a 2px ring in the focus colour on :focus-visible', () =>
  expect(css).toMatch(
    /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\);[^}]*outline-offset:\s*2px;/
  ));

it('draws the ring inset inside scroll containers, where an outside ring is clipped', () =>
  expect(css).toMatch(/\.overflow-y-auto :focus-visible[^{]*\{[^}]*outline-offset:\s*-2px;/));

it('leaves no ad-hoc focus classes in Studio components', () => {
  const hits = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(AD_HOC)].map((m) => `${f}: ${m[0]}`)
  );
  expect(hits).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-focus-ring.test.ts` — FAIL: no `:focus-visible` rule; the ad-hoc list is non-empty (e.g. `ChangesPanel.tsx: focus:outline-hidden`, `EditorPanel.tsx: focus:ring-focus`).
- [ ] **Step 3: Implement** the base-layer rule.
- [ ] **Step 4: Remove every ad-hoc focus class** the test lists; hover and other classes stay.
- [ ] **Step 5: Run.** `npx vitest run tests/unit/studio-focus-ring.test.ts tests/unit/studio-colour-guard.test.ts tests/unit/studio-brand-tokens.test.ts` — PASS.
- [ ] **Step 6: Add the E2E focus check** in `tests/e2e/a11y-keyboard.spec.ts`, `test.describe('Studio keyboard access')`. The ring colour is the brand's `focus` token: dark `rgb(255, 122, 92)`, light `rgb(178, 58, 30)`.

```ts
const tabStops = async (page: Page, n: number) => {
  const seen: { tag: string; outline: string; width: string; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        outline: cs.outlineStyle,
        width: cs.outlineWidth,
        color: cs.outlineColor,
      };
    });
    if (s.tag !== 'IFRAME' && s.tag !== 'BODY') seen.push(s);
  }
  return seen;
};
for (const [theme, color] of [
  ['dark', 'rgb(255, 122, 92)'],
  ['light', 'rgb(178, 58, 30)'],
] as const) {
  test(`shows a 2px solid brand focus ring on the first eight Tab stops in ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STUDIO_THEME_KEY, theme]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3010');
    await expect(page.getByTestId('connection-status')).toHaveAttribute(
      'data-status',
      'connected',
      {
        timeout: 90_000,
      }
    );
    for (const s of await tabStops(page, 8))
      expect(s).toMatchObject({ outline: 'solid', width: '2px', color });
  });
}
```

- [ ] **Step 7: Run the E2E.** `npm run build`, then `npx playwright test tests/e2e/a11y-keyboard.spec.ts tests/e2e/theme.spec.ts` — all pass (2 in a11y-keyboard).
- [ ] **Step 8: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-focus-ring.test.ts tests/e2e/a11y-keyboard.spec.ts
git commit -m "feat(studio): one visible brand focus ring for every control"
```

---

### Task 26: An accessible name for every control

**Files:**

- Create: `tests/unit/helpers/a11y.ts`
- Modify: `components/{KeysDirectory,EditorPanel,LocaleManager,LocaleRow,ChangesPanel,IframeViewer,TranslationEditor,SendDialog,GitHubIssueAction}.tsx` and any other component the test reports; `i18n/en.ts`, `i18n/ar.ts`
- Test: `tests/unit/studio-accessible-names.test.tsx` (new)

**Interfaces:**

- Consumes: `useStudioText` (Task 18).
- Produces:
  - `tests/unit/helpers/a11y.ts` exports `unnamedControls` and `renderFixture`:
  - `export const FIXTURES: Record<FixtureName, () => React.ReactElement>` and `export function renderFixture(name: FixtureName): HTMLElement` (renders `FIXTURES[name]()` with Testing Library and returns `container`), `FixtureName` = `'DraftList' | 'ReviewPanel' | 'PluralEditor' | 'FirstRunTips' | 'ImportChangeDialog' | 'LocalePicker' | 'TokenModal' | 'RepoPrompt' | 'Header' | 'LanguageToggle' | 'ThemeToggle'`. Each entry renders the component open, with the smallest props its existing test file uses (copy the values; do not import across test files): `DraftList` with two drafts, `ReviewPanel` with one `apply` row, `PluralEditor` with `{count, plural, one {# item} other {# items}}`, `LocalePicker` with candidates `['en', 'ar']`, `TokenModal` with `isOpen`, `ThemeToggle` with `choice="dark"`.
  - `unnamedControls(root: HTMLElement): string[]` — one `<tag>#<id | data-testid | first 60 chars of outerHTML>` per control (`button`, `a[href]`, `input:not([type=hidden])`, `select`, `textarea`, `[role=button]`) without a programmatic name. Named = non-empty `aria-label`; `aria-labelledby` targets with text; an associated `<label>` with text (`el.labels`); or, for buttons and links, text outside `svg`. `title` and `placeholder` do not count.
  - Ids used later: `studio-locale-select`, `studio-new-locale`, `studio-commit-message` (existing), `studio-send-link` (existing).
  - **Pinned names** (catalogue key → English). `Manage Languages`, `Back to Editor`, `Add New Locale` and `Reload Frame` are today's titles and label text, reused verbatim (Owner flag 6); every other name is new copy, in sentence case:

    | Control                              | Technique                                                                 | Key → name                                                                                                         |
    | ------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
    | KeysDirectory search                 | `aria-label`                                                              | `keys.search_label` → `Search keys or values`                                                                      |
    | EditorPanel locale select            | `<label htmlFor="studio-locale-select">` + `id`                           | `editor.locale_label` → `Locale`                                                                                   |
    | EditorPanel manage toggle            | `aria-label` = its current title key                                      | `Manage Languages` / `Back to Editor`                                                                              |
    | TranslationEditor textarea           | `aria-label`                                                              | `editor.translation_label` → `Translation`                                                                         |
    | LocaleManager input                  | `<label htmlFor="studio-new-locale">` + `id`                              | `locales.new_label` → `Add New Locale`                                                                             |
    | LocaleRow rename / delete            | `aria-label`                                                              | `locales.rename_aria` → `Rename locale {code}` / `locales.delete_aria` → `Delete locale {code}`                    |
    | LocaleRow rename input, save, cancel | `aria-label`                                                              | `locales.new_code_aria` → `New code for {code}`, `locales.save_rename` → `Save rename`, `common.cancel` → `Cancel` |
    | ChangesPanel refresh / close         | `aria-label`                                                              | `changes.refresh` → `Refresh` / `changes.close` → `Close`                                                          |
    | ChangesPanel restore (history row)   | `aria-label`                                                              | `changes.restore_aria` → `Restore the previous value of {key}`                                                     |
    | ChangesPanel commit textarea         | `<label htmlFor="studio-commit-message">` (`sr-only` if no visible label) | `changes.commit_label` → `Commit message`                                                                          |
    | IframeViewer reload                  | `aria-label`                                                              | `viewer.reload` → `Reload Frame`                                                                                   |
    | SendDialog link input                | `aria-label`                                                              | `send.link_label` → `Change link`                                                                                  |
    | GitHubIssueAction manual copy        | `aria-label`                                                              | `issue.manual_copy_label` → `Issue text to copy`                                                                   |

  - Anything else the test reports: an icon-only button's `aria-label` reuses its existing title key (the `title` stays); a control repeated per row ends its name with that row's locale code or key. Icon `svg`s inside named buttons get `aria-hidden="true"`; every `<button>` without a `type` gets `type="button"` except form submits. When a key above already exists from Tasks 20–23 with the same English, reuse it.

- [ ] **Step 1: Write the failing test** in `tests/unit/studio-accessible-names.test.tsx`. Each test renders the component with the props its existing test file uses (copied), asserts `expect(unnamedControls(container)).toEqual([])`, then its pinned query:

| Test                                                                         | Render                                                                                      | Pinned query                                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `names every control in KeysDirectory`                                       | `filteredKeys={['home.title']}`                                                             | `getByRole('textbox', { name: 'Search keys or values' })`                                                   |
| `names the locale select and the manage toggle in EditorPanel`               | `editorProps`                                                                               | `combobox` `Locale`; `button` `Manage Languages`; `textbox` `Translation` has id `studio-translation-input` |
| `names the new-locale field and per-row locale actions with the locale code` | `LocaleManager` with `locales={['en', 'ar']}`                                               | `textbox` `Add New Locale`; `button` `Rename locale ar`; `button` `Delete locale ar`                        |
| `names the rename field, Save rename and Cancel while renaming`              | `LocaleRow` `code="ar"`, after clicking `Rename locale ar`                                  | `textbox` `New code for ar`; `button` `Save rename`; `button` `Cancel`                                      |
| `names Refresh, Close and the commit message in ChangesPanel`                | `renderPanel()` with one history entry                                                      | `button` `Refresh`; `button` `Close`; `textbox` `Commit message` has id `studio-commit-message`             |
| `names Reload Frame in IframeViewer`                                         | `viewerProps`                                                                               | `button` `Reload Frame`                                                                                     |
| `names every control in SendDialog once a link is shown`                     | `isOpen`, two drafts, `MANIFEST`, `STUDIO_URL`; `encodeChangeLink` → `'lc1.TOKEN'`          | `await findByRole('textbox', { name: 'Change link' })` has id `studio-send-link`                            |
| `names the manual-copy box in GitHubIssueAction`                             | `repo="acme/web"`, a 9 000-character token, `copyText` → `false`, click `Copy change block` | `findByTestId('manual-copy')` has `aria-label` `Issue text to copy`                                         |
| `names every control in %s` (`it.each(Object.keys(FIXTURES))`)               | `renderFixture(name)`                                                                       | `unnamedControls` only                                                                                      |

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-accessible-names.test.tsx` — FAIL; once the helper exists, the lists name the KeysDirectory search input, the EditorPanel `select`, the LocaleRow and ChangesPanel icon buttons.
- [ ] **Step 3: Implement** `unnamedControls`, `FIXTURES` and `renderFixture` in `tests/unit/helpers/a11y.ts`; the test file defines `draft(i)` as `send-dialog.test.tsx` does and imports `MANIFEST`, `STUDIO_URL` from `tests/unit/helpers/share-fixtures.ts`, and mocks `src/core/change-link.js` (`encodeChangeLink` → `'lc1.TOKEN'`) and `src/studio/share/browser.js` (`readPref` → `null`, `writePref`, `copyText` → `true`, `downloadText`) exactly as `send-dialog.test.tsx` does.
- [ ] **Step 4: Name the controls** per the table and rules, adding each key to `en.ts` and `ar.ts`.
- [ ] **Step 5: Run.** `npx vitest run tests/unit` — all pass (tests that query by `title` still work; titles are kept), including `studio-i18n` and `studio-no-hardcoded-copy`.
- [ ] **Step 6: Commit** (after the gate)

```bash
git add src/studio tests/unit/helpers/a11y.ts tests/unit/studio-accessible-names.test.tsx
git commit -m "feat(studio): give every control an accessible name"
```

---

### Task 27: Everything reachable by keyboard

**Files:**

- Modify: `components/ChangesPanel.tsx`, `components/StudioLayout.tsx`, `components/KeysDirectory.tsx`, `hooks/useDialog.ts` (export `FOCUSABLE_SELECTOR`), `src/studio/features/dashboard/constants.ts` (`TRANSLATION_INPUT_ID`), `src/studio/app.tsx` (keyboard pick → editor focus)
- Test: `tests/unit/studio-keyboard.test.tsx` (new), `tests/e2e/a11y-keyboard.spec.ts`

**Interfaces:**

- Consumes: `useDialog<T extends HTMLElement>(open: boolean, onEscape?: () => void): RefObject<T>` (`hooks/useDialog.ts`); `unnamedControls` (Task 26); `STUDIO_LANGUAGE_KEY` (Task 9); `#studio-language-toggle` (Task 18); `[data-theme-choice]` (Task 16).
- Produces:
  - `ChangesPanel` is a modal dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="studio-changes-title"` on the `aside`; `id="studio-changes-title"` on its `h2`. It calls `useDialog<HTMLElement>(isOpen, onClose)` before the `if (!isOpen) return null` early return; the backdrop stays mouse-only.
  - `export const FOCUSABLE_SELECTOR` from `useDialog.ts` (today's `FOCUSABLE`).
  - `KeysDirectory` prop `onKeyActivatedByKeyboard?: (key: string) => void`, called after `selectKeyDirectly(key)` when `event.detail === 0`. Scope buttons get `aria-pressed`; the active key button `aria-current="true"`; the search input gets `id="studio-keys-search"` (E2E reaches it by id in either language).
  - `export const TRANSLATION_INPUT_ID = 'studio-translation-input'` in `constants.ts`. `app.tsx` focuses it (else the first input in `[data-testid="editor-panel"]`) after `requestAnimationFrame`, opening the side drawer first in compact mode.
  - `StudioLayout`: opening a drawer **through its toggle** focuses the first `FOCUSABLE_SELECTOR` match inside it; Escape returns focus to that toggle; a drawer opened by `onOpenPanelChange` from outside (Alt+Click) never moves focus.

- [ ] **Step 1: Write the failing unit tests**

```tsx
it('ChangesPanel is a labelled modal that focuses its first control and closes on Escape', () => {
  const props = renderPanel();
  const dialog = screen.getByRole('dialog', { name: 'Changes' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(props.onClose).toHaveBeenCalledTimes(1);
});
it('moves focus into the Keys drawer when its toggle opens it, and back to the toggle on Escape', () => {
  // compact StudioLayout harness with useState<StudioPanel>, keys slot = <input aria-label="k" />
  fireEvent.click(screen.getByTestId('studio-toggle-keys'));
  expect(document.activeElement).toBe(screen.getByLabelText('k'));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByTestId('studio-drawer-keys').hidden).toBe(true);
  expect(document.activeElement).toBe(screen.getByTestId('studio-toggle-keys'));
});
it('does not move focus when a drawer opens without its toggle', () => {
  // harness sets openPanel='side' programmatically, as an Alt+Click pick does
  expect(document.activeElement).toBe(document.body);
});
it('marks the scope buttons pressed and the active key current', () => {
  render(
    <KeysDirectory
      {...keysProps}
      filterPageOnly={false}
      selected={{ key: 'a' } as any}
      filteredKeys={['a', 'b']}
    />
  );
  expect(screen.getByRole('button', { name: 'All Keys' }).getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(screen.getByRole('button', { name: 'Page Keys' }).getAttribute('aria-pressed')).toBe(
    'false'
  );
  expect(screen.getByRole('button', { name: /^a/ }).getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('button', { name: /^b/ }).hasAttribute('aria-current')).toBe(false);
});
it('reports a keyboard pick but not a mouse pick', () => {
  const onKeyboard = vi.fn();
  render(
    <KeysDirectory {...keysProps} filteredKeys={['a']} onKeyActivatedByKeyboard={onKeyboard} />
  );
  fireEvent.click(screen.getByRole('button', { name: /^a/ }), { detail: 1 });
  expect(onKeyboard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^a/ }), { detail: 0 });
  expect(onKeyboard).toHaveBeenCalledWith('a');
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-keyboard.test.tsx` — FAIL: no dialog role, focus does not move, no `aria-pressed`/`aria-current`/`onKeyActivatedByKeyboard`.
- [ ] **Step 3: Implement** the Produces block.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/studio-keyboard.test.tsx tests/unit/studio-layout.test.tsx tests/unit/changes-panel.test.tsx tests/unit/studio-dialogs-keyboard.test.tsx` — PASS.
- [ ] **Step 5: Add the E2E journeys** to `tests/e2e/a11y-keyboard.spec.ts`. Controls are reached by id, test id or key path only (Accessibility shared rules).

```ts
const connected = (page: Page) =>
  expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 90_000,
  });
const changesDialog = (page: Page) =>
  page.locator('[role="dialog"][aria-labelledby="studio-changes-title"]');

test.describe('keyboard journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3010');
    await connected(page);
  });
  test('picks a key from the list and lands in the editor by keyboard', async ({ page }) => {
    await page.locator('#studio-keys-search').focus();
    await page.keyboard.type('home.welcome_msg');
    const row = page.locator('[data-testid="keys-directory"] .overflow-y-auto > button').first();
    await row.focus();
    // Task 25: inside the scrolling list the ring is drawn inset, so it is never clipped
    expect(await row.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe('-2px');
    await page.keyboard.press('Enter');
    await expect(page.locator('#studio-translation-input')).toBeFocused();
  });
  test('opens and closes Changes by keyboard', async ({ page }) => {
    await page.locator('#studio-changes-button').focus();
    await page.keyboard.press('Enter');
    await expect(changesDialog(page)).toBeVisible();
    expect(await changesDialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(
      true
    );
    await page.keyboard.press('Escape');
    await expect(changesDialog(page)).toBeHidden();
    await expect(page.locator('#studio-changes-button')).toBeFocused();
  });
  test('opens the Keys drawer by keyboard at 1024x768 and returns focus on Escape', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 }); // below 1280, the compact layout with drawers
    await page.getByTestId('studio-toggle-keys').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#studio-keys-search')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('studio-drawer-keys')).toBeHidden();
    await expect(page.getByTestId('studio-toggle-keys')).toBeFocused();
  });
});

// Review Focus 4 (outside the describe: the language is set before the first goto)
test('reaches the language and theme controls by keyboard in Arabic', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'ar'), STUDIO_LANGUAGE_KEY);
  await page.goto('http://localhost:3010');
  await connected(page);
  await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'rtl');
  const ring = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
  await page.locator('#studio-language-toggle').focus();
  expect(await ring()).toBe('solid 2px');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-theme-choice="system"]')).toBeFocused();
  expect(await ring()).toBe('solid 2px');
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-theme-choice="light"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-theme-choice="light"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
    false
  );
  await page.locator('#studio-language-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('studio-root')).toHaveAttribute('dir', 'ltr');
});
```

- [ ] **Step 6: Run the E2E.** `npm run build`, then `npx playwright test tests/e2e/a11y-keyboard.spec.ts tests/e2e/responsive-layout.spec.ts` — all pass (6 in a11y-keyboard).
- [ ] **Step 7: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-keyboard.test.tsx tests/e2e/a11y-keyboard.spec.ts
git commit -m "feat(studio): reach the changes dialog, drawers, settings and editor by keyboard"
```

---

### Task 28: Announce saves, sends and errors

**Files:**

- Modify: `components/{TranslationEditor,ChangesPanel,LocaleManager,LocaleRow,SendDialog,GitHubIssueAction,RepoPrompt}.tsx`, `i18n/en.ts`, `i18n/ar.ts` (`editor.saved_status`)
- Test: `tests/unit/studio-live-regions.test.tsx` (new)

**Interfaces:**

- Consumes: the fixtures of the existing component tests (copied, not imported: `renderPanel` from `changes-panel.test.tsx`, `editorProps` from `translation-editor.test.tsx`, `draft`/`renderDialog` and the `change-link.js`/`share/browser.js` mocks from `send-dialog.test.tsx`); the accessible names of Task 26; `useStudioText` (Task 18).
- Produces:
  - Rule: every error message the Studio renders carries `role="alert"`; every success or progress message `role="status"`.
  - `role="alert"`: `TranslationEditor` error and `saveWarning` boxes; `ChangesPanel` `gitError`; `LocaleManager` error; `LocaleRow` `localError` (both places); `SendDialog` `encodeError`, `actionError`, `COPY_FAILED`; `RepoPrompt` `MALFORMED`. `role="status"`: `ChangesPanel` `lastCommit`; `SendDialog` `TOO_LONG`; `GitHubIssueAction` `TOO_LARGE`.
  - The editor's save status is an always-mounted `<p role="status" className="sr-only" data-testid="save-status">` reading `t('editor.saved_status')` (en `Saved`) while `isSuccess`, empty otherwise. The visible "Saved!" in the button stays.

- [ ] **Step 1: Write the failing test** in `tests/unit/studio-live-regions.test.tsx` (fixtures and mocks copied as listed under Consumes; `cleanup()` between the two renders of one test):

| Test                                                                                | Setup                                                                                                                                                | Pinned assertion                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keeps the save status mounted and fills it on success`                             | `TranslationEditor` with `isSuccess={false}`, then rerendered with `isSuccess`                                                                       | `save-status` has `role="status"` and text `''`, then `Saved`                                                                                                |
| `announces a save error and a save warning as alerts`                               | `error="Disk is read-only"`, `saveWarning={{ message: 'Placeholder {name} is missing' }}`                                                            | the `alert` texts contain both messages                                                                                                                      |
| `announces the commit result as status and a git error as alert`                    | `renderPanel({ lastCommit: 'abc1234' })`; `renderPanel({ gitError: 'Nothing to commit' })`                                                           | `status` contains `Committed as abc1234`; `alert` is `Nothing to commit`                                                                                     |
| `announces a locale manager error as an alert`                                      | `LocaleManager` with `error='Locale "de" already exists.'`                                                                                           | `alert` contains `Locale "de" already exists.`                                                                                                               |
| `announces a rename error and a delete error in a locale row as alerts`             | `LocaleRow` `code="ar"`; rename to `not valid!` and Save rename; Cancel; Delete locale ar → Delete with `onDelete` rejecting `Locale file is locked` | `alert` is `Invalid locale format.`, then (found) `Locale file is locked`                                                                                    |
| `announces a SendDialog encode error as an alert and the too-long notice as status` | `encode` rejects `new ChangeLinkError('TOO_LARGE', 'too large')`; then resolves `'lc1.' + 'A'.repeat(6000)`                                          | found `alert` matches `/^Could not create the link:/`; the text `/too long for a chat message/` sits inside `[role="status"]`                                |
| `announces a SendDialog copy failure and a mark-sent failure as alerts`             | `copyText` → `false`, click `#studio-send-copy`; then `onMarkSent` rejects `Draft store is full`, click `#studio-send-copy`                          | found `alert` contains `Copy did not work in this browser`; then is `Draft store is full`                                                                    |
| `announces GitHubIssueAction too-large as status and RepoPrompt malformed as alert` | `GitHubIssueAction` with a 70 000-character token; `RepoPrompt` submitted with `not a repo`                                                          | `status` is `Too large for a GitHub issue. Run npx livelocale apply with this link instead.`; `alert` is `Enter it as owner/repo, for example acme/website.` |

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-live-regions.test.tsx` — FAIL: no `save-status`, `getByRole('alert')` finds nothing.
- [ ] **Step 3: Add the regions** listed above.
- [ ] **Step 4: Run.** `npx vitest run tests/unit` — PASS; existing `getByRole('status')` queries in SendDialog and DraftList tests still find exactly one match per state.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-live-regions.test.tsx
git commit -m "feat(studio): announce saves, sends and errors to screen readers"
```

---

### Task 29: AA contrast in real use and an axe gate in the E2E suite

The token pairs are AA by construction (Task 10). This task checks how components use them, then runs axe on every main screen in both themes and both languages.

**Files:**

- Modify: `package.json`, `package-lock.json` (devDependencies `"@axe-core/playwright": "^4.10.2"`, `"axe-core": "^4.10.2"`), components the guards and the axe run report; `src/studio/index.css` and `tests/unit/helpers/studio-tokens.ts` only if a token value must move (together)
- Create: `tests/e2e/fixtures/axe.ts`, `tests/e2e/a11y-axe.spec.ts`
- Test: `tests/unit/studio-contrast-use.test.ts` (new)

**Interfaces:**

- Consumes: `studioFiles` (Task 12); `classLiterals` (Task 19); `editKey` (Task 24); `TOKENS` and the contrast tests (Task 10); `STUDIO_THEME_KEY`, `STUDIO_LANGUAGE_KEY` (Task 9); ids and test ids listed in Task 24.
- Produces: `seriousViolations(page: Page): Promise<string[]>` in `tests/e2e/fixtures/axe.ts` — runs `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#app-preview-iframe').analyze()`, keeps `serious`/`critical` impacts, returns `` `${v.id}: ${node.target.join(' ')}` `` per failing node, sorted.

- [ ] **Step 1: Write the failing usage tests**

```ts
// fg-faint stays below 4.5:1 on purpose; WCAG exempts only disabled controls and decoration.
it('uses fg-faint only for disabled states and aria-hidden decoration', () => {
  expect(faintMisuses('<p className="text-fg-faint">Hint</p>', 'x.tsx')).toEqual([
    'x.tsx:1: text-fg-faint',
  ]);
  expect(faintMisuses('<input className="placeholder-fg-faint" />', 'x.tsx')).toEqual([
    'x.tsx:1: placeholder-fg-faint',
  ]);
  expect(
    faintMisuses(
      '<button className="disabled:text-fg-faint" /><span aria-hidden="true" className="text-fg-faint">→</span>',
      'x.tsx'
    )
  ).toEqual([]);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    faintMisuses(readFileSync(f, 'utf8'), f)
  );
  expect(found).toEqual([]);
});
// An opacity suffix on a text token lowers the contrast Task 10 measured.
it('never fades a text colour token', () => {
  expect(fadedText('<p className="text-fg-muted/80 bg-surface/90">', 'x.tsx')).toEqual([
    'x.tsx:1: text-fg-muted/80',
  ]);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    fadedText(readFileSync(f, 'utf8'), f)
  );
  expect(found).toEqual([]);
});
```

`faintMisuses(source, file): string[]` (in the test file) takes the `className` literals from `classLiterals(ts, source, file)` (Task 19; those with an `element`), and reports `` `${file}:${line}: ${cls}` `` for each class matching `/(?<![\w-])((?:[\w-]+:)*)(?:text|placeholder)-fg-faint(?:\/\d+)?(?![\w-])/` unless its variant prefix contains `disabled:` or the element has an `aria-hidden` attribute. Placeholders are not exempt: they are text. `fadedText(source, file)` reports every `/(?<![\w-])(?:[\w-]+:)*(?:text|placeholder)-[a-z][\w-]*\/\d+(?![\w-])/` match with its line.

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-contrast-use.test.ts` — FAIL on any faint or faded text the migration left (or on the missing helpers only, if Tasks 12–14 left none: then confirm each guard catches its first example).
- [ ] **Step 3: Fix the uses.** A reported `fg-faint` becomes `fg-muted` (same variants), or gets `aria-hidden="true"` when it is pure decoration (arrows, separators); a faded text class loses its suffix.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/studio-contrast-use.test.ts tests/unit/studio-brand-tokens.test.ts tests/unit/studio-colour-guard.test.ts` — PASS.
- [ ] **Step 5: Install axe and write the gate.** `npm i -D @axe-core/playwright@^4.10.2 axe-core@^4.10.2` (`dependencies` stays absent). Write `seriousViolations` and `tests/e2e/a11y-axe.spec.ts`: one test per (screen × variant), named `` `${variant} ${screen} has no serious axe violations` ``, asserting `expect(await seriousViolations(page)).toEqual([])` once the screen is reached. Where a screen's control has no id or test id, add a `data-testid` (e.g. `manage-languages-toggle`).

  | Variant    | Dev Studio (3010), via `addInitScript`                                                               | Share Studio (3020)                    |
  | ---------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
  | `dark-en`  | defaults                                                                                             | `colorScheme: 'dark'`                  |
  | `light-en` | `STUDIO_THEME_KEY = 'light'`                                                                         | `colorScheme: 'light'`                 |
  | `dark-ar`  | `STUDIO_THEME_KEY = 'dark'`, `STUDIO_LANGUAGE_KEY = 'ar'`; also assert `dir="rtl"` on `studio-root`  | `colorScheme: 'dark'`, `locale: 'ar'`  |
  | `light-ar` | `STUDIO_THEME_KEY = 'light'`, `STUDIO_LANGUAGE_KEY = 'ar'`; also assert `dir="rtl"` on `studio-root` | `colorScheme: 'light'`, `locale: 'ar'` |

  Screens: dev at 1440x900 — `idle` (connected), `editor` (`home.welcome_msg` picked from the key list), `changes` (Changes dialog open), `manage` (Manage Languages toggle pressed), `import` (Import dialog open); dev at 1024x768 — `compact-keys` (Keys drawer open: assert; then Escape, open the side drawer with `studio-toggle-side` after picking `home.welcome_msg`: assert again); share — `tips` (first-run tips), `send` (tips done with name `Sara`, `editKey(page, 'home.welcome_msg', 'Hola')`, Send open).

- [ ] **Step 6: Run the gate.** `npm run build`, then `npx playwright test tests/e2e/a11y-axe.spec.ts` — either 32 passed, or failures listing `<rule>: <selector>` per screen.
- [ ] **Step 7: Fix every reported node** at its source: for `color-contrast`, switch the class to the token of the right role from the Task 12 map (e.g. coral text on a tint → `text-accent-fg`, never `text-accent`); only if a token pair itself fails, move that token's value in `index.css` and `TOKENS` together and add the failing pair to Task 10's `PAIRS`. No rule is disabled; nothing is excluded except `#app-preview-iframe`.
- [ ] **Step 8: Run the full suites.** `npx vitest run` and `npx playwright test` — all pass (32 in a11y-axe, 6 in a11y-keyboard).
- [ ] **Step 9: Commit** (after the gate). If a token value moved in Step 7, the body names it (`<token> <theme>: <old> -> <new>`).

```bash
git add package.json package-lock.json src/studio tests/unit/studio-contrast-use.test.ts tests/e2e/fixtures/axe.ts tests/e2e/a11y-axe.spec.ts
git commit -m "test(studio): fail the E2E suite on serious accessibility violations in both themes and languages"
```

---

# Milestone 3: Docs, prerelease smoke check, release

### Task 30: README sections and changesets

**Files:**

- Modify: `README.md` (feature bullet near line 44; `check` usage line; new `### Catch untranslated text before launch` after the `` ### `check` `` section, before `` ### `pack` ``; a paragraph at the end of `### 5. Launch the Visual Studio`)
- Create: `.changeset/check-hardcoded.md`, `.changeset/studio-arabic.md`, `.changeset/studio-brand-theme.md`, `.changeset/studio-accessibility.md`
- Test: `tests/unit/readme-check.test.ts` (new)

**Interfaces:**

- Consumes: the shipped behaviour of Tasks 1–29.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
const readme = fs.readFileSync('README.md', 'utf-8');
const prose = readme.replace(/\s+/g, ' ');
it('has the section and a CI example', () => {
  expect(readme).toMatch(/^### Catch untranslated text before launch$/m);
  expect(readme).toContain('- run: npx livelocale check --hardcoded');
});
it('documents the opt-outs', () => {
  for (const s of [
    '// livelocale-ignore-next-line',
    '{/* livelocale-ignore-next-line */}',
    'livelocale-ignore-file',
    'livelocale.allow',
    'key:checkout.brand',
    '--allow <word>',
  ])
    expect(readme).toContain(s);
});
it('states the honest limits and the typescript requirement', () => {
  for (const s of [
    'Only JSX is checked',
    'text built at run time is not seen',
    'exits with code 2',
    'npm install -D typescript',
    'the line above the element',
  ])
    expect(prose).toContain(s);
});
it('describes the Studio language, theme and keyboard support', () => {
  for (const s of [
    'new LiveLocale look',
    'It speaks English and Arabic',
    'System, Light or Dark',
    'fonts ship inside the package',
    'visible focus ring',
  ])
    expect(prose).toContain(s);
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/readme-check.test.ts` — FAIL on the missing heading.
- [ ] **Step 3: Write the README.** The new section covers, in order: what it finds (the three kinds, their levels, `--strict`); `npx livelocale check --hardcoded` and a GitHub Actions `- run: npx livelocale check --hardcoded` step; the opt-outs (`// livelocale-ignore-next-line`, `{/* livelocale-ignore-next-line */}`, either on the line above the text or on the line above the element that holds it, which is where Prettier leaves it for multi-line JSX, `livelocale-ignore-file` at the top of a file, `--allow <word>`, a `livelocale.allow` sample with `LiveLocale`, `GitHub` and `key:checkout.brand`); what is skipped (tests, stories, mocks, fixtures, `.storybook`, `e2e`, `cypress`, `.d.ts`, ignored folders, code-like strings); the limits: "Only JSX is checked" (no Vue, Svelte, Angular or HTML templates, no object literals such as page metadata) and "text built at run time is not seen"; the requirement: it "uses your project's own `typescript`; without it the other checks still run and the command exits with code 2", with `npm install -D typescript`. The `check` usage line gains `[--hardcoded] [--allow <word>]`; the feature bullet gains "and, with `--hardcoded`, text that never went through translation". The Studio paragraph: "The Studio has the new LiveLocale look, in light and dark. It speaks English and Arabic; the share link follows the browser language, and the switch is in the header. Share links also follow your system's light or dark setting; the dev Studio starts dark until you pick System, Light or Dark. Its fonts ship inside the package, so the Studio loads nothing from Google. Every control works by keyboard, with a visible focus ring." Wrap prose at 100 columns.
- [ ] **Step 4: Write the changesets**, each with front matter `'livelocale': minor`:
  - `check-hardcoded.md`: "`livelocale check --hardcoded` finds JSX text that never went through translation, translations identical to the source locale, and translations in the wrong script, and fails CI on hardcoded text. Without the flag, `check` behaves as before."
  - `studio-arabic.md`: "The Studio is available in Arabic with a right-to-left layout."
  - `studio-brand-theme.md`: "The Studio has a new look with the LiveLocale brand (colours, type and logo) in a light and a dark theme. Share links follow the system setting; the dev Studio starts dark until you choose System, Light or Dark in the header."
  - `studio-accessibility.md`: "The Studio shows a visible keyboard focus ring, names every control, works fully by keyboard, announces saves, sends and errors, and meets WCAG AA contrast."
- [ ] **Step 5: Run.** `npx vitest run tests/unit/readme-check.test.ts tests/unit/readme-share.test.ts`, then `npm run format:check` — PASS, exit 0.
- [ ] **Step 6: Commit** (after the gate)

```bash
git add README.md .changeset/check-hardcoded.md .changeset/studio-arabic.md .changeset/studio-brand-theme.md .changeset/studio-accessibility.md tests/unit/readme-check.test.ts
git commit -m "docs: document check --hardcoded and the Studio's new look, Arabic and keyboard support"
```

---

### Task 31: `0.11.0-next` prerelease and the smoke check on Translation-Test

**Files:** none in this repo unless the smoke check finds a false alarm (then the files of Task 1 or Task 4 and their tests).

**Interfaces:**

- Consumes: the Publish workflow's manual run (`.github/workflows/publish.yml`, input `prerelease_base`), which publishes `<base>-next.<run number>` to the `next` dist-tag without a commit or changeset.
- Produces: a verified `livelocale@next`.

- [ ] **Step 1: Full local gate.** `npm run build; npm run test:coverage; npx playwright test; npm run typecheck; npm run lint; npm run format:check` — all exit 0.
- [ ] **Step 2: Merge the branch, then publish the prerelease (owner actions).** The work is on `feat/0.11`. Once the owner says yes in chat, push it and open a pull request to `main` (`gh pr create --base main --head feat/0.11`) titled `feat: 0.11.0 launch features`, with a body listing the four changesets; no Claude, Anthropic or AI mention and no `Co-Authored-By` or "Generated with" line in the title, the body or any commit on the branch (check with `git log main..feat/0.11 --format=%B`). The owner reviews and merges it; `main` then carries Arabic copy the owner may not have reviewed yet, which is fine for `next` and only `latest` waits for Task 24 Step 6 (Owner flag 5). After the merge, ask the owner to run Actions → Publish to NPM → Run workflow with `prerelease_base` = `0.11.0` (or, only after the owner says yes in chat, `gh workflow run publish.yml -f prerelease_base=0.11.0`). Verify: `npm view livelocale dist-tags.next` prints `0.11.0-next.<n>`.
- [ ] **Step 3: Set up the demo repo in the scratchpad.** `git clone https://github.com/Araby99/Translation-Test <scratchpad>/tt`, `cd <scratchpad>/tt`, `npm ci`, `npm i -D livelocale@next --no-save`. Nothing is committed or pushed to the demo repo.
- [ ] **Step 4: Without the flag nothing changes.** Run `npx livelocale check > next.txt; echo $?` and `npx -y livelocale@0.10.1 check > old.txt; echo $?` — same exit code, and `diff old.txt next.txt` is empty.
- [ ] **Step 5: With the flag.** `npx livelocale check --hardcoded; echo $?` — exit 0 or 1, never 2 (the demo has `typescript`). `npx livelocale check --hardcoded --json` — no `setupProblems` key.
- [ ] **Step 6: Judge every finding.** Each `hardcoded` finding must be visible text that really never went through translation; each `untranslated`/`wrong-script` warning must be a real identical or Latin value. Any false alarm blocks the release: add it as a failing case to `tests/unit/hardcoded-text.test.ts` or `tests/unit/hardcoded-jsx.test.ts`, fix, commit `fix(check): <what was misread>`, and repeat Steps 1–6 with a new prerelease.
- [ ] **Step 7: Studio on the prerelease.** In the demo, start its dev server with the prerelease's Studio (as its README says) and open it: the Studio is in the brand's dark theme with the patch logo; the theme toggle turns it to Paper; the language switch mirrors it to Arabic in IBM Plex Sans Arabic; the browser's network panel shows no request to `fonts.googleapis.com` or `fonts.gstatic.com`. `npm view livelocale@next dist.unpackedSize` is within 5 % of the unpacked size recorded in Task 11's commit body. Any failure blocks the release like a false alarm in Step 6 (fix, new prerelease).
- [ ] **Step 8: Report** to the owner the prerelease version, the exit codes, the finding counts by kind with one line per finding judged real, and the Step 7 result.

---

### Task 32: Prepare the 0.11.0 release commit

**Files:**

- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md` (by `npm run version`); the four `.changeset/*.md` files are consumed

**Interfaces:**

- Consumes: Task 24 Step 6 (owner approved the Arabic copy, including the accessibility keys) and Task 31 (smoke check passed with no false alarms).
- Produces: one release commit on a `release/0.11.0` branch cut from the merged `main`, and its pull request. The owner merges it and creates the GitHub release `v0.11.0`; the publish workflow then publishes to `latest`. This task never creates the release, tags or publishes.

- [ ] **Step 1: Confirm the two preconditions** in the conversation history; stop and ask the owner if either is missing.
- [ ] **Step 2: Apply the changesets** on a fresh branch: `git switch main; git pull; git switch -c release/0.11.0`, then `npm run version` — `package.json` `version` is `0.11.0`; `CHANGELOG.md` starts with a `## 0.11.0` section listing the four changes; `.changeset/` holds only `README.md` and `config.json`.
- [ ] **Step 3: Verify.** `npm run build; npm test; npx playwright test; npm run typecheck; npm run lint; npm run format:check` — all exit 0; `node -p "require('./package.json').dependencies"` prints `undefined`.
- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md .changeset
git commit -m "chore: release 0.11.0"
```

- [ ] **Step 5: Hand off.** Once the owner says yes in chat, push `release/0.11.0` and open a pull request to `main` titled `chore: release 0.11.0` (same no-attribution rule as Task 31 Step 2). Tell the owner: merge it, then create a GitHub release tagged `v0.11.0` from the merge commit.

---

## Shared contracts

Interface index: where each shared name is defined and who uses it.

| Interface                                           | Plan uses                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preferences module                                  | One module `src/studio/preferences.ts` (Task 9): types, keys, stored readers, savers, both defaults                                                                                                                                                                                                                    |
| Pref names and storage keys                         | `PrefName` `'studio-language'`, `'studio-theme'`; keys `livelocale:studio-language`, `livelocale:studio-theme`, exported as `STUDIO_LANGUAGE_KEY`, `STUDIO_THEME_KEY`                                                                                                                                                  |
| Share vs dev detection                              | `isShareStudio(): boolean` in `runtime.ts` (static runtime, or a share folder whose manifest is missing); `defaultThemeChoice(isShareStudio)`, `initialThemeChoice({ stored, isShareStudio })`, `useTheme(isShareStudio)`                                                                                              |
| `StudioLanguage`, `STUDIO_LANGUAGES`                | Defined in `preferences.ts`, re-exported by the catalogue                                                                                                                                                                                                                                                              |
| `ThemeChoice`, `THEME_CHOICES`, `storedThemeChoice` | In `preferences.ts`                                                                                                                                                                                                                                                                                                    |
| Header slot                                         | `settings?: ReactNode` in `data-testid="header-settings"`, after `#studio-changes-button`, before the version badge, always visible; `LanguageToggle` then `ThemeToggle`                                                                                                                                               |
| Brand colour tokens                                 | 35 names (Task 10 table): `--lc-<name>` in `:root` (light) and `.dark` (dark), `--color-<name>: var(--lc-<name>)` in `@theme inline`, after the `@theme` block that holds the palette reset; `dark:` bound to the `.dark` class by `@custom-variant`; classes `bg-surface`, `text-fg`, `border-line`, `fill-accent`, … |
| Token table and parsing                             | `tests/unit/helpers/studio-tokens.ts`: `TokenName`, `TOKENS`, `cssDecls`, `themeInline` (Task 10)                                                                                                                                                                                                                      |
| Contrast                                            | `tests/unit/helpers/contrast.ts`: `contrastRatio(a, b)` for hex (Task 10); token pairs in `studio-brand-tokens.test.ts`, component use in `studio-contrast-use.test.ts` (Task 29)                                                                                                                                      |
| Focus ring colour                                   | Token `focus` (light `#B23A1E`, dark `#FF7A5C`), defined in Task 10, drawn by the global `:focus-visible` rule from Task 25                                                                                                                                                                                            |
| Brand type                                          | `--font-heading` (Bricolage Grotesque, Readex Pro), `--font-sans` (Inter, IBM Plex Sans Arabic), `--font-mono` (JetBrains Mono); `font-outfit` gone; Arabic sizing on `html[lang='ar']` (Task 11)                                                                                                                      |
| Logo                                                | `BrandMark` (`components/BrandMark.tsx`, `data-testid="brand-mark"`, `fill-logo-ink`/`fill-accent-shadow`/`fill-accent`); `h1` text `livelocale` (Task 11)                                                                                                                                                             |
| Colour migration                                    | Migration map in Task 12; `fixedColours`, `MIGRATED_FILES` (Tasks 12–13), whole-Studio guards, `unknownColourNames` (no `white`/`black` except `bg-white` on `#app-preview-iframe`) and the palette reset (Task 14)                                                                                                    |
| Class string collector                              | `tests/unit/helpers/class-literals.ts`: `classLiterals(ts, source, file)` (Task 19); used by the logical-property guard and `faintMisuses` (Task 29)                                                                                                                                                                   |
| E2E fixtures                                        | `tests/e2e/fixtures/fonts.ts` `loadedFaces` (Task 11); `tests/e2e/fixtures/theme.ts` `watchDark`, `seen` (Task 16); `tests/e2e/fixtures/share.ts` `editKey(page, key, value)` (Task 24)                                                                                                                                |
| Studio file walker                                  | `tests/unit/helpers/studio-files.ts`: `studioFiles(dir, ext?)` (Task 12)                                                                                                                                                                                                                                               |
| Theme control selectors                             | Buttons carry `data-theme-choice`, so tests work in Arabic                                                                                                                                                                                                                                                             |
| Theme labels                                        | `THEME_LABELS` constant and its `dashboard/index.ts` export in Task 16, both removed in Task 21 for `theme.group/system/light/dark` keys                                                                                                                                                                               |
| Document root `dark` class                          | Unconditional in `main.tsx` from Task 10; replaced in Task 16 by the system setting before `startStudio` and the resolved choice in `.finally`                                                                                                                                                                         |
| Brand values in E2E                                 | Paper `rgb(255, 248, 240)`, Espresso `rgb(28, 23, 20)`, Coral `rgb(255, 107, 74)`, Coral (dark) `rgb(255, 122, 92)` (Task 16); focus ring `rgb(178, 58, 30)` / `rgb(255, 122, 92)` (Task 25)                                                                                                                           |
| Hardcoded scan                                      | `findHardcodedText(ts, sourceText, fileName, allow, options?: { templates?: boolean })` (Task 4); `loadProjectTypeScript(dir): Promise<{ ts } \| { problem }>`, `TYPESCRIPT_MISSING`, `typescriptUnusable(version)` (Task 5)                                                                                           |
| Studio copy sweep                                   | JSX sweep with `findHardcodedText` (Task 4, `templates: true`, words `LiveLocale`, `livelocale`, `English`); literal sweep `copyLiterals` with `isUserText` and `isMostlyLatin` and an explicit `EXEMPT` list; the E2E `expectNoEnglish` uses `isMostlyLatin` (Tasks 2, 24)                                            |
| A11y test helpers                                   | `tests/unit/helpers/a11y.ts`: `unnamedControls`, `FIXTURES`, `renderFixture` (Task 26)                                                                                                                                                                                                                                 |
| E2E readiness wait                                  | `ACTIVE` until Task 21; `connection-status` with `data-status="connected"` after it                                                                                                                                                                                                                                    |
| New accessible names                                | Catalogue keys with Arabic from the start (table in Task 26)                                                                                                                                                                                                                                                           |
| README and changesets                               | All in Task 30                                                                                                                                                                                                                                                                                                         |
| Owner reviews                                       | Brand screenshots in Task 16 Step 9 (non-blocking); Arabic copy in Task 24 Step 6, checked in Task 32 Step 1                                                                                                                                                                                                           |

## Review notes

Critic findings applied in full: 1–8, 10–20. Partly applied or applied differently:

- **Finding 9, capping the peer range at `<7`: not applied.** The separate setup message for an installed `typescript` without the compiler API is added (Task 5, Task 7). The cap is not: npm validates an optional peer's range when the package is present, so a project on a future `typescript` 7 would get an install-time peer conflict from LiveLocale, blocking installs to protect one optional feature. The clear exit-2 message already tells that user what is wrong.
- **Revised for the amended spec §8 (2026-11-01).** Milestone 2 was rewritten when the owner declared the old Studio look a placeholder. Gone with "dark must look as today": the computed-colour dark baseline, the colour-class snapshot and `darkEquivalent` (findings 2 and 17 addressed them), the `--lc-*`-beside-shadcn deviation and the Noto Sans Arabic font. In their place: the brand token table with its AA pairs checked up front (Task 10), so contrast is designed in rather than repaired in Task 29; brand fonts and the logo (Task 11); a role-based migration map (Task 12); E2E checks that pin the brand's own values (Tasks 11, 16, 25). Task numbers 9 and 24–32 keep their meaning, so Milestone 1's references to Task 24 (the copy sweep) and Task 31 Step 6 (judging smoke findings) still hold.
- **Finding 5, faint tokens:** kept as the exemption route, stricter than suggested: placeholders are not exempt (WCAG treats placeholder text as text), so only `disabled:` states and `aria-hidden` decoration may use `fg-faint` (Task 29); a guard against fading text tokens with an opacity suffix is added beside it.
- **Finding 13, side drawer in axe:** added to the existing `compact-keys` screen as a second assertion rather than a new screen, so the gate stays at 8 screens × 4 variants = 32 tests.
- **Loading flash (corrected in the second review):** the earlier note said the instant before `main.tsx` runs shows the browser's default page. It does not: the built stylesheet is linked in `<head>`, so that instant paints `:root`, the light Paper theme. From `main.tsx` on, the Task 16 change (follow the system before `startStudio`) keeps the share Studio under a dark system dark from its first render (pinned in `theme.spec.ts`); the light frame before it is Owner flag 7.
- **Self-Review, proportion:** the plan remains long against the spec; what remains is mostly test code with the spec's exact values. No implementation bodies were added.

Second review (Milestone 2 onward and the header; Tasks 1–8 unchanged), findings numbered as the critic gave them:

- **Applied as given:** 1 (CSS order fixed in Task 10 and tested; built-CSS check in Task 14 Step 4), 2 (the `index.html` one-line edit is now the milestone's only `index.html` change), 3, 5 (expected lines corrected to `-[#…]`), 6 (`loadedFaces` in `tests/e2e/fixtures/fonts.ts`), 7, 8 (`editKey(page, key, value)`: a value, not a suffix, matching how `static-share.spec.ts` fills the editor today), 10, 11, 12 (`classLiterals` in `tests/unit/helpers/class-literals.ts`, shared with Task 29), 14 (case count 110 → 120; the flag's numbers recomputed), 15, 16, 18 (folded into Task 31 Step 2 so Milestone 1's reference to Task 31 Step 6 keeps its number; Task 32 also works on a release branch with a pull request).
- **Finding 4:** applied; the premise is slightly off (no `shadow-md` today; `TranslationEditor` uses `shadow-inner`), but `md`, `inner` and `2xs` are added so every `shadow-*` size is covered.
- **Finding 9:** the first option, a unit literal sweep (`copyLiterals` with `isUserText`, `isMostlyLatin` and an explicit `EXEMPT` list) in Task 24, because it covers screens no E2E opens (TokenModal, ConfirmModal, backup messages, error fallbacks); extra E2E screens would still miss those.
- **Finding 13:** decided by Owner flag 6: existing English copy keeps its wording in 0.11.0, the voice rule binds new copy. Task 26's four Title Case names are today's titles and label text, not new copy, so they stay; every new name is sentence case.
- **Finding 17:** the Review note and the milestone constraint are corrected; the light frame on the dev Studio is accepted as Owner flag 7 rather than adding a duplicated dark token block under `prefers-color-scheme` (it would not remove the dev Studio's flash anyway, since the dev Studio's dark default is only known after `startStudio`).
- **Finding 19:** the first option, `@custom-variant dark (&:where(.dark, .dark *));` in Task 10, tested; `dark:` utilities then follow the toggle, so no guard against them is needed.
- **Finding 20:** applied to the bodies it named: Task 16 `theme.spec.ts`, Task 24 `studio-arabic.spec.ts`, Task 26's per-component cases and Task 28's live-region tests are now test names with their pinned assertions; full code stays for the token pairs, `watchDark`, `visibleCopy`, `tabStops`, the copy-sweep self-check and the Task 27 journeys (whose setup and selectors were the subject of finding 11).
- **Rejected:** none; no finding contradicted either spec.
