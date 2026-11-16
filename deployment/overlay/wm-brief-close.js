
// ── v6: close-button + reopen für das Brief-Panel ──
(function () {
  'use strict';
  if (window.__wmBriefClose) return;
  window.__wmBriefClose = true;
  var st = document.createElement('style');
  st.textContent = [
    '.wm-brief-close{position:absolute;top:6px;right:8px;width:26px;height:26px;',
    'cursor:pointer;border:1px solid #263640;background:#101828;color:#9fb3d1;',
    'border-radius:5px;font-size:15px;line-height:24px;text-align:center;z-index:6;}',
    '.wm-brief-close:hover{color:#fff;border-color:#ff6b6b;background:#3a1520;}',
    '.wm-brief-reopen{position:fixed;bottom:12px;left:12px;z-index:99990;cursor:pointer;',
    'border:1px solid #4cc9f0;background:#0d1b2e;color:#4cc9f0;border-radius:7px;',
    'font-size:12px;font-weight:700;padding:8px 14px;display:none;}',
    '.wm-brief-reopen:hover{background:#1b2a4a;color:#fff;}',
    '.panel.wm-brief-hidden{display:none !important;}'
  ].join('');
  document.head.appendChild(st);

  function findPanel() {
    return document.querySelector('.latest-brief-card') &&
      document.querySelector('.latest-brief-card').closest('.panel, section');
  }

  function showReopen() {
    var btn = document.getElementById('wm-brief-reopen-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'wm-brief-reopen-btn';
      btn.className = 'wm-brief-reopen';
      btn.textContent = '\uD83D\uDCF0 World Briefing';
      btn.addEventListener('click', function () {
        document.querySelectorAll('.panel.wm-brief-hidden').forEach(function (p) { p.classList.remove('wm-brief-hidden'); });
        try { localStorage.setItem('wm-brief-closed', '0'); } catch (e) {}
        btn.style.display = 'none';
      });
      document.body.appendChild(btn);
    }
    btn.style.display = 'block';
  }

  function attach() {
    var panel = findPanel();
    if (!panel || panel.querySelector('.wm-brief-close')) return false;
    var btn = document.createElement('button');
    btn.className = 'wm-brief-close';
    btn.textContent = '\u2715';
    btn.title = 'Briefing schlie\u00dfen';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.add('wm-brief-hidden');
      try { localStorage.setItem('wm-brief-closed', '1'); } catch (e2) {}
      showReopen();
    });
    panel.style.position = panel.style.position || 'relative';
    panel.appendChild(btn);
    // wiederherstellen falls vorher geschlossen:
    try {
      if (localStorage.getItem('wm-brief-closed') === '1') {
        panel.classList.add('wm-brief-hidden');
        showReopen();
      }
    } catch (e) {}
    return true;
  }

  var tries = 0;
  var iv = setInterval(function () {
    tries += 1;
    if (attach() || tries > 200) clearInterval(iv);
  }, 1500);
  var mo = new MutationObserver(function () { attach(); });
  mo.observe(document.body, { childList: true, subtree: true });
})();
