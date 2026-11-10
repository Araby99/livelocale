---
'livelocale': minor
---

New `livelocale/wrap` entry with `wrapTranslationEngine` and `wrapNextIntl`. It works in a Server Component, a Client Component and a shared component with no directive, which no import path did before: `livelocale/client` failed in a Server Component and `livelocale/server` failed in a client bundle. It also keeps the in-page client out of a production bundle: about 6.7 KB (2.7 KB gzip) instead of about 33 KB (11 KB gzip) from `livelocale/client`. The old import paths keep working.

`LiveLocaleProvider` from `livelocale/react` now really loads the in-page client lazily. The published build had it inlined, so every production page downloaded about 35 KB (11.7 KB gzip) it never ran; now a page downloads about 2.8 KB (1.2 KB gzip) and the client loads only when LiveLocale is on.

TypeScript projects that compile to CommonJS with `module: node16` can now import every entry: `require` now points at the CommonJS type declarations, so TypeScript no longer stops with TS1479.
