(function () {
  'use strict';
  if (window.__wmPanelResize) return;
  window.__wmPanelResize = true;
  var SIZE_KEY = 'wm-panel-size-v1';

  function panelId(p) {
    return p.getAttribute('data-panel') ||
      (p.querySelector('[class*="title"]') || {}).textContent?.trim().slice(0, 40) ||
      ('p' + Array.from(p.parentElement.children).indexOf(p));
  }

  function allPanels() {
    return Array.from(document.querySelectorAll('.panels-grid .panel'))
      .filter(p => !p.querySelector('.gnews-feed')); // gnews hat eigenes system
  }

  var css = [
    '.panels-grid .panel{position:relative;}',
    '.panels-grid .panel{height:var(--wm-p-h,auto) !important;}',
    '.panels-grid .panel .panel-body,[class*="Content"]{max-height:none !important;}',
    '.wm-p-resize{position:absolute;right:4px;bottom:2px;width:20px;height:20px;cursor:nwse-resize;',
    ' color:#5b7089;opacity:.45;font-size:13px;line-height:20px;text-align:center;user-select:none;z-index:106;}',
    '.wm-p-resize:hover{opacity:1;color:#4cc9f0;}',
    '.wm-p-max{position:absolute;right:28px;bottom:2px;width:20px;height:20px;cursor:pointer;',
    ' color:#5b7089;opacity:.45;font-size:13px;line-height:20px;text-align:center;user-select:none;z-index:106;}',
    '.wm-p-max:hover{opacity:1;color:#4cc9f0;}',
    '.panel.wm-p-maximized{position:fixed !important;inset:0 !important;width:100vw !important;',
    ' height:100vh !important;min-height:100vh !important;min-width:100vw !important;',
    ' z-index:99999 !important;--wm-p-h:100vh !important;border-radius:0;overflow:auto;display:block !important;}',
    '.panel.wm-p-maximized .wm-p-max{color:#4cc9f0;opacity:1;}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  function doMaximize(p) {
    p.__wmHome = p.parentElement;
    p.__wmNext = p.nextSibling;
    p.classList.add('wm-p-maximized');
    document.body.appendChild(p);
  }

  function loadSizes() {
    try { return JSON.parse(localStorage.getItem(SIZE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveSize(id, h) {
    var s = loadSizes();
    s[id] = h;
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function enhance(p) {
    if (p.querySelector('.wm-p-resize')) return;
    var id = panelId(p);
    // resize:
    var h = document.createElement('div');
    h.className = 'wm-p-resize';
    h.title = 'Panel-Größe ziehen (↘)';
    h.textContent = '◢';
    var startY = 0, startH = 0;
    h.addEventListener('pointerdown', e => {
      p = h.closest('.panel') || p;
      startY = e.clientY;
      startH = p.getBoundingClientRect().height;
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    h.addEventListener('pointermove', e => {
      if (!startY) return;
      var nh = Math.min(1600, Math.max(200, startH + e.clientY - startY));
      p.style.setProperty('--wm-p-h', nh + 'px');
      saveSize(id, nh);
    });
    h.addEventListener('pointerup', () => { startY = 0; });
    p.appendChild(h);
    // maximize:
    var m = document.createElement('div');
    m.className = 'wm-p-max';
    m.title = 'Maximieren / Wiederherstellen';
    m.setAttribute('role', 'button');
    m.setAttribute('aria-label', 'Maximieren / Wiederherstellen');
    m.tabIndex = 0;
    m.addEventListener('pointerdown', e => e.stopPropagation());
    m.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.click(); }
    });
    m.textContent = '⛶';
    m.addEventListener('click', e => {
      e.stopPropagation();
      p = m.closest('.panel') || p;
      var goingMax = !p.classList.contains('wm-p-maximized');
      if (goingMax && p.innerHTML.includes('panel-deferred-skeleton')) {
        // Skeleton-Shell (noch nie geladen): die App entfernt ungeladene Shells
        // beim Portieren — Maximize würde ein leeres Vollbild zeigen.
        // Erst laden lassen (Scroll in den Viewport), dann Maximize erneut:
        p.scrollIntoView({ block: 'center', behavior: 'smooth' });
        var hint = p.querySelector('.wm-load-hint');
        if (!hint) {
          hint = document.createElement('div');
          hint.className = 'wm-load-hint';
          hint.style.cssText = 'padding:8px 10px;color:#f5a524;font-size:12px;';
          hint.textContent = '⏳ Panel wird geladen — Maximize danach erneut klicken.';
          p.appendChild(hint);
          setTimeout(() => hint.remove(), 6000);
        }
        return;
      }
      if (goingMax) {
        doMaximize(p);
      } else {
        p.classList.remove('wm-p-maximized');
        if (p.__wmHome) {
          if (p.__wmNext && p.__wmNext.parentElement === p.__wmHome) p.__wmHome.insertBefore(p, p.__wmNext);
          else p.__wmHome.appendChild(p);
          p.__wmHome = null; p.__wmNext = null;
              }
      }
    });
    p.appendChild(m);
    // gespeicherte größe:
    var s = loadSizes()[id];
    if (s) p.style.setProperty('--wm-p-h', s + 'px');
  }

  function run() {
    // deferred-shell panels: die shell + der echte inhalt — enhance auf shell:
    allPanels().forEach(enhance);
  }
  run();
  setInterval(run, 2500);
})();
