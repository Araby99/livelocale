---
'livelocale': patch
---

The built Studio now ships `THIRD-PARTY-NOTICES.txt` beside it, with the licence of every open source package compiled into it (React, react-dom, scheduler, Tailwind CSS and tw-animate-css). Minifying had stripped their copyright notices, which their MIT licences ask to keep with every copy. `pack` and `build` copy the file into your share folder with the rest of the Studio.
