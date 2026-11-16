/* wm-ddg-tab v3 (2026-10-18): SUCHEN-Tab als voller Mini-Browser.
   - Adressleiste + Zurueck/Vor/Neu/Extern/Schliessen
   - iframe-Navigation bleibt IM Overlay (Ergebnisse + Zielseiten)
   - uddg-Redirects werden zu direkten URLs, externe Ziele via eigenen Proxy-Pfad
   - Klarer Rueckkehr-Knopf (✕ + Esc) zur Worldmap */
(function () {
  if (window.__wmDdgTabV3) return;
  window.__wmDdgTabV3 = true;

  var OPEN_KEY = 'wm-ddg-open';
  var HOME = '/worldmapp/ddg/html/';

  function ensureButton() {
    var bar = document.querySelector('.dashboard-tablist');
    if (!bar) return;
    if (document.getElementById('wm-ddg-tab-btn')) return;
    var ref = document.getElementById('wm-osm-toggle-btn');
    var b = document.createElement('button');
    b.id = 'wm-ddg-tab-btn';
    b.type = 'button';
    b.textContent = '\u{1F50D} SUCHEN';
    b.title = 'Web-Suche (DuckDuckGo) im Dashboard';
    b.style.cssText = 'margin-left:6px;padding:4px 10px;border-radius:8px;border:1px solid #2c4557;' +
      'background:#10161d;color:#9fd6ff;font:700 11px monospace;cursor:pointer;';
    b.addEventListener('click', function () { toggle(); });
    ref && ref.parentElement ? ref.parentElement.insertBefore(b, ref.nextSibling) : bar.appendChild(b);
  }

  function proxied(url) {
    // Externe http(s)-URL in das pfadbasierte /go/-Format (verschachtelte Queries sicher)
    var m = url.match(/^(https?):\/\//i);
    if (m && url.indexOf(location.origin) !== 0) {
      return '/worldmapp/ddg/go/' + m[1] + '/' + url.replace(/^https?:\/\//i, '');
    }
    return url;
  }

  function navigate(ov, url, push) {
    var frame = ov.querySelector('#wm-ddg-frame');
    var addr = ov.querySelector('#wm-ddg-addr');
    if (!frame) return;
    var target = proxied(url);
    frame.src = target;
    if (addr && !push) addr.value = url;
  }

  function openOverlay() {
    var old = document.getElementById('wm-ddg-overlay');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'wm-ddg-overlay';
    ov.style.cssText = 'position:fixed;inset:40px 0 32px 0;z-index:99990;display:flex;flex-direction:column;' +
      'background:#0b1117;border-top:1px solid #22303d;box-shadow:0 -8px 30px rgba(0,0,0,.5);';

    // --- Toolbar (Browser-Chrome) ---
    var bar = document.createElement('div');
    bar.style.cssText = 'flex:0 0 40px;display:flex;align-items:center;gap:6px;padding:0 10px;background:#10161d;border-bottom:1px solid #22303d;';
    function navBtn(txt, title, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = txt; b.title = title;
      b.style.cssText = 'background:#1b2833;border:1px solid #2c4557;color:#cfe8ff;border-radius:6px;' +
        'width:30px;height:26px;cursor:pointer;font-size:13px;line-height:1;';
      b.addEventListener('click', fn);
      return b;
    }
    var back = navBtn('\u2190', 'Zurück', function () {
      var f = ov.querySelector('#wm-ddg-frame');
      try { f.contentWindow.history.back(); } catch (e) {}
    });
    var fwd = navBtn('\u2192', 'Vor', function () {
      var f = ov.querySelector('#wm-ddg-frame');
      try { f.contentWindow.history.forward(); } catch (e) {}
    });
    var rel = navBtn('\u21BB', 'Neu laden', function () {
      var f = ov.querySelector('#wm-ddg-frame');
      try { f.contentWindow.location.reload(); } catch (e) { var s = f.src; f.src = s; }
    });
    var home = navBtn('\u{1F50D}', 'Neue Suche (Startseite)', function () { navigate(ov, HOME); });

    var addr = document.createElement('input');
    addr.id = 'wm-ddg-addr';
    addr.type = 'text';
    addr.placeholder = 'Suchbegriff oder Adresse (z.B. wetter berlin oder example.com)';
    addr.style.cssText = 'flex:1 1 auto;min-width:120px;background:#0b1117;border:1px solid #2c4557;color:#e8f4ff;' +
      'border-radius:6px;height:26px;padding:0 10px;font:12px monospace;outline:none;';
    addr.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = addr.value.trim();
      if (!v) return;
      if (/^https?:\/\//i.test(v) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) {
        if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
        navigate(ov, v);
      } else {
        navigate(ov, HOME + '?q=' + encodeURIComponent(v));
      }
    });

    var ext = document.createElement('button');
    ext.type = 'button'; ext.textContent = '\u2197 Echter Tab'; ext.title = 'Aktuelle Seite im richtigen Browser-Tab öffnen';
    ext.style.cssText = 'background:#1b2833;border:1px solid #2c4557;color:#9fd6ff;border-radius:6px;height:26px;padding:0 8px;cursor:pointer;font:11px monospace;';
    ext.addEventListener('click', function () {
      var f = ov.querySelector('#wm-ddg-frame');
      var u = '';
      try { u = f.contentWindow.location.href; } catch (e) { u = f.src; }
      // Proxy-URL zur echten URL zurueckwandeln (/?url= UND /go/-Format)
      var m = u.match(/[?&]url=([^&]+)/);
      if (m) { u = decodeURIComponent(m[1]); }
      else {
        var g = u.match(/\/worldmapp\/ddg\/go\/(https?)\/(.+)$/);
        if (g) u = g[1] + '://' + g[2];
      }
      if (u.indexOf('/worldmapp/ddg/html/') !== -1) {
        var q = u.match(/[?&]q=([^&]+)/);
        u = q ? 'https://duckduckgo.com/?q=' + decodeURIComponent(q[1]) : 'https://duckduckgo.com/';
      }
      window.open(u, '_blank', 'noopener');
    });

    var back2map = document.createElement('button');
    back2map.type = 'button'; back2map.textContent = '\u2715 Zur Worldmap';
    back2map.title = 'Suche schließen — zurück zum Dashboard (Esc)';
    back2map.style.cssText = 'background:#7a1f1f;border:1px solid #b04040;color:#ffd9d9;border-radius:6px;height:26px;padding:0 10px;cursor:pointer;font:700 11px monospace;';
    back2map.addEventListener('click', function () { closeOverlay(ov); });

    bar.append(back, fwd, rel, home, addr, ext, back2map);

    var frame = document.createElement('iframe');
    frame.id = 'wm-ddg-frame';
    frame.src = HOME;
    frame.style.cssText = 'flex:1 1 auto;width:100%;border:0;background:#fff;';
    frame.setAttribute('allow', 'clipboard-write');

    ov.append(bar, frame);
    document.body.appendChild(ov);

    // --- Redirect-Loop-Detektion (Browser-Ebene): >4 loads in kurzen Abstaenden ---
    var hopTimes = [];
    frame.addEventListener('load', function () {
      var now = Date.now();
      hopTimes.push(now);
      while (hopTimes.length > 0 && now - hopTimes[0] > 3000) hopTimes.shift();
      if (hopTimes.length >= 5) {
        showBlockedHelp(frame);
        hopTimes = [];
      }
    });

    function showBlockedHelp(f) {
      try {
        f.src = 'about:blank';
        setTimeout(function () {
          try {
            var d = f.contentDocument;
            if (!d) return;
            d.open();
            d.write('<body style="font:14px system-ui;background:#0b1117;color:#cfe8ff;display:flex;align-items:center;justify-content:center;height:100%;margin:0"><div style="max-width:560px;text-align:center;padding:20px"><h2 style="color:#ffd166">Diese Seite blockiert das eingebettete Laden</h2><p>Google-Dienste (News, YouTube-Web) und einige andere Sites laufen in einer Consent-/Weiterleitungs-Schleife, die im eingebetteten Modus nicht durchlaufen kann.</p><p>Nutze <b>&#8599; Echter Tab</b> oben rechts &mdash; dort oeffnet die Seite im richtigen Browser-Tab und funktioniert normal.</p><p style="color:#8aa4ba;font-size:12px">Du kannst jederzeit mit &#x2715; Zur Worldmap zurueck.</p></div></body>');
            d.close();
          } catch (e) {}
        }, 200);
      } catch (e) {}
    }

    // --- Klick-Abfangen im iframe: alles laeuft im Overlay ---
    frame.addEventListener('load', function () {
      var addr2 = ov.querySelector('#wm-ddg-addr');
      try {
        var d = frame.contentDocument;
        if (!d) return;
        var loc = frame.contentWindow.location.href;
        var shown = loc;
        var m = loc.match(/[?&]url=([^&]+)/);
        if (m) { shown = decodeURIComponent(m[1]); }
        else {
          var g = loc.match(/\/worldmapp\/ddg\/go\/(https?)\/(.+)$/);
          if (g) shown = g[1] + '://' + decodeURIComponent(g[2]);
        }
        if (loc.indexOf('/worldmapp/ddg/html/') !== -1) shown = 'DuckDuckGo-Suche';
        if (addr2) addr2.value = shown === 'DuckDuckGo-Suche' ? '' : shown;
        // uddg-Redirector-Links entschluesseln + im Overlay halten:
        d.addEventListener('click', function (e) {
          var a = e.target && e.target.closest ? e.target.closest('a') : null;
          if (!a || !a.href) return;
          var mm = a.href.match(/uddg=([^&]+)/);
          if (mm) {
            var real = decodeURIComponent(mm[1]);
            if (!/^https?:\/\//.test(real)) { try { real = decodeURIComponent(real); } catch (err) {} }
            e.preventDefault();
            navigate(ov, real);
            return;
          }
          // normale externe Links (relativ zum Proxy): im Overlay oeffnen
          if (a.origin === location.origin && a.pathname.indexOf('/worldmapp/ddg/') === 0) return; // interne proxy-nav ok
          if (/^https?:/.test(a.protocol)) {
            e.preventDefault();
            navigate(ov, a.href);
          }
        }, true);
      } catch (e) { /* cross-origin nach externem Sprung: Adressleiste aus frame.src */ }
    });

    try { sessionStorage.setItem(OPEN_KEY, '1'); } catch (e) {}
    var btn = document.getElementById('wm-ddg-tab-btn');
    if (btn) btn.classList.add('wm-active');
  }

  function closeOverlay(ov) {
    if (ov && ov.isConnected) ov.remove();
    var btn = document.getElementById('wm-ddg-tab-btn');
    if (btn) btn.classList.remove('wm-active');
    try { sessionStorage.removeItem(OPEN_KEY); } catch (e) {}
  }

  function toggle() {
    var ov = document.getElementById('wm-ddg-overlay');
    if (ov) closeOverlay(ov); else openOverlay();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var ov = document.getElementById('wm-ddg-overlay');
    if (ov) closeOverlay(ov);
  }, true);

  setInterval(ensureButton, 2000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureButton(); });
  } else {
    ensureButton();
  }
  try { if (sessionStorage.getItem(OPEN_KEY) === '1') openOverlay(); } catch (e) {}
})();
