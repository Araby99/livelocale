---
title: doctor
description: The livelocale doctor command. Checks the route, provider, middleware, frame headers and locale files, and can probe the running app or share link.
---

# doctor

`doctor` inspects the project for the integration problems the Studio cannot recover from, and with `--app` also probes the running app or the deployed site.

```bash
npx livelocale doctor [--dir <path>] [--locales <path>] [--app <url>] [--share] [--token <token>]
```

It checks the mutation route handler, the `LiveLocaleProvider` mount, middleware matchers, frame-blocking headers in `next.config` and the locale JSON. It exits with code 1 on a blocking problem, so it can also run in CI; warnings alone exit 0.

```cli doctor-next

```

## Flags

### `--dir`

`--dir <path>`, default: the current directory.

The project folder to inspect. A bare folder name after `doctor` works too.

### `--locales`

`--locales <path>`, default: `locales`.

The locales folder, relative to the project.

### `--app`

`--app <url>`, no default.

Also probe the running app or deployed site, for example `http://localhost:3000`: the doctor checks that the mutation API answers and that pages are embeddable. A path is the app base, so `--app https://user.github.io/repo/` probes a GitHub Pages project site (a trailing `index.html` is dropped).

### `--share`

With `--app`. Off by default.

Runs the share link probes even when `<base>livelocale/manifest.json` does not answer. They also run on their own whenever the manifest answers with JSON. They check the Studio page, the manifest, `flag.js` and its tag first in `<head>`, frame headers (`X-Frame-Options: DENY` or `frame-ancestors 'none'` breaks the Studio; `SAMEORIGIN` is fine), `script-src` and service workers, then print the share link. When a Workbox service worker (vite-plugin-pwa, workbox-webpack-plugin) would answer the Studio with your app shell, add `navigateFallbackDenylist: [/^\/livelocale\//]` to its Workbox options.

### `--token`

`--token <token>`, with `--app`. Default: the `LIVELOCALE_TOKEN` environment variable.

The access token for a preview deployment. With it the doctor also reports the server mode and repository access problems.
