/**
 * Single source of truth for "is i18n Lens active right now?".
 *
 * Rules, in order:
 *   1. `NODE_ENV` must be `development`.
 *   2. `I18N_LENS=off|0|false` (or `NEXT_PUBLIC_I18N_LENS=off` in client bundles) disables it.
 *   3. `I18N_LENS=force` overrides rule 4.
 *   4. On the server, a known hosting platform (Vercel preview/production, Netlify,
 *      Kubernetes, Render, Fly.io, Railway, Heroku) disables it even when NODE_ENV is
 *      `development`, so a mis-configured staging deploy cannot leak watermarks.
 *
 * `process.env.NODE_ENV` and `process.env.NEXT_PUBLIC_I18N_LENS` are referenced as
 * literal member expressions so Next.js and Vite can inline them in browser bundles.
 */

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

function readPublicFlag(): string | undefined {
  try {
    return process.env.NEXT_PUBLIC_I18N_LENS;
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

/**
 * Returns `null` when i18n Lens should be active, otherwise a short reason
 * suitable for error messages and logs.
 */
export function getDisabledReason(): string | null {
  const nodeEnv = readNodeEnv();
  if (nodeEnv !== 'development') {
    return `NODE_ENV is "${nodeEnv ?? 'undefined'}" (must be "development")`;
  }

  const flag = (readEnv('I18N_LENS') ?? '').toLowerCase();
  if (OFF_VALUES.has(flag)) return 'I18N_LENS kill switch is set';

  const publicFlag = (readPublicFlag() ?? '').toLowerCase();
  if (OFF_VALUES.has(publicFlag)) return 'NEXT_PUBLIC_I18N_LENS kill switch is set';

  if (flag === 'force') return null;

  const platform = detectDeployedPlatform();
  if (platform) {
    if (!warnedDeployed) {
      warnedDeployed = true;
      console.warn(
        `[i18n-lens] Disabled: deployed environment detected (${platform}) while NODE_ENV=development. ` +
          `Set I18N_LENS=force to override, or I18N_LENS=off to silence this warning.`
      );
    }
    return `deployed environment detected (${platform})`;
  }

  return null;
}

/** True when watermarking, the mutation API, and the client scanner should run. */
export function isLensEnabled(): boolean {
  return getDisabledReason() === null;
}
