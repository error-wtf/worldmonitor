/* Karten-Perfektion: Scale bar + Koordinaten-anzeige + Vollbild-knopf.
   Nutzt die __wmMapHost-bridge (mapInstance). Läuft nach map-init. */
(function () {
  if (window.__wmMapExtras) return;
  window.__wmMapExtras = true;

  // Keep the original controls/handlers inside the active map, including its
  // fullscreen surface. Choose a real free slot instead of viewport offsets.
  var dock = document.createElement('div');
  dock.id = 'wm-map-control-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Kartenbild und Qualität');
  // Preserve the controls' original 99970 UI plane, now scoped to the map.
  // Globe HTML markers can exceed the native zoom group's 500 depth.
  dock.style.cssText = 'position:absolute;display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:max-content;z-index:99970;pointer-events:none;visibility:hidden;';
  var controlIds = ['wm-satellite-btn', 'wm-quality-btn'], controls = [];
  var dockQueued = false, dockRoot = null, dockHost = null, dockObserved = new WeakSet();
  var dockResize = typeof ResizeObserver === 'function' ? new ResizeObserver(queueDock) : null;
  var dockAttributes = new MutationObserver(queueDock);
  var dockSelector = '.map-controls,.layer-toggles,.time-slider,#wm-tr-bar,.map-legend,.map-attribution,.maplibregl-ctrl,.wm-scale-bar,.wm-coords,.wm-satellite-attribution,button[title="Karte Vollbild"]';
  function visible(el) {
    var style = getComputedStyle(el), box = el.getBoundingClientRect();
    return !el.hidden && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
  }
  function observeDock(el) {
    if (!el || dockObserved.has(el)) return;
    dockObserved.add(el);
    if (dockResize) dockResize.observe(el);
    // Own position writes must not enqueue themselves, especially row fallback.
    dockAttributes.observe(el, {attributes:true,attributeFilter:el === dock ? ['class','hidden'] : ['class','style','hidden']});
  }
  function dockStyle(key, value) { if (dock.style[key] !== value) dock.style[key] = value; }
  function queueDock() {
    if (dockQueued) return;
    dockQueued = true;
    requestAnimationFrame(function () { dockQueued = false; updateDock(); });
  }
  function updateDock() {
    controlIds.forEach(function (id, i) { if (!controls[i]) controls[i] = document.getElementById(id); });
    var root = Array.from(document.querySelectorAll('.map-container')).find(visible);
    var fullscreen = document.fullscreenElement;
    if (!root || (fullscreen && !root.contains(fullscreen) && !fullscreen.contains(root))) {
      dockStyle('visibility', 'hidden'); return;
    }
    var host = root, bridge = window.__wmMapHost;
    if (bridge && bridge.mapInstance) {
      var surface = bridge.mapInstance.getContainer();
      if (root.contains(surface) && visible(surface)) host = surface;
    }
    if (fullscreen && root.contains(fullscreen)) host = fullscreen;

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if (dock.parentNode !== host) host.appendChild(dock);
    controls.forEach(function (button, i) {
      if (!button) return;
      if (dock.children[i] !== button) dock.insertBefore(button, dock.children[i] || null);
      var style = {position:'relative',top:'auto',bottom:'auto',left:'auto',right:'auto',zIndex:'auto',pointerEvents:'auto',maxWidth:'100%'};
      Object.keys(style).forEach(function (key) { if (button.style[key] !== style[key]) button.style[key] = style[key]; });
      if (button.hidden) button.hidden = false;
    });
    if (dockRoot !== root || dockHost !== host) {
      if (dockResize) dockResize.disconnect();
      dockAttributes.disconnect(); dockObserved = new WeakSet(); dockRoot = root; dockHost = host;
    }
    observeDock(root); observeDock(host); observeDock(dock);
    controls.forEach(observeDock);
    var bounds = host.getBoundingClientRect();
    var view = {left:Math.max(0,bounds.left),top:Math.max(0,bounds.top),right:Math.min(window.innerWidth,bounds.right),bottom:Math.min(window.innerHeight,bounds.bottom)};
    dockStyle('maxWidth', Math.max(0, Math.floor(view.right - view.left - 20)) + 'px');
    var obstacles = Array.from(root.querySelectorAll(dockSelector));
    ['wm-osm-panel','wm-osm-floating-btn'].forEach(function (id) { var el = document.getElementById(id); if (el) obstacles.push(el); });
    // Navigation, ticker and other fixed app chrome also cover the map on
    // phones. They are constraints, not something to paint controls over.
    var app = document.getElementById('app');
    Array.from(document.body.children).concat(app ? Array.from(app.children) : []).forEach(function (el) {
      if (/^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) return;
      observeDock(el);
      if (getComputedStyle(el).position === 'fixed' && getComputedStyle(el).pointerEvents !== 'none') obstacles.push(el);
    });
    var boxes = obstacles.filter(function (el) {
      observeDock(el);
      return visible(el) && (!fullscreen || fullscreen.contains(el));
    }).map(function (el) { return el.getBoundingClientRect(); }).filter(function (b) {
      return b.right > bounds.left && b.left < bounds.right && b.bottom > bounds.top && b.top < bounds.bottom;
    });
    var slot = null;
    // Prefer a row on phones. Crowded open panels may need a compact 2px
    // outside gap; button spacing stays 6px and existing HUD stays untouched.
    /* R10c (operator): FESTE Ausrichtung 'column' (Knöpfe untereinander, unter dem
       Ebenen-Knopf). Das alte Probe-Fitting toggelte flexDirection row/column am
       Live-Dock durch — die Knöpfe flackerten zwischen 'neben' und 'unter' dem
       Ebenen-Knopf und der Dock sprang zwischen Positionen. */
    var directions = ['column'];
    directions.map(function (direction) { return {direction:direction,gap:8}; }).some(function (layout) {
      dockStyle('flexDirection', layout.direction);
      var size = dock.getBoundingClientRect(), gap = layout.gap;
      var xs = [view.left - bounds.left + 10, view.right - bounds.left - size.width - 10];
      var ys = [view.top - bounds.top + 10, view.bottom - bounds.top - size.height - 10];
      boxes.forEach(function (b) {
        xs.push(b.right - bounds.left + gap, b.left - bounds.left - size.width - gap);
        ys.push(b.bottom - bounds.top + gap, b.top - bounds.top - size.height - gap);
      });
      var candidates = [];
      xs.forEach(function (x) { ys.forEach(function (y) {
        x = Math.ceil(x); y = Math.ceil(y);
        var left = bounds.left + x, top = bounds.top + y;
        if (left < view.left + 10 || top < view.top + 10 || left + size.width > view.right - 10 || top + size.height > view.bottom - 10) return;
        if (boxes.some(function (b) { return left < b.right + gap && left + size.width > b.left - gap && top < b.bottom + gap && top + size.height > b.top - gap; })) return;
        candidates.push({x:x,y:y,score:x * 2 + y});
      }); });
      candidates.sort(function (a, b) { return a.score - b.score; });
      return !!slot;
    });
    /* R10d (operator): Dock FEST an der rechten Kartenkante unten — keine
       Slot-Suche mehr, verdeckt nichts (Legende/Fullscreen/Ticker frei). */
    dockStyle('left', 'auto');
    dockStyle('right', '44px');
    dockStyle('top', 'auto');
    dockStyle('top', '10px');
    /* 29.10. R3 (operator): root sichtbar => Dock SICHTBAR, auch ohne freien Slot
       (versteckter Wetter-Button zaehlt als FAIL). */
    dockStyle('visibility', 'visible');
  }
  ['pointerdown','mousedown','dblclick','wheel','click'].forEach(function (name) {
    dock.addEventListener(name, function (event) { event.stopPropagation(); });
  });
  new MutationObserver(queueDock).observe(document.body, {childList:true,subtree:true});
  window.addEventListener('resize', queueDock);
  window.addEventListener('wm-map-host-ready', queueDock);
  document.addEventListener('fullscreenchange', queueDock);
  document.addEventListener('scroll', queueDock, true);
  document.documentElement.setAttribute('data-wm-map-control-dock-version', '20261019-controls-1');
  queueDock();

  function install(map) {
    if (map.__wmExtras) return map.__wmExtrasCleanup;
    map.__wmExtras = true;
    var container = map.getContainer();
    container.style.position = 'relative';

    // 1) Scale bar:
    var scale = document.createElement('div');
    scale.className = 'wm-scale-bar';
    scale.style.cssText = 'position:absolute;bottom:8px;left:10px;z-index:50;box-sizing:border-box;background:rgba(10,14,12,.7);' +
      'color:#cfeee8;font:10px/1.4 monospace;padding:2px 8px;border-radius:4px;pointer-events:none;';
    container.appendChild(scale);

    function updateScale() {
      try {
        var width = container.clientWidth, height = container.clientHeight;
        var targetPx = Math.min(90, width / 3);
        var from = map.unproject([width / 2, height / 2]);
        var to = map.unproject([width / 2 + targetPx, height / 2]);
        var rawMeters = from.distanceTo(to), mpp = rawMeters / targetPx;
        if (!Number.isFinite(mpp) || mpp <= 0 || width <= 0 || height <= 0) {
          scale.hidden = true; scale.textContent = '—'; return;
        }
        // Use the live projection, not an assumed 256px/512px tile convention.
        var magnitude = Math.pow(10, Math.floor(Math.log10(rawMeters)));
        var nice = [1, 2, 2.5, 5, 10].map(function (n) { return n * magnitude; });
        var meters = nice.reduce(function (p, n) { return Math.abs(n - rawMeters) < Math.abs(p - rawMeters) ? n : p; }, nice[0]);
        var px = Math.round(meters / mpp);
        var label = Number((meters >= 1000 ? meters / 1000 : meters).toPrecision(3)) + (meters >= 1000 ? ' km' : ' m');
        scale.hidden = false;
        scale.textContent = label;
        scale.style.width = px + 'px';
        scale.style.borderBottom = '2px solid rgba(0,229,255,.5)';
      } catch (e) { scale.hidden = true; scale.textContent = '—'; }
    }
    updateScale();
    map.on('zoom', updateScale);
    map.on('move', updateScale);
    map.on('resize', updateScale);

    // 2) Coordinates: raised from the old 8px dock, clear of the real legend.
    var coord = document.createElement('div');
    coord.className = 'wm-coords';
    coord.style.cssText = 'position:absolute;bottom:128px;left:50%;transform:translateX(-50%);z-index:50;white-space:nowrap;max-width:calc(100% - 20px);' +
      'background:rgba(10,14,12,.7);color:#cfeee8;font:10px/1.4 monospace;padding:2px 8px;border-radius:4px;pointer-events:none;';
    coord.textContent = 'lat —  lon —';
    container.appendChild(coord);

    var root = container.closest('.map-container') || container;
    var observed = new WeakSet();
    var resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateLayout) : null;
    function updateLayout() {
      var bounds = container.getBoundingClientRect(), bottom = 8;
      root.querySelectorAll('.map-legend,.wm-satellite-attribution').forEach(function (el) {
        if (resizeObserver && !observed.has(el)) { resizeObserver.observe(el); observed.add(el); }
        if (el.hidden || (document.fullscreenElement && !document.fullscreenElement.contains(el))) return;
        var box = el.getBoundingClientRect(), style = getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && box.height > 0 && box.bottom > bounds.top && box.top < bounds.bottom) {
          bottom = Math.max(bottom, Math.ceil(bounds.bottom - box.top + 8));
        }
      });
      var coordBox = coord.getBoundingClientRect(), coordHeight = coordBox.height || 20;
      var limit = Math.max(8, bounds.height - coordHeight - 8);
      var coordBottom = Math.min(limit, Math.max(8 + 120, bottom));
      var dock = {left:'50%',right:'auto',transform:'translateX(-50%)'};
      var panel = document.getElementById('wm-osm-panel');
      if (panel && !panel.hidden && (!document.fullscreenElement || document.fullscreenElement.contains(panel))) {
        if (!observed.has(panel)) {
          if (resizeObserver) resizeObserver.observe(panel);
          if (layoutObserver) layoutObserver.observe(panel, {attributes:true,attributeFilter:['style','class','hidden']});
          observed.add(panel);
        }
        var panelBox = panel.getBoundingClientRect(), panelStyle = getComputedStyle(panel);
        var x = bounds.left + (bounds.width - coordBox.width) / 2, y = bounds.bottom - coordBottom;
        if (panelStyle.display !== 'none' && panelStyle.visibility !== 'hidden' && panelBox.width > 0 &&
            x < panelBox.right && x + coordBox.width > panelBox.left && y > panelBox.top && y - coordHeight < panelBox.bottom) {
          if (panelBox.left - bounds.left >= coordBox.width + 18) dock = {left:'10px',right:'auto',transform:'none'};
          else if (bounds.right - panelBox.right >= coordBox.width + 18) dock = {left:'auto',right:'10px',transform:'none'};
          else if (bounds.bottom - panelBox.top + 8 <= limit) coordBottom = Math.max(coordBottom, bounds.bottom - panelBox.top + 8);
        }
      }
      dock.bottom = coordBottom + 'px';
      Object.keys(dock).forEach(function (key) { if (coord.style[key] !== dock[key]) coord.style[key] = dock[key]; });
      var scaleBottom = Math.min(limit, bottom) + 'px';
      if (scale.style.bottom !== scaleBottom) scale.style.bottom = scaleBottom;
    }
    if (resizeObserver) { resizeObserver.observe(container); if (root !== container) resizeObserver.observe(root); }
    var layoutObserver = new MutationObserver(updateLayout);
    layoutObserver.observe(root, {childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
    window.addEventListener('resize', updateLayout);
    map.on('resize', updateLayout);
    updateLayout();
    function onMouseMove(e) {
      coord.textContent = 'lat ' + e.lngLat.lat.toFixed(4) + '  lon ' + e.lngLat.lng.toFixed(4);
    }
    function onMouseOut() { coord.textContent = 'lat —  lon —'; }
    map.on('mousemove', onMouseMove);
    map.on('mouseout', onMouseOut);

    // 3) Vollbild-knopf:
    var fs = document.createElement('button');
    fs.textContent = '⛶';
    fs.title = 'Karte Vollbild';
    fs.style.cssText = 'position:absolute;top:8px;left:10px;z-index:50;width:28px;height:28px;' +
      'background:rgba(10,14,12,.75);border:1px solid rgba(0,229,255,.3);color:#00e5ff;border-radius:4px;' +
      'cursor:pointer;font:14px/1 monospace;';
    fs.addEventListener('click', function () {
      try {
        if (document.fullscreenElement) { document.exitFullscreen(); }
        else { container.requestFullscreen(); }
      } catch (e) {}
    });
    container.appendChild(fs);
    function onFullscreenChange() { if (container.isConnected) { map.resize(); updateScale(); updateLayout(); } }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    function cleanup() {
      map.off('zoom', updateScale); map.off('move', updateScale); map.off('resize', updateScale);
      map.off('resize', updateLayout); map.off('mousemove', onMouseMove); map.off('mouseout', onMouseOut);
      map.off('remove', cleanup);
      window.removeEventListener('resize', updateLayout);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (resizeObserver) resizeObserver.disconnect();
      layoutObserver.disconnect();
      scale.remove(); coord.remove(); fs.remove();
      delete map.__wmExtras; delete map.__wmExtrasCleanup;
    }
    map.__wmExtrasCleanup = cleanup;
    map.on('remove', cleanup);
    return cleanup;
  }

  var activeMap = null, activeCleanup = null;
  function connect() {
    var host = window.__wmMapHost;
    if (!host || !host.mapInstance || (host.mapInstance === activeMap && host.mapInstance.__wmExtras)) return;
    if (activeCleanup) activeCleanup();
    activeMap = host.mapInstance;
    activeCleanup = install(activeMap);
    clearInterval(iv);
  }
  var iv = setInterval(connect, 2500); // Compatibility with older cached bridge publishers.
  window.addEventListener('wm-map-host-ready', connect);
  document.documentElement.setAttribute('data-wm-map-extras-version', '20261019-controls-1');
  connect();
})();
