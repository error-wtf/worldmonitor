/* BINGSI Buoy Overlay — rendert Wellen-Bojen auf der Worldmap (2D+3D).
   Laedt /worldmapp/data/buoys.json (GeoJSON, Z=Wellenhoehe) und setzt
   Globe-Overlay-Marker im etablierten DOM-Stil (.ais-vessel-marker-Muster). */
(function () {
  'use strict';
  var REFRESH_MS = 10 * 60 * 1000;
  var MAX = 400; // Marker-Budget
  function el(tag, cls, css) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (css) d.textContent = css;
    return d;
  }
  function sstColor(c) {
    if (c == null) return '#778899';
    if (c < 0) return '#2038c8';
    if (c < 8) return '#2e7cd6';
    if (c < 16) return '#2fbfa8';
    if (c < 23) return '#e8d24a';
    if (c < 28) return '#f08c3a';
    return '#e33d3d';
  }
  function colorFor(h) {
    if (h == null) return '#5fb0d9';
    if (h < 1) return '#39c6a0';
    if (h < 2) return '#f5c542';
    if (h < 4) return '#f59042';
    return '#f54242';
  }
  function render(fc) {
    var host = document.querySelector('.map-wrapper') || document.querySelector('#globe-container') || document.querySelector('main');
    if (!host) return false;
    var old = document.getElementById('bingsi-buoy-layer');
    if (old) old.remove();
    var layer = el('div'); layer.id = 'bingsi-buoy-layer';
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:51;';
    var feats = (fc.features || []).filter(function (f) { return f.properties && f.properties.kind === 'buoy'; });
    var ssts = (fc.features || []).filter(function (f) { return f.properties && f.properties.kind === 'sst'; });
    var curs = (fc.features || []).filter(function (f) { return f.properties && f.properties.kind === 'current'; });
    // SST-Zonen: grosse weiche Kreise (blau kalt -> rot heiss)
    ssts.forEach(function (f) {
      var pr = f.properties, g = f.geometry.coordinates;
      var s = document.createElement('div');
      var c = sstColor(pr.sstC);
      var size = 26;
      s.className = 'bingsi-sst-marker';
      s.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;border-radius:50%;'
        + 'background:radial-gradient(circle,' + c + 'cc 0%,' + c + '33 70%,transparent 100%);'
        + 'pointer-events:auto;cursor:pointer;transform:translate(-50%,-50%);z-index:50;';
      s.title = 'Meeresoberflaeche ' + Number(pr.sstC).toFixed(1) + ' C @ ' + g[1] + ',' + g[0];
      s.dataset.lat = g[1]; s.dataset.lon = g[0]; s.dataset.z = g[2] || 0;
      layer.appendChild(s);
    });
    // Meeresstroemungen: kleine Pfeile in Stromrichtung
    curs.forEach(function (f) {
      var pr = f.properties, g = f.geometry.coordinates;
      var s = document.createElement('div');
      var rot = ((pr.dirDeg || 0) + 180) % 360;
      s.className = 'bingsi-current-marker';
      s.style.cssText = 'position:absolute;width:0;height:0;border-left:5px solid transparent;'
        + 'border-right:5px solid transparent;border-bottom:11px solid #37e2e2;'
        + 'pointer-events:auto;cursor:pointer;transform:translate(-50%,-50%) rotate(' + rot + 'deg);z-index:50;'
        + 'filter:drop-shadow(0 0 3px #37e2e288);';
      s.title = 'Stroemung ' + Number(pr.speed || 0).toFixed(2) + ' m/s Richtung ' + (pr.dirDeg || 0) + 'deg (' + (pr.region || '') + ')';
      s.dataset.lat = g[1]; s.dataset.lon = g[0]; s.dataset.z = g[2] || 0;
      layer.appendChild(s);
    });
    feats.sort(function (a, b) {
      var ha = a.properties.waveHeightM || 0, hb = b.properties.waveHeightM || 0;
      return hb - ha;
    }).slice(0, MAX).forEach(function (f) {
      var p = f.properties, g = f.geometry.coordinates;
      var m = el('div', 'bingsi-buoy-marker');
      var size = p.waveHeightM != null ? Math.min(6 + p.waveHeightM * 3, 18) : 6;
      m.style.cssText = 'position:absolute;width:' + size + 'px;height:' + size + 'px;border-radius:50%;'
        + 'background:' + colorFor(p.waveHeightM) + ';border:1.5px solid rgba(0,0,0,.55);'
        + 'box-shadow:0 0 6px ' + colorFor(p.waveHeightM) + '99;pointer-events:auto;cursor:pointer;'
        + 'transform:translate(-50%,-50%);z-index:51;';
      m.title = (p.name || p.id) + ' — Welle ' + (p.waveHeightM != null ? p.waveHeightM.toFixed(1) + ' m' : 'k.A.')
        + (p.windSpeedMs != null ? ' | Wind ' + p.windSpeedMs.toFixed(0) + ' m/s' : '')
        + (p.waterTempC != null ? ' | Wasser ' + p.waterTempC.toFixed(1) + '°C' : '');
      m.dataset.lat = g[1]; m.dataset.lon = g[0]; m.dataset.z = g[2] || 0;
      layer.appendChild(m);
    });
    host.appendChild(layer);
    return true;
  }
  function project() {
    var host = document.querySelector('.map-wrapper');
    var layer = document.getElementById('bingsi-buoy-layer');
    if (!host || !layer || !layer.children.length) return;
    // 2D: SVG/Deck-Projektion nutzen falls vorhanden, sonst ausblenden (Globe rendert via Globe-eigene Marker)
    var deck = document.querySelector('.mapboxgl-canvas-container, .deckgl-overlay, canvas');
    if (!deck) { layer.style.display = 'none'; return; }
    layer.style.display = '';
    // einfache equirectangular Projektion auf Containergroesse (Deck-Canvas deckt Weltansicht)
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
    fetch('/worldmapp/data/buoys.json?t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (fc) { lastFc = fc; if (render(fc)) project(); })
      .catch(function () {});
  }
  var lastFc = null;
  function tryRender() { if (lastFc && render(lastFc)) project(); }
  function boot() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var host = document.querySelector('.map-wrapper') || document.querySelector('#globe-container') || document.querySelector('main');
      if (host) { clearInterval(iv); tryRender(); }
      else if (tries > 60) clearInterval(iv);
    }, 1000);
    load();
    setInterval(load, REFRESH_MS);
    window.addEventListener('resize', project);
    // nach Karte-Initialisierung erneut projizieren
    setTimeout(project, 3000); setTimeout(project, 8000);
    setInterval(project, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setInterval(function () {
    if (lastFc && !document.getElementById('bingsi-buoy-layer')) { tryRender(); }
  }, 20000);
})();
