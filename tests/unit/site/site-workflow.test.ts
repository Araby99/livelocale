// @vitest-environment node
import * as fs from 'node:fs';
const wf = fs.readFileSync('.github/workflows/site.yml', 'utf8');

it('runs when the site, the brand or the product it packs changes', () => {
  for (const event of ['push', 'pull_request']) {
    const paths = new RegExp(
      `${event}:\\s*\\n\\s*branches:\\s*\\[main\\]\\s*\\n\\s*paths:\\s*\\[([^\\]]*)\\]`
    ).exec(wf)![1];
    for (const p of [
      "'site/**'",
      "'brand/**'",
      "'src/**'",
      "'package.json'",
      "'package-lock.json'",
      "'CHANGELOG.md'",
    ])
      expect(paths, `${event} ${p}`).toContain(p);
  }
});

it('deploys only by hand or once the owner sets SITE_LIVE', () => {
  expect(wf).toContain(
    "if: github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && vars.SITE_LIVE == 'true')"
  );
  expect(wf).not.toMatch(/if: github\.event_name != 'pull_request'/);
  expect(wf).toMatch(/npm run site:build/);
  expect(wf).toContain('actions/deploy-pages@v4');
  expect(wf).toMatch(/pages: write/);
  expect(wf).toContain("vars.SITE_URL || 'https://araby99.github.io/livelocale/'");
});

it('documents the owner-only js.org claim', () => {
  const readme = fs.readFileSync('site/README.md', 'utf8');
  expect(readme).toContain('"livelocale": "araby99.github.io/livelocale"');
  expect(readme).toMatch(/owner only/i);
});

it('runs the Lighthouse gate after the E2E suite', () => {
  expect(wf.indexOf('npm run lighthouse --prefix site')).toBeGreaterThan(
    wf.indexOf('npm run test:site')
  );
});
