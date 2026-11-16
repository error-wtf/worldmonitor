/* WorldMonitor legacy-compat shim — feature-detected, no-op auf modernen Browsern.
 *
 * Anlass (CDP-Diagnose Orbsmart TR43, Chromium 95, 01.11.2026):
 * - AbortSignal.timeout fehlt (< Chromium 103): TypeError in wm-liveticker.js,
 *   wm-gnews-fix.js und main-Bundle tryFetchDigest -> Liveticker/GNews-Tabs/
 *   News-Digest tot + Retry-Loops (/api/latest-brief sekündlich doppelt).
 * - structuredClone fehlt (< Chromium 98): ReferenceError im Mission-Preset-
 *   Snapshot (main-Bundle) + China-Makro-Tiles (macro-tiles-chunk).
 * - @layer wird ab Chromium 99 geparst; Chromium<99 verwirft das gesamte
 *   625-KB-Dashboard-CSS (embed-url-*.css, 8 @layer-Blöcke) -> Layout-Totalschaden.
 *   Der Bridge-Link lädt für NUR diese Engines das UNLAYERTE Haupt-CSS
 *   (main-BK_iRVDg.css — gleiche Regeln, ohne @layer). Moderne Browser
 *   laden es NICHT -> keine Kaskaden-Änderung, keine Pixel-Risiken.
 * Additiv: Browser mit nativen APIs + Chromium>=99 führen keinen Pfad aus.
 */
(function () {
  "use strict";
  try {
    /* Legacy-CSS-Bridge: nur Chromium 95-98 (und älter) bekommen das
     * unlayerte Haupt-CSS. document.write im synchronen <head>-Skript =
     * CSS ist vor dem ersten Paint aktiv. */
    var m = navigator.userAgent.match(/Chrome\/(\d+)/);
    var chromeMajor = m ? parseInt(m[1], 10) : 999;
    if (chromeMajor < 99 && !document.querySelector("link[data-wm-legacy-main-css]")) {
      document.write('<link rel="stylesheet" href="/worldmapp/assets/main-BK_iRVDg.css" data-wm-legacy-main-css="1">');
    }
  } catch (e) { /* defensiv */ }
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout !== "function") {
      Object.defineProperty(AbortSignal, "timeout", {
        writable: true,
        configurable: true,
        value: function (ms) {
          var ctrl = new AbortController();
          var delay = Math.max(0, Number(ms) || 0);
          setTimeout(function () {
            try {
              ctrl.abort(new DOMException(
                "The operation was aborted due to timeout", "TimeoutError"));
            } catch (e) {
              ctrl.abort();
            }
          }, delay);
          return ctrl.signal;
        }
      });
    }
  } catch (e) { /* kein AbortController-Stack: nichts zu retten hier */ }
  try {
    if (typeof window.structuredClone !== "function") {
      /* Plain-Data-Deep-Clone. Deckt die dashboard-internen Nutzungen ab
       * (panelSettings/Provenance-Objekte: JSON-safe). Keine Map/Set/DOM-Node-
       * Fälle bekannt; dort war der Altstand ohnehin ein ReferenceError-Crash. */
      window.structuredClone = function (value) {
        if (value === null || typeof value !== "object") return value;
        return JSON.parse(JSON.stringify(value));
      };
    }
  } catch (e) { /* defensiv */ }
})();
