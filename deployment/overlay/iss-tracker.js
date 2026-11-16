/* OSM-Overlay v12-Erweiterung: ISS-Live-Tracker (keyless open-notify) als
   nativer maplibre-Shader-marker + eigenes Panel-kapitel. Zieht Position alle
   5s, trail der letzten 30 positionen. */
(function(){
  if (window.__wmIssTracker) return;
  window.__wmIssTracker = true;
  var trail = [];
  var el = null;
  function ensureDom(map){
    if (el) return;
    el = document.createElement('div');
    el.style.cssText = 'position:absolute;z-index:65;width:22px;height:22px;margin:-11px 0 0 -11px;' +
      'border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#8fb8c9 60%,#2c5364);' +
      'box-shadow:0 0 10px rgba(143,184,201,.9);border:1px solid rgba(255,255,255,.8);cursor:pointer;';
    el.title = 'ISS — International Space Station';
    // label:
    var lb = document.createElement('div');
    lb.textContent = 'ISS';
    lb.style.cssText = 'position:absolute;top:22px;left:50%;transform:translateX(-50%);font:9px/1 monospace;color:#cfeee8;text-shadow:0 0 3px #000;';
    el.appendChild(lb);
    (map.getContainer() || document.body).appendChild(el);
  }
  function project(map, lat, lng){
    try { var p = map.project([lng, lat]); return p; } catch(e) { return null; }
  }
  function tick(map){
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d || d.latitude === undefined) return;
        var lat = d.latitude, lng = d.longitude;
        trail.push([lng, lat]);
        if (trail.length > 40) trail.shift();
        ensureDom(map);
        var p = project(map, lat, lng);
        if (p) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.display = ''; }
        else el.style.display = 'none';
        el.title = 'ISS — lat ' + lat.toFixed(2) + ' / lon ' + lng.toFixed(2) + ' — ' + Math.round(d.velocity || 0) + ' km/h, ' + Math.round(d.altitude || 0) + ' km (wheretheiss.at)';
      }).catch(function(){});
  }
  function start(map){
    if (!map || map.__wmIssBound) return;
    map.__wmIssBound = true;
    tick(map);
    setInterval(function(){ tick(map); }, 5000);
    map.on('move', function(){
      // bei bewegung neu projizieren (letzte bekannte pos):
      if (!el || !trail.length) return;
      var last = trail[trail.length - 1];
      var p = project(map, last[1], last[0]);
      if (p) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
    });
  }
  // wartet auf die map-bridge:
  var iv = setInterval(function(){
    var host = window.__wmMapHost;
    if (host && host.mapInstance) { clearInterval(iv); start(host.mapInstance); }
  }, 2000);
})();
