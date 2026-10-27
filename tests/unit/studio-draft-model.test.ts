// @vitest-environment node
import { it, expect } from 'vitest';
import { draftScope } from '../../src/studio/transport/drafts.js';

it('uses the repo slug when the manifest exposes it', () =>
  expect(draftScope({ repo: 'acme/web' }, 'https://www.acme.com/')).toBe('acme/web'));
it('falls back to the app path so two Pages sites on one origin never share drafts', () => {
  expect(draftScope({}, 'https://o.github.io/site-a/')).toBe('path:/site-a/');
  expect(draftScope({}, 'https://o.github.io/site-b/')).toBe('path:/site-b/');
});
