---
'next-i18n-lens': minor
---

Preview mode, tested against a real GitHub repository.

**Added**

- The GitHub gateway checks its own access (`checkAccess`): an empty or rejected token, an unknown repository, a missing base branch, and missing "Contents" or "Pull requests" write permission. Write permissions are probed with empty requests that GitHub rejects as invalid, so nothing is created. `GET ?action=info` returns the result as `problems`, the Studio shows it in a banner, and `GitGateway` gains an optional `checkAccess()`.
- `doctor --token <token>` (or `I18N_LENS_TOKEN`) checks a preview deployment: server mode, git availability, and repository access problems. A 401 now explains that a token is needed.
- After eight seconds on "Connecting", the Studio lists the usual causes (app not running, framing blocked, provider missing or off) and the `doctor` command to run.
- `studio` refuses to start when something already answers on `localhost:<port>`; on Windows a second server could otherwise bind beside it and the browser would silently reach the other one.

**Fixed**

- Concurrent saves to one locale file in GitHub mode lost edits with `409`. Saves are now queued per file and a save that loses a race re-reads and retries, so two server instances can write the same file.
- In preview mode a saved edit disappeared from the page as soon as it was saved, and on every reload, because the deployment still serves the old text. The Studio now keeps saved values on the page (`COMMIT_PREVIEW` bridge message) and re-applies the session's saves after reloads and navigation.
- `doctor --app` blamed middleware when a hosting login wall (Vercel Deployment Protection) redirected the request; it now names the wall and how to turn it off.
- `doctor` warned about frame-blocking headers even when `frame-ancestors` allowed the Studio origin.
- `doctor --app` could crash Node on Windows on exit (`UV_HANDLE_CLOSING`), and `check --json` could truncate piped output; both now set `process.exitCode` instead of calling `process.exit()`.
- GitHub permission errors say which token permission is missing.
