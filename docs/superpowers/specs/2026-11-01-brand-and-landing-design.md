> **Status: approved by the owner on 2026-11-01; brand revised to "hunk" and approved on 2026-11-02 (master logo geometry unchanged).** Produced from a visual design conversation with the owner (mockups saved in `.superpowers/brainstorm/7924-1793549086/content/`). The owner's choices are marked as theirs; "Claude's call" items may be overridden.

# LiveLocale brand and landing page

## 1. Intent

LiveLocale is launching publicly. Its success measure is simple: people try it and download it. The owner wants the first impression to be visual (images, GIFs, video) and creative, not a standard SaaS page. The previous Studio look (colours, fonts, UI) was a placeholder and is **not** part of the brand (owner, 2026-11-01).

The first visitor is, in the owner's words, a developer "really pissed off because of the ache of a multi-language website": screenshots of corrections before launch, and hardcoded or untranslated text discovered on launch day.

Pitch (owner-approved):

> **Stop collecting screenshots. Stop finding untranslated text on launch day.**
> Anyone on your team fixes text right on the site. You get a pull request. CI catches what was never translated.

The word "PM" is never used in the pitch (owner: too narrow).

## 2. Brand

### 2.1 Direction: "hunk" (owner's choice, 2026-11-02; replaces "Friendly developer")

> The first brand (cream paper, coral, Bricolage Grotesque, approved 2026-11-01) was withdrawn by the owner on 2026-11-02 as generic "AI slop". The logo geometry stays; the colour, type and rules below replace it.

**Your website, as a diff.** Teletypes fixed typos by overstriking: printing the right letters on top of the wrong ones, with the old ones still showing through. That is the logo. Developers already read one colour language without thinking, the diff, so the brand reuses that grammar instead of inventing colours: old text is a struck ghost, a fix is amber, a location is cyan, and CI decides red or green. Dark first (the terminal); light is "the printout of the same diff", cool white, never cream.

### 2.2 Logo (owner's choice: "S1", the patch; master geometry unchanged)

Three lines of text, split into words; a fix is stuck, slightly tilted, over the middle line, and the old line still peeks out underneath. No tile or container. The wordmark is `livelocale`, all lowercase, set in the display face (§2.4).

Master SVG (64×64 grid), the source of truth for every size. The geometry is final and unchanged (owner, 2026-11-02); only the fills follow the palette. This is the light version:

```svg
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <g fill="#15171B">
    <rect x="6" y="11" width="20" height="8" rx="4"/><rect x="29" y="11" width="29" height="8" rx="4"/>
    <rect x="6" y="28" width="14" height="8" rx="4"/>
    <rect x="25" y="31" width="29" height="2" rx="1" opacity=".5"/>
    <rect x="6" y="45" width="23" height="8" rx="4"/><rect x="32" y="45" width="12" height="8" rx="4"/>
  </g>
  <g transform="rotate(-7 39 32)">
    <rect x="24.5" y="24.5" width="30" height="15" rx="4.5" fill="#8A5600"/>
    <rect x="23" y="23" width="30" height="15" rx="4.5" fill="#FFB224"/>
  </g>
</svg>
```

