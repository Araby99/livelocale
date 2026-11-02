---
name: livelocale
description: Your website, as a diff. Fix text on the real site, get a pull request.
colors:
  night: '#0c0d0f'
  surface: '#16181d'
  rule: '#2a2d33'
  edge: '#6b6f7a'
  paper: '#e8e4d9'
  comment: '#8c887d'
  ghost: '#6e6b64'
  patch: '#ffb224'
  patch-hover: '#ffc150'
  patch-shadow: '#8a5600'
  wash: '#2e2412'
  hunk: '#4fc3dc'
  exit-1: '#ff5468'
  exit-0: '#6fd69a'
typography:
  display:
    fontFamily: "'Martian Mono', 'IBM Plex Sans Arabic', ui-monospace, monospace"
    fontSize: 'clamp(2.125rem, 1.2rem + 2.4vw, 3rem)'
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: '-0.035em'
  headline:
    fontFamily: "'Martian Mono', 'IBM Plex Sans Arabic', ui-monospace, monospace"
    fontSize: 'clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)'
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: '-0.03em'
  title:
    fontFamily: "'Martian Mono', 'IBM Plex Sans Arabic', ui-monospace, monospace"
    fontSize: '1.25rem'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '-0.02em'
  label:
    fontFamily: "'Martian Mono', 'IBM Plex Sans Arabic', ui-monospace, monospace"
    fontSize: '0.9375rem'
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: '-0.01em'
  body:
    fontFamily: "'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif"
    fontSize: '1.0625rem'
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: "'IBM Plex Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif"
    fontSize: '0.9375rem'
    fontWeight: 500
    lineHeight: 1.6
  code:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.6
    fontFeature: 'tnum'
rounded:
  xs: '3px'
  sm: '4px'
  md: '8px'
  lg: '10px'
  xl: '12px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  gutter-narrow: '16px'
  gutter: '32px'
  step: '36px'
  split: '56px'
components:
  button-primary:
    backgroundColor: '{colors.patch}'
    textColor: '{colors.night}'
    typography: '{typography.code}'
    rounded: '{rounded.md}'
    padding: '0 8px 0 18px'
    height: '48px'
  button-primary-hover:
    backgroundColor: '{colors.patch-hover}'
    textColor: '{colors.night}'
  button-primary-large:
    backgroundColor: '{colors.patch}'
    textColor: '{colors.night}'
    rounded: '{rounded.md}'
    padding: '0 22px'
    height: '56px'
  button-outline:
    backgroundColor: 'transparent'
    textColor: '{colors.paper}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '0 18px'
    height: '48px'
  button-outline-hover:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.paper}'
  chapter-chip:
    backgroundColor: 'transparent'
    textColor: '{colors.comment}'
    typography: '{typography.body-small}'
    rounded: '{rounded.md}'
    padding: '10px 14px 13px'
  chapter-chip-current:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.paper}'
  door-switch:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.xl}'
    padding: '4px'
  door:
    backgroundColor: 'transparent'
    textColor: '{colors.paper}'
    typography: '{typography.label}'
    rounded: '{rounded.md}'
    padding: '12px 22px'
  door-selected:
    backgroundColor: '{colors.patch}'
    textColor: '{colors.night}'
  locale-chip:
    backgroundColor: '{colors.night}'
    textColor: '{colors.hunk}'
    rounded: '{rounded.sm}'
    padding: '0 7px'
  inline-code:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.hunk}'
    rounded: '{rounded.sm}'
    padding: '0.08em 0.36em'
  code-block:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.paper}'
    typography: '{typography.code}'
    rounded: '{rounded.lg}'
    padding: '20px 22px'
  diff-add-row:
    backgroundColor: '{colors.wash}'
    textColor: '{colors.paper}'
  window:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.xl}'
---

# Design System: livelocale

## Overview

**Creative North Star: "Your Website, as a Diff"**

The whole system is a code review rendered as a page. The ground is a dark editor at night, text is warm paper, and every colour beyond those has exactly one job lifted from a diff: amber marks a change a person made, cyan marks where a string lives, struck grey is the old text, red fails the build and green means done. Nothing is decorative colour. If a hue appears, it is saying one of those five things.

Density is calm and single-column. One 1000px column carries the header, the framed product film, the two-door switch, the numbered steps and the close; everything aligns to the video's edges. Depth comes from three tones of near-black separated by hairline rules, never from glow, blur or gradient. Type is split by role: Martian Mono speaks (headlines, numbers, labels), IBM Plex Sans explains, IBM Plex Mono shows real code and real output, and IBM Plex Sans Arabic stands beside every Latin face so a right-to-left string never falls back to a system font.

