// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isLiveLocaleEnabled,
  getDisabledReason,
  getLiveLocaleMode,
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
  'LIVELOCALE',
  'NEXT_PUBLIC_LIVELOCALE',
  'CI',
];

describe('isLiveLocaleEnabled', () => {
  beforeEach(() => {
    for (const v of PLATFORM_VARS) vi.stubEnv(v, '');
    vi.stubEnv('NODE_ENV', 'development');
    resetEnvWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is enabled in plain development mode', () => {
    expect(isLiveLocaleEnabled()).toBe(true);
    expect(getDisabledReason()).toBeNull();
  });

  it('is disabled outside development mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isLiveLocaleEnabled()).toBe(false);
    expect(getDisabledReason()).toContain('NODE_ENV');
  });

  it('honours the LIVELOCALE kill switch', () => {
    for (const value of ['off', '0', 'false', 'OFF']) {
      vi.stubEnv('LIVELOCALE', value);
      expect(isLiveLocaleEnabled()).toBe(false);
      expect(getDisabledReason()).toContain('LIVELOCALE');
    }
  });

  it('ignores the old I18N_LENS variables (clean break after the rename)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('I18N_LENS', 'preview');
    vi.stubEnv('NEXT_PUBLIC_I18N_LENS', 'preview');
    expect(getLiveLocaleMode()).toBe('off');
    vi.stubEnv('LIVELOCALE', 'preview');
    expect(getLiveLocaleMode()).toBe('preview');
  });

  it('honours the NEXT_PUBLIC_LIVELOCALE kill switch (client bundles)', () => {
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', 'off');
    expect(isLiveLocaleEnabled()).toBe(false);
  });

  it('is disabled on a deployed platform even when NODE_ENV is development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isLiveLocaleEnabled()).toBe(false);
    expect(getDisabledReason()).toContain('deployed');

    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('KUBERNETES_SERVICE_HOST', '10.0.0.1');
    expect(isLiveLocaleEnabled()).toBe(false);
    warn.mockRestore();
  });

  it('warns once on the server when a deployed platform disables the tool', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VERCEL_ENV', 'production');
    isLiveLocaleEnabled();
    isLiveLocaleEnabled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('LIVELOCALE=force');
    warn.mockRestore();
  });

  it('stays enabled on a deployed platform when LIVELOCALE=force', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('LIVELOCALE', 'force');
    expect(isLiveLocaleEnabled()).toBe(true);
  });

  it('stays enabled under `vercel dev` and `netlify dev`', () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'development');
    expect(isLiveLocaleEnabled()).toBe(true);

    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NETLIFY', 'true');
    vi.stubEnv('CONTEXT', 'dev');
    expect(isLiveLocaleEnabled()).toBe(true);
  });

  it('is not affected by CI=true alone', () => {
    vi.stubEnv('CI', 'true');
    expect(isLiveLocaleEnabled()).toBe(true);
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
    expect(getLiveLocaleMode()).toBe('off');
    expect(isLiveLocaleEnabled()).toBe(false);
  });

  it('reports mode "development" in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getLiveLocaleMode()).toBe('development');
  });

  it('enables preview mode in a production build when LIVELOCALE=preview', () => {
    vi.stubEnv('LIVELOCALE', 'preview');
    expect(getLiveLocaleMode()).toBe('preview');
    expect(isLiveLocaleEnabled()).toBe(true);
    expect(getDisabledReason()).toBeNull();
  });

  it('enables preview mode in client bundles via NEXT_PUBLIC_LIVELOCALE=preview', () => {
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', 'preview');
    expect(getLiveLocaleMode()).toBe('preview');
  });

  it('does not apply the deployed-platform guard in preview mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('LIVELOCALE', 'preview');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isLiveLocaleEnabled()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still honours the kill switch over preview in client bundles', () => {
    vi.stubEnv('LIVELOCALE', 'off');
    vi.stubEnv('NEXT_PUBLIC_LIVELOCALE', 'preview');
    expect(getLiveLocaleMode()).toBe('off');
  });
});

describe('browser flag global', () => {
  beforeEach(() => {
    for (const v of PLATFORM_VARS) vi.stubEnv(v, '');
    vi.stubEnv('NODE_ENV', 'production');
    resetEnvWarnings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reads preview mode from window.__LIVELOCALE_FLAG__ when no env flag is inlined', () => {
    vi.stubGlobal('window', { __LIVELOCALE_FLAG__: 'preview' });
    expect(getLiveLocaleMode()).toBe('preview');
  });

  it('honours an "off" flag from the global', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubGlobal('window', { __LIVELOCALE_FLAG__: 'off' });
    expect(getLiveLocaleMode()).toBe('off');
  });
});
