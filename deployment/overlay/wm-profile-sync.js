/* wm-profile-sync.js v1 (30.10., operator) — einmaliger Profil-Import:
 * Bei ?wmimport=1 die profile-migration.json (Vivaldi-Stand: Panels, Tabs,
 * Sortierung, gepinnte Webcams) in die localStorage schreiben, Marker setzen,
 * Parameter entfernen und einmal neu laden. Ohne Parameter/Marker: passiv. */
(function () {
  if (window.__wmProfileSync) return;
  window.__wmProfileSync = true;
  var FLAG = 'wm-profile-import-done';
  try {
    var q = location.search;
    if (q.indexOf('wmimport=1') < 0) return;
    if (localStorage.getItem(FLAG) === '1') { history.replaceState(null, '', location.pathname); return; }
    fetch('/worldmapp/data/profile-migration.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      Object.keys(d || {}).forEach(function (k) {
        try { localStorage.setItem(k, d[k]); } catch (e) {}
      });
      localStorage.setItem(FLAG, '1');
      history.replaceState(null, '', location.pathname + location.hash);
      location.reload();
    }).catch(function (e) { console.warn('[profile-sync]', e); });
  } catch (e) { console.warn('[profile-sync]', e); }
})();
