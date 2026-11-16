/* wm-liveticker.js v2 (17.10.2026) — permanenter Live-News-Laufband
   Quelle: /api/news/v1/list-feed-digest?variant=full&lang=<ui>&public=1
   (neueste 14 headlines, alle 90s refresh)
   v2 Aenderungen gegenueber v1:
   - Position: fixed am UNTEREN Fensterrand (TV-Stil) — ueberlappt nie Tabs,
     View-Buttons (2D/3D/RADAR...) oder Karten-Kopfzeile, in KEINEM Layout-Modus.
   - Animation: requestAnimationFrame statt CSS-Keyframes — die App setzt bei
     document.hidden die Body-Klasse "animations-paused" (und bleibt bei einem
     verpassten visibilitychange-Event HAENGEN): CSS-Animationen frieren dann
     dauerhaft ein (operators "Ticker fehlt"). rAF ist davon unberuehrt.
   - Watchdog: raeumt die haengengebliebene Klasse weg, wenn der Tab sichtbar
     ist (konsistent mit der App-Logik classList.toggle(..., document.hidden)).
   Klick auf LIVE = Pause/Weiter; Doppelklick = ausblenden (localStorage
   wm-liveticker-hidden=1, 📰-Chip unten rechts holt ihn zurueck). Idempotent. */