The one tilted, offset amber patch from the logo is the signature. It sits behind the fixed word in the headline and slides between the two doors; it is the only element allowed to tilt or cast a hard shadow.

**Key Characteristics:**

- Dark only (`color-scheme: dark`); Night ground, Surface panels, 1px Rule hairlines.
- One job per colour, taken from diff grammar.
- Amber is a fill, never a line, except for the focus ring.
- Monospace display face for every heading and numeral; humanist sans for prose.
- Real artefacts (filmed video, real diffs, real CI output) in place of illustration.
- One authored motion moment: the door switch and the steps patching in.

## Colors

A near-black, low-chroma ground with warm paper text and five signal hues, each bound to one meaning from a code review.

### Primary

- **Patch Amber** (patch): a person changed this. The fixed word in the headline, the primary action (the copyable install command, the live demo link), the selected door, the `+` sign of an added line and the edited words inside it, text selection, the caret and the focus ring. Always a fill with Night text on it (10.78:1).
- **Patch Lit** (patch-hover): the hover state of an amber fill, nothing else.
- **Patch Underside** (patch-shadow): the patch's hard offset underside, taken from the logo mark's second rectangle, and the muted `$` prompt printed on an amber button.
- **Amber Wash** (wash): the background of an added diff row, so the whole line reads as changed while only the edited words take the full Patch fill.

### Secondary

- **Hunk Cyan** (hunk): where a string lives. Links, inline code, file paths, locale chips, JSON keys, the URL path in the window's address bar. Underlines on links run at 45% cyan and go solid and 2px on hover.

### Tertiary

- **Exit 1 Red** (exit-1): the build fails. Failing lines in CI output and the dashed outline around untranslated text. Never a fill.
- **Exit 0 Green** (exit-0): done. The passing line in CI output and the "pull request opened" result, always next to a check icon.

### Neutral

- **Night** (night): the page ground, the video letterbox, the address pill, the field behind a locale chip, and the text on every amber fill.
- **Surface** (surface): every raised panel: the window frame, diffs, code blocks, the door track, the current chapter chip, the close band, hover fill of outline buttons.
- **Rule** (rule): 1px hairlines between steps, around panels, under the window bar, above the footer; also the empty track of a chapter's progress bar.
- **Edge** (edge): the stronger 1px border for interactive outlines (outline button, play button, hovered and current chapter chips) and the scrollbar thumb on hover. 3.87:1 on Night, so it carries non-text affordance.
- **Paper** (paper): all primary text and headings.
- **Comment** (comment): secondary text: notes, captions, footer, step numbers, diff line numbers, CI prompts and comments, idle chapter chips. AA on Night and Surface.
- **Ghost** (ghost): old text, struck through, in a removed diff line. 3.66:1 on Night and 3.34:1 on Surface, so it is history only, never prose.

### Named Rules

**The One Job Rule.** Each signal hue means one thing. Amber is a human change, cyan is a location, red is a failure, green is success. A colour borrowed for decoration breaks the reading of every diff on the page.

**The Fill-Not-Line Rule.** Patch Amber appears as a fill. The single exception is the 2px focus ring, where amber marks "you are here". Amber borders, amber text on dark, and amber underlines are not part of the system.

**The Dashed Failure Rule.** Exit 1 Red is a 1.5px dashed outline around the offending text, never a red fill or a red background panel. Failure points at the string; it does not flood the screen.

## Typography

**Display Font:** Martian Mono (with IBM Plex Sans Arabic, then ui-monospace)
**Body Font:** IBM Plex Sans (with IBM Plex Sans Arabic, then system-ui)
**Label/Mono Font:** IBM Plex Mono for code; Martian Mono 500 for labels and numerals

**Character:** A wide, engineered monospace headline voice over a plain, readable humanist sans. The mono display says "this is a developer tool" without a terminal costume; the sans keeps explanations easy. All fonts are self-hosted, Latin subset for the Latin faces and Arabic subset for Plex Sans Arabic, at only the weights the page sets.

### Hierarchy

