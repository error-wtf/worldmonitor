/* OSM-Overlay Erweiterung: NASA EONET natural events (keyless).
   Waldbrände, Stürme, Vulkane, Überschwemmungen als pulsierende pins. */
(function () {
  if (window.__wmEonetLayer) return;
  window.__wmEonetLayer = true;
  var LAYER = 'wm-eonet', SRC = 'wm-eonet-src';
  var CAT_COLORS = {
    'Wildfires': '#ff5722', 'Severe Storms': '#03a9f4', 'Volcanoes': '#e91e63',
    'Sea and Lake Ice': '#4fc3f7', 'Floods': '#3f51b5', 'Drought': '#ffb300',
    'Dust and Haze': '#bdb76b', 'Earthquakes': '#d32f2f', 'Landslides': '#795548',
    'Snow': '#e0e0e0', 'Manmade': '#f06292'
  };

  function fc(events) {
    var feats = [];
    events.forEach(function (e) {
      var g = e.geometry && e.geometry[e.geometry.length - 1];
      if (!g || !g.coordinates) return;
      var cat = (e.categories && e.categories[0] && e.categories[0].title) || 'Manmade';
      feats.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: g.coordinates.slice(0, 2) },
        properties: { name: e.title || '', cat: cat, color: CAT_COLORS[cat] || '#ff9800', date: (g.date || '').slice(0, 10) }
      });
    });
    return { type: 'FeatureCollection', features: feats };
  }

  function push(host, data) {
    try {
      var src = host.mapInstance.getSource(SRC);
      if (src) { src.setData(data); return; }
      host.mapInstance.addSource(SRC, { type: 'geojson', data: data });
      host.mapInstance.addLayer({
        id: LAYER, type: 'circle', source: SRC,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4, 8, 9],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': 'rgba(255,255,255,.75)',
          'circle-stroke-width': 1.4,
          'circle-opacity': 0.88
        },
        minzoom: 2
      });
      host.mapInstance.on('click', LAYER, function (e) {
        var f = e.features[0]; if (!f) return;
        var p = f.properties;
        if (window.maplibregl) {
          new maplibregl.Popup({ closeButton: true, offset: 10 })
            .setLngLat(f.geometry.coordinates)
            .setHTML('<div style="font:11px/1.4 monospace;color:#e8f4f0;background:#0a0e0c;padding:6px 8px;border-radius:4px;min-width:170px"><b style="color:' + p.color + '">' + p.cat + '</b><br>' + p.name + (p.date ? '<br><span style="color:#7f95a3">' + p.date + '</span>' : '') + '</div>')
            .addTo(e.target);
        }
      });
      var cur = function () { host.mapInstance.getCanvas().style.cursor = 'pointer'; };
      host.mapInstance.on('mouseenter', LAYER, cur);
      host.mapInstance.on('mouseleave', LAYER, function () { host.mapInstance.getCanvas().style.cursor = ''; });
    } catch (e) { console.warn('[eonet]', e.message); }
  }

  function load(host) {
    fetch('https://eonet.gsfc.nasa.gov/api/v3/events?limit=80&days=30&status=open')
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.events) push(host, fc(d.events)); })
      .catch(function () {});
  }

  var iv = setInterval(function () {
    var host = window.__wmMapHost;
    if (host && host.mapInstance) {
      clearInterval(iv);
      load(host);
      setInterval(function () { load(host); }, 900000);
    }
  }, 3000);
})();
