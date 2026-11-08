---
title: Use livelocale with AI coding agents
description: Install the livelocale Agent Skill in Claude Code or another coding agent, so it sets up livelocale, share links and the CI check correctly.
---

# Use livelocale with AI coding agents

livelocale ships an Agent Skill: one `SKILL.md` file that tells a coding agent such as Claude Code, Codex or Cursor how to add livelocale to a project, turn on share links, put `check --hardcoded` in CI and fix a setup that does not work. With it, the agent runs the commands on these pages instead of guessing them.

<DocShot lead name="next-studio-open" alt="The Studio beside the running Next.js playground: the Locale Directory lists five keys, the preview shows the page with status Active, and the editor says Select an Element." caption="Where the skill's Next.js setup ends: the Studio open beside next dev, status Active." />

## What the skill does

The agent loads the skill when you ask it to add livelocale, set up share links, catch untranslated text in CI or fix livelocale. It then:

- **Picks the stack** from your `package.json` and config files: Next.js App Router, Vite + React, or share links on a static host, and finds your locale folder.
- **Follows the setup steps** of [Next.js](../start/nextjs.md), [Vite + React](../start/vite.md) or [Any static host](../start/static-host.md): install, `LiveLocaleProvider`, `init` or the Vite plugin, wrapping `t`, `init --share`.
- **Checks each step** with `npx livelocale doctor` and `npx livelocale check`, instead of declaring it done.
- **Adds the CI check** from [Catch untranslated text in CI](./ci-check.md): `npx livelocale check --hardcoded`, its exit codes (0 clean, 1 problems, 2 could not run) and the opt-outs.
- **Fixes setup problems** from the doctor's output and a troubleshooting table of the symptoms these pages list.

It never changes a repository setting for you. The one GitHub setting share links need, **Allow GitHub Actions to create and approve pull requests**, stays your click.

The skill lives in the repository at [`plugins/livelocale/skills/livelocale/`](https://github.com/Araby99/livelocale/tree/main/plugins/livelocale/skills/livelocale), next to the code it describes, and is MIT like the rest.

## Install it in Claude Code

The livelocale repository is also a Claude Code plugin marketplace. In a Claude Code session, add it and install the plugin:

```text
/plugin marketplace add Araby99/livelocale
/plugin install livelocale@livelocale
```

From your shell, the same two steps are `claude plugin marketplace add Araby99/livelocale` and `claude plugin install livelocale@livelocale`. Then ask for what you want, for example "add livelocale to this Next.js app" or "fail CI on hardcoded text"; Claude Code loads the skill when the request matches, or you run it as `/livelocale:livelocale`.

The plugin's version is the npm release it describes, so it updates when a new livelocale version comes out, not with every commit.

To keep the skill in one project instead, without the plugin, copy the `plugins/livelocale/skills/livelocale/` folder into that project's `.claude/skills/` folder, so the file sits at `.claude/skills/livelocale/SKILL.md`.

## Use it with other agents

`SKILL.md` follows the open Agent Skills format: a folder with a `SKILL.md` file whose frontmatter has a `name` and a `description`, and Markdown instructions below it. Any agent that reads Agent Skills can use it as is: copy the `plugins/livelocale/skills/livelocale/` folder, with its `references/` folder, into the skills folder your agent reads, which its own docs name.

For an agent that has no skills support, point it at the file instead: ask it to read `plugins/livelocale/skills/livelocale/SKILL.md` from the livelocale repository before it starts, or paste the file into its rules or instructions.

## Docs for agents that read them

Every docs page is also served as Markdown, at the same address ending in `.md` instead of `.html`, and the whole docs site comes in two files in the llms.txt format:

- [`llms.txt`](../../llms.txt), at the root of this site: what livelocale is, and a link to every docs page with its one-line summary.
- [`llms-full.txt`](../../llms-full.txt), beside it: every docs page, as one Markdown file.

Give an agent `llms-full.txt` when it should know everything at once, and `llms.txt` when it should fetch only the pages it needs. The skill is written from these pages and links back to them, so when the two differ, the docs are right.
