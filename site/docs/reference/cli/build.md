---
title: build
description: The livelocale build command. Runs your build command, then packs its output into a share link, on Windows, macOS and Linux alike.
---

# build

`build` runs your build command and packs its output in one step. The environment variables work the same on Windows, macOS and Linux, so no `cross-env` is needed.

```bash
npx livelocale build [--preview] [--out <dir>] [pack options] -- <command...>
```

Everything after `--` is your build command, run in the project folder, untouched: `livelocale build -- next build -h` passes `-h` to Next. `build` exits with that command's exit code. A wrong `build` command line exits with code 2 before your command starts.

- **Next.js** projects are packed into `public/livelocale/` before the build runs, so Next copies it into the output. HTML is never injected. Without `--preview`, `build` warns that the pages have no watermarks, and it warns when `public/livelocale/` is not in `.gitignore`. A static export (`output: 'export'`) stops before building when `app/api/livelocale/route.*` exports POST, because export mode only allows GET route handlers; the share link does not need that route.
- **Other stacks** are packed after a successful build, as [`pack`](./pack.md) does. When the command fails, nothing is packed.

| Stack                      | Build change                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js `output: 'export'` | `"build:preview": "livelocale build --preview -- next build"`, deployed to a staging location, because the HTML is pre-rendered and must be watermarked at build time. |
| Next.js on Vercel/Node     | For the Preview environment, use the build command `livelocale build --preview -- next build`. It packs into a gitignored `public/livelocale/`.                        |
| Custom CI                  | `LIVELOCALE=preview <your build>` (only for SSR/SSG), then `npx livelocale pack <outDir>`.                                                                             |

## Flags

### `--preview`

Off by default.

Runs the command with `LIVELOCALE=preview` and `NEXT_PUBLIC_LIVELOCALE=preview`, so server-rendered and pre-rendered pages carry watermarks.

### `--out`

`--out <dir>`, default: the first of `dist/`, `build/` or `out/` that holds an `index.html` written by this build (`build/` first for Create React App).

The build output folder to pack. Next.js projects do not take it: they always pack into `public/livelocale/`. When no fresh output is found, `build` stops and asks for `--out <dir>`.

## Pack options

`--dir`, `--locales`, `--source`, `--base` and `--expose-repo` work as they do for [`pack`](./pack.md). `--no-inject` is not a `build` option.
