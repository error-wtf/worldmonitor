(function(){
  'use strict';
  var ID='wmWeatherMapmode';
  if (window[ID]) return; window[ID]=1;
  var iframe=null, active=false, btn=null, modeWired=false, lastActive=null;

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
    iframe.id='wm-weather-embed';
    // operator 30.10.2026: OpenWeather interactive weather map als weitere karte.
    iframe.src='https://weather-maps.openweathermap.org/';
    iframe.title='Interactive Weather Map (OpenWeather)';
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
    olink.href='https://weather-maps.openweathermap.org/';
    olink.target='_blank'; olink.rel='noopener noreferrer';
    olink.textContent='\u2197 Original: weather-maps.openweathermap.org';
    olink.title='Original-Seite in neuem Tab \u00f6ffnen';
    olink.style.cssText='position:absolute;right:10px;top:'+(headerH(ms)+6)+'px;z-index:61;background:rgba(13,17,23,.85);color:#38bdf8;border:1px solid #23304a;border-radius:6px;padding:4px 10px;font:12px/1.4 system-ui,sans-serif;text-decoration:none;';
    ms.appendChild(olink);
    return olink;
  }

  function hide(){
    active=false;
    if(iframe) iframe.style.display='none';
    if(olink) olink.style.display='none';
    if(btn) btn.classList.remove('active');
    if(lastActive && lastActive.isConnected){ lastActive.classList.add('active'); }
  }

  function closeSiblings(){
    var apis=['wmRadarMapmodeAPI','wmSdrMapmodeAPI','wmSporenMapmodeAPI','wmMafiaMapmodeAPI','wmOcindexMapmodeAPI','wmCortegeMapmodeAPI'];
    for (var k=0;k<apis.length;k++){
      var a=window[apis[k]];
      if (a && a.isOpen && a.isOpen() && a.close) a.close();
    }
  }

  function show(){
    closeSiblings();
    var f=ensureIframe(); if(!f) return;
    var t=toggleEl();
    var cur=t ? t.querySelector('.map-dim-btn[data-mode].active') : null;
    if(cur){ lastActive=cur; cur.classList.remove('active'); }
    active=true;
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
        if(!active) return;
        e.stopPropagation();
        e.preventDefault();
        hide();
      }, true);
    });
    // Schwester-modi schliessen uns automatisch (capture, vor deren handlern).
    t.addEventListener('click', function(e){
      if(!active) return;
      var b=e.target && e.target.closest ? e.target.closest('.map-dim-btn') : null;
      if(b && b!==btn) hide();
    }, true);
  }

  function ensureButton(){
    var ms=mapSection(), t=toggleEl();
    if(!ms || !t) return false;
    if(!(btn && btn.isConnected)){
      btn=t.querySelector('[data-weatherbtn]');
      if(!btn){
        btn=document.createElement('button');
        btn.className='map-dim-btn';
        btn.setAttribute('data-weatherbtn','1');
        btn.type='button';
        btn.textContent='WETTER';
        btn.title='OpenWeather interactive weather map (temperatur, wolken, regen) als weitere Weltkarte';
        btn.addEventListener('click', function(e){
          e.preventDefault();
          if(active) hide(); else show();
        });
        t.appendChild(btn);
      }
    }
    wireModes();
    if(active){
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

  window.wmWeatherMapmodeAPI = {
    isOpen: function(){ return active; },
    close: function(){ if(active) hide(); }
  };
})();
