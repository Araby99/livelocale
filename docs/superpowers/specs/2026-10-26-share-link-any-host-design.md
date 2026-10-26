> **Status: approved by the owner on 2026-10-26** ("one click is fine, go with your defaults"). Produced by a design workflow (5 independent proposals, adversarial feasibility checks, 3 judges, synthesis). Decisions are recorded in section 10.

# LiveLocale share link on every host: recommended design

## 1. Recommendation in plain words

Don't add a server anywhere. The Studio becomes a few extra static files that ship inside the website build at `/livelocale/`. Any host that can serve the site can then serve the Studio, including Apache, S3, GitHub Pages and Netlify. Because the Studio and the site share one address, today's cross-origin setup goes away: no API route, no allowed-origins list, no frame-ancestors changes. Translators open the link, Alt+Click, and fix text. Their fixes are kept in their own browser and show on the page straight away. When they are done they press **Send**. This copies a short "change link" that holds all their edits, with no password and no account, and they paste it to the developer in Slack or email. The developer opens it, sees every fix on the real page, and clicks **Create pull request**. GitHub opens a pre-filled form, the developer submits it, and a small GitHub Action in the team's own repo (free, nothing for us to host) opens the pull request within about a minute. No secret exists anywhere in this design, so a leaked link can only _propose_ text, and a person still has to approve it.

**Layers (the default comes first):**

- **Default (milestones A+B): zero-credential change link plus one-click approval on GitHub.** This works on every host. Teams not on GitHub run one command instead of the click.
- **Built in:** translators who already have GitHub access can press "Open on GitHub" themselves, and the PR arrives with no developer step.
- **Opt-in later (milestone C, only if you ask for it):** fully automatic delivery for translators _without_ GitHub accounts. This needs a token inside the link, which is the risky part, so it is never the default.

## 2. Translator experience: exact steps

1. Open the link the developer pinned, for example `https://www.acme.com/livelocale/index.html`, in any desktop browser. There is no sign-up, no password prompt and nothing to install. If the site has its own login (basic auth or company SSO), sign in as usual. It carries over because the Studio is on the same site.
2. First visit only: three tips appear ("Hold Alt/Option and click any text"), plus an optional "Your name" field so you are credited in the pull request.
3. The website appears inside the Studio. The language you are editing is shown at the top. It is detected by matching the page text, and you can change it if it is wrong.
4. Hold **Alt** (Option on Mac) and click the wrong text. The editor shows the source-language text, the current translation, chips for parts that must stay (such as `{name}` or `<b>`), and one box per plural form.
5. Type the fix. The page updates as you type. Press **Save** (Ctrl+Enter). If a placeholder is missing, a plain message explains it, and "Save anyway" stays available (it is marked for the developer).
6. Keep browsing and fixing. Your changes survive reloads and closing the tab. A counter shows "5 changes not sent", and **Changes** lists before/after with Undo for each item.
7. Click **Send to developer** and add an optional note. Then choose one:
   - **Copy link** and paste it to the developer in any chat or email.
   - **Download file**, for very large batches.
   - **Open on GitHub**, if you have access to the project. You then press "Submit new issue", and a pull-request link appears as a comment about a minute later.
8. Sent changes stay visible and are marked "Sent". After the team merges and republishes, they turn "Live now" and leave the list. If someone else changed the same text in the meantime, it is flagged "changed by someone else, please check".

**Developer receiving a change link:** click it, and the Studio opens in **Review mode** with the proposed edits overlaid read-only on the real page and a before/after table with check results. Click **Create pull request**, then **Submit** on GitHub's pre-filled page. Alternatives:

- `npx livelocale apply "<link or file>" --pr`, which works for any git host.
- Actions → LiveLocale → **Run workflow** → paste the link, for repos with Issues turned off.

## 3. Developer setup: exact steps

**React + Vite site on Apache, Nginx, S3, Pages or Netlify (the main case):**

```bash
npx livelocale init --share        # detects Vite, adds `share: true` to liveLocaleVite(...),
                                   # writes .github/workflows/livelocale.yml (GitHub remotes only)
git add -A && git commit -m "chore: enable LiveLocale share link" && git push   # workflow must be on the default branch
npm run build                      # unchanged; dist/ now also contains livelocale/
# upload dist/ exactly as today
npx livelocale doctor --app https://www.acme.com   # checks headers, service worker, manifest; prints the share link
```

