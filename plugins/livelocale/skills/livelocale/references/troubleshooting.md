# livelocale troubleshooting

Start with the doctor; it names the file or header to fix. Run it from the app's folder:

- `npx livelocale doctor`: the files only (route, provider, middleware, frame headers in `next.config`, locale JSON).
- `npx livelocale doctor --app http://localhost:3000`: also probes the running app (use the app's real port; Vite is usually 5173).
- `npx livelocale doctor --app <url> --share`: probes a deployed share build.
- `--locales <path>` when the locale files are not in `locales`; `--token <token>` for a preview deployment that needs one.

It exits 1 on a blocking problem, 0 when only warnings remain. Fix each marked line and run it again.

## Install and setup

| Symptom                                                   | Fix                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npx livelocale` is not found                             | Run it in the folder that holds the app's `package.json`, after `npm install livelocale`. Node.js 18 or later. |
| Doctor: **Mutation route handler** fails (Next.js)        | `npx livelocale init` in the app's folder.                                                                     |
| Doctor: **LiveLocaleProvider mounted** warns              | Add `<LiveLocaleProvider />` from `livelocale/react` to the root layout.                                       |
| Doctor: **Locale files** fails with "Directory not found" | Create `locales/`, or pass `--locales <path>` and set the same folder as `localesPath`.                        |
| `migrate` stops with an error                             | `npm install -D typescript`. Run `npx livelocale migrate --dry-run` first to see the files it would change.    |

## Studio

| Symptom                                                | Fix                                                                                                                                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mutation API** reports HTTP 404                      | Next.js: run `npx livelocale init`, restart `next dev`. Vite: put `liveLocaleVite(...)` in `plugins`, restart `vite`. Astro: put `liveLocale(...)` from `livelocale/astro` in `integrations`, restart `astro dev`. |
| **Mutation API** reports a redirect                    | Auth middleware intercepts the route: `matcher: ['/((?!api/livelocale).*)']`.                                                                                                                                      |
| **Mutation API** says the app is not reachable         | The dev server is not running or runs on another port: pass that port to `studio --app` and `doctor --app`.                                                                                                        |
| Blank preview, **Studio can embed the app** warns      | Only while `NODE_ENV` is `development`: send no `X-Frame-Options` (`SAMEORIGIN` blocks too), and `frame-ancestors 'self' http://localhost:3010`.                                                                   |
| Alt+Click follows the link or does nothing             | The text is not wrapped (`wrapTranslationEngine`, `wrapNextIntl`, `createTranslations`), or Alt was not held.                                                                                                      |
| No text responds at all                                | livelocale is off: not a dev server, `LIVELOCALE=off`, or a detected hosting platform.                                                                                                                             |
| Keys under a namespace do not match                    | Give the wrapper the namespace: `wrapTranslationEngine(rawT, { keyPrefix: 'auth' })`, so `t('login.title')` maps to `auth.login.title`.                                                                            |
| Saves fail from Codespaces, Gitpod or a shared dev box | `LIVELOCALE_ALLOWED_ORIGINS="<studio origin>"` in the app's dev process, then restart it.                                                                                                                          |
| **Save Changes** shows a placeholder warning           | The fix dropped or added a `{placeholder}`: put it back, or choose **Save anyway**.                                                                                                                                |
| The Changes panel shows no git status                  | `git` must be on `PATH` and the locales folder inside a repository.                                                                                                                                                |

## Share links

| Symptom                                                     | Fix                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `init --share` stops with `Pass --locales <path>.`          | `npx livelocale init --share --locales <path>`.                                                                         |
| "No supported build setup found"                            | Build with `LIVELOCALE=preview` (SSR and SSG only), then `npx livelocale pack <outDir>`.                                |
| Vite: skips `vite.config.ts`, "no liveLocaleVite(...) call" | Add the plugin first (SKILL.md section 3), then run `init --share` again.                                               |
| No workflow written, one-click pull requests need GitHub    | On other git hosts: `npx livelocale apply "<link>" --pr`.                                                               |
| **Share Studio page** fails                                 | The host did not run the changed build, or did not upload the `livelocale/` folder of the build output.                 |
| S3 and CloudFront                                           | The share link must end in `index.html`.                                                                                |
| Netlify or Cloudflare Pages                                 | `_headers` must not send `X-Frame-Options: DENY` or `frame-ancestors 'none'`; `SAMEORIGIN` is fine.                     |
| Vercel                                                      | Deployment Protection off for the shared deployment, or the person has access to it.                                    |
| A Workbox service worker answers with the app shell         | `navigateFallbackDenylist: [/^\/livelocale\//]` in its Workbox options.                                                 |
| The issue gets "Waiting for a maintainer"                   | A maintainer comments `/livelocale apply` on the issue.                                                                 |
| A compare link instead of a pull request                    | The owner ticks **Allow GitHub Actions to create and approve pull requests**, or opens the pull request from that link. |
| Edits skipped as `needs --force`                            | Comment `/livelocale apply --force`, or locally `npx livelocale apply "<link>" --force`.                                |

## CI check

| Symptom                                        | Fix                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Exit code 2 with `--hardcoded`                 | `npm install -D typescript`; the JSX scan uses the project's own copy.               |
| "Locales directory not found"                  | The files are not in `locales`: `npx livelocale check --locales <path>`.             |
| Keys built at run time reported unused         | They cannot be detected: review before deleting, or pass `--no-unused`.              |
| A brand name reported as hardcoded             | Add it to `livelocale.allow`, or `--allow <word>` for one run.                       |
| Vue, Svelte, Angular or HTML text is not found | Only JSX is scanned; text built at run time and object literals are not seen either. |

Full pages: https://livelocale.js.org/docs/guides/teams.html, https://livelocale.js.org/docs/guides/share-links.html#hosting-notes, https://livelocale.js.org/docs/guides/ci-check.html#what-it-does-not-see
