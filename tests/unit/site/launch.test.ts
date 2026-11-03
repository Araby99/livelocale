// @vitest-environment node
import * as fs from 'node:fs';
const launch = () => fs.readFileSync('site/LAUNCH.md', 'utf8');
const step = (n: number) => {
  const lines = launch().split('\n');
  const start = lines.findIndex((l) => l.startsWith(`- [ ] ${n}. `));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('- [ ] '));
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
};
it('lists the launch steps in order, owner-gated', () => {
  const who = [...launch().matchAll(/^- \[ \] \d+\. \((agent|owner)[,)]/gm)].map((m) => m[1]);
  expect(who).toEqual([
    'agent',
    'owner',
    'owner',
    'owner',
    'owner',
    'owner',
    'owner',
    'agent',
    'owner',
    'owner',
  ]);
  const at = (s: string) => launch().indexOf(s);
  expect(at('workflow_dispatch')).toBeLessThan(at('js.org pull request'));
  expect(at('`SITE_URL`')).toBeLessThan(at('`SITE_LIVE` to `true`'));
  expect(at('`SITE_LIVE` to `true`')).toBeLessThan(at('site/launch/README.md'));
  expect(at('site/launch/README.md')).toBeLessThan(at('0.11.1'));
});
it('gates the preview on Lighthouse and checks real Safari on a phone', () => {
  expect(step(2)).toContain('`lighthouse` job');
  expect(step(2)).toContain('0.90');
  expect(step(3)).toContain('iPhone Safari');
  expect(step(3)).toContain('chapter seek');
});
it('moves the README and the package homepage in the go-live commit', () => {
  expect(step(8)).toContain('site/launch/README.md');
  expect(step(8)).toContain('`homepage`');
  expect(step(8)).toContain('https://livelocale.js.org/');
});
it('sets the domain in Pages settings, never with a CNAME file', () => {
  expect(launch()).not.toMatch(/public\/CNAME/);
  expect(fs.existsSync('site/public/CNAME')).toBe(false);
});
it('prepares a short README whose docs links all exist', () => {
  const readme = fs.readFileSync('site/launch/README.md', 'utf8');
  expect(readme.split('\n').length).toBeLessThan(120);
  expect(readme).toContain(
    '<source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">'
  );
  const links = [...readme.matchAll(/https:\/\/livelocale\.js\.org\/docs\/([\w/.-]*)/g)].map(
    (m) => m[1]
  );
  expect(links.length).toBeGreaterThanOrEqual(4);
  for (const l of links)
    expect(fs.existsSync(`site/docs/${(l || 'index.html').replace(/\.html$/, '.md')}`), l).toBe(
      true
    );
});
