> **Status: approved by the owner on 2026-11-01; the brand is final.** Produced from a visual design conversation with the owner (mockups saved in `.superpowers/brainstorm/7924-1793549086/content/`). The owner's choices are marked as theirs; "Claude's call" items may be overridden.

# LiveLocale brand and landing page

## 1. Intent

LiveLocale is launching publicly. Its success measure is simple: people try it and download it. The owner wants the first impression to be visual (images, GIFs, video) and creative, not a standard SaaS page. The previous Studio look (colours, fonts, UI) was a placeholder and is **not** part of the brand (owner, 2026-11-01).

The first visitor is, in the owner's words, a developer "really pissed off because of the ache of a multi-language website": screenshots of corrections before launch, and hardcoded or untranslated text discovered on launch day.

Pitch (owner-approved):

> **Stop collecting screenshots. Stop finding untranslated text on launch day.**
> Anyone on your team fixes text right on the site. You get a pull request. CI catches what was never translated.

The word "PM" is never used in the pitch (owner: too narrow).

## 2. Brand

### 2.1 Direction (owner's choice: "Friendly developer")

Approachable for the person fixing text, credible for the developer installing it. Warm cream paper, near-black ink, one coral accent, crisp type, code shown on the page.

### 2.2 Logo (owner's choice: "S1", the patch)

Three lines of text, split into words; a coral fix is stuck, slightly tilted, over the middle line, and the old line still peeks out underneath. It tells the product in one glance: the old text, and the fix placed on top. No tile or container. The wordmark is `livelocale`, all lowercase, set in the heading face.

Master SVG (64×64 grid), the source of truth for every size:

```svg
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <g fill="#1D1712">
    <rect x="6" y="11" width="20" height="8" rx="4"/><rect x="29" y="11" width="29" height="8" rx="4"/>
    <rect x="6" y="28" width="14" height="8" rx="4"/>
    <rect x="25" y="31" width="29" height="2" rx="1" opacity=".5"/>
    <rect x="6" y="45" width="23" height="8" rx="4"/><rect x="32" y="45" width="12" height="8" rx="4"/>
  </g>
  <g transform="rotate(-7 39 32)">
    <rect x="24.5" y="24.5" width="30" height="15" rx="4.5" fill="#C2472C"/>
    <rect x="23" y="23" width="30" height="15" rx="4.5" fill="#FF6B4A"/>
  </g>
</svg>
```

