(function () {
  var PANEL_ID = 'bingsi-rail-eu-panel';
  var FLAG = { CH: '\uD83C\uDDE8\uD83C\uDDED', DE: '\uD83C\uDDE9\uD83C\uDDEA', IT: '\uD83C\uDDEE\uD83C\uDDF9' };
  var NAME = { CH: 'Schweiz', DE: 'Deutschland', IT: 'Italien' };
  var ORDER = ['CH', 'DE', 'IT'];
  var SHOW_MAX = 200;   // krasseste 200 pro Land, Panel-Body scrollt
  var injected = false;
  var inFlight = false;

  function fmtDelay(min) {
    if (min >= 60) return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
    return min + ' min';
  }
  function tripLabel(trip) {
    var t = trip || '';
    var m = t.match(/^\.?ojp-\d+-([^.]+)\.(\d+)\.T[A-Z]\.(\d+)/);
    if (m) {
      var line = m[1];
      var dash = line.search(/-/);
      var primary = dash > 0 ? line.slice(0, dash) : line;
      return primary + ' / ' + m[3];
    }
    m = t.match(/(\d{3,7})\s*$/);
    if (m) return m[1].replace(/^0+(?=\d)/, '') || 'Zug';
    m = t.match(/^ojp:(\d+)/);
    if (m) return m[1];
    return t.replace(/^[.o]jp[:-]/, '').slice(0, 24) || 'Zug';
  }
  function delayColor(m) {
    return m >= 15 ? '#e74c3c' : (m >= 8 ? '#f39c12' : '#b8860b');
  }
  function el(tag) { return document.createElement(tag); }
  function host() {
    return document.getElementById('panelsGrid') || document.querySelector('.panels-grid');
  }

  function render(data) {
    var old = document.getElementById(PANEL_ID);
    if (old) old.remove();
    var cts = data.countries || {};
    var card = el('div');
    card.id = PANEL_ID;
    card.className = 'panel';
    card.style.gridColumn = '1 / -1'; card.style.gridRow = 'span 2';

    var header = el('div');
    header.className = 'panel-header';
    var left = el('div');
    left.className = 'panel-header-left';
    var t = el('span');
    t.className = 'panel-title';
    t.setAttribute('role', 'heading');
    t.setAttribute('aria-level', '2');
    t.textContent = 'Bahn Verspätungen · CH / DE / IT';
    left.appendChild(t);
    header.appendChild(left);

    var badge = el('span');
    badge.style.cssText = 'font-size:11px;white-space:nowrap;margin-left:auto;';
    var parts = [], severe = 0;
    ORDER.forEach(function (k) {
      var c = cts[k];
      if (!c) return;
      parts.push(FLAG[k] + ' ' + (c.total || 0));
      (c.delays || []).forEach(function (d) { if ((d.delayMin || 0) >= 15) severe++; });
    });
    badge.textContent = parts.join('   ·   ') + (severe ? '    |   ⚠ ' + severe + ' schwer' : '');
    header.appendChild(badge);
    card.appendChild(header);

    var body = el('div');
    body.className = 'panel-body';
    // scrollbarer Body: Panel-Row ist ~200-380px hoch -> innerer Scroll
    body.style.cssText = 'overflow:auto;font-family:system-ui;padding:6px 10px 10px;max-height:620px;';

    var sub = el('div');
    sub.style.cssText = 'font-size:10.5px;opacity:.6;margin:2px 0 10px;';
    sub.textContent = 'Top ' + SHOW_MAX + ' Verspätungen pro Land · Echtzeit: GTFS-RT opentransportdata.swiss · ViaggiaTreno · bahnhof.de · Stand ' +
      new Date(data.generatedAt).toLocaleTimeString('de-DE');
    body.appendChild(sub);

    var cols = el('div');
    cols.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;';

    ORDER.forEach(function (k) {
      var c = cts[k];
      if (!c) return;
      var block = el('div');
      block.style.cssText = 'min-width:0;';

      var bh = el('div');
      bh.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.25);margin-bottom:4px;';
      var bl = el('span');
      bl.style.cssText = 'font-weight:700;font-size:12px;';
      bl.textContent = FLAG[k] + ' ' + NAME[k];
      var br = el('span');
      br.style.cssText = 'font-size:10.5px;opacity:.75;white-space:nowrap;';
      if (c.realtimeAvailable === false && !(c.delays || []).length) {
        br.style.color = '#f39c12';
        br.textContent = (c.total || 0) + ' verspätet · ' + (c.scanned || 0) + ' geprüft · keine Echtzeit';
      } else {
        br.textContent = (c.total || 0) + ' verspätet' + (c.scanned ? ' · ' + c.scanned + ' geprüft' : '');
      }
      bh.appendChild(bl); bh.appendChild(br);
      block.appendChild(bh);

      var delays = c.delays || [];
      if (!delays.length) {
        var ok = el('div');
        ok.style.cssText = 'padding:4px 0;font-size:11.5px;';
        if (c.realtimeAvailable === false || !(c.scanned > 0 || c.totalTrips > 0)) {
          ok.style.opacity = '.65';
          ok.textContent = c.realtimeAvailable === false ? 'Echtzeitdaten derzeit nicht verfügbar.' : 'Keine bestätigte Abdeckung – Pünktlichkeit kann nicht bewertet werden.';
        } else {
          ok.textContent = 'Keine Verspätungen in den erfassten Daten gemeldet.';
        }
        block.appendChild(ok);
      } else {
        delays.slice(0, SHOW_MAX).forEach(function (d) {
          var row = el('div');
          row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid rgba(128,128,128,.12);font-size:11.5px;';
          var nm = el('span');
          nm.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
          nm.textContent = (k === 'CH' ? tripLabel(d.trip) : (d.trip || ''));
          nm.title = (d.to || d.trip || '') + (d.canceled ? ' — FAHRT FÄLLT AUS' : '');
          var dm = el('span');
          var m = d.delayMin || 0;
          dm.style.cssText = 'color:' + (d.canceled ? '#95a5a6' : delayColor(m)) + ';font-weight:700;white-space:nowrap;';
          dm.textContent = d.canceled ? '✕ Ausfall' : '+' + fmtDelay(m);
          row.appendChild(nm); row.appendChild(dm);
          block.appendChild(row);
        });
        if (delays.length > SHOW_MAX) {
          var more = el('div');
          more.style.cssText = 'padding:3px 0;font-size:10.5px;opacity:.6;';
          more.textContent = '+' + (delays.length - SHOW_MAX) + ' weitere';
          block.appendChild(more);
        }
      }
      cols.appendChild(block);
    });
    body.appendChild(cols);
    card.appendChild(body);
    return card;
  }

  function tick() {
    if (inFlight) return;
    var h = host();
    if (!h) return;
    inFlight = true;
    fetch('/worldmapp/ch-rail?t=' + Math.floor(Date.now() / 60000))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var data = d.countries ? d : { generatedAt: d.generatedAt, countries: { CH: { total: d.delayedCount, delays: d.delays } } };
        var hh = host();
        if (!hh) return;
        hh.appendChild(render(data));
        injected = true;
      })
      .catch(function () {})
      .then(function () { inFlight = false; });
  }

  var fast = setInterval(function () {
    tick();
    if (injected) clearInterval(fast);
  }, 1000);
  setInterval(tick, 300000);
  tick();
})();
