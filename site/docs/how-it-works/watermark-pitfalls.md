---
title: When the watermark bites
description: Where the invisible watermark on a development string shows up, in equality checks, lengths, attributes and tests, and the fix for each.
---

# When the watermark bites

In development every translated string starts with [invisible characters](./watermarking.md). Most code never notices, but code that treats the string as data does:

| Symptom                                                                     | Cause                                              | Fix                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| `t('yes') === 'Yes'` is false                                               | equality on a watermarked string                   | `unwrap(t('yes')) === 'Yes'`                                  |
| `maxLength` or `.length` checks are off by a few                            | the invisible prefix counts as characters          | `unwrap(value).length`                                        |
| `<title>`, `aria-label`, `alt`, `placeholder` show odd spacing in dev tools | attributes do not strip the prefix                 | pass `unwrap(...)` to attributes, or leave it: it is dev-only |
| Screenshot or snapshot tests differ between dev and prod                    | watermarks only exist in development               | run those tests with `LIVELOCALE=off`                         |
| A value saved from a form contains zero-width characters                    | the input guards were bypassed (custom components) | call `sanitizeZeroWidth` before submitting                    |

```ts
import { unwrap, sanitizeZeroWidth } from 'livelocale/client';

unwrap(t('yes')) === 'Yes';
const clean = sanitizeZeroWidth(input.value);
```

Both are exported from `livelocale/client` and `livelocale/server`.

- [`unwrap`](../reference/configuration.md#unwrap) is deep: it cleans strings inside arrays and plain objects, and never changes its input.
- [`sanitizeZeroWidth`](../reference/configuration.md#sanitizezerowidth) removes every zero-width space, joiner and non-joiner, including the ones Persian, Urdu and Thai text needs. For text a person reads, `removeWatermarks` removes only complete watermarks and keeps the rest.

None of this happens in production, where strings carry no watermark. To turn watermarks off in development too, use the [kill switch](./safety-switches.md#kill-switch).
