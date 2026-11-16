#!/usr/bin/env node
/* osm-overlay.js v3 — native bridge edition.
 * 3D (Globe): self-disable — GlobeMap renders OSM natively via setOsmPois.
 * 2D (Deck/SVG flat): use window.__wmMapHost.project (real maplibre projection,
 *    zoom/pan/center aware) instead of fixed equirectangular math.
 * Fallback: if no bridge, old equirect math (better than nothing).
 */
(function () {
  if (window.__wmOsmOverlay) return;
  window.__wmOsmOverlay = true;

  var KIND_STYLE = {
    protests: { color: '#ff9f43', label: 'Proteste', emoji: '\uD83D\uDCE2' },
    power:    { color: '#f39c12', label: 'Kraftwerke', emoji: '\u26A1' },
    hospitals:{ color: '#e74c3c', label: 'Krankenhäuser', emoji: '\uD83C\uDFE5' },
    refugee:  { color: '#9b59b6', label: 'Flüchtlingslager', emoji: '\uD83C\uDFD5' },
    military: { color: '#7f8c8d', label: 'Militär-Basen', emoji: '\uD83C\uDF96\uFE0F' },
    airports: { color: '#3498db', label: 'Flughäfen', emoji: '\u2708\uFE0F' },
    ports:    { color: '#1abc9c', label: 'Häfen', emoji: '\u2693' },
    pipelines:{ color: '#e67e22', label: 'Pipelines', emoji: '\uD83D\uDEE2\uFE0F' }, // = v15 pin-farbe
    dams:     { color: '#2ecc71', label: 'Staudämme', emoji: '\uD83C\uDF0A' },
    nuclear:  { color: '#e67e22', label: 'Nuklearanlagen', emoji: '\u2622\uFE0F' },
    stadiums: { color: '#e91e63', label: 'Stadien', emoji: '\uD83C\uDFDF\uFE0F' },
    radio:    { color: '#8e44ad', label: 'Rundfunk', emoji: '\uD83D\uDCFB' },
    shopping: { color: '#ff7043', label: 'Einkaufszentren', emoji: '\uD83D\uDED2' },
    lighthouses:{ color: '#ffd54f', label: 'Leuchttürme', emoji: '\uD83D\uDDFC' },
    universities:{ color: '#3f51b5', label: 'Universitäten', emoji: '\uD83C\uDF93' },
    research: { color: '#00bcd4', label: 'Forschung', emoji: '\uD83D\uDD2C' },
    border:   { color: '#95a5a6', label: 'Grenzübergänge', emoji: '\uD83D\uDEC2' },
    search:   { color: '#00e5ff', label: 'Ortssuche', emoji: '\uD83D\uDCCD' },
  };

  function el(tag) { return document.createElement(tag); }
  function on(el, ev, fn) { el.addEventListener(ev, fn); }

  var DATA_URL = '/worldmapp/data/osm-pois.json';
  var RELAY = 'http://127.0.0.1:46133';
  // 27.10. FIX: startansicht BEIM LADEN einfrieren — die app schreibt die
// url waehrend der globus-rotation um (lon wandert!), ein spaeteres Lesen
// der url liefert die verdrehte position.
window.__wmOsmBootView = (function () {
  try {
    var u = new URLSearchParams(location.search);
    var la = parseFloat(u.get('lat'));
    var lo = parseFloat(u.get('lon'));
    return (isNaN(la) || isNaN(lo)) ? null : { lat: la, lng: lo };
  } catch (e) { return null; }
})();
var state = { all: [], visible: {}, host: null, layer: null, bridge: false, lastBoundsKey: '' };
  try { window.__wmOsmState = state; } catch (e) {}

  function findMapHost() {
    // host muss SICHTBAR sein (width>0) — .map-wrapper ist im svg-mode 0x0
    var cands = ['.map-section', '.map-wrapper', '[class*="map-container"]'];
    for (var i = 0; i < cands.length; i++) {
      var e = document.querySelector(cands[i]);
      if (e && e.getBoundingClientRect().width > 100) return e;
    }
    var c = document.querySelector('canvas');
    if (c && c.getBoundingClientRect().width > 100) return c.parentElement || c;
    return null;
  }

  function isGlobeMode() {
    // GlobeMap renders the OSM layer natively — overlay must not double-draw.
    return !!document.querySelector('.globe-mode, [class*="globe-mode"]');
  }

  function ensureLayer(host) {
    if (!state.layer) {
      var l = el('div');
      l.id = 'wm-osm-layer';
      l.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:55;';
      host.appendChild(l);
      state.layer = l;
    }
    return state.layer;
  }

  function project(lat, lon, W, H) {
    var host = window.__wmMapHost;
    if (host && typeof host.project === 'function') {
      var pt = host.project(lon, lat);
      if (pt) return { x: pt.x, y: pt.y, ok: true };
    }
    // fallback: equirect (nur korrekt in voller weltansicht)
    var x = ((lon + 180) / 360) * W;
    var s = Math.sin(lat * Math.PI / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * H;
    return { x: x, y: y, ok: false };
  }

  function mkMarker(lat, lon, color, title) {
    var d = el('div');
    d.className = 'wm-osm-marker';
    d.title = title;
    d.style.cssText = 'position:absolute;width:7px;height:7px;border-radius:50%;' +
      'background:' + color + ';border:1px solid rgba(255,255,255,.6);' +
      'opacity:.85;transform:translate(-50%,-50%);z-index:60;pointer-events:auto;cursor:default;';
    d.dataset.lat = lat; d.dataset.lon = lon;
    return d;
  }

  // --- native maplibre layers (kein DOM-drift: gerendert IN der map) ---
  function pushNativeLayers() {
    // 27.10. FIX: leeres visible (globe-boot ohne sync) -> defaults an.
    // Nur bei KOMPLETT fehlenden Keys greifen (absichtliches Alles-Aus bleibt aus).
    if (!state.visible || Object.keys(state.visible).length === 0) {
      state.visible = {};
      Object.keys(KIND_STYLE).forEach(function (k3) { state.visible[k3] = true; });
    }
    var host = window.__wmMapHost;
    if (!host || !host.addGeoJSONLayer) {
      // KEIN DOM-dot-fallback mehr (operator: dots driften bei zoom + sehen scheiße).
      // Rendering gehört osm-native-v15.js — es wartet selbst auf die map.
      state.layer.querySelectorAll('.wm-osm-marker').forEach(function (m) { m.remove(); });
      return;
    }
    var points = [], lines = [];
    state.all.forEach(function (p) {
      if (!state.visible[p.kind]) return;
      if (p.line && Array.isArray(p.line)) {
        lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: p.line }, properties: { kind: p.kind, name: p.name || '' } });
      } else {
        points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { kind: p.kind, name: p.name || '' } });
      }
    });
    var fc = { type: 'FeatureCollection', features: points };
    var fcLines = { type: 'FeatureCollection', features: lines };
    var matchExpr = ['match', ['get', 'kind']];
    Object.keys(KIND_STYLE).forEach(function (k) { matchExpr.push(k, KIND_STYLE[k].color); });
    matchExpr.push('#8a9aa8');
    if (lines.length) {
      host.addGeoJSONLayer('wm-osm-pois-lines', fcLines, {
        type: 'line',
        paint: {
          'line-color': '#e67e22',
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 8, 2],
          'line-opacity': 0.75
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' }
      });
    }
    // geclusterter source (maplibre-native clustering):
    try {
      var src = host.mapInstance.getSource('wm-osm-pois-src');
      if (src) {
        src.setData(fc);
        // 28.10.: emoji-symbol-layer nachziehen falls er fehlt (hot session/restore)
        try { ensureOsmEmojiLayers(host.mapInstance); } catch (eEm2) {}
      }
      else {
        host.mapInstance.addSource('wm-osm-pois-src', {
          type: 'geojson', data: fc,
          cluster: true, clusterRadius: 34, clusterMaxZoom: 7
        });
        // cluster-bubbles:
        host.mapInstance.addLayer({
          id: 'wm-osm-clusters', type: 'circle', source: 'wm-osm-pois-src',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#0a0e0c', 'circle-opacity': 0.8,
            'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(0,229,255,.5)',
            'circle-radius': ['step', ['get', 'point_count'], 10, 20, 15, 100, 22]
          }
        });
        host.mapInstance.addLayer({
          id: 'wm-osm-cluster-count', type: 'symbol', source: 'wm-osm-pois-src',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] },
          paint: { 'text-color': '#00e5ff' }
        });
        // einzel-punkte (unclustered):
        // 30.10. (operator: 'symbole statt farben'): der circle-layer bleibt NUR als
        // unsichtbare Klick-/Hit-Flaeche fuer die popups (map.on('click',
        // 'wm-osm-pois')) — opacity 0, kein stroke. Sichtbar ist das emoji.
        host.mapInstance.addLayer({
          id: 'wm-osm-pois', type: 'circle', source: 'wm-osm-pois-src',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 8, 8, 12, 11],
            'circle-color': matchExpr,
            'circle-stroke-width': 0,
            'circle-stroke-color': 'rgba(255,255,255,.55)',
            'circle-opacity': 0
          }
        });
        // 28.10. (operator): kategorie-emoji je punkt — symbol statt nur farbe.
        try { ensureOsmEmojiLayers(host.mapInstance); } catch (eEm) { console.warn('[osm-overlay] emoji layer fail', eEm); }
        // 27.10. (operator): permanente labels ENTFERNT — zu ueberladen.
        // Der name steht im klick-popup (direkter DOM-listener unten).
        // 27.10.: kein auto-zoom mehr beim cluster-klick (operator: 'bloeder zoom')
        // — aufschluesselung + kontrollierter zoom macht der direkte
        // DOM-listener unten (1. klick info, 2. klick zoom).
        host.mapInstance.on('mouseenter', 'wm-osm-clusters', function () { host.mapInstance.getCanvas().style.cursor = 'pointer'; });
        host.mapInstance.on('mouseleave', 'wm-osm-clusters', function () { host.mapInstance.getCanvas().style.cursor = ''; });
      }
      var ok = true;
    } catch (eL) { console.warn('[osm-overlay] native cluster fail', eL); var ok = false; }
    // 27.10. FIX 2: window.maplibregl ist im bundle NICHT global — alle
    // maplibregl.Popup-Pfade offen still. Eigenes DOM-popup statt dessen.
    function closeOsmPopup(m) {
      if (m.__wmOsmPopupBox && m.__wmOsmPopupBox.parentNode) m.__wmOsmPopupBox.parentNode.removeChild(m.__wmOsmPopupBox);
      m.__wmOsmPopupBox = null;
    }
    function showOsmPopup(m, lngLat, html) {
      closeOsmPopup(m);
      var pt = m.project(lngLat);
      var box = document.createElement('div');
      box.className = 'wm-osm-popup';
      box.style.cssText = 'position:absolute;z-index:9;left:' + Math.round(pt.x) + 'px;top:' + Math.round(pt.y) + 'px;transform:translate(-50%,-115%);font:11px/1.5 monospace;color:#cfeee8;background:#0a0e0c;border:1px solid rgba(0,229,255,.4);border-radius:4px;padding:7px 22px 7px 9px;max-width:240px;box-shadow:0 4px 14px rgba(0,0,0,.5);pointer-events:auto';
      box.innerHTML = html + '<div data-wm-osm-close role="button" aria-label="Schliessen" style="position:absolute;top:0;right:0;width:28px;height:28px;line-height:28px;text-align:center;color:#9fb8ad;cursor:pointer;font-size:16px">×</div>';
      var cont = m.getCanvasContainer();
      if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative';
      cont.appendChild(box);
      box.querySelector('[data-wm-osm-close]').addEventListener('click', function (ev) { ev.stopPropagation(); closeOsmPopup(m); });
      m.__wmOsmPopupBox = box;
      m.once('movestart', function () { closeOsmPopup(m); });
    }
    // 30.10. FIX (r22): die document-capture-BINDUNG ist NIE HIER — pushNativeLayers
    // returnt im globe-mode frueh (kein __wmMapHost) und der klick-handler war
    // dann ungebunden (docBound=false, proteste klick-tot). Die bindung lebt
    // jetzt unten am IIFE-Ende (renderer-unabhaengig, einmalig via window-flag).
    if (ok && host.mapInstance && !host.mapInstance.__wmOsmPopupBound) {
      var map = host.mapInstance;
      map.__wmOsmPopupBound = true;
      map.on('click', 'wm-osm-pois', function (e) {
        var f = e.features && e.features[0];
        if (!f) return;
        var st = KIND_STYLE[f.properties.kind] || { label: f.properties.kind, color: '#8a9aa8' };
        if (window.maplibregl) {
          new maplibregl.Popup({ closeButton: false, offset: 8 })
            .setLngLat(f.geometry.coordinates)
            .setHTML('<div style="font:11px/1.4 monospace;color:#cfeee8;background:#0a0e0c;padding:6px 8px;border-radius:4px"><b style="color:' + st.color + '">' + (st.label || f.properties.kind) + '</b><br>' + (f.properties.name || '') + '</div>')
            .addTo(map);
        }
      });
      map.on('click', 'wm-osm-pois-lines', function (e) {
        var f = e.features && e.features[0];
        if (!f) return;
        var p = f.properties || {};
        if (window.maplibregl) {
          new maplibregl.Popup({ closeButton: false, offset: 8 })
            .setLngLat(e.lngLat)
            .setHTML('<div style="font:11px/1.4 monospace;color:#cfeee8;background:#0a0e0c;padding:6px 8px;border-radius:4px"><b style="color:#e67e22">Pipeline</b><br>' + (p.name || '') + (p.substance ? '<br>Substanz: ' + p.substance : '') + '</div>')
            .addTo(map);
        }
      });
      map.on('mouseenter', 'wm-osm-pois', function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'wm-osm-pois', function () { map.getCanvas().style.cursor = ''; });
    }
  }

  // === Regen-Radar + Aurora (30.10., operator): echte keyless-Layer ===
  // Die alten Checkboxen waren Dekoration ohne Handler; ZustandPersistenz fehlte.
  var RAIN_API = 'https://api.rainviewer.com/public/weather-maps.json';
  var AURORA_API = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
  function mi() { return window.__wmMapHost && window.__wmMapHost.mapInstance; }
  function layerStored(key, def) { try { var v = localStorage.getItem(key); return v === null ? def : v === '1'; } catch (e) { return def; } }
  function setRain(on) {
    var m = mi(); if (!m || !m.addSource) return;
    try {
      if (!on) {
        if (m.getLayer && m.getLayer('wm-rain-radar')) m.removeLayer('wm-rain-radar');
        if (m.getSource && m.getSource('wm-rain-src')) m.removeSource('wm-rain-src');
        return;
      }
      if (m.getSource && m.getSource('wm-rain-src')) return;
      fetch(RAIN_API).then(function (r) { return r.json(); }).then(function (d) {
        var frames = (d && d.radar && d.radar.past) || [];
        var f = frames[frames.length - 1];
        if (!f || !d.host) return;
        var url = d.host + f.path + '/256/6/{z}/{x}/{y}/2/1_1.png';
        m.addSource('wm-rain-src', { type: 'raster', tiles: [url], tileSize: 256, attribution: 'RainViewer' });
        m.addLayer({ id: 'wm-rain-radar', type: 'raster', source: 'wm-rain-src', paint: { 'raster-opacity': 0.55 } });
      }).catch(function (e) { console.warn('[osm-overlay] regenradar', e); });
    } catch (e) { console.warn('[osm-overlay] regenradar2', e); }
  }
  function setAurora(on) {
    var m = mi(); if (!m || !m.addSource) return;
    try {
      if (!on) {
        if (m.getLayer && m.getLayer('wm-aurora')) m.removeLayer('wm-aurora');
        if (m.getSource && m.getSource('wm-aurora-src')) m.removeSource('wm-aurora-src');
        return;
      }
      if (m.getSource && m.getSource('wm-aurora-src')) return;
      fetch(AURORA_API).then(function (r) { return r.json(); }).then(function (d) {
        var grid = (d && d.coordinates) || [];
        var feats = [];
        grid.forEach(function (row) {
          (row || []).forEach(function (cell) {
            if (cell && cell[2] >= 5) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [cell[0], cell[1]] }, properties: { prob: cell[2] } });
          });
        });
        var fc = { type: 'FeatureCollection', features: feats };
        if (m.getSource && m.getSource('wm-aurora-src')) { m.getSource('wm-aurora-src').setData(fc); return; }
        m.addSource('wm-aurora-src', { type: 'geojson', data: fc });
        m.addLayer({
          id: 'wm-aurora', type: 'circle', source: 'wm-aurora-src',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 9],
            'circle-color': ['interpolate', ['linear'], ['get', 'prob'], 5, '#2ecc71', 30, '#f1c40f', 60, '#e67e22', 90, '#e74c3c'],
            'circle-opacity': 0.45
          }
        });
      }).catch(function (e) { console.warn('[osm-overlay] aurora', e); });
    } catch (e) { console.warn('[osm-overlay] aurora2', e); }
  }
  window.__wmApplyOverlay = function (which, on) { (which === 'rain' ? setRain : setAurora)(on); };
  var __overlayBootDone = false;
  function applyStoredOverlays() {
    if (__overlayBootDone) return;
    if (!mi()) return;
    __overlayBootDone = true;
    if (layerStored('wm-layer-rain', true)) setRain(true);
    if (layerStored('wm-layer-aurora', true)) setAurora(true);
  }

  function relayout() {
    applyStoredOverlays();
    // Regen-Radar + Aurora + Live-Flugzeuge (keyless overlays) checkboxen:
    try {
      var extraRows = [
        { id: 'wm-rain-cb', label: 'Regen-Radar (live)', color: '#3498db', key: 'wm-layer-rain', fn: setRain, def: true },
        { id: 'wm-aurora-cb', label: 'Aurora (NOAA)', color: '#9b59b6', key: 'wm-layer-aurora', fn: setAurora, def: true },
        { id: 'wm-planes-cb', label: 'Flugzeuge (live)', color: '#f1c40f' }
      ];
      extraRows.forEach(function (r) {
        if (document.getElementById(r.id)) return;
        var row = el('label');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;';
        var cb = el('input');
        cb.type = 'checkbox'; cb.id = r.id;
        cb.checked = r.fn ? layerStored(r.key, r.def) : false;
        if (r.fn) {
          on(cb, 'change', function () {
            try { localStorage.setItem(r.key, cb.checked ? '1' : '0'); } catch (e2) {}
            r.fn(cb.checked);
          });
        }
        var dot = el('span');
        dot.style.cssText = 'width:9px;height:9px;border-radius:50%;background:' + r.color + ';display:inline-block;';
        var lbl = el('span');
        lbl.textContent = r.label;
        row.appendChild(cb); row.appendChild(dot); row.appendChild(lbl);
        panel.appendChild(row);
      });
    } catch (e) {}
    if (isGlobeMode()) { if (state.layer) state.layer.style.display = 'none'; return; }
    // globe-mode: panel bleibt sichtbar (toggles steuern native globe markers
    // via __wmGlobeSetOsm), nur der DOM-marker-layer ist versteckt.
    if (state.layer) state.layer.style.display = '';
    var host = state.host;
    if (!host || !state.layer || !host.isConnected) return;
    var r = host.getBoundingClientRect();
    state.layer.style.width = r.width + 'px';
    state.layer.style.height = r.height + 'px';
    var W = r.width, H = r.height;
    var markers = state.layer.querySelectorAll('.wm-osm-marker');
    var vis = 0;
    markers.forEach(function (m) {
      var lat = +m.dataset.lat, lon = +m.dataset.lon;
      var p = project(lat, lon, W, H);
      // offscreen -> hide (globe-rotation/zoom aware wenn bridge aktiv)
      var on = p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20;
      m.style.display = on ? '' : 'none';
      if (on) { m.style.left = p.x + 'px'; m.style.top = p.y + 'px'; vis++; }
    });
    var count = document.getElementById('wm-osm-count');
    if (count) count.textContent = vis + ' POIs sichtbar';
  }

  function rebuild() {
    if (!isGlobeMode()) { pushNativeLayersRetry(12); return; }
    if (!state.layer) return;
    state.layer.querySelectorAll('.wm-osm-marker').forEach(function (m) { m.remove(); });
  }
  // 26.10. FIX ('osm punkte werden nicht angezeigt' in 2D): das overlay rendert
  // selbst ueber die map-bridge (gecluster't, datengekoppelt) — die delegation
  // an osm-native-v15 starb still durch das bridge/install-race.
  /* kategorie-emoji je punkt: images + symbol-layer, idempotent (28.10.) */
  function ensureOsmEmojiLayers(m) {
    if (!m || !m.addLayer || m.getLayer('wm-osm-pois-emoji')) return;
    var emKeys = Object.keys(KIND_STYLE).filter(function (k2) { return k2 !== 'search' && KIND_STYLE[k2].emoji; });
    emKeys.forEach(function (k2) {
      var imgId = 'wm-osm-em-' + k2;
      if (m.hasImage(imgId)) return;
      var cv2 = document.createElement('canvas');
      cv2.width = 24; cv2.height = 24;
      var cx2 = cv2.getContext('2d');
      cx2.font = '15px serif';
      cx2.textAlign = 'center';
      cx2.textBaseline = 'middle';
      cx2.fillText(KIND_STYLE[k2].emoji, 12, 13);
      try { m.addImage(imgId, cx2.getImageData(0, 0, 24, 24)); } catch (eI) { console.warn('[osm-overlay] emoji image fail', k2, eI); }
    });
    var emMatch = ['match', ['get', 'kind']];
    emKeys.forEach(function (k2) { emMatch.push(k2, 'wm-osm-em-' + k2); });
    emMatch.push('');
    // FIX (30.10.): beforeId nur wenn die Ziellayer existieren — addLayer mit
    // fehlendem beforeId wirft und killte damit den ganzen Emoji-Layer.
    var beforeId = m.getLayer('wm-osm-cluster-count') ? 'wm-osm-cluster-count' : (m.getLayer('wm-osm-pois') ? 'wm-osm-pois' : undefined);
    m.addLayer({
      id: 'wm-osm-pois-emoji', type: 'symbol', source: 'wm-osm-pois-src',
      filter: ['!', ['has', 'point_count']],
      layout: { 'icon-image': emMatch, 'icon-size': 0.85, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-opacity': 1 }
    }, beforeId);
  }

  function pushNativeLayersRetry(tries) {
    if (window.__wmMapHost && window.__wmMapHost.addGeoJSONLayer) {
      try { pushNativeLayers(); } catch (e) { console.warn('[osm-overlay] native render fail', e); }
      return;
    }
    if (tries > 0) setTimeout(function () { pushNativeLayersRetry(tries - 1); }, 1500);
  }

  function buildPanel(host) {
    if (document.getElementById('wm-osm-panel')) return; // guard: kein doppelt-panel
    var panel = el('div');
    panel.id = 'wm-osm-panel';
    // RECHTER kartenrand = direkt neben der Exit-News-Spalte
    positionPanel(panel, host);
    var head = el('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';
    var headTitle = el('div');
    headTitle.textContent = 'OSM · OPENSTREETMAP-LAYER';
    headTitle.style.cssText = 'font-weight:700;letter-spacing:.08em;color:#00e5ff;';
    var closeBtn = el('button');
    closeBtn.textContent = '✕';
    closeBtn.title = 'OSM-Panel schließen (Knopf in der Kartenleiste öffnet wieder)';
    closeBtn.style.cssText = 'background:none;border:1px solid rgba(0,229,255,.3);color:#00e5ff;border-radius:4px;cursor:pointer;padding:1px 6px;font-size:11px;';
    on(closeBtn, 'click', function () { setPanelOpen(false, host); });
    head.appendChild(headTitle); head.appendChild(closeBtn);
    panel.appendChild(head);
    try { if (localStorage.getItem('wm-osm-panel-open') === '0') panel.style.display = 'none'; } catch (e) {}

    var count = el('div');
    count.id = 'wm-osm-count';
    count.style.cssText = 'color:#7fbfb5;margin-bottom:6px;';
    count.textContent = '0 POIs sichtbar';
    panel.appendChild(count);

    // operator (08.10.): Farblegende — welche Farbe = welche Kategorie.
    var legend = el('div');
    legend.id = 'wm-osm-legend';
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 10px;margin-bottom:8px;font-size:10px;color:#9fb8b3;pointer-events:none;';
    Object.keys(KIND_STYLE).forEach(function (k) {
      if (k === 'search') return;
      var item = el('span');
      item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;white-space:nowrap;';
      var emc = el('span');
      emc.style.cssText = 'font-size:10px;line-height:1;';
      if (KIND_STYLE[k].emoji) emc.textContent = KIND_STYLE[k].emoji;
      item.appendChild(emc);
      var dot = el('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + KIND_STYLE[k].color + ';display:inline-block;border:1px solid rgba(255,255,255,.5);';
      item.appendChild(dot);
      item.appendChild(document.createTextNode(KIND_STYLE[k].label));
      legend.appendChild(item);
    });
    panel.appendChild(legend);

    // 28.10. (operator): ALLES AN / ALLES AUS knoepfe fuer alle osm-kategorien
    var masterRow = document.createElement('div');
    masterRow.style.cssText = 'display:flex;gap:6px;margin:0 0 8px 0;';
    var setAllOsm = function (on) {
      Object.keys(KIND_STYLE).forEach(function (k) {
        if (k === 'search') return;
        var cbm = panel.querySelector('input[data-profile="' + k + '"]');
        if (cbm) cbm.checked = on;
        state.visible[k] = on;
      });
      try {
        var sumAll = 0;
        panel.querySelectorAll('.wm-osm-kind-count').forEach(function (s) {
          var cbx = panel.querySelector('input[data-profile="' + s.dataset.kind + '"]');
          if (cbx && cbx.checked) sumAll += parseInt(s.textContent, 10) || 0;
        });
        var cntAll = document.getElementById('wm-osm-count');
        if (cntAll) cntAll.textContent = on ? sumAll + ' POIs geladen (geclustert)' : 'OSM-Kategorien aus';
      } catch (e3) {}
      try { if (window.__wmGlobeSetOsm) window.__wmGlobeSetOsm(state.all, function (kind) { return !!state.visible[kind]; }); } catch (e4) {}
      try { rebuild(); } catch (e5) {}
    };
    var mkMasterBtn = function (label, on) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'flex:1;background:#0a1210;border:1px solid rgba(0,229,255,.3);color:#cfeee8;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:11px;';
      b.addEventListener('click', function () { setAllOsm(on); });
      return b;
    };
    masterRow.appendChild(mkMasterBtn('Alles an', true));
    masterRow.appendChild(mkMasterBtn('Alles aus', false));
    panel.appendChild(masterRow);

    Object.keys(KIND_STYLE).forEach(function (k) {
      if (k === 'search') return;
      var row = el('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;';
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.profile = k;
      cb.style.accentColor = KIND_STYLE[k].color;
      var emr = el('span');
      emr.style.cssText = 'font-size:10px;line-height:1;';
      if (KIND_STYLE[k].emoji) emr.textContent = KIND_STYLE[k].emoji; else emr.style.display = 'none';
      var dot = el('span');
      dot.style.cssText = 'width:9px;height:9px;border-radius:50%;background:' + KIND_STYLE[k].color + ';display:inline-block;';
      var lbl = el('span');
      lbl.textContent = KIND_STYLE[k].label;
      var cnt = el('span');
      cnt.className = 'wm-osm-kind-count';
      cnt.dataset.kind = k;
      cnt.style.cssText = 'color:#7f95a3;margin-left:auto;padding-left:8px;';
      cnt.textContent = '0';
      row.appendChild(cb); row.appendChild(emr); row.appendChild(dot); row.appendChild(lbl); row.appendChild(cnt);
      panel.appendChild(row);
      // 27.10. FIX ('punkte werden nur aufgelistet'): visible Sofort-Init je
      // checkbox — im globe-boot lief die sync in loadOsmData nie (early-return),
      // visible blieb leer -> 2D-Render baute 0 Punkte.
      state.visible[k] = cb.checked;
        on(cb, 'change', function () {
        state.visible[k] = cb.checked;
        try {
          var cntEl = document.getElementById('wm-osm-count');
          if (cntEl && cntEl.textContent.indexOf('geladen') >= 0) {
            var sum2 = 0;
            panel.querySelectorAll('.wm-osm-kind-count').forEach(function (s) {
              var cbx = panel.querySelector('input[data-profile="' + s.dataset.kind + '"]');
              if (cbx && cbx.checked) sum2 += parseInt(s.textContent, 10) || 0;
            });
            cntEl.textContent = sum2 + ' POIs geladen (geclustert)';
          }
        } catch (e2) {}
        // Globe: native markers neu setzen (kind-filter via callback)
        if (window.__wmGlobeSetOsm) window.__wmGlobeSetOsm(state.all, function (kind) { return !!state.visible[kind]; });
        rebuild();
      });
    });

    // Suchfeld (Nominatim via relay)
    var searchWrap = el('div');
    searchWrap.style.cssText = 'display:flex;gap:4px;margin-top:8px;';
    var inp = el('input');
    inp.placeholder = 'Ort suchen (z.B. Frankfurt)';
    inp.style.cssText = 'flex:1;background:#0a1210;border:1px solid rgba(0,229,255,.3);color:#cfeee8;padding:3px 6px;border-radius:4px;';
    var btn = el('button');
    btn.textContent = 'Suchen';
    btn.style.cssText = 'background:#00e5ff;color:#04211c;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-weight:700;';
    searchWrap.appendChild(inp); searchWrap.appendChild(btn);
    panel.appendChild(searchWrap);
    var sres = el('div');
    sres.style.cssText = 'margin-top:4px;color:#ffd54f;min-height:14px;';
    panel.appendChild(sres);
    on(btn, 'click', function () {
      var q = inp.value.trim();
      if (!q) return;
      sres.textContent = 'Suche…';
      fetch('/worldmapp/osm/search?q=' + encodeURIComponent(q)).then(r => r.json()).then(function (d) {
        var first = (d.results || [])[0];
        if (!first) { sres.textContent = 'nichts gefunden'; return; }
        sres.textContent = (first.display || first.display_name || "").slice(0, 60);
        state.all.push({ lat: first.lat, lon: first.lon, kind: 'search', name: (first.display || first.display_name || "").slice(0, 40) });
        state.visible.search = true;
        if (window.__wmGlobeSetOsm) window.__wmGlobeSetOsm(state.all, function (kind) { return !!state.visible[kind]; });
        rebuild();
        // hinfliegen zur gefundenen position (karte + globe):
        var latN = parseFloat(first.lat), lonN = parseFloat(first.lon);
        try {
          // FIX (30.10., operator 'orts suche zoomt nicht dorthin'): maplibre
          // verlangt flyTo({center, zoom, duration}) — der alte Call
          // flyTo([lon,lat], 11, {...}) wurde still ignoriert.
          var mi2 = window.__wmMapHost && window.__wmMapHost.mapInstance;
          if (mi2 && typeof mi2.flyTo === 'function') {
            mi2.flyTo({ center: [lonN, latN], zoom: 11, duration: 2500, essential: true });
          }
        } catch (eF) { console.warn('[osm-overlay] suche flyTo', eF); }
        try {
          var g3 = window.__wmGlobePointAt;
          if (typeof g3 === 'function') g3(latN, lonN, 0.12); /* FIX 30.10.: Punkt ist KAMERA-ALTITUDE (klein=nah!): 3.2 zog die Kamera zurueck ('zoomt raus'), 0.12 = Stadt-Naehe */
        } catch (eF2) {}
      }).catch(function () { sres.textContent = 'Suche fehlgeschlagen'; });
    });

    document.body.appendChild(panel);
  }

  function positionPanel(panel, host) {
    // panel hängt an document.body (renderer-wechsel-fest) → position:fixed,
    // rechte kante der karten-section suchen (fallback: fenster-rechts):
    // operator (09.10.): z-index 4600 statt 70 — das Panel lag HINTER den status-/digest-
    // panels (bis 999999): es öffnete unsichtbar = 'klick passiert nichts'.
    panel.style.cssText = 'position:fixed;z-index:4600;background:rgba(10,14,12,.96);border:1px solid rgba(0,229,255,.35);border-radius:6px;padding:8px 10px;font:11px/1.5 monospace;color:#cfeee8;max-width:280px;max-height:calc(100vh - 230px);overflow:auto;right:340px;top:190px;box-shadow:0 6px 24px rgba(0,0,0,.55);';
    var place = function () {
      var vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
      var done = false;
      try {
        var sec = document.querySelector('.map-section') || host;
        if (sec && sec.getBoundingClientRect) {
          var r = sec.getBoundingClientRect();
          if (r.width > 50) {
            // viewport-clamp: panel darf nie halb ausserhalb liegen (operator-small screens)
            // FIX (30.10., operator 'osm knopf reagiert nicht'): -195px — das Panel
            // überlappte sonst den Karten-Dock (Q/OSM-Punkte) und blockierte sie.
            panel.style.left = Math.max(8, Math.min(r.right - 314, vw - 296) - 195) + 'px';
            panel.style.top = Math.max(60, Math.min(r.top + 80, vh - 400)) + 'px';
            panel.style.right = 'auto';
            done = true;
          }
        }
      } catch (e) {}
      if (!done) {
        panel.style.left = 'auto';
        panel.style.right = Math.min(340, Math.max(12, vw - 420)) + 'px';
        panel.style.top = '190px';
      }
    };
    place();
    window.addEventListener('resize', place);
  }

  function setPanelOpen(open, host) {
    var panel = document.getElementById('wm-osm-panel');
    if (panel) {
      panel.style.display = open ? '' : 'none';
      if (open) {
        // sofortiges SICHTBARES feedback (operator: 'klick passiert nichts'):
        try {
          panel.style.transition = 'none';
          panel.style.outline = '2px solid rgba(0,229,255,.9)';
          setTimeout(function () {
            if (panel.isConnected) {
              panel.style.transition = 'outline-color 1.2s ease';
              panel.style.outline = '2px solid rgba(0,229,255,0)';
            }
          }, 150);
        } catch (e) {}
      }
    }
    try { localStorage.setItem('wm-osm-panel-open', open ? '1' : '0'); } catch (e) {}
    var btn = document.getElementById('wm-osm-toggle-btn');
    if (btn) btn.style.opacity = open ? '1' : '.65';
  }

  /** Permanent toggle-button in der karten-header-leiste (neben 2D/3D). */
  function injectToggleButton(host) {
    if (document.getElementById('wm-osm-toggle-btn')) return;
    // operator: knopf soll NEBEN dem EXIT News knopf in der dashboard-tablist sitzen.
    var list = document.querySelector('.dashboard-tablist');
    var btn = el('button');
    btn.id = 'wm-osm-toggle-btn';
    btn.textContent = 'OSM';
    btn.title = 'OSM-Layer-Panel ein/ausblenden';
    btn.className = 'dashboard-tab-label';
    btn.type = 'button';
    btn.style.cssText = 'color:#00e5ff;font-weight:700;';
    on(btn, 'click', function () {
      // operator (09.10.): direkter toggle (identische logik wie ⚙ OSM-Punkte button)
      if (typeof toggleOsmPanel === 'function') { toggleOsmPanel(); return; }
      var panel = document.getElementById('wm-osm-panel');
      if (!panel) return;
      var isOpen = panel.style.display !== 'none';
      setPanelOpen(!isOpen, host || state.host);
    });
    var reinsert = function () {
      // PanelTabBar.render() ruft replaceChildren → knopf fliegt raus bei JEDEM
      // tab-wechsel. operator: OSM-knopf als ZWEITER knopf, DIREKT neben EXIT News:
      if (!list || !list.isConnected) {
        list = document.querySelector('.dashboard-tablist');
        if (!list) return;
      }
      if (!document.getElementById('wm-osm-toggle-btn')) {
        var exitTab = document.getElementById('exit-news-tab');
        if (exitTab && exitTab.parentNode === list) exitTab.insertAdjacentElement('afterend', btn);
        else list.appendChild(btn);
      }
    };
    var tries = 0;
    var watchdog = setInterval(function () {
      tries++;
      if (document.getElementById('wm-osm-toggle-btn')) { clearInterval(watchdog); return; }
      reinsert();
      if (tries > 40 && !document.getElementById('wm-osm-toggle-btn')) {
        // 20s ohne tablist: NOTFALL — schwebender knopf unten rechts, damit
        // die OSM-einstellungen IMMER erreichbar sind (operator-fall 'fehlt ganz'):
        btn.id = '';
        btn.style.cssText += ';position:fixed;bottom:14px;right:14px;z-index:90;background:rgba(10,14,12,.9);border:1px solid rgba(0,229,255,.4);border-radius:6px;padding:6px 12px;';
        document.body.appendChild(btn);
        btn.id = 'wm-osm-toggle-btn';
        clearInterval(watchdog);
      }
    }, 500);
  }

  function init() {
    // KNOPF ZUERST — er hängt an der tab-leiste, nicht an der karte, und muss
    // immer existieren (operator: 'knopf fehlt ganz'):
    injectToggleButton(null);
    var host = findMapHost();
    if (!host || host.getBoundingClientRect().width < 100) { setTimeout(init, 2000); return; }
    state.host = host;
    if (isGlobeMode()) {
      // 3D/globe: native markers via GlobeMap — panel für kind-toggles behalten.
      buildPanel(host);
      // FIX (operator 14:52): der return hat den DATEN-LOAD übersprungen — ohne
      // state.all blieben CII-Panel-Counts leer und __wmGlobeSetOsm bekam nie Daten.
      loadOsmData();
      return;
    }
    ensureLayer(host);
    buildPanel(host);
    loadOsmData();
    startRealtimeWatch();
  }

  function loadOsmData() {
    // daten laden
    fetch(DATA_URL).then(r => r.json()).then(function (d) {
      state.all = (d.features || []).map(f => {
        if (f.geometry && f.geometry.type === 'LineString') {
          return { lat: f.geometry.coordinates[0][1], lon: f.geometry.coordinates[0][0],
                   kind: f.properties.kind, name: f.properties.name || '',
                   substance: f.properties.substance || '',
                   line: f.geometry.coordinates };
        }
        return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
                 kind: f.properties.kind, name: f.properties.name || '' };
      });
      // kategorie-counts ins panel schreiben:
      try {
        var counts = {};
        state.all.forEach(function (p) { counts[p.kind] = (counts[p.kind] || 0) + 1; });
        document.querySelectorAll('.wm-osm-kind-count').forEach(function (s) {
          var k2 = s.dataset.kind;
          if (counts[k2]) s.textContent = String(counts[k2]);
        });
      } catch (eC) {}
      var DEFAULT_ON = { power: 1, hospitals: 1, airports: 1, nuclear: 1, military: 1 };
      // FIX (26.10., operator 'zeigt nicht alle punkte'): der Reset auf 5 Defaults
      // widersprach den Checkboxen (alle checked) — UI-Status gewinnt:
      // FIX (30.10., 'osm punkte unsichtbar'): HIER stand `panel.querySelector` —
      // `panel` existiert in diesem Scope NICHT (nur im Panel-Builder) → die
      // forEach warf ReferenceError, der ganze Datenladecallback starb MITTENDRIN:
      // state.visible blieb leer, pushGlobe/__wmGlobeSetOsm und
      // pushNativeLayersRetry wurden nie erreicht → NULL OSM-Marker in 2D+3D.
      Object.keys(KIND_STYLE).forEach(k => {
        var cb2 = document.querySelector('input[data-profile="' + k + '"]');
        // 30.10. FIX (r21): panel kann NACH den daten booten (race) — dann sind
        // keine checkboxen im DOM und DEFAULT_ON liess nur 5 kategorien leben
        // ('ein haufen punkte fehlen'). Bis zum panel-sync gilt: sichtbar.
        state.visible[k] = cb2 ? !!cb2.checked : true;
      });
      // FIX (30.10., operator 'osm ist buggy'): der 2D-Zaehler lief VOR der
      // visible-Init — state.visible war noch leer und der Zähler zeigte
      // dauerhaft '0 POIs sichtbar'. Jetzt NACH der Init:
      try {
        if (!isGlobeMode()) {
          var visSum2 = 0;
          Object.keys(counts).forEach(function (k2) { if (state.visible[k2]) visSum2 += counts[k2]; });
          var cEl2 = document.getElementById('wm-osm-count');
          if (cEl2) cEl2.textContent = visSum2 + ' POIs geladen (geclustert)';
        }
      } catch (eC2) {}
      // globe-native injection — bridge kann NACH uns kommen (lazy globe init): retry
      var pushGlobe = function (tries) {
        if (window.__wmGlobeSetOsm) {
          window.__wmGlobeSetOsm(state.all, function (kind) { return !!state.visible[kind]; });
        } else if (tries > 0 && isGlobeMode()) {
          setTimeout(function () { pushGlobe(tries - 1); }, 3000);
        }
      };
      pushGlobe(20);
      if (!isGlobeMode()) { pushNativeLayersRetry(12); return; }
      rebuild();
    }).catch(function (e) { console.warn('[osm-overlay] daten-load fail', e); });
  }

  function startRealtimeWatch() {
    // map-bridge: echte projektion + move-tracking
    var attach = function () {
      if (window.__wmMapHost) {
        state.bridge = true;
        window.__wmMapHost.onChange(function () { relayout(); });
        relayout();
      } else setTimeout(attach, 2000);
    };
    attach();
    // resize + modus-wechsel watch
    window.addEventListener('resize', relayout);
    var modeCheck = setInterval(function () {
      try {
        var g = isGlobeMode();
        // renderer-swap wiped our nodes? re-init cleanly (flag stays set)
        var wiped = !document.getElementById('wm-osm-panel') || (document.getElementById('wm-osm-panel') && !document.getElementById('wm-osm-panel').isConnected);
        if (wiped) {
          if (state.layer) { state.layer.remove(); state.layer = null; }
          var nh = findMapHost();
          if (nh && nh.getBoundingClientRect().width > 100) {
            state.host = nh;
            injectToggleButton(nh);
            if (!g) {
              ensureLayer(nh); buildPanel(nh); rebuild();
              var attach2 = function () {
                if (window.__wmMapHost) { state.bridge = true; window.__wmMapHost.onChange(function () { relayout(); }); }
                else setTimeout(attach2, 2000);
              };
              attach2();
            }
          }
          return;
        }
        if (state.layer) state.layer.style.display = g ? 'none' : '';
        try {
          var h2 = window.__wmMapHost;
          if (h2 && h2.removeLayerById) {
            if (g) {
              ['wm-osm-pois', 'wm-osm-cluster-count', 'wm-osm-labels', 'wm-osm-pois-lines', 'wm-osm-clusters'].forEach(function (id) { h2.removeLayerById(id); });
              try { if (host.mapInstance.getSource('wm-osm-pois-src')) host.mapInstance.removeSource('wm-osm-pois-src'); } catch (e3) {}
            }
            else pushNativeLayers();
          }
        } catch (e2) {}
        if (!g) { state.host = findMapHost() || state.host; relayout(); }
      } catch (e) { /* host swapped mid-tick — next tick recovers */ }
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else init();

// operator-Fallback (08.10.): EBENEN-Menue kann das Panel toggeln (setPanelOpen ist IIFE-intern).
// operator (08.10.): eigener schwebender Button unten NEBEN "EXIT · News, Krypto & Rechte"
// — oeffnet/schliesst das OSM-Kategorien-Panel (An/Aus einzelner Datenpunkt-Kategorien).
function ensureFloatingOsmBtn() {
  /* R10 (operator): Knopf wirkt nur in 2D/3D — er gehoert in den Karten-Dock
     (#wm-map-control-dock, unter dem Wetter-Knopf). Der Dock versteckt sich im
     Windy-Modus automatisch und steht nie auf dem Ticker (er liegt im
     Karten-Header-Bereich). Fallback: alte Body-Position, nur ohne
     Ticker-Ueberlappung (higher z, same spot). */
  var btn = document.getElementById('wm-osm-floating-btn');
  var dock = document.getElementById('wm-map-control-dock');
  if (btn && dock && btn.parentElement === dock) return;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'wm-osm-floating-btn';
    btn.type = 'button';
    btn.textContent = '\u2699 OSM-Punkte';
    btn.title = 'OSM-Datenpunkte: Kategorien ein/aus';
    btn.addEventListener('click', function () { toggleOsmPanel(); });
  }
  if (dock) {
    btn.style.cssText = 'position:relative;inset:auto;margin:2px 0 0 0;padding:6px 10px;' +
      'border-radius:8px;border:1px solid rgba(0,229,255,.45);background:#101418;color:#00e5ff;' +
      'font:700 11px/1 var(--font-mono,monospace);cursor:pointer;letter-spacing:.04em;' +
      'z-index:2147483647;pointer-events:auto;'; /* FIX 30.10.: Dock hat pointer-events:none — ohne auto war der Knopf unklickbar */ /* ueber dem OSM-Panel — Knopf bleibt immer klickbar */
    dock.appendChild(btn);
  } else {
    btn.style.cssText = 'position:fixed;bottom:14px;right:290px;z-index:4500;' +
      'background:#101418;color:#00e5ff;border:1px solid rgba(0,229,255,.45);' +
      'border-radius:8px;padding:8px 14px;font:700 12px/1 var(--font-mono,monospace);' +
      'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5);letter-spacing:.04em;';
    document.body.appendChild(btn);
  }
}
setInterval(ensureFloatingOsmBtn, 4000);
// operator (09.10.): toggle direkt als funktion — kein reload-fallback mehr (ictal
// wirkte ein reload im hintergrund wie "nichts passiert"), keine event-indirection.
function toggleOsmPanel() {
  var panel = document.getElementById('wm-osm-panel');
  if (!panel) {
    // panel weg (renderer-wechsel): sofort neu aufbauen, OHNE location.reload
    try { localStorage.setItem('wm-osm-panel-open', '1'); } catch (e) {}
    var nh = findMapHost();
    if (nh && nh.getBoundingClientRect().width > 100) {
      state.host = nh;
      buildPanel(nh);
      setPanelOpen(true, nh);
    } else {
      // karte noch nicht bereit: in 1,2s nochmal (button bleibt klickbar)
      setTimeout(toggleOsmPanel, 1200);
    }
    syncBtnState();
    return;
  }
  var isOpen = panel.style.display !== 'none';
  setPanelOpen(!isOpen, state.host);
  syncBtnState();
}
function syncBtnState() {
  var panel = document.getElementById('wm-osm-panel');
  var open = panel && panel.style.display !== 'none';
  var fb = document.getElementById('wm-osm-floating-btn');
  if (fb) fb.style.opacity = open ? '1' : '.65';
  var tog = document.getElementById('wm-osm-toggle-btn');
  if (tog) tog.style.opacity = open ? '1' : '.65';
}
// kompat: alte event-aufrufe landen genauso im toggle (guard gegen doppel-bind)
if (!window.__wmOsmToggleBound) {
  window.__wmOsmToggleBound = true;
  window.addEventListener('wm-toggle-osm-panel', toggleOsmPanel);
}
// 27.10. FIX ('osm punkte werden nur aufgelistet, nicht anklickbar'):
// nach einem 3D<->2D-Wechsel (oder spaeter auftauchender Bridge) rendert
// das overlay seine 2D-Layer selbst nach. pushNativeLayers ist idempotent
// (setData-Pfad + __wmOsmPopupBound-Guard), also ist Daueraufruf sicher.
setInterval(function () {
  // 27.10. FIX: globe-pfad — der globe hat NIE die osm-marker gekriegt
  // (push passierte nur bei toggle, nie nach dem daten-load) -> 0 punkte
  // in 3d, 'nur aufgelistet'. Signatur-guard: push nur bei aenderung.
  if (isGlobeMode()) {
    var gb = window.__wmGlobeSetOsm;
    if (!gb) return;
    var vis0 = state.visible || {};
    var sig = (state.all ? state.all.length : 0) + ':' + Object.keys(vis0).filter(function (k) { return vis0[k]; }).sort().join(',');
    if (gb.__wmOsmSig !== sig) osmTitleIndex = null;
    if (gb.__wmOsmSig === sig) return;
    try {
      gb((state.all || []).filter(function (p) { return vis0[p.kind] !== false; }),
         function (k) { return vis0[k] !== false; });
    } catch (e) { console.warn('[osm-overlay] globe push', e); }
    // verifikation: osm-marker wirklich im globus? sonst sig verwerfen
    // (retry naechster tick — fngt globe-noch-nicht-initialisiert ab).
    setTimeout(function () {
      try {
        var g2 = window.__wmGlobeHost && window.__wmGlobeHost.mapInstance;
        var data = (g2 && g2.htmlElementsData) ? g2.htmlElementsData() : [];
        var osmDa = data.some(function (dd) { return dd._kind === 'osm'; });
        gb.__wmOsmSig = osmDa ? sig : null;
      } catch (e) { gb.__wmOsmSig = null; }
    }, 2500);
    return;
  }
  var h = window.__wmMapHost;
  if (!h || !h.addGeoJSONLayer || !h.mapInstance || h.mapInstance._removed) return;
  var m = h.mapInstance;
  // 27.10. FIX ('2d ist total broken'): nach globe->2d-wechsel erbt die
  // kamera die AKTUELLE globus-rotation (auto-spin!) -> kamera mitten im
  // ozean, punkte 'weg', klicks 'tot'. Beim ersten tick der 2d-instanz auf
  // die letzte bekannte 2d-ansicht (oder URL-start) zurueckspringen.
  try {
    // korrektur bei jedem tick, bis der nutzer selbst zieht (dragstart)
    if (!window.__wmOsmUserTouched) {
      var tgt = window.__wmOsmLast2dCenter || window.__wmOsmBootView;
      var c0 = m.getCenter();
      if (tgt && (Math.abs(c0.lat - tgt.lat) > 3 || Math.abs(c0.lng - tgt.lng) > 3)) {
        m.jumpTo({ center: [tgt.lng, tgt.lat] });
      }
    }
    if (!m.__wmOsmCenterTrack) {
      m.__wmOsmCenterTrack = true;
      m.on('moveend', function () {
        try { var c1 = m.getCenter(); window.__wmOsmLast2dCenter = { lat: c1.lat, lng: c1.lng }; } catch (e) {}
      });
      m.on('dragstart', function () { window.__wmOsmUserTouched = true; });
    }
  } catch (eF) { console.warn('[osm-overlay] center-fix', eF); }
  // 27.10.: proteste-2d IMMER (idempotent) — die _data-heuristik greift in
  // dieser maplibre-version nicht (intern umbenannt).
  try { updateProtests2D(); } catch (e) { console.warn('[osm-overlay] mode-watch protests', e); }
  var hatLayer = m.getLayer && m.getLayer('wm-osm-clusters') && m.getLayer('wm-osm-pois');
  if (hatLayer) {
    var src = m.getSource && m.getSource('wm-osm-pois-src');
    var d = src && src._data;
    var leer = !d || !(d.features || []).length;
    if (!leer) return;
  }
  try { pushNativeLayers(); } catch (e) { console.warn('[osm-overlay] mode-watch', e); }
}, 2500);
// 27.10. FIX ('nicht anklickbar, nur zoom in' im 3D): der globe hat fuer
// _kind:"osm" KEINEN popup-zweig in handleMarkerClick — fallback ist nur
// moveViewport (zoom). Capture-interception am globe-container: osm-marker
// erkennen (title=name/kind), eigenes DOM-popup zeigen, zoom unterdruecken.
function showOsmPopupScreen(clientX, clientY, html, opts) {
  opts = opts || {};
  var old = document.querySelector('.wm-osm-popup');
  if (old) old.remove();
  var box = document.createElement('div');
  box.className = 'wm-osm-popup';
  var left = Math.min(Math.max(clientX, 130), (window.innerWidth || 1200) - 130);
  var top = Math.max(clientY - 14, 60);
  box.style.cssText = 'position:fixed;z-index:2147483647;left:' + Math.round(left) + 'px;top:' + Math.round(top) + 'px;transform:translate(-50%,-100%);font:11px/1.5 monospace;color:#cfeee8;background:#0a0e0c;border:1px solid rgba(0,229,255,.4);border-radius:4px;padding:7px 22px 7px 9px;max-width:260px;box-shadow:0 4px 14px rgba(0,0,0,.55);pointer-events:auto';
  box.innerHTML = html + '<div data-wm-osm-close role="button" aria-label="Schliessen" style="position:absolute;top:0;right:0;width:28px;height:28px;line-height:28px;text-align:center;color:#9fb8ad;cursor:pointer;font-size:16px">×</div>';
  document.body.appendChild(box);
  // 27.10. (operator): erklaerflaeche darf NICHT von der wetter-karte (unten
  // links, fester fleck) ueberdeckt werden -> raussschieben wenn kollision.
  try {
    var wx = document.querySelector('.wm-point-weather');
    if (wx) {
      var wr = wx.getBoundingClientRect();
      var pr = box.getBoundingClientRect();
      var kollision = pr.left < wr.right && pr.right > wr.left && pr.top < wr.bottom && pr.bottom > wr.top;
      if (kollision) {
        left = Math.min(wr.right + 140, (window.innerWidth || 1200) - 140);
        top = Math.min(Math.max(top, 70), Math.max(wr.top - 80, 70));
        box.style.left = Math.round(left) + 'px';
        box.style.top = Math.round(top) + 'px';
      }
    }
  } catch (eW) {}
  var x1 = box.querySelector('[data-wm-osm-close]');
  if (x1) x1.addEventListener('click', function (ev) { ev.stopPropagation(); box.remove(); });
  if (opts.autoCloseMs) setTimeout(function () { if (box.parentNode) box.remove(); }, opts.autoCloseMs);
  return box;
}
function showOsmPopupAt(cont, clientX, clientY, kind, name) {
  var st = KIND_STYLE[kind] || { label: kind, color: '#8a9aa8' };
  var html = '<b style="color:' + st.color + '">' + (st.label || kind) + '</b>' + (name ? '<br>' + name : '');
  showOsmPopupScreen(clientX, clientY, html, { autoCloseMs: 9000 });
}
var osmTitleIndex = null;
function rebuildOsmTitleIndex() {
  osmTitleIndex = {};
  (state.all || []).forEach(function (p) {
    if (!state.visible || state.visible[p.kind] === false) return;
    if (p.name) osmTitleIndex[p.name] = p;
    else osmTitleIndex[p.kind] = p;
  });
  // proteste: title=name|kind -> eigener eintrag (popup-interception 3d)
  (window.__wmProtestEvents || []).forEach(function (p, i) {
    if (!state.visible || state.visible['protests'] === false) return;
    var key = p.title || p.country || ('Protest #' + i);
    osmTitleIndex[key] = { kind: 'protests', name: p.title || key, __protest: true };
  });
}
function sweepOsmLabels(root) {
  if (!osmTitleIndex) rebuildOsmTitleIndex();
  var cand = root.querySelectorAll ? root.querySelectorAll('[title]') : [];
  for (var i = 0; i < cand.length; i++) {
    var el = cand[i];
    if (el.__wmOsmStripped) continue;
    var p = osmTitleIndex[el.getAttribute('title')];
    if (!p) continue;
    el.__wmOsmStripped = true;
    var spans = el.querySelectorAll('span');
    for (var j = 0; j < spans.length; j++) spans[j].style.display = 'none';
  }
}
function bindGlobeClicks(tries) {
  var host = window.__wmGlobeHost;
  var cont = host && host.container;
  if (!cont) { if (tries > 0) setTimeout(function () { bindGlobeClicks(tries - 1); }, 2000); return; }
  if (cont.__wmOsmGlobeClickBound) return;
  cont.__wmOsmGlobeClickBound = true;
  // label-sweeper: neue marker sofort entlabeln (operator: sonst ueberladen)
  try {
    sweepOsmLabels(cont);
    var mo = new MutationObserver(function () {
      if (bindGlobeClicks.__q) return;
      bindGlobeClicks.__q = true;
      setTimeout(function () { bindGlobeClicks.__q = false; sweepOsmLabels(cont); }, 250);
    });
    mo.observe(cont, { childList: true, subtree: true });
  } catch (eM) { console.warn('[osm-overlay] label sweeper', eM); }
  cont.addEventListener('click', function (ev) {
    try {
      if (!isGlobeMode()) return;
      var el = ev.target;
      var hit = null;
      for (var i = 0; i < 5 && el && el !== cont; i++) {
        var t = el.getAttribute && el.getAttribute('title');
        if (t) { hit = t; break; }
        el = el.parentElement;
      }
      if (!hit) return;
      if (!osmTitleIndex) rebuildOsmTitleIndex();
      var p = osmTitleIndex[hit];
      if (!p) return;
      ev.stopPropagation(); ev.preventDefault();
      showOsmPopupAt(cont, ev.clientX, ev.clientY, p.kind, p.name || '');
    } catch (eG) { console.warn('[osm-overlay] globe click', eG); }
  }, true);
}
bindGlobeClicks(60);
setInterval(function () { bindGlobeClicks(0); }, 4000);
// 27.10. DIAGNOSE: tatsaechlichen client-zustand ans error-log melden,
// damit fern-diagnose statt raten moeglich ist.
// 27.10. (operator: 'popup wird ueberdeckt'): dauerhaftes stylesheet — das
// popup gewinnt IMMER (max z, !important schlaegt inline-styles), und die
// wetter-karte (re-appended sich selbst, z-war teils 2147483647) wird auf
// 9000 festgenagelt — ueber karte+panels, unter dem popup.
if (!document.getElementById('wm-osm-popup-style')) {
  try {
    var stl = document.createElement('style');
    stl.id = 'wm-osm-popup-style';
    stl.textContent = '.wm-osm-popup{z-index:2147483647!important}#wm-osm-panel{z-index:2147483646!important}#wm-osm-floating-btn{z-index:2147483645!important}.wm-point-weather{z-index:9000!important}';
    document.head.appendChild(stl);
  } catch (e) {}
}
window.__wmOsmErrLog = window.__wmOsmErrLog || [];
window.addEventListener('error', function (ev) {
  try { window.__wmOsmErrLog.push('JS: ' + String((ev.error && ev.error.message) || ev.message || 'unbekannt').slice(0, 90)); } catch (e) {}
});
var wmOsmDiag = function () {
  try {
    var d = { diag: 'osm', ver: '10' };
    var mc = document.querySelector('.map-container');
    d.modus = mc ? (/globe-mode/.test(mc.className) ? 'globe' : (/deckgl|flat/.test(mc.className) ? '2d' : 'unbekannt')) : 'kein-container';
    d.sw = (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'aktiv' : 'nein';
    var st = window.__wmOsmState || {};
    d.daten = (st.all || []).length;
    d.kategorien = Object.keys(st.visible || {}).filter(function (k) { return st.visible[k]; }).length;
    var h = window.__wmMapHost || {};
    var m = h.mapInstance;
    d.map2d = !!m;
    if (m && m.getLayer) {
      d.layer2d = ['wm-osm-clusters', 'wm-osm-pois', 'wm-osm-pois-lines'].filter(function (id) { return !!m.getLayer(id); }).join(',') || 'keine';
      try {
        var act = ['wm-osm-clusters', 'wm-osm-pois'].filter(function (id) { return m.getLayer(id); });
        d.gerendert2d = act.length ? m.queryRenderedFeatures(undefined, { layers: act }).length : 0;
      } catch (e) { d.gerendert2d = 'x'; }
    }
    var gh = window.__wmGlobeHost || {};
    var g = gh.mapInstance;
    d.globe = !!g;
    if (g && g.htmlElementsData) {
      var data = g.htmlElementsData();
      d.marker3d = data.length;
      d.osm3d = data.filter(function (x) { return x._kind === 'osm'; }).length;
    }
    var panel = document.getElementById('wm-osm-panel');
    var z = panel ? (panel.textContent.match(/\d+/g) || []).slice(0, 8).join('/') : (panel ? 'leer' : 'kein-panel');
    d.panel = z;
    d.fehler = (window.__wmOsmErrLog || []).slice(0, 3).join(' | ').slice(0, 200) || 'keine';
    fetch('/worldmapp/wm-client-error', { method: 'POST', body: 'OSM-DIAG ' + JSON.stringify(d), keepalive: true }).catch(function () {});
  } catch (e) {}
};
[9000, 26000, 52000].forEach(function (ms) { setTimeout(wmOsmDiag, ms); });
// ===================== PROTESTE-LAYER (27.10.) =====================
// die app-pipeline (gdelt_doc update) laeuft auf dem dashboard nicht —
// das overlay holt die 76 gdelt-events selbst und rendert 2d+3d.
var protestState = { events: [], fetchedAt: 0 };

function fetchProtests() {
  // r37 (31.10., operator: 'osm proteste in der 2d nicht ordentlich gemapped'):
  // quelle vom kleinen lokalen backend (44-82 events, stark schwankende
  // kohorte — daher die "keine sichtbaren dots"-phasen) auf die offizielle
  // UNREST-API (https://www.unrest.network/developers) umgestellt — 2915
  // events/7 tage, weltabdeckung, verification-status. Feld-Shim auf das
  // interne format (location.latitude/longitude), damit 2D-layer, 3D-dots
  // und popups unveraendert weiterlaufen.
  fetch('/worldmapp/unrest-events/events?days=7').then(function (r) { return r.json(); }).then(function (j) {
    var items = (j && j.items) || [];
    protestState.events = items
      .filter(function (e) { return typeof e.lat === 'number' && typeof e.lon === 'number'; })
      .map(function (e) {
        return {
          location: { latitude: e.lat, longitude: e.lon },
          title: (e.title || e.locationName || 'Event') + ' [' + (e.status || 'reported') + '] (' + (e.sourceCount || 0) + ' sources) — ' + [e.city, e.countryName].filter(Boolean).join(', '),
          country: e.countryName || '',
          __unrest: { id: e.id, category: e.category || '', status: e.status || '', date: e.eventDate || '' }
        };
      });
    protestState.fetchedAt = Date.now();
    window.__wmProtestEvents = protestState.events;
    osmTitleIndex = null; // index neu
    // r37-fix2: der fetch rennt bei t+4s, die map bootet spaeter — ohne
    // retry blieben die dots bis zum 10-min-fetch weg ('nicht ordentlich
    // gemapped'). Retry bis 60 s auf den map-boot.
    var tryRender = function (n) {
      var h = window.__wmMapHost;
      if (h && h.mapInstance && !h.mapInstance._removed) {
        try { updateProtests2D(); } catch (e2) {}
        try { updateProtests3D(); } catch (e3) {}
        return;
      }
      if (n > 0) setTimeout(function () { tryRender(n - 1); }, 2000);
    };
    tryRender(30);
  }).catch(function (e) { console.warn('[osm-overlay] protest fetch', e); });
}
setInterval(fetchProtests, 600000);
setTimeout(fetchProtests, 4000);

// 28.10. (operator): megaphone-icon statt orangener punkt
var MEGAPHONE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24">' +
  '<circle cx="12" cy="12" r="10.5" fill="rgba(10,14,12,.92)" stroke="rgba(255,159,67,.9)" stroke-width="1.4"/>' +
  '<g transform="translate(3.4,3.4) scale(0.72)">' +
  '<path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.66 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h3l5 4V6l-5 3H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z" fill="#ff9f43"/></g></svg>';

function ensureProtestIcon(m) {
  if (m.hasImage && m.hasImage('wm-protest-icon')) return Promise.resolve();
  return new Promise(function (resolve) {
    // 30.10. FIX (r25): das HTMLImageElement-addImage schlaegt still im
    // firefox/maplibre-v3 fehl → kein icon → der protest-symbol-layer
    // renderte GAR NICHTS und nur die AIS-schiffe/cluster blieben sichtbar
    // ('protestpunkte im meer'). Gleiche ImageData-methode wie die
    // osm-emoji-fixes (r24).
    try {
      var cv = document.createElement('canvas');
      cv.width = 30; cv.height = 30;
      var cx = cv.getContext('2d');
      cx.font = '24px serif';
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillText('\uD83D\uDCE2', 15, 17);
      m.addImage('wm-protest-icon', cx.getImageData(0, 0, 30, 30), { pixelRatio: 2 });
    } catch (eI) { console.warn('[osm-overlay] protest icon fail', eI); }
    resolve();
  });
}

function protestsVisible() {
  return !state.visible || state.visible['protests'] !== false;
}

function updateProtests2D() {
  try {
    var h = window.__wmMapHost;
    var m = h && h.mapInstance;
    if (!m || !m.getSource || m._removed) return;
    // r40 (31.10., operator: 'die proteste sind in der 2d map wie im 3d map modus
    // angeordnet — du musst das neu und doppelt programmieren, speziell fuer
    // die 2d map'): die 2d-bekam die 3d-logik-erscheinung (welt-kopien beim
    // rauszoom + 2948 ueberlappende symbole). Neu, 2d-spezifisch:
    // (1) keine welt-kopien, (2) clustering mit zahl-bubbles bis z7,
    // (3) einzeldots ab z7 mit popup, (4) cluster-klick zoomt auf.
    try { if (m.setRenderWorldCopies) m.setRenderWorldCopies(false); } catch (eW) {}
    var fc = { type: 'FeatureCollection', features: protestsVisible() ? protestState.events
      .filter(function (p) { return p.location && p.location.latitude != null; })
      .map(function (p) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.location.longitude, p.location.latitude] },
          properties: { kind: 'protests', name: p.title || p.country || 'Protest', cnt: p.title ? (p.title.match(/\((\d+)[ +]reports?\)/) || [])[1] || '' : '' } };
      }) : [] };
    if (m.getSource('wm-protests-src')) { m.getSource('wm-protests-src').setData(fc); return; }
    m.addSource('wm-protests-src', { type: 'geojson', data: fc, cluster: true, clusterMaxZoom: 7, clusterRadius: 48 });
    ensureProtestIcon(m).then(function () {
      if (!m.getLayer('wm-protests-clusters')) {
        m.addLayer({
          id: 'wm-protests-clusters', type: 'circle', source: 'wm-protests-src',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': 'rgba(255,159,67,.5)',
            'circle-stroke-color': 'rgba(255,159,67,.95)',
            'circle-stroke-width': 1.6,
            'circle-radius': ['step', ['get', 'point_count'], 13, 25, 18, 100, 23, 500, 29]
          }
        });
        m.addLayer({
          id: 'wm-protests-cluster-count', type: 'symbol', source: 'wm-protests-src',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-allow-overlap': true },
          paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(10,14,12,.8)', 'text-halo-width': 1 }
        });
      }
      if (!m.getLayer('wm-protests')) {
        m.addLayer({
          id: 'wm-protests', type: 'symbol', source: 'wm-protests-src',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': 'wm-protest-icon',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.45, 2, 0.5, 8, 0.8, 12, 1.05],
            'icon-allow-overlap': true
          },
          minzoom: 1
        });
      }
    });
    if (!m._wmClusterClick) {
      m._wmClusterClick = true;
      m.on('click', 'wm-protests-clusters', function (e) {
        var f = e.features && e.features[0];
        if (!f || !f.properties || !f.properties.cluster_id) return;
        var src = m.getSource('wm-protests-src');
        if (!src || !src.getClusterExpansionZoom) return;
        src.getClusterExpansionZoom(f.properties.cluster_id, function (err, z) {
          if (!err) m.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.4, 14), duration: 500 });
        });
      });
      m.on('mouseenter', 'wm-protests-clusters', function () { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'wm-protests-clusters', function () { m.getCanvas().style.cursor = ''; });
    }
  } catch (e) { console.warn('[osm-overlay] protests 2d', e); }
}

