---
title: Teams and enterprise setups
description: Run the Studio with the app on another port or host, the Studio away from localhost, a CSP or auth middleware in the way, namespaces or a monorepo.
---

# Teams and enterprise setups

The defaults assume the app on `localhost:3000` and the Studio on `localhost:3010`. Anything else needs one of the settings below.

## App on another port or hostname

Start the Studio with `--app https://app.dev.local:3000`, or open the Studio with `?app=<origin>`. See the [`studio` reference](../reference/cli/studio.md#app).

## Studio away from localhost

GitHub Codespaces, Gitpod and shared dev boxes serve the Studio from another origin. The mutation API only accepts writes from `localhost` origins unless told otherwise. Pass `allowedOrigins` to [`createLiveLocaleHandler`](../reference/configuration.md#createlivelocalehandler), or set a variable in the app's dev process:

```bash
LIVELOCALE_ALLOWED_ORIGINS="https://abc-3010.app.github.dev,https://studio.dev.local"
```

It is read once, when the route handler or the Vite plugin is created, so restart the dev server after changing it.

## A Content-Security-Policy blocks the iframe

If your app sends `frame-ancestors 'none'` or `X-Frame-Options: DENY` in development, the Studio cannot embed it. Relax the header only when `NODE_ENV === 'development'`, for example by allowing `frame-ancestors 'self' http://localhost:3010`.

## Auth middleware redirects the API

Exclude `/api/livelocale` from your middleware matcher, so the Studio can reach the mutation route without a session:

```ts
export const config = { matcher: ['/((?!api/livelocale).*)'] };
```

## Namespaced hooks

The key scanner reads the namespace from `useTranslations('ns')`, `getTranslations('ns')`, `useTranslation('ns')`, `wrapNextIntl(…, 'ns')` and `wrapTranslationEngine(…, { keyPrefix: 'ns' })` in each file, and prefixes the keys it finds with it. It does not follow translator functions passed between files or chosen at run time.

## Monorepos

`localesPath` is resolved relative to the working directory of the app's process, so point it at the package that owns the locale files, for example `path.resolve('./src/locales')`.

## Not sure which applies

Run the doctor against the running app. It names the exact file and header involved:

```bash
npx livelocale doctor --app <origin>
```

Every check it runs is on the [`doctor` reference](../reference/cli/doctor.md).
