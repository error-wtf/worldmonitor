(function () {
  'use strict';
  if (window.__wmGnewsFix) return;
  window.__wmGnewsFix = true;
  var SIZE_KEY = 'wm-gnews-size-v1';

  function gnewsPanels() {
    return Array.from(document.querySelectorAll('.panel'))
      .filter(p => /GOOGLE NEWS/i.test((p.querySelector('[class*="title"]') || {}).textContent || ''));
  }

  var css = [
    // groß + resizable:
    '.panels-grid .panel:has(.gnews-feed){grid-column:1 / -1 !important;min-height:620px !important;',
    ' height:var(--wm-gnews-h,620px) !important;max-height:none !important;overflow:hidden;position:relative;}',
    '.panel:has(.gnews-feed) .gnews-feed{max-height:none !important;}',
    // maximiert:
    '.panel.wm-gnews-maximized{position:fixed !important;inset:0 !important;width:100vw !important;',
    ' height:100vh !important;z-index:99999 !important;--wm-gnews-h:100vh !important;border-radius:0;}',
    // handles:
    '.wm-gnews-resize{position:absolute;right:6px;bottom:2px;width:22px;height:22px;cursor:nwse-resize;',
    ' color:#5b7089;opacity:.5;font-size:14px;line-height:22px;text-align:center;user-select:none;z-index:5;}',
    '.wm-gnews-resize:hover{opacity:1;color:#4cc9f0;}',
    '.wm-gnews-max{position:absolute;right:32px;bottom:2px;width:22px;height:22px;cursor:pointer;',
    ' color:#5b7089;opacity:.5;font-size:14px;line-height:22px;text-align:center;user-select:none;z-index:5;}',
    '.wm-gnews-max:hover{opacity:1;color:#4cc9f0;}',
    '.panel.wm-gnews-maximized .wm-gnews-max{color:#4cc9f0;opacity:1;}',
    // sprach-tabs IM panel-header:
    '.wm-gtabs{display:flex;gap:8px;padding:8px 12px 4px;}',
    '.wm-gtabs button{cursor:pointer;border:1px solid #263640;background:#101828;color:#9fb3d1;',
    ' border-radius:7px;font-size:16px;font-weight:700;padding:9px 22px;font-family:inherit;flex:1;}',
    '.wm-gtabs button:hover{border-color:#4cc9f0;color:#fff;}',
    '.wm-gtabs button.active{background:#1b2a4a;color:#fff;border-color:#4cc9f0;}',
    // mein feed (übernimmt das rendering):
    '.gnews-feed-mine{overflow:auto;height:calc(100% - 40px);padding:10px;}',
    '.gnews-feed-mine article{padding:9px 0;border-bottom:1px solid #ffffff18;}',
    '.gnews-feed-mine a{color:#a9ddca;text-decoration:none;font-weight:600;font-size:14px;}',
    '.gnews-feed-mine small{display:block;color:#9baab8;margin-top:4px;}',
    '.gnews-feed-mine .wm-gstatus{padding:6px 10px;color:#9baab8;font-size:11px;}',
    // original-feed unsichtbar (v5 rendert da weiter, stört nicht):
    '.panel:has(.gnews-feed-mine) > .gnews-feed,.panel:has(.gnews-feed-mine) .gnews-feed:not(.gnews-feed-mine){display:none !important;}',
    '.panel:has(.gnews-feed-mine) .gnews-status{display:none !important;}',
    // brief-panel:
    '.wm-worldbrief{padding:10px 14px;overflow:auto;height:100%;}',
    '.wm-worldbrief h4{margin:8px 0 4px;color:#4cc9f0;font-size:13px;}',
    '.wm-worldbrief a{color:#cdd8e8;text-decoration:none;font-size:13.5px;line-height:1.45;display:block;margin:6px 0;}',
    '.wm-worldbrief a:hover{color:#fff;}',
    '.wm-worldbrief .src{color:#5b7089;font-size:11px;}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var LANGS = [
    { key: 'de', label: 'DE' },
    { key: 'en', label: 'World' },
    { key: 'it', label: 'IT' },
  ];

  function renderItems(container, items) {
    container.replaceChildren();
    for (const item of items.slice(0, 22)) {
      let url;
      try { url = new URL(item.link); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      const row = document.createElement('article');
      const a = document.createElement('a');
      a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = item.title;
      const meta = document.createElement('small');
      const pub = new Date(item.publishedAt);
      meta.textContent = (item.source || 'Google News') + (Number.isFinite(pub.getTime()) ? ' · ' + pub.toLocaleString('de-DE') : '');
      row.append(a, meta); container.append(row);
    }
  }

  function loadLang(panel, langKey, tabWrap) {
    var mine = panel.querySelector('.gnews-feed-mine');
    if (!mine) return;
    mine.innerHTML = '<div class="wm-gstatus">Lade ' + langKey.toUpperCase() + '…</div>';
    var cacheKey = 'wm-gnews-cache-' + langKey;
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); } catch (e) {}
    if (cached && Date.now() - cached.time < 240000) {
      renderItems(mine, cached.items);
      var st1 = panel.querySelector('.wm-gstatus');
      if (st1) st1.textContent = cached.items.length + ' Meldungen · ' + new Date(cached.time).toLocaleTimeString('de-DE');
      return;
    }
    fetch('/worldmapp/gnews?lang=' + langKey + '&topic=breaking', { signal: AbortSignal.timeout(20000) })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        if (!Array.isArray(data.items) || !data.items.length) throw new Error('leer');
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ items: data.items, time: Date.now() })); } catch (e) {}
        renderItems(mine, data.items);
        var st2 = panel.querySelector('.wm-gstatus');
        if (st2) st2.textContent = data.items.length + ' Meldungen · ' + new Date().toLocaleTimeString('de-DE');
      })
      .catch(() => {
        if (cached) { renderItems(mine, cached.items); }
        var st3 = panel.querySelector('.wm-gstatus');
        if (st3) st3.textContent = 'Abruf fehlgeschlagen — neuer Versuch folgt.';
      });
  }

  function attachTabs(panel) {
    if (panel.querySelector('.wm-gtabs')) return;
    var origFeed = panel.querySelector('.gnews-feed');
    if (!origFeed) return;
    // original aus dem sichtbaren bereich nehmen (v5 rendert weiter darein, egal):
    var mine = document.createElement('div');
    mine.className = 'gnews-feed-mine';
    mine.innerHTML = '<div class="wm-gstatus">übernehme…</div>';
    origFeed.parentElement.insertBefore(mine, origFeed);
    // tabs GROSS über dem feed (im panel-körper, definitiv sichtbar):
    var header = mine; // tabs direkt über dem eigenen feed
    var wrap = document.createElement('div');
    wrap.className = 'wm-gtabs';
    // aktuelle sprache aus titel ableiten (DE-panel default de usw.):
    var title = (panel.querySelector('[class*="title"]').textContent || '').toLowerCase();
    var cur = /italia/.test(title) ? 'it' : /world/.test(title) ? 'en' : 'de';
    LANGS.forEach(l => {
      var b = document.createElement('button');
      b.textContent = l.label;
      b.dataset.lang = l.key;
      if (l.key === cur) b.classList.add('active');
      b.addEventListener('click', () => {
        cur = l.key;
        wrap.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.lang === l.key));
        loadLang(panel, l.key, wrap);
      });
      wrap.appendChild(b);
    });
    header.appendChild(wrap);
    loadLang(panel, cur, wrap);
  }

  // ---------- resize + maximize je panel:
  function saveSize(p, nh) {
    var id = p.querySelector('[class*="title"]').textContent.trim();
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}'); } catch (err) {}
    saved[id] = nh;
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(saved)); } catch (err) {}
  }

  function addHandles() {
    gnewsPanels().forEach(p => {
      if (!p.querySelector('.wm-gnews-resize')) {
        var h = document.createElement('div');
        h.className = 'wm-gnews-resize';
        h.title = 'Größe ziehen (↘)';
        h.textContent = '◢';
        var startY = 0, startH = 0;
        h.addEventListener('pointerdown', e => {
          startY = e.clientY;
          startH = p.getBoundingClientRect().height;
          h.setPointerCapture(e.pointerId);
          e.preventDefault();
        });
        h.addEventListener('pointermove', e => {
          if (!startY) return;
          var nh = Math.min(1400, Math.max(300, startH + e.clientY - startY));
          p.style.setProperty('--wm-gnews-h', nh + 'px');
          saveSize(p, nh);
        });
        h.addEventListener('pointerup', () => { startY = 0; });
        p.appendChild(h);
      }
      if (!p.querySelector('.wm-gnews-max')) {
        var m = document.createElement('div');
        m.className = 'wm-gnews-max';
        m.title = 'Maximieren / Wiederherstellen';
        m.textContent = '⛶';
        m.addEventListener('click', e => {
          e.stopPropagation();
          p.classList.toggle('wm-gnews-maximized');
        });
        p.appendChild(m);
      }
      attachTabs(p);
    });
  }

  function applySizes() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}'); } catch (e) {}
    gnewsPanels().forEach(p => {
      var id = p.querySelector('[class*="title"]').textContent.trim();
      if (saved[id]) p.style.setProperty('--wm-gnews-h', saved[id] + 'px');
    });
  }

  // ---------- LATEST BRIEF → Daily Brief (3 sprachen)
  var WB_LANGS = [
    { key: 'en', label: '🌍 World', topic: 'world' },
    { key: 'de', label: '🇩🇪 DE', topic: '' },
    { key: 'it', label: '🇮🇹 IT', topic: '' },
  ];
  var WB_CURRENT = 'en';

  function wbRender(brief, lang) {
    var el = brief.querySelector('#wm-wb-items');
    if (!el) return;
    el.innerHTML = '<div class="src">Lade ' + lang.label + '…</div>';
    fetch('/worldmapp/gnews?lang=' + lang.key + (lang.topic ? '&topic=' + lang.topic : ''))
      .then(r => r.json())
      .then(j => {
        el = brief.querySelector('#wm-wb-items');
        if (!el) return;
        el.innerHTML = (j.items || []).slice(0, 10).map(it => {
          var src = (it.title || '').split(' - ').pop();
          var head = (it.title || '').replace(/ - [^-]+$/, '');
          return '<a href="' + it.link + '" target="_blank" rel="noopener">' + head + '</a>' +
                 '<span class="src">' + src + '</span>';
        }).join('') + '<div class="src" style="margin-top:8px">Quelle: Google News · ' +
          new Date().toLocaleTimeString('de-DE') + ' · <a href="#" id="wm-wb-refresh" style="color:#4cc9f0">aktualisieren</a></div>';
        var rf = brief.querySelector('#wm-wb-refresh');
        if (rf) rf.addEventListener('click', e => { e.preventDefault(); wbRender(brief, lang); });
      })
      .catch(() => {
        var el2 = brief.querySelector('#wm-wb-items');
        if (el2) el2.textContent = 'Brief-Quelle nicht erreichbar.';
      });
  }

  function cleanupLegacy() {
    // legacy-spam-leisten (alte versionen) entfernen — immer, unabhängig vom brief:
    document.querySelectorAll('.wm-gnews-tabs:not(.wm-wb-bar)').forEach(x => x.remove());
  }

  function fixBrief() {
    cleanupLegacy();
    // UNIVERSAL: jede login-wall (latest-brief-card--composing mit Sign-in-text)
    // ersetzen — im grid-panel UND im fullscreen/modal:
    var walls = document.querySelectorAll('.latest-brief-card--composing');
    walls.forEach(card => {
      if (card.querySelector('.wm-worldbrief')) return;
      if (!/sign in to view/i.test(card.textContent)) return;
      var bar = document.createElement('div');
      bar.className = 'wm-gtabs wm-wb-bar';
      bar.style.cssText = 'padding:8px 14px 0;';
      WB_LANGS.forEach(l => {
        var b = document.createElement('button');
        b.textContent = l.label;
        b.dataset.lang = l.key;
        if (l.key === WB_CURRENT) b.classList.add('active');
        b.addEventListener('click', () => {
          WB_CURRENT = l.key;
          bar.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.lang === l.key));
          wbRender(card, l);
        });
        bar.appendChild(b);
      });
      card.innerHTML = '<div class="wm-worldbrief"><h4>📰 Daily Brief — ohne Login</h4><div id="wm-wb-items">Lade…</div></div>';
      card.insertBefore(bar, card.firstChild);
      wbRender(card, WB_LANGS.find(l => l.key === WB_CURRENT));
    });
  }

  function run() {
    cleanupLegacy();
    addHandles();
    applySizes();
    fixBrief();
  }
  run();
  setInterval(run, 3000);
})();
