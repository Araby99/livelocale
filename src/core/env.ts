/**
 * Single source of truth for "is LiveLocale active right now, and in which mode?".
 *
 * Modes:
 *   - `development`: NODE_ENV is `development` (the default, zero-config mode).
 *   - `preview`: explicitly opted in with `LIVELOCALE=preview` (server) or
 *     `NEXT_PUBLIC_LIVELOCALE=preview` (client bundles). Works in production builds so a
 *     preview deployment can be edited through a hosted Studio. The mutation API then
 *     requires a bearer token (see the router).
 *   - `off`: everything else.
 *
 * Rules, in order:
 *   1. `LIVELOCALE=off|0|false` (or `NEXT_PUBLIC_LIVELOCALE=off`) always wins → off.
 *   2. `LIVELOCALE=preview` / `NEXT_PUBLIC_LIVELOCALE=preview` → preview.
 *   3. `NODE_ENV` must be `development`, otherwise off.
 *   4. `LIVELOCALE=force` skips rule 5.
 *   5. On the server, a known hosting platform (Vercel preview/production, Netlify,
 *      Kubernetes, Render, Fly.io, Railway, Heroku) → off, so a mis-configured staging
 *      deploy cannot leak watermarks. A one-time warning is logged.
 *
 * `process.env.NODE_ENV` and `process.env.NEXT_PUBLIC_LIVELOCALE` are referenced as
 * literal member expressions so Next.js and Vite can inline them in browser bundles.
 */

export type LiveLocaleMode = 'off' | 'development' | 'preview';

const OFF_VALUES = new Set(['off', '0', 'false']);

let warnedDeployed = false;

/** Test hook: forget that the deployed-platform warning was already printed. */
export function resetEnvWarnings(): void {
  warnedDeployed = false;
}

function readNodeEnv(): string | undefined {
  try {
    return process.env.NODE_ENV;
  } catch {
    return undefined;
  }
}

/** Set by the Vite plugin (and usable by any host) to mirror the server flag into the page. */
export const BROWSER_FLAG_GLOBAL = '__LIVELOCALE_FLAG__';

function readPublicFlag(): string | undefined {
  let value: string | undefined;
  try {
    value = process.env.NEXT_PUBLIC_LIVELOCALE;
  } catch {
    value = undefined;
  }
  if (value) return value;
  try {
    const g = globalThis as any;
    const fromGlobal = g.window?.[BROWSER_FLAG_GLOBAL] ?? g[BROWSER_FLAG_GLOBAL];
    return typeof fromGlobal === 'string' ? fromGlobal : undefined;
  } catch {
    return undefined;
  }
}

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env[name];
  return value === '' ? undefined : value;
}

/** Returns a human-readable platform name when running on a known hosting platform. */
export function detectDeployedPlatform(): string | null {
  if (typeof window !== 'undefined') return null; // browser: nothing to detect
  const vercelEnv = readEnv('VERCEL_ENV');
  if (vercelEnv === 'production' || vercelEnv === 'preview')
    return `Vercel (VERCEL_ENV=${vercelEnv})`;
  const netlifyContext = readEnv('CONTEXT');
  if (readEnv('NETLIFY') === 'true' && netlifyContext && netlifyContext !== 'dev') {
    return `Netlify (CONTEXT=${netlifyContext})`;
  }
  if (readEnv('KUBERNETES_SERVICE_HOST')) return 'Kubernetes';
  if (readEnv('RENDER') === 'true') return 'Render';
  if (readEnv('FLY_APP_NAME')) return 'Fly.io';
  if (readEnv('RAILWAY_ENVIRONMENT')) return 'Railway';
  if (readEnv('DYNO')) return 'Heroku';
  return null;
}

function evaluate(): { mode: LiveLocaleMode; reason: string | null } {
  const flag = (readEnv('LIVELOCALE') ?? '').toLowerCase();
  const publicFlag = (readPublicFlag() ?? '').toLowerCase();

  if (OFF_VALUES.has(flag)) return { mode: 'off', reason: 'LIVELOCALE kill switch is set' };
  if (OFF_VALUES.has(publicFlag)) {
    return { mode: 'off', reason: 'NEXT_PUBLIC_LIVELOCALE kill switch is set' };
  }

  if (flag === 'preview' || publicFlag === 'preview') return { mode: 'preview', reason: null };

  const nodeEnv = readNodeEnv();
  if (nodeEnv !== 'development') {
    return {
      mode: 'off',
      reason: `NODE_ENV is "${nodeEnv ?? 'undefined'}" (must be "development", or set LIVELOCALE=preview)`,
    };
  }

  if (flag === 'force') return { mode: 'development', reason: null };

  const platform = detectDeployedPlatform();
  if (platform) {
    if (!warnedDeployed) {
      warnedDeployed = true;
      console.warn(
        `[livelocale] Disabled: deployed environment detected (${platform}) while NODE_ENV=development. ` +
          `Set LIVELOCALE=force to override, LIVELOCALE=preview for a hosted preview, or LIVELOCALE=off to silence this warning.`
      );
    }
    return { mode: 'off', reason: `deployed environment detected (${platform})` };
  }

  return { mode: 'development', reason: null };
}

/** The active mode: `off`, `development`, or `preview`. */
export function getLiveLocaleMode(): LiveLocaleMode {
  return evaluate().mode;
}

/**
 * Returns `null` when LiveLocale should be active, otherwise a short reason
 * suitable for error messages and logs.
 */
export function getDisabledReason(): string | null {
  return evaluate().reason;
}

/** True when watermarking, the mutation API, and the client scanner should run. */
export function isLiveLocaleEnabled(): boolean {
  return evaluate().mode !== 'off';
}