(function () {
  'use strict';
  if (window.__wmLiveTicker) return;
  window.__wmLiveTicker = true;
  var HIDDEN_KEY = 'wm-liveticker-hidden';

  function lang() {
    return (navigator.language || 'en').slice(0, 2) === 'de' ? 'de' : 'en';
  }

  function fetchHeadlines() {
    return fetch('/api/news/v1/list-feed-digest?variant=full&lang=' + lang() + '&public=1', {
      signal: AbortSignal.timeout(15000)
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function collectItems(digest) {
    if (!digest || !digest.categories) return [];
    var items = [];
    Object.keys(digest.categories).forEach(function (cat) {
      var arr = (digest.categories[cat] || {}).items || [];
      arr.forEach(function (it) {
        if (it && it.title && it.link) items.push(it);
      });
    });
    items.sort(function (a, b) { return (b.publishedAt || 0) - (a.publishedAt || 0); });
    var seen = {}; var out = [];
    items.forEach(function (it) {
      var k = it.title.slice(0, 60);
      if (seen[k]) return;
      seen[k] = 1; out.push(it);
    });
    return out.slice(0, 14);
  }

  // Watchdog: animations-paused darf nur bei document.hidden gesetzt sein.
  // (Chromium verpasst auf X11 gelegentlich das visibilitychange->visible.)
  setInterval(function () {
    try {
      if (document.visibilityState === 'visible' &&
          document.body.classList.contains('animations-paused')) {
        document.body.classList.remove('animations-paused');
      }
    } catch (e) {}
  }, 2000);

  function buildBar() {
    var bar = document.createElement('div');
    bar.id = 'wm-liveticker';
    bar.setAttribute('role', 'marquee');
    bar.setAttribute('aria-label', 'Live-Nachrichten-Ticker');
    var css = [
      '#wm-liveticker{position:fixed;left:0;right:0;bottom:0;z-index:99990;',
      ' display:flex;align-items:center;gap:8px;height:28px;padding:0 10px;',
      ' background:rgba(10,13,18,.94);border-top:1px solid #ffffff18;backdrop-filter:blur(4px);}',
      '#wm-liveticker .wt-label{flex:0 0 auto;color:#4cc9f0;font:700 11px monospace;letter-spacing:1px;cursor:pointer;user-select:none;}',
      '#wm-liveticker .wt-clip{flex:1 1 auto;overflow:hidden;height:100%;display:flex;align-items:center;position:relative;}',
      '#wm-liveticker .wt-track{display:inline-flex;align-items:center;gap:34px;white-space:nowrap;will-change:transform;}',
      '#wm-liveticker .wt-item{color:#cfe0ee;font:12.5px system-ui;text-decoration:none;white-space:nowrap;}',
      '#wm-liveticker .wt-item:hover{color:#fff;text-decoration:underline;}',
      '#wm-liveticker .wt-item .wt-src{color:#7f95a8;font-size:10.5px;margin-right:6px;}',
      '#wm-liveticker .wt-dot{width:6px;height:6px;border-radius:50%;background:#e5484d;display:inline-block;margin-right:6px;box-shadow:0 0 6px #e5484d88;}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'wm-liveticker-style';
    st.textContent = css;
    document.head.appendChild(st);

    var label = document.createElement('span');
    label.className = 'wt-label';
    label.textContent = 'LIVE';
    label.title = 'Klick: Pause/Weiter · Doppelklick: Ticker ausblenden';
    var clip = document.createElement('div');
    clip.className = 'wt-clip';
    var track = document.createElement('div');
    track.className = 'wt-track';
    clip.appendChild(track);
    bar.append(label, clip);
    document.body.appendChild(bar);

    var paused = false;
    label.addEventListener('click', function () {
      paused = !paused;
      bar.classList.toggle('wm-paused', paused);
      label.style.color = paused ? '#e5484d' : '#4cc9f0';
    });
    label.addEventListener('dblclick', function () {
      try { localStorage.setItem(HIDDEN_KEY, '1'); } catch (e) {}
      bar.remove();
      showRestoreChip();
    });
    return { bar: bar, track: track, isPaused: function () { return paused; } };
  }

  // rAF-Laufband: immun gegen body.animations-paused. Seamless-Loop via
  // doppeltem Item-Satz, Wrap bei halber Breite. ~90 px/s.
  function startMarquee(ui) {
    var speed = 90;
    var x = 0, halfW = 0, last = null;
    ui._resetX = function () { x = 0; halfW = 0; };
    function step(ts) {
      if (last === null) last = ts;
      var dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      if (!ui.isPaused() && halfW > 0) {
        x -= speed * dt;
        if (x <= -halfW) x += halfW;
        ui.track.style.transform = 'translateX(' + x.toFixed(2) + 'px)';
      }
      window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
    // halfW nach Render bestimmen
    var measure = function () {
      var w = ui.track.scrollWidth;
      if (w > 0) halfW = w / 2;
    };
    measure();
    setInterval(measure, 8000);
    window.addEventListener('resize', measure);
  }

  function renderItems(ui, items) {
    if (!items.length) return;
    // v3: diff-freies Update — Track NICHT leeren (Leerblitz = Flackern).
    // Nur tauschen, wenn sich die Headlines tatsaechlich geaendert haben;
    // Fragment in EINEM Rutsch einsetzen (ein Reflow), Laufband resettet sauber.
    var key = items.map(function (i) { return i.title.slice(0, 40); }).join('|');
    if (ui._lastKey === key) return;
    ui._lastKey = key;
    var frag = document.createDocumentFragment();
    var mk = function (it) {
      var a = document.createElement('a');
      a.className = 'wt-item';
      a.href = it.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = '<span class="wt-dot"></span><span class="wt-src"></span>' +
        it.title.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; });
      a.querySelector('.wt-src').textContent = (it.source || '') + ' ·';
      return a;
    };
    items.forEach(function (it) { frag.appendChild(mk(it)); });
    items.forEach(function (it) { frag.appendChild(mk(it)); });
    ui.track.replaceChildren(frag);
    ui.track.style.transform = 'translateX(0)';
    if (ui._resetX) ui._resetX();
  }

  function showRestoreChip() {
    var chip = document.createElement('button');
    chip.id = 'wm-liveticker-restore';
    chip.textContent = '📰';
    chip.title = 'Live-Ticker einblenden';
    chip.style.cssText = 'position:fixed;right:12px;bottom:40px;z-index:99990;background:#16232d;color:#cfe8ff;' +
      'border:1px solid #2c4557;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:14px;';
    chip.addEventListener('click', function () {
      try { localStorage.removeItem(HIDDEN_KEY); } catch (e) {}
      chip.remove();
      location.reload();
    });
    document.body.appendChild(chip);
  }

  function init() {
    var hidden = false;
    try { hidden = localStorage.getItem(HIDDEN_KEY) === '1'; } catch (e) {}
    if (hidden) { showRestoreChip(); return; }
    var ui = buildBar();
    startMarquee(ui);
    var load = function () {
      fetchHeadlines().then(function (d) {
        var items = collectItems(d);
        if (items.length) renderItems(ui, items);
      });
    };
    load();
    setInterval(load, 90000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
