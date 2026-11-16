/* wm-websdr-audio-fix.js v2 — Autoplay-Brücke + AUTO-Bootstrap (01.11., operator:
 * 'viele websdr haben keinen wasserfall oder audio').
 * v1: '🔊 Ton starten'-Button neben jedem WebSDR-iframe (Geste-Reload).
 * v2 NEU: automatischer Bootstrap je Receiver-iframe (same-origin via Proxy):
 *   soundapplet.audioresume() + 'audiostartbutton'/'#startaudio'-Klick +
 *   AudioContext-Resume-Batterie + audio/video .play() + Pointer-Gesten aufs
 *   erste Canvas (PhantomSDR/Kiwi). Läuft alle 1,5s bis 24 Ticks, idempotent.
 * Gilt für DIREKTE Receiver-iframes (src*='/sdr/r/'); die Karte (#wm-sdr-embed
 * → /websdr-Seite) bootstrappt ihre rx-frames selbst. */
(function () {
  if (window.__wmWebsdrAudioFix) return;
  window.__wmWebsdrAudioFix = true;

  function style() {
    var s = document.createElement('style');
    s.id = 'wm-websdr-audio-style';
    s.textContent =
      '.wm-websdr-audio-btn{display:inline-flex;align-items:center;gap:4px;margin:4px 0;padding:4px 10px;' +
      'background:rgba(0,229,255,.12);border:1px solid rgba(0,229,255,.45);color:#00e5ff;border-radius:6px;' +
      'font:700 11px/1.2 system-ui;cursor:pointer;letter-spacing:.03em;}' +
      '.wm-websdr-audio-btn:hover{background:rgba(0,229,255,.25);color:#fff;}';
    document.head.appendChild(s);
  }

  function arm(iframe) {
    if (!iframe || iframe.dataset.wmAudioBtn) return;
    var wrap = iframe.parentElement;
    if (!wrap) return;
    iframe.dataset.wmAudioBtn = '1';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wm-websdr-audio-btn';
    btn.textContent = '🔊 Ton starten';
    btn.title = 'WebSDR-Audio mit dieser Geste neu starten (Vivaldi/Chromium blockt Autoplay sonst)';
    btn.addEventListener('click', function () {
      try {
        var src = iframe.src;
        iframe.src = 'about:blank';
        setTimeout(function () { iframe.src = src; }, 60);
      } catch (e) {
        iframe.src = iframe.src;
      }
    });
    wrap.insertBefore(btn, iframe);
  }

  function ctxBatteries(wd, d) {
    var list = [wd.ctx, wd.ac, wd.audioCtx, wd.audio_context, wd.actx, d && d.ct], i;
    for (i = 0; i < list.length; i++) {
      try {
        if (list[i] && list[i].state !== 'running') list[i].resume();
      } catch (err) {}
    }
    try {
      var am = d.querySelectorAll('audio,video'), j;
      for (j = 0; j < am.length; j++) {
        try { if (am[j].paused) am[j].play(); } catch (err) {}
      }
    } catch (err) {}
  }

  function clickStarters(d) {
    var sels = ['#startaudio', '#audiostartbutton', '[id*="audiostart"]', '[id*="playbutton"]',
                '[id*="play-btn"]', '[id*="audio-start"]', '[id*="sound-button"]',
                'button[class*="play"]', '.btn-play', 'input[value="start audio"]',
                'input[value="Start audio"]'], i, el;
    for (i = 0; i < sels.length; i++) {
      try {
        el = d.querySelector(sels[i]);
        if (el && el.offsetParent !== null) { el.click(); break; }
      } catch (err) {}
    }
  }

  function canvasGestures(wd, d) {
    try {
      var cv = d.querySelector('canvas');
      if (!cv) return;
      var r = cv.getBoundingClientRect();
      var cx = r.left + Math.floor(r.width / 2), cy = r.top + Math.floor(r.height / 2);
      var mk = function (t) { return new MouseEvent(t, { bubbles: true, cancelable: true, view: wd, clientX: cx, clientY: cy }); };
      ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (t) {
        try { cv.dispatchEvent(mk(t)); } catch (err) {}
      });
    } catch (err) {}
  }

  function isRunning(wd, d) {
    try { if (d.ct && d.ct.state === 'running') return true; } catch (err) {}
    try {
      var axs = [wd.ctx, wd.ac, wd.audioCtx, wd.audio_context, wd.actx], i;
      for (i = 0; i < axs.length; i++) { if (axs[i] && axs[i].state === 'running') return true; }
    } catch (err) {}
    try {
      var avs = d.querySelectorAll('audio,video'), j;
      for (j = 0; j < avs.length; j++) { if (!avs[j].paused) return true; }
    } catch (err) {}
    try {
      var wfc = d.querySelector('canvas[id^="wf"]');
      if (wfc && wfc.width > 50) {
        var dt = wfc.getContext('2d').getImageData(0, 0, 30, 3).data, i, n = 0;
        for (i = 3; i < dt.length; i += 4) { if (dt[i] > 0) n++; }
        if (n > 10) return true;
      }
    } catch (err) {}
    return false;
  }

  /* AUTO-Bootstrap: nur direkte Receiver-iframes (Proxy-Route). */
  function bootstrap(iframe) {
    if (!iframe || iframe.dataset.wmBoot) return;
    if (!/\/sdr\/r\//.test(iframe.src || '')) return;
    iframe.dataset.wmBoot = '1';
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var wd = null, d = null;
      try { wd = iframe.contentWindow; d = wd && wd.document; } catch (err) {}
      if (!wd || !d) { if (tries >= 24) { clearInterval(iv); } return; }
      try {
        if (wd.soundapplet && typeof wd.soundapplet.audioresume === 'function') wd.soundapplet.audioresume();
      } catch (err) {}
      clickStarters(d);
      ctxBatteries(wd, d);
      canvasGestures(wd, d);
      if (isRunning(wd, d) || tries >= 24) clearInterval(iv);
    }, 1500);
  }

  function scan() {
    [].forEach.call(document.querySelectorAll('iframe[src*="/sdr/r/"]'), function (f) {
      arm(f); bootstrap(f);
    });
    [].forEach.call(document.querySelectorAll('#wm-sdr-embed, iframe[src*="websdr"]'), arm);
  }

  style();
  scan();
  setInterval(scan, 2000);
})();
