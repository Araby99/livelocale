---
title: Catch untranslated text in CI
description: Run livelocale check in CI to fail the build on missing keys, broken translations and text that never went through translation.
---

# Catch untranslated text in CI

`npx livelocale check` is a read-only check of your translations, built for CI. It runs in any `NODE_ENV`, never writes a file, and exits with code 1 when it finds a problem, so the CI job fails.

<DocShot lead name="studio-missing" alt="The Studio on the Next.js playground with the Locale menu set to Arabic (ar): the Locale Directory marks cart.items and home.greeting as Missing, coverage reads 40%, and the editor is open on home.greeting with an empty translation field." caption="The gap the check fails on, as the Studio shows it: keys with no Arabic text yet." />

## Run the check

```bash
npx livelocale check
```

It reports these findings:

| Finding                                                            | Level   |
| ------------------------------------------------------------------ | ------- |
| Locale file is not valid JSON                                      | problem |
| Broken ICU syntax (unbalanced braces, `plural` without `other`)    | problem |
| Key used in code but missing from a locale                         | problem |
| Key in the source locale but missing from another locale           | problem |
| Placeholders differ from the source locale (`{name}`, `%s`, `<b>`) | problem |
| Empty value                                                        | warning |
| Key never referenced in code                                       | warning |

A problem fails the run; a warning is printed and does not. Here a key the code uses is missing from the Arabic file:

```cli check-missing

```

When nothing is wrong, it says so and exits with code 0:

```cli check-clean

```

Code references resolve namespaces the same way the Studio does, an object access such as `t.home` covers every key under `home`, and i18next plural families (`items_one`, `items_other`, …) count as one key, so Arabic's six forms against English's two are not reported. Keys built at run time (``t(`status.${s}`)``) cannot be detected, so review the unused-key list before deleting anything, or skip it with `--no-unused`. Every flag is on the [`check` reference](../reference/cli/check.md).

## Find hardcoded text

```bash
npx livelocale check --hardcoded
```

`--hardcoded` also reads your components for text that never went through translation, and your translations for text that was never translated. Each finding prints its file, line and column, and the source text shortened to 60 characters. Translation values are never printed.

```cli check-hardcoded

```

The JSX scan uses your project's own `typescript`. Without it the other checks still run and the command exits with code 2. Install it with:

```bash
npm install -D typescript
```

Without `--hardcoded`, `check` behaves as it did before the flag existed, so an upgrade does not break an existing pipeline.

## The three kinds

| Finding                                                                                   | Level   |
| ----------------------------------------------------------------------------------------- | ------- |
| `hardcoded`: JSX text or a user-facing attribute that never went through translation      | problem |
| `untranslated`: a translation identical to the source locale                              | warning |
| `wrong-script`: a translation mostly in Latin letters for a non-Latin locale (`ar`, `ja`) | warning |

- **`hardcoded`** reads JSX children and the attributes a user reads or hears: `alt`, `title`, `placeholder`, `aria-label`, `label` and the other `aria-` text attributes. It always fails the run.
- **`untranslated`** is a value left the same as the source locale's. A locale of the source's own language, such as `en-GB` beside `en`, is not compared.
- **`wrong-script`** is a value in a locale normally written in another script, such as Arabic or Japanese, that is mostly Latin letters.

## Strict mode

```bash
npx livelocale check --hardcoded --strict
```

`--strict` treats every warning as a problem: empty values, unused keys, `untranslated` and `wrong-script` then fail the run too. Without it they are printed and the run passes. `--strict` works with or without `--hardcoded`.

## Opt-outs

Put `// livelocale-ignore-next-line` (or `{/* livelocale-ignore-next-line */}` inside JSX) either on the line above the text or on the line above the element that holds it, which is where Prettier leaves it for multi-line JSX:

```tsx
// livelocale-ignore-next-line
const label = <span>LiveLocale</span>;

<footer>
  {/* livelocale-ignore-next-line */}
  <img
    src="/brand/livelocale-logo.svg"
    alt="LiveLocale logo"
    width={120}
    height={32}
    className="logo"
  />
</footer>;
```

A `// livelocale-ignore-file` comment at the top of a file skips the whole file.

Brand names and other words that are never translated go in a `livelocale.allow` file at the project root, one per line. A `key:` line exempts a translation key from `untranslated` and `wrong-script`, for a value that is the same in every language. Blank lines and lines starting with `#` are skipped:

```text
# livelocale.allow
LiveLocale
GitHub
key:checkout.brand
```

`--allow <word>` adds a word or phrase for one run, and can be repeated:

```bash
npx livelocale check --hardcoded --allow Tidewell --allow "Open Source"
```

Allowed words are matched as whole words, case-sensitively. The file is described on the [configuration page](../reference/configuration.md#livelocale-allow).

## GitHub Actions

Add the check as a step after your dependencies are installed:

```yaml
# .github/workflows/i18n.yml
name: i18n
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npx livelocale check --hardcoded
```

The step fails when the command exits with code 1 (a problem) or 2 (`typescript` is not installed). Add `--strict` when warnings should fail the job too, and `--locales <path>` when your locale files are not in `locales`.

## What it does not see

- **Only JSX is checked.** Vue, Svelte, Angular and HTML templates are not, and neither are object literals such as page metadata.
- **Text built at run time is not seen:** a template string with substitutions, a concatenation or a value from an API.
- **Some files are skipped:** test and story files (`*.test.*`, `*.spec.*`, `*.stories.*`, `*.cy.*`, `*.e2e.*`), the folders `__tests__`, `__mocks__`, `__fixtures__`, `fixtures`, `.storybook`, `e2e` and `cypress`, `.d.ts` files, folders the key scanner ignores (`node_modules`, build output) and paths in `.gitignore`.
- **Code-like strings are not reported:** URLs, emails, paths, ids, `kebab-case`, `snake_case`, `camelCase` and `CONSTANT` tokens, dotted keys, and shell commands.
- **Some elements are not looked into:** `<code>`, `<pre>`, `<kbd>`, `<script>`, `<style>` and `<Trans>`.
