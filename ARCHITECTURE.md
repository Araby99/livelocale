# Architecture

This document explains how `next-i18n-lens` (branded **i18n Lens**) works end to end, so a new
contributor can be productive in a day. It describes the system as it is, not as it might become.

## The one-paragraph version

In development, every translation lookup is wrapped so the returned string carries an invisible
prefix that encodes its key. A small client script running inside the app decodes those prefixes
from the DOM and tags elements with `data-i18n-key`. The Studio embeds the app in an iframe,
receives the clicked key over `postMessage`, and saves edits through a mutation API route that
lives inside the app and writes the locale JSON file atomically. In production every wrapper is a
no-op and every server entry point returns 403.

## Packages and entry points

The library ships one npm package with five entry points (see `tsup.config.ts`):

| Entry                      | Source                      | Runs in                | Purpose                                   |
| -------------------------- | --------------------------- | ---------------------- | ----------------------------------------- |
| `next-i18n-lens/server`    | `src/server/index.ts`       | Node (Next.js server)  | Route handler, loader, mutator, watermark |
| `next-i18n-lens/client`    | `src/client/index.ts`       | Browser                | DOM scanner, bridge, auto-init            |
| `next-i18n-lens/react`     | `src/react/index.tsx`       | Browser (React)        | `I18nLensProvider` that lazy-loads client |
| `next-i18n-lens/vite`      | `src/server/vite-plugin.ts` | Node (Vite dev server) | Mutation API as Vite middleware           |
| `npx next-i18n-lens` (bin) | `src/codemod/index.ts`      | Node CLI               | `init`, `studio`, `migrate`               |

The Studio UI (`src/studio`) is a separate Vite app built into `dist/studio` and served by the CLI.

## Data flow

```
┌────────────────────────── Studio (localhost:3010) ───────────────────────────┐
│  React UI ── fetch ──▶ {appOrigin}/api/i18n-lens/mutate  (GET list / POST)  │
│      ▲                                                                       │
│      │ postMessage (ELEMENT_SELECTED, READY, VISIBLE_KEYS_CHANGED)           │
│      ▼                                                                       │
│  <iframe src="{appOrigin}?i18n-lens-origin=http://localhost:3010">           │
│    ┌───────────────── Your app (localhost:3000) ─────────────────┐           │
│    │  SSR/CSR renders  "‍…bits…‍" + "Hello"           │           │
│    │  client/index.ts: scan text nodes → data-i18n-key           │           │
│    │  Alt+click → IframeBridge.sendToParent(ELEMENT_SELECTED)    │           │
│    └──────────────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │ POST {locale,key,value}
                                   ▼
        app/api/i18n-lens/mutate/route.ts ──▶ createMutationRouter ──▶ FileMutator
                                                                     (atomic write)
```

## Core concepts

### 0. Enablement (`src/core/env.ts`)

Every "is this on?" decision calls `getLensMode()` / `isLensEnabled()`. Modes: `development`
(`NODE_ENV === 'development'`, subject to the kill switch and the deployed-platform guard unless
`I18N_LENS=force`), `preview` (explicit `I18N_LENS=preview` or `NEXT_PUBLIC_I18N_LENS=preview`,
works in production builds, skips the platform guard), and `off`. The kill switch always wins.
`process.env.NODE_ENV` and `process.env.NEXT_PUBLIC_I18N_LENS` are referenced literally so bundlers
can inline them; in the browser `window.__I18N_LENS_FLAG__` is a bundler-agnostic fallback that
the Vite plugin injects from the server's `I18N_LENS`.

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
`other`. The router runs both on every write unless `force: true`; the Studio runs the first one
live for the placeholder chips.

### 4. Mutation router (`src/server/router.ts`)

The single implementation of the API. Both the Next.js handler and the Vite middleware are thin
adapters that translate their request shape into `RouterRequest` and back. Rules live here:

- development-only (403 otherwise),
- POST origin must be localhost, in `allowedOrigins`, or in `I18N_LENS_ALLOWED_ORIGINS`,
- POST content-type must be JSON,
- locale, key, and value are validated by `src/core/validate.ts`,
- the value must keep the reference's placeholders and parse as ICU (422 otherwise, bypass with
  `force`),
- `GET` lists locales, returns a locale dictionary, or `?action=keys` returns key metadata.

