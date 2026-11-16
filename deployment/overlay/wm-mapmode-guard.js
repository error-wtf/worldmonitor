/* WM Mapmode Guard — zentrale Exklusivität für alle Karten-Modi.
 *
 * Anlass (01.11.2026, CDP-Live-Repro auf der Orbsmart TR43 + Skript-Matrix):
 * Die 8 Karten-Modi (RADAR/SDR/SPOREN/OCX/MAFIA/CORTEGE/WEATHER/WINDY) pflegen
 * individuelle closeSiblings-Listen. Lücken: radar/sdr/sporen kennen ocx/mafia/
 * cortege/weather NICHT; ocx/mafia kennen cortege/weather NICHT; NIEMAND kennt
 * WINDY (v7 exponiert keine API). Live bewiesen: CORTEGE -> MAFIA -> RADAR
 * hinterlässt 3 iframes im DOM (2 sichtbar, z=2147482900 übereinander) —
 * Folge: "Mapumschalten geht manchmal gar nicht mehr".
 *
 * Wirkung: capture-Click-Listener auf Modi-Buttons. Vor dem eigentlichen
 * Modus-Handler werden ALLE bestehenden Overlay-iframes geschlossen
 * (API.close() wenn vorhanden, sonst DOM-Entfernung — die Modi-Skripte
 * erzeugen ihre iframes on demand) und der WINDY-Zustand (versteckte
 * 2D/3D-Controls, localStorage, Button-State, Frame) restauriert.
 * Additiv: keine der bestehenden Dateien wird verändert; ohne Modi-Klick
 * ist der Guard inaktiv.
 *
 * 11.11.2026 (r1): (1) TESSERA-Modus (wm-postcard-mapmode.js) in APIS + SEL
 * aufgenommen. (2) REG-014-NACHTRAG: MAFIA/OCX nutzen eigene Link-Klassen
 * (wm-mafia-origin / wm-ocx-origin) mit inline z=61 — die r4-Zeile deckte
 * nur .wm-origin-link ab, deren Links blieben verdeckt hinter dem
 * Overlay-iframe (R4-z=2147482900). Jetzt bekommen beide Klassen ebenfalls
 * z=2147483000 !important.
 *
 * 11.11.2026 (r2): WID-Weltkarten-Modus (wm-wid-mapmode.js) in APIS + SEL
 * aufgenommen (Upstream X-Frame-Options: DENY → nginx-Proxy
 * /worldmapp/wid/ mit XFO/CSP-Strip).
 */
(function () {
  "use strict";

  var APIS = ["wmRadarMapmodeAPI", "wmSdrMapmodeAPI", "wmSporenMapmodeAPI",
              "wmOcindexMapmodeAPI", "wmMafiaMapmodeAPI", "wmCortegeMapmodeAPI",
              "wmWeatherMapmodeAPI", "wmGodseyeMapmodeAPI", "wmPostcardMapmodeAPI", "wmWidMapmodeAPI", "wmPulseMapmodeAPI"];

  function restoreWindy() {
    var hosts = document.querySelectorAll("[data-windy-prev-vis],[data-windy-prev-display],[data-windy-prev-display-p]");
    for (var i = 0; i < hosts.length; i++) {
      var h = hosts[i];
      try {
        if (h.hasAttribute("data-windy-prev-vis")) {
          h.style.visibility = h.getAttribute("data-windy-prev-vis");
          h.removeAttribute("data-windy-prev-vis");
        }
        if (h.hasAttribute("data-windy-prev-display")) {
          h.style.display = h.getAttribute("data-windy-prev-display");
          h.removeAttribute("data-windy-prev-display");
        }
        if (h.hasAttribute("data-windy-prev-display-p")) {
          h.style.display = h.getAttribute("data-windy-prev-display-p");
          h.removeAttribute("data-windy-prev-display-p");
        }
      } catch (e) { /* defensiv */ }
    }
    try { localStorage.removeItem("wm-windy-mode-on"); } catch (e) {}
    var onEls = document.querySelectorAll(".wm-windy-mode-on");
    for (var j = 0; j < onEls.length; j++) onEls[j].classList.remove("wm-windy-mode-on");
    var wb = document.getElementById("wmWindyModeBtn");
    if (wb) { wb.classList.remove("active"); wb.setAttribute("aria-pressed", "false"); }
    var wf = document.querySelectorAll(".wm-windy-mode-frame");
    for (var k = 0; k < wf.length; k++) wf[k].remove();
  }

  function closeAllOverlays() {
    for (var i = 0; i < APIS.length; i++) {
      try {
        var a = window[APIS[i]];
        if (a && typeof a.close === "function") a.close();
      } catch (e) { /* API-Fallback unten */ }
    }
    restoreWindy();
    var frames = document.querySelectorAll('iframe[id^="wm-"][id$="-embed"]');
    for (var j = 0; j < frames.length; j++) frames[j].remove();
  }

  var SEL = "[data-radarbtn],[data-sdrbtn],[data-sporenbtn],[data-ocindexbtn]," +
            "[data-godseyebtn],[data-mafiabtn],[data-cortegebtn],[data-weatherbtn],[data-windybtn],[data-windymodebtn],[data-postcardbtn],[data-widbtn],[data-pulsebtn]";

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest(SEL);
    if (!btn && e.target.id === "wmWindyModeBtn") btn = e.target;
    if (!btn) return;
    closeAllOverlays();
  }, true);

  window.__wmMapmodeGuard = { version: "20261111-r3" };

  /* REG-013b: Das r36-Mapbar-Menue (#wm-maps-toggle + aufgeklapptes
   * #mapDimensionToggle) muss UEBER den Modi-Overlay-iframes liegen — die
   * exit-dashboard.css R4-Regel haemmert alle wm-*-embed iframes auf
   * z=2147482900 !important. Das Menue lebt im Stacking-Kontext
   * .map-header-actions (z=1400) — gegen 2147482900 wertlos. Fix: der
   * Kontext selbst hoeher (die R4-Intention "iframes UNTER der Toolbar"
   * wurde nur zur Haelfte umgesetzt). */
  try {
    var st = document.createElement("style");
    st.id = "wm-mapmode-guard-styles";
    st.textContent =
      ".map-header-actions{z-index:2147483500 !important;}" +
      "#wm-maps-toggle{position:relative;z-index:2147483500 !important;}" +
      "#mapDimensionToggle{position:relative;z-index:2147483500 !important;}" +
      ".wm-origin-link{z-index:2147483000 !important;}" +
      ".wm-mafia-origin,.wm-ocx-origin{z-index:2147483000 !important;}" +
      ".wm-windy-mode-link,.wm-windy-mode-links{z-index:2147483000 !important;}";
    (document.head || document.documentElement).appendChild(st);
  } catch (e) { /* defensiv */ }
})();

/* 11.11.2026 (r3): PULSE-Kartenmodus (wm-pulse-mapmode.js, pulse.climate.copernicus.eu/embed/map — frame-ancestors *, kein Proxy noetig) in APIS + SEL aufgenommen. */
