---
'next-i18n-lens': minor
---

Milestone seven: a translation check for CI.

**Added**

- `npx next-i18n-lens check` reports invalid locale JSON, broken ICU syntax, keys used in code but missing from a locale, keys missing compared to the source locale (`--source`, default `en`), placeholder drift against the source locale, empty values, and keys nothing references. Exits 1 on problems; `--strict` promotes warnings, `--no-unused` skips the unused report, `--json` prints the full report. Runs in any `NODE_ENV`, so it works in CI.
- i18next plural families (`items_one`, `items_other`, …) count as one key, and object access such as `t.home` covers every key under it.
- `KeyScanner` accepts `{ requireEnabled: false }` and gains `scanSourceKeys(projectRoot)` for read-only tooling.
