# LiveLocale 0.11.0 Launch Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 0.11.0: `livelocale check --hardcoded` (fails CI on text that never went through translation), a Studio in English and Arabic with a mirrored layout, a light theme beside today's dark one, and accessibility basics with an axe gate.

**Architecture:** `check --hardcoded` is Node-only CLI code under `src/codemod/hardcoded/`, parsing JSX with the user's own `typescript` (optional peer, lazy `require` from the project directory), feeding new issue kinds into the existing `runCheck`/`formatCheckReport`. The Studio gains one preferences module (`src/studio/preferences.ts`) and one header settings slot shared by the language switch and the theme toggle; colours move from fixed palette classes to `--lc-*` tokens pinned by a dark computed-style baseline; copy moves into an `en`/`ar` catalogue with logical (start/end) layout; accessibility work lands last so it audits the final UI.

**Tech Stack:** TypeScript, Node ≥ 18, tsup, React 18, Tailwind CSS 4.3.3, Vite (Studio bundle), Vitest (jsdom/node), Playwright, TypeScript compiler API (from the user's project), `@axe-core/playwright` (devDependency), `@fontsource/noto-sans-arabic` (devDependency), Changesets.

**Spec:** `docs/superpowers/specs/2026-11-01-launch-features-design.md`

## Global Constraints

Copied verbatim from the spec (§9, §4, §12); every task's requirements include them:

- No runtime dependencies (optional peer `typescript` only; devDependencies allowed: `axe-core`/`@axe-core/playwright`).
- Node ≥ 18; browser-safe core rules from the share-link plan still apply to `src/core`.
- `check` without `--hardcoded` and the server-mode Studio flows behave as in 0.10.x; existing tests stay green.
- Release as `0.11.0` (minor), with a `next` prerelease build and a smoke check of `check --hardcoded` on the demo repo Translation-Test before `latest`.
- **A noisy checker.** If the first `check --hardcoded` run on a real project prints hundreds of false alarms (class names, ids, URLs, test files), developers turn it off and the launch pitch is a lie. Precision beats recall.
- **Breaking the zero-runtime-dependency promise.** No new entry in `dependencies`.
- **Changing what `check` does without the flag.** Existing CI pipelines must not start failing after an upgrade.
- **Making the Studio harder for developers** (e.g. forcing Arabic or a light theme on people who did not choose it).
- **Error messages that come from the server or the shared validation core stay English in 0.11.0** (no change to the server API or `src/core`); an Arabic screen may occasionally show an English server error.
- `untranslated` and `wrong-script` are warnings by default and fail with `--strict`; `hardcoded` always fails (§5.3).

Project rules (from the repo and the owner):

- Commit messages are conventional and never mention Claude, Anthropic or AI; no `Co-Authored-By` trailer, no "Generated with" line.
- Gate before every commit: `npm run typecheck`, `npm run lint` and `npm run format:check` exit 0 (run `npm run format:write` when the last one fails). `npm run lint` rejects raw invisible characters: write U+2068/U+2069 and similar as `\u` escapes.
- Translation values are never logged (SEC-001); `hardcoded` findings print source-code text only, shortened to 60 characters.
- Coverage thresholds 85/70/85/85 hold (`npm run test:coverage`).
- Studio colours use `--lc-*` token classes only (Task 14 guard); Studio layout uses start/end utilities only (Task 19 guard); new user-visible Studio copy goes through the catalogue with an Arabic entry once Task 17 has landed (Task 24 guard); components never set `focus:` outline/ring/border utilities once Task 25 has landed.
- Short paths: `components/…` and `hooks/…` are under `src/studio/features/dashboard/`; `i18n/…` is `src/studio/i18n/`.
- Test conventions: node-only test files start with `// @vitest-environment node`, DOM tests with `// @vitest-environment jsdom`. CLI temp projects use `fs.mkdtempSync(path.join(os.tmpdir(), 'livelocale-hc-'))` and a local copy of the `write(root, rel, content)` and `keysOf` helpers from `tests/unit/check.test.ts` (copy; do not import across test files). E2E runs stop servers on 3000, 3010 and 3020 first and run `npm run build` before Playwright, because `reuseExistingServer` would serve a stale Studio.

## Review Focus

Inputs the spec implies but no feature test exercised in the drafts; each now has a pinning test in the owning task:

1. **Component files with CRLF line endings or a BOM** (every Windows checkout): `hardcoded` lines and columns must match the editor, and `livelocale-ignore-next-line` must still work. Pinned in Task 4, `reports correct positions and honours ignore comments in CRLF files with a BOM`.
2. **Prettier-formatted JSX under an ignore comment** (`{/* livelocale-ignore-next-line */}` above a `<p>` whose text sits on its own line, or above a multi-line `<img alt="…" />`): the brand text is not reported, so the opt-out works where people put it. Pinned in Task 4, `honours an ignore comment above a multi-line element`.
3. **Locale files with arrays, numbers and plural forms that exist only in the target** (`ar.json` with `items_zero`): non-string leaves skipped without a crash; target-only plural forms checked by `wrong-script`, never by `untranslated`. Pinned in Task 3, `skips non-string leaves and checks Arabic-only plural forms for script only`.
4. **Header settings by keyboard in Arabic** (RTL): the language switch and the theme buttons are reachable by Tab, show the 2px ring, and act on Enter. Pinned in Task 27, `reaches the language and theme controls by keyboard in Arabic`.
5. **First visit to a share link from an Arabic browser under a light system setting**: both defaults apply together; no dark frame, root `dir="rtl"`, tips in Arabic. Pinned in Task 24, `starts light and in Arabic on a first visit from an Arabic browser`.

## Owner flags

Decisions the owner should see before execution:

1. **Task 11 deviates from §8's "existing semantic theme tokens"**: a `--lc-*` set is added beside them (reason in Task 11).
2. **Task 18 adds `@fontsource/noto-sans-arabic` as a devDependency**, which §9 does not list (it allows only `axe-core`/`@axe-core/playwright`). It is bundled into `dist/studio` and grows the tarball; Task 18 Step 4 records the `npm pack --dry-run` size before and after.
3. **Task 29 changes the dark look**, which §8 forbids and §7 requires: dark `fg-subtle` moves from slate-500 to slate-400 (`text-slate-500` is the Studio's second most used colour class, so many dark texts get brighter), and real text that used `fg-faint`/`fg-fainter` (slate-600/700 hints and placeholders) moves to a passing token. §7 wins; the commit body names every shade change.
4. **Task 32 is blocked on the owner's Arabic copy review** (Task 24 Step 6).

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

# Milestone 2: The Studio (spec §6, §7, §8, §12.1)

Order inside the milestone: shared settings (Task 9), theme token migration and toggle (Tasks 10–16), Studio in Arabic (Tasks 17–24), accessibility basics (Tasks 25–29, last so they audit the final UI). The colour migration, the copy extraction and the logical-property pass rewrite the same `className` strings in the same component files: run them one after another, never in parallel branches.

**Milestone constraints:**

- **Defaults never force a change on current users.** With no remembered choice, the dev/preview Studio stays dark and English; the share Studio (`isShareStudio()`, Task 9: a static runtime, or a share folder whose manifest is missing) follows `prefers-color-scheme` and starts in Arabic only when the primary subtag of `navigator.language` is Arabic. A remembered choice always wins.
- **Preferences** are read and written only through `src/studio/preferences.ts`, which uses `readPref`/`writePref` (`src/studio/share/browser.ts`: key `livelocale:<name>`, try/catch with a memory fallback). Nothing reads `localStorage` directly.
- **Document root.** Theme toggles only the `dark` class on `document.documentElement` (`classList`, never `className`). Today nothing sets that class (the Studio is dark only through its fixed classes), so from Task 11 `main.tsx` adds it unconditionally before `startStudio`, and Task 16 replaces that line with the real theme. Language sets `lang`/`dir` attributes on `document.documentElement` and on the App root (`data-testid="studio-root"`). The Studio declares no `color-scheme`. `src/studio/index.html` is not changed (so the instant before `main.tsx` runs keeps today's light `body`; accepted).
- **Dark looks as today.** `tests/e2e/fixtures/dark-styles.json` (Task 10) stays green from Task 11 on. It changes only in a commit that changes a dark value on purpose and says why: Task 11 (`body` entries only, once `.dark` is set), Task 25 (focus state) and Task 29 (contrast fixes).
- **Server mode untouched.** No file under `src/server`, `src/core` or `src/client` changes in this milestone; with no remembered choice, every English string, id, `data-testid` and class order that existing tests read stays the same.
- **Inline styles stay.** The coverage-bar hex gradients in `Header.tsx`, `bg-white` on the app iframe and `text-white` on solid buttons stay as they are.

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

### Task 10: Pin the dark Studio's computed colours

**Files:**

- Create: `tests/e2e/theme-dark-baseline.spec.ts`, `tests/e2e/fixtures/styles.ts`, `tests/e2e/fixtures/dark-styles.json` (generated, committed)
- Create: `tests/unit/helpers/studio-files.ts`, `tests/unit/helpers/colour-classes.ts`, `tests/unit/studio-colour-classes.test.ts`, `tests/unit/fixtures/studio-colour-classes.json` (generated, committed)
- Modify: `tests/unit/studio-tailwind-shades.test.ts` (import `studioFiles` from the helper)

**Interfaces:**

- Consumes: the dev Studio on 3010 (playground on 3000) and the share fixture on 3020 (`playwright.config.ts`); `encodeChangeLink` (`src/core/change-link.ts`, as `tests/e2e/import-change-link.spec.ts` uses it).
- Produces (unit helpers, for Tasks 11–14, 19, 24–25):

  ```ts
  // tests/unit/helpers/studio-files.ts
  export function studioFiles(dir: string, ext?: RegExp): string[]; // recursive, sorted, forward slashes, default /\.tsx?$/
  // tests/unit/helpers/colour-classes.ts
  /** Every colour utility in source order: variants, utility, colour name, optional /NN. */
  export function colourUtilities(source: string): string[];
  ```

  - `colourUtilities` matches `(?<![\w-])(?:[\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring|divide|from|to|via|shadow|placeholder|outline)-(?:<palette>-\d{2,3}|\[#[0-9a-fA-F]{3,8}\]|white|black|transparent|current)(?:\/\d+)?(?![\w-])`, `<palette>` = `slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose`. Task 11 adds the token names to the colour alternation.
  - **Colour-class snapshot**: `tests/unit/studio-colour-classes.test.ts` maps `studioFiles('src/studio', /\.tsx$/)` to `{ "<file>": colourUtilities(source) }`. With `UPDATE_COLOUR_SNAPSHOT=1` it writes `tests/unit/fixtures/studio-colour-classes.json`; otherwise it expects, for every file in the snapshot, `colourUtilities(current).map(toPaletteClass)` to equal the recorded list, where `toPaletteClass` is the identity in this task and Task 11's `darkEquivalent` from then on. This proves, for every component (including those no E2E state reaches, such as `LocalePicker`, `TokenModal`, `RepoPrompt`, `GitHubIssueAction`, `SetupProblems`, `EmptySelection`), that each migrated class resolves in dark to exactly the class it replaced. It is migration scaffolding: Task 14 deletes it.

- Produces (in `tests/e2e/fixtures/styles.ts`, not in the spec file, because Playwright refuses a test file that imports another test file; used by Task 16):

  ```ts
  export const STYLE_PROPS = [
    'color',
    'background-color',
    'border-top-color',
    'border-bottom-color',
    'background-image',
    'box-shadow',
  ] as const;
  export async function captureStyles(
    page: Page,
    selectors: readonly string[]
  ): Promise<Record<string, Record<(typeof STYLE_PROPS)[number], string>>>;
  ```

  - `captureStyles` first injects `*,*::before,*::after{transition:none!important;animation:none!important}` and throws `landmark not found: <selector>` when a selector matches nothing. Every selector targets the first match.
  - Baseline shape: `{ "<state>": { "<selector>": { "<prop>": "<computed value>" } } }`. With `UPDATE_DARK_BASELINE=1` each test writes its state; otherwise it compares with `toEqual`.

- [ ] **Step 1: Write the E2E test.** All tests use `colorScheme: 'dark'`, viewport 1440x900, wait for `getByText('ACTIVE', { exact: true })` (timeout 90 000), move the mouse to `(0, 0)` and blur `document.activeElement`. **Every state also captures `body`** (it switches to dark values once Task 11 sets `.dark`, and anything inheriting from it would change). No source file changes.

  ```ts
  // "dev.idle" at http://localhost:3010:
  //   ['body', '#root > div', 'header', 'header h1', 'main', '#studio-changes-button', '#studio-import-button',
  //    '[data-testid="keys-directory"]', '[data-testid="keys-directory"] input',
  //    '[data-testid="keys-directory"] button', '#app-preview-iframe']
  test('dev Studio keeps its dark colours at rest');
  // "dev.hover.<selector>": hover each of '#studio-changes-button', '#studio-import-button',
  //   '[data-testid="keys-directory"] .overflow-y-auto > button' and capture that one selector
  test('dev Studio keeps its dark hover colours');
  // "dev.editing": Alt+click [data-i18n-key="home.welcome_msg"] in #app-preview-iframe, blur, capture
  //   ['#studio-translation-input', '#studio-save-button', '#studio-drawer-side > *',
  //    '[data-testid="keys-directory"] .overflow-y-auto > button']; then focus #studio-translation-input → "dev.focus"
  test('dev Studio keeps its dark editor colours');
  // "dev.changes": click #studio-changes-button → ['[data-testid="changes-panel"]', '[data-testid="changes-panel"] > div:last-child']
  // "dev.import": click #studio-import-button → ['[role="dialog"]', '#studio-import-text', '#studio-import-title']
  test('dev Studio keeps its dark panel and dialog colours');
  // "dev.manage": pick home.welcome_msg as in "dev.editing", click [title="Manage Languages"] →
  //   ['[data-testid="editor-panel"]', '[data-testid="editor-panel"] form label', '[data-testid="editor-panel"] form input',
  //    '[data-testid="editor-panel"] form button[type="submit"]', '[title="Rename locale code"]', '[title="Delete locale"]']
  // "dev.plural": click [title="Back to Editor"], fill '[data-testid="keys-directory"] input' with 'cart.items',
  //   click the list's 'cart.items' button → ['[data-testid="plural-editor"]', '[data-testid="plural-prefix"]',
  //   '[data-testid="plural-branch-one"]']
  // "dev.confirm": type ' x' into a plural branch (unsaved), click another key in the list
  //   (.filter({ hasNotText: 'cart.items' }).first()) → ['div:has(> [role="dialog"])', '[role="dialog"]',
  //   '#studio-confirm-title', '[role="dialog"] button']
  test('dev Studio keeps its dark Manage Languages, plural and confirm colours');
  // share at http://localhost:3020/livelocale/index.html: "share.tips" ['body', '[role="dialog"]', '#studio-tips-name', '#studio-tips-title'];
  // fill "Sara", click "Start editing" → "share.idle" ['body', '#root > div', 'header', '#studio-send-button'];
  // Alt+click home.welcome_msg, type " x" into #studio-translation-input, wait for #studio-send-button enabled,
  // click it → "share.send" ['[role="dialog"]', '#studio-send-name', '#studio-send-title']
  test('share Studio keeps its dark colours under a dark system setting');
  // share, tips done, a draft typed as above, Escape any dialog, click #studio-changes-button →
  //   "share.drafts" ['[data-testid="changes-panel"]', '[data-testid="changes-panel"] section h3',
  //   '[data-testid="changes-panel"] section ul > li']; close it; click #studio-import-button, fill #studio-import-text
  //   with encodeChangeLink({ branch: '', base: '', src: 'en', by: '', note: '',
  //   edits: [{ locale: 'en', key: 'home.welcome_msg', from: <current value>, to: 'Welcome back, translator', force: false }] }),
  //   click 'Review changes' → "share.review" ['[data-testid="review-panel"]', '[data-testid="review-summary"]',
  //   '[data-testid="review-panel"] tbody tr', '[data-testid="review-apply-command"]']
  test('share Studio keeps its dark draft list and review colours');
  ```

- [ ] **Step 2: Write the colour-class snapshot test and helpers** (the Produces block above; move the file walker out of `tests/unit/studio-tailwind-shades.test.ts` into `studioFiles`).

- [ ] **Step 3: Record both on unmigrated code**

Run: `UPDATE_COLOUR_SNAPSHOT=1 npx vitest run tests/unit/studio-colour-classes.test.ts`, `npm run build`, then `UPDATE_DARK_BASELINE=1 npx playwright test tests/e2e/theme-dark-baseline.spec.ts`
Expected: PASS; 7 passed; the JSON has `dev.idle`, three `dev.hover.*`, `dev.editing`, `dev.focus`, `dev.changes`, `dev.import`, `dev.manage`, `dev.plural`, `dev.confirm`, `share.tips`, `share.idle`, `share.send`, `share.drafts`, `share.review`, with no empty `background-color`; the snapshot lists every `.tsx` under `src/studio` with a non-empty array for each component that has colour classes.

- [ ] **Step 4: Compare against the recordings**

Run: `npx vitest run tests/unit/studio-colour-classes.test.ts tests/unit/studio-tailwind-shades.test.ts`, then `npx playwright test tests/e2e/theme-dark-baseline.spec.ts`
Expected: PASS, PASS; 7 passed.

- [ ] **Step 5: Commit** (after the gate)

```bash
git add tests/e2e/theme-dark-baseline.spec.ts tests/e2e/fixtures/styles.ts tests/e2e/fixtures/dark-styles.json tests/unit/helpers/studio-files.ts tests/unit/helpers/colour-classes.ts tests/unit/studio-colour-classes.test.ts tests/unit/fixtures/studio-colour-classes.json tests/unit/studio-tailwind-shades.test.ts
git commit -m "test(studio): pin the dark Studio's computed colours and colour classes before the theme migration"
```

---

### Task 11: Studio colour tokens for light and dark

**Deviation from the spec's wording (flag for the owner).** §8 says "the existing semantic theme tokens". Those (`--background`, `--muted-foreground`, …) are shadcn-style HSL approximations with about 19 roles and cannot reproduce today's 15 slate shades plus five hue families exactly, which would break "dark must look as it does today". The existing tokens stay untouched; a `--lc-*` set is added beside them. The `brand` family (today's indigo) is the slot the branding project fills later.

**Files:**

- Modify: `src/studio/index.css` (a `@theme inline` block after the existing `@theme`; `--lc-*` in `:root` and `.dark`), `src/studio/main.tsx` (adds the `dark` class before `startStudio`)
- Create: `tests/unit/helpers/studio-tokens.ts`
- Modify: `tests/unit/helpers/colour-classes.ts` (token names), `tests/unit/studio-colour-classes.test.ts` (`toPaletteClass = darkEquivalent`), `tests/e2e/fixtures/dark-styles.json` (`body` entries only)
- Test: `tests/unit/studio-theme-tokens.test.ts` (new)

**Interfaces:**

- Consumes: the token table below; `colourUtilities`, `studioFiles` and the colour-class snapshot (Task 10).
- Produces:

  ```ts
  // tests/unit/helpers/studio-tokens.ts
  export const TOKENS: Record<string, readonly [light: string, dark: string]>; // panel: ['white', 'slate-950'], app: ['slate-50', '#0b0f19'], …
  export function tailwindPalette(): Map<string, string>; // every `--color-<name>: <value>;` in node_modules/tailwindcss/theme.css
  export function resolveColour(ref: string): string; // '#…' as is, else tailwindPalette().get(ref)
  export function cssDecls(css: string, selector: ':root' | '.dark'): Map<string, string>; // `--*` decls of the first top-level `<selector> {` block
  /** A colour utility with its token name replaced by the dark reference ('bg-panel/50' → 'bg-slate-950/50', 'bg-app' → 'bg-[#0b0f19]'); other classes unchanged. */
  export function darkEquivalent(cls: string): string;
  ```

  A Tailwind colour `<name>` exists for every token (19 neutral + 5 families × 8 = 59), declared as `--color-<name>: var(--lc-<name>);`. `colourUtilities` (Task 10) now also matches `Object.keys(TOKENS)` as colour names.
  - **`main.tsx`**: `document.documentElement.classList.add('dark')` as the first statement before `startStudio`, so the dark `--lc-*` values apply from the first migrated component on. Task 16 replaces this line.

**Colour token table** (binding for Tasks 11–14; `slate-950` = the value of `--color-slate-950` in `node_modules/tailwindcss/theme.css`, Tailwind 4.3.3, e.g. `oklch(12.9% 0.042 264.695)`; a hex is literal):

| Token           | Replaces                                              | Light        | Dark         |
| --------------- | ----------------------------------------------------- | ------------ | ------------ |
| `app`           | `bg-[#0b0f19]`, `from-[#0b0f19]`                      | `slate-50`   | `#0b0f19`    |
| `app-deep`      | `to-[#070a10]`                                        | `slate-100`  | `#070a10`    |
| `header`        | `bg-[#080b11]` (with `/90`)                           | `white`      | `#080b11`    |
| `panel`         | bg-type `slate-950`                                   | `white`      | `slate-950`  |
| `raised`        | bg-type `slate-900`                                   | `slate-100`  | `slate-900`  |
| `control`       | bg-type `slate-800`                                   | `slate-200`  | `slate-800`  |
| `control-hover` | bg-type `slate-700`                                   | `slate-300`  | `slate-700`  |
| `line-subtle`   | border-type `slate-900`                               | `slate-100`  | `slate-900`  |
| `line`          | border-type `slate-800`                               | `slate-200`  | `slate-800`  |
| `line-strong`   | border-type `slate-700`                               | `slate-300`  | `slate-700`  |
| `line-stronger` | border-type `slate-600`                               | `slate-400`  | `slate-600`  |
| `fg-strong`     | text-type `slate-100`, `from-slate-100`               | `slate-950`  | `slate-100`  |
| `fg`            | text-type `slate-200`                                 | `slate-900`  | `slate-200`  |
| `fg-soft`       | text-type `slate-300`, `to-slate-300`                 | `slate-800`  | `slate-300`  |
| `fg-muted`      | text-type `slate-400`                                 | `slate-700`  | `slate-400`  |
| `fg-subtle`     | text-type `slate-500`                                 | `slate-600`  | `slate-500`  |
| `fg-faint`      | text-type `slate-600` (incl. `placeholder-slate-600`) | `slate-500`  | `slate-600`  |
| `fg-fainter`    | text-type `slate-700`                                 | `slate-400`  | `slate-700`  |
| `brand-alt`     | `to-violet-500`                                       | `violet-600` | `violet-500` |

bg-type = `bg-`, `from-`, `to-`, `via-`, `shadow-`; border-type = `border-`, `divide-`, `ring-`, `outline-`; text-type = `text-`, `placeholder-`.

Hue families: `indigo` → `brand`, `rose` → `danger`, `amber` → `warning`, `emerald` → `success`, `sky` → `info`; each defines, for any utility:

| Token              | Replaces shade | Light   | Dark    |
| ------------------ | -------------- | ------- | ------- |
| `<f>`              | `-500`         | `X-600` | `X-500` |
| `<f>-solid`        | `-600`         | `X-700` | `X-600` |
| `<f>-solid-active` | `-700`         | `X-800` | `X-700` |
| `<f>-fg`           | `-400`         | `X-700` | `X-400` |
| `<f>-fg-strong`    | `-300`         | `X-800` | `X-300` |
| `<f>-fg-stronger`  | `-200`         | `X-900` | `X-200` |
| `<f>-fg-strongest` | `-100`         | `X-950` | `X-100` |
| `on-<f>`           | `-50`          | `X-50`  | `X-50`  |

**Migration rule** (Tasks 12–14): replace each class by its token class, keeping every variant prefix (`hover:`, `focus:`, `disabled:`, `active:`, `group-hover:` …) and opacity suffix (`/10`, `/80` …): `hover:bg-slate-950/50` → `hover:bg-panel/50`, `focus:ring-indigo-500/50` → `focus:ring-brand/50`, `shadow-rose-600/10` → `shadow-danger-solid/10`, `text-rose-400/80` → `text-danger-fg/80`. A palette class with no row is not guessed: add a row here and to `TOKENS` first. Only colour classes change; never markup, copy or other classes.

- [ ] **Step 1: Write the failing test**

```ts
it('defines every Studio colour token for light and dark', () => {
  for (const [name, [light, dark]] of Object.entries(TOKENS)) {
    expect(cssDecls(css, ':root').get(`--lc-${name}`)).toBe(resolveColour(light));
    expect(cssDecls(css, '.dark').get(`--lc-${name}`)).toBe(resolveColour(dark));
  }
});
it('gives dark exactly the colours it replaces', () => {
  expect(cssDecls(css, '.dark').get('--lc-panel')).toBe('oklch(12.9% 0.042 264.695)');
  expect(cssDecls(css, '.dark').get('--lc-brand-solid')).toBe('oklch(51.1% 0.262 276.966)');
  expect(cssDecls(css, '.dark').get('--lc-header')).toBe('#080b11');
});
it('maps every token into Tailwind with @theme inline', () => {
  for (const name of Object.keys(TOKENS))
    expect(themeInlineBlock).toContain(`--color-${name}: var(--lc-${name});`);
});
it('declares no color-scheme', () => expect(css).not.toMatch(/color-scheme/));
it('has 59 tokens', () => expect(Object.keys(TOKENS)).toHaveLength(59));
it('maps token classes back to the dark classes they replace', () => {
  expect(darkEquivalent('hover:bg-panel/50')).toBe('hover:bg-slate-950/50');
  expect(darkEquivalent('from-app')).toBe('from-[#0b0f19]');
  expect(darkEquivalent('shadow-danger-solid/10')).toBe('shadow-rose-600/10');
  expect(darkEquivalent('text-white')).toBe('text-white');
});
it('sets the dark class before the Studio starts', () => {
  const main = readFileSync('src/studio/main.tsx', 'utf8');
  expect(main.indexOf("document.documentElement.classList.add('dark')")).toBeGreaterThan(-1);
  expect(main.indexOf("document.documentElement.classList.add('dark')")).toBeLessThan(
    main.indexOf('startStudio(')
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/studio-theme-tokens.test.ts`
Expected: FAIL on `defines every Studio colour token` (`undefined` vs the palette value).

- [ ] **Step 3: Implement** the `@theme inline` block and the `--lc-*` values (resolved oklch or hex, as the test resolves them) in `:root` and `.dark`, `darkEquivalent`, the token names in `colourUtilities`, `toPaletteClass = darkEquivalent` in the snapshot test, and the `main.tsx` line.

- [ ] **Step 4: Run the unit checks**

Run: `npx vitest run tests/unit/studio-theme-tokens.test.ts tests/unit/studio-tailwind-shades.test.ts tests/unit/studio-colour-classes.test.ts`
Expected: PASS (nothing uses the tokens yet, so the snapshot is unchanged).

- [ ] **Step 5: Re-record `body` only and compare**

Run: `npm run build`, then `npx playwright test tests/e2e/theme-dark-baseline.spec.ts`. Expected: the only differences are the `body` entries (its own `color`/`background-color` now take the dark `--foreground`/`--background`). Then `UPDATE_DARK_BASELINE=1 npx playwright test tests/e2e/theme-dark-baseline.spec.ts`; `git diff tests/e2e/fixtures/dark-styles.json` touches only `"body"` keys. A difference in any other selector means an element inherits its colour from `body`: give that element an explicit token class matching today's computed value, never re-record it. Rerun: 7 passed.

- [ ] **Step 6: Commit** (after the gate)

```bash
git add src/studio/index.css src/studio/main.tsx tests/unit/helpers/studio-tokens.ts tests/unit/helpers/colour-classes.ts tests/unit/studio-colour-classes.test.ts tests/unit/studio-theme-tokens.test.ts tests/e2e/fixtures/dark-styles.json
git commit -m "feat(studio): add light and dark colour tokens that match the current palette

The Studio now sets the dark class on the document root, so body takes the dark --background and --foreground; the dark baseline is re-recorded for body only (it is fully covered by the Studio root)."
```

---

### Task 12: Move the Studio shell to colour tokens

**Files:**

- Modify: `src/studio/app.tsx`; `components/{Header,StudioLayout,IframeViewer,KeysDirectory,EmptySelection,SetupProblems}.tsx`
- Test: `tests/unit/studio-theme-tokens.test.ts`

**Interfaces:**

- Consumes: `TOKENS` (Task 11); `studioFiles` (Task 10).
- Produces: `FIXED_COLOUR` and `MIGRATED_FILES` in the test file, extended by Tasks 13–14.

- [ ] **Step 1: Write the failing test**

```ts
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const FIXED_COLOUR = new RegExp(
  String.raw`(?:\b[a-z-]+-(?:${PALETTE})-\d{2,3}\b|-\[#[0-9a-fA-F]{3,8}\])`,
  'g'
);
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
it('uses theme tokens instead of fixed palette colours', () => {
  const fixed = MIGRATED_FILES.flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(FIXED_COLOUR)].map((m) => `${f}: ${m[0]}`)
  );
  expect(fixed).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/studio-theme-tokens.test.ts`
Expected: FAIL, listing e.g. `src/studio/app.tsx: bg-[#0b0f19]` and `…/Header.tsx: bg-[#080b11]`.

- [ ] **Step 3: Apply the migration rule** to the seven files (e.g. the `app.tsx` root becomes `bg-app text-fg-strong`, the header `bg-header/90 … border-line-subtle/60`, the logo `from-brand-solid to-brand-alt shadow-brand/20`).

- [ ] **Step 4: Run the checks**

Run: `npx vitest run tests/unit/studio-theme-tokens.test.ts tests/unit/studio-colour-classes.test.ts tests/unit/studio-layout.test.tsx tests/unit/header-review.test.tsx`, then `npm run build` and `npx playwright test tests/e2e/theme-dark-baseline.spec.ts tests/e2e/responsive-layout.spec.ts`
Expected: all pass. A snapshot diff names the file and the class; a baseline diff names the selector and property: fix the mapping, never the snapshot or the baseline.

- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-theme-tokens.test.ts
git commit -m "refactor(studio): move the shell's colours to theme tokens"
```

---

### Task 13: Move the editor and locale components to colour tokens

**Files:**

- Modify: `components/{EditorPanel,TranslationEditor,PluralEditor,LocaleManager,LocaleRow,LocalePicker}.tsx`
- Test: `tests/unit/studio-theme-tokens.test.ts`

**Interfaces:**

- Consumes: `MIGRATED_FILES`, `FIXED_COLOUR` (Task 12).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test.** Append the six component paths to `MIGRATED_FILES`.
- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-theme-tokens.test.ts` — FAIL, listing e.g. `…/TranslationEditor.tsx: bg-amber-600`, `…/LocaleRow.tsx: bg-rose-600`.
- [ ] **Step 3: Apply the migration rule** (e.g. `bg-amber-600 hover:bg-amber-500 active:bg-amber-700` → `bg-warning-solid hover:bg-warning active:bg-warning-solid-active`).
- [ ] **Step 4: Run the checks.** `npx vitest run tests/unit/studio-theme-tokens.test.ts tests/unit/studio-colour-classes.test.ts tests/unit/translation-editor.test.tsx tests/unit/studio-locale-hooks.test.tsx`, then `npm run build` and `npx playwright test tests/e2e/theme-dark-baseline.spec.ts tests/e2e/visual-sync.spec.ts` — all pass.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-theme-tokens.test.ts
git commit -m "refactor(studio): move the editor and locale components' colours to theme tokens"
```

---

### Task 14: Move the panels and dialogs to colour tokens and guard the whole Studio

**Files:**

- Modify: `components/{ChangesPanel,DraftList,ReviewPanel,SendDialog,ImportChangeDialog,TokenModal,ConfirmModal,FirstRunTips,RepoPrompt,GitHubIssueAction}.tsx`
- Delete: `tests/unit/studio-colour-classes.test.ts`, `tests/unit/fixtures/studio-colour-classes.json`, `tests/unit/helpers/colour-classes.ts` (migration scaffolding, after it passes)
- Test: `tests/unit/studio-theme-tokens.test.ts`

**Interfaces:**

- Consumes: `FIXED_COLOUR` (Task 12); `studioFiles` (Task 10); `TOKENS` (Task 11); the colour-class snapshot (Task 10).
- Produces: two guards over every `.ts`/`.tsx` under `src/studio`, which every later task must keep green: no fixed palette class, and no colour utility naming an unknown colour.
  - **Known colour names** = `Object.keys(TOKENS)` plus `white black transparent current inherit`. The unknown-name guard matches `(?<![\w-])(?:[\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring|divide|from|to|via|shadow|placeholder|outline)-([a-z][\w-]*?)(?:\/\d+)?(?![\w-])` over the whole source (as `FIXED_COLOUR` does) and reports every capture that is neither a known colour name nor a non-colour suffix of that utility (sizes, widths, alignment: `xs sm base lg xl 2xl 3xl … left center right start end justify wrap nowrap balance pretty ellipsis clip`, `0 1 2 4 8 t r b l x y s e solid dashed dotted double none hidden collapse separate inset offset-* opacity-*`; keep that list in the test as `NON_COLOUR`).

- [ ] **Step 1: Write the failing tests.** Replace `MIGRATED_FILES` with `studioFiles('src/studio')` and rename the test `uses theme tokens instead of fixed palette colours anywhere in the Studio`. Add:

```ts
it('names only known colours in colour utilities anywhere in the Studio', () => {
  expect(
    unknownColourNames('<p className="text-fg-mutd bg-panle border-line/60 text-xs ring-2">')
  ).toEqual(['text-fg-mutd', 'bg-panle']);
  const found = studioFiles('src/studio').flatMap((f) =>
    unknownColourNames(readFileSync(f, 'utf8')).map((c) => `${f}: ${c}`)
  );
  expect(found).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-theme-tokens.test.ts` — FAIL: the palette guard lists classes in the ten files above and no other file; `unknownColourNames` is not defined.
- [ ] **Step 3: Apply the migration rule.** Dialog backdrops `bg-slate-950/80` → `bg-panel/80`; danger buttons → `bg-danger-solid hover:bg-danger active:bg-danger-solid-active text-white shadow-danger-solid/10`. Write `unknownColourNames(source: string): string[]` in the test file. A non-colour suffix the guard reports wrongly goes into `NON_COLOUR`; a real typo is fixed in the component.
- [ ] **Step 4: Run the checks.** `npx vitest run tests/unit/studio-colour-classes.test.ts tests/unit/studio-theme-tokens.test.ts`, then `npm test` — all pass; `npm run build` and `npx playwright test` — all pass, including every baseline state.
- [ ] **Step 5: Remove the scaffolding.** Delete `tests/unit/studio-colour-classes.test.ts`, `tests/unit/fixtures/studio-colour-classes.json` and `tests/unit/helpers/colour-classes.ts` (later tasks change colour classes on purpose; the two guards and the dark baseline take over). `npm test` — all pass.
- [ ] **Step 6: Commit** (after the gate)

```bash
git add -A src/studio tests/unit
git commit -m "refactor(studio): move panels and dialogs to theme tokens and forbid fixed palette colours and unknown colour names"
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
- Modify: `src/studio/features/dashboard/index.ts` (exports), `src/studio/app.tsx` (`useTheme`, `settings`), `src/studio/main.tsx` (first-paint apply), `tests/unit/studio-theme-tokens.test.ts` (drop the Task 11 `main.tsx` test)
- Test: `tests/unit/theme-toggle.test.tsx` (new), `tests/e2e/theme.spec.ts` (new)

**Interfaces:**

- Consumes: `useTheme`, `resolveTheme`, `prefersDark`, `applyTheme` (Task 15); `ThemeChoice`, `THEME_CHOICES`, `storedThemeChoice`, `initialThemeChoice`, `STUDIO_THEME_KEY`, `isShareStudio`, Header `settings` (Task 9); `captureStyles` and the baseline (Task 10).
- Produces:

  ```ts
  // components/ThemeToggle.tsx
  export const THEME_LABELS: Record<ThemeChoice, string>; // { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }; replaced by catalogue keys in Task 21
  export const ThemeToggle: (props: {
    choice: ThemeChoice;
    onChange(choice: ThemeChoice): void;
  }) => JSX.Element;
  ```

  - Markup: `<div role="group" aria-label="Theme">` with one icon `<button type="button" data-theme-choice={c} aria-label={THEME_LABELS[c]} title={THEME_LABELS[c]} aria-pressed={c === choice}>` per `THEME_CHOICES` entry, `h-7 w-7`, token colours only.
  - `main.tsx`: Task 11's unconditional `classList.add('dark')` is replaced. Before `startStudio`: `applyTheme(document.documentElement, resolveTheme(storedThemeChoice() ?? 'system', prefersDark()))` (the Studio kind is unknown until `startStudio` settles; following the system meanwhile means a light share Studio never shows a dark frame and a dark one never shows a light frame). In the `.finally` callback, before `render`: `applyTheme(document.documentElement, resolveTheme(initialThemeChoice({ stored: storedThemeChoice(), isShareStudio: isShareStudio() }), prefersDark()))`. A first-visit dev Studio under a light system shows a light `body` while loading, as today, then paints dark.
  - `app.tsx`: `const theme = useTheme(isShareStudio())`; `settings={<ThemeToggle choice={theme.choice} onChange={theme.setChoice} />}`.
  - `tests/unit/studio-theme-tokens.test.ts`: delete Task 11's `sets the dark class before the Studio starts` (the line it pins is gone).

- [ ] **Step 1: Write the failing unit test**

```ts
it('shows the current choice as pressed', () => {
  render(<ThemeToggle choice="dark" onChange={() => {}} />);
  expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Dark theme' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Light theme' }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'System theme' }).getAttribute('aria-pressed')).toBe('false');
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
- [ ] **Step 4: Run.** `npx vitest run tests/unit/theme-toggle.test.tsx tests/unit/header-review.test.tsx` — PASS.
- [ ] **Step 5: Write the E2E test** in `tests/e2e/theme.spec.ts`

```ts
import { readFileSync } from 'node:fs';
import { captureStyles } from './fixtures/styles.js';
const baseline = JSON.parse(readFileSync('tests/e2e/fixtures/dark-styles.json', 'utf8'));
import { STUDIO_THEME_KEY } from '../../src/studio/preferences.js';

const DEV = 'http://localhost:3010';
const SHARE = 'http://localhost:3020/livelocale/index.html';
const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));
const ready = (page: Page) =>
  expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });
/** Records whether the root carried `dark` at any point, and whether it did when #root first got content. */
const watchDark = (page: Page) =>
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
const seen = (page: Page, name: '__sawDark' | '__darkAtFirstRender') =>
  page.evaluate((n) => (window as any)[n], name);

test.describe('light system setting', () => {
  test.use({ colorScheme: 'light' });
  test('keeps the dev Studio dark until the person chooses', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(DEV);
    await ready(page);
    expect(await isDark(page)).toBe(true);
    expect((await captureStyles(page, ['#root > div']))['#root > div']).toEqual(
      baseline['dev.idle']['#root > div']
    );
  });
  test('shows the share Studio light, with no dark frame before it loads', async ({ page }) => {
    await watchDark(page);
    await page.goto(SHARE);
    await ready(page);
    expect(await isDark(page)).toBe(false);
    expect(await seen(page, '__sawDark')).toBe(false);
    const bg = (await captureStyles(page, ['#root > div']))['#root > div']['background-color'];
    expect(bg).not.toBe(baseline['share.idle']['#root > div']['background-color']);
  });
  test('remembers the chosen theme across a reload', async ({ page }) => {
    await page.goto(DEV);
    await ready(page);
    await page.locator('[data-theme-choice="light"]').click();
    expect(await isDark(page)).toBe(false);
    expect(await page.evaluate((k) => localStorage.getItem(k), STUDIO_THEME_KEY)).toBe('light');
    await page.reload();
    await ready(page);
    expect(await isDark(page)).toBe(false);
    await expect(page.locator('[data-theme-choice="light"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
  test('keeps the header on screen in light mode at 800x600', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(DEV);
    await ready(page);
    await page.locator('[data-theme-choice="light"]').click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await expect(page.locator('#studio-changes-button')).toBeVisible();
    await expect(page.getByTestId('header-settings')).toBeVisible();
  });
});
test.describe('dark system setting', () => {
  test.use({ colorScheme: 'dark' });
  test('shows the share Studio dark from its first render and follows a live switch to light', async ({
    page,
  }) => {
    await watchDark(page);
    await page.goto(SHARE);
    await ready(page);
    expect(await seen(page, '__darkAtFirstRender')).toBe(true);
    expect(await isDark(page)).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => isDark(page)).toBe(false);
  });
});
```

- [ ] **Step 6: Run the E2E.** `npm run build`, then `npx playwright test tests/e2e/theme.spec.ts tests/e2e/theme-dark-baseline.spec.ts tests/e2e/responsive-layout.spec.ts` — all pass.
- [ ] **Step 7: Run the full suites.** `npm test` and `npx playwright test` — all pass; `visual-sync.spec.ts` and `import-change-link.spec.ts` unchanged.
- [ ] **Step 8: Commit** (after the gate)

```bash
git add src/studio tests/unit/theme-toggle.test.tsx tests/unit/studio-theme-tokens.test.ts tests/e2e/theme.spec.ts
git commit -m "feat(studio): add a system, light and dark theme toggle; share Studio follows the system"
```

---

### Arabic tasks: shared rules (Tasks 17–24)

- **What stays English** (§12.1): messages from the server (`err.message` of an API response) or from `src/core` (`FLAG_MESSAGES`, `PlannedEdit.message`, `ChangeLinkError` messages outside `LINK_ERROR_COPY`); text written for the developer or the repository (`issueTitle`, `PASTE_HERE_BODY`, `changeFileName`, the `livelocale apply` command line).
- **Copy moves verbatim.** Every English string moves into `i18n/en.ts` unchanged, so existing English assertions keep passing. Each task writes the Arabic for every key it adds, in Modern Standard Arabic; the tips and the Send dialog get the most natural wording.
- **Direction.** Translator text (values, `by`, `note`, `from`, `to`) keeps `dir="auto"`. Code-like text (key paths, locale codes, URLs, commands, versions, file names) renders with `dir="ltr"`. The app iframe is not mirrored.
- **Tests in Arabic** wrap the component in `<StudioLanguageProvider initial="ar">`; each test file's existing render helper gains an optional language argument that does this (use the helper names those files already have). Expected Arabic text is read from `textFor('ar')(key, params)` so copy edits from the owner's review do not break tests.
- **Fonts.** `@fontsource/noto-sans-arabic` is a devDependency (the Studio is bundled), weights 400/500/600/700, `arabic` subset only; the browser downloads it only when Arabic glyphs render (`unicode-range`).

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
- Modify: `src/studio/main.tsx` (initial language after `startStudio`, provider around `<App />`, font imports), `src/studio/app.tsx` (root `lang`/`dir`/`data-testid`, `LanguageToggle` in `settings`), `src/studio/index.css` (font stacks), `package.json` (devDependency `@fontsource/noto-sans-arabic`)
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
  - **`main.tsx`**: in the `.finally` callback, next to the theme apply from Task 16 and before `render`, compute `initialStudioLanguage({ stored: storedLanguage(), isShareStudio: isShareStudio(), browserLanguage: navigator.language })` and render `<StudioLanguageProvider initial={…}><App /></StudioLanguageProvider>`; import `@fontsource/noto-sans-arabic/arabic-{400,500,600,700}.css`.
  - **Fonts**: `body` stack `'Inter', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif`; `--font-outfit` `'Outfit', 'Noto Sans Arabic', system-ui, sans-serif`.
  - **`LanguageToggle`**: one `<button type="button" id="studio-language-toggle">` showing the _other_ language's autonym in a span with that `lang` (`dir="rtl"` on the Arabic label); `aria-label` = `t('language.switch_to_ar')` or `t('language.switch_to_en')`; click → `setLang(other)`; classes match the Changes button's resting style, token colours only.
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
- [ ] **Step 3: Implement.** First run `npm run build; npm pack --dry-run` and note the reported "package size" and "unpacked size". Then run `npm install --save-dev @fontsource/noto-sans-arabic`, then the Produces block.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/studio-language.test.tsx tests/unit/header-review.test.tsx`, then `npm run build; npm pack --dry-run` — PASS, exit 0; `git diff package.json` shows the package under `devDependencies` only. Compare the package size with Step 3: if it grew by more than 250 kB, replace the four fontsource CSS imports with `@font-face` rules in `index.css` that reference only `@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-{400,500,600,700}-normal.woff2` (same `unicode-range` as the fontsource CSS), and measure again. Put both sizes (and the woff2-only size, if taken) in the commit body.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio package.json package-lock.json tests/unit/studio-language.test.tsx
git commit -m "feat(studio): switch the Studio between English and Arabic

Package size before / after the Arabic font: <before> / <after>."
```

---

### Task 19: Mirror the layout with logical properties

**Files:**

- Modify: `components/{ChangesPanel,DraftList,EditorPanel,IframeViewer,KeysDirectory,LocaleManager,LocaleRow,PluralEditor,ReviewPanel,SendDialog,SetupProblems,StudioLayout,TranslationEditor}.tsx`, `components/Header.tsx` (locale chip, version badge `dir`), `i18n/en.ts`, `i18n/ar.ts` (`common.arrow`)
- Test: `tests/unit/studio-logical-properties.test.ts` (new), `tests/unit/studio-layout.test.tsx`

**Interfaces:**

- Consumes: `useStudioText` (Task 18); `studioFiles` (Task 10).
- Produces: no exports. Rule for every later task: Studio classes use start/end utilities only.
  - **Mapping**: `ml-*`→`ms-*`, `mr-*`→`me-*`, `pl-*`→`ps-*`, `pr-*`→`pe-*`, `left-*`→`start-*`, `right-*`→`end-*`, `border-l`→`border-s`, `border-r`→`border-e`, `text-left`→`text-start`, `text-right`→`text-end`, `rounded-l*`→`rounded-s*`, `rounded-r*`→`rounded-e*`. `space-x-*` stays: in Tailwind 4.3.3 it already sets `margin-inline-start/end` and mirrors by itself. Colour tokens and variants are untouched.
  - **Arrow**: the `→` between old and new values (`ChangesPanel`, `DraftList`, `SendDialog`) renders `t('common.arrow')` (en `→`, ar `←`) with `aria-hidden="true"`.
  - **`dir="ltr"`** on key paths (`KeysDirectory`, `EditorPanel`, `DraftList`, `ChangesPanel`, `ReviewPanel`, `SendDialog`), the current path (`IframeViewer`), locale codes (`LocaleRow`, `LocaleManager`, the Header chip), the apply command and links (`ReviewPanel`, `SendDialog`), the version badge.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/studio-logical-properties.test.ts
const PHYSICAL =
  /(?<![\w-])-?(?:ml|mr|pl|pr|left|right|border-l|border-r|text-left|text-right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|scroll-ml|scroll-mr)(?:-[\w./[\]#%]+)?(?![\w-])/g;
it('uses start/end utilities instead of left/right ones', () => {
  const found = studioFiles('src/studio').flatMap((file) =>
    [
      ...readFileSync(file, 'utf8').matchAll(
        /className=(?:"[^"]*"|\{`[^`]*`\}|\{'[^']*'\})|const \w+ =\s*'[^']*'|`[^`]*`/g
      ),
    ].flatMap((m) => [...m[0].matchAll(PHYSICAL)].map((p) => `${file}: ${p[0]}`))
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
- [ ] **Step 4: Run the checks.** `npx vitest run tests/unit/studio-logical-properties.test.ts tests/unit/studio-layout.test.tsx tests/unit/studio-tailwind-shades.test.ts tests/unit/studio-theme-tokens.test.ts`, then `npm run build` and `npx playwright test tests/e2e/responsive-layout.spec.ts tests/e2e/theme-dark-baseline.spec.ts` — all pass (LTR layout and dark colours unchanged).
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-logical-properties.test.ts tests/unit/studio-layout.test.tsx
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
  - Plural keys: `drafts.unsent` (`{count}`), `backup.restored` (`{added}`, plural on `count` = added, with `{skipped}`), `send.overflow` (`{count}`).
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
  expect(await restoreBackup(link, transport, textFor('ar'))).toBe(textFor('ar')('backup.restored', { count: 2, added: 2, skipped: 0 })));
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

- Test: `tests/unit/studio-no-hardcoded-copy.test.ts` (new), `tests/e2e/studio-arabic.spec.ts` (new)
- Modify (only for strings the sweep finds): `src/studio/**`, `i18n/en.ts`, `i18n/ar.ts`

**Interfaces:**

- Consumes: `findHardcodedText` with `{ templates: true }`, `parseAllowFile` (Tasks 1, 4) with the repo's own `typescript`; `isMostlyLatin` (Task 2); `studioFiles` (Task 10); `STUDIO_LANGUAGE_KEY` (Task 9); ids `studio-language-toggle`, `studio-tips-start`, `studio-send-button`, `studio-send-title`, `studio-changes-button`, `studio-translation-input`; test ids `studio-root`, `connection-status`, `studio-drawer-keys`, `studio-toggle-keys`, `studio-drawer-side`, `studio-toggle-side`, `keys-directory`, `changes-panel`.
- Produces: the sweep, which every later Studio task must keep green.
  - The sweep runs `findHardcodedText(ts, source, file, parseAllowFile('LiveLocale\nEnglish\n'), { templates: true })` over `studioFiles('src/studio', /\.tsx$/)` and also drops the ICU category names (`zero`, `one`, `two`, `few`, `many`, `other`) found in `PluralEditor.tsx`. Nothing else is exempt (`PREVIEW` is the key `header.preview`). With `templates: true` it sees ``title={`${coveragePercentage}% of keys translated`}`` in `Header.tsx`.
  - The sweep cannot see copy kept in constants or `.ts` hooks and rendered as `{CONST}` (`ReviewPanel`'s hint, `SOURCE_HINTS`, `NO_LINK`, error fallbacks). The E2E covers that: on the Arabic idle, editor, changes, tips and send screens, every visible text node inside `studio-root` (outside `[dir="ltr"]`, `[dir="auto"]` and the iframe) must not be `isMostlyLatin` with the allow list `LiveLocale`, `English`, `GitHub`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/studio-no-hardcoded-copy.test.ts
it('keeps every user-visible Studio string in the catalogue', () => {
  const allow = parseAllowFile('LiveLocale\nEnglish\n');
  const ICU = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((file) =>
    findHardcodedText(ts, readFileSync(file, 'utf8'), file, allow, { templates: true })
      .filter((f) => !(file.endsWith('/PluralEditor.tsx') && ICU.has(f.text)))
      .map((f) => `${file}:${f.line}: ${f.text}`)
  );
  expect(found).toEqual([]);
});
```

```ts
// tests/e2e/studio-arabic.spec.ts
import { isMostlyLatin } from '../../src/codemod/hardcoded/locale-script.js';
import { parseAllowFile } from '../../src/codemod/hardcoded/allow-list.js';
const DEV = 'http://localhost:3010';
const STATIC = 'http://localhost:3020';
const root = (page: Page) => page.getByTestId('studio-root');
const connected = (page: Page, timeout: number) =>
  expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout,
  });
const LATIN_OK = parseAllowFile('LiveLocale\nEnglish\nGitHub\n');
/** Visible text nodes inside studio-root that are not code-like (dir="ltr") or translator values (dir="auto"). */
const visibleCopy = (page: Page) =>
  root(page).evaluate((el) => {
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

test.describe('dev Studio', () => {
  test.use({ locale: 'ar-EG' });
  test('stays English for an Arabic browser until the person switches, then remembers Arabic', async ({
    page,
  }) => {
    await page.goto(DEV);
    await connected(page, 90_000);
    await expect(root(page)).toHaveAttribute('dir', 'ltr');
    await page.locator('#studio-language-toggle').click();
    await expect(root(page)).toHaveAttribute('dir', 'rtl');
    await expect(root(page)).toHaveAttribute('lang', 'ar');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await page.reload();
    await expect(root(page)).toHaveAttribute('dir', 'rtl');
    await page.locator('#studio-language-toggle').click();
    await expect(root(page)).toHaveAttribute('dir', 'ltr');
  });
  test('opens the keys drawer on the right and the editor drawer on the left in Arabic', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(DEV);
    await connected(page, 90_000);
    await page.locator('#studio-language-toggle').click();
    await page.getByTestId('studio-toggle-keys').click();
    const keys = (await page.getByTestId('studio-drawer-keys').boundingBox())!;
    expect(keys.x + keys.width).toBeGreaterThan(1024 - 8);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.keyboard.press('Escape');
    await page.getByTestId('studio-toggle-side').click();
    const side = (await page.getByTestId('studio-drawer-side').boundingBox())!;
    expect(side.x).toBeLessThan(8);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
  test('shows no English copy on the idle, editor and changes screens in Arabic', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((key) => localStorage.setItem(key, 'ar'), STUDIO_LANGUAGE_KEY);
    await page.goto(DEV);
    await connected(page, 90_000);
    await expectNoEnglish(page, 'idle');
    await page.locator('[data-testid="keys-directory"] input').fill('home.welcome_msg');
    await page.locator('[data-testid="keys-directory"] .overflow-y-auto > button').first().click();
    await expect(page.locator('#studio-translation-input')).toBeVisible();
    await expectNoEnglish(page, 'editor');
    await page.locator('#studio-changes-button').click();
    await expect(page.getByTestId('changes-panel')).toBeVisible();
    await expectNoEnglish(page, 'changes');
  });
});
test.describe('share Studio, Arabic browser', () => {
  test.use({ locale: 'ar-EG' });
  test('starts in Arabic and sends a change in Arabic', async ({ page }) => {
    await page.goto(`${STATIC}/livelocale/index.html`);
    await connected(page, 30_000);
    await expect(root(page)).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#studio-tips-title')).toHaveText('مرحبًا بك في LiveLocale');
    await expectNoEnglish(page, 'tips');
    await page.locator('#studio-tips-start').click();
    // Alt+Click home.welcome_msg in the framed app and type " x" into #studio-translation-input, as static-share.spec.ts does
    await page.locator('#studio-send-button').click();
    await expect(page.locator('#studio-send-title')).toHaveText('إرسال إلى المطوّر');
    await expectNoEnglish(page, 'send');
  });
});
// Review Focus 5
test.describe('share Studio, Arabic browser, light system', () => {
  test.use({ locale: 'ar-EG', colorScheme: 'light' });
  test('starts light and in Arabic on a first visit from an Arabic browser', async ({ page }) => {
    // addInitScript: MutationObserver on documentElement sets window.__sawDark when a 'dark' class appears
    await page.goto(`${STATIC}/livelocale/index.html`);
    await connected(page, 30_000);
    await expect(root(page)).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      false
    );
    expect(await page.evaluate(() => (window as any).__sawDark ?? false)).toBe(false);
    await expect(page.locator('#studio-tips-title')).toHaveText('مرحبًا بك في LiveLocale');
  });
});
test.describe('share Studio, English browser', () => {
  test.use({ locale: 'en-US' });
  test('starts in English', async ({ page }) => {
    await page.goto(`${STATIC}/livelocale/index.html`);
    await expect(root(page)).toHaveAttribute('dir', 'ltr');
  });
});
```

- [ ] **Step 2: Run the sweep.** `npx vitest run tests/unit/studio-no-hardcoded-copy.test.ts` — FAIL only if a string was missed in Tasks 20–23. If it already passes, temporarily add `<span>Oops</span>` to `EmptySelection.tsx`, confirm the failure names that file and line, and remove it.
- [ ] **Step 3: Move** any remaining strings into the catalogue, with Arabic. Text the E2E `expectNoEnglish` reports is either catalogue copy still missing (move it) or code-like text without `dir="ltr"` (add the marker, per the Arabic shared rules); server or core messages never appear on these screens.
- [ ] **Step 4: Run everything.** `npx vitest run`, then `npm run build` and `npx playwright test tests/e2e/studio-arabic.spec.ts tests/e2e/static-share.spec.ts tests/e2e/responsive-layout.spec.ts tests/e2e/theme.spec.ts tests/e2e/theme-dark-baseline.spec.ts` — all pass.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-no-hardcoded-copy.test.ts tests/e2e/studio-arabic.spec.ts
git commit -m "test(studio): check that every Studio string is translated, in both Studios"
```

- [ ] **Step 6: Owner copy review (handoff).** Give the owner `src/studio/i18n/ar.ts` beside `src/studio/i18n/en.ts`, tips and Send keys first. Apply their edits in `fix(studio): apply the owner's Arabic copy review`. Task 32 stays blocked until they approve. (Accessibility tasks may proceed meanwhile; their new keys join the same review.)

---

### Accessibility tasks: shared rules (Tasks 25–29)

- They run on the final UI: tokens, both themes, both languages. Every new accessible name or announcement is a catalogue key with an Arabic entry (the Task 24 sweep and the Task 17 completeness test enforce it); the English values pinned below are what tests query, since tests render outside a provider (English).
- Focus is drawn only by the global `:focus-visible` rule (Task 25); components never set `focus:` outline, ring or border utilities.
- Intended visual changes to the dark dev Studio: the focus ring (Task 25, baseline state `dev.focus` only) and contrast fixes (Task 29). Each regenerates only the affected baseline states and says so in the commit message.
- E2E waits on `connection-status` (`data-status="connected"`, Task 21) and reaches controls by id or test id, never by English text, so the Arabic variants work.

---

### Task 25: One visible focus ring for every control

**Files:**

- Modify: `src/studio/index.css` (base-layer `:focus-visible` rule; `--lc-focus` in `:root` and `.dark`; `--color-focus` in `@theme inline`), `tests/unit/helpers/studio-tokens.ts` (`focus` row), `tests/unit/studio-theme-tokens.test.ts` (count 60)
- Modify: every `src/studio/**/*.tsx` with ad-hoc focus classes (today `ChangesPanel`, `EditorPanel`, `FirstRunTips`, `ImportChangeDialog`, `KeysDirectory`, `LocaleManager`, `LocaleRow`, `PluralEditor`, `RepoPrompt`, `SendDialog`; the test is the authority)
- Create: `tests/unit/helpers/contrast.ts`, `tests/e2e/a11y-keyboard.spec.ts`
- Modify: `tests/e2e/fixtures/dark-styles.json` (state `dev.focus` only)
- Test: `tests/unit/studio-focus-ring.test.ts` (new)

**Interfaces:**

- Consumes: `TOKENS`, `resolveColour`, `cssDecls` (Task 11); `studioFiles` (Task 10).
- Produces:
  - Token `focus`: light `blue-600`, dark `blue-500` (`TOKENS` now has 60 entries).
  - `tests/unit/helpers/contrast.ts`: `contrastRatio(a: string, b: string): number` — WCAG 2.x ratio for `#rgb`, `#rrggbb` or `oklch(L% C H)` inputs. Hex: sRGB channel ≤ 0.04045 → /12.92, else ((c+0.055)/1.055)^2.4. oklch: OKLab (a = C·cos h, b = C·sin h) → LMS cubes → linear sRGB with the standard OKLab matrices, clamped to [0, 1]. Luminance = 0.2126R + 0.7152G + 0.0722B; ratio = (L1+0.05)/(L2+0.05).

- [ ] **Step 1: Write the failing tests**

```ts
const css = readFileSync('src/studio/index.css', 'utf8');
const AD_HOC =
  /(?<![\w-])(?:focus:outline-(?:hidden|none)|focus:ring-[\w/.[\]#-]+|focus:border-[\w/.[\]#-]+|outline-none|outline-hidden)(?![\w-])/g;

it('draws a 2px ring in the focus colour on :focus-visible', () =>
  expect(css).toMatch(
    /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\);[^}]*outline-offset:\s*2px;/
  ));

it('leaves no ad-hoc focus classes in Studio components', () => {
  const hits = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(AD_HOC)].map((m) => `${f}: ${m[0]}`)
  );
  expect(hits).toEqual([]);
});

it.each([':root', '.dark'] as const)(
  'keeps the ring at 3:1 against every Studio surface in %s',
  (selector) => {
    const t = cssDecls(css, selector);
    for (const surface of ['app', 'panel', 'raised', 'control'])
      expect(
        contrastRatio(t.get('--lc-focus')!, t.get(`--lc-${surface}`)!),
        surface
      ).toBeGreaterThanOrEqual(3);
  }
);

it('computes WCAG ratios', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  expect(contrastRatio('#fff', '#ffffff')).toBeCloseTo(1, 5);
  expect(contrastRatio('oklch(100% 0 0)', '#ffffff')).toBeCloseTo(1, 2);
  expect(contrastRatio('#64748b', '#0f172a')).toBeCloseTo(3.75, 1);
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-focus-ring.test.ts` — FAIL: the helper is missing; once it exists, no `:focus-visible` rule, the ad-hoc list is non-empty (e.g. `ChangesPanel.tsx: focus:outline-hidden`), and `--lc-focus` is undefined.
- [ ] **Step 3: Implement** `contrast.ts`, the `focus` token (CSS and `TOKENS`, count test 60), and `@layer base { :focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; } }`.
- [ ] **Step 4: Remove every ad-hoc focus class** the test lists; hover and other classes stay.
- [ ] **Step 5: Run.** `npx vitest run tests/unit/studio-focus-ring.test.ts tests/unit/studio-theme-tokens.test.ts` — PASS.
- [ ] **Step 6: Add the E2E focus check** in `tests/e2e/a11y-keyboard.spec.ts`, `test.describe('Studio keyboard access')`:

```ts
test('shows a 2px solid focus ring on the first eight Tab stops', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3010');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 90_000,
  });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const style = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      return { tag: el.tagName, outline: s.outlineStyle, width: s.outlineWidth };
    });
    if (style.tag === 'IFRAME' || style.tag === 'BODY') continue;
    expect(style).toMatchObject({ outline: 'solid', width: '2px' });
  }
});
```

- [ ] **Step 7: Re-record the focus state only.** `npm run build`, then `UPDATE_DARK_BASELINE=1 npx playwright test tests/e2e/theme-dark-baseline.spec.ts -g "editor colours"`; `git diff tests/e2e/fixtures/dark-styles.json` changes only `dev.focus`. Then `npx playwright test tests/e2e/a11y-keyboard.spec.ts tests/e2e/theme-dark-baseline.spec.ts` — all pass.
- [ ] **Step 8: Commit** (after the gate)

```bash
git add src/studio tests/unit/helpers tests/unit/studio-focus-ring.test.ts tests/unit/studio-theme-tokens.test.ts tests/e2e/a11y-keyboard.spec.ts tests/e2e/fixtures/dark-styles.json
git commit -m "feat(studio): one visible focus ring for every control

The dark baseline's dev.focus state is re-recorded: the old per-component focus border and ring are replaced by the global ring."
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
  - **Pinned names** (catalogue key → English):

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

- [ ] **Step 1: Write the failing test** (render each component with the fixtures its existing test uses)

```tsx
it('names every control in KeysDirectory', () => {
  const { container } = render(<KeysDirectory {...keysProps} filteredKeys={['home.title']} />);
  expect(unnamedControls(container)).toEqual([]);
  expect(screen.getByRole('textbox', { name: 'Search keys or values' })).toBeTruthy();
});
it('names the locale select and the manage toggle in EditorPanel', () => {
  const { container } = render(<EditorPanel {...editorProps} />);
  expect(unnamedControls(container)).toEqual([]);
  expect(screen.getByRole('combobox', { name: 'Locale' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Manage Languages' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Translation' }).id).toBe('studio-translation-input');
});
it('names the new-locale field and per-row locale actions with the locale code', () => {
  const { container } = render(<LocaleManager {...managerProps} locales={['en', 'ar']} />);
  expect(unnamedControls(container)).toEqual([]);
  expect(screen.getByRole('textbox', { name: 'Add New Locale' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Rename locale ar' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete locale ar' })).toBeTruthy();
});
it('names the rename field, Save rename and Cancel while renaming', () => {
  const { container } = render(<LocaleRow {...rowProps} code="ar" />);
  fireEvent.click(screen.getByRole('button', { name: 'Rename locale ar' }));
  expect(unnamedControls(container)).toEqual([]);
  expect(screen.getByRole('textbox', { name: 'New code for ar' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save rename' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
});
it('names Refresh, Close and the commit message in ChangesPanel', () => {
  const { container } = renderPanel(); // fixture from changes-panel.test.tsx, with one history entry
  expect(unnamedControls(container)).toEqual([]);
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Commit message' }).id).toBe('studio-commit-message');
});
it('names Reload Frame in IframeViewer', () => {
  const { container } = render(<IframeViewer {...viewerProps} />);
  expect(unnamedControls(container)).toEqual([]);
  expect(screen.getByRole('button', { name: 'Reload Frame' })).toBeTruthy();
});
it('names every control in SendDialog once a link is shown', async () => {
  // mocks as in send-dialog.test.tsx: encodeChangeLink → 'lc1.TOKEN'; browser.js copyText → true
  const { container } = render(
    <SendDialog
      isOpen
      onClose={vi.fn()}
      drafts={[draft(1), draft(2)]}
      manifest={MANIFEST}
      studioHref={STUDIO_URL}
      onMarkSent={vi.fn(async () => {})}
    />
  );
  const link = await screen.findByRole('textbox', { name: 'Change link' });
  expect(link.id).toBe('studio-send-link');
  expect(unnamedControls(container)).toEqual([]);
});
it('names the manual-copy box in GitHubIssueAction', async () => {
  vi.mocked(copyText).mockResolvedValueOnce(false); // browser.js mocked as in github-issue-action.test.tsx
  const { container } = render(
    <GitHubIssueAction repo="acme/web" token={'lc1.' + 'A'.repeat(9000)} count={1} label="Open" />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Copy change block' }));
  const box = await screen.findByTestId('manual-copy');
  expect(box.getAttribute('aria-label')).toBe('Issue text to copy');
  expect(unnamedControls(container)).toEqual([]);
});
it.each(Object.keys(FIXTURES) as FixtureName[])('names every control in %s', (name) =>
  expect(unnamedControls(renderFixture(name))).toEqual([])
);
```

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
  - `KeysDirectory` prop `onKeyActivatedByKeyboard?: (key: string) => void`, called after `selectKeyDirectly(key)` when `event.detail === 0`. Scope buttons get `aria-pressed`; the active key button `aria-current="true"`.
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
- [ ] **Step 5: Add the E2E journeys** to `tests/e2e/a11y-keyboard.spec.ts` (1440x900 unless stated; wait for `connection-status` connected)

```ts
test('picks a key from the list and lands in the editor by keyboard', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Search keys or values' }).focus();
  await page.keyboard.type('home.welcome_msg');
  await page
    .getByRole('button', { name: /home\.welcome_msg/ })
    .first()
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#studio-translation-input')).toBeFocused();
});
test('opens and closes Changes by keyboard', async ({ page }) => {
  await page.locator('#studio-changes-button').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Changes' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#studio-changes-button')).toBeFocused();
});
test('opens the Keys drawer by keyboard at 1024x768 and returns focus on Escape', async ({
  page,
}) => {
  await page.getByTestId('studio-toggle-keys').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Search keys or values' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('studio-drawer-keys')).toBeHidden();
  await expect(page.getByTestId('studio-toggle-keys')).toBeFocused();
});
// Review Focus 4
test('reaches the language and theme controls by keyboard in Arabic', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'ar'), STUDIO_LANGUAGE_KEY);
  await page.goto('http://localhost:3010');
  // wait for connection-status connected
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

- [ ] **Step 6: Run the E2E.** `npm run build`, then `npx playwright test tests/e2e/a11y-keyboard.spec.ts tests/e2e/responsive-layout.spec.ts` — all pass (5 in a11y-keyboard).
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

- [ ] **Step 1: Write the failing test**

```tsx
it('keeps the save status mounted and fills it on success', () => {
  const { rerender } = render(<TranslationEditor {...editorProps} isSuccess={false} />);
  expect(screen.getByTestId('save-status').getAttribute('role')).toBe('status');
  expect(screen.getByTestId('save-status').textContent).toBe('');
  rerender(<TranslationEditor {...editorProps} isSuccess />);
  expect(screen.getByTestId('save-status').textContent).toBe('Saved');
});
it('announces a save error and a save warning as alerts', () => {
  render(
    <TranslationEditor
      {...editorProps}
      error="Disk is read-only"
      saveWarning={{ message: 'Placeholder {name} is missing' } as any}
    />
  );
  const texts = screen.getAllByRole('alert').map((a) => a.textContent);
  expect(texts).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Disk is read-only'),
      expect.stringContaining('Placeholder {name} is missing'),
    ])
  );
});
it('announces the commit result as status and a git error as alert', () => {
  renderPanel({ lastCommit: 'abc1234' });
  expect(screen.getByRole('status').textContent).toContain('Committed as abc1234');
  cleanup();
  renderPanel({ gitError: 'Nothing to commit' });
  expect(screen.getByRole('alert').textContent).toBe('Nothing to commit');
});
it('announces a locale manager error as an alert', () => {
  render(
    <LocaleManager
      locale="en"
      locales={['en', 'ar']}
      isLoading={false}
      error='Locale "de" already exists.'
      onAddLocale={vi.fn()}
      onRenameLocale={vi.fn()}
      onDeleteLocale={vi.fn()}
    />
  );
  expect(screen.getByRole('alert').textContent).toContain('Locale "de" already exists.');
});
it('announces a rename error and a delete error in a locale row as alerts', async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error('Locale file is locked'));
  render(
    <LocaleRow
      code="ar"
      isActive={false}
      isLoading={false}
      allLocales={['en', 'ar']}
      onRename={vi.fn()}
      onDelete={onDelete}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Rename locale ar' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New code for ar' }), {
    target: { value: 'not valid!' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save rename' }));
  expect(screen.getByRole('alert').textContent).toBe('Invalid locale format.');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete locale ar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Locale file is locked');
});
it('announces a SendDialog encode error as an alert and the too-long notice as status', async () => {
  // change-link.js and share/browser.js mocked as in send-dialog.test.tsx; renderDialog() copied from it
  encode.mockRejectedValueOnce(new ChangeLinkError('TOO_LARGE', 'too large'));
  renderDialog();
  expect((await screen.findByRole('alert')).textContent).toMatch(/^Could not create the link:/);
  cleanup();
  encode.mockResolvedValueOnce('lc1.' + 'A'.repeat(6000));
  renderDialog();
  expect(
    (await screen.findByText(/too long for a chat message/)).closest('[role="status"]')
  ).not.toBeNull();
});
it('announces a SendDialog copy failure and a mark-sent failure as alerts', async () => {
  vi.mocked(copyText).mockResolvedValueOnce(false);
  renderDialog();
  await screen.findByRole('textbox', { name: 'Change link' });
  fireEvent.click(document.getElementById('studio-send-copy')!);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Copy did not work in this browser'
  );
  cleanup();
  const { onMarkSent } = renderDialog();
  onMarkSent.mockRejectedValueOnce(new Error('Draft store is full'));
  await screen.findByRole('textbox', { name: 'Change link' });
  fireEvent.click(document.getElementById('studio-send-copy')!);
  expect((await screen.findByRole('alert')).textContent).toBe('Draft store is full');
});
it('announces GitHubIssueAction too-large as status and RepoPrompt malformed as alert', () => {
  render(
    <GitHubIssueAction repo="acme/web" token={'lc1.' + 'A'.repeat(70_000)} count={1} label="Open" />
  );
  expect(screen.getByRole('status').textContent).toBe(
    'Too large for a GitHub issue. Run npx livelocale apply with this link instead.'
  );
  cleanup();
  render(<RepoPrompt onSave={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not a repo' } });
  fireEvent.submit(screen.getByRole('textbox').closest('form')!);
  expect(screen.getByRole('alert').textContent).toBe(
    'Enter it as owner/repo, for example acme/website.'
  );
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-live-regions.test.tsx` — FAIL: no `save-status`, `getByRole('alert')` finds nothing.
- [ ] **Step 3: Add the regions** listed above.
- [ ] **Step 4: Run.** `npx vitest run tests/unit` — PASS; existing `getByRole('status')` queries in SendDialog and DraftList tests still find exactly one match per state.
- [ ] **Step 5: Commit** (after the gate)

```bash
git add src/studio tests/unit/studio-live-regions.test.tsx
git commit -m "feat(studio): announce saves, sends and errors to screen readers"
```

---

### Task 29: AA contrast in both themes and an axe gate in the E2E suite

**Files:**

- Modify: `package.json`, `package-lock.json` (devDependencies `"@axe-core/playwright": "^4.10.2"`, `"axe-core": "^4.10.2"`), `src/studio/index.css` and `tests/unit/helpers/studio-tokens.ts` (token fixes), `tests/e2e/fixtures/dark-styles.json` (states changed by the fixes), components the axe run reports
- Create: `tests/e2e/fixtures/axe.ts`, `tests/e2e/a11y-axe.spec.ts`
- Test: `tests/unit/studio-contrast.test.ts` (new)

**Interfaces:**

- Consumes: `contrastRatio` (Task 25); `cssDecls` (Task 11); `studioFiles` (Task 10); `STUDIO_THEME_KEY`, `STUDIO_LANGUAGE_KEY` (Task 9).
- Produces: `seriousViolations(page: Page): Promise<string[]>` in `tests/e2e/fixtures/axe.ts` — runs `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('#app-preview-iframe').analyze()`, keeps `serious`/`critical` impacts, returns `` `${v.id}: ${node.target.join(' ')}` `` per failing node, sorted.

- [ ] **Step 1: Write the failing token-contrast test**

```ts
const SURFACES = ['app', 'panel', 'raised'];
const TEXT = [
  'fg-strong',
  'fg',
  'fg-soft',
  'fg-muted',
  'fg-subtle',
  'brand-fg',
  'danger-fg',
  'warning-fg',
  'success-fg',
  'info-fg',
];
describe.each([':root', '.dark'] as const)('Studio tokens in %s', (selector) => {
  const t = cssDecls(css, selector);
  const pairs = TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const));
  it.each(pairs)('%s on %s reaches 4.5:1', (fg, bg) =>
    expect(contrastRatio(t.get(`--lc-${fg}`)!, t.get(`--lc-${bg}`)!)).toBeGreaterThanOrEqual(4.5)
  );
});

// fg-faint and fg-fainter stay below 4.5:1 on purpose; WCAG exempts only disabled controls and decoration.
it('uses fg-faint and fg-fainter only for disabled states and aria-hidden decoration', () => {
  expect(faintMisuses('<p className="text-fg-faint">Hint</p>', 'x.tsx')).toEqual([
    'x.tsx:1: text-fg-faint',
  ]);
  expect(faintMisuses('<input className="placeholder-fg-faint" />', 'x.tsx')).toEqual([
    'x.tsx:1: placeholder-fg-faint',
  ]);
  expect(
    faintMisuses(
      '<button className="disabled:text-fg-faint" /><span aria-hidden="true" className="text-fg-fainter">→</span>',
      'x.tsx'
    )
  ).toEqual([]);
  const found = studioFiles('src/studio', /\.tsx$/).flatMap((f) =>
    faintMisuses(readFileSync(f, 'utf8'), f)
  );
  expect(found).toEqual([]);
});
```

`faintMisuses(source, file): string[]` (in the test file) parses with the repo's `typescript` (`ScriptKind.TSX`), visits every `JsxOpeningElement`/`JsxSelfClosingElement`, collects the text of every string or template literal inside its `className` initializer, and reports `` `${file}:${line}: ${cls}` `` for each class matching `/(?<![\w-])((?:[\w-]+:)*)(?:text|placeholder)-fg-faint(?:er)?(?:\/\d+)?(?![\w-])/` unless its variant prefix contains `disabled:` or the element has an `aria-hidden` attribute. Placeholders are not exempt: they are text.

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/studio-contrast.test.ts` — FAIL at least on `.dark` `fg-subtle` (slate-500) on `app`, `panel` and `raised` (about 3.8–4.3:1), and on the `fg-faint`/`fg-fainter` uses for hints and placeholders (e.g. `placeholder-fg-faint` in `LocaleManager.tsx`).
- [ ] **Step 3: Fix the tokens and the faint uses.** For each failing pair, move that token's value in that theme to the nearest step of the same Tailwind hue that passes (e.g. `.dark` `fg-subtle` → `slate-400`), in `index.css` and `TOKENS` together. Never change a passing token. Each reported `fg-faint`/`fg-fainter` use becomes `fg-subtle` (same variants and opacity), or gets `aria-hidden="true"` when it is pure decoration (arrows, separators). Write down every dark shade that changed, for the commit body.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/studio-contrast.test.ts tests/unit/studio-theme-tokens.test.ts tests/unit/studio-focus-ring.test.ts` — PASS (60 contrast cases and the faint-use guard).
- [ ] **Step 5: Install axe and write the gate.** `npm i -D @axe-core/playwright@^4.10.2 axe-core@^4.10.2` (`dependencies` stays absent). Write `seriousViolations` and `tests/e2e/a11y-axe.spec.ts`: one test per (screen × variant), named `` `${variant} ${screen} has no serious axe violations` ``, asserting `expect(await seriousViolations(page)).toEqual([])` once the screen is reached. Where a screen's control has no id or test id, add a `data-testid` (e.g. `manage-languages-toggle`).

  | Variant    | Dev Studio (3010), via `addInitScript`                                                               | Share Studio (3020)                    |
  | ---------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
  | `dark-en`  | defaults                                                                                             | `colorScheme: 'dark'`                  |
  | `light-en` | `STUDIO_THEME_KEY = 'light'`                                                                         | `colorScheme: 'light'`                 |
  | `dark-ar`  | `STUDIO_THEME_KEY = 'dark'`, `STUDIO_LANGUAGE_KEY = 'ar'`; also assert `dir="rtl"` on `studio-root`  | `colorScheme: 'dark'`, `locale: 'ar'`  |
  | `light-ar` | `STUDIO_THEME_KEY = 'light'`, `STUDIO_LANGUAGE_KEY = 'ar'`; also assert `dir="rtl"` on `studio-root` | `colorScheme: 'light'`, `locale: 'ar'` |

  Screens: dev at 1440x900 — `idle` (connected), `editor` (`home.welcome_msg` picked from the key list), `changes` (Changes dialog open), `manage` (Manage Languages toggle pressed), `import` (Import dialog open); dev at 1024x768 — `compact-keys` (Keys drawer open: assert; then Escape, open the side drawer with `studio-toggle-side` after picking `home.welcome_msg`: assert again); share — `tips` (first-run tips), `send` (tips done with name `Sara`, `home.welcome_msg` picked, `Hola` typed and saved as a draft, Send open).

- [ ] **Step 6: Run the gate.** `npm run build`, then `npx playwright test tests/e2e/a11y-axe.spec.ts` — either 32 passed, or failures listing `<rule>: <selector>` per screen.
- [ ] **Step 7: Fix every reported node** at its source: for `color-contrast`, switch the class to a passing token of the same role (e.g. `text-success-fg` → `text-success-fg-strong`) or fix the token value as in Step 3. No rule is disabled; nothing is excluded except `#app-preview-iframe`.
- [ ] **Step 8: Re-record the changed dark states.** `UPDATE_DARK_BASELINE=1 npx playwright test tests/e2e/theme-dark-baseline.spec.ts`; `git diff tests/e2e/fixtures/dark-styles.json` shows only colours the fixes changed.
- [ ] **Step 9: Run the full suites.** `npx vitest run` and `npx playwright test` — all pass (32 in a11y-axe, 5 in a11y-keyboard).
- [ ] **Step 10: Commit** (after the gate). The body lists every dark shade change from Steps 3 and 7, one line each, starting with the `fg-subtle` one.

```bash
git add package.json package-lock.json src/studio tests/unit/helpers/studio-tokens.ts tests/unit/studio-contrast.test.ts tests/e2e/fixtures tests/e2e/a11y-axe.spec.ts
git commit -m "test(studio): fail the E2E suite on serious accessibility violations and meet AA contrast

This intentionally changes the dark look (spec §7 over §8): dark text tokens below 4.5:1 move to the nearest passing step, and hints and placeholders that used fg-faint/fg-fainter move to fg-subtle. The dark baseline is re-recorded for those colours only.

- dark fg-subtle: slate-500 -> slate-400 (every former text-slate-500 is brighter)
- <each further shade change: token or class, old -> new>"
```

---

# Milestone 3: Docs, prerelease smoke check, release

### Task 30: README sections and changesets

**Files:**

- Modify: `README.md` (feature bullet near line 44; `check` usage line; new `### Catch untranslated text before launch` after the `` ### `check` `` section, before `` ### `pack` ``; a paragraph at the end of `### 5. Launch the Visual Studio`)
- Create: `.changeset/check-hardcoded.md`, `.changeset/studio-arabic.md`, `.changeset/studio-light-theme.md`, `.changeset/studio-accessibility.md`
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
    'The Studio speaks English and Arabic',
    'System, Light or Dark',
    'visible focus ring',
  ])
    expect(prose).toContain(s);
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/unit/readme-check.test.ts` — FAIL on the missing heading.
- [ ] **Step 3: Write the README.** The new section covers, in order: what it finds (the three kinds, their levels, `--strict`); `npx livelocale check --hardcoded` and a GitHub Actions `- run: npx livelocale check --hardcoded` step; the opt-outs (`// livelocale-ignore-next-line`, `{/* livelocale-ignore-next-line */}`, either on the line above the text or on the line above the element that holds it, which is where Prettier leaves it for multi-line JSX, `livelocale-ignore-file` at the top of a file, `--allow <word>`, a `livelocale.allow` sample with `LiveLocale`, `GitHub` and `key:checkout.brand`); what is skipped (tests, stories, mocks, fixtures, `.storybook`, `e2e`, `cypress`, `.d.ts`, ignored folders, code-like strings); the limits: "Only JSX is checked" (no Vue, Svelte, Angular or HTML templates, no object literals such as page metadata) and "text built at run time is not seen"; the requirement: it "uses your project's own `typescript`; without it the other checks still run and the command exits with code 2", with `npm install -D typescript`. The `check` usage line gains `[--hardcoded] [--allow <word>]`; the feature bullet gains "and, with `--hardcoded`, text that never went through translation". The Studio paragraph: "The Studio speaks English and Arabic; the share link follows the browser language, and the switch is in the header. Share links also follow your system's light or dark setting; the dev Studio stays dark until you pick System, Light or Dark. Every control works by keyboard, with a visible focus ring." Wrap prose at 100 columns.
- [ ] **Step 4: Write the changesets**, each with front matter `'livelocale': minor`:
  - `check-hardcoded.md`: "`livelocale check --hardcoded` finds JSX text that never went through translation, translations identical to the source locale, and translations in the wrong script, and fails CI on hardcoded text. Without the flag, `check` behaves as before."
  - `studio-arabic.md`: "The Studio is available in Arabic with a right-to-left layout."
  - `studio-light-theme.md`: "The Studio has a light theme. Share links follow the system setting; the dev Studio stays dark until you choose System, Light or Dark in the header."
  - `studio-accessibility.md`: "The Studio shows a visible keyboard focus ring, names every control, works fully by keyboard, announces saves, sends and errors, and meets WCAG AA contrast."
- [ ] **Step 5: Run.** `npx vitest run tests/unit/readme-check.test.ts tests/unit/readme-share.test.ts`, then `npm run format:check` — PASS, exit 0.
- [ ] **Step 6: Commit** (after the gate)

```bash
git add README.md .changeset/check-hardcoded.md .changeset/studio-arabic.md .changeset/studio-light-theme.md .changeset/studio-accessibility.md tests/unit/readme-check.test.ts
git commit -m "docs: document check --hardcoded and the Studio's Arabic, light theme and keyboard support"
```

---

### Task 31: `0.11.0-next` prerelease and the smoke check on Translation-Test

**Files:** none in this repo unless the smoke check finds a false alarm (then the files of Task 1 or Task 4 and their tests).

**Interfaces:**

- Consumes: the Publish workflow's manual run (`.github/workflows/publish.yml`, input `prerelease_base`), which publishes `<base>-next.<run number>` to the `next` dist-tag without a commit or changeset.
- Produces: a verified `livelocale@next`.

- [ ] **Step 1: Full local gate.** `npm run build; npm run test:coverage; npx playwright test; npm run typecheck; npm run lint; npm run format:check` — all exit 0.
- [ ] **Step 2: Publish the prerelease (owner action).** Ask the owner to push `main` and run Actions → Publish to NPM → Run workflow with `prerelease_base` = `0.11.0` (or, only after the owner says yes in chat, `gh workflow run publish.yml -f prerelease_base=0.11.0`). Verify: `npm view livelocale dist-tags.next` prints `0.11.0-next.<n>`.
- [ ] **Step 3: Set up the demo repo in the scratchpad.** `git clone https://github.com/Araby99/Translation-Test <scratchpad>/tt`, `cd <scratchpad>/tt`, `npm ci`, `npm i -D livelocale@next --no-save`. Nothing is committed or pushed to the demo repo.
- [ ] **Step 4: Without the flag nothing changes.** Run `npx livelocale check > next.txt; echo $?` and `npx -y livelocale@0.10.1 check > old.txt; echo $?` — same exit code, and `diff old.txt next.txt` is empty.
- [ ] **Step 5: With the flag.** `npx livelocale check --hardcoded; echo $?` — exit 0 or 1, never 2 (the demo has `typescript`). `npx livelocale check --hardcoded --json` — no `setupProblems` key.
- [ ] **Step 6: Judge every finding.** Each `hardcoded` finding must be visible text that really never went through translation; each `untranslated`/`wrong-script` warning must be a real identical or Latin value. Any false alarm blocks the release: add it as a failing case to `tests/unit/hardcoded-text.test.ts` or `tests/unit/hardcoded-jsx.test.ts`, fix, commit `fix(check): <what was misread>`, and repeat Steps 1–6 with a new prerelease.
- [ ] **Step 7: Report** to the owner the prerelease version, the exit codes, and the finding counts by kind with one line per finding judged real.

---

### Task 32: Prepare the 0.11.0 release commit

**Files:**

- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md` (by `npm run version`); the four `.changeset/*.md` files are consumed

**Interfaces:**

- Consumes: Task 24 Step 6 (owner approved the Arabic copy, including the accessibility keys) and Task 31 (smoke check passed with no false alarms).
- Produces: one release commit. The owner pushes it and creates the GitHub release `v0.11.0`; the publish workflow then publishes to `latest`. This task never creates the release, tags or publishes.

- [ ] **Step 1: Confirm the two preconditions** in the conversation history; stop and ask the owner if either is missing.
- [ ] **Step 2: Apply the changesets.** `npm run version` — `package.json` `version` is `0.11.0`; `CHANGELOG.md` starts with a `## 0.11.0` section listing the four changes; `.changeset/` holds only `README.md` and `config.json`.
- [ ] **Step 3: Verify.** `npm run build; npm test; npx playwright test; npm run typecheck; npm run lint; npm run format:check` — all exit 0; `node -p "require('./package.json').dependencies"` prints `undefined`.
- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md .changeset
git commit -m "chore: release 0.11.0"
```

- [ ] **Step 5: Hand off.** Tell the owner: push `main`, then create a GitHub release tagged `v0.11.0` from that commit.

---

## Shared contracts

Interface index: where each shared name is defined and who uses it.

| Interface                                           | Plan uses                                                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preferences module                                  | One module `src/studio/preferences.ts` (Task 9): types, keys, stored readers, savers, both defaults                                                                                                                          |
| Pref names and storage keys                         | `PrefName` `'studio-language'`, `'studio-theme'`; keys `livelocale:studio-language`, `livelocale:studio-theme`, exported as `STUDIO_LANGUAGE_KEY`, `STUDIO_THEME_KEY`                                                        |
| Share vs dev detection                              | `isShareStudio(): boolean` in `runtime.ts` (static runtime, or a share folder whose manifest is missing); `defaultThemeChoice(isShareStudio)`, `initialThemeChoice({ stored, isShareStudio })`, `useTheme(isShareStudio)`    |
| `StudioLanguage`, `STUDIO_LANGUAGES`                | Defined in `preferences.ts`, re-exported by the catalogue                                                                                                                                                                    |
| `ThemeChoice`, `THEME_CHOICES`, `storedThemeChoice` | In `preferences.ts`                                                                                                                                                                                                          |
| Header slot                                         | `settings?: ReactNode` in `data-testid="header-settings"`, after `#studio-changes-button`, before the version badge, always visible; `LanguageToggle` then `ThemeToggle`                                                     |
| Theme control selectors                             | Buttons carry `data-theme-choice`, so tests work in Arabic                                                                                                                                                                   |
| Theme labels                                        | `THEME_LABELS` constant and its `dashboard/index.ts` export in Task 16, both removed in Task 21 for `theme.group/system/light/dark` keys                                                                                     |
| Document root `dark` class                          | Unconditional in `main.tsx` from Task 11; replaced in Task 16 by the system setting before `startStudio` and the resolved choice in `.finally`                                                                               |
| Hardcoded scan                                      | `findHardcodedText(ts, sourceText, fileName, allow, options?: { templates?: boolean })` (Task 4); `loadProjectTypeScript(dir): Promise<{ ts } \| { problem }>`, `TYPESCRIPT_MISSING`, `typescriptUnusable(version)` (Task 5) |
| Focus ring colour                                   | Studio token `focus` (`--lc-focus`, light `blue-600`, dark `blue-500`); `TOKENS` has 60 entries from Task 25                                                                                                                 |
| Contrast inputs                                     | `--lc-*` tokens via `cssDecls`; `contrastRatio` accepts hex and `oklch()` (Task 25)                                                                                                                                          |
| Token table and parsing                             | `tests/unit/helpers/studio-tokens.ts`: `TOKENS`, `tailwindPalette`, `resolveColour`, `cssDecls`, `darkEquivalent` (Task 11)                                                                                                  |
| Studio file walker and colour classes               | `tests/unit/helpers/studio-files.ts`: `studioFiles(dir, ext?)`; `tests/unit/helpers/colour-classes.ts`: `colourUtilities(source)` (Task 10, deleted with the snapshot in Task 14)                                            |
| Baseline capture                                    | `tests/e2e/fixtures/styles.ts`: `STYLE_PROPS`, `captureStyles` (Task 10)                                                                                                                                                     |
| Studio copy sweep                                   | Reuses `findHardcodedText` (Task 4) with `templates: true` and the words `LiveLocale`, `English`; the E2E `expectNoEnglish` uses `isMostlyLatin` (Task 2)                                                                    |
| A11y test helpers                                   | `tests/unit/helpers/a11y.ts`: `unnamedControls`, `FIXTURES`, `renderFixture` (Task 26)                                                                                                                                       |
| E2E readiness wait                                  | `ACTIVE` until Task 21; `connection-status` with `data-status="connected"` after it                                                                                                                                          |
| Dark baseline changes                               | Task 11 (`body` only), Task 25 (`dev.focus` only), Task 29 (only the colours its fixes change)                                                                                                                               |
| New accessible names                                | Catalogue keys with Arabic from the start (table in Task 26)                                                                                                                                                                 |
| README and changesets                               | All in Task 30                                                                                                                                                                                                               |
| Owner Arabic review                                 | Handoff in Task 24 Step 6; checked in Task 32 Step 1                                                                                                                                                                         |

## Review notes

Critic findings applied in full: 1–8, 10–20. Partly applied or applied differently:

- **Finding 9, capping the peer range at `<7`: not applied.** The separate setup message for an installed `typescript` without the compiler API is added (Task 5, Task 7). The cap is not: npm validates an optional peer's range when the package is present, so a project on a future `typescript` 7 would get an install-time peer conflict from LiveLocale, blocking installs to protect one optional feature. The clear exit-2 message already tells that user what is wrong.
- **Finding 2, baseline coverage:** the reachable states were added (Manage Languages, a plural key, the confirm modal, the share draft list, the share review panel). The locale picker opens only on an ambiguous locale detection, which no E2E fixture triggers, so it and the other unreachable components (TokenModal, RepoPrompt, GitHubIssueAction, SetupProblems, EmptySelection) are covered by the critic's alternative in a form that needs no git history: a colour-class snapshot recorded before the migration (Task 10) that every migrated class must map back to through `darkEquivalent` (Tasks 11–14).
- **Finding 5, faint tokens:** applied as the exemption route, but stricter than suggested: placeholders are not exempt (WCAG treats placeholder text as text), so only `disabled:` states and `aria-hidden` decoration may use `fg-faint`/`fg-fainter`; Owner flag 3 records the visual effect.
- **Finding 13, side drawer in axe:** added to the existing `compact-keys` screen as a second assertion rather than a new screen, so the gate stays at 8 screens × 4 variants = 32 tests.
- **Self-Review, proportion:** the plan remains long against the spec. The "Drafts said" column and the Self-Review section are gone (finding 20); what remains is mostly test code with the spec's exact values, which findings 10, 11 and 12 asked to be written out in full. No implementation bodies were added.
- **Finding 17, loading flash:** with the Task 16 change (follow the system before `startStudio`), the share Studio under a dark system is dark from its first render (pinned in `theme.spec.ts`). The instant before `main.tsx` runs keeps today's light `body`, because `src/studio/index.html` stays unchanged; that flash is accepted explicitly in the milestone constraints.
