---
'livelocale': patch
---

`LIVELOCALE=preview` (or `NEXT_PUBLIC_LIVELOCALE=preview`) no longer turns LiveLocale on when the hosting platform says the deploy is production: Vercel (`VERCEL_ENV=production`), Netlify (`CONTEXT=production`) and Railway (environment `production`). Set for every environment by mistake, it would have put invisible watermark characters into every string of the live site. LiveLocale stays off there and prints one warning. The warning and the reason name the setting that asked for preview, so you know which one to change. Preview and branch deploys work as before.
