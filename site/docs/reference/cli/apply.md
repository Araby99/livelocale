---
title: apply
description: The livelocale apply command. Applies a change link to your locale files, opens a pull request with --pr, and runs inside the GitHub workflow.
---

# apply

`apply` applies a livelocale change link (the `lc1.` link someone sends from the share link) to your locale files. Every edit is checked again against your own files and source locale before anything is written.

```bash
npx livelocale apply <link|file|-> [--pr] [--dir <path>] [--locales <path>] [--source <locale>] [--force] [--dry-run]
npx livelocale apply --clipboard
```

The input is the change link itself (or the Studio link that carries it), a file that holds it (the change file Send offers, or a saved email or issue), or `-` to read standard input. Pass one input or `--clipboard`, not both. cmd.exe cuts command lines at 8,191 characters, so on Windows pass a long link as a file or with `--clipboard`.

```cli apply-dry-run

```

The summary lists each edit's locale, key and status (applied, already done, conflict, needs `--force` or rejected) and never prints translation values. The exit code is 0 when every edit was applied or already done, and 1 when any edit is a conflict, needs `--force` or was rejected, or when the link cannot be read. A wrong command line (an unknown flag, no link, file, `-` or `--clipboard`, a link and `--clipboard` together, two links) exits with code 2.

## Flags

### `--clipboard`

Off by default.

Reads the change link from the clipboard instead of an argument.

### `--pr`

Off by default.

Commits the changes on a new `livelocale/apply-<time>` branch, pushes it and opens a pull request with `gh` when `origin` is on GitHub, then switches back to your branch. It needs a checked-out branch and a locales folder with no uncommitted changes. When `gh` is missing or fails, the branch is still pushed and `apply` prints how to open the pull request yourself.

### `--dir`

`--dir <path>`, default: the current directory.

The project folder.

### `--locales`

`--locales <path>`, default: `locales`.

The locales folder, relative to the project.

### `--source`

`--source <locale>`, default: `en`, else the first locale.

The source locale every edit is checked against.

### `--force`

Off by default.

Also applies edits the translator saved with "Save anyway" (for example a dropped placeholder). Without it they are reported as `needs --force` and skipped.

### `--dry-run`

Off by default.

Plans the edits and prints the summary without writing any file. With `--dry-run`, `--pr` does nothing.

### `--github-event`

For the generated `.github/workflows/livelocale.yml` workflow only; do not run it yourself. [`init --share`](./init.md) writes this step into it:

```bash
npx --yes livelocale@<version> apply --github-event --locales <path> --source <locale> --branches <a,b>
```

(with `--dir <path>` when the app is in a subfolder of the repository). It reads the issue, comment, dispatch or pull request event from `$GITHUB_EVENT_PATH`, never from the command line, and needs `GITHUB_TOKEN`. It requires `--locales` and `--source`, takes no link, and does not accept `--force`: a maintainer comments `/livelocale apply --force` instead.

- Only a maintainer (OWNER, MEMBER or COLLABORATOR, or write access) makes it write. Anyone else gets the reply "Waiting for a maintainer: comment `/livelocale apply`".
- It writes one commit on a `livelocale/issue-<n>` branch (`livelocale/run-<id>` for a manual run), opens or reuses the pull request, and comments the link on the issue. While that pull request is open, a later apply on the same issue adds one commit to it. A branch is never force-pushed. When the repository does not let GitHub Actions open pull requests, the comment carries a one-click compare link instead.
- `--locales` and `--dir` are relative to the repository root.
- When the pull request is merged or closed, it closes the issue.

### `--branches`

`--branches <a,b>`, with `--github-event`. Default: the repository's default branch.

The branches a link may target, comma-separated. Without `--github-event` it is a usage error (exit code 2). A link made from any other branch targets the default branch, and the comment says so.
