---
title: Security
description: What a share link can and cannot do, what it makes public, and how the dev mutation API checks origins, tokens, locales and keys.
---

# Security

livelocale writes to your locale files in two ways: a share link proposes edits that a developer applies, and the dev server's mutation API writes to the files on your machine. Each has its own limits.

## Share links

- **No credential anywhere.** The share link, the build, the host and the browser hold no token. Write access stays with the developer's own git login.
- **A leaked link only proposes text.** A developer still has to apply it, and a person has to merge the pull request. `apply` checks every edit again against your own source locale.
- **The repository stays private by default.** The GitHub `owner/repo` is published only with `exposeRepo: true` or `pack --expose-repo`.
- **The Studio is `noindex`**, so search engines do not list it.
- **`manifest.json` is public.** `<base>livelocale/manifest.json` makes every string and key name public, including keys the app does not show, and lists the path of every page of the site.
- **The same-origin risk is accepted.** The Studio frames your app on the same origin, so app scripts can read and change drafts. This is accepted because no secret is stored, and you review every edit before it is merged.

## The dev server

The mutation API is the route the Studio saves through: `/api/livelocale`, from `createLiveLocaleHandler` in the Next.js route `init` writes, or from `liveLocaleVite` on the Vite dev server. Both cap a request body at 1,000,000 bytes, then pass every request through the same checks, in this order:

1. **It runs only while livelocale is on.** Otherwise every request gets `403` with the reason, such as `NODE_ENV` not being `development` or the [kill switch](./safety-switches.md#kill-switch).
2. **Preview mode needs a token.** In preview mode the API refuses every request until `LIVELOCALE_TOKEN` (or `authToken`) is set on the server.
3. **A token, when set, is required on every request** as `Authorization: Bearer <token>`, and compared in constant time. A wrong or missing token gets `401`.
4. **Writes come only from allowed origins.** A `POST` whose `Origin` is not allowed gets `403`. Allowed are `localhost` and `127.0.0.1` on any port, over `http` or `https`, `allowedOrigins` (on `createLiveLocaleHandler`), and the origins in `LIVELOCALE_ALLOWED_ORIGINS`. A remote website cannot write to your files from a developer's browser.
5. **Writes must be JSON.** A `POST` with another `Content-Type` gets `415`, so a plain form or a `text/plain` request cannot get past the checks.

Then each request is checked for what it touches:

- **Locales cannot leave the locales folder.** A locale is a short code such as `en`, `es-419` or `zh-Hans`. One containing `..`, `/`, `\`, `%` or a null byte is refused, and the file path it resolves to must stay inside `localesPath`.
- **Keys are plain paths.** A key is letters, digits, `_` and `-`, separated by dots, up to 200 characters. The segments `__proto__`, `constructor` and `prototype` are refused, so a save cannot reach `Object.prototype`.
- **Values pass the same rules as every other save.** The API, the Studio on a share link and `apply` check a value with the same code: a string under 10,000 characters, with valid message syntax and the placeholders of its reference text, unless the save is forced on purpose.

The in-page client sends messages only to the Studio's origin and ignores messages from any other origin; see [zero-width watermarking](./watermarking.md#how-alt-click-finds-the-key).

For a Studio served away from `localhost`, such as a Codespaces URL, add its origin to `LIVELOCALE_ALLOWED_ORIGINS`; see the [environment variables](../reference/environment.md).
