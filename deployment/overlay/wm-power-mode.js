/* WM Power Mode v5 — Dämpft ewiges Polling + rAF-Cap + Dark-Theme auf schwachen TV-Geräten.
 *
 * Anlass (CPU-Profil via CDP @1ms, 01.11.2026, Orbsmart TR43 / RK3566 4xA55):
 * Dashboard-Renderer verbrannte dauerhaft 1.3-2.5 Kerne — 14.6% Samples
 * getBoundingClientRect + 7.8% querySelector. 22 Runtime-Overlays pollen
 * mit <=3s Perioden (wm-nq-fix sogar 5ms), 8 Mapmode-Skripte ensure-pollen
 * ewig alle 2-3s.
 *
 * Wirkung:
 * 1) window.setInterval-Perioden < 8000ms werden auf 8000ms angehoben.
 *    Bewusst NICHT gedämpft: setTimeout (Retry-Backoff-Pfade der Overlays
 *    bleiben unverändert).
 * 2) rAF-Drossel auf 10 fps — die Karten-Engines (maplibre/deck) rendern
 *    sonst dauerhaft; auf 4x A55 mit Chromium 95 kostet das ~2,5 von 4
 *    Kernen. CSS-Transitions/Compositor bleiben unberuehrt (Menues/Scroll
 *    bleiben fluessig).
 * 3) data-theme="dark" für TV-Geräte: sofort im <head> (Skeleton dunkel),
 *    erneut bei DOMContentLoaded/load, plus MutationObserver der Light-Reverts
 *    des App-Boots sofort zurückdreht. Escape: localStorage wm-theme = "light".
 *
 * Aktivierung: navigator.hardwareConcurrency <= 4 (RK3566 = 4; Desktops
 * >= 8 bleiben No-Op) oder localStorage wm-power-mode = "1" (manuell).
 *
 * v5 (01.11.26): FIX — der v4-Deploy basierte auf einer Kopie OHNE den
 * Dark-Observer → TV-Box bootete wieder hell. v5 = v3-Observer + v4-rAF-Cap.
 */
(function () {
  "use strict";
  var forced = false;
  try { forced = localStorage.getItem("wm-power-mode") === "1"; } catch (e) {}
  var weak = (navigator.hardwareConcurrency || 8) <= 4;
  if (!forced && !weak) return;

  var MIN = 8000;
  var clamped = 0;
  var orig = window.setInterval;
  window.setInterval = function (fn, delay) {
    var args = Array.prototype.slice.call(arguments);
    var d = Number(args[1]);
    if (!isNaN(d) && d > 0 && d < MIN) { args[1] = MIN; clamped++; }
    return orig.apply(window, args);
  };

  /* v4 (01.11.26, TV-Box): rAF-Drossel auf 10 fps. */
  var RAF_FPS = 10;
  var RAF_MIN = 1000 / RAF_FPS;
  var lastRAF = 0;
  var origRAF = window.requestAnimationFrame;
  if (typeof origRAF === "function") {
    window.requestAnimationFrame = function (cb) {
      var now = Date.now();
      if (now - lastRAF >= RAF_MIN) {
        lastRAF = now;
        return origRAF.call(window, cb);
      }
      return origRAF.call(window, function (ts) {
        var wait = lastRAF + RAF_MIN - Date.now();
        setTimeout(function () {
          lastRAF = Date.now();
          cb(ts);
        }, wait > 0 ? wait : 0);
      });
    };
    clamped++; /* introspektion: raf-cap aktiv */
  }

  try {
    window.__wmPowerMode = {
      min: MIN,
      rafFps: RAF_FPS,
      clamped: function () { return clamped; }
    };
  } catch (e) { /* defensiv */ }

  /* Dark-Theme für TV-Geräte (v3-Logik). Die App bootet mit ihrem eigenen
   * light-Default und setzt data-theme NACH unserem head-Set — deshalb:
   * sofort + bei DOMContentLoaded + bei load setzen, und Light-Reverts per
   * Observer zurückdrehen. Escape: localStorage wm-theme = "light". */
  function setDark() {
    try {
      if (localStorage.getItem("wm-theme") === "light") return;
      if (document.documentElement.getAttribute("data-theme") !== "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch (e) { /* defensiv */ }
  }
  setDark();
  document.addEventListener("DOMContentLoaded", setDark);
  window.addEventListener("load", setDark);
  try {
    new MutationObserver(function () { setDark(); }).observe(
      document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch (e) { /* defensiv */ }
})();
