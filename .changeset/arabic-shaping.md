---
'livelocale': patch
---

**Fixed**

- Arabic and Persian text shaped wrongly while LiveLocale was active: the first letter of every translated string was drawn in its connected form, as if a hidden letter came before it. The invisible watermark ended with a zero-width joiner, which is join-causing in Arabic shaping. Watermarks now start and end with the non-joining ZWNJ (bits use ZWSP and ZWJ, which never touch a letter); in a browser the watermarked text now renders pixel-identical to plain text.
- Copy, paste, form submit and input values no longer delete every zero-width character, which removed the ZWNJ that Persian and Urdu words need (e.g. "می‌خواهم") and the ZWSP Thai uses. Only complete watermarks are removed, through the new exported `removeWatermarks()`.
