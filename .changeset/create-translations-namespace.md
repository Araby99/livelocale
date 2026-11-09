---
'livelocale': minor
---

`createTranslations` takes a `namespace` option that returns one namespace instead of the whole locale: `createTranslations(locale, { namespace: 'home', plain: true })` gives the object of `home.json`, filled from the fallback locale, with watermarks that still carry the full key path (`home.hero.title`). `livelocale check` reads `t.hero.title` on it as `home.hero.title`.
