/* OC-Index (ocindex.net, GI-TOC) als Karten-Modus 'OCX'.
   28.10.3 (operator: 'muss im tab embed sein, nicht vollbild'): das iframe wird
   PIXELGENAU über den echten kartenbereich gelegt — gefunden über den
   maplibre/deckgl-canvas (nicht über fragilige container-klassennamen, die
   je nach layout anders matchen). position:fixed mit den koordinaten des
   kartenbereichs, re-platzierung bei resize. modus-leiste bleibt sichtbar.
   Reverse-proxy /ocindex/ (siehe nginx ocindex.conf). */
(function () {
  'use strict';
  if (window.__wmOcindexMapmode) return;
  window.__wmOcindexMapmode = true;

  var btn = null, iframe = null, olink = null;
  var active = false, modeWired = false, lastActive = null;

  var OCX_URL = '/ocindex/?utm_source=worldmonitor&utm_medium=referral&utm_campaign=general';

  function toggleEl() {
    return document.querySelector('.map-dimension-toggle');
  }
  function closeSiblings() {
    try { if (window.wmRadarMapmodeAPI && window.wmRadarMapmodeAPI.isOpen && window.wmRadarMapmodeAPI.isOpen()) window.wmRadarMapmodeAPI.close(); } catch (e) {}
    try { if (window.wmSdrMapmodeAPI && window.wmSdrMapmodeAPI.isOpen && window.wmSdrMapmodeAPI.isOpen()) window.wmSdrMapmodeAPI.close(); } catch (e) {}
    try { if (window.wmSporenMapmodeAPI && window.wmSporenMapmodeAPI.isOpen && window.wmSporenMapmodeAPI.isOpen()) window.wmSporenMapmodeAPI.close(); } catch (e) {}
    try { if (window.wmMafiaMapmodeAPI && window.wmMafiaMapmodeAPI.isOpen && window.wmMafiaMapmodeAPI.isOpen()) window.wmMafiaMapmodeAPI.close(); } catch (e) {}
  }

  var st = null;
  function ensureStyle() {
    if (st && st.isConnected) return;
    st = document.createElement('style');
    st.id = 'wm-embed-hide-style';
    st.textContent = 'body.wm-embed-active #wm-osm-panel,body.wm-embed-active #wm-osm-floating-btn,body.wm-embed-active .wm-osm-popup,body.wm-embed-active .wm-point-weather{display:none !important;}body.wm-embed-active .map-dimension-toggle{position:relative !important;z-index:2147483002 !important;}';
    document.head.appendChild(st);
  }

  /* der ECHTE kartenbereich: vom canvas hochklettern, solange die eltern
     gleich gross sind — endpunkt = groesster wrapper der kartenflaeche. */
  /* kartenbereich: maplibre-map wenn aktiv, sonst der GROESSTE sichtbare
     .map-container (bei mehreren kandidaten gewinnt der echte — layout-
     unabhaengig, keine fragilen first-match-annahmen mehr). */
  /* kartenbereich als UNION aller sichtbaren karten-flaechen — die app
     haelt 2D und 3D als GETRENNTE karten (operator), beide im DOM. union
     deckt alle sichtbaren instanzen ab, egal welcher tab aktiv ist. */
  function findMapAreas() {
    var rects = [];
    var ml = document.querySelector('.maplibregl-map');
    if (ml) {
      var r0 = ml.getBoundingClientRect();
      if (r0.width > 200 && r0.height > 200) rects.push(r0);
    }
    var nodes = document.querySelectorAll('.map-container, .map-section');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id && nodes[i].id.indexOf('wm-') === 0) continue;
      if (nodes[i].querySelector && nodes[i].querySelector('#wm-ocindex-embed, #wm-mafia-embed')) continue;
      var st = getComputedStyle(nodes[i]);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      var r = nodes[i].getBoundingClientRect();
      if (r.width > 200 && r.height > 200 && r.bottom > 0 && r.top < window.innerHeight) {
        rects.push(r);
      }
    }
    if (!rects.length) return null;
    var L = rects[0].left, T = rects[0].top, R = rects[0].right, B = rects[0].bottom;
    for (var j = 1; j < rects.length; j++) {
      L = Math.min(L, rects[j].left); T = Math.min(T, rects[j].top);
      R = Math.max(R, rects[j].right); B = Math.max(B, rects[j].bottom);
    }
    return { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T };
  }

  function placeOverMap() { /* R9: CSS-Positionierung im Karten-Viewport — keine Koordinaten mehr noetig. */ }

  function mapSection(){ return document.getElementById("mapSection"); }
  function headerH(ms){
    var h=ms.querySelector('.panel-header');
    return (h && h.offsetHeight>10) ? h.offsetHeight : 42;
  }
  function ensureIframe() {
    var ms = mapSection(); if (!ms) return null;
    if (iframe && iframe.isConnected) return iframe;
    iframe = document.createElement('iframe');
    iframe.id = 'wm-ocindex-embed';
    iframe.src = OCX_URL;
    iframe.title = 'Organized Crime Index — ocindex.net (GI-TOC)';
    iframe.setAttribute('loading', 'lazy');
    iframe.style.cssText = 'position:absolute;left:0;right:0;top:42px;bottom:0;width:100%;height:calc(100% - 42px);border:0;z-index:60;background:#0d1117;display:none;';
    if (getComputedStyle(ms).position === 'static') ms.style.position = 'relative';
    ms.appendChild(iframe);
    iframe.style.top = headerH(ms) + 'px';
    iframe.style.left = '0px';
    iframe.style.right = '0px';
    iframe.style.width = '100%';
    iframe.style.height = 'calc(100% - ' + headerH(ms) + 'px)';
    return iframe;
  }

  function ensureOriginLink() {
    var ms = mapSection(); if (!ms) return olink;
    if (olink && olink.isConnected) return olink;
    olink = document.createElement('a');
    olink.className = 'wm-ocx-origin';
    olink.href = 'https://ocindex.net/?utm_source=worldmonitor&utm_medium=referral&utm_campaign=general';
    olink.target = '_blank';
    olink.rel = 'noopener noreferrer';
    olink.textContent = '\u2197 Original: ocindex.net (GI-TOC)';
    olink.title = 'Organized Crime Index — Original in neuem Tab \u00f6ffnen';
    olink.style.cssText = 'position:absolute;z-index:61;display:none;background:rgba(13,17,23,.85);color:#ff9f43;border:1px solid rgba(255,159,67,.4);border-radius:6px;padding:4px 10px;font:12px/1.4 system-ui,sans-serif;text-decoration:none;';
    ms.appendChild(olink);
    return olink;
  }

  function hideOcindex() {
    active = false;
    if (iframe) iframe.style.display = 'none';
    if (olink) olink.style.display = 'none';
    if (btn) btn.classList.remove('active');
    if (lastActive && lastActive.isConnected) lastActive.classList.add('active');
    if (!(window.wmMafiaMapmodeAPI && window.wmMafiaMapmodeAPI.isOpen && window.wmMafiaMapmodeAPI.isOpen())) {
      document.body.classList.remove('wm-embed-active');
    }
  }

  function showOcindex() {
    closeSiblings();
    ensureStyle();
    var f = ensureIframe(); if (!f) return;
    ensureOriginLink();
    var t = toggleEl();
    var cur = t ? t.querySelector('.map-dim-btn[data-mode].active') : null;
    if (cur) { lastActive = cur; cur.classList.remove('active'); }
    active = true;
    document.body.classList.add('wm-embed-active');
    placeOverMap();
    f.style.display = 'block';
    olink.style.display = 'block';
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
        if (!active) return;
        e.stopPropagation();
        e.preventDefault();
        hideOcindex();
      }, true);
    });
  }

  function ensureButton() {
    var t = toggleEl();
    if (!t) return false;
    if (!(btn && btn.isConnected)) {
      btn = t.querySelector('[data-ocindexbtn]');
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'map-dim-btn';
        btn.setAttribute('data-ocindexbtn', '1');
        btn.type = 'button';
        btn.textContent = 'OCX';
        btn.title = 'Organized Crime Index — ocindex.net (GI-TOC) als Karten-Modus';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (active) hideOcindex(); else showOcindex();
        });
        var sporen = t.querySelector('[data-sporenbtn]');
        var mafia = t.querySelector('[data-mafiabtn]');
        if (mafia && mafia.parentElement === t) t.insertBefore(btn, mafia.nextSibling);
        else if (sporen && sporen.parentElement === t) t.insertBefore(btn, sporen.nextSibling);
        else t.appendChild(btn);
      }
    }
    wireModes();
    if (active) {
      var f = ensureIframe();
      if (f && f.style.display === 'none') f.style.display = 'block';
      placeOverMap();
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
  

  window.wmOcindexMapmodeAPI = {
    isOpen: function () { return active; },
    close: function () { if (active) hideOcindex(); }
  };
})();
