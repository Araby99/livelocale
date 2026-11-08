---
title: migrate
description: The livelocale migrate command. Scans your source and wraps existing react-i18next usages with wrapTranslationEngine automatically.
---

# migrate

`migrate` scans your source files and wraps existing `react-i18next` hooks with `wrapTranslationEngine`, so their text becomes editable in the Studio.

```bash
npx livelocale migrate [--dir <path>] [--exclude <list>] [--dry-run]
```

It reads every `.js`, `.jsx`, `.ts` and `.tsx` file under the folder, prints each file it migrates, then a summary of how many files it scanned and migrated. When a file fails to convert, `migrate` still converts the others, lists the failed files and exits with code 1. A mistyped flag exits with code 2 before any file is read. `migrate` needs the `typescript` package to parse your source. It is an optional dependency, so JavaScript-only projects are not forced to install it; `init` and `studio` never need it.

## Flags

### `--dir`

`--dir <path>`, default: the current directory.

The folder to scan. A bare folder name after `migrate` works too. `migrate` exits with code 1 when the folder does not exist.

### `--exclude`

`--exclude <list>`, default: `node_modules,.next,dist,.git`.

A comma-separated list of folder names to skip, at any depth. The list replaces the default, so name those folders too if you still want them skipped.

### `--dry-run`

Off by default.

Lists the files that would be migrated without writing them to disk.
