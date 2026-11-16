/* WM Maps-Ausklapp-Menü (r36) — operator 30.10.26: 'baue wegen den vielen maps
 * die maps auswahl als ausklapp menu um'. Die #mapDimensionToggle-Leiste
 * wird zum aufklappbaren Panel hinter einem '🗺 MAPS ▾'-Knopf. Die Buttons
 * selbst bleiben unangetastet (gleiche Elemente/Klassen → Suite-Selektoren
 * bleiben gültig), nur das Layout klappt aus/ein. Aktiver Modus wird im
 * Knopf angezeigt. Schließt bei Klick außerhalb und nach Modus-Wahl. */
(function () {
  'use strict';
  if (window.__wmMapsMenu) return;
  window.__wmMapsMenu = 1;

  function build() {
    var bar = document.getElementById('mapDimensionToggle');
    if (!bar || bar.dataset.wmMenu) return false;
    if (!bar.querySelector('.map-dim-btn')) return false;
    bar.dataset.wmMenu = '1';

    var parent = bar.parentElement;
    var wrap = document.createElement('div');
    wrap.id = 'wm-maps-menu';
    parent.insertBefore(wrap, bar);

    var tg = document.createElement('button');
    tg.type = 'button';
    tg.id = 'wm-maps-toggle';
    tg.className = 'map-dim-btn';
    tg.setAttribute('aria-haspopup', 'true');
    tg.setAttribute('aria-expanded', 'false');
    tg.title = 'Karten-Auswahl';
    tg.textContent = 'MAPS ▾';
    wrap.appendChild(tg);

    // r36-v2-fix: die bar bleibt REACT-owned an ort (das body-verschieben
    // brach den app-flat-map-boot — bewiesen 31.10.: __wmMapHost fehlte,
    // r26/r27b rot). Gegen die iframe-interception hilft der z-index-boost
    // am WRAP und am header-parent (styles statt DOM-verschiebung).

    // z-boost: der header-parent (react-owned, nur style — react reconciled
    // eigene styles nicht weg, solange er sie nicht selbst setzt) muss UEber
    // dem mapSection-iframe (z60) liegen, sonst interceptet das iframe die
    // panel-buttons.
    try {
      var hp = parent;
      hp.style.position = hp.style.position || 'relative';
      hp.style.zIndex = '1400';
    } catch (e) {}
    var st = document.createElement('style');
    st.id = 'wm-maps-menu-style';
    st.textContent =
      '#wm-maps-menu{position:relative;display:inline-flex;z-index:1300;}' +
      '#mapDimensionToggle{display:none;flex-direction:column;align-items:stretch;position:absolute;top:100%;left:0;margin-top:6px;min-width:132px;max-height:72vh;overflow-y:auto;background:rgba(10,14,12,.97);border:1px solid rgba(0,229,255,.25);border-radius:8px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.55);z-index:9999;}' +
      '#mapDimensionToggle.open{display:flex;}' +
      '#mapDimensionToggle .map-dim-btn{width:100%;text-align:left;margin:2px 0;white-space:nowrap;}' +
      '#wm-maps-toggle .wm-act{color:#00e5ff;font-weight:600;}';
    (document.head || document.documentElement).appendChild(st);

    function label() {
      var act = bar.querySelector('.map-dim-btn.active');
      tg.innerHTML = '🗺 ' + (act ? '<span class="wm-act"></span>' : 'MAPS') + ' ▾';
      if (act) tg.querySelector('.wm-act').textContent = act.textContent.trim();
    }
    function setOpen(o) {
      bar.classList.toggle('open', !!o);
      tg.setAttribute('aria-expanded', o ? 'true' : 'false');
      try { document.dispatchEvent(new CustomEvent('wm-maps-menu', { detail: { open: !!o } })); } catch (e) {}
      label();
    }
    tg.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setOpen(!bar.classList.contains('open'));
    });
    document.addEventListener('click', function (ev) {
      if (!wrap.contains(ev.target)) setOpen(false);
    }, true);
    bar.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.map-dim-btn') : null;
      if (b && b.id !== 'wm-maps-toggle') setTimeout(function () { setOpen(false); }, 150);
    });
    // aktiver-modus-wechsel auch von außen (app setzt .active selbst)
    new MutationObserver(label).observe(bar, { attributes: true, subtree: true, attributeFilter: ['class'] });

    // r39 (31.10., operator): feste inhalts-sortierung der kartenliste —
    // 2D/3D zuerst, dann wetter/windy/pilze, ocx/mafia, dann die
    // protest/polizei-gruppe und der technische rest. Unbekannte buttons
    // wandern ans ende.
    var ORDER = ['2D', '3D', 'GODSEYE', 'WETTER', 'WINDY', 'PILZE', 'OCX', 'MAFIA',
      'CORTEGE', 'PROTEST', 'ICE', 'BRD', 'UNREST', 'RADAR', 'SDR'];
    var sortT = null;
    function sortBar() {
      var btns = {}, rest = [];
      Array.prototype.slice.call(bar.children).forEach(function (b) {
        var k = (b.textContent || '').trim().toUpperCase();
        if (ORDER.indexOf(k) >= 0 && !btns[k]) btns[k] = b;
        else rest.push(b);
      });
      var moved = false;
      ORDER.forEach(function (k) { if (btns[k]) { bar.appendChild(btns[k]); moved = true; } });
      rest.forEach(function (b) { bar.appendChild(b); moved = true; });
      if (moved) label();
    }
    var sortMo = new MutationObserver(function () {
      if (sortT) return;
      sortT = setTimeout(function () { sortT = null; sortBar(); }, 250);
    });
    sortMo.observe(bar, { childList: true });
    sortBar();

    label();
    return true;
  }

  var mo = new MutationObserver(function () { if (build()) mo.disconnect(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') build(); else document.addEventListener('DOMContentLoaded', build);

  window.wmMapsMenuIsOpen = function () {
    var b = document.getElementById('mapDimensionToggle');
    return !!b && b.classList.contains('open');
  };
  window.wmMapsMenuOpen = function () {
    var b = document.getElementById('wm-maps-toggle');
    if (b && !window.wmMapsMenuIsOpen()) b.click();
    return window.wmMapsMenuIsOpen();
  };
})();
