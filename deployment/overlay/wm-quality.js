/* wm-quality v2: echte 512px-Kacheln und bis zu 3x Renderaufloesung.
   Auto folgt dem Geraet, Hoch=2x, Ultra=3x, Mittel=1x, Niedrig=0.7x. */
(function () {
  if (window.__wmQualityUI) return;
  window.__wmQualityUI = true;
  var KEY = 'wm-quality';
  var LEVELS = [['auto', 'Auto'], ['ultra', 'Ultra'], ['high', 'Hoch'], ['medium', 'Mittel'], ['low', 'Niedrig']];
  var VALUES = { auto: null, ultra: 3.0, high: 2.0, medium: 1.0, low: 0.7 };

  function current() {
    try {
      var value = localStorage.getItem(KEY) || 'auto';
      return Object.prototype.hasOwnProperty.call(VALUES, value) ? value : 'auto';
    } catch (e) { return 'auto'; }
  }
  function apply(level) {
    try { localStorage.setItem(KEY, level); } catch (e) {}
    window.__wmQuality = VALUES[level];
    btn.title = 'Kartenqualität: ' + LABEL[level] + ' — Auto: geräteabhängig; Ultra: 3×; Hoch: 2×; Mittel: 1×; Niedrig: 0,7×. Klick wechselt.';
    btn.textContent = '⚙ Q: ' + LABEL[level];
    window.dispatchEvent(new Event('resize'));
  }
  var LABEL = { auto: 'Auto', ultra: 'Ultra', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'wm-quality-btn';
  btn.hidden = true; // map-extras mounts the same button inside the live map.
  btn.style.cssText = 'position:relative;background:#10161d;border:1px solid #2c4557;' +
    'color:#9fd6ff;border-radius:8px;padding:5px 10px;font:700 11px monospace;cursor:pointer;';
  btn.addEventListener('click', function () {
    var cur = current();
    var idx = 0;
    for (var i = 0; i < LEVELS.length; i++) { if (LEVELS[i][0] === cur) { idx = i; break; } }
    apply(LEVELS[(idx + 1) % LEVELS.length][0]);
  });
  document.body.appendChild(btn);
  apply(current());
  document.documentElement.setAttribute('data-wm-quality-version', '20261019-controls-1');
})();
