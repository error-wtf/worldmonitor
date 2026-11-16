/* wm-tabgating-fix v3 (12.10.2026): Tab-Wechsel blendet Panels NICHT aus.
   v2 BUGFIX: Fix A verursachte eine MutationObserver-Endlosschleife —
   drop() entfernt wm-map-collapsed am <html>-Element, das removal selbst
   feuert den class-Attribute-Observer erneut → Main-Thread blockiert
   ("Seite reagiert nicht"). v2 entfernt die Klasse NUR, wenn sie wirklich
   gesetzt ist (guarded removal) → kein Schreiben = kein Selbst-Triggern.
   Ursprungsdoku: applyTabPanelState additiv — Panels, die im gewaehlten
   Tab nicht enthalten sind, behalten enabled:true aus der Default-Config.
   Fix B (rein praesentativ, veraendert den Store NICHT) unveraendert.

   v3 BUGFIX (12.10.2026): Fix B versteckte ALLE Panels ohne expliziten
   Eintrag im aktiven Tab (allow-Liste). Das verletzte die additiv-Semantik:
   Ein Tab ohne websdr-Eintrag (z.B. Tab "TV") blendete das WebSDR-Panel
   dauerhaft aus (class "panel hidden"), obwohl global enabled:true —
   Folge: keine Empfängerliste sichtbar, Klicks timeouten, keine SDR-iframes.
   v3: Panels OHNE Tab-Eintrag bleiben UNANGETASTET (globale Einstellung
   gilt weiter). Versteckt wird nur bei explizitem enabled:false im Tab. */
(function(){
  if (window.__wmTabGatingFix) return;
  window.__wmTabGatingFix = true;

  var isDesktop = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;

  // --- Fix A: wm-map-collapsed nie auf Desktop (GUARDED — bricht die Loop) ---
  if (isDesktop) {
    var drop = function(){
      var de = document.documentElement;
      if (de.classList.contains('wm-map-collapsed')) {
        de.classList.remove('wm-map-collapsed');
      }
    };
    drop();
    setInterval(drop, 2000);
    new MutationObserver(function(muts){
      for (var i=0;i<muts.length;i++){
        if (document.documentElement.classList.contains('wm-map-collapsed')) { drop(); break; }
      }
    }).observe(document.documentElement, {attributes:true, attributeFilter:['class']});
  }

  // --- Fix B: echte Tab-Isolation (v3: additiv) ---
  var LS_KEY = 'worldmonitor-tabs-v1:full';

  function currentTabsState(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch(e){ return null; }
  }

  function applyGating(){
    var grid = document.querySelector('.panels-grid');
    if (!grid) return;
    var state = currentTabsState();
    if (!state || !Array.isArray(state.tabs)) return;
    var tab = state.tabs.find(function(t){ return t.id === state.activeTabId; });
    if (!tab) return;
    // v3 additiv: Nur EXPLIZITE Tab-Einträge steuern die Sichtbarkeit.
    //   enabled:true  → Panel zeigen (im Tab erlaubt)
    //   enabled:false → Panel verstecken (im Tab abgewählt)
    //   kein Eintrag  → NICHT anfassen; globale panelSettings (enabled:true
    //                   aus Default-Config) bleiben wirksam.
    var explicit = {};
    Object.keys(tab.panelSettings || {}).forEach(function(k){
      var v = tab.panelSettings[k];
      if (v && typeof v.enabled === 'boolean') explicit[k] = v.enabled;
    });
    // Exit-Overlay-Panels + map immer erlauben:
    explicit['map'] = true;
    var kids = grid.children;
    for (var i=0;i<kids.length;i++){
      var el = kids[i];
      var dp = el.dataset && el.dataset.panel;
      var isExitPanel = el.id && el.id.indexOf('exit-') === 0;
      if (isExitPanel) continue; // EXIT-Panels (gnews/wsb) unangetastet
      if (!dp) continue;
      if (explicit[dp] === true) { el.classList.remove('hidden'); }
      else if (explicit[dp] === false) { el.classList.add('hidden'); }
      // kein Eintrag: bewusst kein Schreiben (Additivität, s. Header)
    }
  }

  // Trigger 1: Klick auf einen Tab (capture, vor der App)
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target.closest('.dashboard-tab, .dashboard-tab-label') : null;
    if (!t) return;
    setTimeout(applyGating, 350);
    setTimeout(applyGating, 1200);
    setTimeout(applyGating, 2500);
  }, true);

  // Trigger 2: localStorage-Aenderung (App schreibt aktiven Tab dort hin)
  var lastRaw = localStorage.getItem(LS_KEY);
  setInterval(function(){
    var raw = localStorage.getItem(LS_KEY);
    if (raw !== lastRaw) { lastRaw = raw; setTimeout(applyGating, 400); }
  }, 500);

  // Trigger 3: initial nach App-Hydration
  setTimeout(applyGating, 5000);
  setTimeout(applyGating, 9000);
})();