Optional, one checkbox: GitHub → Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests". Without it, the Action pushes the branch and comments a one-click "Create pull request" compare link instead.

**Other stacks (what `init --share` writes for you):**

| Stack                      | Build change                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRA / webpack / Rsbuild    | `"build": "react-scripts build && livelocale pack build"`. This is an explicit `&&`, not a `postbuild` hook, because Yarn Berry and some pnpm versions skip pre/post scripts, and hosts that call the bundler directly skip them too ([yarn](https://v2.yarnpkg.com/advanced/lifecycle-scripts), [pnpm](https://pnpm.io/cli/run)). |
| Next.js `output: 'export'` | `"build:preview": "livelocale build --preview -- next build"`, deployed to a staging location, because the HTML is pre-rendered and must be watermarked at build time.                                                                                                                                                             |
| Next.js on Vercel/Node     | For the Preview environment, use the build command `livelocale build --preview -- next build`. It packs into a gitignored `public/livelocale/`.                                                                                                                                                                                    |
| Custom CI                  | `LIVELOCALE=preview <your build>` (only for SSR/SSG), then `npx livelocale pack <outDir>`.                                                                                                                                                                                                                                         |

The generated workflow is about 25 lines:

````yaml
name: LiveLocale
on:
  issues: { types: [opened] }
  issue_comment: { types: [created] }
  workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }
permissions: { contents: write, pull-requests: write, issues: write }
concurrency: { group: 'livelocale-${{ github.event.issue.number || github.run_id }}', queue: max }
jobs:
  apply:
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'issues' && contains(github.event.issue.body, '```livelocale')) ||
      (github.event_name == 'issue_comment' && !github.event.issue.pull_request &&
       startsWith(github.event.comment.body, '/livelocale'))
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned-sha>
      - run: npx --yes livelocale@<exact-version> apply --github-event
        env: { GITHUB_TOKEN: '${{ github.token }}' }
````

The payload is never interpolated into `run:`. `apply` reads `$GITHUB_EVENT_PATH` in Node.

## 4. How it works

```
 static host (any)                                   GitHub (team's own repo)
 ┌───────────────────────────────────────────┐
 │ /livelocale/index.html  Studio (base './')│  Send → change link #lc1.<deflate+base64url>
 │   ├ manifest.json, locales/*.json         │        │ (Slack / email / file)
 │   └ <iframe src="../?livelocale-origin=…">│        ▼
 │ /index.html  your app                     │  developer Review mode → "Create pull request"
 │   └ <script src="/livelocale/flag.js">    │        │ pre-filled issue / comment / Run workflow
 │      sets flag ONLY if framed by Studio   │        ▼
 └───────────────────────────────────────────┘  Action: validate → 1 commit → branch → PR
```

1. **Pack.** At build time, LiveLocale writes these files into the output folder:
   - `livelocale/` with the Studio rebuilt with Vite `base: './'` and self-hosted fonts.
   - `manifest.json`, which holds format version, the repo slug only when `exposeRepo: true` (see section 10), default branch, base SHA (from git or CI variables such as `GITHUB_SHA`, `VERCEL_GIT_*` or `COMMIT_REF`), the repo-relative locales path and layout, the source locale, the app base path, and `codeKeys` from KeyScanner. Static mode therefore gets real code-key coverage, which today's GitHub preview mode lacks.
   - `locales/<code>.json`.
   - `flag.js`.

   Every HTML file gets `<script src="<absolute base>/livelocale/flag.js">` as the **first child of `<head>`**. It is external, so a `script-src 'self'` CSP still passes. The URL is absolute and base-path aware (Vite `base`, Next `basePath`, CRA `homepage`, or `--base`). Next outputs skip the injection because `NEXT_PUBLIC_LIVELOCALE` is already inlined.

