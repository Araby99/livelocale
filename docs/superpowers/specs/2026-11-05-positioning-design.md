# Positioning: a layer on top, for teams first

Date: 2026-11-05. Status: draft for owner approval. Owner approved the positioning, the audience order, and that the landing talks to the developer; the rest is my calls, marked, for the owner to check in this document.

## Intent and the why

An outside CTO reviewed LiveLocale on 2026-11-05 (pasted into the conversation by the owner). His verdict was 7.5/10. He scored the idea 9, architecture 8, Next.js integration 8, CI value 8, and proven maturity 4. His main warning: _don't confuse a tool that improves how translations are managed with the system responsible for multi-language itself_. LiveLocale is the first, not the second. He would recommend it to teams with content or marketing people, and said a solo developer who translates their own JSON probably doesn't need it.

Today the pieces of that message exist but are scattered, and the main surfaces pitch a one-developer tool:

- **The README** says "Keep next-intl or react-i18next…", but only below the logo, in the second line.
- **The npm description** reads "Click any text in your running React app to edit its translation." That's a single developer's action.
- **The landing page** never says what LiveLocale is _not_, and never says who it's for.
- **The docs intro** describes the mechanism, not the audience.

The goal is that someone landing on any of our surfaces knows within a few seconds three things: what LiveLocale is (an editing and review layer on top of their i18n library), who it's for (teams first), and why they can trust it (proof, not promises).

## The positioning (owner-approved, 2026-11-05)

**What it is.** LiveLocale is the editing and review layer on top of the i18n library a team already uses (next-intl or react-i18next). People fix text on the real site; every fix lands as an ordinary edit to the JSON locale files in git, or as a pull request. A CI check catches missing translations and text hard-coded in JSX.

**What it isn't.** It is not an i18n library. It does not do routing, locale detection, date and number formatting, or message rendering; the team's i18n library keeps doing those. It is not a hosted translation platform or a replacement for one at large scale (the comparison section on the landing already covers the platform side).

**Who it's for, in this order:**

1. **Teams with marketing or content people** who review copy and keep asking developers for text changes. This is the main audience and the one the landing speaks to first.
2. **Freelance and agency developers** who work alone but whose client reviews the copy. The client fixes their own text through a share link instead of sending screenshots.
3. **Any developer who only wants the CI check.** `npx livelocale check --hardcoded` works without the Studio.

**The solo developer who translates alone** _(my call, after the builder check)_: addressed positively, and only inside the CI-check audience entry ("Who it's for" item 3 and its README line), e.g. _"Translating on your own? The CI check alone catches missing keys and hard-coded text."_ Never phrased as "this isn't for you" or "the Studio may be more than you need".

## Who the landing talks to (owner decided, 2026-11-05)

The landing's main reader is **the developer who brings LiveLocale to their team**: developers find and install npm packages; content people usually arrive through a share link the developer sends them.

- The landing's existing two doors stay as they are: **"I ship the site"** (default) and **"I fix the text"** (`site/index.html` ~236-250). No change to the door script, labels or default.
- The hero lede keeps addressing "you", the developer. The current lede already says the team fixes text; the change is mainly adding the layer framing (on top of next-intl or react-i18next).
- The new **"Who it's for"** block and the **"what it isn't"** line sit **outside the doors**: shown to every visitor whichever door is picked, like the "Edit every language your site speaks" section.
- The FAQ heading "Questions developers ask" stays.

## Goals

