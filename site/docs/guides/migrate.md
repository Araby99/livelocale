---
title: Migrating from next-i18n-lens
description: Move a project from next-i18n-lens 0.7.0 to livelocale, renaming the package, the exports, the API route and the environment variables.
---

# Migrating from next-i18n-lens

livelocale was published as `next-i18n-lens` up to 0.7.0. Version 0.8.0 renamed everything, with no aliases for the old names, so every step below is needed.

<DocShot lead name="next-studio-open" alt="The Studio beside the running Next.js playground: the Texts list shows five keys, the preview shows the page with the site status Connected, and the editor says Pick a text to fix." caption="Where you end up: the same Studio, under the livelocale name, beside next dev." />

## Install the new package

```sh
npm uninstall next-i18n-lens && npm install livelocale
```

Import from `livelocale/client`, `livelocale/server`, `livelocale/react` and `livelocale/vite`.

## Rename the exports

| next-i18n-lens                 | livelocale                                 |
| ------------------------------ | ------------------------------------------ |
| `I18nLensProvider`             | `LiveLocaleProvider`                       |
| `createI18nLensHandler`        | `createLiveLocaleHandler`                  |
| `i18nLensVite`                 | `liveLocaleVite`                           |
| `getLensMode`, `isLensEnabled` | `getLiveLocaleMode`, `isLiveLocaleEnabled` |
| `I18nLensHandler` (type)       | `LiveLocaleHandler`                        |
| `LensMode` (type)              | `LiveLocaleMode`                           |

The `ClientInitializer` alias is gone.

## Move the API route

| Router       | next-i18n-lens                      | livelocale                    |
| ------------ | ----------------------------------- | ----------------------------- |
| App Router   | `app/api/i18n-lens/mutate/route.ts` | `app/api/livelocale/route.ts` |
| Pages Router | `pages/api/i18n-lens/mutate.ts`     | `pages/api/livelocale.ts`     |

Or run `npx livelocale init` again, which writes the route at the new path. See the [`init` reference](../reference/cli/init.md).

## Rename the environment variables

| next-i18n-lens              | livelocale                   |
| --------------------------- | ---------------------------- |
| `I18N_LENS`                 | `LIVELOCALE`                 |
| `NEXT_PUBLIC_I18N_LENS`     | `NEXT_PUBLIC_LIVELOCALE`     |
| `I18N_LENS_TOKEN`           | `LIVELOCALE_TOKEN`           |
| `I18N_LENS_ALLOWED_ORIGINS` | `LIVELOCALE_ALLOWED_ORIGINS` |

The old names are ignored, so a kill switch left under its old name stops working. Check your hosting settings. Every variable is on the [environment reference](../reference/environment.md).

## Use the new CLI

The CLI is `npx livelocale`. Its commands are on the [CLI reference](../reference/cli/index.md).
