# Launch checklist

The steps that take the landing page and the docs live at `https://livelocale.js.org/`, in order.
Each step is marked with who does it. An agent never pushes, opens the pull request to js.org or
changes the repository settings; those steps are the owner's.

- [ ] 1. (agent) `feat/landing` merged to `main`; on `main` the Site workflow's tests (Chromium,
     WebKit, Firefox), the accessibility gate and the Lighthouse gate are green; `SITE_LIVE`
     unset, so nothing has deployed.
- [ ] 2. (owner) With Settings → Pages → Source set to GitHub Actions (`site/README.md`, Deploy),
     run the Site workflow once by `workflow_dispatch`: the hidden preview at
     `https://araby99.github.io/livelocale/` and `https://araby99.github.io/livelocale/docs/`,
     linked from nowhere; that run's `lighthouse` job is green (medians >= 0.90).
- [ ] 3. (owner) Check the preview on a real phone and a computer: the hero video plays muted with
     a working pause, iPhone Safari included, where a chapter seek must land too (automated
     WebKit cannot decode the video), the door switch, the Arabic clip, the FAQ, the docs search,
     the Next.js getting-started page, no sideways scroll.
- [ ] 4. (owner) Open the js.org pull request (`site/README.md`, "Claiming livelocale.js.org")
     against the preview; wait for the merge.
- [ ] 5. (owner) Domain switch: repository variable `SITE_URL` = `https://livelocale.js.org/`;
     Settings → Pages custom domain `livelocale.js.org` with Enforce HTTPS. No `CNAME` file.
- [ ] 6. (owner) Set the repository variable `SITE_LIVE` to `true`, then run the Site workflow by
     `workflow_dispatch`; from now on pushes to `main` deploy.
- [ ] 7. (owner) Check `https://livelocale.js.org/` and `/docs/` on a phone and a computer; paste
     the URL into the LinkedIn Post Inspector to confirm the og-image; view the page source and
     check `<meta name="robots" content="index, follow, …">` (the preview's `noindex` is gone).
- [ ] 8. (agent, on the owner's go) The go-live README commit: copy `site/launch/README.md` over
     `README.md`, copy `site/launch/marketplace.json` to `.claude-plugin/marketplace.json` (the
     Claude Code marketplace goes live only now, because every link in the skill points at
     `https://livelocale.js.org/`), set `package.json` `homepage` to `https://livelocale.js.org/`,
     check that `npm test` passes (the publish workflow runs it before `npm publish`), and commit
     `docs: shrink the README to the pitch and links to the docs`.
- [ ] 9. (owner) The 0.12.1 release, created by the owner as for every release, so npm shows the
     short README and the new homepage. It carries the step 8 commit and the pending changeset
     (`.changeset/share-address-locale.md`: the share Studio's address field no longer shows its
     own `?locale=`). `npm run version` consumes the changeset; the `CHANGELOG.md` entry is
     `## [0.12.1] - <date>` with `### Patch Changes` and a **Fixed** bullet, as in the 0.10.1
     entry (not `### Minor Changes` as in 0.12.0), and
     `plugins/livelocale/.claude-plugin/plugin.json` is set to 0.12.1 too; commit
     `chore: release 0.12.1`, then the GitHub release `v0.12.1`.
- [ ] 10. (owner) Set the GitHub repository's website to `https://livelocale.js.org/`; set
      `brand/avatar-512.png` as the GitHub avatar and as the Gravatar of the npm account's email.
      Once step 8 is on `main`, check the plugin in a Claude Code session:
      `/plugin marketplace add Araby99/livelocale`, then `/plugin install livelocale@livelocale`.

## Search engines and AI assistants

What the build writes for them, all from `SITE_URL` (`site/src/lib/seo.ts`,
`site/src/lib/seo-files.ts`), so the domain switch moves every absolute URL at once:

- **The preview is noindex.** When `SITE_URL` is on `github.io` (the hidden preview of steps 2
  to 4), every landing and docs page carries `<meta name="robots" content="noindex, nofollow">`;
  any other URL, `https://livelocale.js.org/` included, gets `index, follow`. It is decided at
  build time, so step 6's run after the domain switch is the first indexable build. The preview's
  `robots.txt` sits under `/livelocale/`, not at the host root, so crawlers never read it; the
  meta tag is what keeps the preview out. The live demo (`demo/`) and both 404 pages are always
  noindex.
- `<base>sitemap.xml`: the landing page and every docs page, each `lastmod` from the last git
  commit that touched its source (the build time outside git).
- `<base>robots.txt`: every agent allowed, the AI crawlers (GPTBot, ClaudeBot, PerplexityBot,
  Google-Extended, CCBot and others) named one by one, and the sitemap's URL.
- `<base>llms.txt` ([llmstxt.org](https://llmstxt.org/)) and `<base>llms-full.txt`: the summary
  and a link per docs page, and all the docs as one Markdown file, generated from `site/docs/` on
  every build. Every docs page also has its Markdown copy beside it (`docs/start/nextjs.md`),
  linked from its head as `rel="alternate" type="text/markdown"`.
- JSON-LD: the landing page describes the software, the website, its author (Araby99, the
  package author) and the FAQ, read from the FAQ section itself; each docs page is a
  `TechArticle` with its breadcrumbs.
- After step 6 (owner, optional): submit `https://livelocale.js.org/sitemap.xml` in Google Search
  Console and Bing Webmaster Tools.
