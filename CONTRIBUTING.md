# Contributing to livelocale

Thanks for helping. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Setup

You need Node.js 18 or newer and npm.

```bash
git clone https://github.com/Araby99/livelocale.git
cd livelocale
npm ci
npm ci --prefix site   # the brand tests use the site's opentype.js
npm run build
```

## Checks

Run these before you open a pull request. CI runs the same checks after installing the root,
`playground`, `playground-vite` and `site` dependencies:

```bash
npm run build
npm test                # unit and integration tests (Vitest)
npm run typecheck
npm run lint
npm run format:check    # npm run format:write fixes formatting
npm ci --prefix playground && npm ci --prefix playground-vite   # once, for E2E
npx playwright install --with-deps                              # once
npm run test:e2e        # end-to-end tests (Playwright)
```

Husky and lint-staged check formatting and linting on every commit.

## Rules for changes

- **No runtime dependencies.** `package.json` has no `dependencies` field and must stay that way.
  The Studio UI is bundled into the package at build time; anything else goes in
  `devDependencies` or is an optional peer dependency loaded from the user's project
  (`check --hardcoded` uses the project's own `typescript`).
- **Keep the Node floor.** `engines.node` stays at `>=18`.
- **Add tests** for a bug fix or a feature.
- **Add a changeset** for every user-facing change: run `npx changeset`, pick the bump and
  describe the change in a sentence. Docs-only and test-only changes need none.

## Questions

Ask with the [Question template](https://github.com/Araby99/livelocale/issues/new?template=question.yml).
Check the [docs](https://livelocale.js.org/docs/) first; most setup questions are answered there.

## Roadmap

livelocale is maintained by one person, so there are no dates. What is being considered is the
list of [open feature requests](https://github.com/Araby99/livelocale/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement).
Ask about anything else with the [Question template](https://github.com/Araby99/livelocale/issues/new?template=question.yml).

Not planned, by design:

- **Becoming an i18n library.** Routing, locale detection, formatting and rendering stay with
  next-intl, react-i18next or whatever you use.
- **A hosted service or an account.** Edits land in your own repository, as file edits or pull
  requests.
- **Runtime dependencies.** The package keeps none.

## Pull requests

1. Fork the repo and branch from `main`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/) messages, such as
   `fix(studio): ...` or `docs: ...`.
3. Open the pull request against `main` and fill in the template.

## Release process

Versions and the changelog are managed with [Changesets](https://github.com/changesets/changesets).

1. Apply the pending changesets. This bumps `package.json` and prepends the notes to
   `CHANGELOG.md`:
   ```bash
   npm run version
   ```
2. Set the same version in `plugins/livelocale/.claude-plugin/plugin.json`, so the Claude Code
   plugin updates with the npm release and its skill describes that release; a unit test fails
   until the two match.
3. Commit the result, push, and create a GitHub release tagged `vX.Y.Z`. The publish workflow
   builds, tests, and publishes to npm with provenance.
