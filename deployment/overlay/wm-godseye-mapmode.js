/* wm-godseye-mapmode.js — GODSEYE-Kartenmodus: God's Eye View (Cesium) als
 * dritte Kartenvariante neben 2D/3D (operator 09.11.2026).
 *
 * r37c/v4 (operator: 'das ist nicht das ganze gods eye'): DEFAULT ist jetzt die
 * VOLLSTAENDIGE GEV-App (alle Panels: DATA LAYERS, UTILITIES, WEATHER, HUD,
 * Welcome, Voice-Setup ...). Der kleine CLEAN-Schalter in der Panel-Ecke
 * toggelt auf den nackten Globus (?embed=1) und zurueck. Das Framing der
 * Voll-App ist auf dem Proxy freigegeben (XFO weg, CSP 1:1 mit
 * frame-ancestors https://exit-matrix.net — generiert aus dem live Header).
 *
 * GEV ist self-hosted auf dem VPS (systemd gev.service, Node 24.22.2,
 * /opt/gods-eye-view) und laeuft hinter nginx auf https://exit-matrix.net:8445
 * (1:1-Proxy auf 127.0.0.1:4173, UNREST-8443-Muster).
 *
 * Gemeinsamer Zustand Stufe 1: beim Oeffnen wird die aktuelle WM-Kameraposition
 * (2D-Center/Zoom oder 3D-pov) als GEV-Share-Link-Hash (#v=2&lat..&alt..)
 * uebergeben — GEV startet dort, wo die Worldmap gerade hinsieht.
 * Live-Zweiweg-Sync = Phase 2 (Backlog, postMessage {type:'gev:view'}).
 *
 * Exklusivitaet: schliesst alle anderen Modi (APIs + WINDY-Restore), und der
 * zentrale wm-mapmode-guard.js kennt den Gottesseye-Button + API ebenfalls
 * (r5). Iframe-ID folgt dem Guard-Sweep-Muster wm-*-embed. Nach Guard-Sweep
 * wird das iframe im lebenden Wrap NEU EINGEBAUT (v3-Fix).
 * Original-Link-Pflicht: ↗ godseyeview.ai (Projekt von Bilawal Sidhu, MIT).
 */
