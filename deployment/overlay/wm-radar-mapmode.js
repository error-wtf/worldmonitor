(function(){
  'use strict';
  var ID='wmRadarMapmode';
  if (window[ID]) return; window[ID]=1;
  var iframe=null, radarActive=false, btn=null, modeWired=false, lastActive=null;

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
    iframe.id='wm-radar-embed';
    iframe.src='/radar/';
    iframe.title='EXIT RADAR';
    iframe.setAttribute('loading','lazy');
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
    olink.href='https://www.rainviewer.com/';
    olink.target='_blank'; olink.rel='noopener noreferrer';
    olink.textContent='\u2197 Radar-Quelle: RainViewer \u00b7 \u00a9 OpenStreetMap';
    olink.title='Radardaten: RainViewer — Kartenkacheln: (c) OpenStreetMap contributors';
    olink.style.cssText='position:absolute;right:10px;top:'+(headerH(ms)+6)+'px;z-index:2147483000;background:rgba(13,17,23,.85);color:#38bdf8;border:1px solid #23304a;border-radius:6px;padding:4px 10px;font:12px/1.4 system-ui,sans-serif;text-decoration:none;';
    ms.appendChild(olink);
    return olink;
  }

  function hideRadar(){
    radarActive=false;
    if(iframe) iframe.style.display='none';
    if(olink) olink.style.display='none';
    if(btn) btn.classList.remove('active');
    // Gemerkten Mode-Button sofort re-aktivieren; falls das Bundle stattdessen
    // auf 2D umschaltet, ueberschreibt dessen Sync das korrekt.
    if(lastActive && lastActive.isConnected){ lastActive.classList.add('active'); }
  }

  function showRadar(){
    if(window.wmSdrMapmodeAPI && window.wmSdrMapmodeAPI.isOpen && window.wmSdrMapmodeAPI.isOpen()){ window.wmSdrMapmodeAPI.close(); }
    if(window.wmSporenMapmodeAPI && window.wmSporenMapmodeAPI.isOpen && window.wmSporenMapmodeAPI.isOpen()){ window.wmSporenMapmodeAPI.close(); }
    var f=ensureIframe(); if(!f) return;
    var t=toggleEl();
    var cur=t ? t.querySelector('.map-dim-btn[data-mode].active') : null;
    if(cur){ lastActive=cur; cur.classList.remove('active'); }
    radarActive=true;
    f.style.display='block';
    var ms=mapSection();
    var ol=ensureOriginLink(ms); ol.style.display='block'; ol.style.top=(headerH(ms)+6)+'px';
    if(btn) btn.classList.add('active');
  }

  function wireModes(){
    if(modeWired) return;
    var t=toggleEl(); if(!t) return;
    var modes=t.querySelectorAll('.map-dim-btn[data-mode="globe"], .map-dim-btn[data-mode="flat"]');
    if(!modes.length) return;
    modeWired=true;
    modes.forEach(function(m){
      m.addEventListener('click', function(e){
        if(!radarActive) return;
        // Radar schliessen und Bundle-Handler komplett blockieren:
        // der Kartenmodus hat sich nicht geaendert, das Bundle wuerde sonst
        // einen fiesen 2D/3D-Remap ausfuehren und das Highlight zerschiessen.
        e.stopPropagation();
        e.preventDefault();
        hideRadar();
      }, true);
    });
  }

  function ensureButton(){
    var ms=mapSection(), t=toggleEl();
    if(!ms || !t) return false;
    if(!(btn && btn.isConnected)){
      btn=t.querySelector('[data-radarbtn]');
      if(!btn){
        btn=document.createElement('button');
        btn.className='map-dim-btn';
        btn.setAttribute('data-radarbtn','1');
        btn.type='button';
        btn.textContent='RADAR';
        btn.title='EXIT RADAR — Live-Flugzeuge als dritte Weltkarte';
        btn.addEventListener('click', function(e){
          e.preventDefault();
          if(radarActive) hideRadar(); else showRadar();
        });
        t.appendChild(btn);
      }
    }
    wireModes();
    if(radarActive){
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
    if(ensureButton()) return;
    if(tries<240) setTimeout(boot,500);
  })();
  setInterval(function(){ try{ ensureButton(); }catch(e){} }, 3000);

  // Oeffentliche API fuer Schwester-Overlays (wm-sdr-mapmode.js): gegenseitiger Exklusiv-Zugriff.
  window.wmRadarMapmodeAPI = {
    isOpen: function(){ return radarActive; },
    close: function(){ if(radarActive) hideRadar(); }
  };
})();
