---
'livelocale': patch
---

The Checks column of `apply` and the review page now flags more ways an edit can sneak in a script or a link when a project renders translations as HTML: an attribute added to a tag the source already has (such as `onmouseover` or `style`), also when it follows a quoted value that holds `<` or `>`; a changed `href`, `src` or `srcdoc`; an address that starts with `//`; and a `javascript:` link hidden with HTML character codes or tabs. A new address on its own line is flagged too. The same tag with the same link, written with other quotes or attribute order, and translated `title` or `alt` text are not flagged.
