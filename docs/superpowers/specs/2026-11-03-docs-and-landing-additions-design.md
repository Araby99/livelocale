# livelocale docs and landing additions

> Status: draft for the owner's approval (2026-11-03); builder-checked, no open questions for the owner. Builds on `docs/superpowers/specs/2026-11-01-brand-and-landing-design.md` (§2 brand "hunk" binding; its §3.2/§3.3 scene list is superseded by the "Two doors" page on branch `feat/landing`), `PRODUCT.md` and `DESIGN.md` (both on `feat/landing`). Items marked _Claude's call_ may be overridden.

## 1. Intent

The landing page convinces; the docs must convert. The owner's words: the visitor clicking "Docs" is "getting it installed and working in their app fast". Today "Docs" points at a 1,038-line README on GitHub, which is reference, not a path to a first success. The owner also finds the landing page "a little bit short".

The site launches only when the landing page and the docs are both ready (owner, 2026-11-03), at `livelocale.js.org` with the docs at `livelocale.js.org/docs/`.

## 2. Goals

1. **Docs whose front door is a getting-started page**, not an overview: pick your stack, copy two or three commands, see the Studio open on your own site within minutes. Every step shows what "it worked" looks like (a real screenshot or short clip of the real product), and a "Didn't work?" note under the step points to `npx livelocale doctor` and the common fixes for that step.
2. **Everything else after the first success:** share links for non-developers, the CI check, the Studio (review, plurals, placeholders, Arabic, themes, keyboard), preview mode, teams, and a complete reference.
3. **Visuals that never go stale:** every docs screenshot and clip is produced by a script from the real product (the same recorder pipeline that made the hero video), so one command refreshes them after a Studio change.
4. **A longer landing page** that still proves rather than pads: three new sections (§4).
5. **Launch-ready quality** for both: the open items from the landing review are closed (§5).

## 3. Docs

### 3.1 Where and how (_Claude's call_, owner agreed in principle 2026-11-03)

