---
'livelocale': minor
---

`liveLocaleVite` and the Astro integration take a `fallbackNamespaces` option. The default, `'all'`, still puts every locale's strings into every dev page. A list puts in only the namespaces whose keys the page's HTML shows, plus the ones listed, which cuts a 115 KB dictionary to 6–14 KB per page on a 29-namespace Astro site. Only `wrapTranslationEngine` reads in the browser use these strings, so list a namespace that only client-side code reads; a read of a namespace left out warns in the browser console instead of going blank without a word.