- **On dark (primary):** lines `#E8E4D9`, patch `#FFB224`, patch shadow `#8A5600`.
- **On light:** lines `#15171B`, patch `#FFB224`, patch shadow `#8A5600` (5.6:1 on Print).
- **Small sizes (Claude's call):** at 16 px the hairline "old line" is dropped and the patch shadow is removed. The builder produces 16 px and 32 px favicons tuned on the pixel grid, plus an SVG favicon. The favicon is the dark version (lines `#E8E4D9` on Night `#0C0D0F`).
- **Deliverables:** `logo.svg`, `logo-dark.svg`, `mark.svg`, `mark-dark.svg`, `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180 px), `og-image.png` (1200×630), and a GitHub/npm avatar (512 px, the dark mark centred on Night `#0C0D0F`), all in a `brand/` folder of the repo. The README header uses the logo, dark and light via `<picture>`.

### 2.3 Colour: every colour has one job

Each accent maps to a line type of a diff. Ratios are WCAG contrast against Night (dark) or Print (light), measured.

**Dark (primary)**

| Token   | Hex       | Job                                                                                                          | Contrast                 |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Night   | `#0C0D0F` | page background (the terminal)                                                                               | base                     |
| Surface | `#16181D` | panels, cards, code blocks (raised by tone, not shadow)                                                      | —                        |
| Raised  | `#1E2127` | popovers, menus, the edit box                                                                                | —                        |
| Rule    | `#2A2D33` | hairlines and dividers (decorative only)                                                                     | —                        |
| Edge    | `#6B6F7A` | borders that carry meaning: inputs, checkboxes, outline buttons                                              | 3.5:1 on Surface         |
| Paper   | `#E8E4D9` | context: body text, the page as it is                                                                        | 15.3:1                   |
| Comment | `#8C887D` | secondary text, captions, `#` comments                                                                       | 5.5:1; 4.6:1 on Raised   |
| Ghost   | `#6E6B64` | `−` the old text, always struck through; graphic and state only, never running text you must read            | 3.7:1                    |
| Patch   | `#FFB224` | `+` the fix, meaning "a person changed this": the selection, the edited string, the primary button, the logo | 10.8:1; Night on it 10.8 |
| Wash    | `#2E2412` | row background of an added or edited line                                                                    | Paper 12.0, Patch 8.5    |
| Hunk    | `#4FC3DC` | `@@` where a string lives: keys, file paths, locale codes, links                                             | 9.4:1                    |
| Exit 1  | `#FF5468` | "CI will fail": hardcoded text, the dashed outline around untranslated text, destructive actions, errors     | 6.2:1                    |
| Exit 0  | `#6FD69A` | "done": pull request opened, CI passed, saved; always with ✓ and a word                                      | 10.9:1                   |

**Light ("the printout")**

| Token     | Hex       | Job                                                        | Contrast                |
| --------- | --------- | ---------------------------------------------------------- | ----------------------- |
| Print     | `#F4F5F7` | page background, cool white (never cream)                  | base                    |
| Sheet     | `#FFFFFF` | panels, cards, code blocks                                 | —                       |
| Rule      | `#D5D7DC` | hairlines (decorative)                                     | —                       |
| Edge      | `#868B96` | meaningful borders                                         | 3.1:1                   |
| Ink       | `#15171B` | body text                                                  | 16.5:1                  |
| Comment   | `#5E5B54` | secondary text                                             | 6.2:1                   |
| Ghost     | `#8A877F` | `−` old text, struck (graphic and state only)              | 3.3:1                   |
| Patch     | `#FFB224` | the fix as a **fill only**, always holding Ink text        | Ink on it 10.0:1        |
| Patch ink | `#8F5B00` | amber as text or an icon: the edited string, the `+` glyph | 5.3:1; 5.7:1 on Sheet   |
| Wash      | `#FFF1D6` | added or edited row                                        | Ink 16.1, Patch ink 5.1 |
| Hunk      | `#00708A` | keys, paths, locale codes, links                           | 5.2:1                   |
| Exit 1    | `#C8243A` | CI failure, the untranslated outline, errors               | 5.1:1                   |
| Exit 0    | `#00785F` | pull request, CI pass, saved                               | 5.0:1                   |

Rules (from the owner-approved board, 2026-11-02):

- **Amber is always a filled shape**: the patch, the primary button, the selected or edited row. It is never a decorative border and never decoration. At most one tilted patch per view. (Focus rings are the one exception: they use Patch in dark and Patch ink in light, so the focus ring is the "where your hands are" colour.)
- **Red is always a dashed outline or a word** (`exit 1`, an error message). It never fills a primary button. It means only "this fails CI" or "this failed".
- **The ghost line is history, not error:** struck through, dim, still readable. Every before/after uses it.
- **Warnings** (for example `untranslated` and `wrong-script`) borrow amber with a `!` glyph, because a warning means "a person should change this". Success and info always carry a glyph and a word, so colour is never the only signal (cyan and green differ mostly by hue).
- **No glows, no gradients, no purple or violet.** Depth comes from tone (Night → Surface → Raised).
- Contrast: all text meets WCAG AA (4.5:1) on its background; graphics that carry meaning meet 3:1.

### 2.4 Type: one superfamily for both scripts

| Role                                 | Latin                   | Arabic                         |
| ------------------------------------ | ----------------------- | ------------------------------ |
| Display: wordmark, headlines, labels | Martian Mono (500–700)  | IBM Plex Sans Arabic (600–700) |
| Interface and body                   | IBM Plex Sans (400–600) | IBM Plex Sans Arabic (400–600) |
| Code, keys, CLI                      | IBM Plex Mono (400–600) | (code stays Latin)             |

- Martian Mono is a wide, square-shouldered monospace: a terminal voice that is not the default code font. The wordmark is set at 500 with letter-spacing −0.02em; headlines at 700. It is display only, never body text.
- IBM Plex Sans and IBM Plex Sans Arabic were drawn as one family, with the same skeleton and weights, so the Arabic Studio looks like the same product, not a fallback.
- All the fonts are SIL OFL, self-hosted from Fontsource as devDependencies and bundled into the site and the Studio; nothing loads from Google at runtime.
- `font-family` stacks list the Latin face first and the Arabic face second. Arabic text gets about 1.08× the size and a line-height of 1.7.

### 2.4a Motifs

- **The diff gutter:** before/after content (the hero, feature lists, the social card) can be written as a diff pair: the old line in Ghost, struck, after `−`; the new line after an amber `+`.
- **The patch:** the tilted amber shape from the logo, used as a highlight behind a fixed word (rotated about −3°, with a hard offset shadow in `#8A5600` and no blur).
- **Locale chips:** `en` and `ar` in Hunk, set in mono, with a small hard offset "carbon copy" shadow (decorative).
- **Untranslated text:** a 1.5 px dashed Exit 1 outline, never a filled red box.

### 2.4b Proposed signature (not in 0.11.0 scope; the owner decides later)

`npx livelocale theme`: the palette shipped as an installable editor and terminal theme (VS Code, Windows Terminal, iTerm2, Ghostty) plus git diff colours, so every `git diff` a developer runs is in livelocale colours. Recorded as an idea only; nothing in the 0.11.0 or site plans builds it.

### 2.5 Voice

Short, direct, a little blunt; written by a developer who has felt the pain. Plain verbs, sentence case, no hype ("Stop finding untranslated text on launch day", not "Empowering global teams"). Errors and empty states give direction, never apologise.

## 3. Landing page

### 3.1 Where it lives

- A `site/` folder in this repository, built to static files and published with GitHub Pages by a GitHub Actions workflow on pushes to `main` that touch `site/` (Claude's call).
- Domain: `livelocale.js.org` (free; owner approved). Claiming it is a pull request to `js-org/js.org` adding the CNAME, opened by the owner or with the owner's OK. `livelocale.dev` (unregistered as of 2026-11-01) can be bought later; the site moves without changes.
- Stack (Claude's call, revised after the builder check): the page shell is plain HTML, CSS and a little TypeScript built with Vite (already a devDependency). Scenes 2 and 4 are small **React islands** (React + react-i18next, the stack LiveLocale supports), loaded lazily when they scroll into view, so the real product and `check --hardcoded` can run on them while the shell stays light for the Lighthouse target.

### 3.2 Page structure (owner's choice: scene 2 then scene 1, then scene 3 below)

The page is dark first (Night), like the board the owner approved on 2026-11-02: the hero headline is written as a diff pair (the struck Ghost line "− Collect screenshots of every typo before launch." over "+ Stop collecting screenshots." with the amber patch on "Stop"), and the scenes use the one-job colours of §2.3.

1. **The screenshot pile (opening).** A messy pile of realistic screenshot cards with red circles and notes ("where is this??", `final_FINAL_v3.png`, "arabic is wrong"), under the headline "This was your launch week." As the visitor scrolls, the cards fly together and collapse into one clean pull request card.
2. **The page that is broken on purpose.** The pull request card opens onto the hero: "Stop collecting screenshots." with deliberate typos and one untranslated word on the page. A hint says to hold Alt and click the typo. Each fix shows the amber patch and adds a line to a pull request card in the corner ("1 of 3 fixed"). When all are fixed: "That's LiveLocale. Install it." with `npm i livelocale` and a link to the docs.
3. **How it works:** Alt+Click the text → type the fix → Send → pull request, as three short looping clips (this is a real sequence, so numbered steps are appropriate).
4. **Drag between languages.** A sample site split by a draggable divider; dragging turns it from English to Arabic, right to left. Strings that were never translated stay English and are outlined with the dashed Exit 1 (red) outline, with the matching `check --hardcoded` output beneath.
5. **Works where you already are:** Next.js, Vite, React, any static host; GitHub one-click pull requests and `apply --pr` for other git hosts.
6. **Start in two minutes:** `npx livelocale init --share`, links to the README and GitHub; "Free, MIT, no account, no server."

The footer carries the GitHub link, the npm link and the licence.

### 3.3 How the scenes are built

- **Scene 1 (pile):** cards are HTML (not raster screenshots), animated by CSS scroll-driven animations where supported, with a small IntersectionObserver fallback. With `prefers-reduced-motion`, or without JavaScript, the page shows the end state (the pull request card) and the hero.
- **Scene 2 (broken page):** the hero island is packed with LiveLocale's share mode (`livelocale pack`), so the Alt+Click editing is the real product. **Nothing is ever sent anywhere from the demo** (Claude's call after the builder check): Send shows the real change link in a dialog with "This is what your developer would receive", and "Create pull request" is replaced by a short explanation and a link to the docs; no GitHub issue, pull request or network request is made from the demo. The pull-request card is the page's own UI fed by the share Studio's drafts (Claude's call: if embedding the real Studio in the hero proves too heavy or confusing, the hero uses a faithful lightweight simulation and a "Try the full Studio" button opens the real share Studio of the sample site; the builder decides after a spike and records it).
- **Scene 4 (slider):** two renderings of one sample page (English and Arabic) with a draggable divider (pointer and keyboard operable); the dashed red outlines come from running `check --hardcoded` on the sample at build time, so the demo never drifts from the real tool.
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

The Studio's dark and light themes use this brand (§2.3: Night/Paper/Patch for dark, Print/Ink/Patch for light, every accent with its one job), the same type (§2.4, IBM Plex Sans Arabic for the Arabic Studio), and the logo in the header. The 0.11.0 design is updated to drop its "dark must look as today" rule (the old look was a placeholder) and to point here for colours and type.

## 5. Non-goals

- Sending real change links, issues or pull requests from the demo (see §3.3).

- A full documentation site (the README stays the docs for now).
- An Arabic translation of the landing page.
- Paid assets, stock photography, analytics or tracking scripts.
- Buying `livelocale.dev` now.

## 6. Left to the builder

The exact animation curves, card copy in the pile, the sample site's content, the clip choreography, and pixel-level favicon tuning, within the brand rules above.

## 7. Decisions confirmed by the owner (2026-11-01, after the builder check)

1. **Phones and tablets.** On touch devices, scene 2 switches to a tap-the-typo version that shows the same amber patch and pull-request card, with a note that on a computer you hold Alt and click to edit the real thing. LiveLocale itself does not gain tap-to-edit in this project.
2. **Launch timing.** The site goes live together with 0.11.0, with all four layers done (static page, language slider, the broken page fixed live, and the screenshot pile). It is built in parallel with 0.11.0; the clips and og-image are recorded from the rebranded Studio once it exists.
3. **Brand final.** The logo (S1), palette, type and voice in §2 are final and may be rolled out to the Studio, the site, the README and the `brand/` assets. (Revised 2026-11-02: the "hunk" palette and type replace the cream/coral ones; the logo geometry is unchanged.)
