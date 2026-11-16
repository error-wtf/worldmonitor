/* meldet die tatsächlich geladenen chunk-versionen an den server (diagnose). */
(function () {
  function report() {
    try {
      var chunks = performance.getEntriesByType("resource")
        .filter(function (e) { return /assets\/(main|GlobeMap|DeckGLMap|basemap)-/.test(e.name); })
        .map(function (e) { return e.name.split("/").pop(); });
      var sw = navigator.serviceWorker && navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : "none";
      fetch("/worldmapp/wm-version-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: Date.now(), chunks: chunks, sw: sw, ua: navigator.userAgent.slice(0, 80) })
      }).catch(function () {});
    } catch (e) {}
  }
  setTimeout(report, 12000);
  setTimeout(report, 25000);
})();
