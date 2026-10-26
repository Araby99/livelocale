# Share Link On Any Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship milestone A as `livelocale@0.9.0`: a share link with no credentials, served from any static host at `<base>livelocale/index.html`. Translators Alt+Click, keep fixes as drafts in their own browser, and send an `lc1.` change link that `npx livelocale apply "<link>" --pr` turns into a pull request on any git host. Then ship milestone B as `livelocale@0.10.0`: one-click pull requests on GitHub through a generated workflow (`apply --github-event`), Create pull request and Open on GitHub buttons, Import change link, Live-now reconciliation and `init --share` for every supported stack.

**Architecture:** A browser-safe shared core (the write rules in `save-rules`, `lookupKey`, the `lc1` codec, the apply planner, the share manifest and `flag.js`) feeds four consumers: the client runtime (same-origin parent default, framed-only flag); the pack layer (`livelocale pack`, `livelocale build`, Vite `share: true`), which writes the Studio, `manifest.json`, the locale files and `flag.js` into the build output; the Studio's static transport and UI (IndexedDB drafts, re-apply loop, locale inference, Send, Review mode); and `livelocale apply` (local `--pr` in A, the GitHub Action path in B). For server stacks the router stays byte-identical; only its validation moves into `save-rules`.

**Tech Stack:** TypeScript 5.9, tsup, Vite (Studio and plugin), React 18, Tailwind, Vitest (jsdom, `fake-indexeddb`), Playwright, Web Streams `CompressionStream`/`DecompressionStream`, Node `zlib`, IndexedDB, GitHub REST and Git Data APIs, GitHub Actions, Changesets.

**Spec:** docs/superpowers/specs/2026-10-26-share-link-any-host-design.md

## Global Constraints

- **Change link format.** The token is `lc1.` followed by base64url (RFC 4648 §5, no padding) of zlib-format deflate (`CompressionStream('deflate')`) of the JSON `{v:1, repo?, branch, base, src, by, note, e:[[locale,key,from,to,force?]]}`.
- **Caps from the spec.** A change link holds at most 500 edits (`MAX_CHANGE_EDITS = 500`) and at most 512 KB after inflation (`MAX_INFLATED_BYTES = 524_288`). Both caps are enforced on encode and on decode, in the browser and in Node.
- **Value limits.** A value is at most 10,000 characters (existing `MAX_VALUE_LENGTH`). A key path is 1–200 characters and rejects `__proto__`, `constructor` and `prototype` segments.
- **Link size.** Send offers a file instead of a link above 6,000 link characters (`CHANGE_LINK_FILE_THRESHOLD = 6_000`). 20 Arabic edits must encode to fewer than 1,900 characters.
- **Limits this plan sets (the spec leaves them open).**
  - `MAX_TOKEN_CHARS = 1_000_000`, `MAX_BY_CHARS = 100`, `MAX_NOTE_CHARS = 2_000`.
  - Send name and note fields: 80 and 500 characters.
  - `apply` input: 1 MB (`1_048_576` bytes).
  - Prefilled issue URL: 8,000 characters. Issue body: 65,536 characters.
  - Note that cmd.exe caps arguments at 8,191 characters.
- **Share folder.** The build writes `<outDir>/<base>livelocale/` containing `index.html`, `assets/`, `manifest.json` (`format: 1`), `locales/<code>.json` and `flag.js`. The folder name has no underscore, because Jekyll on GitHub Pages would drop it.
- **Share link.** It is `<origin><base>livelocale/index.html` and always ends in `index.html`, because S3 REST origins do not resolve folder indexes.
- **Flag tag.**
  - Every app HTML file gets `<script src="<base>livelocale/flag.js"></script>` as the first child of `<head>`.
  - The `src` is absolute when the base is absolute. The tag never has `async`, `defer` or `type`.
  - Next.js outputs skip the injection.
  - `flag.js` sets `window.__LIVELOCALE_FLAG__ = 'preview'` only inside a same-origin parent whose path is under the Studio folder.
- **Opt-in.** Nothing is written unless `liveLocaleVite({ share: true })`, `livelocale pack` or `livelocale build` runs.
- **Repository slug.** `exposeRepo` defaults to `false`. Unless it is `true`, the manifest has no `repo` key, the link has no `repo` field, and "Open on GitHub" is hidden.
- **Studio page.** It is `noindex, nofollow`, loads nothing from third parties, and is built with Vite `base: './'`.
- **Drafts.** They live in IndexedDB database `livelocale-drafts`, version 1, store `drafts`, keyed by `[scope, locale, key]`. The scope is the repository slug, or `path:<app pathname>` when there is none. Each draft records the build's base SHA.
- **Mode names.** The Studio mode is `static`, so the Studio's `LiveLocaleMode` is `'off' | 'development' | 'preview' | 'static'`. The modes in `src/core/env.ts` do not change.
- **Validation authority.** `apply`, both local and on the Action, re-validates every edit. It recomputes the placeholder reference from the target's source locale and ignores any client `reference`. It never honours a client `force` without a maintainer: `--force` locally, or a `/livelocale apply --force` comment on GitHub.
- **Workflow file.**
  - Path and name: `.github/workflows/livelocale.yml`, `name: LiveLocale`.
  - `permissions: { contents: write, pull-requests: write, issues: write }`.
  - `concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }`.
  - `actions/checkout` is pinned by SHA, and the step runs `npx --yes livelocale@<exact-version> apply --github-event`.
  - The payload is read only from `$GITHUB_EVENT_PATH` and is never interpolated into `run:`.
  - No `pull_request_target` trigger.
  - It must be on the default branch, and on every other branch in `--branches`, because a pull request into a branch runs that branch's copy (Task 58 notes it, Task 65 documents it).
- **Action writes.**
  - One commit per batch, through the Git Data API, only under `localesPath`.
  - Either on a new branch: `livelocale/issue-<n>`, or `livelocale/issue-<n>-<runId>` when that name exists without an open PR into the same target, or `livelocale/run-<id>`.
  - Or as one fast-forward commit (`force: false`) on `livelocale/issue-<n>` while its PR into the same target is still open. This is what makes the spec's "opens or reuses the PR" possible (see "Cross-draft reconciliations").
  - Never on the default branch, and never a ref update with `force: true`.
- **Trust gate.** The triggering user's `author_association` must be OWNER, MEMBER or COLLABORATOR: the issue author for `issues`, the commenter for `issue_comment`. Otherwise `GET /collaborators/{user}/permission` for that same user must return write or higher. Anyone else gets the reply "Waiting for a maintainer: comment `/livelocale apply`", and nothing is written.
- **Target branch.** The link's `branch` is used only when it is in the workflow's `--branches` allow-list, which defaults to the repository's default branch. The PR body says `Closes #n` only when the target is the default branch.
- **Action commit author.** The triggering maintainer, as `<id>+<login>@users.noreply.github.com`, plus a `Translated-by:` trailer.
- **Local branch name.** `apply --pr` creates `livelocale/apply-<YYYYMMDD-HHmmss UTC>`, with `-2`, `-3`, … appended while that name already exists locally or on `origin`.
- **Server stacks unchanged.** `vite dev` and `next dev` behave as before, and `src/server/router.ts` responses stay byte-identical (status, body and key order).
- **Browser-safe core.** These files import no Node built-ins, use no `Buffer` or `process.`, and use no regex lookbehind: `src/core/{save-rules,change-link,json-path,placeholders,validate,share-manifest,flag-script,apply-plan}.ts`. Node-only code goes in `src/core/change-link-node.ts`, which nothing under `src/studio` or `src/client` imports.
- **CLI-only FileMutator option.** `new FileMutator({ requireEnabled: false })` is for CLI tools only. No server adapter (router, next-handler, or the serve half of vite-plugin) passes it.
- **No values in logs.** Translation values are never logged (SEC-001). Terminal and Action output show only locale, key and status.
- **Dependencies and platform.** No runtime dependencies. New packages go in `devDependencies` only: `fake-indexeddb`, `@fontsource/inter`, `@fontsource/outfit`. License MIT. Node >= 18 (CI runs Node 20).
- **Releases.** A ships as `0.9.0` after its E2E passes. B ships as `0.10.0` after a `0.10.0-next.N` build on the `next` dist-tag passes the sandbox smoke test. The owner creates GitHub releases and publishes; release tasks only prepare the commit and hand off.
- **Commit messages.** Use conventional messages. Never mention Claude, Anthropic or AI. No `Co-Authored-By` trailer and no "Generated with" line. Every implementer subagent's dispatch prompt repeats this rule.

## Review Focus

No drafted test exercised these five inputs. Each line names the input and the behaviour expected; each now has a pinning test in the owning task.

1. **Studio opened under `/livelocale/` without a usable manifest.** The host has no `livelocale/manifest.json`, or its SPA fallback answers that URL with the app's HTML and status 200.
   - Expected: the Studio shows the setup problem `STATIC_MANIFEST_MISSING`, which names the fix, before and without any connection to the app.
   - It must never silently point at `http://localhost:3000`: no app iframe and no "The app is not running" help is rendered.
   - Pinned in **Task 27** (`names the fix when a /livelocale/ Studio finds no manifest`), **Task 32** (`blocks the app preview when a /livelocale/ Studio has no manifest`) and **Task 50** (`names the fix instead of pointing at localhost when the manifest is missing`).
2. **A change link damaged in transit.** A mail client hard-wraps the token across lines, inserts a quoted-printable `=\n` soft break, or cuts it short.
   - Expected: decoding fails with `CORRUPT`, and the Studio tells the person to send the file instead.
   - A partial batch is never applied.
   - Pinned in **Task 7** (`fails loudly on a link hard-wrapped by a mail client`) and **Task 38** (CORRUPT copy).
3. **Text that differs only by Unicode normalization.** For example the target file holds NFC `U+00E9` while the link's `from` holds NFD `e` + `U+0301`. This is what an editor or clipboard can produce for Arabic, Persian or Latin text.
   - Expected: the edit is a `conflict` that shows the current value.
   - It is never reported as `already` done and never applied silently. Text is not normalized anywhere on the write path.
   - Pinned in **Task 10** (`treats text that differs only by Unicode normalization as a conflict`), which covers a `from` that differs (conflict), a matching `from` (apply) and a `to` that differs from the current value only by normalization (conflict, never `already`).
4. **Literal dotted keys in a locale file,** such as `{"a.b": "x"}`.
   - Expected: `lookupKey` reports `occupied`. A Studio save then fails with 409 `KEY_NOT_A_STRING`, and `apply` marks the edit `invalid`.
   - Nothing writes a nested `{"a":{"b":…}}` duplicate that the app would never read.
   - Pinned in **Task 1** (`refuses a literal dotted key instead of walking past it`), **Task 3** (`refuses to shadow a literal dotted key`), **Task 30** (`refuses to save over a literal dotted key`) and **Task 10** (`marks an edit to a literal dotted key invalid`).
5. **A relative app base with client-side deep routes.** Examples are Vite `base: './'` and CRA `homepage: '.'`. On a deep route served by the SPA fallback, `./livelocale/flag.js` resolves under the route and the flag never loads.
   - Expected: `pack`, `build` and the Vite plugin print `RELATIVE_BASE_WARNING`, which recommends an absolute `--base`.
   - The manifest records `basePath: null`.
   - Pinned in **Task 21** (`uses per-file relative paths for a relative base`), **Task 23** (`passes the relative-base warning through`) and **Task 24** (`forwards pack warnings to the Vite logger`).

---

## Milestone A: share link on any host

**Conventions for every task:**

- **Test environments.** A test that touches the DOM starts with `// @vitest-environment jsdom`. Codec and inflater tests start with `// @vitest-environment node`.
- **Coverage.** Thresholds are 85/70/85/85. New `.ts` modules count toward them. Components (`*.tsx`) and `useStudio.ts` are excluded and are covered by Playwright.
- **Task routine.**
  1. Write the failing test.
  2. Run it and see the stated failure.
  3. Implement.
  4. Run it and see it pass.
  5. Commit with the exact message given.
- **Expected lines.** Every run step (a command whose result decides what happens next) carries an `Expected:` line. Write, implement and commit steps carry none; the run step that follows each one carries it.
- **Test specifications.** An `it` (or `test`) name followed by a trailing comment is the full specification of that test: the implementer writes a body that asserts exactly that input ⇒ output, using the task's fixture and helpers. A name without a comment is used only where the name itself states the input and the output.
- **Gate before every commit.** `npm run typecheck` and `npm run lint` exit 0. Run `npm run format:write` when `format:check` fails.
- **Rendering translator text.** Translator-supplied text (`by`, `note`, `from`, `to`) renders as React text with `dir="auto"`, never through `dangerouslySetInnerHTML`.
- **Shared CLI file.** `src/codemod/index.ts` (`COMMANDS`, `printHelp`, `getDirname`) is edited by Tasks 21, 22, 23, 47, 49, 57 and 58, one after another. Task 21 only moves `getDirname`; each other task adds only its own command and help lines.
- **Short paths in Studio tasks.** `hooks/…` and `components/…` are under `src/studio/features/dashboard/`. A bare `useStudio.ts`, `useDrafts.ts`, `useReview.ts` or other `use*.ts` is in `src/studio/features/dashboard/hooks/`. A bare `Header.tsx`, `EditorPanel.tsx`, `ReviewPanel.tsx` or other component `*.tsx` is in `src/studio/features/dashboard/components/`. A bare `index.ts` in a Studio task is `src/studio/features/dashboard/index.ts`, and `app.tsx` is `src/studio/app.tsx`.
- **Test helpers.** Shared test helpers live in `tests/unit/helpers/`.

### Task 1: Read a dotted key without overwriting data (`lookupKey`)

**Files:**

- Modify: `src/core/json-path.ts`
- Test: Create `tests/unit/json-path.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:

  ```ts
  export type KeyLookup =
    | { state: 'string'; value: string }
    | { state: 'missing' }
    | { state: 'occupied' };
  export function lookupKey(dict: unknown, keyPath: string): KeyLookup;
  ```

  - **Walk.** The walk follows the dotted segments through **own** properties only (`Object.prototype.hasOwnProperty.call`). This is the same nested walk that `setNestedProperty` writes through.
  - **`missing`.** Returned when a segment is absent, or when `dict` is not a plain object.
  - **`occupied`.** Returned when a write through `setNestedProperty` would overwrite data or create an unreadable duplicate:
    - an intermediate value is not a plain object;
    - the final value is not a string;
    - at any level, an own property whose name equals the remaining dotted path exists (a literal dotted key such as `"a.b"`).

- [ ] **Step 1: Write the failing test** in `tests/unit/json-path.test.ts`.
  ```ts
  const dict = { a: { b: 'text', n: 5, nul: null, arr: ['x'], obj: {} }, s: 'top' };
  it('returns the string at a nested key', () =>
    expect(lookupKey(dict, 'a.b')).toEqual({ state: 'string', value: 'text' }));
  it.each(['a.c', 'x.y.z'])('reports %s as missing', (k) =>
    expect(lookupKey(dict, k)).toEqual({ state: 'missing' })
  );
  it.each(['a', 'a.n', 'a.nul', 'a.arr', 'a.obj', 's.deeper', 'a.arr.0'])(
    'reports %s as occupied (a write would replace data)',
    (k) => expect(lookupKey(dict, k)).toEqual({ state: 'occupied' })
  );
  it('reads own properties only', () => {
    expect(lookupKey(dict, 'constructor')).toEqual({ state: 'missing' });
    expect(lookupKey({}, 'toString')).toEqual({ state: 'missing' });
    expect(lookupKey(dict, 'a.__proto__')).toEqual({ state: 'missing' });
  });
  it('refuses a literal dotted key instead of walking past it', () => {
    // Review Focus 4
    expect(lookupKey({ 'dotted.key': 'literal' }, 'dotted.key')).toEqual({ state: 'occupied' });
    expect(lookupKey({ a: { 'b.c': 'x' } }, 'a.b.c')).toEqual({ state: 'occupied' });
  });
  it('treats a non-object dictionary as empty', () => {
    expect(lookupKey(undefined, 'a')).toEqual({ state: 'missing' });
    expect(lookupKey(['x'], '0')).toEqual({ state: 'missing' });
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/json-path.test.ts`. Expected: FAIL with `lookupKey is not a function`.
- [ ] **Step 3:** Implement `lookupKey` in `src/core/json-path.ts` with the semantics above.
- [ ] **Step 4:** Run `npx vitest run tests/unit/json-path.test.ts`, then `npm run typecheck`. Expected: PASS, then exit 0.
- [ ] **Step 5:** Commit `feat(core): add lookupKey to read a dotted key without overwriting data`.

---

### Task 2: Extract the write rules into `save-rules.ts` (`validateWrite`) with an identical router

**Files:**

- Create: `src/core/save-rules.ts`
- Modify: `src/server/router.ts`, specifically the tail of `handlePost` after the `deleteLocale` branch, plus the imports that become unused.
- Modify: `ARCHITECTURE.md`.
  - §3b now ends: "`validateWrite` in `src/core/save-rules.ts` runs both on every write unless `force: true`".
  - In §4, the `validate.ts`/422 bullet now says the rules live in `validateWrite`, so that code outside the router can apply the same ones.
- Test: Create `tests/unit/save-rules.test.ts`. Modify `tests/unit/router-validate.test.ts`.

**Interfaces:**

- Consumes:
  - `isValidLocaleFormat`, `isValidKeyFormat`, `isSafeKeyPath` and `isValidValueFormat` from `src/core/validate.ts`.
  - `comparePlaceholders` and `validateMessageSyntax` from `src/core/placeholders.ts`.
- Produces:

  ```ts
  export type WriteRuleCode =
    | 'INVALID_LOCALE_FORMAT'
    | 'INVALID_KEY_FORMAT'
    | 'INVALID_VALUE_FORMAT'
    | 'MESSAGE_SYNTAX'
    | 'PLACEHOLDER_MISMATCH'
    | 'KEY_NOT_A_STRING';
  export interface WriteAccepted {
    ok: true;
    locale: string;
    key: string;
    value: string;
  }
  export interface WriteRejected {
    ok: false;
    status: 400 | 409 | 422;
    code: WriteRuleCode;
    error: string;
    details?: { missing: string[]; extra: string[] }; // only for PLACEHOLDER_MISMATCH
  }
  export type WriteVerdict = WriteAccepted | WriteRejected;
  export interface WriteRuleOptions {
    /** Text whose placeholders the value must keep. null, undefined or '' skips the parity check. */
    reference?: string | null;
    /** Skips only the 422 rules (syntax and parity). The format rules always apply. */
    force?: boolean;
  }
  export function validateWrite(
    input: { locale: unknown; key: unknown; value: unknown },
    options?: WriteRuleOptions
  ): WriteVerdict;
  ```

  - **Status 422** means that `force` would let the write through.
  - **Rule order:** locale, then key format, then key safety, then value, then (unless forced) syntax, then parity.
  - **Error strings** are the router's current copy, verbatim:
    - `'Invalid locale string parameter.'`
    - `'Invalid key path. Must be 1-200 characters containing alphanumeric, dots, underscores, or hyphens.'`
    - `'Forbidden key path: segments like __proto__, constructor, or prototype are not allowed.'`
    - `'Invalid value. Must be a string less than 10000 characters.'`
    - `` `Message syntax: ${syntaxError}.` ``
    - `` `Placeholders differ from the reference: ${parts.join('; ')}.` ``

- [ ] **Step 1: Write the router characterization tests** inside the existing `describe` in `tests/unit/router-validate.test.ts`, so its `beforeEach` env stubs apply.
  ```ts
  it.each([
    [
      { locale: 'e', key: 'a', value: 'x' },
      400,
      { error: 'Invalid locale string parameter.', code: 'INVALID_LOCALE_FORMAT' },
    ],
    [
      { locale: 'en', key: 'a b', value: 'x' },
      400,
      {
        error:
          'Invalid key path. Must be 1-200 characters containing alphanumeric, dots, underscores, or hyphens.',
        code: 'INVALID_KEY_FORMAT',
      },
    ],
    [
      { locale: 'en', key: 'a.__proto__', value: 'x' },
      400,
      {
        error:
          'Forbidden key path: segments like __proto__, constructor, or prototype are not allowed.',
        code: 'INVALID_KEY_FORMAT',
      },
    ],
    [
      { locale: 'en', key: 'a', value: 5 },
      400,
      {
        error: 'Invalid value. Must be a string less than 10000 characters.',
        code: 'INVALID_VALUE_FORMAT',
      },
    ],
    [
      { locale: 'en', key: 'a', value: 'Hello {name' },
      422,
      { error: 'Message syntax: Unbalanced braces: missing "}".', code: 'MESSAGE_SYNTAX' },
    ],
    [
      { locale: 'ar', key: 'g', value: 'x {a}', reference: 'Hi {name}' },
      422,
      {
        error: 'Placeholders differ from the reference: missing {name}; unexpected {a}.',
        code: 'PLACEHOLDER_MISMATCH',
        details: { missing: ['{name}'], extra: ['{a}'] },
      },
    ],
    [
      { locale: 'en', key: 'a', value: 'Hello {name', force: 'true' },
      422,
      { error: 'Message syntax: Unbalanced braces: missing "}".', code: 'MESSAGE_SYNTAX' },
    ],
  ])('POST %o keeps a byte-identical response', async (body, status, expected) => {
    const res = await createMutationRouter(mutator, { localesPath: LOCALES }).handle(post(body));
    expect(res.status).toBe(status);
    expect(res.body).toBe(JSON.stringify(expected));
    expect(mutator.updateLocaleKey).not.toHaveBeenCalled();
  });
  it('still ignores a non-string reference and saves', async () => {
    const res = await createMutationRouter(mutator, { localesPath: LOCALES }).handle(
      post({ locale: 'ar', key: 'g', value: 'x {a}', reference: 5 })
    );
    expect(res.status).toBe(200);
    expect(res.body).toBe(JSON.stringify({ success: true, key: 'g', locale: 'ar' }));
    expect(mutator.updateLocaleKey).toHaveBeenCalledWith(LOCALES, 'ar', 'g', 'x {a}');
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/router-validate.test.ts`. Expected: PASS. These tests characterize today's router. If one fails, the expected string in the test is wrong: fix the test, never the router.
- [ ] **Step 3: Write the failing unit tests** in `tests/unit/save-rules.test.ts`, under `describe('validateWrite')`.
  ```ts
  it('accepts and narrows a valid write', () =>
    expect(
      validateWrite(
        { locale: 'ar', key: 'greeting', value: 'مرحبا {name}' },
        { reference: 'Hello {name}' }
      )
    ).toEqual({ ok: true, locale: 'ar', key: 'greeting', value: 'مرحبا {name}' }));
  it.each([
    [
      { locale: 'e', key: 'a', value: 'x' },
      400,
      'INVALID_LOCALE_FORMAT',
      'Invalid locale string parameter.',
    ],
    [
      { locale: 'en', key: 'a b', value: 'x' },
      400,
      'INVALID_KEY_FORMAT',
      'Invalid key path. Must be 1-200 characters containing alphanumeric, dots, underscores, or hyphens.',
    ],
    [
      { locale: 'en', key: 'a.__proto__', value: 'x' },
      400,
      'INVALID_KEY_FORMAT',
      'Forbidden key path: segments like __proto__, constructor, or prototype are not allowed.',
    ],
    [
      { locale: 'en', key: 'a', value: 'x'.repeat(10_001) },
      400,
      'INVALID_VALUE_FORMAT',
      'Invalid value. Must be a string less than 10000 characters.',
    ],
    [
      { locale: 'en', key: 'a', value: 'Hello {name' },
      422,
      'MESSAGE_SYNTAX',
      'Message syntax: Unbalanced braces: missing "}".',
    ],
  ])('rejects %o', (input, status, code, error) =>
    expect(validateWrite(input)).toEqual({ ok: false, status, code, error })
  );
  it('reports placeholder drift with details', () =>
    expect(
      validateWrite(
        { locale: 'ar', key: 'greeting', value: 'مرحبا {الاسم}' },
        { reference: 'Hello {name}' }
      )
    ).toEqual({
      ok: false,
      status: 422,
      code: 'PLACEHOLDER_MISMATCH',
      error: 'Placeholders differ from the reference: missing {name}; unexpected {الاسم}.',
      details: { missing: ['{name}'], extra: ['{الاسم}'] },
    }));
  it('checks rules in router order', () =>
    expect(validateWrite({ locale: 'x', key: 'a b', value: 5 })).toMatchObject({
      code: 'INVALID_LOCALE_FORMAT',
    }));
  it.each([undefined, null, ''])('skips parity for reference %j', (reference) =>
    expect(validateWrite({ locale: 'ar', key: 'g', value: 'مرحبا' }, { reference }).ok).toBe(true)
  );
  it('force skips only the 422 rules', () => {
    expect(
      validateWrite(
        { locale: 'ar', key: 'g', value: 'Hello {name' },
        { reference: 'Hi', force: true }
      ).ok
    ).toBe(true);
    expect(
      validateWrite({ locale: 'ar', key: '__proto__', value: 'x' }, { force: true })
    ).toMatchObject({ ok: false, status: 400 });
  });
  ```
- [ ] **Step 4:** Run `npx vitest run tests/unit/save-rules.test.ts`. Expected: FAIL with `Failed to resolve import "../../src/core/save-rules.js"`.
- [ ] **Step 5: Implement `src/core/save-rules.ts`.** In `router.ts`, replace everything after the `deleteLocale` branch, down to and including the parity block, with:

  ```ts
  const verdict = validateWrite(
    { locale, key, value },
    { reference: typeof reference === 'string' ? reference : null, force: force === true }
  );
  if (!verdict.ok) {
    return json(verdict.status, headers, {
      error: verdict.error,
      code: verdict.code,
      details: verdict.details,
    });
  }
  await mutator.updateLocaleKey(basePath, verdict.locale, verdict.key, verdict.value);
  ```

  - `JSON.stringify` drops `details: undefined`, so the key order stays `error, code[, details]`.
  - `isValidLocaleFormat` stays imported, because the locale actions still use it.
  - The action branches stay untouched.

- [ ] **Step 6:** Run `npx vitest run tests/unit/save-rules.test.ts tests/unit/router-validate.test.ts tests/unit/router-info.test.ts tests/unit/router-git.test.ts tests/unit/next-handler.test.ts tests/unit/pages-handler.test.ts tests/unit/vite-plugin.test.ts`, then `npm run typecheck && npm run lint`. Expected: all PASS, exit 0.
- [ ] **Step 7:** Commit `refactor(core): extract write validation from the router into save-rules`.

---

### Task 3: Validate edits against the source locale (`validateEdit`, `sourceReference`)

**Files:**

- Modify: `src/core/save-rules.ts`. Also `ARCHITECTURE.md` §4: add one sentence saying that `validateEdit` recomputes the reference from the source-locale dictionary and never trusts a client `reference` or `force`.
- Test: Modify `tests/unit/save-rules.test.ts`.

**Interfaces:**

- Consumes: `validateWrite` and `WriteVerdict` (Task 2); `lookupKey` (Task 1).
- Produces:

  ```ts
  export interface SourceContext {
    sourceLocale: string; // apply: its --source argument; Studio: manifest.sourceLocale
    source: Record<string, unknown>; // source-locale dictionary as stored (namespaces merged under their names)
    target?: Record<string, unknown>; // edit locale's dictionary; omitted when that locale has no file
  }
  /** The string at `key` in ctx.source, else null. For a source-locale edit this is its current text. */
  export function sourceReference(key: string, ctx: SourceContext): string | null;
  export function validateEdit(
    edit: { locale: string; key: string; value: string },
    ctx: SourceContext,
    options?: { force?: boolean }
  ): WriteVerdict;
  ```

  - **Check order:**
    1. The 400 format rules from `validateWrite`.
    2. The structure guard. If `lookupKey(edit.locale === ctx.sourceLocale ? ctx.source : ctx.target ?? {}, key).state === 'occupied'`, return `{ ok: false, status: 409, code: 'KEY_NOT_A_STRING', error: \`Cannot save "${key}" in ${locale}: it would replace translations that are not a single text.\` }`. `force` cannot override this.
    3. The 422 rules, with `reference: sourceReference(key, ctx)` and `force: options?.force === true`.
  - Any `reference` or `force` property carried on `edit` is ignored.

- [ ] **Step 1: Write the failing tests** under `describe('validateEdit')`.
  ```ts
  const source = {
    greeting: 'Hello {name}',
    cart: { count: '{n, plural, one {# item} other {# items}}' },
    home: { title: 'Home' },
  };
  const ar = { greeting: 'مرحبا {name}', home: { title: 'الرئيسية' } };
  const ctx: SourceContext = { sourceLocale: 'en', source, target: ar };
  it('recomputes the reference from the source locale', () =>
    expect(validateEdit({ locale: 'ar', key: 'greeting', value: 'مرحبا' }, ctx)).toMatchObject({
      ok: false,
      status: 422,
      code: 'PLACEHOLDER_MISMATCH',
      details: { missing: ['{name}'], extra: [] },
    }));
  it('ignores a reference or force smuggled in with the edit', () =>
    expect(
      validateEdit(
        { locale: 'ar', key: 'greeting', value: 'مرحبا', reference: 'مرحبا', force: true } as never,
        ctx
      )
    ).toMatchObject({ code: 'PLACEHOLDER_MISMATCH' }));
  it('accepts matching placeholders and plural branches', () => {
    expect(validateEdit({ locale: 'ar', key: 'greeting', value: 'أهلا {name}' }, ctx).ok).toBe(
      true
    );
    expect(
      validateEdit(
        { locale: 'ar', key: 'cart.count', value: '{n, plural, zero {لا عناصر} other {# عناصر}}' },
        ctx
      ).ok
    ).toBe(true);
    expect(
      validateEdit({ locale: 'ar', key: 'cart.count', value: '{m, plural, other {# عناصر}}' }, ctx)
    ).toMatchObject({ details: { missing: ['{n}'], extra: ['{m}'] } });
  });
  it('uses the current source text as the reference for a source-locale edit', () => {
    expect(validateEdit({ locale: 'en', key: 'greeting', value: 'Hi' }, ctx)).toMatchObject({
      status: 422,
      details: { missing: ['{name}'] },
    });
    expect(validateEdit({ locale: 'en', key: 'greeting', value: 'Hi {name}' }, ctx).ok).toBe(true);
  });
  it('skips parity, not syntax, for a key the source lacks', () => {
    expect(validateEdit({ locale: 'ar', key: 'promo.banner', value: '{x}' }, ctx).ok).toBe(true);
    expect(validateEdit({ locale: 'ar', key: 'promo.banner', value: '{x' }, ctx)).toMatchObject({
      code: 'MESSAGE_SYNTAX',
    });
  });
  it.each(['home', 'home.title.extra'])(
    'refuses %s even with force (would replace a group or a text)',
    (key) => {
      const v = validateEdit({ locale: 'ar', key, value: 'x' }, ctx, { force: true });
      expect(v).toMatchObject({ ok: false, status: 409, code: 'KEY_NOT_A_STRING' });
      expect(!v.ok && v.error).toMatch(/would replace/);
    }
  );
  it('refuses to shadow a literal dotted key', () =>
    // Review Focus 4
    expect(
      validateEdit(
        { locale: 'ar', key: 'promo.banner', value: 'x' },
        { ...ctx, target: { 'promo.banner': 'قديم' } }
      )
    ).toMatchObject({ status: 409, code: 'KEY_NOT_A_STRING' }));
  it('checks a source-locale edit against the source, not target', () =>
    expect(
      validateEdit({ locale: 'en', key: 'home', value: 'x' }, { ...ctx, target: {} })
    ).toMatchObject({ status: 409 }));
  it('treats a locale without a file as empty', () =>
    expect(
      validateEdit(
        { locale: 'fr', key: 'home.title', value: 'Accueil' },
        { sourceLocale: 'en', source }
      ).ok
    ).toBe(true));
  it('keeps the format rules first', () =>
    expect(
      validateEdit({ locale: 'ar', key: 'home.__proto__', value: 'x' }, ctx, { force: true })
    ).toMatchObject({ status: 400, code: 'INVALID_KEY_FORMAT' }));
  it('force skips syntax and parity', () =>
    expect(
      validateEdit({ locale: 'ar', key: 'greeting', value: 'مرحبا {' }, ctx, { force: true }).ok
    ).toBe(true));
  it('sourceReference returns strings only', () => {
    expect(sourceReference('greeting', ctx)).toBe('Hello {name}');
    expect(sourceReference('home', ctx)).toBeNull();
    expect(sourceReference('nope', ctx)).toBeNull();
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/save-rules.test.ts`. Expected: FAIL with `validateEdit is not a function`. The Task 2 tests still pass.
- [ ] **Step 3:** Implement `sourceReference` and `validateEdit` with the order and copy given above.
- [ ] **Step 4:** Run `npx vitest run tests/unit/save-rules.test.ts`, then `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(core): validate edits against the source locale instead of a client reference`.

---

### Task 4: Flag risky content (`detectRiskFlags`)

**Files:**

- Modify: `src/core/save-rules.ts`
- Test: Modify `tests/unit/save-rules.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces. Both the apply planner (Task 10) and Review mode (Task 42) consume these.

  ```ts
  export type ContentRiskFlag = 'markup' | 'javascript-url' | 'new-url' | 'bidi-control';
  export const RISK_FLAG_MESSAGES: Record<ContentRiskFlag, string>;
  /** Flags only what `value` adds compared with `reference`, in the order of the union above, each at most once. */
  export function detectRiskFlags(reference: string | undefined, value: string): ContentRiskFlag[];
  ```

  - **Rules:**
    - `markup`: a tag name matched by `/<\/?([A-Za-z][\w-]*)\b[^<>]*>/g` that the reference lacks.
    - `javascript-url`: `/\b(?:javascript|vbscript)\s*:/i`, or `/\bdata:[a-z]+\/[\w.+-]+/i`, when the reference lacks it.
    - `new-url`: a match of `/\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi` that is not in the reference's URL set.
    - `bidi-control`: any of U+202A–U+202E or U+2066–U+2069 that the reference lacks. LRM and RLM are not flagged.
  - **Messages:**
    - `markup`: `'Adds markup that the source text does not have.'`
    - `javascript-url`: `'Adds a javascript:, vbscript: or data: link.'`
    - `new-url`: `'Adds a web address that the source text does not have.'`
    - `bidi-control`: `'Contains invisible text-direction control characters.'`

- [ ] **Step 1: Write the failing tests** under `describe('detectRiskFlags')`.
  ```ts
  it('flags script links', () =>
    expect(detectRiskFlags('Go', 'javascript:alert(1)')).toEqual(['javascript-url']));
  it('keeps URLs and markup the reference already has', () => {
    expect(detectRiskFlags('Visit https://acme.com', 'زر https://acme.com')).toEqual([]);
    expect(detectRiskFlags('<b>Hi</b>', '<b>مرحبا</b>')).toEqual([]);
  });
  it('flags new markup and new URLs', () => {
    expect(detectRiskFlags('Hi', 'Hi <img src=x>')).toEqual(['markup']);
    expect(detectRiskFlags('Read', 'اقرأ https://evil.example')).toEqual(['new-url']);
  });
  it('flags bidi overrides but not LRM or RLM', () => {
    expect(detectRiskFlags('x', 'abc\u202Edef')).toEqual(['bidi-control']);
    expect(detectRiskFlags('x', 'abc\u200Fdef')).toEqual([]);
  });
  it('treats a missing reference as empty', () =>
    expect(detectRiskFlags(undefined, '<b>x</b>')).toEqual(['markup']));
  it('has a message for every flag', () =>
    expect(Object.keys(RISK_FLAG_MESSAGES).sort()).toEqual([
      'bidi-control',
      'javascript-url',
      'markup',
      'new-url',
    ]));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/save-rules.test.ts`. Expected: FAIL with `detectRiskFlags is not a function`.
- [ ] **Step 3:** Implement as specified. Do not use regex lookbehind.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): flag new markup, script links, URLs and bidi controls in edits`.

---

### Task 5: Change-link text layer (errors, base64url, token finder, fenced block, repo slug)

**Files:**

- Create: `src/core/change-link.ts`
- Test: Create `tests/unit/change-link.test.ts` (`// @vitest-environment node`) and `tests/unit/core-browser-safe.test.ts`.

**Interfaces:**

- Consumes: nothing.
- Produces:
  ````ts
  export const CHANGE_LINK_PREFIX = 'lc1.';
  export const CHANGE_BLOCK_OPEN = '```livelocale';
  export type ChangeLinkErrorCode =
    | 'NOT_FOUND'
    | 'AMBIGUOUS'
    | 'UNSUPPORTED_VERSION'
    | 'CORRUPT'
    | 'TOO_LARGE'
    | 'TOO_MANY_EDITS'
    | 'INVALID'
    | 'UNSUPPORTED_ENVIRONMENT';
  export class ChangeLinkError extends Error {
    readonly code: ChangeLinkErrorCode;
    constructor(code: ChangeLinkErrorCode, message: string);
  } // name 'ChangeLinkError'; messages never echo payload text
  export function toBase64Url(bytes: Uint8Array): string; // RFC 4648 §5, no padding; btoa over 0x8000-byte chunks
  export function fromBase64Url(text: string): Uint8Array; // CORRUPT on a bad alphabet, '=', length % 4 === 1, or non-canonical trailing bits
  export function fencedChangeBlock(token: string): string; // CHANGE_BLOCK_OPEN + '\n' + token + '\n```\n'
  export function findChangeToken(text: string): string; // returns 'lc1.<data>'
  export function isValidRepoSlug(slug: string): boolean; // /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/, repo part not '.' or '..'
  ````
- `findChangeToken` precedence. This is pinned here, and it does not use lookbehind. 0. **Fenced block.** If `text` contains `CHANGE_BLOCK_OPEN` followed by a line break, keep only the content up to the next line that is exactly ` ``` ` (or the end of the text). Remove all whitespace from it, then apply steps 1–4 to that content only. This lets wrapped lines inside the block join up, and the block wins over other text.
  1. **Mail rewriting.** Rewrite every `%23` (any case) as `#`, because rewriters such as Outlook Safe Links percent-encode the `#`.
  2. **Collect.** Gather the distinct group-1 matches of `/(?:^|[^A-Za-z0-9_-])lc1\.([A-Za-z0-9_-]+)/g`.
  3. **Pick.** If there is exactly one, return it. If there is more than one, throw `AMBIGUOUS`.
  4. **Nothing found.** Throw `UNSUPPORTED_VERSION` when `/(?:^|[^A-Za-z0-9_-])lc(?:[2-9]|[1-9]\d+)\.[A-Za-z0-9_-]/` matches. Otherwise throw `NOT_FOUND`.

- [ ] **Step 1: Write the failing tests.** In `change-link.test.ts`:

  ````ts
  const codeOf = (fn: () => unknown) => {
    try {
      fn();
      return 'no error';
    } catch (e) {
      return (e as ChangeLinkError).code;
    }
  };
  it('encodes RFC 4648 base64url without padding', () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(toBase64Url(new Uint8Array())).toBe('');
  });
  it('round-trips every byte value and every length 0..5', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (const n of [0, 1, 2, 3, 4, 5, 256])
      expect(fromBase64Url(toBase64Url(all.subarray(0, n)))).toEqual(all.subarray(0, n));
  });
  it('decodes the canonical form only', () =>
    expect(fromBase64Url('AA')).toEqual(new Uint8Array([0])));
  it.each(['abc=', 'a', 'ab+c', 'ab/c', 'AB', 'a b'])('rejects %j as CORRUPT', (t) =>
    expect(codeOf(() => fromBase64Url(t))).toBe('CORRUPT')
  );

  const T = 'lc1.eJxLTEoGAAJNASc';
  it.each([
    ['bare token', T],
    ['Studio link', `https://www.acme.com/livelocale/index.html#${T}`],
    [
      'Outlook Safe Links',
      `https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.acme.com%2Flivelocale%2Findex.html%23${T}&data=05%7C01`,
    ],
    ['Slack markup', `<https://www.acme.com/livelocale/index.html#${T}|changes>`],
    ['fenced issue block', fencedChangeBlock(T)],
    ['prose with a full stop', `Here you go: ${T}.`],
    ['the same token twice', `${T} and again https://x/livelocale/#${T}`],
  ])('finds the token in %s', (_, text) => expect(findChangeToken(text)).toBe(T));
  it('prefers the fenced block and joins wrapped lines', () =>
    expect(
      findChangeToken(`lc1.decoy\n\n\`\`\`livelocale\n${T.slice(0, 12)}\n${T.slice(12)}\n\`\`\`\n`)
    ).toBe(T));
  it('builds the fenced block GitHub issues carry', () =>
    expect(fencedChangeBlock(T)).toBe('```livelocale\n' + T + '\n```\n'));
  it.each([
    ['', 'NOT_FOUND'],
    ['no link here', 'NOT_FOUND'],
    ['lc1.', 'NOT_FOUND'],
    [`x${T}`, 'NOT_FOUND'],
    [`${T} lc1.eJxzBAAAQgBC`, 'AMBIGUOUS'],
    ['https://x/livelocale/#lc2.eJxLTEoGAAJNASc', 'UNSUPPORTED_VERSION'],
    ['lc12.abc', 'UNSUPPORTED_VERSION'],
  ])('%j → %s', (text, code) => expect(codeOf(() => findChangeToken(text))).toBe(code));
  it.each(['acme/shop', 'Acme-Inc/shop.web_v2', 'a/b'])('accepts repo %s', (s) =>
    expect(isValidRepoSlug(s)).toBe(true)
  );
  it.each([
    '',
    'acme',
    'acme/',
    'acme/shop/x',
    '-acme/shop',
    'acme/.',
    'acme/..',
    `${'a'.repeat(40)}/x`,
    `acme/${'r'.repeat(101)}`,
    'acme/shop?x=1',
    'acme/shop#x',
    'acme/sh op',
  ])('rejects repo %j', (s) => expect(isValidRepoSlug(s)).toBe(false));
  ````

  In `core-browser-safe.test.ts`. Later tasks append to `BROWSER_SAFE`.

  ```ts
  const BROWSER_SAFE = [
    'src/core/save-rules.ts',
    'src/core/change-link.ts',
    'src/core/json-path.ts',
    'src/core/placeholders.ts',
    'src/core/validate.ts',
  ];
  it.each(BROWSER_SAFE)('%s stays browser-safe', (file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(
      /from ['"](node:)?(fs|path|zlib|buffer|crypto|module|os|child_process)['"]/
    );
    expect(text).not.toMatch(/\bBuffer\b|\bprocess\./);
    expect(text).not.toMatch(/\(\?<[=!]/); // regex lookbehind breaks Safari < 16.4 at parse time
  });
  ```

- [ ] **Step 2:** Run `npx vitest run tests/unit/change-link.test.ts tests/unit/core-browser-safe.test.ts`. Expected: FAIL, because `src/core/change-link.js` does not resolve and the guard test hits `ENOENT`.
- [ ] **Step 3:** Implement the exports in `src/core/change-link.ts`.
- [ ] **Step 4:** Run the same command, then `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(core): add base64url and change-link token parsing`.

---

### Task 6: Change-set schema (`parseChangeSet`, `toWire`)

**Files:**

- Modify: `src/core/change-link.ts`
- Test: Modify `tests/unit/change-link.test.ts`

**Interfaces:**

- Consumes: `ChangeLinkError` and `isValidRepoSlug` (Task 5); `isValidLocaleFormat`, `isValidKeyFormat`, `isSafeKeyPath` and `isValidValueFormat` (from `src/core/validate.ts`).
- Produces:
  ```ts
  export const CHANGE_LINK_VERSION = 1;
  export const MAX_CHANGE_EDITS = 500;
  export const MAX_BY_CHARS = 100;
  export const MAX_NOTE_CHARS = 2_000;
  export interface ChangeEdit {
    locale: string;
    key: string;
    from: string | null;
    to: string;
    force: boolean;
  } // from null = key absent in that locale in the build
  export interface ChangeSet {
    repo?: string;
    branch: string;
    base: string;
    src: string;
    by: string;
    note: string;
    edits: ChangeEdit[];
  }
  export type ChangeEditTuple =
    | [locale: string, key: string, from: string | null, to: string]
    | [locale: string, key: string, from: string | null, to: string, force: 1];
  export interface ChangeWire {
    v: 1;
    repo?: string;
    branch: string;
    base: string;
    src: string;
    by: string;
    note: string;
    e: ChangeEditTuple[];
  }
  export function toWire(set: ChangeSet): ChangeWire; // omits repo when undefined; appends 1 only when force
  export function parseChangeSet(value: unknown): ChangeSet; // builds fresh objects; ignores unknown top-level fields
  /** The one branch-name rule. The manifest (Task 11), build info (Task 16) and this schema all use it. '' is not valid. */
  export function isValidBranchName(name: string): boolean; // /^(?!-)(?!.*\.\.)[^\s\x00-\x1f\x7f]{1,255}$/
  ```
- Rules, checked in this order. Each failure throws `ChangeLinkError`.

  | Field        | Rule                                                                                                                                                                                                                                | Code                                                |
  | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
  | root         | is a plain object                                                                                                                                                                                                                   | `INVALID`                                           |
  | `v`          | `=== 1`                                                                                                                                                                                                                             | `UNSUPPORTED_VERSION`                               |
  | `repo`       | absent, or passes `isValidRepoSlug`                                                                                                                                                                                                 | `INVALID`                                           |
  | `branch`     | `''`, or passes `isValidBranchName`                                                                                                                                                                                                 | `INVALID`                                           |
  | `base`       | matches `/^(?:[0-9a-f]{40}\|[0-9a-f]{64})?$/`                                                                                                                                                                                       | `INVALID`                                           |
  | `src`        | passes `isValidLocaleFormat`                                                                                                                                                                                                        | `INVALID`                                           |
  | `by`         | a string of at most 100 characters with no `[\x00-\x1f\x7f]`                                                                                                                                                                        | `INVALID`                                           |
  | `note`       | a string of at most 2,000 characters with no control characters except `\t`, `\n` and `\r`                                                                                                                                          | `INVALID`                                           |
  | `e`          | more than 500 entries (checked before the entries themselves)                                                                                                                                                                       | `TOO_MANY_EDITS`                                    |
  | `e`          | empty                                                                                                                                                                                                                               | `INVALID`                                           |
  | each entry   | an array of length 4 or 5. `locale` passes `isValidLocaleFormat`; `key` passes `isValidKeyFormat` and `isSafeKeyPath`; `from` is `null` or passes `isValidValueFormat`; `to` passes `isValidValueFormat`; a 5th element must be `1` | `INVALID`; the message starts `edit <n>:` (1-based) |
  | all entries  | no duplicate `locale`+`key`, and within one locale no key is a dotted ancestor of another (check each key's ancestors against a Set)                                                                                                | `INVALID`                                           |
  | every string | well-formed UTF-16: `/[\uD800-\uDBFF](?![\uDC00-\uDFFF])\|(?:^\|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/` must not match                                                                                                                   | `INVALID`                                           |

- [ ] **Step 1: Write the failing tests** under `describe('change-set schema')`.
  ```ts
  const valid: ChangeWire = {
    v: 1,
    branch: 'main',
    base: 'a'.repeat(40),
    src: 'en',
    by: 'Mona',
    note: '',
    e: [
      ['ar', 'home.title', 'الرئيسية', 'الصفحة الرئيسية'],
      ['ar', 'greeting', null, 'مرحبا {name}', 1],
    ],
  };
  it('maps a wire object to a change set', () =>
    expect(parseChangeSet(valid)).toEqual({
      branch: 'main',
      base: 'a'.repeat(40),
      src: 'en',
      by: 'Mona',
      note: '',
      edits: [
        { locale: 'ar', key: 'home.title', from: 'الرئيسية', to: 'الصفحة الرئيسية', force: false },
        { locale: 'ar', key: 'greeting', from: null, to: 'مرحبا {name}', force: true },
      ],
    }));
  it('toWire is the inverse and omits repo and force when unset', () => {
    const set = parseChangeSet(valid);
    expect(toWire(set)).toEqual(valid);
    expect('repo' in toWire(set)).toBe(false);
    expect(toWire({ ...set, repo: 'acme/shop' }).repo).toBe('acme/shop');
  });
  it('accepts boundary values', () => {
    for (const patch of [
      { base: '' },
      { base: 'f'.repeat(64) },
      { branch: '' },
      { branch: 'feature/ä' },
      { by: 'x'.repeat(100) },
      { note: 'a\nb\tc\r\n' + 'x'.repeat(1990) },
      { e: Array.from({ length: 500 }, (_, i) => ['ar', `k${i}`, null, 'x']) },
      {
        e: [
          ['ar', 'k', null, 'x'],
          ['fr', 'k', null, 'y'],
        ],
      },
    ])
      expect(() => parseChangeSet({ ...valid, ...patch })).not.toThrow();
  });
  it.each([
    ['v 2', { v: 2 }, 'UNSUPPORTED_VERSION'],
    [
      '501 edits',
      { e: Array.from({ length: 501 }, (_, i) => ['ar', `k${i}`, null, 'x']) },
      'TOO_MANY_EDITS',
    ],
    ['no edits', { e: [] }, 'INVALID'],
    ['repo', { repo: 'acme' }, 'INVALID'],
    ['empty repo', { repo: '' }, 'INVALID'],
    ['short base', { base: 'abc' }, 'INVALID'],
    ['uppercase base', { base: 'A'.repeat(40) }, 'INVALID'],
    ['option-like branch', { branch: '--upload-pack=x' }, 'INVALID'],
    ['branch with ..', { branch: 'a..b' }, 'INVALID'],
    ['branch with space', { branch: 'a b' }, 'INVALID'],
    ['src', { src: 'english' }, 'INVALID'],
    ['by too long', { by: 'x'.repeat(101) }, 'INVALID'],
    ['by control char', { by: 'Mo\u0000na' }, 'INVALID'],
    ['note too long', { note: 'x'.repeat(2001) }, 'INVALID'],
    ['short entry', { e: [['ar', 'k', null]] }, 'INVALID'],
    ['long entry', { e: [['ar', 'k', null, 'x', 1, 1]] }, 'INVALID'],
    ['force true', { e: [['ar', 'k', null, 'x', true]] }, 'INVALID'],
    ['bad locale', { e: [['../x', 'k', null, 'x']] }, 'INVALID'],
    ['polluting key', { e: [['ar', 'a.__proto__.b', null, 'x']] }, 'INVALID'],
    ['numeric from', { e: [['ar', 'k', 5, 'x']] }, 'INVALID'],
    ['to too long', { e: [['ar', 'k', null, 'x'.repeat(10_001)]] }, 'INVALID'],
    ['lone surrogate', { e: [['ar', 'k', null, 'a\uD800b']] }, 'INVALID'],
    [
      'duplicate',
      {
        e: [
          ['ar', 'k', null, 'x'],
          ['ar', 'k', 'x', 'y'],
        ],
      },
      'INVALID',
    ],
    [
      'overlap',
      {
        e: [
          ['ar', 'a.b', null, 'x'],
          ['ar', 'a.b-x', null, 'y'],
          ['ar', 'a.b.c', null, 'z'],
        ],
      },
      'INVALID',
    ],
  ])('rejects %s', (_, patch, code) =>
    expect(codeOf(() => parseChangeSet({ ...valid, ...patch }))).toBe(code)
  );
  it.each([null, [], 'lc1', 42])('rejects root %j', (v) =>
    expect(codeOf(() => parseChangeSet(v))).toBe('INVALID')
  );
  it('names the failing edit', () =>
    expect(() => parseChangeSet({ ...valid, e: [valid.e[0], ['ar', 'k', 5, 'x']] })).toThrow(
      /edit 2/
    ));
  it('builds fresh objects', () => {
    const set = parseChangeSet(
      JSON.parse(`{"__proto__":{"polluted":1},${JSON.stringify(valid).slice(1)}`)
    );
    expect(({} as any).polluted).toBeUndefined();
    expect((set as any).polluted).toBeUndefined();
  });
  it('ignores unknown top-level fields', () =>
    expect(parseChangeSet({ ...valid, extra: 1 })).not.toHaveProperty('extra'));
  it.each(['main', 'feature/ä', 'i18n/preview-edits', 'x'.repeat(255)])(
    'accepts branch name %j',
    (b) => expect(isValidBranchName(b)).toBe(true)
  );
  it.each(['', '-x', '--upload-pack=x', 'a..b', 'a b', 'a\tb', 'x'.repeat(256)])(
    'rejects branch name %j',
    (b) => expect(isValidBranchName(b)).toBe(false)
  );
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/change-link.test.ts`. Expected: FAIL with `parseChangeSet is not a function`.
- [ ] **Step 3:** Implement the constants, types, `isValidBranchName`, `toWire` and `parseChangeSet` following the rules table.
- [ ] **Step 4:** Run the same command, then `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(core): define and validate the lc1 change-set schema`.

---

### Task 7: Encode and decode `lc1` links with Web Streams and size caps

**Files:**

- Modify: `src/core/change-link.ts`
- Test: Modify `tests/unit/change-link.test.ts`

**Interfaces:**

- Consumes: `toWire`, `parseChangeSet`, `ChangeSet`, `findChangeToken`, `toBase64Url`, `fromBase64Url` and `ChangeLinkError` (Tasks 5, 6).
- Produces. These are used by the Send dialog, backup, Review mode, Import, and `apply`.

  ```ts
  export const MAX_INFLATED_BYTES = 512 * 1024; // 524_288 (spec cap)
  export const MAX_TOKEN_CHARS = 1_000_000; // rejects before any base64 or inflate work
  export const CHANGE_LINK_FILE_THRESHOLD = 6_000; // Send offers a file above this many link characters
  export type Deflater = (bytes: Uint8Array) => Promise<Uint8Array>; // zlib format (RFC 1950)
  export type Inflater = (bytes: Uint8Array, maxOutputLength: number) => Promise<Uint8Array>; // TOO_LARGE past the cap; CORRUPT on bad or truncated data
  export const streamDeflate: Deflater; // CompressionStream('deflate'); UNSUPPORTED_ENVIRONMENT when absent
  export const streamInflate: Inflater; // DecompressionStream('deflate'); trailing data is rejected only where the runtime rejects it (browsers, Node 24), not pinned
  export function encodeChangeLink(set: ChangeSet, deflate?: Deflater): Promise<string>; // 'lc1.<base64url>'
  export function decodeChangeLink(text: string, inflate?: Inflater): Promise<ChangeSet>; // text: token, link, file text or issue body
  ```

  - **Encode.**
    1. Run `parseChangeSet(toWire(set))`, so that every produced link also decodes.
    2. Serialize with `JSON.stringify` and encode as UTF-8.
    3. If the bytes are over `MAX_INFLATED_BYTES`, throw `TOO_LARGE`.
    4. Deflate, and return `CHANGE_LINK_PREFIX + toBase64Url(...)`.
  - **Decode.**
    1. Call `findChangeToken`.
    2. If the token is longer than `MAX_TOKEN_CHARS`, throw `TOO_LARGE` without inflating.
    3. Run `fromBase64Url`, then `inflate(bytes, MAX_INFLATED_BYTES)`.
    4. Decode with `new TextDecoder('utf-8', { fatal: true })`, then `JSON.parse`, then `parseChangeSet`.
    5. Map any error that is not a `ChangeLinkError` to `CORRUPT`.
  - **`streamInflate`.**
    - Pipe `new Blob([new Uint8Array(bytes)]).stream()` through `DecompressionStream('deflate')` and read it with a reader.
    - Map read errors to `CORRUPT`.
    - Sum the chunk lengths. Once the total exceeds `maxOutputLength`, run `await reader.cancel().catch(() => {})` and throw `TOO_LARGE`.

- [ ] **Step 1: Write the failing tests** under `describe('encode/decode')`, with `afterEach(() => vi.unstubAllGlobals())`.
  ```ts
  const set: ChangeSet = {
    branch: 'main',
    base: 'a'.repeat(40),
    src: 'en',
    by: 'منى',
    note: 'Checked on mobile.\nThanks!',
    edits: [
      { locale: 'ar', key: 'home.title', from: 'الرئيسية', to: 'الصفحة الرئيسية', force: false },
      { locale: 'fa', key: 'cta', from: null, to: 'می\u200Cخواهم', force: true }, // ZWNJ survives
      { locale: 'fr', key: 'accent', from: 'e\u0301', to: '\u00E9 😀', force: false },
    ],
  }; // NFD and astral kept as-is
  it('round-trips exactly', async () =>
    expect(await decodeChangeLink(await encodeChangeLink(set))).toEqual(set));
  it('emits lc1 + base64url of a zlib stream', async () => {
    const t = await encodeChangeLink(set);
    expect(t).toMatch(/^lc1\.[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(t.slice(4))[0]).toBe(0x78);
  });
  it('carries no repo field unless given', async () => {
    const t = await encodeChangeLink(set);
    const wire = JSON.parse(
      new TextDecoder().decode(await streamInflate(fromBase64Url(t.slice(4)), MAX_INFLATED_BYTES))
    );
    expect(wire).not.toHaveProperty('repo');
    expect(wire.v).toBe(1);
    expect(
      (await decodeChangeLink(await encodeChangeLink({ ...set, repo: 'acme/shop' }))).repo
    ).toBe('acme/shop');
  });
  it('keeps 20 Arabic edits under 1,900 characters', async () => {
    const edits = Array.from({ length: 20 }, (_, i) => ({
      locale: 'ar',
      key: `shop.product${i}.title`,
      from: `منتج رقم ${i} في المتجر`,
      to: `المنتج رقم ${i} متوفر الآن في متجرنا`,
      force: false,
    }));
    expect((await encodeChangeLink({ ...set, edits })).length).toBeLessThan(1_900);
  });
  it('decodes from a full Studio link', async () =>
    expect(
      await decodeChangeLink(
        `https://www.acme.com/livelocale/index.html#${await encodeChangeLink(set)}`
      )
    ).toEqual(set));
  it('fails loudly on a truncated link', async () => {
    const t = await encodeChangeLink(set);
    for (const cut of [1, 2, 3, 5, 10])
      await expect(decodeChangeLink(t.slice(0, -cut))).rejects.toMatchObject({ code: 'CORRUPT' });
  });
  it('fails loudly on a link hard-wrapped by a mail client', async () => {
    // Review Focus 2
    const t = await encodeChangeLink(set);
    for (const mangled of [
      `${t.slice(0, 40)}\n${t.slice(40)}`,
      `${t.slice(0, 40)}=\n${t.slice(40)}`,
      `${t.slice(0, 40)}\r\n  ${t.slice(40)}`,
    ])
      await expect(decodeChangeLink(`Here are my fixes: ${mangled}`)).rejects.toMatchObject({
        code: 'CORRUPT',
      });
  });
  it('fails loudly on an altered link', async () => {
    const t = await encodeChangeLink(set);
    const i = Math.floor(t.length / 2);
    await expect(
      decodeChangeLink(t.slice(0, i) + (t[i] === 'A' ? 'B' : 'A') + t.slice(i + 1))
    ).rejects.toMatchObject({ code: 'CORRUPT' });
  });
  it('refuses more than 500 edits on encode', async () =>
    await expect(
      encodeChangeLink({
        ...set,
        edits: Array.from({ length: 501 }, (_, i) => ({
          locale: 'ar',
          key: `k${i}`,
          from: null,
          to: 'x',
          force: false,
        })),
      })
    ).rejects.toMatchObject({ code: 'TOO_MANY_EDITS' }));
  it('refuses a payload over 512 KB on encode', async () =>
    await expect(
      encodeChangeLink({
        ...set,
        edits: Array.from({ length: 40 }, (_, i) => ({
          locale: 'ar',
          key: `k${i}`,
          from: null,
          to: 'ب'.repeat(9_000),
          force: false,
        })),
      })
    ).rejects.toMatchObject({ code: 'TOO_LARGE' }));
  it('round-trips a payload just under the cap', async () => {
    const L = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
    let s = 1;
    const rnd = () => L[(s = (s * 1103515245 + 12345) % 2 ** 31) % L.length];
    const edits = Array.from({ length: 27 }, (_, i) => ({
      locale: 'ar',
      key: `k${i}`,
      from: null,
      to: Array.from({ length: 9_000 }, rnd).join(''),
      force: false,
    }));
    expect(await decodeChangeLink(await encodeChangeLink({ ...set, edits }))).toEqual({
      ...set,
      edits,
    });
  });
  it('refuses a decompression bomb', async () =>
    await expect(
      decodeChangeLink(
        'lc1.' + toBase64Url(await streamDeflate(new Uint8Array(600 * 1024).fill(0x20)))
      )
    ).rejects.toMatchObject({ code: 'TOO_LARGE' }));
  it('refuses an over-long token before inflating', async () => {
    const inflate = vi.fn();
    await expect(
      decodeChangeLink('lc1.' + 'A'.repeat(MAX_TOKEN_CHARS), inflate)
    ).rejects.toMatchObject({ code: 'TOO_LARGE' });
    expect(inflate).not.toHaveBeenCalled();
  });
  it.each([
    ['not JSON', new TextEncoder().encode('hello')],
    ['invalid UTF-8', new Uint8Array([0xff, 0xfe])],
  ])(
    'rejects %s as CORRUPT',
    async (_, bytes) =>
      await expect(
        decodeChangeLink('lc1.' + toBase64Url(await streamDeflate(bytes)))
      ).rejects.toMatchObject({ code: 'CORRUPT' })
  );
  it('rejects valid JSON of the wrong shape as INVALID', async () =>
    await expect(
      decodeChangeLink(
        'lc1.' + toBase64Url(await streamDeflate(new TextEncoder().encode('{"v":1}')))
      )
    ).rejects.toMatchObject({ code: 'INVALID' }));
  it('passes the 512 KB cap to an injected inflater', async () => {
    const inflate = vi.fn(streamInflate);
    await decodeChangeLink(await encodeChangeLink(set), inflate);
    expect(inflate).toHaveBeenCalledWith(expect.any(Uint8Array), 524_288);
  });
  it('reports a browser without CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    await expect(encodeChangeLink(set)).rejects.toMatchObject({ code: 'UNSUPPORTED_ENVIRONMENT' });
  });
  it('pins the spec limits', () =>
    expect([
      CHANGE_LINK_PREFIX,
      MAX_CHANGE_EDITS,
      MAX_INFLATED_BYTES,
      CHANGE_LINK_FILE_THRESHOLD,
    ]).toEqual(['lc1.', 500, 524_288, 6_000]));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/change-link.test.ts`. Expected: FAIL with `encodeChangeLink is not a function`.
- [ ] **Step 3:** Implement the constants, `streamDeflate`, `streamInflate`, `encodeChangeLink` and `decodeChangeLink`.
- [ ] **Step 4:** Run `npx vitest run tests/unit/change-link.test.ts tests/unit/core-browser-safe.test.ts`, then `npm run typecheck && npm run lint`. Expected: PASS, and the output shows no "Unhandled rejection". Then exit 0.
- [ ] **Step 5:** Commit `feat(core): encode and decode lc1 change links with size caps`.

---

### Task 8: Bounded Node inflater (`nodeInflate`) and the codec docs

**Files:**

- Create: `src/core/change-link-node.ts`
- Modify: `ARCHITECTURE.md`:
  - Add "### 3c. Change links (`src/core/change-link.ts`)" in 3–4 sentences covering the `lc1.` format, the 500-edit and 512 KB caps, the two inflaters and the schema.
  - Add the security-table row "Change-link size caps | core/change-link, core/change-link-node".
- Test: Create `tests/unit/change-link-inflaters.test.ts` (`// @vitest-environment node`). Modify `tests/unit/core-browser-safe.test.ts`.

**Interfaces:**

- Consumes: `Inflater`, `ChangeLinkError`, `MAX_INFLATED_BYTES`, `streamInflate`, `encodeChangeLink` and `decodeChangeLink` (Task 7).
- Produces: `export const nodeInflate: Inflater;`. Only `apply` uses it (Tasks 47, 57).
  - It calls `zlib.inflateSync(bytes, { maxOutputLength, info: true })`, cast to `{ buffer: Buffer; engine: { bytesWritten: number } }`.
  - `err.code === 'ERR_BUFFER_TOO_LARGE'` throws `TOO_LARGE`.
  - `engine.bytesWritten !== bytes.length` throws `CORRUPT`. This catches trailing junk, which `inflateSync` otherwise ignores.
  - Any other error throws `CORRUPT`.
  - Import from `'zlib'`.

- [ ] **Step 1: Write the failing tests.** In `change-link-inflaters.test.ts`:
  ```ts
  describe.each([
    ['DecompressionStream', streamInflate],
    ['zlib', nodeInflate],
  ])('%s inflater', (_, inflate) => {
    it('inflates exactly the cap', async () =>
      expect(
        (await inflate(deflateSync(Buffer.alloc(MAX_INFLATED_BYTES, 0x20)), MAX_INFLATED_BYTES))
          .length
      ).toBe(524_288));
    it('refuses one byte more', async () =>
      await expect(
        inflate(deflateSync(Buffer.alloc(MAX_INFLATED_BYTES + 1, 0x20)), MAX_INFLATED_BYTES)
      ).rejects.toMatchObject({ code: 'TOO_LARGE' }));
    it.each([
      ['truncated', () => deflateSync(Buffer.from('{"v":1}')).subarray(0, -3)],
      ['raw deflate without the zlib header', () => deflateRawSync(Buffer.from('{"v":1}'))],
      ['empty', () => new Uint8Array(0)],
    ])(
      'rejects %s as CORRUPT',
      async (_, make) =>
        await expect(inflate(make(), MAX_INFLATED_BYTES)).rejects.toMatchObject({ code: 'CORRUPT' })
    );
  });
  // Trailing junk is pinned for nodeInflate only. Browsers reject it in DecompressionStream natively and Node 24 does too,
  // but CI runs Node 20, where streamInflate's behaviour is not part of the contract.
  it('nodeInflate rejects trailing junk as CORRUPT', async () =>
    await expect(
      nodeInflate(
        Buffer.concat([deflateSync(Buffer.from('{"v":1}')), Buffer.from([1, 2, 3])]),
        MAX_INFLATED_BYTES
      )
    ).rejects.toMatchObject({ code: 'CORRUPT' }));
  it('decodes a link made with CompressionStream', async () => {
    const set: ChangeSet = {
      branch: 'main',
      base: '',
      src: 'en',
      by: '',
      note: '',
      edits: [{ locale: 'ar', key: 'home.title', from: null, to: 'الرئيسية', force: false }],
    };
    expect(await decodeChangeLink(await encodeChangeLink(set), nodeInflate)).toEqual(set);
  });
  ```
  In `core-browser-safe.test.ts`, add `it('keeps change-link-node out of browser code')`. It walks `src/studio` and `src/client` with a small recursive `readdirSync` helper (not `fs.globSync`, which Node 18 lacks) and checks `src/core/change-link.ts`. No `.ts` or `.tsx` file may match `/change-link-node/`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/change-link-inflaters.test.ts tests/unit/core-browser-safe.test.ts`. Expected: FAIL with `Failed to resolve import "../../src/core/change-link-node.js"`.
- [ ] **Step 3:** Implement `src/core/change-link-node.ts` and make the ARCHITECTURE.md edits.
- [ ] **Step 4:** Run the same command, then `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(core): add a bounded Node inflater for change links`.

---

### Task 9: `FileMutator({ requireEnabled: false })`

**Files:**

- Modify: `src/server/file-mutator.ts`.
- Modify: `src/server/index.ts` to read `export { FileMutator, type FileMutatorOptions } from './file-mutator.js';`.
- Modify: `ARCHITECTURE.md` §6. Add: "`new FileMutator({ requireEnabled: false })` skips the enablement check, like `KeyScanner`, for CLI tools that write outside development, such as `livelocale apply`."
- Test: Modify `tests/unit/file-mutator.test.ts`.

**Interfaces:**

- Consumes: `KeyScannerOptions.requireEnabled` (existing).
- Produces. `apply` uses this in Task 47.

  ```ts
  export interface FileMutatorOptions {
    /** Refuse to run unless LiveLocale is enabled. Default true; only CLI tooling passes false. */
    requireEnabled?: boolean;
  }
  export class FileMutator {
    constructor(options?: FileMutatorOptions);
  }
  ```

  - The module-level `assertEnabled` becomes a private method. It returns early when the flag is false, which also skips the `LIVELOCALE=off` kill switch, as `KeyScanner` already does.
  - The internal scanner becomes `new KeyScanner({ requireEnabled })`.
  - `next-handler.ts` and `vite-plugin.ts` keep `new FileMutator()`.

- [ ] **Step 1: Write the failing tests** in a new `describe('FileMutator({ requireEnabled: false })')` nested **inside** the existing `describe('FileMutator')`, so that its `BASE_PATH` constant, `fs` mock and `beforeEach` apply.
  ```ts
  it('writes and reads when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(fs.readFile).mockResolvedValue('{\n  "greeting": "Hello"\n}\n');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    const m = new FileMutator({ requireEnabled: false });
    await m.updateLocaleKey(BASE_PATH, 'en', 'greeting', 'Hi');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('en.json.tmp'),
      '{\n  "greeting": "Hi"\n}\n',
      'utf-8'
    );
    await expect(m.readLocale(BASE_PATH, 'en')).resolves.toEqual({ greeting: 'Hello' });
  });
  it('ignores the LIVELOCALE=off kill switch (CLI-only option)', async () => {
    vi.stubEnv('LIVELOCALE', 'off');
    vi.mocked(fs.readFile).mockResolvedValue('{}');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);
    await expect(
      new FileMutator({ requireEnabled: false }).updateLocaleKey(BASE_PATH, 'en', 'a', 'b')
    ).resolves.toBeUndefined();
  });
  it('lists locales and scans key metadata outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const m = new FileMutator({ requireEnabled: false });
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: 'en.json', isDirectory: () => false, isFile: () => true },
    ] as any);
    expect(await m.listLocales(BASE_PATH)).toEqual(['en']);
    vi.mocked(fs.readdir).mockResolvedValue([] as any);
    vi.mocked(fs.stat).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await m.getKeysMetadata(BASE_PATH)).toEqual({ allKeys: [], codeKeys: [] });
  });
  it('still refuses by default', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(new FileMutator({}).updateLocaleKey(BASE_PATH, 'en', 'a', 'b')).rejects.toThrow(
      /development/i
    );
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/file-mutator.test.ts`. Expected: FAIL. The production tests reject with `/can only be executed in development mode/`.
- [ ] **Step 3:** Implement the constructor, the private `assertEnabled`, the scanner flag, the index export and the ARCHITECTURE line.
- [ ] **Step 4:** Run `npx vitest run tests/unit/file-mutator.test.ts tests/unit/key-scanner.test.ts`, then `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(server): add FileMutator requireEnabled option for CLI writes`.

---

### Task 10: Apply planner shared by Review mode and `apply` (`planApply`)

**Files:**

- Create: `src/core/apply-plan.ts`
- Test: Create `tests/unit/apply-plan.test.ts`. Modify `tests/unit/core-browser-safe.test.ts` to add `'src/core/apply-plan.ts'` to `BROWSER_SAFE`.

**Interfaces:**

- Consumes:
  - `lookupKey` (Task 1).
  - `validateEdit`, `sourceReference`, `SourceContext` and `WriteRuleCode` (Tasks 2, 3).
  - `detectRiskFlags`, `ContentRiskFlag` and `RISK_FLAG_MESSAGES` (Task 4).
  - `ChangeEdit` (Task 6).
  - `containsWatermark` from `src/client/watermark.ts` (existing, browser-safe).
- Produces. Review rows (Task 42), the reports (Task 46), local apply (Task 47) and the Action (Tasks 56, 57) consume these.
  ```ts
  export type EditStatus = 'apply' | 'already' | 'conflict' | 'invalid' | 'needs-force';
  export type RiskFlag = ContentRiskFlag | 'new-key' | 'forced';
  /** The one copy for every flag, shared by Review rows and the PR/issue tables:
   *  RISK_FLAG_MESSAGES plus forced: 'Saved with “Save anyway”.' and 'new-key': 'Adds a key the source locale does not have.' */
  export const FLAG_MESSAGES: Record<RiskFlag, string>;
  export type PlanCode =
    | WriteRuleCode
    | 'UNKNOWN_LOCALE'
    | 'UNKNOWN_NAMESPACE'
    | 'CONTAINS_WATERMARK'
    | 'CHANGED_ON_TARGET'
    | 'REMOVED_ON_TARGET';
  export interface PlannedEdit extends ChangeEdit {
    status: EditStatus;
    code?: PlanCode;
    message?: string;
    current?: string;
    flags: RiskFlag[];
  }
  export interface ApplyPlan {
    edits: PlannedEdit[];
    counts: Record<EditStatus, number>;
  }
  export type LocaleTarget = {
    layout: 'flat' | 'namespaced';
    dict: Record<string, unknown>;
  } | null; // null = no file for that locale
  export interface PlanInput {
    edits: readonly ChangeEdit[];
    sourceLocale: string;
    targets: ReadonlyMap<string, LocaleTarget>;
    allowForce: boolean;
  }
  /** Throws Error(`Source locale "${s}" has no locale file on the target.`) when targets.get(sourceLocale) is missing or null. */
  export function planApply(input: PlanInput): ApplyPlan;
  ```
- **Per-edit checks, in this order.** The tests pin this order. The context is `ctx = { sourceLocale, source: targets.get(sourceLocale).dict, target: targets.get(locale)?.dict }`.
  1. **Locale.** If `targets.get(locale)` is missing or null, the edit is `invalid` with code `UNKNOWN_LOCALE` and message `` `No "${locale}" locale file on the target.` ``.
  2. **Namespace.** In the namespaced layout, the key needs a dot and its first segment must already be an object in `dict`. Otherwise it is `invalid` with code `UNKNOWN_NAMESPACE` and message `` `"${key}" is not in an existing namespace file of ${locale}.` ``.
  3. **Watermark.** If `containsWatermark(to)`, it is `invalid` with code `CONTAINS_WATERMARK` and message `'The new text contains LiveLocale watermark characters.'`.
  4. **Already done.** If `lookupKey(dict, key)` is `{ state: 'string', value: to }`, the status is `already` and `current` is set.
  5. **Validation.** Run `validateEdit({ locale, key, value: to }, ctx, { force: false })`.
     - A 400 or 409 result is `invalid` with the verdict's code and message, even when the edit is forced.
     - A 422 result depends on force:
       - When `edit.force && allowForce`, the edit continues with flag `'forced'`.
       - When `edit.force` alone, it is `needs-force`.
       - Otherwise it is `invalid`.
  6. **Three-way check.**
     - The current value is a string equal to `from` → `apply`.
     - The key is missing and `from === null` → `apply`. Add flag `'new-key'` when `sourceReference(key, ctx) === null`.
     - The key is missing and `from !== null` → `conflict`, with code `REMOVED_ON_TARGET` and message `'Removed on the target since the link was made.'`.
     - Any other string → `conflict`, with code `CHANGED_ON_TARGET`, message `'Changed on the target since the link was made.'` and `current` set.
     - Comparison is by exact code units. Nothing is normalized.
  7. **Risk flags.** For every edit that is not `invalid`, append `detectRiskFlags(sourceReference(key, ctx) ?? from ?? undefined, to)`.

  Duplicates cannot occur, because `parseChangeSet` already rejects duplicate keys and keys that overlap in one locale.

- [ ] **Step 1: Write the failing tests.**
  - The fixture uses the flat layout and `sourceLocale: 'en'`:
    - `en: { home: { title: 'Welcome', greet: 'Hello {name}', cta: 'Read the docs' } }`
    - `ar: { home: { title: 'أهلا', greet: 'مرحبا {name}' } }`
  - Helpers, all defined at the top of the test file:
    - `const e = (locale, key, from, to, force = false) => ({ locale, key, from, to, force })`.
    - `targets`: `new Map([['en', { layout: 'flat', dict: EN }], ['ar', { layout: 'flat', dict: AR }]])`, with `EN` and `AR` the two dictionaries above.
    - `plan(edits, allowForce = false)`: `planApply({ edits, sourceLocale: 'en', targets, allowForce })`.
    - `planNs(edits)`: the same with `nsTargets = new Map([['en', { layout: 'namespaced', dict: { common: { ok: 'OK' } } }], ['de', { layout: 'namespaced', dict: { common: { ok: 'OK' } } }]])`.
    - `apply1 = e('ar','home.title','أهلا','مرحبًا')` (current equals `from`), `already1 = e('ar','home.greet','قديم','مرحبا {name}')` (current equals `to`), `conflict1 = e('ar','home.cta','قديم','x')` (removed on the target).
  ```ts
  expect(plan([e('ar', 'home.title', 'أهلا', 'مرحبًا')]).edits[0].status).toBe('apply');
  expect(plan([e('ar', 'home.title', 'قديم', 'أهلا')]).edits[0]).toMatchObject({
    status: 'already',
    current: 'أهلا',
  });
  expect(plan([e('ar', 'home.title', 'قديم', 'جديد')]).edits[0]).toMatchObject({
    status: 'conflict',
    code: 'CHANGED_ON_TARGET',
    current: 'أهلا',
  });
  expect(plan([e('ar', 'home.cta', null, 'اقرأ')]).edits[0]).toMatchObject({
    status: 'apply',
    flags: [],
  });
  expect(plan([e('ar', 'home.extra', null, 'x')]).edits[0]).toMatchObject({
    status: 'apply',
    flags: ['new-key'],
  });
  expect(plan([e('ar', 'home.cta', 'قديم', 'x')]).edits[0]).toMatchObject({
    status: 'conflict',
    code: 'REMOVED_ON_TARGET',
  });
  expect(plan([e('ar', 'home.greet', 'مرحبا {name}', 'مرحبا')]).edits[0]).toMatchObject({
    status: 'invalid',
    code: 'PLACEHOLDER_MISMATCH',
  });
  expect(plan([e('ar', 'home.greet', 'مرحبا {name}', 'مرحبا', true)]).edits[0].status).toBe(
    'needs-force'
  );
  expect(plan([e('ar', 'home.greet', 'مرحبا {name}', 'مرحبا', true)], true).edits[0]).toMatchObject(
    { status: 'apply', flags: ['forced'] }
  );
  expect(plan([e('ar', 'home.__proto__.x', null, 'x', true)], true).edits[0]).toMatchObject({
    status: 'invalid',
    code: 'INVALID_KEY_FORMAT',
  });
  expect(plan([e('ar', 'home.title', 'أهلا', 'x'.repeat(10_001))]).edits[0].code).toBe(
    'INVALID_VALUE_FORMAT'
  );
  expect(plan([e('fr', 'home.title', null, 'x')]).edits[0].code).toBe('UNKNOWN_LOCALE');
  expect(plan([e('ar', 'home', null, 'x')]).edits[0]).toMatchObject({
    status: 'invalid',
    code: 'KEY_NOT_A_STRING',
  });
  expect(plan([e('ar', 'home.title.short', null, 'x')]).edits[0].code).toBe('KEY_NOT_A_STRING');
  expect(plan([e('ar', 'home.title', 'أهلا', encodeKey('x', 'home.title'))]).edits[0].code).toBe(
    'CONTAINS_WATERMARK'
  );
  expect(plan([e('ar', 'home.cta', null, 'اقرأ https://evil.example')]).edits[0].flags).toEqual([
    'new-url',
  ]);
  // namespaced: targets 'de' = { layout: 'namespaced', dict: { common: { ok: 'OK' } } }, source en namespaced too
  expect(planNs([e('de', 'ok', null, 'x')]).edits[0].code).toBe('UNKNOWN_NAMESPACE');
  expect(planNs([e('de', 'billing.x', null, 'y')]).edits[0].code).toBe('UNKNOWN_NAMESPACE');
  expect(plan([apply1, already1, conflict1]).counts).toEqual({
    apply: 1,
    already: 1,
    conflict: 1,
    invalid: 0,
    'needs-force': 0,
  });
  expect(() => planApply({ edits: [], sourceLocale: 'de', targets, allowForce: false })).toThrow(
    'Source locale "de" has no locale file on the target.'
  );
  it('treats text that differs only by Unicode normalization as a conflict', () => {
    // Review Focus 3
    const t = new Map([
      ['en', { layout: 'flat', dict: { k: 'x' } }],
      ['fr', { layout: 'flat', dict: { k: '\u00E9' } }],
    ]);
    expect(
      planApply({
        edits: [e('fr', 'k', 'e\u0301', 'y')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0]
    ).toMatchObject({ status: 'conflict', code: 'CHANGED_ON_TARGET', current: '\u00E9' });
    expect(
      planApply({
        edits: [e('fr', 'k', '\u00E9', 'e\u0301')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0].status
    ).toBe('apply');
    expect(
      planApply({
        edits: [e('fr', 'k', 'x', 'e\u0301')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0]
    ).toMatchObject({ status: 'conflict', code: 'CHANGED_ON_TARGET', current: '\u00E9' }); // current NFC, to NFD: never 'already'
  });
  it('marks an edit to a literal dotted key invalid', () => {
    // Review Focus 4
    const t = new Map([
      ['en', { layout: 'flat', dict: {} }],
      ['ar', { layout: 'flat', dict: { 'a.b': 'x' } }],
    ]);
    expect(
      planApply({
        edits: [e('ar', 'a.b', 'x', 'y')],
        sourceLocale: 'en',
        targets: t,
        allowForce: false,
      }).edits[0]
    ).toMatchObject({ status: 'invalid', code: 'KEY_NOT_A_STRING' });
  });
  it('has one message per flag', () =>
    expect(FLAG_MESSAGES).toEqual({
      ...RISK_FLAG_MESSAGES,
      forced: 'Saved with \u201CSave anyway\u201D.',
      'new-key': 'Adds a key the source locale does not have.',
    }));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-plan.test.ts tests/unit/core-browser-safe.test.ts`. Expected: FAIL with `Failed to resolve import "../../src/core/apply-plan.js"`.
- [ ] **Step 3:** Implement `src/core/apply-plan.ts` with the check order above.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): plan change-link edits with re-validation and a per-key 3-way check`.

---

### Task 11: Share manifest contract

**Files:**

- Create: `src/core/share-manifest.ts`. It is browser-safe: add it to `BROWSER_SAFE` in `tests/unit/core-browser-safe.test.ts`.
- Test: Create `tests/unit/share-manifest.test.ts`.

**Interfaces:**

- Consumes: `LOCALE_RE` from `src/core/validate.ts` (existing), `isValidRepoSlug` (Task 5), `isValidBranchName` (Task 6).
- Produces. Pack (Tasks 20, 21, 24), the Studio (Tasks 27, 29) and doctor (Task 49) consume these.
  ```ts
  export const SHARE_DIR = 'livelocale';
  export const SHARE_MANIFEST_FILE = 'manifest.json';
  export const SHARE_FLAG_FILE = 'flag.js';
  export const SHARE_LOCALES_DIR = 'locales';
  export const SHARE_MANIFEST_FORMAT = 1;
  export type LocalesLayout = 'flat' | 'namespaced';
  export interface ShareManifest {
    format: 1;
    repo?: string; // GitHub 'owner/name'; key absent unless exposeRepo
    defaultBranch: string | null;
    branch: string | null; // branch the site was built from
    base: string | null; // commit SHA, lowercase hex, 40 or 64 characters
    localesPath: string; // repo-relative POSIX path, '.' for the root
    layout: LocalesLayout;
    sourceLocale: string; // always one of `locales`
    locales: string[]; // sorted; one file per code at ./locales/<code>.json
    basePath: string | null; // '/', '/repo/'; null when the app uses a relative base
    codeKeys: string[]; // sorted, from KeyScanner
  }
  export function isShareManifest(value: unknown): value is ShareManifest;
  export function parseShareManifest(value: unknown): ShareManifest | null; // isShareManifest ? value : null
  ```
  Validation rules:
  - `repo` is absent or passes `isValidRepoSlug`.
  - `branch` and `defaultBranch` are each `null` or pass `isValidBranchName`, so a manifest that passes here never yields a link the schema rejects.
  - `base` is `null` or matches `/^[0-9a-f]{40}([0-9a-f]{24})?$/`.
  - `basePath` is `null`, or starts and ends with `/`.
  - Every locale matches `LOCALE_RE`.
  - Unknown fields are ignored.
- The Change link maps manifest fields to link fields as follows (Task 38): `branch ?? ''` → `branch`, `base ?? ''` → `base`, `sourceLocale` → `src`, `repo` → `repo`.

- [ ] **Step 1: Write the failing test.**
  ```ts
  const SHA = 'a'.repeat(40);
  const valid: ShareManifest = {
    format: 1,
    defaultBranch: 'main',
    branch: 'main',
    base: SHA,
    localesPath: 'src/locales',
    layout: 'flat',
    sourceLocale: 'en',
    locales: ['ar', 'en'],
    basePath: '/',
    codeKeys: ['home.title'],
  };
  it('names the folder and files', () =>
    expect([
      SHARE_DIR,
      SHARE_MANIFEST_FILE,
      SHARE_FLAG_FILE,
      SHARE_LOCALES_DIR,
      SHARE_MANIFEST_FORMAT,
    ]).toEqual(['livelocale', 'manifest.json', 'flag.js', 'locales', 1]));
  it('accepts a manifest without repo', () => expect(isShareManifest(valid)).toBe(true));
  it('accepts an owner/name repo', () =>
    expect(isShareManifest({ ...valid, repo: 'acme/site' })).toBe(true));
  it('accepts null branch, base, defaultBranch and basePath', () =>
    expect(
      isShareManifest({ ...valid, branch: null, base: null, defaultBranch: null, basePath: null })
    ).toBe(true));
  it('ignores unknown fields (forward compatible)', () =>
    expect(isShareManifest({ ...valid, extra: 1 })).toBe(true));
  it.each([
    ['format 2', { ...valid, format: 2 }],
    ['a URL as repo', { ...valid, repo: 'https://github.com/acme/site' }],
    ['an unknown layout', { ...valid, layout: 'nested' }],
    ['a source locale outside locales', { ...valid, sourceLocale: 'fr' }],
    ['empty locales', { ...valid, locales: [] }],
    ['a locale code with a path', { ...valid, locales: ['en', '../x'] }],
    ['basePath without trailing slash', { ...valid, basePath: '/repo' }],
    ['non-string codeKeys', { ...valid, codeKeys: [1] }],
    ['a short base', { ...valid, base: 'abc123' }],
    ['an uppercase base', { ...valid, base: SHA.toUpperCase() }],
    ['null', null],
    ['an option-like branch', { ...valid, branch: '-x' }],
    ['a default branch with a space', { ...valid, defaultBranch: 'a b' }],
    ['an empty branch', { ...valid, branch: '' }],
  ])('rejects %s', (_label, v) => expect(isShareManifest(v)).toBe(false));
  it('parseShareManifest returns null for anything else', () => {
    expect(parseShareManifest(valid)).toBe(valid);
    expect(parseShareManifest('<!doctype html>')).toBeNull();
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/share-manifest.test.ts`. Expected: FAIL, because the module `../../src/core/share-manifest.js` does not exist.
- [ ] **Step 3:** Implement the constants, the type, `isShareManifest` and `parseShareManifest`.
- [ ] **Step 4:** Run `npx vitest run tests/unit/share-manifest.test.ts tests/unit/core-browser-safe.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(share): add the share manifest contract`.

---

### Task 12: Framed-only `flag.js`

**Files:**

- Create: `src/core/flag-script.ts`. It has no imports and is browser-safe: add it to `BROWSER_SAFE`.
- Modify: `ARCHITECTURE.md` §0. Add one sentence: static share builds load `<base>livelocale/flag.js` (`src/core/flag-script.ts`) first in `<head>`, and it sets the global to `preview` only when a same-origin parent's path is under the folder `flag.js` is served from, so visitors who open the site directly stay `off`.
- Test: Create `tests/unit/flag-script.test.ts` (`// @vitest-environment node`) and `tests/e2e/share-flag.spec.ts`.

**Interfaces:**

- Consumes: `BROWSER_FLAG_GLOBAL` and `getLiveLocaleMode` from `src/core/env.ts` (existing; used by the test only).
- Produces. Pack (Tasks 21, 24), doctor (Task 49) and the E2E tests consume these.
  - `export const FLAG_SCRIPT_SIGNATURE = '/*! livelocale flag v1 */';`
  - `export const FLAG_SCRIPT: string;`, which is exactly the content below.
- The script is base-agnostic: the Studio folder is the folder `flag.js` itself is served from. It never overwrites a flag the page already set, never throws, and never logs.

  ```js
  /*! livelocale flag v1 */
  (function () {
    try {
      var me = document.currentScript;
      if (!me || !me.src || window.parent === window || window.__LIVELOCALE_FLAG__ !== undefined)
        return;
      var studio = new URL('.', me.src);
      var host = window.parent.location;
      if (
        host.origin === 'null' ||
        host.origin !== window.location.origin ||
        host.origin !== studio.origin
      )
        return;
      if (host.pathname.indexOf(studio.pathname) !== 0) return;
      window.__LIVELOCALE_FLAG__ = 'preview';
    } catch (e) {}
  })();
  ```

- [ ] **Step 1: Write the failing unit test.** Three helpers sit at the top of the file:
  - `fakeWindow({ self, parent, preset? })` returns `win = { location: { origin: self }, __LIVELOCALE_FLAG__: preset }` and sets `win.parent`:
    - `'self'` → `win` itself;
    - `'cross-origin'` → an object whose `location` getter throws `new DOMException('Blocked a frame', 'SecurityError')`;
    - `{ origin, pathname }` → `{ location: { origin, pathname } }`.
  - `runIn(win, src)` evaluates `new Function('window', 'document', FLAG_SCRIPT)(win, { currentScript: src === null ? null : { src } })`.
  - `run({ self, parent, src, preset? })` is `const win = fakeWindow(...); runIn(win, src); return win.__LIVELOCALE_FLAG__`.
  ```ts
  const SITE = 'https://acme.com';
  it('turns preview on when framed by the Studio', () => {
    for (const pathname of ['/livelocale/index.html', '/livelocale/'])
      expect(
        run({ self: SITE, parent: { origin: SITE, pathname }, src: `${SITE}/livelocale/flag.js` })
      ).toBe('preview');
  });
  it('works under a base path', () =>
    expect(
      run({
        self: 'https://u.github.io',
        parent: { origin: 'https://u.github.io', pathname: '/repo/livelocale/index.html' },
        src: 'https://u.github.io/repo/livelocale/flag.js',
      })
    ).toBe('preview'));
  it('stays off when not framed', () =>
    expect(run({ self: SITE, parent: 'self', src: `${SITE}/livelocale/flag.js` })).toBeUndefined());
  it('stays off and does not throw for a cross-origin parent', () =>
    expect(
      run({ self: SITE, parent: 'cross-origin', src: `${SITE}/livelocale/flag.js` })
    ).toBeUndefined());
  it.each([
    '/',
    '/checkout',
    '/livelocale',
    '/livelocale-evil/index.html',
    '/docs/livelocale/',
    '/admin/preview.html',
  ])('stays off for a same-origin parent at %s', (pathname) =>
    expect(
      run({ self: SITE, parent: { origin: SITE, pathname }, src: `${SITE}/livelocale/flag.js` })
    ).toBeUndefined()
  );
  it('stays off for a readable parent on another origin, or when both are opaque', () => {
    expect(
      run({
        self: SITE,
        parent: { origin: 'https://evil.com', pathname: '/livelocale/index.html' },
        src: `${SITE}/livelocale/flag.js`,
      })
    ).toBeUndefined();
    expect(
      run({
        self: 'null',
        parent: { origin: 'null', pathname: '/livelocale/' },
        src: `${SITE}/livelocale/flag.js`,
      })
    ).toBeUndefined();
  });
  it('stays off without currentScript', () =>
    expect(
      run({ self: SITE, parent: { origin: SITE, pathname: '/livelocale/' }, src: null })
    ).toBeUndefined());
  it('never overwrites a flag that is already set', () =>
    expect(
      run({
        self: SITE,
        parent: { origin: SITE, pathname: '/livelocale/' },
        src: `${SITE}/livelocale/flag.js`,
        preset: 'off',
      })
    ).toBe('off'));
  it('sets exactly the global env.ts reads', () => {
    expect(FLAG_SCRIPT).toContain(`window.${BROWSER_FLAG_GLOBAL} = 'preview'`);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', '');
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', '');
    const win = fakeWindow({ self: SITE, parent: { origin: SITE, pathname: '/livelocale/' } });
    vi.stubGlobal('window', win);
    runIn(win, `${SITE}/livelocale/flag.js`);
    expect(getLiveLocaleMode()).toBe('preview');
  });
  it('is a small ES5 classic script', () => {
    expect(FLAG_SCRIPT.startsWith(`${FLAG_SCRIPT_SIGNATURE}\n`)).toBe(true);
    expect(FLAG_SCRIPT.endsWith(')();\n')).toBe(true);
    expect(() => new vm.Script(FLAG_SCRIPT)).not.toThrow();
    expect(FLAG_SCRIPT).not.toMatch(/=>|\bconst\b|\blet\b|`|\bclass\b|\bimport\b|\bexport\b/);
    expect(Buffer.byteLength(FLAG_SCRIPT)).toBeLessThan(1024);
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/flag-script.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement `src/core/flag-script.ts` with the exact content above. It ends with a single `\n`. Then make the ARCHITECTURE.md edit.
- [ ] **Step 4:** Run `npx vitest run tests/unit/flag-script.test.ts tests/unit/core-browser-safe.test.ts`. Expected: PASS.
- [ ] **Step 5: Write the E2E** `tests/e2e/share-flag.spec.ts`.
  - It is self-contained. `beforeAll` writes a temp site and serves it with `http.createServer` on port 0, which answers on both `localhost` and `127.0.0.1`.
  - The temp site has these files:
    - `/index.html`, which contains `<script src="/livelocale/flag.js"></script>` first in `<head>` and `<script>document.documentElement.dataset.flag = String(window.__LIVELOCALE_FLAG__)</script>` in the body;
    - `/livelocale/flag.js`, which is `FLAG_SCRIPT` imported from `../../src/core/flag-script.js`;
    - `/livelocale/index.html`, which is `<iframe src="../index.html">`;
    - `/other/index.html`, which is `<iframe src="../index.html">`;
    - `/livelocale/cross.html`, which is `<iframe src="http://127.0.0.1:<port>/index.html">`.
  - Assert `data-flag` on the app document in four cases: a direct visit gives `'undefined'`, the Studio frame gives `'preview'`, the `/other/` frame gives `'undefined'`, and the cross-origin frame gives `'undefined'`.
  - Run `npx playwright test tests/e2e/share-flag.spec.ts`. Expected: PASS (4 tests). If Playwright's loader does not map `.js` to `.ts`, import extensionless.
- [ ] **Step 6:** Commit `feat(share): add the framed-only flag.js gate`.

---

### Task 13: Same-origin parent in Studio origin resolution

**Files:**

- Modify: `src/client/iframe-bridge.ts`
- Test: append to `tests/unit/studio-origin.test.ts`

**Interfaces:**

- Consumes: the existing `toHttpOrigin`, `STUDIO_ORIGIN_STORAGE_KEY` and `DEFAULT_STUDIO_ORIGIN`.
- Produces:
  ```ts
  /** toHttpOrigin(win.location.origin) when that is non-null and win.parent is a different window whose readable origin is identical; else null (opaque origins included). Never throws. */
  export function readSameOriginParent(win: Window): string | null;
  export function resolveStudioOrigin(
    search: string,
    storage: Storage | null,
    sameOriginParent?: string | null
  ): string;
  ```
- New resolution order:
  1. The same-origin parent. This branch neither reads nor writes storage.
  2. The query parameter, which is remembered for the tab.
  3. The remembered origin.
  4. `http://localhost:3010`.

  `sendToParent` always posts to `window.parent`, so a readable same-origin parent is the only origin that can receive the messages. This order deliberately differs from the spec, which places the same-origin parent only ahead of the `http://localhost:3010` fallback; "Cross-draft reconciliations" records why.

- [ ] **Step 1: Write the failing tests.** The existing two-argument tests stay unchanged.
  ```ts
  describe('resolveStudioOrigin with a same-origin parent', () => {
    beforeEach(() => sessionStorage.clear());
    it('prefers the same-origin parent over the query and leaves storage alone', () => {
      expect(
        resolveStudioOrigin(
          '?livelocale-origin=http%3A%2F%2Flocalhost%3A3011',
          sessionStorage,
          'https://www.acme.com'
        )
      ).toBe('https://www.acme.com');
      expect(sessionStorage.getItem(STUDIO_ORIGIN_STORAGE_KEY)).toBeNull();
    });
    it('prefers the same-origin parent over a remembered origin', () => {
      sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, 'http://localhost:3010');
      expect(resolveStudioOrigin('', sessionStorage, 'https://www.acme.com')).toBe(
        'https://www.acme.com'
      );
    });
    it('uses the same-origin parent after a navigation with nothing remembered', () =>
      expect(resolveStudioOrigin('?locale=ar', null, 'https://www.acme.com')).toBe(
        'https://www.acme.com'
      ));
    it('keeps the existing order when there is no same-origin parent', () => {
      expect(resolveStudioOrigin('', sessionStorage, null)).toBe(DEFAULT_STUDIO_ORIGIN);
      resolveStudioOrigin(
        '?livelocale-origin=https%3A%2F%2Fstudio.example.com',
        sessionStorage,
        null
      );
      expect(resolveStudioOrigin('', sessionStorage, null)).toBe('https://studio.example.com');
    });
    it('ignores a same-origin value that is not http(s)', () => {
      for (const bad of ['null', 'file://', ''])
        expect(resolveStudioOrigin('', null, bad)).toBe(DEFAULT_STUDIO_ORIGIN);
    });
  });
  describe('readSameOriginParent', () => {
    const ORIGIN = 'https://www.acme.com';
    const make = (parent: unknown, origin = ORIGIN) => {
      const w: any = { location: { origin } };
      w.parent = parent === 'self' ? w : parent;
      return w as Window;
    };
    it('returns the origin for a readable same-origin parent', () =>
      expect(readSameOriginParent(make({ location: { origin: ORIGIN } }))).toBe(ORIGIN));
    it('returns null for a top-level page or a missing parent', () => {
      expect(readSameOriginParent(make('self'))).toBeNull();
      expect(readSameOriginParent(make(null))).toBeNull();
    });
    it('returns null, without throwing, for a cross-origin parent', () => {
      const parent = {
        get location(): never {
          throw new DOMException('Blocked a frame', 'SecurityError');
        },
      };
      expect(readSameOriginParent(make(parent))).toBeNull();
    });
    it('returns null when a readable parent has another origin (document.domain)', () =>
      expect(
        readSameOriginParent(make({ location: { origin: 'https://studio.acme.com' } }))
      ).toBeNull());
    it('returns null for an opaque own origin', () =>
      expect(readSameOriginParent(make({ location: { origin: 'null' } }, 'null'))).toBeNull());
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-origin.test.ts`. Expected: FAIL.
  - The new cases fail with `readSameOriginParent is not a function`.
  - The precedence cases fail with `expected 'http://localhost:3011' to be 'https://www.acme.com'`.
  - The original tests pass.
- [ ] **Step 3: Implement.**
  - `resolveStudioOrigin` returns `toHttpOrigin(sameOriginParent)` first when that is non-null.
  - `readSameOriginParent`, inside `try/catch`, returns `toHttpOrigin(win.location.origin)` only when that is non-null **and** equal to `win.parent.location.origin` (with `win.parent` a different window). In every other case, including two opaque `'null'` origins, it returns `null`. The JSDoc says the same.
  - Rewrite the `resolveStudioOrigin` JSDoc to state the order and the reason for it.
- [ ] **Step 4:** Run the same command. Expected: PASS (old and new).
- [ ] **Step 5:** Commit `feat: let the client resolve a same-origin Studio parent`.

---

### Task 14: Auto-init posts to a same-origin Studio

**Files:**

- Modify: `src/client/index.ts`
- Modify: `ARCHITECTURE.md` §7. Replace "reads the Studio origin from the `livelocale-origin` query parameter" with the order from Task 13.
- Test: Create `tests/integration/client-same-origin.test.ts` (`// @vitest-environment jsdom`).

**Interfaces:**

- Consumes:
  - `FLAG_SCRIPT` (Task 12).
  - `readSameOriginParent` and `resolveStudioOrigin(search, storage, sameOriginParent)` (Task 13).
  - `STUDIO_ORIGIN_STORAGE_KEY`, `BROWSER_FLAG_GLOBAL`, `getLiveLocaleMode`.
  - `encodeKey` and `stripWatermark` from `src/client/watermark.ts`.
- Produces: the runtime behaviour. Inside a same-origin Studio, the client sends `READY`, `ELEMENT_SELECTED` and `VISIBLE_KEYS_CHANGED` to `window.location.origin`, and accepts `APPLY_PREVIEW`, `COMMIT_PREVIEW` and `CLEAR_SELECTION` from it, on every page load, with or without `?livelocale-origin=`.

- [ ] **Step 1: Write the failing test.**
  ```ts
  const OWN = 'http://localhost:3000'; // Vitest's jsdom URL
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  const setParent = (p: unknown) =>
    Object.defineProperty(window, 'parent', { value: p, configurable: true, writable: true });
  const studioParent = () => ({
    postMessage: vi.fn(),
    location: { origin: OWN, pathname: '/livelocale/index.html' },
  });
  const runFlag = () =>
    new Function('window', 'document', FLAG_SCRIPT)(window, {
      currentScript: { src: `${OWN}/livelocale/flag.js` },
    });
  const bootClient = async () => {
    vi.resetModules();
    await import('../../src/client/index.js');
  };
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LIVELOCALE', '');
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', '');
    sessionStorage.clear();
    document.body.innerHTML = `<h1>${encodeKey('Hello', 'home.title')}</h1>`;
  });
  afterEach(() => {
    (window as any).__LIVELOCALE_CLIENT__?.interceptor.destroy();
    delete (window as any).__LIVELOCALE_CLIENT__;
    delete (window as any)[BROWSER_FLAG_GLOBAL];
    if (originalParent) Object.defineProperty(window, 'parent', originalParent);
    else delete (window as any).parent;
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it('activates from flag.js inside a same-origin Studio and greets it on its own origin', async () => {
    const parent = studioParent();
    setParent(parent);
    runFlag();
    expect(getLiveLocaleMode()).toBe('preview');
    await bootClient();
    expect(parent.postMessage).toHaveBeenCalledWith(
      { source: 'livelocale-client', type: 'READY', payload: { url: '/' } },
      OWN
    );
  });
  it('applies COMMIT_PREVIEW sent by the same-origin Studio', async () => {
    setParent(studioParent());
    runFlag();
    await bootClient();
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: OWN,
        data: {
          source: 'livelocale-studio',
          type: 'COMMIT_PREVIEW',
          payload: { key: 'home.title', value: 'Bonjour' },
        },
      })
    );
    expect(stripWatermark(document.querySelector('h1')!.textContent ?? '')).toBe('Bonjour');
  });
  it('greets a same-origin Studio even when an older cross-origin Studio is remembered', async () => {
    sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, 'http://localhost:3010');
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'READY' }),
      OWN
    );
  });
  it('stays off for a visitor who opens the site directly', async () => {
    runFlag(); // window.parent === window
    expect((window as any)[BROWSER_FLAG_GLOBAL]).toBeUndefined();
    expect(getLiveLocaleMode()).toBe('off');
    await bootClient();
    expect((window as any).__LIVELOCALE_CLIENT__).toBeUndefined();
    expect(document.querySelector('[data-i18n-key]')).toBeNull();
  });
  it('keeps the remembered origin under a cross-origin Studio (preview builds)', async () => {
    const parent = {
      postMessage: vi.fn(),
      get location(): never {
        throw new DOMException('Blocked a frame', 'SecurityError');
      },
    };
    setParent(parent);
    (window as any)[BROWSER_FLAG_GLOBAL] = 'preview';
    sessionStorage.setItem(STUDIO_ORIGIN_STORAGE_KEY, 'https://studio.example.com');
    await bootClient();
    expect(parent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'READY' }),
      'https://studio.example.com'
    );
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/integration/client-same-origin.test.ts`. Expected: FAIL in the three same-origin tests. `READY` goes to `http://localhost:3010` and the `<h1>` stays `Hello`. The other two tests pass.
- [ ] **Step 3:** Change the call to `resolveStudioOrigin(window.location.search, storage, readSameOriginParent(window))`, and import `readSameOriginParent`. Nothing else changes. Then make the ARCHITECTURE edit.
- [ ] **Step 4:** Run the test (Expected: PASS, 5 tests), then `npx playwright test tests/e2e/visual-sync.spec.ts`. Expected: PASS, because the cross-origin dev path (Studio :3010 → playground :3000) is unchanged.
- [ ] **Step 5:** Commit `feat: post to a same-origin Studio after full-page navigation`.

---

### Task 15: Report visible texts for page-locale inference

**Files:**

- Modify: `src/client/iframe-bridge.ts`, `src/client/dom-interceptor.ts`, `src/client/index.ts`.
- Modify: `ARCHITECTURE.md`. Add `VISIBLE_TEXTS_CHANGED` to the data-flow postMessage list. In §7, add one sentence: the client reports up to 100 visible key/text pairs so the Studio can infer the page locale before the first click.
- Test: append to `tests/unit/dom-interceptor.test.ts`, `tests/integration/iframe-communication.test.ts` and `tests/integration/client-same-origin.test.ts`.

**Interfaces:**

- Consumes: the Task 14 test helpers; `decodeKey` from `src/client/watermark.ts`.
- Produces. The Studio consumes this in Tasks 33 and 36.

  ```ts
  // src/client/iframe-bridge.ts
  export type ClientMessageType = 'ELEMENT_SELECTED' | 'READY' | 'ERROR' | 'VISIBLE_KEYS_CHANGED' | 'VISIBLE_TEXTS_CHANGED';
  export interface VisibleText { key: string; text: string }
  export const MAX_VISIBLE_TEXTS = 100;
  export const MAX_VISIBLE_TEXT_LENGTH = 200;
  // src/client/dom-interceptor.ts
  getVisibleTexts(limit?: number /* = MAX_VISIBLE_TEXTS */): VisibleText[];
  // message { source: 'livelocale-client', type: 'VISIBLE_TEXTS_CHANGED', payload: VisibleText[] },
  // sent right after every VISIBLE_KEYS_CHANGED (same 200 ms debounce). src/client/index.ts re-exports `type VisibleText`.
  ```

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // tests/unit/dom-interceptor.test.ts
  describe('getVisibleTexts', () => {
    it('returns one entry per key, in document order, with the clean text shown now', () => {
      document.body.innerHTML = `<h1>${encodeKey('Hello', 'home.title')}</h1><p>${encodeKey('Bye', 'home.bye')}</p><span>${encodeKey('Hello again', 'home.title')}</span>`;
      interceptor.init();
      expect(interceptor.getVisibleTexts()).toEqual([
        { key: 'home.title', text: 'Hello' },
        { key: 'home.bye', text: 'Bye' },
      ]);
    });
    it('reflects text replaced after the first scan (in-app language switch)', () => {
      document.body.innerHTML = `<h1>${encodeKey('Hello', 'home.title')}</h1>`;
      interceptor.init();
      document.querySelector('h1')!.firstChild!.nodeValue = encodeKey('مرحبا', 'home.title');
      expect(interceptor.getVisibleTexts()).toEqual([{ key: 'home.title', text: 'مرحبا' }]);
    });
    it('skips keyed elements without a matching watermark or with blank text', () => {
      document.body.innerHTML = `<div data-i18n-key="legacy.key">Plain</div><p>${encodeKey('   ', 'home.blank')}</p>`;
      interceptor.init();
      expect(interceptor.getVisibleTexts()).toEqual([]);
    });
    it('caps the count and the length', () => {
      document.body.innerHTML = Array.from(
        { length: 150 },
        (_, i) => `<p>${encodeKey('x'.repeat(500), `k.n${i}`)}</p>`
      ).join('');
      interceptor.init();
      const texts = interceptor.getVisibleTexts();
      expect(texts).toHaveLength(MAX_VISIBLE_TEXTS);
      expect(texts[0]!.text).toHaveLength(MAX_VISIBLE_TEXT_LENGTH);
    });
  });
  // tests/integration/iframe-communication.test.ts
  it('sanitises VISIBLE_TEXTS_CHANGED payloads', () => {
    bridge.sendToParent('VISIBLE_TEXTS_CHANGED', [
      { key: 'home.title', text: 'Hello' },
      { key: 'bad key!', text: 'x' },
      { key: 'home.n', text: 42 },
      { key: 'home.long', text: 'y'.repeat(MAX_VISIBLE_TEXT_LENGTH + 50) },
      'junk',
    ]);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      {
        source: 'livelocale-client',
        type: 'VISIBLE_TEXTS_CHANGED',
        payload: [
          { key: 'home.title', text: 'Hello' },
          { key: 'home.long', text: 'y'.repeat(MAX_VISIBLE_TEXT_LENGTH) },
        ],
      },
      ALLOWED_ORIGIN
    );
  });
  it('caps VISIBLE_TEXTS_CHANGED and drops non-array payloads', () => {
    bridge.sendToParent('VISIBLE_TEXTS_CHANGED', 'nope');
    expect(window.parent.postMessage).not.toHaveBeenCalled();
    bridge.sendToParent(
      'VISIBLE_TEXTS_CHANGED',
      Array.from({ length: 150 }, (_, i) => ({ key: `k.n${i}`, text: 't' }))
    );
    expect((window.parent.postMessage as any).mock.calls[0][0].payload).toHaveLength(
      MAX_VISIBLE_TEXTS
    );
  });
  // tests/integration/client-same-origin.test.ts
  it('reports visible keys and then visible texts after the debounce', async () => {
    vi.useFakeTimers();
    const parent = studioParent();
    setParent(parent);
    runFlag();
    await bootClient();
    vi.advanceTimersByTime(200);
    expect(parent.postMessage.mock.calls.map(([m]) => m.type)).toEqual([
      'READY',
      'VISIBLE_KEYS_CHANGED',
      'VISIBLE_TEXTS_CHANGED',
    ]);
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      {
        source: 'livelocale-client',
        type: 'VISIBLE_TEXTS_CHANGED',
        payload: [{ key: 'home.title', text: 'Hello' }],
      },
      OWN
    );
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/dom-interceptor.test.ts tests/integration/iframe-communication.test.ts tests/integration/client-same-origin.test.ts`. Expected: FAIL. `getVisibleTexts` is not a function, the payload is unsanitised, and the message types are `['READY', 'VISIBLE_KEYS_CHANGED']`.
- [ ] **Step 3: Implement.**
  - **`getVisibleTexts`** walks `[data-i18n-key]` in document order and keeps the first element per key.
    - Text comes from the first descendant text node whose `decodeKey(...)?.key` matches. Use its `cleanText.trim()`, sliced to 200 characters.
    - Skip blank entries.
  - **`sendToParent`** gains a `VISIBLE_TEXTS_CHANGED` branch next to CLT-006.
    - Drop non-arrays.
    - Keep only entries whose `key` matches `/^[a-zA-Z0-9._-]+$/` and whose `text` is a string.
    - Slice each text and cap the list.
  - **`index.ts`** sends `VISIBLE_KEYS_CHANGED`, then `VISIBLE_TEXTS_CHANGED` with `interceptor.getVisibleTexts()`. It also re-exports `type VisibleText`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat: report visible texts so the Studio can infer the page locale`.

---

### Task 16: Build info from git and CI variables

**Files:**

- Create: `src/server/build-info.ts`
- Test: Create `tests/unit/build-info.test.ts` and `tests/unit/helpers/fake-git.ts`.

**Interfaces:**

- Consumes: `isValidBranchName` (Task 6).
- Produces. These are used by Task 20 and reused by `init --share` (Task 58).
  ```ts
  export type GitRunner = (args: string[], cwd: string) => Promise<string | null>; // trimmed stdout, null on any failure
  export const runGit: GitRunner; // execFile('git', args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  export interface BuildInfoOptions {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    git?: GitRunner;
    includeRepo?: boolean;
  }
  export interface BuildInfo {
    repo: string | null;
    defaultBranch: string | null;
    branch: string | null;
    base: string | null;
    gitRoot: string | null;
  }
  export async function resolveBuildInfo(options: BuildInfoOptions): Promise<BuildInfo>;
  export function parseGitHubSlug(remote: string): string | null;
  // tests/unit/helpers/fake-git.ts
  export function fakeGit(answers: Record<string, string | null>): GitRunner & { calls: string[] }; // key = args.join(' '); missing key → null
  ```
- Precedence: the first valid source wins, and an empty or invalid value falls through to the next.

  | Field           | Order                                                                                                                                                                                                                                                                                                                                                                         |
  | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `branch`        | `GITHUB_HEAD_REF` → `GITHUB_REF_NAME` (only when `GITHUB_REF_TYPE === 'branch'`) → `VERCEL_GIT_COMMIT_REF` → `CF_PAGES_BRANCH` → `BRANCH` (only when `NETLIFY === 'true'`) → `CI_COMMIT_REF_NAME` (only when `GITLAB_CI === 'true'`) → `git rev-parse --abbrev-ref HEAD` (ignored when it prints `HEAD`) → null. Valid means `isValidBranchName` passes.                      |
  | `base`          | `pull_request.head.sha` from `$GITHUB_EVENT_PATH` (only for `pull_request`/`pull_request_target`) → `GITHUB_SHA` → `VERCEL_GIT_COMMIT_SHA` → `CF_PAGES_COMMIT_SHA` → `COMMIT_REF` (Netlify only) → `CI_COMMIT_SHA` (GitLab only) → `git rev-parse HEAD` → null. Valid means `/^[0-9a-f]{40}([0-9a-f]{24})?$/i`, and the result is lowercased.                                 |
  | `defaultBranch` | `repository.default_branch` from `$GITHUB_EVENT_PATH` → `git symbolic-ref --short refs/remotes/origin/HEAD` without the leading `origin/` → null. Valid means `isValidBranchName` passes.                                                                                                                                                                                     |
  | `repo`          | Only when `includeRepo`; otherwise null, and `git remote` is never called. Order: `GITHUB_REPOSITORY` (only when `GITHUB_SERVER_URL` is unset or `https://github.com`) → `VERCEL_GIT_REPO_OWNER/VERCEL_GIT_REPO_SLUG` (only when `VERCEL_GIT_PROVIDER === 'github'`) → `parseGitHubSlug(REPOSITORY_URL)` (Netlify only) → `parseGitHubSlug(git remote get-url origin)` → null |
  | `gitRoot`       | `path.resolve(git rev-parse --show-toplevel)` → null                                                                                                                                                                                                                                                                                                                          |

- [ ] **Step 1: Write the failing test.** `SHA_A`, `SHA_B` and `SHA_C` are distinct 40-hex strings, and `event(obj)` writes a temp JSON file and returns its path.
  ```ts
  const local = { 'rev-parse --show-toplevel': '/repo', 'rev-parse --abbrev-ref HEAD': 'feature/login', 'rev-parse HEAD': SHA_A,
    'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main' };
  it('reads a local checkout', async () => expect(await resolveBuildInfo({ cwd: '/repo', env: {}, git: fakeGit(local) }))
    .toStrictEqual({ repo: null, defaultBranch: 'main', branch: 'feature/login', base: SHA_A, gitRoot: path.resolve('/repo') }));
  it('treats a detached HEAD as no branch', ...);                       // abbrev-ref 'HEAD' ⇒ branch null
  it('prefers GitHub push variables and the event default branch', ...); // GITHUB_SHA SHA_B, GITHUB_REF_NAME 'main', GITHUB_REF_TYPE 'branch', event {repository:{default_branch:'trunk'}} ⇒ base SHA_B, branch 'main', defaultBranch 'trunk'
  it('uses the PR head on pull_request events', ...);                   // GITHUB_HEAD_REF 'fix/typo', GITHUB_REF_NAME '12/merge', GITHUB_SHA SHA_B, event head.sha SHA_C ⇒ branch 'fix/typo', base SHA_C
  it('ignores a tag ref name', ...);                                    // GITHUB_REF_TYPE 'tag', GITHUB_REF_NAME 'v1.0.0' ⇒ branch 'feature/login'
  it('skips a branch name the link schema would reject', ...);          // GITHUB_REF_NAME '-x', GITHUB_REF_TYPE 'branch' ⇒ branch 'feature/login'
  it('reads Vercel, Cloudflare Pages and Netlify', ...);                // one case each; BRANCH/COMMIT_REF without NETLIFY='true' ignored
  it('skips an invalid SHA and lowercases a valid one', ...);           // 'not-a-sha' ⇒ SHA_A; SHA_B.toUpperCase() ⇒ SHA_B
  it('never asks git for the remote unless includeRepo', async () => {
    const git = fakeGit(local);
    const info = await resolveBuildInfo({ cwd: '/repo', env: { GITHUB_REPOSITORY: 'acme/site' }, git });
    expect(info.repo).toBeNull(); expect(git.calls.some((c) => c.startsWith('remote'))).toBe(false);
  });
  it('reads the repo from GitHub, Vercel and the origin remote', ...);  // 'acme/site' each; GITHUB_SERVER_URL 'https://ghe.acme.com' ⇒ remote; VERCEL_GIT_PROVIDER 'gitlab' ⇒ null
  it('returns all nulls without git or CI', ...);                      // env {}, fakeGit({}) ⇒ { repo: null, defaultBranch: null, branch: null, base: null, gitRoot: null }
  it.each([
    ['https://github.com/acme/site.git', 'acme/site'], ['https://x-access-token:ghs_abc@github.com/acme/site', 'acme/site'],
    ['git@github.com:acme/site.git', 'acme/site'], ['ssh://git@github.com/acme/site.git', 'acme/site'],
    ['https://github.com/acme/site/', 'acme/site'], ['https://gitlab.com/acme/site.git', null],
    ['https://github.com.evil.com/acme/site', null], ['git@github.com:acme', null],
  ])('parseGitHubSlug(%s)', (input, out) => expect(parseGitHubSlug(input)).toBe(out));
  it('runGit returns null outside a repository', async () => expect(await runGit(['rev-parse', '--show-toplevel'], os.tmpdir())).toBeNull());
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/build-info.test.ts`. Expected: FAIL, because `src/server/build-info.js` is not found.
- [ ] **Step 3:** Implement following the table. Read `$GITHUB_EVENT_PATH` once with `readFileSync`, guarded, and treat a parse failure as an empty payload. Credentials embedded in remotes never leave `parseGitHubSlug`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pack): read branch, commit and repository from git and CI`.

---

### Task 17: Base path and head injection (`PackError`, `share-html`)

**Files:**

- Create: `src/server/pack-error.ts`, `src/server/share-html.ts`
- Test: Create `tests/unit/share-html.test.ts`

**Interfaces:**

- Consumes: `SHARE_DIR`, `SHARE_FLAG_FILE` (Task 11).
- Produces:
  ```ts
  // pack-error.ts
  export type PackErrorCode =
    | 'USAGE'
    | 'BAD_BASE'
    | 'LOCALES_NOT_FOUND'
    | 'NO_LOCALES'
    | 'SOURCE_LOCALE_NOT_FOUND'
    | 'INVALID_LOCALE_FILE'
    | 'OUT_DIR_NOT_FOUND'
    | 'STUDIO_NOT_FOUND'
    | 'SHARE_DIR_TAKEN'
    | 'NEXT_EXPORT_POST_ROUTE'
    | 'OUTPUT_NOT_FOUND';
  export class PackError extends Error {
    readonly code: PackErrorCode;
    constructor(code: PackErrorCode, message: string);
  } // name 'PackError'
  // share-html.ts
  export type AppBase = { kind: 'absolute'; path: string } | { kind: 'relative' };
  export function normalizeBase(value: string): AppBase;
  export function basePathOf(base: AppBase): string | null; // absolute → path, relative → null
  export function flagSrcFor(base: AppBase, htmlRelPath: string): string; // htmlRelPath is POSIX, relative to the output root
  export function shareUrlPathFor(base: AppBase): string; // '/repo/livelocale/index.html' | 'livelocale/index.html'
  export function injectFlagScript(html: string, src: string): string;
  ```
- Pinned error copy:
  - When the base is a full URL: `The app base "<v>" is a full URL. Pass the path your HTML is served from, for example --base /app/ (shareBase in the Vite plugin).`
  - For any other bad base: `The app base "<v>" is not a site path. Use "/", "/app/" or "./".`
- `injectFlagScript` rules:
  - The tag is exactly `<script src="${escaped}"></script>`.
  - An existing tag matching `/<script\b[^>]*\bsrc="[^"]*livelocale\/flag\.js"[^>]*>\s*<\/script>/gi` is removed first, which makes injection idempotent.
  - The head pattern is `/<head(?=[\s>])[^>]*>/i`.
  - Fallbacks, in order: after `<html…>`, then after the doctype, then at the start.

- [ ] **Step 1: Write the failing test.**
  ```ts
  it.each([['/', '/'], ['/repo', '/repo/'], ['/repo/', '/repo/'], ['/a/b', '/a/b/']])('normalizeBase(%s) is absolute %s', (v, p) =>
    expect(normalizeBase(v)).toEqual({ kind: 'absolute', path: p }));
  it.each(['', '.', './'])('normalizeBase(%j) is relative', (v) => expect(normalizeBase(v)).toEqual({ kind: 'relative' }));
  it.each(['https://cdn.acme.com/', '//cdn.acme.com/', 'app/', '/a/../b/', '/a b/', '/a?x', '/a"b/'])('rejects %s', (v) =>
    expect(() => normalizeBase(v)).toThrow(expect.objectContaining({ code: 'BAD_BASE' })));
  it('flagSrcFor absolute', () => expect(flagSrcFor({ kind: 'absolute', path: '/repo/' }, 'a/b/index.html')).toBe('/repo/livelocale/flag.js'));
  it.each([['index.html', './livelocale/flag.js'], ['docs/a.html', '../livelocale/flag.js'], ['a/b/c.html', '../../livelocale/flag.js']])(
    'flagSrcFor relative %s', (rel, src) => expect(flagSrcFor({ kind: 'relative' }, rel)).toBe(src));
  it('shareUrlPathFor', () => {
    expect(shareUrlPathFor({ kind: 'absolute', path: '/repo/' })).toBe('/repo/livelocale/index.html');
    expect(shareUrlPathFor({ kind: 'relative' })).toBe('livelocale/index.html');
  });
  const TAG = '<script src="/livelocale/flag.js"></script>';
  it('inserts as the first child of <head>', () =>
    expect(injectFlagScript('<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body></body></html>', '/livelocale/flag.js'))
      .toBe(`<!doctype html><html><head>${TAG}<meta charset="utf-8"><title>x</title></head><body></body></html>`));
  it('handles <HEAD> with attributes', () => expect(injectFlagScript('<HEAD data-x="1"><title>x</title></HEAD>', '/livelocale/flag.js')).toBe(`<HEAD data-x="1">${TAG}<title>x</title></HEAD>`));
  it('never matches <header>; falls back to after <html>', () =>
    expect(injectFlagScript('<html lang="ar"><body><header>h</header></body></html>', '/livelocale/flag.js')).toBe(`<html lang="ar">${TAG}<body><header>h</header></body></html>`));
  it('falls back to after the doctype, then to the start', () => {
    expect(injectFlagScript('<!DOCTYPE html><p>x</p>', '/livelocale/flag.js')).toBe(`<!DOCTYPE html>${TAG}<p>x</p>`);
    expect(injectFlagScript('<p>x</p>', '/livelocale/flag.js')).toBe(`${TAG}<p>x</p>`);
  });
  it('is idempotent and replaces a tag with an old base', () => {
    const once = injectFlagScript('<head><script src="/old/livelocale/flag.js"></script><title>x</title></head>', '/livelocale/flag.js');
    expect(injectFlagScript(once, '/livelocale/flag.js')).toBe(`<head>${TAG}<title>x</title></head>`);
  });
  it('escapes the attribute', () => expect(injectFlagScript('<head></head>', '/a"b&/livelocale/flag.js')).toBe('<head><script src="/a&quot;b&amp;/livelocale/flag.js"></script></head>'));
  it('leaves other scripts alone', ...); // a module script and an inline script stay byte-identical after the inserted tag
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/share-html.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement both files.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pack): base-aware flag.js injection into HTML`.

---

### Task 18: Build target detection and the Next export guard

**Files:**

- Create: `src/server/build-target.ts`
- Test: Create `tests/unit/build-target.test.ts`

**Interfaces:**

- Produces. These are used by Tasks 21 and 23, and reused by `init --share` (Task 58).
  ```ts
  export const NEXT_CONFIG_FILES = [
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
    'next.config.ts',
    'next.config.mts',
  ];
  export type BuildTarget =
    | { kind: 'next'; staticExport: boolean; base: string | null } // base = Next basePath
    | { kind: 'cra'; base: string | null } // from package.json homepage ('./' for '.')
    | { kind: 'vite'; base: null }
    | { kind: 'other'; base: null };
  export function detectBuildTarget(projectDir: string): BuildTarget;
  export function findExportBlockingRoute(projectDir: string): string | null; // POSIX path relative to the project
  export function outputCandidates(target: BuildTarget): string[];
  ```
- **Detection order.** The first match wins:
  1. **Next:** a `NEXT_CONFIG_FILES` entry exists, or `next` is a dependency.
  2. **CRA:** `react-scripts` is a dependency.
  3. **Vite:** `vite` is a dependency, or a `vite.config.{js,mjs,cjs,ts,mts}` file exists.
  4. **Other.**
- **Next config parsing.** Matching runs after removing `/* … */` blocks and lines whose trimmed start is `//`.
  - `staticExport` matches `/\boutput\s*:\s*['"\x60]export['"\x60]/`.
  - `basePath` matches `/\bbasePath\s*:\s*['"\x60](\/[^'"\x60]*)['"\x60]/`.
- **CRA homepage.** For a URL, `homepage` contributes its pathname.
- **Blocking route.**
  - Candidates are `{app,src/app}/api/livelocale/route.{ts,js,mjs,tsx,jsx}`.
  - A candidate blocks the export when it matches `/export\s+(?:const|let|var|async\s+function|function)\s+POST\b|export\s*\{[^}]*\bPOST\b[^}]*\}/`.
- **`outputCandidates`.** CRA gives `['build','dist','out']`; every other target gives `['dist','build','out']`.

- [ ] **Step 1: Write the failing test.** Each case runs in a fresh temp project. The helper `write(rel, text, dir = mkdtempSync(join(tmpdir(), 'bt-')))` creates the parent folders, writes `text` to `<dir>/<rel>` and returns `dir`; calling it again with that `dir` adds a file to the same project.
  ```ts
  it('reads Next export and basePath', ...);                // next.config.mjs { output: 'export', basePath: '/docs' } ⇒ { kind: 'next', staticExport: true, base: '/docs' }
  it('detects Next from dependencies alone', ...);          // { kind: 'next', staticExport: false, base: null }
  it('ignores commented-out output lines', ...);            // "// output: 'export'," and "/* output: 'export' */" ⇒ staticExport false
  it('prefers Next when vite is also installed', ...);      // deps next + devDeps vite, vitest ⇒ kind 'next'
  it('reads CRA homepage', ...);                            // 'https://acme.github.io/shop' ⇒ '/shop'; '.' ⇒ './'; none ⇒ null
  it('detects Vite from deps or config file', ...);         // { kind: 'vite', base: null }
  it('falls back to other', ...);                           // package.json { dependencies: { react: '^18' } } ⇒ { kind: 'other', base: null }
  it.each([
    ['app/api/livelocale/route.ts', 'export const POST = handler;'],
    ['src/app/api/livelocale/route.js', 'export async function POST(req) {}'],
    ['app/api/livelocale/route.ts', 'export { handler as GET, handler as POST };'],
  ])('finds the blocking route %s', (rel, src) => expect(findExportBlockingRoute(write(rel, src))).toBe(rel));
  it('ignores a GET-only route and a missing route', ...);  // null
  it('orders output candidates', () => {
    expect(outputCandidates({ kind: 'cra', base: null })).toEqual(['build', 'dist', 'out']);
    expect(outputCandidates({ kind: 'vite', base: null })).toEqual(['dist', 'build', 'out']);
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/build-target.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement `src/server/build-target.ts`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pack): detect the build stack and the Next export route conflict`.

---

### Task 19: Studio bundle for static hosting (relative base, self-hosted fonts, noindex)

**Files:**

- Modify: `src/studio/vite.config.ts` to set `base: './'`.
- Modify: `src/studio/index.html`. Remove the two preconnect links and the Google Fonts stylesheet, and add `<meta name="robots" content="noindex, nofollow" />` after the viewport meta.
- Modify: `src/studio/main.tsx` to import the fonts before `./index.css`.
- Modify: `package.json` and `package-lock.json`. Add devDependencies `@fontsource/inter@^5` and `@fontsource/outfit@^5`. `dependencies` is unchanged.
- Test: Create `tests/unit/studio-static-build.test.ts` and `tests/integration/studio-bundle.test.ts`.

**Interfaces:**

- Produces: a built `dist/studio/` whose `index.html` uses `./assets/…` URLs, loads nothing from third parties, and is `noindex`. It is shipped through `"files": ["dist"]` and consumed by `resolveStudioDir` (Task 21).

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // studio-static-build.test.ts
  import studioConfig from '../../src/studio/vite.config.js';
  it('builds with a relative base', () =>
    expect((studioConfig as any)({ command: 'build', mode: 'production' }).base).toBe('./'));
  it('loads no remote fonts and is noindex', () => {
    const html = fs.readFileSync('src/studio/index.html', 'utf-8');
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
  it('imports the latin font files', () => {
    const main = fs.readFileSync('src/studio/main.tsx', 'utf-8');
    for (const w of [300, 400, 500, 600, 700])
      expect(main).toContain(`import '@fontsource/inter/latin-${w}.css';`);
    for (const w of [400, 500, 600, 700])
      expect(main).toContain(`import '@fontsource/outfit/latin-${w}.css';`);
  });
  // studio-bundle.test.ts: describe.skipIf(!fs.existsSync('dist/studio/index.html'))
  // dirBytes(dir): the sum of fs.statSync(f).size over every file under dir, walked recursively with readdirSync
  //   (defined at the top of studio-bundle.test.ts)
  it('ships a relocatable, private, self-contained Studio', () => {
    const html = fs.readFileSync('dist/studio/index.html', 'utf-8');
    expect(html).toContain('src="./assets/');
    expect(html).not.toContain('src="/assets/');
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(fs.readdirSync('dist/studio/assets').some((f) => f.endsWith('.woff2'))).toBe(true);
    expect(dirBytes('dist/studio')).toBeLessThan(1_000_000);
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-static-build.test.ts`. Expected: FAIL, because `base` is undefined and the Google Fonts link is present.
- [ ] **Step 3:** Run `npm i -D @fontsource/inter@^5 @fontsource/outfit@^5`. Expected: both packages appear only under `devDependencies` in `package.json`, and `dependencies` is unchanged. Then apply the file changes listed under **Files**.
- [ ] **Step 4:** Run `npm run build && npx vitest run tests/unit/studio-static-build.test.ts tests/integration/studio-bundle.test.ts tests/unit/studio-server.test.ts`. Expected: PASS. Then run `npx playwright test tests/e2e/visual-sync.spec.ts`. Expected: PASS, so the dev Studio on :3010 still works with `base: './'`.
- [ ] **Step 5:** Commit `build(studio): relative asset base, self-hosted fonts and noindex`.

---

### Task 20: Manifest and locale dictionaries (`collectShareData`)

**Files:**

- Create: `src/server/pack.ts` (first part).
- Test: Create `tests/unit/pack-manifest.test.ts` and `tests/unit/helpers/share-project.ts`.

**Interfaces:**

- Consumes:
  - `ShareManifest`, `SHARE_MANIFEST_FORMAT` (Task 11).
  - `resolveBuildInfo`, `GitRunner`, `fakeGit` (Task 16).
  - `PackError` (Task 17).
  - Existing `KeyScanner({ requireEnabled: false }).scanSourceKeys(projectDir)` and `LOCALE_RE`.
- Produces:
  ```ts
  export interface ShareDataOptions {
    projectDir: string;
    localesPath?: string /* default 'locales', relative to projectDir */;
    sourceLocale?: string;
    exposeRepo?: boolean;
    basePath: string | null;
    env?: NodeJS.ProcessEnv;
    git?: GitRunner;
  }
  export interface ShareData {
    manifest: ShareManifest;
    dictionaries: Record<string, Record<string, unknown>>;
    warnings: string[];
  }
  export async function collectShareData(options: ShareDataOptions): Promise<ShareData>;
  ```
- **Rules:**
  - Locales are directories, or `*.json` files whose name matches `LOCALE_RE`, sorted.
  - The layout is `namespaced` when any locale is a directory. A namespaced locale is `{ [file basename]: parsed }`, with files sorted.
  - Every parsed root must be a plain object.
  - `sourceLocale` is the option, otherwise `en`, otherwise the first locale.
  - `localesPath` is relative to `gitRoot` when the locales folder is inside it, otherwise relative to `projectDir`. It is POSIX, and `'.'` when empty.
  - `repo` appears only when `exposeRepo` is true and a slug was found.
  - Each dictionary is the merged nested dictionary. Namespaced locales put their namespaces as top-level keys, the same shape `FileMutator.readLocale` returns.
  - Pack never goes through `FileMutator`, which asserts enablement.
- **Warning copy:** `exposeRepo is on but no GitHub repository was found; the manifest has no repo.`
- **Error copy:**
  - `Locales directory not found: <abs>. Pass --locales <path>.`
  - `No locale files in <abs> (expected en.json or en/*.json).`
  - `Source locale "<x>" not found in <abs> (found: <a, b>).`
  - `<project-relative file> is not a JSON object: <parser message>`
- **Test helper:** `makeShareProject({ layout?, extra? }): string` creates:
  - `locales/en.json` = `{"home":{"title":"Hello {name}"}}`
  - `locales/ar.json` = `{"home":{"title":"مرحبا {name}"}}`
  - `locales/schema.json` = `{}`
  - `src/page.tsx`, which calls `t('home.title')`

- [ ] **Step 1: Write the failing test.**
  ```ts
  const env = { GITHUB_SHA: SHA, GITHUB_REF_NAME: 'main', GITHUB_REF_TYPE: 'branch', GITHUB_REPOSITORY: 'acme/site' };
  const git = (root: string) => fakeGit({ 'rev-parse --show-toplevel': root, 'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main' });
  it('builds the flat manifest and dictionaries', async () => {
    const dir = makeShareProject();
    const data = await collectShareData({ projectDir: dir, basePath: '/', env, git: git(dir) });
    expect(data.manifest).toStrictEqual({ format: 1, defaultBranch: 'main', branch: 'main', base: SHA, localesPath: 'locales',
      layout: 'flat', sourceLocale: 'en', locales: ['ar', 'en'], basePath: '/', codeKeys: ['home.title'] });
    expect(data.dictionaries).toStrictEqual({ ar: { home: { title: 'مرحبا {name}' } }, en: { home: { title: 'Hello {name}' } } });
  });
  it('adds repo only with exposeRepo', ...);                 // manifest.repo === 'acme/site'
  it('warns when exposeRepo finds no repo', ...);            // env {} ⇒ 'repo' in manifest === false; warnings[0] is the pinned text
  it('reads namespaced locales', ...);                       // en/common.json {"ok":"OK"}, en/home.json {"title":"Hello"} ⇒ layout 'namespaced', en = { common: { ok: 'OK' }, home: { title: 'Hello' } }
  it('records a repo-relative path in a monorepo', ...);     // project <tmp>/apps/web, show-toplevel <tmp> ⇒ 'apps/web/locales'
  it('falls back to project-relative outside git', ...);    // git → null ⇒ 'locales'; branch/base from env only
  it('picks the source locale', ...);                        // no en ⇒ 'ar'; sourceLocale 'fr' ⇒ SOURCE_LOCALE_NOT_FOUND
  it.each([['LOCALES_NOT_FOUND', 'missing dir'], ['NO_LOCALES', 'empty dir'], ['INVALID_LOCALE_FILE', 'ar.json = "{"'], ['INVALID_LOCALE_FILE', 'ar.json = "[]"']])(
    'fails with %s for %s', ...);                            // INVALID message contains 'locales/ar.json'
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/pack-manifest.test.ts`. Expected: FAIL, because `src/server/pack.js` is not found.
- [ ] **Step 3:** Implement `collectShareData`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pack): build the share manifest and locale dictionaries`.

---

### Task 21: Writing the share folder (`packOutput`)

**Files:**

- Create: `src/server/module-dir.ts`. Move `getDirname` out of `src/codemod/index.ts` into it as `moduleDir()`, and re-import it there.
- Modify: `src/server/pack.ts`, `src/codemod/index.ts`.
- Modify: `ARCHITECTURE.md`. Add a new subsection "### 10. Share output (`src/server/pack.ts`)" covering:
  - the folder layout;
  - the manifest;
  - the flag gate;
  - that pack never writes outside `<outDir>/livelocale/` except the flag tag in HTML;
  - that Next outputs skip injection.
- Test: Create `tests/unit/pack.test.ts`.

**Interfaces:**

- Consumes:
  - `collectShareData` (Task 20).
  - `normalizeBase`, `basePathOf`, `flagSrcFor`, `shareUrlPathFor`, `injectFlagScript` (Task 17).
  - `detectBuildTarget` (Task 18).
  - `FLAG_SCRIPT` (Task 12).
  - `SHARE_*` and `isShareManifest` (Task 11).
- Produces:
  ```ts
  // module-dir.ts
  export function moduleDir(): string; // __dirname, else dirname(fileURLToPath(import.meta.url))
  // pack.ts
  export const RELATIVE_BASE_WARNING =
    'The app base is relative (./), so flag.js is linked per HTML file. Pages served by a client-side route fallback cannot load it; build with an absolute base (--base /path/) if the app has such routes.';
  export interface PackOptions extends Omit<ShareDataOptions, 'basePath'> {
    outDir: string; // absolute, or relative to projectDir
    base?: string; // raw; default detectBuildTarget(projectDir).base ?? '/'
    injectHtml?: boolean | 'auto'; // default 'auto' = false for Next projects or when <outDir>/_next exists
    studioDir?: string; // default resolveStudioDir()
  }
  export interface PackResult {
    shareDir: string;
    manifest: ShareManifest;
    htmlInjected: string[];
    shareUrlPath: string;
    warnings: string[];
  }
  export async function packOutput(options: PackOptions): Promise<PackResult>;
  export function defaultStudioCandidates(): string[]; // [<moduleDir>/../studio, <moduleDir>/../../dist/studio]
  export function resolveStudioDir(candidates?: string[]): string | null; // first dir holding index.html AND assets/
  ```
- **Order of work:**
  1. Validate everything before the first write: the out dir exists, the base is valid, the Studio dir resolves, `collectShareData` succeeds, and pack owns the target folder.
  2. Remove an existing `<outDir>/livelocale/` only when its `manifest.json` has a numeric `format`.
  3. Copy the Studio recursively.
  4. Write `manifest.json` as `JSON.stringify(m, null, 2) + '\n'`.
  5. Write `locales/<code>.json` as compact `JSON.stringify`.
  6. Write `flag.js` as `FLAG_SCRIPT`.
  7. Inject into every `**/*.html` outside `livelocale/`, skipping symlinks. `htmlInjected` is POSIX and sorted.
  8. When the base is relative, append `RELATIVE_BASE_WARNING` to `warnings`.
- **Error copy:**
  - `Build output not found: <abs>. Run your build first.`
  - `LiveLocale Studio files are missing from the installed package (looked in <dirs>). Reinstall livelocale.`
  - `<outDir rel>/livelocale/ already exists and was not written by LiveLocale. Move it away and run again.`

- [ ] **Step 1: Write the failing test.**
  - Use the Task 20 project. `out/` contains `index.html` and `docs/a.html`.
  - The Studio fixture is `index.html` plus `assets/app.js`.
  - Always pass `env: {}` and `git: fakeGit({})`.
  - `read(rel)` reads `<projectDir>/<rel>` as UTF-8.
  ```ts
  it('writes the share folder', async () => {
    const r = await packOutput({ projectDir, outDir: 'out', studioDir, env: {}, git: fakeGit({}) });
    expect(read('out/livelocale/assets/app.js')).toBe('console.log(1)');
    expect(JSON.parse(read('out/livelocale/manifest.json'))).toStrictEqual(r.manifest);
    expect(read('out/livelocale/manifest.json').endsWith('}\n')).toBe(true);
    expect(JSON.parse(read('out/livelocale/locales/ar.json'))).toStrictEqual({ home: { title: 'مرحبا {name}' } });
    expect(read('out/livelocale/flag.js')).toBe(FLAG_SCRIPT);
    expect(r.htmlInjected).toEqual(['docs/a.html', 'index.html']);
    expect(read('out/index.html')).toMatch(/<head><script src="\/livelocale\/flag\.js"><\/script>/);
    expect(read('out/livelocale/index.html')).not.toContain('flag.js');
    expect(r.shareUrlPath).toBe('/livelocale/index.html');
    expect(r.warnings).not.toContain(RELATIVE_BASE_WARNING);
  });
  it('uses an absolute base', ...);            // base '/repo/' ⇒ src '/repo/livelocale/flag.js', manifest.basePath '/repo/', shareUrlPath '/repo/livelocale/index.html'
  it('uses per-file relative paths for a relative base', async () => { // Review Focus 5
    const r = await packOutput({ projectDir, outDir: 'out', base: './', studioDir, env: {}, git: fakeGit({}) });
    expect(read('out/index.html')).toContain('<script src="./livelocale/flag.js"></script>');
    expect(read('out/docs/a.html')).toContain('<script src="../livelocale/flag.js"></script>');
    expect(r.manifest.basePath).toBeNull();
    expect(r.warnings).toContain(RELATIVE_BASE_WARNING);
  });
  it('takes the CRA homepage as the default base', ...);      // deps react-scripts, homepage 'https://acme.github.io/shop' ⇒ '/shop/livelocale/flag.js'
  it('skips injection for Next output and with injectHtml false', ...); // out/_next exists ⇒ htmlInjected []; index.html unchanged
  it('is idempotent and drops stale Studio files', ...);      // second run: one flag tag; out/livelocale/assets/old.js gone
  it('refuses a folder it did not write', ...);               // out/livelocale/notes.txt ⇒ SHARE_DIR_TAKEN; notes.txt still there
  it('writes nothing when validation fails', ...);            // sourceLocale 'fr' ⇒ rejects; out/livelocale absent; out/index.html unchanged
  it.each([['OUT_DIR_NOT_FOUND', { outDir: 'missing' }], ['STUDIO_NOT_FOUND', { studioDir: emptyDir }]])('fails with %s', ...);
  it('resolveStudioDir picks the first built Studio', ...);   // [srcLike (index.html only), built (index.html + assets/)] ⇒ built; [] ⇒ null
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/pack.test.ts`. Expected: FAIL, because `packOutput` is not exported.
- [ ] **Step 3:** Implement `moduleDir`, `packOutput`, `defaultStudioCandidates` and `resolveStudioDir`. Then add the ARCHITECTURE subsection.
- [ ] **Step 4:** Run `npx vitest run tests/unit/pack.test.ts tests/unit/pack-manifest.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pack): write the Studio, manifest and flag into the build output`.

---

### Task 22: `livelocale pack` CLI

**Files:**

- Modify: `src/server/pack.ts` (argument parser).
- Modify: `src/codemod/index.ts`:
  - add `'pack'` to `COMMANDS`;
  - add `runPackCommand(args)`, which prints `❌ <message>` and sets `process.exitCode = 1` on `PackError`;
  - add the help text.
- Modify: `README.md` (CLI Reference `### \`pack\``) and `ARCHITECTURE.md`(§9: one line for`pack`).
- Test: Create `tests/unit/pack-args.test.ts`. Modify `tests/integration/cli-package.test.ts`: add three helpers next to `runCli`, which Tasks 23, 47 and 58 reuse. Each resolves `rel` against the suite's `projectDir`:
  - `write(rel, text)` creates the parent folders and writes the file;
  - `read(rel)` reads it as UTF-8;
  - `readJson(rel)` is `JSON.parse(read(rel))`.

**Interfaces:**

- Consumes: `packOutput`, `PackError` (Tasks 21, 17).
- Produces:
  ```ts
  export interface ShareCliArgs {
    positional: string[];
    dir: string;
    locales?: string;
    source?: string;
    base?: string;
    out?: string;
    exposeRepo: boolean;
    inject: boolean;
    preview: boolean;
    command: string[];
  }
  export function parseShareArgs(argv: string[]): ShareCliArgs; // argv excludes the command name; tokens after the first `--` go to `command` verbatim
  ```
- **Copy:**
  - Usage: `Usage: livelocale pack <outDir> [options]`.
  - Argument errors: `Unknown option "<flag>".` and `<flag> needs a value.`
  - Success: `✅ LiveLocale share folder written to <outRel>/livelocale/ (<n> locales, <k> code keys, <h> HTML files linked).`, then `🔗 Open <shareUrlPath> on the deployed site.`
  - Each warning prints as `⚠️  <warning>`.
- **Help lines:**

  ```
  pack        Write the share Studio (livelocale/) into a built site folder and link every HTML page to it.
  Options for pack:
    pack <outDir>      Built site folder, relative to --dir (e.g. dist, build, out)
    --dir <path>       Project directory (default: current directory)
    --locales <path>   Locales directory relative to the project (default: locales)
    --source <locale>  Source locale (default: en, else the first locale)
    --base <path>      Site path the app is served from, e.g. /repo/ (default: detected, else /)
    --expose-repo      Put the GitHub owner/repo into livelocale/manifest.json
    --no-inject        Do not add the flag.js script to HTML files
  ```

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('parses pack options', () => expect(parseShareArgs(['build', '--locales', 'src/locales', '--source', 'en', '--base', '/repo/', '--expose-repo', '--no-inject']))
    .toEqual({ positional: ['build'], dir: '.', locales: 'src/locales', source: 'en', base: '/repo/', out: undefined, exposeRepo: true, inject: false, preview: false, command: [] }));
  it('keeps everything after -- verbatim', () => expect(parseShareArgs(['--preview', '--', 'next', 'build', '--debug'])).toMatchObject({ preview: true, command: ['next', 'build', '--debug'] }));
  it('rejects unknown options and missing values', () => {
    expect(() => parseShareArgs(['--bogus'])).toThrow('Unknown option "--bogus".');
    expect(() => parseShareArgs(['--locales'])).toThrow('--locales needs a value.');
  });
  // cli-package.test.ts (packaged CLI; consumer has locales/en.json)
  it('should run `pack` against a built folder', () => {
    write('out/index.html', '<!doctype html><html><head><title>x</title></head><body></body></html>');
    const r = runCli(pkgDir, projectDir, ['pack', 'out']);
    expect(r.stderr).toBe(''); expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(projectDir, 'out/livelocale/index.html'))).toBe(true);
    expect('repo' in readJson('out/livelocale/manifest.json')).toBe(false);
    expect(read('out/index.html')).toMatch(/<head><script src="\/livelocale\/flag\.js"><\/script>/);
  });
  it('should fail `pack` without an output folder', ...);   // status 1; stderr contains 'Usage: livelocale pack <outDir>'
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/pack-args.test.ts`. Expected: FAIL, because `parseShareArgs` is not exported.
- [ ] **Step 3:** Implement the parser, the CLI wiring, the help text, the README entry and the ARCHITECTURE line.
- [ ] **Step 4:** Run `npm run build && npx vitest run tests/unit/pack-args.test.ts tests/integration/cli-package.test.ts`. Expected: PASS, including the existing packaged CLI cases.
- [ ] **Step 5:** Commit `feat(cli): add livelocale pack`.

---

### Task 23: `livelocale build` wrapper

**Files:**

- Modify: `src/server/pack.ts`.
- Modify: `src/codemod/index.ts`: add `'build'` to `COMMANDS`, add `runBuildCli(args)`, and add the help text.
- Modify: `README.md`. Add `### \`build\``, with the Next server, Next export and custom CI rows from spec §3.
- Modify: `ARCHITECTURE.md` (§9 line).
- Test: Create `tests/unit/pack-build.test.ts`. Modify `tests/integration/cli-package.test.ts`.

**Interfaces:**

- Consumes:
  - `packOutput`, `RELATIVE_BASE_WARNING` (Task 21).
  - `detectBuildTarget`, `findExportBlockingRoute`, `outputCandidates` (Task 18).
  - `parseShareArgs` (Task 22).
  - `parseGitignore` from `src/core/gitignore.ts` (existing).
- Produces:
  ```ts
  export type RunCommand = (
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv }
  ) => Promise<number>;
  export const spawnInherit: RunCommand; // stdio inherit; win32: one command line of quoteWindowsArg parts with shell: true; ENOENT ⇒ 127
  export function quoteWindowsArg(arg: string): string;
  export interface BuildCommandOptions extends Omit<PackOptions, 'outDir' | 'injectHtml'> {
    command: string[];
    preview?: boolean;
    outDir?: string;
    run?: RunCommand;
    now?: () => number;
  }
  export interface BuildResult {
    exitCode: number;
    pack: PackResult | null;
    warnings: string[];
  } // warnings: this command's own, then every pack.warnings entry
  export async function runBuildCommand(options: BuildCommandOptions): Promise<BuildResult>;
  ```
- **Flow:**
  1. An empty command throws `USAGE` with the message `Usage: livelocale build [--preview] -- <your build command>`.
  2. A Next static export with a blocking route throws `NEXT_EXPORT_POST_ROUTE` before anything runs.
  3. Next (server or export): create `<project>/public` when it is missing, pack into it with `injectHtml: false` first, then run the command.
  4. Static stacks: run the command first. On a non-zero exit, return the exit code and do not pack. On success, pick the output folder: `--out` if given, otherwise the first entry of `outputCandidates` whose `index.html` has `mtimeMs >= startMs - 2000`. Pack it with `injectHtml: 'auto'`.
  5. With `--preview`, the child env is `{ ...env, LIVELOCALE: 'preview', NEXT_PUBLIC_LIVELOCALE: 'preview' }`.
- **Error copy:**
  - Next export with a POST route: `Next.js static export (output: 'export') cannot build <rel>: it exports POST, and export mode only allows GET route handlers. The share link does not need this route. Delete <rel> (or move it out of this build) and run again.`
  - No output found: `Could not find the build output (looked for a fresh index.html in <dist/, build/, out/>). Pass --out <dir>.`
- **Warning copy (Next):**
  - `Next.js pages have no watermarks without --preview; the Studio will open but nothing is editable.`
  - `Add public/livelocale/ to .gitignore; it is generated on every build.` This appears only when `.gitignore` does not already ignore the folder.

- [ ] **Step 1: Write the failing test.** The fake `run` records its arguments and can write files. `write(rel, text)` and `read(rel)` create and read files under `projectDir`, as in Task 21.
  ```ts
  it('packs a static build after the command succeeds', async () => {
    const run = vi.fn(async () => { write('dist/index.html', '<html><head></head><body></body></html>'); return 0; });
    const r = await runBuildCommand({ projectDir, command: ['vite', 'build'], run, env: {}, git: fakeGit({}), studioDir });
    expect(r.exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith('vite', ['build'], { cwd: projectDir, env: {} });
    expect(read('dist/index.html')).toContain('<head><script src="/livelocale/flag.js"></script>');
  });
  it('sets both preview variables with --preview', ...);     // run env toMatchObject { LIVELOCALE: 'preview', NEXT_PUBLIC_LIVELOCALE: 'preview' }
  it('returns a failing exit code without packing', ...);    // run → 2 ⇒ exitCode 2, pack null, dist/livelocale absent
  it('rejects a stale output folder', ...);                  // dist/index.html 1 h old, run does nothing ⇒ OUTPUT_NOT_FOUND; message contains '--out'
  it('honours --out', ...);                                  // outDir 'site' ⇒ site/livelocale/manifest.json exists
  it('packs into public/ before a Next build', ...);         // next dep; public/livelocale/manifest.json exists when run is called; public/legal.html unchanged
  it('creates public/ for a Next project that has none', ...); // next dep, no public/ ⇒ exitCode 0; public/livelocale/manifest.json exists
  it('passes the relative-base warning through', async () => { // Review Focus 5
    const run = vi.fn(async () => { write('dist/index.html', '<html><head></head><body></body></html>'); return 0; });
    const r = await runBuildCommand({ projectDir, base: './', command: ['vite', 'build'], run, env: {}, git: fakeGit({}), studioDir });
    expect(r.warnings).toContain(RELATIVE_BASE_WARNING);
  });
  it('stops a Next export with a POST route before building', ...); // NEXT_EXPORT_POST_ROUTE; run not called; public/livelocale absent
  it('warns about --preview and .gitignore for Next', ...);  // both warnings; .gitignore 'public/livelocale/' removes the second
  it('rejects an empty command', ...);                       // USAGE
  it.each([['build', 'build'], ['a b', '"a b"'], ['say "hi"', '"say \\"hi\\""'], ['', '""']])('quoteWindowsArg(%j)', (a, q) => expect(quoteWindowsArg(a)).toBe(q));
  it('spawnInherit returns the child exit code', async () =>
    expect(await spawnInherit(process.execPath, ['-e', 'process.exit(3)'], { cwd: process.cwd(), env: process.env })).toBe(3));
  // cli-package.test.ts: consumer writes fake-build.cjs (mkdir dist; write dist/index.html; write dist/env.txt = String(process.env.LIVELOCALE))
  it('should run `build --preview` around a build command', () => {
    const r = runCli(pkgDir, projectDir, ['build', '--preview', '--', 'node', 'fake-build.cjs']);
    expect(r.status).toBe(0); expect(read('dist/env.txt')).toBe('preview');
    expect(fs.existsSync(path.join(projectDir, 'dist/livelocale/manifest.json'))).toBe(true);
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/pack-build.test.ts`. Expected: FAIL, because `runBuildCommand` is not exported.
- [ ] **Step 3:** Implement and wire the CLI. It prints the warnings, then the Task 22 summary, then sets `process.exitCode = result.exitCode`. Add these help lines:
  ```
  build       Run your build command, then pack its output (Next.js: packs into public/livelocale/ first).
  Options for build:
    build [--preview] [--out <dir>] [pack options] -- <command...>
    --preview          Run the command with LIVELOCALE=preview and NEXT_PUBLIC_LIVELOCALE=preview
    --out <dir>        Build output folder (default: detected from dist/, build/, out/)
  ```
- [ ] **Step 4:** Run `npm run build && npx vitest run tests/unit/pack-build.test.ts tests/integration/cli-package.test.ts`. Expected: PASS on Windows and Linux.
- [ ] **Step 5:** Commit `feat(cli): add livelocale build wrapper`.

---

### Task 24: Vite plugin build half (`share: true`)

**Files:**

- Modify: `src/server/vite-plugin.ts`.
- Modify: `README.md`. In "Non-Next.js Integration", document `share`, `exposeRepo`, `sourceLocale` and `shareBase`.
- Modify: `ARCHITECTURE.md`. Change the entry-table row `livelocale/vite` to "Node (Vite dev server and build)", and add the build-half paragraph.
- Test: Create `tests/unit/vite-plugin-share.test.ts` and `tests/integration/vite-share-build.test.ts`.

**Interfaces:**

- Consumes: `packOutput` (Task 21); `normalizeBase`, `flagSrcFor`, `injectFlagScript`, `PackError` (Task 17).
- Produces:

  ```ts
  export interface VitePluginConfig {
    localesPath: string; git?: boolean; authToken?: string;
    /** Write the share Studio into <outDir>/livelocale/ on `vite build`. Off by default. */
    share?: boolean;
    /** Put the GitHub owner/repo into the published manifest. Defaults to false. */
    exposeRepo?: boolean;
    /** Source locale for the manifest. Defaults to en when present, else the first locale. */
    sourceLocale?: string;
    /** Site path the HTML is served from, when Vite `base` is a full URL or differs. */
    shareBase?: string;
  }
  // plugin members
  apply(userConfig: unknown, env: { command: 'serve' | 'build'; isSsrBuild?: boolean; ssrBuild?: boolean }): boolean; // serve ⇒ true; build ⇒ share === true && !ssr
  configResolved(resolved: any): void;   // stores command, root, outDir (absolute), base, logger, ssr/lib flags; normalizeBase(shareBase ?? base) when share && build (throws BAD_BASE)
  buildStart(): void;                    // resets the once-per-build guard (watch mode re-packs)
  transformIndexHtml(html: string, ctx?: { path?: string }): string; // build: injectFlagScript(html, flagSrcFor(base, ctx.path without leading '/')); serve: unchanged
  writeBundle(): Promise<void>;          // once per build; skipped for build.ssr or build.lib; packOutput({ outDir, projectDir: root, localesPath: path.resolve(config.localesPath), sourceLocale, exposeRepo, base: shareBase ?? base, injectHtml: false }); warnings → logger.warn
  // localesPath is resolved against process.cwd(), the same base the serve half uses, so `vite build --root <dir>` reads the same folder as `vite dev`.
  ```

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // unit: vi.mock('../../src/server/pack.js', () => ({ packOutput: vi.fn(async () => ({ warnings: [] })) }))
  it('applies in serve always and in build only with share', () => {
    expect(liveLocaleVite({ localesPath }).apply({}, { command: 'serve' })).toBe(true);
    expect(liveLocaleVite({ localesPath }).apply({}, { command: 'build' })).toBe(false);
    expect(liveLocaleVite({ localesPath, share: true }).apply({}, { command: 'build' })).toBe(true);
    expect(liveLocaleVite({ localesPath, share: true }).apply({}, { command: 'build', isSsrBuild: true })).toBe(false);
  });
  it('injects flag.js first in head on build, without dev fallback data', () => {
    vi.stubEnv('LIVELOCALE', 'preview');
    const p = built({ base: '/repo/' });
    expect(p.transformIndexHtml('<html><head><title>x</title></head></html>', { path: '/index.html' }))
      .toBe('<html><head><script src="/repo/livelocale/flag.js"></script><title>x</title></head></html>');
  });
  it('uses a relative src for a relative base', ...);         // base './', path '/nested/page.html' ⇒ '../livelocale/flag.js'
  it('rejects a full-URL base unless shareBase is set', ...); // 'https://cdn.acme.com/' ⇒ BAD_BASE; shareBase '/app/' ⇒ '/app/livelocale/flag.js'
  it('packs once per build after writing', async () => {
    const p = built({ base: '/repo/' }); p.buildStart(); await p.writeBundle(); await p.writeBundle();
    expect(packOutput).toHaveBeenCalledTimes(1);
    expect(packOutput).toHaveBeenCalledWith({ outDir: path.resolve(root, 'dist'), projectDir: root, localesPath: path.resolve(localesPath), sourceLocale: undefined, exposeRepo: false, base: '/repo/', injectHtml: false });
    p.buildStart(); await p.writeBundle(); expect(packOutput).toHaveBeenCalledTimes(2);
  });
  it('forwards pack warnings to the Vite logger', ...);     // packOutput → { warnings: [RELATIVE_BASE_WARNING] } ⇒ logger.warn called with it
  it('does not pack SSR or library builds', ...);           // configResolved with build.ssr true, then build.lib set ⇒ writeBundle leaves packOutput uncalled
  // integration (describe.skipIf(!fs.existsSync('dist/studio/index.html'))): real `build()` from 'vite', configFile: false, root: tmp,
  // read(rel) and readJson(rel) read <tmp>/<rel> (UTF-8, then JSON.parse);
  // base: '/repo/', logLevel: 'silent', plugins: [liveLocaleVite({ localesPath: <tmp>/locales, share: true })]
  it('vite build writes livelocale/ and links the page', async () => {
    const html = read('dist/index.html');
    expect(html).toMatch(/<head[^>]*><script src="\/repo\/livelocale\/flag\.js"><\/script>/);
    expect(html.indexOf('livelocale/flag.js')).toBeLessThan(html.indexOf('type="module"'));
    expect(read('dist/livelocale/flag.js')).toBe(FLAG_SCRIPT);
    const m = readJson('dist/livelocale/manifest.json');
    expect(isShareManifest(m)).toBe(true);
    expect(m).toMatchObject({ basePath: '/repo/', locales: ['ar', 'en'], sourceLocale: 'en' });
    expect('repo' in m).toBe(false); expect(m.codeKeys).toContain('home.title');
    expect(fs.existsSync(path.join(tmp, 'dist/livelocale/index.html'))).toBe(true);
  });
  it('vite build without share writes nothing extra', ...); // no dist/livelocale, no flag tag
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/vite-plugin-share.test.ts`. Expected: FAIL, because `apply` is the string `'serve'`.
- [ ] **Step 3:** Implement the plugin changes, then the README and ARCHITECTURE edits.
- [ ] **Step 4:** Run `npx vitest run tests/unit/vite-plugin-share.test.ts tests/unit/vite-plugin.test.ts`. Expected: PASS, with the dev-mode tests unchanged. Then run `npm run build && npx vitest run tests/integration/vite-share-build.test.ts`. Expected: PASS, and the test is not skipped.
- [ ] **Step 5:** Commit `feat(vite): write the share Studio from vite build when share is on`.

---

### Task 25: Draft model

**Files:**

- Create: `src/studio/transport/drafts.ts`
- Test: Create `tests/unit/studio-draft-model.test.ts`

**Interfaces:**

- Consumes: `ShareManifest` (Task 11), using only `repo`.
- Produces:

  ```ts
  export type DraftStatus = 'unsent' | 'sent';
  export interface Draft {
    scope: string;
    locale: string;
    key: string;
    from: string | null; // built value when saved; null = key absent in the build
    to: string;
    force: boolean;
    base: string | null;
    branch: string | null; // manifest.base / manifest.branch at save time
    status: DraftStatus;
    conflict: boolean; // set only by Live-now reconciliation (Task 59); false until then
    updatedAt: number;
    sentAt: number | null;
  }
  export interface DraftId {
    locale: string;
    key: string;
  }
  export function draftScope(manifest: Pick<ShareManifest, 'repo'>, appUrl: string): string;
  ```

  `draftScope` returns `manifest.repo` when it is set, and otherwise `'path:' + new URL(appUrl).pathname`. Two GitHub Pages project sites on one origin therefore never share drafts.

- [ ] **Step 1: Write the failing test.**
  ```ts
  it('uses the repo slug when the manifest exposes it', () =>
    expect(draftScope({ repo: 'acme/web' }, 'https://www.acme.com/')).toBe('acme/web'));
  it('falls back to the app path so two Pages sites on one origin never share drafts', () => {
    expect(draftScope({}, 'https://o.github.io/site-a/')).toBe('path:/site-a/');
    expect(draftScope({}, 'https://o.github.io/site-b/')).toBe('path:/site-b/');
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-draft-model.test.ts`. Expected: FAIL, because the module does not exist.
- [ ] **Step 3:** Implement the types and `draftScope`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): add the draft model for share-link edits`.

---

### Task 26: Draft store (IndexedDB with a memory fallback)

**Files:**

- Create: `src/studio/transport/draft-store.ts`
- Modify: `package.json` and `package-lock.json` to add the devDependency `fake-indexeddb@^6.0.0`.
- Test: Create `tests/unit/studio-draft-store.test.ts`

**Interfaces:**

- Consumes: `Draft` (Task 25).
- Produces:

  ```ts
  export const DRAFTS_DB_NAME = 'livelocale-drafts';
  export const DRAFTS_DB_VERSION = 1;
  export const DRAFTS_STORE = 'drafts'; // keyPath ['scope','locale','key'], index 'scope'
  export const DRAFT_STORE_OPEN_TIMEOUT_MS = 3000;
  export interface DraftStore {
    readonly persistent: boolean;
    get(scope: string, locale: string, key: string): Promise<Draft | undefined>;
    put(draft: Draft): Promise<void>; // resolves on transaction complete; rejects on error/abort (quota)
    delete(scope: string, locale: string, key: string): Promise<void>;
    list(scope: string): Promise<Draft[]>; // newest updatedAt first
  }
  export function openIndexedDbDraftStore(factory: IDBFactory): Promise<DraftStore>; // rejects on error/timeout
  export function createMemoryDraftStore(): DraftStore; // persistent: false
  export function openDraftStore(factory: IDBFactory | undefined): Promise<DraftStore>; // never rejects; memory fallback
  ```

- [ ] **Step 1:** Run `npm install --save-dev fake-indexeddb@^6.0.0`. Expected: the package appears only under `devDependencies`.
- [ ] **Step 2: Write the failing test.** Run one contract suite against both stores: `describe.each([['indexeddb', () => openIndexedDbDraftStore(new IDBFactory())], ['memory', async () => createMemoryDraftStore()]])`.
  - Contract tests (both stores):
    - `it('round-trips a draft and lists only its scope, newest first')`: put drafts in scope `'acme/web'` with updatedAt 1 and 2, and one in scope `'path:/'`. Expect the `list('acme/web')` order to be `[2, 1]`.
    - `it('replaces a draft with the same scope, locale and key')`.
    - `it('deletes a draft')`.
  - IndexedDB only:
    - `it('keeps drafts across re-opening the database')`.
    - `it('creates livelocale-drafts v1 with a drafts store')`: `await factory.databases()` contains `{ name: 'livelocale-drafts', version: 1 }`.
  - Fallback:
    - `it('falls back to memory when IndexedDB is missing, throws or never opens')`. Each case must give `persistent === false`:
      - `openDraftStore(undefined)`;
      - a factory whose `open` throws `new DOMException('denied', 'SecurityError')`;
      - a request that never fires, after `vi.advanceTimersByTime(3000)`.
- [ ] **Step 3:** Run `npx vitest run tests/unit/studio-draft-store.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 4:** Implement. `onupgradeneeded` creates the store and the `scope` index.
- [ ] **Step 5:** Run the same command. Expected: PASS.
- [ ] **Step 6:** Commit `feat(studio): keep share-link drafts in IndexedDB`.

---

### Task 27: Runtime detection and an app URL next to the Studio

**Files:**

- Create: `src/studio/runtime.ts`, `tests/unit/helpers/share-fixtures.ts`
- Modify:
  - `src/studio/config.ts`
  - `src/studio/features/dashboard/constants.ts`
  - `src/studio/api.ts`: replace the module-level `` const API = `${APP_ORIGIN}/api/livelocale` `` with `` const apiUrl = () => `${getAppOrigin()}/api/livelocale` ``, called on every request, and drop the `APP_ORIGIN` import.
  - `hooks/useConnection.ts`
  - `hooks/useStudio.ts`
  - `components/IframeViewer.tsx`
  - `src/studio/app.tsx`
- Test: Extend `tests/unit/studio-config.test.ts`. Create `tests/unit/studio-runtime.test.ts`.

**Interfaces:**

- Consumes: `parseShareManifest`, `ShareManifest` (Task 11); `resolveAppOrigin`, `AppOriginSources` (existing).
- Produces:
  ```ts
  // runtime.ts
  /** What detection finds. Task 32 adds the draft transport to the static variant of StudioRuntime. */
  export type DetectedRuntime =
    | { kind: 'server'; appOrigin: string; appUrl: string; problems: string[] }
    | { kind: 'static'; appOrigin: string; appUrl: string; manifest: ShareManifest; manifestText: string };
  export type StudioRuntime = DetectedRuntime; // redefined in Task 32
  export function setStudioRuntime(runtime: StudioRuntime): void;
  export function resetStudioRuntime(): void;
  export function getStudioRuntime(): StudioRuntime; // unset → server via resolveAppOrigin(window sources), problems []
  export function getAppOrigin(): string;
  export function getAppUrl(): string;
  // config.ts
  export const STATIC_MANIFEST_MISSING = 'This Studio was opened from a website, but livelocale/manifest.json is missing or is not a LiveLocale manifest. Rebuild with share: true (or run livelocale pack) and upload the whole livelocale/ folder.';
  export function resolveStaticAppUrl(studioHref: string): string; // new URL('../', studioHref).href
  export interface RuntimeSources extends AppOriginSources { href: string; fetch: typeof fetch }
  export function detectStudioRuntime(sources: RuntimeSources): Promise<DetectedRuntime>; // imports the type with `import type`
  // tests/unit/helpers/share-fixtures.ts
  export const SHA_A: string; // 'a'.repeat(40)
  export const SHA_B: string; // 'b'.repeat(40)
  export const STUDIO_URL = 'https://www.acme.com/livelocale/index.html';
  export const APP_URL = 'https://www.acme.com/';
  export const MANIFEST: ShareManifest; // { format: 1, branch: 'main', defaultBranch: 'main', base: SHA_A, localesPath: 'src/locales', layout: 'flat',
                                        //   sourceLocale: 'en', basePath: '/', locales: ['ar','en'], codeKeys: ['home.greet','home.title','home.unused'] }
  export const EN: { home: { title: 'Welcome'; greet: 'Hello {name}' } };
  export const AR: { home: { title: 'مرحبا'; greet: 'أهلا {name}' } };
  export function fetchStub(files: Record<string, string | Response>): typeof fetch & { mock: ... }; // keyed by absolute URL; 404 otherwise
  ```
- Changes to existing code:
  - `APP_ORIGIN` is removed. `constants.ts` re-exports `getAppOrigin` and `getAppUrl`.
  - The `Window.__LIVELOCALE_CONFIG__` declaration moves to `runtime.ts`.
  - `useConnection` calls `getAppOrigin()` at message time.
  - `useStudio` returns `appUrl: getAppUrl()`.
  - `IframeViewer` gets an `appUrl` prop and uses ``src={`${appUrl}?livelocale-origin=${encodeURIComponent(window.location.origin)}`}``.
- Detection rules:
  1. A valid `injected` origin means `server` with `problems: []`, and `fetch` is not called.
  2. Otherwise, GET `new URL('manifest.json', href)` with `{ cache: 'no-store', credentials: 'same-origin' }`. If the response is `ok`, the body parses as JSON and `parseShareManifest` returns non-null, the runtime is `static`:
     - `appOrigin = new URL(href).origin`;
     - `appUrl = resolveStaticAppUrl(href)`;
     - `?app=` is ignored.
  3. In every other case the runtime is `server`, with `appOrigin = appUrl = resolveAppOrigin(sources)`. This covers a rejected fetch, HTML, an unknown format and a 404.
     - `problems` is `[STATIC_MANIFEST_MISSING]` when `new URL(href).pathname` matches `/\/livelocale\/(index\.html)?$/`.
     - Otherwise `problems` is `[]`.

- [ ] **Step 1: Write the failing test.**
  ```ts
  it('resolves the app one folder above the Studio', () => {
    expect(resolveStaticAppUrl('https://www.acme.com/livelocale/index.html')).toBe('https://www.acme.com/');
    expect(resolveStaticAppUrl('https://o.github.io/repo/livelocale/')).toBe('https://o.github.io/repo/');
    expect(resolveStaticAppUrl('https://www.acme.com/livelocale/index.html#lc1.abc')).toBe('https://www.acme.com/');
  });
  it('enters static mode when ./manifest.json is a LiveLocale manifest, ignoring ?app=', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(MANIFEST)));
    const rt = await detectStudioRuntime({ href: STUDIO_URL, search: '?app=http://localhost:4000', fetch });
    expect(fetch).toHaveBeenCalledWith('https://www.acme.com/livelocale/manifest.json', { cache: 'no-store', credentials: 'same-origin' });
    expect(rt).toMatchObject({ kind: 'static', appOrigin: 'https://www.acme.com', appUrl: 'https://www.acme.com/' });
  });
  it('never probes when the CLI injected an origin', ...);  // kind 'server', appOrigin 'http://localhost:3000', fetch not called
  it.each([['404', new Response('', { status: 404 })], ['html', new Response('<!doctype html>')], ['unknown format', new Response('{"format":2}')]])(
    'stays in server mode on %s and honours ?app=', ...);    // href 'http://localhost:3010/' ⇒ { kind:'server', appOrigin:'http://localhost:4000', problems: [] }
  it('stays in server mode when the probe rejects', ...);  // href 'http://localhost:3010/', fetch rejects TypeError ⇒ { kind: 'server', appOrigin: 'http://localhost:3000', problems: [] }
  it('names the fix when a /livelocale/ Studio finds no manifest', async () => { // Review Focus 1
    const rt = await detectStudioRuntime({ href: STUDIO_URL, search: '', fetch: async () => new Response('<!doctype html><title>Shop</title>') });
    expect(rt).toMatchObject({ kind: 'server', problems: [STATIC_MANIFEST_MISSING] });
  });
  // studio-runtime.test.ts (// @vitest-environment jsdom)
  it("falls back to today's resolution when no runtime was set", () => {
    resetStudioRuntime(); expect(getAppOrigin()).toBe('http://localhost:3000'); expect(getAppUrl()).toBe('http://localhost:3000');
  });
  it('serves the static runtime once set', ...);            // setStudioRuntime({ kind: 'static', appOrigin: 'https://www.acme.com', appUrl: APP_URL, manifest: MANIFEST, manifestText: '' }) ⇒ getAppOrigin() 'https://www.acme.com', getAppUrl() 'https://www.acme.com/'
  it('builds the API URL from the runtime at call time', ...); // stub fetch; setStudioRuntime({ kind: 'server', appOrigin: 'http://localhost:4000', appUrl: 'http://localhost:4000', problems: [] }); fetchLocales() ⇒ fetch called with 'http://localhost:4000/api/livelocale'
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-config.test.ts tests/unit/studio-runtime.test.ts`. Expected: FAIL, because the new exports are missing.
- [ ] **Step 3:** Implement. Replace every use of `APP_ORIGIN`, including the `API` constant in `src/studio/api.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/unit`, then `npm run typecheck`. Expected: PASS. The existing origin tests in `studio-hooks` and `studio-git-history` stay green.
- [ ] **Step 5:** Commit `feat(studio): resolve the app next to a static Studio`.

---

### Task 28: Swappable transport in `api.ts`

**Files:**

- Modify: `src/studio/api.ts`, and `src/studio/features/dashboard/components/Header.tsx` (prop type only).
- Test: Create `tests/unit/studio-transport-switch.test.ts` (jsdom).

**Interfaces:**

- Consumes: the per-call `apiUrl()` in `api.ts` and `resetStudioRuntime` (Task 27).
- Produces:

  ```ts
  export type LiveLocaleMode = 'off' | 'development' | 'preview' | 'static';
  // GitState.mode becomes 'local' | 'github' | 'static'
  export interface StudioTransport {
    fetchInfo(): Promise<ServerInfo>;
    fetchLocales(): Promise<string[]>;
    fetchKeysMetadata(): Promise<{ allKeys: string[]; codeKeys: string[] }>;
    fetchLocaleDictionary(locale: string): Promise<Record<string, any>>;
    fetchGitState(): Promise<GitState>;
    saveTranslation(
      locale: string,
      key: string,
      value: string,
      options?: SaveOptions
    ): Promise<{ success: true; key: string; locale: string }>;
    addLocaleRequest(locale: string): Promise<{ success: true; locale: string }>;
    renameLocaleRequest(locale: string, newLocale: string): Promise<{ success: true }>;
    deleteLocaleRequest(locale: string): Promise<{ success: true }>;
    commitLocales(message: string): Promise<{ success: true; hash: string }>;
    discardLocales(): Promise<{ success: true }>;
  }
  export function setStudioTransport(transport: StudioTransport | null): void; // null = HTTP
  ```

  - Every existing export keeps its name and signature, and delegates to the active transport.
  - Today's fetch code becomes the internal `httpTransport`, which keeps Task 27's per-call `apiUrl()`.
  - `Header`'s `mode` prop becomes `LiveLocaleMode | null`.

- [ ] **Step 1: Write the failing test.** Stub `fetch`, and call `setStudioTransport(null)` and `resetStudioRuntime()` in `afterEach`.
  - `it('routes every endpoint through the active transport with the same arguments')`:
    - Give the fake transport one `vi.fn().mockResolvedValue(...)` per method, and call all 11 exports.
    - Assert `fake.saveTranslation` was called with `('ar', 'home.title', 'x', { force: true })`.
    - Assert `fake.renameLocaleRequest` was called with `('ar', 'ar-EG')`.
    - Assert `fetch` was not called.
  - `it('returns to HTTP after setStudioTransport(null)')`: `fetchLocales()` calls `fetch('http://localhost:3000/api/livelocale')`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-transport-switch.test.ts`. Expected: FAIL, because `setStudioTransport` is not exported.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run tests/unit` and `npm run typecheck`. Expected: PASS. The `studio-auth`, 401 and 422 tests stay green.
- [ ] **Step 5:** Commit `refactor(studio): route API calls through a swappable transport`.

---

### Task 29: Static transport reads

**Files:**

- Create: `src/studio/transport/static.ts`
- Test: Create `tests/unit/studio-static-transport.test.ts`

**Interfaces:**

- Consumes:
  - `StudioTransport`, `ServerInfo` (Task 28)
  - `Draft`, `draftScope` (Task 25)
  - `DraftStore`, `createMemoryDraftStore` (Task 26)
  - `ShareManifest` (Task 11)
  - `lookupKey` (Task 1)
  - `deepMerge` from `src/core/deep-merge.ts`
  - `setNestedProperty` and `flattenKeys` from `src/core/json-path.ts`
  - `isValidLocaleFormat` and `isSafeLocaleSegment` from `src/core/validate.ts`
- Produces:
  ```ts
  export const DRAFTS_CHANGED_EVENT = 'livelocale:drafts-changed';
  export const STORAGE_PROBLEM =
    'This browser cannot keep your changes after the tab closes (private window or blocked storage). Send them before you leave.';
  export const LOCALE_ACTIONS_UNSUPPORTED =
    'Adding, renaming or deleting languages is not available on a share link. Ask your developer.';
  export const COMMIT_UNSUPPORTED = 'Use "Send to developer" to hand your changes over.';
  export interface StaticTransportOptions {
    manifest: ShareManifest;
    manifestText: string;
    studioUrl: string;
    appUrl: string;
    store: DraftStore;
    fetch?: typeof fetch;
    now?: () => number;
    events?: EventTarget; // events default: window, else new EventTarget()
  }
  export interface StaticTransport extends StudioTransport {
    readonly manifest: ShareManifest;
    readonly scope: string;
    readonly persistent: boolean;
    readonly events: EventTarget;
    readBuiltLocale(locale: string): Promise<Record<string, unknown>>; // built dictionary, no drafts
    textCandidates(): Promise<Record<string, Record<string, string[]>>>; // per locale and flat key: built value, then draft `to` when it differs
  }
  export function createStaticTransport(options: StaticTransportOptions): Promise<StaticTransport>;
  ```
- **Behaviour:**
  - `fetchInfo()` returns `{ mode: 'static', authRequired: false, git: false, problems: store.persistent ? [] : [STORAGE_PROBLEM] }`.
  - `fetchLocales()` returns `manifest.locales`.
  - `readBuiltLocale(l)`:
    - If the locale fails `isValidLocaleFormat` or `isSafeLocaleSegment`, or is not in `manifest.locales`, it rejects `` `Unknown language "${l}".` `` without calling fetch.
    - Otherwise it GETs `new URL(`locales/${l}.json`, studioUrl)` with `{ cache: 'no-cache', credentials: 'same-origin' }`.
    - A non-ok response rejects `` `Could not load locales/${l}.json (${status}).` ``.
    - Results are cached per locale; a failure evicts the entry.
  - `fetchLocaleDictionary(l)` is `readBuiltLocale(l)` with the drafts for `l` deep-merged in through `setNestedProperty`.
  - `fetchKeysMetadata()`:
    - `allKeys` is the sorted, de-duplicated union of `codeKeys`, every locale file's `flattenKeys` and the draft keys.
    - `codeKeys` is `manifest.codeKeys`.
  - `textCandidates()` omits locales whose file fails to load.
  - `addLocaleRequest`, `renameLocaleRequest` and `deleteLocaleRequest` reject `LOCALE_ACTIONS_UNSUPPORTED`.
  - `commitLocales` rejects `COMMIT_UNSUPPORTED`.

- [ ] **Step 1: Write the failing test.** The fixture `make({ files?, store?, now?, manifest? })` uses the `share-fixtures` helpers (en.json = `EN`, ar.json = `AR`), `events: new EventTarget()` and a memory store. `files` is keyed by locale file name (`'ar.json'`) and replaces that file's body (or `Response`) under `https://www.acme.com/livelocale/locales/`; `now` defaults to `() => 1000`.
  ```ts
  it('reports static mode', async () => expect(await t.fetchInfo()).toEqual({ mode: 'static', authRequired: false, git: false, problems: [] }));
  it('warns when drafts cannot persist', ...);          // store { persistent:false } → problems [STORAGE_PROBLEM]
  it('lists manifest locales', ...);                    // ['ar','en']
  it('reads a locale file next to the Studio once', async () => {
    await t.fetchLocaleDictionary('ar'); await t.readBuiltLocale('ar');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://www.acme.com/livelocale/locales/ar.json', { cache: 'no-cache', credentials: 'same-origin' });
  });
  it('merges drafts over the built dictionary', ...);   // store has ar/home.title to 'أهلاً' → dict.home.title 'أهلاً'; readBuiltLocale still 'مرحبا'
  it('rejects unknown or unsafe locales without fetching', ...); // 'fr', '../x' → 'Unknown language "fr".'; fetch not called
  it('surfaces a failed locale file and retries later', ...);    // 404 → 'Could not load locales/ar.json (404).'; second call fetches again
  it('lists code keys, file keys and draft keys', ...);          // allKeys ['home.greet','home.new','home.title','home.unused']
  it('refuses locale management and commit', ...);               // exact messages above
  it('lists built and drafted text for each key', async () =>    // draft ar/home.title 'أهلاً'
    expect((await t.textCandidates()).ar['home.title']).toEqual(['مرحبا', 'أهلاً']));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-static-transport.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement the read side. `saveTranslation`, `fetchGitState` and `discardLocales` throw `new Error('not implemented')` until Tasks 30 and 31.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): read translations from the static manifest`.

---

### Task 30: Saving validated drafts

**Files:**

- Modify: `src/studio/transport/static.ts`
- Test: Extend `tests/unit/studio-static-transport.test.ts`

**Interfaces:**

- Consumes: `validateEdit`, `SourceContext` (Task 3); `lookupKey` (Task 1); `DraftId` (Task 25); `ValidationError` from `src/studio/api.ts`.
- Produces, on `StaticTransport`:

  ```ts
  listDrafts(): Promise<Draft[]>;                                         // this scope, newest first
  discardDraft(locale: string, key: string): Promise<Draft | undefined>;  // returns the removed draft
  markDraftsSent(ids: readonly DraftId[]): Promise<void>;                 // status 'sent', sentAt now()
  // saveTranslation and discardLocales become real
  ```

  `saveTranslation(locale, key, value, options)` runs these steps:
  1. An unknown locale rejects `` `Unknown language "${locale}".` ``.
  2. `built = await readBuiltLocale(locale)`. `from` is the string from `lookupKey(built, key)`, or `null` when the key is `missing` or `occupied` (an `occupied` key is refused with 409 in step 4).
  3. If `value === from`, delete the draft, dispatch the event and resolve. Restoring the built value needs no validation.
  4. Run `validateEdit({ locale, key, value }, { sourceLocale: manifest.sourceLocale, source: await readBuiltLocale(manifest.sourceLocale), target: built }, { force: options.force === true })`. `options.reference` is ignored.
     - A 422 throws `new ValidationError(error, code, details)`.
     - A 400 or 409 throws `new Error(error)`.
  5. `put({ scope, locale, key, from, to: value, force: options.force === true, base: manifest.base, branch: manifest.branch, status: 'unsent', conflict: false, updatedAt: now(), sentAt: null })`.
  6. Dispatch `DRAFTS_CHANGED_EVENT` on `events`, then resolve `{ success: true, key, locale }`.

  The dictionary cache is never invalidated, because drafts merge on read. `discardLocales()` deletes **unsent** drafts only. `discardDraft`, `markDraftsSent` and `discardLocales` each dispatch the event.

- [ ] **Step 1: Write the failing test.**
  ```ts
  it('stores a validated edit as an unsent draft against the built value', async () => {
    expect(await t.saveTranslation('ar', 'home.title', 'أهلاً')).toEqual({ success: true, key: 'home.title', locale: 'ar' });
    expect(await t.listDrafts()).toEqual([{ scope: 'path:/', locale: 'ar', key: 'home.title', from: 'مرحبا', to: 'أهلاً',
      force: false, base: SHA_A, branch: 'main', status: 'unsent', conflict: false, updatedAt: 1000, sentAt: null }]);
    expect(dispatched).toEqual([DRAFTS_CHANGED_EVENT]);
  });
  it('keeps from at the built value across re-edits', ...);            // 'A' then 'B' → one draft { from: 'مرحبا', to: 'B' }
  it('restoring the built value removes the draft without validation', ...); // save 'أهلاً', then save 'مرحبا' → listDrafts() []; DRAFTS_CHANGED_EVENT dispatched twice
  it('checks placeholders against the built source locale, not the client reference', async () =>
    await expect(t.saveTranslation('ar', 'home.greet', 'أهلا', { reference: 'أهلا' }))
      .rejects.toMatchObject({ name: 'ValidationError', code: 'PLACEHOLDER_MISMATCH', details: { missing: ['{name}'], extra: [] } }));
  it('records Save anyway as force', ...);                              // { force: true } → draft.force true
  it('checks a source-locale edit against its previous value', ...);    // ('en','home.greet','Hi there') → ValidationError
  it('rejects unsafe keys as a plain error and stores nothing', ...);   // '__proto__.x' → not ValidationError; listDrafts() []
  it('refuses to save over a group of translations', ...);              // ('ar','home','x') → Error matching /would replace/
  it('refuses to save over a literal dotted key', async () => {         // Review Focus 4
    const t = await make({ files: { 'ar.json': JSON.stringify({ 'promo.banner': 'قديم' }) } });
    await expect(t.saveTranslation('ar', 'promo.banner', 'x')).rejects.toThrow(/would replace/);
    expect(await t.listDrafts()).toEqual([]);
  });
  it('records a new key with from null', ...);                          // ('ar','home.new','جديد') → from null
  it('re-editing a sent draft makes it unsent and rebases it', ...);    // save 'A', markDraftsSent, now 2000, save 'B' → { to: 'B', status: 'unsent', sentAt: null, updatedAt: 2000, base: manifest.base }
  it('marks drafts sent', ...);                                         // status 'sent', sentAt 1000
  it('discard keeps sent drafts and removes unsent ones', ...);         // drafts ar/home.title sent, ar/home.greet unsent → discardLocales() → only home.title listed
  it('discardDraft returns the removed draft', ...);                    // discardDraft('ar','home.title') → the stored draft; listDrafts() []; unknown key → undefined
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-static-transport.test.ts`. Expected: FAIL with `not implemented`.
- [ ] **Step 3:** Implement following the steps above.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): save share-link edits as validated drafts`.

---

### Task 31: Generated diff as the static git state

**Files:**

- Modify: `src/studio/transport/drafts.ts`, `src/studio/transport/static.ts`
- Test: Extend `tests/unit/studio-draft-model.test.ts` and `tests/unit/studio-static-transport.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export function localeFilePath(
    m: Pick<ShareManifest, 'localesPath' | 'layout'>,
    locale: string,
    key: string
  ): string;
  // flat: `${localesPath}/${locale}.json`; namespaced: `${localesPath}/${locale}/${key.split('.')[0]}.json`;
  // with localesPath '.' (locales at the repository root) the `${localesPath}/` prefix is dropped: 'ar.json', 'ar/home.json'
  export function buildDraftDiff(
    drafts: readonly Draft[],
    m: Pick<ShareManifest, 'localesPath' | 'layout'>
  ): string; // values via JSON.stringify
  ```

  `fetchGitState()` returns:

  ```ts
  { available: true, isRepo: true, branch: manifest.branch, mode: 'static',
    changes: [{ path, status: 'modified' }],      // one per distinct file, sorted
    diff: buildDraftDiff(allDraftsInScope),
    pullRequestUrl: null }
  ```

- [ ] **Step 1: Write the failing test.**
  ```ts
  it('maps keys to repo-relative files', () => {
    expect(localeFilePath({ localesPath: 'src/locales', layout: 'flat' }, 'ar', 'home.title')).toBe('src/locales/ar.json');
    expect(localeFilePath({ localesPath: 'src/locales', layout: 'namespaced' }, 'ar', 'home.title')).toBe('src/locales/ar/home.json');
    expect(localeFilePath({ localesPath: '.', layout: 'flat' }, 'ar', 'home.title')).toBe('ar.json');
    expect(localeFilePath({ localesPath: '.', layout: 'namespaced' }, 'ar', 'home.title')).toBe('ar/home.json');
  });
  it('renders drafts as a line diff sorted by file then key', () =>
    expect(buildDraftDiff([titleDraft /* 'مرحبا' → 'أهلاً' */, newDraft /* null → 'جديد' */], flat)).toBe(
      ['--- a/src/locales/ar.json', '+++ b/src/locales/ar.json', '@@ home.new @@', '+"جديد"', '@@ home.title @@', '-"مرحبا"', '+"أهلاً"'].join('\n')));
  it('escapes newlines so every value stays on one diff line', ...);  // to 'a\nb' → '+"a\\nb"'
  it('reports drafts as static git state', ...);                      // changes [{ path:'src/locales/ar.json', status:'modified' }], branch 'main', mode 'static'
  it('reports a clean state without drafts', ...);                    // changes [], diff ''
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-draft-model.test.ts tests/unit/studio-static-transport.test.ts`. Expected: FAIL, because `localeFilePath` is not exported.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): show share-link drafts as a generated diff`.

---

### Task 32: Studio bootstrap

**Files:**

- Create: `src/studio/bootstrap.ts`
- Modify: `src/studio/main.tsx`, `src/studio/runtime.ts`, `hooks/useStudio.ts` (setup problems) and `src/studio/app.tsx` (blocked preview).
- Modify: `tests/unit/studio-runtime.test.ts`. The static runtime passed in `serves the static runtime once set` gains `transport: {} as StaticTransport`, so it still type-checks.
- Modify: `ARCHITECTURE.md` §8 (Studio). The Studio now resolves the app origin at start-up through `detectStudioRuntime`. It runs in static mode when `./manifest.json` is present, keeps IndexedDB drafts instead of using the HTTP API, and adds `static` to the modes of the re-apply loop. Without a usable manifest under `/livelocale/`, it shows the fix and renders no app preview.
- Test: Create `tests/unit/studio-bootstrap.test.ts`

**Interfaces:**

- Consumes: `detectStudioRuntime`, `DetectedRuntime`, `setStudioRuntime`, `STATIC_MANIFEST_MISSING` (Task 27); `setStudioTransport` (Task 28); `openDraftStore` (Task 26); `createStaticTransport`, `StaticTransport` and `STORAGE_PROBLEM` (Tasks 29–31).
- Produces:

  ```ts
  // runtime.ts (replaces Task 27's alias; setStudioRuntime and getStudioRuntime now use this type)
  export type StudioRuntime =
    | Exclude<DetectedRuntime, { kind: 'static' }>
    | (Extract<DetectedRuntime, { kind: 'static' }> & { transport: StaticTransport });
  export function getStaticTransport(): StaticTransport | null;
  /** True when getStudioRuntime() is a server runtime whose problems include STATIC_MANIFEST_MISSING. */
  export function isAppPreviewBlocked(): boolean;
  // bootstrap.ts
  export interface StudioEnvironment {
    href: string;
    search: string;
    injected?: unknown;
    buildTime?: unknown;
    fetch: typeof fetch;
    indexedDB?: IDBFactory;
    now?: () => number;
  }
  export function startStudio(env: StudioEnvironment): Promise<StudioRuntime>; // never rejects; adds `transport` to a detected static runtime before setStudioRuntime
  ```

  - `main.tsx` calls `startStudio({ href: location.href, search: location.search, injected: window.__LIVELOCALE_CONFIG__?.appOrigin, buildTime: (import.meta as any).env?.VITE_APP_ORIGIN, fetch: window.fetch.bind(window), indexedDB: window.indexedDB })`.
  - It then renders `<App/>` in `.finally`, with a `.catch(console.error)` guard.
  - **Setup problems without a connection.** `useStudio` seeds `setupProblems` at mount with the runtime's problems (`getStudioRuntime().problems` for a server runtime, `[]` for static), independent of `connectionStatus`. The existing `fetchInfo()` effect, which runs only once connected, then sets `[...runtimeProblems, ...(info.problems ?? [])]`.
  - **Blocked preview.** When `isAppPreviewBlocked()`, `app.tsx` renders no `IframeViewer`, so neither `#app-preview-iframe` nor the `slow-connection-help` block appears; the `SetupProblems` banner above the viewer carries `STATIC_MANIFEST_MISSING`.

- [ ] **Step 1: Write the failing test.** Use the node environment with `IDBFactory` from `fake-indexeddb`. `afterEach` calls `setStudioTransport(null)` and `resetStudioRuntime()`.
  - `it('stays on HTTP when the CLI injected an origin')`: expect `kind: 'server'`, `getStaticTransport()` to be `null`, `isAppPreviewBlocked()` to be `false`, and no fetch call.
  - `it('starts in static mode with IndexedDB drafts and routes api calls to them')`: `(await fetchInfo()).mode === 'static'` through the `api.ts` export, and `getStaticTransport()?.persistent === true`.
  - `it('reports memory-only drafts when IndexedDB is unavailable')`: with `indexedDB: undefined`, `(await fetchInfo()).problems` equals `[STORAGE_PROBLEM]`.
  - `it('starts in server mode with the manifest problem under /livelocale/')`: with a 404 manifest at `STUDIO_URL`, expect `getStudioRuntime()` to match `{ kind: 'server', problems: [STATIC_MANIFEST_MISSING] }`.
  - `it('blocks the app preview when a /livelocale/ Studio has no manifest')` (Review Focus 1): with `'<!doctype html><title>x</title>'` (status 200) as the manifest at `STUDIO_URL`, `isAppPreviewBlocked()` is `true`; with a valid manifest it is `false`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-bootstrap.test.ts`. Expected: FAIL, because `bootstrap.ts` is missing.
- [ ] **Step 3:** Implement. Update `main.tsx`, the `useStudio` problem seeding and merge, the `app.tsx` blocked-preview branch, the `studio-runtime` test fixture and ARCHITECTURE §8.
- [ ] **Step 4:** Run `npx vitest run tests/unit && npm run typecheck && npm run build`. Expected: PASS, and `dist/studio/index.html` exists.
- [ ] **Step 5:** Commit `feat(studio): start in static mode when a manifest is present`.

---

### Task 33: Locale inference rules

**Files:**

- Create: `src/studio/locale-inference.ts`
- Modify: `src/studio/runtime.ts` and `src/studio/features/dashboard/hooks/useConnection.ts`.
- Test: Create `tests/unit/locale-inference.test.ts`. Extend `tests/unit/studio-hooks.test.tsx` (useConnection).

**Interfaces:**

- Consumes: `VisibleText`, `MAX_VISIBLE_TEXTS` (Task 15); `getStudioRuntime` (Task 27).
- Produces:
  ```ts
  export type LocaleSource = 'content' | 'url' | 'manual' | 'remembered';
  export interface CurrentLocale {
    locale: string;
    source: LocaleSource | null;
  }
  export type LocaleChoice = (CurrentLocale & { source: LocaleSource }) | { pick: string[] };
  export type TextCandidates = Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >;
  export function localeFromUrl(
    url: string,
    options?: { basePath?: string; locales?: readonly string[] }
  ): string | null;
  export function normalizeText(text: string): string; // NFC, collapse whitespace, trim, toLowerCase (matching only; never used on write paths)
  export function matchLocalesByText(
    key: string,
    texts: readonly string[],
    candidates: TextCandidates
  ): string[]; // sorted; '' never matches
  export function matchLocalesByVisibleTexts(
    texts: readonly VisibleText[],
    candidates: TextCandidates
  ): string[]; // locales matching the most texts (>= 1), sorted
  export function chooseLocaleOnClick(
    matches: readonly string[],
    current: CurrentLocale,
    locales: readonly string[]
  ): LocaleChoice;
  export function chooseLocaleOnNavigation(
    urlLocale: string | null,
    current: CurrentLocale
  ): CurrentLocale;
  export function chooseLocaleOnPageTexts(
    matches: readonly string[],
    current: CurrentLocale
  ): CurrentLocale;
  export function localeMismatch(matches: readonly string[], current: CurrentLocale): string | null;
  export function isLocaleConfirmed(current: CurrentLocale): boolean; // source is 'content' | 'url' | 'manual'
  // runtime.ts
  export function urlLocaleOptions(): { basePath?: string; locales?: readonly string[] }; // {} in server mode
  // useConnection gains: onVisibleTexts?: (texts: VisibleText[]) => void   (VISIBLE_TEXTS_CHANGED from the app origin, array-validated, capped at MAX_VISIBLE_TEXTS)
  ```
- **`localeFromUrl`.**
  - Without options it keeps today's heuristic: `?locale=` first, otherwise a two-letter first segment.
  - With `locales`, it strips the `basePath` prefix first. The `?locale=` value or the first segment must then match a listed locale case-insensitively, and the function returns the listed spelling.
- **`chooseLocaleOnClick`.** Apply these rules in order:
  1. A `manual` source is kept.
  2. A single match gives `content`.
  3. With several matches, keep the current locale if it is among them and its source is non-null. Otherwise return `pick(matches)`.
  4. With no match, keep the current locale if its source is non-null. Otherwise return `pick(locales)`.
- **`chooseLocaleOnNavigation`.** It keeps `manual`. A non-null URL locale becomes `url`. Otherwise the current locale is kept.
- **`chooseLocaleOnPageTexts`.**
  1. A `manual` source is kept.
  2. A single match gives `content`.
  3. If the current locale is among the matches and its source is `remembered`, the source becomes `content`.
  4. Otherwise nothing changes.

  A remembered locale is therefore confirmed only when the page agrees.

- **`useConnection`.** The READY handler becomes `localeFromUrl(payload.url, urlLocaleOptions())`.

- [ ] **Step 1: Write the failing test.**
  ```ts
  it("keeps today's URL heuristic in server mode", () => {
    expect(localeFromUrl('/fr/about')).toBe('fr'); expect(localeFromUrl('/about?locale=de')).toBe('de'); expect(localeFromUrl('/about')).toBeNull();
  });
  it('strips the base path and accepts only manifest locales', () => {
    const o = { basePath: '/repo/', locales: ['ar', 'en', 'pt-BR'] };
    expect(localeFromUrl('/repo/ar/about', o)).toBe('ar'); expect(localeFromUrl('/repo/about', o)).toBeNull();
    expect(localeFromUrl('/repo/pt-br/x', o)).toBe('pt-BR'); expect(localeFromUrl('/repo/?locale=EN', o)).toBe('en');
    expect(localeFromUrl('/repo/?locale=fr', o)).toBeNull();
    expect(localeFromUrl('/my/page', { basePath: '/', locales: ['ar', 'en'] })).toBeNull();
  });
  const cands = { en: { 'home.title': ['Welcome'] }, 'en-GB': { 'home.title': ['Welcome'] }, ar: { 'home.title': ['مرحبا', 'أهلاً'], 'home.greet': ['أهلا {name}'] } };
  it('matches clicked text to locales, built or drafted', () => {
    expect(matchLocalesByText('home.title', ['مرحبا'], cands)).toEqual(['ar']);
    expect(matchLocalesByText('home.title', ['أهلاً'], cands)).toEqual(['ar']);
    expect(matchLocalesByText('home.title', ['WELCOME', '  Welcome \n'], cands)).toEqual(['en', 'en-GB']);
    expect(matchLocalesByText('home.title', [''], { en: { 'home.title': [''] } })).toEqual([]);
    expect(matchLocalesByText('k', ['e\u0301'], { fr: { k: ['\u00E9'] } })).toEqual(['fr']);
  });
  it('infers the page locale from visible texts', () => {
    expect(matchLocalesByVisibleTexts([{ key: 'home.title', text: 'مرحبا' }, { key: 'nope', text: 'x' }], cands)).toEqual(['ar']);
    expect(matchLocalesByVisibleTexts([{ key: 'home.title', text: 'Welcome' }], cands)).toEqual(['en', 'en-GB']);
    expect(matchLocalesByVisibleTexts([], cands)).toEqual([]);
  });
  const all = ['ar', 'en', 'en-GB'];
  it.each([
    [['ar'], { locale: 'en', source: 'url' }, { locale: 'ar', source: 'content' }],
    [['ar'], { locale: 'en', source: 'manual' }, { locale: 'en', source: 'manual' }],
    [[], { locale: 'ar', source: 'content' }, { locale: 'ar', source: 'content' }],
    [[], { locale: 'en', source: null }, { pick: ['ar', 'en', 'en-GB'] }],
    [['en', 'en-GB'], { locale: 'en-GB', source: 'url' }, { locale: 'en-GB', source: 'url' }],
    [['en', 'en-GB'], { locale: 'ar', source: 'remembered' }, { pick: ['en', 'en-GB'] }],
  ])('click %j with %j -> %j', (m, cur, exp) => expect(chooseLocaleOnClick(m, cur as CurrentLocale, all)).toEqual(exp));
  it('navigation overrides automatic sources but not a manual choice', () => {
    expect(chooseLocaleOnNavigation('en', { locale: 'ar', source: 'content' })).toEqual({ locale: 'en', source: 'url' });
    expect(chooseLocaleOnNavigation('en', { locale: 'ar', source: 'manual' })).toEqual({ locale: 'ar', source: 'manual' });
    expect(chooseLocaleOnNavigation(null, { locale: 'ar', source: 'content' })).toEqual({ locale: 'ar', source: 'content' });
  });
  it('page texts confirm a remembered locale only when they agree', () => {
    expect(chooseLocaleOnPageTexts(['ar'], { locale: 'en', source: 'remembered' })).toEqual({ locale: 'ar', source: 'content' });
    expect(chooseLocaleOnPageTexts(['en', 'en-GB'], { locale: 'en', source: 'remembered' })).toEqual({ locale: 'en', source: 'content' });
    expect(chooseLocaleOnPageTexts(['en', 'en-GB'], { locale: 'ar', source: 'remembered' })).toEqual({ locale: 'ar', source: 'remembered' });
    expect(chooseLocaleOnPageTexts(['ar'], { locale: 'en', source: 'manual' })).toEqual({ locale: 'en', source: 'manual' });
  });
  it('only content, url and manual confirm a locale', () => {
    expect(isLocaleConfirmed({ locale: 'ar', source: 'remembered' })).toBe(false);
    expect(isLocaleConfirmed({ locale: 'ar', source: null })).toBe(false);
    expect(isLocaleConfirmed({ locale: 'ar', source: 'url' })).toBe(true);
  });
  it('reports a mismatch only against a manual choice', () => {
    expect(localeMismatch(['ar'], { locale: 'en', source: 'manual' })).toBe('ar');
    expect(localeMismatch(['ar', 'en'], { locale: 'en', source: 'manual' })).toBeNull();
    expect(localeMismatch(['ar'], { locale: 'en', source: 'url' })).toBeNull();
  });
  // studio-hooks.test.tsx
  it('forwards VISIBLE_TEXTS_CHANGED from the app origin only', ...); // app origin → onVisibleTexts([...]); other origin or non-array payload → not called
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/locale-inference.test.ts tests/unit/studio-hooks.test.tsx`. Expected: FAIL, because the module is missing.
- [ ] **Step 3:** Implement, then switch `useConnection` to `localeFromUrl` and `onVisibleTexts`.
- [ ] **Step 4:** Run `npx vitest run tests/unit`. Expected: PASS. The existing `useConnection` locale tests are unchanged.
- [ ] **Step 5:** Commit `feat(studio): infer the edited language from page text and address`.

---

### Task 34: Source-locale reference and loaded-locale tracking in `useLocaleData`

**Files:**

- Modify: `src/studio/features/dashboard/hooks/useLocaleData.ts`, `hooks/useStudio.ts`
- Test: Extend `tests/unit/studio-locale-hooks.test.tsx`

**Interfaces:**

- Consumes: `getStaticTransport` (Task 32).
- Produces: `useLocaleData({ connectionStatus, iframeRef, referenceLocale?: string /* default 'en' */ })`.
  - The return gains `dataLocale: string | null`, the locale the current `localeData` belongs to. It is set only after a successful fetch.
  - The reference dictionary (`enLocaleData`) is fetched from `referenceLocale`, and the sync effect compares against `referenceLocale`.
  - `useStudio` passes `referenceLocale: getStaticTransport()?.manifest.sourceLocale ?? 'en'`.

- [ ] **Step 1: Write the failing test.**
  - `it('reports which locale the loaded dictionary belongs to')`: `dataLocale` is `null`, then `'en'` after the load, then `'ar'`, but only after the `?locale=ar` request resolves. Use a deferred fetch.
  - `it('loads the reference dictionary from the given source locale')`: with `referenceLocale: 'ar'`, fetch is called with a URL ending `?locale=ar`, and `enLocaleData['home.title'] === 'مرحبا'`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-locale-hooks.test.tsx`. Expected: FAIL, because `dataLocale` is undefined.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): load the reference dictionary from the source locale`.

---

### Task 35: Drafts in the Studio: `useDrafts`, the re-apply loop, the unsent counter and the leave-page guard

**Files:**

- Create: `src/studio/features/dashboard/hooks/reapply.ts`, `hooks/useDrafts.ts`, `hooks/useUnsentGuard.ts`
- Modify: `hooks/useStudio.ts`, `components/Header.tsx`, `src/studio/app.tsx`
- Test: Create `tests/unit/studio-reapply.test.ts` and `tests/unit/studio-drafts-hook.test.tsx` (jsdom)

**Interfaces:**

- Consumes: `getStaticTransport` (Task 32); `StaticTransport`, `DRAFTS_CHANGED_EVENT` (Tasks 29, 30); `Draft`, `DraftId` (Task 25); `LiveLocaleMode` (Task 28); `HistoryEntry` (`useHistory`).
- Produces:
  ```ts
  // reapply.ts
  export function valuesToReapply(input: {
    mode: LiveLocaleMode | null;
    locale: string;
    localeConfirmed: boolean;
    history: readonly HistoryEntry[];
    drafts: readonly Draft[];
  }): Map<string, string>;
  // useDrafts.ts
  export function useDrafts(transport: StaticTransport | null): {
    drafts: Draft[];
    unsentCount: number;
    sentCount: number;
    refresh(): Promise<void>;
    discard(d: Draft): Promise<Draft | undefined>;
    markSent(ds: readonly Draft[]): Promise<void>;
  };
  export function unsentLabel(n: number): string; // '1 change not sent' | `${n} changes not sent`
  // useUnsentGuard.ts
  export function useUnsentGuard(active: boolean): void;
  // Header: unsentCount?: number → <span data-testid="unsent-counter"> only when > 0
  // useStudio returns: drafts, unsentCount, sentCount, markDraftsSent(ds), staticManifest: ShareManifest | null
  ```
- **`valuesToReapply` rules:**
  - `preview` uses the session history, and the newest entry for a key wins (as today).
  - `static` uses every draft for `locale`, whatever its status. It returns an empty map while `!localeConfirmed`.
  - Every other mode returns an empty map.
- **`useDrafts` rules:**
  - A null transport gives `[]` and makes no calls.
  - It loads on mount and reloads on every `DRAFTS_CHANGED_EVENT` on `transport.events`.
  - `markSent(ds)` calls `transport.markDraftsSent(ds.map(({ locale, key }) => ({ locale, key })))`.
- **`useUnsentGuard`:** while `active`, a `beforeunload` listener calls `preventDefault()` and sets `returnValue = ''`. The listener is removed when the guard turns inactive or unmounts.
- **`useStudio` wiring:**
  - The resend effect uses `valuesToReapply` with `localeConfirmed: true`; Task 36 replaces that value. `drafts` is added to the effect's deps.
  - It calls `useUnsentGuard(mode === 'static' && unsentCount > 0)`.
  - In static mode the Changes button count is `drafts.length`.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // studio-reapply.test.ts
  it('preview re-applies session history, newest wins', ...);                  // → new Map([['home.title','B']])
  it('static re-applies persisted drafts for the locale and ignores history', ...); // drafts ar:'B', en:'C' → Map{home.title:'B'}
  it('static re-applies nothing until the locale is confirmed', ...);          // localeConfirmed false → size 0
  it('development re-applies nothing', ...);                                  // mode 'development' with history and drafts → size 0
  // studio-drafts-hook.test.tsx (fake transport, events = new EventTarget())
  it('returns nothing and calls nothing without a transport', ...);           // useDrafts(null) → drafts [], unsentCount 0, sentCount 0; no transport method called
  it('loads drafts and counts unsent and sent', ...);         // [unsent, unsent, sent] → unsentCount 2, sentCount 1
  it('reloads when the transport announces a change', ...);   // events.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT)) → listDrafts called twice
  it('marks drafts sent by id', ...);                         // markSent([d]) → markDraftsSent([{ locale: 'ar', key: 'home.title' }])
  it('labels the counter', () => { expect(unsentLabel(1)).toBe('1 change not sent'); expect(unsentLabel(5)).toBe('5 changes not sent'); });
  it('blocks leaving only while active', ...);                // new Event('beforeunload', { cancelable: true }) → defaultPrevented true; rerender(false) → false
  it('shows the counter in the header only when something is unsent', ...); // unsentCount 0 → null; 5 → '5 changes not sent'
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-reapply.test.ts tests/unit/studio-drafts-hook.test.tsx`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3:** Implement, and wire `useStudio`, `Header` and `app.tsx`.
- [ ] **Step 4:** Run `npx vitest run tests/unit && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): re-apply saved drafts, count unsent changes and guard the tab`.

---

### Task 36: Target locale: always shown, picker when required

**Files:**

- Create: `src/studio/features/dashboard/hooks/useTargetLocale.ts`, `src/studio/features/dashboard/components/LocalePicker.tsx`
- Modify: `components/Header.tsx`, `hooks/useStudio.ts`, `src/studio/features/dashboard/index.ts`, `src/studio/app.tsx`
- Test: Create `tests/unit/studio-target-locale.test.tsx` and `tests/unit/locale-picker.test.tsx`

**Interfaces:**

- Consumes: the Task 33 functions; `dataLocale` (Task 34); `StaticTransport.textCandidates` and `scope` (Task 29); `useConnection.onVisibleTexts` (Task 33).
- Produces:
  ```ts
  export const TARGET_LOCALE_STORAGE_PREFIX = 'livelocale-target-locale:';
  export const useTargetLocale: (p: {
    enabled: boolean;
    scope: string | null;
    locale: string;
    setLocale: (l: string) => void;
    locales: readonly string[];
    getCandidates: () => Promise<TextCandidates>;
  }) => {
    source: LocaleSource | null;
    confirmed: boolean;
    mismatch: string | null;
    pickerCandidates: string[] | null;
    onUrlLocale(locale: string): void;
    onVisibleTexts(texts: readonly VisibleText[]): Promise<void>;
    resolveForSelection(el: SelectedElement): Promise<boolean>; // false = picker opened, selection pending
    choose(locale: string): SelectedElement | null; // manual; returns the pending element
    onMenuLocale(locale: string): void; // the editor's language <select>: enabled → choose(locale); disabled → setLocale(locale)
    cancelPick(): void;
  };
  export const LocalePicker: (p: {
    candidates: string[] | null;
    onChoose(l: string): void;
    onCancel(): void;
  }) => JSX.Element | null;
  // Header new optional props: targetLocale?: { locale: string; source: LocaleSource | null; mismatch: string | null } | null; locales?: string[]; onChooseLocale?(l: string): void
  // useStudio returns: targetLocale (null in server mode), localePickerCandidates, chooseTargetLocale, cancelLocalePick
  ```
- **Behaviour:**
  - When `enabled` is false, `onUrlLocale` is `setLocale` (as today), `resolveForSelection` resolves `true` without loading candidates, and `onVisibleTexts` does nothing.
  - When `enabled` is true:
    - Confirmed locales are remembered in `localStorage[prefix + scope]`, inside try/catch.
    - On start, a remembered value that is still listed is restored with source `remembered`.
    - `confirmed` is `isLocaleConfirmed(...)`.
  - In static mode, `useStudio` does four things:
    - It queues the selected element and calls `selectElement` only once `dataLocale === locale`.
    - It passes `onVisibleTexts` to `useConnection`.
    - It passes `localeConfirmed: target.confirmed` to the resend loop.
    - The `handleLocaleChange` it returns (wired to the `EditorPanel` language `<select>` through `app.tsx`) is `target.onMenuLocale`, so a correction made in that menu becomes a `manual` choice that the next Alt+Click does not override (spec §2 step 3: "you can change it if it is wrong"). In server mode `onMenuLocale` is today's `setLocale`.
- **Exact copy:**
  - Picker heading: `Which language are you editing?`.
  - Picker body: `LiveLocale could not tell from the page. Your fix will be saved to the language you pick.`
  - Picker buttons: one per candidate, plus `Cancel`.
  - Header: `Editing: ${locale}`, with a hint that depends on the source:

    | Source       | Hint                      |
    | ------------ | ------------------------- |
    | `content`    | `detected from page text` |
    | `url`        | `from the page address`   |
    | `manual`     | `chosen by you`           |
    | `remembered` | `from your last visit`    |

    When there is no source yet, the header shows `Language: not chosen yet`.

  - Mismatch: `This text looks like ${mismatch}.`, with the button `Switch to ${mismatch}`.

- [ ] **Step 1: Write the failing tests.** The candidates are `{ en: { 'home.title': ['Welcome'] }, ar: { 'home.title': ['مرحبا'] } }`.
  ```ts
  it('switches to the language whose text matches the click', ...);   // resolveForSelection(el('مرحبا')) → true; setLocale('ar'); source 'content'
  it('detects the page language from visible texts before any click', ...); // onVisibleTexts([{ key:'home.title', text:'مرحبا' }]) → setLocale('ar'); source 'content'; confirmed true
  it('does not confirm a remembered locale until the page agrees', ...);    // remembered 'ar' → confirmed false; onVisibleTexts English → setLocale('en'), source 'content', confirmed true
  it('requires a pick when neither text nor address identifies the language', ...); // → false; pickerCandidates ['ar','en']; choose('ar') returns el; source 'manual'
  it('keeps a manual choice and reports a mismatch', ...);            // choose('en') then click 'مرحبا' → no setLocale('ar'); mismatch 'ar'
  it("keeps a change from the editor's language menu as manual", ...); // onMenuLocale('en') → setLocale('en'), source 'manual'; click 'مرحبا' → no setLocale('ar'); mismatch 'ar'
  it('passes menu changes straight through in server mode', ...);     // enabled false: onMenuLocale('fr') → setLocale('fr'); source stays null
  it('uses the page address until a click says otherwise', ...);      // onUrlLocale('en') → 'url'; click 'مرحبا' → 'ar' content
  it('remembers the confirmed language for this share link', ...);    // localStorage['livelocale-target-locale:path:/'] === 'ar'; remount → setLocale('ar'), source 'remembered'
  it('behaves as before in server mode', ...);                        // enabled false: onUrlLocale('fr') → setLocale('fr'); getCandidates not called
  // locale-picker.test.tsx (vi.stubGlobal('__STUDIO_VERSION__', '0.0.0-test') before importing Header)
  it('offers each candidate and reports the choice', ...);            // click 'ar' → onChoose('ar'); 'Cancel' → onCancel; null → renders nothing
  it('always shows the target language in the header', ...);          // 'Editing: ar' + 'detected from page text'; source null → 'Language: not chosen yet'
  it('offers to switch on a mismatch', ...);                          // 'This text looks like ar.'; 'Switch to ar' → onChooseLocale('ar')
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-target-locale.test.tsx tests/unit/locale-picker.test.tsx`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3:** Implement the hook and the components, and wire `useStudio` and `app.tsx`.
- [ ] **Step 4:** Run `npx vitest run tests/unit && npm run typecheck && npm run lint && npm run format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): always show and confirm the target language`.

---

### Task 37: Responsive Studio layout (drawers below 1280px)

**Files:**

- Create: `src/studio/features/dashboard/hooks/useMediaQuery.ts`, `src/studio/features/dashboard/components/StudioLayout.tsx`
- Modify: `src/studio/app.tsx`, `components/KeysDirectory.tsx`, `EditorPanel.tsx`, `Header.tsx`, `src/studio/features/dashboard/index.ts`
- Test: Create `tests/unit/studio-layout.test.tsx` and `tests/e2e/responsive-layout.spec.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `export const WIDE_LAYOUT_QUERY = '(min-width: 1280px)'`
  - `export function useMediaQuery(query: string, fallback: boolean): boolean`
  - `export type StudioPanel = 'keys' | 'side' | null`
  - `export const StudioLayout: (p: { isWide: boolean; keys: ReactNode; viewer: ReactNode; side: ReactNode; sideLabel: string; openPanel: StudioPanel; onOpenPanelChange: (p: StudioPanel) => void; toolbar?: ReactNode }) => JSX.Element`
  - `KeysDirectory` and `EditorPanel` gain `className?: string`, with `data-testid="keys-directory"` and `data-testid="editor-panel"`.
  - Test ids: `studio-toggle-keys`, `studio-toggle-side`, `studio-drawer-keys`, `studio-drawer-side`.
- **Decisions:**
  - **Breakpoint.** It is 1280px, which matches Tailwind `xl` and Playwright's `Desktop Chrome` viewport (1280×720). `visual-sync.spec.ts` therefore keeps the three-column layout.
  - **Stable tree.** `StudioLayout` renders `keys`, `viewer` and `side` in fixed slots in both modes and switches only classes and attributes. Crossing the breakpoint never remounts the editor.
  - **Compact mode (below 1280px):**
    - `main` uses `p-2 gap-0`, and the viewer takes the full width.
    - The keys slot is a left drawer and the side slot is a right drawer. Both are `absolute inset-y-0 z-30 w-[min(400px,45vw)]` overlays, so the iframe is never resized.
    - A closed drawer keeps the `hidden` attribute. Only one drawer is open at a time, and Escape closes it.
    - A toolbar with the "Keys" and `sideLabel` toggles sits above the viewer. The toggles carry `aria-expanded` and `aria-controls`.
  - **Opening the side drawer.** `app.tsx` holds `openPanel`. It opens `'side'` when `selected?.key` becomes non-null, and when a key is picked in the keys drawer.
  - **Header below `xl`.** The subtitle and version badge are `hidden xl:block`. Padding is `px-4 xl:px-8`, and the coverage bar is `w-16 xl:w-28`.
  - `isWide = useMediaQuery(WIDE_LAYOUT_QUERY, true)`. The fallback is `true` when `matchMedia` is missing.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  // studio-layout.test.tsx
  it('returns the fallback when matchMedia is missing'); // useMediaQuery(WIDE_LAYOUT_QUERY, true) → true
  it('follows change events and unsubscribes on unmount'); // fake matchMedia matches false → false; fire change with matches true → true; unmount → removeEventListener('change', same handler)
  it('renders all three slots inline without toggles when wide'); // queryByTestId('studio-toggle-keys') === null
  it('keeps both drawers hidden in compact mode until toggled'); // studio-drawer-side.hidden === true; click studio-toggle-side → onOpenPanelChange('side')
  it('closes the open drawer on Escape'); // openPanel 'side', keydown Escape on document → onOpenPanelChange(null)
  it('reports the open drawer through aria-expanded'); // openPanel 'keys' → studio-toggle-keys aria-expanded 'true', studio-toggle-side 'false'; aria-controls = the drawer ids
  it('does not remount the side slot when crossing the breakpoint'); // child with useState counter; rerender isWide false → state kept
  // responsive-layout.spec.ts (dev Studio on :3010)
  for (const vp of [
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
  ]) {
    test(`keeps the app at least 60% wide at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('http://localhost:3010');
      await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible({ timeout: 90_000 });
      const frame = page.locator('#app-preview-iframe');
      expect((await frame.boundingBox())!.width).toBeGreaterThanOrEqual(vp.width * 0.6);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await page
        .frameLocator('#app-preview-iframe')
        .locator('[data-i18n-key="home.welcome_msg"]')
        .click({ modifiers: ['Alt'] });
      await expect(page.locator('#studio-translation-input')).toBeVisible();
      expect((await frame.boundingBox())!.width).toBeGreaterThanOrEqual(vp.width * 0.6);
    });
  }
  test('shows three columns at 1440x900'); // keys-directory and editor-panel visible; studio-toggle-keys count 0
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-layout.test.tsx` and `npx playwright test tests/e2e/responsive-layout.spec.ts`. Expected: FAIL. The modules are missing, and the iframe is about 0px wide at 800px.
- [ ] **Step 3:** Implement as decided above.
- [ ] **Step 4:** Run `npx vitest run tests/unit/studio-layout.test.tsx` and `npx playwright test tests/e2e/responsive-layout.spec.ts tests/e2e/visual-sync.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): keep the app wide on laptop screens with drawers below 1280px`.

---

### Task 38: Share helpers (change set from drafts, link, file names, prefs, clipboard, download)

**Files:**

- Create: `src/studio/share/send.ts`, `src/studio/share/browser.ts`
- Test: Create `tests/unit/share-send.test.ts` and `tests/unit/share-browser.test.ts` (jsdom)

**Interfaces:**

- Consumes: `ChangeSet`, `ChangeLinkError`, `MAX_CHANGE_EDITS` (Tasks 5–7); `Draft` (Task 25); `ShareManifest` (Task 11).
- Produces:
  ```ts
  // send.ts
  export const SEND_NAME_MAX_CHARS = 80;
  export const SEND_NOTE_MAX_CHARS = 500;
  export function selectDraftsForSend(
    drafts: readonly Draft[],
    opts: { includeSent: boolean }
  ): { included: Draft[]; overflow: number };
  export function buildChangeSet(input: {
    drafts: readonly Draft[];
    manifest: Pick<ShareManifest, 'repo' | 'base' | 'branch' | 'sourceLocale'>;
    by?: string;
    note?: string;
  }): ChangeSet;
  export function buildShareLink(studioHref: string, token: string): string;
  export function changeFileName(kind: 'changes' | 'backup', now: Date): string;
  export function describeLinkError(err: unknown): string;
  // browser.ts
  export type PrefName = 'tips-seen' | 'translator-name' | 'github-repo';
  export function readPref(name: PrefName): string | null;
  export function writePref(name: PrefName, value: string | null): void;
  export function copyText(text: string): Promise<boolean>;
  export function downloadText(fileName: string, text: string): void;
  ```
- **`selectDraftsForSend`.**
  - Includes `unsent` drafts, plus `sent` drafts when `includeSent` is set.
  - Never includes drafts with `conflict: true`.
  - Sorts oldest `updatedAt` first, keeps the first `MAX_CHANGE_EDITS`, and reports the rest as `overflow`.
- **`buildChangeSet`.**
  - `repo` is set only when `manifest.repo` is a non-empty string.
  - `branch` is `manifest.branch ?? ''`, `base` is `manifest.base ?? ''`, and `src` is `manifest.sourceLocale`.
  - `by` has control characters removed and whitespace collapsed, then is trimmed and cut to 80 characters. It is `''` when empty.
  - `note` is trimmed and cut to 500 characters. It is `''` when empty.
  - `edits` are sorted by locale, then key, as `{ locale, key, from, to, force }`.
- **`buildShareLink`** returns `${url.origin}${pathname}#${token}`, where `pathname` is `url.pathname` with `index.html` appended when it ends in `/`, so the link always ends in `index.html` (S3 REST origins do not resolve folder indexes). Any query or old hash is dropped.
- **`changeFileName`** returns `` `livelocale-${kind}-${now.toISOString().slice(0, 10)}.txt` ``.
- **`describeLinkError`.** It maps `ChangeLinkError.code` to copy:

  | Code                          | Message                                                                                                                                             |
  | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `NOT_FOUND`                   | `'This is not a LiveLocale change link. A change link contains "lc1.".'`                                                                            |
  | `AMBIGUOUS`                   | `'This text holds more than one change link. Paste one link at a time.'`                                                                            |
  | `CORRUPT`, `INVALID`          | `'This change link is damaged or incomplete, which happens when an email or chat app breaks a long link. Ask the sender to send the file instead.'` |
  | `TOO_LARGE`, `TOO_MANY_EDITS` | `'This change link is larger than LiveLocale accepts (500 changes, 512 KB).'`                                                                       |
  | `UNSUPPORTED_VERSION`         | `'This change link was made by a newer LiveLocale. Update the site and try again.'`                                                                 |
  | `UNSUPPORTED_ENVIRONMENT`     | `'This browser cannot create or read change links. Use a current Chrome, Edge or Firefox, or Safari 16.4 or later.'`                                |

  Anything else gives `err.message || 'Could not read the change link.'`.

- **Prefs** live in `localStorage` under `` `livelocale:${name}` ``. Every access is in try/catch, with an in-memory `Map` fallback.
- **`copyText`.** It tries `navigator.clipboard.writeText` first. If that fails, it falls back to an off-screen `<textarea>` with `document.execCommand('copy')`. It returns `false` if both fail, and always removes the textarea.
- **`downloadText`.** It creates a `text/plain;charset=utf-8` Blob, an object URL and a temporary `<a download>`. It clicks the anchor, then revokes the URL.

- [ ] **Step 1: Write the failing tests.** Fixture: `const d = (o: Partial<Draft> = {}): Draft => ({ scope: 'path:/', locale: 'ar', key: 'home.title', from: 'مرحبا', to: 'أهلا', force: false, base: SHA_A, branch: 'main', status: 'unsent', conflict: false, updatedAt: 1, sentAt: null, ...o })`.
  ```ts
  it('includes unsent drafts oldest first, sent ones only on request, and never conflicts'); // [d({key:'b',updatedAt:2}), d({key:'a',updatedAt:1}), d({key:'s',status:'sent',updatedAt:3}), d({key:'c',updatedAt:0,conflict:true})] → includeSent false: keys ['a','b']; true: ['a','b','s']; overflow 0
  it('caps a send at MAX_CHANGE_EDITS and reports the overflow'); // 501 unsent → included 500, overflow 1
  it('omits repo unless the manifest exposes it'); // !('repo' in set); { repo: 'acme/web' } → set.repo 'acme/web'
  it('maps a missing branch and base to empty strings'); // branch null, base null → '' and ''
  it('cleans the name and note'); // by '  Sara \n Ali ' → 'Sara Ali'; note '   ' → ''
  it('sorts edits and keeps force'); // → [{ar,a.b},{ar,b,force:true},{fr,a}]
  it('produces a change set the codec accepts', async () =>
    expect(await encodeChangeLink(buildChangeSet({ drafts: [d()], manifest: MANIFEST }))).toMatch(
      /^lc1\./
    ));
  it('builds the link from the Studio page'); // ('https://www.acme.com/livelocale/index.html?x=1#lc1.old','lc1.new') → 'https://www.acme.com/livelocale/index.html#lc1.new'
  it('ends the link in index.html when the Studio was opened as a folder'); // ('https://www.acme.com/livelocale/','lc1.new') → 'https://www.acme.com/livelocale/index.html#lc1.new'
  it('names files by kind and UTC date'); // ('backup', new Date('2026-10-26T23:30:00Z')) → 'livelocale-backup-2026-10-26.txt'
  it.each([
    'NOT_FOUND',
    'AMBIGUOUS',
    'CORRUPT',
    'TOO_MANY_EDITS',
    'UNSUPPORTED_VERSION',
    'UNSUPPORTED_ENVIRONMENT',
  ])('describes %s in plain words'); // equals the table copy
  it('stores prefs under livelocale: and survives a throwing localStorage'); // writePref('translator-name','Sara') → localStorage['livelocale:translator-name'] 'Sara'; with getItem/setItem throwing → writePref then readPref returns 'Sara' from memory; writePref(n, null) → readPref(n) null
  it('copies with the Clipboard API'); // navigator.clipboard.writeText resolves → true; called with the text; execCommand not called
  it('falls back to execCommand when the Clipboard API is missing or rejects'); // clipboard undefined, then writeText rejecting → execCommand('copy') returns true → true both times
  it('returns false when both copy paths fail and removes the textarea'); // writeText rejects, execCommand returns false → false; document.querySelector('textarea') null
  it('downloads through a temporary anchor and revokes the URL'); // stub URL.createObjectURL → 'blob:x' and revokeObjectURL; spy HTMLAnchorElement.prototype.click → clicked anchor has download 'f.txt', href 'blob:x'; revokeObjectURL('blob:x'); no <a> left in the document
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/share-send.test.ts tests/unit/share-browser.test.ts`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3:** Implement as pinned.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): add change-link building and browser helpers`.

---

### Task 39: Draft list in Changes, per-draft Undo, backup and restore

**Files:**

- Create: `src/studio/share/backup.ts`, `src/studio/features/dashboard/components/DraftList.tsx`
- Modify: `src/studio/transport/static.ts` (`restoreDrafts`), `components/ChangesPanel.tsx`, `hooks/useStudio.ts`, `app.tsx`
- Test: Create `tests/unit/share-backup.test.ts` and `tests/unit/draft-list.test.tsx`. Extend `tests/unit/changes-panel.test.tsx` and `tests/unit/studio-static-transport.test.ts`.

**Interfaces:**

- Consumes:
  - `useDrafts` (Task 35)
  - `buildChangeSet`, `buildShareLink`, `changeFileName`, `describeLinkError` (Task 38)
  - `encodeChangeLink`, `decodeChangeLink`, `ChangeEdit`, `MAX_CHANGE_EDITS` (Tasks 6, 7)
  - `readBuiltLocale` (Task 29)
  - `lookupKey` (Task 1)
- Produces:
  ```ts
  // static.ts (on StaticTransport)
  restoreDrafts(edits: readonly ChangeEdit[]): Promise<{ added: number; skipped: number }>;
  // backup.ts
  export async function createBackup(input: { drafts: readonly Draft[]; manifest: ShareManifest; studioHref: string; by?: string; now?: Date }): Promise<{ fileName: string; text: string }>;
  export async function restoreBackup(text: string, transport: Pick<StaticTransport, 'restoreDrafts'>): Promise<string>;
  // DraftList.tsx
  export type DraftDisplayState = 'unsent' | 'sent' | 'live' | 'conflict';
  export const DRAFT_STATUS_LABELS: Record<DraftDisplayState, string>;
  export function draftDisplayState(d: Draft): Exclude<DraftDisplayState, 'live'>; // conflict when d.conflict, else d.status
  export const DraftList: (p: { drafts: Draft[]; onUndo(d: Draft): Promise<void>; isUndoing: boolean; onDownloadBackup(): Promise<void>;
    onRestoreBackup(file: File): Promise<string>; onReviewChange?: () => void }) => JSX.Element;
  // ChangesPanel new optional props: drafts?: Draft[] | null; onUndoDraft?; onDownloadBackup?; onRestoreBackup?; onReviewChange?
  // useStudio returns: undoDraft(d), downloadBackup(), restoreBackupFile(file)
  ```
- **`restoreDrafts`.**
  - An edit whose locale is not in the manifest is skipped. So is an edit whose `locale`+`key` already has a draft.
  - Every other edit becomes an `unsent` draft that keeps the edit's `from`, `to` and `force` and takes the manifest's `base` and `branch`.
  - It dispatches once when `added > 0`.
- **`DRAFT_STATUS_LABELS`** (spec copy): `{ unsent: 'Not sent', sent: 'Sent', live: 'Live now', conflict: 'Changed by someone else, please check' }`.
- **`DraftList` rows.** Each row shows `key · locale`, then `from` struck through, `→`, `to`, and the state badge.
  - Its button reads "Undo" for `unsent` and `conflict`.
  - It reads "Remove" for `sent`, with the title "Removes it from this list. A link you already sent still carries it."
- **`DraftList` footer.** "Download backup" and "Restore backup" (a file input with `accept=".txt,text/plain"`), with the result shown inline. "Review a change link or file" appears only when `onReviewChange` is set.
- **`ChangesPanel`.** When `drafts` is an array, it renders `DraftList` instead of the git and "This session" sections. When `drafts` is undefined, its behaviour is unchanged.
- **`useStudio.undoDraft(d)`.**
  1. Run `discard(d)`.
  2. Set `value = (lookupKey(await readBuiltLocale(d.locale), d.key) as string value) ?? d.from ?? ''`.
  3. If `d.locale === locale`, call `updateLocaleDataCache(d.key, value)` and `sendToIframe('COMMIT_PREVIEW', { key: d.key, value })`.
  4. On error, call `setError(err.message || 'Undo failed.')`.
- **`createBackup`.**
  - It takes drafts that are `unsent`, `sent` or in conflict.
  - The text is `buildShareLink(studioHref, await encodeChangeLink(buildChangeSet(...))) + '\n'`.
  - `fileName` is `changeFileName('backup', now)`.
  - With more than `MAX_CHANGE_EDITS` drafts it throws `Error('More than 500 changes: send some of them first, then download the backup.')`.
- **`restoreBackup(text)`.** It decodes with `decodeChangeLink`.
  - `NOT_FOUND` gives `'No change link found in this file.'`.
  - Any other error gives `describeLinkError(err)`.
  - Success gives `` `Restored ${added} changes (${skipped} already here).` ``.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('backs up unsent, sent and conflict drafts as a change link file'); // encode mocked → 'lc1.T'; text 'https://www.acme.com/livelocale/index.html#lc1.T\n'; fileName 'livelocale-backup-2026-10-26.txt'
  it('refuses a backup above 500 drafts'); // 501 drafts → rejects 'More than 500 changes: send some of them first, then download the backup.'
  it('restores drafts from a file and reports counts'); // real encode; restoreDrafts → {added:2,skipped:1} → 'Restored 2 changes (1 already here).'
  it('explains a file without a link'); // 'hello' → 'No change link found in this file.'
  it('restoreDrafts skips existing keys and unknown locales'); // transport test: draft ar/home.title exists; edits [ar/home.title, ar/home.greet, fr/x] → { added: 1, skipped: 2 }; new draft { status: 'unsent', base: SHA_A, branch: 'main' }; one DRAFTS_CHANGED_EVENT
  it('labels each state and offers the matching action'); // Not sent+Undo, Sent+Remove, Changed by someone else, please check+Undo
  it('passes the draft to onUndo'); // click Undo on row ar/home.title → onUndo called once with that draft
  it('shows the restore result after choosing a file'); // onRestoreBackup resolves 'Restored 1 changes (0 already here).'; upload a File in the restore input → that text is shown
  it('renders the draft list instead of git when drafts are given'); // drafts [] → queryByText('Locale files') null; getByText('Download backup')
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/share-backup.test.ts tests/unit/draft-list.test.tsx tests/unit/changes-panel.test.tsx tests/unit/studio-static-transport.test.ts`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3:** Implement, and wire `useStudio` and `app.tsx`. Pass `drafts` only when `mode === 'static'`.
- [ ] **Step 4:** Run the same command. Expected: PASS, and the existing ChangesPanel tests are unchanged.
- [ ] **Step 5:** Commit `feat(studio): list drafts with undo, backup and restore in Changes`.

---

### Task 40: Send dialog (Copy link, Download file)

**Files:**

- Create: `src/studio/features/dashboard/components/SendDialog.tsx`
- Modify: `Header.tsx`, `useStudio.ts`, `app.tsx`, `index.ts`
- Test: Create `tests/unit/send-dialog.test.tsx`

**Interfaces:**

- Consumes:
  - `selectDraftsForSend`, `buildChangeSet`, `buildShareLink`, `changeFileName`, `describeLinkError`, `readPref`, `writePref`, `copyText`, `downloadText`, `SEND_NAME_MAX_CHARS`, `SEND_NOTE_MAX_CHARS` (Task 38)
  - `encodeChangeLink`, `CHANGE_LINK_FILE_THRESHOLD` (Task 7)
  - `useDrafts().markSent` (Task 35)
- Produces:
  ```ts
  export const SendDialog: (p: {
    isOpen: boolean;
    onClose(): void;
    drafts: Draft[];
    manifest: ShareManifest | null;
    studioHref: string;
    onMarkSent(ds: readonly Draft[]): Promise<void>;
  }) => JSX.Element | null;
  // Header: canSend?: boolean; onSend?: () => void → button #studio-send-button "Send to developer" (rendered only when onSend is set)
  // useStudio returns: isSendOpen, openSend, closeSend
  ```
- **Pinned behaviour:**
  - **Fields.**
    - "Your name" (`#studio-send-name`, maxLength 80) reads and writes the `translator-name` pref.
    - "Note for the developer (optional)" (`#studio-send-note`, maxLength 500).
    - The checkbox "Also include N changes already sent" appears only when N > 0.
  - **Before/after list.** A read-only list of the included drafts, which is the spec's read-only diff before Send.
  - **Token.**
    - It is recomputed when the included drafts, the name or the note change.
    - A sequence counter discards stale async results.
    - `link = buildShareLink(studioHref, token)`.
  - **Link field.** When `link.length <= CHANGE_LINK_FILE_THRESHOLD`, a read-only `<input id="studio-send-link" data-testid="change-link">` shows the link.
  - **Copy link** (`#studio-send-copy`).
    - It is disabled while encoding, or when the link is longer than the threshold.
    - When `copyText` returns `true`, it calls `onMarkSent(included)` and shows "Link copied. Paste it to your developer in chat or email."
    - When it returns `false`, it shows "Copy did not work in this browser. Select the link above, copy it, then press “I copied it”.", with an "I copied it" button that calls `onMarkSent(included)`.
  - **Link too long.** The dialog shows "This batch is too long for a chat message. Use Download file instead."
  - **Download file** (`#studio-send-download`). It calls `downloadText(changeFileName('changes', new Date()), link + '\n')` and then `onMarkSent(included)`, and shows "File saved. Send it to your developer."
  - **Overflow.** It shows `` `${included.length} of ${included.length + overflow} changes are in this link. Send again for the rest.` ``
  - **Encode failure.** It shows `'Could not create the link: ' + describeLinkError(err)`.
  - **Header.** The Send button is enabled when `unsentCount + sentCount > 0`, and it renders only in static mode.

- [ ] **Step 1: Write the failing tests.** `encodeChangeLink` is mocked to return `'lc1.TOKEN'`, and the browser helpers are mocked.
  ```ts
  it('shows the link in a read-only field built from the Studio URL'); // change-link value 'https://www.acme.com/livelocale/index.html#lc1.TOKEN'
  it('copies the link, then marks the drafts sent'); // copyText called with the link; onMarkSent with the 2 unsent drafts
  it('passes the name and note into the change set'); // encode arg toMatchObject { by: 'Sara', note: 'Checkout page' }; writePref('translator-name','Sara')
  it('offers only Download above 6000 characters'); // encode → 'lc1.'+'A'.repeat(6000) → copy disabled; no change-link field; 'Use Download file instead'
  it('downloads the link as a file and marks the drafts sent'); // setSystemTime 2026-10-26 → downloadText('livelocale-changes-2026-10-26.txt', link + '\n')
  it('asks for confirmation when the clipboard fails'); // copyText false → 'I copied it' → onMarkSent
  it('includes already-sent changes only when asked'); // drafts 1 unsent + 2 sent → 'Also include 2 changes already sent'; unticked → encode with 1 edit; ticked → 3 edits
  it('reports the overflow above 500 changes'); // 501 unsent → '500 of 501 changes are in this link. Send again for the rest.'
  it('explains an encode failure'); // reject ChangeLinkError('TOO_LARGE') → 'Could not create the link: This change link is larger…'
  it('has no Open on GitHub action yet'); // queryByText('Open on GitHub') null (milestone B)
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/send-dialog.test.tsx`. Expected: FAIL, because the component is missing.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run the same command and `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(studio): add the Send to developer dialog`.

---

### Task 41: First-run tips and "Your name"

**Files:**

- Create: `src/studio/features/dashboard/hooks/useFirstRun.ts`, `components/FirstRunTips.tsx`
- Modify: `app.tsx`, `useStudio.ts`, `index.ts`
- Test: Create `tests/unit/first-run-tips.test.tsx`

**Interfaces:**

- Consumes: `readPref` and `writePref` (Task 38).
- Produces:
  ```ts
  export const FIRST_RUN_TIPS: readonly [string, string, string];
  export function useFirstRun(enabled: boolean): {
    showTips: boolean;
    dismiss(): void;
    name: string;
    setName(v: string): void;
  };
  export const FirstRunTips: (p: {
    open: boolean;
    name: string;
    onNameChange(v: string): void;
    onDismiss(): void;
  }) => JSX.Element | null;
  ```
- **Pinned copy:**
  - `FIRST_RUN_TIPS`:
    1. `'Hold Alt/Option and click any text.'`
    2. `'Type your fix. The page updates as you type, and your changes are kept in this browser.'`
    3. `'When you are done, press Send to developer and paste the link to your developer.'`
  - Name field (`#studio-tips-name`, maxLength 80), labelled "Your name (optional, credited in the pull request)".
  - Button: "Start editing".
- **Rules:**
  - `enabled` is `mode === 'static'`; Task 43 adds `&& !review`.
  - The tips show while `readPref('tips-seen') !== '1'`, and `dismiss` writes `'1'`.
  - The name uses the `translator-name` pref.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('shows three tips on the first visit and not after Start editing'); // no 'tips-seen' pref → the three FIRST_RUN_TIPS lines; click 'Start editing' → hidden; readPref('tips-seen') === '1'; remount → hidden
  it('stays hidden when disabled'); // useFirstRun(false) with no pref → showTips false
  it('saves the name for the Send dialog'); // type 'Sara' → readPref('translator-name') === 'Sara'
  it('can be dismissed when localStorage throws'); // hides for the session
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/first-run-tips.test.tsx`. Expected: FAIL, because the module is missing.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): show first-run tips with an optional name`.

---

### Task 42: Review rows with check results

**Files:**

- Create: `src/studio/share/review.ts`
- Test: Create `tests/unit/share-review.test.ts`

**Interfaces:**

- Consumes: `planApply`, `PlannedEdit`, `EditStatus`, `LocaleTarget`, `FLAG_MESSAGES` (Task 10); `RISK_FLAG_MESSAGES` (Task 4, tests only); `ChangeSet` (Task 6).
- Produces:

  ```ts
  export const REVIEW_STATUS_LABELS: Record<EditStatus, string>;
  // { apply: 'Ready', already: 'Already applied', conflict: 'Changed since', invalid: 'Invalid', 'needs-force': 'Saved with “Save anyway”' }
  export interface ReviewCheck {
    level: 'error' | 'warning';
    message: string;
  }
  export interface ReviewRow extends PlannedEdit {
    id: string;
    checks: ReviewCheck[];
  } // id = locale + '\u0000' + key
  export function buildReviewRows(input: {
    set: ChangeSet;
    sourceLocale: string;
    targets: ReadonlyMap<string, LocaleTarget>;
    allowForce?: boolean;
  }): ReviewRow[];
  export function reviewSummary(rows: readonly ReviewRow[]): Record<EditStatus, number>;
  ```

  Rows are `planApply({ edits: set.edits, sourceLocale, targets, allowForce: allowForce === true }).edits`, in link order, with checks attached:
  - An `invalid` row gets `{ level: 'error', message }`.
  - A `needs-force` row gets `{ level: 'warning', message: \`${message} Saved with “Save anyway”.\` }`.
  - Each flag adds the warning `{ level: 'warning', message: FLAG_MESSAGES[flag] }`. That is `'Saved with “Save anyway”.'` for `forced`, `'Adds a key the source locale does not have.'` for `new-key`, and the `RISK_FLAG_MESSAGES` text for a content flag.

- [ ] **Step 1: Write the failing tests.** The fixture targets are `en: { home: { title: 'Welcome', cta: 'Read more' }, cart: { count: 'You have {count} items' } }` (source) and `ar: { home: { title: 'مرحبا' } }`, both flat.
  ```ts
  it('marks an edit ready when the site still shows the old text'); // ar/home.title 'مرحبا' → 'أهلا' ⇒ status 'apply', label 'Ready'
  it('marks an edit already applied when the site shows the new text'); // ar/home.title from 'قديم' to 'مرحبا' ⇒ status 'already', label 'Already applied', checks []
  it('flags a conflict and shows what the site has now'); // current 'أهلا بكم' ⇒ 'conflict', row.current 'أهلا بكم'
  it('treats a new key with from null as ready'); // ar/home.cta from null, en has home.cta ⇒ 'apply', checks []; ar/home.extra (not in en) ⇒ 'apply' with warning FLAG_MESSAGES['new-key']
  it('reports a dropped placeholder as an error, or a warning with Save anyway'); // reference 'You have {count} items' → error containing '{count}'; force ⇒ 'needs-force' with warning
  it('uses the current source text as the reference for source-locale edits'); // en/home.title from 'Welcome' to 'Hi {name}' with en 'Welcome' ⇒ 'invalid', code 'PLACEHOLDER_MISMATCH' (extra {name})
  it('lists risk flags as warnings'); // to with https://evil.example ⇒ warning RISK_FLAG_MESSAGES['new-url']
  it('summarises counts per status'); // rows apply, apply, conflict ⇒ { apply: 2, already: 0, conflict: 1, invalid: 0, 'needs-force': 0 }
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/share-review.test.ts`. Expected: FAIL, because the module is missing.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): compute review rows with check results for change links`.

---

### Task 43: Review mode state (`useReview`)

**Files:**

- Create: `src/studio/features/dashboard/hooks/useReview.ts`
- Modify: `useStudio.ts`
- Test: Create `tests/unit/studio-review.test.tsx`

**Interfaces:**

- Consumes:
  - `buildReviewRows`, `ReviewRow` (Task 42)
  - `describeLinkError` (Task 38)
  - `decodeChangeLink`, `findChangeToken`, `ChangeSet`, `ChangeLinkError` (Tasks 5–7)
  - `readBuiltLocale` (Task 29)
  - `LocalesLayout` (Task 11), `LiveLocaleMode` (Task 28)
  - existing `fetchLocaleDictionary` and `ConnectionStatus`
- Produces:
  ```ts
  export type ReviewTarget = 'github' | 'local';
  export interface ReviewState {
    token: string;
    set: ChangeSet;
    rows: ReviewRow[];
    sourceLocale: string;
    target: ReviewTarget;
  }
  export function useReview(p: {
    mode: LiveLocaleMode | null;
    locale: string;
    locales: string[];
    sourceLocale: string | null;
    layout: LocalesLayout;
    readLocale: (l: string) => Promise<Record<string, unknown>>; // static: transport.readBuiltLocale; else fetchLocaleDictionary
    connectionStatus: ConnectionStatus;
    currentPath: string;
    visibleKeys: string[] | null;
    sendToIframe: (type: string, payload?: unknown) => void;
    reloadFrame: () => void;
  }): {
    review: ReviewState | null;
    error: string | null;
    isLoading: boolean;
    focusKey: string | null;
    setFocusKey(k: string | null): void;
    openReview(input: string): Promise<boolean>;
    closeReview(): void;
  };
  ```
- **Pinned rules:**
  - **Entry.**
    - On mount and on `hashchange`, when `location.hash.startsWith('#lc1.')` and `mode !== null`, call `openReview(location.hash.slice(1))`.
    - Each token opens only once.
  - **`openReview`.**
    - It decodes with `decodeChangeLink(input)`.
      - `NOT_FOUND` gives the error `'No change link found. A change link contains "lc1.".'` and returns `false`.
      - Any other error goes through `describeLinkError`.
    - `token = findChangeToken(input)`.
    - `target` is `mode === 'development' ? 'local' : 'github'`.
    - `sourceLocale` is `props.sourceLocale ?? (locales.includes(set.src) ? set.src : 'en')`.
    - It loads every edit locale plus the source locale through `readLocale`, which returns built values without drafts in static mode.
      - The layout is `props.layout` in static mode and `'flat'` otherwise.
      - A locale that fails to load becomes a `null` target.
      - If the source locale fails, the error is `` `The source locale "${sourceLocale}" could not be loaded.` ``.
    - `rows = buildReviewRows({ set, sourceLocale, targets })`.
  - **Overlay (read-only).** While a review is open and the bridge is connected, send `COMMIT_PREVIEW { key, value: row.to }` for rows with `row.locale === locale` and a status other than `invalid`. Re-run on changes to `currentPath`, `visibleKeys`, `locale` or `review`.
  - **`closeReview`.** It clears `review` and `error`. If the hash is a link, it calls `history.replaceState(null, '', location.pathname + location.search)`, which fires no hashchange. Then it calls `reloadFrame()`.
  - **`useStudio` wiring.**
    - `selectElementRef.current = review ? (el) => setFocusKey(el.key) : selectElement`, so Alt+Click is read-only during a review.
    - The draft resend effect is skipped while `review !== null`.
    - The guard becomes `useUnsentGuard(mode === 'static' && unsentCount > 0 && !review)`.
    - Tips are enabled only when `mode === 'static' && !review`.
    - `reloadFrame` sets `iframeRef.current.src = iframeRef.current.src`.

- [ ] **Step 1: Write the failing tests.** The codec, the transport and `fetch` are mocked.
  ```ts
  it('opens a review from the URL hash in static mode'); // hash '#lc1.abc' → decode called; rows 2; target 'github'; readBuiltLocale used, fetchLocaleDictionary not
  it('reports a damaged link in plain words'); // decode rejects ChangeLinkError('CORRUPT') → error === the CORRUPT copy
  it('overlays proposed values for the current locale only'); // COMMIT_PREVIEW {key:'home.title',value:'أهلا'}; nothing for the 'fr' row
  it('re-applies the overlay after navigation'); // rerender currentPath '/about' → sent again
  it('focuses a row instead of editing on Alt+Click'); // review open; ELEMENT_SELECTED for 'home.title' → focusKey 'home.title'; selectElement not called
  it('closing clears the hash and reloads the frame'); // replaceState spy called; reloadFrame called; review null
  it('reopens when the hash changes to another link'); // new HashChangeEvent('hashchange') → decode with the new token
  it('pauses the draft re-apply loop while reviewing'); // useStudio-level: valuesToReapply effect not run when review set (assert sendToIframe calls)
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-review.test.tsx`. Expected: FAIL, because the module is missing.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run the same command and `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 5:** Commit `feat(studio): open change links in a read-only Review mode`.

---

### Task 44: Review panel (table, checks and the apply command)

**Files:**

- Create: `src/studio/features/dashboard/components/ReviewPanel.tsx`
- Modify: `components/SetupProblems.tsx` (optional `title`), `Header.tsx`, `app.tsx`, `useStudio.ts`, `index.ts`
- Test: Create `tests/unit/review-panel.test.tsx`. Extend `tests/unit/studio-connection-help.test.tsx`.

**Interfaces:**

- Consumes: Tasks 42 and 43; `buildShareLink` and `copyText` (Task 38); existing `PluralEditor` (`disabled`) and `parsePluralMessage`.
- Produces:
  ```ts
  export const APPLY_COMMAND_MAX_CHARS = 8000;
  export function applyCommandFor(link: string): string; // `npx livelocale apply "${link}" --pr`, or 'npx livelocale apply --clipboard --pr' when longer than APPLY_COMMAND_MAX_CHARS
  export const ReviewPanel: (p: {
    review: ReviewState | null;
    error: string | null;
    isLoading: boolean;
    focusKey: string | null;
    onSelectLocale(l: string): void;
    onClose(): void;
    studioHref: string;
    actions?: ReactNode;
  }) => JSX.Element; // `actions` is filled by Tasks 62 and 63
  // SetupProblems: { problems: string[]; title?: string }   (default title unchanged)
  // Header: reviewCount?: number | null; onCloseReview?: () => void
  ```
- **Pinned rules:**
  - **Header while reviewing.**
    - A chip reads `Reviewing 1 proposed change` or `Reviewing N proposed changes`.
    - A "Close review" button appears.
    - The Send button and the unsent counter are hidden.
  - **Panel layout, top to bottom:**
    1. **Note box:** `From <by>: <note>`, as plain text.
    2. **Summary counts.**
    3. **`actions`** slot.
    4. **"Apply with the command line"** block.
       - It shows `applyCommandFor(buildShareLink(studioHref, token))` with a "Copy command" button.
       - When the long-link form is shown, it also has a "Copy link" button.
       - The hint is "Run it in the repository. It opens a pull request with your git and gh, on any git host."
    5. **Table** with these columns:
       - Language: a button that calls `onSelectLocale`.
       - Key.
       - Before: `from`. A conflict row also shows "Now on the site: <current>".
       - After: `to`. When `parsePluralMessage(to)` is not null, it renders through `<PluralEditor disabled locale value={to} onChange={noop}/>`.
       - Check: the status label plus the check list.
    - The `focusKey` row gets `aria-current="true"` and is scrolled into view.
  - **Error state:** `<SetupProblems title="This change link cannot be opened:" problems={[error]}/>`.
  - **`app.tsx`:** while a review or a review error exists, the side slot renders `ReviewPanel` with `sideLabel="Review"`, and the side drawer opens in the compact layout.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('shows before, after and the check result for each row'); // rows [ready ar/home.title 'مرحبا'→'أهلا', conflict with current 'سلام', invalid with error] → each <tr> shows from, to, its REVIEW_STATUS_LABELS text and check messages; the conflict row shows 'Now on the site: سلام'
  it('shows the apply command for the link'); // contains 'npx livelocale apply "https://www.acme.com/livelocale/index.html#lc1.abc" --pr'
  it('switches to the clipboard command for very long links'); // applyCommandFor(8000-char link) === 'npx livelocale apply --clipboard --pr'
  it('renders translator text as text'); // note '<img src=x onerror=alert(1)>' → container.querySelector('img') === null
  it('renders plural values read-only'); // to '{count, plural, one {# item} other {# items}}' → plural-editor inputs disabled
  it('switches the page language from a row'); // click 'ar' → onSelectLocale('ar')
  it('SetupProblems uses a custom title'); // title 'This change link cannot be opened:' → shown; no title → today's default heading
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/review-panel.test.tsx tests/unit/studio-connection-help.test.tsx`. Expected: FAIL, because the component is missing.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): add the Review panel with the apply command`.

---

### Task 45: `apply` input (link, file, stdin, clipboard)

**Files:**

- Create: `src/codemod/apply/link-input.ts`
- Test: Create `tests/unit/apply-link-input.test.ts`

**Interfaces:**

- Consumes: `findChangeToken` (Task 5, test only).
- Produces:
  ```ts
  export const MAX_APPLY_INPUT_BYTES = 1_048_576;
  export interface ApplyInputOptions {
    cwd: string;
    clipboard?: boolean;
    stdin?: NodeJS.ReadableStream;
    readClipboard?: () => Promise<string>;
  }
  /** Returns the raw text that holds the link; decodeChangeLink finds the token (fenced block first). */
  export async function readApplyInput(
    arg: string | undefined,
    options: ApplyInputOptions
  ): Promise<string>;
  export async function readClipboard(
    execFileImpl?: typeof execFile,
    platform?: NodeJS.Platform
  ): Promise<string>;
  export class ApplyInputError extends Error {}
  ```
- Rules:
  - `-` reads stdin.
  - An existing path, resolved relative to `cwd`, is read as a file.
  - Any other argument is treated as the text itself.
  - Input over `MAX_APPLY_INPUT_BYTES` throws `ApplyInputError('The input is larger than 1 MB.')`.
- With no argument and no `--clipboard`, it throws this message: `Pass the change link, a file that holds it, "-" to read stdin, or --clipboard. (cmd.exe cuts arguments at 8,191 characters; use --clipboard or a file for long links.)`
- Clipboard commands:
  - Windows: `powershell.exe -NoProfile -NonInteractive -Command "Get-Clipboard -Raw"`
  - macOS: `pbpaste`
  - Linux: try `wl-paste --no-newline`, then `xclip -selection clipboard -o`, then `xsel --clipboard --output`

- [ ] **Step 1: Write the failing tests.**
  ```ts
  const T = 'lc1.eJyrVkrLz1eyUkpKLFKqBQAm8wTN';
  it('reads a downloaded file', async () => {
    /* tmp file `https://acme.com/livelocale/index.html#${T}\r\n` */ expect(
      findChangeToken(await readApplyInput(file, { cwd }))
    ).toBe(T);
  });
  it('passes literal text through', async () =>
    expect(await readApplyInput(`#${T}`, { cwd })).toBe(`#${T}`));
  it('reads stdin for "-"', async () =>
    expect(await readApplyInput('-', { cwd, stdin: Readable.from([`${T}\n`]) })).toBe(`${T}\n`));
  it('reads the clipboard', async () =>
    expect(
      await readApplyInput(undefined, {
        cwd,
        clipboard: true,
        readClipboard: async () => `${T}\r\n`,
      })
    ).toBe(`${T}\r\n`));
  it('rejects input over 1 MB', async () =>
    await expect(
      readApplyInput('-', { cwd, stdin: Readable.from(['x'.repeat(1_048_577)]) })
    ).rejects.toThrow(/larger than 1 MB/));
  it('explains the cmd.exe limit when no input is given', async () =>
    await expect(readApplyInput(undefined, { cwd })).rejects.toThrow(/"-".*--clipboard.*8,191/s));
  it('falls back from wl-paste to xclip to xsel on Linux', async () => {
    // execFileImpl rejects ENOENT for wl-paste and xclip
    expect(await readClipboard(fakeExec, 'linux')).toBe(T);
    expect(fakeExec).toHaveBeenLastCalledWith(
      'xsel',
      ['--clipboard', '--output'],
      expect.anything(),
      expect.any(Function)
    );
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-link-input.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(apply): read change links from arguments, files, stdin and the clipboard`.

---

### Task 46: Apply reports (PR body, commit message, terminal summary)

**Files:**

- Create: `src/codemod/apply/report.ts`
- Test: Create `tests/unit/apply-report.test.ts`

**Interfaces:**

- Consumes: `ApplyPlan`, `PlannedEdit`, `FLAG_MESSAGES` (Task 10); `CheckReport` (existing, `src/codemod/check.ts`).
- Produces. Local `--pr` uses these in Tasks 47 and 48; Task 54 extends them for GitHub issues and the Action (Task 57) reuses `summarizeCheck`.
  ```ts
  export function codeSpan(text: string, maxLength?: number /* 120 */): string;
  export function summarizeCheck(
    report: CheckReport,
    edited: Array<[locale: string, key: string]>
  ): string;
  export function sanitizeName(name: string | undefined): string | undefined; // strips control chars, \r\n→' ', removes @ # < >, max 64 chars; undefined when empty
  export interface TargetInfo {
    branch: string;
    isDefault: boolean;
    requested?: string;
    reason: 'link' | 'default' | 'not-allowed' | 'local';
  }
  export interface ReportContext {
    plan: ApplyPlan;
    by?: string;
    note?: string;
    target: TargetInfo;
    issueNumber?: number;
    checkSummary?: string;
    runUrl?: string;
  }
  export function renderChangesTable(plan: ApplyPlan, limit?: number /* 100 rows */): string;
  export function renderPullRequestBody(ctx: ReportContext): string; // <= 60_000 chars
  export function renderCommitMessage(input: {
    plan: ApplyPlan;
    by?: string;
    issueNumber?: number;
    runId?: string;
  }): string;
  export function renderTerminalSummary(plan: ApplyPlan): string; // never contains values
  ```
- **Code spans.** All translator text (values, `by`, check messages) goes in code spans.
  - The fence is one backtick longer than the longest backtick run inside. It is padded with spaces when the content starts or ends with `` ` `` or a space.
  - `|` becomes `\|`.
  - `\r?\n` becomes `⏎`.
  - U+202A–E and U+2066–9 become `⟨U+202E⟩`, using each character's own code.
  - Text past the limit is truncated with `…`.
- **Translator credit.** When `by` is non-empty, the body has the line `` `Translated by ${codeSpan(by)}` `` (spec §2 step 2), so a name such as `@octocat` or `see #12` never pings or links.
- **`note`.** It renders in a fenced block, capped at 2,000 characters. The fence is a run of backticks of length `max(3, longest backtick run in the note + 1)`, followed by `text`, and the same run closes it. A note that contains ` ``` ` therefore cannot close the fence early.
- **Table.**
  - Header: `| Status | Locale | Key | Before | After | Checks |`.
  - Status labels: `applied`, `already done`, `conflict`, `needs --force`, `rejected`.
  - A conflict row shows `now: <current>` in the After cell.
  - The Checks cell lists `FLAG_MESSAGES[flag]` for each of the edit's `flags`, then the edit's `message` for `invalid` and `needs-force` rows, joined with `; `. Flag messages are LiveLocale's own copy, so they are plain text; `message` goes through `codeSpan`. This is where the PR reviewer, the trust boundary, sees `forced`, `new-key`, `markup`, `javascript-url`, `new-url` and `bidi-control` (spec §5).
  - Rows beyond the limit become `…and N more`.
- **Check summary** (`summarizeCheck`, shared by local `--pr` and the Action):
  - With no problems in the edited keys: ``✅ `livelocale check`: no problems in the changed keys.``
  - With problems: ``⚠ `livelocale check` found <n> problem(s) in the changed keys:``, then one line per issue in code spans, then `(<m> other problem(s) already in the repository are not shown.)`.
  - `renderPullRequestBody` appends `ctx.checkSummary` after the table when it is set.
- **Closing line.**
  - With an issue and a default-branch target: `Closes #<n>`.
  - With an issue and any other target: `Refs #<n>. LiveLocale closes the issue when this pull request is merged or closed.`
  - Without an issue: nothing.
- **Target note** (reason `not-allowed`): ``The link was made from `<requested>`, which is not in the allowed branches, so this targets `<branch>`.`` Both names go through `codeSpan`, because the requested branch comes from the link.
- **Commit message.**
  - First line: `i18n: apply LiveLocale changes`, followed by ` (#<n>)` or ` (run <id>)` when available.
  - Then a blank line and `<k> translation(s) in <sorted locales joined ", ">.`
  - When `sanitizeName(by)` is set: a blank line and `Translated-by: <name>`.
- **Terminal summary line:** `Applied <a> · already done <b> · conflicts <c> · needs --force <d> · rejected <e>`, followed by one `<status> <locale> <key>` line per edit.

- [ ] **Step 1: Write the failing tests.** Fixtures at the top of `apply-report.test.ts`:
  - `planWith(over)`: a one-edit `ApplyPlan` whose edit is `{ locale: 'ar', key: 'home.title', from: 'أهلا', to: 'مرحبا', force: false, status: 'apply', flags: [], ...over }`, with `counts` computed from it.
  - `twoEdits`: two `apply` edits, `ar/home.title` and `es/home.title`. `mixed`: two `apply`, one `already`, one `conflict` and one `invalid` edit, every value non-ASCII.
  - `bigPlan(n, value)`: `n` `apply` edits `ar/k<i>` whose `from` and `to` are `value`.
  - `ctx(over)`: `{ plan: twoEdits, target: { branch: 'main', isDefault: true, reason: 'local' }, ...over }`.
  - `reportWith2Issues`: a `CheckReport` with two `placeholder-mismatch` issues, on `ar`/`home.greet` and `ar`/`home.other`. `cleanReport`: the same report with `issues: []`.
  `````ts
  expect(codeSpan('a|b')).toBe('`a\\|b`');
  expect(codeSpan('`tick')).toBe('`` `tick ``');
  expect(codeSpan('l1\nl2')).toBe('`l1⏎l2`');
  expect(codeSpan('abc\u202Edef')).toBe('`abc⟨U+202E⟩def`');
  expect(codeSpan('a'.repeat(300)).endsWith('…`')).toBe(true);
  expect(
    renderPullRequestBody(
      ctx({ issueNumber: 7, target: { branch: 'main', isDefault: true, reason: 'link' } })
    )
  ).toContain('Closes #7');
  const nd = renderPullRequestBody(
    ctx({ issueNumber: 7, target: { branch: 'staging', isDefault: false, reason: 'link' } })
  );
  expect(nd).toContain('Refs #7');
  expect(nd).not.toContain('Closes #7');
  expect(
    renderPullRequestBody(ctx({ target: { branch: 'main', isDefault: true, reason: 'local' } }))
  ).not.toMatch(/Closes|Refs/);
  expect(renderPullRequestBody(ctx({ by: '@octocat' }))).not.toMatch(/(^|[^`])@octocat/m);
  expect(renderPullRequestBody(ctx({ by: '@octocat' }))).toContain('Translated by `@octocat`');
  expect(renderPullRequestBody(ctx({ by: 'see #12' }))).toContain('`see #12`');
  // outsideFences(md) drops every fenced block: from a line opening with N >= 3 backticks to the next line of exactly N backticks
  const outsideFences = (md: string) => md.replace(/^(`{3,})[^\n`]*\n[\s\S]*?^\1[ \t]*$/gm, '');
  const fenced = renderPullRequestBody(ctx({ by: 'Mona', note: '```\n@octocat fixes #1\n```' }));
  expect(fenced).toContain('````text\n```\n@octocat fixes #1\n```\n````');
  expect(outsideFences(fenced)).not.toContain('@octocat');
  expect(outsideFences(fenced)).not.toContain('fixes #1');
  const flagged = renderChangesTable(planWith({ status: 'apply', flags: ['forced', 'new-url'] }));
  expect(flagged.split('\n')[0]).toBe('| Status | Locale | Key | Before | After | Checks |');
  expect(flagged).toContain(FLAG_MESSAGES.forced);
  expect(flagged).toContain(FLAG_MESSAGES['new-url']);
  expect(
    renderPullRequestBody(
      ctx({
        target: { branch: 'main', isDefault: true, requested: 'staging', reason: 'not-allowed' },
      })
    )
  ).toContain(
    'The link was made from `staging`, which is not in the allowed branches, so this targets `main`.'
  );
  expect(
    renderPullRequestBody(
      ctx({ checkSummary: '✅ `livelocale check`: no problems in the changed keys.' })
    )
  ).toContain('`livelocale check`');
  expect(summarizeCheck(reportWith2Issues, [['ar', 'home.greet']])).toMatch(
    /found 1 problem\(s\).*1 other problem\(s\)/s
  ); // one issue on ar/home.greet, one on ar/home.other
  expect(summarizeCheck(cleanReport, [['ar', 'home.greet']])).toBe(
    '✅ `livelocale check`: no problems in the changed keys.'
  );
  expect(
    renderPullRequestBody(ctx({ plan: bigPlan(500, 'x`|'.repeat(3334)) })).length
  ).toBeLessThanOrEqual(60_000);
  expect(
    renderCommitMessage({ plan: twoEdits, issueNumber: 7, by: 'Mona\nCo-authored-by: Eve <e@x>' })
  ).toBe(
    'i18n: apply LiveLocale changes (#7)\n\n2 translation(s) in ar, es.\n\nTranslated-by: Mona Co-authored-by: Eve ex'
  );
  expect(renderCommitMessage({ plan: twoEdits })).toBe(
    'i18n: apply LiveLocale changes\n\n2 translation(s) in ar, es.'
  );
  const s = renderTerminalSummary(mixed);
  expect(s).toContain('Applied 2 · already done 1 · conflicts 1 · needs --force 0 · rejected 1');
  for (const e of mixed.edits) {
    expect(s).not.toContain(e.to);
    if (e.from) expect(s).not.toContain(e.from);
  }
  `````
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-report.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(apply): render escaped pull request bodies, commit messages and summaries`.

---

### Task 47: `livelocale apply` into the working tree, plus CLI wiring

**Files:**

- Create: `src/codemod/apply/local.ts` and `src/codemod/apply/cli.ts`.
- Modify: `src/codemod/index.ts`: add `apply` to `COMMANDS`, plus its help text and dispatch.
- Modify: `README.md`: add `### apply` to the CLI Reference.
- Modify: `ARCHITECTURE.md`: add one line for `apply` in §9.
- Modify: `tests/integration/cli-package.test.ts`.
- Test: Create `tests/unit/apply-local.test.ts` and `tests/unit/apply-cli.test.ts`.

**Interfaces:**

- Consumes:
  - `decodeChangeLink`, `ChangeLinkError` (Task 7)
  - `nodeInflate` (Task 8)
  - `FileMutator({ requireEnabled: false })` (Task 9)
  - `planApply`, `ApplyPlan`, `LocaleTarget` (Task 10)
  - `readApplyInput`, `ApplyInputError` (Task 45)
  - `renderTerminalSummary` (Task 46)
  - `encodeChangeLink` (Task 7, tests only)
- Produces:
  ```ts
  // local.ts
  export type GitExec = (
    args: string[],
    cwd: string,
    opts?: { inherit?: boolean }
  ) => Promise<string>; // throws on non-zero exit
  export type GhExec = (args: string[], cwd: string) => Promise<string>;
  export interface LocalApplyOptions {
    projectDir: string;
    localesPath?: string /* 'locales' */;
    sourceLocale?: string /* 'en' if present, else first */;
    input: string; // text that holds the link (from readApplyInput)
    force?: boolean;
    dryRun?: boolean;
    pr?: boolean;
    log?: (line: string) => void;
    exec?: { git?: GitExec; gh?: GhExec }; // used by Task 48
    now?: () => Date; // used by Task 48 for the branch name; default () => new Date()
  }
  export interface LocalApplyResult {
    plan: ApplyPlan;
    written: string[];
    branch?: string;
    prUrl?: string;
    exitCode: 0 | 1;
  }
  export async function runLocalApply(options: LocalApplyOptions): Promise<LocalApplyResult>;
  // cli.ts
  export interface ApplyArgs {
    input?: string;
    clipboard: boolean;
    pr: boolean;
    force: boolean;
    dryRun: boolean;
    dir: string;
    locales?: string;
    source?: string;
  }
  export function parseApplyArgs(argv: string[]): ApplyArgs; // argv excludes 'apply'; throws ApplyInputError on bad combinations
  export async function runApplyCommand(argv: string[]): Promise<void>; // sets process.exitCode
  ```
- **Behaviour:**
  - Decode with `decodeChangeLink(input, nodeInflate)`. A `ChangeLinkError` prints `❌ <message>` and exits 1.
  - Targets cover every edit locale plus the source locale.
    - The layout is `namespaced` if `<locales>/<locale>/` is a directory.
    - The dictionary comes from `new FileMutator({ requireEnabled: false }).readLocale`.
    - A missing locale gives `null`.
  - `planApply` runs with `allowForce: force === true`, because the local developer is the maintainer.
  - Writes go through `updateLocaleKey` for each `apply` edit, unless `dryRun` is set.
  - When `set.src` differs from the source locale, it warns: ``The link says the source locale is `<src>`; using `<source>` (pass --source to change).``
  - Output is `renderTerminalSummary` only, and never shows values.
  - `exitCode` is 1 when `conflict + invalid + needs-force > 0`.
  - `parseApplyArgs` rejects passing both `--clipboard` and a positional input, with `Pass the link or --clipboard, not both.`

- [ ] **Step 1: Write the failing tests.**
  - `apply-local.test.ts`:
    - The temp project has `locales/en.json` (2-space indent) and `locales/ar.json` (tab-indented, no trailing newline).
    - The link is `encodeChangeLink({ branch: '', base: '', src: 'en', by: 'Mona', note: '', edits: [{ locale: 'ar', key: 'home.title', from: 'أهلا', to: 'مرحبًا', force: false }, { locale: 'ar', key: 'home.greet', from: 'مرحبا {name}', to: 'مرحبا', force: false }] })`.
    - `const logs: string[] = []; const log = (l: string) => logs.push(l);`

  ```ts
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', 'preview');
  const r = await runLocalApply({
    projectDir,
    input: `https://acme.com/livelocale/index.html#${token}`,
    log,
  });
  expect(r.plan.counts).toMatchObject({ apply: 1, invalid: 1 });
  expect(r.exitCode).toBe(1);
  const ar = fs.readFileSync(arFile, 'utf-8');
  expect(JSON.parse(ar).home.title).toBe('مرحبًا');
  expect(ar).toMatch(/^\t"home"/m);
  expect(ar.endsWith('\n')).toBe(false);
  expect(fs.readFileSync(enFile, 'utf-8')).toBe(enBefore);
  expect(logs.join('\n')).not.toContain('مرحبًا');
  expect((await runLocalApply({ projectDir, input: token, dryRun: true })).written).toEqual([]);
  // namespaced: locales/ar/home.json { "title": "أهلا" } → updated in place
  ```

  - `apply-cli.test.ts`:

  ```ts
  expect(parseApplyArgs(['-', '--pr'])).toMatchObject({ input: '-', pr: true });
  expect(
    parseApplyArgs([
      'link',
      '--dir',
      'app',
      '--locales',
      'src/locales',
      '--source',
      'en',
      '--force',
      '--dry-run',
    ])
  ).toMatchObject({ dir: 'app', locales: 'src/locales', source: 'en', force: true, dryRun: true });
  expect(() => parseApplyArgs(['x', '--clipboard'])).toThrow(
    'Pass the link or --clipboard, not both.'
  );
  expect(() => parseApplyArgs(['--bogus'])).toThrow('Unknown option "--bogus".');
  ```

  - The packaged CLI test adds `it('should run apply with a change-link file')`. It writes the link to `changes.txt` and runs `apply changes.txt --source en`. Expect status 0, stdout containing `Applied 1`, and `ar.json` updated.

- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-local.test.ts tests/unit/apply-cli.test.ts`. Expected: FAIL, because the modules are not found.
- [ ] **Step 3: Implement** `local.ts` (without `--pr`) and `cli.ts`, then wire `index.ts`.
  - Help line: `apply       Apply a LiveLocale change link to your locale files (--pr opens a pull request)`, followed by its options.
  - README `### apply` documents:
    - the link, file, `-` and `--clipboard` inputs;
    - the cmd.exe 8,191-character note;
    - `--dry-run` and `--force`;
    - the exit codes.
- [ ] **Step 4:** Run `npx vitest run tests/unit/apply-local.test.ts tests/unit/apply-cli.test.ts`, then `npm run build && npx vitest run tests/integration/cli-package.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(cli): add livelocale apply for change links`.

---

### Task 48: `apply --pr` with the developer's git and gh (any host)

**Files:**

- Modify: `src/codemod/apply/local.ts`
- Test: Create `tests/unit/apply-pr.test.ts`

**Interfaces:**

- Consumes:
  - `GitClient.status(localesPath)` and `GitClient.commit(localesPath, message)` (existing). Both resolve a relative path against `process.cwd()`, so they always get the absolute `localesDir = path.resolve(projectDir, localesPath)`.
  - `renderCommitMessage`, `renderPullRequestBody`, `summarizeCheck` (Task 46)
  - `runCheck` (existing, `src/codemod/check.ts`)
  - `GitExec`, `GhExec`, `LocalApplyOptions.now` (Task 47)
- Produces: the `pr: true` path of `runLocalApply`. The default runners use `execFile` with `windowsHide: true`.
- **Fixed sequence:**
  1. Resolve the repository root.
  2. Read the current branch. A detached `HEAD` is an error: `Check out a branch first.`
  3. Refuse when `GitClient.status(localesDir).changes.length > 0`, with the error `Commit or stash the changes under <rel> first; apply --pr commits everything in that folder.`
  4. Plan the edits. With 0 `apply` results, print the summary and return without creating a branch.
  5. Pick the branch name `livelocale/apply-<YYYYMMDD-HHmmss>` from `now()` in UTC. While `git rev-parse --verify --quiet refs/heads/<name>` succeeds or `git ls-remote --heads origin <name>` prints a line, append `-2`, then `-3`, and so on. Then run `git switch -c <name>`.
  6. Write the edits through FileMutator.
  7. Run `runCheck({ projectDir, localesPath: localesDir, sourceLocale, unused: false })` and `checkSummary = summarizeCheck(report, applied edits as [locale, key])`. If the check throws, `checkSummary` is `Check could not run: <message>`, as on the Action (spec §4.6: the local CLI does the same).
  8. Commit with `GitClient.commit(localesDir, renderCommitMessage({ plan, by: set.by }))`.
  9. Run `git push -u origin <branch>` with stdio inherited, so remote messages such as GitLab's merge-request link reach the user.
  10. Open the PR when `git remote get-url origin` matches `/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/`.
  - Write `renderPullRequestBody({ plan, by, note, checkSummary, target: { branch: original, isDefault: false, reason: 'local' } })` to a temp file.
  - Run `gh pr create --base <original> --head <branch> --title "i18n: LiveLocale changes" --body-file <tmp>`.
  - On `ENOENT`, or with a remote that is not GitHub, log `Pushed <branch>. Open a pull/merge request from it into <original>.`, plus the GitHub compare URL when it is known.
  11. Run `git switch <original>`.
- On any failure after step 5, log `You are on <branch>; your changes are committed there.`
- When `set.branch` is non-empty and differs from the original branch, warn about it.

- [ ] **Step 1: Write the failing tests.** Use real git in a temp directory. `main` holds `locales/en.json` and `locales/ar.json`, a bare `origin.git` is added, and `main` is pushed. Every call passes `log: (l) => logs.push(l)` and `now: () => new Date('2026-10-26T10:00:00Z')`, so back-to-back runs share one timestamp. Helpers: `git(repo, ...args)` is `execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim()`; `arFile` is `<repo>/locales/ar.json`; `token` changes `ar/home.title` from main's value; `alreadyDoneToken` sets `ar/home.title` to main's current value.
  ```ts
  const r = await runLocalApply({
    projectDir: repo,
    input: token,
    pr: true,
    log,
    now,
    exec: {
      gh: async () => {
        throw Object.assign(new Error('x'), { code: 'ENOENT' });
      },
    },
  });
  const branch = r.branch!;
  expect(branch).toBe('livelocale/apply-20261026-100000');
  expect(git(repo, 'ls-remote', '--heads', 'origin')).toContain(`refs/heads/${branch}`);
  expect(git(repo, 'log', '-1', '--format=%B', branch)).toContain('Translated-by: Mona');
  expect(git(repo, 'show', '--name-only', '--format=', branch).trim()).toBe('locales/ar.json');
  expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
  expect(git(repo, 'status', '--porcelain')).toBe('');
  expect(logs.join('\n')).toContain(`Pushed ${branch}`);
  // GitHub remote: fetch URL https://github.com/acme/site.git, pushurl = bare repo
  const bodies: string[] = [];
  const gh = vi.fn(async (args: string[]) => {
    bodies.push(fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf-8'));
    return 'https://github.com/acme/site/pull/5\n';
  });
  const r2 = await runLocalApply({
    projectDir: repo,
    input: token,
    pr: true,
    log,
    now,
    exec: { gh },
  });
  expect(r2.prUrl).toBe('https://github.com/acme/site/pull/5');
  expect(r2.branch).toBe('livelocale/apply-20261026-100000-2'); // the first name exists locally and on origin
  expect(gh.mock.calls[0][0].slice(0, 8)).toEqual([
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    'livelocale/apply-20261026-100000-2',
    '--title',
    'i18n: LiveLocale changes',
  ]);
  expect(bodies[0]).toContain('`livelocale check`');
  fs.writeFileSync(arFile, '{}');
  await expect(
    runLocalApply({ projectDir: repo, input: token, pr: true, log, now })
  ).rejects.toThrow(/Commit or stash/);
  git(repo, 'checkout', '--', 'locales/ar.json');
  expect(
    (await runLocalApply({ projectDir: repo, input: alreadyDoneToken, pr: true, log, now })).branch
  ).toBeUndefined();
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-pr.test.ts`. Expected: FAIL, because `branch` is undefined.
- [ ] **Step 3:** Implement the sequence.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(apply): open a pull request with the developer's git and gh`.

---

### Task 49: doctor share probes

**Files:**

- Modify: `src/codemod/doctor.ts`.
- Modify: `src/codemod/index.ts`: `--app` now accepts a path, add a new `--share` flag, and print the share link.
- Modify: `README.md`: `### doctor`.
- Test: Extend `tests/unit/doctor.test.ts`.

**Interfaces:**

- Consumes:
  - `SHARE_DIR`, `SHARE_MANIFEST_FILE`, `SHARE_FLAG_FILE`, `isShareManifest` (Task 11)
  - `FLAG_SCRIPT_SIGNATURE` (Task 12)
  - the existing Studio title `LiveLocale · Studio` and `loginWall`
- Produces:
  - `DoctorOptions` gains two options:
    - `appBase?: string`: an absolute URL ending in `/`. It defaults to `appOrigin + '/'`.
    - `share?: boolean`.
  - `export function shareLinkFor(appBase: string): string` returns `${appBase}livelocale/index.html`.
  - `export function normalizeAppUrl(value: string): { origin: string; base: string }` drops a trailing `index.html` and adds a trailing `/`.
- **Share mode.**
  - The share probes run when `share` is true, or when `GET <base>livelocale/manifest.json` answers 200 with JSON.
  - In share mode, doctor skips the `Mutation API` probe and the cross-origin finding `Studio can embed the app`.
  - `loginWall` applies to every share probe.
- **Findings, by exact title:**
  - **`Share Studio page`.** It must answer 200 with the Studio title. If the body equals the app root's body, it fails with: `The host answered livelocale/index.html with your app's page (SPA fallback or service worker). Upload the livelocale/ folder from your build output.`
  - **`Share manifest`.**
    - It is ok when `isShareManifest` passes. The detail is `<n> locale(s), source <s>, built from <branch ?? 'an unknown branch'> @ <base?.slice(0,7) ?? 'an unknown commit'>`.
    - A 404 fails with `… did the build run with share: true or livelocale pack?`.
  - **`Share flag script`.**
    - `flag.js` must answer 200 with a JavaScript content type, and its body must start with `FLAG_SCRIPT_SIGNATURE`.
    - The first element in `<head>` of `<base>` must be a `<script>` without `async` whose src resolves to `<base>livelocale/flag.js`.
    - Otherwise it fails, and the detail contains `first`.
  - **`Share frame headers`.** It checks both pages. `X-Frame-Options: DENY`, `frame-ancestors 'none'`, or a `frame-ancestors` list without `'self'` fails. `SAMEORIGIN` is ok.
  - **`Share CSP`.** It warns when `script-src` is present without `'self'`. Without `script-src`, it applies the same check to `default-src`.
  - **`Service worker`.**
    - It warns when the worker contains `createHandlerBoundToURL` or `navigateFallback` but not `livelocale`.
    - That applies when the app HTML registers a worker, or when `/sw.js` or `/service-worker.js` exists.
    - The detail includes `navigateFallbackDenylist: [/^\/livelocale\//]`.
  - **`Share link`.** It is ok, with `shareLinkFor(base)` as the detail.
- **Static findings.**
  - `Mutation route handler` becomes ok, with `not needed for the share link (static build)`, when either:
    - the Vite config calls `liveLocaleVite(` with `share`; or
    - the `package.json` scripts contain `livelocale pack` or `livelocale build`.
  - A new static `Service worker config` warning fires for `VitePWA(` or `workbox-webpack-plugin` when there is no `livelocale`. Its title differs from the live `Service worker` probe, so `byTitle` never confuses the two.

- [ ] **Step 1: Write the failing tests.** The fake site at `https://acme.test/` uses a fetch mock keyed by URL.
  ```ts
  const f = await runDoctor({
    projectDir,
    appOrigin: 'https://acme.test',
    fetchImpl: site(healthy),
  });
  expect(hasFailures(f)).toBe(false);
  expect(byTitle(f, 'Mutation API')).toBeUndefined();
  expect(byTitle(f, 'Share link')?.detail).toBe('https://acme.test/livelocale/index.html');
  expect(
    byTitle(
      await doc(withHeader('/livelocale/index.html', 'x-frame-options', 'DENY')),
      'Share frame headers'
    )?.level
  ).toBe('fail');
  expect(
    byTitle(
      await doc(withHeader('/livelocale/index.html', 'x-frame-options', 'SAMEORIGIN')),
      'Share frame headers'
    )?.level
  ).toBe('ok');
  expect(
    byTitle(
      await doc(withHeader('/', 'content-security-policy', "frame-ancestors 'none'")),
      'Share frame headers'
    )?.level
  ).toBe('fail');
  expect(
    byTitle(
      await doc(withHeader('/', 'content-security-policy', 'script-src https://cdn.x')),
      'Share CSP'
    )?.level
  ).toBe('warn');
  expect(byTitle(await doc(spaFallback), 'Share Studio page')?.detail).toContain("app's page");
  expect(byTitle(await doc(flagNotFirst), 'Share flag script')?.detail).toMatch(/first/);
  expect(
    byTitle(await doc(flagNotOurs /* 200 HTML at flag.js */), 'Share flag script')?.level
  ).toBe('fail');
  const gp = await runDoctor({
    projectDir,
    appOrigin: 'https://user.github.io',
    appBase: 'https://user.github.io/repo/',
    fetchImpl: site(pagesSite),
  });
  expect(byTitle(gp, 'Share link')?.detail).toBe(
    'https://user.github.io/repo/livelocale/index.html'
  );
  expect(byTitle(await doc(workboxShell), 'Service worker')?.detail).toContain(
    'navigateFallbackDenylist: [/^\\/livelocale\\//]'
  );
  expect(
    byTitle(
      await runDoctor({
        projectDir: vitePwaProject /* vite.config.ts calls VitePWA( without livelocale */,
      }),
      'Service worker config'
    )?.level
  ).toBe('warn');
  expect(byTitle(await doc(vercelWall), 'Share manifest')?.detail).toMatch(/Vercel/);
  expect(
    byTitle(
      await runDoctor({
        projectDir,
        appOrigin: 'https://acme.test',
        share: true,
        fetchImpl: site(noManifest),
      }),
      'Share manifest'
    )?.level
  ).toBe('fail');
  expect(
    byTitle(await runDoctor({ projectDir: viteShareProject }), 'route handler')?.detail
  ).toContain('not needed');
  expect(normalizeAppUrl('https://user.github.io/repo/index.html')).toEqual({
    origin: 'https://user.github.io',
    base: 'https://user.github.io/repo/',
  });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/doctor.test.ts`. Expected: FAIL on the new tests, while the existing tests still pass.
- [ ] **Step 3: Implement** the probes. In the CLI:
  - `--app` goes through `normalizeAppUrl`;
  - `--share` is added;
  - on success it prints `🔗 Share link: <url>`.
    Update README `### doctor` to cover `--share`, a path inside `--app`, and the denylist line.
- [ ] **Step 4:** Run `npx vitest run tests/unit/doctor.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(doctor): probe static share builds and print the share link`.

---

### Task 50: Static Vite playground and the share-link E2E

**Files:**

- Create the `playground-vite/` project:
  - `package.json`: depends on `"livelocale": "file:.."`, react/react-dom `^18.3.1`, vite `^8.0.14` and `@vitejs/plugin-react` `^5.2.0`. Its `build` script is `vite build`.
  - `package-lock.json`.
  - `vite.config.ts`: `liveLocaleVite({ localesPath: './locales', share: true })`, with both pages as rollup inputs.
  - `index.html` and `about/index.html`.
  - `src/main.tsx`:
    - imports `livelocale/client`;
    - reads the locale from `?locale=` (default `en`) and renders `home.title` in `<h1>` and `home.greet` through `wrapTranslationEngine`;
    - has the links `<a id="lang-ar" href="?locale=ar">` and `<a id="to-about" href="/about/">`.
  - `locales/en.json`: `{"home":{"title":"Welcome to the static playground","greet":"Hello, {name}!"}}`
  - `locales/ar.json`: `{"home":{"title":"مرحبا بكم في الملعب الثابت","greet":"أهلا، {name}!"}}`
- Create: `tests/e2e/fixtures/static-server.mjs`, `tests/e2e/static-share.spec.ts`
- Modify: `playwright.config.ts`, `.github/workflows/ci.yml`, `.gitignore` (add `/playground-vite/node_modules/` and `/playground-vite/dist/`)

**Interfaces:**

- Consumes everything in Tasks 1–49. In particular:
  - the selectors `#studio-send-button`, `#studio-send-copy` and `[data-testid="change-link"]`;
  - `unsent-counter`;
  - `#studio-tips-name`;
  - the header copy `Editing: ar`;
  - `Reviewing 1 proposed change`;
  - the existing `#studio-translation-input`, `#studio-save-button`, `[data-testid="save-success"]`, `[data-testid="slow-connection-help"]` and the `ACTIVE` badge;
  - the `STATIC_MANIFEST_MISSING` copy and `isAppPreviewBlocked` (Tasks 27, 32);
  - `encodeChangeLink` (Task 7, in Node);
  - `dist/codemod/index.js apply` (Task 47).
- Produces:
  - **`node tests/e2e/fixtures/static-server.mjs <root> <port>`**, a zero-dependency static server. It:
    - serves `index.html` for directories;
    - falls back to `/index.html` for unknown paths without an extension (an SPA fallback);
    - sends `X-Frame-Options: SAMEORIGIN` on every response;
    - rejects path escapes.
  - **A Playwright `webServer` entry:** `{ command: 'npm run build --prefix playground-vite && node tests/e2e/fixtures/static-server.mjs playground-vite/dist 3020', port: 3020, reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'pipe' }`.
  - **CI:** an `npm ci --prefix playground-vite` step after the playground install.
  - **Spec helpers:**
    - `STATIC = 'http://localhost:3020'`;
    - `openStudio(page)`, which opens `${STATIC}/livelocale/index.html`, fills `#studio-tips-name` when the tips appear, clicks "Start editing", and waits for `ACTIVE`;
    - `readDrafts(page)`, which reads every row of IndexedDB `livelocale-drafts`/`drafts` through `page.evaluate`.

- [ ] **Step 1: Write the failing E2E** `tests/e2e/static-share.spec.ts`.
  ```ts
  test('visitors who are not framed get no watermarks', async ({ page }) => {
    await page.goto(`${STATIC}/`);
    expect(await page.evaluate(() => /[\u200B-\u200D]/.test(document.body.innerText))).toBe(false);
    expect(await page.evaluate(() => (window as any).__LIVELOCALE_FLAG__)).toBeUndefined();
    expect(await page.locator('[data-i18n-key]').count()).toBe(0);
  });
  test('Alt+Click keeps working after a full-page navigation inside the frame', async ({
    page,
  }) => {
    await openStudio(page);
    const frame = page.frameLocator('#app-preview-iframe');
    await frame.locator('#to-about').click();
    await frame.locator('[data-i18n-key="home.title"]').click({ modifiers: ['Alt'] });
    await expect(page.locator('#studio-translation-input')).toBeVisible();
  });
  test('detects Arabic from the page and keeps the fix across reloads', async ({ page }) => {
    await openStudio(page);
    const frame = page.frameLocator('#app-preview-iframe');
    await frame.locator('#lang-ar').click();
    await expect(page.getByText('Editing: ar')).toBeVisible();
    await frame.locator('[data-i18n-key="home.title"]').click({ modifiers: ['Alt'] });
    await page.locator('#studio-translation-input').fill('أهلاً');
    await page.keyboard.press('Control+Enter');
    await expect(frame.locator('[data-i18n-key="home.title"]')).toHaveText('أهلاً');
    await page.reload();
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await frame.locator('#lang-ar').click();
    await expect(frame.locator('[data-i18n-key="home.title"]')).toHaveText('أهلاً', {
      timeout: 30_000,
    });
    expect(await readDrafts(page)).toEqual([
      expect.objectContaining({ locale: 'ar', key: 'home.title', status: 'unsent' }),
    ]);
  });
  test('translator sends a link that apply turns into the JSON diff', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openStudio(page);
    const frame = page.frameLocator('#app-preview-iframe');
    await frame.locator('[data-i18n-key="home.title"]').click({ modifiers: ['Alt'] });
    await page.locator('#studio-translation-input').fill('Welcome to the share link');
    await page.locator('#studio-save-button').click();
    await expect(page.locator('[data-testid="save-success"]')).toBeVisible();
    await expect(page.getByTestId('unsent-counter')).toHaveText('1 change not sent');
    await page.reload();
    await expect(frame.locator('[data-i18n-key="home.title"]')).toHaveText(
      'Welcome to the share link',
      { timeout: 30_000 }
    );
    await page.locator('#studio-send-button').click();
    await expect(page.getByText('Open on GitHub')).toHaveCount(0);
    await page.locator('#studio-send-note').fill('Header copy');
    const link = await page.getByTestId('change-link').inputValue();
    expect(link).toMatch(/^http:\/\/localhost:3020\/livelocale\/index\.html#lc1\.[A-Za-z0-9_-]+$/);
    expect(link.length).toBeLessThan(6000);
    await page.locator('#studio-send-copy').click();
    await expect(page.getByTestId('unsent-counter')).toHaveCount(0);
    const tmp = copyLocalesToTmp('playground-vite/locales');
    const r = spawnSync(
      process.execPath,
      [
        'dist/codemod/index.js',
        'apply',
        link,
        '--dir',
        tmp,
        '--locales',
        'locales',
        '--source',
        'en',
      ],
      { encoding: 'utf-8' }
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Applied 1');
    const before = readJson('playground-vite/locales/en.json'),
      after = readJson(join(tmp, 'locales/en.json'));
    expect(after).toEqual({
      ...before,
      home: { ...before.home, title: 'Welcome to the share link' },
    });
    expect(fs.readFileSync(join(tmp, 'locales/ar.json'), 'utf-8')).toBe(
      fs.readFileSync('playground-vite/locales/ar.json', 'utf-8')
    );
  });
  test('developer opens a change link in Review mode', async ({ page }) => {
    const token = await encodeChangeLink({
      branch: '',
      base: '',
      src: 'en',
      by: 'Sara',
      note: 'Header copy',
      edits: [
        {
          locale: 'en',
          key: 'home.title',
          from: 'Welcome to the static playground',
          to: 'Hello from Sara',
          force: false,
        },
      ],
    });
    await page.goto(`${STATIC}/livelocale/index.html#${token}`);
    await expect(page.getByText('Reviewing 1 proposed change')).toBeVisible();
    await expect(page.getByRole('row', { name: /home\.title/ })).toContainText('Hello from Sara');
    await expect(page.getByRole('row', { name: /home\.title/ })).toContainText('Ready');
    await expect(
      page.frameLocator('#app-preview-iframe').locator('[data-i18n-key="home.title"]')
    ).toHaveText('Hello from Sara');
    await expect(page.getByText('npx livelocale apply "')).toBeVisible();
  });
  test('the static Studio keeps the app wide at 800x600', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await openStudio(page);
    expect((await page.locator('#app-preview-iframe').boundingBox())!.width).toBeGreaterThanOrEqual(
      480
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
  test('names the fix instead of pointing at localhost when the manifest is missing', async ({
    page,
  }) => {
    // Review Focus 1
    await page.route('**/livelocale/manifest.json', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' })
    );
    await page.goto(`${STATIC}/livelocale/index.html`);
    await expect(
      page.getByText(/livelocale\/manifest\.json is missing or is not a LiveLocale manifest/)
    ).toBeVisible();
    await expect(page.locator('#app-preview-iframe[src^="http://localhost:3000"]')).toHaveCount(0);
    await expect(page.getByTestId('slow-connection-help')).toHaveCount(0);
  });
  ```
- [ ] **Step 2:** Run `npx playwright test tests/e2e/static-share.spec.ts`. Expected: FAIL with `net::ERR_CONNECTION_REFUSED` at `http://localhost:3020`, because nothing serves port 3020 yet.
- [ ] **Step 3:** Add the playground files, the static server, the webServer entry, the CI step and the `.gitignore` lines. Then run `npm install --prefix playground-vite && npm run build`. Expected: exit 0, and `playground-vite/package-lock.json` exists.
- [ ] **Step 4: Check the wiring the E2E relies on.** Run each search below. Expected: each prints at least one match. When one prints nothing, add exactly that item in the named file (owned by the named task) and change nothing else.

  | E2E relies on                                              | Owner   | Search                                                                                                                   |
  | ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
  | `startStudio` runs before `<App/>` renders                 | Task 32 | `grep -n "startStudio" src/studio/main.tsx`                                                                              |
  | runtime problems reach `setupProblems` before a connection | Task 32 | `grep -n "getStudioRuntime" src/studio/features/dashboard/hooks/useStudio.ts`                                            |
  | no `IframeViewer` while the preview is blocked             | Task 32 | `grep -n "isAppPreviewBlocked" src/studio/app.tsx`                                                                       |
  | `#studio-tips-name` and "Start editing"                    | Task 41 | `grep -n -e studio-tips-name -e "Start editing" src/studio/features/dashboard/components/FirstRunTips.tsx`               |
  | `FirstRunTips` rendered by the app                         | Task 41 | `grep -n "FirstRunTips" src/studio/app.tsx`                                                                              |
  | `Editing: ` in the header                                  | Task 36 | `grep -n "Editing: " src/studio/features/dashboard/components/Header.tsx`                                                |
  | visible texts forwarded to locale inference                | Task 36 | `grep -n "onVisibleTexts" src/studio/features/dashboard/hooks/useStudio.ts`                                              |
  | drafts re-applied after a reload                           | Task 35 | `grep -n "valuesToReapply" src/studio/features/dashboard/hooks/useStudio.ts`                                             |
  | `data-testid="unsent-counter"`                             | Task 35 | `grep -n "unsent-counter" src/studio/features/dashboard/components/Header.tsx`                                           |
  | `#studio-send-button`                                      | Task 40 | `grep -n "studio-send-button" src/studio/features/dashboard/components/Header.tsx`                                       |
  | `#studio-send-note`, `change-link`, `#studio-send-copy`    | Task 40 | `grep -n -e studio-send-note -e change-link -e studio-send-copy src/studio/features/dashboard/components/SendDialog.tsx` |
  | `SendDialog` rendered by the app                           | Task 40 | `grep -n "SendDialog" src/studio/app.tsx`                                                                                |
  | review opened from the hash                                | Task 43 | `grep -n "useReview" src/studio/features/dashboard/hooks/useStudio.ts`                                                   |
  | `Reviewing ` chip                                          | Task 44 | `grep -n "Reviewing " src/studio/features/dashboard/components/Header.tsx`                                               |
  | table rows and the apply command                           | Task 44 | `grep -n -e "<tr" -e applyCommandFor src/studio/features/dashboard/components/ReviewPanel.tsx`                           |
  | `ReviewPanel` in the side slot                             | Task 44 | `grep -n "ReviewPanel" src/studio/app.tsx`                                                                               |

- [ ] **Step 5:** Run `npx playwright test`. Expected: PASS for `static-share.spec.ts`, `share-flag.spec.ts`, `responsive-layout.spec.ts` and the unchanged `visual-sync.spec.ts`.
- [ ] **Step 6:** Commit `test(e2e): cover the static share link round trip on a plain static server`.

---

### Task 51: Docs for milestone A ("Share link on any host")

**Files:**

- Modify: `README.md`, `ARCHITECTURE.md`
- Test: Create `tests/unit/readme-share.test.ts`

**Interfaces:**

- Consumes: the commands and copy from Tasks 21–24, 40 and 47–49.
- **README section `## 🔗 Share link on any host`**, placed before "🌍 Preview mode". It contains:
  - **Setup.**
    - Vite: `share: true`.
    - CRA, webpack and Rsbuild: `"build": "<bundler> && livelocale pack build"`, with the spec's reason for using an explicit `&&`.
    - Next export and Next on Vercel/Node: `livelocale build --preview -- next build`.
    - Custom CI: `LIVELOCALE=preview <build>` (SSR/SSG only), then `npx livelocale pack <outDir>`.
    - Then `npx livelocale doctor --app <url>` to print the share link.
  - **Translator steps.** A condensed version of spec §2 steps 1–8: no sign-up, tips and name, the language shown at the top, Alt+Click, Save or Save anyway, the counter, and Send (Copy link or Download file).
  - **Developer.** Open the link, then use Review mode, then run `npx livelocale apply "<link or file>" --pr`. This works on any git host, and `--clipboard` and `-` cover long links.
  - **What "Sent" means** (spec risk 4). In this mode "Sent" means the translator handed the link over; it is not a pull request until a developer applies it.
  - **Hosting notes.**
    - S3 links must end in `index.html`.
    - GitHub Pages: the `livelocale/` folder has no underscore, and the `/repo/` base path is handled.
    - Netlify and Cloudflare `_headers` must not send DENY; SAMEORIGIN is fine.
    - Netlify and Cloudflare Pages: every per-deploy URL is a separate origin with its own drafts, so share the branch alias (for example `https://staging--site.netlify.app/livelocale/index.html`), not a per-deploy URL.
    - Basic auth and host password protection carry over, because the Studio is on the same site.
    - Vercel Deployment Protection must be off, or the translator must have access.
    - PWA: add `navigateFallbackDenylist: [/^\/livelocale\//]`.
    - Relative bases: see `RELATIVE_BASE_WARNING`.
  - **Security.**
    - No credential anywhere.
    - A leaked link only proposes text.
    - `exposeRepo: false` by default.
    - The Studio is `noindex`.
    - `manifest.json` makes every string and key name public.
    - The same-origin risk is accepted, because no secret is stored.
  - **Limits.**
    - Desktop only, because Alt+Click needs a keyboard.
    - Drafts live in one browser, including under Safari's 7-day cap. Use Download backup.
    - One app per repository.
  - In the "🌍 Preview mode" section, replace the stale sentence around README line 401, "The plugin runs on the Vite dev server only: a static `vite build` served by Apache, Nginx or a CDN has no server for the Studio to save through, so preview mode does not work there yet.", with: "Preview mode runs on the Vite dev server only. For a static `vite build` served by Apache, Nginx or a CDN, use the share link instead; see [Share link on any host](#-share-link-on-any-host)."
- **ARCHITECTURE.md.** Earlier tasks already edited §0, §3b, §3c, §4, §6–§10 and the entry table. This task adds:
  - a "Share link (static mode)" paragraph after the one-paragraph version, describing the flow: build → `livelocale/` → framed flag → static transport → change link → `apply`;
  - a line in "Testing strategy" for the static playground E2E;
  - security rows `Framed-only activation | core/flag-script` and `Edits re-validated on apply | core/apply-plan, codemod/apply`.

- [ ] **Step 1: Write the failing test.**
  ```ts
  const readme = fs.readFileSync('README.md', 'utf-8');
  it('has the share link section', () => expect(readme).toMatch(/^## .*Share link on any host$/m));
  it('documents apply --pr, the PWA denylist and exposeRepo', () => {
    expect(readme).toContain('npx livelocale apply "<link or file>" --pr');
    expect(readme).toContain('navigateFallbackDenylist: [/^\\/livelocale\\//]');
    expect(readme).toContain('exposeRepo');
  });
  it('no longer says static builds are unsupported', () =>
    expect(readme).not.toContain('preview mode does not work there yet'));
  it('tells Netlify and Cloudflare users to share the branch alias', () =>
    expect(readme).toContain('branch alias'));
  it('says what Sent means', () =>
    expect(readme).toContain('it is not a pull request until a developer applies it'));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/readme-share.test.ts`. Expected: FAIL, because the section is missing.
- [ ] **Step 3:** Write the README section and the ARCHITECTURE additions.
- [ ] **Step 4:** Run `npx vitest run tests/unit/readme-share.test.ts && npm run format:check`. Expected: PASS.
- [ ] **Step 5:** Commit `docs: share link on any host`.

---

### Task 52: Release A (0.9.0)

**Files:**

- Create, then consume: `.changeset/share-link-any-host.md`
- Modify: `CHANGELOG.md`, `package.json` and `package-lock.json` (version)

- [ ] **Step 1: Full verification.** Run `npm run format:check && npm run lint && npm run typecheck && npm run build && npm run test:coverage && npx playwright test`. Expected:
  - every command exits 0;
  - coverage holds at 85/70/85/85;
  - every Playwright spec passes (`visual-sync`, `share-flag`, `responsive-layout`, `static-share`).
- [ ] **Step 2: Write `.changeset/share-link-any-host.md`.** The front matter is `'livelocale': minor`, and the body follows the house style used in `CHANGELOG.md`.
  - **Added**
    - The share link on any host: `liveLocaleVite({ share: true })`, `livelocale pack <outDir>` and `livelocale build [--preview] -- <cmd>` write `livelocale/` (the Studio, `manifest.json`, the locale files and `flag.js`) into the build.
    - A framed-only `flag.js`: visitors who open the site directly never get watermarks.
    - Static Studio mode: drafts kept in IndexedDB, re-applied after reloads, the language detected from the page text, Send to developer (Copy link, Download file), Download and Restore backup, and first-run tips.
    - Review mode for `lc1.` change links.
    - `npx livelocale apply "<link|file|->" [--pr] [--clipboard] [--force] [--dry-run]`.
    - `doctor --app <url>` share probes, which print the share link.
    - The client follows a Studio on the same site after full-page navigations.
    - The client reports visible texts.
  - **Changed**
    - The Studio is built with a relative base and self-hosted fonts, and is `noindex`.
    - The Studio uses drawers below 1280px.
    - `FileMutator({ requireEnabled })`, with `FileMutatorOptions` exported from `livelocale/server`.
    - The router's write validation moved to `save-rules` with byte-identical responses.
- [ ] **Step 3: Version and changelog.**
  - Run `npx changeset version`. Expected: `package.json` is at `0.9.0`, a CHANGELOG entry exists, and the changeset file is consumed.
  - Hand-format the entry to the house style: `## [0.9.0] - <YYYY-MM-DD>`, `### Minor Changes`, and **Added**/**Changed** lists, as in `0.8.1`.
- [ ] **Step 4:** Commit `chore: release 0.9.0`. Expected: one commit containing the version bump, `CHANGELOG.md` and the removed changeset.
- [ ] **Step 5: Hand off to the owner.** Do not push tags, create releases or publish.
  - The owner merges the branch, then creates the GitHub release `v0.9.0`, which makes `publish.yml` publish with provenance.
  - Then run `npm view livelocale version`. Expected: `0.9.0`.

---

## Milestone B: one-click pull request on GitHub

### Task 53: Shared GitHub REST module

**Files:**

- Create: `src/server/github-rest.ts`
- Modify: `src/server/github-gateway.ts` so that it uses the new module, with no change in behaviour.
- Test: Create `tests/unit/github-rest.test.ts`. Leave `tests/unit/github-gateway.test.ts` unchanged; it must still pass.

**Interfaces:**

- Consumes: nothing new.
- Produces:

  ```ts
  export class GitHubApiError extends Error { constructor(message: string, readonly status: number) }
  export interface GitHubRestConfig { repo: string; token: string; apiBase?: string; fetchImpl?: typeof fetch }
  export interface GitHubRest {
    readonly repo: string;
    api<T = any>(method: string, path: string, options?: { body?: unknown; query?: Record<string, string>; allow404?: boolean }): Promise<{ status: number; data: T | null }>;
    probeStatus(method: string, path: string, body?: unknown): Promise<number>;
    refSha(branch: string): Promise<string | null>;
    findOpenPullRequest(head: string, base: string): Promise<{ number: number; url: string } | null>;
    openOrReusePullRequest(input: { head: string; base: string; title: string; body: string; updateBodyIfReused?: boolean }): Promise<{ number: number; url: string; reused: boolean }>;
  }
  export function createGitHubRest(config: GitHubRestConfig): GitHubRest;
  export function encodeBase64Utf8(text: string): string;   // TextEncoder + btoa, no Buffer; standard alphabet with padding (GitHub API), separate from toBase64Url
  export function decodeBase64Utf8(base64: string): string; // tolerates embedded '\n'
  export function isPullRequestCreationForbidden(err: unknown): boolean; // 403 + /not permitted to create or approve pull requests/i
  export function encodeRefPath(ref: string): string;       // per-segment encodeURIComponent: 'livelocale/issue-7' → 'livelocale/issue-7'
  ```

  `path` is relative to `/repos/{repo}`. The headers and the error hint stay exactly as the gateway has them today.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('round-trips UTF-8 through portable base64', () => {
    expect(decodeBase64Utf8(encodeBase64Utf8('مرحبا {name} ✓'))).toBe('مرحبا {name} ✓');
    expect(decodeBase64Utf8('2YXYsdit2KjYpw==\n')).toBe('مرحبا');
  });
  it('reuses an open pull request and refreshes its body when asked', async () => {
    // fetch mock: GET /pulls?head=acme:livelocale/issue-7&base=main&state=open → [{ number: 9, html_url: 'https://github.com/acme/site/pull/9' }]
    const r = await rest.openOrReusePullRequest({
      head: 'livelocale/issue-7',
      base: 'main',
      title: 't',
      body: 'b2',
      updateBodyIfReused: true,
    });
    expect(r).toEqual({ number: 9, url: 'https://github.com/acme/site/pull/9', reused: true });
    expect(calls).toContainEqual({
      method: 'PATCH',
      path: '/repos/acme/site/pulls/9',
      body: { body: 'b2' },
    });
  });
  it('recognises the "Actions may not create pull requests" refusal', () => {
    expect(
      isPullRequestCreationForbidden(
        new GitHubApiError(
          'GitHub API 403 on POST /pulls: GitHub Actions is not permitted to create or approve pull requests.',
          403
        )
      )
    ).toBe(true);
    expect(
      isPullRequestCreationForbidden(
        new GitHubApiError('GitHub API 403 on POST /pulls: Forbidden.', 403)
      )
    ).toBe(false);
  });
  it('encodes each ref segment', () =>
    expect(encodeRefPath('livelocale/issue 7')).toBe('livelocale/issue%207'));
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/github-rest.test.ts`. Expected: FAIL with `Cannot find module '../../src/server/github-rest.js'`.
- [ ] **Step 3:** Move `api`, `probeStatus`, `refSha`, `GitHubApiError` and the open-PR lookup into `github-rest.ts`.
  - Rebuild `createGitHubGateway` on top of `createGitHubRest`.
  - `commit()` calls `openOrReusePullRequest` with `updateBodyIfReused: false`.
  - Replace the `Buffer` base64 with the portable helpers.
- [ ] **Step 4:** Run `npx vitest run tests/unit/github-rest.test.ts tests/unit/github-gateway.test.ts`. Expected: PASS, with 0 lines changed in the gateway tests.
- [ ] **Step 5:** Commit `refactor(server): extract shared GitHub REST helpers`.

---

### Task 54: Reports for GitHub issues (comments and check summary)

**Files:**

- Modify: `src/codemod/apply/report.ts`
- Test: Extend `tests/unit/apply-report.test.ts`

**Interfaces:**

- Consumes: `codeSpan`, `ReportContext`, `renderChangesTable`, the target note, the `Translated by` line and the note fence (Task 46). `summarizeCheck` now lives in Task 46; the Action passes its result in as `ctx.checkSummary`.
- Produces:
  ```ts
  export type IssueOutcome =
    | { kind: 'pr'; url: string; reused: boolean }
    | { kind: 'compare'; url: string; branch: string }
    | { kind: 'nothing-to-apply' }
    | { kind: 'waiting-for-maintainer' }
    | { kind: 'wrong-repo'; linkRepo: string; repo: string }
    | { kind: 'error'; message: string };
  export function renderIssueComment(
    ctx: Partial<ReportContext> & { outcome: IssueOutcome }
  ): string; // <= 60_000 chars; never starts with '/livelocale'
  ```
- Shared rules with Task 46:
  - The `pr`, `compare` and `nothing-to-apply` comments render `by` and `note`, when given, exactly as `renderPullRequestBody` does: the `Translated by ${codeSpan(by)}` line and the note in a fence longer than any backtick run inside it.
  - The `pr` and `compare` comments append Task 46's target note when `ctx.target?.reason === 'not-allowed'` (spec decision 4: the Action "says so in its comment").
- Fixed copy:
  - **Waiting:** `` Waiting for a maintainer: comment `/livelocale apply` `` (this exact text is from the spec).
  - **Needs-force hint:** ``<n> change(s) were saved with "Save anyway". A maintainer can apply them with `/livelocale apply --force`.``
  - **Compare:** ``This repository does not let GitHub Actions open pull requests, so the branch `<branch>` was pushed instead. Create the pull request with one click: <url>``, followed by `(Or allow it once: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".)`.
  - **Wrong repo:** ``This change link was made for `<linkRepo>`, not `<repo>`. Nothing was applied.``
  - **Error:** `LiveLocale could not apply this link: <message>. Run log: <runUrl>`.
  - **PR:** `Pull request: <url>` (or `Updated pull request: <url>` when it was reused), followed by the changes table and the check summary.
  - **Nothing to apply:** `Nothing to apply.`, followed by the table and the needs-force hint when it applies.
  - **Check summary:** `ctx.checkSummary` (Task 46's `summarizeCheck` copy) follows the table in the `pr` and `compare` comments.

- [ ] **Step 1: Write the failing tests.** `outsideFences`, `planWith` and `mixed` are the Task 46 helpers. `forcedOnly` is `planWith({ status: 'needs-force', force: true, code: 'PLACEHOLDER_MISMATCH', message: 'Placeholders differ from the reference: missing {name}.' })`, and `allOutcomes` holds one `IssueOutcome` of each kind.
  ````ts
  expect(renderIssueComment({ outcome: { kind: 'waiting-for-maintainer' } })).toBe(
    'Waiting for a maintainer: comment `/livelocale apply`'
  );
  expect(
    renderIssueComment({
      outcome: {
        kind: 'compare',
        url: 'https://github.com/acme/site/compare/main...livelocale/issue-7?quick_pull=1',
        branch: 'livelocale/issue-7',
      },
    })
  ).toContain('Allow GitHub Actions to create and approve pull requests');
  expect(renderIssueComment({ plan: forcedOnly, outcome: { kind: 'nothing-to-apply' } })).toContain(
    '/livelocale apply --force'
  );
  expect(
    renderIssueComment({
      outcome: { kind: 'wrong-repo', linkRepo: 'other/repo', repo: 'acme/site' },
    })
  ).toContain('Nothing was applied.');
  for (const outcome of allOutcomes)
    expect(renderIssueComment({ plan: mixed, outcome }).startsWith('/livelocale')).toBe(false);
  const notAllowed = {
    branch: 'main',
    isDefault: true,
    requested: 'staging',
    reason: 'not-allowed',
  } as const;
  expect(
    renderIssueComment({
      plan: mixed,
      target: notAllowed,
      outcome: { kind: 'pr', url: 'https://github.com/acme/site/pull/9', reused: false },
    })
  ).toContain('not in the allowed branches');
  expect(
    renderIssueComment({
      plan: mixed,
      target: notAllowed,
      outcome: {
        kind: 'compare',
        url: 'https://github.com/acme/site/compare/main...livelocale/issue-7?quick_pull=1',
        branch: 'livelocale/issue-7',
      },
    })
  ).toContain('not in the allowed branches');
  const c = renderIssueComment({
    plan: mixed,
    by: '@octocat',
    note: '```\n@octocat fixes #1\n```',
    outcome: { kind: 'nothing-to-apply' },
  });
  expect(c).toContain('Translated by `@octocat`');
  expect(outsideFences(c)).not.toMatch(/(^|[^`])@octocat/m);
  expect(outsideFences(c)).not.toContain('fixes #1');
  expect(
    renderIssueComment({
      plan: mixed,
      checkSummary: '✅ `livelocale check`: no problems in the changed keys.',
      outcome: { kind: 'pr', url: 'u', reused: false },
    })
  ).toContain('`livelocale check`');
  ````
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-report.test.ts`. Expected: FAIL, because `renderIssueComment` is not exported.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(apply): render issue comments for the GitHub Action`.

---

### Task 55: Action trigger parsing, trust gate and target branch

**Files:**

- Create: `src/codemod/apply/github-trigger.ts`.
- Create these fixtures under `tests/fixtures/github-events/`. Each is a trimmed real payload shape with `repository.default_branch: "main"` and `repository.full_name: "acme/site"`:
  - `issues-opened-member.json`
  - `issues-opened-contributor.json`
  - `issue-comment-apply.json`
  - `issue-comment-force.json` (commenter `maint`, association `MEMBER`)
  - `issue-comment-force-untrusted.json` (`/livelocale apply --force` by commenter `outsider`, `comment.author_association: "NONE"`, on issue 7 whose author is a `MEMBER`)
  - `issue-comment-on-pr.json`
  - `issue-comment-unknown.json`
  - `issue-comment-bot.json`
  - `workflow-dispatch.json`
  - `pull-request-closed-merged.json`
  - `pull-request-closed-fork.json`
  - `issues-labeled.json`
- Test: Create `tests/unit/apply-github-trigger.test.ts`.

**Interfaces:**

- Consumes: `GitHubRest` (Task 53); `findChangeToken`, `CHANGE_BLOCK_OPEN` (Task 5).
- Produces:
  ```ts
  export interface TriggerActor {
    login: string;
    id: number;
  }
  export type Trigger =
    | { kind: 'ignore'; reason: string }
    | {
        kind: 'apply';
        via: 'issue' | 'comment' | 'dispatch';
        issueNumber: number | null;
        actor: TriggerActor;
        association: string | null;
        text: string;
        force: boolean;
        repo: string;
        defaultBranch: string;
      }
    | { kind: 'close-issue'; issueNumber: number; prUrl: string; merged: boolean; repo: string };
  export function parseTrigger(eventName: string, event: any): Trigger;
  export async function isTrustedActor(
    rest: GitHubRest,
    login: string,
    association: string | null
  ): Promise<boolean>;
  export function chooseTargetBranch(
    requested: string | undefined,
    allowList: string[],
    defaultBranch: string
  ): { branch: string; reason: 'link' | 'default' | 'not-allowed' };
  export function branchBaseName(t: Extract<Trigger, { kind: 'apply' }>, runId: string): string; // livelocale/issue-<n> | livelocale/run-<id>
  ```
- Fixed rules:
  - **`issues`.** The action must be `opened` and the body must contain `CHANGE_BLOCK_OPEN`. The actor is `issue.user`, and the association is `issue.author_association`.
  - **`issue_comment`.**
    - The action must be `created`.
    - The actor is `comment.user`, and the association is `comment.author_association`. The gate always checks the commenter, never the issue author, so an outsider's `/livelocale apply --force` on a maintainer's issue is not trusted.
    - The event is ignored when `issue.pull_request` is set or `comment.user.type === 'Bot'`.
    - The first line must match `/^\/livelocale\s+apply(\s+--force)?\s*$/`. Any other `/livelocale…` command is ignored with reason `unknown command`.
    - The text is the comment body when `findChangeToken` succeeds on it; otherwise it is the issue body.
  - **`workflow_dispatch`.** The text is `inputs.link` and the actor is `sender`. The association is `null`, and there is no gate, because dispatch already requires write access.
  - **`pull_request`.**
    - The action must be `closed`.
    - `head.ref` must match `/^livelocale\/issue-(\d+)(?:-\d+)?$/`.
    - `head.repo.full_name` must equal `repository.full_name`.
    - Anything else is ignored.
  - **Trust.**
    - `OWNER`, `MEMBER` and `COLLABORATOR` are trusted.
    - Otherwise call `GET /collaborators/{login}/permission`. The actor is trusted when `permission` is `admin` or `write`, or `role_name` is `admin`, `maintain` or `write`.
    - A 403 or 404 means untrusted (fail closed).
  - **Allow-list.** It defaults to `[defaultBranch]`.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  expect(parseTrigger('issues', fx('issues-opened-member'))).toMatchObject({
    kind: 'apply',
    via: 'issue',
    issueNumber: 7,
    association: 'MEMBER',
    force: false,
  });
  expect(parseTrigger('issue_comment', fx('issue-comment-force'))).toMatchObject({
    kind: 'apply',
    via: 'comment',
    force: true,
    actor: { login: 'maint' },
    association: 'MEMBER',
  });
  expect(parseTrigger('issue_comment', fx('issue-comment-force-untrusted'))).toMatchObject({
    kind: 'apply',
    via: 'comment',
    force: true,
    actor: { login: 'outsider' },
    association: 'NONE',
  });
  expect(parseTrigger('issue_comment', fx('issue-comment-on-pr')).kind).toBe('ignore');
  expect(parseTrigger('issue_comment', fx('issue-comment-bot')).kind).toBe('ignore');
  expect(parseTrigger('issue_comment', fx('issue-comment-unknown'))).toEqual({
    kind: 'ignore',
    reason: 'unknown command',
  });
  expect(parseTrigger('workflow_dispatch', fx('workflow-dispatch'))).toMatchObject({
    via: 'dispatch',
    issueNumber: null,
    association: null,
  });
  expect(parseTrigger('pull_request', fx('pull-request-closed-merged'))).toMatchObject({
    kind: 'close-issue',
    issueNumber: 7,
    merged: true,
  });
  expect(parseTrigger('pull_request', fx('pull-request-closed-fork')).kind).toBe('ignore');
  expect(parseTrigger('issues', fx('issues-labeled')).kind).toBe('ignore');
  expect(await isTrustedActor(restWith({}), 'm', 'MEMBER')).toBe(true);
  expect(
    await isTrustedActor(restWith({ permission: 'write', role_name: 'write' }), 'c', 'CONTRIBUTOR')
  ).toBe(true);
  expect(
    await isTrustedActor(restWith({ permission: 'read', role_name: 'triage' }), 'c', 'CONTRIBUTOR')
  ).toBe(false);
  expect(await isTrustedActor(restWith404(), 'x', 'NONE')).toBe(false);
  expect(chooseTargetBranch('staging', ['main'], 'main')).toEqual({
    branch: 'main',
    reason: 'not-allowed',
  });
  expect(chooseTargetBranch('staging', ['main', 'staging'], 'main')).toEqual({
    branch: 'staging',
    reason: 'link',
  });
  expect(chooseTargetBranch(undefined, ['main'], 'main')).toEqual({
    branch: 'main',
    reason: 'default',
  });
  expect(chooseTargetBranch('', ['main'], 'main')).toEqual({ branch: 'main', reason: 'default' });
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-github-trigger.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement the module and add the fixtures.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(action): parse events, gate on maintainers and pick the target branch`.

---

### Task 56: Remote locale read and a one-commit Git Data API writer

**Files:**

- Create: `src/codemod/apply/github-commit.ts` and `tests/unit/helpers/fake-github.ts`
- Test: Create `tests/unit/apply-github-commit.test.ts`

**Interfaces:**

- Consumes: `GitHubRest`, `encodeBase64Utf8`, `decodeBase64Utf8` (Task 53); `ApplyPlan`, `LocaleTarget` (Task 10); `setNestedProperty`, `stringifyLike` (existing `src/core/json-path.ts`); `FileMutator({ requireEnabled: false })` (Task 9, tests only).
- Produces:
  ```ts
  export function normalizeRepoDir(p: string): string; // '\\'→'/', strip './' and edge '/', throws on '..' or absolute
  export function localeFileFor(
    localesDir: string,
    layout: 'flat' | 'namespaced',
    locale: string,
    key: string
  ): { file: string; innerKey: string };
  export function applyEditsToText(
    text: string,
    edits: { innerKey: string; value: string }[]
  ): string; // byte-identical to FileMutator output
  export interface RemoteLocales {
    sha: string;
    targets: Map<string, LocaleTarget>;
    files: Map<string, string>;
  }
  export async function readRemoteLocales(
    rest: GitHubRest,
    commitSha: string,
    localesDir: string,
    locales: string[]
  ): Promise<RemoteLocales>;
  export function buildFileChanges(
    localesDir: string,
    plan: ApplyPlan,
    remote: RemoteLocales
  ): Map<string, string>; // throws 'outside the locales' for any path not under <localesDir>/
  export type BranchPlan = { branch: string; parentSha: string; mode: 'new' | 'append' };
  /** base = the target branch; an existing ref is appended to only when it has an open PR into that same base. */
  export async function prepareBranch(
    rest: GitHubRest,
    baseName: string,
    base: string,
    targetSha: string,
    runId: string
  ): Promise<BranchPlan>;
  export async function commitFiles(
    rest: GitHubRest,
    input: {
      branchPlan: BranchPlan;
      files: Map<string, string>;
      message: string;
      author: { name: string; email: string };
    }
  ): Promise<{ sha: string } | { sha: null; unchanged: true }>;
  export function noreplyAuthor(actor: { login: string; id: number }): {
    name: string;
    email: string;
  }; // { name: login, email: `${id}+${login}@users.noreply.github.com` }
  ```
- Decisions:
  - **Reads.** List `GET /contents/<dir>?ref=<sha>`, then read each file with `GET /git/blobs/<sha>`. Blobs avoid the 1 MB limit of the contents API. Namespaced locales merge their files under the namespace name. A locale with no file gives a `null` target.
  - **Branch.**
    - When the ref does not exist, the mode is `new` with `<baseName>`, and the parent is the target SHA.
    - When the ref exists and `rest.findOpenPullRequest(baseName, base)` finds an open PR, the mode is `append`, and the parent is the branch head. The file contents are still computed from the target plus the edits.
    - When the ref exists without an open PR into `base` (none at all, or only one into another branch), the mode is `new` with `<baseName>-<runId>`, and the parent is the target SHA.
  - **Commit.**
    1. `GET /git/commits/<parent>` for the tree.
    2. `POST /git/blobs` once per file, as base64.
    3. `POST /git/trees` with `base_tree`. If the new tree equals the parent's tree, return `unchanged`.
    4. Otherwise `POST /git/commits` with `author` only.
    5. Then `POST /git/refs` for a new branch, or `PATCH /git/refs/heads/<b>` with `force: false` to append.
  - **`FakeGitHub`.** It uses content-addressed sha1 and implements:
    - refs, `git/commits`, `git/trees` (with `base_tree`), and `git/blobs` (GET and POST);
    - the contents listing;
    - `pulls` (GET, POST and PATCH);
    - `prCreationForbidden`, which answers 403 with `GitHub Actions is not permitted to create or approve pull requests.`;
    - issues (GET and PATCH) and their comments;
    - `collaborators/:u/permission`;
    - a `calls` log.

- [ ] **Step 1: Write the failing tests.** The `FakeGitHub` repo `acme/site` has branches `main` (`mainSha`) and `staging` (`stagingSha`), each with `locales/en.json` and `locales/ar.json`; `rest = createGitHubRest({ repo: 'acme/site', token: 't', fetchImpl: gh.fetch })`. Before the `append` cases, the test opens a PR from `livelocale/issue-7` into `main` and creates the ref `livelocale/issue-8` with no PR.
  ```ts
  for (const fixture of ['{\n\t"a": "x"\n}', '{\n    "a": "x"\n}\n', '{"a":"x"}'])
    expect(applyEditsToText(fixture, [{ innerKey: 'a', value: 'y' }])).toBe(
      await viaFileMutator(fixture, 'a', 'y')
    );
  expect(localeFileFor('src/locales', 'namespaced', 'ar', 'home.title')).toEqual({
    file: 'src/locales/ar/home.json',
    innerKey: 'title',
  });
  expect(() => normalizeRepoDir('../x')).toThrow();
  const remote = await readRemoteLocales(rest, mainSha, 'locales', ['en', 'ar', 'fr']);
  expect(remote.targets.get('ar')).toEqual({ layout: 'flat', dict: { home: { title: 'أهلا' } } });
  expect(remote.targets.get('fr')).toBeNull();
  // a file over 1 MB is read through the blob API
  const bp = await prepareBranch(rest, 'livelocale/issue-7', 'main', mainSha, '99');
  expect(bp).toEqual({ branch: 'livelocale/issue-7', parentSha: mainSha, mode: 'new' });
  await commitFiles(rest, {
    branchPlan: bp,
    files: changes,
    message: 'm',
    author: noreplyAuthor({ login: 'maint', id: 42 }),
  });
  expect(gh.calls.filter((c) => c.method === 'POST' && c.path === '/git/commits')).toHaveLength(1);
  expect(gh.lastCommit.author.email).toBe('42+maint@users.noreply.github.com');
  expect(gh.calls.some((c) => c.path.includes('heads/main') && c.method !== 'GET')).toBe(false);
  expect(gh.calls.some((c) => c.body?.force === true)).toBe(false);
  expect((await prepareBranch(rest, 'livelocale/issue-7', 'main', mainSha, '100')).mode).toBe(
    'append'
  ); // with an open PR into main
  expect(await prepareBranch(rest, 'livelocale/issue-7', 'staging', stagingSha, '102')) // open PR targets main, not staging
    .toEqual({ branch: 'livelocale/issue-7-102', parentSha: stagingSha, mode: 'new' });
  expect((await prepareBranch(rest, 'livelocale/issue-8', 'main', mainSha, '101')).branch).toBe(
    'livelocale/issue-8-101'
  ); // ref exists, no PR
  expect(() => buildFileChanges('locales', planTouching('../package.json'), remote)).toThrow(
    /outside the locales/
  );
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-github-commit.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement the module and the fake.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(action): read locales and write one commit per batch through the Git Data API`.

---

### Task 57: `apply --github-event` orchestration

**Files:**

- Create: `src/codemod/apply/github-event.ts`
- Modify: `src/codemod/apply/cli.ts` to parse `--github-event` and `--branches`, and `src/codemod/index.ts` to add their two help lines under the `apply` options in `printHelp` (`--github-event      Run inside the generated GitHub workflow; reads the link from the event file` and `--branches <a,b>    Branches a link may target (default: the repository's default branch)`). Modify `README.md` (CLI Reference: `apply --github-event`, for the generated workflow only).
- Test: Create `tests/unit/apply-github-event.test.ts`. Extend `tests/unit/apply-cli.test.ts`.

**Interfaces:**

- Consumes:
  - `CHANGE_BLOCK_OPEN` (Task 5)
  - `decodeChangeLink`, `ChangeLinkError` (Task 7)
  - `nodeInflate` (Task 8)
  - `planApply` (Task 10)
  - `parseApplyArgs`, `ApplyArgs`, `runApplyCommand` (Task 47)
  - `renderPullRequestBody`, `renderCommitMessage`, `summarizeCheck`, `TargetInfo` (Task 46)
  - `renderIssueComment`, `IssueOutcome` (Task 54)
  - Tasks 53, 55 and 56
  - `runCheck` (existing)
- Produces:
  ```ts
  export interface GitHubEventOptions {
    env: NodeJS.ProcessEnv; // GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_RUN_ID,
    // GITHUB_SERVER_URL ('https://github.com'), GITHUB_API_URL, GITHUB_WORKSPACE, GITHUB_STEP_SUMMARY
    localesPath: string;
    sourceLocale: string;
    branches?: string[];
    dir?: string;
    fetchImpl?: typeof fetch;
    log?: (line: string) => void;
  }
  export type EventResult = 'ignored' | 'closed-issue' | IssueOutcome['kind'];
  export async function runGitHubEventApply(options: GitHubEventOptions): Promise<EventResult>;
  // ApplyArgs gains: githubEvent: boolean; branches?: string[]
  ```
- **`parseApplyArgs` additions.** It rejects these combinations, checked in this order:
  - `--github-event` with `--force`: ``--force is not allowed with --github-event; a maintainer comments `/livelocale apply --force`.``
  - `--github-event` with a positional input: `--github-event reads the link from the event file; do not pass one.`
  - `--github-event` without `--locales` or without `--source`: `--github-event needs --locales and --source.` (`GitHubEventOptions.localesPath` and `sourceLocale` are required, and the generated workflow always passes both.)
- **Exit code.** `runApplyCommand` sets `process.exitCode = 1` when `runGitHubEventApply` resolves `'error'` or `'wrong-repo'`, or rejects; every other result leaves it at 0.
- **Fixed flow:**
  1. **Read the event.** A missing `GITHUB_TOKEN` or `GITHUB_EVENT_PATH` throws. Read `GITHUB_EVENT_PATH`, then run `parseTrigger`. An `ignore` trigger makes no API call and returns `'ignored'`.
  2. **`close-issue`.** Close only when the issue is open and its body contains `CHANGE_BLOCK_OPEN`. Send `PATCH /issues/<n> { state: 'closed', state_reason: merged ? 'completed' : 'not_planned' }`, then comment `Closed because <prUrl> was merged.` or `Closed because <prUrl> was closed.`
  3. **Trust gate** (`issue` and `comment` only). `isTrustedActor(rest, trigger.actor.login, trigger.association)`, which checks the issue author for `issues` and the commenter for `issue_comment` (Task 55). An untrusted actor gets the waiting comment, and the result is `waiting-for-maintainer`. Nothing under `/git/` is written, so an untrusted `/livelocale apply --force` never forces anything.
  4. **Decode** with `decodeChangeLink(trigger.text, nodeInflate)`. These expected failures post their comment and **resolve**; they do not throw:
     - `NOT_FOUND` posts the error comment `No LiveLocale change link (lc1.…) found.` and resolves `'error'`.
     - Any other `ChangeLinkError` posts the error comment with `err.message` and resolves `'error'`.
     - When `set.repo` is set and differs from `GITHUB_REPOSITORY`, post the wrong-repo comment and resolve `'wrong-repo'`.
  5. **Plan.**
     - Pick the branch with `target = chooseTargetBranch(set.branch, branches ?? [default], default)`, and get `targetSha = refSha(target.branch)`.
     - Run `readRemoteLocales` for the edit locales plus the source locale. A missing source locale posts the error comment ``Source locale `<s>` has no locale file on `<branch>`.`` and resolves `'error'`.
     - Run `planApply` with `allowForce = trigger.force`.
  6. **Nothing to apply.** When no edit has status `apply`, post the `nothing-to-apply` comment with the table and stop.
  7. **Commit.** Run `prepareBranch(rest, branchBaseName(trigger, runId), target.branch, targetSha, runId)`, then `commitFiles`, with author `noreplyAuthor(actor)` and the message from `renderCommitMessage({ plan, by: set.by, issueNumber, runId })`.
  8. **Check.**
     - Write the target files plus the changes for the involved locales into a temp dir.
     - Run `runCheck({ projectDir: join(GITHUB_WORKSPACE, dir ?? '.'), localesPath: tmp, sourceLocale, unused: false })`, then `summarizeCheck`.
     - If the check throws, the summary is `Check could not run: <message>`.
  9. **Pull request.**
     - The title is `i18n: LiveLocale changes (#<n>)` or `i18n: LiveLocale changes (run <id>)`.
     - The body is `renderPullRequestBody({ plan, by: set.by, note: set.note, target: TargetInfo from step 5, issueNumber, checkSummary, runUrl })`.
     - Call `openOrReusePullRequest({ ..., updateBodyIfReused: true })`.
     - When `isPullRequestCreationForbidden(err)`, build the compare fallback instead: `<server>/<repo>/compare/<encodeRefPath(target.branch)>...<encodeRefPath(branch)>?quick_pull=1&title=<enc>&body=<enc closing line>`.
  10. **Report.** Comment on the issue with `renderIssueComment({ plan, by, note, target, checkSummary, runUrl, outcome })`, so a `not-allowed` target is named there too. For dispatch, append the outcome to `GITHUB_STEP_SUMMARY`.
  - **Unexpected exceptions** (anything other than the expected failures in steps 4 and 5) after the gate post the error comment and then rethrow, so the CLI exits 1. No log line contains a value.

- [ ] **Step 1: Write the failing tests.** The FakeGitHub repo is `acme/site`, where `main` holds `locales/en.json` and `locales/ar.json`. The fixture event files are written to tmp with the token embedded.
  ```ts
  expect(await run('issues', fxWith('issues-opened-member', token))).toBe('pr');
  expect(gh.refs['livelocale/issue-7']).toBeDefined();
  expect(gh.calls.filter((c) => c.path === '/git/commits' && c.method === 'POST')).toHaveLength(1);
  expect(gh.pulls[0]).toMatchObject({ head: 'livelocale/issue-7', base: 'main' });
  expect(gh.pulls[0].body).toContain('Closes #7');
  expect(gh.comments[7].at(-1)).toContain(gh.pulls[0].html_url);
  // untrusted author
  expect(
    await run('issues', fxWith('issues-opened-contributor', token), { permission: 'read' })
  ).toBe('waiting-for-maintainer');
  expect(gh.comments[7].at(-1)).toBe('Waiting for a maintainer: comment `/livelocale apply`');
  expect(gh.calls.some((c) => c.method === 'POST' && c.path.startsWith('/git/'))).toBe(false);
  expect(
    await run('issues', fxWith('issues-opened-contributor', token), { permission: 'write' })
  ).toBe('pr');
  // untrusted commenter asking for --force on a maintainer's issue: the commenter is gated, never the issue author
  const before = gh.calls.length;
  expect(
    await run('issue_comment', fxWith('issue-comment-force-untrusted', forcedOnlyToken), {
      permission: 'read',
    })
  ).toBe('waiting-for-maintainer');
  expect(
    gh.calls.slice(before).some((c) => c.method === 'POST' && c.path.startsWith('/git/'))
  ).toBe(false);
  expect(gh.calls.slice(before)).toContainEqual(
    expect.objectContaining({ method: 'GET', path: '/collaborators/outsider/permission' })
  ); // FakeGitHub logs repo-relative paths
  expect(gh.comments[7].at(-1)).toBe('Waiting for a maintainer: comment `/livelocale apply`');
  // branch not allowed → main, and the comment says so
  await run(
    'issues',
    fxWith('issues-opened-member', tokenFromBranch('staging')),
    {},
    { branches: ['main'] }
  );
  expect(gh.pulls[0].base).toBe('main');
  expect(gh.comments[7].at(-1)).toContain('not in the allowed branches');
  // allowed non-default → Refs, no Closes
  await run(
    'issues',
    fxWith('issues-opened-member', tokenFromBranch('staging')),
    {},
    { branches: ['main', 'staging'] }
  );
  expect(gh.pulls[0].base).toBe('staging');
  expect(gh.pulls[0].body).toContain('Refs #7');
  expect(gh.pulls[0].body).not.toContain('Closes #7');
  // Actions may not create PRs → compare link
  gh.prCreationForbidden = true;
  expect(await run('issues', fxWith('issues-opened-member', token))).toBe('compare');
  expect(gh.comments[7].at(-1)).toContain(
    'https://github.com/acme/site/compare/main...livelocale/issue-7?quick_pull=1'
  );
  // force flow
  expect(await run('issues', fxWith('issues-opened-member', forcedOnlyToken))).toBe(
    'nothing-to-apply'
  );
  expect(gh.comments[7].at(-1)).toContain('/livelocale apply --force');
  expect(await run('issue_comment', fxWith('issue-comment-force', forcedOnlyToken))).toBe('pr');
  // re-run with an open PR → reuse; identical content → no second commit
  await run('issues', fxWith('issues-opened-member', token));
  const commits = gh.commitCount;
  expect(await run('issue_comment', fxWith('issue-comment-apply', token))).toBe('pr');
  expect(gh.commitCount).toBe(commits);
  // PR-thread comment, wrong repo, cap overflow, merged non-default PR, dispatch
  expect(await run('issue_comment', fx('issue-comment-on-pr'))).toBe('ignored');
  expect(gh.calls).toHaveLength(0);
  expect(await run('issues', fxWith('issues-opened-member', tokenForRepo('other/repo')))).toBe(
    'wrong-repo'
  );
  expect(await run('issues', fxWith('issues-opened-member', rawToken501Edits))).toBe('error'); // built with zlib.deflateSync + toBase64Url, bypassing encode caps
  expect(await run('pull_request', fx('pull-request-closed-merged'))).toBe('closed-issue');
  expect(gh.issues[7]).toMatchObject({ state: 'closed', state_reason: 'completed' });
  expect(await run('workflow_dispatch', fxWith('workflow-dispatch', token))).toBe('pr');
  expect(fs.readFileSync(summaryFile, 'utf-8')).toContain('/pull/');
  // cli
  expect(
    parseApplyArgs([
      '--github-event',
      '--locales',
      'locales',
      '--source',
      'en',
      '--branches',
      'main,staging',
    ]).branches
  ).toEqual(['main', 'staging']);
  expect(() => parseApplyArgs(['--github-event', '--force'])).toThrow(/\/livelocale apply --force/);
  expect(() => parseApplyArgs(['x', '--github-event'])).toThrow(/reads the link from the event/);
  expect(() => parseApplyArgs(['--github-event', '--source', 'en'])).toThrow(
    '--github-event needs --locales and --source.'
  );
  expect(() => parseApplyArgs(['--github-event', '--locales', 'locales'])).toThrow(
    '--github-event needs --locales and --source.'
  );
  // exit codes: runApplyCommand with runGitHubEventApply mocked as `mockedRun`
  // (vi.mock('../../src/codemod/apply/github-event.js', () => ({ runGitHubEventApply: vi.fn() })) in apply-cli.test.ts)
  for (const [result, code] of [
    ['error', 1],
    ['wrong-repo', 1],
    ['pr', 0],
    ['waiting-for-maintainer', 0],
    ['ignored', 0],
  ] as const) {
    process.exitCode = 0;
    mockedRun.mockResolvedValueOnce(result);
    await runApplyCommand(['--github-event', '--locales', 'locales', '--source', 'en']);
    expect(process.exitCode).toBe(code);
  }
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/apply-github-event.test.ts tests/unit/apply-cli.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement, and wire `runApplyCommand` for `--github-event`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(action): turn LiveLocale issues into one-commit pull requests`.

---

### Task 58: `init --share`

**Files:**

- Create: `src/codemod/init-share.ts`.
- Modify: `src/server/module-dir.ts` to add `readOwnVersion`.
- Modify: `src/codemod/index.ts` for the `init --share` flags and help.
- Modify: `README.md` (CLI Reference: `### init --share`, with the spec §3 stack table) and `tests/integration/cli-package.test.ts`.
- Test: Create `tests/unit/init-share.test.ts`.

**Interfaces:**

- Consumes:
  - `detectBuildTarget`, `findExportBlockingRoute` (Task 18)
  - `GitRunner`, `runGit`, `fakeGit` (Task 16)
  - `moduleDir` (Task 21)
  - `LOCALE_RE` (existing)
  - `stringifyLike` (existing)
  - the `liveLocaleVite({ share, sourceLocale })` options (Task 24)
  - the `pack` and `build` CLIs (Tasks 22, 23)
- Produces:
  ```ts
  // module-dir.ts
  export function readOwnVersion(): string; // package.json at path.resolve(moduleDir(), '../../package.json')
  // init-share.ts
  export type ShareStack = 'vite' | 'cra' | 'webpack' | 'next-export' | 'next-server' | 'unknown';
  export function detectShareStack(projectDir: string): { stack: ShareStack; evidence: string };
  export const CHECKOUT_ACTION =
    'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2';
  export interface WorkflowOptions {
    version: string;
    localesPath: string;
    sourceLocale: string;
    branches: string[];
    dir?: string;
  }
  export function renderWorkflow(o: WorkflowOptions): string;
  export function validateShareArgs(o: {
    localesPath: string;
    sourceLocale: string;
    branches: string[];
    dir?: string;
  }): void;
  export interface PlannedFile {
    path: string;
    action: 'create' | 'update' | 'unchanged' | 'skipped';
    content?: string;
    reason?: string;
  }
  export interface InitShareOptions {
    projectDir: string;
    localesPath?: string;
    sourceLocale?: string;
    branches?: string[];
    version: string;
    overwrite?: boolean;
    git?: GitRunner;
  }
  export async function planInitShare(
    o: InitShareOptions
  ): Promise<{ stack: ShareStack; files: PlannedFile[]; notes: string[] }>;
  export function writePlannedFiles(projectDir: string, files: PlannedFile[]): void;
  ```
- **Stack detection.** `detectShareStack` maps `detectBuildTarget`:
  - `next` with `staticExport` → `next-export`;
  - `next` → `next-server`;
  - `vite` → `vite`;
  - `cra` → `cra`;
  - `other` with a `webpack` or `@rsbuild/core` dependency, or a `webpack.config.*` file → `webpack`;
  - anything else → `unknown`.
- **Build changes per stack.**
  - **vite.** Replace the first match of `/liveLocaleVite\(\{\s*/` with `liveLocaleVite({ share: true, `, followed by `sourceLocale: '<s>', ` when the source locale is not `en`. Swallowing the whitespace after `{` keeps exactly one space before the next option.
    - If `share:` is already present, the file is `unchanged`.
    - If there is no `liveLocaleVite(` call, the file is `skipped`, with the note `Add liveLocaleVite({ localesPath: '<p>', share: true }) to the plugins array in vite.config.`
  - **cra and webpack.** Set `scripts.build` to `<existing> && livelocale pack <outDir> --locales <p> --source <s>`, where `<outDir>` is `build` for `cra` and `dist` for `webpack` (which includes `@rsbuild/core`), the default output folder of each. Skip this when the script already contains `livelocale pack`.
  - **next-export and next-server.** Set `scripts["build:preview"] = "livelocale build --preview --locales <p> --source <s> -- next build"`.
    - Both: append `public/livelocale/` to `.gitignore` when it is not already ignored, because `livelocale build` packs into `public/` for either one (spec §3: "a gitignored `public/livelocale/`").
    - next-export: when `findExportBlockingRoute` returns a file, add the note `Delete <file>: static export rejects POST routes, and livelocale build stops while it exists.`
    - next-server: add the note `Use "npm run build:preview" as the build command of your preview deployments.`
  - **unknown.** Notes only, with the custom-CI recipe from spec §3.
  - `package.json` is rewritten with `stringifyLike`.
- **Workflow.**
  - It is written to `<repoRoot>/.github/workflows/livelocale.yml` only when `git remote get-url origin` is a GitHub remote. `<repoRoot>` is `git rev-parse --show-toplevel`, or the project directory when that fails. Otherwise add the note `One-click pull requests need GitHub. Use: npx livelocale apply "<link>" --pr`.
  - An existing file with different content is `skipped` unless `overwrite` is set.
  - `--locales` and `--dir` are relative to the repository root, in POSIX form.
  - The default branch is, in order of preference: `git symbolic-ref --short refs/remotes/origin/HEAD` without the `origin/` prefix, then the current branch, then `main`. The default branch list is that one branch.
  - **Non-default branches.** For each branch in `--branches` other than the default branch, add the note ``Also merge .github/workflows/livelocale.yml into `<branch>`; pull requests into it run workflows from that branch, so LiveLocale cannot close their issues otherwise.`` A `pull_request: closed` run uses the workflow file of the PR's merge ref, which comes from the target branch (spec decision 4: the Action closes the issue itself).
  - The default locales folder is the first of `locales`, `src/locales`, `public/locales`, `src/i18n/locales` and `messages` that holds locale JSON. If none does, the error is `Pass --locales <path>.`
- **Argument safety.**
  - Paths and branches must match `/^[A-Za-z0-9_./-]+$/`, have no `..` segment, and not be absolute. A violation throws `` `<name> may only contain letters, digits, ".", "_", "-" and "/".` ``
  - The source locale must match `LOCALE_RE`.
  - At most 10 branches.
- **Template.**
  - This is the exact output.
  - It keeps every part the spec fixes, and adds three things:
    - the `pull_request: closed` trigger (needed for decision 4);
    - `persist-credentials: false`;
    - `--dir` only when the app is not at the repository root.

  ````yaml
  # Written by `npx livelocale init --share`. Turns LiveLocale change links into pull requests.
  # livelocale reads the link from the event file; it never reaches a shell command.
  name: LiveLocale
  on:
    issues: { types: [opened] }
    issue_comment: { types: [created] }
    pull_request: { types: [closed] }
    workflow_dispatch:
      { inputs: { link: { description: 'LiveLocale change link', required: true } } }
  permissions: { contents: write, pull-requests: write, issues: write }
  concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }
  jobs:
    apply:
      if: >-
        github.event_name == 'workflow_dispatch' ||
        (github.event_name == 'issues' && contains(github.event.issue.body, '```livelocale')) ||
        (github.event_name == 'issue_comment' && !github.event.issue.pull_request &&
         startsWith(github.event.comment.body, '/livelocale')) ||
        (github.event_name == 'pull_request' && startsWith(github.event.pull_request.head.ref, 'livelocale/issue-') &&
         github.event.pull_request.base.ref != github.event.repository.default_branch)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
          with: { persist-credentials: false }
        - run: npx --yes livelocale@{version} apply --github-event --locales {locales} --source {source} --branches {branches}{ --dir <dir>}
          env: { GITHUB_TOKEN: '${{ github.token }}' }
  ````

- [ ] **Step 0:** Verify the pinned SHA with `gh api repos/actions/checkout/git/ref/tags/v4.2.2 --jq .object.sha`. Expected: `11bd71901bbe5b1630ceea73d27597364c9af683`. If it differs, use the printed SHA in `CHECKOUT_ACTION`.
- [ ] **Step 1: Write the failing tests.** Fixture projects, each with `src/locales/en.json` and `src/locales/ar.json`:
  - `viteProject`: devDependency `vite`; `vite.config.ts` contains `plugins: [react(), liveLocaleVite({ localesPath: './src/locales' })]`.
  - `craProject`: dependency `react-scripts`; `scripts.build` is `react-scripts build`.
  - `webpackProject`: devDependency `webpack`; `scripts.build` is `webpack --mode production`.
  - `nextProject`: dependency `next`; `next.config.mjs` without `output`. `nextExportProject`: `next.config.mjs` with `output: 'export'`. `nextExportWithPostRoute`: the same plus `app/api/livelocale/route.ts` exporting `POST`.
  - `git` is `fakeGit({ 'remote get-url origin': 'https://github.com/acme/site.git', 'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main' })`, so the repository root falls back to the project directory and the default branch is `main`.
  ```ts
  expect(detectShareStack(viteProject).stack).toBe('vite');
  expect(detectShareStack(nextExportProject).stack).toBe('next-export');
  expect(detectShareStack(nextProject).stack).toBe('next-server');
  expect(detectShareStack(craProject).stack).toBe('cra');
  expect(detectShareStack(webpackProject).stack).toBe('webpack');
  const vite = await planInitShare({ projectDir: viteProject, version: '0.10.0', git });
  expect(fileOf(vite, 'vite.config.ts').content).toContain(
    "liveLocaleVite({ share: true, localesPath: './src/locales' })"
  );
  expect(
    fileOf(
      await planInitShare({ projectDir: viteProject, sourceLocale: 'ar', version: '0.10.0', git }),
      'vite.config.ts'
    ).content
  ).toContain("share: true, sourceLocale: 'ar', ");
  expect(
    fileOf(await planInitShare({ projectDir: craProject, version: '0.10.0', git }), 'package.json')
      .content
  ).toContain(
    '"build": "react-scripts build && livelocale pack build --locales src/locales --source en"'
  );
  expect(
    fileOf(
      await planInitShare({ projectDir: webpackProject, version: '0.10.0', git }),
      'package.json'
    ).content
  ).toContain(
    '"build": "webpack --mode production && livelocale pack dist --locales src/locales --source en"'
  );
  expect(
    (
      await planInitShare({ projectDir: nextExportWithPostRoute, version: '0.10.0', git })
    ).notes.join('\n')
  ).toMatch(/static export rejects POST routes/);
  expect(
    fileOf(await planInitShare({ projectDir: nextProject, version: '0.10.0', git }), '.gitignore')
      .content
  ).toContain('public/livelocale/');
  expect(
    fileOf(
      await planInitShare({ projectDir: nextExportProject, version: '0.10.0', git }),
      '.gitignore'
    ).content
  ).toContain('public/livelocale/');
  expect(
    (
      await planInitShare({
        projectDir: viteProject,
        branches: ['main', 'staging'],
        version: '0.10.0',
        git,
      })
    ).notes
  ).toContain(
    'Also merge .github/workflows/livelocale.yml into `staging`; pull requests into it run workflows from that branch, so LiveLocale cannot close their issues otherwise.'
  );
  expect(
    (await planInitShare({ projectDir: viteProject, version: '0.10.0', git })).notes.join('\n')
  ).not.toContain('Also merge');
  const wf = renderWorkflow({
    version: '0.10.0',
    localesPath: 'src/locales',
    sourceLocale: 'en',
    branches: ['main', 'staging'],
  });
  expect(wf).toContain(
    '      - run: npx --yes livelocale@0.10.0 apply --github-event --locales src/locales --source en --branches main,staging\n'
  );
  expect(wf).toContain(
    "concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }"
  );
  expect(wf).toContain('permissions: { contents: write, pull-requests: write, issues: write }');
  expect(wf).toMatch(/actions\/checkout@[0-9a-f]{40} # v4\.2\.2/);
  expect(wf).not.toContain('pull_request_target');
  for (const line of wf.split('\n').filter((l) => /\brun:/.test(l)))
    expect(line).not.toContain('${{');
  expect(() =>
    validateShareArgs({ localesPath: 'x; rm -rf ~', sourceLocale: 'en', branches: ['main'] })
  ).toThrow(/may only contain/);
  expect(() =>
    validateShareArgs({ localesPath: 'locales', sourceLocale: 'en', branches: ['$(id)'] })
  ).toThrow();
  const gl = await planInitShare({
    projectDir: viteProject,
    version: '0.10.0',
    git: gitWithOrigin('git@gitlab.com:a/b.git'),
  });
  expect(gl.files.some((f) => f.path.endsWith('livelocale.yml'))).toBe(false);
  expect(gl.notes.join()).toContain('apply "<link>" --pr');
  expect(readOwnVersion()).toMatch(/^\d+\.\d+\.\d+/);
  ```
  The packaged CLI test runs `init --share --locales locales --source en` in a temp Vite project whose git origin is `https://github.com/acme/site.git`. Expected: status 0, `.github/workflows/livelocale.yml` exists, and it pins `livelocale@<package.json version>`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/init-share.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement.** `init --share [--locales] [--source] [--branches a,b] [--overwrite] [--dir]` does the following:
  1. Prints each planned file with its action, then the notes.
  2. Prints `Commit and push: the workflow must be on the default branch.`

  Plain `init` is unchanged.

- [ ] **Step 4:** Run `npx vitest run tests/unit/init-share.test.ts`, then `npm run build && npx vitest run tests/integration/cli-package.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(cli): init --share sets up the build and the GitHub workflow`.

---

### Task 59: Live-now and "changed by someone else" reconciliation

**Files:**

- Modify: `src/studio/transport/drafts.ts`, `src/studio/transport/static.ts`, `hooks/useDrafts.ts`, `components/DraftList.tsx`, `hooks/useStudio.ts`
- Test: Extend `tests/unit/studio-draft-model.test.ts`, `tests/unit/studio-static-transport.test.ts`, `tests/unit/studio-bootstrap.test.ts`, `tests/unit/studio-drafts-hook.test.tsx` and `tests/unit/draft-list.test.tsx`

**Interfaces:**

- Consumes: `parseShareManifest` (Task 11); `lookupKey` (Task 1); `DRAFT_STATUS_LABELS` (Task 39).
- Produces:
  ```ts
  // drafts.ts
  export type DraftVerdict = 'pending' | 'live' | 'conflict';
  export function reconcileDraft(draft: Pick<Draft, 'from' | 'to'>, current: string | undefined): DraftVerdict;
  // current === to → live; (current ?? null) === from → pending; else conflict
  // static.ts
  export const MANIFEST_REFRESH_INTERVAL_MS = 60_000;
  export interface ReconcileResult { live: Draft[]; conflicts: Draft[] }
  // on StaticTransport:
  readonly initialReconcile: ReconcileResult;          // computed inside createStaticTransport
  refreshManifest(): Promise<ReconcileResult | null>;  // null = not due, unchanged, invalid, or fetch failed
  // useDrafts gains: liveNow: Draft[]; noteReconcile(result: ReconcileResult): void; dismissLiveNow(): void
  // DraftList gains: liveNow?: Draft[]; onDismissLiveNow?(): void   (rows labelled DRAFT_STATUS_LABELS.live)
  ```
- **Reconcile.** It runs per draft in the transport's scope, against the **built** value: the `lookupKey` string, otherwise `undefined`.
  - A draft whose locale is no longer in `manifest.locales` becomes a conflict.
  - `live` drafts are deleted.
  - `conflict` drafts are stored with `conflict: true`.
  - Locales whose file fails to load are skipped and never deleted.
  - The transport dispatches once if anything changed.
- **`refreshManifest`.**
  - It runs at most once per 60,000 ms, measured from the last fetch; creating the transport counts as a fetch.
  - It GETs `manifest.json` relative to `studioUrl` with `{ cache: 'no-store', credentials: 'same-origin' }`.
  - If the text is identical, it returns `null`.
  - Otherwise it parses the new manifest, replaces the old one, clears the dictionary cache, reconciles and returns the result.
- **`useStudio`.** On each change of `currentPath` while connected in static mode, it calls `refreshManifest()`. A non-null result triggers `noteReconcile` and then `refreshAll()`. `useDrafts` starts with `liveNow = transport.initialReconcile.live`.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it.each([['Bonjour', 'live'], ['Hello', 'pending'], ['Salut', 'conflict'], [undefined, 'conflict']])('current %s -> %s', (cur, v) =>
    expect(reconcileDraft({ from: 'Hello', to: 'Bonjour' }, cur)).toBe(v));
  it('treats a new key (from null) as pending until the build contains it', () => {
    expect(reconcileDraft({ from: null, to: 'Bonjour' }, undefined)).toBe('pending');
    expect(reconcileDraft({ from: null, to: 'Bonjour' }, 'Bonjour')).toBe('live');
    expect(reconcileDraft({ from: null, to: 'Bonjour' }, 'Salut')).toBe('conflict');
  });
  it('drops drafts the rebuilt site already shows', async () => {   // store: ar/home.title from 'Hello' to 'مرحبا'
    const t = await make({ store });
    expect(t.initialReconcile.live.map((d) => d.key)).toEqual(['home.title']); expect(await t.listDrafts()).toEqual([]);
  });
  it('flags drafts whose built value changed under them', ...);     // from 'Old' to 'X', built 'مرحبا' → conflicts[0].conflict true; still listed
  it('leaves pending drafts alone', ...);                           // from 'مرحبا' to 'X', built 'مرحبا' → { live: [], conflicts: [] }; draft listed with conflict false
  it('flags drafts for a locale the build no longer has', ...);     // locale 'fr' → conflict
  it('never drops drafts when a locale file fails to load', ...);   // ar.json 500 → { live: [], conflicts: [] }; draft kept
  it('ignores drafts from another scope', ...);                     // store holds a 'acme/other' draft that the build already shows → not in live; still in store.list('acme/other')
  it('refreshes at most once a minute and only when the manifest changed', async () => {
    now = 1000 + 1_000; expect(await t.refreshManifest()).toBeNull(); expect(fetch).not.toHaveBeenCalledWith(MANIFEST_URL, expect.anything());
    now = 1000 + 60_000; /* same text */ expect(await t.refreshManifest()).toBeNull();
  });
  it('reconciles against a rebuilt manifest and refetches locale files', ...); // base SHA_B, ar.json now 'أهلاً' → live [draft]; t.manifest.base SHA_B
  it('keeps the old manifest when the new one is invalid', ...);    // '{"format":9}' → null; t.manifest.base SHA_A
  // bootstrap
  it('never rejects when start-up reconciliation cannot load a locale', ...); // ar.json 500 → kind 'static'; pre-seeded ar draft still listed
  // useDrafts / DraftList
  it('surfaces start-up live drafts and lets the translator dismiss them', ...); // liveNow = initialReconcile.live; dismissLiveNow → []
  it('labels live entries "Live now" without an action button', ...); // DraftList liveNow [d] → row text 'Live now'; no Undo or Remove button in that row
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/studio-draft-model.test.ts tests/unit/studio-static-transport.test.ts tests/unit/studio-bootstrap.test.ts tests/unit/studio-drafts-hook.test.tsx tests/unit/draft-list.test.tsx`. Expected: FAIL, because `reconcileDraft` is not exported and `initialReconcile` is undefined.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): mark drafts live or changed after a rebuild`.

---

### Task 60: GitHub issue request and `GitHubIssueAction`

**Files:**

- Create: `src/studio/share/github-issue.ts`, `src/studio/features/dashboard/components/GitHubIssueAction.tsx`
- Test: Create `tests/unit/share-github-issue.test.ts` and `tests/unit/github-issue-action.test.tsx`

**Interfaces:**

- Consumes: `copyText` (Task 38); `fencedChangeBlock`, `isValidRepoSlug` (Task 5).
- Produces:
  ```ts
  export const MAX_ISSUE_URL_LENGTH = 8000;
  export const MAX_ISSUE_BODY_CHARS = 65536;
  export const PASTE_HERE_BODY =
    'Paste here: your clipboard holds the LiveLocale change block (Ctrl+V, or Cmd+V on Mac).\n';
  export function normalizeRepoSlug(input: string): string | null;
  export function resolveReviewRepo(
    manifestRepo: string | undefined,
    remembered: string | null
  ): string | null; // manifestRepo ?? remembered
  export function issueTitle(count: number, by?: string): string;
  export interface IssueRequest {
    url: string | null;
    clipboard: string | null;
    tooLarge: boolean;
  }
  export function buildIssueRequest(
    repo: string,
    token: string,
    count: number,
    by?: string
  ): IssueRequest;
  export const GitHubIssueAction: (p: {
    repo: string;
    token: string;
    count: number;
    by?: string;
    label: string;
    onOpened?: () => void;
  }) => JSX.Element;
  ```
- **`normalizeRepoSlug`.** It accepts `owner/repo`, `https://github.com/owner/repo`, an optional `.git` suffix, `git@github.com:owner/repo.git` and a trailing slash. It returns the result only when `isValidRepoSlug` passes, and `null` otherwise.
- **`issueTitle`.**
  - `LiveLocale: 1 translation change` or `LiveLocale: N translation changes`, followed by ` from <by>`.
  - Before use, `by` has control characters and bidi controls (U+202A–U+202E, U+2066–U+2069) removed, whitespace collapsed, and is cut to 40 characters.
- **`buildIssueRequest`.**
  - The URL is `` `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(fencedChangeBlock(token))}` ``.
  - It carries only `title` and `body`, never `labels`, `assignees`, `template` or `milestone`.
  - When the URL would exceed 8,000 characters, the body becomes `PASTE_HERE_BODY` and `clipboard` holds the fenced block.
  - When the block is longer than 65,536 characters, it returns `{ url: null, clipboard: null, tooLarge: true }`.
- **`GitHubIssueAction`.**
  - **When the block fits:** a direct `<a href target="_blank" rel="noopener noreferrer">{label}</a>`, with `onOpened` called on click.
  - **When the clipboard fallback applies:**
    1. Step 1 is the button "Copy change block".
    2. On success, step 2 is the anchor "Open GitHub and paste".
    3. On failure, a read-only `<textarea data-testid="manual-copy">` holds the block, next to the same anchor.
  - **When `tooLarge`:** "Too large for a GitHub issue. Run npx livelocale apply with this link instead."

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('normalizes slugs and GitHub URLs'); // 'https://github.com/acme/web.git' → 'acme/web'; 'git@github.com:acme/web.git' → 'acme/web'
  it('rejects anything that is not owner/repo'); // 'acme', 'acme/web/x', '-acme/web', 'acme/..', 'https://gitlab.com/acme/web' → null
  it('prefers the manifest repo over the remembered one'); // ('acme/web','acme/old') → 'acme/web'; (undefined,'acme/old') → 'acme/old'; (undefined,null) → null
  it('puts only title and body in the URL'); // [...new URL(r.url!).searchParams.keys()] toEqual ['title','body']; pathname '/acme/web/issues/new'; body === fencedChangeBlock('lc1.abc')
  it('titles by count and sender'); // issueTitle(1) 'LiveLocale: 1 translation change'; issueTitle(3,'Sara') '… changes from Sara'; issueTitle(1,'\u202Eevil') '… change from evil'
  it('moves the block to the clipboard past 8000 characters'); // token 'lc1.' + 'A'.repeat(9000) → url body param === PASTE_HERE_BODY; url.length <= 8000; clipboard === fencedChangeBlock(token); tooLarge false
  it('refuses blocks above 65536 characters'); // token 'lc1.' + 'A'.repeat(70_000) → { url: null, clipboard: null, tooLarge: true }
  it('links straight to GitHub when the block fits'); // short token → one <a target="_blank" rel="noopener noreferrer"> with the label; click → onOpened called; no 'Copy change block' button
  it('copies first, then shows the link, when the URL is too long'); // long token, copyText → true: 'Copy change block' → copyText(block) → 'Open GitHub and paste' anchor appears
  it('shows the block for manual copy when copying fails'); // long token, copyText → false: getByTestId('manual-copy') value === block, readOnly; 'Open GitHub and paste' anchor shown
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/share-github-issue.test.ts tests/unit/github-issue-action.test.tsx`. Expected: FAIL, because the module is missing.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): build pre-filled GitHub issue links with a clipboard fallback`.

---

### Task 61: "Open on GitHub" in the Send dialog

**Files:**

- Modify: `src/studio/features/dashboard/components/SendDialog.tsx`
- Test: Extend `tests/unit/send-dialog.test.tsx`

**Interfaces:**

- Consumes: `GitHubIssueAction` (Task 60); `ShareManifest.repo` (Task 11).
- Produces:
  - When `manifest?.repo` is set (decision 5: `exposeRepo: true`), the dialog renders `<GitHubIssueAction repo={manifest.repo} token count={included.length} by label="Open on GitHub" onOpened={() => onMarkSent(included)} />`.
  - It also shows the hint "Press “Submit new issue” on GitHub. A pull-request link appears as a comment about a minute later."

- [ ] **Step 1: Write the failing tests.** Replace `has no Open on GitHub action yet` with these tests:
  ```ts
  it('shows Open on GitHub only when the manifest exposes the repo'); // no repo → null; repo 'acme/web' → href startsWith 'https://github.com/acme/web/issues/new?'
  it('marks the drafts sent when the issue page opens'); // click anchor → onMarkSent(included)
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/send-dialog.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): let translators with GitHub access open the issue themselves`.

---

### Task 62: "Create pull request" in Review mode

**Files:**

- Create: `src/studio/features/dashboard/components/RepoPrompt.tsx`
- Modify: `components/ReviewPanel.tsx` (fills `actions`), `useStudio.ts`, `app.tsx`, `index.ts`
- Test: Extend `tests/unit/review-panel.test.tsx`

**Interfaces:**

- Consumes: `GitHubIssueAction`, `normalizeRepoSlug`, `resolveReviewRepo` (Task 60); `readPref`, `writePref` (Task 38); `ReviewState` (Task 43).
- Produces:
  ```ts
  export const RepoPrompt: (p: { initial?: string; onSave(slug: string): void }) => JSX.Element;
  // ReviewPanel gains: repo: string | null; repoFromManifest: boolean; onRepoChange(slug: string): void
  ```
- **Repository (decision 2).**
  - `repo = resolveReviewRepo(manifest?.repo, readPref('github-repo'))`.
  - When it is `null`, `RepoPrompt` asks "Which GitHub repository should get the pull request?", with the placeholder `owner/repo`.
    - The field is prefilled with `set.repo` when the link carries one, but the developer must confirm it.
  - Save runs `normalizeRepoSlug`.
    - A `null` result shows "Enter it as owner/repo, for example acme/website."
    - A valid slug is stored with `writePref('github-repo', slug)`.
  - A "Change" control sits next to a remembered repo, but not next to a manifest repo.
- **GitHub target** (`review.target === 'github'`).
  - The panel renders `<GitHubIssueAction repo token count={set.edits.length} by={set.by} label="Create pull request"/>`.
  - The hint reads "Then press Submit on GitHub. The pull request opens in about a minute."
  - Below the existing command-line block it adds: "Issues turned off? Actions → LiveLocale → Run workflow, then paste the link."

- [ ] **Step 1: Write the failing tests.**
  ```ts
  it('asks for the repository once and remembers it'); // repo null → prompt; type 'https://github.com/acme/web' → onRepoChange('acme/web')
  it('rejects a malformed repository'); // 'acme' → 'Enter it as owner/repo, for example acme/website.'
  it('prefills but does not trust the repo inside the link'); // set.repo 'evil/x' → input value 'evil/x'; no GitHub link until Save
  it('links Create pull request to the pre-filled issue'); // repo 'acme/web' → anchor pathname '/acme/web/issues/new'
  it('offers Run workflow when issues are off'); // target 'github', repo 'acme/web' → text 'Issues turned off? Actions → LiveLocale → Run workflow, then paste the link.'
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/review-panel.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): one-click pull request from Review mode`.

---

### Task 63: Import change link and local apply in the dev Studio

**Files:**

- Create: `src/studio/features/dashboard/components/ImportChangeDialog.tsx`
- Modify: `hooks/useReview.ts` (local apply), `components/ReviewPanel.tsx` (local actions), `Header.tsx`, `app.tsx`, `useStudio.ts`, `index.ts`
- Test: Create `tests/unit/import-change-dialog.test.tsx` and `tests/e2e/import-change-link.spec.ts`. Extend `tests/unit/studio-review.test.tsx` and `tests/unit/review-panel.test.tsx`.

**Interfaces:**

- Consumes:
  - `openReview`, `ReviewState` (Task 43)
  - `buildReviewRows`, `REVIEW_STATUS_LABELS` (Task 42)
  - `describeLinkError` (Task 38)
  - `DraftList.onReviewChange` (Task 39)
  - `findChangeToken`, `encodeChangeLink` (Tasks 5, 7; the E2E encodes in Node)
  - `sourceReference` (Task 3)
  - existing `saveTranslation`
- Produces:
  ```ts
  export type ApplyResult =
    | { state: 'applied' }
    | { state: 'skipped'; reason: string }
    | { state: 'failed'; message: string };
  // useReview gains (params): onApplied?: (c: { locale: string; key: string; previousValue: string; nextValue: string }) => void
  // useReview gains (return): applyLocal(o: { includeForced: boolean }): Promise<void>; applyResults: Record<string, ApplyResult>; isApplying: boolean
  export const ImportChangeDialog: (p: {
    isOpen: boolean;
    onClose(): void;
    onSubmit(text: string): Promise<boolean>;
    error: string | null;
  }) => JSX.Element | null;
  // Header: onImport?: () => void → button #studio-import-button "Import change link" (development mode only)
  ```
- **`applyLocal`** (local target only).
  - Rows are applied in order, one at a time.
  - Which rows are saved:
    - Every row with status `apply` is saved with `saveTranslation(locale, key, to, { reference: sourceReference(key, ctx) ?? undefined })`.
    - When `includeForced` is set, rows with status `needs-force` are saved too, with `{ force: true }`.
  - A save that succeeds records `applied` and calls `onApplied`. A save that throws records `failed` with the error message, and the batch continues.
  - Any other row is `skipped`:
    - A forced row that was not included gets the reason `Saved with “Save anyway”; tick the box to include it.`
    - Every other skipped row gets `REVIEW_STATUS_LABELS[status]` as its reason.
  - When the batch ends, current values are reloaded and the rows are rebuilt.
- **Local actions in `ReviewPanel`.**
  - Button `#studio-apply-local` reads "Apply N changes to local files", where N counts the ready rows plus the forced rows when the box is ticked.
  - The checkbox "Include M changes saved with “Save anyway”" appears when M > 0.
  - After applying, each row shows its result chip.
- **Dialog.**
  - It has a textarea "Paste a change link" (`#studio-import-text`) and a file input "or choose a file" (`accept=".txt,text/plain"`). A chosen file is read with `file.text()` into the textarea.
  - "Review changes" is disabled while the textarea is empty.
  - When `onSubmit` returns `false`, the dialog stays open and shows `error`.
- **Development mode.** `onSubmit` calls `openReview(text)`, which uses the local target.
- **Static mode.**
  - Changes → "Review a change link or file" opens the dialog.
  - `onSubmit` sets `location.hash = findChangeToken(text)`, so the review URL stays shareable.
  - If `findChangeToken` throws, `onSubmit` returns `false` with `describeLinkError`.

- [ ] **Step 1: Write the failing tests.**
  - Unit tests:
    ```ts
    it('applies ready rows locally and skips the rest'); // mode 'development'; POST bodies in order; forced skipped unless includeForced
    it('records a failed save without stopping the batch'); // first POST 422 → failed with message; second applied
    it('submits pasted text and closes on success'); // 'Review changes' disabled while empty; type 'lc1.abc' → enabled; click → onSubmit('lc1.abc'); resolves true → onClose called
    it('loads a chosen file into the box'); // new File(['https://x/livelocale/index.html#lc1.abc\n'],'c.txt') → textarea contains 'lc1.abc'
    it('stays open and shows the error when the link cannot be read'); // onSubmit resolves false, error 'No change link found. A change link contains "lc1.".' → onClose not called; that text shown
    it('shows Import change link in the header in development mode only'); // mode 'development' + onImport → #studio-import-button; mode 'static' or 'preview' → absent
    ```
  - E2E against the Next playground and the dev Studio. Snapshot and restore `playground/locales/en.json`, as TST-006 requires.
    ```ts
    const token = await encodeChangeLink({
      branch: '',
      base: '',
      src: 'en',
      by: '',
      note: '',
      edits: [
        {
          locale: 'en',
          key: 'home.welcome_msg',
          from: 'Welcome Back to Production',
          to: 'Welcome back, translator',
          force: false,
        },
      ],
    });
    // click #studio-import-button → fill #studio-import-text with token → 'Review changes'
    // expect row 'home.welcome_msg' with 'Ready'; click #studio-apply-local
    // expect JSON.parse(en.json).home.welcome_msg === 'Welcome back, translator'
    ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/import-change-dialog.test.tsx tests/unit/studio-review.test.tsx tests/unit/review-panel.test.tsx` and `npx playwright test tests/e2e/import-change-link.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire.
- [ ] **Step 4:** Run both commands. Expected: PASS.
- [ ] **Step 5:** Commit `feat(studio): import a change link into the local Studio`.

---

### Task 64: Milestone B end-to-end checks

**Files:**

- Modify: `tests/e2e/static-share.spec.ts`

**Interfaces:**

- Consumes:
  - the Task 50 fixture, which is writable at `playground-vite/dist/livelocale/`;
  - Live-now reconciliation (Task 59);
  - Create pull request (Task 62).
- Snapshot `playground-vite/dist/livelocale/manifest.json` and `locales/ar.json` in `beforeEach`, and restore them in `afterEach`.

- [ ] **Step 1: Write the tests** (expected to pass once Tasks 59–62 are wired; Step 2 checks that wiring first).
  - `test('drops a draft once the rebuilt site shows it')`:
    1. Save `ar/home.title` as `أهلاً`, as in Task 50.
    2. Rewrite `ar.json` with `home.title: 'أهلاً'` and the manifest `base` as `'b'.repeat(40)`, then reload.
    3. Expect the draft rows to be `[]`, and Changes to show `Live now` until dismissed.
  - `test('flags a draft changed by someone else')`:
    1. Save the same draft.
    2. Rewrite `ar.json` with `home.title: 'سلام'`, then reload.
    3. Expect the draft row to have `conflict: true`, and Changes to show `Changed by someone else, please check`.
  - `test('developer creates the pull request on GitHub')`. Use a fresh context with `context.route('https://github.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }))`.
    1. Open a Node-encoded link with `by: 'Sara'`.
    2. In the repo prompt, enter `acme/web` and Save.
    3. Click "Create pull request" and capture the popup URL. Expect the pathname `/acme/web/issues/new`, the search keys `['title','body']`, the title `LiveLocale: 1 translation change from Sara`, and a body starting with `'```livelocale\nlc1.'`.
    4. Reload. Expect no prompt, because the repo is remembered.
- [ ] **Step 2: Check the wiring these tests rely on.** Run each search below. Expected: each prints at least one match. When one prints nothing, add exactly that item in the named file (owned by the named task) and change nothing else.

  | E2E relies on                             | Owner   | Search                                                                                                                            |
  | ----------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | manifest refreshed on navigation          | Task 59 | `grep -n "refreshManifest" src/studio/features/dashboard/hooks/useStudio.ts`                                                      |
  | start-up live drafts surfaced             | Task 59 | `grep -n "initialReconcile" src/studio/features/dashboard/hooks/useDrafts.ts`                                                     |
  | `Live now` rows in Changes                | Task 59 | `grep -n "liveNow" src/studio/features/dashboard/components/DraftList.tsx`                                                        |
  | conflict label                            | Task 39 | `grep -n "Changed by someone else, please check" src/studio/features/dashboard/components/DraftList.tsx`                          |
  | repo prompt with `owner/repo` placeholder | Task 62 | `grep -n "owner/repo" src/studio/features/dashboard/components/RepoPrompt.tsx`                                                    |
  | repo remembered                           | Task 62 | `grep -n "github-repo" src/studio/features/dashboard/components/ReviewPanel.tsx src/studio/features/dashboard/hooks/useStudio.ts` |
  | `Create pull request` action              | Task 62 | `grep -n "Create pull request" src/studio/features/dashboard/components/ReviewPanel.tsx`                                          |
  | issue link opens a popup                  | Task 60 | `grep -n "_blank" src/studio/features/dashboard/components/GitHubIssueAction.tsx`                                                 |

- [ ] **Step 3:** Run `npx playwright test tests/e2e/static-share.spec.ts`. Expected: PASS, including the three new tests.
- [ ] **Step 4:** Run `npx playwright test`. Expected: every spec passes.
- [ ] **Step 5:** Commit `test(e2e): cover live-now, conflicts and the pull-request handoff`.

---

### Task 65: Docs for milestone B

**Files:**

- Modify: `README.md`, `ARCHITECTURE.md`
- Test: Extend `tests/unit/readme-share.test.ts`

**Interfaces:**

- Consumes: `renderWorkflow`, `CHECKOUT_ACTION` (Task 58).
- **README additions to "Share link on any host":**
  - **Intro.** The section opens with the approved positioning line (spec decision 1): "Translators fix text on your live site with no account, and every fix becomes a pull request with one click."
  - **Setup.** `npx livelocale init --share` becomes the first step, followed by the commit-and-push note that the workflow must be on the default branch. The workflow appears in a ` ````yaml ` block that equals `renderWorkflow({ version: 'X.Y.Z', localesPath: 'locales', sourceLocale: 'en', branches: ['main'] })`.
  - **The one-checkbox setting.** "Allow GitHub Actions to create and approve pull requests", plus the compare-link fallback.
  - **Developer.**
    - "Create pull request" in Review mode.
    - Actions → LiveLocale → Run workflow.
    - The trust gate, and `/livelocale apply --force`.
    - Base branches through `--branches`, and how `Refs #n` differs from `Closes #n`. Then the Task 58 note, as one sentence: "Also merge .github/workflows/livelocale.yml into each extra branch; pull requests into it run workflows from that branch, so LiveLocale cannot close their issues otherwise."
  - **Run CI on LiveLocale PRs without the approval click** (subsection; spec §7: "an optional App token is available").
    - Why: pull requests opened with `GITHUB_TOKEN` start CI in an approval-required state; a GitHub App token does not.
    - Steps: create a GitHub App with Contents, Pull requests and Issues set to read and write, install it on the repository, and store its ID as the variable `LIVELOCALE_APP_ID` and its private key as the secret `LIVELOCALE_APP_PRIVATE_KEY`.
    - Then a ` ```yaml ` snippet (three backticks, so the Task 65 workflow-block test never matches it) that adds a step before the `apply` step and feeds its output to `GITHUB_TOKEN`:
      ```yaml
      - id: app-token
        uses: actions/create-github-app-token@<sha> # <tag>
        with:
          {
            app-id: '${{ vars.LIVELOCALE_APP_ID }}',
            private-key: '${{ secrets.LIVELOCALE_APP_PRIVATE_KEY }}',
          }
      - run: npx --yes livelocale@X.Y.Z apply --github-event --locales locales --source en --branches main
        env: { GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}' }
      ```
    - `<sha>` and `<tag>` are pinned in Step 0.
  - **Translators with GitHub access.** "Open on GitHub", available only with `exposeRepo: true`, and when to turn that on (decision 5).
  - **Honest risks.**
    - Issues in public repositories are public.
    - Bot PRs need "Approve workflows to run" (or the App token above).
    - Vercel may refuse commits by authors who are not team members.
    - One-click automation is GitHub-only, and other hosts use `apply --pr`.
- **ARCHITECTURE.md.**
  - Add the section "`apply` and the workflow": event → trigger → trust gate → decode → plan → one commit → PR or compare link → comment, plus the closed-PR issue closing.
  - Add `init --share` to §9.
  - Add three security rows:
    - `Trust gate | codemod/apply/github-trigger`
    - `Payload only from event file | init-share workflow template`
    - `Writes only under locales, new branch | codemod/apply/github-commit`

- [ ] **Step 0: Pin the App-token action.** Run `gh api repos/actions/create-github-app-token/releases/latest --jq .tag_name`, then `gh api repos/actions/create-github-app-token/git/ref/tags/<tag> --jq .object.sha`. Expected: a tag such as `v2.x.y`, then a 40-hex SHA. If the ref's `object.type` is `tag` (an annotated tag), run `gh api repos/actions/create-github-app-token/git/tags/<that sha> --jq .object.sha` to get the commit SHA. Use `actions/create-github-app-token@<commit sha> # <tag>` in the README snippet.
- [ ] **Step 1: Write the failing tests.**
  `````ts
  it('shows exactly the workflow init --share writes', () => {
    const block = /````yaml\n(# Written by `npx livelocale init --share`[\s\S]*?)````/.exec(
      readme
    )![1];
    expect(block).toBe(
      renderWorkflow({
        version: 'X.Y.Z',
        localesPath: 'locales',
        sourceLocale: 'en',
        branches: ['main'],
      })
    );
  });
  it('documents the PR setting and the force comment', () => {
    expect(readme).toContain('Allow GitHub Actions to create and approve pull requests');
    expect(readme).toContain('/livelocale apply --force');
  });
  it('uses the approved positioning line', () =>
    expect(readme).toContain('every fix becomes a pull request with one click'));
  it('explains the workflow must reach every extra target branch', () =>
    expect(readme).toContain('so LiveLocale cannot close their issues otherwise'));
  it('shows a pinned App-token step for CI without the approval click', () => {
    expect(readme).toContain('Run CI on LiveLocale PRs without the approval click');
    expect(readme).toMatch(/actions\/create-github-app-token@[0-9a-f]{40} # v\d+/);
    expect(readme).toContain("GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}'");
  });
  `````
- [ ] **Step 2:** Run `npx vitest run tests/unit/readme-share.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Write the sections.
- [ ] **Step 4:** Run `npx vitest run tests/unit/readme-share.test.ts && npm run format:check && npm run lint && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `docs: one-click pull requests on GitHub`.

---

### Task 66: Prerelease path to the `next` dist-tag in `publish.yml`

**Files:**

- Create: `scripts/dist-tag.mjs`
- Modify: `.github/workflows/publish.yml`
- Test: Create `tests/unit/dist-tag.test.ts`

**Interfaces:**

- Produces:
  - `export function distTagFor(version: string): 'latest' | 'next'`. It returns `'latest'` for `^\d+\.\d+\.\d+$` and `'next'` for `^\d+\.\d+\.\d+-next\.\d+$`, and throws `Unsupported version` otherwise.
  - `export function prereleaseVersion(base: string, n: number): string`. The `base` must match `^\d+\.\d+\.\d+$`.
  - CLI: `node scripts/dist-tag.mjs tag <version>` and `node scripts/dist-tag.mjs prerelease <base> <n>`.
- **Workflow changes:**
  - Add an optional `workflow_dispatch.inputs.prerelease_base`, with `description: 'Publish <base>-next.<run number> to the "next" dist-tag, e.g. 0.10.0'`.
  - Add a new step, "Set prerelease version", that runs only when the input is set. It uses `env: { BASE: ${{ inputs.prerelease_base }} }` and runs `npm version "$(node scripts/dist-tag.mjs prerelease "$BASE" "$GITHUB_RUN_NUMBER")" --no-git-tag-version`.
  - Insert it immediately after `Install Root Dependencies`, before `Build Library & Studio`, `Run Unit & Integration Tests` and `Check whether this version is already published`. Otherwise the published check reads `0.9.0`, which is already on npm, and skips the publish.
  - The publish step becomes `TAG=$(node scripts/dist-tag.mjs tag "$(node -p "require('./package.json').version")") && npm publish --provenance --tag "$TAG"`.
  - The "already published" check stays.
  - `next` builds get no commit, no changeset and no CHANGELOG entry.

- [ ] **Step 1: Write the failing test.**
  ```ts
  expect(distTagFor('0.10.0')).toBe('latest');
  expect(distTagFor('0.10.0-next.3')).toBe('next');
  expect(() => distTagFor('0.10.0-rc.1')).toThrow(/Unsupported version/);
  expect(prereleaseVersion('0.10.0', 17)).toBe('0.10.0-next.17');
  expect(() => prereleaseVersion('0.10', 1)).toThrow();
  const yml = fs.readFileSync('.github/workflows/publish.yml', 'utf-8');
  expect(yml).toContain('npm publish --provenance --tag "$TAG"');
  for (const l of yml.split('\n').filter((l) => /\brun:/.test(l)))
    expect(l).not.toContain('${{ inputs.');
  const at = (name: string) => yml.indexOf(`name: ${name}`);
  expect(at('Set prerelease version')).toBeGreaterThan(at('Install Root Dependencies'));
  expect(at('Set prerelease version')).toBeLessThan(at('Build Library & Studio'));
  expect(at('Set prerelease version')).toBeLessThan(
    at('Check whether this version is already published')
  );
  ```
- [ ] **Step 2:** Run `npx vitest run tests/unit/dist-tag.test.ts`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement the script and edit `publish.yml`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `ci: publish x.y.z-next.N prereleases to the next dist-tag`.

---

### Task 67: Sandbox smoke test on `livelocale@0.10.0-next.N`

**Files:** none in this repository. Record the results as a checklist in the milestone B pull request description.

**Interfaces:** consumes all of milestone B, published as `livelocale@0.10.0-next.<N>`.

The owner approved using `Araby99/Translation-Test`, adding the workflow there, opening test issues and ticking the PR-creation setting. Rules for this run:

- Use ports other than 3000 and 3010.
- Author commits to the demo with the owner's GitHub-linked email (it is in project memory), because Vercel blocks other authors.
- Do not delete branches or issues without the owner's OK.

- [ ] **S0.** The owner runs the dispatch: Actions → "Publish to NPM" → Run workflow on the milestone B branch, with `prerelease_base: 0.10.0`.
  - Then run `npm view livelocale dist-tags`.
  - Expected: `next: 0.10.0-next.<N>`, and `latest: 0.9.0` unchanged.
- [ ] **S1.** In a scratch clone, run `npm i livelocale@next && npx livelocale init --share --locales locales --source en`.
  - Commit `chore: enable LiveLocale share link` and push to `main`.
  - Expected: `.github/workflows/livelocale.yml` pins `livelocale@0.10.0-next.<N>`, and the Actions tab lists "LiveLocale".
- [ ] **S2.** Run `npx livelocale build --preview --locales locales --source en -- next build && npx next start -p 3030`.
  - Open `http://localhost:3030/livelocale/index.html`, Alt+Click an Arabic string and save.
  - Then press Send and Copy link.
  - Expected: the edit stays after a reload, and the link starts with `http://localhost:3030/livelocale/index.html#lc1.`.
- [ ] **S3 (compare fallback).** Keep the "Allow GitHub Actions to create and approve pull requests" setting off.
  - Open the link, enter Review mode, press Create pull request, enter `Araby99/Translation-Test`, and submit the prefilled issue.
  - Expected, within about a minute:
    - the run succeeds;
    - the branch `livelocale/issue-<n>` exists with one commit, authored by `Araby99 <…+Araby99@users.noreply.github.com>`, that carries a `Translated-by:` trailer;
    - the issue comment holds a working `/compare/main...livelocale/issue-<n>?quick_pull=1` link.
- [ ] **S4.** The owner ticks the setting. Open a second issue with the same link.
  - Expected: a PR into `main` whose body has `Closes #<n>`, the escaped table and the check line, plus an issue comment that links the PR.
  - A "workflows awaiting approval" prompt is acceptable; record it if it appears.
- [ ] **S5.** Check the Vercel preview for the PR branch.
  - Expected: a deployment is created, rather than a "commit author is not a member" refusal. This resolves spec risk 7.
- [ ] **S6.** Merge the PR. Expected: `Closes` closes the issue.
  - Then open a new issue with the same link.
  - Expected: the comment says there is nothing to apply, and no branch is created.
- [ ] **S7.** Save a value without `{name}` using "Save anyway", then Send and submit the issue.
  - Expected: the comment includes the `/livelocale apply --force` hint, and no commit is made.
  - Then comment `/livelocale apply --force`.
  - Expected: a commit on `livelocale/issue-<m>`, and the PR opens with the edit flagged `forced`: its Checks cell reads `Saved with “Save anyway”.` (Task 46).
- [ ] **S8.** Run Actions → LiveLocale → Run workflow and paste a fresh link.
  - Expected: a branch `livelocale/run-<id>`, a PR, and a job summary that shows the PR link.
- [ ] **S9 (optional).** Precondition: merge `.github/workflows/livelocale.yml` into `i18n/preview-edits` first, because a pull request into that branch runs the workflow file from it. Then build from `i18n/preview-edits`, with `--branches main,i18n/preview-edits` in the workflow.
  - Expected: the PR targets `i18n/preview-edits` with `Refs #<n>`.
  - After the merge, the Action closes the issue with state reason `completed`.
- [ ] **S10.** Close the leftover test issues and PRs.
  - Paste the S0–S9 results into the milestone B PR.
  - Expected: every row says pass or fail, or carries a note.

---

### Task 68: Release B (0.10.0)

**Files:**

- Create, then consume: `.changeset/one-click-pull-request.md`
- Modify: `CHANGELOG.md`, `package.json` and `package-lock.json` (version)

- [ ] **Step 1:** Read the S0–S10 checklist that Task 67 pasted into the milestone B PR. Expected: no row says fail. If one does, fix it in a new task before continuing.
- [ ] **Step 2: Full verification.** Run `npm run format:check && npm run lint && npm run typecheck && npm run build && npm run test:coverage && npx playwright test`. Expected: every command exits 0.
- [ ] **Step 3: Write `.changeset/one-click-pull-request.md`.** The front matter is `'livelocale': minor`, and the body uses the house style.
  - **Added**
    - `npx livelocale init --share`, which detects Vite, CRA/webpack, Next export or Next server, edits the build, and writes `.github/workflows/livelocale.yml`.
    - `apply --github-event`, with:
      - the trust gate;
      - one commit per batch on a `livelocale/issue-<n>` branch;
      - PR open or reuse, with the compare-link fallback;
      - check results and escaped tables;
      - `--branches` and closing the issue after merge.
    - "Create pull request" in Review mode.
    - "Open on GitHub" in Send, when `exposeRepo: true`.
    - Import change link in the local Studio.
    - "Live now" and "Changed by someone else" in Changes.
    - The `next` dist-tag prerelease path.
  - **Changed**
    - The GitHub REST helpers are shared between the preview gateway and `apply`.
- [ ] **Step 4:** Run `npx changeset version`. Expected: `0.10.0`. Hand-format the entry as `## [0.10.0] - <YYYY-MM-DD>`.
- [ ] **Step 5:** Commit `chore: release 0.10.0`.
- [ ] **Step 6: Hand off to the owner.** Do not create releases or publish.
  - The owner merges, then creates the GitHub release `v0.10.0`, which runs the `latest` publish.
  - Then run `npm view livelocale dist-tags`. Expected: `latest: 0.10.0`.

---

## Plan self-review

| Spec section                                                                                                                                                                                                                                                | Implemented by                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1 Recommendation (no server; Studio ships in the build; change link; one-click PR)                                                                                                                                                                         | Milestone A Tasks 11–52; Milestone B Tasks 53–68                                                                                                                                                                                                   |
| §2 step 1: open the link, no sign-up, site login carries over                                                                                                                                                                                               | 21 (share folder), 27 and 32 (static runtime), 50 (E2E)                                                                                                                                                                                            |
| §2 step 2: first-run tips and "Your name"                                                                                                                                                                                                                   | 41                                                                                                                                                                                                                                                 |
| §2 step 3: target language shown and detected from page text                                                                                                                                                                                                | 15 (visible texts), 33 (inference rules), 36 (header, picker)                                                                                                                                                                                      |
| §2 step 4: Alt+Click editor with chips and plural boxes                                                                                                                                                                                                     | existing editor; 13–14 (same-origin bridge), 34 (source-locale reference)                                                                                                                                                                          |
| §2 step 5: Save, placeholder message, "Save anyway"                                                                                                                                                                                                         | 3 (validateEdit), 30 (static save, force on the draft)                                                                                                                                                                                             |
| §2 step 6: changes survive reloads; unsent counter; Changes with Undo                                                                                                                                                                                       | 26 (IndexedDB), 35 (re-apply, counter, guard), 39 (DraftList, Undo, backup)                                                                                                                                                                        |
| §2 step 7: Send (Copy link, Download file, Open on GitHub)                                                                                                                                                                                                  | 38, 40; 60–61 (Open on GitHub)                                                                                                                                                                                                                     |
| §2 step 8: Sent, Live now, changed by someone else                                                                                                                                                                                                          | 30 (sent), 39 (labels), 59 (reconciliation)                                                                                                                                                                                                        |
| §2 developer: Review mode, Create pull request, `apply --pr`, Run workflow                                                                                                                                                                                  | 42–44, 62, 45–48, 57 (dispatch), 65 (docs)                                                                                                                                                                                                         |
| §3 developer setup: `init --share`, commit-and-push, build unchanged, `doctor`                                                                                                                                                                              | 58, 24, 22–23, 49                                                                                                                                                                                                                                  |
| §3 one-checkbox setting and compare-link fallback                                                                                                                                                                                                           | 54 (copy), 57 (fallback), 65 (docs)                                                                                                                                                                                                                |
| §3 other stacks (CRA `&&`, Next export, Next on Vercel, custom CI)                                                                                                                                                                                          | 22, 23, 18, 58, 51                                                                                                                                                                                                                                 |
| §3 workflow template; payload never interpolated into `run:`                                                                                                                                                                                                | 58 (template and test), 55 and 57 (reads `$GITHUB_EVENT_PATH` only)                                                                                                                                                                                |
| §4.1 Pack: Studio with `base './'` and fonts; manifest fields; `locales/`; `flag.js`; injection first in `<head>`; Next skips it                                                                                                                            | 19, 11, 16, 20, 21, 17, 24, 23                                                                                                                                                                                                                     |
| §4.2 Framed-only activation                                                                                                                                                                                                                                 | 12 (flag.js and E2E), 14 (client), 50 (visitor E2E)                                                                                                                                                                                                |
| §4.3 Same-origin Studio: relative app URL; manifest instead of injected config; `?app=` ignored; same-origin bridge default; a missing manifest names the fix and never points at localhost                                                                 | 27, 13, 14, 32, 50                                                                                                                                                                                                                                 |
| §4.4 Saving without a server: transport switch, extracted write rules, IndexedDB drafts with base SHA, `static` re-apply loop                                                                                                                               | 28, 2, 3, 25, 26, 29–32, 35                                                                                                                                                                                                                        |
| §4.5 Change link: payload, deflate, base64url, Adler-32 failure, ~6K file threshold                                                                                                                                                                         | 5–8, 38, 40                                                                                                                                                                                                                                        |
| §4.6 Turning it into a PR: issue URL with title and body only, clipboard fallback                                                                                                                                                                           | 60, 62                                                                                                                                                                                                                                             |
| §4.6 Action: trust gate, caps, re-validation, 3-way, one commit on a new branch, PR with `Closes #n`, escaped table, check results                                                                                                                          | 55, 7–8, 10, 56, 57, 46, 54                                                                                                                                                                                                                        |
| §4.6 Local CLI `apply --pr` on any host, with the same check results                                                                                                                                                                                        | 45–48, 46 (`summarizeCheck`)                                                                                                                                                                                                                       |
| §4.7 Closing the loop (Live now, changed by someone else)                                                                                                                                                                                                   | 59                                                                                                                                                                                                                                                 |
| §4.8 Server stacks unchanged; Next server uses the same `/livelocale/` link                                                                                                                                                                                 | 2 (byte-identical router tests), 9 (default unchanged), 14 (visual-sync), 23 (Next packs into `public/`)                                                                                                                                           |
| §4 reused modules (`resolveStudioOrigin`, `env.ts`, core validators, `file-mutator`, `github-gateway`, `git-client`, `check`, `doctor`)                                                                                                                     | 13, 12, 2–4, 9, 53, 48, 57, 49                                                                                                                                                                                                                     |
| §4 new-modules table                                                                                                                                                                                                                                        | save-rules 2–4; change-link 5–8; pack.ts 20–23; Vite build half 24; flag.js 12; static transport 25–36; Studio UI 37–44, 59–63; `apply` 45–48, 53–57; workflow and `init --share` 58; `FileMutator({ requireEnabled })` 9; doctor 49; tests 50, 64 |
| §5 credentials: none in link, build, host or browser; a leaked link only proposes                                                                                                                                                                           | 11 (`exposeRepo` default), 38 (change set without secrets), 51 (docs)                                                                                                                                                                              |
| §5 validation enforced by `apply`: formats, 10k values, ICU, recomputed parity, caps, flagged content (shown to the PR reviewer in the Checks column), `force` only for maintainers (the commenter is gated)                                                | 2–4, 6–8, 10, 46, 47, 55, 57                                                                                                                                                                                                                       |
| §5 PR body escaping (code spans, neutralised mentions and refs)                                                                                                                                                                                             | 46, 54                                                                                                                                                                                                                                             |
| §5 workflow hygiene: event file only, no `pull_request_target`, pinned SHA and version, `queue: max`, one commit per batch                                                                                                                                  | 55, 57, 58, 56                                                                                                                                                                                                                                     |
| §5 risk 1 (same origin): read-only diff before Send                                                                                                                                                                                                         | 40 (before/after list), 42–44                                                                                                                                                                                                                      |
| §5 risk 2 (public exposure): `noindex`, `exposeRepo: false`                                                                                                                                                                                                 | 19, 11, 20, 51                                                                                                                                                                                                                                     |
| §5 risk 3 (supply chain): CI trusted publishing with provenance                                                                                                                                                                                             | 66 (keeps `--provenance`), 52, 68                                                                                                                                                                                                                  |
| §5 risk 4 ("Sent" means handed over, not in a PR)                                                                                                                                                                                                           | 51 (docs)                                                                                                                                                                                                                                          |
| §5 risk 5 (drafts in one browser): IndexedDB, unsent banner, beforeunload, backup, stable alias URL                                                                                                                                                         | 26, 35, 39, 51 (branch alias)                                                                                                                                                                                                                      |
| §5 risk 7 (bot PR friction): compare fallback, maintainer as author with `Translated-by:`, Vercel check, approval click or optional App token                                                                                                               | 57, 56, 67 (S3–S5), 65                                                                                                                                                                                                                             |
| §6 host matrix: link ends in `index.html` (S3); base path (Pages); frame headers, service worker, Vercel wall; branch alias and password protection (Netlify, Cloudflare); Next export/server; GitLab via CLI                                               | 17, 21, 38, 33, 49, 23, 48, 51                                                                                                                                                                                                                     |
| §7 refuted findings: no token; reference recomputed; `force` ignored; `postbuild` avoided; flag.js base-aware; prefill without labels; permission fallback; `queue: max`; Next export guard; SW denylist; CI approval documented with an optional App token | 6, 3, 10, 22–23, 12, 17, 60, 55, 58, 18, 49, 65                                                                                                                                                                                                    |
| §8 rejected alternatives                                                                                                                                                                                                                                    | nothing is built for them; the plan adds no server, token, extension or relay                                                                                                                                                                      |
| §9 Milestone A scope                                                                                                                                                                                                                                        | Tasks 1–52, released as 0.9.0 in Task 52 after the Task 50 E2E                                                                                                                                                                                     |
| §9 Milestone B scope (workflow, buttons, dispatch, `init --share`, Import, Live now, smoke)                                                                                                                                                                 | Tasks 53–68, smoke-tested on `0.10.0-next.N` in Task 67, released as 0.10.0 in Task 68                                                                                                                                                             |
| §10 decision 1 (one developer click; positioning line)                                                                                                                                                                                                      | 62, 65                                                                                                                                                                                                                                             |
| §10 decision 2 (opt-in `share`, `exposeRepo: false`, repo asked once and remembered, `noindex`)                                                                                                                                                             | 24, 22, 11, 20, 62, 19                                                                                                                                                                                                                             |
| §10 decision 3 (one-click automation GitHub-only; `apply --pr` elsewhere)                                                                                                                                                                                   | 48, 58                                                                                                                                                                                                                                             |
| §10 decision 4 (link `branch`, allow-list, `Refs` vs `Closes`, Action closes non-default issues, said in the comment)                                                                                                                                       | 16, 20, 38, 55, 46, 54, 57, 58 (workflow on each extra branch), 65, 67 (S9)                                                                                                                                                                        |
| §10 decision 5 (Open on GitHub only with `exposeRepo: true`)                                                                                                                                                                                                | 61                                                                                                                                                                                                                                                 |
| §10 decision 6 (one app per repo; `src` informational; locales and source from arguments)                                                                                                                                                                   | 47, 57, 58                                                                                                                                                                                                                                         |

### Shared contracts (one name each)

| Module                                                         | Exports other tasks rely on                                                                                                                                                                                                                           | Task         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `src/core/json-path.ts`                                        | `KeyLookup`, `lookupKey`                                                                                                                                                                                                                              | 1            |
| `src/core/save-rules.ts`                                       | `WriteRuleCode`, `WriteVerdict`, `validateWrite`, `SourceContext`, `sourceReference`, `validateEdit`, `ContentRiskFlag`, `RISK_FLAG_MESSAGES`, `detectRiskFlags`                                                                                      | 2–4          |
| `src/core/change-link.ts`                                      | `CHANGE_LINK_PREFIX`, `CHANGE_BLOCK_OPEN`, `fencedChangeBlock`, `ChangeLinkError`, `findChangeToken`, `isValidRepoSlug`, `isValidBranchName`, `ChangeEdit`, `ChangeSet`, `parseChangeSet`, `toWire`, `encodeChangeLink`, `decodeChangeLink`, the caps | 5–7          |
| `src/core/change-link-node.ts`                                 | `nodeInflate`                                                                                                                                                                                                                                         | 8            |
| `src/core/apply-plan.ts`                                       | `EditStatus`, `RiskFlag`, `FLAG_MESSAGES`, `PlannedEdit`, `ApplyPlan`, `LocaleTarget`, `planApply`                                                                                                                                                    | 10           |
| `src/core/share-manifest.ts`                                   | `SHARE_DIR`, `SHARE_MANIFEST_FILE`, `SHARE_FLAG_FILE`, `SHARE_LOCALES_DIR`, `ShareManifest`, `isShareManifest`, `parseShareManifest`                                                                                                                  | 11           |
| `src/core/flag-script.ts`                                      | `FLAG_SCRIPT_SIGNATURE`, `FLAG_SCRIPT`                                                                                                                                                                                                                | 12           |
| `src/client/iframe-bridge.ts`                                  | `readSameOriginParent`, `resolveStudioOrigin(search, storage, sameOriginParent?)`, `VisibleText`, `MAX_VISIBLE_TEXTS`                                                                                                                                 | 13, 15       |
| `src/server/build-info.ts`                                     | `GitRunner`, `resolveBuildInfo`, `parseGitHubSlug` (+ test helper `fakeGit`)                                                                                                                                                                          | 16           |
| `src/server/share-html.ts`, `pack-error.ts`, `build-target.ts` | `normalizeBase`, `flagSrcFor`, `injectFlagScript`, `PackError`, `detectBuildTarget`, `findExportBlockingRoute`                                                                                                                                        | 17, 18       |
| `src/server/pack.ts`                                           | `collectShareData`, `packOutput`, `RELATIVE_BASE_WARNING`, `parseShareArgs`, `runBuildCommand`                                                                                                                                                        | 20–23        |
| `src/studio/transport/*`, `runtime.ts`, `config.ts`, `api.ts`  | `Draft`, `DraftStore`, `DetectedRuntime`, `StudioRuntime`, `detectStudioRuntime`, `isAppPreviewBlocked`, `StudioTransport`, `StaticTransport`, `DRAFTS_CHANGED_EVENT`                                                                                 | 25–32        |
| `src/codemod/apply/*`                                          | `readApplyInput`, report renderers, `summarizeCheck`, `runLocalApply`, `parseApplyArgs`, `prepareBranch(rest, baseName, base, targetSha, runId)`                                                                                                      | 45–48, 54–57 |

Cross-draft reconciliations made in this plan. Each item names the one name or behaviour that every task uses:

- **Manifest.** One manifest module, `src/core/share-manifest.ts`, with `format: 1`. `branch` and `base` may be null. It exports `isShareManifest` and `parseShareManifest`.
- **`flag.js`.** One base-agnostic file, `src/core/flag-script.ts`, which also never overwrites an existing flag.
- **Key lookup.** One `lookupKey` with `string`/`missing`/`occupied`.
- **Write validation.** One `validateWrite(input, options)` plus `validateEdit`. They are used by the static transport, Review rows and `apply` through the shared `planApply`.
- **Risk flags.** `detectRiskFlags` lives in `save-rules`. Every flag's copy, `forced` and `new-key` included, is `FLAG_MESSAGES` in `apply-plan`, used by Review rows (Task 42) and the PR and issue tables (Tasks 46, 54).
- **Branch names.** One rule, `isValidBranchName` in `change-link`, for the link schema, the manifest and build info.
- **Check summary.** One `summarizeCheck`, in the Task 46 report module, for local `apply --pr` and the Action.
- **Studio runtime types.** `detectStudioRuntime` returns `DetectedRuntime`; `StudioRuntime` adds the draft transport to the static variant (Task 32), and only `startStudio` builds one.
- **Action branch reuse (spec conflict).** The spec says both "opens or reuses the PR" (§4.6) and "Branches are never reused" / "only on a new `livelocale/*` branch" (§5, §7). A PR can only be reused by adding to its head branch, so the plan allows exactly one exception: one fast-forward commit (`force: false`) on `livelocale/issue-<n>` while its PR into the same target is still open (Task 56 `append`). A merged or closed PR's branch is never written again (`<baseName>-<runId>` instead), which is the squash-merge problem §7 guards against, and nothing is ever force-pushed.
- **Same-origin parent first (spec deviation).** The spec adds the same-origin parent only ahead of the `http://localhost:3010` fallback. Task 13 puts it first, ahead of `?livelocale-origin` and the remembered origin, because `sendToParent` can only reach a readable same-origin parent, and a remembered origin from an earlier cross-origin Studio goes stale after a full-page navigation inside a same-origin Studio.
- **Codec types.** `ChangeSet`/`ChangeEdit` with object edits, and codec error codes as in Task 5. Token finding has one owner, `findChangeToken`, and the fenced block wins.
- **Drafts.** `Draft.status` is `unsent | sent`, with a separate `conflict` flag. Live drafts are removed and surfaced through `liveNow`.
- **Drafts hook.** One `useDrafts` hook. `markDraftsSent(ids)` uses the transport's clock.
- **Locale reference.** Undo and Review read built values through `readBuiltLocale` and `lookupKey`.
- **`FileMutator({ requireEnabled })`.** Implemented once, in Task 9.
- **Module directory.** One `moduleDir()` for pack and `readOwnVersion`.
- **Build detection.** One stack detector, `detectBuildTarget`, which `init --share` reuses.
- **Vite options.** Top-level `share`, `exposeRepo`, `sourceLocale` and `shareBase`.
- **E2E fixture.** One static fixture, `playground-vite` on port 3020.
- **Changesets.** One changeset per milestone, written in its release task.

## Review notes

Two critics reviewed this plan against the approved design. Every finding was applied except the one below.

**Rejected findings**

- **Critic 1 #2, only the "ignore with no reply" part.** Spec §4.6 says "Untrusted authors get 'Waiting for a maintainer: comment `/livelocale apply`'", and for an `issue_comment` trigger the author whose `author_association` is checked is the commenter. So an untrusted `/livelocale apply [--force]` still gets that reply and resolves `waiting-for-maintainer`. The rest of the finding is applied in Tasks 55 and 57: the commenter is gated, the new fixture, and the assertions that nothing is written and force is not honoured.

**Applied with a variation (not rejected)**

- **Critic 1 #3.** The Checks column takes its copy from a new shared `FLAG_MESSAGES` (Task 10), which Review mode also uses. `forced` therefore reads `Saved with “Save anyway”.`, the curly-quote copy Review mode already had.
- **Critic 1 #6.** Took the first option: `append` stays, the Global Constraint allows one fast-forward commit on an open PR's branch, and the spec conflict is recorded under "Cross-draft reconciliations".
- **Critic 1 #10.** The menu path goes through a new `useTargetLocale().onMenuLocale` (it calls `choose` in static mode and `setLocale` in server mode), so a unit test can pin it.
- **Critic 2 #2.** Besides moving the per-call API URL into Task 27, its test moved from Task 28 into Task 27.
- **Critic 2 #13.** Chose the deterministic branch: the trailing-junk case is pinned for `nodeInflate` only, with no "probe Node 20 first" step.
- **Critic 2 #18 (and critic 1 #19).** Task 21 is added to the shared-CLI-file list. Task 57 stays on the list because its `--github-event` and `--branches` help lines now go explicitly into `printHelp` in `src/codemod/index.ts`.

## Pre-flight rulings

A conflict scan before execution checked every pair of tasks that share a file or interface, and every task against itself. Each confirmed conflict was verified by an independent skeptic. These rulings amend the tasks named; where they differ from a task's text, they win.

- **Task 5, PF-1.** `toBase64Url` builds ONE binary string with `String.fromCharCode` over 0x8000-byte subarrays, then calls `btoa` once (never `btoa` per chunk), then maps to base64url without padding. Add to Step 1: `it('encodes inputs larger than one chunk')` — a 100,000-byte array `Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) & 255)` encodes to exactly `Buffer.from(big).toString('base64url')` and round-trips through `fromBase64Url` (Buffer is allowed in the node-environment test file). Why: 0x8000 % 3 = 2, so per-chunk btoa pads mid-string and breaks every link whose deflated payload exceeds 32 KB; no other test catches it. Cost if wrong: none (RFC 4648 output is fixed).
- **Task 7, PF-2.** `streamDeflate` and `streamInflate` must not use `Blob`, `Blob.stream()` or `Response`. Feed the bytes through `cs.writable.getWriter()` (write, then close; do not await the write before reading) and read `cs.readable` with a reader, enforcing the caps while reading exactly as specified. Why: vitest's jsdom environment replaces the global `Blob` with jsdom 24's, which has no `stream()`, so every jsdom test that encodes or decodes with the real codec (Tasks 38, 39, 43) would throw. Cost if wrong: none; behaviour is identical.
- **Task 10, PF-3.** A `needs-force` edit keeps the verdict's code and message (`code: verdict.code`, `message: verdict.error`), and so does an `invalid` edit from a 400/409/422 verdict. Replace the needs-force status-only assertion in Step 1 with `expect(plan([e('ar', 'home.greet', 'مرحبا {name}', 'مرحبا', true)]).edits[0]).toMatchObject({ status: 'needs-force', code: 'PLACEHOLDER_MISMATCH', message: expect.stringContaining('{name}') })` (adapt the call to the task's own test helpers). Why: Review rows (Task 42) and the PR table (Task 46) show the reason; without it they would print "undefined". Cost if wrong: one extra field.
- **Task 13, PF-4.** Step 2's expected failure: the query case fails with `expected 'http://localhost:3011' to be 'https://www.acme.com'`; the remembered-origin and nothing-remembered cases fail with `expected 'http://localhost:3010' to be 'https://www.acme.com'`. 'keeps the existing order when there is no same-origin parent' and 'ignores a same-origin value that is not http(s)' already pass before the change (they guard the old order). Tests and implementation unchanged. Cost if wrong: none.
- **Task 24, PF-5.** Use a partial mock so the real constant is available: `vi.mock('../../src/server/pack.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/server/pack.js')>()), packOutput: vi.fn(async () => ({ warnings: [] })) }))`. Why: the pinned factory returns only `packOutput`, so reading `RELATIVE_BASE_WARNING` from the mocked module throws. Cost if wrong: none.
- **Task 29, PF-6.** The fixture's default store is persistent: `await openIndexedDbDraftStore(new IDBFactory())` with `IDBFactory` from `fake-indexeddb` (add `openIndexedDbDraftStore` from Task 26 to Consumes). 'warns when drafts cannot persist' passes `createMemoryDraftStore()` (persistent: false) and expects `[STORAGE_PROBLEM]`; 'reports static mode' keeps expecting `problems: []`. Task 26 is unchanged. Why: a memory default would make 'reports static mode' fail as written. Cost if wrong: none.
- **Task 30, PF-7.** `saveTranslation` also refuses with the existing 409 `KEY_NOT_A_STRING` copy ("would replace translations that are not a single text") when the same scope and locale already holds a draft whose key is a dotted ancestor or descendant of `key` (for example `promo` and `promo.banner`). `from` still comes from the built value. Add the test `it('refuses a draft that overlaps another draft key')`: save ar/promo, then ar/promo.banner rejects /would replace/. Why: otherwise two drafts that `encodeChangeLink` rejects as overlapping reach Send and show the damaged-link copy. Cost if wrong: a translator must undo one draft first.
- **Task 35, PF-8.** `studio-drafts-hook.test.tsx` calls `vi.stubGlobal('__STUDIO_VERSION__', '0.0.0-test')` before rendering `Header` (the same convention Task 36 uses), with `vi.unstubAllGlobals()` in `afterEach`. Do not edit `vitest.config.ts`. Why: Vitest does not define the Vite global, so rendering Header throws. Cost if wrong: none.
- **Task 35, PF-9.** Add `components/TranslationEditor.tsx` to Modify: Ctrl+Enter (Cmd+Enter on Mac) saves. Put one `onKeyDown` on the element that wraps both `#studio-translation-input` and `PluralEditor`: when `e.key === 'Enter' && (e.ctrlKey || e.metaKey)`, call `e.preventDefault()`, then call `onSave()` only when the save button would be enabled (the same condition that enables `#studio-save-button`). Never call `onForceSave` ("Save anyway" stays an explicit click). Add a jsdom test `it('saves with Ctrl+Enter and Cmd+Enter')`: both shortcuts call `onSave` once; nothing happens when the value is unchanged. Why: spec §2 step 5 names Ctrl+Enter as the Save shortcut, Task 50's E2E relies on it, and no task built it. Cost if wrong: one keyboard handler.
- **Task 36, PF-10.** `useTargetLocale` takes an optional `setMenuLocale?: (l: string) => void`, defaulting to `setLocale`. When `enabled` is false, `onMenuLocale(l)` calls `setMenuLocale(l)`; when true it calls `choose(l)`. `onUrlLocale`, click detection and `choose` keep using the plain `setLocale`. `useStudio` passes `useLocaleData().setLocale` as `setLocale` and `useLocaleData().handleLocaleChange` as `setMenuLocale`, and keeps returning `handleLocaleChange = target.onMenuLocale`. Read "In server mode `onMenuLocale` is today's `setLocale`" as "is today's `handleLocaleChange` (sets the locale and rewrites the iframe's `?locale=`)". The server-mode test becomes: enabled false, `onMenuLocale('fr')` calls `setMenuLocale('fr')`, not `setLocale`; source stays null. Name the Alt+Click queueing handler `handleElementSelected` and assign it to `selectElementRef.current` (Task 43 points at it). Why: a single setter would either drop the server-mode iframe navigation (breaking "server stacks unchanged") or loop the iframe on every READY. Cost if wrong: one optional parameter.
- **Task 38, PF-11.** (1) `note` has control characters other than `\t`, `\n`, `\r` removed (`/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g`), then is trimmed and cut to 500. (2) For both `by` and `note`, lone surrogates are removed, and after the cut a trailing high surrogate (U+D800–U+DBFF) is dropped so a cut never splits a pair (no regex lookbehind). (3) Extend 'cleans the name and note': note `'a\u000Bb\u001Bc'` gives `'abc'`; by `'x'.repeat(79) + '😀'` gives `'x'.repeat(79)`; the resulting change set passes `encodeChangeLink`. (4) Test files: `tests/unit/share-send.test.ts` starts with `// @vitest-environment node` (send.ts has no DOM); `tests/unit/share-browser.test.ts` starts with `// @vitest-environment jsdom`. Why: Task 6's schema rejects control characters and broken surrogates, so Send would show the damaged-link copy for a link that was never sent. Cost if wrong: none.
- **Task 39, PF-12.** `restoreDrafts` also skips (and counts as skipped) an edit whose key is a dotted ancestor or descendant of an existing draft key in the same scope and locale, matching the Task 30 save rule (PF-7). Cost if wrong: one extra skip reason.
- **Task 43, PF-13.** The wiring is `selectElementRef.current = review ? (el) => setFocusKey(el.key) : handleElementSelected`, where `handleElementSelected` is Task 36's Alt+Click handler (locale inference, picker and the `dataLocale` queue in static mode; plain `selectElement` in server mode). Never assign the raw `selectElement` there. Cost if wrong: none.
- **Task 47, PF-14.** Fix the dry-run test: delete the trailing dry-run line and, on the same fresh project and BEFORE the first real `runLocalApply`, add: `const arBefore = fs.readFileSync(arFile, 'utf-8'); const dry = await runLocalApply({ projectDir, input: token, dryRun: true, log: () => {} }); expect(dry.plan.counts).toMatchObject({ apply: 1, invalid: 1 }); expect(dry.written).toEqual([]); expect(fs.readFileSync(arFile, 'utf-8')).toBe(arBefore);` (adapt names to the task's fixture). Why: after the real run the edit is `already`, so the dry-run assertion tested nothing. Cost if wrong: none.
- **Task 48, PF-15.** Step 5 checks an existing name with `git ls-remote --heads <pushUrl> refs/heads/<name>`, where `<pushUrl>` is `git remote get-url --push origin` (the pushurl when set, else the URL). An ls-remote that exits non-zero counts as "no such branch" (safe: step 9 never force-pushes, so a taken name still fails the push). The default git runner sets `env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }`, like Task 16's `runGit`. Why: the r2 test's fetch URL is github.com; the check must never reach the network or prompt for credentials. Cost if wrong: none.
- **Task 49, PF-16.** The static `Service worker config` finding is pushed only when it warns; there is no ok finding when no PWA plugin is found. Why: `byTitle` is a case-insensitive substring match over static findings first, so an ok static finding would shadow the live `Service worker` probe. Cost if wrong: none.
- **Task 50, PF-17.** Add a row to the Step 4 wiring table: E2E relies on "Ctrl+Enter (Cmd+Enter) saves from the editor (spec §2 step 5)"; owner Task 35 (PF-9); search `grep -n -e ctrlKey -e metaKey src/studio/features/dashboard/components/TranslationEditor.tsx`. Keep `page.keyboard.press('Control+Enter')`. Cost if wrong: none.
- **Task 52, PF-18.** (a) After `npx changeset version`, run `npm install --package-lock-only`; Expected: `package-lock.json` root `version` and `packages[""].version` read `0.9.0`. (b) Step 4 Expected: one commit containing the version bump in `package.json` and `package-lock.json`, and `CHANGELOG.md` (no "removed changeset"). (c) The changeset is created and consumed before any commit and is never committed. Cost if wrong: none.
- **Task 54, PF-19.** Error comments: if `<message>` already ends in '.', drop that one '.' before appending '. Run log: <runUrl>'. Add the assertion: `renderIssueComment({ outcome: { kind: 'error', message: 'X.' }, runUrl: 'r' })` contains `'X. Run log: r'` and not `'..'`. Why: every Task 57 error message ends in a period. Cost if wrong: none.
- **Task 56, PF-20.** `tests/unit/helpers/fake-github.ts` pins this public state, which Task 57's tests read directly: `refs: Record<string, string>` (branch → sha); `pulls: { number, head: string, base: string, title, body, state, html_url }[]` (API responses wrap head and base as `{ ref }`); `issues: Record<number, { number, state, state_reason, body, user }>` (tests may seed it); `comments: Record<number, string[]>` (comment bodies); `commitCount` (number of `POST /git/commits` calls); `lastCommit`; `prCreationForbidden`; a constructor option `{ permission }` that sets what `GET /collaborators/:u/permission` returns; and `calls` with repo-relative paths. Why: Task 57 reads these members and does not list the helper among its files. Cost if wrong: a rename in Task 57's tests.
- **Task 58, PF-21.** `renderWorkflow` emits the dispatch trigger on ONE line, as spec §3 does: ` workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }` (2-space indent, 100 characters). The two-line wrap in the brief is markdown indentation only. Add the assertion `expect(wf).toContain(" workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }\n")`. Why: Prettier joins the two lines in the README block (Task 65), so the README could not both pass format:check and equal renderWorkflow. Cost if wrong: none.
- **Task 59, PF-22.** Extend the scope to finish the wiring: add `components/ChangesPanel.tsx` and `src/studio/app.tsx` to Modify and `tests/unit/changes-panel.test.tsx` to Test. `useStudio` returns `liveNow` and `dismissLiveNow` (from useDrafts). `ChangesPanel` gets optional `liveNow?: Draft[]` and `onDismissLiveNow?: () => void`, forwarded to `DraftList`. `app.tsx` passes them only when `mode === 'static'`, like `drafts` (Task 39). Add `it('shows Live now rows in Changes')`: ChangesPanel with drafts [] and liveNow [d] shows 'Live now' and a dismiss control. Extend Task 35's fake transport in `studio-drafts-hook.test.tsx` with `initialReconcile: { live: [], conflicts: [] }` (or have useDrafts treat a missing `initialReconcile` as empty). Why: DraftList renders only inside ChangesPanel, so without this Live-now rows never appear and Task 64's E2E fails. Cost if wrong: two optional props.
- **Task 64, PF-23.** Add two rows to the Step 2 wiring table, owner Task 59: `grep -n "liveNow" src/studio/features/dashboard/components/ChangesPanel.tsx` and `grep -n "liveNow" src/studio/app.tsx`. Cost if wrong: none.
- **Task 66, PF-24.** Quote the expression: `env: { BASE: '${{ inputs.prerelease_base }}' }` (block style also fine). Add a Step 1 assertion that the file contains the quoted form `BASE: '${{ inputs.prerelease_base }}'` and no unquoted `${{` directly after `{ ` or `: ` inside a flow mapping. As a one-off verification step (not a test, since no YAML parser is a declared devDependency and none may be added), load the file with the transitively installed `node_modules/js-yaml` and confirm it parses. Why: an unquoted `${{ }}` inside a flow mapping is invalid YAML and would break every release, while text greps still pass. Cost if wrong: none.
- **Task 67, PF-25.** S2 adds a sub-step before Send: type `Sara` in "Your name" (`#studio-tips-name` or `#studio-send-name`). S3 expects the trailer `Translated-by: Sara`. Why: the name is optional and Task 46 adds the trailer only when a name is set. Cost if wrong: none.
- **Task 68, PF-26.** Step 1 reads "the S0–S9 checklist" (Task 67's S10 is the step that records S0–S9). Cost if wrong: none.
- **Task 65.** No change: once Task 58 emits the one-line trigger (PF-21), the README block passes `format:check` unchanged.