- **On dark:** lines `#F6EEE6`, patch `#FF7A5C`, patch shadow `#9E3A24`.
- **Small sizes (Claude's call):** at 16 px the hairline "old line" is dropped and the patch shadow is removed; the builder produces a 16 px and 32 px favicon tuned on the pixel grid, plus an SVG favicon.
- **Deliverables:** `logo.svg`, `logo-dark.svg`, `mark.svg`, `mark-dark.svg`, `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180 px), `og-image.png` (1200×630), a GitHub/npm avatar (512 px, mark centred on cream), in a `brand/` folder of the repo. The README header uses the logo.

### 2.3 Colour

| Name         | Hex       | Use                                                                 |
| ------------ | --------- | ------------------------------------------------------------------- |
| Paper        | `#FFF8F0` | light background                                                    |
| Ink          | `#1D1712` | text, logo lines, dark buttons                                      |
| Coral        | `#FF6B4A` | the one accent: the fix, the main call to action, text being edited |
| Coral shadow | `#C2472C` | patch shadow, coral pressed state                                   |
| Muted        | `#6B5B4D` | secondary text on paper                                             |
| Line         | `#E9DCCD` | borders and dividers on paper                                       |
| Espresso     | `#1C1714` | dark background                                                     |
| Cream        | `#F6EEE6` | text on espresso                                                    |
| Coral (dark) | `#FF7A5C` | accent on espresso                                                  |

Rules: coral is used sparingly, only for the moment that matters. All text meets WCAG AA (4.5:1) on its background; white text is never placed on coral at body size below 18 px bold (Claude's call: coral buttons use ink text if contrast requires it; the builder verifies).

### 2.4 Type

| Role               | Latin                         | Arabic                             |
| ------------------ | ----------------------------- | ---------------------------------- |
| Headings, wordmark | Bricolage Grotesque (700–800) | **Readex Pro** (600–700)           |
| Interface and body | Inter (400–600)               | **IBM Plex Sans Arabic** (400–600) |
| Code               | JetBrains Mono (500)          | (code stays Latin)                 |

- Bricolage Grotesque and Inter have no Arabic glyphs, so Arabic needs its own faces (owner asked for a good alternative). **Readex Pro** is a variable Latin+Arabic family with a friendly, open geometric character that sits well beside Bricolage's warmth; **IBM Plex Sans Arabic** is a clean, highly legible text face that matches Inter's neutral UI tone and has matching weights. Both are SIL OFL and available from Fontsource. (Claude's call on the exact pair; alternatives considered: Noto Sans Arabic (safe but plain), Alexandria (geometric, more display than text), Tajawal (light weights only feel thin in UI).)
- Fonts are self-hosted (Fontsource packages as devDependencies, bundled into the site and the Studio); nothing loads from Google at runtime.
- `font-family` stacks list the Latin face first and the Arabic face second, so mixed-script text renders each script in its own face; Arabic text gets a slightly larger size and line-height (about 1.08× size, line-height 1.7) for legibility (Claude's call).

### 2.5 Voice

Short, direct, a little blunt; written by a developer who has felt the pain. Plain verbs, sentence case, no hype ("Stop finding untranslated text on launch day", not "Empowering global teams"). Errors and empty states give direction, never apologise.

## 3. Landing page

### 3.1 Where it lives

- A `site/` folder in this repository, built to static files and published with GitHub Pages by a GitHub Actions workflow on pushes to `main` that touch `site/` (Claude's call).
- Domain: `livelocale.js.org` (free; owner approved). Claiming it is a pull request to `js-org/js.org` adding the CNAME, opened by the owner or with the owner's OK. `livelocale.dev` (unregistered as of 2026-11-01) can be bought later; the site moves without changes.
- Stack (Claude's call, revised after the builder check): the page shell is plain HTML, CSS and a little TypeScript built with Vite (already a devDependency). Scenes 2 and 4 are small **React islands** (React + react-i18next, the stack LiveLocale supports), loaded lazily when they scroll into view, so the real product and `check --hardcoded` can run on them while the shell stays light for the Lighthouse target.

### 3.2 Page structure (owner's choice: scene 2 then scene 1, then scene 3 below)

1. **The screenshot pile (opening).** A messy pile of realistic screenshot cards with red circles and notes ("where is this??", `final_FINAL_v3.png`, "arabic is wrong"), under the headline "This was your launch week." As the visitor scrolls, the cards fly together and collapse into one clean pull request card.
2. **The page that is broken on purpose.** The pull request card opens onto the hero: "Stop collecting screenshots." with deliberate typos and one untranslated word on the page. A hint says to hold Alt and click the typo. Each fix shows the coral patch and adds a line to a pull request card in the corner ("1 of 3 fixed"). When all are fixed: "That's LiveLocale. Install it." with `npm i livelocale` and a link to the docs.
3. **How it works:** Alt+Click the text → type the fix → Send → pull request, as three short looping clips (this is a real sequence, so numbered steps are appropriate).
4. **Drag between languages.** A sample site split by a draggable divider; dragging turns it from English to Arabic, right to left. Strings that were never translated stay English and are outlined in coral, with the matching `check --hardcoded` output beneath.
5. **Works where you already are:** Next.js, Vite, React, any static host; GitHub one-click pull requests and `apply --pr` for other git hosts.
6. **Start in two minutes:** `npx livelocale init --share`, links to the README and GitHub; "Free, MIT, no account, no server."

The footer carries the GitHub link, the npm link and the licence.

### 3.3 How the scenes are built

- **Scene 1 (pile):** cards are HTML (not raster screenshots), animated by CSS scroll-driven animations where supported, with a small IntersectionObserver fallback. With `prefers-reduced-motion`, or without JavaScript, the page shows the end state (the pull request card) and the hero.
- **Scene 2 (broken page):** the hero island is packed with LiveLocale's share mode (`livelocale pack`), so the Alt+Click editing is the real product. **Nothing is ever sent anywhere from the demo** (Claude's call after the builder check): Send shows the real change link in a dialog with "This is what your developer would receive", and "Create pull request" is replaced by a short explanation and a link to the docs; no GitHub issue, pull request or network request is made from the demo. The pull-request card is the page's own UI fed by the share Studio's drafts (Claude's call: if embedding the real Studio in the hero proves too heavy or confusing, the hero uses a faithful lightweight simulation and a "Try the full Studio" button opens the real share Studio of the sample site; the builder decides after a spike and records it).
- **Scene 4 (slider):** two renderings of one sample page (English and Arabic) with a draggable divider (pointer and keyboard operable); the coral outlines come from running `check --hardcoded` on the sample at build time, so the demo never drifts from the real tool.
- **Clips (scene 3) and the og-image:** recorded from the real Studio with Playwright; looped, muted, under 1 MB each, with a static poster frame.

**Builder decision (scene 2), 2026-11-02: lightweight simulation in the hero, with "Try the full Studio" opening the real packed share Studio of the sample site.** Spike: `playground-vite` built with `share: true`, served gzipped (`tests/site/fixtures/serve.mjs`, as Pages serves it) and its `livelocale/index.html` framed in a 1280×560 box, measured with headless Chromium. The rule was: embed only if the Studio transfers ≤ 150 KB gzip, the editor appears in ≤ 1 s and the editor and the framed text are both visible at 1280 px. The Studio on this branch (pre-rebrand, Outfit fonts) transferred 126 KB gzip (JS 86 KB, CSS 9 KB, two Outfit weights 28 KB, the rest manifest and locales; 177 KB with the framed sample app); Alt+Click to editor took 0.19–0.28 s (0.8–1.2 s from a cold load, after the first-run name dialog, which a visitor must dismiss first); at 1280 px the editor and the framed text were both visible (yes), but the framed app gets only a 462×390 middle panel; at 390 px the framed text was visible (yes) and the editor was not (no: it overlaps the preview and runs past the box's bottom edge). That Studio passes the rule, but it is not the one that ships: the hero goes live with the rebranded Studio (§4, §7.2), and that Studio, measured the same way from the 0.11.0 build, transfers 261 KB gzip (JS 87 KB, CSS 9 KB, Bricolage Grotesque 700 and 800, Inter 400 to 700 and JetBrains Mono 500 at about 165 KB), well over 150 KB, so the hero uses the simulation. Touch devices use the simulation either way (§7.1).

### 3.4 Quality floor

Responsive down to 360 px wide; keyboard reachable with visible focus; WCAG AA contrast; reduced motion respected; Lighthouse performance ≥ 90 on mobile (Claude's call); no third-party requests at runtime; meta tags and the og-image for sharing on Reddit and LinkedIn; an Arabic version of the page is **not** required for launch (the Arabic scene is inside the English page).

### 3.5 Build order (owner agreed: layers, each shippable)

1. Static page with final copy, brand and sections (works with JavaScript off).
2. The language slider (scene 4).
3. The broken page fixed live (scene 2).
4. The screenshot pile animation (scene 1), last.

## 4. Studio (connects to the 0.11.0 launch-features design)

The Studio's light and dark themes use this brand: Paper/Ink/Coral for light, Espresso/Cream/Coral (dark) for dark, the same type (with Readex Pro and IBM Plex Sans Arabic for the Arabic Studio), and the logo in the header. The 0.11.0 design is updated to drop its "dark must look as today" rule (the old look was a placeholder) and to point here for colours and type.

## 5. Non-goals

- Sending real change links, issues or pull requests from the demo (see §3.3).

- A full documentation site (the README stays the docs for now).
- An Arabic translation of the landing page.
- Paid assets, stock photography, analytics or tracking scripts.
- Buying `livelocale.dev` now.

## 6. Left to the builder

The exact animation curves, card copy in the pile, the sample site's content, the clip choreography, and pixel-level favicon tuning, within the brand rules above.

## 7. Decisions confirmed by the owner (2026-11-01, after the builder check)

1. **Phones and tablets.** On touch devices, scene 2 switches to a tap-the-typo version that shows the same coral patch and pull-request card, with a note that on a computer you hold Alt and click to edit the real thing. LiveLocale itself does not gain tap-to-edit in this project.
2. **Launch timing.** The site goes live together with 0.11.0, with all four layers done (static page, language slider, the broken page fixed live, and the screenshot pile). It is built in parallel with 0.11.0; the clips and og-image are recorded from the rebranded Studio once it exists.
3. **Brand final.** The logo (S1), palette, type (including Readex Pro and IBM Plex Sans Arabic) and voice in §2 are final and may be rolled out to the Studio, the site, the README and the `brand/` assets.