`MutationGateway` is the port the router writes through; `FileMutator` is its adapter.
`GitGateway` is a second, optional port (`?action=git`, `commit`, `discard`) implemented by
`GitClient` (`src/server/git-client.ts`), which shells out to the `git` CLI with argument arrays and
always scopes pathspecs to the locales directory relative to the repository root. Both adapters
enable it by default; `git: false` removes it.

`createGitHubGateway` (`src/server/github-gateway.ts`) implements **both** ports over the GitHub
REST API for preview mode: reads and writes go to a branch (one commit per save), `status`/`diff`
come from the base...branch compare, `commit` opens or reuses a pull request, and `discard` resets
the branch to base. `?action=info` tells the Studio the mode, whether a token is required, and
whether git actions exist.

When `authToken` is set (or `I18N_LENS_TOKEN`), every non-preflight request must carry
`Authorization: Bearer <token>`; preview mode refuses to serve without one.

### 5. Next.js handler (`src/server/next-handler.ts`)

`createI18nLensHandler` returns one function usable with both router styles. It detects the Pages
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

### 7. Client runtime (`src/client/dom-interceptor.ts`, `iframe-bridge.ts`, `index.ts`)

`DOMInterceptor` walks text nodes on init and on every mutation, tags parents with
`data-i18n-key` and `data-i18n-template`, draws a fixed-position highlight overlay, intercepts
Alt+click, and sanitizes copy, paste, form submit, and the `value` property of inputs so
watermarks never leave the page. `IframeBridge` validates origins both ways. `index.ts`
auto-initializes only when running inside an iframe in development and reads the Studio origin
from the `i18n-lens-origin` query parameter.

### 8. Studio (`src/studio`)

A React app with one composer hook, `useStudio`, that wires focused hooks: `useConnection`
(iframe bridge), `useLocaleData` (fetching and coverage), `useSelection` (editing session and live
preview), `useLocaleActions` (add, rename, delete), `useKeySearch`, `useGit` (status, diff,
commit, discard), `useHistory` (session edit log) and `useAuth` (bearer token for preview mode).
All HTTP calls live in `src/studio/api.ts`, which attaches the token from sessionStorage and
announces 401s on `window` so the token modal can appear.
Undo is implemented in the composer: it re-saves the previous value through the normal mutation
path and removes the history entry, so disk, cache, and git status stay consistent. The app origin is resolved
at start-up by `src/studio/config.ts` from `?app=`, then the CLI-injected
`window.__I18N_LENS_CONFIG__`, then build-time `VITE_APP_ORIGIN`, then `http://localhost:3000`.

### 9. CLI (`src/codemod`)

`init` writes a route file matching the detected router and language. `studio` serves
`dist/studio` through `createStudioServer`, injecting the app origin into `index.html`. `migrate`
lazily imports the TypeScript-based codemod so the other commands work in JavaScript-only projects.
`doctor` (`src/codemod/doctor.ts`) runs static checks on the project tree and, with `--app`, live
HTTP probes; it returns structured findings so the CLI output and the tests share one source.

## Security rules at a glance

| Rule                        | Where                                       |
| --------------------------- | ------------------------------------------- |
| Development-only + guards   | core/env (all entry points)                 |
| CSRF origin allow-list      | router (`isOriginAllowed`)                  |
| JSON content-type on writes | router                                      |
| Body size cap               | next-handler, node-body, vite-plugin        |
| Path containment            | core/safe-path, file-mutator, studio-server |
| Prototype pollution         | core/validate, file-mutator                 |
| Atomic writes               | file-mutator                                |
| Script injection escaping   | vite-plugin, studio-server                  |
| postMessage origin checks   | iframe-bridge, useConnection                |

## Testing strategy

- `tests/unit`: pure logic and adapters with mocked `fs`.
- `tests/integration`: iframe bridge under jsdom, and the **packaged CLI** executed from a copy of
  `dist` placed outside the repo so missing optional dependencies are caught.
- `tests/e2e`: Playwright drives the Studio against the `playground` Next.js app and restores the
  locale file afterwards.

CI runs format, lint, typecheck, unit tests with coverage thresholds, and E2E.

## Known limitations

- Key extraction is regex-based: namespaces are resolved per file, not across imports, and
  dynamic keys are skipped.
- JSON only. No ICU plural forms, YAML, or gettext.
- The Studio is English-only. History and undo are per browser session (not persisted).
- Locale detection from the embedded app's URL is a heuristic (`?locale=` or a two-letter path
  segment).
