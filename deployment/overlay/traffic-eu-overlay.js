(function () {
  var REFRESH_MS = 30 * 60 * 1000;
  function el(tag) { var d = document.createElement(tag); return d; }
  var COLORS = { 'road-closed': '#e74c3c', 'queing-traffic': '#f39c12', 'slow-traffic': '#f1c40f', 'stationary-traffic': '#e67e22', 'jam': '#e91e63', 'rail-delay': '#9b59b6' };
  function colorFor(p) { return COLORS[p.kind] || '#f39c12'; }
  var LAYER_ID = 'bingsi-traffic-eu-layer';
  function render(sources) {
    var host = document.querySelector('.map-wrapper') || document.querySelector('#globe-container') || document.querySelector('main');
    if (!host) return false;
    var old = document.getElementById(LAYER_ID); if (old) old.remove();
    var layer = el('div'); layer.id = LAYER_ID;
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:52;';
    var n = 0;
    sources.forEach(function (fc) {
      (fc.features || []).forEach(function (f) {
        var p = f.properties || {}; var c = f.geometry && f.geometry.coordinates;
        if (!c) return;
        var dot = el('div');
        var col = colorFor(p);
        dot.style.cssText = 'position:absolute;width:10px;height:10px;border-radius:50%;'
          + 'background:' + col + ';border:1.5px solid rgba(255,255,255,.85);'
          + 'box-shadow:0 0 5px ' + col + ';pointer-events:auto;cursor:pointer;'
          + 'transform:translate(-50%,-50%);z-index:52;';
        dot.title = (p.road || p.relation || p.kind || '') + (p.label ? ' - ' + p.label : '') + (p.delayMin ? ' (+' + p.delayMin + ' min)' : '');
        dot.dataset.lat = c[1]; dot.dataset.lon = c[0];
        layer.appendChild(dot); n++;
      });
    });
    host.appendChild(layer);
    layer.dataset.count = String(n);
    return true;
  }
  function project() {
    var host = document.querySelector('.map-wrapper');
    var layer = document.getElementById(LAYER_ID);
    if (!host || !layer || !layer.children.length) return;
    var deck = document.querySelector('.mapboxgl-canvas-container, .deckgl-overlay, canvas');
    if (!deck) { layer.style.display = 'none'; return; }
    layer.style.display = '';
    var r = host.getBoundingClientRect();
    var shown = 0;
    Array.prototype.forEach.call(layer.children, function (m) {
      var lat = parseFloat(m.dataset.lat), lon = parseFloat(m.dataset.lon);
      var x = (lon + 180) / 360 * r.width;
      var y = (90 - lat) / 180 * r.height;
      if (x >= -20 && x <= r.width + 20 && y >= -20 && y <= r.height + 20) {
        m.style.left = x + 'px'; m.style.top = y + 'px'; shown++;
      } else { m.style.left = '-9999px'; }
    });
    layer.dataset.shown = String(shown);
  }
  function load() {
    Promise.all([
      fetch('/worldmapp/data/traffic-eu-roads.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('/worldmapp/data/traffic-eu-rail.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('/worldmapp/data/traffic-ch-rail.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ]).then(function (res) {
      var sources = res.filter(Boolean);
      if (sources.length && render(sources)) project();
    });
  }
  function boot() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var host = document.querySelector('.map-wrapper') || document.querySelector('#globe-container') || document.querySelector('main');
      if (host) { clearInterval(iv); load(); }
      else if (tries > 60) clearInterval(iv);
    }, 1000);
    setInterval(load, REFRESH_MS);
    window.addEventListener('resize', project);
    setTimeout(project, 3000); setTimeout(project, 8000);
    setInterval(project, 15000);
    setInterval(function () {
      if (!document.getElementById(LAYER_ID)) load();
    }, 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