1. **One positioning, everywhere.** The statement above, adapted per surface, on: the landing page, the README top, the npm `description` (and `keywords` if they don't already cover it), the docs "Get started" intro, the generated SEO/AI files (`site/src/lib/seo-files.ts`: llms.txt, llms-full.txt, JSON-LD, meta), and the GitHub repo description.
2. **Say what it isn't, early.** At the top of the README and in the landing hero area or directly under it, in one short line. The FAQ gains an explicit "Is it an i18n library?" question (or the existing "Which i18n libraries does it work with?" answer is rewritten to say it plainly).
3. **A "Who it's for" block on the landing** naming the three audiences in order, each with its one-line story and link (team → Studio/share links docs, freelancer → share links, CI-only → CI check guide). Placed outside the doors, after the door stories and before the comparison section, shown whichever door is chosen; added to the section-order check in `tests/site/static.spec.ts`. _(Placement is my call; the builder may move it if the page flow argues otherwise, but it must stay outside the doors and come before the FAQ.)_
4. **Proof on the page, not promises.** Three proof points, each backed by something a reader can check:
   - _Nothing ships to production_: already true and documented (`site/docs/how-it-works/safety-switches.md`); link it.
   - _The invisible markers don't break Arabic or other right-to-left text_: today this rests on unit tests of encode/decode round-trips (`tests/unit/watermark.test.ts`) and a docs explanation (`site/docs/how-it-works/watermarking.md:28`). The 2026-10 shaping fix was verified pixel-identical **by hand**. Add an **automated rendering test** that proves it (see "Arabic rendering proof"), then state it on the page and in the docs with a link.
   - _The CI check's limits are stated_: already stated in `site/docs/guides/ci-check.md:147` ("Only JSX is checked… nor object literals such as page metadata"). The landing's CI excerpt or FAQ should link it, so the limit is visible, not buried.
5. **Hero:** the headline **"Stop collecting screenshots."** stays (owner confirmed by approving the playback). The lede under it changes from the one-developer pitch to the team pitch with the layer framing. Draft, for the builder to refine within the site's voice: _"livelocale sits on top of next-intl or react-i18next. Your content people fix text on the real site, and you get a pull request."_
6. **Freelancer story** gets a concrete line where share links are explained (landing fixer story and share-links guide intro): the client fixes their own copy, the freelancer reviews a PR.

## Non-goals

- **The metadata/SEO text check** (the CTO's "CI misses metadata" point) as a feature. It is a candidate for a later piece; here we only make the existing limit visible.
- **Social proof and maturity** (stars, users, case studies). Can't be built; it comes from the launch. The launch posts in `.superpowers/launch/posts.md` should be reworded to this positioning, but that is a follow-up, not part of this work.
- **Brand, visual design, hero video.** No new visuals beyond the "Who it's for" block in the existing system.
- **Product behaviour.** No code changes to the Studio, client or CLI, except the new test.
- **Arabic as a selling point.** Per the owner's 2026-11-05 decision, Arabic appears as a translation showcase and as _proof_ of right-to-left safety, never as "an Arabic tool".

## Anti-goals

- Any claim we can't back with a link to code, a test, or a doc page.
- Overclaiming against next-intl/react-i18next or naming competitors (the landing's existing rule: no competitor names; `tests/site/landing-sections.spec.ts` enforces the list).
- Telling solo developers to go away. They're in the picture, just not first.
- Marketing tone that breaks the site's established voice (plain, concrete, no hype; see the brand comment block at the top of `site/index.html` and `PRODUCT.md`/`DESIGN.md` if present).

## Arabic rendering proof

An automated Playwright test, run in the normal e2e suite (Chromium; WebKit/Firefox if the site test config already covers them cheaply), that proves the watermark does not change how right-to-left text renders:

- Render the same strings twice on one page: plain, and wrapped with `encodeKey(text, key)` (the real watermark). Include Arabic words whose first and last letters have distinct joined forms, a mixed Arabic + Latin + digits string, a Persian string containing a real ZWNJ, and Hebrew.
- Assert the rendered boxes are identical in width and height, and that a pixel screenshot of each pair matches (element screenshots compared byte-for-byte, or with zero-tolerance `toHaveScreenshot` if the project's snapshot setup allows it without committing platform-specific baselines; the builder chooses the most robust approach that doesn't create flaky cross-OS baselines).
- A control case proves the test can fail: a string wrapped with a joining character (U+200D) next to an Arabic letter renders differently, and the test asserts that difference.
- Docs: `site/docs/how-it-works/watermarking.md` gets a short "Tested on right-to-left scripts" paragraph linking the test file. The landing proof line links that docs section.

## Surfaces and what changes

| Surface                                                                  | Change                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `site/index.html` `<title>` + meta description + og/twitter descriptions | Team + layer framing                                                                                                           |
| Hero lede                                                                | As goal 5                                                                                                                      |
| New "Who it's for" section                                               | Goal 3                                                                                                                         |
| Fixer story / share-links copy                                           | Freelancer line (goal 6)                                                                                                       |
| FAQ                                                                      | "Is it an i18n library?" answer; CI limits link                                                                                |
| Proof line(s)                                                            | Goal 4, linking safety-switches, watermarking (new section), ci-check limits                                                   |
| `README.md` top                                                          | Lead with layer + teams; "what it isn't" line; freelancer and CI-only in one line each                                         |
| `package.json` `description` (+ `keywords` if useful)                    | Team + layer framing, still ≤ ~200 chars                                                                                       |
| `site/docs/index.md` intro                                               | Same framing; audience line                                                                                                    |
| `site/docs/guides/share-links.md` intro                                  | Freelancer/client line                                                                                                         |
| `site/src/lib/seo-files.ts` (llms.txt, llms-full.txt, JSON-LD)           | Same framing                                                                                                                   |
| GitHub repo description                                                  | Same framing (owner has delegated repo management; do it with `gh repo edit`)                                                  |
| `CHANGELOG.md`                                                           | Not needed for copy-only changes; add a line only for the new test if the project logs test additions (check existing entries) |

## Constraints

- Existing site tests pin some copy (e.g. hero text, FAQ question list in `tests/site/landing-sections.spec.ts`, docs-page description length 50–160 chars in `tests/unit/site/docs-pages.test.ts`, seo files tests). Update tests deliberately alongside copy; don't weaken guards (competitor list, description length, link checks).
- Lighthouse/a11y gates on the landing must keep passing (`npm run test:site`).
- The landing must still work without JavaScript (`tests/site/static.spec.ts` checks section order; add the new section there).
- npm `description` changes ship with the next release; README and site go live on push to `main`.

## Left to the builder

Exact wording (within the positioning, the drafts above and the site's voice), the visual layout of the "Who it's for" block within the existing design system, whether "what it isn't" sits in the hero aside or directly below the hero, the screenshot comparison method for the rendering test, and keyword choices.
