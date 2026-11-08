---
title: Versioning and stability
description: What livelocale's semver promise covers from 1.0 on, what stays internal, how old share links keep working, and which versions CI tests.
---

# Versioning and stability

livelocale follows [Semantic Versioning](https://semver.org/). From 1.0 on, a minor or patch release never removes or renames anything on this page, and never changes what it does in a way that breaks a working setup. Only a new major version (2.0) can. New options, commands, flags and exports can arrive in any minor release.

## What the promise covers

| Surface            | Covered                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports            | The exports listed on the [Configuration](./configuration.md) page: `livelocale/server`, `livelocale/client`, `livelocale/react` and `livelocale/vite`, with every documented option. The bare `livelocale` import is the same as `livelocale/server` (server only). |
| CLI                | Every command and flag in the [CLI reference](./cli/index.md), the exit codes it documents, and the `check` finding names (`hardcoded`, `untranslated`, `wrong-script`).                                                                                             |
| Files in your repo | `livelocale.allow`, the `// livelocale-ignore-next-line` and `// livelocale-ignore-file` comments, the API route `init` writes, the scripts and the `.github/workflows/livelocale.yml` that `init --share` writes, and the `livelocale/` branch names.               |
| Environment        | The variables on the [Environment variables](./environment.md) page and the values they take.                                                                                                                                                                        |
| Share links        | Change links (`lc1.…`), the share folder (`livelocale/index.html`, `manifest.json`, `flag.js`), the fenced `livelocale` block in a GitHub issue and the `/livelocale apply` comment. See below.                                                                      |
| Locale file edits  | How a save writes your JSON: same indentation, same trailing newline, same key order.                                                                                                                                                                                |

## What is internal

Anything not documented in these docs is internal, even when you can import it. Internal parts can change in any release. They include:

- exports with an `@internal` tag in their doc comment, such as `FileMutator`, `KeyScanner`, `GitClient`, `createMutationRouter`, `createGitHubGateway`, `IframeBridge`, `DOMInterceptor`, the message types, `encodeKey`, `decodeKey`, `stripWatermark` and `hasWatermark`;
- globals on `window` whose names start with `__LIVELOCALE` or `__livelocale`, and `data-livelocale-*` attributes;
- the shape of `check --json` output, which may still gain or rename fields in a minor release;
- the Studio's look, its wording, and the preferences and drafts it keeps in your browser;
- the exact text of CLI messages.

Use `unwrap` where you would reach for `stripWatermark`: it does the same for a string, and it also cleans arrays and objects.

## Share links keep working

A change link someone sent, and a share folder already on your host, keep working after you upgrade:

- Every 1.x release reads the `lc1.` change links and the share folders that earlier releases made. Every release is tested against links, manifests and `flag.js` files that 0.12.1 made.
- A workflow written by `init --share` runs the livelocale version it names. A 1.x Studio makes `lc1.` links that this older version still reads. A link format it could not read would be called `lc2.`, and 0.12 and later say "made by a newer LiveLocale" instead of failing quietly.
- `manifest.json` keeps `format: 1`. New fields are optional, and readers ignore fields they do not know.

## Deprecations

When something public has to go, it is deprecated first:

1. A minor release marks it deprecated in these docs and in its doc comment, names what to use instead, and prints a warning when it is used (once per process, or in the CLI's output).
2. It keeps working through the rest of that major version.
3. The next major release removes it, and its release notes say how to move off it.

Raising the minimum Node.js version, or the lowest supported version of Next.js, React, Vite or TypeScript, also waits for a major release.

## Supported versions

| What                                        | Supported                          | Tested in CI                                                         |
| ------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Node.js                                     | 18 or later                        | 20 and 24                                                            |
| Next.js                                     | 13 or later                        | 16, App Router (the Pages Router route is unit-tested)               |
| React                                       | 18 or later                        | 18                                                                   |
| Vite                                        | 5 or later                         | 8                                                                    |
| next-intl                                   | any that returns a `t`             | not run in CI; `wrapNextIntl` wraps the `t` it is given              |
| react-i18next / i18next                     | any                                | 17 / 26                                                              |
| TypeScript (`check --hardcoded`, `migrate`) | 4.7 to 6                           | 5; TypeScript 7 has no classic compiler API yet, and the CLI says so |
| Studio browsers                             | current desktop and phone browsers | Chromium, with Android phone emulation                               |

Versions in the supported range but not in the tested column are expected to work. If one does not, [open an issue](https://github.com/Araby99/livelocale/issues).

Security fixes land in the latest minor release of the current major version. See [SECURITY.md](https://github.com/Araby99/livelocale/blob/main/SECURITY.md).
