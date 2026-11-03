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
     the URL into the LinkedIn Post Inspector to confirm the og-image.
- [ ] 8. (agent, on the owner's go) The go-live README commit: copy `site/launch/README.md` over
     `README.md`, set `package.json` `homepage` to `https://livelocale.js.org/`, check that
     `npm test` passes (the publish workflow runs it before `npm publish`), and commit
     `docs: shrink the README to the pitch and links to the docs`.
- [ ] 9. (owner) The README-only 0.11.1 release, created by the owner as for every release, so npm
     shows the short README and the new homepage. It carries the step 8 commit and no code
     changes.
- [ ] 10. (owner) Set the GitHub repository's website to `https://livelocale.js.org/`; set
      `brand/avatar-512.png` as the GitHub avatar and as the Gravatar of the npm account's email.
