---
title: Any static host (share links)
description: Ship the Studio inside your build, deploy it to any static host, and get each fix to your site's text back as a pull request.
---

# Any static host (share links)

Four steps from one command to a pull request with a fix to your site's text. Each step shows what you should see when it worked. The Studio ships inside your build at `<base>livelocale/`, so any host that serves the site serves the Studio too: Apache, Nginx, S3, GitHub Pages, Netlify, Cloudflare Pages or Vercel. Nothing runs on a server and nobody needs an account.

<DocClip name="alt-click-edit" label="Alt+Click the Tidewell headline in the share Studio, fix the typo in the editor and save it." caption="Step 3 on the deployed site: Alt+Click, fix, save." />

You need an app built with Vite, Astro, CRA, webpack, Rsbuild or Next.js, its translations in JSON files, and its text going through livelocale's wrapper, as in step 2 of [Vite + React](./vite.md), step 2 of [Astro](./astro.md) or step 3 of [Next.js](./nextjs.md). The one-click pull requests need the code on GitHub.

## 1. Run `init --share`

```bash
npx livelocale init --share
```

It finds your stack and changes its build so the build also writes the Studio, then, on a GitHub remote, writes `.github/workflows/livelocale.yml`, which turns change links into pull requests. It prints every file it creates, updates, leaves unchanged or skips, then what is left for you to do. On a Vite app with a GitHub remote:

```cli init-share-vite

```

