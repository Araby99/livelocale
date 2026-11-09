---
'livelocale': minor
---

New `livelocale/strip` entry: `unwrap`, `sanitizeZeroWidth` and `removeWatermarks`, with no side effects. Importing `unwrap` from `livelocale/client` in browser code (a React island, a Vite app) pulled the whole in-page client into the production bundle, about 23 KB with the mode and hosting-platform checks, because that entry starts the client when it is imported. From `livelocale/strip` the same import adds about 1.4 KB. The package now lists the files that have side effects in `sideEffects`; every other entry behaves as before, and `livelocale/client` and `livelocale/server` still export these helpers.
