---
title: check
description: The livelocale check command. A read-only check of your translations for CI, with --hardcoded to find text that never went through translation.
---

# check

`check` is a read-only consistency check of your translations, built for CI. It runs in any `NODE_ENV` and never writes a file.

```bash
npx livelocale check [--dir <path>] [--locales <path>] [--source <locale>] [--no-unused] [--strict] [--hardcoded] [--allow <word>] [--json]
```

| Finding                                                            | Level   |
| ------------------------------------------------------------------ | ------- |
| Locale file is not valid JSON                                      | problem |
| Broken ICU syntax (unbalanced braces, `plural` without `other`)    | problem |
| Key used in code but missing from a locale                         | problem |
| Key in the source locale but missing from another locale           | problem |
| Placeholders differ from the source locale (`{name}`, `%s`, `<b>`) | problem |
| Empty value                                                        | warning |
| Key never referenced in code                                       | warning |

Code references resolve namespaces the same way the Studio does, an object access such as `t.home` covers every key under `home`, and i18next plural families (`items_one`, `items_other`, …) count as one key.

```cli check-missing

```

**Exit codes.** 0 when there is no problem, 1 when there is one, and 2 when a check could not run (`--hardcoded` without `typescript` installed).

## Flags

### `--dir`

`--dir <path>`, default: the current directory.

The project folder to scan. A bare folder name after `check` works too.

### `--locales`

`--locales <path>`, default: `locales`.

The locales folder, relative to the project.

### `--source`

`--source <locale>`, default: `en`, else the first locale.

The locale the others are compared against.

### `--no-unused`

Off by default, so unused keys are reported.

Skips the report of keys that code never references. Keys built at run time (``t(`status.${s}`)``) cannot be detected, so review that list before deleting anything.

### `--strict`

Off by default.

Treats warnings (unused keys, empty values, untranslated text) as failures, so they exit with code 1.

### `--hardcoded`

Off by default.

Also finds text never passed through translation, and translations left identical to the source or in the wrong script:

| Finding                                                                                   | Level   |
| ----------------------------------------------------------------------------------------- | ------- |
| `hardcoded`: JSX text or a user-facing attribute that never went through translation      | problem |
| `untranslated`: a translation identical to the source locale                              | warning |
| `wrong-script`: a translation mostly in Latin letters for a non-Latin locale (`ar`, `ja`) | warning |

Each finding prints its file, line and column, and the source text shortened to 60 characters; translation values are never printed. The JSX scan uses your project's own `typescript` (`npm install -D typescript`); without it the other checks still run and the command exits with code 2. Without `--hardcoded`, `check` behaves as it did before the flag existed.

```cli check-hardcoded

```

Opt-outs: `// livelocale-ignore-next-line` above the text or its element, `// livelocale-ignore-file` at the top of a file, and words in a `livelocale.allow` file at the project root (one per line; a `key:` line exempts a translation key from `untranslated` and `wrong-script`).

### `--allow`

`--allow <word>`, with `--hardcoded`. Repeatable.

A word or phrase that never counts as hardcoded, for this run, on top of the words in `livelocale.allow`. Allowed words are matched as whole words, case-sensitively.

### `--json`

Off by default.

Prints the full report as JSON, for other tools. The exit code is the same.
