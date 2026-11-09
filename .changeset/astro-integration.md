---
'livelocale': minor
---

**Added**

- First-party Astro support without React: `liveLocale({ localesPath })` from the new `livelocale/astro` entry serves the Studio's API in `astro dev`, puts the mode flag and the fallback dictionary in every page, and loads the in-page client; a normal `astro build` gets none of it. `startLiveLocale()` in `livelocale/client` boots the client on any page without React, and `livelocale check` now reads `.astro` files for keys and for hardcoded text.
