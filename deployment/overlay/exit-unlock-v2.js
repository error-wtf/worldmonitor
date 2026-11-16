
/* exit-unlock-v2 — self-host unlock: API-Keys-tab ohne login + panel-restore-guard */
(function(){
  if (window.__exitUnlockV2) return; window.__exitUnlockV2 = true;
  var API_BASE = '/worldmapp';

  // 1) CSS: lock-states im settings-dialog unsichtbar machen, API-keys-tab immer freigeben
  var css = document.createElement('style');
  css.id = 'exit-unlock-css';
  css.textContent = [
    /* API-Keys-PRO-tab: Label-PRO-Text entfernen ist zu invasiv; aber locked-state ersetzen wir funktional */
    '.panel-locked-state{display:none!important}',
    '#usApiKeysPanel,.api-keys-panel,[class*="api-keys-"]{display:revert!important}'
  ].join('\n');
  document.head.appendChild(css);

  // 2) Wenn der settings-dialog den locked-state rendert, ersetzen wir ihn durch einen Hinweis + den gebackenen key-status
  function patchDialog(){
    var dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return;
    var locked = dlg.querySelector('.panel-locked-state');
    if (locked && /API Keys/i.test(dlg.innerText)) {
      var ok = document.createElement('div');
      ok.className = 'api-keys-panel';
      ok.style.cssText = 'padding:14px;border:1px solid rgba(125,211,252,.25);border-radius:10px;background:rgba(8,25,43,.5)';
      ok.innerHTML = '<div style="font-weight:700;margin-bottom:6px">API-Zugang (self-hosted)</div>' +
        '<div style="opacity:.85;font-size:13px;line-height:1.5">Diese Instanz ist voll freigeschaltet. Der Operator-Key ist im Bundle gebacken — alle Endpoints arbeiten ohne Login. Für externe API-Nutzung: <code>/api/*?public=1</code> bzw. Key-Anfrage beim Betreiber.</div>';
      locked.replaceWith(ok);
    }
  }
  setInterval(patchDialog, 1200);

  // 3) Panel-restore-guard: falls enforceFreeTierLimits doch mal panels kappt (tier-flackern),
  //    repairing via recovery-key — gleiche logik wie app, aber nach 5s
  setTimeout(function(){
    try{
      var raw = localStorage.getItem('worldmonitor-panels');
      if(!raw) return;
      var j = JSON.parse(raw);
      var panels = j.panels || j;
      var rec = localStorage.getItem('worldmonitor-cw-pro-gate-recovery-v1');
      if (rec && rec !== 'done') {
        var n = 0;
        Object.keys(panels).forEach(function(k){
          var v = panels[k];
          if (v && v.enabled === false && (v.proGated || k.indexOf('cw-') === 0)) { v.enabled = true; n++; }
        });
        if (n) { localStorage.setItem('worldmonitor-panels', JSON.stringify(j)); location.reload(); }
        localStorage.setItem('worldmonitor-cw-pro-gate-recovery-v1','done');
      }
    }catch(e){}
  }, 5000);
})();
