(() => {
  'use strict';
  if (window.__exitGoogleNews) return;
  window.__exitGoogleNews = true;
  const languages = [['de', 'Deutschland · DE'], ['en', 'World · EN'], ['it', 'Italia · IT']];
  const cache = new Map();
  const pending = new Set();
  const style = document.createElement('style');
  style.textContent = '#market-implicationsContent{content-visibility:visible!important}.gnews-feed{overflow:auto;max-height:430px;padding:10px}.gnews-feed article{padding:9px 0;border-bottom:1px solid #ffffff18}.gnews-feed a{color:#a9ddca;text-decoration:none;font-weight:600}.gnews-feed small{display:block;color:#9baab8;margin-top:4px}.gnews-status{padding:6px 10px;color:#9baab8;font-size:11px}';
  document.head.append(style);
  function render(panel, entry) {
    const list = panel.querySelector('.gnews-feed');
    list.replaceChildren();
    for (const item of entry.items.slice(0, 22)) {
      let url;
      try { url = new URL(item.link); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      const row = document.createElement('article');
      const a = document.createElement('a');
      a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = item.title;
      const meta = document.createElement('small');
      const published = new Date(item.publishedAt);
      meta.textContent = (item.source || 'Google News') + (Number.isFinite(published.getTime()) ? ' · ' + published.toLocaleString('de-DE') : '');
      row.append(a, meta); list.append(row);
    }
    panel.querySelector('.gnews-status').textContent = list.children.length + ' Meldungen angezeigt · abgerufen ' + new Date(entry.time).toLocaleTimeString('de-DE');
    panel.dataset.renderedAt = String(entry.time);
  }
  async function update(lang, panel) {
    if (pending.has(lang)) return;
    const old = cache.get(lang);
    if (old && panel.dataset.renderedAt !== String(old.time)) render(panel, old);
    if (old && Date.now() - old.time < 300000) return;
    if (Date.now() - Number(panel.dataset.attempt || 0) < 30000) return;
    panel.dataset.attempt = String(Date.now()); pending.add(lang);
    try {
      const response = await fetch('/worldmapp/gnews?lang=' + lang + '&topic=breaking', {signal: AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data.items) || !data.items.length) throw new Error('Keine Meldungen geliefert');
      const entry = {items: data.items, time: Date.now()}; cache.set(lang, entry);
      if (panel.isConnected) render(panel, entry);
    } catch (error) {
      panel.querySelector('.gnews-status').textContent = (old ? 'Letzter erfolgreicher Abruf bleibt sichtbar. ' : '') + 'Abruf fehlgeschlagen – neuer Versuch folgt.';
    } finally { pending.delete(lang); }
  }
  function tick() {
    const original = document.querySelector('[data-panel="telegram-intel"], [data-panel="x-intel"]');
    const grid = original?.parentElement || document.querySelector('.panels-grid');
    if (!grid) return;
    for (const [lang, label] of languages) {
      let panel = document.getElementById('exit-gnews-' + lang);
      if (!panel) {
        panel = document.createElement('section'); panel.id = 'exit-gnews-' + lang;
        panel.className = 'panel span-2'; panel.dataset.gnewsLanguage = lang;
        const header = document.createElement('div'); header.className = 'panel-header';
        const title = document.createElement('h2'); title.className = 'panel-title'; title.textContent = 'Google News · ' + label;
        const status = document.createElement('div'); status.className = 'gnews-status'; status.textContent = 'Meldungen werden geladen …'; status.setAttribute('role', 'status');
        const feed = document.createElement('div'); feed.className = 'gnews-feed';
        header.append(title); panel.append(header, status, feed);
        grid.insertBefore(panel, original?.parentElement === grid ? original : grid.firstChild);
      }
      update(lang, panel);
    }
  }
  tick(); setInterval(tick, 2000);
})();
