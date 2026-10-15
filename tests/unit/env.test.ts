// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isLensEnabled,
  getDisabledReason,
  getLensMode,
  resetEnvWarnings,
} from '../../src/core/env.js';

const PLATFORM_VARS = [
  'VERCEL',
  'VERCEL_ENV',
  'NETLIFY',
  'CONTEXT',
  'KUBERNETES_SERVICE_HOST',
  'RENDER',
  'FLY_APP_NAME',
  'RAILWAY_ENVIRONMENT',
  'DYNO',
  'I18N_LENS',
  'NEXT_PUBLIC_I18N_LENS',
  'CI',
];

describe('isLensEnabled', () => {
  beforeEach(() => {
    for (const v of PLATFORM_VARS) vi.stubEnv(v, '');
    vi.stubEnv('NODE_ENV', 'development');
    resetEnvWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is enabled in plain development mode', () => {
    expect(isLensEnabled()).toBe(true);
    expect(getDisabledReason()).toBeNull();
  });

  it('is disabled outside development mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLensEnabled()).toBe(false);
    expect(getDisabledReason()).toContain('NODE_ENV');
  });

  it('honours the I18N_LENS kill switch', () => {
    for (const value of ['off', '0', 'false', 'OFF']) {
      vi.stubEnv('I18N_LENS', value);
      expect(isLensEnabled()).toBe(false);
      expect(getDisabledReason()).toContain('I18N_LENS');
    }
  });

  it('honours the NEXT_PUBLIC_I18N_LENS kill switch (client bundles)', () => {
    vi.stubEnv('NEXT_PUBLIC_I18N_LENS', 'off');
    expect(isLensEnabled()).toBe(false);
  });

  it('is disabled on a deployed platform even when NODE_ENV is development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isLensEnabled()).toBe(false);
    expect(getDisabledReason()).toContain('deployed');

    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('KUBERNETES_SERVICE_HOST', '10.0.0.1');
    expect(isLensEnabled()).toBe(false);
    warn.mockRestore();
  });

  it('warns once on the server when a deployed platform disables the tool', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VERCEL_ENV', 'production');
    isLensEnabled();
    isLensEnabled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('I18N_LENS=force');
    warn.mockRestore();
  });

  it('stays enabled on a deployed platform when I18N_LENS=force', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('I18N_LENS', 'force');
    expect(isLensEnabled()).toBe(true);
  });

  it('stays enabled under `vercel dev` and `netlify dev`', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'development');
    expect(isLensEnabled()).toBe(true);

    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NETLIFY', 'true');
    vi.stubEnv('CONTEXT', 'dev');
    expect(isLensEnabled()).toBe(true);
  });

  it('is not affected by CI=true alone', () => {
    vi.stubEnv('CI', 'true');
    expect(isLensEnabled()).toBe(true);
  });
});

describe('preview mode', () => {
  beforeEach(() => {
    for (const v of PLATFORM_VARS) vi.stubEnv(v, '');
    vi.stubEnv('NODE_ENV', 'production');
    resetEnvWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports mode "off" in a plain production build', () => {
    expect(getLensMode()).toBe('off');
    expect(isLensEnabled()).toBe(false);
  });

  it('reports mode "development" in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getLensMode()).toBe('development');
  });

  it('enables preview mode in a production build when I18N_LENS=preview', () => {
    vi.stubEnv('I18N_LENS', 'preview');
    expect(getLensMode()).toBe('preview');
    expect(isLensEnabled()).toBe(true);
    expect(getDisabledReason()).toBeNull();
  });

  it('enables preview mode in client bundles via NEXT_PUBLIC_I18N_LENS=preview', () => {
    vi.stubEnv('NEXT_PUBLIC_I18N_LENS', 'preview');
    expect(getLensMode()).toBe('preview');
  });

  it('does not apply the deployed-platform guard in preview mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('I18N_LENS', 'preview');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isLensEnabled()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still honours the kill switch over preview in client bundles', () => {
    vi.stubEnv('I18N_LENS', 'off');
    vi.stubEnv('NEXT_PUBLIC_I18N_LENS', 'preview');
    expect(getLensMode()).toBe('off');
  });
});
