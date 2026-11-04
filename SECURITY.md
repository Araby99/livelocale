# Security Policy

## Supported versions

Security fixes land in the latest minor release only. Upgrade to it to get them.

| Version | Supported |
| ------- | --------- |
| 0.12.x  | Yes       |
| < 0.12  | No        |

## Reporting a vulnerability

Please **do not** open a public issue, pull request or discussion for a security problem.

1. Report it privately through GitHub:
   [Report a vulnerability](https://github.com/Araby99/livelocale/security/advisories/new)
   (**Security → Report a vulnerability** on this repository).
2. If you cannot use GitHub, email
   [ahmed.araby7956@gmail.com](mailto:ahmed.araby7956@gmail.com) with the subject line
   "livelocale security".

Include the livelocale version, your framework, and the steps or a proof of concept.

livelocale is maintained by one person, so these are targets, not guarantees:

- an acknowledgement within **3 business days**;
- an assessment, and a fix or mitigation plan for a confirmed issue, as soon as it is understood;
- a released fix, a GitHub security advisory and credit for the reporter, unless you ask to stay
  anonymous.

Please give us a reasonable time to ship a fix before you disclose the issue publicly.

## Scope

In scope:

- **The CLI** (`npx livelocale ...`), including `init`, `apply`, `pack`, `build` and `check`.
- **The Studio**, the in-context editor served by `livelocale studio` and bundled into a build for
  share links.
- **Share links**: the packed Studio, its `manifest.json`, change links, `apply` and the
  `.github/workflows/livelocale.yml` workflow that `init --share` writes.
- **The client runtime and server code** your app imports: the React and Next.js helpers, the
  Vite plugin and the dev mutation API (`/api/livelocale`).

Out of scope: vulnerabilities in your own app, your host or your other dependencies, and issues
that need `NODE_ENV=development` or preview mode on a production server, which the docs tell you
never to do.

## How livelocale limits risk

- **Development only.** The mutation API answers `403` unless `NODE_ENV=development` (or preview
  mode with a token), and production builds carry no watermark.
- **Writes are checked.** Writes are accepted only from allowed origins (`localhost`,
  `127.0.0.1`, `allowedOrigins`, `LIVELOCALE_ALLOWED_ORIGINS`) and only as JSON, with a body cap,
  path containment inside `localesPath`, refusal of `__proto__` / `constructor` / `prototype` key
  segments, and atomic temp-then-rename file writes.
- **Preview mode** refuses every request until `LIVELOCALE_TOKEN` is set, and then requires
  `Authorization: Bearer <token>` on every request.
- **Share links hold no credential.** A leaked link only proposes text: a developer applies it,
  `apply` checks every edit again, and a person merges the pull request. Note that the packed
  `manifest.json` is public and lists every string and key name.

The full threat model is in the docs: [Security](https://livelocale.js.org/docs/how-it-works/security.html).

## Hardening tips for teams

- Never set `NODE_ENV=development` or enable preview mode on a shared or publicly reachable
  production server.
- Keep `localesPath` pointed at a directory that contains only translation files.
- Restrict origins explicitly with `allowedOrigins` or `LIVELOCALE_ALLOWED_ORIGINS` when the Studio
  is not on localhost.
- Use the `build:preview` script that `init --share` adds only on staging or preview deployments.
