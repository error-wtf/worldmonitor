/* OSM-Overlay Erweiterung: AURORA-Layer (NOAA SWPC Ovation, keyless).
   Zeichnet die Aurora-Wahrscheinlichkeit als halbtransparente GeoJSON-Füllflächen
   (eine pro grid-punkt, quad 2°x2°, farbe nach wahrscheinlichkeit).
   Aktualisierung: alle 10 min. auto-hide auf der nachtseite? nein — aurora IST nacht. */
(function(){
  if (window.__wmAuroraLayer) return;
  window.__wmAuroraLayer = true;
  var LAYER_ID = 'wm-aurora-fill';
  var SRC_ID = 'wm-aurora-src';
  function fcFromGrid(coords){
    var feats = [];
    coords.forEach(function(c){
      var lon = c[0], lat = c[1], prob = c[2];
      if (prob < 8) return; // nur relevante wahrscheinlichkeiten
      var col = prob > 40 ? 'rgba(0,255,140,.55)' : prob > 20 ? 'rgba(60,220,140,.38)' : 'rgba(120,200,160,.22)';
      feats.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[lon-1, lat-0.5],[lon+1, lat-0.5],[lon+1, lat+0.5],[lon-1, lat+0.5],[lon-1, lat-0.5]]] },
        properties: { prob: prob, color: col }
      });
    });
    return { type: 'FeatureCollection', features: feats };
  }
  function push(host, fc){
    try {
      var src = host.mapInstance.getSource(SRC_ID);
      if (src) { src.setData(fc); return; }
      host.mapInstance.addSource(SRC_ID, { type: 'geojson', data: fc });
      host.mapInstance.addLayer({
        id: LAYER_ID, type: 'fill', source: SRC_ID,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 1 },
        layout: { visibility: 'none' }  // default aus, checkbox im osm-panel aktiviert
      });
      // checkbox im OSM-Panel ergänzen (retry bis panel da):
      var panel = document.getElementById('wm-osm-panel');
      if (!panel) {
        setTimeout(function(){ push(host, fc); }, 4000);
        return;
      }
      if (!document.getElementById('wm-aurora-cb')) {
        var row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;cursor:pointer;';
        row.innerHTML = '<input type="checkbox" id="wm-aurora-cb"> <span style="color:#00ff8c">●</span> <span style="color:#cfeee8">Aurora (NOAA)</span>';
        var search = panel.querySelector('input');
        if (search && search.parentElement) search.parentElement.parentElement.insertBefore(row, search.parentElement.nextSibling);
        else panel.appendChild(row);
        var cb = row.querySelector('input');
        cb.addEventListener('change', function(){
          try {
            var ly = host.mapInstance.getLayer(LAYER_ID);
            if (ly) host.mapInstance.setLayoutProperty(LAYER_ID, 'visibility', cb.checked ? 'visible' : 'none');
          } catch(e){}
        });
      }
    } catch(e) { console.warn('[aurora]', e.message); }
  }
  function load(host){
    fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json')
      .then(function(r){ return r.json(); })
      .then(function(d){ if (d && d.coordinates) push(host, fcFromGrid(d.coordinates)); })
      .catch(function(){});
  }
  var iv = setInterval(function(){
    var host = window.__wmMapHost;
    if (host && host.mapInstance) {
      clearInterval(iv);
      load(host);
      setInterval(function(){ load(host); }, 600000); // 10 min
    }
  }, 3000);
})();
