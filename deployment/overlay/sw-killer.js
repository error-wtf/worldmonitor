/* SW-Killer v1: entfernt ALTE service workers + caches einmalig, damit jeder
   Browser den aktuellen Build lädt. Läuft vor allem anderen (non-defer, head). */
(function () {
  if (!('serviceWorker' in navigator)) return;
  var KEY = 'wm-sw-purge-v16';
  var done = false;
  try { done = sessionStorage.getItem(KEY) === '1'; } catch (e) {}

  function purge() {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      var kill = regs.filter(function (r) {
        var u = (r.active && r.active.scriptURL) || '';
        // nur ALTE sw killer-region: unser aktueller sw heisst sw.js — wir
        // deregistrieren alles und lassen die seite beim nächsten load neu
        // registrieren; caches werden komplett gelehrt:
        return true;
      });
      return Promise.all(kill.map(function (r) { return r.unregister(); }));
    }).then(function () {
      if (window.caches && caches.keys) {
        return caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        });
      }
    }).then(function () {
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
      // EIN automatischer reload nachdem aufgeräumt wurde (nur einmal pro session):
      if (!done) location.reload();
    }).catch(function () {});
  }

  if (!done) { purge(); }
})();
