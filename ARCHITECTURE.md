# Architecture

This document explains how `livelocale` (branded **LiveLocale**) works end to end, so a new
contributor can be productive in a day. It describes the system as it is, not as it might become.

## The one-paragraph version

In development, every translation lookup is wrapped so the returned string carries an invisible
prefix that encodes its key. A small client script running inside the app decodes those prefixes
from the DOM and tags elements with `data-i18n-key`. The Studio embeds the app in an iframe,
receives the clicked key over `postMessage`, and saves edits through a mutation API route that
lives inside the app and writes the locale JSON file atomically. In production every wrapper is a
no-op and every server entry point returns 403.

## Share link (static mode)

A share link needs no server. The build (`liveLocaleVite({ share: true })`, `livelocale pack` or
`livelocale build`) writes `<outDir>/<base>livelocale/`: the Studio, `manifest.json`, the locale
files and `flag.js`, and links `flag.js` first in every app page's `<head>`. Opened at
`<base>livelocale/index.html`, the Studio frames the app on the same origin; the framed flag
(`flag.js`) sets `window.__LIVELOCALE_FLAG__ = 'preview'` only inside that same-origin parent, so
the app watermarks its text there and stays off for ordinary visitors. Because there is no API,
the Studio switches `api.ts` to the static transport: saves become drafts in the translator's
IndexedDB, checked by the same `save-rules` as the server, and are re-applied to the page with
`COMMIT_PREVIEW`. **Send** encodes the drafts as an `lc1.` change link (or a file), and the
developer runs `livelocale apply`, which decodes the link, re-validates every edit against the
project's own source locale (`planApply`), writes the locale files and, with `--pr`, opens a pull
request with the developer's own git and gh.

## `apply` and the workflow

On GitHub, `init --share` writes `.github/workflows/livelocale.yml`, whose one step runs
`npx --yes livelocale@<version> apply --github-event` (`src/codemod/apply/github-event.ts`).
One run goes through these steps in order:

1. **Event.** The workflow starts on an opened issue, a new issue comment, a closed pull request or
   a manual dispatch. Its `if:` already skips issues without a fenced `livelocale` block, comments
   that do not start with `/livelocale` and comments on pull requests.
2. **Trigger.** `parseTrigger` (`github-trigger.ts`) reads the payload from `$GITHUB_EVENT_PATH`
   only, never from the command line or an interpolated `run:`, and returns `apply` (issue, comment
   or dispatch, with `force` only for a `/livelocale apply --force` comment), `close-issue` or
   `ignore`.
3. **Trust gate.** `isTrustedActor` lets the issue author (`issues`) or the commenter
   (`issue_comment`) through when their `author_association` is OWNER, MEMBER or COLLABORATOR, or
   `GET /collaborators/{user}/permission` returns write or higher. Anyone else gets "Waiting for a
   maintainer: comment `/livelocale apply`" and nothing is written. A dispatch needs write access
   to start at all.
4. **Decode.** `decodeChangeLink` with `nodeInflate`, under the same caps as the browser. A link
   whose `repo` names another repository is refused.
5. **Plan.** `chooseTargetBranch` keeps the link's `branch` only when it is in the `--branches`
   allow-list (default: the default branch). `readRemoteLocales` reads that branch's locale files
   through the Git Data API, and `planApply` re-validates every edit against its source locale,
   honouring "Save anyway" edits only with `--force` from the comment.
6. **One commit.** `prepareBranch` picks `livelocale/issue-<n>` (or `livelocale/run-<id>`), appends
   to it only while its pull request into the same target is open, and otherwise falls back to
   `<name>-<runId>`. `commitFiles` writes one commit with only the changed files under
   `localesPath`, authored by the triggering maintainer (`noreplyAuthor`) with a `Translated-by:`
   trailer, and never updates a ref with `force: true`. `runCheck` then runs on the result.
7. **PR or compare link.** `openOrReusePullRequest` opens the pull request or updates the open one.
   When the repository does not let GitHub Actions create pull requests, the run builds a
   prefilled compare link instead.
8. **Comment.** `renderIssueComment` posts the outcome (pull request, compare link, nothing to
   apply, wrong repository, waiting for a maintainer or an error with the run log) on the issue, or
   on the step summary for a dispatch.

