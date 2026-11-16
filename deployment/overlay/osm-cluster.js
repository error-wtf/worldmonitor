/* v15-Erweiterung: POI-CLUSTERING bei weitzoom (zoom < 6).
   maplibre GeoJSON-source mit cluster:true + cluster-count-layer.
   Die pin-layer bleiben, werden aber erst ab zoom 6 sichtbar — davor clusters. */
(function () {
  function patch() {
    var host = window.__wmMapHost;
    if (!host || !host.mapInstance) return setTimeout(patch, 2000);
    var map = host.mapInstance;
    if (map.__wmClusterPatched) return;
    map.__wmClusterPatched = true;

    var src = map.getSource('wm-osm-v15');
    if (!src) return setTimeout(patch, 3000);

    // source auf clustering umstellen (geojson source neu anlegen ist nötig):
    try {
      var data = src._data || null;
      map.removeSource('wm-osm-v15');
      map.addSource('wm-osm-v15', {
        type: 'geojson',
        data: data,
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 45
      });
      // cluster-kreise + counts:
      if (!map.getLayer('wm-clusters')) {
        map.addLayer({
          id: 'wm-clusters', type: 'circle', source: 'wm-osm-v15',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': 'rgba(0,229,255,0.18)',
            'circle-stroke-color': 'rgba(0,229,255,0.55)',
            'circle-stroke-width': 1.5,
            'circle-radius': ['step', ['get', 'point_count'], 12, 50, 18, 200, 26]
          }
        });
        map.addLayer({
          id: 'wm-cluster-count', type: 'symbol', source: 'wm-osm-v15',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 11, 'text-font': ['Noto Sans Regular']
          },
          paint: { 'text-color': '#00e5ff' }
        });
      }
      // pins nur ab zoom 6 (davor clusters):
      ['wm-poi-pins', 'wm-poi-labels'].forEach(function (id) {
        if (map.getLayer(id)) map.setLayerZoomRange(id, 6, 24);
      });
      // klick auf cluster → zoom rein:
      map.on('click', 'wm-clusters', function (e) {
        var f = map.queryRenderedFeatures(e.point, { layers: ['wm-clusters'] })[0];
        if (!f) return;
        map.easeTo({ center: f.geometry.coordinates, zoom: map.getZoom() + 2.5, duration: 600 });
      });
      var hover = function () { map.getCanvas().style.cursor = 'pointer'; };
      var out = function () { map.getCanvas().style.cursor = ''; };
      map.on('mouseenter', 'wm-clusters', hover);
      map.on('mouseleave', 'wm-clusters', out);
      console.log('[wm] POI-clustering aktiv (zoom<6 clusters, ab 6 pins)');
    } catch (e) { console.warn('[wm-cluster]', e.message); }
  }
  patch();
})();
