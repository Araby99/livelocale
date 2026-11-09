---
'livelocale': patch
---

`livelocale check` understands a `t` that holds one namespace, as `createTranslations(locale, { plain: true })[ns]` or a helper around it gives. In a folder layout, `t.hero.title` is read as `home.hero.title`: in the namespace the file names (`i18n(Astro, 'home')`) when that namespace has `hero`, else in every namespace that has the key. Islands that get `t` or part of it as a prop, `const { t: common } = …` and `const t = common.footer` are read too. Property reads are also more precise: a read whose first segment no locale knows (`t.getAttribute` on a DOM element, the `t.me` of a Telegram link) is no longer reported as missing, a read past a value (`t.items.map`, `t.title.length`) counts as a read of that value, and `t.hero.titel` is still reported. Call keys (`t('key')`) are checked as before.
