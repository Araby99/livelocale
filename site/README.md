# livelocale landing site

The landing page for livelocale, built with Vite into `site/dist` and deployed to GitHub Pages by
`.github/workflows/site.yml`. Until the js.org domain is claimed it is served at
`https://araby99.github.io/livelocale/`.

## Develop

From the repository root:

```sh
npm ci
npm ci --prefix site
npm run dev --prefix site
```

## Build

```sh
npm run build
npm run site:build
```

`SITE_URL` sets the site's absolute URL (default `https://araby99.github.io/livelocale/`). Its
pathname becomes the Vite base, so the same build works on the Pages sub-path and on a custom
domain:

```sh
SITE_URL=https://livelocale.js.org/ npm run site:build
```

## Test

```sh
npm run test:site
```

The site E2E suite serves the build under the `/livelocale/` base on port 4173.

## Deploy

1. In the repository's Settings → Pages, set **Source** to **GitHub Actions**.
2. The `site` workflow tests every pull request and push to `main` that touches `site/`, `brand/`,
   `src/` or the root package files.
3. Its `deploy` job runs on `workflow_dispatch` (run the workflow by hand from the Actions tab),
   and on pushes to `main` only once the repository variable `SITE_LIVE` is `true`. Until the
   owner sets `SITE_LIVE`, merges to `main` deploy nothing.
4. The repository variable `SITE_URL` overrides the build's URL (used for the domain switch below).

## Claiming livelocale.js.org (owner only)

The js.org pull request is opened by the owner. No agent opens this PR, pushes for it or changes
the repository settings below.

1. **Confirm the Pages URL serves the site.** With `SITE_LIVE` still off, run the `site` workflow
   once by `workflow_dispatch`. The site is then served, unlisted, at
   `https://araby99.github.io/livelocale/`; js.org reviewers need a live site before they merge.
2. **Open the js.org pull request.** Fork `js-org/js.org`, add this line to `cnames_active.js` in
   alphabetical order:

   ```js
   "livelocale": "araby99.github.io/livelocale",
   ```

   Open a pull request titled `livelocale.js.org` whose description links the repository
   (`https://github.com/araby99/livelocale`) and the live Pages URL
   (`https://araby99.github.io/livelocale/`).

3. **After it merges, switch the domain** (the domain switch in `LAUNCH.md`):
   - set the repository variable `SITE_URL` to `https://livelocale.js.org/`;
   - in Settings → Pages, set the custom domain to `livelocale.js.org` and turn on
     **Enforce HTTPS**;
   - run the `site` workflow again so the build carries the new URL.

   No `CNAME` file is committed: GitHub ignores it when Pages deploys from a custom Actions
   workflow.
