/* Shared OSM / satellite basemap control. Canonical copy: overlay-fallback. */
(function () {
  if (window.__wmSatelliteUI) return;
  window.__wmSatelliteUI = true;
  var KEY = 'wm-map-basemap', ID = 'wm-satellite-basemap';
  var active = false, map = null, scheduled = false;
  try { active = localStorage.getItem(KEY) === 'satellite'; } catch (e) {}
  window.__wmSatellite = active;
  var credit = '<a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOxCloudless — cloudless.eox.at</a> by <a href="https://eox.at" target="_blank" rel="noopener noreferrer">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2025) · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a>';
  var button = document.createElement('button');
  button.id = 'wm-satellite-btn'; button.type = 'button';
  button.setAttribute('data-wm-satellite-action', 'toggle');
  button.hidden = true; // map-extras owns placement, not the page viewport.
  button.style.cssText = 'position:relative;background:#10161d;border:1px solid #2c4557;color:#9fd6ff;border-radius:8px;padding:5px 10px;font:700 11px monospace;cursor:pointer;';
  button.title = 'Kartenbasis für 2D und 3D: OSM oder EOX/Copernicus-Satellitenmosaik 2025. Etwa 10 m Detailauflösung, kein Livebild. Kostenlos für nichtkommerzielle Nutzung.';
  document.body.appendChild(button);

  function applyMap() {
    if (!map) return;
    try {
      var style = map.getStyle();
      if (!style || !style.layers) return;
      if (active) {
        if (!map.getSource(ID)) map.addSource(ID, {
          type: 'raster', tiles: ['/worldmapp/map-tiles/satellite/256/{z}/{x}/{y}.png'],
          tileSize: 256, minzoom: 0, maxzoom: 14, attribution: credit
        });
        if (!map.getLayer(ID)) {
          var layers = style.layers;
          var base = layers.findIndex(function (l) { return l.type === 'raster' && (/osm/i.test(l.id) || l.source === 'osm'); });
          var next = base >= 0 ? layers[base + 1] : layers.find(function (l) { return l.type === 'custom' || /^(country-|wm-|deckgl)/.test(l.id); });
          map.addLayer({id: ID, type: 'raster', source: ID, paint: {'raster-opacity': 1, 'raster-fade-duration': 200}}, next && next.id);
        }
      } else {
        if (map.getLayer(ID)) map.removeLayer(ID);
        if (map.getSource(ID)) map.removeSource(ID);
      }
      if (window.__wmMapHost && window.__wmMapHost.container) {
        var container = window.__wmMapHost.container, mode = active ? 'satellite' : 'osm';
        if (container.getAttribute('data-wm-basemap') !== mode) container.setAttribute('data-wm-basemap', mode);
      }
    } catch (e) { /* A style replacement is retried by its real style.load event. */ }
  }

  function refresh() {
    var labelText = '🛰 Satellitenbild: ' + (active ? 'An' : 'Aus');
    if (button.textContent !== labelText) button.textContent = labelText;
    if (button.getAttribute('aria-pressed') !== String(active)) button.setAttribute('aria-pressed', String(active));
    document.querySelectorAll('.layer-toggles').forEach(function (panel) {
      if (!panel.querySelector('.wm-basemap-setting')) {
        var label = document.createElement('label');
        label.className = 'wm-basemap-setting';
        label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #2c4557;color:#b9dcf3;font:11px monospace;';
        label.innerHTML = '<input type="checkbox" data-wm-satellite-setting="1"><span>Satellitenbild · 2025</span>';
        label.title = button.title;
        var handle = panel.querySelector('.wm-lp-handle');
        if (handle && handle.parentNode === panel) panel.insertBefore(label, handle.nextSibling);
        else panel.insertBefore(label, panel.firstChild);
      }
    });
    document.querySelectorAll('[data-wm-satellite-setting]').forEach(function (input) { if (input.checked !== active) input.checked = active; });
    document.querySelectorAll('.map-container.globe-mode,.map-container.deckgl-mode').forEach(function (container) {
      var el = container.querySelector('.wm-satellite-attribution');
      if (!el) {
        el = document.createElement('div'); el.className = 'wm-satellite-attribution';
        el.style.cssText = 'position:absolute;bottom:3px;right:5px;max-width:calc(100% - 150px);z-index:60;background:rgba(10,16,22,.90);color:#d6e2ee;font:10px/1.3 sans-serif;padding:3px 5px;border-radius:3px;';
        el.innerHTML = credit;
        el.querySelectorAll('a').forEach(function (a) { a.style.color = '#9fd6ff'; });
        container.appendChild(el);
      }
      var legend = container.querySelector('.map-legend');
      var bottom = 3;
      if (legend) {
        var bounds = legend.getBoundingClientRect();
        if (bounds.height > 0) bottom = Math.max(3, Math.ceil(container.getBoundingClientRect().bottom - bounds.top + 4));
      }
      if (el.style.bottom !== bottom + 'px') el.style.bottom = bottom + 'px';
      if (el.hidden !== !active) el.hidden = !active;
    });
    var current = window.__wmMapHost && window.__wmMapHost.mapInstance;
    if (current !== map) {
      if (map) { try { map.off('style.load', applyMap); } catch (e) {} }
      map = current || null;
      if (map) map.on('style.load', applyMap);
    }
    applyMap();
  }
  function choose(value) {
    active = !!value; window.__wmSatellite = active;
    try { localStorage.setItem(KEY, active ? 'satellite' : 'osm'); } catch (e) {}
    refresh(); window.dispatchEvent(new Event('resize'));
  }
  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-wm-satellite-action]')) { event.preventDefault(); choose(!active); }
  }, true);
  document.addEventListener('change', function (event) {
    if (event.target && event.target.matches && event.target.matches('[data-wm-satellite-setting]')) choose(event.target.checked);
  }, true);
  window.addEventListener('storage', function (event) { if (event.key === KEY) choose(event.newValue === 'satellite'); });
  window.addEventListener('wm-map-host-ready', refresh);
  window.addEventListener('resize', refresh);
  var observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; refresh(); });
  });
  observer.observe(document.body, {childList: true, subtree: true});
  document.documentElement.setAttribute('data-wm-satellite-version', '20261019-controls-1');
  refresh();
})();
