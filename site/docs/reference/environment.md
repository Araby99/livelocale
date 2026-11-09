---
title: Environment variables
description: The environment variables livelocale reads, what each value does, how the mode is chosen, and the CI and host variables pack and apply use.
---

# Environment variables

livelocale reads four variables of its own, and `NODE_ENV`. The end of this page lists the CI and hosting variables that `pack`, `apply` and the deployed-platform guard read; your CI or host sets those.

| Variable                     | Values                                  | What it does                                                                                                                                                                              |
| ---------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVELOCALE`                 | `off`, `0`, `false`, `preview`, `force` | The server switch. `off` (or `0`, `false`) turns livelocale off everywhere. `preview` turns on preview mode, also in a production build. `force` skips the deployed-platform guard.       |
| `NEXT_PUBLIC_LIVELOCALE`     | `off`, `0`, `false`, `preview`          | The same switch for client bundles, because Next.js only inlines `NEXT_PUBLIC_` variables into them. It takes `off` and `preview`, not `force`.                                           |
| `LIVELOCALE_TOKEN`           | any string                              | The access token the mutation API asks for, when `authToken` is not passed. Required in preview mode. `doctor --app` sends it when `--token` is not given.                                |
| `LIVELOCALE_ALLOWED_ORIGINS` | origins, separated by commas            | More origins the mutation API accepts writes from, on top of `allowedOrigins`, or of the local Studio without it. For a Studio away from `localhost`, such as a Codespaces or Gitpod URL. |
| `NODE_ENV`                   | `development`, anything else            | livelocale runs only when it is `development`, unless preview mode is on.                                                                                                                 |

The values of `LIVELOCALE` and `NEXT_PUBLIC_LIVELOCALE` are not case-sensitive, and an empty value counts as unset. `LIVELOCALE_ALLOWED_ORIGINS` is read once, when the route handler or the Vite plugin is created, so restart the dev server after changing it.

## How the mode is chosen

`getLiveLocaleMode()` returns `off`, `development` or `preview`. The first rule that applies wins:

1. `LIVELOCALE` or `NEXT_PUBLIC_LIVELOCALE` is `off`, `0` or `false`: **off**.
2. `LIVELOCALE` or `NEXT_PUBLIC_LIVELOCALE` is `preview`: **preview**.
3. In the browser, the page sets `window.__LIVELOCALE_FLAG__ = "development"`, and the bundle did not inline `NODE_ENV=production`: **development**. The Vite plugin and the Astro integration set it in development.
4. `NODE_ENV` is not `development`: **off**.
5. `LIVELOCALE` is `force`: **development**.
6. On the server, a hosting platform from the table below is detected: **off**, with one warning in the log.
7. Otherwise: **development**.

Off means no watermarks, no mutation API and no in-page client.

## Setting them for you

- The Vite plugin and the Astro integration put the server's active mode in the page as `window.__LIVELOCALE_FLAG__`, or `off` when `LIVELOCALE` is off. A Vite or Astro app needs no `NEXT_PUBLIC_LIVELOCALE`.
- `livelocale build --preview -- <command>` runs your build with `LIVELOCALE=preview` and `NEXT_PUBLIC_LIVELOCALE=preview`. It also sets `LIVELOCALE_SHARE_BUILD=1`, so the Astro integration leaves its inline flag out and the packed `flag.js` alone decides who gets the client. You never set it yourself.

## CI and host variables

Set by your CI or host, and only read. An empty or invalid value is skipped, and `pack` falls back to the local git checkout for anything it cannot find.

| Read by                                                                                                      | Variables                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The deployed-platform guard: livelocale turns itself off on these while `NODE_ENV` is `development`          | `VERCEL_ENV` (`production` or `preview`), `NETLIFY` (`true`) with `CONTEXT` (anything but `dev`), `KUBERNETES_SERVICE_HOST`, `RENDER` (`true`), `FLY_APP_NAME`, `RAILWAY_ENVIRONMENT`, `DYNO`                                                       |
| `pack`, `build` and the Vite plugin's share build: the branch                                                | `GITHUB_HEAD_REF`, `GITHUB_REF_NAME` (when `GITHUB_REF_TYPE` is `branch`), `VERCEL_GIT_COMMIT_REF`, `CF_PAGES_BRANCH`, `BRANCH` (on Netlify), `CI_COMMIT_REF_NAME` (when `GITLAB_CI` is `true`)                                                     |
| `pack`, `build` and the Vite plugin's share build: the commit                                                | the pull request's head commit from `GITHUB_EVENT_PATH` (when `GITHUB_EVENT_NAME` is `pull_request` or `pull_request_target`), `GITHUB_SHA`, `VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`, `COMMIT_REF` (on Netlify), `CI_COMMIT_SHA` (on GitLab) |
| `pack`, `build` and the Vite plugin's share build: the default branch                                        | the repository's default branch from `GITHUB_EVENT_PATH`                                                                                                                                                                                            |
| `pack`, `build` and the Vite plugin's share build: the repository, only with `--expose-repo` or `exposeRepo` | `GITHUB_REPOSITORY` (when `GITHUB_SERVER_URL` is unset or `https://github.com`), `VERCEL_GIT_REPO_OWNER` and `VERCEL_GIT_REPO_SLUG` (when `VERCEL_GIT_PROVIDER` is `github`), `REPOSITORY_URL` (on Netlify)                                         |
| `apply --github-event`                                                                                       | `GITHUB_TOKEN` and `GITHUB_EVENT_PATH` (both required), `GITHUB_EVENT_NAME`, `GITHUB_REPOSITORY`, `GITHUB_API_URL`, `GITHUB_SERVER_URL`, `GITHUB_RUN_ID`, `GITHUB_STEP_SUMMARY`, `GITHUB_WORKSPACE`                                                 |

The workflow `init --share` writes passes `GITHUB_TOKEN` to `apply --github-event`; GitHub Actions sets the others. See [`apply`](./cli/apply.md) and [`pack`](./cli/pack.md).