(function () {
  'use strict';
  if (window.__wmGodseyeMapmode) return;
  window.__wmGodseyeMapmode = true;

  var btn = null, wrap = null, iframe = null, toggle = null;
  var gevActive = false, modeWired = false, lastActive = null;
  var gevHash = '';
  var cleanMode = false; /* false = VOLL-App (operator-Default), true = nackter Globus */

  var GEV_BASE = 'https://exit-matrix.net:8445';

  var SIBS = ['wmRadarMapmodeAPI', 'wmSdrMapmodeAPI', 'wmSporenMapmodeAPI',
    'wmOcindexMapmodeAPI', 'wmMafiaMapmodeAPI', 'wmCortegeMapmodeAPI',
    'wmWeatherMapmodeAPI', 'wmEmbedMapsAPI'];

  function toggleEl() {
    return document.getElementById('mapDimensionToggle') ||
      document.querySelector('.map-dimension-toggle');
  }

  /* WINDY-Zustand restaurieren (gleiche Logik wie wm-mapmode-guard.js) */
  function restoreWindy() {
    var hosts = document.querySelectorAll('[data-windy-prev-vis],[data-windy-prev-display],[data-windy-prev-display-p]');
    for (var i = 0; i < hosts.length; i++) {
      var h = hosts[i];
      try {
        if (h.hasAttribute('data-windy-prev-vis')) {
          h.style.visibility = h.getAttribute('data-windy-prev-vis');
          h.removeAttribute('data-windy-prev-vis');
        }
        if (h.hasAttribute('data-windy-prev-display')) {
          h.style.display = h.getAttribute('data-windy-prev-display');
          h.removeAttribute('data-windy-prev-display');
        }
        if (h.hasAttribute('data-windy-prev-display-p')) {
          h.style.display = h.getAttribute('data-windy-prev-display-p');
          h.removeAttribute('data-windy-prev-display-p');
        }
      } catch (e) {}
    }
    try { localStorage.removeItem('wm-windy-mode-on'); } catch (e) {}
    var onEls = document.querySelectorAll('.wm-windy-mode-on');
    for (var j = 0; j < onEls.length; j++) onEls[j].classList.remove('wm-windy-mode-on');
    var wb = document.getElementById('wmWindyModeBtn');
    if (wb) { wb.classList.remove('active'); wb.setAttribute('aria-pressed', 'false'); }
    var wf = document.querySelectorAll('.wm-windy-mode-frame');
    for (var k = 0; k < wf.length; k++) wf[k].remove();
  }

  function closeSiblings() {
    for (var k = 0; k < SIBS.length; k++) {
      try {
        var a = window[SIBS[k]];
        if (a && a.isOpen && a.isOpen() && a.close) a.close();
      } catch (e) {}
    }
    restoreWindy();
  }

  var st = null;
  function ensureStyle() {
    if (st && st.isConnected) return;
    st = document.createElement('style');
    st.id = 'wm-godseye-hide-style';
    st.textContent = 'body.wm-embed-active #wm-osm-panel,body.wm-embed-active #wm-osm-floating-btn,body.wm-embed-active .wm-osm-popup,body.wm-embed-active .wm-point-weather{display:none !important;}body.wm-embed-active .map-dimension-toggle{position:relative !important;z-index:2147483002 !important;}';
    document.head.appendChild(st);
  }

  function mapSection() {
    return document.getElementById('mapSection') ||
      document.querySelector('main') || document.body;
  }
  function headerH(ms) {
    var h = ms.querySelector('[class*="header" i]');
    return (h && h.offsetHeight > 10) ? h.offsetHeight + 4 : 42;
  }

  /* ---- gemeinsamer Zustand Stufe 1: WM-Kamera -> GEV-Share-Hash ---- */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function zoomToAltitudeM(zoom, lat) {
    var mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    return Math.round(clamp(mpp * 2143, 600, 12000000));
  }

  function currentWmCamera() {
    /* 2D: maplibre via wm-bridge */
    try {
      var host = window.__wmMapHost || {};
      var mi = host.mapInstance;
      if (mi && typeof mi.getCenter === 'function') {
        var c = mi.getCenter();
        var z = typeof mi.getZoom === 'function' ? mi.getZoom() : 4;
        if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
          return { lat: c.lat, lon: c.lng, alt: zoomToAltitudeM(z, c.lat) };
        }
      }
    } catch (e) {}
    /* 3D: globe.gl pointOfView (altitude in km) */
    try {
      var gh = window.__wmGlobeHost || {};
      var gm = gh.mapInstance;
      if (gm && typeof gm.pointOfView === 'function') {
        var pov = gm.pointOfView();
        if (pov && typeof pov.lat === 'number' && typeof pov.lng === 'number') {
          var altM = Math.round(clamp((pov.altitude || 2.5) * 6371000, 600, 12000000));
          return { lat: pov.lat, lon: pov.lng, alt: altM };
        }
      }
    } catch (e) {}
    /* Fallback: Rüsselsheim, Regionalansicht */
    return { lat: 49.988, lon: 8.439, alt: 800000 };
  }

  function gevUrl() {
    var cam = currentWmCamera();
    gevHash = 'v=2&lat=' + cam.lat.toFixed(4) +
      '&lon=' + cam.lon.toFixed(4) +
      '&alt=' + cam.alt +
      '&heading=0&pitch=-90&roll=0';
    return GEV_BASE + (cleanMode ? '/?embed=1#' : '/?#') + gevHash;
  }

  function styleToggle() {
    if (!toggle) return;
    toggle.textContent = cleanMode ? 'VOLL' : 'CLEAN';
    toggle.title = cleanMode
      ? 'Vollstaendige GEV-App zeigen (alle Panels + HUD)'
      : 'Nackten Globus ohne HUD zeigen (?embed=1)';
  }

  function buildFrameInto(w) {
    iframe = document.createElement('iframe');
    iframe.id = 'wm-godseye-embed';
    iframe.title = "God's Eye View — 3D OSINT-Cockpit (Cesium, self-hosted)";
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('allow', 'fullscreen; autoplay; microphone');
    iframe.style.cssText = 'width:100%;height:100%;border:0;';
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.style.cssText = 'position:absolute;top:8px;right:130px;z-index:5;background:rgba(10,14,12,.85);border:1px solid rgba(0,229,255,.45);border-radius:6px;padding:3px 9px;color:#00e5ff;font:700 10px monospace;text-decoration:none;cursor:pointer;';
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      cleanMode = !cleanMode;
      styleToggle();
      if (iframe) iframe.setAttribute('src', gevUrl());
    });
    styleToggle();
    var ol = document.createElement('a');
    ol.href = 'https://godseyeview.ai/';
    ol.target = '_blank';
    ol.rel = 'noopener noreferrer';
    ol.textContent = '\u2197 godseyeview.ai';
    ol.title = "God's Eye View — Original-Projekt (Bilawal Sidhu, MIT). Unsere Instanz laeuft self-hosted auf exit-matrix.net:8445.";
    ol.style.cssText = 'position:absolute;top:8px;right:10px;z-index:5;background:rgba(10,14,12,.85);border:1px solid rgba(0,229,255,.45);border-radius:6px;padding:3px 9px;color:#00e5ff;font:700 10px monospace;text-decoration:none;cursor:pointer;';
    w.appendChild(iframe);
    w.appendChild(toggle);
    w.appendChild(ol);
  }

  function ensureWrap() {
    var ms = mapSection(); if (!ms) return null;
    if (wrap && wrap.isConnected) {
      /* Der zentrale Guard-Sweep entfernt nur das iframe, nicht den Wrap:
         Rahmen wiederverwenden, iframe + Origin-Link neu einsetzen. */
      if (!iframe || !iframe.isConnected || iframe.parentElement !== wrap) {
        buildFrameInto(wrap);
      }
      return wrap;
    }
    wrap = document.createElement('div');
    wrap.id = 'wm-godseye-embed-wrap';
    var top = headerH(ms);
    wrap.style.cssText = 'position:absolute;left:0;right:0;top:' + top + 'px;bottom:0;height:calc(100% - ' + top + 'px);z-index:60;display:none;background:#05080d;';
    if (getComputedStyle(ms).position === 'static') ms.style.position = 'relative';
    buildFrameInto(wrap);
    ms.appendChild(wrap);
    return wrap;
  }

  function hideGev() {
    gevActive = false;
    if (wrap) wrap.style.display = 'none';
    if (btn) btn.classList.remove('active');
    if (lastActive && lastActive.isConnected) lastActive.classList.add('active');
    /* wm-embed-active nur entfernen, wenn kein anderer Embed mehr offen ist */
    var anyOpen = SIBS.some(function (n) {
      try { var a = window[n]; return !!(a && a.isOpen && a.isOpen()); } catch (e) { return false; }
    });
    if (!anyOpen) document.body.classList.remove('wm-embed-active');
  }

  function showGev() {
    closeSiblings();
    ensureStyle();
    var w = ensureWrap(); if (!w) return;
    /* Kamera-Hash NUR beim ersten Oeffnen setzen (nicht bei Re-Show) */
    if (!iframe.getAttribute('src')) iframe.setAttribute('src', gevUrl());
    var t = toggleEl();
    var cur = t ? t.querySelector('.map-dim-btn.active') : null;
    if (cur && cur !== btn) { lastActive = cur; cur.classList.remove('active'); }
    gevActive = true;
    document.body.classList.add('wm-embed-active');
    w.style.display = 'block';
    if (btn) btn.classList.add('active');
  }

  function wireModes() {
    if (modeWired) return;
    var t = toggleEl(); if (!t) return;
    var modes = t.querySelectorAll('.map-dim-btn[data-mode="globe"], .map-dim-btn[data-mode="flat"]');
    if (!modes.length) return;
    modeWired = true;
    modes.forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (!gevActive) return;
        e.stopPropagation();
        e.preventDefault();
        hideGev();
      }, true);
    });
  }

  function ensureButton() {
    var t = toggleEl();
    if (!t) return false;
    if (!(btn && btn.isConnected)) {
      btn = t.querySelector('[data-godseyebtn]');
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'map-dim-btn';
        btn.setAttribute('data-godseyebtn', '1');
        btn.type = 'button';
        btn.textContent = 'GODSEYE';
        btn.title = "God's Eye View — 3D OSINT-Globus (Cesium: Flüge, Militär, Satelliten, Beben, Kameras, Wind). Self-hosted, startet an der aktuellen Kartenposition.";
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (gevActive) hideGev(); else showGev();
        });
        /* nach den nativen 2D/3D-Buttons, vor WETTER */
        var anchor = t.querySelector('[data-weatherbtn], [data-wmlinkwindy], [data-windybtn]');
        if (anchor && anchor.parentElement === t) t.insertBefore(btn, anchor);
        else t.insertBefore(btn, t.firstChild);
      }
    }
    /* Selbstheilung: hat der Guard oder ein Rebuild das Iframe entfernt,
       sauber deaktivieren (Wrap zu, embed-active raeumen, Button-State). */
    if (gevActive && (!iframe || !iframe.isConnected)) {
      hideGev();
    }
    wireModes();
    if (gevActive && wrap && wrap.isConnected && wrap.style.display === 'none') {
      wrap.style.display = 'block';
    }
    return true;
  }

  var tries = 0;
  (function boot() {
    tries++;
    if (ensureButton()) return;
    if (tries < 240) setTimeout(boot, 500);
  })();
  setInterval(function () { try { ensureButton(); } catch (e) {} }, 2000);

  window.wmGodseyeMapmodeAPI = {
    isOpen: function () { return gevActive; },
    close: function () { if (gevActive) hideGev(); },
    open: function () { if (!gevActive) showGev(); },
    version: '20261109-4'
  };
})();