- Part of the same site in `site/`, built to `site/dist/docs/` and deployed with the landing page by the existing GitHub Pages workflow (same `SITE_LIVE` gate, same `/livelocale/` base until the js.org domain).
- Built with **VitePress** (a Vite-based docs generator), a devDependency of `site/package.json` only; nothing reaches the npm package.
- A custom VitePress theme on the hunk tokens, fonts and rules from `DESIGN.md` and brand spec §2: dark only, like the landing page (_Claude's call_ after the builder check: one theme keeps the site one world and avoids a second contrast and accessibility pass; a light theme can come later), Martian Mono headings, IBM Plex Sans body, IBM Plex Mono code; code blocks coloured by the one-job rules (keys and paths in Hunk, `+` lines and the fix in Patch, failures in Exit 1, success in Exit 0). The header matches the landing page so moving between them feels like one site.
- Local search (VitePress's built-in offline search). No third-party requests, no analytics (PRODUCT.md).
- English only (an Arabic translation of the docs is a non-goal, §6).

### 3.2 Information architecture

The README is the content source today; the docs rewrite it for learning (task order, short pages, one job per page), and the README then shrinks to what it is, install, a 30-second example and a link to the docs (§3.5).

1. **Get started** (the front door)
   - Pick your stack: **Next.js (App Router)**, **Vite + React**, **Any static host (share links)**. Each path is one page: install, init, run, see the Studio, make the first edit, see the file change. Expected result shown after every step; "Didn't work?" under every step.
   - What next: three links (share with your team, add the CI check, try the Arabic Studio).
2. **Guides**
   - Share links: set up (`init --share`, the GitHub workflow, the one-checkbox setting), what the person fixing text does (open, Alt+Click, fix, Send), what the developer gets (the pull request), other git hosts (`apply --pr`), hosting notes.
   - Catch untranslated text in CI: `check`, `check --hardcoded`, the three kinds, `--strict`, opt-outs (`livelocale-ignore-next-line`, `livelocale-ignore-file`, `--allow`, `livelocale.allow`), a GitHub Actions example, what it does not see.
   - The Studio: editing, reviewing and committing, plural forms, placeholder safety, light and dark, Arabic and right to left, keyboard use.
   - Preview mode: editing without a checkout.
   - Teams and enterprise setups.
   - Migrating from next-i18n-lens.
3. **How it works**
   - Zero-width watermarking (how Alt+Click finds the key), safety switches, when the watermark bites, security, honest risks and limits (the README's own sections, kept honest).
4. **Reference**
   - CLI: one page per command (`init`, `studio`, `doctor`, `check`, `pack`, `build`, `apply`, `migrate`) with every flag.
   - Configuration and environment variables.
   - Changelog (rendered from `CHANGELOG.md`).

### 3.3 Visuals

- A docs capture script beside the hero recorder (_Claude's call_: `site/scripts/record-docs.mjs`) drives the real Studio on the Tidewell stage site and the real CLI, and writes screenshots and short muted clips into the docs' media folder: one named shot per "expected result" step, plus a few clips (Alt+Click to edit, sending a change link, the Arabic switch). One command regenerates all of them; each raster carries its provenance like the hero media.
- Terminal output in the docs comes from running the real CLI at build or capture time, never typed by hand.
- Clips follow the hero's rules: muted, `playsinline`, poster frame, pause control, no autoplay under reduced motion, lazy loading.

### 3.4 Accuracy guards (_Claude's call_)

- A test fails when a CLI command or flag printed by `livelocale --help` / `<command> --help` is missing from the Reference pages, so the reference cannot fall behind the CLI.
- A test fails when a docs link is broken (internal links and anchors), and when an external link points anywhere other than the repo, npm, the Tidewell demo repo, or js.org.
- Every factual statement in the docs and the landing FAQ must be true of 0.11.0's code or README; the builder verifies, and anything unverifiable is left out, not guessed.

### 3.5 README after the docs exist

Short: one-paragraph pitch, install, a 30-second Next.js example, links to the docs pages (getting started, share links, CI, reference), licence. _Claude's call_: the GitHub README shrinks in a commit on go-live day, so it never links to docs that are not public; the npm page shows the README of the last published version, so a patch release on go-live day carries it to npm (the owner creates that release, as for every release). It was planned as a README-only 0.11.1; since 0.12.0 shipped first, it is 0.12.1 and also carries the share address field's locale fix.

## 4. Landing additions

Added to the "Two doors" page (structure, tone and components from `DESIGN.md`). _Claude's call_ on placement: the three sections are shared by both doors, so they sit below the door stories and above "Works where you already are" and the close, visible whichever door is chosen and in the no-JavaScript order; they load below the fold and must not affect the first paint.

1. **Arabic, right to left, done properly.** The Studio and the site flipping to Arabic, shown with a real capture (a still or short clip from the recorder), with one or two sentences: the Studio itself speaks Arabic and mirrors, and the site under it flips. No competitor shows this (research 2026-11-02).
2. **Why not a hosted translation platform?** A factual comparison of the mechanism, not of named competitors (_Claude's call_: no competitor names on the page): where the edit goes (your repo as a pull request vs. their dashboard), account needed, server needed, cost (free, MIT), lock-in. Every row true of livelocale 0.11.0.
3. **Questions developers ask (FAQ):** does anything ship to production; what about security; we don't use GitHub; which i18n libraries; does it work with a static export; what does it cost; is my content sent anywhere. Each answer short, verified, linking to its docs page.

"Docs" in the landing header and every docs link point to `/docs/` pages instead of the GitHub README.

## 5. Launch readiness (both landing and docs)

_Claude's call_ after the builder check: this work continues on branch `feat/landing`, which first merges `main` (the 0.11.0 release and its README) so the docs are written against 0.11.0. The site plan's unfinished gates are taken over here: the accessibility gate and the Lighthouse gate (site plan Tasks 18–19) are built for the landing page and the docs, the clip work of Task 17 is replaced by §3.3, and Task 20's launch checklist (`site/LAUNCH.md`) is written as part of §5. `feat/landing` replaces `feat/brand-site`'s page work when it merges to `main`.

1. **Mobile performance:** Lighthouse mobile performance ≥ 90 on the landing page and on the getting-started page, measured by the existing Lighthouse gate (median of runs); today the landing LCP is about 3.6–4.3 s under throttling.
2. **Browsers:** the site's E2E suite also runs in WebKit and Firefox (Playwright projects), covering the hero video (autoplay muted, poster, pause, chapters), the door switch and the docs search.
3. **Social card:** `og-image.png` redone to match the new page (the diff-pair line and the product, not the old layout), and the docs pages carry their own titles and descriptions.
4. **Hidden preview:** one `workflow_dispatch` run of the site workflow while `SITE_LIVE` is off serves `https://araby99.github.io/livelocale/`; the owner checks it on a real phone, then opens the js.org pull request (owner flag 6 (a) of the site plan).
5. **Go live:** after js.org merges, the domain switch and `SITE_LIVE=true` (owner actions, as in the site plan's `LAUNCH.md`).

## 6. Non-goals

- An Arabic translation of the docs or the landing page.
- Analytics, tracking, newsletter forms, or any third-party request.
- Testimonials, user counts, star counts or benchmarks (none exist; PRODUCT.md).
- Versioned docs (one version, the current release).
- New product features (`npx livelocale theme`, a GitHub-annotations output for `check`) — recorded ideas only.

## 7. Anti-goals

- Docs that read like the README split into pages: the getting-started path must lead to a working Studio, not a feature list.
- Screenshots that drift from the product or are mocked.
- Claims the code does not back.

## 8. Left to the builder

Page-level copy within the voice (brand spec §2.5), the exact capture list and timings, the VitePress theme internals, the FAQ wording, and the comparison table's wording, within the rules above.
