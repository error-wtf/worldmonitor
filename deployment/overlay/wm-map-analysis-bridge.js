/**
 * wm-map-analysis-bridge.js — Mess- und Zeichen-Werkzeuge für die 2D- und
 * 3D-Karte (Bingsi OSIRIS-Port, 2026-10-15).
 *
 * Nutzt ausschließlich die vom App-Bundle exportierten puren Funktionen
 * (window.__wmAnalysisCore, src/utils/map-analysis-*.ts) und die offiziellen
 * Overlay-Bridges der Renderer (__wmMapHost flach / __wmGlobeHost Globus).
 * Keine Kopie der Geometrielogik. Ohne Bridge/Core bleibt das Skript stumm.
 */
(function () {
  'use strict';
  if (window.__wmAnalysisBridgeLoaded) return;
  window.__wmAnalysisBridgeLoaded = true;

  var STORAGE_KEY = 'wm-analysis-shapes-v1';
  var core = window.__wmAnalysisCore;
  if (!core) return; // Bundle ohne Core → keine Werkzeuge

  var state = {
    host: null,
    mode: null, // null | 'line' | 'polygon' | 'rectangle' | 'circle'
    points: [],
    shapes: [],
    overlay: null,
    svg: null,
    hud: null,
    label: null,
    active: false,
    dragMoved: false,
    lastPointer: null,
  };

  function host() { return window.__wmGlobeHost || window.__wmMapHost || null; }

  function fmtKm(v) {
    if (!Number.isFinite(v)) return '–';
    return v >= 100 ? Math.round(v).toLocaleString('de-DE') + ' km' : v.toFixed(1) + ' km';
  }
  function fmtArea(v) {
    if (!Number.isFinite(v)) return '–';
    return v >= 1e6 ? (v / 1e6).toFixed(2) + ' Mio km²' : Math.round(v).toLocaleString('de-DE') + ' km²';
  }

  function persist() {
    try {
      var data = state.shapes.map(function (s) {
        return { kind: s.kind, coords: s.coords, createdAt: s.createdAt };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }

  function validCoord(c) {
    return Array.isArray(c) && c.length === 2 &&
      Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
      Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
  }

  function restore() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(raw)) return;
      raw.forEach(function (item) {
        if (!item || !Array.isArray(item.coords)) return;
        var coords = item.coords.filter(validCoord);
        if (!coords.length || !['line', 'polygon', 'rectangle', 'circle'].includes(item.kind)) return;
        var shape = { kind: item.kind, coords: coords, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now() };
        shape.metrics = core.geometryMetrics(
          shape.kind === 'line' ? { type: 'LineString', coordinates: coords } : { type: 'Polygon', coordinates: [coords] }
        );
        state.shapes.push(shape);
      });
    } catch { /* corrupt storage: start empty */ }
  }

  function finishShape() {
    var transition = core.drawReducer(
      { mode: state.mode, points: state.points },
      { type: 'finish' }
    );
    state.points = transition.state.points;
    if (transition.result) {
      var r = transition.result;
      var geometry = r.kind === 'line'
        ? { type: 'LineString', coordinates: r.coords }
        : { type: 'Polygon', coordinates: [r.coords] };
      state.shapes.push({
        kind: r.kind,
        coords: r.coords,
        createdAt: Date.now(),
        metrics: core.geometryMetrics(geometry),
      });
      persist();
    }
    state.mode = null;
    updateHud();
    render();
  }

  function cancelShape() {
    state.points = [];
    state.mode = null;
    updateHud();
    render();
  }

  function undoLast() {
    var t = core.drawReducer({ mode: state.mode || 'line', points: state.points }, { type: 'undo' });
    state.points = t.state.points;
    render();
  }

  function clearAll() {
    state.shapes = [];
    state.points = [];
    state.mode = null;
    persist();
    updateHud();
    render();
  }

  function exportGeoJson() {
    var features = state.shapes.map(function (s, i) {
      var geometry = s.kind === 'line'
        ? { type: 'LineString', coordinates: s.coords }
        : { type: 'Polygon', coordinates: [s.coords] };
      return {
        type: 'Feature',
        properties: {
          name: (s.kind === 'line' ? 'Pfad' : s.kind === 'circle' ? 'Radius' : s.kind === 'rectangle' ? 'Rechteck' : 'Fläche') + ' ' + (i + 1),
          kind: s.kind,
          areaKm2: s.metrics.areaKm2,
          lengthKm: s.metrics.lengthKm,
          createdAt: s.createdAt,
        },
        geometry: geometry,
      };
    });
    var blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: features }, null, 2)], { type: 'application/geo+json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'worldmap-messungen-' + new Date().toISOString().slice(0, 10) + '.geojson';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  function btn(label, title, handler, activeClass) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      handler(b);
    });
    if (activeClass) b.classList.add('wm-analysis-' + activeClass);
    return b;
  }

  function buildHud(container) {
    var hud = document.createElement('div');
    hud.className = 'wm-analysis-hud';
    hud.style.cssText = 'position:absolute;left:12px;bottom:14px;z-index:60;display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto;';

    function modeBtn(mode, label, title) {
      return btn(label, title, function (b) {
        state.mode = state.mode === mode ? null : mode;
        state.points = [];
        updateHud();
        render();
      });
    }
    hud.appendChild(modeBtn('line', '📏 Pfad', 'Strecke messen: Punkte anklicken, Doppelklick beendet'));
    hud.appendChild(modeBtn('polygon', '⬠ Fläche', 'Polygon zeichnen: Punkte anklicken, Doppelklick schließt'));
    hud.appendChild(modeBtn('rectangle', '▭ Rechteck', 'Zwei Ecken anklicken (auch über die Datumsgrenze)'));
    hud.appendChild(modeBtn('circle', '◎ Kreis', 'Mittelpunkt anklicken, dann Radius'));
    hud.appendChild(btn('✔ Fertig', 'Aktive Form abschließen', function () { if (state.mode) finishShape(); }));
    hud.appendChild(btn('↩ Rückgängig', 'Letzten Punkt entfernen', undoLast));
    hud.appendChild(btn('✕ Abbruch', 'Aktive Form verwerfen', cancelShape));
    hud.appendChild(btn('🗑 Alles löschen', 'Alle gespeicherten Messungen löschen', clearAll));
    hud.appendChild(btn('⬇ Export', 'Messungen als GeoJSON herunterladen', exportGeoJson));

    var label = document.createElement('div');
    label.className = 'wm-analysis-label';
    label.style.cssText = 'position:absolute;top:14px;left:14px;z-index:60;background:rgba(10,14,20,.85);color:#e8f4ff;border:1px solid #2a3a50;border-radius:8px;padding:6px 10px;font:12px/1.5 system-ui,sans-serif;pointer-events:none;';
    label.textContent = '';

    hud.appendChild(label);
    container.appendChild(hud);
    return { hud: hud, label: label };
  }

  function updateHud() {
    if (!state.hud) return;
    var buttons = state.hud.querySelectorAll('button');
    var i = 0;
    ['line', 'polygon', 'rectangle', 'circle'].forEach(function (mode) {
      buttons[i].setAttribute('aria-pressed', state.mode === mode ? 'true' : 'false');
      buttons[i].style.background = state.mode === mode ? '#0a6cff' : '';
      i += 1;
    });
  }

  function svgPointList(coords, close) {
    if (!coords.length) return '';
    var d = '';
    coords.forEach(function (c, idx) {
      var p = state.host.project(c[0], c[1]);
      if (!p) return;
      d += (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ';
    });
    if (close) d += 'Z';
    return d;
  }

  function render() {
    if (!state.host || !state.svg) return;
    var h = state.host;
    var parts = [];

    state.shapes.forEach(function (s) {
      var isLine = s.kind === 'line';
      var color = isLine ? '#00e5ff' : s.kind === 'circle' ? '#ffd700' : s.kind === 'rectangle' ? '#29b6f6' : '#ff3d57';
      var d = svgPointList(s.coords, !isLine);
      if (d) {
        parts.push('<path d="' + d + '" fill="' + (isLine ? 'none' : 'rgba(255,255,255,0.06)') +
          '" stroke="' + color + '" stroke-width="2" stroke-dasharray="' + (isLine ? '6 3' : 'none') + '"/>');
        var first = s.coords[0];
        var p0 = h.project(first[0], first[1]);
        if (p0) {
          parts.push('<text x="' + (p0.x + 8).toFixed(1) + '" y="' + (p0.y - 8).toFixed(1) +
            '" fill="' + color + '" font-size="11" font-family="system-ui">' +
            (s.kind === 'line' ? fmtKm(s.metrics.lengthKm) : fmtArea(s.metrics.areaKm2)) + '</text>');
        }
      }
    });

    if (state.mode && state.points.length) {
      var previewCoords = core.buildGeometry(state.mode, state.points);
      var isLine = state.mode === 'line';
      var d = svgPointList(previewCoords, !isLine);
      if (d) {
        parts.push('<path d="' + d + '" fill="none" stroke="#7df" stroke-width="2" stroke-dasharray="4 3"/>');
      }
      state.points.forEach(function (c) {
        var p = h.project(c[0], c[1]);
        if (p) parts.push('<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#7df"/>');
      });
    }

    if (state.label) {
      var text = '';
      if (state.mode && state.points.length) {
        var progress = core.measure(state.mode, state.points);
        text = progress.mode === 'line'
          ? 'Pfad: ' + fmtKm(progress.lengthKm) + ' (' + progress.vertices + ' Pkt.)'
          : progress.mode === 'circle'
            ? 'Radius: ' + fmtKm(progress.radiusKm || 0) + (progress.closable ? ' — klicken zum Übernehmen' : '')
            : 'Fläche: ' + fmtArea(progress.areaKm2) + ' · Umfang: ' + fmtKm(progress.lengthKm) +
              (progress.closable ? ' — Doppelklick schließt' : '');
      } else if (state.shapes.length) {
        text = state.shapes.length + ' Messung(en) gespeichert';
      }
      state.label.textContent = text;
    }

    state.svg.innerHTML = parts.join('');
  }

  function injectOverlay(h) {
    if (state.overlay) return;
    var container = h.container;
    var overlay = document.createElement('div');
    overlay.className = 'wm-analysis-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:55;pointer-events:none;overflow:hidden;';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;inset:0;display:block;';
    overlay.appendChild(svg);
    var hud = buildHud(container);
    container.appendChild(overlay);

    function localPoint(e) {
      var rect = container.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onPointerMove(e) {
      var p = localPoint(e);
      var geo = h.unproject(p.x, p.y);
      state.lastPointer = geo;
      if (state.mode && ['rectangle', 'circle'].includes(state.mode) && state.points.length === 1) render();
      if (!state.mode && geo) {
        // kein Werkzeug aktiv: nichts
      }
    }

    function onDblClick(e) {
      if (!state.mode) return;
      var p = localPoint(e);
      var geo = h.unproject(p.x, p.y);
      if (!geo) return;
      var t = core.drawReducer({ mode: state.mode, points: state.points }, { type: 'click', at: [geo.lon, geo.lat] });
      state.points = t.state.points;
      finishShape();
    }

    function onPointerDown(e) {
      if (!state.mode) return;
      e.stopPropagation();
      state.dragMoved = false;
      overlay.style.pointerEvents = 'auto';
      overlay.setPointerCapture(e.pointerId);
    }

    function onPointerUp(e) {
      if (!state.mode) return;
      var p = localPoint(e);
      var geo = h.unproject(p.x, p.y);
      if (!geo) return;
      var t = core.drawReducer({ mode: state.mode, points: state.points }, { type: 'click', at: [geo.lon, geo.lat] });
      state.points = t.state.points;
      var isTwoClick = (state.mode === 'rectangle' || state.mode === 'circle');
      if (isTwoClick && state.points.length >= 2) finishShape();
      else render();
    }

    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointerup', onPointerUp);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('dblclick', onDblClick);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.mode) cancelShape();
    }, true);

    state.overlay = overlay;
    state.svg = svg;
    state.hud = hud.hud;
    state.label = hud.label;
    updateHud();
    render();
  }

  function teardown() {
    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
      state.svg = null;
      state.hud = null;
      state.label = null;
    }
    state.mode = null;
    state.points = [];
  }

  function tick() {
    var h = host();
    if (h !== state.host) {
      teardown();
      state.host = h;
      if (h) h.onceReady(function () { if (state.host === h && !state.overlay) injectOverlay(h); });
    }
    if (state.host && state.svg) render();
  }

  restore();
  setInterval(tick, 800);
})();
