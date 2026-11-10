---
'livelocale': patch
---

`check` no longer fails correct translations, and catches one it missed:

- A locale file that starts with a byte-order mark (common for files saved on Windows) is read normally by `check`, `doctor` and the key scanner, instead of being reported as invalid JSON.
- A file whose content is a list, `null` or a plain string is reported once as an invalid file, the way `doctor` reports it, instead of as a list of missing keys. A file that cannot be read no longer adds a "missing key" line for every key in it.
- ICU plurals with an offset, such as `{n, plural, offset:1 ...}`, are no longer reported as broken syntax.
- An i18next `_zero`, `_one` or `_two` form may write the number as a word (Arabic "عنصر واحد") without `{{count}}`, and a translation may keep `{{count}}` where the source writes the word; neither is a placeholder problem any more.
- An i18next plural that has other forms but no `_other` form is now a warning (a problem with `--strict`): without it, most counts show the key or the fallback language.
- A key used only through react-i18next's `<Trans i18nKey="...">` is no longer reported as unused.
