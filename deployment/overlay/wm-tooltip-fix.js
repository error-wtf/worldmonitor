/* BINGSI Tooltip-Fix v4 — clicked map information stays above map labels/overlays.
 * Retains v3's repair for empty black info boxes containing only a close button.
 *
 * Wurzel (im GlobeMap-Bundle verifiziert): GlobeMap.showMarkerTooltip hat für
 * _kind buoy/sstZone/currentArrow die Zweige des MARKER-RENDERERS statt
 * Infotext-Zweige (Copy-Paste-Fehler upstream): sie malen den Kreis ins
 * Tooltip-Div, das am Ende durch `<div>${closeBtn}${a}</div>` mit a="" neu
 * gesetzt wird -> leere Box mit nur ×-Button. Ohne Zweig überhaupt:
 * satFootprint, flash, diseaseOutbreak, canadaRoad.
 *
 * FIX (update-sicher, kein Bundle-Hack):
 *  - MutationObserver sammelt neu eingefügte Divs.
 *  - Erkennung über COMPUTED style (background rgba(10,12,16,0.95)) + ×-Button
 *    + (fast) kein Textinhalt -> das ist die leere GlobeMap-Tooltip-Box.
 *    (Attribut-Selektor funktioniert NICHT zuverlässig: cssText landet
 *     verzögert im style-Attribut — computed style ist die sichere Quelle.)
 *  - Fuellen: title vom Box-Div (Bundle setzt n.title im buoy/sst-Zweig —
 *    daher der sichtbare "NDBC …" Browser-Tooltip) oder vom zuletzt
 *    geklickten Marker (Capture-Listener), geparst in lesbare Infobox.
 *  - Boxen MIT echtem Inhalt werden nicht angefasst.
 */
