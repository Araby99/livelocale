/**
 * The share folder's `flag.js`: a classic ES5 script that static share builds load
 * first in `<head>` of every app page.
 *
 * It sets `window.__LIVELOCALE_FLAG__ = 'preview'` (the global `env.ts` reads) only
 * when the page is framed by a same-origin parent whose path is under the folder
 * `flag.js` itself is served from, which is the Studio folder whatever the app base
 * is. Visitors who open the site directly, or frame it from anywhere else, stay
 * `off`. It never overwrites a flag the page already set, never throws, and never
 * logs.
 *
 * Browser-safe, as tests/unit/core-browser-safe.test.ts checks.
 */

/** The first line of `FLAG_SCRIPT`, which `doctor` uses to recognise a deployed `flag.js`. */
export const FLAG_SCRIPT_SIGNATURE = '/*! livelocale flag v1 */';

/** The exact contents `pack` writes to `<base>livelocale/flag.js`. */
export const FLAG_SCRIPT = `${FLAG_SCRIPT_SIGNATURE}
(function () {
  try {
    var me = document.currentScript;
    if (!me || !me.src || window.parent === window || window.__LIVELOCALE_FLAG__ !== undefined)
      return;
    var studio = new URL('.', me.src);
    var host = window.parent.location;
    if (
      host.origin === 'null' ||
      host.origin !== window.location.origin ||
      host.origin !== studio.origin
    )
      return;
    if (host.pathname.indexOf(studio.pathname) !== 0) return;
    window.__LIVELOCALE_FLAG__ = 'preview';
  } catch (e) {}
})();
`;
