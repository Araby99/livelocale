---
'livelocale': patch
---

Edits now save to the key the text really came from. With react-i18next, a plural (`t('items', { count: 2 })` saves to `items_other`, and to the page language's plural form when the text came from the fallback language), a context, a per-call namespace (`{ ns: 'home' }` or `'home:title'`), a fallback key list and i18next's own `keyPrefix` used to save to a key nothing reads while the Studio said "Saved!". With next-intl, `t.raw('key')` and `t.markup('key')` no longer put `raw` or `markup` into the saved key.