- **Display** (Martian Mono 700, clamp 34px to 48px, line-height 1.06, -0.035em): the one hero headline. It fits on one line from 900px up and balances onto two below.
- **Headline** (Martian Mono 700, clamp 28px to 40px, 1.1, -0.03em): section headings. The closing band steps up to clamp(2rem, 1.3rem + 2.2vw, 3.25rem) because it is the page's last ask.
- **Title** (Martian Mono 700, 20px, 1.3, -0.02em): step headings beside a numeral in Comment (Martian Mono 700, 16px, tabular).
- **Body** (IBM Plex Sans 400, 17px, 1.6): prose, capped at 44 to 52ch in the hero and steps and 70ch in the transcript.
- **Body small** (IBM Plex Sans 500, 15px): navigation, chapter chips, notes and captions, usually in Comment.
- **Label** (Martian Mono 500, 15px, -0.01em): the door labels, the switch's caption, and the term column of the "works with" list. Sentence case, never uppercase.
- **Code** (IBM Plex Mono 500, 14px, tabular numerals): diffs at line-height 1.6, code blocks at 1.75; 13px under 600px wide.

### Named Rules

**The Speaking Mono Rule.** Martian Mono is for headings, numerals and short labels only. Paragraphs, captions and buttons other than the install command are IBM Plex Sans.

**The Arabic Beside Rule.** Every font stack names IBM Plex Sans Arabic second, and any `lang="ar"` run is set at 1.08em with line-height 1.7 so Arabic does not read smaller and tighter than the Latin beside it.

## Layout

A single centred column, 1000px of content plus a side gutter (16px, 32px from 600px). The framed video fills that column, roughly 70% of a 1440px screen, and every other block aligns to its edges. The first viewport is one band: the headline, then the lede and proof on the left with the two actions on the right (from 900px), then the video, its chapter chips and the play button, and the door switch beneath, all inside 900px of height at 1440px wide.

Steps are a numbered list. Below 900px each step stacks text over artefact with a 20px gap and 36px vertical padding; from 900px each is a 5:7 grid (text left, artefact right) with a 56px gap and 56px padding. The "works" section and the close reuse that same 5:7 split. Steps are separated by a 1px Rule, never by cards.

Spacing runs on 4px steps (4, 8, 12, 16, 20, 24) inside components, with 36px and 56px as the step and split rhythm, and large section padding (72px to 120px) only at section starts and the close. Breakpoints: 420px (door labels shrink), 600px (gutter widens, code size steps up), 640px (video changes from the 4:5 phone cut to the 2:1 cut; chapter chips go from a three-column grid to a scrolling row), 900px (the 5:7 split and the one-line headline). The page works from 320px.

## Elevation & Depth

Flat and tonal. Depth is Night, then Surface, separated by 1px Rule hairlines; there are no ambient shadows, no glows, no blurs and no gradients anywhere in the system.

### Shadow Vocabulary

- **Patch underside** (`box-shadow: 3px 4px 0 #8a5600`): the hard offset under the tilted amber patch behind the headline's fixed word. It reproduces the logo mark, whose patch is two stacked rectangles, Patch over Patch Underside. It belongs to the patch and nothing else.

### Named Rules

**The Tone-Not-Shadow Rule.** A panel is raised by moving from Night to Surface and drawing a Rule hairline around it. If an element needs to feel higher than Surface, it gets a border in Edge, not a shadow.

**The Logo Patch Rule.** Tilt (a few degrees anticlockwise) and a hard offset shadow are the logo's patch and are allowed only on a Patch Amber fill that represents the patch itself.

## Shapes

Gently rounded rectangles in a short, consistent ladder: 3px for the smallest inline marks (diff signs, highlighted words, warning glyphs), 4px for inline code, locale chips and the focus ring, 8px for every button, chapter chip and door, 10px for content panels (diffs, code blocks, screenshots), and 12px for the outermost frames (the video window and the door track). Inner radius is always smaller than its container's. Borders are 1px solid in Rule or Edge; the only dashed line is Exit 1's 1.5px failure outline. Icons are inline SVG line icons on a 20px grid, 1.75 stroke, round caps and joins, sized at 1.15em and coloured by `currentColor`.

## Components

### Buttons

Direct and physical: a solid amber slab for the one thing to do, a hairline outline for the alternative.

