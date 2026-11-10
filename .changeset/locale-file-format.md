---
'livelocale': patch
---

A locale file saved by a Windows editor now loads and saves like any other. A file that starts with a byte-order mark (BOM) used to fail with "not valid JSON" in the Studio, on save, in the share-link build and in the page's fallback text for Vite and Astro; it now loads, and a save keeps the mark. A save also keeps Windows line endings (CRLF) instead of rewriting every line, both on disk and on a GitHub branch. When a locale file is broken, the error now says it is not valid JSON instead of wrongly saying its root must be an object. Keys that look like numbers, such as `"404"`, still move to the front in ascending order on the first save: that is how JavaScript orders object keys.
