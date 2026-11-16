(() => {
  'use strict';
  if (window.__exitWsb) return;
  window.__exitWsb = true;
  const ID = 'exit-wsb-tickers';
  function build() {
    const orig = document.querySelector('[data-panel="wsb-ticker-scanner"]');
    const grid = orig?.parentElement || document.querySelector('.panels-grid');
    if (!grid) return false;
    let panel = document.getElementById(ID);
    if (panel) return true;
    panel = document.createElement('section');
    panel.id = ID;
    panel.className = 'panel span-2';
    const header = document.createElement('div');
    header.className = 'panel-header';
    const title = document.createElement('h2');
    title.className = 'panel-title';
    title.textContent = 'WSB Ticker Scanner';
    const status = document.createElement('div');
    status.className = 'wsb-status';
    status.style.cssText = 'padding:4px 10px;color:#9baab8;font-size:11px';
    status.textContent = 'Meldungen werden geladen…';
    header.append(title, status);
    const list = document.createElement('div');
    list.className = 'wsb-feed';
    list.style.cssText = 'overflow:auto;max-height:300px;padding:6px 10px';
    panel.append(header, list);
    if (orig && orig.parentElement === grid) grid.insertBefore(panel, orig);
    else grid.prepend(panel);
    // Supplemental feed: do not hide the enabled catalog panel.
    return true;
  }
  async function update() {
    const panel = document.getElementById(ID);
    if (!panel) return;
    try {
      const r = await fetch('/worldmapp/wsb', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const list = panel.querySelector('.wsb-feed');
      list.replaceChildren();
      for (const t of (j.tickers || []).slice(0, 12)) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #ffffff14;font-family:system-ui';
        const sym = document.createElement('span');
        sym.style.cssText = 'color:#a9ddca;font-weight:700';
        sym.textContent = '$' + (t.symbol || t.ticker);
        const meta = document.createElement('span');
        meta.style.cssText = 'color:#9baab8;font-size:12px';
        const src = (t.subreddits || []).includes('coingecko-trending') || t.source === 'coingecko-trending' ? 'Trending' : 'HN';
        meta.textContent = (t.mentions ?? t.mentionCount ?? 1) + '× · ' + src;
        row.append(sym, meta);
        list.append(row);
      }
      panel.querySelector('.wsb-status').textContent = (j.tickers || []).length + ' Ticker · abgerufen ' + new Date().toLocaleTimeString('de-DE');
    } catch (e) {
      const st = panel.querySelector('.wsb-status');
      if (st) st.textContent = 'Fehler: ' + String(e.message || e).slice(0, 60);
    }
  }
  const boot = setInterval(() => { if (build()) { clearInterval(boot); update(); setInterval(update, 300000); } }, 1000);
  setTimeout(() => clearInterval(boot), 60000);
})();
