/**
 * `livelocale/strip`: the watermark helpers alone, with no side effects.
 *
 * `livelocale/client` starts the in-page client when it is imported, so a bundler has to keep
 * all of it, with the mode and hosting-platform checks, even when a component only wants
 * `unwrap`. This entry imports nothing else, so a production bundle (a React island, a Vite
 * app) gets these few functions and nothing more. It is safe in the browser, on the server and
 * in a Server Component.
 *
 * @example
 * import { unwrap } from 'livelocale/strip';
 * unwrap(t('yes')) === 'Yes';
 */
export { unwrap, removeWatermarks, sanitizeZeroWidth } from '../client/watermark.js';
