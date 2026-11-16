/* wm-brief-mapbar.js v20261030-7 — Karten-Modus-Leiste über dem Country-Brief-Panel halten
 * und NACH dem Schließen wiederherstellen.
 *
 * v1 (27.10.26): Lift (position:relative + z 10006), damit die Leiste im schmalen
 *   Fenster über dem fullscreen Brief-Panel bleibt statt unter ihm zu verschwinden.
 * v2: Im Brief-offen-Zustand liegt die Leiste als HUD unten mittig (fixed) — an
 *   ihrer Kartenposition verdeckte sie die originalen Panel-Links.
 * v3/v4 (27.10.26, operator): Nach dem X-Schließen des Lageberichts fiel der View in den
 *   kollabierten/kopflosen Karten-Zustand zurück und die App-Leiste war weg
 *   ("warum verschwindet der map umschalt knopf"). Der Wächter stellt die Leiste
 *   deshalb als HUD wieder her, sobald nach einem Brief-Zyklus eine sichtbare
 *   Kartenfläche ohne App-Leiste existiert. Klicks werden an die echten
 *   App-Buttons (#mapDimensionToggle .map-dim-btn) weitergeleitet, solange sie im
 *   DOM existieren (echter applyVisibleMapDimension-Pfad mit Live-Renderer-Wechsel);
 *   nur wenn sie komplett fehlen, wird der persistierte Modus gesetzt und die
 *   Seite neu geladen (Boot liest worldmonitor-map-mode ein).
 * Nur nach einem Brief-Zyklus aktiv — der normale Boot bleibt unangetastet. */
