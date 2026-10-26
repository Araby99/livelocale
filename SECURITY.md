# Security Policy

## Scope

`livelocale` is a **development-only** tool. Every server entry point refuses to run unless
`NODE_ENV=development`, and the client watermarking is bypassed in any other mode. The mutation
API writes to your local locale JSON files, so the threat model is:

- a malicious web page open in the same browser trying to reach the local API (CSRF), and
- malformed input reaching the file writer (path traversal, prototype pollution, oversized bodies).

Protections in place: origin allow-listing on writes, JSON content-type enforcement, body size
caps, path containment inside `localesPath`, rejection of `__proto__` / `constructor` /
`prototype` segments, atomic temp-then-rename writes, and escaped script injection in the Studio
and Vite plugin.

### Preview mode

`LIVELOCALE=preview` exposes the mutation API from a deployed preview. In that mode the API
refuses to start without `LIVELOCALE_TOKEN`, requires `Authorization: Bearer <token>` on every
request, still enforces the origin allow-list on writes, and never touches the server's
filesystem: all writes go to a GitHub branch through a token you scope to that repository
(`contents: write`, `pull_requests: write`). Use a long random access token, serve over HTTPS,
rotate both tokens when people leave, and never enable preview mode on production.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**). You will get an acknowledgement within 5 business days
and a fix or mitigation plan within 30 days for confirmed issues.

If private reporting is unavailable, open a minimal issue asking for a private contact and a
maintainer will reply with one.

## Hardening tips for teams

- Never set `NODE_ENV=development` on a shared or publicly reachable server.
- Keep `localesPath` pointed at a directory that contains only translation files.
- Restrict origins explicitly with `allowedOrigins` in `createLiveLocaleHandler` or the
  `LIVELOCALE_ALLOWED_ORIGINS` environment variable when the Studio is not on localhost.
