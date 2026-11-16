/* 26.10.: 2D-OSM-Rendering uebernimmt osm-overlay.js (pushNativeLayers -
   gecluster't, direkt an state.all gekoppelt). No-Op-Stumpf gegen 404;
   raeumt evt. alte Doppel-Layer der v15 auf. */
(function () {
  'use strict';
  function cleanup() {
    try {
      var m = (window.__wmMapHost || {}).mapInstance;
      if (!m || !m.getSource) return;
      ['wm-poi-clusters','wm-poi-cluster-count','wm-pipe-outline','wm-pipe-core','wm-poi-pins','wm-poi-labels'].forEach(function (id) {
        try { if (m.getLayer(id)) m.removeLayer(id); } catch (e) {}
        try { if (m.getSource(id)) m.removeSource(id); } catch (e) {}
      });
      try { if (m.getSource('wm-osm-v15')) m.removeSource('wm-osm-v15'); } catch (e) {}
    } catch (e) {}
  }
  if (document.readyState === 'complete') setTimeout(cleanup, 3000);
  else window.addEventListener('load', function () { setTimeout(cleanup, 3000); });
})();
