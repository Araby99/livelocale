// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

const readme = fs.readFileSync('README.md', 'utf-8');

describe('README share link section', () => {
  it('has the share link section', () => expect(readme).toMatch(/^## .*Share link on any host$/m));

  it('documents apply --pr, the PWA denylist and exposeRepo', () => {
    expect(readme).toContain('npx livelocale apply "<link or file>" --pr');
    expect(readme).toContain('navigateFallbackDenylist: [/^\\/livelocale\\//]');
    expect(readme).toContain('exposeRepo');
  });

  it('no longer says static builds are unsupported', () =>
    expect(readme).not.toContain('preview mode does not work there yet'));

  it('tells Netlify and Cloudflare users to share the branch alias', () =>
    expect(readme).toContain('branch alias'));

  it('says what Sent means', () =>
    expect(readme).toContain('it is not a pull request until a developer applies it'));
});