The body says `Closes #n` only when the target is the default branch. For any other target it says
`Refs #n`, and a later `pull_request: closed` event on a `livelocale/issue-<n>` branch runs
`closeIssue`, which closes the issue as completed (merged) or not planned (closed), provided it is
still open and still holds a change block.

## Packages and entry points

The library ships one npm package with five entry points (see `tsup.config.ts`):

| Entry                  | Source                      | Runs in                          | Purpose                                     |
| ---------------------- | --------------------------- | -------------------------------- | ------------------------------------------- |
| `livelocale/server`    | `src/server/index.ts`       | Node (Next.js server)            | Route handler, loader, mutator, watermark   |
| `livelocale/client`    | `src/client/index.ts`       | Browser                          | DOM scanner, bridge, auto-init              |
| `livelocale/react`     | `src/react/index.tsx`       | Browser (React)                  | `LiveLocaleProvider` that lazy-loads client |
| `livelocale/vite`      | `src/server/vite-plugin.ts` | Node (Vite dev server and build) | Mutation API as Vite middleware             |
| `npx livelocale` (bin) | `src/codemod/index.ts`      | Node CLI                         | `init`, `studio`, `migrate`                 |

The Studio UI (`src/studio`) is a separate Vite app built into `dist/studio` and served by the CLI.

## Data flow

```
┌────────────────────────── Studio (localhost:3010) ───────────────────────────┐
│  React UI ── fetch ──▶ {appOrigin}/api/livelocale  (GET list / POST)  │
│      ▲                                                                       │
│      │ postMessage (ELEMENT_SELECTED, READY, VISIBLE_KEYS_CHANGED,           │
│      │              VISIBLE_TEXTS_CHANGED)                                   │
│      ▼                                                                       │
│  <iframe src="{appOrigin}?livelocale-origin=http://localhost:3010">           │
│    ┌───────────────── Your app (localhost:3000) ─────────────────┐           │
│    │  SSR/CSR renders  "‍…bits…‍" + "Hello"           │           │
│    │  client/index.ts: scan text nodes → data-i18n-key           │           │
│    │  Alt+click → IframeBridge.sendToParent(ELEMENT_SELECTED)    │           │
│    └──────────────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │ POST {locale,key,value}
                                   ▼
        app/api/livelocale/route.ts ──▶ createMutationRouter ──▶ FileMutator
                                                                     (atomic write)
```

## Core concepts

### 0. Enablement (`src/core/env.ts`)

Every "is this on?" decision calls `getLiveLocaleMode()` / `isLiveLocaleEnabled()`. Modes: `development`
(`NODE_ENV === 'development'`, subject to the kill switch and the deployed-platform guard unless
`LIVELOCALE=force`), `preview` (explicit `LIVELOCALE=preview` or `NEXT_PUBLIC_LIVELOCALE=preview`,
works in production builds, skips the platform guard), and `off`. The kill switch always wins.
`process.env.NODE_ENV` and `process.env.NEXT_PUBLIC_LIVELOCALE` are referenced literally so bundlers
can inline them; in the browser `window.__LIVELOCALE_FLAG__` is a bundler-agnostic fallback that
the Vite plugin injects from the server's `LIVELOCALE`. Static share builds load
`<base>livelocale/flag.js` (`src/core/flag-script.ts`) first in `<head>`, and it sets the global to
`preview` only when a same-origin parent's path is under the folder `flag.js` is served from, so
visitors who open the site directly stay `off`.

### 1. Watermark codec (`src/client/watermark.ts`)

`encodeKey(text, key)` returns `DELIM + bits + DELIM + text`, where `DELIM` is U+200D and each
bit of the UTF-8 key is U+200B (0) or U+200C (1). `decodeKey` reverses it and returns
`{ key, cleanText }`. The prefix position is deliberate: right-side truncation keeps it intact.

`stripWatermark` removes only a valid prefix. `sanitizeZeroWidth` removes every zero-width
character and is used solely for clipboard and form input, because ZWNJ and ZWSP are legitimate
orthography in Persian, Urdu, Thai, and others.

### 2. Engine wrapping (`src/client/wrap.ts`)

`wrapTranslationEngine(engine, options)` returns a Proxy in development and the original object
otherwise. Property reads of strings are encoded with the full dotted path; function calls (`t('x')`)
encode the result with `keyPrefix + '.' + x`. FormatJS-style descriptor objects (`{ id }`) are
supported. `options.fallback` supplies values from other locales for missing keys so untranslated
text is still visible and editable. `wrapNextIntl` is a thin alias for `next-intl` users.

