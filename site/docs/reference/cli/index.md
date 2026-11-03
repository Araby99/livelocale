---
title: CLI reference
description: Every livelocale command in one list, with a link to each command's page and the full help the CLI prints.
---

# CLI reference

The `livelocale` command line has eight commands. Run any of them with `npx livelocale <command>`. Each page lists every flag the command takes, in the order the help prints them.

| Command                   | What it does                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| [`init`](./init.md)       | Writes the API route into a Next.js project, or with `--share` sets up the share link build.        |
| [`studio`](./studio.md)   | Starts the local Studio server beside your running app.                                             |
| [`doctor`](./doctor.md)   | Checks the project for common integration problems, and can probe the running app.                  |
| [`check`](./check.md)     | Checks translations for missing keys, placeholder drift, broken ICU syntax and unused keys, for CI. |
| [`pack`](./pack.md)       | Writes the share Studio into a built site folder and links every HTML page to it.                   |
| [`build`](./build.md)     | Runs your build command, then packs its output.                                                     |
| [`apply`](./apply.md)     | Applies a change link to your locale files, or opens a pull request with `--pr`.                    |
| [`migrate`](./migrate.md) | Wraps existing `react-i18next` usages with `wrapTranslationEngine`.                                 |

## The full help

`npx livelocale --help` (or `-h`, or `help`) prints every command and flag:

```cli help

```

A command that is not one of the eight prints the help and exits with code 1.
