import { describe, it, expect } from 'vitest';
import { resolveAppOrigin } from '../../src/studio/config.js';

describe('resolveAppOrigin', () => {
  it('should default to http://localhost:3000 when nothing is configured', () => {
    expect(resolveAppOrigin({})).toBe('http://localhost:3000');
  });

  it('should prefer the ?app= query parameter over every other source', () => {
    const origin = resolveAppOrigin({
      search: '?app=http://localhost:3001',
      injected: 'http://localhost:4000',
      buildTime: 'http://localhost:5000',
    });
    expect(origin).toBe('http://localhost:3001');
  });

  it('should use the CLI-injected origin when no query parameter is present', () => {
    const origin = resolveAppOrigin({
      injected: 'http://localhost:4000',
      buildTime: 'http://localhost:5000',
    });
    expect(origin).toBe('http://localhost:4000');
  });

  it('should fall back to the build-time origin', () => {
    expect(resolveAppOrigin({ buildTime: 'http://localhost:5000' })).toBe('http://localhost:5000');
  });

  it('should normalize to a bare origin (no path, no trailing slash)', () => {
    expect(resolveAppOrigin({ search: '?app=https://my-app.local:3000/some/path/' })).toBe(
      'https://my-app.local:3000'
    );
  });

  it('should ignore values that are not http(s) URLs and fall through', () => {
    expect(
      resolveAppOrigin({ search: '?app=javascript:alert(1)', injected: 'http://localhost:4000' })
    ).toBe('http://localhost:4000');
    expect(resolveAppOrigin({ injected: 'not a url' })).toBe('http://localhost:3000');
  });
});
