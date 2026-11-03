---
title: Safety switches
description: When livelocale runs, the kill switch that turns it off everywhere, and the guard that turns it off on a hosting platform by itself.
---

# Safety switches

livelocale runs only when `NODE_ENV` is `development`, or when preview mode is switched on on purpose with `LIVELOCALE=preview`. A production build has no watermarks, no mutation API and no in-page client. Two more switches are there for teams.

## Kill switch

`LIVELOCALE=off` turns livelocale off everywhere: no watermarking, no mutation API and no client scanner. `0` and `false` do the same, and the value is not case-sensitive.

Client bundles read `NEXT_PUBLIC_LIVELOCALE=off` instead, because Next.js only inlines `NEXT_PUBLIC_` variables into them. In a Next.js app, set both:

```sh
LIVELOCALE=off
NEXT_PUBLIC_LIVELOCALE=off
```

The Vite plugin copies the server's `LIVELOCALE` into the page, so a Vite app needs only `LIVELOCALE=off`.

The kill switch wins over everything else, preview mode included. While it is set, the mutation API answers every request with `403` and the reason.

## Hosting platform guard

A staging server started with `NODE_ENV=development` by mistake would otherwise serve watermarks and the mutation API. So on the server, livelocale looks for these hosting platforms and turns itself off when it finds one, with one warning in the log that names the platform:

| Platform   | Detected by                                    |
| ---------- | ---------------------------------------------- |
| Vercel     | `VERCEL_ENV` is `production` or `preview`      |
| Netlify    | `NETLIFY` is `true` and `CONTEXT` is not `dev` |
| Kubernetes | `KUBERNETES_SERVICE_HOST` is set               |
| Render     | `RENDER` is `true`                             |
| Fly.io     | `FLY_APP_NAME` is set                          |
| Railway    | `RAILWAY_ENVIRONMENT` is set                   |
| Heroku     | `DYNO` is set                                  |

Local `vercel dev` and `netlify dev` are not affected.

Set `LIVELOCALE=force` to skip the guard on purpose. `force` skips only the guard: `NODE_ENV` must still be `development`, and `NEXT_PUBLIC_LIVELOCALE` does not take it.

The guard does not apply to preview mode, which you switch on for a deployment you mean to edit.

The full order of these rules is on the [environment variables page](../reference/environment.md#how-the-mode-is-chosen).