This file has no `'use client'` directive on purpose so it can be imported by Server Components.

### 3. Server-side loader (`src/server/translations.ts`)

`createTranslations(locale, options)` reads `locales/{locale}.json` or the namespaced folder
`locales/{locale}/*.json`, builds a fallback dictionary from every other locale in development,
and returns the wrapped object. Parses are cached by `core/json-cache.ts` keyed on mtime and size, so
steady-state renders cost one `stat` per file.

### 3a. Plural structure (`src/core/icu-plural.ts`)

`parsePluralMessage` recognises a message that is exactly one top-level `plural` / `select` /
`selectordinal` argument (with optional surrounding text, apostrophe quoting respected) and
returns its variable, offset, branches and prefix/suffix verbatim; `buildPluralMessage` is its
inverse; `pluralCategoriesFor` lists the CLDR categories a locale needs via `Intl.PluralRules`.
The Studio's `PluralEditor` edits one branch per field and rebuilds the message on every change.

### 3b. Placeholder analysis (`src/core/placeholders.ts`)

`extractPlaceholders` turns a message into a sorted set of canonical tokens (`{name}`,
`{{name}}`, `%s`, `<b>`, `$t(key)`) using a small recursive-descent ICU walker that understands
typed arguments, `plural`/`select` branches and apostrophe quoting. `comparePlaceholders` diffs
two sets; `validateMessageSyntax` reports unbalanced braces or a `plural`/`select` without
`other`. The Studio runs the first one live for the placeholder chips; `validateWrite` in
`src/core/save-rules.ts` runs both on every write unless `force: true`.

### 3c. Change links (`src/core/change-link.ts`)

A change link is `lc1.` followed by unpadded base64url of the zlib-format deflate
(`CompressionStream('deflate')`) of the JSON
`{v:1, repo?, branch, base, src, by, note, e:[[locale,key,from,to,force?]]}`. `parseChangeSet` is
the schema: it checks every field and edit, rejects two edits to one key or to nested keys in a
locale, and allows at most 500 edits (`MAX_CHANGE_EDITS`), while the JSON is capped at 512 KB
(`MAX_INFLATED_BYTES`) on encode and on decode. Decoding takes an `Inflater`: the browser uses
`streamInflate` (`DecompressionStream`, fed in 4 KB slices and stopped as soon as the output passes
the cap), and `apply` uses `nodeInflate` from the Node-only `src/core/change-link-node.ts`
(`zlib.inflateSync` with `maxOutputLength`, which also refuses bytes after the zlib stream), a file
nothing in the Studio or client may import. Every failure is a `ChangeLinkError` with a code
(`CORRUPT`, `TOO_LARGE`, `TOO_MANY_EDITS`, `INVALID`, …) whose message never echoes payload text.

### 4. Mutation router (`src/server/router.ts`)

The single implementation of the API. Both the Next.js handler and the Vite middleware are thin
adapters that translate their request shape into `RouterRequest` and back. Rules live here:

- development-only (403 otherwise),
- POST origin must be localhost, in `allowedOrigins`, or in `LIVELOCALE_ALLOWED_ORIGINS`,
- POST content-type must be JSON,
- locale, key, and value are validated by `src/core/validate.ts`, and the value must keep the
  reference's placeholders and parse as ICU (422 otherwise, bypass with `force`); these rules live
  in `validateWrite` (`src/core/save-rules.ts`), so code outside the router can apply the same
  ones,
- `GET` lists locales, returns a locale dictionary, or `?action=keys` returns key metadata.

Outside the router, `validateEdit` (also in `save-rules.ts`) recomputes the reference from the
source-locale dictionary and never trusts a client `reference` or `force`.

`MutationGateway` is the port the router writes through; `FileMutator` is its adapter.
`GitGateway` is a second, optional port (`?action=git`, `commit`, `discard`) implemented by
`GitClient` (`src/server/git-client.ts`), which shells out to the `git` CLI with argument arrays and
always scopes pathspecs to the locales directory relative to the repository root. Both adapters
enable it by default; `git: false` removes it.

