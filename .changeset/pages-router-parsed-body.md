---
'livelocale': patch
---

On a Next.js Pages Router app, saving from the Studio no longer spins forever. Next reads the request body before the `livelocale` route runs, so the route waited for a body that never came. It now uses the body Next already read, and still refuses a body over the size limit.
