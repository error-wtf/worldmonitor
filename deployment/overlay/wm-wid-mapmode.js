(function(){
  'use strict';
  var ID='wmWidMapmode';
  if (window[ID]) return; window[ID]=1;
  var iframe=null, widActive=false, btn=null, modeWired=false, lastActive=null;

  // WID.world Weltkarte (https://wid.world/world/) als 10. Karten-Modus
  // (11.11.2026, operator). Upstream sendet X-Frame-Options: DENY + CSP
  // frame-ancestors ohne unsere Origin — daher nginx-Proxy
  // /worldmapp/wid/ -> https://wid.world/ (XFO/CSP werden serverseitig
  // gestripped; Sub-Resources laufen absolut direkt). Zentrale
  // Exklusivitaet: wm-mapmode-guard.js.
  var IFRAME_SRC='/worldmapp/wid/world/';
  var ORIGIN_HREF='https://wid.world/world/';

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
    iframe.id='wm-wid-embed';
    iframe.src=IFRAME_SRC;
    iframe.title='WID World Map';
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
    olink.href=ORIGIN_HREF;
    olink.target='_blank'; olink.rel='noopener noreferrer';
    olink.textContent='\u2197 WID-Quelle: wid.world';
    olink.title='WID.world Weltkarte — Original-Page in neuem Tab';
    olink.style.cssText='position:absolute;right:10px;top:'+(headerH(ms)+6)+'px;z-index:2147483000;background:rgba(13,17,23,.85);color:#38bdf8;border:1px solid #23304a;border-radius:6px;padding:4px 10px;font:12px/1.4 system-ui,sans-serif;text-decoration:none;';
    ms.appendChild(olink);
    return olink;
  }

  function hideWid(){
    widActive=false;
    if(iframe) iframe.style.display='none';
    if(olink) olink.style.display='none';
    if(btn) btn.classList.remove('active');
    if(lastActive && lastActive.isConnected){ lastActive.classList.add('active'); }
  }

  function showWid(){
    // Exklusivitaet: wm-mapmode-guard.js (capture-click auf [data-widbtn])
    // schliesst VOR diesem Handler alle bestehenden Overlay-iframes.
    var f=ensureIframe(); if(!f) return;
    var t=toggleEl();
    var cur=t ? t.querySelector('.map-dim-btn[data-mode].active') : null;
    if(cur){ lastActive=cur; cur.classList.remove('active'); }
    widActive=true;
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
        if(!widActive) return;
        // WID schliessen und Bundle-Handler komplett blockieren:
        // der Kartenmodus hat sich nicht geaendert, das Bundle wuerde sonst
        // einen fiesen 2D/3D-Remap ausfuehren und das Highlight zerschiessen.
        e.stopPropagation();
        e.preventDefault();
        hideWid();
      }, true);
    });
  }

  function ensureButton(){
    var ms=mapSection(), t=toggleEl();
    if(!ms || !t) return false;
    if(!(btn && btn.isConnected)){
      btn=t.querySelector('[data-widbtn]');
      if(!btn){
        btn=document.createElement('button');
        btn.className='map-dim-btn';
        btn.setAttribute('data-widbtn','1');
        btn.type='button';
        btn.textContent='WID';
        btn.title='WID.world Weltkarte — Laender-Uebersicht (wid.world/world)';
        btn.addEventListener('click', function(e){
          e.preventDefault();
          if(widActive) hideWid(); else showWid();
        });
        t.appendChild(btn);
      }
    }
    wireModes();
    if(widActive){
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

  // Oeffentliche API fuer wm-mapmode-guard.js + Schwester-Overlays.
  window.wmWidMapmodeAPI = {
    isOpen: function(){ return widActive; },
    close: function(){ if(widActive) hideWid(); }
  };
})();
