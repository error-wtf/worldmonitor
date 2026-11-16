// wm-layerpanel-fix v4 (12.10.2026, operator-Screenshot 05:45): Collapse liess das
// Panel als volle-Hoehe-Schwarzflaeche ueber der Karte stehen.
// Ursache: v2/v3 verankern .layer-toggles per !important an top:46px UND
// bottom:40px. Der Collapse-Handler im Bundle versteckt nur Liste+Suchfeld
// (display:none), das Panel-DIV behaelt durch die bottom-Verankerung seine
// volle Hoehe -> leere schwarze Flaeche ueber die ganze Karte.
// v4: Capture-Listener auf .toggle-collapse setzt Klasse .wm-lp-collapsed am
// Panel; CSS hebt dann bottom/overflow/padding auf (Panel schrumpft auf den
// Header). Funktioniert sowohl fuer GlobeMap- (.deckgl-layer-toggles) als
// auch SVG-Fallback-Panel. Idempotent, ersetzt v3 (Regeln uebernommen).
(function () {
  if (document.getElementById("wm-layerpanel-fix")) return;
  const css = `
    .layer-toggles-panel, [class*="layer-panel"], [class*="layersPanel"] {
      background: rgba(8, 10, 14, 0.97) !important;
      backdrop-filter: none !important;
    }
    .layer-toggles, [class*="layer-list"], [class*="layerToggles"] {
      position: absolute !important;
      top: 46px !important;
      bottom: 40px !important;
      left: 10px !important;
      max-height: calc(100% - 90px) !important;
      overflow-y: auto !important;
      overscroll-behavior: contain !important;
      padding-bottom: 34px !important;
    }
    /* v4: eingeklappt = Panel schrumpft auf den Header (kein bottom-Anker) */
    .layer-toggles.wm-lp-collapsed {
      bottom: auto !important;
      max-height: none !important;
      overflow: visible !important;
      overflow-y: visible !important;
      padding-bottom: 0 !important;
    }
    .layer-toggles .toggle-list {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      max-height: none !important;
    }
    .map-author-badge {
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      background: rgba(8, 10, 14, 0.97) !important;
      z-index: 2 !important;
    }
    .layer-toggles.wm-lp-collapsed .map-author-badge { display: none !important; }
  `;
  const st = document.createElement("style");
  st.id = "wm-layerpanel-fix";
  st.textContent = css;
  document.head.appendChild(st);

  function syncCollapsed() {
    document.querySelectorAll(".layer-toggles").forEach(function (el) {
      // v4.1+ (17.10.): Panels unter Verwaltung von wm-layerpanel-all-none
      // v4.2 (data-wm-lp42) SKIPPEN — sonst entfernt dieses Intervall die
      // erzwungene wm-lp-collapsed-Klasse im 1,5s-Takt = Klassen-Kampf,
      // Panel springt wieder auf / flackert.
      if (el.hasAttribute("data-wm-lp42")) return;
      const list = el.querySelector(".toggle-list");
      const collapsed = !!list && getComputedStyle(list).display === "none";
      el.classList.toggle("wm-lp-collapsed", collapsed);
    });
  }
  // Capture-Phase: laeuft VOR dem Bundle-Handler, dessen display-Toggle aber
  // erst danach gilt -> nach dem Klick per setTimeout nachsyncen.
  document.addEventListener("click", function (e) {
    const t = e.target;
    if (t && t.closest && t.closest(".toggle-collapse")) {
      setTimeout(syncCollapsed, 0);
    }
  }, true);
  // Initialer Zustand + Absicherung gegen spaetere DOM-Updates:
  setInterval(syncCollapsed, 1500);
  syncCollapsed();
})();
