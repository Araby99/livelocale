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

## Docs

The docs are a VitePress site in `site/docs/`, built into `site/dist/docs/` and served at
`<base>docs/` (`https://araby99.github.io/livelocale/docs/` until the domain switch).

```sh
npm run docs:dev --prefix site
```

- Pages are Markdown files under `site/docs/` (`start/nextjs.md` is served as
  `docs/start/nextjs.html`). Each needs frontmatter `title` and `description` (50–160 characters,
  unique) and a sidebar entry in `site/src/lib/docs-config.ts`; a unit test checks both.
- The theme is `site/docs/.vitepress/theme/`: VitePress's default theme without its fonts, the
  landing page's fonts and tokens, `docs.css` (VitePress's colour variables mapped onto the
  palette) and `SiteBrand.vue` (the landing header's mark, in place of VitePress's title).
- Code colours come from `site/docs/.vitepress/hunk-shiki.json`.
- `npm run site:build` builds the docs last, after the landing page and the live demo; `SITE_URL`
  sets their base too. Search is VitePress's local search, so nothing is fetched from elsewhere.

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

## Hero video (spike)

```sh
# needs the root build (dist/); the recorder runs `npm run build` itself when it is missing
node site/scripts/record-hero.mjs
```

Builds the fictional Tidewell pricing site in `site/stage/`, packs it with `livelocale pack`, serves
it on a port in 5170-5179 (browsed as `http://tidewell.example` through a Chromium host-resolver
rule) and records the real share Studio in headless Chromium at 1600x1000, DPR 2 (CDP screencast).
Headless Chromium only paints about 8 frames a second at 3200x2000, so the take is acted three times
slower than it plays, with CSS animations slowed to match, and the timestamps are scaled back. A
camera move (an eased crop keyed to the beats the recorder logs) is added in ffmpeg, and the loop
seam dips to the stage colour and fades back into frame 0.

The stage is published as the public demo repository
[Araby99/tidewell](https://github.com/Araby99/tidewell), set up with `npx livelocale init --share`.
The pack runs with that repository's build identity (`DEMO_REPO`, `DEMO_BRANCH`, `DEMO_BASE`) and
`--expose-repo`, so the change link names it and the Send dialog shows **Open on GitHub**. The take
ends on that real click (the new tab is suppressed: headless and signed out, GitHub would only show
its sign-in page), then dissolves into the real pull request the repository's workflow opened from
the issue that link pre-fills (`PR_URL`): its Conversation tab, a click on **Files changed** and a
cut to the diffs, recorded the same way from the public page. To make a new pull request, file the
issue the recorder prints (`HERO_ISSUE_OUT=<file>` saves the link) and update `PR_URL`. It writes `hero.mp4`, `hero.webm`,
`poster.png`, `contact.png` (12 frames, 4x3) and `chapters.json` to `site/media/hero/`. The cursor,
click ripple and keycaps (Alt, EN → AR) are an overlay the recorder injects into the Studio page;
everything else on screen is the product.

Knobs: `HERO_NO_ENCODE=1` acts the take and prints the beat times only; `HERO_SLOW`, `HERO_DPR` and
`HERO_Q` (screencast JPEG quality) trade capture fps against sharpness; `HERO_KEEP_MASTER=<file>`
keeps the near-lossless master for frame-by-frame review.

`hero.mp4` is the master; the page ships two cuts of it. After a new take, run
`node site/scripts/hero-cuts.mjs` (pass `wide` or `narrow` to cut one), then
`node site/scripts/hero-frames.mjs`:

- `hero-cuts.mjs` writes `hero-wide.{webm,mp4}` (2:1, desktop) and `hero-narrow.{webm,mp4}` (4:5,
  phones) with ffmpeg-static. Each is a run of shots cut at the master's camera moves (`SHOTS`),
  each shot with its own crop (`CUTS`), so the timing, and with it `chapters.json`, is unchanged. If
  a new take moves the camera cuts or the Studio layout, update `SHOTS` and the crop boxes.
- `hero-frames.mjs` cuts the stills: one WebP poster per cut (at 3.5 s, with the fix already on
  screen, so the first paint shows it) and one frame per story step in `site/media/hero/frames/`.
  It writes each still's provenance (the video and second it comes from) to a `.json` sidecar.

The page picks the cut by viewport (`(max-width: 639px)` is the narrow one) and attaches it as soon
as the page is parsed, so the video is playing within the first seconds.

## The live demo

"Try the live demo" opens Tidewell, the same stage site the video is filmed on, with its typo and
its missing Arabic button. `site:build` builds `site/stage/` under `<base>demo/`, packs it with the
share Studio (no `--expose-repo`) and copies it to `site/dist/demo/`.

## The CI excerpt

`site/sample/` is a cut of the Tidewell pricing hero with two strings broken on purpose. The build
runs the real `check --hardcoded` on it (`site/scripts/hardcoded-report.mjs`) and sets the output
into the developer story (`site/scripts/check-excerpt.mjs`); the build fails if the check finds
nothing.
