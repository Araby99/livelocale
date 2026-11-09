---
'livelocale': patch
---

**Fixed**

- Text whose node did not start with the watermark could not be Alt+Clicked. Astro keeps template whitespace and literal text in the same text node as a translation, so a headline written on its own line (`<h1>\n  {t.hero.title}`), a breadcrumb (`<a>Home</a> / {t.crumb}`) and a footer (`© 2026 {t.copyright}`) were never keyed. The client now finds the first watermark anywhere in a node. The live preview, the text sent with a pick, the visible texts used for locale detection and the key jump all use only the text that watermark marks, so the literal `© 2026 ` or `/` stays on the page while you type, and a later translation in the same node is never touched.
- The live preview garbled rich-text values rendered as HTML (Astro `set:html`, React `dangerouslySetInnerHTML`): `<strong>` showed as literal text and the old text after it stayed on the page. A value with markup now previews as markup in that element, parsed in an inert template and limited to inline tags (`strong`, `em`, `b`, `i`, `a` with a safe `href`, `br`, `span`, `code`, `small` and a few more) without scripts, styles or event handlers. Clearing the selection puts the original nodes back exactly. A value stored as plain text still previews as text, and nodes React or Vue render themselves (next-intl `t.rich`) are never taken out of the page.
- The editor started from the page text when the edited locale lacked the key (the page showed the reference locale's fallback), which has no tags, so saving dropped the markup. It now starts from the reference value when that is what the page shows, even when the element also holds page decoration such as a cursor `<span>_</span>` or an arrow.
- `?app=` with a path (`?app=http://localhost:4321/ar/`) opened the app's root. The Studio now opens that page; only the origin is trusted, as before. `livelocale studio --app` with a path does the same.