`createGitHubGateway` (`src/server/github-gateway.ts`) implements **both** ports over the GitHub
REST API for preview mode: reads and writes go to a branch (one commit per save), `status`/`diff`
come from the base...branch compare, `commit` opens or reuses a pull request, and `discard` resets
the branch to base. Saves to one file are queued in-process, and a save that loses a race with
another writer (`409`, or `422` for a stale sha) re-reads the file and retries up to four times,
so separate serverless instances can write the same file. `checkAccess` verifies the token, the
repository, the base branch, and write access; write permissions are probed with empty requests
that GitHub answers with `422` when allowed and `403` when not, so nothing is created.
`?action=info` tells the Studio the mode, whether a token is required, whether git actions exist,
and the gateway's access `problems` (a passing check is cached; a failing one re-runs).

When `authToken` is set (or `LIVELOCALE_TOKEN`), every non-preflight request must carry
`Authorization: Bearer <token>`; preview mode refuses to serve without one.

### 5. Next.js handler (`src/server/next-handler.ts`)

`createLiveLocaleHandler` returns one function usable with both router styles. It detects the Pages
Router `(req, res)` signature by the presence of `res.setHeader` and otherwise treats the first
argument as a Web `Request`. Body reading for Node requests is shared with the Vite plugin through
`src/server/node-body.ts`.

### 6. File mutator and key scanner (`src/server/file-mutator.ts`, `key-scanner.ts`)

`updateLocaleKey` resolves the target file (flat or namespaced), serializes writes per path with a
promise-chain mutex, validates the parsed JSON root, sets the nested key with depth and
prototype-pollution guards, then writes `file.tmp` and renames it over the target so a concurrent
HMR read never sees a half-written file. The rewrite preserves the file's indentation unit and
trailing newline (`detectJsonIndent`) so diffs stay minimal. `KeyScanner` finds `t('…')`, `t.rich('…')` and `t.a.b` references in source files with regexes,
prefixes them with the namespace bound to that translator variable in the same file
(`useTranslations('ns')`, `getTranslations`, `useTranslation('ns')`, `wrapNextIntl`,
`wrapTranslationEngine({ keyPrefix })`), and merges them with keys present in the locale files. Scans are
incremental (per-file mtime and size cache), honour the root `.gitignore` through
`core/gitignore.ts`, and skip declaration files and files over 1 MB.
`new FileMutator({ requireEnabled: false })` skips the enablement check, like `KeyScanner`, for CLI tools that write outside development, such as `livelocale apply`.

### 7. Client runtime (`src/client/dom-interceptor.ts`, `iframe-bridge.ts`, `index.ts`)

`DOMInterceptor` walks text nodes on init and on every mutation, tags parents with
`data-i18n-key` and `data-i18n-template`, draws a fixed-position highlight overlay, intercepts
Alt+click, and sanitizes copy, paste, form submit, and the `value` property of inputs so
watermarks never leave the page. `IframeBridge` validates origins both ways. `index.ts`
auto-initializes only inside an iframe, and only when LiveLocale is enabled: in development, or
in a build made with `LIVELOCALE=preview`, or in a production build when `flag.js` set `window.__LIVELOCALE_FLAG__ = 'preview'` because the
page is framed by a same-origin Studio under its `livelocale/` folder (the share link). It
resolves the Studio origin in this order: a readable same-origin parent (a Studio served from the same host), the
`livelocale-origin` query parameter (remembered for the tab), the origin remembered for the tab,
then `http://localhost:3010`. `APPLY_PREVIEW` swaps the visible text after the
watermark and remembers the original; `CLEAR_SELECTION` restores it; `COMMIT_PREVIEW` applies a
saved value and forgets the original so it stays. Re-applying an unchanged value is a no-op, so
the Studio can resend saved values without triggering mutation loops. Right after each
`VISIBLE_KEYS_CHANGED`, the client reports up to 100 visible key/text pairs
(`VISIBLE_TEXTS_CHANGED`) so the Studio can infer the page locale before the first click.

### 8. Studio (`src/studio`)

