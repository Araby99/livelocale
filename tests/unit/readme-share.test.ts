// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { renderWorkflow } from '../../src/codemod/init-share.js';

const readme = fs.readFileSync('README.md', 'utf-8');
// Prose is wrapped at 100 columns, so a sentence may span lines: match it with whitespace collapsed.
const prose = readme.replace(/\s+/g, ' ');

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
    expect(prose).toContain('it is not a pull request until a developer applies it'));

  it('shows exactly the workflow init --share writes', () => {
    const block = /````yaml\n(# Written by `npx livelocale init --share`[\s\S]*?)````/.exec(
      readme
    )![1];
    // renderWorkflow refuses a version that is not semver, so render a real one and show the
    // placeholder the README uses.
    expect(block).toBe(
      renderWorkflow({
        version: '0.0.0',
        localesPath: 'locales',
        sourceLocale: 'en',
        branches: ['main'],
      }).replace('livelocale@0.0.0 ', 'livelocale@X.Y.Z ')
    );
  });

  it('documents the PR setting and the force comment', () => {
    expect(readme).toContain('Allow GitHub Actions to create and approve pull requests');
    expect(readme).toContain('/livelocale apply --force');
  });

  it('uses the approved positioning line', () =>
    expect(prose).toContain('every fix becomes a pull request with one click'));

  it('explains the workflow must reach every extra target branch', () =>
    expect(prose).toContain('so LiveLocale cannot close their issues otherwise'));

  it('shows a pinned App-token step for CI without the approval click', () => {
    expect(readme).toContain('Run CI on LiveLocale PRs without the approval click');
    expect(readme).toMatch(/actions\/create-github-app-token@[0-9a-f]{40} # v\d+/);
    expect(readme).toContain("GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}'");
  });

  // create-github-app-token v3.3.0 deprecates app-id in favour of client-id.
  it('passes the App token step its client-id, not the deprecated app-id', () => {
    expect(readme).toContain("client-id: '${{ vars.LIVELOCALE_APP_CLIENT_ID }}'");
    expect(readme).not.toMatch(/^\s*app-id:/m);
  });
});
