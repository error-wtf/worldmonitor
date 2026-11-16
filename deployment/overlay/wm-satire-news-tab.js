(function () {
  'use strict';
  if (window.__wmSatireNewsTab) return;
  window.__wmSatireNewsTab = true;
  // operator 12.10.2026: https://error.wtf/mad-news/ als zusaetzlicher News-Tab
  // "Satire" in der News-Ansicht (/worldmapp/news.html).
  //
  // WARUM NICHT direkt iframen: error.wtf (Hostinger) setzt
  // X-Frame-Options: SAMEORIGIN -> geladen wird ueber den nginx-Proxy
  // /madnews/ auf exit-matrix.net (stript XFO/CSP, Muster sporen.conf).
  //
  // WICHTIG: news.js setzt Labels INDEX-BASIERT auf ALLE [data-tab]-Buttons
  // (tabLabels[lang][i]). Ein neuer Button wuerde also ALLE Labels verschieben.
  // Gegenmassnahme: wir setzen unser Label NACH news.js und re-asserten via
  // Interval; news.js' forEach schreibt uns zwar periodisch um, aber unser
  // Interval korrigiert sofort zurueck (label-fighting nur auf EINEM Button,
  // alle anderen bleiben unberuehrt, weil wir nichts am DOM umhaengen).
  // Die Reihenfolge setzen wir per CSS-order (Muster news-tabs-fix.js).

  var TAB_ID = 'satire';
  // KOMPLETTE WP-Seite (operator: "dann fehlt aber der rest der madnews seite"):
  // /mad-news/ mit Disclaimer, Menue, Footer — nicht die nackte App.
  // Die WP-Seite iframt intern die App /madnews/ (absolute URL) — nginx
  // proxiiert beide und schreibt die nested-src per sub_filter auf
  // same-origin um (sonst SAMEORIGIN-Fehler -> ewiges "Loading").
  var iframeSrc = '/mad-news/';
  var LABELS = { de: 'Satire', it: 'Satira', en: 'Satire' };

  var style = document.createElement('style');
  style.textContent =
    // 1400px: WP-Seite ist lang (Hero + Disclaimer + Artikel via nested iframe
    // height=4096). Vision-Check zeigte ~280px = nur Hero sichtbar.
    '#feed .wm-satire-frame{width:100%;height:1400px;min-height:600px;border:1px solid #2a3550;border-radius:8px;background:#fff;}' +
    '.wm-satire-note{padding:6px 10px;color:#9baab8;font-size:11px;}';
  document.head.appendChild(style);

  function lang() {
    try { return (new URLSearchParams(location.search).get('lang') || document.documentElement.lang || 'de').slice(0, 2); }
    catch (e) { return 'de'; }
  }

  function ensureButton() {
    var list = document.querySelector('.tabs');
    if (!list) return null;
    var btn = list.querySelector('button[data-tab="' + TAB_ID + '"]');
    if (!btn) {
      btn = document.createElement('button');
      btn.setAttribute('data-tab', TAB_ID);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.addEventListener('click', function () {
        // active-Markierung selbst setzen (news.js kennt unseren Tab nicht)
        document.querySelectorAll('.tabs button[data-tab]').forEach(function (b) {
          var active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', String(active));
        });
        renderSatire();
      });
      list.appendChild(btn);
    }
    // Label re-asserten (news.js schreibt index-basiert darueber)
    var want = LABELS[lang()] || LABELS.de;
    if (btn.textContent !== want) btn.textContent = want;
    // news.js hat beim Modul-Load onclick=render auf ALLE [data-tab]-Buttons
    // gesetzt (auch unseren, da defer vor module laeuft). Sein Handler wuerde
    // api('news/satire') fetchen -> 404 -> Fehlermeldung ueberschreibt unseren
    // iframe. Unser addEventListener bleibt; onclick (nur news.js) weg:
    if (btn.onclick) btn.onclick = null;
    // per CSS ans Ende der Info-Gruppe (nach Wetter/vor Krise-Gruppe ist egal,
    // operator: "weiterer news tab" -> einfach hinten anhaengen via order)
    if (!btn.style.order) btn.style.order = '55'; // nach 'barometer'(90+fallback), vor nichts
    return btn;
  }

  function isMineActive() {
    var b = document.querySelector('.tabs button[data-tab="' + TAB_ID + '"]');
    return !!(b && b.classList.contains('active'));
  }

  function renderSatire() {
    var feed = document.getElementById('feed');
    if (!feed) return;
    feed.replaceChildren();
    var note = document.createElement('p');
    note.className = 'wm-satire-note';
    note.textContent = 'MAD NEWS · satirische KI-Generierung aus echten Schlagzeilen (error.wtf) · Quelle: goodnewsnetwork.org';
    var frame = document.createElement('iframe');
    frame.className = 'wm-satire-frame';
    frame.src = iframeSrc;
    frame.title = 'MAD NEWS — Satire-Nachrichten';
    frame.setAttribute('loading', 'lazy');
    feed.appendChild(note);
    feed.appendChild(frame);
  }

  // KERN-FIX (Vision-Check 04:00): news.js' async Feed-Refresh (oder sein
  // Tab-Handler) kann #feed UEBERSCHREIBEN, waehrend unser Tab aktiv ist
  // -> Feed-Inhalt unter aktivem Satire-Tab. Observer stellt unseren
  // Content sofort wieder her, solange 'satire' active ist:
  new MutationObserver(function () {
    if (!isMineActive()) return;
    var feed = document.getElementById('feed');
    if (feed && !feed.querySelector('iframe.wm-satire-frame')) renderSatire();
  }).observe(document.body, { childList: true, subtree: false });

  // Wenn news.js auf einen seiner Tabs rendert, ist unser iframe weg — ok.
  // active-Zustand Unsere Tab-Markierung nehmen wir via Observer zurueck,
  // falls news.js einen eigenen Tab aktiviert:
  new MutationObserver(function () {
    var list = document.querySelector('.tabs');
    if (!list) return;
    var mine = list.querySelector('button[data-tab="' + TAB_ID + '"]');
    if (!mine) return;
    var otherActive = list.querySelector('button[data-tab]:not([data-tab="' + TAB_ID + '"]).active');
    if (otherActive && mine.classList.contains('active')) {
      mine.classList.remove('active');
      mine.setAttribute('aria-selected', 'false');
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  var tries = 0;
  (function boot() {
    tries++;
    var ok = ensureButton();
    if (ok && tries > 2) return; // news.js-Labels sind gelaufen, wir haben korrigiert
    if (tries < 240) setTimeout(boot, 500);
  })();
  setInterval(function () { try { ensureButton(); } catch (e) {} }, 1500);
})();
