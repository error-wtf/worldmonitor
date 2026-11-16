/* wm-layer-icons.js — Ebenen-Emojis auf 2D/3D (operator 28.10.: 'symbole
   equivalent zu den symbolen in der ebenen einstellung').
   3D: die globe-gl html-marker tragen ihr layer '_kind' im datensatz und
   ihr DOM-element in '__threeObjHtml' — emoji wird direkt je marker
   eingesetzt (garantiert richtige zuordnung, MutationObserver-frei,
   intervall-geprüft). Die farbe bleibt als halo, das emoji macht die
   ebene sofort erkennbar. 2D: wm-eonet bekommt ein vulkan-symbol-layer
   (protests hat bereits das megaphone-icon aus osm-overlay v24/25). */
(function () {
  'use strict';
  if (window.__wmLayerIcons) return;
  window.__wmLayerIcons = true;

  var EMOJI = [
    ['conflictzone', '\u2694\uFE0F'],
    ['ucdp', '\u2694\uFE0F'],
    ['armedconflict', '\u2694\uFE0F'],
    ['protest', '\uD83D\uDCE2'],
    ['unrest', '\uD83D\uDCE2'],
    ['fire', '\uD83D\uDD25'],
    ['eonet', '\uD83C\uDF0B'],
    ['earthquake', '\uD83C\uDF0B'],
    ['natural', '\uD83C\uDF0B'],
    ['irradiator', '\u26A0\uFE0F'],
    ['nuclear', '\u2622\uFE0F'],
    ['radiation', '\u2622\uFE0F'],
    ['spaceport', '\uD83D\uDE80'],
    ['cable', '\uD83D\uDD0C'],
    ['pipeline', '\uD83D\uDEE2\uFE0F'],
    ['datacenter', '\uD83D\uDDA5\uFE0F'],
    ['militaryactivity', '\u2708\uFE0F'],
    ['militarybase', '\uD83C\uDFDB\uFE0F'],
    ['military', '\u2708\uFE0F'],
    ['vessel', '\uD83D\uDEA2'],
    ['aisdisruption', '\uD83D\uDEA2'],
    ['ship', '\uD83D\uDEA2'],
    ['trade', '\u2693'],
    ['chokepoint', '\u2693'],
    ['port', '\u2693'],
    ['flight', '\u2708\uFE0F'],
    ['aviation', '\u2708\uFE0F'],
    ['displacement', '\uD83D\uDC65'],
    ['climate', '\uD83C\uDF2B\uFE0F'],
    ['weather', '\u26C8\uFE0F'],
    ['outage', '\uD83D\uDCE1'],
    ['gpsjam', '\uD83D\uDCE1'],
    ['gps', '\uD83D\uDCE1'],
    ['internet', '\uD83D\uDCE1'],
    ['sanction', '\uD83D\uDCCB'],
    ['hotspot', '\uD83C\uDFAF'],
    ['mineral', '\uD83D\uDC8E'],
    ['economic', '\uD83D\uDCB0'],
    ['satellite', '\uD83D\uDEF0\uFE0F'],
    ['cii', '\uD83C\uDF0E'],
    ['hospital', '\uD83C\uDFE5'],
    ['webcam', '\uD83D\uDCF7'],
    ['osm', '\uD83C\uDFE0']
  ];

  function emojiFor(kind) {
    if (!kind) return null;
    var k = String(kind).toLowerCase();
    for (var i = 0; i < EMOJI.length; i++) {
      if (k.indexOf(EMOJI[i][0]) !== -1) return EMOJI[i][1];
    }
    return null;
  }

  function decorate3d() {
    var host = window.__wmGlobeHost;
    var g = host && host.mapInstance;
    if (!g || !g.htmlElementsData) return 0;
    var data;
    try { data = g.htmlElementsData(); } catch (e) { return 0; }
    if (!Array.isArray(data)) return 0;
    var neu = 0;
    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      var el = d && d.__threeObjHtml && d.__threeObjHtml.element;
      if (!el || el.dataset.wmIcon) continue;
      var em = emojiFor(d._kind || d.kind);
      if (!em) { el.dataset.wmIcon = 'none'; continue; }
      try {
        var sp = document.createElement('span');
        sp.className = 'wm-layer-emoji';
        sp.textContent = em;
        sp.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-52%);font-size:10px;line-height:1;pointer-events:none;text-shadow:0 0 3px rgba(0,0,0,.9);';
        var pos = getComputedStyle(el).position;
        if (pos === 'static') el.style.position = 'relative';
        el.appendChild(sp);
        el.dataset.wmIcon = '1';
        neu++;
      } catch (e2) {}
    }
    return neu;
  }

  function decorate2d() {
    try {
      var host = window.__wmMapHost;
      var m = host && host.mapInstance;
      if (!m || !m.getSource || !m.getSource('eonet-source')) {
        /* source-name unbekannt — aus dem layer ableiten, einmalig */
        if (!m) return;
        var ls = m.getStyle().layers;
        var src = null;
        for (var i = 0; i < ls.length; i++) {
          if (ls[i].id === 'wm-eonet') { src = ls[i].source; break; }
        }
        if (!src || m.getLayer('wm-eonet-icons')) return;
        if (!m.hasImage('wm-emoji-volcano')) {
          var cv = document.createElement('canvas');
          cv.width = 32; cv.height = 32;
          var cx = cv.getContext('2d');
          cx.font = '24px serif';
          cx.textAlign = 'center';
          cx.textBaseline = 'middle';
          cx.fillText('\uD83C\uDF0B', 16, 17);
          m.addImage('wm-emoji-volcano', cv);
        }
        m.addLayer({
          id: 'wm-eonet-icons',
          type: 'symbol',
          source: src,
          layout: { 'symbol-placement': 'point', 'icon-image': 'wm-emoji-volcano', 'icon-size': 0.55, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
          paint: { 'icon-opacity': 0.95 }
        }, 'wm-eonet');
      }
    } catch (e) {}
  }


  /* 2D: div-marker je Kategorie mit Emoji dekorieren (gleiche Symbole wie die
     Legende/3D; Farbe bleibt als Punkt-Halo). port-marker hat eigenes icon. */
  var MARKER_CLASS_EMOJI = [
    ['nuclear-marker', '\u2622\uFE0F'],
    ['radiation-watch-marker', '\u2622\uFE0F'],
    ['datacenter-marker', '\uD83D\uDDA5\uFE0F'],
    ['base-marker', '\uD83C\uDFDB\uFE0F'],
    ['conflict-event-marker', '\u2694\uFE0F'],
    ['protest-marker', '\uD83D\uDCE2'],
    ['tech-hq-marker', '\uD83C\uDFE2'],
    ['startup-hub-marker', '\uD83D\uDE80'],
    ['accelerator-marker', '\uD83D\uDE80'],
    ['cloud-region-marker', '\u2601\uFE0F'],
    ['spaceport-marker', '\uD83D\uDE80'],
    ['mineral-marker', '\uD83D\uDC8E'],
    ['economic-marker', '\uD83D\uDCB0'],
    ['outage-marker', '\uD83D\uDCE1'],
    ['nat-event-marker', '\uD83C\uDF0B'],
    ['weather-marker', '\uD83C\uDF26\uFE0F'],
    ['flight-delay-marker', '\u2708\uFE0F'],
    ['military-flight-marker', '\u2708\uFE0F'],
    ['military-vessel-marker', '\uD83D\uDEA2'],
    ['repair-ship-marker', '\uD83D\uDEA2'],
    ['ais-disruption-marker', '\uD83D\uDEA2'],
    ['cable-advisory-marker', '\uD83D\uDD0C'],
    ['geo-activity-marker', '\uD83C\uDFAF'],
    ['tech-activity-marker', '\uD83D\uDDA5\uFE0F'],
    ['iran-event-marker', '\uD83C\uDFAF'],
    ['hospital-marker', '\uD83C\uDFE5']
  ];

  function decorate2dMarkers() {
    var host = window.__wmMapHost;
    var c = host && (host.container || (host.mapInstance && host.mapInstance.getContainer && host.mapInstance.getContainer()));
    if (!c || !c.querySelectorAll) return 0;
    var els = c.querySelectorAll('[class*="-marker"]');
    var neu = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.dataset.wmIcon2d) continue;
      var cls = (el.className || '').toString().toLowerCase();
      var em = null;
      for (var j = 0; j < MARKER_CLASS_EMOJI.length; j++) {
        if (cls.indexOf(MARKER_CLASS_EMOJI[j][0]) !== -1) { em = MARKER_CLASS_EMOJI[j][1]; break; }
      }
      if (!em) { el.dataset.wmIcon2d = 'none'; continue; }
      try {
        var sp = document.createElement('span');
        sp.className = 'wm-layer-emoji-2d';
        sp.textContent = em;
        sp.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:9px;line-height:1;pointer-events:none;z-index:2;text-shadow:0 0 3px rgba(0,0,0,.9);';
        var pos = getComputedStyle(el).position;
        if (pos === 'static') el.style.position = 'relative';
        el.appendChild(sp);
        el.dataset.wmIcon2d = '1';
        neu++;
      } catch (e2) {}
    }
    return neu;
  }

  var iv = setInterval(function () {
    try {
      decorate3d();
      decorate2d();
      decorate2dMarkers();
    } catch (e) {}
  }, 1500);
  setTimeout(function () { try { decorate3d(); decorate2d(); decorate2dMarkers(); } catch (e) {} }, 2500);
})();
