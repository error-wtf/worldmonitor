/* EXIT point weather — on-demand data, no geolocation or location history. */
(function (root) {
  'use strict';
  /* 29.10. Nacht (operator): SPAMM-FIX — nur EINE Instanz. Konkurrierende Instanzen
     (Doppel-Injection, Restore-Scripts) erzeugten staendig neue Wetter-Toggles
     im Dock (298+ Klone beobachtet). [R4c: am richtigen Ort — war versehentlich
     im Kartenklick-Callback gelandet und hat die Wetter-Card komplett blockiert.] */
  if (root.__wmPointWeatherLoaded) return;
  root.__wmPointWeatherLoaded = true;
  function condition(code, isDay) {
    var kind = 'unknown';
    if (Number.isInteger(code)) {
      if (code === 0 || code === 1) kind = isDay === false ? 'moon' : 'sun';
      else if (code === 2) kind = 'partly';
      else if (code === 3) kind = 'cloud';
      else if ([45, 48].includes(code)) kind = 'fog';
      else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) kind = 'rain';
      else if ([71, 73, 75, 77, 85, 86].includes(code)) kind = 'snow';
      else if ([95, 96, 97, 99].includes(code)) kind = 'storm';
    }
    return { kind: kind };
  }
  function temperature(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) + '°' : '–';
  }
  root.WMPointWeatherCore = { condition: condition, temperature: temperature };
  if (!root.document || root.__wmPointWeather) return;

  var doc = root.document;
  var version = '20261026-7';
  var enabled = true;
  try { enabled = localStorage.getItem('wm-point-weather-enabled') !== '0'; } catch (_) {}
  var card = null, toggle = null, mountedHost = null;
  var controller = null, generation = 0, down = null, mountTimer = null;
  var weatherShowTimer = null;
  var words = {
    de: { weather:'Wetter', close:'Wetter schließen', hint:'Auf einen Ort oder Punkt klicken', loading:'Wetter wird geladen …', error:'Wetterdaten derzeit nicht verfügbar.', retry:'Erneut laden', limited:'Wetterabruf kurzzeitig begrenzt.', current:'Aktuell', minimum:'Min.', maximum:'Max.', today:'Heute', wind:'Wind', rainAmount:'Niederschlag', rain:'Regen', feels:'Gefühlt', model:'Modellwetter', local:'Ortszeit', old:'Ältere Daten', point:'Wetter am Kartenpunkt', sun:'Sonnig', moon:'Klar', partly:'Teils bewölkt', cloud:'Bewölkt', fog:'Nebel', snow:'Schnee', storm:'Gewitter', unknown:'Wetterlage unbekannt', mostly:'Überwiegend klar', off:'aus' },
    en: { weather:'Weather', close:'Close weather', hint:'Click a place or map point', loading:'Loading weather …', error:'Weather data currently unavailable.', retry:'Try again', limited:'Weather requests temporarily limited.', current:'Current', minimum:'Min.', maximum:'Max.', today:'Today', wind:'Wind', rainAmount:'Precipitation', rain:'Rain', feels:'Feels like', model:'Model weather', local:'local time', old:'Older data', point:'Weather at map point', sun:'Sunny', moon:'Clear', partly:'Partly cloudy', cloud:'Cloudy', fog:'Fog', snow:'Snow', storm:'Thunderstorm', unknown:'Unknown conditions', mostly:'Mainly clear', off:'off' },
    it: { weather:'Meteo', close:'Chiudi meteo', hint:'Clicca un luogo o un punto sulla mappa', loading:'Caricamento meteo …', error:'Dati meteo al momento non disponibili.', retry:'Riprova', limited:'Richieste meteo temporaneamente limitate.', current:'Attuale', minimum:'Min.', maximum:'Max.', today:'Oggi', wind:'Vento', rainAmount:'Precipitazioni', rain:'Pioggia', feels:'Percepita', model:'Meteo da modello', local:'ora locale', old:'Dati precedenti', point:'Meteo nel punto selezionato', sun:'Soleggiato', moon:'Sereno', partly:'Parzialmente nuvoloso', cloud:'Nuvoloso', fog:'Nebbia', snow:'Neve', storm:'Temporale', unknown:'Condizioni sconosciute', mostly:'Prevalentemente sereno', off:'off' }
  };
  function language() { return (doc.documentElement.lang || 'de').split('-')[0]; }
  function text(key) { return (words[language()] || words.en)[key] || key; }
  function element(tag, className, content) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }
  function host() {
    var candidates = [root.__wmGlobeHost, root.__wmMapHost];
    for (var i = 0; i < candidates.length; i++) {
      var h = candidates[i];
      if (!h || !h.container || !h.container.isConnected) continue;
      var container = h.container;
      if (!container.classList.contains(h.mode === 'globe' ? 'globe-mode' : 'deckgl-mode')) continue;
      if (container.getBoundingClientRect().width > 0 && container.getBoundingClientRect().height > 0) return h;
    }
    return null;
  }
  function style() {
    if (doc.getElementById('wm-point-weather-style')) return;
    var node = element('style');
    node.id = 'wm-point-weather-style';
    node.textContent = '.wm-weather-toggle{position:absolute;left:12px;bottom:12px;z-index:110;min-height:34px;padding:5px 12px;border:1px solid #b2bccb;border-radius:5px;background:#142338;color:#f8fafc;font:600 12px system-ui;cursor:pointer;box-shadow:0 2px 8px #0006}.wm-weather-toggle[aria-pressed="false"]{background:#20252c;color:#aeb9c8}.wm-weather-toggle:focus-visible,.wm-point-weather button:focus-visible,.wm-point-weather a:focus-visible{outline:3px solid #66c9ff;outline-offset:2px}.wm-point-weather{box-sizing:border-box;position:fixed;inset:auto;margin:0;width:292px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;z-index:9000;border:1px solid #63758c;border-radius:7px;padding:0;background:#142338;color:#f5f8fd;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 28px #0009;pointer-events:auto;transform:none;text-align:left;letter-spacing:normal}.wm-point-weather *{box-sizing:border-box}.wm-weather-heading{display:flex;gap:8px;align-items:center;padding:6px 10px;background:#f0f3f8;color:#142338}.wm-weather-location{flex:1;min-width:0;font-size:14px;font-weight:700;overflow-wrap:anywhere}.wm-weather-close{flex:0 0 32px;min-height:32px;border:0;border-radius:4px;background:#dbe2eb;color:#142338;font:24px/1 system-ui;cursor:pointer}.wm-weather-coordinates{padding:4px 12px 0;color:#bacde1;font-size:11px}.wm-weather-main{display:flex;align-items:center;gap:14px;padding:6px 12px 8px}.wm-weather-icon{flex:0 0 58px;width:58px;height:58px}.wm-weather-current{font-size:34px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}.wm-weather-current small{font-size:16px;font-weight:400}.wm-weather-condition{margin-top:3px;font-size:14px}.wm-weather-range{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0 12px;border-radius:4px;overflow:hidden}.wm-weather-low,.wm-weather-high{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:8px 10px;color:#fff}.wm-weather-low{background:#1166ac}.wm-weather-high{background:#a44c00}.wm-weather-range strong{font-size:22px;font-weight:700}.wm-weather-details{display:flex;flex-wrap:wrap;gap:3px 12px;padding:7px 12px 0;font-size:11px;color:#d4e1f0}.wm-weather-footer{padding:7px 12px;font-size:10px;color:#b8c9dc}.wm-weather-footer a{color:#b9e3ff;text-decoration:underline}.wm-weather-status{padding:14px 12px;color:#e2edf9}.wm-weather-retry{margin:0 12px 12px;min-height:34px;padding:5px 12px;border:1px solid #91a7be;border-radius:4px;background:#253c55;color:white;font:inherit;cursor:pointer}.wm-weather-stale{color:#ffd08a;font-weight:600}';
    doc.head.appendChild(node);
  }
  function fit() {
    if (!card) return;
    var h = host();
    if (!h) { close(); return; }
    var rect = h.container.getBoundingClientRect();
    var bounds = card.getBoundingClientRect();
    card.style.left = Math.max(8, Math.min(rect.left + 12, root.innerWidth - bounds.width - 8)) + 'px';
    card.style.top = Math.max(8, Math.min(rect.bottom - bounds.height - 120, root.innerHeight - bounds.height - 8)) + 'px';
  }
  function close() {
    generation++;
    if (weatherShowTimer) { clearTimeout(weatherShowTimer); weatherShowTimer = null; }
    if (controller) controller.abort();
    controller = null;
    if (card) card.remove();
    card = null;
  }
  function mount() {
    mountTimer = null;
    var h = host();
    /* R4d (operator): FRUEH-AUS — wenn derselbe Host noch da ist und das Toggle
       verbunden ist, darf mount NICHTS tun. Ohne diese Zeile wurde bei jeder
       DOM-Mutation entfernt + neu erstellt (Spamm/Flackern des Wetter-Knopfs). */
    if (h && mountedHost && mountedHost.container === h.container && toggle && toggle.isConnected) return;
    try {
      style();
      /* Dedupe: fremde/verwaiste Toggles entfernen — genau EIN Toggle darf existieren. */
      [].forEach.call(doc.querySelectorAll('.wm-weather-toggle'), function (t) { t.remove(); });
      toggle = element('button', 'wm-weather-toggle', '☀ ' + text('weather'));
      toggle.type = 'button';
      toggle.setAttribute('data-wm-weather-toggle', '');
      syncToggle();
      h.container.appendChild(toggle);
      if (!adoptDock()) reposition();
      doc.documentElement.dataset.wmPwMounted = '1';
      return;
    } catch (e) {
      try { doc.documentElement.dataset.wmPwError = String(e && e.message ? e.message : e) + ' @ ' + (e && e.stack ? String(e.stack).slice(0,120) : ''); } catch (_e2) {}
      return;
    }
    if (h && mountedHost && mountedHost.container === h.container && toggle && toggle.isConnected) return;
    if (toggle) toggle.remove();
    if (mountedHost !== h) close();
    mountedHost = h;
    if (!h) return;
    style();
    toggle = element('button', 'wm-weather-toggle', '☀ ' + text('weather'));
    toggle.type = 'button';
    toggle.setAttribute('data-wm-weather-toggle', '');
    syncToggle();
    toggle.addEventListener('click', function (ev) {
      ev.stopPropagation();
      enabled = !enabled;
      syncToggle();
      try { localStorage.setItem('wm-point-weather-enabled', enabled ? '1' : '0'); } catch (_) {}
      if (!enabled) close();
    });
    h.container.appendChild(toggle);
    // Prefer the shared map-control dock (map-extras places it collision-free);
    // fall back to a measured bottom-left spot when the dock is not loaded.
    if (!adoptDock()) reposition();
  }
  function adoptDock() {
    if (!toggle || !toggle.isConnected) return false;
    var h = host();
    if (!h) return false;
    if (toggle.parentNode && toggle.parentNode.id === 'wm-map-control-dock') return true;
    var dock = h.container.querySelector('#wm-map-control-dock');
    if (!dock) return false;
    toggle.style.position = 'relative';
    toggle.style.left = 'auto';
    toggle.style.bottom = 'auto';
    toggle.style.pointerEvents = 'auto';
    dock.appendChild(toggle);
    return true;
  }
  function reposition() {
    if (!toggle || !toggle.isConnected) return;
    var h = host();
    if (!h) return;
    var cr = h.container.getBoundingClientRect();
    if (cr.height <= 0) return;
    var limit = cr.bottom - 42;
    var sels = ['.wm-scale-bar', '.wm-analysis-hud', '.wm-analysis-tools', '.wm-extras-dock', '#wm-quality-btn', '#wm-satellite-btn', '.wm-osm-legend'];
    for (var i = 0; i < sels.length; i++) {
      var nodes = h.container.querySelectorAll(sels[i]);
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j] === toggle) continue;
        var r = nodes[j].getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;
        if (r.right < cr.left + 8 || r.left > cr.left + 430) continue;
        if (r.top < limit) limit = r.top;
      }
    }
    var gap = Math.ceil(cr.bottom - limit) + 10;
    if (root.innerHeight - cr.bottom < 40) gap += 30;
    gap = Math.min(200, Math.max(42, gap));
    var next = gap + 'px';
    if (toggle.style.bottom !== next) toggle.style.bottom = next;
  }
  function syncToggle() {
    if (!toggle) return;
    toggle.textContent = enabled ? '☀ ' + text('weather') : '☀ ' + text('weather') + ' · ' + text('off');
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.title = enabled ? text('hint') : text('hint') + ' (aus — klicken zum Einschalten)';
  }
  function scheduleMount() { if (!mountTimer) mountTimer = setTimeout(mount, 120); }
  function icon(kind, isDay) {
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 72 72');
    svg.setAttribute('class', 'wm-weather-icon');
    svg.setAttribute('aria-hidden', 'true');
    function shape(tag, attrs) {
      var n = doc.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs).forEach(function (key) { n.setAttribute(key, attrs[key]); });
      svg.appendChild(n);
    }
    if (kind === 'sun' || kind === 'partly') {
      if (isDay === false) shape('path', { d:'M36 10a19 19 0 1 0 19 29A20 20 0 0 1 36 10', fill:'#ffe697' });
      else {
        shape('path', { d:'M31 3v7m0 37v7M5 28h7m38 0h7M12 9l6 6m26 26 6 6M12 47l6-6m26-26 6-6', stroke:'#ffd15b', 'stroke-width':'3.5', 'stroke-linecap':'round' });
        shape('circle', { cx:'31', cy:'28', r:'15', fill:'#ffc13d' });
      }
    }
    if (kind === 'moon') shape('path', { d:'M43 9a25 25 0 1 0 19 37A27 27 0 0 1 43 9', fill:'#ffe697' });
    if (['partly','cloud','rain','snow','storm','fog'].includes(kind)) shape('path', { d:'M17 51a12 12 0 0 1-1-24 18 18 0 0 1 34-3 14 14 0 0 1 4 27Z', fill:'#e6eff9', stroke:'#adc7e3', 'stroke-width':'1.5' });
    if (kind === 'rain') shape('path', { d:'m22 57-4 8m19-8-4 8m19-8-4 8', stroke:'#69bcff', 'stroke-width':'4', 'stroke-linecap':'round' });
    if (kind === 'snow') shape('path', { d:'M22 57v10m-5-5h10m14-5v10m-5-5h10m14-5v10m-5-5h10', stroke:'#c2e5ff', 'stroke-width':'2.5' });
    if (kind === 'storm') shape('path', { d:'m37 44-13 17h11l-6 11 22-21H39l7-7Z', fill:'#ffd354' });
    if (kind === 'fog') shape('path', { d:'M12 57h48M18 64h37', stroke:'#b2c9e2', 'stroke-width':'4', 'stroke-linecap':'round' });
    if (kind === 'unknown') { var q = doc.createElementNS('http://www.w3.org/2000/svg','text'); q.setAttribute('x','23'); q.setAttribute('y','53'); q.setAttribute('font-size','50'); q.setAttribute('fill','#aabbd0'); q.textContent='?'; svg.appendChild(q); }
    return svg;
  }
  function coordinates(point) { return point.lat.toFixed(2) + '°, ' + point.lon.toFixed(2) + '°'; }
  function numberFormatter() {
    try { return new Intl.NumberFormat(language(), { maximumFractionDigits:1 }); }
    catch (_) { return { format: function (n) { return String(Math.round(n * 10) / 10); } }; }
  }
  function value(v, suffix) { return typeof v === 'number' && Number.isFinite(v) ? numberFormatter().format(v) + suffix : '–'; }
  function frame(point) {
    if (card) card.remove();
    card = element('section', 'wm-point-weather');
    card.setAttribute('data-wm-weather-card', '');
    card.setAttribute('data-state', 'loading');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', text('weather'));
    var heading = element('div','wm-weather-heading');
    heading.appendChild(element('div','wm-weather-location',point.label || text('point')));
    var closeButton = element('button','wm-weather-close','×');
    closeButton.type='button';
    closeButton.setAttribute('data-wm-weather-close','');
    closeButton.setAttribute('aria-label',text('close'));
    closeButton.addEventListener('click',close);
    heading.appendChild(closeButton);
    card.appendChild(heading);
    card.appendChild(element('div','wm-weather-coordinates',coordinates(point)));
    var content = element('div','wm-weather-body');
    content.setAttribute('aria-live','polite');
    content.setAttribute('aria-busy','true');
    content.appendChild(element('div','wm-weather-status',text('loading')));
    card.appendChild(content);
    (doc.fullscreenElement || doc.body).appendChild(card);
    if (typeof card.showPopover === 'function') {
      card.setAttribute('popover','manual');
      try { card.showPopover(); } catch (_) { card.removeAttribute('popover'); }
    }
    fit();
    return content;
  }
  function render(data, content) {
    content.replaceChildren();
    var current = data.current, today = data.today || {};
    var state = condition(current.weatherCode, current.isDay);
    if (state.kind === 'unknown') state.labelSuffix = ' · Code ' + String(current.weatherCode);
    var row = element('div','wm-weather-main');
    row.appendChild(icon(state.kind,current.isDay));
    var readings = element('div');
    var temp = element('div','wm-weather-current',temperature(current.temperature));
    temp.setAttribute('data-wm-weather-temperature','');
    temp.title = value(current.temperature,' °C');
    temp.appendChild(element('small','', 'C'));
    readings.appendChild(temp);
    var label = element('div','wm-weather-condition',text(current.weatherCode === 1 ? 'mostly' : state.kind) + (state.labelSuffix || ''));
    label.setAttribute('data-wm-weather-condition','');
    readings.appendChild(label);
    row.appendChild(readings);
    content.appendChild(row);
    var range = element('div','wm-weather-range');
    [['wm-weather-low','minimum','temperatureMin','data-wm-weather-min'],['wm-weather-high','maximum','temperatureMax','data-wm-weather-max']].forEach(function (item) {
      var cell = element('div',item[0]);
      cell.appendChild(element('span','',text('today') + ' ' + text(item[1])));
      var n = element('strong','',temperature(today[item[2]]));
      n.setAttribute(item[3],'');
      cell.appendChild(n);
      range.appendChild(cell);
    });
    content.appendChild(range);
    var details = element('div','wm-weather-details');
    details.appendChild(element('span','',text('feels') + ': ' + value(current.apparentTemperature,' °C')));
    details.appendChild(element('span','',text('wind') + ': ' + value(current.windSpeed,' km/h')));
    details.appendChild(element('span','',text('rainAmount') + ': ' + value(current.precipitation,' mm')));
    content.appendChild(details);
    var footer = element('div','wm-weather-footer');
    var source = element('a','','Open-Meteo');
    source.href = 'https://open-meteo.com/';
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    footer.appendChild(source);
    var time = new Date(current.time * 1000);
    var timeLabel;
    try { timeLabel = new Intl.DateTimeFormat(language(), { timeZone:data.timezone, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(time); }
    catch (_) { timeLabel = time.toISOString().slice(0,16) + ' UTC'; }
    footer.appendChild(doc.createTextNode(' · ' + text('model') + '\n' + timeLabel + ' ' + text('local') + ' (' + data.timezone + ')'));
    footer.style.whiteSpace = 'pre-line';
    if (data.stale || Date.now() - time.getTime() > 60 * 60_000) footer.appendChild(element('div','wm-weather-stale',text('old')));
    content.appendChild(footer);
    content.setAttribute('aria-busy','false');
    card.dataset.state = 'ready';
    fit();
  }
  function show(point) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || !host()) return;
    close();
    point = { lat:Number(point.lat.toFixed(2)), lon:Number((((point.lon + 180) % 360 + 360) % 360 - 180).toFixed(2)), label:typeof point.label === 'string' ? point.label.slice(0,160) : '' };
    var id = generation;
    var content = frame(point);
    var ac = new AbortController();
    controller = ac;
    var timer = setTimeout(function () { ac.abort(); },18000);
    fetch('/worldmapp/exit-api/weather/point?' + new URLSearchParams({ lat:String(point.lat),lon:String(point.lon) }), { signal:ac.signal, headers:{ Accept:'application/json' } })
      .then(function (response) { if (!response.ok) throw Object.assign(new Error('weather request failed'),{status:response.status}); return response.json(); })
      .then(function (data) {
        if (id !== generation || !card) return;
        if (!data.current || !Number.isFinite(data.current.time)) throw new Error('invalid weather data');
        render(data,content);
      }).catch(function (error) {
        if (id !== generation || !card) return;
        content.replaceChildren(element('div','wm-weather-status',text(error.status === 429 ? 'limited' : 'error')));
        var retry = element('button','wm-weather-retry',text('retry'));
        retry.type='button'; retry.setAttribute('data-wm-weather-retry','');
        retry.addEventListener('click',function () { show(point); });
        content.appendChild(retry);
        content.setAttribute('aria-busy','false');
        card.dataset.state = 'error';
        fit();
      }).finally(function () { clearTimeout(timer); if (controller === ac) controller = null; });
  }
  function pointAt(h, event) {
    var target = event.target;
    if (h.mode === 'globe' && h.mapInstance && typeof h.mapInstance.htmlElementsData === 'function') {
      var markers = h.mapInstance.htmlElementsData();
      for (var i = 0; i < markers.length; i++) {
        var d = markers[i], anchor = d.__threeObjHtml && d.__threeObjHtml.element;
        if (anchor && anchor.contains(target) && Number.isFinite(d._lat) && Number.isFinite(d._lng)) return {lat:d._lat,lon:d._lng,label:d.title || d.name || anchor.title || ''};
      }
    }
    var rect = h.container.getBoundingClientRect();
    var x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (h.mode === 'flat' && h.mapInstance && typeof h.mapInstance.queryRenderedFeatures === 'function') {
      try {
        var features = h.mapInstance.queryRenderedFeatures([x,y]);
        for (var j = 0; j < features.length; j++) {
          var f = features[j], props = f.properties || {};
          if (f.geometry.type === 'Point' && !props.cluster && (props.name || props.title)) return {lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],label:props.name || props.title};
        }
      } catch (_) {}
    }
    return h.unproject(x,y);
  }
  doc.addEventListener('pointerdown',function (ev) { down = { x:ev.clientX,y:ev.clientY,at:Date.now() }; },true);
  doc.addEventListener('click',function (ev) {
    if (!enabled || ev.button !== 0 || ev.detail > 1) return;
    var target = ev.target;
    if (!target || target.nodeType !== 1 || target.closest('button,a,input,select,textarea,label,[role="button"],.map-popup,.wm-point-weather,.deckgl-webcam-popup,.maplibregl-ctrl,.wm-analysis-overlay,.wm-analysis-hud,.layer-toggles')) return;
    var h = host();
    if (!h || !h.container.contains(target)) return;
    if (down && Date.now() - down.at < 3000 && Math.hypot(ev.clientX-down.x,ev.clientY-down.y) > 7) return;
    var point = pointAt(h,ev);
    if (!point) return;
    // Marker-Popups (Webcam-Pins etc.) haben Vorrang: oeffne die Wetter-Karte
    // erst nach kurzer Frist und nur, wenn kein Marker-Popup aufging.
    if (weatherShowTimer) clearTimeout(weatherShowTimer);
    weatherShowTimer = setTimeout(function () {
      weatherShowTimer = null;
      if (doc.querySelector('.deckgl-webcam-popup')) return;
      show(point);
    }, 140);
  },true);
  doc.addEventListener('keydown',function (ev) { if (ev.key === 'Escape' && card) close(); },true);
  root.addEventListener('resize',fit);
  root.addEventListener('wm-map-host-ready',scheduleMount);
  var lastScan = 0, scanTimer = null;
    /* R3d (operator): Selbstheil — nach dem Karten-Boot tauchte der Toggle nicht auf,
     weil der Observer das Karten-Init-Ereignis verpasste. Ein leichter Intervall
     garantiert: ohne verbundenen Toggle wird nachgemountet. */
  setInterval(function () {
    try { if (!doc.querySelector('.wm-weather-toggle')) scan(); } catch (e) {}
  }, 1500);

function scan() {
    scanTimer = null;
    var h = host();
    if (h !== mountedHost || (h && (!toggle || !toggle.isConnected))) scheduleMount();
    else if (!adoptDock()) reposition();
  }
  var observer = new MutationObserver(function () {
    var now = Date.now();
    if (now - lastScan < 300) { if (!scanTimer) scanTimer = setTimeout(scan, 300 - (now - lastScan)); return; }
    lastScan = now;
    scan();
  });
  observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  root.__wmPointWeather = { version:version, close:close, show:show };
  mount();
})(globalThis);
