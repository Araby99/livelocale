---
title: Get started
description: Set up livelocale in your app, then fix text on the real site and get the change back as a file edit or a pull request.
---

# Get started

livelocale lets anyone on your team fix your site's text on the site itself, in every language, and turns those fixes into a pull request. It is free and open source, on [GitHub](https://github.com/Araby99/livelocale).

Install it in your app as a dependency, `npm install livelocale`:

```sh
npm install livelocale
```

## Pick your stack

- Next.js (App Router)
- Vite + React
- Any static host (share links)

<DocShot name="next-studio-open" alt="The livelocale Studio beside a running Next.js app: the Locale Directory lists the keys, the live preview shows the page, and the editor waits for a pick." caption="The Studio, open beside your running app." />

::: details Didn't work?
Run `npx livelocale doctor` in your project. It checks the project for common integration problems: the route, the provider, middleware, CSP and locales.
:::

## See it work

<DocClip name="alt-click-edit" label="Alt+Click the headline on the Tidewell demo site, fix the typo in the editor and save it." caption="Hold Alt and click any text to edit it." />
