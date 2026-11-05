---
title: Risks and limits
description: The risks of share links and preview mode that livelocale does not hide, and the limits of what it does today.
---

# Risks and limits

## Honest risks

- **Issues in public repositories are public.** A change link filed as an issue, with its text, the translator's name and note, is visible to everyone.
- **Bot pull requests wait for a click.** CI on a pull request the workflow opens waits until someone presses **Approve workflows to run**, unless the workflow opens it with a GitHub App token.
- **Vercel may refuse the commit.** Vercel can block deployments of commits whose author is not a member of the Vercel team. The commit author is the maintainer who triggered the run, with a `Translated-by:` trailer for the translator.
- **One-click automation is GitHub-only.** Other git hosts use `npx livelocale apply "<link>" --pr`, which works anywhere git works.

## Limits

- **Drafts live in one browser.** Clearing site data, a private window, or Safari's 7-day cap on script-writable storage can lose unsent work. Send often, or use **Download backup** in Changes.
- **On a phone, drafts are easier to lose.** A private tab forgets them when it closes, and iOS clears the data of sites you have not opened for a while. The **Send · N** count in the phone's top bar keeps unsent work in sight; send your changes when you are done.
- **One app per repository.**

## What preview mode does not do

- It never writes to the deployment's filesystem; the GitHub branch is the only store.
- It does not replace authentication for the app itself. The token only guards the mutation API.
- It is not a production feature. Do not set `LIVELOCALE=preview` on a production deployment.

See also [security](./security.md) and the [safety switches](./safety-switches.md).
