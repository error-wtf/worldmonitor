/* OSM-Overlay Erweiterung: RainViewer Live-Regenradar als Karten-Overlay.
   Keyless, aktualisiert alle 10 min, checkbox im OSM-Panel.
   Radar nativ bis z7; MapLibre ueberzoomt es ohne den Kartenzoom zu begrenzen. */
(function () {
  if (window.__wmRainLayer) return;
  window.__wmRainLayer = true;
  var LAYER = 'wm-rain-radar';
  var SRC = 'wm-rain-src';

  function push(host, frame) {
    try {
      var url = host.tileTemplate;
      var src = host.mapInstance.getSource(SRC);
      if (src) { src.setTiles([url]); return; }
      host.mapInstance.addSource(SRC, { type: 'raster', tiles: [url], tileSize: 256, maxzoom: 7, attribution: 'RainViewer' });
      host.mapInstance.addLayer({
        id: LAYER, type: 'raster', source: SRC,
        paint: { 'raster-opacity': 0.55 },
        layout: { visibility: 'none' }
      });
      var panel = document.getElementById('wm-osm-panel');
      var add = function () {
        var panel2 = document.getElementById('wm-osm-panel');
        if (!panel2) { setTimeout(add, 3000); return; }
        if (document.getElementById('wm-rain-cb')) return;
        var row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;cursor:pointer;';
        row.innerHTML = '<input type="checkbox" id="wm-rain-cb"> <span style="color:#3498db">●</span> <span style="color:#cfeee8">Regen-Radar (live)</span>';
        var cbRow = document.getElementById('wm-aurora-cb');
        if (cbRow && cbRow.parentElement) cbRow.parentElement.insertAdjacentElement('afterend', row);
        else panel2.appendChild(row);
        row.querySelector('input').addEventListener('change', function (ev) {
          try {
            var ly = host.mapInstance.getLayer(LAYER);
            if (ly) host.mapInstance.setLayoutProperty(LAYER, 'visibility', ev.target.checked ? 'visible' : 'none');
          } catch (e) {}
        });
      };
      add();
    } catch (e) { console.warn('[rain]', e.message); }
  }

  function load(host) {
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var past = d.radar && d.radar.past;
        if (!past || !past.length) return;
        var latest = past[past.length - 1];
        host.tileTemplate = d.host + latest.path + '/256/{z}/{x}/{y}/2/1_1.png';
        push(host, latest);
      })
      .catch(function () {});
  }

  var iv = setInterval(function () {
    var host = window.__wmMapHost;
    if (host && host.mapInstance) {
      clearInterval(iv);
      load(host);
      setInterval(function () { load(host); }, 600000);
    }
  }, 3000);
})();
