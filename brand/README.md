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
| `favicon.svg`          | 64×64    | SVG favicon (small mark, switches to the dark colours by itself)    |
| `favicon-16.png`       | 16×16    | Favicon, small mark (no hairline, no patch shadow), transparent     |
| `favicon-32.png`       | 32×32    | Favicon, master mark, transparent                                   |
| `apple-touch-icon.png` | 180×180  | iOS home screen icon: master mark at 140 px on Paper                |
| `avatar-512.png`       | 512×512  | GitHub and npm avatar: master mark at 360 px on Paper               |
| `og-image.png`         | 1200×630 | Share image (`og:image`) for Reddit, LinkedIn and the site          |
| `src/og.html`          | 1200×630 | Template for `og-image.png` (`?shot=<file URL>` adds a Studio shot) |
| `src/avatar.html`      | 512×512  | Template for `avatar-512.png`                                       |

## Colours

| Token               | Hex       |
| ------------------- | --------- |
| Paper               | `#FFF8F0` |
| Ink                 | `#1D1712` |
| Coral               | `#FF6B4A` |
| Coral shadow        | `#C2472C` |
| Muted               | `#6B5B4D` |
| Line                | `#E9DCCD` |
| Espresso            | `#1C1714` |
| Cream               | `#F6EEE6` |
| Coral (dark)        | `#FF7A5C` |
| Coral shadow (dark) | `#9E3A24` |

On dark the mark's lines are Cream, the patch Coral (dark) and its shadow `#9E3A24`. Coral is never
a text colour on Paper; coral patches and buttons carry Ink text.

## Fonts

All self-hosted from Fontsource, nothing loads from Google.

- Headings and the wordmark: Bricolage Grotesque 700–800 (Arabic: Readex Pro 600–700). The
  wordmark `livelocale` is all lowercase and converted to outlines, so the logo needs no font.
- Interface and body: Inter 400–600 (Arabic: IBM Plex Sans Arabic 400–600).
- Code: JetBrains Mono 500.