2. **Framed-only activation.** `flag.js` sets `window.__LIVELOCALE_FLAG__='preview'` only when `window.parent` is same-origin and its path is under the Studio path. A cross-origin parent throws, and the flag stays unset. `env.ts` already reads this global at call time, and a classic head script runs before module and deferred bundles. Ordinary visitors therefore never get watermarks. For client-rendered SPAs this means **one normal build** serves both visitors and the Studio: no second build, no staging host, and no backend CORS, cookie or OAuth-origin changes. SSR/SSG outputs (Next export, Next server) still need a `LIVELOCALE=preview` build, as today.
3. **Same-origin Studio.** `config.ts` resolves the app URL relative to the Studio (`new URL('../', location)`), reads `./manifest.json` instead of an inline injected config, and ignores `?app=` in static mode. Origin checks in IframeBridge and useConnection pass with no allow-list. The client defaults to the same-origin parent when `?livelocale-origin` is missing, so Alt+Click survives full-page navigations.
4. **Saving without a server.** `src/studio/api.ts` gains a `static` transport behind the same function signatures:
   - Reads come from the manifest, deep-merged with drafts.
   - `saveTranslation` runs the extracted write rules in the browser, then stores `{locale, key, from, to, force}` in a dedicated IndexedDB database keyed by repo+locale+key, recording the base SHA on each draft.
   - The Studio reports mode `static`, and the existing `COMMIT_PREVIEW` resend in `useStudio` (today gated on `mode === 'preview'`) also runs for `static`, driven by persisted drafts. Fixes therefore stay on the page across reloads.
5. **Change link.** The payload is `{v:1, repo, base, src, by, note, e:[[locale,key,from,to,force?]]}`, compressed with `CompressionStream('deflate')` (zlib format) and base64url-encoded as `lc1.…`. Base64url has no percent-encoding blow-up, so 20 Arabic edits come to about 1.1–1.9 K characters. The zlib Adler-32 check makes a truncated or altered link fail loudly. Above about 6 K characters, Send offers a file instead.
6. **Turning it into a PR.**
   - **Review mode** opens `github.com/<repo>/issues/new?title=…&body=…`. The URL carries only a one-line summary and the fenced `livelocale` block, never labels or assignees, because users without the matching permission get a 404 for those. If the URL is too long, the block goes to the clipboard and the form says "paste here".
   - **The Action** (`apply --github-event`) does the following:
     - Trust gate: `author_association` must be OWNER, MEMBER or COLLABORATOR, or else `GET /collaborators/{user}/permission` must return write or higher. This covers private org members misreported as CONTRIBUTOR. Untrusted authors get "Waiting for a maintainer: comment `/livelocale apply`".
     - Decodes with `maxOutputLength` and enforces caps.
     - Re-validates every edit, recomputing the placeholder reference from the source locale on the default branch.
     - Does a per-key 3-way check: current == from is applied, current == to is reported as already done, anything else is listed as a conflict.
     - Writes **one commit per batch** through the Git Data API (blob, tree, commit, ref) on a **new branch** `livelocale/issue-<n>` (or `run-<id>`).
     - Opens or reuses the PR with `Closes #n`, an escaped before/after table, and `livelocale check` results, then comments the PR link on the issue.
   - **The local CLI** (`apply "<link|file|->" --pr`) does the same with the developer's own git and `gh`, on any git host.
7. **Closing the loop.** When a rebuilt manifest contains `to`, the Studio marks that draft "Live now" and drops it. If the manifest value is neither `from` nor `to`, it is flagged as "changed by someone else".
8. **Server stacks.** `vite dev` and `next dev` are unchanged. Next on Vercel/Node uses the same `/livelocale/` link. Its existing token-based direct-commit route stays available, as an optional same-origin transport in milestone C.

**Reused, unchanged or nearly so:**

- `E:/works/next-i18n-lens/src/client/watermark.ts`, `wrap.ts` and `dom-interceptor.ts`.
- `E:/works/next-i18n-lens/src/client/iframe-bridge.ts` and `index.ts`. Build on `resolveStudioOrigin` (commit 3ebc8f8), which already remembers the origin per tab, and add the same-origin-parent default ahead of the `http://localhost:3010` fallback.
- `E:/works/next-i18n-lens/src/core/env.ts` (the `BROWSER_FLAG_GLOBAL` path).
- `E:/works/next-i18n-lens/src/core/validate.ts`, `placeholders.ts`, `icu-plural.ts`, `json-path.ts`, `safe-path.ts` and `deep-merge.ts`, in the browser and in the Action.
- `E:/works/next-i18n-lens/src/server/file-mutator.ts` (layout resolution, indentation-preserving serialization) and `key-scanner.ts`.
- `E:/works/next-i18n-lens/src/server/github-gateway.ts`: the PR open-or-reuse logic, REST helpers and empty-request permission probes, factored into a shared module with portable base64.
- `E:/works/next-i18n-lens/src/server/git-client.ts` (pathspec-scoped commits for `apply --pr`).
- `E:/works/next-i18n-lens/src/codemod/check.ts` and `doctor.ts`.
- Studio: `useStudio`, `useSelection` (422 "Save anyway"), `useHistory`, TranslationEditor, PluralEditor, ChangesPanel and SetupProblems.
- `E:/works/next-i18n-lens/src/server/router.ts` stays as it is for server stacks.

