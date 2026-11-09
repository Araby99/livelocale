---
'livelocale': minor
---

`createTranslations` now fills keys missing from a locale with the `fallbackLocale` text in production too (and prefers `fallbackLocale` over the other locales in development), and its new `plain: true` option returns a plain object with every key filled in, safe to pass as props or `JSON.stringify`.