A React app with one composer hook, `useStudio`, that wires focused hooks: `useConnection`
(iframe bridge), `useLocaleData` (fetching and coverage), `useSelection` (editing session and live
preview), `useLocaleActions` (add, rename, delete), `useKeySearch`, `useGit` (status, diff,
commit, discard), `useHistory` (session edit log) and `useAuth` (bearer token for preview mode).
All HTTP calls live in `src/studio/api.ts`, which attaches the token from sessionStorage and
announces 401s on `window` so the token modal can appear.
Undo is implemented in the composer: it re-saves the previous value through the normal mutation
path and removes the history entry, so disk, cache, and git status stay consistent. The app origin is resolved
at start-up by `startStudio` (`src/studio/bootstrap.ts`) through `detectStudioRuntime`
(`src/studio/config.ts`) before the first render. A CLI-injected `window.__LIVELOCALE_CONFIG__`
means a server stack and nothing is probed. Otherwise, when `./manifest.json` next to the Studio is
a LiveLocale manifest, the Studio runs in static mode: the app is the folder above the Studio,
`?app=` is ignored, and `api.ts` is switched to the static transport, which keeps drafts in
IndexedDB (in memory, with a warning, when IndexedDB is unavailable) instead of using the HTTP API.
Anything else resolves the origin from `?app=`, then the CLI-injected config, then build-time
`VITE_APP_ORIGIN`, then `http://localhost:3000`. A Studio under `/livelocale/` without a usable
manifest stays in server mode with the setup problem `STATIC_MANIFEST_MISSING`, which names the
fix, and renders no app preview (`isAppPreviewBlocked`), so it never silently points at localhost.
In preview and static mode the app keeps serving the text it was built with, so `useStudio` resends the
session's saved values (`COMMIT_PREVIEW`, newest wins per key) whenever the page reloads,
navigates, or its visible keys change. Setup problems render in `SetupProblems`: the runtime's own
problems from start-up, shown before any connection, followed by those from `?action=info` once
connected; `IframeViewer` lists likely causes when the bridge has not answered in eight
seconds, because a blocked frame is only reported in the browser console.

### 9. CLI (`src/codemod`)

`init` writes a route file matching the detected router and language. `studio` serves
`dist/studio` through `createStudioServer`, injecting the app origin into `index.html`. `migrate`
lazily imports the TypeScript-based codemod so the other commands work in JavaScript-only projects.
`doctor` (`src/codemod/doctor.ts`) runs static checks on the project tree and, with `--app`, live
HTTP probes; it returns structured findings so the CLI output and the tests share one source. With
`--token` it also reads `?action=info` (mode, access problems), and it recognises redirects to a
hosting login wall such as Vercel Deployment Protection. `check` (`src/codemod/check.ts`) is the
read-only CI command: it reads locales the way the runtime does, scans source with
`KeyScanner({ requireEnabled: false }).scanSourceKeys`, and reports missing keys, placeholder
drift against the source locale, ICU syntax errors, empty values and unused keys. `studio`
refuses to start when something already answers on `localhost:<port>`, because on Windows a
second server can bind beside it. Commands set `process.exitCode` rather than calling
`process.exit()` after network probes or large output.
`pack` parses its options with `parseShareArgs` and calls `packOutput` (§10), printing each
`PackError` as one `❌` line with exit code 1. `build` (`runBuildCommand`) runs the user's build
command through `spawnInherit` (on Windows one quoted command line through the shell) with
`--preview` setting `LIVELOCALE` and `NEXT_PUBLIC_LIVELOCALE`. Next projects are packed into
`public/` first without HTML injection (a static export with a POST route stops first with
`NEXT_EXPORT_POST_ROUTE`); static stacks are packed after a zero exit, into `--out` or the first
`outputCandidates` folder whose `index.html` was written by this build.
`init --share` (`src/codemod/init-share.ts`) plans every file before writing any: the build change
for the stack that `detectShareStack` finds through the shared `detectBuildTarget` (Vite `share:
true`, a `livelocale pack` or `livelocale build` script, and a `public/livelocale/` gitignore entry
for Next.js), and, only on a GitHub remote, the workflow from `renderWorkflow`. `validateShareArgs`
limits `--locales`, `--source`, `--branches` and `--dir` to characters that cannot change the
`run:` line, and an existing workflow that differs is skipped unless `--overwrite` is passed.
`apply` (`src/codemod/apply/`) reads the link with `readApplyInput`, decodes it with `nodeInflate`,
plans it with `planApply` against `FileMutator({ requireEnabled: false }).readLocale`, writes the
`apply` edits through `updateLocaleKey` and prints `renderTerminalSummary` (exit 1 on any conflict,
invalid or needs-force edit).

