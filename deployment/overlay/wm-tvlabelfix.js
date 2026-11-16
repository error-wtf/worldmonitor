/* wm-tvlabelfix.js v1 (2026-10-10)
 * TV-Tab Sender-Label-Fix: Der Kanal-Button 'the-guardian' trug historisch das falsche
 * Label "The Guardian", spielt aber TRT World (The Guardian betreibt keinen 24/7-TV-
 * Livestream). Diese Migration loescht EINMALIG das stale displayNameOverride aus dem
 * localStorage; danach zeigt der Button den korrekten Builtin-Namen "TRT World".
 * Alle anderen Nutzer-Renames bleiben unberuehrt. Idempotent via Flag-Key. */
(function () {
  try {
    var FLAG = 'exit-guardian-label-fix-v1';
    if (localStorage.getItem(FLAG) === 'true') return;
    var KEY = 'worldmonitor-live-channels';
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.displayNameOverrides && data.displayNameOverrides['the-guardian']) {
        delete data.displayNameOverrides['the-guardian'];
        localStorage.setItem(KEY, JSON.stringify(data));
      }
    }
    localStorage.setItem(FLAG, 'true');
  } catch (e) { /* never break the panel */ }
})();
