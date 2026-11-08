---
title: init
description: The livelocale init command. Writes the Next.js API route, or with --share sets up the share link build and the GitHub workflow.
---

# init

`init` has two jobs. On its own it writes the livelocale API route into a Next.js project. With `--share` it sets up the share link for your stack instead, and on a GitHub remote writes the workflow that turns change links into pull requests.

```bash
npx livelocale init [--dir <path>]
npx livelocale init --share [--locales <path>] [--source <locale>] [--branches <a,b>] [--overwrite] [--dir <path>]
```

## The API route (Next.js only)

Plain `init` sets up Next.js only. It picks TypeScript when the project has a `tsconfig.json`, else JavaScript, and writes the route for the router it finds:

| Folder found | File written                      |
| ------------ | --------------------------------- |
| `app/`       | `app/api/livelocale/route.ts`     |
| `src/app/`   | `src/app/api/livelocale/route.ts` |
| `pages/`     | `pages/api/livelocale.ts`         |
| `src/pages/` | `src/pages/api/livelocale.ts`     |
| none of them | `app/api/livelocale/route.ts`     |

(`.js` in place of `.ts` for JavaScript.) The route reads `./locales`; edit `localesPath` in the file if your locale files live elsewhere. `init` writes the file even when one is already there. When `package.json` lists `next-intl` or `react-i18next`, it prints how to wrap your translation hook.

```cli init-next

```

A Vite app does not use `init`: add `liveLocaleVite(...)` from `livelocale/vite` to `vite.config` by hand.

## Flags

### `--dir`

`--dir <path>`, default: the current directory.

The project folder. After plain `init`, a bare folder name works too (`npx livelocale init my-app`); with `--share`, pass it as `--dir my-app` (a bare folder name is a usage error, exit code 2). `init` exits with code 1 when the folder does not exist.

### `--share`

Sets up the share link build and the GitHub workflow instead of the API route. `--locales`, `--source`, `--branches` and `--overwrite` work only with `--share`; without it they are a usage error (exit code 2). It detects your stack, makes the build change below, and prints every file it creates, updates, leaves unchanged or skips, then what is left for you to do.

| Stack                      | Build change                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vite                       | Adds `share: true` (and `sourceLocale` when `--source` is not `en`) to your `liveLocaleVite({ ... })` call in `vite.config`. When there is no such call, the file is skipped and `init` prints the call to add.                                                                                                                                                          |
| CRA                        | Appends `&& livelocale pack build --locales <path> --source <locale>` to `scripts.build`. This is an explicit `&&`, not a `postbuild` hook, because Yarn Berry and some pnpm versions skip pre and post scripts, and hosts that call the bundler directly skip them too.                                                                                                 |
| webpack / Rsbuild          | The same, packing `dist`.                                                                                                                                                                                                                                                                                                                                                |
| Next.js `output: 'export'` | Adds `"build:preview": "livelocale build --preview --locales <path> --source <locale> -- next build"` and `public/livelocale/` to `.gitignore`. Deploy that build to a staging location: the HTML is pre-rendered and must be watermarked at build time. If `app/api/livelocale/route.*` exports POST, `init` tells you to delete it: static export rejects POST routes. |
| Next.js on Vercel/Node     | The same `build:preview` script and `.gitignore` line. Use `npm run build:preview` as the build command of your preview deployments.                                                                                                                                                                                                                                     |
| Anything else              | Nothing is changed. In custom CI, run `LIVELOCALE=preview <your build>` (only for SSR/SSG), then `npx livelocale pack <outDir>`.                                                                                                                                                                                                                                         |

When `origin` is a GitHub repository, `init --share` also writes `.github/workflows/livelocale.yml` at the repository root. The workflow runs [`apply --github-event`](./apply.md) to turn change links into pull requests. On another git host no workflow is written; use `npx livelocale apply "<link>" --pr` instead. Commit and push the result: the workflow must be on the default branch.

```cli init-share-vite

```

### `--locales`

`--locales <path>`, with `--share` only. Default: the first of `locales`, `src/locales`, `public/locales`, `src/i18n/locales` and `messages` that holds locale JSON.

The locales folder, relative to the project. When none of those folders holds locale JSON, `init --share` stops and asks for `--locales <path>`. The path may only contain letters, digits, `.`, `_`, `-` and `/`.

### `--source`

`--source <locale>`, with `--share` only. Default: `en`.

The source locale, written into the build scripts and the workflow. It must be a locale code such as `en` or `pt-BR`.

### `--branches`

`--branches <a,b>`, with `--share` only. Default: the repository's default branch.

The branches a change link may target, comma-separated, at most 10. Merge the workflow into each of them too: a pull request into a branch runs that branch's copy of the workflow. When the default branch cannot be read from `origin`, `init --share` assumes the current branch (or `main`) and says so.

### `--overwrite`

With `--share` only. Off by default.

Replaces an existing `.github/workflows/livelocale.yml` whose content differs. Without it, such a file is skipped and left as it is.
