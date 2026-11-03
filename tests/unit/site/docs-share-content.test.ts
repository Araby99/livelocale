// @vitest-environment node
// What the README used to carry about share links, held by the docs page that now owns it, so the
// short go-live README (site/LAUNCH.md step 8) cannot turn these tests red.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { renderWorkflow } from '../../../src/codemod/init-share.js';

const guide = fs.readFileSync('site/docs/guides/share-links.md', 'utf8');
// Prose may be wrapped, so a sentence may span lines: match it with whitespace collapsed.
const prose = guide.replace(/\s+/g, ' ');

describe('the share links guide', () => {
  it('is the share links page', () => expect(guide).toMatch(/^# Share links$/m));

  it('documents apply --pr, the PWA denylist and exposeRepo', () => {
    expect(guide).toContain('npx livelocale apply "<link or file>" --pr');
    expect(guide).toContain('navigateFallbackDenylist: [/^\\/livelocale\\//]');
    expect(guide).toContain('exposeRepo');
  });

  it('never says static builds are unsupported', () =>
    expect(guide).not.toContain('preview mode does not work there yet'));

  it('tells Netlify and Cloudflare users to share the branch alias', () =>
    expect(guide).toContain('branch alias'));

  it('says what Sent means', () =>
    expect(prose).toContain('it is not a pull request until a developer applies it'));

  it('shows exactly the workflow init --share writes', () => {
    const block = /````yaml\r?\n(# Written by `npx livelocale init --share`[\s\S]*?)````/.exec(
      guide
    )?.[1];
    // renderWorkflow refuses a version that is not semver, so render a real one and show the
    // placeholder the guide uses.
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
    expect(guide).toContain('Allow GitHub Actions to create and approve pull requests');
    expect(guide).toContain('/livelocale apply --force');
  });

  it('says every fix comes back as a pull request', () =>
    expect(prose).toContain('every fix comes back to you as a pull request'));

  it('explains the workflow must reach every extra target branch', () =>
    expect(prose).toContain('Merge `.github/workflows/livelocale.yml` into each extra branch too'));

  it('shows a pinned App-token step for CI without the approval click', () => {
    expect(guide).toMatch(/^### CI on these pull requests without the approval click$/m);
    expect(guide).toMatch(/actions\/create-github-app-token@[0-9a-f]{40} # v\d+/);
    expect(guide).toContain("GITHUB_TOKEN: '${{ steps.app-token.outputs.token }}'");
  });

  // create-github-app-token v3.3.0 deprecates app-id in favour of client-id.
  it('passes the App token step its client-id, not the deprecated app-id', () => {
    expect(guide).toContain("client-id: '${{ vars.LIVELOCALE_APP_CLIENT_ID }}'");
    expect(guide).not.toMatch(/^\s*app-id:/m);
  });
});
