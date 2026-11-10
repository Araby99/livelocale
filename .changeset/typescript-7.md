---
'livelocale': patch
---

TypeScript 7, the default in a new create-vite app, has no JavaScript compiler API. `migrate` now says so in one line and exits 2 before touching any file, instead of failing on every file and asking you to fix them. `migrate` and `check --hardcoded` both name the fix: install TypeScript 5 or 6 as a dev dependency (`npm install -D typescript@5`). `migrate` now also uses the TypeScript your project has, like `check --hardcoded` does.
