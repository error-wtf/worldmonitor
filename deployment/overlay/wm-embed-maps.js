/* WM Embed-Maps v3 (r42) — operator: 'immer nen link zu den original seiten
 * einbauen bei allen maps die wir nicht selber hosten'. Jeder Embed-Mode
 * bekommt einen sichtbaren "Original"-Link in der Panel-Ecke.
 *  ICE    = iceinmyarea.org (direkt, kein XFO)
 *  BRD    = brdmap.de via Proxy (die Karte rendert, Font-404 kosmetisch)
 *  UNREST = unrest.network via Port 8443 (1:1, Hydration-faehig)
 *  ROUTE  = maps.openrouteservice.org (direkt, kein XFO)
 *  WINDY  = Link (die Windy-Tiles sind session-auth 403 — Einbettung
 *           nicht sauber moeglich; der Link fuehrt zur Cams-Karte).
 */
(function () {
  'use strict';
  if (window.__wmEmbedMaps) return;
  window.__wmEmbedMaps = 1;

  var SIBS = ['wmRadarMapmodeAPI', 'wmSdrMapmodeAPI', 'wmSporenMapmodeAPI',
    'wmMafiaMapmodeAPI', 'wmOcindexMapmodeAPI', 'wmWeatherMapmodeAPI',
    'wmCortegeMapmodeAPI'];

  function closeSiblings() {
    for (var k = 0; k < SIBS.length; k++) {
      var a = window[SIBS[k]];
      if (a && a.isOpen && a.isOpen() && a.close) a.close();
    }
  }
  function tEl() { return document.getElementById('mapDimensionToggle'); }
  function mapSection() {
    return document.getElementById('mapSection') || document.querySelector('main') || document.body;
  }
  function headerH(ms) {
    var h = ms.querySelector('[class*="header" i]');
    return h ? h.offsetHeight + 4 : 42;
  }

  var MODES = {
    ice: { btn: 'ICE', title: 'ICE Activity Tracker (iceinmyarea.org)', frameId: 'wm-ice-embed',
      src: 'https://www.iceinmyarea.org/', orig: 'https://www.iceinmyarea.org/' },
    brd: { btn: 'BRD', title: 'BRDMap Original (brdmap.de) — ueber Proxy', frameId: 'wm-brd-embed',
      src: '/worldmapp/embed/brdmap/', orig: 'https://brdmap.de/' },
    unrest: { btn: 'UNREST', title: 'UNREST.network Original-Map — 1:1', frameId: 'wm-unrest-embed',
      src: 'https://exit-matrix.net:8443/map', orig: 'https://www.unrest.network/map' },
    route: { btn: 'ROUTE', title: 'OpenRouteService Routenplaner (open source)', frameId: 'wm-route-embed',
      src: 'https://maps.openrouteservice.org/#/directions/Darmstadt%2C%20HE%2C%20Deutschland/Rom%2C%20RM%2C%20Italien',
      orig: 'https://maps.openrouteservice.org/' }
  };
  var LINKS = [];  // 20261116: WINDY-Externe-Link entfernt — wm-windy-map-v7.js liefert den Embed-Modus (Zeile 9 seiner Kopfzeile: separater Link obsolet).
  var frames = {}, wraps = {}, active = null, btns = {};

  function closeSiblingsSelf() {
    Object.keys(frames).forEach(function (k) { if (frames[k]) frames[k].style.display = 'none'; });
    Object.keys(btns).forEach(function (k) { if (btns[k]) btns[k].classList.remove('active'); });
    active = null;
  }
  function ensureWrap(mode) {
    var ms = mapSection(); if (!ms) return null;
    var def = MODES[mode];
    if (wraps[mode] && wraps[mode].isConnected) return wraps[mode];
    var w = document.createElement('div');
    w.id = def.frameId + '-wrap';
    var top = headerH(ms);
    w.style.cssText = 'position:absolute;left:0;right:0;top:' + top + 'px;bottom:0;height:calc(100% - ' + top + 'px);z-index:60;display:none;background:#0d1117;';
    if (getComputedStyle(ms).position === 'static') ms.style.position = 'relative';
    var f = document.createElement('iframe');
    f.id = def.frameId;
    f.src = def.src;
    f.title = def.title;
    f.setAttribute('loading', 'lazy');
    f.style.cssText = 'width:100%;height:100%;border:0;';
    var ol = document.createElement('a');
    ol.href = def.orig;
    ol.target = '_blank';
    ol.rel = 'noopener noreferrer';
    ol.textContent = '\u2197 Original';
    ol.title = def.title + ' — Original-Seite';
    ol.style.cssText = 'position:absolute;top:8px;right:10px;z-index:5;background:rgba(10,14,12,.85);border:1px solid #2c4557;border-radius:6px;padding:3px 9px;color:#00e5ff;font:700 10px monospace;text-decoration:none;cursor:pointer;';
    w.appendChild(f);
    w.appendChild(ol);
    ms.appendChild(w);
    wraps[mode] = w;
    frames[mode] = f;
    return w;
  }
  function hideAll() {
    Object.keys(wraps).forEach(function (k) { if (wraps[k]) wraps[k].style.display = 'none'; });
    Object.keys(btns).forEach(function (k) { if (btns[k]) btns[k].classList.remove('active'); });
    active = null;
  }
  function show(mode) {
    closeSiblings();
    hideAll();
    var w = ensureWrap(mode); if (!w) return;
    active = mode;
    w.style.display = 'block';
    if (btns[mode]) btns[mode].classList.add('active');
  }

  function ensureButtons() {
    var t = tEl(); if (!t) return;
    Object.keys(MODES).forEach(function (mode) {
      var def = MODES[mode];
      if (t.querySelector('[data-wmembed="' + mode + '"]')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-dim-btn';
      b.setAttribute('data-wmembed', mode);
      b.textContent = def.btn;
      b.title = def.title;
      b.addEventListener('click', function () { if (active === mode) hideAll(); else show(mode); });
      t.appendChild(b);
      btns[mode] = b;
    });
    LINKS.forEach(function (L) {
      if (t.querySelector('[' + L.attr + ']')) return;
      var a = document.createElement('a');
      a.href = L.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.className = 'map-dim-btn';
      a.setAttribute(L.attr, '1');
      a.textContent = L.btn; a.title = L.title;
      a.style.textDecoration = 'none';
      t.appendChild(a);
    });
  }

  function tryInit() { ensureButtons(); }
  tryInit();
  new MutationObserver(tryInit).observe(document.documentElement, { childList: true, subtree: true });

  window.wmEmbedMapsAPI = {
    isOpen: function () { return active !== null; },
    activeMode: function () { return active; },
    close: hideAll,
    open: function (mode) { if (MODES[mode]) show(mode); }
  };
})();
