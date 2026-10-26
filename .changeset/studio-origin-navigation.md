---
'livelocale': patch
---

**Fixed**

- After the embedded app navigated through its own links (for example a language switcher), clicks and locale changes no longer reached a Studio running anywhere other than `http://localhost:3010`: the app's links drop the `?livelocale-origin=` parameter and the client fell back to the default origin. The client now remembers the Studio origin for the browser tab (`resolveStudioOrigin`), accepts only http(s) origins, and still works when storage is blocked. Found while editing the Vercel preview of the demo app with the Studio on port 3011.
