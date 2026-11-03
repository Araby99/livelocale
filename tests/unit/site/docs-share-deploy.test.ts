// @vitest-environment node
import * as fs from 'node:fs';

const DOCS = 'site/docs';

function page(file: string): string {
  return fs.readFileSync(`${DOCS}/${file}`, 'utf8');
}

// The doctor runs its share probes only when `<base>livelocale/manifest.json` answers with JSON, or
// with --share. A broken share deployment (no `livelocale/` uploaded, or an SPA fallback answering
// it) would otherwise get dev-server advice, so every share check in the docs passes --share.
it.each(['start/static-host.md', 'guides/share-links.md'])(
  '%s checks a share deployment with doctor --share',
  (file) => {
    const without = page(file)
      .split(/\r?\n/)
      .filter((line) => /npx livelocale doctor --app <url>/.test(line))
      .filter((line) => !/npx livelocale doctor --app <url> --share/.test(line));
    expect(without).toEqual([]);
    expect(page(file)).toContain('npx livelocale doctor --app <url> --share');
  }
);

// On Next.js, init --share adds a separate build:preview script; a plain `next build` has no Studio.
it.each([
  ['start/static-host.md', /^## 2\. [\s\S]*?(?=^## 3\. )/m],
  ['guides/share-links.md', /^## Set up[\s\S]*?(?=^## )/m],
])('%s tells Next.js readers to deploy with npm run build:preview', (file, section) => {
  const text = section.exec(page(file))?.[0] ?? '';
  expect(text).toMatch(/On Next\.js, deploy with `npm run build:preview`/);
  expect(text).toMatch(/plain `next build` has no Studio/);
});

it('vite.md says what to do when the locale files live elsewhere', () => {
  const md = page('start/vite.md');
  expect(md).not.toContain('Your files live elsewhere: `npx livelocale check --locales <path>`');
  expect(md).toContain(
    'If your files live elsewhere, run `npx livelocale check --locales <path>` and set the same folder as `localesPath` in `vite.config.ts`.'
  );
});
