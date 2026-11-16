/* WINDY v7 (29.10. abend, operator — Nachfolge von v6):
   1) WINDY als Karten-Modus (offizielles embed.windy.com/embed2.html, Beweislage v5/v6).
   2) Panels "WINDY Karte" + "WINDY Cams" im Haupt-Grid (gleiche Webcam-API wie Karten-Pins).
   3) NEU: Solange der WINDY-Modus aktiv ist, werden die 2D/3D-Bedienelemente ausgeblendet
      (EBENEN-Handle, Satellitenbild/Q/Wetter-Dock, Skalenbalken, offener Ebenen-Panel) —
      sie steuern nur die eigene Karte, nicht das Windy-Embed.
   4) NEU: Die drei windy.com-Links (windy.com öffnen / Webcams auf windy.com / Webcams-App)
      liegen jetzt direkt AUF der Windy-Karte (unten mittig, nur sichtbar bei aktivem Modus).
      Der separate WINDY-Tab (wm-windy-tab-v6.js) ist damit obsolet und wurde entfernt —
      es gibt nur noch WINDY-Kartenmodus + WINDY-Panels. */
(function () {
  'use strict';
  if (window.__wmWindyV7) return;
  window.__wmWindyV7 = true;

  var VER = '20261029-13';
  var EMBED_PARAMS = '?lat=50.117&lon=8.684&zoom=5&level=surface&overlay=wind' +
    '&menu=&message=&marker=&calendar=now&pressure=&type=map&actualWeather=' +
    '&metricWind=km%2Fh&metricTemp=%C2%B0C';
  var MAP_URL = 'https://embed.windy.com/embed2.html' + EMBED_PARAMS;
  var CAMS_LINK = 'https://www.windy.com/webcams';
  var MAP_LINK = 'https://www.windy.com/?50.117,8.684,5';
  var WEBCAM_API = '/api/webcam/v1/list-webcams?zoom=11&bound_w=-180&bound_s=-90&bound_e=180&bound_n=90';
  var PLAYER_BASE = 'https://webcams.windy.com/webcams/public/embed/player/';
  var CAM_TILES = 6;

  /* ---------- 1) Karten-Modus: WINDY-Button in der Modus-Leiste ---------- */
  function mapSection() { return document.getElementById('mapSection') || document.querySelector('.map-section'); }
  function ensureModeButton() {
    var section = mapSection(); if (!section) return null;
    var btn = section.querySelector('#wmWindyModeBtn');
    if (btn) return btn;
    var anchor = null;
    var modes = ['2d', '3d', 'ocx', 'mafia', 'radar', 'sdr', 'pilze'];
    section.querySelectorAll('button.map-dim-btn').forEach(function (b) {
      if (modes.indexOf((b.textContent || '').trim().toLowerCase()) !== -1) anchor = b;
    });
    if (!anchor) return null;
    btn = document.createElement('button');
    btn.id = 'wmWindyModeBtn'; btn.className = 'map-dim-btn'; btn.type = 'button';
    btn.title = 'WINDY — offizielle windy.com-Embed-Karte (Wind-Animationen) als Karten-Modus';
    btn.textContent = 'WINDY'; btn.setAttribute('aria-pressed', 'false');
    anchor.after(btn);
    btn.addEventListener('click', function () {
      var f = ensureModeFrame();
      var on = f.style.display === 'none' || !f.style.display;
      if (on) {
        if (!f.src || f.src === 'about:blank') f.src = MAP_URL;
        f.style.display = 'block';
        btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
        section.querySelectorAll('button.map-dim-btn').forEach(function (b) {
          if (b.id !== 'wmWindyModeBtn') b.classList.remove('active');
        });
      } else {
        f.style.display = 'none'; btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false');
      }
      syncControls();
    });
    return btn;
  }
  function ensureModeFrame() {
    var section = mapSection(); if (!section) return null;
    var f = document.getElementById('wm-windy-mode-frame');
    if (f) return f;
    f = document.createElement('iframe');
    f.id = 'wm-windy-mode-frame'; f.title = 'Windy Karte (offizielles Embed)';
    f.setAttribute('allow', 'fullscreen');
    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;z-index:5;display:none;background:#0b0e14;';
    var host = section.querySelector('.maplibregl-map, .map-container, #mapContainer') || section;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(f);
    ensureLinkBar(host);
    watchIframe(f, 'mode-frame');
    return f;
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('button.map-dim-btn') : null;
    if (t && t.id !== 'wmWindyModeBtn') {
      var f = document.getElementById('wm-windy-mode-frame');
      if (f) f.style.display = 'none';
      var b = document.getElementById('wmWindyModeBtn');
      if (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); }
      syncControls();
    }
  }, true);

  /* ---------- 2) 2D/3D-Bedienelemente verstecken, solange WINDY aktiv ---------- */
  /* Nur die Bedienelemente der EIGENEN Karte; die Modus-Leiste (2D/3D/…/WINDY)
     bleibt erreichbar, damit man zurückschalten kann. */
  var HIDE_SELECTORS = [
    '#wm-map-control-dock',   /* 🛰 Satellitenbild / ⚙ Q / ☀ Wetter (map-extras + point-weather) */
    '.wm-lp-handle',          /* EBENEN ▸ Handle (Layer-Panel) */
    '#wm-layers-panel',       /* offenes Ebenen-Panel */
    '.wm-scale-bar',          /* Skalenbalken der eigenen Karte */
    '.map-legend',            /* Konflikt/Warn-Legende der 2D/3D-Layer */
    '.map-controls.deckgl-controls', /* Zoom +/−/⌂ der eigenen Karte (nur Zeit-Zeile + Modus-Leiste bleiben) */
    '#wm-renderguard'         /* SVG-Notfall-Banner der 2D/3D-Karte — liegt sonst ÜBER dem Windy-iframe */
  ,
  /* R3: Satellitenbild/Q-Hoch/Wetter-Toggle nur bei 2D/3D. */
  '.wm-satellite-btn', '.wm-quality-btn', '.wm-weather-toggle'];
  function windyActive() {
    var f = document.getElementById('wm-windy-mode-frame');
    return !!(f && f.style.display && f.style.display !== 'none');
  }
  /* 29.10. abend (operator, Fehler 3): Es darf GENAU EINE Kartenflaeche sichtbar sein.
     Der Host (deck.gl/maplibre-Container mit Canvas + CSS2D-Markern bis z-index 142)
     wird im Windy-Modus GESAMT unsichtbar (visibility:hidden), das Windy-iframe
     (Kind des Hosts) bleibt explizit sichtbar. Keine Karte wird geloescht —
     beim Zurueckschalten wird der alte visibility-Wert restauriert. */
  function syncControls() {
    var on = windyActive();
    var host = document.getElementById('mapContainer') ||
               (mapSection() ? mapSection().querySelector('.maplibregl-map, .map-container') : null);
    if (host) {
      if (on) {
        if (!host.hasAttribute('data-windy-prev-vis')) {
          host.setAttribute('data-windy-prev-vis', host.style.visibility || '');
        }
        host.style.setProperty('visibility', 'hidden', 'important');
      } else if (host.hasAttribute('data-windy-prev-vis')) {
        var pv = host.getAttribute('data-windy-prev-vis');
        if (pv) host.style.setProperty('visibility', pv);
        else host.style.removeProperty('visibility');
        host.removeAttribute('data-windy-prev-vis');
        /* Regression-Fix (29.10. Nacht): nach dem Sichtbar-Restore muss
           map-extras' Dock neu vermessen werden — Visibility-Wechsel feuern
           keinen ResizeObserver. Der resize-Dispatch re-triggert updateDock,
           sonst bleibt der Dock (mit Wetter-Toggle) unsichtbar. */
        if (!window.__wmWindyResizeQueued) {
          window.__wmWindyResizeQueued = true;
          setTimeout(function () {
            window.__wmWindyResizeQueued = false;
            window.dispatchEvent(new Event('resize'));
          }, 80);
        }
      }
    }
    var frame = document.getElementById('wm-windy-mode-frame');
    if (frame) {
      if (on) frame.style.setProperty('visibility', 'visible', 'important');
      else frame.style.removeProperty('visibility');
    }
    HIDE_SELECTORS.forEach(function (sel) {
      var list = document.querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (on) {
          if (!el.hasAttribute('data-windy-prev-display')) {
            /* !important-Stylesheet-Regeln (z.B. .wm-lp-handle inline-block!important)
               schlagen normales inline display — deshalb mit Priorität verstecken. */
            el.setAttribute('data-windy-prev-display', el.style.display || '');
            el.setAttribute('data-windy-prev-display-p', el.style.getPropertyPriority('display'));
          }
          el.style.setProperty('display', 'none', 'important');
        } else if (el.hasAttribute('data-windy-prev-display')) {
          var prev = el.getAttribute('data-windy-prev-display');
          var prio = el.getAttribute('data-windy-prev-display-p') || '';
          if (prev) el.style.setProperty('display', prev, prio);
          else el.style.removeProperty('display');
          el.removeAttribute('data-windy-prev-display');
          el.removeAttribute('data-windy-prev-display-p');
        }
      }
    });
    var bar = document.getElementById('wm-windy-mode-links');
    if (bar) {
      bar.style.display = on ? 'flex' : 'none';
      /* Der Balken haengt im versteckten Host — ohne explizites visible erbe er hidden (v4/v5-Fehler). */
      if (on) bar.style.setProperty('visibility', 'visible', 'important');
      else bar.style.removeProperty('visibility');
    }
  }

  /* ---------- 3) Die drei windy.com-Links AUF der Karte ---------- */
  function ensureLinkBar(host) {
    var bar = document.getElementById('wm-windy-mode-links');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'wm-windy-mode-links';
    bar.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
      'display:none;gap:8px;align-items:center;z-index:6;pointer-events:auto;' +
      'background:rgba(11,14,20,.82);border:1px solid rgba(76,201,240,.25);border-radius:10px;padding:6px 10px;' +
      'max-width:calc(100% - 24px);flex-wrap:wrap;justify-content:center';
    function link(href, label, title) {
      var a = document.createElement('a');
      a.className = 'wm-windy-mode-link'; a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = label; a.title = title || label;
      a.style.cssText = 'padding:4px 9px;border:1px solid rgba(76,201,240,.35);border-radius:6px;color:#a9ddca;font-size:12px;text-decoration:none;white-space:nowrap';
      a.addEventListener('mouseenter', function () { a.style.borderColor = '#4cc9f0'; });
      a.addEventListener('mouseleave', function () { a.style.borderColor = 'rgba(76,201,240,.35)'; });
      return a;
    }
    bar.append(
      link(MAP_LINK, 'windy.com öffnen ↗', 'windy.com in neuem Tab öffnen'),
      link(CAMS_LINK, 'Webcams auf windy.com ↗', 'Alle Webcams auf windy.com'),
      link('https://webcams.windy.com/', 'Webcams-App ↗', 'Windy Webcams-App')
    );
    host.appendChild(bar);
    return bar;
  }

  /* ---------- 4) Panels im Haupt-Grid: WINDY Karte + WINDY Cams ---------- */
  function makePanel(id, title, linkHref, linkTitle) {
    var grid = document.getElementById('panelsGrid'); if (!grid) return null;
    var panel = document.getElementById(id);
    if (panel) { if (panel.parentElement !== grid) grid.insertBefore(panel, grid.firstChild); return panel; }
    panel = document.createElement('section');
    panel.id = id; panel.className = 'panel span-2'; panel.dataset.panel = id.replace('exit-', '');
    var header = document.createElement('div');
    header.className = 'panel-header';
    var h = document.createElement('h2'); h.className = 'panel-title'; h.textContent = title;
    var open = document.createElement('a');
    open.href = linkHref; open.target = '_blank'; open.rel = 'noopener noreferrer';
    open.textContent = '↗'; open.title = linkTitle;
    open.style.cssText = 'margin-left:auto;color:#4cc9f0;text-decoration:none;font-size:14px';
    header.append(h, open);
    panel.append(header);
    grid.insertBefore(panel, grid.firstChild);
    return panel;
  }

  /* ---------- 29.10. Nacht: WINDY Cams (Random-Rotation) ENTFERNT ----------
     operator: ausschließlich die GEPINNTEN Kameras, keine Zufallsauswahl. Das
     PinnedWebcamsPanel (windy-webcams) ist die einzige Webcam-Fläche. */
  function ensureCamsPanelGone() {
    var old = document.getElementById('exit-windy-cams');
    if (old) old.remove();
  }
  /* ---------- 5) Sichtbarkeits-Beobachtung: lazy-src (ohne GPU-Hold) ---------- */
  var io = null;
  function watchIframe(frame, key) {
    if (!('IntersectionObserver' in window)) {
      if (frame.dataset.windySrc && !frame.src) frame.src = frame.dataset.windySrc;
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio > 0.01) {
            if (en.target.dataset.windySrc && !en.target.getAttribute('src')) en.target.src = en.target.dataset.windySrc;
          }
        });
      }, { rootMargin: '200px', threshold: [0, 0.02] });
    }
    io.observe(frame);
  }

  /* ---------- Boot: dauerhafte Reparatur (ueberlebt Tab-Wechsel, kein Cap) ---------- */
  var restoredOnce = false; /* NICHT an die Interval-ID haengen: setInterval liefert eine Zahl —
    Property-Assignment darauf wirft im Strict-Mode (Firefox) jede Tick einen TypeError. */
  var boot = setInterval(function () {
    var b1 = ensureModeButton();
    var g = document.getElementById('panelsGrid');
    if (!g || !b1) return;
    /* R8 (operator): KEIN Windy-Kartenpanel mehr im Dashboard — Windy nur noch
       RECHTS unter Maps. Bestehende redundante Panels werden entfernt. */
    var oldMapPanel = document.getElementById('exit-windy-map');
    if (oldMapPanel) oldMapPanel.remove();
    ensureCamsPanelGone(); /* 29.10. Nacht: Random-Cams-Panel entfernt (operator) — nur gepinnte Cams im PinnedWebcamsPanel */
    if (!restoredOnce) {
      restoredOnce = true;
      try {
        /* 29.10. Nacht (operator): KEIN Auto-Restore mehr — das Dashboard startet
           immer im 2D/OSM-Modus mit sichtbaren Wetter-Buttons. Bestehende
           Flags werden aufgeräumt. */
        localStorage.removeItem('wm-windy-mode-on');
        /* Übergangs-Cleanup: Klon-Toggles aus der Multi-Instanz-Ära entfernen */
        if (!window.__wmWindyToggleCleaned) {
          window.__wmWindyToggleCleaned = true;
          var toggles = document.querySelectorAll('.wm-weather-toggle');
          for (var ti = toggles.length - 1; ti >= 1; ti--) { toggles[ti].remove(); }
        }
      } catch (e) {}
      /* Stacked-Regression-Fix: map-extras' erster Dock-Check läuft vor dem
         sichtbaren Karten-Render → Dock bleibt visibility:hidden und kein
         Re-Trigger. Zwei Resize-Stöße nach dem Boot re-triggern updateDock. */
      [4000, 11000].forEach(function (ms) {
        setTimeout(function () { window.dispatchEvent(new Event('resize')); }, ms);
      });
    }
    syncControls(); /* Selbstheilung gegen Re-Renders von map-extras/point-weather */
  }, 4000);

    /* R3 (operator): Kartenumschalter muss bei JEDEM Embed-Kartenmodus sichtbar
       und klickbar bleiben (OCX/MAFIA/RADAR/SDR/PILZE). */
    setInterval(function () {
      try {
        var t = document.querySelector('.map-dimension-toggle');
        if (!t) return;
        if (document.body.classList.contains('wm-embed-active')) {
          t.style.setProperty('position', 'relative', 'important');
          t.style.setProperty('z-index', '2147483002', 'important');
          t.style.setProperty('visibility', 'visible', 'important');
          t.style.setProperty('opacity', '1', 'important');
          t.style.setProperty('pointer-events', 'auto', 'important');
          t.__wmEmbedForced = true;
        } else if (t.__wmEmbedForced) {
          ['position', 'z-index', 'visibility', 'opacity', 'pointer-events'].forEach(function (k) { t.style.removeProperty(k); });
          t.__wmEmbedForced = false;
        }
      } catch (e) {}
    }, 2000);
})();
