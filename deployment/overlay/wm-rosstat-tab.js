/* wm-rosstat-tab v1 (2026-11-10, operator): Tab 'Rosstat-Leaks' DIREKT VOR dem
   AfD-Verbotsverfahren-Tab (der pinnt sich als LETZTER Eintrag der Tab-Leiste
   per ensure-Intervall — zwei 'letzte' Buttons wuerden gegeneinander flappen).
   Quelle: https://rosstat-leaks.com/ — Rosstat-Melderegister-Auswertung
   (Silent-Crow-Leak). Kein X-Frame-Options, kein CSP frame-ancestors
   (geprueft 10.11. per GET-Header) — Einbettung technisch erlaubt.
   - Tab-Klick: Portal als vollstaendiges iframe-Overlay (EN-Default, RU/EN
     Umschalter liegt in der Seite).
   - Dashboard-Abschnitt: Teaser-Karte in voller Spaltenbreite GANZ UNTEN,
     direkt vor dem AfD-Abschnitt; Klick oeffnet das Portal (echter Tab).
   - Position dauerhaft: ensure-Intervall haengt Button/Abschnitt neu an,
     wenn etwas sie verdraengt. Keine bestehenden Tabs/Panels werden
     veraendert. Geladen via wm-youtube-tab.js-Injector (bewiesene Route). */