**New modules:**

| Module                                   | Purpose                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/save-rules.ts`                 | `validateWrite()` extracted from `router.ts` `handlePost`, shared by the router, the static transport and `apply`. This replaces running the HTTP router in the browser, which would hit GEN-001, SEC-011 and the info-mode gate.                                  |
| `src/core/change-link.ts`                | `lc1.` codec: schema, caps, browser `CompressionStream` and Node `zlib.inflateSync` with `maxOutputLength`.                                                                                                                                                        |
| `src/server/pack.ts`                     | `livelocale pack <outDir>` and `livelocale build [--preview] -- <cmd>`, a cross-platform env wrapper that detects the output folder and stops on Next `output:'export'` when the init-generated POST route exists.                                                 |
| Vite plugin build half                   | `apply` becomes a function. `transformIndexHtml` injects flag.js first in `<head>`, and emitFile/writeBundle writes `livelocale/`.                                                                                                                                 |
| `flag.js` template                       | Framed-only gate.                                                                                                                                                                                                                                                  |
| `src/studio/transport/static.ts`         | Manifest reads, IndexedDB drafts, generated diff, Live-now reconciliation. Also: the `api.ts` transport switch, relative app URL in `config.ts`, the `static` mode in the `useStudio` loop, and locale inference by matching clicked text against manifest values. |
| Studio UI                                | Send dialog (Copy link, Download, Open on GitHub), Review mode, unsent counter, beforeunload guard, "Download backup", first-run tips, self-hosted fonts.                                                                                                          |
| `livelocale apply`                       | Link, file, stdin or `--clipboard` input (cmd.exe caps arguments at 8,191 characters); `--pr`; `--github-event`; `--force` honoured only for maintainers.                                                                                                          |
| Workflow template and `init --share`     | Stack detection for Vite, CRA/webpack, Next export and Next server. `init` is Next-only today.                                                                                                                                                                     |
| `FileMutator({ requireEnabled: false })` | `assertEnabled()` throws on runners and in plain terminals.                                                                                                                                                                                                        |
| `doctor` static probes                   | Frame headers, service worker, CSP, manifest and flag reachability.                                                                                                                                                                                                |
| Tests                                    | Codec round-trip, save-rules, apply 3-way, Action event fixtures, and a new static Vite playground for Playwright E2E (`vite build`, plain static server, Studio, Send, `apply`, assert JSON diff).                                                                |

## 5. Security model and honest risks

**Who can write what (default design):**

- **The share link, the build, the static host and the browser hold no credential.** Anyone who opens `/livelocale/` can only edit text in their own browser.
- **A leaked change link** is only proposed text. To reach git, a trusted GitHub user has to submit it, or a developer has to run `apply`, and then a person has to merge the PR.
- **Write authority** belongs to the Action's per-job `GITHUB_TOKEN`, scoped by the `permissions:` block, or to the developer's own git/gh login. The Action writes only under `localesPath`, only on a new `livelocale/*` branch, and never directly to the default branch.

**Validation enforced by `apply`.** The browser checks are for UX only; the authoritative checks run in `apply`:

- locale format and safe segments, key path and prototype-pollution guards;
- value at most 10 k characters;
- ICU syntax;
- placeholder parity against a reference **recomputed from the source locale** on the default branch. The client-sent `reference` is ignored, because `router.ts` today only checks parity when the client sends one;
- caps: at most 500 edits and at most 512 KB after inflation;
- values that add markup, `javascript:` or new URLs compared with the source are flagged;
- client `force` is never applied automatically; it needs a maintainer `/livelocale apply --force`.

The PR body escapes translator text (code spans, neutralised `@mentions` and `#refs`).

**Workflow hygiene:**

- The payload comes from `$GITHUB_EVENT_PATH` only. `issues` and `issue_comment` workflows run from the default branch with a write-capable token even when outsiders trigger them, which is why the trust gate exists ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [GitHub Security Lab](https://securitylab.github.com/research/github-actions-untrusted-input)).
- No `pull_request_target`; PR-thread comments are filtered out.
- Pinned action SHAs and an exact `livelocale` version.
- `queue: max` keeps up to 100 pending runs in order instead of cancelling them ([changelog](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues), [syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)).
- One commit per batch keeps usage far below `GITHUB_TOKEN`'s 1,000 requests/hour per repo and the 80/min and 500/h content-creation limits ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).

**Honest risks:**

1. **Same origin.** The Studio iframe uses `allow-same-origin allow-scripts`, so with a same-origin page it gives no isolation ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)). App scripts (analytics, chat widgets, an XSS) can read _and alter_ drafts. This is accepted because nothing secret is stored. Mitigations: a read-only diff before Send, and PR review as the trust boundary.
2. **Public exposure.** `/livelocale/manifest.json` publishes every locale string, all key names, the repo slug and the base SHA. In SPAs the strings are already public, but unused keys and the repo name are new. The Studio is `noindex`, and `exposeRepo: false` is available. Whether this may ship on production is open question 2.
3. **Supply chain.** Every adopter grants `contents: write` to a pinned `livelocale` package, which makes the maintainer's npm account a target. Publish only through CI trusted publishing with provenance, as commit `f2bb232` already does.
4. **Not fully automatic.** A translator without a GitHub account needs one developer click. "Sent" in the default mode means "handed over", not "in a PR".
5. **Drafts live in one browser.** Clearing site data, Safari's 7-day cap on script-writable storage ([source](https://docs.didomi.io/releases-and-announcements/announcements/apple-implements-7-day-cap-on-script-writable-storage)), private windows and per-deploy preview URLs (each a new origin) can lose unsent work. Mitigations: IndexedDB instead of localStorage (which survives an app's `localStorage.clear()`), an unsent banner, beforeunload, "Download backup", and a stable alias URL.
6. **Public repos.** Issues are public, including the translator's name and strings, and each issue notifies watchers.
7. **Bot PR friction.**
   - CI on `GITHUB_TOKEN` PRs starts in an approval-required state and needs one "Approve workflows to run" click ([docs](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow)).
   - The PR-creation setting is off by default on personal repos and inherited in orgs ([docs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)); the fallback is a compare link.
   - Vercel may refuse to deploy commits by non-member authors ([KB](https://vercel.com/kb/guide/commits-not-triggering-deployments), [community](https://community.vercel.com/t/github-deployments-blocked-with-commit-author-is-not-a-member-of-the-team/45174)). The commit author is set to the maintainer who triggered the run, with a `Translated-by:` trailer. This is unverified until tested.
8. **Links travel through third parties.** Change links sit in chat history and in mail link-rewriters. That is harmless here because they hold proposals, not secrets.

**If opt-in inbox mode (C) is ever built:**

- The token goes in an **empty companion inbox repo**; the writer credential lives there as an Actions secret.
- `share` probes the token and refuses any token with contents, actions-write or administration scope.
- The token's expiry travels in the fragment, and the token is kept in sessionStorage only.

This keeps out the refuted risk that an issues-only token, acting as the developer, can fire IssueOps or AI-agent workflows and read private issues.

## 6. Host coverage matrix

| Host                                | Share link works?                           | One-click PR (GitHub)                                         | Separate preview build?                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apache / Nginx static (Vite, CRA)   | Yes                                         | Yes                                                           | No (framed-only flag)                                        | Real files beat SPA fallbacks. Staging must not send `X-Frame-Options: DENY` or `frame-ancestors 'none'` (SAMEORIGIN is fine); doctor checks. Works behind basic auth.                                                                                                                                                                                                                                                                                                                          |
| S3 + CloudFront                     | Yes                                         | Yes                                                           | No                                                           | The link must end in `index.html`, because an S3 REST origin does not resolve subfolder indexes. Response-headers policy must not be DENY.                                                                                                                                                                                                                                                                                                                                                      |
| GitHub Pages                        | Yes                                         | Yes                                                           | No for SPAs                                                  | Folder is `livelocale/`, with no underscore that Jekyll would drop ([docs](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll)). Base path `/repo/` handled, and the locale heuristic strips it. Pages sites are public; one site per repo ([docs](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)). Project sites share `<owner>.github.io`, which is acceptable because only drafts are stored. |
| Netlify / Cloudflare Pages (static) | Yes                                         | Yes                                                           | No for SPAs                                                  | Check `_headers` for DENY. Per-deploy URLs are separate origins, so share the branch alias. Password protection carries over.                                                                                                                                                                                                                                                                                                                                                                   |
| Vercel (static output)              | Yes                                         | Yes (bot-commit deploy may be blocked on Hobby private repos) | No for SPAs                                                  | Deployment Protection is on by default for previews: turn it off or give the translator access (doctor detects the wall).                                                                                                                                                                                                                                                                                                                                                                       |
| Next.js on Node / Vercel (server)   | Yes                                         | Yes                                                           | Yes (preview deployment with `LIVELOCALE=preview`, as today) | Studio served from `public/livelocale/`. Optional direct per-save commits through the existing route in C.                                                                                                                                                                                                                                                                                                                                                                                      |
| Next.js static export               | Yes                                         | Yes                                                           | Yes (HTML is baked at build)                                 | `livelocale build --preview -- next build`. It stops with a fix if `app/api/livelocale` exports POST, which export mode rejects ([Next docs](https://nextjs.org/docs/app/guides/static-exports)).                                                                                                                                                                                                                                                                                               |
| Vite dev / next dev                 | Yes (unchanged dev mode, local JSON writes) | n/a                                                           | n/a                                                          | `npx livelocale studio` unchanged. "Import change link" (B) replays edits into the dev app.                                                                                                                                                                                                                                                                                                                                                                                                     |
| CRA / webpack                       | Yes                                         | Yes                                                           | No                                                           | Explicit `&& livelocale pack build`. The flag reaches the app through the window global, so no `REACT_APP_` variable is needed.                                                                                                                                                                                                                                                                                                                                                                 |
| GitLab / Bitbucket remotes          | Yes                                         | No (CLI `apply --pr`)                                         | as above                                                     | Automation is GitHub-only in this milestone (open question 3).                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PWA (Workbox / vite-plugin-pwa)     | Yes, after one config line                  | Yes                                                           | as above                                                     | `navigateFallback` may serve the app shell; doctor prints `navigateFallbackDenylist: [/^\/livelocale\//]` ([Workbox](https://developer.chrome.com/docs/workbox/app-shell-model), [issue](https://github.com/antfu/vite-plugin-pwa/issues/218)).                                                                                                                                                                                                                                                 |
| Phones / tablets                    | View only                                   | —                                                             | —                                                            | Alt+Click needs a keyboard. Tap-to-select Edit mode in the existing iframe client is planned for C.                                                                                                                                                                                                                                                                                                                                                                                             |

## 7. What the skeptics refuted or flagged, and how this design handles it

| Finding                                                                                                                                                                                                                                                                                                                                                                                               | Source proposal           | Handling                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "A leaked link cannot touch code" is false: an issues PAT acts as the developer and fires IssueOps or `@claude` workflows                                                                                                                                                                                                                                                                             | Inbox Links, Postcards    | The default link holds **no token**. Opt-in inbox goes into an isolated companion repo, with token probing.                                                              |
| Fine-grained PATs are unavailable to outside collaborators; orgs require approval by default ([PAT docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [org policy](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization)) | Inbox, Mailbox, Postcards | The default needs no PAT at all, so freelancers and org members are not blocked.                                                                                         |
| Reactions are disabled on locked issues ([docs](https://docs.github.com/en/communities/moderating-comments-and-conversations/locking-conversations))                                                                                                                                                                                                                                                  | Inbox                     | No reactions. Status goes through Action reply comments.                                                                                                                 |
| Per-key commits blow rate budgets                                                                                                                                                                                                                                                                                                                                                                     | Inbox, Mailbox            | One Git Data API commit per batch.                                                                                                                                       |
| Force-reset race; rulesets block force pushes                                                                                                                                                                                                                                                                                                                                                         | Mailbox                   | New branch per issue or run; `queue: max`.                                                                                                                               |
| Lifecycle not wired; squash merge breaks branch reuse                                                                                                                                                                                                                                                                                                                                                 | Inbox                     | Branches are never reused. `Closes #n` closes the issue. Studio "Live now" reconciles from manifest content.                                                             |
| Placeholder parity trusts the client `reference` (`router.ts` ~line 384)                                                                                                                                                                                                                                                                                                                              | Mailbox, Inbox            | `save-rules` recomputes the reference from the source locale; client `force` is ignored.                                                                                 |
| "`GITHUB_TOKEN` PRs never get CI" is out of date                                                                                                                                                                                                                                                                                                                                                      | Inbox, Postcards          | Document the one-click approval; an optional App token is available.                                                                                                     |
| `postbuild` is unreliable                                                                                                                                                                                                                                                                                                                                                                             | Inbox, Mailbox            | Vite build hook plus an explicit `&&` or `livelocale build` wrapper; doctor verifies the deployed flag.                                                                  |
| In-browser router fails on GEN-001, SEC-011 and the info mode; the `useStudio` loop is gated on `preview`                                                                                                                                                                                                                                                                                             | Handoff                   | The router is not run in the browser. Validation is extracted; the `static` mode drives `COMMIT_PREVIEW`.                                                                |
| `FileMutator.assertEnabled()` throws on runners                                                                                                                                                                                                                                                                                                                                                       | Handoff                   | `requireEnabled: false`.                                                                                                                                                 |
| Bridge falls back to `localhost:3010` after navigation                                                                                                                                                                                                                                                                                                                                                | Handoff, Postcards        | Same-origin parent default, on top of the in-progress `resolveStudioOrigin`.                                                                                             |
| flag.js is not base-path aware; inline scripts break CSP                                                                                                                                                                                                                                                                                                                                              | Handoff, Mailbox          | Absolute, base-aware external `flag.js`; manifest JSON instead of inline config; self-hosted fonts.                                                                      |
| Issue prefill `labels` returns 404; Arabic tables overflow the URL ([docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query))                                                                                                                                                                                       | Handoff                   | Only the compressed block goes in the URL; the readable table is posted by the Action.                                                                                   |
| `author_association` misreports private org members ([apache/arrow#34381](https://github.com/apache/arrow/issues/34381))                                                                                                                                                                                                                                                                              | Handoff                   | Fallback to the permission API.                                                                                                                                          |
| Same-origin scripts can tamper, not just read                                                                                                                                                                                                                                                                                                                                                         | Handoff                   | No secret is stored; read-only diff before Send; PR review.                                                                                                              |
| Drafts keyed by build SHA are orphaned; localStorage is fragile                                                                                                                                                                                                                                                                                                                                       | Postcards                 | IndexedDB keyed by repo+locale+key, with base SHA per draft.                                                                                                             |
| Default concurrency group cancels pending runs                                                                                                                                                                                                                                                                                                                                                        | Postcards                 | `queue: max`.                                                                                                                                                            |
| `<html lang>` writes edits into the English file                                                                                                                                                                                                                                                                                                                                                      | Inline Editor             | Locale inferred by content match, then URL, then a required picker; the target locale is always shown.                                                                   |
| `tsup splitting:false` would ship the editor in production                                                                                                                                                                                                                                                                                                                                            | Inline Editor             | No new chunk. Runtime activation uses client code already in the bundle (`dist/react` already inlines it).                                                               |
| "Propose on GitHub" can commit to main                                                                                                                                                                                                                                                                                                                                                                | Inline Editor             | Not used. The Action never writes the default branch.                                                                                                                    |
| Next export rejects the init-generated route                                                                                                                                                                                                                                                                                                                                                          | All                       | `build` detects it and stops; `init --share` does not write the route for export projects.                                                                               |
| Service-worker shell hijack                                                                                                                                                                                                                                                                                                                                                                           | Inbox, Handoff            | Doctor detection plus the printed denylist line.                                                                                                                         |
| The `X-GitHub-Api-Version` claim was wrong; device-flow OAuth is blocked by CORS (no client secret needed)                                                                                                                                                                                                                                                                                            | Mailbox, Inbox            | Not relevant: the default makes no browser calls to the GitHub API.                                                                                                      |
| Pasted npm `E404`                                                                                                                                                                                                                                                                                                                                                                                     | All                       | Not a blocker: `livelocale@0.8.0` is on the registry (published after the failed attempt). It was a publish-permission issue on the manual run. Do not re-publish 0.8.0. |

## 8. Rejected alternatives

- **A separate LiveLocale server (Studio plus API):** the owner rejected it as too hard to deploy.
- **Inbox Links as the default:** an issues PAT in the link acts as the developer (IssueOps exposure, private-issue reads). It also needs per-translator token minting, rotation and org approval, and outside collaborators cannot mint one.
- **Actions Mailbox:** an Actions:write PAT in the link can dispatch deploys, approve fork runs, rewrite the OIDC subject and delete logs. That blast radius is too large.
- **Inline Shadow-DOM editor:** it fights host focus traps, breaks ZWNJ/ZWJ paste, hits Tailwind `@property` problems ([PR](https://github.com/tailwindlabs/tailwindcss/pull/15975)) and has locale errors; 5–7 weeks of risk.
- **A contents-write token in the link (browser commits directly):** a leaked link would mean push access to the repo.
- **Browser OAuth or device flow:** `github.com/login/*` sends no CORS headers (live probe), so it is impossible without a server.
- **A hosted relay run by us:** violates the free/OSS, no-hosted-product rule.
- **Serverless functions per host (Netlify or Vercel functions):** not universal; Apache and S3 have none.
- **A browser extension:** breaks "no extension".
- **`github.com/new/<branch>?value=` "Propose on GitHub":** the parameter is undocumented, and the flow lets users commit straight to main.
- **Embedding a token in the build (`--embed-token`):** GitHub auto-revokes PATs pushed to public repos ([docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)).

## 9. Effort and milestone split

Realistic total for a solo maintainer, to the repo's test and docs standard: about **18–21 days for A+B**. The verifiers estimated 20–25 days for the comparable full scope.

- **Milestone A, "Share link on any host" (10–12 days):**
  - Studio with `base './'`, self-hosted fonts and manifest-based config.
  - Same-origin bridge default.
  - Vite plugin build half, `pack`, framed-only `flag.js`, `build` wrapper.
  - Extracted `save-rules`, static transport with IndexedDB drafts, `static` re-apply loop, locale inference.
  - `lc1` codec, Send dialog (Copy, Download), Review mode.
  - `apply --pr` and `FileMutator requireEnabled`.
  - Doctor static probes, static Vite E2E fixture, README section "Share link on any host".

  A ships value on its own for every host and every git provider.

- **Milestone B, "One-click pull request on GitHub" (7–9 days):**
  - Workflow template and `apply --github-event`: trust gate, batch commit, branch per issue, PR open/reuse, compare-link fallback, check results, escaping, commit author.
  - "Create pull request" and "Open on GitHub" buttons.
  - `workflow_dispatch` paste path.
  - Multi-stack `init --share`.
  - "Import change link" in the local Studio.
  - Live-now reconciliation.
  - One manual smoke test against a real sandbox repo.
- **Milestone C, optional (6–10 days, only on request):**
  - Same-origin direct transport for Next server: the router accepts an Origin equal to its own host.
  - Tap-to-select Edit mode for phones.
  - Opt-in inbox mode in a companion repo.

## 10. Decisions (owner, 2026-10-26)

1. **One developer click per batch is acceptable for the first release.** Translators without a GitHub
   account send a change link; a developer turns it into a pull request with one click. Account-less
   fully automatic PRs (opt-in inbox mode, milestone C) are not part of this work. Positioning:
   "…every fix becomes a pull request with one click."
2. **`/livelocale/` may ship on production builds, opt-in.** `share: true` (or `livelocale pack`) is an
   explicit choice; it never turns on by itself. The manifest omits the repository slug by default
   (`exposeRepo: false`). Then the change link carries no `repo` field, and Review mode asks the
   developer for `owner/repo` the first time they press "Create pull request" and remembers it in that
   browser; the Action and `apply` already run inside the repository and do not need it. Translators
   never see or need the slug. The Studio page is `noindex`.
3. **One-click automation is GitHub-only in this milestone.** Other git hosts use
   `npx livelocale apply "<link>" --pr`, which works anywhere git works.

### Calls made by Claude after the builder check (owner may override)

4. **Base branch.** The manifest records the branch the site was built from (git or CI variables). The
   v1 link carries it as `branch`. The Action targets that branch only if it is in an allow-list that
   `init --share` writes into the workflow (`--branches`, default: the repository's default branch);
   otherwise it targets the default branch and says so in its comment. Edits are compared against the
   target branch. When the target is not the default branch, the PR body links the issue instead of
   `Closes #n`, and the Action closes the issue itself after the PR is merged or closed.
5. **"Open on GitHub" for translators** appears only when `exposeRepo: true`. With the default
   (`false`), translators use Copy link or Download; the developer path is unchanged. The README
   explains when to turn it on (private repositories whose translators already have GitHub access).
6. **One app per repository in this milestone.** `init --share` writes `--locales` and `--source` into
   the workflow and the build script; there is no new config file. The link's `src` field is
   informational only: the Action and `apply` read the source locale from their own arguments and
   recompute the placeholder reference from the repository. Monorepos with several apps are later work.

Scope: milestones **A** (share link on any host) and **B** (one-click pull request on GitHub). Milestone C
is out of scope unless the owner asks for it.
