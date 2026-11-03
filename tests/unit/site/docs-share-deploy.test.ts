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
// The preview build watermarks every page, so it never becomes the production deployment.
it.each([
  ['start/static-host.md', /^## 2\. [\s\S]*?(?=^## 3\. )/m],
  ['guides/share-links.md', /^## Set up[\s\S]*?(?=^## )/m],
])('%s keeps the Next.js build:preview off production', (file, section) => {
  const text = section.exec(page(file))?.[0] ?? '';
  expect(text).toMatch(
    /On Next\.js, use `npm run build:preview` \(the script `init --share` added\) only as the build command of a staging or preview deployment, never production/
  );
  expect(text).toMatch(/plain `next build` has no Studio/);
  expect(text).not.toMatch(/On Next\.js, deploy with `npm run build:preview`/);
});

// CRA packs `build`, webpack and Rsbuild pack `dist`, and both carry --locales and --source
// (src/codemod/init-share.ts planPackageScripts); llms-full.txt copies these pages.
it.each(['start/static-host.md', 'guides/share-links.md'])(
  '%s names the pack command init --share writes for each bundler',
  (file) => {
    const md = page(file);
    expect(md).toContain('livelocale pack build --locales <path> --source <locale>');
    expect(md).toMatch(/webpack and Rsbuild[^\n]*`dist`/);
    expect(md).not.toMatch(/CRA, webpack and Rsbuild[^\n]*livelocale pack build/);
  }
);

// A Next.js static export cannot keep the POST route `init` wrote; `init --share` says to delete it.
it('static-host.md says to delete the route on a Next.js static export', () => {
  const md = page('start/static-host.md');
  expect(md).toMatch(/`output: 'export'`[^\n]*delete[^\n]*`app\/api\/livelocale\/route\.ts`/);
  expect(md).toMatch(/dev Studio cannot save/);
});

it('vite.md says what to do when the locale files live elsewhere', () => {
  const md = page('start/vite.md');
  expect(md).not.toContain('Your files live elsewhere: `npx livelocale check --locales <path>`');
  expect(md).toContain(
    'If your files live elsewhere, run `npx livelocale check --locales <path>` and set the same folder as `localesPath` in `vite.config.ts`.'
  );
});