// --- 3d: eigene dots, projeziert ueber die globe-bridge ---
var protestDots3d = {};

function updateProtests3D() {
  try {
    var host = window.__wmGlobeHost;
    var cont = host && host.container;
    if (!cont) return;
    var wrap = document.getElementById('wm-protests-3d');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'wm-protests-3d';
      wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
      if (getComputedStyle(cont).position === 'static') cont.style.position = 'relative';
      cont.appendChild(wrap);
    }
    wrap.innerHTML = '';
    protestDots3d = {};
    if (!protestsVisible()) return;
    var g = host.mapInstance;
    protestState.events.forEach(function (p, i) {
      if (!p.location || p.location.latitude == null) return;
      var el = document.createElement('div');
      var tit = p.title || p.country || ('Protest #' + i);
      el.title = tit;
      el.textContent = '\uD83D\uDCE3';
      el.style.cssText = 'position:absolute;font-size:15px;line-height:1;margin:-8px 0 0 -8px;text-shadow:0 1px 3px rgba(0,0,0,.8);pointer-events:auto;cursor:pointer;user-select:none';
      wrap.appendChild(el);
      protestDots3d[i] = { el: el, lat: p.location.latitude, lng: p.location.longitude, tit: tit };
    });
    var reproj = function () {
      if (!protestsVisible()) { wrap.style.display = 'none'; return; }
      wrap.style.display = '';
      // r50 (16.11., operator: 'proteste in der 2d map wie auf einem 3d globus'):
      // der 3d-dot-wrap ueberlebt den renderer-wechsel (container bleibt im
      // DOM, globe-instanz lebt weiter) und positionierte dots mit globe-
      // screencoords UEBER der flachen 2d-karte. Gate: dots nur noch bei
      // aktivem globus (app-flag __wmGlobeActive, false in deck/svg-mode).
      if (window.__wmGlobeActive !== true) { wrap.style.display = 'none'; return; }
      var g2 = window.__wmGlobeHost && window.__wmGlobeHost.mapInstance;
      if (!g2) return;
      Object.keys(protestDots3d).forEach(function (k) {
        var d = protestDots3d[k];
        try {
          var s = g2.getScreenCoords ? g2.getScreenCoords(d.lat, d.lng) : null;
          var vis = true;
          try { vis = window.__wmGlobeHost && window.__wmGlobeHost.isPointVisible ? window.__wmGlobeHost.isPointVisible(d.lat, d.lng) : true; } catch (e2) { vis = true; }
          var onScreen = s && s.x != null && s.x > -40 && s.y > -40 && s.x < (cont.clientWidth || 9999) + 40 && s.y < (cont.clientHeight || 9999) + 40;
          if (vis !== false && onScreen) {
            d.el.style.display = '';
            d.el.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px)';
          } else d.el.style.display = 'none';
        } catch (e) { d.el.style.display = 'none'; }
      });
    };
    reproj();
    if (!cont.__wmProtestReproj) {
      cont.__wmProtestReproj = true;
      // 30.10. (r24, operator 'punkte nicht fix, mitten im meer'): das 1.2s-interval
      // + throttle liess die dots bei auto-rotate HINTER der kugel zurück drift
      // in den ozean. Jetzt frame-genau: kontinuierlicher RAF-loop (40 dots ×
      // getScreenCoords ist trivial cheap).
      var rafLoop = function () {
        if (protestState.events.length && protestsVisible()) reproj();
        requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);
      try { host.onChange(function () { reproj(); }); } catch (e) {}
    }
  } catch (e) { console.warn('[osm-overlay] protests 3d', e); }
}

