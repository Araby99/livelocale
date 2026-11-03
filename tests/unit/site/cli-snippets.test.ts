// @vitest-environment node
import { SNIPPETS, runSnippet } from '../../../site/scripts/docs/cli-snippets.mjs';
import { renderTerminal } from '../../../site/scripts/docs/terminal.mjs';

const CLI = 'dist/codemod/index.js';

it.each(Object.keys(SNIPPETS))('runs %s with the real CLI and the expected exit code', (name) => {
  const out = runSnippet(name, SNIPPETS[name]!, CLI);
  expect(out.status).toBe(SNIPPETS[name]!.expect);
  expect(out.output).not.toMatch(/[A-Z]:[\\/]|\/tmp\/|AppData|\.cache\/docs-cli/); // no machine paths
});

it('fails the build when a snippet exits with another code', () => {
  expect(() =>
    runSnippet('check-missing', { ...SNIPPETS['check-missing']!, expect: 0 }, CLI)
  ).toThrow('snippet check-missing exited 1, expected 0');
});

it('colours a failing run in Exit 1 and a passing one in Exit 0', () => {
  expect(
    renderTerminal({ command: 'npx livelocale check', output: '✖ 1 missing key', status: 1 })
  ).toMatch(/c-prompt[\s\S]*c-fail[\s\S]*# exit<\/span> <span class="c-fail">1/);
  expect(renderTerminal({ command: 'npx livelocale check', output: '', status: 0 })).toContain(
    '<span class="c-pass">0</span>'
  );
});
