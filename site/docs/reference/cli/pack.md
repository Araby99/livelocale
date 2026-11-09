---
title: pack
description: The livelocale pack command. Turns a finished static build into a share link by writing the share Studio into the built site folder.
---

# pack

`pack` turns a finished static build into a share link. It writes the Studio, `manifest.json`, the locale files and `flag.js` into `<outDir>/livelocale/`, and links `flag.js` from every HTML page. Run it after your build, for example `"build": "vite build && livelocale pack dist"`.

```bash
npx livelocale pack <outDir> [--dir <path>] [--locales <path>] [--source <locale>] [--base <path>] [--expose-repo] [--no-inject]
```

`<outDir>` is the built site folder, relative to `--dir` (for example `dist`, `build` or `out`). `pack` takes exactly one. A missing or second `<outDir>`, or a flag `pack` does not take, is a usage error (exit code 2); an `<outDir>` that does not exist yet stops it with code 1.

The share link is `<your site><base>livelocale/index.html`. Nothing is written outside `<outDir>/livelocale/` except that one script tag, and an existing `livelocale/` folder is replaced only when `pack` wrote it.

## Pages in the manifest

`manifest.json` lists the site's pages as `pages`: every HTML page of the build, as its path relative to the base (`/` for `index.html`, `/pricing/` for `pricing/index.html`, `/about.html`), sorted. Not-found pages such as `404.html` are left out. The share Studio suggests these pages in its [address field](../../guides/studio.md#go-to-a-page).

The list holds at most 2,000 pages. A bigger site lists the first 2,000, and `pack` prints a warning.

## Flags

### `--dir`

`--dir <path>`, default: the current directory.

The project folder. `<outDir>`, `--locales` and the detected base are read from it.

### `--locales`

`--locales <path>`, default: `locales`.

The locales folder, relative to the project.

### `--source`

`--source <locale>`, default: `en`, else the first locale.

The source locale.

### `--base`

`--base <path>`, default: detected from the project, else `/`.

The site path the app is served from, such as `/repo/`. Without it, `pack` reads the base from the Vite or Astro config's `base`, Next.js's `basePath` or the CRA `homepage`. A relative base (`./`) prints a warning; pass an absolute one if the app has client-side routes.

### `--expose-repo`

Off by default.

Puts the GitHub `owner/repo` into `livelocale/manifest.json`. Without a GitHub repository it prints a warning and the manifest has no repo.

### `--no-inject`

Off by default, so HTML pages are linked.

Does not add the `flag.js` script to HTML files. Next.js outputs are never injected.
