/**
 * `livelocale/wrap`: `wrapTranslationEngine` and `wrapNextIntl` alone, for any component.
 *
 * `livelocale/client` is a 'use client' module that starts the in-page client on import, so
 * a Server Component cannot call its functions. `livelocale/server` imports Node's `fs`, so a
 * component that also renders in the browser cannot build with it. This entry has no
 * directive, no Node imports and no side effects: it works in a Server Component, a Client
 * Component and a shared component with no directive. In production it adds the wrapper and
 * the mode check only; with LiveLocale off the wrapper hands back the engine itself.
 *
 * It does not start the in-page client. Something else still has to: `LiveLocaleProvider`
 * from `livelocale/react`, or an import of `livelocale/client`.
 *
 * @example
 * import { useTranslations } from 'next-intl';
 * import { wrapNextIntl } from 'livelocale/wrap';
 * const t = wrapNextIntl(useTranslations('home'), 'home');
 */
export { wrapTranslationEngine, wrapNextIntl, type WrapOptions } from '../client/wrap.js';
