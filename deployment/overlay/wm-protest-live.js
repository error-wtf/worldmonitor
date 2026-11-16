/* wm-protest-live.js v20261030-r32 — Kombinierte Protest-Karte (operator 30.10.26):
 * unsere 2D-maplibre-Technik + ALLE protest-quellen kombiniert:
 *   1) GDELT/Unrest global (schon als wm-protests-layer vorhanden — bleibt!)
 *   2) Cortège-Events (FR-Termine: manif/blocus/rassemblement, mit Quelle+Link)
 *   3) Cortège-Live-Meldungen (live/all.json: crs/police/lacrymo/medics/legal…
 *      mit exp-Ablauf + up/down-Stimmen — wird automatisch leer, wenn keine
 *      Demos laufen, und füllt sich während der Demos selbst)
 * Technik-Regeln aus unserer Historie:
 *   - Icons NUR via Canvas→ImageData (WM2: HTMLImage-addImage stirbt still in firefox)
 *   - neue Layer in den doc-capture-Branches von osm-overlay.js (r27b: preventDefault+
 *     stopPropagation — kein land-flyTo bei punkt-klick, WM5)
 *   - alle externen datenquellen als same-origin proxy (WM3: /worldmapp/cortege/)
 *   - labels aus /api/config (kein hardcode), fallback-tabelle eingebaut
 * Öffentliche API: window.wmProtestLiveAPI = {isOpen, enableProtestFocus, disableProtestFocus}
 */
