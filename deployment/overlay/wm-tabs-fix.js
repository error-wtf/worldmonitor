(function () {
  'use strict';
  if (window.__wmTabsFix) return;
  window.__wmTabsFix = true;
  var LS_KEY = 'worldmonitor-tabs-v1:full';
  var SCALE_KEY = 'wm-tab-scale-v1';

  // ---- Gewuenschte Tab-Reihenfolge (operator: oben News+KI+Zeit+TV/Radio/Webcams,
  // mitte Krise/Krieg, unten Wirtschaft). Namen = tab.name exakt wie in tabs[].
  var ORDER = [
    // 1. MEDIEN
    'TV', 'Radio', 'World Clock', 'Webcams', 'Windy Webcams', 'Live Webcams', 'Diverses',
    // 2. NACHRICHTEN
    'World News', 'United States', 'Europe', 'Middle East', 'Africa',
    'Latin America', 'Asia-Pacific', 'Latest Brief',
    // 3. POLITIK & GEOPOLITIK
    'Intel', 'Intel Feed', 'Gdelt Intel', 'Threat Timeline', 'Cross Source Signals',
    'Country Instability', 'Infrastructure Cascade', 'Sicherheit', 'Sanctions Pressure',
    'Hormuz Tracker', 'Defense Patents', 'Disease Outbreaks',
    'Internet Disruptions', 'Population Exposure', 'Toronto Safety',
    'Government', 'Think Tanks',
    // 4. WIRTSCHAFT & FINANZEN
    'Markets', 'Crypto', 'Stocks', 'Energy', 'Economy', 'Commodities', 'Sector Heatmap',
    'Stablecoins', 'Layoffs Tracker', 'Stock Analysis', 'Stock Backtest',
    'Energy Complex', 'Oil Inventories', 'Energy Crisis', 'Chokepoint Strip',
    'Crypto Heatmap', 'Defi Tokens', 'Ai Tokens', 'Other Tokens', 'Global Procurement',
    'Consumer Prices', 'Trade Policy', 'WSB Ticker Scanner', 'Daily Market Brief',
    'Market Implications', 'Fear Greed', 'Aaii Sentiment', 'Market Breadth',
    'News Market Correlation', 'Macro Tiles', 'Fsi', 'Nq Pulse', 'Nq Catalysts',
    'Yield Curve', 'Earnings Calendar', 'Economic Calendar', 'Cot Positioning',
    'Liquidity Shifts', 'Positioning 247', 'Gold Intelligence', 'Etf Flows',
    'Economic Indicators',
    // 5. WISSENSCHAFT & FORSCHUNG
    'AI/ML', 'Predictions', 'Insights', 'Social Velocity', 'Technology',
    // 6. WETTER, KLIMA & UMWELT
    'Satellite Fires'
  ];
  var RANK = {};
  ORDER.forEach(function (n, i) { RANK[n.toLowerCase()] = i; });
  // Unbekannte Namen ans Ende (nach Wirtschaft), Reihenfolge wie bisher.
  var BASE = ORDER.length + 100;

  function resortTabs() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var v = JSON.parse(raw);
      if (!v || !Array.isArray(v.tabs) || v.tabs.length < 2) return;
      var sig = v.tabs.map(function (t) { return t.name; }).join('|');
      if (localStorage.getItem('wm-tabs-resorted') === sig) return; // schon sortiert
      var withRank = v.tabs.map(function (t, i) {
        var r = RANK[String(t.name).toLowerCase()];
        return { t: t, r: r === undefined ? BASE + i : r };
      });
      withRank.sort(function (a, b) { return a.r - b.r; });
      v.tabs = withRank.map(function (x) { return x.t; });
      localStorage.setItem(LS_KEY, JSON.stringify(v));
      localStorage.setItem('wm-tabs-resorted', sig + ':v2');
    } catch (e) { /* still */ }
  }
  resortTabs();
  window.addEventListener('storage', resortTabs);

  // ---- CSS: groessere Tabs + resize-scale-Variable
  var css = [
    '.dashboard-tabs-bar{min-height:calc(46px * var(--wm-tab-scale,1.35));padding-top:6px;}',
    '.dashboard-tab-label{font-size:calc(15px * var(--wm-tab-scale,1.35) * var(--wm-panel-effective-scale,1))!important;',
    'padding:9px 14px!important;max-width:260px!important;}',
    '.dashboard-tab-close{font-size:calc(16px * var(--wm-tab-scale,1.35))!important;}',
    '.dashboard-tab{border-radius:8px 8px 0 0!important;}',
    '.dashboard-tab[aria-selected="true"] .dashboard-tab-label{color:var(--text)!important;}',
    '/* Resize-Griff rechts in der Tab-Leiste */',
    '.wm-tabs-resize{display:flex;align-items:center;justify-content:center;width:14px;cursor:ew-resize;',
    'color:var(--text-dim);opacity:.55;flex-shrink:0;user-select:none;font-size:12px;letter-spacing:2px;}',
    '.wm-tabs-resize:hover{opacity:1;color:var(--accent,#4cc9f0);}'
  ].join('');
  var style = document.createElement('style');
  style.id = 'wm-tabs-style';
  style.textContent = css;
  document.documentElement.appendChild(style);

  // ---- Scale anwenden (persistiert)
  function applyScale(s) {
    document.documentElement.style.setProperty('--wm-tab-scale', String(s));
    localStorage.setItem(SCALE_KEY, String(s));
  }
  var saved = parseFloat(localStorage.getItem(SCALE_KEY));
  if (!isNaN(saved) && saved >= 0.8 && saved <= 3) applyScale(saved);

  // ---- Resize-Griff in die Tab-Leiste haengen
  function addHandle() {
    var bar = document.querySelector('.dashboard-tabs-bar');
    if (!bar || bar.querySelector('.wm-tabs-resize')) return;
    var h = document.createElement('div');
    h.className = 'wm-tabs-resize';
    h.title = 'Tab-Größe ziehen (← →)';
    h.textContent = '≡';
    bar.appendChild(h);
    var startX = 0, startScale = 1.35, dragging = false;
    var cur = parseFloat(localStorage.getItem(SCALE_KEY)) || 1.35;
    h.addEventListener('pointerdown', function (e) {
      dragging = true; startX = e.clientX; startScale = cur;
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    var onMove = function (e) {
      if (!dragging) return;
      var s = Math.min(3, Math.max(0.8, startScale + (e.clientX - startX) / 60));
      cur = s; applyScale(s);
    };
    h.addEventListener('pointermove', onMove);
    h.addEventListener('mousemove', onMove);
    var onUp = function () { dragging = false; };
    h.addEventListener('pointerup', onUp);
    h.addEventListener('mouseup', onUp);
    window.addEventListener('mouseup', onUp);
  }

  // ---- STRG+Mausrad auf der Tab-Leiste = Größe regeln (garantiert nutzbar)
  function addWheel() {
    var bar = document.querySelector('.dashboard-tabs-bar');
    if (!bar || bar.__wmWheel) return;
    bar.__wmWheel = true;
    bar.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      var cur = parseFloat(localStorage.getItem(SCALE_KEY)) || 1.35;
      var s = Math.min(3, Math.max(0.8, cur + (e.deltaY < 0 ? 0.1 : -0.1)));
      applyScale(s);
    }, { passive: false });
  }

  // ---- +/– Buttons neben dem Griff
  function addButtons() {
    var bar = document.querySelector('.dashboard-tabs-bar');
    if (!bar || bar.querySelector('.wm-tabs-btn')) return;
    var mk = function (txt, delta, title) {
      var btn = document.createElement('button');
      btn.className = 'wm-tabs-btn wm-tabs-resize';
      btn.title = title;
      btn.textContent = txt;
      btn.style.cssText = 'width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;flex-shrink:0;color:var(--text-dim);font-size:15px;line-height:1;';
      btn.addEventListener('click', function () {
        var cur = parseFloat(localStorage.getItem(SCALE_KEY)) || 1.35;
        var s = Math.min(3, Math.max(0.8, cur + delta));
        applyScale(s);
        btn.style.color = 'var(--accent,#4cc9f0)';
        setTimeout(function () { btn.style.color = ''; }, 300);
      });
      return btn;
    };
    bar.appendChild(mk('−', -0.15, 'Tabs kleiner'));
    bar.appendChild(mk('+', +0.15, 'Tabs größer'));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addHandle);
  } else {
    addHandle();
  }
  setInterval(function () { addHandle(); addWheel(); addButtons(); }, 3000); // nach app re-render wieder einhaengen
})();
