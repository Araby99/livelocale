---
'livelocale': patch
---

`apply` (and the GitHub Action that runs it) refuses an edit whose key overlaps an earlier edit in the same language, such as `promo` and `promo.banner`, before writing anything. Before, a crafted or old change link like that could leave a locale file half-applied.
