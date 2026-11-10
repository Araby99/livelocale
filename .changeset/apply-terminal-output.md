---
'livelocale': patch
---

`apply` now says why. Each edit it did not apply shows its reason, such as "Placeholders differ from the reference: missing {name}" or "Changed on the target since the link was made", and an edit that needs `--force` says so. An applied edit shows its warnings (for example, a new web address), followed by a reminder to review them with `git diff`. `--dry-run` starts with "Dry run: nothing was written." and lists "would apply" lines. When a locale file cannot be written (read-only or locked), the other files are still written and the summary lists what was written and what failed. With `--source`, the note about the link's source locale no longer tells you to pass `--source`.
