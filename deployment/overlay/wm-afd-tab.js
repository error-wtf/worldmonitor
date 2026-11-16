/* wm-afd-tab v1 (2026-10-29, operator): Tab 'AfD-Verbotsverfahren' als LETZTER
   Eintrag der Tab-Leiste + Dashboard-Abschnitt ganz unten (unter allen Panels).
   - Tab-Klick: Forschungsportal als vollstaendiges iframe-Overlay (GitHub Pages
     sendet kein X-Frame-Options — Einbettung technisch erlaubt, geprueft 29.10.).
   - Dashboard-Abschnitt: Erkennungsbild in voller Spaltenbreite (Seitenverhaeltnis
     erhalten), Klick auf Bild/Titel oeffnet das Portal (echter Browser-Tab).
   - Position dauerhaft: ensure-Intervall haengt Button/Abschnitt neu an, wenn
     etwas sie aus der letzten Position draengt. Keine bestehenden Tabs/Panels
     werden veraendert. */
(function () {
  'use strict';
  if (window.__wmAfdTabV1) return;
  window.__wmAfdTabV1 = true;

  var PORTAL = 'https://error-watch.github.io/AfD-Verbotsverfahren-Grundlagenforschung/';
  var BILD = 'https://error-watch.github.io/AfD-Verbotsverfahren-Grundlagenforschung/assets/images/afd-verbot.jpg';
  var TITEL = 'AfD-Verbotsverfahren';
  var VER = '20261029-1';

  var overlay = null, lastBar = null, lastGrid = null;

  function ensureStyle() {
    if (document.getElementById('wm-afd-style')) return;
    var st = document.createElement('style');
    st.id = 'wm-afd-style';
    st.textContent =
      '#wm-afd-overlay{position:fixed;inset:0;background:rgba(4,8,12,.92);z-index:2147482000;display:flex;flex-direction:column;}' +
      '#wm-afd-overlay .wm-afd-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0b1016;border-bottom:1px solid #2c4557;}' +
      '#wm-afd-overlay .wm-afd-title{color:#e8eef4;font:700 14px monospace;}' +
      '#wm-afd-overlay .wm-afd-open{color:#4cc9f0;font:600 12px monospace;text-decoration:none;}' +
      '#wm-afd-overlay .wm-afd-close{margin-left:auto;background:#1a2530;color:#e8eef4;border:1px solid #2c4557;border-radius:6px;padding:4px 10px;cursor:pointer;font:700 12px monospace;}' +
      '#wm-afd-overlay iframe{flex:1;width:100%;border:0;background:#fff;}' +
      '#wm-afd-section{padding:10px 12px;border-top:2px solid #2c4557;background:#0b1016;}' +
      '#wm-afd-section .wm-afd-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}' +
      '#wm-afd-section .wm-afd-head h3{margin:0;color:#e8eef4;font:700 15px monospace;}' +
      '#wm-afd-section .wm-afd-head a{color:#4cc9f0;font:600 11px monospace;text-decoration:none;}' +
      '#wm-afd-section img.wm-afd-img{display:block;width:100%;height:auto;border:1px solid #2c4557;border-radius:8px;cursor:pointer;margin-top:8px;}';
    document.head.appendChild(st);
  }

  function openOverlay() {
    ensureStyle();
    if (overlay) { overlay.style.display = 'flex'; return; }
    overlay = document.createElement('div');
    overlay.id = 'wm-afd-overlay';
    var bar = document.createElement('div');
    bar.className = 'wm-afd-bar';
    var title = document.createElement('span');
    title.className = 'wm-afd-title';
    title.textContent = TITEL + ' — Grundlagenforschung (Portal)';
    var open = document.createElement('a');
    open.className = 'wm-afd-open';
    open.href = PORTAL;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Extern oeffnen \u2197';
    var close = document.createElement('button');
    close.className = 'wm-afd-close';
    close.textContent = '\u2715 Schliessen';
    close.addEventListener('click', function () { overlay.style.display = 'none'; });
    bar.appendChild(title); bar.appendChild(open); bar.appendChild(close);
    var frame = document.createElement('iframe');
    frame.src = PORTAL;
    frame.title = TITEL;
    frame.allow = 'fullscreen';
    overlay.appendChild(bar);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
  }

  function ensureButton() {
    var bar = document.querySelector('.dashboard-tablist');
    if (!bar) return;
    var b = document.getElementById('wm-afd-tab-btn');
    if (!b) {
      b = document.createElement('button');
      b.id = 'wm-afd-tab-btn';
      b.type = 'button';
      b.textContent = TITEL;
      b.title = 'Forschungsportal AfD-Verbotsverfahren (eingebettet)';
      b.style.cssText = 'margin-left:6px;padding:4px 10px;border-radius:8px;border:1px solid #2c4557;' +
        'background:#10161d;color:#ffd166;font:700 11px monospace;cursor:pointer;';
      b.addEventListener('click', openOverlay);
    }
    /* Verbindlich: LETZTER Eintrag — immer ans Ende der Tab-Leiste. */
    if (b.parentElement !== bar || bar.lastElementChild !== b) bar.appendChild(b);
    lastBar = bar;
  }

  function ensureSection() {
    var grid = document.getElementById('panelsGrid');
    if (!grid) return;
    var sec = document.getElementById('wm-afd-section');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'wm-afd-section';
      var head = document.createElement('div');
      head.className = 'wm-afd-head';
      var h = document.createElement('h3');
      h.textContent = TITEL;
      var a = document.createElement('a');
      a.href = PORTAL;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Forschungsportal oeffnen \u2197';
      head.appendChild(h); head.appendChild(a);
      var img = document.createElement('img');
      img.className = 'wm-afd-img';
      img.src = BILD;
      img.alt = TITEL + ' — Erkennungsbild';
      img.loading = 'lazy';
      img.addEventListener('click', function () { window.open(PORTAL, '_blank', 'noopener'); });
      sec.appendChild(head);
      sec.appendChild(img);
    }
    /* Verbindlich: LETZTES Element des Dashboards — nach allen Panels. */
    if (sec.parentElement !== grid || grid.lastElementChild !== sec) grid.appendChild(sec);
    lastGrid = grid;
  }

  function ensureAll() { ensureButton(); ensureSection(); }

  ensureStyle();
  ensureAll();
  setInterval(ensureAll, 2000);
  window.addEventListener('resize', ensureAll);

  window.__wmAfdTab = { version: VER, open: openOverlay };
})();
