/* wm-renderguard v5: SVG-Notfall diagnostizierbar, ohne GPU-Probe-Schleife.
   Unterscheidet: (a) wm-force-svg-Flag gesetzt => Ein-Klick-Fix (Flag entfernen + reload),
   (b) WebGL wirklich tot => Browser-Neustart-Empfehlung. Unten links, kollisionsfrei. */
(function () {
  if (window.__wmRenderGuard) return;
  window.__wmRenderGuard = true;
  document.documentElement.setAttribute('data-wm-renderguard-version', '20261019-renderdiag-1');

  var CSS = '#wm-renderguard{position:fixed;bottom:40px;left:12px;transform:none;z-index:99985;display:none;flex-direction:column;gap:6px;background:#3a2b10;border:1px solid #d9a425;color:#ffd866;font:12px/1.35 system-ui,sans-serif;padding:8px 12px;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.5);max-width:min(46vw,560px)}#wm-renderguard.wm-rg-on{display:flex}#wm-renderguard .wm-rg-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#wm-renderguard button{background:#d9a425;border:0;color:#22190a;font-weight:700;padding:4px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}#wm-renderguard .wm-rg-x{background:transparent;color:#ffd866;font-weight:400;font-size:14px;padding:0 4px}#wm-renderguard .wm-rg-info{font-size:11px;color:#cbb06a;display:none}';
  var st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  var banner = document.createElement('div');
  banner.id = 'wm-renderguard';
  banner.innerHTML = '<div class="wm-rg-row">'
    + '<span id="wm-rg-msg">⚠️ <b>Notfall-Karte (SVG)</b></span>'
    + '<button id="wm-rg-fix" type="button" style="display:none">3D/2D wieder aktivieren</button>'
    + '<button id="wm-rg-reload" type="button">Neu laden</button>'
    + '<button id="wm-rg-diag" type="button">Diagnose</button>'
    + '<button class="wm-rg-x" type="button" aria-label="Schließen">×</button>'
    + '</div><div class="wm-rg-info"></div>';
  document.body.appendChild(banner);

  function rendererKind() {
    var c = document.querySelector('.map-container');
    if (!c) return 'none';
    if (c.classList.contains('globe-mode')) return 'globe';
    if (c.classList.contains('deckgl-mode')) return 'deckgl';
    if (c.classList.contains('svg-mode')) return 'svg';
    return 'pending';
  }
  var probeInitialized = false;
  var probeContext = null;
  var probeCanvas = null;
  function webglSupport() {
    try {
      if (!probeInitialized) {
        probeInitialized = true;
        probeCanvas = document.createElement('canvas');
        probeContext = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      }
      return !!probeContext && !probeContext.isContextLost();
    } catch (e) { return false; }
  }
  function flagSet() {
    try { return localStorage.getItem('wm-force-svg') === '1'; } catch (e) { return false; }
  }
  function update() {
    var on = rendererKind() === 'svg';
    banner.classList.toggle('wm-rg-on', on);
    if (!on) return;
    var msg = banner.querySelector('#wm-rg-msg');
    var fix = banner.querySelector('#wm-rg-fix');
    var info = banner.querySelector('.wm-rg-info');
    var forced = flagSet();
    // An explicit emergency-mode choice already explains SVG. Hidden
    // diagnostics must not allocate fresh GPU contexts every two seconds.
    var support = forced && !probeInitialized ? null : webglSupport();
    if (forced) {
      msg.innerHTML = '⚠️ <b>Notfall-Karte (SVG)</b> — der Notausgang <code>wm-force-svg</code> ist aktiv. Ein Klick entfernt ihn.';
      fix.style.display = '';
    } else if (support) {
      msg.innerHTML = '⚠️ <b>Notfall-Karte (SVG)</b> — Renderer-Wechsel fehlgeschlagen (WebGL da). Seite neu laden;';
      fix.style.display = 'none';
    } else {
      msg.innerHTML = '⚠️ <b>Notfall-Karte (SVG)</b> — ohne WebGL. Browser <b>komplett neu starten</b> (alle Fenster zu) bringt 3D &amp; 2D zurück.';
      fix.style.display = 'none';
    }
    info.textContent = 'renderer=svg · wm-force-svg=' + (forced ? '1 (Notausgang AN)' : '0') + ' · webgl=' + (support === null ? 'nicht geprüft (Notausgang)' : support ? 'verfügbar' : 'NICHT verfügbar') + ' · Modus-Umschalter: 2D/3D-Buttons oben';
  }
  banner.querySelector('#wm-rg-fix').addEventListener('click', function () {
    try { localStorage.removeItem('wm-force-svg'); } catch (e) {}
    location.reload();
  });
  banner.querySelector('#wm-rg-reload').addEventListener('click', function () { location.reload(); });
  banner.querySelector('#wm-rg-diag').addEventListener('click', function () {
    var i = banner.querySelector('.wm-rg-info');
    i.style.display = i.style.display === 'block' ? 'none' : 'block';
    if (i.style.display === 'block') {
      // A failed initial probe may be retried on an explicit user diagnosis.
      // Successful probes are reused; context loss is checked on that context.
      if (!probeContext) probeInitialized = false;
      webglSupport();
      update();
    }
  });
  banner.querySelector('.wm-rg-x').addEventListener('click', function () { banner.remove(); });

  var mo = new MutationObserver(function () { update(); });
  function observe() {
    var c = document.querySelector('.map-container');
    if (c && !c.__wmRGObs) { c.__wmRGObs = true; mo.observe(c, { attributes: true, attributeFilter: ['class'] }); }
  }
  observe();
  setInterval(function () {
    if (!document.getElementById('wm-renderguard')) return;
    observe();
    update();
  }, 2000);
  update();

  document.addEventListener('webglcontextlost', function (e) {
    try {
      fetch('/worldmapp/wm-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: Date.now(), scope: 'renderguard', stage: 'webglcontextlost', detail: (e.target && e.target.className || '').toString().slice(0,80), ua: navigator.userAgent })
      }).catch(function () {});
    } catch (err) {}
  }, true);
})();