(function () {
  if (window.__wmTooltipFix) return;
  window.__wmTooltipFix = true;

  var pending = [];   // seit dem letzten tick neu dazugekommene elemente
  var last = null;    // letzter klick auf einen marker { title, t }
  var foregroundBoxes = [];

  function fitForeground(box) {
    if (!box.isConnected) return;
    var origin = box.__wmForegroundRect;
    var actual = box.getBoundingClientRect();
    box.style.left = Math.max(4, Math.min(origin.left, window.innerWidth - actual.width - 4)) + 'px';
    box.style.top = Math.max(4, Math.min(origin.top, window.innerHeight - actual.height - 4)) + 'px';
  }

  function foreground(box) {
    if (!box || box.nodeType !== 1 || box.tagName !== 'DIV' || box.__wmForeground) return;
    var globe = document.querySelector('.map-container.globe-mode');
    if (!globe) return;
    var standard = box.classList.contains('map-popup') && !box.classList.contains('map-popup-sheet');
    var native = box.parentElement === globe && box.querySelector('button[aria-label="Close"]');
    if (!standard && !native) return;
    var computed = getComputedStyle(box);
    var bg = computed.backgroundColor;
    if (!standard && bg.replace(/\s/g, '') !== 'rgba(10,12,16,0.95)' && bg.replace(/\s/g, '') !== 'rgb(10,12,16)') return;
    var rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    box.__wmForeground = true;
    box.__wmForegroundRect = rect;
    box.setAttribute('data-wm-foreground', '1');
    box.classList.add('wm-map-popup-front');
    // A larger z-index alone cannot escape the globe's stacking context.
    // A manual popover uses the browser top layer without making the map inert.
    box.style.position = 'fixed';
    box.style.inset = 'auto';
    box.style.margin = '0';
    box.style.transform = 'none';
    box.style.zIndex = '2147483647';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.maxHeight = 'calc(100vh - 8px)';
    box.style.overflowY = 'auto';
    var channels = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (channels) box.style.backgroundColor = 'rgb(' + channels.slice(1, 4).join(',') + ')';
    var topLayer = false;
    if (typeof box.showPopover === 'function') {
      box.setAttribute('popover', 'manual');
      try { box.showPopover(); topLayer = true; }
      catch (e) { box.removeAttribute('popover'); }
    }
    if (!topLayer) {
      // Older browsers: escape transformed/clipped map ancestors via a portal.
      box.style.setProperty('--wm-panel-effective-scale', computed.getPropertyValue('--wm-panel-effective-scale') || '1');
      (document.fullscreenElement || document.body).appendChild(box);
    }
    fitForeground(box);
    if (typeof ResizeObserver === 'function') {
      box.__wmForegroundObserver = new ResizeObserver(function () { fitForeground(box); });
      box.__wmForegroundObserver.observe(box);
    }
    foregroundBoxes.push(box);
  }

  function closeOnLayoutChange(ev) {
    foregroundBoxes = foregroundBoxes.filter(function (box) {
      if (!box.isConnected) {
        if (box.__wmForegroundObserver) box.__wmForegroundObserver.disconnect();
        return false;
      }
      if (ev && ev.target && ev.target.nodeType && box.contains(ev.target)) return true; // scrolling inside a long popup
      if (box.__wmForegroundObserver) box.__wmForegroundObserver.disconnect();
      var close = box.querySelector('button[aria-label="Close"], .popup-close');
      if (close) close.click();
      else box.remove();
      return false;
    });
  }
  window.addEventListener('resize', closeOnLayoutChange);
  window.addEventListener('scroll', closeOnLayoutChange, true);

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || t.nodeType !== 1) return;
    var title = t.getAttribute('title') ||
                (t.parentElement && t.parentElement.getAttribute('title')) || '';
    if (title || (t.style && t.style.pointerEvents === 'auto')) {
      last = { title: title, t: Date.now() };
    }
  }, true);

  var mo = new MutationObserver(function (recs) {
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      for (var j = 0; j < r.addedNodes.length; j++) {
        var n = r.addedNodes[j];
        if (n.nodeType === 1) {
          foreground(n);
          pending.push(n);
        }
      }
    }
    schedule();
  });

  var tmr = null;
  function schedule() { if (!tmr) tmr = setTimeout(tick, 60); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildHtmlFromTitle(title) {
    title = title || '';
    var label = 'ℹ Info';
    var rows = [];
    if (/Welle/.test(title)) {
      label = '🌊 Mess-Boje';
      var m = title.match(/^(.*?)\s+—\s+Welle\s+(.*)$/);
      if (m) { rows.push('<b>' + esc(m[1]) + '</b>'); rows.push('Welle: ' + esc(m[2])); }
      else rows.push(esc(title));
    } else if (/Meeresoberflaeche|Meeresoberfläche/.test(title)) {
      label = '🌡 SST-Zone';
      rows.push(esc(title.replace('Meeresoberflaeche', 'Meeresoberfläche')));
    } else if (/Stroemung|Strömung/.test(title)) {
      label = '➡ Meeresströmung';
      rows.push(esc(title));
    } else if (title) {
      rows.push(esc(title));
    } else {
      return '';
    }
    return '<span style="color:#00e5ff;font-weight:bold;">' + label + '</span><br>' + rows.join('<br>');
  }

  function isTooltipBox(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'DIV') return false;
    if (el.__wmFilled) return false;
    if (!el.querySelector || !el.querySelector('button')) return false;
    var text = (el.textContent || '').replace(/[×✕✖\s]+/g, '');
    if (text.length > 2) { el.__wmFilled = true; return false; } // hat echten inhalt
    var bg = '';
    try { bg = getComputedStyle(el).backgroundColor; } catch (e) { return false; }
    var bgN = bg.replace(/\s/g, '');
    return bgN === 'rgba(10,12,16,0.95)' || bgN === 'rgb(10,12,16)';
  }

  function fill(box) {
    box.__wmFilled = true;
    //quelle 1: box trägt title (bundle setzt n.title im kaputten zweig)
    var title = box.getAttribute('title') || '';
    //quelle 2: zuletzt geklickter marker
    if (!title && last && Date.now() - last.t < 5000) title = last.title || '';
    var html = buildHtmlFromTitle(title);
    if (!html) {
      html = '<span style="color:#9fb8b3;">ℹ Keine Details für diesen Punkt verfügbar</span>' +
             (title ? '<br><span style="opacity:.7;">' + esc(title) + '</span>' : '');
    }
    var holder = box.querySelector('div[style*="padding-right"]') || box;
    var probe = document.createElement('div');
    probe.style.cssText = 'pointer-events:auto;font-family:var(--font-mono,monospace);';
    probe.innerHTML = html;
    holder.appendChild(probe);
  }

  function check(el) {
    foreground(el);
    if (!isTooltipBox(el)) {
      // auch kinder prüfen (tooltip kann nested eingehängt werden)
      if (el.querySelectorAll) {
        var kids = el.querySelectorAll('div');
        for (var i = 0; i < kids.length && i < 60; i++) {
          foreground(kids[i]);
          if (isTooltipBox(kids[i])) fill(kids[i]);
        }
      }
      return;
    }
    fill(el);
  }

  function tick() {
    tmr = null;
    var batch = pending.splice(0, pending.length);
    for (var i = 0; i < batch.length; i++) check(batch[i]);
    foregroundBoxes = foregroundBoxes.filter(function (box) {
      if (box.isConnected) return true;
      if (box.__wmForegroundObserver) box.__wmForegroundObserver.disconnect();
      return false;
    });
  }

  function boot() {
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
      // initial vorhandene boxen (fallback, sollte es normal nicht geben)
      var all = document.body.querySelectorAll('div');
      for (var i = 0; i < all.length && i < 4000; i++) {
        foreground(all[i]);
        if (isTooltipBox(all[i])) fill(all[i]);
      }
    } else setTimeout(boot, 400);
  }
  boot();
})();
