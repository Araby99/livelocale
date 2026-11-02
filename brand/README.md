# livelocale brand assets

Every file here is generated from the master mark in the brand spec
(`docs/superpowers/specs/2026-11-01-brand-and-landing-design.md`, §2). Do not edit them by hand;
regenerate them from the repo root:

```bash
npm run brand:build
```

This runs `site/scripts/brand/build-svgs.mjs` (the SVGs) and then
`site/scripts/brand/render-pngs.mjs` (the PNGs, rasterised with the repo's Playwright Chromium;
run `npm ci --prefix site` and `npx playwright install chromium` first).

## Files

| File                   | Size     | Use                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------- |
| `logo.svg`             | 64 tall  | Horizontal logo (mark and wordmark outlines) on light; README       |
| `logo-dark.svg`        | 64 tall  | The logo on dark backgrounds; README under a dark colour scheme     |
| `mark.svg`             | 64×64    | The patch mark on light                                             |
| `mark-dark.svg`        | 64×64    | The patch mark on dark                                              |
| `favicon.svg`          | 64×64    | SVG favicon: dark small mark on Night                               |
| `favicon-16.png`       | 16×16    | Favicon: dark small mark (no hairline, no patch shadow) on Night    |
| `favicon-32.png`       | 32×32    | Favicon: dark master mark on Night                                  |
| `apple-touch-icon.png` | 180×180  | iOS home screen icon: dark mark at 140 px on Night                  |
| `avatar-512.png`       | 512×512  | GitHub and npm avatar: dark mark at 360 px on Night                 |
| `og-image.png`         | 1200×630 | Share image (`og:image`) for Reddit, LinkedIn and the site          |
| `src/og.html`          | 1200×630 | Template for `og-image.png` (`?shot=<file URL>` adds a Studio shot) |
| `src/avatar.html`      | 512×512  | Template for `avatar-512.png`                                       |

The favicons keep transparent corners outside the Night square (`rx="12"` on the 64-unit grid);
the touch icon and the avatar are full-bleed Night.

## Colours

Dark is the primary palette (spec §2.3):

| Token        | Hex       | Job                                                  |
| ------------ | --------- | ---------------------------------------------------- |
| Night        | `#0C0D0F` | Page background                                      |
| Surface      | `#16181D` | Panels, cards, code blocks                           |
| Paper        | `#E8E4D9` | Body text; the mark's lines on dark                  |
| Comment      | `#8C887D` | Secondary text                                       |
| Ghost        | `#6E6B64` | `−` the old text, struck through (graphic and state) |
| Patch        | `#FFB224` | `+` the fix; the mark's patch                        |
| Patch shadow | `#8A5600` | The patch's hard offset shadow                       |
| Hunk         | `#4FC3DC` | Keys, file paths, locale codes, links                |
| Exit 1       | `#FF5468` | "CI will fail": dashed outlines, errors              |
| Exit 0       | `#6FD69A` | "Done": always with ✓ and a word                     |

The light logo and mark (`logo.svg`, `mark.svg`) use Ink `#15171B` for the lines, on Print
`#F4F5F7`.

Rule: amber is always a filled shape (the patch, the primary button, the edited row), never a
border or decoration.

## Fonts

All self-hosted from Fontsource, nothing loads from Google.

- Display: Martian Mono 500 (the wordmark `livelocale`, all lowercase, letter-spacing −0.02em,
  converted to outlines so the logo needs no font) and 700 (headlines).
- Interface and body: IBM Plex Sans.
- Code: IBM Plex Mono.
- Arabic: IBM Plex Sans Arabic.
