// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { distTagFor, prereleaseVersion } from '../../scripts/dist-tag.mjs';

describe('distTagFor', () => {
  it('maps a release to latest and a next prerelease to next', () => {
    expect(distTagFor('0.10.0')).toBe('latest');
    expect(distTagFor('0.10.0-next.3')).toBe('next');
  });

  it('refuses any other version shape', () => {
    expect(() => distTagFor('0.10.0-rc.1')).toThrow(/Unsupported version/);
  });
});

describe('prereleaseVersion', () => {
  it('appends -next.<n> to a release base', () => {
    expect(prereleaseVersion('0.10.0', 17)).toBe('0.10.0-next.17');
  });

  it('refuses a base that is not x.y.z', () => {
    expect(() => prereleaseVersion('0.10', 1)).toThrow();
  });
});

describe('publish.yml', () => {
  const yml = fs.readFileSync('.github/workflows/publish.yml', 'utf-8');
  const at = (name: string) => yml.indexOf(`name: ${name}`);

  it('publishes under the dist-tag the version maps to', () => {
    expect(yml).toContain('npm publish --provenance --tag "$TAG"');
  });

  it('never interpolates an input into a run line', () => {
    for (const l of yml.split('\n').filter((l) => /\brun:/.test(l)))
      expect(l).not.toContain('${{ inputs.');
  });

  it('passes the prerelease base through a quoted env expression', () => {
    expect(yml).toContain("BASE: '${{ inputs.prerelease_base }}'");
    // An unquoted expression inside a flow mapping is invalid YAML.
    expect(yml).not.toMatch(/\{ \$\{\{|\{[^}\n]*: \$\{\{/);
  });

  it('sets the prerelease version before the build, the tests and the published check', () => {
    expect(at('Set prerelease version')).toBeGreaterThan(at('Install Root Dependencies'));
    expect(at('Set prerelease version')).toBeLessThan(at('Build Library & Studio'));
    expect(at('Set prerelease version')).toBeLessThan(
      at('Check whether this version is already published')
    );
  });
});
