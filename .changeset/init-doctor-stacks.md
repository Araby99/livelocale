---
'livelocale': minor
---

`init` and `doctor` now know a Vite app from a Next.js one.

- `init` in a Vite app writes nothing and prints the plugin and provider steps, the way it already did for Astro. Before, it wrote a Next.js API route that broke `tsc -b` builds. In a folder with no Next.js, Vite or Astro app, `init` writes nothing, says what it looked for, and exits 2.
- `init` no longer replaces a route file you changed. It says the file differs and leaves it alone; pass `--overwrite` (now accepted without `--share`) to replace it. A route file that differs only in line endings (git on Windows) counts as up to date.
- `doctor` on a Vite app checks the `livelocale/vite` plugin in `vite.config` and the provider or `startLiveLocale()` in your entry file, instead of failing on missing Next.js files, and suggests port 5173 for live checks.
- `doctor` on a next-intl app finds the provider in `app/[locale]/layout.tsx` (or a route group's layout), accepts a middleware matcher that already leaves out all of `/api`, and no longer prints a full replacement matcher that would break next-intl's routing.