- **Shape:** gently rounded (8px), at least 48px tall; 56px in the closing band.
- **Primary (install command):** Patch fill, Night text, IBM Plex Mono 500 at 16px, a muted `$` in Patch Underside, then an inset "Copy" state tab (Night at 10% over amber, 5px radius, Plex Sans 600 14px) with a copy icon that swaps to a check and "Copied". Without JavaScript it becomes selectable text.
- **Primary (link):** the same amber slab in IBM Plex Sans 600 at 17px with a trailing arrow icon, used when the one action is opening the live demo.
- **Hover / Focus:** hover lifts the fill to Patch Lit over 160ms; focus is the shared 2px Patch ring at 3px offset.
- **Outline:** transparent with a 1px Edge border, Paper text, Plex Sans 500, trailing arrow; hover fills with Surface.

### Chips

- **Chapter chips:** transparent with a 1px Rule border and Comment text; a Martian Mono numeral before the title. Hover brightens text to Paper and the border to Edge. The current chapter (`aria-current="step"`) fills with Surface, Paper text, Edge border, and shows a 2px progress bar along its base that fills in Comment with the video's time.
- **Locale chips:** IBM Plex Mono 500 at 13px in Hunk Cyan on Night with a 1px Hunk border and 4px radius, placed before a file path or key.

### Cards / Containers

- **Corner Style:** 10px for content panels, 12px for the outer window frame.
- **Background:** Surface on Night.
- **Shadow Strategy:** none; see Elevation & Depth.
- **Border:** 1px Rule; screenshots that are links brighten the border to Edge on hover.
- **Internal Padding:** 16px rows in diffs, 20px by 22px in code blocks (16px on phones).

### Navigation

- **Header:** the logo mark (30px) and the lowercase wordmark in Martian Mono 500 at 20px on the left; GitHub and Docs as Paper, Plex Sans 500 15px text links on the right with an Edge underline on hover. No background bar, no sticky header.
- **Footer:** a Rule hairline above, the wordmark in Martian Mono, links in Comment that turn Paper on hover.

### The Door Switch (signature)

A two-option radiogroup styled as one Surface track (4px padding, 12px radius, 1px Rule border) holding two doors in Martian Mono 500 at 15px. A single amber patch sits under the selected door and slides to the other with a 520ms exponential ease-out (cubic-bezier(0.16, 1, 0.3, 1)) while the label colour crossfades from Paper to Night. Choosing a door shows only that reader's story and close; the new story's steps patch in, words rising from 25% opacity and artefacts wiped in from the left, staggered 80ms per step. Without JavaScript both stories render in order and the switch is hidden.

### The Diff (signature)

Real pull-request diffs drawn in the brand: a Surface panel in IBM Plex Mono, a file row with a locale chip and a Hunk path, a Comment hunk header, Comment line numbers, removed lines in struck Ghost after a `−`, added lines on Amber Wash after a filled amber `+` square (3px radius), the edited words on a Patch fill, and a closing result row in Exit 0 Green with a check icon. The fixer's old/new pair uses the same signs and fills without line numbers.

### The Product Window

The hero video sits in one minimal browser frame: a Surface frame with a 12px radius, a centred Night address pill in Plex Mono 13px with the host in Comment and the path in Hunk, and the screen at 2:1 (4:5 on phones) on Night. A poster frame of the finished fix shows first and fades over 400ms once playback starts. A visible Play/Pause button with an Edge outline always sits beside the chapter chips.

## Do's and Don'ts

### Do:

- **Do** keep every signal hue to its one job: Patch for a human change or the primary action, Hunk for locations, Exit 1 for failure, Exit 0 for success.
- **Do** raise panels by tone (Night to Surface) and a 1px Rule hairline.
- **Do** put Night text on every Patch fill and use Patch Lit for its hover.
- **Do** use the shared focus ring on every interactive element: 2px solid Patch, 3px offset, 4px radius.
- **Do** set headings, numerals and short labels in Martian Mono and everything else in IBM Plex Sans; keep IBM Plex Sans Arabic second in every stack.
- **Do** show real artefacts (the filmed product, real diffs, real CI output) and give each screenshot a 1px Rule border at 10px radius.
- **Do** turn off every animation and transition under `prefers-reduced-motion: reduce`, and give any looping video a visible pause control.

### Don't:

- **Don't** use glows, blurs, gradients or purple anywhere.
- **Don't** draw Patch Amber as a border, underline or text colour on dark; the focus ring is the only amber line.
- **Don't** fill anything with Exit 1 Red; failure is a dashed outline.
- **Don't** set prose, captions or any text that must be read in Ghost; it is below AA for body text.
- **Don't** tilt an element or give it a hard offset shadow unless it is the Patch Amber patch itself.
- **Don't** add a light theme or a colour outside this palette.
- **Don't** set labels in uppercase or with wide tracking.
