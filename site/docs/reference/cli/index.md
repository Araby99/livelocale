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

`--version` (or `-v`) prints the installed version. `--help` and `--version` work after any command too.

## Usage errors

Every command checks its command line before it does anything. An unknown flag, a flag without its value, an argument the command does not take, or flags that do not go together stop the command with one line on stderr and exit code 2. Nothing is read or written. When a known flag is close to what you typed, the message names it:

```text
$ npx livelocale check --strictt
❌ Unknown option --strictt for livelocale check. Did you mean --strict?
```

Put a flag's value after a space: `--dir app`, not `--dir=app`. Everything after `--` belongs to the command `build` runs and is not checked. A command that is not one of the eight is a usage error too.

Up to 0.12, `check`, `doctor`, `migrate`, `init` and `studio` ignored a flag they did not know, so a typo such as `check --strictt` quietly turned a CI check off.

## Exit codes

| Command                   | 0                                                       | 1                                                                                                                                                | 2                                                                                                                                           |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`check`](./check.md)     | No problem (warnings alone pass, unless `--strict`).    | It found at least one problem.                                                                                                                   | It could not run: a usage error, a missing project or locales folder, an unknown `--source`, or `--hardcoded` without `typescript`.         |
| [`doctor`](./doctor.md)   | No blocking problem (warnings alone pass).              | A blocking problem, or the folder does not exist.                                                                                                | Usage error, including an `--app` that is not an http(s) URL.                                                                               |
| [`migrate`](./migrate.md) | Every file was converted or needed nothing.             | A file failed to convert (the others are still converted and the failed ones are listed), the folder does not exist, or `typescript` is missing. | Usage error.                                                                                                                                |
| [`init`](./init.md)       | The files were written.                                 | The folder does not exist, a file could not be written, or `--share` stopped (for example no locales folder found).                              | Usage error, including `--share` with a plain folder argument, or `--locales`, `--source`, `--branches` or `--overwrite` without `--share`. |
| [`studio`](./studio.md)   | Runs until you stop it.                                 | The port is taken, or the Studio files are missing.                                                                                              | Usage error, including a `--port` that is not a port number or an `--app` that is not an http(s) origin.                                    |
| [`apply`](./apply.md)     | Every edit was applied or already done.                 | An edit is a conflict, needs `--force` or was rejected; the link cannot be read; or the GitHub workflow run failed.                              | Usage error, including `--branches` without `--github-event` and the `--github-event` combinations on its page.                             |
| [`pack`](./pack.md)       | The share folder was written.                           | It could not pack, for example the output or locales folder does not exist.                                                                      | Usage error, including a missing or second `<outDir>`.                                                                                      |
| [`build`](./build.md)     | Your build command's exit code, once it has started it. | Packing after the build could not finish.                                                                                                        | Usage error, found before your build command starts.                                                                                        |

These codes are part of the [stable contract](../stability.md): a 1.x release does not change what they mean. The exact wording of the messages is not.
