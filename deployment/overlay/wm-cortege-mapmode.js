(function(){
  'use strict';
  var ID='wmCortegeMapmode';
  if (window[ID]) return; window[ID]=1;
  /* v20261030-r32 (operator: 'unsere bessere 2d map als protest karte, alle
   * sources kombiniert'): der PROTEST-button ist jetzt NATIV — unsere
   * 2D-maplibre-karte mit GDELT-protesten + cortege-events + cortege-live-
   * meldungen (wm-protest-live.js), frankreich-fokus per flyTo.
   * Das cortege-original-iframe bleibt vollstaendig erhalten als eigener
   * CORTEGE-button (nichts wird abgeschaltet). */
  var iframe=null, cortegeActive=false, cortegeBtn=null, protestBtn=null;
  var protestActive=false, modeWired=false, lastActive=null;

  function mapSection(){ return document.getElementById('mapSection'); }
  function toggleEl(){ return document.getElementById('mapDimensionToggle'); }
  function headerH(ms){
    var h=ms.querySelector('.panel-header');
    return (h && h.offsetHeight>10) ? h.offsetHeight : 42;
  }

  function ensureIframe(){
    var ms=mapSection(); if(!ms) return null;
    if(iframe && iframe.isConnected) return iframe;
    iframe=document.createElement('iframe');
    iframe.id='wm-cortege-embed';
    // r40c: z=6.2 statt z=15 — ganz Frankreich im Blick, damit die Live-Meldungen
    // sichtbar sind (z15 zeigt nur einen winzigen Ausschnitt, nachts dort oft 0).
    iframe.src='https://cortege.neru.tv/embed.html?lat=46.600&lng=2.400&z=6.2';
    iframe.title='Live protest map (Cortege)';
    iframe.setAttribute('loading','lazy');
    iframe.setAttribute('allow','fullscreen');
    var top=headerH(ms);
    iframe.style.cssText='position:absolute;left:0;right:0;top:'+top+'px;bottom:0;width:100%;height:calc(100% - '+top+'px);border:0;z-index:60;background:#0d1117;display:none;';
    if (getComputedStyle(ms).position==='static') ms.style.position='relative';
    ms.appendChild(iframe);
    return iframe;
  }
  var olink=null;
  function ensureOriginLink(ms){
    if(olink && olink.isConnected) return olink;
    olink=document.createElement('a');
    olink.className='wm-origin-link';
    olink.href='https://cortege.neru.tv/';
    olink.target='_blank'; olink.rel='noopener noreferrer';
    olink.textContent='\u2197 Original: cortege.neru.tv';
    olink.title='Original-Seite in neuem Tab \u00f6ffnen';
    olink.style.cssText='position:absolute;right:10px;top:'+(headerH(ms)+6)+'px;z-index:61;background:rgba(13,17,23,.85);color:#38bdf8;border:1px solid #23304a;border-radius:6px;padding:4px 10px;font:12px/1.4 system-ui,sans-serif;text-decoration:none;';
    ms.appendChild(olink);
    return olink;
  }
  function hideCortege(){
    cortegeActive=false;
    if(iframe) iframe.style.display='none';
    if(olink) olink.style.display='none';
    if(cortegeBtn) cortegeBtn.classList.remove('active');
    if(lastActive && lastActive.isConnected){ lastActive.classList.add('active'); }
  }
  // r35-fix: closeSiblings war durch den r35-schnitt mit entfernt worden
  // (pageerror 'closeSiblings is not defined' — bewiesen 30.10.). Wieder
  // eingefuegt; schliesst alle schwester-panels exklusiv.
  function closeSiblings(){
    var apis = ['wmRadarMapmodeAPI', 'wmSdrMapmodeAPI', 'wmSporenMapmodeAPI', 'wmMafiaMapmodeAPI', 'wmOcindexMapmodeAPI', 'wmWeatherMapmodeAPI'];
    for (var k = 0; k < apis.length; k++) {
      var a = window[apis[k]];
      if (a && a.isOpen && a.isOpen() && a.close) a.close();
    }
  }

  function showCortege(){
    closeSiblings();
    var f=ensureIframe(); if(!f) return;
    var t=toggleEl();
    var cur=t ? t.querySelector('.map-dim-btn[data-mode].active') : null;
    if(cur){ lastActive=cur; cur.classList.remove('active'); }
    cortegeActive=true;
    f.style.display='block';
    var ms=mapSection();
    var ol=ensureOriginLink(ms); ol.style.display='block'; ol.style.top=(headerH(ms)+6)+'px';
    if(cortegeBtn) cortegeBtn.classList.add('active');
  }

  // ---------- PROTEST (r35: eigenstaendige protest-karte) ----------
  // operator 30.10.26: 'nur die map-art von der 2d map uebernehmen, nicht die
  // 2d map umbauen' — der PROTEST-button zeigt die eigenstaendige
  // protest-map.html (maplibre, eigene instanz, alle quellen: GDELT global,
  // cortège-live + -termine, adsb.fi-militär, police.uk). Die haupt-2d-map
  // wird NICHT angefasst (keine checkbox-toggle mehr — r33-fokus entfernt).
  var piframe = null, protestActive = false, protestBtn = null;

  function ensureProtestIframe(){
    var ms = mapSection(); if(!ms) return null;
    if(piframe && piframe.isConnected) return piframe;
    piframe = document.createElement('iframe');
    piframe.id = 'wm-protest-map-frame';
    piframe.src = '/worldmapp/protest-map.html';
    piframe.title = 'Protest-Karte — Proteste · Polizei · Militär';
    piframe.setAttribute('loading', 'lazy');
    piframe.setAttribute('allow', 'fullscreen');
    var top = headerH(ms);
    piframe.style.cssText = 'position:absolute;left:0;right:0;top:' + top + 'px;bottom:0;width:100%;height:calc(100% - ' + top + 'px);border:0;z-index:60;background:#0d1117;display:none;';
    if (getComputedStyle(ms).position === 'static') ms.style.position = 'relative';
    ms.appendChild(piframe);
    return piframe;
  }
  function hideProtest(){
    protestActive = false;
    if(piframe) piframe.style.display = 'none';
    if(protestBtn) protestBtn.classList.remove('active');
  }
  function showProtest(){
    closeSiblings();
    var f = ensureProtestIframe(); if(!f) return;
    protestActive = true;
    f.style.display = 'block';
    if(protestBtn) protestBtn.classList.add('active');
  }

  function wireModes(){
    if(modeWired) return;
    var t=toggleEl(); if(!t) return;
    var modes=t.querySelectorAll('.map-dim-btn[data-mode="globe"], .map-dim-btn[data-mode="flat"]');
    if(!modes.length) return;
    modeWired=true;
    modes.forEach(function(m){
      m.addEventListener('click', function(e){
        if(cortegeActive){ e.stopPropagation(); e.preventDefault(); hideCortege(); return; }
        if(protestActive){ e.stopPropagation(); e.preventDefault(); hideProtest(); return; }
      }, true);
    });
    t.addEventListener('click', function(e){
      var b=e.target && e.target.closest ? e.target.closest('.map-dim-btn') : null;
      if(!b) return;
      if(cortegeActive && b!==cortegeBtn) hideCortege();
      if(protestActive && b!==protestBtn) hideProtest();
    }, true);
  }

  function ensureButtons(){
    var ms=mapSection(), t=toggleEl();
    if(!ms || !t) return false;
    if(!(cortegeBtn && cortegeBtn.isConnected)){
      cortegeBtn=t.querySelector('[data-cortegebtn]');
      if(!cortegeBtn){
        cortegeBtn=document.createElement('button');
        cortegeBtn.className='map-dim-btn';
        cortegeBtn.setAttribute('data-cortegebtn','1');
        cortegeBtn.type='button';
        cortegeBtn.textContent='CORTEGE';
        cortegeBtn.title='Cortege original (iframe) — live-meldungen der franzoesischen instanz';
        cortegeBtn.addEventListener('click', function(e){
          e.preventDefault();
          if(cortegeActive) hideCortege(); else showCortege();
        });
        t.appendChild(cortegeBtn);
      }
    }
    if(!(protestBtn && protestBtn.isConnected)){
      protestBtn=t.querySelector('[data-protestlivebtn]');
      if(!protestBtn){
        protestBtn=document.createElement('button');
        protestBtn.className='map-dim-btn';
        protestBtn.setAttribute('data-protestlivebtn','1');
        protestBtn.type='button';
        protestBtn.textContent='PROTEST';
        protestBtn.title='Kombinierte Protest-Karte auf unserer 2D-map: GDELT global + cortege-termine + cortege-live-meldungen';
        protestBtn.addEventListener('click', function(e){
          e.preventDefault();
          if(protestActive) hideProtest(); else showProtest();
        });
        t.appendChild(protestBtn);
      }
    }
    wireModes();
    if(cortegeActive){
      var f=ensureIframe();
      if(f){
        var top=headerH(ms);
        if(f.style.top !== top+'px'){ f.style.top=top+'px'; f.style.height='calc(100% - '+top+'px)'; }
        if(f.style.display==='none') f.style.display='block';
      }
    }
    return true;
  }

  var tries=0;
  (function boot(){
    tries++;
    if(ensureButtons()) return;
    if(tries<240) setTimeout(boot,500);
  })();
  setInterval(function(){ try{ ensureButtons(); }catch(e){} }, 3000);

  window.wmCortegeMapmodeAPI = {
    isOpen: function(){ return cortegeActive; },
    close: function(){ if(cortegeActive) hideCortege(); }
  };
})();
