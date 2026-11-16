/* wm-brief-inline-fix.js v7 — Latest-Brief-Panel: Hero-Card + volle Stories
   (Kategorien) + Sprach-Tabs (en/de/it/es/fr/ja/ko/zh/ar) über
   /worldmapp/brief-i18n (v3-Endpoint: Fallback auf neueste verfügbare
   Übersetzung je Sprache statt 404).
   v7 (Übersetzer-Modus):
   - Auto-Sprache: beim ersten Render Browser-Sprache wählen, wenn übersetzt
     verfügbar; sonst EN (Hinweiszeile informiert).
   - EN läuft über denselben Endpoint (kein Magazin-Re-Parse mehr) mit
     Fallback auf das Magazin-HTML.
   - Bei Slot-Drift (Übersetzung älter als EN-Slot) transparente Hinweiszeile.
   - Fallback-Hinweis statt stiller Nichts-Reaktion bei fehlender Sprache. */
(function () {
  'use strict';
  if (window.__wmBriefInlineFix) return;
  window.__wmBriefInlineFix = true;

  const CSS = [
    '.wm-brief-inline{display:grid;gap:8px;margin-top:12px;}',
    '.wm-brief-langtabs{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;}',
    '.wm-brief-langtabs button{cursor:pointer;border:1px solid #263640;background:#101828;color:#9fb3d1;border-radius:5px;font-size:11px;font-weight:700;padding:4px 10px;}',
    '.wm-brief-langtabs button.active{background:#1b2a4a;color:#fff;border-color:#4cc9f0;}',
    '.wm-brief-langtabs button.busy{opacity:.55;pointer-events:none;}',
    '.wm-brief-note{font-size:10.5px;color:var(--text-dim);padding:4px 8px;border:1px dashed #263640;border-radius:5px;background:rgba(255,255,255,.02);}',
    '.wm-brief-thread{border:1px solid var(--border);border-radius:6px;background:rgba(255,255,255,.02);overflow:hidden;}',
    '.wm-brief-thread-head{padding:7px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.03);border-bottom:1px solid var(--border);cursor:pointer;user-select:none;}',
    '.wm-brief-thread-tag{font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;}',
    '.wm-brief-thread-count{font-size:10px;color:var(--text-dim);}',
    '.wm-brief-story{padding:9px 12px;border-top:1px solid var(--border);}',
    '.wm-brief-thread.open .wm-brief-story{display:none;}',
    '.wm-brief-thread .wm-brief-story{display:block;}',
    '.wm-brief-thread.open .wm-brief-thread-head{border-bottom:1px solid var(--border);}',
    '.wm-brief-story-head{font-size:12.5px;line-height:1.4;font-weight:600;}',
    '.wm-brief-story-desc{font-size:11px;line-height:1.45;color:var(--text-dim);margin-top:3px;}',
    '.wm-brief-story-why{font-size:11px;line-height:1.45;color:var(--text-dim);margin-top:3px;}',
    '.wm-brief-story-link{display:inline-block;margin-top:5px;font-size:10.5px;color:var(--text-dim);text-decoration:none;border-bottom:1px dotted var(--text-dim);}',
    '.wm-brief-story-link:hover{color:var(--text);}',
    '.wm-brief-inline-foot{font-size:10px;color:var(--text-dim);padding:2px 4px;}',
    '.wm-brief-inline-foot a{color:var(--text-dim);}',
    '.wm-brief-threat{font-size:9px;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:6px;}',
    '.wm-brief-threat.critical{background:rgba(220,60,60,.2);color:#ff8a8a;}',
    '.wm-brief-threat.high{background:rgba(230,150,40,.18);color:#ffc069;}',
    /* Translate-Button + UI (wie NewsPanel 文) */
    '.wm-tr-btn{cursor:pointer;border:1px solid #263640;background:#101828;color:#9fb3d1;border-radius:4px;font-size:10px;font-weight:700;padding:2px 7px;margin-left:8px;vertical-align:middle;}',
    '.wm-tr-btn:hover{color:#fff;border-color:#4cc9f0;}',
    '.wm-tr-btn.busy{opacity:.55;pointer-events:none;}',
    '.wm-tr-btn.done{color:#7ee787;border-color:#2ea043;}'
  ].join('');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const LANG_TABS = [
    { code: 'en', label: 'EN' }, { code: 'de', label: 'DE' }, { code: 'it', label: 'IT' },
    { code: 'es', label: 'ES' }, { code: 'fr', label: 'FR' }, { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' }, { code: 'zh', label: '中文' }, { code: 'ar', label: 'العربية' }
  ];
  const LANG_NAMES = { en: 'English', de: 'German', it: 'Italian', es: 'Spanish', fr: 'French', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic' };
  const AUTO_LANGS = ['de', 'it', 'es', 'fr', 'ja', 'ko', 'zh', 'ar']; // v7 Auto-Reihenfolge

  // aktive UI-Sprache des Briefs (default EN), für Translate-Ziel
  let activeLang = 'en';
  // v7: EN-Inhalt cachen (slot -> threads), verhindert Doppel-Fetch bei Tab-Wechsel
  let enCache = { slot: null, threads: null, magazineUrl: null };

  function parseMagazine(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const byCat = new Map();
    doc.querySelectorAll('section.page.story').forEach((sec) => {
      const head = sec.querySelector('h3');
      if (!head) return;
      const tags = [...sec.querySelectorAll('.tag-row .tag')].map((t) => t.textContent.trim());
      const cat = tags[0] || 'Brief';
      const threat = (sec.querySelector('.tag-row .crit, .tag-row [class*="crit"]') || {}).textContent || '';
      const desc = sec.querySelector('.desc, p');
      const link = sec.querySelector('a.source-link, a[href^="http"]');
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push({
        headline: head.textContent.trim(),
        desc: desc ? desc.textContent.trim() : '',
        url: link ? link.href : null,
        threat
      });
    });
    const threads = [];
    for (const [cat, stories] of byCat) threads.push({ tag: cat, stories });
    threads.sort((a, b) => b.stories.length - a.stories.length);
    return threads;
  }

  // v2-Format: strukturierte stories [{category,threatLevel,country,sourceUrl,headline,desc,why}]
  function parseI18nStructured(stories) {
    const byCat = new Map();
    (stories || []).forEach((s) => {
      const cat = s.category || 'Brief';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push({
        headline: s.headline || '',
        desc: s.desc || '',
        why: s.why || '',
        url: s.sourceUrl || null,
        threat: s.threatLevel || ''
      });
    });
    const threads = [];
    for (const [cat, arr] of byCat) threads.push({ tag: cat, stories: arr });
    threads.sort((a, b) => b.stories.length - a.stories.length);
    return threads;
  }

  // Legacy-Fallback: alter Flattext [N](cat/threat) + HEADLINE:/CONTEXT:
  function parseI18nText(text) {
    const threads = [];
    let cur = null;
    text.split('\n').forEach((line) => {
      const m = line.match(/^\[(\d+)\]\s*\(([^/]+)\/([^)]+)\)/);
      if (m) {
        cur = { tag: m[2].trim(), stories: [] };
        threads.push(cur);
        return;
      }
      if (!cur) return;
      const h = line.match(/^HEADLINE:\s*(.+)/);
      if (h) {
        cur.stories.push({ headline: h[1].trim(), desc: '', url: null });
        return;
      }
      const c = line.match(/^CONTEXT:\s*(.+)/);
      if (c && cur.stories.length) cur.stories[cur.stories.length - 1].desc = c[1].trim();
    });
    return threads.filter((t) => t.stories.length);
  }

  // ── v7: API-Helfer ──
  async function fetchLatestMeta() {
    return fetch('/api/latest-brief', { headers: { Accept: 'application/json', Authorization: 'Bearer wm-selfhost-operator-v1' } })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  // holt Übersetzung: erst exakter Slot, bei 404 -> Endpoint-Fallback (ohne slot)
  async function fetchI18n(slot, lang) {
    let tr = slot
      ? await fetch('/worldmapp/brief-i18n?slot=' + encodeURIComponent(slot) + '&lang=' + lang)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : null;
    if (tr) return { tr, exact: true };
    tr = await fetch('/worldmapp/brief-i18n?lang=' + lang)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return { tr, exact: false };
  }
  function trToThreads(tr) {
    if (!tr) return null;
    if (tr.stories && tr.stories.length) return parseI18nStructured(tr.stories);
    if (tr.text) return parseI18nText(tr.text);
    return null;
  }

  // ── per-story Live-Übersetzung (文-Button) ──
  async function liveTranslate(btn, storyEl) {
    const to = btn.dataset.to; // Translate-Ziel
    const headEl = storyEl.querySelector('.wm-brief-story-head');
    const descEl = storyEl.querySelector('.wm-brief-story-desc');
    if (!headEl) return;
    btn.classList.add('busy');
    btn.textContent = '…';
    const text = (headEl.dataset.orig || headEl.textContent) + (descEl ? '\n' + (descEl.dataset.orig || descEl.textContent) : '');
    try {
      const r = await fetch('/worldmapp/gnews-tr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, to })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.translated) {
        const [h, ...rest] = String(j.translated).split('\n');
        headEl.dataset.orig = headEl.dataset.orig || headEl.textContent;
        headEl.textContent = h.trim();
        if (descEl && rest.length) { descEl.dataset.orig = descEl.dataset.orig || descEl.textContent; descEl.textContent = rest.join(' ').trim(); }
        btn.classList.add('done');
        btn.textContent = '✓';
        // Zurück-Button: erneuter Klick stellt Original wieder her
        btn.dataset.done = '1';
        btn.title = 'Original anzeigen';
      } else throw new Error(j.error || 'no translation');
    } catch (e) {
      btn.textContent = '✗';
      setTimeout(() => { btn.textContent = '文'; btn.classList.remove('busy'); }, 1500);
      return;
    }
    btn.classList.remove('busy');
  }

  function storyHtml(s) {
    const threatCls = /critical/i.test(s.threat || '') ? 'critical' : (/high/i.test(s.threat || '') ? 'high' : '');
    return '<div class="wm-brief-story">' +
      '<div class="wm-brief-story-head">' + esc(s.headline) +
      (threatCls ? '<span class="wm-brief-threat ' + threatCls + '">' + esc((s.threat || '').trim()) + '</span>' : '') +
      '<button class="wm-tr-btn" data-to="' + esc(btnTargetLang()) + '" title="In ' + esc(LANG_NAMES[btnTargetLang()] || btnTargetLang()) + ' übersetzen">文</button>' +
      '</div>' +
      (s.desc ? '<div class="wm-brief-story-desc">' + esc(s.desc) + '</div>' : '') +
      (s.why ? '<div class="wm-brief-story-why">' + esc(s.why) + '</div>' : '') +
      (s.url ? '<a class="wm-brief-story-link" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">Quelle öffnen →</a>' : '') +
      '</div>';
  }

  function btnTargetLang() {
    // Translate-Ziel = UI-Sprache des Browsers, aber nie die aktive Brief-Sprache selbst
    const nav = (navigator.language || 'en').slice(0, 2);
    if (nav !== activeLang && LANG_NAMES[nav]) return nav;
    return activeLang === 'en' ? 'de' : 'en';
  }

  function bindTranslateButtons(wrap) {
    wrap.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.wm-tr-btn');
      if (!btn) return;
      const storyEl = btn.closest('.wm-brief-story');
      if (!storyEl) return;
      if (btn.dataset.done) {
        // toggle zurück
        const headEl = storyEl.querySelector('.wm-brief-story-head');
        const descEl = storyEl.querySelector('.wm-brief-story-desc');
        if (headEl && headEl.dataset.orig) headEl.textContent = headEl.dataset.orig;
        if (descEl && descEl.dataset.orig) descEl.textContent = descEl.dataset.orig;
        delete btn.dataset.done;
        btn.classList.remove('done');
        btn.textContent = '文';
        return;
      }
      liveTranslate(btn, storyEl);
    });
  }

  function renderThreads(wrap, threads, magazineUrl, rtl) {
    wrap.querySelectorAll('.wm-brief-thread, .wm-brief-inline-foot, .wm-brief-note').forEach((e) => e.remove());
    threads.forEach((th) => {
      const el = document.createElement('div');
      el.className = 'wm-brief-thread';
      if (rtl) el.setAttribute('dir', 'rtl');
      el.innerHTML =
        '<div class="wm-brief-thread-head"><span class="wm-brief-thread-tag">' + esc(th.tag) +
        '</span><span class="wm-brief-thread-count">' + th.stories.length + ' stories</span></div>' +
        th.stories.map(storyHtml).join('');
      el.querySelector('.wm-brief-thread-head').addEventListener('click', () => {
        el.classList.toggle('open');
      });
      wrap.appendChild(el);
    });
    if (magazineUrl) {
      const foot = document.createElement('div');
      foot.className = 'wm-brief-inline-foot';
      foot.innerHTML = '<a href="' + esc(magazineUrl) + '" target="_blank" rel="noopener noreferrer">Vollständiges Magazin öffnen →</a>';
      wrap.appendChild(foot);
    }
  }

  function showBriefNote(wrap, msg) {
    let n = wrap.querySelector('.wm-brief-note');
    if (!msg) { if (n) n.remove(); return; }
    if (!n) { n = document.createElement('div'); n.className = 'wm-brief-note'; wrap.insertBefore(n, wrap.querySelector('.wm-brief-thread')); }
    n.textContent = msg;
  }

  // ── v7: zentrale Lade-Logik je Sprache ──
  async function loadLang(wrap, code, meta) {
    const slot = meta && meta.issueSlot;
    if (code === 'en') {
      // EN: Magazin-HTML zuerst (i18n-Endpoint pflegt nur die 8 Übersetzungs-Sprachen),
      // Endpoint nur als Fallback, falls das Magazin mal leer sein sollte.
      if (meta && meta.magazineUrl) {
        const html = await fetch(meta.magazineUrl.replace(/^https:\/\/exit-matrix\.net/, ''))
          .then((r) => (r.ok ? r.text() : null)).catch(() => null);
        if (html) {
          const t2 = parseMagazine(html);
          if (t2.length) {
            enCache = { slot, threads: t2, magazineUrl: meta.magazineUrl };
            renderThreads(wrap, t2, meta.magazineUrl, false);
            showBriefNote(wrap, null);
            return true;
          }
        }
      }
      const { tr } = await fetchI18n(slot, 'en');
      const threads = trToThreads(tr);
      if (threads) { renderThreads(wrap, threads, null, false); showBriefNote(wrap, null); return true; }
      return false;
    }
    const { tr, exact } = await fetchI18n(slot, code);
    const threads = trToThreads(tr);
    if (!threads) {
      showBriefNote(wrap, LANG_NAMES[code] + ': noch keine Übersetzung verfügbar — Übersetzung läuft im Hintergrund, bitte in wenigen Minuten erneut klicken.');
      return false;
    }
    renderThreads(wrap, threads, null, code === 'ar');
    if (!exact && slot && tr.slot && tr.slot !== slot) {
      showBriefNote(wrap, LANG_NAMES[code] + ': Ausgabe ' + tr.slot + ' (neueste verfügbare Übersetzung; Ausgabe ' + slot + ' wird gerade übersetzt).');
    } else showBriefNote(wrap, null);
    return true;
  }

  function render(panel, threads, magazineUrl) {
    if (!panel || panel.querySelector('.wm-brief-inline')) return;
    const wrap = document.createElement('div');
    wrap.className = 'wm-brief-inline';
    bindTranslateButtons(wrap);
    if (!threads.length) {
      wrap.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:8px">Brief wird zusammengestellt…</div>';
    } else {
      // Sprach-Tabs:
      const tabs = document.createElement('div');
      tabs.className = 'wm-brief-langtabs';
      let active = 'en';
      activeLang = 'en';
      const setBusy = (code, busy) => tabs.querySelectorAll('button').forEach((x) => { if (x.dataset.lang === code) x.classList.toggle('busy', !!busy); });
      LANG_TABS.forEach((l) => {
        const b = document.createElement('button');
        b.textContent = l.label;
        b.dataset.lang = l.code;
        if (l.code === 'en') b.classList.add('active');
        b.addEventListener('click', async () => {
          if (l.code === active) return;
          active = l.code;
          activeLang = l.code;
          tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.lang === l.code));
          // 文-Ziele auf allen Buttons an neue UI-Sprache anpassen:
          wrap.querySelectorAll('.wm-tr-btn').forEach((x) => { delete x.dataset.done; x.classList.remove('done'); x.textContent = '文'; x.dataset.to = btnTargetLang(); });
          showBriefNote(wrap, '…');
          setBusy(l.code, true);
          try {
            const meta = await fetchLatestMeta();
            await loadLang(wrap, l.code, meta);
          } finally { setBusy(l.code, false); }
        });
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);
      renderThreads(wrap, threads, magazineUrl);
      // ── v7 Auto-Sprache: Browser-Sprache, wenn verfügbar ──
      const nav = (navigator.language || 'en').slice(0, 2);
      if (nav !== 'en' && LANG_NAMES[nav]) {
        (async () => {
          const meta = await fetchLatestMeta();
          const { tr } = await fetchI18n(meta && meta.issueSlot, nav);
          if (trToThreads(tr)) {
            const btn = tabs.querySelector('button[data-lang="' + nav + '"]');
            if (btn) btn.click();
          }
          // sonst: EN bleibt stehen, kein Hinweis nötig
        })();
      }
    }
    const anchor = panel.querySelector('.latest-brief-card');
    if (anchor && anchor.parentElement) anchor.parentElement.appendChild(wrap);
    else panel.appendChild(wrap);
  }

  function tryAttach() {
    const panel = document.querySelector('#latest-brief') ||
      document.querySelector('[data-panel-id="latest-brief"]') ||
      (document.querySelector('.latest-brief-card') &&
        document.querySelector('.latest-brief-card').closest('.panel, section'));
    if (!panel || panel.querySelector('.wm-brief-inline')) return;
    fetch('/api/latest-brief', { headers: { Accept: 'application/json', Authorization: 'Bearer wm-selfhost-operator-v1' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((meta) => {
        if (!meta || !meta.magazineUrl) return;
        const url = meta.magazineUrl.replace(/^https:\/\/exit-matrix\.net/, '');
        return fetch(url).then((r) => (r.ok ? r.text() : null)).then((html) => {
          if (!html) return;
          render(panel, parseMagazine(html), meta.magazineUrl);
        });
      }).catch(() => {});
  }

  function boot() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      if (document.querySelector('.latest-brief-card')) { clearInterval(iv); tryAttach(); }
      if (tries > 200) clearInterval(iv);
    }, 1500);
    const mo = new MutationObserver(() => {
      if (document.querySelector('.latest-brief-card') &&
          !document.querySelector('.wm-brief-inline')) tryAttach();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
