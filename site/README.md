# livelocale landing site

The landing page for livelocale, built with Vite into `site/dist` and deployed to GitHub Pages by
`.github/workflows/site.yml`. Until the js.org domain is claimed it is served at
`https://araby99.github.io/livelocale/`.

Going live is a checklist: [`LAUNCH.md`](LAUNCH.md), from the merge to `main` to the domain
switch and the 0.12.1 release that carries the short README to npm. The short README that
replaces the root `README.md` on go-live day is prepared in [`launch/README.md`](launch/README.md).

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

## Search engines and AI assistants

Every page's robots rule, canonical URL, share tags and JSON-LD, and the files written beside the
site (`sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt` and a `.md` copy of every docs
page) come from `SITE_URL` and the docs sources on every build: `src/lib/seo.ts`,
`src/lib/seo-files.ts` (run from the VitePress config's `buildEnd`) and
`src/lib/docs-markdown.ts`. A `github.io` `SITE_URL` builds the noindex preview;
[`LAUNCH.md`](LAUNCH.md) has the details. The name is always `livelocale` (DESIGN.md, Do's).
`404.html` is the landing page's 404, which Pages serves for any missing address under the site,
the docs included.

## Docs media

The docs' screenshots and clips (`DocShot`, `DocClip`) come from the real Studio, made by one
command. It needs the built CLI and both playground installs:

```sh
npm run build
npm ci --prefix playground
npm ci --prefix playground-vite
node site/scripts/record-docs.mjs
```

Pass names to re-shoot only those (the rest of the manifest is kept), for example
`node site/scripts/record-docs.mjs next-alt-click send-link`. The names, the app each one films
and what it shows are `SHOTS` and `CLIPS` in `site/scripts/docs/media.mjs`.

- The dev shots run `next dev -p 3100` in `playground/`, `vite --port 5180` in `playground-vite/`
  and `livelocale studio --port 3110`; the share shots and the clips pack the Tidewell stage
  (`site/stage`) as `record-hero.mjs` does and serve it on a port in 5170-5179, browsed as
  `http://tidewell.example`. A server already answering on 3100, 3110 or 5180 stops the run;
  `DOCS_NEXT_PORT`, `DOCS_VITE_PORT` and `DOCS_STUDIO_PORT` move those three servers, and the
  provenance sidecars name the ports used.
- Saves in the dev Studio write the playgrounds' locale files; the recorder snapshots
  `playground/locales/` and `playground-vite/locales/` and puts them back after every capture.
- Shots are Chromium at 1440x900, DPR 2, saved as WebP q82 at 1200 px wide; clips are Playwright's
  `recordVideo` at 1280x720, encoded to VP9 WebM and H.264 MP4 (no audio) with the last frame as
  the poster. Everything goes to `site/media/docs/` with a provenance sidecar per raster and
  `manifest.json` (the sizes the components read). No cursor or overlay is added.
- `share-send-dialog` saves its change link to `site/scripts/docs/fixtures/change-link.txt`, which
  `share-review-mode` opens.

In a page: `<DocShot name="next-alt-click" alt="…" caption="…" />` and
`<DocClip name="send-link" label="…" caption="…" />`. An unknown name or an empty `alt` or `label`
fails the build, and a unit test checks every page's tags against the manifest.

## Performance gate

`site/scripts/lighthouse.mjs` runs Lighthouse on the built site, as a phone sees it:

```sh
npm run build
npm run site:build
npm run lighthouse --prefix site
```

- It serves `site/dist` under `/livelocale/` on port 4174 (`tests/site/fixtures/serve.mjs`; a
  server already answering there stops the run) and measures `LH_PATHS`: the landing page, the
  docs front door `docs/` and `docs/start/nextjs.html`.
- Each page is run 3 times with Lighthouse's default mobile emulation and simulated throttling, in
  Playwright's Chromium (`--headless=new --no-sandbox`) launched by `chrome-launcher`. It prints
  every run and the median: performance, accessibility, best practices and SEO, the LCP in ms and
  the LCP element's selector.
- It exits 1 when a page's median performance or accessibility is under 0.9.
- The Site workflow runs it after the E2E suite, on the `site/dist` that suite built.
- Lighthouse 13 needs Node 22.19 or later.

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

`hero.mp4` is the master; the page ships its wide cut on screens 640 px and up. After a new take,
run `node site/scripts/hero-cuts.mjs`, then `node site/scripts/hero-frames.mjs`:

- `hero-cuts.mjs` writes `hero-wide.{webm,mp4}` (2:1) with ffmpeg-static: a run of shots cut at the
  master's camera moves (`SHOTS`), each shot with its own crop (`CUTS`), so the timing, and with it
  `chapters.json`, is unchanged. If a new take moves the camera cuts or the Studio layout, update
  `SHOTS` and the crop boxes.
- `hero-frames.mjs` cuts the stills: the wide WebP poster (at 3.5 s, with the fix already on
  screen, so the first paint shows it), the phone poster and one frame per story step in
  `site/media/hero/frames/`. It writes each still's provenance (the video and second it comes
  from) to a `.json` sidecar. Pass still names to cut only those.

Phones get their own take, filmed on a phone screen: `node site/scripts/record-hero.mjs --phone`
plays the phone storyboard on the same stage at 390x844, DPR 3, with touch (the Pixel 7's user
agent), so the share Studio shows its real phone layout: tap the headline, fix it in the editor
sheet, switch the locale chip to Arabic, fill in the button, then Send · 2 and the same pull
request, recorded at the same phone size. Taps show as a touch ripple (no cursor, no keycaps) and
there is no camera move; it is encoded at 780x1688. It writes `hero-phone.{mp4,webm}`,
`chapters-phone.json` and `poster-phone.webp` (through `hero-frames.mjs`, at 3.5 s, the fix saved
in the sheet). It is acted at 1/5 speed (`HERO_SLOW`); `HERO_MP4_CRF` and `HERO_WEBM_CRF` tune its
file size (defaults 25 and 40; higher is smaller). After a new phone take, copy the chapter starts
from `chapters-phone.json` into the chips' `data-start-phone` in `index.html` by hand (the
recorder does not edit the page; a unit test checks they match), and check `poster-phone.webp`
still shows the saved fix. A chip's phone title is its `chapter-phone` span; where the title in
`chapters-phone.json` is too long for a phone chip, the chip keeps it as a `chapter-wide
chapter-full` span (read by screen readers on a phone too) and shows a short `aria-hidden`
`chapter-phone` label ("Every language" for chapter 2).

The page picks the take by viewport (`(max-width: 639px)` is the phone one) and swaps it, with its
chapter times, when the viewport crosses that width. Autoplay is held
until about 2 s after the window has loaded and the page is idle, and the cut attaches only then and
while the video is on screen, so the video's bytes never compete with the poster, the CSS and the
headline font, and the poster (with the fix already on it) stays the largest paint. A chapter or
Play click attaches it and plays at once; under reduced motion it never starts by itself.

## The live demo

"Try the live demo" opens Tidewell, the same stage site the video is filmed on, with its typo and
its missing Arabic button. `site:build` builds `site/stage/` under `<base>demo/`, packs it with the
share Studio (no `--expose-repo`) and copies it to `site/dist/demo/`.

## The CI excerpt

`site/sample/` is a cut of the Tidewell pricing hero with two strings broken on purpose. The build
runs the real `check --hardcoded` on it (`site/scripts/hardcoded-report.mjs`) and sets the output
into the developer story (`site/scripts/check-excerpt.mjs`); the build fails if the check finds
nothing.
