---
title: Share links
description: Ship the Studio inside your build so anyone can fix text on the deployed site, then turn their change link into a pull request.
---

# Share links

A share link lets someone fix your site's text on the deployed site, with no account and no install, and every fix comes back to you as a pull request. Working freelance? Your client fixes their own copy on the site you deployed, and you review a pull request instead of a pile of screenshots.

<DocShot lead name="share-review-mode" alt="A change link opened in the Studio: review mode shows the fix on the Tidewell page and lists each change with its check, Create pull request and the apply command." caption="What you get back: every change on the real page, with its check and Create pull request." />

It needs no server, no account and no credential anywhere. The Studio ships inside your build at `<base>livelocale/`, so any host that serves the site serves the Studio too: Apache, Nginx, S3, GitHub Pages, Netlify, Cloudflare Pages or Vercel. The fixes stay in that person's browser until they send you a change link. On GitHub you turn the link into a pull request with one click; on any other git host, with one command.

## Set up

1. Run `npx livelocale init --share` in your project. It sets up the build for your stack and, on a GitHub remote, writes `.github/workflows/livelocale.yml`. It prints every file it creates, updates, leaves unchanged or skips, then what is left for you to do.
2. Commit and push the result. The workflow must be on the default branch, because GitHub runs issue and comment workflows only from there.
3. On GitHub, tick [the one setting](#the-one-checkbox-setting) below.
4. Deploy as usual, then check the deployment and print the share link. On Next.js, use `npm run build:preview` (the script `init --share` added) only as the build command of a staging or preview deployment, never production: it watermarks every page's text. A plain `next build` has no Studio, so production keeps it.

On a Vite app with a GitHub remote, the first step looks like this:

```cli init-share-vite

```

The build change depends on your stack:

| Stack                      | Build change                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite                       | `share: true` in `liveLocaleVite(...)`.                                                                                                                                                  |
| CRA                        | `"build": "<bundler> && livelocale pack build --locales <path> --source <locale>"`, for example `"build": "react-scripts build && livelocale pack build --locales locales --source en"`. |
| webpack and Rsbuild        | The same, packing `dist`: `"build": "<bundler> && livelocale pack dist --locales <path> --source <locale>"`.                                                                             |
| Next.js `output: 'export'` | `livelocale build --preview -- next build`, deployed to a staging location, because the HTML is pre-rendered and must be watermarked.                                                    |
| Next.js on Vercel/Node     | `livelocale build --preview -- next build` as the Preview environment's build command. It packs into a gitignored `public/livelocale/`.                                                  |
| Astro                      | `livelocale build --preview -- astro build`, deployed to a staging location, because Astro renders the text at build time.                                                               |
| Custom CI                  | `LIVELOCALE=preview <build>` (only for SSR/SSG), then `npx livelocale pack <outDir>`.                                                                                                    |

For CRA, webpack and Rsbuild, use an explicit `&&`, not a `postbuild` script: Yarn Berry and some pnpm versions skip pre and post scripts, and hosts that call the bundler directly skip them too. Every flag of the command is on the [`init --share` reference](../reference/cli/init.md#share).

On a GitHub remote, `init --share` writes this workflow. `X.Y.Z` is the livelocale version you installed; `locales`, `en` and `main` come from your project:

````yaml
# Written by `npx livelocale init --share`. Turns LiveLocale change links into pull requests.
# livelocale reads the link from the event file; it never reaches a shell command.
name: LiveLocale
on:
  issues: { types: [opened] }
  issue_comment: { types: [created] }
  pull_request: { types: [closed] }
  workflow_dispatch: { inputs: { link: { description: 'LiveLocale change link', required: true } } }
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
      - run: npx --yes livelocale@X.Y.Z apply --github-event --locales locales --source en --branches main
        env: { GITHUB_TOKEN: '${{ github.token }}' }
````

It reads the change link only from the event file, never from a shell command, and it has no `pull_request_target` trigger. `init --share` leaves an edited workflow alone unless you pass `--overwrite`.

Once the site is deployed, check it and print the share link:

```bash
npx livelocale doctor --app <url> --share
```

The doctor checks the Studio page, the manifest, `flag.js`, frame headers and service workers, then prints `🔗 Share link: <base>livelocale/index.html`. Pin that link for the people who fix your text.

## The one-checkbox setting

In the repository's **Settings → Actions → General → Workflow permissions**, tick **Allow GitHub Actions to create and approve pull requests**.

Without it the workflow still commits the branch, but GitHub refuses to let it open the pull request. The issue comment then carries a one-click compare link that opens the pull request form already filled in, and you press **Create pull request** there.

## What the person fixing text does

1. Open the share link in a current Chrome, Edge, Firefox or Safari, on a computer or a phone. There is no sign-up, no password and nothing to install. If the site has its own login, sign in as usual.
2. On the first visit, read the three tips and, optionally, type a name to be credited in the pull request.
3. Check the language shown at the top. It is detected from the page text; change it if it is wrong.
4. Hold **Alt** (Option on Mac) and click the wrong text; on a phone or a tablet, tap it while the switch at the bottom is on **Edit** ([on a phone](./studio.md#on-a-phone)). The editor shows the source text, the current translation, the placeholders that must stay, and one field per plural form.
5. Type the fix and press **Save** (Ctrl+Enter). When a placeholder is missing, a message explains it, and **Save anyway** stays available; it marks the edit for the developer.
6. Keep browsing and fixing. Changes survive reloads and closing the tab. A counter shows how many are not sent yet ("5 changes not sent"), and **Changes** lists each one with Undo.
7. Click **Send to developer** and add an optional note. Then choose **Copy link** and paste it in any chat or email, or **Download file** for a large batch. On a phone, **Share link…** hands the link to the phone's share menu.
8. Sent changes stay in the list, marked "Sent". Here "Sent" means the link was handed over; it is not a pull request until a developer applies it.

<DocShot name="share-open-link" alt="A share link opened on the Tidewell demo site: the Studio over the page, with the three first-run tips and the optional name field." caption="The first visit: three tips and an optional name." />

<DocClip name="send-link" label="Open Send to developer in the Studio and get the change link for the fix." caption="Send to developer turns the fixes into one change link." />

**Open on GitHub** in the Send dialog lets someone with GitHub access file the issue themselves, so the pull request opens with no developer click when they are a collaborator. It is there only with `exposeRepo: true`, because it needs the repository's `owner/repo` in the public manifest.

## What the developer gets

Open the change link. The Studio opens in **Review mode**, with the proposed edits shown read-only on the real page and a before and after table with the check results. Then turn it into a pull request. The shot at the top of this page is a change link opened this way.

**On GitHub, with the workflow:**

- Press **Create pull request** in Review mode. It opens a GitHub issue already filled in with the change link; press **Submit new issue**. About a minute later the workflow has committed the edits on a `livelocale/issue-<n>` branch, opened the pull request and commented its link on the issue. Without `exposeRepo: true`, Review mode asks for `owner/repo` the first time and remembers it in that browser.
- With issues turned off, or for a link you would rather not file: **Actions → LiveLocale → Run workflow**, paste the link and run it. The result is on the run's summary page.

**The trust gate.** The workflow writes only for a maintainer: the issue author or the commenter must be an owner, member or collaborator, or have write access. In an organization that includes any member or invited collaborator, even one with read-only access: they can turn a link into a pull request, but only people with write access can merge it. For anyone else it replies "Waiting for a maintainer: comment `/livelocale apply`", and nothing is written until a maintainer posts that comment on the issue. Edits saved with **Save anyway** are skipped as `needs --force`; comment `/livelocale apply --force` to include them.

**Base branches.** By default every pull request targets the default branch. To let links made from other builds, such as a `staging` deployment, target their own branch, list the branches with `npx livelocale init --share --branches main,staging`. A link from any other branch targets the default branch, and the comment says so. A pull request into the default branch says `Closes #n`, so merging it closes the issue. Into another branch it says `Refs #n`, because GitHub only closes issues from the default branch, and livelocale closes the issue itself when that pull request is merged or closed. Merge `.github/workflows/livelocale.yml` into each extra branch too: pull requests into it run workflows from that branch.

### CI on these pull requests without the approval click

Pull requests opened with the workflow's `GITHUB_TOKEN` start their CI in an approval-required state: someone has to press **Approve workflows to run** on each one. Pull requests opened with a GitHub App token start CI as usual. To use one:

1. Create a GitHub App with **Contents**, **Pull requests** and **Issues** set to read and write, and install it on the repository.
2. Store its Client ID (on the App's settings page) as the repository variable `LIVELOCALE_APP_CLIENT_ID` and its private key as the secret `LIVELOCALE_APP_PRIVATE_KEY`.
3. In `.github/workflows/livelocale.yml`, add this step before the `apply` step and give its token to the `apply` step as `GITHUB_TOKEN`:

```yaml
- id: app-token
  uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0
  with:
    {
      client-id: '${{ vars.LIVELOCALE_APP_CLIENT_ID }}',
      private-key: '${{ secrets.LIVELOCALE_APP_PRIVATE_KEY }}',
    }
- run: npx --yes livelocale@X.Y.Z apply --github-event --locales locales --source en --branches main
  env: { GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}' }
```

## Other git hosts

On another git host, `init --share` writes no workflow. Turn a change link into a branch from your machine:

```bash
npx livelocale apply "<link or file>" --pr
```

This works with your own `git` login: it commits only the locale files on a new `livelocale/apply-<time>` branch and pushes it. On GitHub it opens the pull request with `gh`; elsewhere it prints the branch to open a pull or merge request from. Every edit is checked again against your own files first.

For a long link, use `npx livelocale apply --clipboard`, or pass `-` and pipe the link in (`npx livelocale apply - < changes.txt`). Every option is on the [`apply` reference](../reference/cli/apply.md).

## Hosting notes

- **S3 and CloudFront:** the link must end in `index.html`, because an S3 REST origin does not resolve folder indexes.
- **GitHub Pages:** the folder is `livelocale/`, with no underscore for Jekyll to drop, and a project site's `/repo/` base path is handled.
- **Netlify and Cloudflare Pages:** `_headers` must not send DENY (`X-Frame-Options: DENY` or `frame-ancestors 'none'`); SAMEORIGIN is fine. Every per-deploy URL is a separate origin with its own drafts, so share the branch alias (for example `https://staging--site.netlify.app/livelocale/index.html`), not a per-deploy URL.
- **Basic auth and host password protection** carry over, because the Studio is on the same site.
- **Vercel:** Deployment Protection must be off for the deployment you share, or the person must have access to it. `doctor --app` reports the login wall.
- **PWA:** a Workbox service worker (vite-plugin-pwa, workbox-webpack-plugin) can answer the Studio with your app shell. Add `navigateFallbackDenylist: [/^\/livelocale\//]` to its Workbox options.
- **Relative bases** (`base: './'`, CRA `homepage: '.'`): pages served by a client-side route fallback cannot load `flag.js`, so `pack` prints a warning recommending an absolute base (`--base /path/`) when the app has such routes.

What a share link exposes, and what it cannot do, is on the [security page](../how-it-works/security.md#share-links); its limits, drafts in one browser among them, are on [risks and limits](../how-it-works/risks-and-limits.md).
