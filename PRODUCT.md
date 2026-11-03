# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the developer who ships a multi-language website** (Next.js, Vite, React, any static host). They are worn out by the localisation grind: before launch, a pile of screenshots of wrong copy with red circles from colleagues; on launch day, hardcoded or untranslated text and missing keys found in production, often in the language they don't read (Arabic, right to left). They install the package, wire it into the app and CI, and own the pull requests.
- **Secondary: the people who fix the text** (copywriters, translators, content and product people, the client). They are not developers and have no git account. They open a share link, hold Alt, click the wrong text on the real site, fix it in any language, and press Send.
- **First visitor of the landing page:** a skeptical developer arriving from Reddit, LinkedIn or a GitHub/npm link, deciding in seconds whether to try it. Success: they try it and install it.

## Product Purpose

livelocale lets anyone on a team fix a website's text on the website itself, in every language, and turns those fixes into a pull request; a CI check fails the build on text that never went through translation. It exists to end the screenshot-collecting before launch and the untranslated-text surprises on launch day. Success is adoption: people try it and download it.

## Positioning

- The edit happens in context on the real running site (Alt+Click), and the result lands in the developer's own repository as a pull request: no hosted translation system, no account, no server, no vendor lock-in.
- Free and open source (MIT), from one npm package with zero runtime dependencies.
- Arabic and right-to-left are first class (the Studio itself speaks Arabic and mirrors).
- `check --hardcoded` catches, in CI, the hardcoded JSX text and untranslated values that every other tool misses.
- Competitors with in-context editing (Tolgee, Locize, Lokalise, Crowdin) require accounts and send edits to their hosted platform; none show a real site, RTL, or a pull request in their hero (research 2026-11-02, `.superpowers/brainstorm/4253-1793618948/research/`).

## Operating Context

- Developer: `npm i -D livelocale`, `npx livelocale init` (or `init --share` for share links on any static host), the dev Studio beside `next dev`/`vite`, `npx livelocale check --hardcoded` in GitHub Actions or any CI.
- Share mode: `livelocale pack` builds a static share Studio; the fixer opens the link, edits, and sends a change link. On GitHub the generated workflow turns it into a pull request in one click; on other git hosts `npx livelocale apply "<link>" --pr`.
- The Studio wraps the site in a preview panel with a keys directory and an editor side panel; it has light and dark themes and English/Arabic UI.

## Capabilities and Constraints

- Supports Next.js, Vite, React (react-i18next, next-intl and similar JSON catalogues), static hosts; GitHub one-click pull requests; other git hosts via `apply --pr`.
- Current release: 0.11.0 (npm `latest`), MIT, no runtime dependencies, Node ≥ 18.
- Nothing is ever sent anywhere from a public demo; the landing page makes no network requests to third parties and has no analytics or tracking.
- The landing page lives in this repository under `site/`, is built with Vite to static files and deployed to GitHub Pages; the target domain is `livelocale.js.org` (claimed by a js.org pull request, owner action). It goes live only when the owner turns on `SITE_LIVE`.
- Undecided: whether `npx livelocale theme` and a GitHub-annotations output format for `check` become features.

## Brand Commitments

- Name `livelocale`, always lowercase in the wordmark. Logo: the patch over stacked lines (master SVG geometry fixed; `docs/superpowers/specs/2026-11-01-brand-and-landing-design.md` §2.2).
- Brand "hunk" (owner-approved 2026-11-02, §2.3–§2.4b): "your website, as a diff"; dark first; one job per colour (Patch amber = a person changed this, Ghost = old text struck, Hunk cyan = where a string lives, Exit 1 red = CI fails, Exit 0 green = done); Martian Mono display, IBM Plex Sans / Mono / Sans Arabic. The earlier cream-and-coral look was withdrawn as generic.
- Voice: short, direct, a little blunt, written by a developer who has felt the pain; sentence case; no hype. Pitch: "Stop collecting screenshots. Stop finding untranslated text on launch day." The word "PM" is never used.

## Evidence on Hand

- A real product demo video recorded from the real share Studio on a believable demo site, ending on a real public pull request: `.superpowers/hero/hero.mp4` (+ `hero.webm`), recorder `site/scripts/record-hero.mjs` in the `spike/hero-video` worktree (`E:/works/livelocale-hero`).
- Public demo repository `github.com/Araby99/tidewell` (fictional product "Tidewell") and its real pull request #2 made by the livelocale workflow.
- Brand assets in `brand/` (on branch `feat/brand-site`), the packed share Studio, real `check --hardcoded` output.
- No testimonials, customers, user counts, GitHub star counts, benchmarks or press exist; never invent them.

## Product Principles

1. Show the real product doing the real job; never a mockup of it.
2. Zero friction to try: no account, no server, one command.
3. The developer stays in control: every change arrives as a reviewable pull request in their repo.
4. Every language is first class, right to left included.
5. Precision over noise: a check that cries wolf gets turned off.

## Accessibility & Inclusion

WCAG 2.2 AA: keyboard reachable with visible focus, AA contrast, reduced motion respected, a visible pause control for any looping video over 5 s, captions/transcript for the video; works down to 360 px wide.