// ===================== Klick-Routing (r22, 30.10.) =====================
// EIN document-capture-handler, renderer-unabhaengig (globe UND 2d).
// FRUEHER: bindung sass in pushNativeLayers — das returnt im globe-mode
// frueh (kein __wmMapHost) → handler ungebunden → proteste klick-tot
// (docBound=false bewiesen). Jetzt: gebunden am IIFE-Ende, einmalig.
// Reihenfolge: 1) protest-dots in 3D (rect-hit-test — native osm-dots
// koennen drueber liegen, protest gewinnt im 8px-radius), 2) 2D maplibre
// layers (sichtbarer emoji-layer zuerst — opacity-0-kreise hit-testet der
// firefox-gl nicht zuverlaessig), 3) clusters. Ohne treffer: nichts —
// native klicks (erdbeben etc.) laufen unveraendert weiter.
function wmOsmDocClick(ev) {
  try {
    // r42: klicks auf eigene cam-pins gehoeren dem pin (vorschau-player),
    // nicht dem overlay-interceptor und nicht der app.
    if (ev.target && ev.target.__wmCamPin) return;
  } catch (e) {}
  try {
    var pwrap = document.getElementById('wm-protests-3d');
    if (pwrap && pwrap.style.display !== 'none') {
      var dotHit = null;
      for (var i = 0; i < pwrap.children.length; i++) {
        var d = pwrap.children[i];
        if (d.style.display === 'none') continue;
        var r = d.getBoundingClientRect();
        if (ev.clientX >= r.left - 5 && ev.clientX <= r.right + 5
          && ev.clientY >= r.top - 5 && ev.clientY <= r.bottom + 5) { dotHit = d; break; }
      }
      if (dotHit) {
        // 30.10. (r27) preventDefault+stopPropagation: die app darf auf einen
        // marker-klick NICHT mit land-auswahl reagieren (lagebericht + flyTo
        // raus) — der punkt-klick gehoert dem popup, fertig. lagebericht
        // bleibt ueber land-klick/panel erreichbar.
        ev.stopPropagation();
        ev.preventDefault();
        var tit = dotHit.title || '';
        var evd = (window.__wmProtestEvents || []).filter(function (e) {
          return (e.title || e.country || '') === tit;
        })[0] || null;
        var esc2 = function (s) {
          return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
            return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
          });
        };
        var html3 = '<b style="color:#ff9f43">' + esc2(tit) + '</b>';
        var links = (evd && evd.sourceUrls) ? evd.sourceUrls : [];
        if (links.length) {
          html3 += '<br>' + links.slice(0, 3).map(function (u) {
            var safe = String(u).replace(/"/g, '%22');
            var dom = safe.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            return '<a href="' + esc2(safe) + '" target="_blank" rel="noopener nofollow" style="color:#00e5ff">' + esc2(dom) + ' →</a>';
          }).join('<br>');
        } else {
          html3 += '<br><span style="color:#5c6f66">keine passenden artikel im aktuellen zeitfenster</span>';
        }
        showOsmPopupScreen(ev.clientX, ev.clientY, html3);
        return;
      }
    }
    var mDirect = (window.__wmMapHost || {}).mapInstance;
    if (!mDirect || !mDirect.getCanvas || mDirect._removed) return;
    var rect = mDirect.getCanvas().getBoundingClientRect();
    if (ev.clientX < rect.left || ev.clientX > rect.right
      || ev.clientY < rect.top || ev.clientY > rect.bottom) return;
    var pt = [ev.clientX - rect.left, ev.clientY - rect.top];
    // r40e (31.10., operator: cams-Cluster in der 2d nicht auflistbar/pinnbar,
    // keine Vorschau): die Webcam-Cluster sind DeckGL-Layer — liegt an der
    // Klick-Stelle ein Webcam-Feature, gehoert der Klick der App/Deck
    // (Liste + Pinnen + Vorschau). Der Overlay-Interceptor tritt zurueck,
    // bevor er der App das Map-Click-Event wegnimmt.
    try {
      var allF = mDirect.queryRenderedFeatures(pt);
      for (var ai = 0; ai < allF.length; ai++) {
        var lidA = (allF[ai].layer && allF[ai].layer.id) || '';
        if (/webcam/i.test(lidA)) return;
      }
    } catch (eA) { console.warn('[osm-overlay] webcam pass', eA); }
    var LAY = ['wm-osm-pois-emoji', 'wm-osm-pois', 'wm-osm-pois-lines', 'wm-protests', 'wm-planes', 'wm-cgev', 'wm-cgreports'];
    var feats = mDirect.queryRenderedFeatures(pt, { layers: LAY });
    if (!feats || !feats.length) {
      var offs = [[0, -7], [0, 7], [-7, 0], [7, 0], [-5, -5], [5, -5], [-5, 5], [5, 5]];
      for (var oi = 0; oi < offs.length; oi++) {
        feats = mDirect.queryRenderedFeatures([pt[0] + offs[oi][0], pt[1] + offs[oi][1]], { layers: LAY });
        if (feats && feats.length) break;
      }
    }
    var clusters = mDirect.queryRenderedFeatures(pt, { layers: ['wm-osm-clusters', 'wm-cgev-clusters'] });
    if (clusters && clusters.length) {
      ev.stopPropagation();
      // 30.10. (r26) protest-dot gewinnt gegen das cluster-bubble: liegt ein
      // protest-event-dot im 12px-radius, zeigt der klick die protest-info
      // (titel + quellen) statt '22 objekte'/zoom — das cluster verdeckt den
      // dot visuell und frass ihn vorher komplett weg.
      try {
        var prEvts = window.__wmProtestEvents || [];
        var prHit = null;
        for (var pi = 0; pi < prEvts.length; pi++) {
          var eE = prEvts[pi];
          if (!eE.location || eE.location.latitude == null) continue;
          var pp = mDirect.project([eE.location.longitude, eE.location.latitude]);
          var dx = (rect.left + pp.x) - ev.clientX;
          var dy = (rect.top + pp.y) - ev.clientY;
          if (dx * dx + dy * dy < 144) { prHit = eE; break; }
        }
        if (prHit) {
          var escPr = function (sv) {
            return String(sv == null ? '' : sv).replace(/[<>&"]/g, function (c) {
              return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
            });
          };
          var htmlPr = '<b style="color:#ff9f43">' + escPr(prHit.title || prHit.country || 'Protest') + '</b>';
          var linksPr = (prHit.sourceUrls) ? prHit.sourceUrls : [];
          if (linksPr.length) {
            htmlPr += '<br>' + linksPr.slice(0, 3).map(function (u) {
              var safe = String(u).replace(/"/g, '%22');
              var dom = safe.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
              return '<a href="' + escPr(safe) + '" target="_blank" rel="noopener nofollow" style="color:#00e5ff">' + escPr(dom) + ' →</a>';
            }).join('<br>');
          } else {
            htmlPr += '<br><span style="color:#5c6f66">keine passenden artikel im aktuellen zeitfenster</span>';
          }
          ev.stopPropagation();
          ev.preventDefault();
          showOsmPopupScreen(ev.clientX, ev.clientY, htmlPr);
          return;
        }
      } catch (ePR) { console.warn('[osm-overlay] protest priority', ePR); }
      var c0 = clusters[0];
      var cid = c0.properties.cluster_id;
      var jetzt = Date.now();
      var nochmal = (mDirect.__wmOsmLastC === cid) && (jetzt - (mDirect.__wmOsmCT || 0) < 8000);
      mDirect.__wmOsmLastC = cid;
      mDirect.__wmOsmCT = jetzt;
      if (nochmal) {
        var doZoom = function (zz) {
          // 30.10. FIX (r23, operator 'zoomt raus statt rein'): stale cluster-daten
          // koennen einen expansion-zoom UNTER dem aktuellen zoom liefern —
          // cluster-klick zoomt immer mindestens leicht rein.
          var cur = (typeof mDirect.getZoom === 'function') ? mDirect.getZoom() : 0;
          var z = (typeof zz === 'number' && isFinite(zz)) ? zz : cur + 1.5;
          var nz = Math.min(z + 0.4, 16);
          if (nz < cur + 0.5) nz = Math.min(cur + 1.5, 16);
          mDirect.easeTo({ center: c0.geometry.coordinates, zoom: nz });
        };
        // 30.10. (r28b) test-hook: cluster-zoom-anfragen loggen — die guard-
        // suite prueft DIESE invarianten (nz >= cur+0.5), unabhaengig von
        // fremden app-kamerabewegungen (die erzeugten false-positives).
        (window.__wmZoomLog = window.__wmZoomLog || []).push({ cur: cur, req: nz, t: Date.now() });
        // r32: source aus dem getroffenen cluster-layer (osm-poiz ODER cortege-events)
        var srcC = (c0.layer && c0.layer.source) ? mDirect.getSource(c0.layer.source) : null;
        if (!srcC) srcC = mDirect.getSource('wm-osm-pois-src');
        var czR = null;
        try {
          if (srcC && srcC.getClusterExpansionZoom) czR = srcC.getClusterExpansionZoom(cid);
          else if (mDirect.getClusterExpansionZoom) czR = mDirect.getClusterExpansionZoom(cid);
        } catch (eCZ) { console.warn('[osm-overlay] expansion-zoom', eCZ); }
        if (czR && typeof czR.then === 'function') {
          czR.then(function (z) { doZoom(z); }).catch(function () { doZoom(12); });
        } else {
          doZoom(czR);
        }
        return;
      }
      var nn = c0.properties.point_count;
      var zeilen = [];
      try {
        var leaves = mDirect.getClusterLeaves(cid, 500, 0);
        var kc = {};
        leaves.forEach(function (lf) { var k = lf.properties.kind; kc[k] = (kc[k] || 0) + 1; });
        Object.keys(kc).sort(function (a, b) { return kc[b] - kc[a]; }).forEach(function (k) {
          var st2 = KIND_STYLE[k] || { label: k, color: '#8a9aa8' };
          zeilen.push('<span style="color:' + st2.color + '">' + (st2.label || k) + '</span> ×' + kc[k]);
        });
      } catch (eL2) { zeilen.push(nn + ' Objekte'); }
      var htmlC = '<b style="color:#00e5ff">' + nn + ' Objekte</b>' + (zeilen.length ? '<br>' + zeilen.slice(0, 8).join('<br>') : '') + '<div style="color:#5c6f66;margin-top:4px">nochmal klicken = hineinzoomen</div>';
      var boxC = showOsmPopupScreen(ev.clientX, ev.clientY, htmlC);
      mDirect.__wmOsmPopupBox = boxC;
      mDirect.once('movestart', function () { if (mDirect.__wmOsmPopupBox) { mDirect.__wmOsmPopupBox.remove(); mDirect.__wmOsmPopupBox = null; } });
      return;
    }
    if (!feats || !feats.length) return;
    ev.stopPropagation();
    ev.preventDefault();
    var f = feats[0];
    var p = f.properties || {};
    // 30.10. (r24) flugzeuge: eigenes popup mit callsign/land/hoehe statt
    // kategorie-farbe (die gelben triangles kollidieren mit der protest-farbe).
    if (f.layer && f.layer.id === 'wm-planes') {
      var escF = function (sv) {
        return String(sv == null ? '' : sv).replace(/[<>&"]/g, function (c) {
          return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        });
      };
      var callsign = escF(p.callsign || 'aircraft');
      var htmlF = '<b style="color:' + (p.mil ? '#ff9f43' : '#ffffff') + '">' + callsign + '</b>' + (p.typ ? '<br><span style="color:#9fb8ad">Typ: ' + escF(p.typ) + '</span>' : '') + (p.country ? '<br>' + escF(p.country) : '') + '<br><span style="color:#5c6f66">Höhe: ' + Math.round(Number(p.alt) || 0) + ' m · ADS-B/OpenSky</span>';
      showOsmPopupScreen(ev.clientX, ev.clientY, htmlF);
      return;
    }
    // 30.10. (r32) cortège-event (FR-termine): titel/ort/datum/quelle
    if (f.layer && f.layer.id === 'wm-cgev') {
      var escE = function (sv) {
        return String(sv == null ? '' : sv).replace(/[<>&"]/g, function (c) {
          return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        });
      };
      var dE = new Date(Number(p.start) || 0);
      var dEtxt = isNaN(dE.getTime()) ? '' : dE.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      var htmlE = '<b style="color:#c084fc">' + escE(p.name) + '</b>';
      if (p.place) htmlE += '<br><span style="color:#cfeee8">' + escE(p.place) + '</span>';
      if (dEtxt) htmlE += '<br><span style="color:#5c6f66">' + dEtxt + ' Uhr</span>';
      if (p.link) {
        var safeE = String(p.link).replace(/"/g, '%22');
        var domE = safeE.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
        htmlE += '<br><a href="' + escE(safeE) + '" target="_blank" rel="noopener nofollow" style="color:#00e5ff">' + escE(domE) + ' →</a>';
      }
      htmlE += '<br><span style="color:#5c6f66">Cortège FR · Termine</span>';
      showOsmPopupScreen(ev.clientX, ev.clientY, htmlE);
      return;
    }
    // 30.10. (r32) cortège-live-meldung: kategorie/note/alter/stimmen
    if (f.layer && f.layer.id === 'wm-cgreports') {
      var escR = function (sv) {
        return String(sv == null ? '' : sv).replace(/[<>&"]/g, function (c) {
          return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        });
      };
      var grpColor = { fdo: '#ef4444', danger: '#f97316', soutien: '#22c55e', info: '#22d3ee' }[p.grp] || '#22d3ee';
      var ageMin = p.last ? Math.max(0, Math.round((Date.now() - Number(p.last)) / 60000)) : null;
      var htmlR = '<b style="color:' + grpColor + '">' + escR(p.name) + '</b>';
      if (p.note) htmlR += '<br>' + escR(String(p.note).slice(0, 160));
      if (ageMin != null) htmlR += '<br><span style="color:#5c6f66">gemeldet vor ' + ageMin + ' min';
      if (Number(p.up) || Number(p.down)) htmlR += ' · ✅ ' + (Number(p.up) || 0) + (Number(p.down) ? ' / ❌ ' + Number(p.down) : '');
      htmlR += '</span><br><span style="color:#5c6f66">Cortège FR · Live-Meldung (verfällt automatisch)</span>';
      showOsmPopupScreen(ev.clientX, ev.clientY, htmlR);
      return;
    }
    // 30.10. (r25) proteste: popup mit titel + artikel-quellen (wie 3d)
    if (p.kind === 'protests') {
      var evd2 = (window.__wmProtestEvents || []).filter(function (e) {
        return (e.title || e.country || '') === p.name;
      })[0] || null;
      var escP = function (sv) {
        return String(sv == null ? '' : sv).replace(/[<>&"]/g, function (c) {
          return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
        });
      };
      var htmlPr = '<b style="color:#ff9f43">' + escP(p.name) + '</b>';
      var linksP = (evd2 && evd2.sourceUrls) ? evd2.sourceUrls : [];
      if (linksP.length) {
        htmlPr += '<br>' + linksP.slice(0, 3).map(function (u) {
          var safe = String(u).replace(/"/g, '%22');
          var dom = safe.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
          return '<a href="' + escP(safe) + '" target="_blank" rel="noopener nofollow" style="color:#00e5ff">' + escP(dom) + ' →</a>';
        }).join('<br>');
      } else {
        htmlPr += '<br><span style="color:#5c6f66">keine passenden artikel im aktuellen zeitfenster</span>';
      }
      showOsmPopupScreen(ev.clientX, ev.clientY, htmlPr);
      return;
    }
    var st = KIND_STYLE[p.kind] || { label: p.kind, color: '#8a9aa8' };
    var htmlP = '<b style="color:' + st.color + '">' + (st.label || p.kind) + '</b>' + (p.name ? '<br>' + p.name : '');
    showOsmPopupScreen(ev.clientX, ev.clientY, htmlP);
  } catch (eC) { console.warn('[osm-overlay] doc click', eC); }
}
if (!window.__wmOsmDocClick) {
  window.__wmOsmDocClick = wmOsmDocClick;
  document.addEventListener('click', wmOsmDocClick, true);
}

setInterval(ensureFloatingOsmBtn, 1500);
ensureFloatingOsmBtn();

// 30.10. (r30, P1.2) VERSION-SICHTBARKEIT: die eigene ?v aus dem script-src
// als body-Attribut + globales Feld. Diagnose-Frage 'welcher stand laeuft?'
// ist damit aus jedem DOM-Snapshot / console beantwortbar.
(function () {
  try {
    var v = 'unknown';
    var scripts = document.querySelectorAll('script[src*="osm-overlay"]');
    for (var k = 0; k < scripts.length; k++) {
      var m = /osm-overlay\.js\?v=([a-z0-9-]+)/i.exec(scripts[k].src || '');
      if (m) { v = m[1]; break; }
    }
    window.__wmVersion = v;
    document.body.setAttribute('data-wm-version', v);
  } catch (e) {}
})();

// 30.10. (r30, P1.1) CLIENT-ERROR-REPORTING: unbehandelte fehler + rejections
// gehen als GET-Ping an /worldmapp/client-error (nginx loggt $args in ein
// eigenes log und antwortet 204). Whitelist-only payload, hard rate-limit
// (5/min), absolut silent — der reporter darf nie selbst die seite stoeren.
(function () {
  var sent = 0, window_start = 0;
  function send(kind, msg, stack) {
    try {
      var now = Date.now();
      if (now - window_start > 60000) { window_start = now; sent = 0; }
      if (sent >= 5) return;
      sent++;
      var q = '?kind=' + encodeURIComponent(String(kind).slice(0, 24))
        + '&msg=' + encodeURIComponent(String(msg).slice(0, 300))
        + '&v=' + encodeURIComponent(window.__wmVersion || 'unknown')
        + '&href=' + encodeURIComponent(location.href.slice(0, 200))
        + '&t=' + now;
      var x = new XMLHttpRequest();
      x.open('GET', '/worldmapp/client-error' + q, true);
      x.send();
    } catch (e) {}
  }
  window.addEventListener('error', function (ev) {
    send('error', ev && ev.message, ev && ev.filename);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    send('rejection', (r && (r.message || String(r))) || 'rejection');
  });
})();

// 30.10. (r30) DEBUG-OVERLAY bei ?debug=1: version + layer-inventar der
// aktiven karte (fuer support ohne console).
if (/[?&]debug=1/.test(location.search)) {
  (function () {
    var show = function () {
      try {
        var m = (window.__wmMapHost || {}).mapInstance;
        var layers = m && m.getStyle ? m.getStyle().layers.length : 'keine 2D-map';
        var box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(10,12,14,.92);color:#9fe8d8;font:11px/1.5 monospace;padding:8px 10px;border-radius:8px;pointer-events:none;';
        box.textContent = 'WM ' + (window.__wmVersion || '?') + ' · layers: ' + layers + ' · ' + new Date().toISOString().slice(11, 19);
        document.body.appendChild(box);
      } catch (e) {}
    };
    if (document.readyState === 'complete') show(); else window.addEventListener('load', show);
  })();
}

// 30.10. (r30, P2.2) POPUP-A11Y: ESC schliesst das overlay-popup, der
// schliessen-button bekommt ein ordentliches touch-target (min 28px).
document.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Escape') return;
  var b = document.querySelector('.wm-osm-popup');
  if (b && b.remove) { b.remove(); }
});

