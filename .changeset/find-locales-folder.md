---
'livelocale': patch
---

`check`, `doctor`, `apply`, `init`, `pack` and `build` now find the locales folder on their own when `--locales` is not given. They try `locales`, `messages` (the next-intl convention), `src/locales`, `public/locales`, `src/i18n/locales` and `src/messages`, and say which folder they picked. When none has locale files, the error lists the folders they looked in. Before, a stock next-intl project failed its first `check` with "Locales directory not found".
