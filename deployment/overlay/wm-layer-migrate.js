/* wm-layer-migrate v1 (2026-10-18): hebt VERALTETE gespeicherte Layer-Zustaende auf die
   neuen Daten-Layer-Defaults an. Laeuft GENAU EINMAL pro Browser (Flag in localStorage).
   - Nur wenn worldmonitor-layers existiert und aelter ist als MIG_VERSION.
   - Setzt nur Layer, die vorher WERKS-AUS waren (User konnte sie nicht bewusst ausschalten):
     satellites, fires, protests, cables, gpsJamming, tradeRoutes, minerals, climate
   - Der Rest des gespeicherten Zustands bleibt unberuehrt. */
(function () {
  if (window.__wmLayerMigrate) return;
  window.__wmLayerMigrate = true;
  var MIG_KEY = 'wm-layer-defaults-migrated';
  var MIG_VERSION = '20261018-1';
  try {
    if (localStorage.getItem(MIG_KEY) === MIG_VERSION) return;
    var raw = localStorage.getItem('worldmonitor-layers');
    if (raw) {
      var st;
      try { st = JSON.parse(raw); } catch (e) { st = null; }
      if (st && typeof st === 'object') {
        // Daten-Layer, die ab jetzt Default-AN sind (vorher Werks-AUS):
        var promote = ['satellites', 'fires', 'protests', 'cables', 'gpsJamming', 'tradeRoutes', 'minerals', 'climate'];
        var changed = [];
        for (var i = 0; i < promote.length; i++) {
          var k = promote[i];
          if (k in st && st[k] === false) { st[k] = true; changed.push(k); }
        }
        if (changed.length) {
          localStorage.setItem('worldmonitor-layers', JSON.stringify(st));
        }
      }
    }
    localStorage.setItem(MIG_KEY, MIG_VERSION);
  } catch (e) { /* private mode etc. */ }
})();
