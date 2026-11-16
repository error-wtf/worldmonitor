(function () {
  'use strict';
  if (window.__wmNqFix) return;
  window.__wmNqFix = true;

  var EVENTS = null;
  var EVENTS_AT = 0;

  function fetchEvents() {
    return fetch('/api/economic/v1/get-economic-calendar')
      .then(r => r.json())
      .then(j => {
        EVENTS = j.events || [];
        EVENTS_AT = Date.now();
        return EVENTS;
      });
  }

  function fmtDate(iso) {
    try {
      return new Date(iso + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
    } catch (e) { return iso; }
  }

  function impactBadge(impact) {
    var c = impact === 'high' ? '#e5484d' : impact === 'medium' ? '#f5a524' : '#5b7089';
    return '<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:10.5px;font-weight:700;' +
      'background:' + c + '22;color:' + c + ';border:1px solid ' + c + '55;text-transform:uppercase;">' + impact + '</span>';
  }

  function buildUpcoming() {
    if (!EVENTS || !EVENTS.length) return '<div class="src">Kalender nicht verfügbar.</div>';
    var now = new Date();
    var in14 = new Date(Date.now() + 14 * 864e5);
    var rows = EVENTS.filter(e => {
      var d = new Date(e.date + 'T12:00:00Z');
      return d >= new Date(now.toISOString().slice(0, 10) + 'T00:00:00Z') && d <= in14 &&
        (e.impact === 'high' || e.impact === 'medium');
    }).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
    if (!rows.length) return '<div class="src">Keine High-Impact-Termine in den nächsten 14 Tagen.</div>';
    return rows.map(e =>
      '<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid #1c2740;">' +
      '<span style="min-width:110px;color:#9fb3d1;font-size:12.5px;">' + fmtDate(e.date) + '</span>' +
      '<span style="flex:1;color:#e6edf7;font-size:13.5px;font-weight:600;">' + (e.event || '?') +
      ' <span style="color:#5b7089;font-weight:400;font-size:11.5px;">' + (e.country || '') + '</span></span>' +
      impactBadge(e.impact || 'medium') +
      '</div>'
    ).join('');
  }

  function patchPanel() {
    // Das NQ-Catalysts panel (im grid oder fullscreen) finden:
    var panels = Array.from(document.querySelectorAll('.panel, [class*="panel"]'));
    var p = panels.find(x => /NQ influence earnings/i.test(x.textContent) && x.querySelector('h3'));
    if (!p) return;
    if (p.querySelector('.wm-nq-upcoming')) return; // schon gepatcht

    // Die leere NQ-earnings-box finden (h3 "NQ influence earnings" + folge-content):
    var h3s = Array.from(p.querySelectorAll('h3'));
    var nqH3 = h3s.find(h => /NQ influence earnings/i.test(h.textContent));
    if (!nqH3) return;

    var wrap = document.createElement('div');
    wrap.className = 'wm-nq-upcoming';
    wrap.innerHTML =
      '<h3 style="color:#e6edf7;font-size:14px;margin:14px 0 6px;">📅 Kommende Katalysatoren (14 Tage)</h3>' +
      '<div class="wm-nq-rows" style="border:1px solid #1c2740;border-radius:8px;background:#0b1120;overflow:hidden;">Lade…</div>';
    nqH3.parentElement.insertBefore(wrap, nqH3.nextSibling.nextSibling || null);
    var rowsEl = wrap.querySelector('.wm-nq-rows');

    var load = () => {
      if (EVENTS && Date.now() - EVENTS_AT < 5 * 60 * 1000) {
        rowsEl.innerHTML = buildUpcoming();
      } else {
        rowsEl.innerHTML = '<div class="src" style="padding:10px;">Lade…</div>';
        fetchEvents().then(() => { rowsEl.innerHTML = buildUpcoming(); }).catch(() => {
          rowsEl.innerHTML = '<div class="src" style="padding:10px;">Kalender nicht erreichbar.</div>';
        });
      }
    };
    load();
    setInterval(load, 5 * 60 * 1000);
  }

  // CSS: das fullscreen-layout kompakter machen:
  var st = document.createElement('style');
  st.textContent = [
    '.wm-nq-upcoming h3{font-family:inherit;letter-spacing:.3px;}',
    // leere phrase dezent machen statt groß:
    '.wm-nq-patched .latest-brief-empty-title,.wm-nq-patched h3:empty{display:none;}'
  ].join('');
  document.head.appendChild(st);

  run();
  function run() { patchPanel(); }
  setInterval(run, 2500);
})();
