// The docs' `cli` blocks: a fence whose info is `cli <name>` becomes the terminal run that
// site/scripts/docs/cli-snippets.mjs recorded from the real CLI, so no output is typed by hand.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarkdownRenderer as MarkdownIt } from 'vitepress';
import { renderTerminal } from '../../scripts/docs/terminal.mjs';

/** Renders `cli <name>` fences from `<dir>/<name>.json`; every other fence renders as before. */
export function cliFence(md: MarkdownIt, opts: { dir: string }): void {
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const match = /^cli\s+(\S+)$/.exec(tokens[idx]!.info.trim());
    if (!match) return fence(tokens, idx, options, env, self);
    const name = match[1]!;
    let text: string;
    try {
      text = readFileSync(join(opts.dir, `${name}.json`), 'utf8');
    } catch {
      throw new Error(`no CLI snippet ${name}: run node site/scripts/docs/cli-snippets.mjs`);
    }
    // v-pre: Vue must not read the CLI's output as template syntax. tabindex: a long line
    // scrolls the box sideways, so a keyboard must be able to reach and scroll it (as Shiki's do).
    return `<pre class="code terminal" tabindex="0" v-pre><code>${renderTerminal(JSON.parse(text))}</code></pre>\n`;
  };
}