On Vite it adds `share: true` to your `liveLocaleVite({ ... })` call. On CRA it adds `livelocale pack build --locales <path> --source <locale>` after the bundler in the `build` script, and on webpack and Rsbuild the same command packing `dist`; on Next.js it adds a `build:preview` script that runs `livelocale build --preview --locales <path> --source <locale> -- next build`. The whole table, and setting the build up by hand, are in [Share links](../guides/share-links.md#set-up).

::: details Didn't work?

- It stops with `Pass --locales <path>.`: your locale files are not in `locales`, `src/locales`, `public/locales`, `src/i18n/locales` or `messages`. Run `npx livelocale init --share --locales <path>`.
- It prints "No supported build setup found": in custom CI, build with `LIVELOCALE=preview` (only for SSR and SSG), then run `npx livelocale pack <outDir>`.
- On Vite it skips `vite.config.ts` with "no liveLocaleVite(...) call": add the plugin first, as in step 2 of [Vite + React](./vite.md).
- On Next.js with `output: 'export'` it says to delete the route file `npx livelocale init` wrote (`app/api/livelocale/route.ts`): a static export rejects POST routes, and `livelocale build` stops while the file exists. Delete it; the share link does not need it. Without it the dev Studio cannot save to your locale files, so on that app fixes reach the files through change links and `npx livelocale apply`.
- It writes no workflow and says one-click pull requests need GitHub: on another git host you turn a change link into a branch with `npx livelocale apply "<link>" --pr`; see [Other git hosts](../guides/share-links.md#other-git-hosts).
- After you deploy (next step), `npx livelocale doctor --app <url> --share` checks the share build on the live site.

:::

## 2. Push, deploy and open the share link

Commit and push what `init --share` wrote. The workflow must be on the default branch, because GitHub runs issue and comment workflows only from there.

On GitHub, tick the one setting the workflow needs: in the repository's **Settings → Actions → General → Workflow permissions**, tick **Allow GitHub Actions to create and approve pull requests**. Without it the workflow still commits the branch, but the issue comment carries a compare link and you open the pull request yourself.

Deploy as usual, then check the deployment and print the share link. On Next.js, use `npm run build:preview` (the script `init --share` added) only as the build command of a staging or preview deployment, never production: it watermarks every page's text. A plain `next build` has no Studio, so production keeps it.

```bash
npx livelocale doctor --app <url> --share
```

The doctor checks the Studio page, the manifest, `flag.js`, frame headers and service workers, then prints `🔗 Share link: <base>livelocale/index.html`. Open it in a browser, on a computer or a phone: the Studio opens over your site, with three tips and an optional name field on the first visit. Pin the link for the people who fix your text.

<DocShot name="share-open-link" alt="A share link opened on the Tidewell demo site: the Studio over the page, with the three first-run tips and the optional name field." caption="The first visit: three tips and an optional name." />

::: details Didn't work?

Run `npx livelocale doctor --app <url> --share` against the deployed site and fix each line it marks.

- **Share Studio page** fails: the deployed site has no Studio at `livelocale/index.html`, or the host answers it with your app's page. Check that your host runs the build `init --share` changed and uploads the `livelocale/` folder from the build output.
- **S3 and CloudFront:** the link must end in `index.html`.
- **Netlify and Cloudflare Pages:** `_headers` must not send `X-Frame-Options: DENY` or `frame-ancestors 'none'`; `SAMEORIGIN` is fine.
- **Vercel:** Deployment Protection must be off for the deployment you share, or the person must have access to it.
- A Workbox service worker answers the Studio with your app shell: add `navigateFallbackDenylist: [/^\/livelocale\//]` to its Workbox options.
- Every host is in [Hosting notes](../guides/share-links.md#hosting-notes).

:::

## 3. Fix text and send it

This step is for the person fixing your text. There is no sign-up, no password and nothing to install. They hold **Alt** (Option on a Mac) and click the wrong text, type the fix and press **Save**, as in the clip at the top of this page.

Fixes stay in their browser, through reloads and closing the tab, until they send them. They click **Send to developer**, add an optional note, and choose **Copy link** to paste it in any chat or email, or **Download file** for a large batch.

<DocClip name="send-link" label="Open Send to developer in the Studio and get the change link for the fix." caption="Send to developer turns the fixes into one change link." />

::: details Didn't work?

- A click on the text follows the link or does nothing: that text does not go through livelocale's wrapper, so it carries no watermark. `npx livelocale check --hardcoded` lists the text in your components that never goes through translation.
- **Save** shows a placeholder warning: the fix dropped or added a `{placeholder}`. **Save anyway** stays available and marks the edit for you.
- No text responds at all: run `npx livelocale doctor --app <url> --share`. Its **Share flag script** line checks that `flag.js`, which turns the watermarks on inside the Studio, loads first in `<head>` of your pages.

:::

## 4. Get the pull request

Open the change link you were sent. The Studio opens in **Review mode**, with the proposed edits shown read-only on the real page and each change listed with its check.

<DocShot name="share-review-mode" alt="A change link opened in the Studio: review mode shows the fix on the Tidewell page and lists each change with its check, Create pull request and the apply command." caption="Review mode: every change on the real page, with its check." />

Press **Create pull request**. It opens a GitHub issue already filled in with the change link; press **Submit new issue**. About a minute later the workflow has committed the edits on a `livelocale/issue-<n>` branch, opened the pull request and commented its link on the issue. You review and merge it like any other.

::: details Didn't work?

- Review mode asks for `owner/repo`: the build does not publish the repository unless you set `exposeRepo: true`. Type it once; that browser remembers it.
- The issue gets "Waiting for a maintainer": the workflow writes only for a maintainer. Comment `/livelocale apply` on the issue.
- The issue comment carries a compare link instead of a pull request: tick the setting in step 2, or open the pull request from that link.
- Edits saved with **Save anyway** are skipped as `needs --force`: comment `/livelocale apply --force` to include them.
- From your own machine, on any git host: `npx livelocale apply "<link>" --pr`. To check the deployment again, run `npx livelocale doctor --app <url> --share`.

:::

## What next

- [Share links](../guides/share-links.html): the workflow, the trust gate, base branches and every host.
- [Catch untranslated text in CI](../guides/ci-check.html): fail the build on missing keys, placeholder drift and hardcoded text.
- [Right-to-left sites](../guides/studio.html#right-to-left-sites): edit an Arabic or Hebrew site that flips right to left under the Studio.