(function () {
  'use strict';
  if (window.__wmRosstatTabV1) return;
  window.__wmRosstatTabV1 = true;

  var PORTAL = 'https://rosstat-leaks.com/?lang=en';
  var PORTAL_EXT = 'https://rosstat-leaks.com/';
  var TITEL = 'Rosstat-Leaks';
  var VER = '20261110-1';

  var overlay = null;

  function ensureStyle() {
    if (document.getElementById('wm-rosstat-style')) return;
    var st = document.createElement('style');
    st.id = 'wm-rosstat-style';
    st.textContent =
      '#wm-rosstat-overlay{position:fixed;inset:0;background:rgba(4,8,12,.92);z-index:2147482000;display:flex;flex-direction:column;}' +
      '#wm-rosstat-overlay .wm-rosstat-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0b1016;border-bottom:1px solid #2c4557;}' +
      '#wm-rosstat-overlay .wm-rosstat-title{color:#e8eef4;font:700 14px monospace;}' +
      '#wm-rosstat-overlay .wm-rosstat-open{color:#4cc9f0;font:600 12px monospace;text-decoration:none;}' +
      '#wm-rosstat-overlay .wm-rosstat-close{margin-left:auto;background:#1a2530;color:#e8eef4;border:1px solid #2c4557;border-radius:6px;padding:4px 10px;cursor:pointer;font:700 12px monospace;}' +
      '#wm-rosstat-overlay iframe{flex:1;width:100%;border:0;background:#fff;}' +
      '#wm-rosstat-section{padding:10px 12px;border-top:2px solid #2c4557;background:#0b1016;}' +
      '#wm-rosstat-section .wm-rosstat-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}' +
      '#wm-rosstat-section .wm-rosstat-head h3{margin:0;color:#e8eef4;font:700 15px monospace;}' +
      '#wm-rosstat-section .wm-rosstat-head a{color:#4cc9f0;font:600 11px monospace;text-decoration:none;}' +
      '#wm-rosstat-section .wm-rosstat-card{border:1px solid #2c4557;border-radius:8px;background:#10161d;cursor:pointer;margin-top:8px;padding:12px 14px;}' +
      '#wm-rosstat-section .wm-rosstat-num{color:#ff9e64;font:700 20px monospace;}' +
      '#wm-rosstat-section .wm-rosstat-l1{color:#e8eef4;font:13px system-ui;line-height:1.5;}' +
      '#wm-rosstat-section .wm-rosstat-l2{color:#8aa4ba;font:11px system-ui;line-height:1.5;margin-top:6px;}';
    document.head.appendChild(st);
  }

  function openOverlay() {
    ensureStyle();
    /* Gegenseitaig: falls das AfD-Overlay offen ist, ausblenden (gleiche
     * z-Ebene — DOM-Reihenfolge entschied sonst willkuerlich). */
    var afdOv = document.getElementById('wm-afd-overlay');
    if (afdOv) afdOv.style.display = 'none';
    if (overlay) { overlay.style.display = 'flex'; return; }
    overlay = document.createElement('div');
    overlay.id = 'wm-rosstat-overlay';
    var bar = document.createElement('div');
    bar.className = 'wm-rosstat-bar';
    var title = document.createElement('span');
    title.className = 'wm-rosstat-title';
    title.textContent = TITEL + ' \u2014 Combat Deaths Russia (Portal, RU/EN)';
    var open = document.createElement('a');
    open.className = 'wm-rosstat-open';
    open.href = PORTAL_EXT;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Extern oeffnen \u2197';
    var close = document.createElement('button');
    close.className = 'wm-rosstat-close';
    close.textContent = '\u2715 Schliessen';
    close.addEventListener('click', function () { overlay.style.display = 'none'; });
    bar.appendChild(title); bar.appendChild(open); bar.appendChild(close);
    var frame = document.createElement('iframe');
    frame.src = PORTAL;
    frame.title = TITEL;
    frame.allow = 'fullscreen';
    overlay.appendChild(bar);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
  }

  function ensureButton() {
    var bar = document.querySelector('.dashboard-tablist');
    if (!bar) return;
    var b = document.getElementById('wm-rosstat-tab-btn');
    if (!b) {
      b = document.createElement('button');
      b.id = 'wm-rosstat-tab-btn';
      b.type = 'button';
      b.textContent = TITEL;
      b.title = 'Rosstat-Leaks: russische Gefallenenstatistik (eingebettet)';
      b.style.cssText = 'margin-left:6px;padding:4px 10px;border-radius:8px;border:1px solid #2c4557;' +
        'background:#10161d;color:#ff9e64;font:700 11px monospace;cursor:pointer;';
      b.addEventListener('click', openOverlay);
    }
    /* Verbindlich: DIREKT VOR dem AfD-Tab (AfD pinnt sich als LETZTER).
     * Zielordnung: [... , ROSSTAT, AFD] — beide ensure-Intervalle stabil. */
    var afd = document.getElementById('wm-afd-tab-btn');
    if (afd && afd.parentElement === bar) {
      if (b.parentElement !== bar || afd.previousElementSibling !== b) bar.insertBefore(b, afd);
    } else if (b.parentElement !== bar || bar.lastElementChild !== b) {
      bar.appendChild(b);
    }
  }

  function ensureSection() {
    var grid = document.getElementById('panelsGrid');
    if (!grid) return;
    var sec = document.getElementById('wm-rosstat-section');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'wm-rosstat-section';
      var head = document.createElement('div');
      head.className = 'wm-rosstat-head';
      var h = document.createElement('h3');
      h.textContent = TITEL + ' \u2014 Combat Deaths Russia';
      var a = document.createElement('a');
      a.href = PORTAL_EXT;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Portal \u00f6ffnen \u2197';
      head.appendChild(h); head.appendChild(a);
      var card = document.createElement('div');
      card.className = 'wm-rosstat-card';
      var l1 = document.createElement('div');
      l1.className = 'wm-rosstat-l1';
      var num = document.createElement('span');
      num.className = 'wm-rosstat-num';
      num.textContent = '~450.000 ';
      l1.appendChild(num);
      l1.appendChild(document.createTextNode('registrierte Milit\u00e4rtote \u2014 Auswertung des russischen Rosstat-Melderegisters (MSS-Formular, Silent-Crow-Leak), Datenstand 28.08.2026.'));
      var l2 = document.createElement('div');
      l2.className = 'wm-rosstat-l2';
      l2.textContent = 'Interaktiv: Herkunftsregionen, Sterbeorte (Karten), Registrierungs-Lag, Prognosen, Volltextsuche der Sterbeurkunden. Site-Sprache RU/EN \u2014 Embed startet mit EN. Klick \u00f6ffnet das Portal.';
      card.appendChild(l1); card.appendChild(l2);
      card.addEventListener('click', function () { window.open(PORTAL_EXT, '_blank', 'noopener'); });
      sec.appendChild(head);
      sec.appendChild(card);
    }
    /* Verbindlich: DIREKT VOR dem AfD-Abschnitt (der pinnt sich als LETZTER). */
    var afdSec = document.getElementById('wm-afd-section');
    if (afdSec && afdSec.parentElement === grid) {
      if (sec.parentElement !== grid || afdSec.previousElementSibling !== sec) grid.insertBefore(sec, afdSec);
    } else if (sec.parentElement !== grid || grid.lastElementChild !== sec) {
      grid.appendChild(sec);
    }
  }

  function ensureAll() { ensureButton(); ensureSection(); }

  ensureStyle();
  ensureAll();
  setInterval(ensureAll, 2000);
  window.addEventListener('resize', ensureAll);

  window.__wmRosstatTab = { version: VER, open: openOverlay };
})();