### 10. Share output (`src/server/pack.ts`)

`packOutput` turns a finished static build into a share link. It writes one folder,
`<outDir>/livelocale/`, served at `<base>livelocale/index.html`: the built Studio (`index.html`,
`assets/`), `manifest.json` (format 1, from `collectShareData`: build info, locales, layout, code
keys and `basePath`, null for a relative base), `locales/<code>.json` (each locale's merged
dictionary) and `flag.js`. The folder name has no underscore, because Jekyll drops such folders.
Every check runs before the first write: the output folder exists, the base is valid, the
Studio is found (`resolveStudioDir`: the first candidate holding `index.html` and `assets/`), the
locales read cleanly, and pack owns the folder. An existing `livelocale/` is replaced only when its
`manifest.json` has a numeric `format`; anything else stops with `SHARE_DIR_TAKEN`. The flag gate
is `flag.js`, which sets `window.__LIVELOCALE_FLAG__ = 'preview'` only inside a same-origin parent
under the Studio folder; every app HTML file outside `livelocale/` (symlinks skipped) gets
`<script src="<base>livelocale/flag.js"></script>` as the first child of `<head>`, absolute for an
absolute base and per-file relative for a relative one, which also adds `RELATIVE_BASE_WARNING`.
Pack never writes outside `<outDir>/livelocale/` except that flag tag. Next.js outputs (a Next
project, or an output with `_next/`) skip the injection by default.

The Vite plugin's build half runs only with `share: true` (`apply` is true in serve, and in build
only for a share client build). `configResolved` records the root, the absolute `outDir` and the
base (`shareBase ?? base`, checked with `normalizeBase`, so a full-URL `base` without `shareBase`
stops with `BAD_BASE`); SSR and library builds are left alone. `transformIndexHtml` puts the flag
tag first in each HTML file Vite emits (and skips the dev fallback data), and `writeBundle` calls
`packOutput` once per build (`buildStart` resets the guard, so watch mode packs again) with
`injectHtml: false`, forwarding pack warnings such as `RELATIVE_BASE_WARNING` to Vite's logger.
`localesPath` is resolved against the working directory, as in the serve half.

## Security rules at a glance

| Rule                                  | Where                                       |
| ------------------------------------- | ------------------------------------------- |
| Development-only + guards             | core/env (all entry points)                 |
| CSRF origin allow-list                | router (`isOriginAllowed`)                  |
| JSON content-type on writes           | router                                      |
| Body size cap                         | next-handler, node-body, vite-plugin        |
| Change-link size caps                 | core/change-link, core/change-link-node     |
| Path containment                      | core/safe-path, file-mutator, studio-server |
| Prototype pollution                   | core/validate, file-mutator                 |
| Atomic writes                         | file-mutator                                |
| Script injection escaping             | vite-plugin, studio-server                  |
| postMessage origin checks             | iframe-bridge, useConnection                |
| Framed-only activation                | core/flag-script                            |
| Edits re-validated on apply           | core/apply-plan, codemod/apply              |
| Trust gate                            | codemod/apply/github-trigger                |
| Payload only from event file          | init-share workflow template                |
| Writes only under locales, new branch | codemod/apply/github-commit                 |

## Testing strategy

- `tests/unit`: pure logic and adapters with mocked `fs`.
- `tests/integration`: iframe bridge under jsdom, and the **packaged CLI** executed from a copy of
  `dist` placed outside the repo so missing optional dependencies are caught.
- `tests/e2e`: Playwright drives the Studio against the `playground` Next.js app and restores the
  locale file afterwards.
- `tests/e2e/static-share.spec.ts`: Playwright builds `playground-vite` with `share: true`, serves
  `dist/` from a plain static server on port 3020, and covers the share link round trip: no
  watermarks for unframed visitors, Alt+Click, drafts in IndexedDB across reloads, Send, `apply`
  turning the link into the JSON diff, Review mode, and the missing-manifest setup problem.

CI runs format, lint, typecheck, unit tests with coverage thresholds, and E2E.

## Known limitations

- Key extraction is regex-based: namespaces are resolved per file, not across imports, and
  dynamic keys are skipped.
- JSON only. No YAML or gettext.
- The Studio is English-only. History and undo are per browser session (not persisted).
- Locale detection from the embedded app's URL is a heuristic (`?locale=` or a two-letter path
  segment).