// 30.10. (r29) REG-010: 'Zoom Level Not Supported' = die bekannte
// RainViewer-placeholder-kachel (deren oeffentliche radar-tiles enden bei
// z7; darunter liefert rainviewer genau diesen 1,4KB-platzhalter). Der
// RUNTIME-layer (rain-layer.js) hat maxzoom:7 — der NATIVE bundle-layer
// (deck-stack fetchAndApplyRadar) baute {z}-urls OHNE clamp → placeholders
// bei karten-zoom > 7 (bewiesen: operators belarus-view z9-11, zwei kacheln).
// FIX: jede raster-source mit rainviewer-tiles ohne maxzoom<8 wird mit
// maxzoom:7 neu angelegt; abhaengige raster-layer mit ihren original-paint/
// layout-props wieder angehaengt. Das radar bleibt voll sichtbar — maplibre
// ueberzoomt z7-kacheln selbst. Nichts wird abgeschaltet.
function wmClampRainviewerSources(m) {
  try {
    var layers = (m.getStyle() && m.getStyle().layers) || [];
    for (var i = 0; i < layers.length; i++) {
      var lid = layers[i].id;
      var layer = m.getLayer(lid);
      if (!layer || layer.type !== 'raster') continue;
      var sid = layer.source;
      var src = m.getSource(sid);
      if (!src || src.__wmRainClamped || !src.tiles || !src.tiles.length) continue;
      var isRain = false;
      for (var t = 0; t < src.tiles.length; t++) {
        if (String(src.tiles[t]).indexOf('rainviewer') !== -1) { isRain = true; break; }
      }
      if (!isRain) continue;
      var paint = layer.paint || { 'raster-opacity': 0.55 };
      var layout = layer.layout || {};
      m.removeLayer(lid);
      m.removeSource(sid);
      m.addSource(sid, { type: 'raster', tiles: src.tiles, tileSize: src.tileSize || 256, maxzoom: 7, attribution: src.attribution || 'RainViewer' });
      var ns = m.getSource(sid);
      if (ns) ns.__wmRainClamped = 1;
      m.addLayer({ id: lid, type: 'raster', source: sid, paint: paint, layout: layout });
      console.warn('[osm-overlay] rainviewer-source geclampt (maxzoom 7):', sid, '/', lid);
    }
  } catch (e) { console.warn('[osm-overlay] rainviewer clamp', e && e.message); }
}
// r41 (31.10., operator-Screenshot: 'Zoom Level Not Supported' KEHRTE zurueck):
// (a) der 5-s-Clamp liess bis zu 5 s Platzhalter-Kacheln sichtbar (die App
// erneuert die Rain-Sources periodisch ohne maxzoom-Clamp) — Interval auf
// 1,5 s verengt. (b) die Platzhalter sind PNG-Kacheln (kein DOM-Text) —
// der DOM-Killer greift nicht; jetzt: geladene rainviewer-Kacheln mit
// z>7 werden sofort ausgeblendet, z<=7 eingeblendet.
setInterval(function () {
  try {
    var h = window.__wmMapHost;
    if (h && h.mapInstance && h.mapInstance.isStyleLoaded && h.mapInstance.isStyleLoaded()) {
      wmClampRainviewerSources(h.mapInstance);
    }
  } catch (e) {}
  try {
    var imgs = document.querySelectorAll('img.leaflet-tile[src*="rainviewer"]');
    for (var ii = 0; ii < imgs.length; ii++) {
      var mz = imgs[ii].src.match(/\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)(\?|$)/);
      var z = mz ? parseInt(mz[1], 10) : NaN;
      if (!isNaN(z)) imgs[ii].style.display = (z > 7) ? 'none' : '';
    }
  } catch (eI) {}
}, 1500);

