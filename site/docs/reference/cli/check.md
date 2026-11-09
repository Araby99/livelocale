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

## How code keys are read

`check` reads two kinds of reference: calls such as `t('home.title')`, and property reads such as `t.home.title`.

- **Calls.** The string is a key, checked exactly as written: it is not looked up under other namespaces. A key that no locale has is reported as missing. A namespace from `useTranslations('home')`, `useTranslation('home')`, `wrapNextIntl(t, 'home')` or `wrapTranslationEngine(t, { keyPrefix: 'home' })` goes in front of the key.
- **Property reads.** Any variable named `t` matches, including a DOM element in a plain script. So where `t` may be anything, a read only counts when some locale knows its first segment, as a key, a namespace, or a key inside a namespace: `t.getAttribute` and `t.classList.toggle` are skipped, and `t.hero.titel` is still reported. Where the file gets `t` from a translation source, every read is a key, and one whose first segment no locale has is reported too: a `t` prop (`function Island({ t })`), `const { t } = i18n(Astro, 'home')`, `const t = getT('home', locale)` or `const t = createTranslations(…)`. A file that also binds another `t`, such as `tabs.forEach(function (t) { … })` in an inline script, falls back to the first rule. The `t.me` of a `https://t.me/…` link and examples in comments that start a line are not reads. A read past a value, such as `t.items.map(…)` or `t.title.length`, counts as a read of `items` or `title`.

### A `t` that holds one namespace

With one folder per locale (`locales/<locale>/<namespace>.json`), many sites pass around one namespace, not the whole locale:

```astro
---
// src/i18n/index.ts: getT(ns, locale) = createTranslations(locale, { plain: true })[ns]
const { t } = i18n(Astro, 'home');
---
<h1>{t.hero.title}</h1>
<Hero client:load t={t.hero} />
```

`check` reads `t.hero.title` as `home.hero.title`:

1. **In the file's namespace.** The file passes a namespace name as a string argument to a call whose result it keeps, such as `'home'` in `const { t } = i18n(Astro, 'home')` or `t={getT('home', locale)}`. A string passed to a method, such as `document.getElementById('pricing')`, does not count. If that namespace has `hero`, the read belongs to it. `t.hero.title` is then reported missing when `home.hero` has no `title`, even if another namespace has `hero.title`.
2. **Anywhere else.** Otherwise the key counts in every namespace that has it. An island that gets `t` or `t.hero` as a prop is read this way. If no namespace has the key, it is reported as missing, with the file's namespace in front when it names exactly one. On a `t` that may be anything (see above), a read whose first segment no locale has is skipped instead.

`const { t: common } = i18n(Astro, 'common')` and `const t = common.footer` are read too.

For an explicit namespace, use the `namespace` option of [`createTranslations`](../configuration.md#createtranslations). `createTranslations(locale, { namespace: 'home', plain: true })` returns that namespace, and `check` reads `t.hero.title` on it as `home.hero.title`.

**Unused keys.** When `check` cannot tell which namespace a read belongs to, the key counts as used in every namespace that has it. So `unused` does not list a key that code reads through these rules, but it can miss one: if `about.hero.title` is never read and a page reads `t.hero.title` with no namespace in reach, `about.hero.title` is not listed. Keys built at run time cannot be detected at all.

```cli check-missing

```

**Exit codes.** 0 when there is no problem, 1 when there is at least one, and 2 when the check could not run: a wrong command line (such as a mistyped flag), a project folder or locales folder that does not exist, a locales folder with no locale files in it, that is no `{locale}.json` and no `*.json` inside a `{locale}/` folder (`No locale files found in <dir>. Point --locales at the folder with en.json, ar.json, ...`, followed by the JSON files and folders it skipped because their name is not a locale, such as `en_US.json`), a `--source` locale that is not there, or `--hardcoded` on JSX files without `typescript` installed. A CI step can tell "the translations need work" (1) from "the check never ran" (2).

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

Each finding prints its file, line and column, and the source text shortened to 60 characters; translation values are never printed. The JSX scan uses your project's own `typescript` (`npm install -D typescript`); without it the other checks still run and the command exits with code 2. `.astro` templates are scanned without `typescript`. The key scan reads `.astro` files too, frontmatter and template. Without `--hardcoded`, `check` behaves as it did before the flag existed.

```cli check-hardcoded

```

Opt-outs: `// livelocale-ignore-next-line` above the text or its element, `// livelocale-ignore-file` at the top of a file (in `.astro`, in the frontmatter or as `<!-- livelocale-ignore-file -->` atop the template), and words in a `livelocale.allow` file at the project root (one per line; a `key:` line exempts a translation key from `untranslated` and `wrong-script`).

### `--allow`

`--allow <word>`, with `--hardcoded`. Repeatable.

A word or phrase that never counts as hardcoded, for this run, on top of the words in `livelocale.allow`. Allowed words are matched as whole words, case-sensitively.

### `--json`

Off by default.

Prints the full report as JSON, for other tools. The exit code is the same. When the check could not run, it still prints a report, with no issues and an `error` field that says why.
