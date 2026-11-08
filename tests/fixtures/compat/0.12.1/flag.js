/*! livelocale flag v1 */
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