// 30.10. (r27, operator: 'keine zoom warnungen die wir vor nem monat abgeschafft
// haben') ENDGUETIGER 'Zoom Level Not Supported'-KILLER: die meldung kam
// nicht aus dem aktuellen code (grep dist+assets leer) sondern aus einem
// DOM-element — quelle unklar (alter cache-stand einer bundle-version).
// Dieser filter entfernt jedes element mit GENAU diesem text aus dem DOM-
// fluss, egal welcher layer/es rendert — gegenwaertig und zukuenftig.
(function () {
  var TXT = 'Zoom Level Not Supported';
  // PERFORMANCE (r27b): NIEMALS das ganze dokument scannen (das dashboard
  // mutiert staendig → full-DOM-textContent-scans = CPU-blockade, bewiesen
  // durch fehlende protest-dots im 45s-fenster). Stattdessen: nur die JEWEILS
  // NEU eingefügten nodes prüfen (kleine subtrees, einmal geflaggt).
  function checkEl(el) {
    if (!el || el.nodeType !== 1 || el.__wmZk) return;
    el.__wmZk = 1;
    var t = el.textContent;
    if (!t || t.length > 120 || t.indexOf(TXT) === -1) return;
    if (t.trim() !== TXT) return;
    var top = el;
    while (top.parentElement && top.parentElement !== document.body
      && (top.parentElement.textContent || '').trim() === TXT) top = top.parentElement;
    top.style.setProperty('display', 'none', 'important');
    console.warn('[osm-overlay] zoom-warnung unterdrückt');
  }
  function sweepAdded(nodes) {
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      if (n.nodeType !== 1) continue;
      checkEl(n);
      if (n.querySelectorAll) {
        var sub = n.querySelectorAll('div, span, p, section, h1, h2, h3, h4');
        for (var j = 0; j < sub.length; j++) checkEl(sub[j]);
      }
    }
  }
  try {
    new MutationObserver(function (muts) {
      for (var k = 0; k < muts.length; k++) {
        if (muts[k].addedNodes && muts[k].addedNodes.length) sweepAdded(muts[k].addedNodes);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (eZ) {}
  if (document.body) sweepAdded([document.body]);
})();
})();
