---
'livelocale': patch
---

The development Proxy from `createTranslations` and `wrapTranslationEngine` now lists the keys only the fallback has. `Object.keys`, `Object.values`, `Object.entries`, spread, `in` and `JSON.stringify` see the same keys as the merged object production gets, so `Object.values(t.faq).find(Array.isArray)` finds a list that a half-translated locale takes from the fallback. Arrays stay arrays.