(function () {
  'use strict';
  if (window.__wmProtestLive) return;
  window.__wmProtestLive = 1;

  var EV_SRC = 'wm-cgev-src', EV_CL = 'wm-cgev-clusters', EV_PT = 'wm-cgev', EV_ICON = 'wm-cgev-icon';
  var RP_SRC = 'wm-cgreports-src', RP_LAYER = 'wm-cgreports';
  var cfg = null;            // /api/config: categories (id->label/glyph/group), eventTypes
  var catMeta = {};          // id -> {label, glyph, group, ttl}
  var evMeta = {};           // event-type-id -> {label, glyph}
  var checkbox = null;
  var enabled = false;       // layer sichtbar?
  var inited = false;

  var GROUP_COLORS = {
    fdo: '#ef4444',      // forces de l'ordre (polizei-einsatz)
    danger: '#f97316',   // gefahr (lacrymo, nasse, …)
    soutien: '#22c55e',  // street medics / legal
    info: '#22d3ee',     // infos cortège
    _event: '#c084fc'    // termine (manif/blocus/…)
  };
  var FALLBACK_CATS = {
    crs: { label: 'CRS', glyph: '🛡️', group: 'fdo' }, police: { label: 'Police', glyph: '🚓', group: 'fdo' },
    lacrymo: { label: 'Lacrymo', glyph: '💨', group: 'danger' }, nasse: { label: 'Nasse', glyph: '🚧', group: 'danger' },
    medic: { label: 'Street medics', glyph: '⛑️', group: 'soutien' }, legal: { label: 'Legal team', glyph: '⚖️', group: 'soutien' },
    calme: { label: 'Zone calme', glyph: '💚', group: 'info' }
  };

  function host2d() { var h = window.__wmMapHost; return (h && h.mapInstance) ? h.mapInstance : null; }

  function esc(sv) {
    return String(sv == null ? '' : sv).replace(/[<>&"]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
    });
  }

  function catInfo(id) {
    return catMeta[id] || FALLBACK_CATS[id] || { label: id, glyph: '📍', group: 'info' };
  }
  function groupColor(id) {
    var g = catInfo(id).group || 'info';
    return GROUP_COLORS[g] || GROUP_COLORS.info;
  }
  function evTypeInfo(t) {
    return evMeta[t] || { label: t, glyph: '✊' };
  }

  // ---------- config ----------
  function loadConfig() {
    return fetch('/worldmapp/cortege/api/config')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        (d.categories || []).forEach(function (c) { catMeta[c.id] = { label: c.label || c.id, glyph: c.glyph || '📍', group: c.group || 'info', ttl: c.ttl }; });
        (d.eventTypes || []).forEach(function (e) { evMeta[e.id] = { label: e.label || e.id, glyph: e.glyph || '✊' }; });
        cfg = d;
      })
      .catch(function () {});
  }

  // ---------- icon (WM2-regel: IMAGERADATA!) ----------
  function glyphImageData(glyph, bg, size) {
    size = size || 40;
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var cx = cv.getContext('2d');
    cx.beginPath();
    cx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    cx.fillStyle = bg;
    cx.fill();
    cx.lineWidth = 2;
    cx.strokeStyle = 'rgba(0,0,0,.65)';
    cx.stroke();
    cx.font = Math.floor(size * 0.55) + 'px serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(glyph, size / 2, size / 2 + 1);
    return cx.getImageData(0, 0, size, size);
  }

  // ---------- layers ----------
  function buildLayers(m) {
    if (m.getSource(EV_SRC)) return;
    m.addSource(EV_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 8, clusterRadius: 45 });
    m.addLayer({
      id: EV_CL, type: 'circle', source: EV_SRC, filter: ['has', 'point_count'],
      paint: { 'circle-color': 'rgba(192,132,252,.35)', 'circle-stroke-color': 'rgba(192,132,252,.8)', 'circle-stroke-width': 1.5,
               'circle-radius': ['step', ['get', 'point_count'], 12, 25, 18, 100, 26] },
      layout: { visibility: enabled ? 'visible' : 'none' }
    });
    m.addLayer({
      id: EV_CL + '-count', type: 'symbol', source: EV_SRC, filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] },
      paint: { 'text-color': '#e9d5ff' }, layout2: undefined
    });
    m.addLayer({
      id: EV_PT, type: 'symbol', source: EV_SRC, filter: ['!', ['has', 'point_count']],
      layout: { 'icon-image': EV_ICON, 'icon-size': 0.72, 'icon-allow-overlap': true, visibility: enabled ? 'visible' : 'none' }
    });

    m.addSource(RP_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m.addLayer({
      id: RP_LAYER, type: 'circle', source: RP_SRC,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 10, 11],
        'circle-color': ['match', ['get', 'grp'],
          'fdo', GROUP_COLORS.fdo, 'danger', GROUP_COLORS.danger, 'soutien', GROUP_COLORS.soutien, GROUP_COLORS.info],
        'circle-stroke-color': 'rgba(0,0,0,.7)', 'circle-stroke-width': 1.5,
        'circle-opacity': 0.92
      },
      layout: { visibility: enabled ? 'visible' : 'none' }
    });

    if (!m.hasImage(EV_ICON)) {
      try { m.addImage(EV_ICON, glyphImageData('✊', GROUP_COLORS._event, 40), { pixelRatio: 2 }); } catch (e) {}
    }
  }

  function setVisibility(m, on) {
    [EV_CL, EV_CL + '-count', EV_PT, RP_LAYER].forEach(function (id) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    });
  }

  // ---------- daten ----------
  function refresh() {
    var m = host2d();
    if (!m || !m.getSource(EV_SRC)) return;
    fetch('/worldmapp/cortege/live/events.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var list = (d && d.e) || [];
        var feats = list.filter(function (e) { return typeof e.lat === 'number' && typeof e.lng === 'number'; }).map(function (e) {
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
            properties: { kind: 'cgevent', name: (evTypeInfo(e.type).glyph || '✊') + ' ' + (e.title || evTypeInfo(e.type).label || 'Manifestation'),
                          place: e.place || '', type: e.type, start: e.start || 0, by: e.by || '', link: e.link || e.src || '' }
          };
        });
        m.getSource(EV_SRC).setData({ type: 'FeatureCollection', features: feats });
      })
      .catch(function () {});
    fetch('/worldmapp/cortege/live/all.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var list = (d && d.r) || [];
        var feats = list.filter(function (p) { return typeof p.lat === 'number' && typeof p.lng === 'number'; }).map(function (p) {
          var info = catInfo(p.cat);
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: { kind: 'cgreport', name: (info.glyph || '📍') + ' ' + (info.label || p.cat), cat: p.cat, grp: info.group,
                          note: p.note || '', t: p.t || 0, last: p.last || p.t || 0, exp: p.exp || 0, up: p.up || 0, down: p.down || 0 }
          };
        });
        m.getSource(RP_SRC).setData({ type: 'FeatureCollection', features: feats });
      })
      .catch(function () {});
  }

  // ---------- checkbox im osm-panel ----------
  function ensureCheckbox() {
    var panel = document.getElementById('wm-osm-panel');
    if (!panel || document.getElementById('wm-cortege-live-cb')) return;
    var row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;cursor:pointer;';
    row.innerHTML = '<input type="checkbox" id="wm-cortege-live-cb"> <span style="color:#c084fc">✊</span> <span style="color:#cfeee8">Cortège FR (Termine + Live-Meldungen)</span>';
    var anchor = document.getElementById('wm-rain-cb');
    if (anchor && anchor.parentElement) anchor.parentElement.insertAdjacentElement('afterend', row);
    else panel.appendChild(row);
    checkbox = row.querySelector('input');
    checkbox.checked = enabled;
    checkbox.addEventListener('change', function (ev) {
      try {
        enabled = !!ev.target.checked;
        var m = host2d();
        if (m) setVisibility(m, enabled);
        if (enabled) refresh();
      } catch (e) {}
    });
  }

  // ---------- focus-API fuer den PROTEST-button (cortege-mapmode) ----------
  function applyFocus(on) {
    var m = host2d();
    enabled = on;
    if (m) setVisibility(m, on);
    if (on) refresh();
    if (checkbox) checkbox.checked = on;
    // r34: militaer-bewegungen (nur militaer-flugzeuge, zivil im fokus aus)
    var pl = window.wmPlanesAPI;
    if (pl && pl.setMilOnly) { try { pl.setMilOnly(on); } catch (e) {} }
  }

  // ---------- boot ----------
  var bootTries = 0;
  (function boot() {
    bootTries++;
    var m = host2d();
    if (!m) { if (bootTries < 240) setTimeout(boot, 500); return; }
    if (!inited) {
      inited = true;
      buildLayers(m);
      loadConfig().then(function () { refresh(); });
      setInterval(refresh, 60000);
      setInterval(function () {
        var mm = host2d();
        if (mm && !mm.getSource(EV_SRC)) { buildLayers(mm); if (enabled) setVisibility(mm, true); }
        ensureCheckbox();
      }, 4000);
      ensureCheckbox();
    }
  })();

  window.wmProtestLiveAPI = {
    isEnabled: function () { return enabled; },
    enableProtestFocus: function () { applyFocus(true); },
    disableProtestFocus: function () { applyFocus(false); },
    refresh: refresh
  };
})();
