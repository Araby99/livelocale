// @vitest-environment node
import * as fs from 'node:fs';

const DOCS = 'site/docs';

function page(file: string): string {
  return fs.readFileSync(`${DOCS}/${file}`, 'utf8');
}

/** The numbered steps of a page (`## N. …` up to the next `## `), heading first. */
function steps(md: string): string[] {
  return md
    .split(/^## \d+\. /m)
    .slice(1)
    .map((step) => step.split(/^## /m)[0]!);
}

it.each(['start/nextjs.md', 'start/vite.md', 'start/static-host.md'])(
  '%s shows what "it worked" looks like after every step',
  (file) => {
    const found = steps(page(file));
    expect(found.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const step of found) {
      const title = step.split(/\r?\n/)[0];
      if (!/<DocShot |<DocClip |^```cli /m.test(step))
        problems.push(`${title}: no expected result`);
      const details = /^::: details Didn't work\?\r?\n([\s\S]*?)^:::\r?$/m.exec(step);
      if (!details) problems.push(`${title}: no "Didn't work?" block`);
      else if (!details[1]!.includes('npx livelocale doctor'))
        problems.push(`${title}: "Didn't work?" does not mention npx livelocale doctor`);
    }
    expect(problems).toEqual([]);
  }
);

it.each(['start/nextjs.md', 'start/vite.md', 'start/static-host.md'])(
  '%s ends with the three next steps',
  (file) => {
    const md = page(file);
    const next = md.split(/^## What next$/m);
    expect(next).toHaveLength(2);
    expect(next[1]).not.toMatch(/^## /m);
    for (const href of [
      '../guides/share-links.html',
      '../guides/ci-check.html',
      '../guides/studio.html#arabic-and-right-to-left',
    ])
      expect(next[1]).toContain(`(${href})`);
  }
);

it('opens the docs on the stack picker, not an overview', () => {
  const md = page('index.md');
  expect(md).toContain('<StackPicker');
  for (const href of ['start/nextjs.html', 'start/vite.html', 'start/static-host.html'])
    expect(md).toContain(href);
});
