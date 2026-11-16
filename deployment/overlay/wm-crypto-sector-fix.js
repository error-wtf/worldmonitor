/* wm-crypto-sector-fix.js v1 — Crypto-Sectors-Heatmap: korrekte Heat-Farben
   (up-Zellen nutzten var(--map-country) = Karten-Grün, das im Panel-Kontext
   übergroß/hell wirkt), sauberes 3-Spalten-Grid, kein Overflow. */
(function () {
  if (window.__wmCryptoSectorFix) return;
  window.__wmCryptoSectorFix = true;
  const css = `
    .heatmap { display: grid !important; grid-template-columns: repeat(3, 1fr) !important;
      gap: 6px !important; padding: 6px !important; width: 100% !important;
      max-width: 100% !important; overflow: hidden !important; box-sizing: border-box !important; }
    .heatmap .heatmap-cell { min-width: 0 !important; max-width: 100% !important; overflow: hidden !important;
      border-radius: 6px !important; padding: 12px 8px !important;
      background: rgba(255, 255, 255, 0.03) !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important; box-sizing: border-box !important; }
    .heatmap .heatmap-cell.up-1, .heatmap .heatmap-cell.up-2, .heatmap .heatmap-cell.up-3 {
      background: rgba(38, 122, 82, 0.28) !important; border-color: rgba(72, 187, 120, 0.35) !important; }
    .heatmap .heatmap-cell.down-1, .heatmap .heatmap-cell.down-2, .heatmap .heatmap-cell.down-3 {
      background: rgba(140, 42, 42, 0.22) !important; border-color: rgba(220, 80, 80, 0.28) !important; }
    .heatmap .sector-name { font-size: 11px; letter-spacing: 0.04em; opacity: 0.85;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .heatmap .sector-change { font-size: 15px; font-weight: 700; }
  `;
  const inject = () => {
    if (document.getElementById('wm-crypto-sector-fix-style')) return;
    const st = document.createElement('style');
    st.id = 'wm-crypto-sector-fix-style';
    st.textContent = css;
    document.head.appendChild(st);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  } else {
    inject();
  }
})();
