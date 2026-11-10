---
'livelocale': patch
---

Locale files named with an underscore or three parts, such as `pt_BR.json`, `en_US/` or `zh-Hant-TW.json`, are now read by `check`, `doctor`, `apply` and the save API. Before, they were skipped without a word, so `check` could pass in CI without ever reading them. In `check`, `doctor`, `apply`, the save API and the Studio, keys may now use letters from any language and single spaces between words, such as `home.überschrift` or i18next's `Hello world`. A JSON file or folder in the locales folder whose name is still not a locale code is now listed by `check` (a warning, a problem with `--strict`) and by `doctor`, instead of being ignored silently.