(function () {
  if (window.__wmBriefMapbar) return;
  window.__wmBriefMapbar = true;
  var HUD_ID = 'wmMapbarHud';
  var wasBriefOpenOnce = false;
  var lastKnownMode = null;

  var style = document.createElement('style');
  style.id = 'wm-brief-mapbar-style';
  style.textContent =
    'body.wm-brief-open .map-dimension-toggle,' +
    'body:has(.country-deep-dive.active) .map-dimension-toggle' +
    '{position:fixed!important;left:50%!important;bottom:14px!important;top:auto!important;transform:translateX(-50%)!important;z-index:10006!important;background:rgba(10,10,12,.86)!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:10px!important;padding:6px 10px!important;box-shadow:0 6px 24px rgba(0,0,0,.5)!important;}' +
    '#' + HUD_ID + '{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:10006;display:flex;gap:2px;background:rgba(10,10,12,.86);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:6px 10px;box-shadow:0 6px 24px rgba(0,0,0,.5);}' +
    '#' + HUD_ID + ' button{background:transparent;border:none;color:#cfcfcf;font-size:11px;font-weight:600;letter-spacing:.5px;padding:3px 10px;border-radius:6px;cursor:pointer;transition:all .2s;}' +
    '#' + HUD_ID + ' button:hover{color:#fff;background:rgba(255,255,255,.12);}' +
    '#' + HUD_ID + ' button.active{background:#22a55a;color:#0b0f0c;}';
  document.head.appendChild(style);

  var sync = function () {
    var panel = document.querySelector('.country-deep-dive');
    var open = !!(panel && panel.classList.contains('active') && panel.getAttribute('aria-hidden') !== 'true');
    if (open) wasBriefOpenOnce = true;
    document.body.classList.toggle('wm-brief-open', open);
  };

  function visibleMapSurface() {
    var c = document.getElementById('mapContainer');
    if (c && c.offsetHeight > 60 && c.offsetWidth > 120) return true;
    var canvas = document.querySelector('.map-container canvas, .maplibregl-canvas');
    if (canvas) {
      var r = canvas.getBoundingClientRect();
      if (r.height > 60 && r.width > 120) return true;
    }
    return false;
  }

  function realButtons() {
    return document.querySelectorAll('#mapDimensionToggle .map-dim-btn');
  }

  function applyPersisted(mode) {
    try {
      localStorage.setItem('worldmonitor-map-mode', JSON.stringify(mode));
    } catch (e) { /* storage-restricted */ }
    location.reload();
  }

  function removeHud() {
    var hud = document.getElementById(HUD_ID);
    if (hud) hud.remove();
  }

  function hudModes() {
    // v7: ALLE Modi — von den echten Buttons ablesen (Labels + dataset.mode);
    // Fallback-Liste, wenn die App die Buttons schon aus dem DOM genommen hat.
    var real = [].map.call(realButtons(), function (b) {
      return { mode: b.dataset.mode || (b.textContent || '').trim().toLowerCase(),
               label: (b.textContent || '').trim() };
    }).filter(function (m) { return m.mode; });
    if (real.length) return real;
    return [['flat', '2D'], ['globe', '3D'], ['ocindex', 'OCX'], ['mafia', 'MAFIA'],
            ['radar', 'RADAR'], ['sdr', 'SDR'], ['spores', 'PILZE'], ['windy', 'WINDY']]
      .map(function (m) { return { mode: m[0], label: m[1] }; });
  }

  function buildHud() {
    var hud = document.getElementById(HUD_ID);
    if (hud) return hud;
    hud = document.createElement('div');
    hud.id = HUD_ID;
    hudModes().forEach(function (m) {
      var mode = m.mode;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mode = mode;
      btn.textContent = m.label;
      btn.title = m.label;
      btn.addEventListener('click', function () {
        var real = realButtons();
        var target = null;
        real.forEach(function (b) { if (b.dataset.mode === mode) target = b; });
        if (!target) {
          applyPersisted(mode);
          return;
        }
        target.click(); // echter App-Pfad: applyVisibleMapDimension mit Live-Renderer-Wechsel
        // Selbst-Verifikation: syncMapDimensionToggle setzt .active sofort (optimistisch);
        // bleibt der Modus nach 2 s unwirksam (listener-lose Buttons, stiller Fehler),
        // greift der persist+reload-Fallback.
        var beforeStored = null;
        try { beforeStored = localStorage.getItem('worldmonitor-map-mode'); } catch (e) { /* ignore */ }
        setTimeout(function () {
          var activeNow = null;
          realButtons().forEach(function (b) { if (b.classList.contains('active')) activeNow = b.dataset.mode; });
          var storedNow = null;
          try { storedNow = localStorage.getItem('worldmonitor-map-mode'); } catch (e) { /* ignore */ }
          var effective = activeNow || storedNow;
          if (effective === mode) return; // Live-Wechsel hat gegriffen
          if (storedNow !== beforeStored && storedNow) return; // Persistenz läuft bereits
          applyPersisted(mode);
        }, 2000);
      });
      hud.appendChild(btn);
    });
    document.body.appendChild(hud);
    return hud;
  }

  function syncHud(hud) {
    var real = realButtons();
    var active = null;
    real.forEach(function (b) { if (b.classList.contains('active')) active = b.dataset.mode; });
    if (!active) active = lastKnownMode;
    if (!active) {
      try {
        var stored = JSON.parse(localStorage.getItem('worldmonitor-map-mode') || '"flat"');
        active = stored === 'globe' ? 'globe' : 'flat';
      } catch (e) { active = 'flat'; }
    }
    hud.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === active);
    });
  }

  function barVisible(bar) {
    if (!bar) return false;
    var r = bar.getBoundingClientRect();
    var s = getComputedStyle(bar);
    return s.display !== 'none' && s.visibility !== 'hidden'
      && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function ensure() {
    var appBar = document.querySelector('.map-dimension-toggle');
    // Sichtbare App-Leiste → HUD unnötig. Im kollabierten Mobile-Header ist die
    // Leiste zwar im DOM, aber display:none — dann übernimmt das HUD und leitet
    // Klicks an die (verdeckten) echten Buttons weiter.
    if (appBar && barVisible(appBar)) {
      var ra = appBar.querySelector('.map-dim-btn.active');
      if (ra && ra.dataset.mode) lastKnownMode = ra.dataset.mode;
      removeHud();
      return;
    }
    if (!wasBriefOpenOnce) return; // Boot-Zustand ohne Brief bleibt unangetastet
    // v7 (operator 30.10.): NICHT mehr auf 'sichtbare Kartenflaeche' bestehen —
    // genau der kollabierte Zustand nach dem Brief-Schliessen ist der Fall, in
    // dem die Leiste komplett weg ist. Das HUD bleibt als Rettung und stellt
    // per echtem Button-Klick (bzw. persist+reload) den Modus wieder her.
    syncHud(buildHud());
  }

  sync();
  ensure();
  new MutationObserver(function () { sync(); ensure(); }).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-hidden'],
  });
  // DOM-Entfernung (Layout-Wechsel, Rerender) abdecken — der attributeObserver
  // feuert nicht, wenn die Leiste selbst removeChild'ed wird.
  setInterval(ensure, 700);
})();