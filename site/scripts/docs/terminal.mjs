// Sets one real CLI run (a snippet from cli-snippets.mjs) as terminal HTML for a docs `cli` block:
// the `$` prompt and the command, every line the CLI printed in its one-job colour (the same
// renderLine as the landing page's CI excerpt), then the exit code in Exit 0 or Exit 1.
import { renderLine } from '../check-excerpt.mjs';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const span = (cls, text) => `<span class="${cls}">${text}</span>`;

/** The run as the inner HTML of a <pre><code>: prompt line, output lines, `# exit <status>`. */
export function renderTerminal({ command, output, status }) {
  const prompt = `${span('c-prompt', '$')} ${escapeHtml(command)}`;
  const lines = output === '' ? [] : output.split('\n').map((l) => (l.trim() ? renderLine(l) : ''));
  const exit = `${span('c-comment', '# exit')} ${span(status === 0 ? 'c-pass' : 'c-fail', String(status))}`;
  return [prompt, ...lines, exit].join('\n');
}
