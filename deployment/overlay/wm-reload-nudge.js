/* wm-reload-nudge: zeigt sanftes banner wenn ein neuer build verfügbar ist */
(function(){
  if (window.__wmReloadNudge) return; window.__wmReloadNudge = true;
  var VERSION = '20261007-36';
  var KEY = 'wm-build-seen';
  try {
    var seen = localStorage.getItem(KEY);
    if (seen === VERSION) return;
    localStorage.setItem(KEY, VERSION);
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:999999;background:#0d1a16;color:#7fe0c3;border:1px solid #2a5c4c;padding:10px 18px;border-radius:8px;font:13px monospace;box-shadow:0 4px 20px rgba(0,0,0,.5);display:flex;gap:12px;align-items:center';
    d.innerHTML = 'Neuer Build bereit <button style="background:#1e4d3e;color:#d7fff0;border:1px solid #3a7c64;border-radius:6px;padding:4px 12px;cursor:pointer;font:13px monospace">Neu laden</button>';
    d.querySelector('button').onclick = function(){ location.reload(); };
    document.body.appendChild(d);
  } catch(_){}
})();
