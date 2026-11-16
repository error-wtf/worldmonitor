/* wm-layerpanel-all-none v6: native layer callbacks, panel-scoped bulk actions,
   one collapse owner for handle/native arrow/Escape, including inline content
   visibility. Keep data-wm-lp42 compatibility with the older anchoring helper. */
(function () {
  'use strict';
  if (window.__wmLayerAllNone) return;
  window.__wmLayerAllNone = true;
  document.documentElement.setAttribute('data-wm-layer-bulk-version', '20261019-layer-state-1');
  const initializedControls = new WeakSet();
  let panelIntent = null;

  function visibleRows(panel) {
    return Array.prototype.filter.call(
      panel.querySelectorAll('.layer-toggle-row'),
      function (row) { return !row.classList.contains('auto-hidden'); });
  }
  function toggleControls(panel) {
    return visibleRows(panel)
      .map(function (row) {
        return row.querySelector('input[type="checkbox"]') || row.querySelector('button.layer-toggle');
      })
      .filter(function (control) {
        return control && !control.disabled && !control.closest('.layer-toggle-locked, [aria-disabled="true"]');
      });
  }
  function setAll(panel, on) {
    // A visible bulk bar means the user still needs the settings below it.
    // Neither native callbacks nor a renderer class reset may hide those rows.
    const keepOpen = !panel.classList.contains('wm-lp-collapsed');
    if (panelIntent) panelIntent(panel, keepOpen);
    toggleControls(panel).forEach(function (control) {
      if (control.matches('input[type="checkbox"]')) {
        // First explicit bulk intent also initializes missing persisted defaults.
        if (control.checked === on && initializedControls.has(control)) return;
        control.checked = on;
        initializedControls.add(control);
        control.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (on !== control.classList.contains('active')) {
        control.click();
      }
    });
    if (panelIntent) panelIntent(panel, keepOpen);
    syncAria();
  }
  function syncAria() {
    document.querySelectorAll('.layer-toggles button.layer-toggle').forEach(function (b) {
      const on = b.classList.contains('active');
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    });
  }
  function ensureBar() {
    document.querySelectorAll('.layer-toggles').forEach(function (panel) {
      if (panel.querySelector('.wm-all-none-bar')) return;
      const bar = document.createElement('div');
      bar.className = 'wm-all-none-bar';
      bar.style.cssText = 'display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid #ffffff22;';
      const mk = function (label, on) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.setAttribute('data-wm-layer-bulk', on ? 'on' : 'off');
        btn.setAttribute('aria-label', label + ' — alle sichtbaren Ebenen');
        btn.style.cssText = 'flex:1;background:#16232d;color:#cfe8ff;border:1px solid #2c4557;border-radius:6px;padding:4px 8px;font:12px monospace;cursor:pointer;';
        return btn;
      };
      bar.append(mk('Alle an', true), mk('Alle aus', false));
      panel.insertBefore(bar, panel.firstChild);
    });
  }
  // Capture delegation survives panel clones and native stopPropagation handlers.
  document.addEventListener('click', function (e) {
    const button = e.target && e.target.closest ? e.target.closest('[data-wm-layer-bulk]') : null;
    const panel = button && button.closest('.layer-toggles');
    if (!panel) return;
    e.preventDefault();
    e.stopPropagation();
    setAll(panel, button.getAttribute('data-wm-layer-bulk') === 'on');
  }, true);
  document.addEventListener('change', function (e) {
    const control = e.target;
    if (control && control.matches && control.matches('.layer-toggles input[type="checkbox"]')) {
      initializedControls.add(control);
    }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    try { if (document.querySelector(':popover-open, dialog[open]')) return; } catch (_) { /* older selector engines */ }
    const panel = Array.prototype.find.call(
      document.querySelectorAll('.layer-toggles'),
      function (p) { return p.offsetParent !== null; });
    if (!panel || panel.classList.contains('wm-lp-collapsed')) return;
    if (panelIntent) {
      e.preventDefault();
      e.stopImmediatePropagation();
      panelIntent(panel, false);
    }
  }, true);

  ensureBar();
  setInterval(function () {
    ensureBar(); syncAria();
  }, 2000);
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(syncAria).observe(document.body, {
      subtree: true, attributes: true, attributeFilter: ['class'],
    });
  }
  // One state must control both the outer class and native inline styles.
  // Letting the native arrow retain its own closure left an apparently open
  // panel whose search/list were still display:none after handle/bulk clicks.
  (function () {
    var wantCollapsed = true;
    var userTouched = false;
    var panelWatches = new WeakMap();
    var styleEl = document.createElement('style');
    styleEl.textContent = [
      '.wm-lp-handle{display:inline-block!important;margin:2px!important;padding:2px 8px!important;',
      'font:11px monospace!important;background:#0a0a0a!important;color:#0f0!important;',
      'border:1px solid #3a3a3a!important;border-radius:3px!important;cursor:pointer!important}',
      // The shipped stylesheet puts important mobile/TV rules in @layer base.
      // Important layered rules beat unlayered rules regardless of specificity.
      // Join the real layer; the more-specific TV fullscreen hide still wins.
      '@layer base{.layer-toggles[data-wm-lp42]{display:flex!important}}',
      '.layer-toggles.wm-lp-collapsed>*:not(.wm-lp-handle){display:none!important}',
      '.layer-toggles.wm-lp-collapsed{padding:2px!important;background:transparent!important}',
      '.layer-toggles{max-height:45vh!important;overflow-y:auto!important}'
    ].join('');
    document.head.appendChild(styleEl);
    function getHandle(p) {
      var h = p.querySelector('.wm-lp-handle');
      if (!h) {
        h = document.createElement('button');
        h.type = 'button';
        h.className = 'wm-lp-handle';
        p.appendChild(h);
      }
      return h;
    }
    function setAttribute(node, name, value) {
      if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    }
    function watchPanel(p) {
      if (typeof MutationObserver === 'undefined') return;
      var watch = panelWatches.get(p);
      if (!watch) {
        watch = { observer: new MutationObserver(function () { apply(p); }), nodes: new WeakSet() };
        panelWatches.set(p, watch);
      }
      [p, p.querySelector('.toggle-list'), p.querySelector('.layer-search')].forEach(function (node) {
        if (!node || watch.nodes.has(node)) return;
        watch.nodes.add(node);
        // No subtree style observer: globe marker positions change every frame.
        watch.observer.observe(node, { attributes: true, attributeFilter: ['class', 'style'] });
      });
    }
    function apply(p) {
      var handle = getHandle(p);
      setAttribute(p, 'data-wm-lp42', '1');
      p.classList.toggle('wm-lp-collapsed', wantCollapsed);
      [p.querySelector('.toggle-list'), p.querySelector('.layer-search')].forEach(function (node) {
        if (!node) return;
        var display = wantCollapsed ? 'none' : '';
        if (node.style.display !== display) node.style.display = display;
        if (!wantCollapsed && node.classList.contains('collapsed')) node.classList.remove('collapsed');
      });
      var label = wantCollapsed ? 'EBENEN \u25b8' : 'EBENEN \u25be';
      if (handle.textContent !== label) handle.textContent = label;
      setAttribute(handle, 'aria-expanded', String(!wantCollapsed));
      var nativeArrow = p.querySelector('.toggle-collapse');
      if (nativeArrow) {
        var arrow = wantCollapsed ? '\u25b6' : '\u25bc';
        if (nativeArrow.textContent !== arrow) nativeArrow.textContent = arrow;
        setAttribute(nativeArrow, 'aria-expanded', String(!wantCollapsed));
      }
      watchPanel(p);
    }
    panelIntent = function (p, open) {
      userTouched = true;
      wantCollapsed = !open;
      apply(p);
    };
    function firstPanel() {
      return Array.prototype.find.call(
        document.querySelectorAll('.layer-toggles'),
        function (p) { return p.offsetParent !== null; });
    }
    setInterval(function () {
      // v4.4: KEIN Self-Heal mehr — v4.3's 30s-Reset klappte das Panel
      // mitten beim Benutzen zu (Layer-Klicks zaehlten nicht als 'echter
      // Klick'). Nur das isTrusted-Gate entscheidet: erster ECHTER Klick
      // auf Handle/Collapse = Nutzer uebernimmt dauerhaft.
      if (!userTouched) wantCollapsed = true;
      var p = firstPanel();
      if (!p) return;
      apply(p);
    }, 2000);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function (muts) {
        var panels = new Set();
        muts.forEach(function (m) {
          var t = m.target;
          if (t && t.classList && t.classList.contains('layer-toggles')) {
            panels.add(t);
          }
          if (m.type === 'childList') Array.prototype.forEach.call(m.addedNodes, function (node) {
            if (node.nodeType !== 1) return;
            if (node.classList.contains('layer-toggles')) panels.add(node);
            node.querySelectorAll('.layer-toggles').forEach(function (p) { panels.add(p); });
          });
        });
        panels.forEach(apply);
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    }
    // Capture delegation also survives cloned handles. Stop the old native
    // listener before its private collapsed boolean can diverge again.
    document.addEventListener('click', function (e) {
      var t = e.target;
      var control = t && t.closest ? t.closest('.wm-lp-handle, .toggle-collapse') : null;
      var p = control && control.closest('.layer-toggles');
      if (!p) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.isTrusted === false) { apply(p); return; }
      if (e.isTrusted) window.__wmLpLastReal = Date.now();
      panelIntent(p, p.classList.contains('wm-lp-collapsed'));
    }, true);
    setTimeout(function () { var p = firstPanel(); if (p && !userTouched) apply(p); }, 1200);
    setTimeout(function () { var p = firstPanel(); if (p && !userTouched) apply(p); }, 4500);
  })();
  syncAria();
})();
