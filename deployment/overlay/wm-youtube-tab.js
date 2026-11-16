/* wm-youtube-tab v1 (2026-10-29): YOUTUBE-Tab nach dem ddg-tab-Muster.
   - Button in der Dashboard-Tab-Leiste, Overlay mit Kanal-Karteikarten
   - Voreingestellte Kanaele (29.10., operator): Embeds via youtube-nocookie
     videoseries (Uploads-Playlist UU...), funktionieren ohne Login.
   - Pro Karte ein 'Öffnen/Anmelden'-Link (youtube.com/@handle, echtes Tab).
   - Nutzer-Kanaele: Eingabefeld, persistiert localStorage 'wm-youtube-channels'.
     Handle wird same-origin via /worldmapp/ddg/go/-Proxy zu channelId (UC...)
     resolved -> Uploads-Playlist (UU...); Fehlschlag = Link-Karte ohne Embed. */
(function () {
  if (window.__wmYoutubeTabV1) return;
  /* R-AFD (29.10., operator): AFD-Verbotsverfahren-Tab dynamisch nachladen
     (Include-Route unzuverlaessig — dieser Injector laeuft bewiesen). */
  try {
    var afdS = document.createElement('script');
    afdS.src = '/worldmapp/wm-afd-tab.js?v=20261029-1';
    afdS.defer = true;
    document.head.appendChild(afdS);
  } catch (e) {}
  /* R-ROSSTAT (10.11., operator): Rosstat-Leaks-Tab dynamisch nachladen
     (gleiche Route wie AfD - dieser Injector laeuft bewiesen). */
  try {
    var rosS = document.createElement('script');
    rosS.src = '/worldmapp/wm-rosstat-tab.js?v=20261110-1';
    rosS.defer = true;
    document.head.appendChild(rosS);
  } catch (e) {}
  window.__wmYoutubeTabV1 = true;

  var OPEN_KEY = 'wm-youtube-open';
  var STORE_KEY = 'wm-youtube-channels';
  var VER = '20261031-1';
  var NOCOOKIE = 'https://www.youtube-nocookie.com/embed/videoseries?list=';
  // Alle Handles am 29.10. per HTTP-Check (200 + channelId + RSS) verifiziert.
  // pl = UU-Uploads-Playlist (aus der channelId abgeleitet, Playlist-Seite 200).
  var PRESETS = [
    // r39 (31.10., operator): die 16 medien-kanaele AN DEN ANFANG (handles am
    // 31.10. per youtube-http-check verifiziert, pl = UU-uploads-playlist).
    { n: 'Tagesschau',              h: 'tagesschau',            pl: 'UU5NOEUbkLheQcaaRldYW5GA' },
    { n: 'CNN',                     h: 'CNN',                   pl: 'UUupvZG-5ko_eiXAupbDfxWw' },
    { n: 'Rai News',                h: 'RaiNews',               pl: 'UUxqR9g_1XlnfrqwHK9viwCw' },
    { n: 'Corriere della Sera',     h: 'CorrieredellaSera',     pl: 'UU2lCxEqj8bfRfYbK1FNNNkQ' },
    { n: 'BBC News',                h: 'BBCNews',               pl: 'UU16niRr50-MSBwiO3YDb3RA' },
    { n: 'franceinfo',              h: 'franceinfo',            pl: 'UUO6K_kkdP-lnSCiO3tPx7WA' },
    { n: 'PHOENIX',                 h: 'phoenix',               pl: 'UUwyiPnNlT8UABRmGmU0T9jg' },,
    { n: 'Reuters',                 h: 'Reuters',               pl: 'UUhqUTb7kYRX8-EiaN3XFrSQ' },
    { n: 'Euronews Deutsch',        h: 'euronewsde',            pl: 'UUACdxU3VrJIJc7ujxtHWs1w' },
    { n: 'Frankfurter Rundschau',   h: 'frankfurterrundschau',  pl: 'UUN8Qhz8gB9SnWXJEYRrHctw' },
    { n: 'error-wtf',               h: 'error-wtf',             pl: 'UU0LJfqpzEAJQV_BXTTHO5wA' },
    { n: 'Radio Rüsselsheim',      h: 'radioruesselsheim',     pl: 'UUOSgcXpWwcuQ878WV6WgEUw' },
    { n: 'Deutschlandfunk',         h: 'deutschlandfunk',       pl: 'UUkCab7liRnZSZsN8YqzhuuA' },
    { n: 'NDR Info',                h: 'NDRInfo',               pl: 'UUAKB9wGGRccBDrvbbbmgetw' },
    { n: 'hr-info and friends',     h: 'hr-info-and-friends',   pl: 'UUbf-jbz7R-j5BciMuPEq2fw' },
    { n: 'Haaretz.com',            h: 'haaretzcom',            pl: 'UUJboXXfoy9Ik4MKU9cpA-Uw' },
    { n: 'Haaretz (Hebrew)',       h: 'haaretzcoil',           pl: 'UUOzH-2D7ToBOhcKeYLB339g' },
    { n: 'TYT Investigates',       h: 'TYTInvestigatesReports', pl: 'UUwNJt9PYyN1uyw2XhNIQMMA' },
    { n: 'CyberNews',              h: 'cybernews',             pl: 'UUCsREoj8rSRkEvxWqxr74rQ' },
    { n: 'Local Team (IT)',        h: 'localteam',             pl: 'UUb06zgE7f5ItdRI5WEXT1AQ' },
    { n: 'NEX24',                  h: 'nex24tv',               pl: 'UU4d0kr0krzovZYTqZW17BXQ' },
    { n: 'heise online News',      h: 'heiseonlineNews',       pl: 'UUo2aQmvWjo91O8usRBHFZJw' },
    { n: 'heise security (secIT)', h: 'secITbyheise',          pl: 'UUvK7g6WHuH8A7MsjKldX1XA' },
    { n: 'FRANCE 24',              h: 'FRANCE24',              pl: 'UUCCPCZNChQdGa9EkATeye4g' },
    { n: 'FRANCE 24 English',      h: 'France24_en',           pl: 'UUQfwfsi5VrQ8yKZ-UWmAEFg' },
    { n: 'FRANCE 24 Arabic',       h: 'France24_ar',           pl: 'UUdTyuXgmJkG_O8_75eqej-w' },
    { n: 'FRANCE 24 Español',      h: 'France24_es',           pl: 'UUUdOoVWuWmgo1wByzcsyKDQ' },
    { n: 'WORLD RIOTS TV',         h: 'worldriotstv',          pl: 'UUPf-zAYwTQdN2TeBZVg8lNA' },
    { n: 'Jüdische Stimme',        h: 'JuedischeStimme',       pl: 'UUPEdicy13DVoGEACv0jMzcA' },
    { n: 'Democracy Now!',         h: 'democracynow',          pl: 'UUzuqE7-t13O4NIDYJfakrhw' },
    { n: 'The Young Turks',        h: 'TheYoungTurks',         pl: 'UU1yBKRuGpC1tSM73A0ZjYjQ' },
    { n: 'Double Down News',       h: 'DoubleDownNews',        pl: 'UUeRYN0tYBQVrC2cKsxJjdow' },
    { n: 'Y-Kollektiv',            h: 'ykollektiv',            pl: 'UULoWcRy-ZjA-Erh0p_VDLjQ' },
    { n: 'ZDFinfo Dokus',          h: 'ZDFDoku',               pl: 'UU7FeuS5wwfSR9IwOPkBV7SQ' },
    { n: 'ARTE Deutsch',           h: 'artede',                pl: 'UULLibJTCy3sXjHLVaDimnpQ' },
    { n: 'ARTE (FR)',              h: 'arte',                  pl: 'UUwI-JbGNsojunnHbFAc0M4Q' },
    { n: 'STRG_F',                 h: 'STRG_F',                pl: 'UUfa7jJFYnn3P5LdJXsFkrjw' },
    { n: 'DW News (English)',      h: 'dwnews',                pl: 'UUknLrEdhRCp1aegoMqRaCZg' },
    { n: 'DW Deutsch',             h: 'dwdeutsch',             pl: 'UUMIgOXM2JEQ2Pv2d0_PVfcg' }
  ];

  function loadCustom() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(function (c) { return c && c.h; }) : [];
    } catch (e) { return []; }
  }
  function saveCustom(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function ensureButton() {
    var bar = document.querySelector('.dashboard-tablist');
    if (!bar) return;
    if (document.getElementById('wm-youtube-tab-btn')) return;
    var b = document.createElement('button');
    b.id = 'wm-youtube-tab-btn';
    b.type = 'button';
    b.textContent = '\u25B6 YOUTUBE';
    b.title = 'YouTube-Kanaele (Embeds ohne Login, Kanaele hinzufuegbar)';
    b.style.cssText = 'margin-left:6px;padding:4px 10px;border-radius:8px;border:1px solid #2c4557;' +
      'background:#10161d;color:#ff6b6b;font:700 11px monospace;cursor:pointer;';
    b.addEventListener('click', function () { toggle(); });
    var ddg = document.getElementById('wm-ddg-tab-btn');
    if (ddg && ddg.parentElement === bar) bar.insertBefore(b, ddg.nextSibling);
    else bar.appendChild(b);
  }

  function ytUrl(handle) {
    return 'https://www.youtube.com/@' + handle;
  }

  function resolveViaProxy(handle, cb) {
    // same-origin Proxy aus dem ddg-Mini-Browser: holt die @handle-Seite
    fetch('/worldmapp/ddg/go/https/www.youtube.com/@' + encodeURIComponent(handle), { redirect: 'follow' })
      .then(function (r) { return r.ok ? r.text() : Promise.reject(0); })
      .then(function (html) {
        var m = html.match(/"externalId":"(UC[\w-]{20,26})"/) || html.match(/channel\/(UC[\w-]{20,26})/);
        if (!m) return cb(null);
        cb('UU' + m[1].slice(2));
      })
      .catch(function () { cb(null); });
  }

  function buildCard(doc, ch, custom) {
    var card = doc.createElement('div');
    card.className = 'wm-yt-card' + (custom ? ' wm-yt-custom' : '');
    card.style.cssText = 'border:1px solid #22303d;border-radius:10px;background:#10161d;overflow:hidden;display:flex;flex-direction:column;min-height:210px;';

    var head = doc.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 9px;background:#0c1319;border-bottom:1px solid #1c2a36;';
    var name = doc.createElement('span');
    name.className = 'wm-yt-name';
    name.textContent = ch.n;
    name.style.cssText = 'flex:1 1 auto;color:#e8f4ff;font:700 12px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    head.appendChild(name);

    if (custom) {
      var del = doc.createElement('button');
      del.type = 'button';
      del.className = 'wm-yt-del';
      del.textContent = '\u00D7';
      del.title = 'Kanal entfernen';
      del.style.cssText = 'background:#1b2833;border:1px solid #2c4557;color:#ffb3b3;border-radius:6px;width:22px;height:20px;cursor:pointer;font:700 12px monospace;line-height:1;';
      del.addEventListener('click', function () {
        saveCustom(loadCustom().filter(function (c) { return c.h !== ch.h; }));
        card.remove();
        var grid = doc.querySelector('#wm-youtube-grid');
        if (grid && !grid.children.length) grid.appendChild(emptyHint(doc));
      });
      head.appendChild(del);
    }
    card.appendChild(head);

    var frameBox = doc.createElement('div');
    frameBox.className = 'wm-yt-frame';
    frameBox.style.cssText = 'position:relative;flex:1 1 auto;min-height:150px;background:#05080c;';
    if (ch.pl) {
      frameBox.dataset.pl = ch.pl;
    } else {
      var note = doc.createElement('div');
      note.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;color:#8aa4ba;font:11px system-ui;text-align:center;';
      note.textContent = 'Embed nicht aufl\u00f6sbar \u2014 Kanal via \u2197 \u00f6ffnen.';
      frameBox.appendChild(note);
    }
    card.appendChild(frameBox);

    var foot = doc.createElement('div');
    foot.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 9px;border-top:1px solid #1c2a36;';
    var open = doc.createElement('a');
    open.className = 'wm-yt-open';
    open.href = ytUrl(ch.h);
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = '\u2197 \u00D6ffnen/Anmelden';
    open.title = 'Kanal auf youtube.com \u00f6ffnen (Login/Abonnieren)';
    open.style.cssText = 'color:#9fd6ff;font:600 11px system-ui;text-decoration:none;';
    foot.appendChild(open);
    var hnd = doc.createElement('span');
    hnd.textContent = '@' + ch.h;
    hnd.style.cssText = 'color:#5b7285;font:10px monospace;';
    foot.appendChild(hnd);
    card.appendChild(foot);
    return card;
  }

  function emptyHint(doc) {
    var d = doc.createElement('div');
    d.style.cssText = 'grid-column:1/-1;color:#8aa4ba;font:12px system-ui;padding:18px;text-align:center;';
    d.textContent = 'Keine eigenen Kanaele gespeichert. Füge welche hinzu \u2191';
    return d;
  }

  function hydrateEmbeds(root) {
    var boxes = root.querySelectorAll('.wm-yt-frame[data-pl]');
    if (!('IntersectionObserver' in window)) {
      boxes.forEach(injectFrame);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        injectFrame(en.target);
        io.unobserve(en.target);
      });
    }, { root: root.querySelector('#wm-youtube-scroll'), rootMargin: '220px' });
    boxes.forEach(function (b) {
      if (!b.querySelector('iframe')) io.observe(b);
    });
  }

  function injectFrame(box) {
    if (box.querySelector('iframe')) return;
    var f = document.createElement('iframe');
    f.src = NOCOOKIE + box.dataset.pl + '&autoplay=0&rel=0';
    f.loading = 'lazy';
    f.setAttribute('allow', 'encrypted-media; picture-in-picture; web-share');
    f.setAttribute('allowfullscreen', '');
    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
    box.appendChild(f);
  }

  function openOverlay() {
    var old = document.getElementById('wm-youtube-overlay');
    if (old) old.remove();
    // Geschwister-Overlay schliessen (Exklusivitaet wie radar/ocx/mafia)
    var ddg = document.getElementById('wm-ddg-overlay');
    if (ddg) ddg.remove();

    var ov = document.createElement('div');
    ov.id = 'wm-youtube-overlay';
    ov.style.cssText = 'position:fixed;inset:40px 0 32px 0;z-index:99990;display:flex;flex-direction:column;' +
      'background:#0b1117;border-top:1px solid #22303d;box-shadow:0 -8px 30px rgba(0,0,0,.5);';

    var bar = document.createElement('div');
    bar.style.cssText = 'flex:0 0 42px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#10161d;border-bottom:1px solid #22303d;';
    var title = document.createElement('span');
    title.textContent = '\u25B6 YOUTUBE-KAN\u00C4LE';
    title.style.cssText = 'color:#ff6b6b;font:700 13px monospace;white-space:nowrap;';
    bar.appendChild(title);

    var inp = document.createElement('input');
    inp.id = 'wm-yt-add-input';
    inp.type = 'text';
    inp.placeholder = 'Kanal-Handle hinzufuegen (z.B. @dwdeutsch) \u2014 Enter';
    inp.style.cssText = 'flex:0 1 320px;min-width:160px;background:#0b1117;border:1px solid #2c4557;color:#e8f4ff;' +
      'border-radius:6px;height:26px;padding:0 10px;font:12px monospace;outline:none;';
    var addBtn = document.createElement('button');
    addBtn.id = 'wm-yt-add-btn';
    addBtn.type = 'button';
    addBtn.textContent = '+ Hinzuf\u00fcgen';
    addBtn.style.cssText = 'background:#1b2833;border:1px solid #2c4557;color:#9fd6ff;border-radius:6px;height:26px;padding:0 10px;cursor:pointer;font:11px monospace;white-space:nowrap;';

    function addChannel() {
      var v = (inp.value || '').trim().replace(/^https?:\/\/(www\.)?youtube\.com\//i, '');
      var m = v.match(/@([\w.\-]+)/);
      var h = m ? m[1] : v.replace(/[^A-Za-z0-9._\-]/g, '');
      if (!h) return;
      if (PRESETS.some(function (p) { return p.h.toLowerCase() === h.toLowerCase(); }) ||
          loadCustom().some(function (c) { return c.h.toLowerCase() === h.toLowerCase(); })) {
        inp.value = '';
        return;
      }
      inp.value = '';
      var pend = buildCard(document, { n: '@' + h, h: h }, true);
      var grid = document.querySelector('#wm-youtube-grid');
      if (grid) {
        var hint = grid.querySelector('div[style*="grid-column"]');
        if (hint && grid.children.length === 1) hint.remove();
        grid.appendChild(pend);
      }
      hydrateEmbeds(ov);
      resolveViaProxy(h, function (pl) {
        if (!pend.isConnected) return; // Karte inzwischen geloescht -> nicht wiederbeleben
        if (pl) {
          var box = pend.querySelector('.wm-yt-frame');
          box.innerHTML = '';
          box.dataset.pl = pl;
          hydrateEmbeds(ov);
        }
        var list = loadCustom();
        if (!list.some(function (c) { return c.h.toLowerCase() === h.toLowerCase(); })) {
          list.push({ n: '@' + h, h: h, pl: pl || undefined });
          saveCustom(list);
        } else if (pl) {
          list.forEach(function (c) { if (c.h.toLowerCase() === h.toLowerCase()) c.pl = pl; });
          saveCustom(list);
        }
      });
    }
    addBtn.addEventListener('click', addChannel);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addChannel(); }
    });

    var back2map = document.createElement('button');
    back2map.type = 'button';
    back2map.textContent = '\u2715 Zur Worldmap';
    back2map.title = 'YouTube-Ansicht schliessen (Esc)';
    back2map.style.cssText = 'margin-left:auto;background:#7a1f1f;border:1px solid #b04040;color:#ffd9d9;border-radius:6px;height:26px;padding:0 10px;cursor:pointer;font:700 11px monospace;';
    back2map.addEventListener('click', function () { closeOverlay(ov); });

    bar.append(inp, addBtn, back2map);
    ov.appendChild(bar);

    var scroll = document.createElement('div');
    scroll.id = 'wm-youtube-scroll';
    scroll.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:14px;';
    var grid = document.createElement('div');
    grid.id = 'wm-youtube-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;';

    var all = [];
    PRESETS.forEach(function (p) { all.push(buildCard(document, p, false)); });
    var customs = loadCustom();
    if (!customs.length) grid.appendChild(emptyHint(document));
    customs.forEach(function (c) { all.push(buildCard(document, c, true)); });
    all.forEach(function (c) { grid.appendChild(c); });
    scroll.appendChild(grid);
    ov.appendChild(scroll);

    var footNote = document.createElement('div');
    footNote.style.cssText = 'flex:0 0 auto;padding:6px 14px;color:#5b7285;font:10px monospace;border-top:1px solid #1c2a36;';
    footNote.textContent = 'Embeds laufen auf youtube-nocookie (kein Login, keine Cookies). Handles v' + VER + ' via HTTP verifiziert (29.10.). Login/Abonnieren: \u2197-Link pro Kanal.';
    ov.appendChild(footNote);

    document.body.appendChild(ov);
    hydrateEmbeds(ov);
    try { sessionStorage.setItem(OPEN_KEY, '1'); } catch (e) {}
    var btn = document.getElementById('wm-youtube-tab-btn');
    if (btn) btn.style.outline = '2px solid #ff6b6b';
  }

  function closeOverlay(ov) {
    if (ov && ov.isConnected) ov.remove();
    var btn = document.getElementById('wm-youtube-tab-btn');
    if (btn) btn.style.outline = 'none';
    try { sessionStorage.removeItem(OPEN_KEY); } catch (e) {}
  }

  function toggle() {
    var ov = document.getElementById('wm-youtube-overlay');
    if (ov) closeOverlay(ov); else openOverlay();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var ov = document.getElementById('wm-youtube-overlay');
    if (ov) { closeOverlay(ov); e.stopPropagation(); }
  }, true);

  setInterval(ensureButton, 2000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { ensureButton(); });
  } else {
    ensureButton();
  }
  try { if (sessionStorage.getItem(OPEN_KEY) === '1') openOverlay(); } catch (e) {}
})();
