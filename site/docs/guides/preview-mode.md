---
title: Preview mode
description: Edit text against a deployed preview of your app, with every save committed to a git branch through the GitHub API and a pull request to merge.
---

# Preview mode

The dev Studio needs a developer's machine. Preview mode lets a translator or reviewer edit text against a deployed preview of your app instead: each save goes to a git branch and a pull request, not to a local file. Nothing is written to the server's filesystem.

<DocShot lead name="next-studio-open" alt="The Studio beside the running Next.js playground: the Locale Directory lists five keys, the preview shows the page with status Active, and the editor says Select an Element." caption="The Studio a reviewer opens. Shot on the dev Studio; in preview mode the same Studio points at your deployed preview." />

## How it fits together

1. The app is deployed from a branch, say `i18n/preview-edits`, with preview mode on.
2. The Studio, hosted anywhere or run locally with `--app <preview-url>`, embeds that deployment.
3. Each save calls the app's mutation API, which commits the change to `i18n/preview-edits` through the GitHub API. The preview in the Studio updates at once; the deployment itself updates when your host rebuilds the branch.
4. **Open pull request** in the Changes panel proposes the branch to `main`. Reviewers merge it.

## Set up the server

Give the route handler a `github` block:

```ts
// app/api/livelocale/route.ts
import { createLiveLocaleHandler } from 'livelocale/server';

const handler = createLiveLocaleHandler({
  localesPath: 'locales', // repository-relative in GitHub mode
  allowedOrigins: ['https://i18n-studio.example.com'], // where the Studio is served from
  github: {
    repo: 'acme/site',
    branch: 'i18n/preview-edits',
    baseBranch: 'main',
    token: process.env.GITHUB_TOKEN!, // contents: write, pull requests: write
  },
});

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
```

Every option of the `github` block is on the [configuration reference](../reference/configuration.md#github).

## Set the environment

On the preview deployment:

```bash
LIVELOCALE=preview                 # server: watermark and serve the API in a production build
NEXT_PUBLIC_LIVELOCALE=preview     # client bundle: run the scanner and clipboard guards
LIVELOCALE_TOKEN=<long random>     # required; the Studio asks for it once per browser session
GITHUB_TOKEN=<fine-grained PAT>    # Contents and Pull requests: "Read and write" on the repository
```

The app must also let the Studio embed it. Next.js evaluates `headers()` in `next.config` at build time, so a `frame-ancestors` value that lists the Studio's origin has to be there when the preview is built, not only at run time.

On Vite, the plugin copies the server's `LIVELOCALE` into the page, so `LIVELOCALE=preview` alone is enough; no `NEXT_PUBLIC_` variable is needed. Preview mode runs on the Vite dev server only. For a static `vite build` served by Apache, Nginx or a CDN, use a [share link](./share-links.md) instead. Every variable is on the [environment reference](../reference/environment.md).

## Open the Studio on the preview

Open the Studio with `?app=https://<preview-url>`, or start it with `studio --app https://<preview-url>`. It shows a **PREVIEW** badge, asks for the access token, and the Changes panel switches to branch and pull request actions. Code reference scanning is off in this mode, because there is no checkout, so the Locale Directory lists keys from the locale files only.

## Check the deployment

Check a preview deployment before you hand it to anyone:

```bash
npx livelocale doctor --app https://<preview-url> --token <LIVELOCALE_TOKEN>
```

The server checks its GitHub token when the Studio connects. A token that cannot write contents or open pull requests, a missing base branch or an unknown repository is reported in a banner in the Studio and by `doctor`, before anyone loses an edit to a failed save. See the [`doctor` reference](../reference/cli/doctor.md).

## Behaviour worth knowing

- **Edits stay visible.** The deployment keeps serving the text it was built with until the branch is rebuilt, so the Studio re-applies this session's saved values on reload and navigation.
- **Concurrent saves are safe.** Saves to one file are queued, and a save that loses a race with another server instance or another Studio reads the file again and retries.
- **Discard closes the pull request.** Resetting the branch to the base leaves the pull request with no changes, and GitHub closes it.
- **Every save is a commit, and most hosts build every commit.** To save build minutes, skip builds for commits that only touch locale files; the Studio already shows saved edits. On Vercel, set **Project Settings → Git → Ignored Build Step** to `git diff --quiet HEAD^ HEAD -- . ':(exclude)locales'`.
- **Hosting login walls block the Studio.** Vercel's Deployment Protection, on by default for previews, sends the embedded app and the API calls to a Vercel login page. Turn off Vercel Authentication for the preview deployments you edit; `doctor --app` reports it.

## What preview mode does not do

- It never writes to the deployment's filesystem; the GitHub branch is the only store.
- It does not replace authentication for the app itself. The token only guards the mutation API.
- It is not a production feature. Do not set `LIVELOCALE=preview` on a production deployment.
