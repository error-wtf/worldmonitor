/* wm-mobile-deck-unlock.js v20261116-r1 — r50-Nachbar-Fix (16.11.):
 * Upstream-Heuristik (embed-url chunk, qe()): die echte flache Deck-Karte gibt es
 * nur im Desktop-Kontext; Mobile-/Touch-/schmale Views bekommen in 2D die
 * SVG-Ersatzkarte (shouldUseDeckGL: !(isMobile || !hasWebGLSupport())). Unsere
 * WebView-APK hat Hardware-WebGL (Mali-G52/G57, per CDP bewiesen) und soll die
 * ECHTE Karte zeigen. Dieser Shim greift NUR in Android-WebViews ("wv)"-UA):
 *   (1) die drei Mobile-Queries (pointer:coarse / hover:none / max-width:1024px)
 *       werden in matchMedia auf matches:false gedrueckt,
 *   (2) navigator.userAgentData.mobile wird auf false gepinnt,
 *   (3) window.innerWidth wird auf 1280 gepinnt, falls echtes Breite <=1024
 *       (Breiten-Schwelle der Heuristik; echte CSS-Media-Queries bleiben unangetastet).
 * Module-Scripts sind deferred: dieser synchrone Tag laeuft vor der Heuristik.
 * Desktop-/FireTV-Clients ohne wv-UA sind unbeeinflusst; Breite >1024 wird nicht
 * veraendert. Nebeneffekt (dokumentiert): innerWidth-Leser (Popup-Klemmen) sehen
 * auf schmalen Geraeten 1280 statt der echten Breite.
 */
(function () {
  'use strict';
  if (window.__wmDeckUnlock) return;
  window.__wmDeckUnlock = 1;
  var ua = navigator.userAgent || '';
  if (!/\bwv\)/.test(ua)) return;
  var RE = /pointer:\s*coarse|hover:\s*none|max-width:\s*1024px/i;
  var _mm = window.matchMedia ? window.matchMedia.bind(window) : null;
  if (_mm) {
    var fake = function (q) {
      if (RE.test(String(q))) {
        return { matches: false, media: String(q), onchange: null,
          addListener: function () {}, removeListener: function () {},
          addEventListener: function () {}, removeEventListener: function () {},
          dispatchEvent: function () { return false; } };
      }
      return _mm(q);
    };
    try { Object.defineProperty(window, 'matchMedia', { value: fake, writable: false, configurable: true }); } catch (e1) {}
  }
  try {
    if (navigator.userAgentData && navigator.userAgentData.mobile === true) {
      Object.defineProperty(navigator.userAgentData, 'mobile', { value: false, configurable: true });
    }
  } catch (e2) {}
  try {
    var real = window.innerWidth;
    if (real > 0 && real <= 1024) {
      Object.defineProperty(window, 'innerWidth', { get: function () { return 1280; }, configurable: true });
    }
  } catch (e3) {}
})();
