// Same-origin transport for allowlisted WebSDR receiver pages + their subresources.
// Same pattern as tv-proxy.mjs: never an open proxy. Receivers are allowlisted from
// the websdr.org receiver index (PA3FWM's /~~websdrlistk feed); ONLY host:port pairs
// listed in RECEIVERS are ever contacted.
//
// Routes (wired in exit-api.mjs):
//   /sdr/list                 -> JSON receiver metadata (for the frontend UI)
//   /sdr/r/<id>/p<port>/<..>  -> page + assets; <base href> injected in HTML so every
//                                relative URL on the receiver page loops back here.
//   /sdr/fetch?id=<id>&u=<abs>-> absolute self-references rewritten to this form.
//   /~~<anything>             -> receiver's root-level control/data paths (labels,
//                                misc, EventSource) relayed via cookie `sdr_rcv`.
//   WebSocket upgrade on /~~* -> relayed raw (net.connect pipe) to the same receiver;
//                                this is what carries AUDIO (/~~stream) and the
//                                WATERFALL binary feed.
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';  // BINGSI-Fix 11.10.26: TLS-zwingende Receiver
import zlib from 'node:zlib';

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const SDR_COOKIE = 'sdr_rcv';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json', '.txt': 'text/plain', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm',
  '.php': 'text/html; charset=utf-8', '.cgi': 'text/html; charset=utf-8',
};

// BINGSI-Fix 13.10.26f (sdr-r9a-ru): manche Upstreams liefern .js-Dateien als
// text/plain (+ X-Content-Type-Options: nosniff) — Chromium fuehrt die dann
// NICHT aus (base.js crasht: bandinfo is not defined). Der Proxy kennt den
// angefragten Pfad: endet er auf .js/.mjs und der Upstream behauptet text/plain,
// ist das ein Betreiber-Fehler -> korrigiere zu text/javascript.
function fixMime(ctype, reqPath) {
  if (/text\/plain/i.test(ctype || '') && /\.(js|mjs)(\?|$)/i.test(reqPath || '')) {
    return 'text/javascript; charset=utf-8';
  }
  return ctype;
}

function mimeFor(pathname) {
  const i = pathname.lastIndexOf('.');
  if (i < 0) return 'text/html; charset=utf-8'; // receiver pages are extensionless routes
  return MIME[pathname.slice(i).toLowerCase()] || 'application/octet-stream';
}

export function receiverFor(id) {
  return Object.hasOwn(RECEIVERS ?? {}, id ?? '') ? RECEIVERS[id] : null;
}

// Parse the route /sdr/r/<id>/p<port>/<rest> -> { id, port, rest } or null.
// BINGSI-Fix 13.10.26: der Proxy injiziert einen ABSOLUTEN base href — der Browser
// schickt Subressourcen-Pfade daher als /worldmapp/exit-api/sdr/r/... teils DIREKT an
// 46124. Bekanntes Prefix hier strippen, sonst 404 trotz intakter Route.
export function parseSdrRoute(pathname) {
  let p = String(pathname || '');
  if (p.startsWith('/worldmapp/exit-api/')) p = p.slice('/worldmapp/exit-api'.length);
  const m = /^\/sdr\/r\/([a-zA-Z0-9.-]+)\/p(\d+)(\/.*)?$/.exec(p);
  if (m) {
    const recv = receiverFor(m[1]);
    if (!recv) return null;
    const port = Number(m[2]);
    if (port !== (recv.port || 80)) return null; // port segment must match the allowlist
    return { id: m[1], recv, port, rest: m[3] || '/' };
  }
  // BINGSI 2026-11-01: ID-Schema <host>-p<port> OHNE separates /p<port>/-Segment
  // (z.B. /sdr/r/websdr-ewi-utwente-nl-p8901/~~stream?v=11) — classic-WebSDR-Clients
  // bauen WS-/Asset-Pfade direkt an die Receiver-ID; ohne diesen Zweig 404/502.
  const m2 = /^\/sdr\/r\/([a-zA-Z0-9.-]+-p\d+)(\/.*)?$/.exec(p);
  if (m2) {
    const recv = receiverFor(m2[1]);
    if (!recv) return null;
    return { id: m2[1], recv, port: recv.port || 80, rest: m2[2] || '/' };
  }
  return null;
}

// Validate an absolute upstream URL against receiver <id>'s single allowlisted origin.
export function allowedUpstream(id, raw) {
  const r = receiverFor(id);
  if (!r) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' || u.username || u.password) return null;
    if (u.hostname.toLowerCase() !== r.host.toLowerCase()) return null;
    if ((u.port ? Number(u.port) : 80) !== (r.port || 80)) return null;
    if (!u.pathname.startsWith('/')) return null;
    return u;
  } catch { return null; }
}

function fetchUpstream(targetUrl, cb, redirectsLeft = 3) {
  // BINGSI-Fix 12.10.26: ungueltige Targets ("TypeError: Invalid URL") duerfen den
  // Prozess NICHT killen (12:29-Crash, restart counter 7) -> 502 statt Crash.
  let u;
  try { u = new URL(targetUrl); } catch { cb(502, 'text/plain', Buffer.from('bad upstream url')); return; }
  const mod = u.protocol === 'https:' ? https : http;
  const req = mod.request({
    hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + u.search, method: 'GET',
    headers: { 'User-Agent': BROWSER_UA, 'Accept': '*/*', 'Referer': `${u.protocol}//${u.host}/` },
    timeout: 20000,
    rejectUnauthorized: false,  // BINGSI 15.11.26: Dritt-Empfaenger oft mit falschem/self-signed Cert (dl-local.de hat CN=db0ue.de) — WS-Relay (Zeile ~506/529) toleriert das bereits; Seiten-Fetch zieht gleich
  }, (res) => {
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
      res.resume();
      let next;
      try { next = new URL(res.headers.location, u).toString(); } catch { res.resume(); cb(502, 'text/plain', Buffer.from('bad redirect')); return; }
      // redirect must stay on the same receiver host
      let nextHost = '';
      try { nextHost = new URL(next).hostname.toLowerCase(); } catch { res.resume(); cb(502, 'text/plain', Buffer.from('bad redirect')); return; }
      if (nextHost !== u.hostname.toLowerCase()) { res.resume(); cb(502, 'text/plain', Buffer.from('upstream redirect leaves allowlist')); return; }
      fetchUpstream(next, cb, redirectsLeft - 1);
      return;
    }
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      let body = Buffer.concat(chunks);
      // BINGSI 02.11.26: manche Origins (KiwiSDR) markieren gzip, liefern aber plain
      // -> Dekodier-Fehler = Rohdaten durchreichen statt 502 (Proxy sendet kein Content-Encoding).
      if (res.headers['content-encoding'] === 'gzip') {
        try { body = zlib.gunzipSync(body); }
        catch (e1) {
          // BINGSI 02.11.26 (KiwiSDR-Mixstream): gzip nicht dekodierbar -> roh MIT
          // Content-Encoding: gzip durchreichen; der Browser dekomprimiert selbst.
          console.error('[sdr-proxy] gzip raw passthrough (', e1.message, '):', u.pathname);
          cb(res.statusCode || 502, res.headers['content-type'] || mimeFor(u.pathname), body, 'gzip');
          return;
        }
      } else if (res.headers['content-encoding'] === 'deflate') {
        try { body = zlib.inflateSync(body); }
        catch { try { body = zlib.inflateRawSync(body); } catch (e) { console.error('[sdr-proxy] deflate raw passthrough:', u.pathname); cb(res.statusCode || 502, res.headers['content-type'] || mimeFor(u.pathname), body, 'deflate'); return; } }
      } else if (res.headers['content-encoding'] === 'br') {
        try { body = zlib.brotliDecompressSync(body); }
        catch (e) { console.error('[sdr-proxy] brotli raw passthrough:', u.pathname); cb(res.statusCode || 502, res.headers['content-type'] || mimeFor(u.pathname), body, 'br'); return; }
      }
      cb(res.statusCode || 502, res.headers['content-type'] || mimeFor(u.pathname), body);
    });
  });
  req.on('timeout', () => req.destroy(new Error('upstream timeout')));
  req.on('error', () => cb(502, 'text/plain', Buffer.from('upstream unreachable')));
  req.end();
}

function sdrHeaders(id, cache) {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': cache,
    'Set-Cookie': `${SDR_COOKIE}=${id}; Path=/; SameSite=Lax; Max-Age=86400`,
  };
}

// Inject <base href> so ALL relative URLs (assets, subpages, form actions) on the
// receiver page route back through /sdr/r/<id>/p<port>/. Rewrite absolute references
// to the receiver's own http:// origin into /sdr/fetch?id=..&u=.. form.
function rewriteHtml(body, id, recv) {
  let s = body.toString('utf8');
  const routeBase = `/worldmapp/exit-api/sdr/r/${id}/p${recv.port || 80}/`;
  const upOrigin = `${recv.proto || 'http'}://${recv.host.toLowerCase()}${recv.port && recv.port !== 80 ? ':' + recv.port : ''}`;
  const esc = upOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Also rewrite https:// and bare-host absolute refs of the same receiver so a
  // click can never escape to a direct (often firewalled) upstream origin.
  const fetchFor = (path) => `/worldmapp/exit-api/sdr/fetch?id=${encodeURIComponent(id)}&u=${encodeURIComponent(upOrigin + path)}`;
  const hostEsc = recv.host.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const httpsOrigin = `https://${recv.host.toLowerCase()}${recv.port && recv.port !== 443 ? ':' + recv.port : ''}`;
  const httpsEsc = httpsOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const orgEsc of [esc, httpsEsc, hostEsc]) {
    s = s.replace(new RegExp('(href|src|action)=["\']' + orgEsc + '(/[^"\']*)["\']', 'gi'),
      (m2, a, p) => `${a}="${fetchFor(p)}"`);
    // 5) Cross-receiver links (sister receivers on other ports of the same host, e.g.
    //    Maasbree :8901 -> :8902/:8905/:8909, NA5B -> :8902/:8905) map onto that
    //    receiver's OWN proxy route when it is allowlisted — a click navigates INSIDE
    //    the frame instead of escaping to a firewalled direct origin.
    const rxIdFor = (host, port) => {
      const h = String(host).toLowerCase();
      for (const [rid, r] of Object.entries(RECEIVERS)) {
        if (r.host.toLowerCase() === h && (r.port || 80) === port) return rid;
      }
      return null;
    };
    s = s.replace(new RegExp('href=["\'](?:' + orgEsc + '):?(\\d*)(\\/[^"\']*)?["\']', 'gi'), (m2, portStr, path) => {
      const port = Number(portStr || (recv.port || 80));
      const targetId = rxIdFor(recv.host, port);
      if (!targetId) return m2; // not allowlisted -> leave as-is (allowedUpstream blocks abuse anyway)
      return `href="/worldmapp/exit-api/sdr/r/${targetId}/p${port}${path || '/'}"`;
    });
    // 4) Absolute upstream-origin URLs ANYWHERE (inline JS strings like
    //    location.replace("http://host:port/")) become RELATIVE paths: relative URLs
    //    resolve against <base href> = our proxy route, so even a self.location
    //    redirect stays inside the frame route instead of hitting the (often
    //    firewalled) direct origin.
    s = s.replace(new RegExp('(["\'])' + orgEsc + '(/[^"\']*)\\1', 'g'),
      (_m2, q, p) => q + p.replace(/^\//, '') + q);
  }
  // 5) Cross-receiver links (sister receivers on other ports of the same host, e.g.
  //    Maasbree :8901 -> :8902/:8905/:8909, NA5B -> :8902/:8905): a click would
  //    navigate the iframe to the DIRECT origin (often firewalled -> err_timed_out).
  //    Map every http(s)://<recv-host>:<port> link onto that receiver's OWN proxy
  //    route when it is allowlisted; leave anything else untouched.
  const rxIdFor = (host, port) => {
    const h = String(host).toLowerCase();
    for (const [rid, r] of Object.entries(RECEIVERS)) {
      if (r.host.toLowerCase() === h && (r.port || 80) === port) return rid;
    }
    return null;
  };
  const hostPat = String(recv.host).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp('href=["\\\'](?:https?:\\/\\/)?(?:' + hostPat + ')(?::(\\d+))?(\\/[^"\\\']*)?["\\\']', 'gi'), (m2, portStr, path) => {
    const port = Number(portStr) || (recv.port || 80);
    const targetId = rxIdFor(recv.host, port);
    if (!targetId) return m2; // not allowlisted -> leave as-is
    return `href="/worldmapp/exit-api/sdr/r/${targetId}/p${port}${path || '/'}"`;
  });
  // BINGSI-Fix 13.10.26h (IS0GRB/KGSTV): src="http://host/KG-STV/x.jpg" OHNE Port
  // matcht keine der obigen Regeln (die verlangen :<port> oder href=). Auf einer
  // https-Page wird das zu Mixed Content -> Browser upgraded auf https://host:443
  // -> haengt -> document bleibt interactive -> bodyonload fehlt -> keine WS ->
  // ?-Signalwerte. Mappe portlose same-host absolute URLs auf fetchFor().
  s = s.replace(new RegExp('(src|href|action)=[\'\"]?https?://' + hostEsc + '(/[^\'\" >]*)', 'gi'),
    (m2, a, p2) => `${a}="${fetchFor(p2)}"`);

  // BINGSI-Fix 12.10.26 (PhantomSDR/Vite): root-absolute Asset-Referenzen (/assets/...,
  // /favicon.ico, /vite.svg, ...) loesen gegen den Dokument-Origin auf, NICHT gegen
  // <base href> - sie landen bei exit-matrix.net/assets/... (404). Mappe sie auf die
  // Proxy-Route, sodass relative Vite-Chunk-Imports ("/./App-...") mit auflösen.
  s = s.replace(/((?:src|href|action)\s*=\s*)(["\'])\/(?!\/|worldmapp\/exit-api)([^"\']*)\2/gi,
    (_m2, a, q, p) => `${a}${q}${routeBase}${p}${q}`);
  // BINGSI-Fix 13.10.26g (cb0mtl): http://-CDN-Scripts in einer https-Page =
  // Mixed Content -> Chromium blockt VOR dem Netzwerk-Stack ($ undefined,
  // bodyonload crasht). Upgrade bekannter grosser CDNs auf https (die
  // unterstuetzen alle https; andere externe Hosts bleiben unangetastet).
  s = s.replace(/(src|href)\s*=\s*(["\'])http:\/\/(ajax\.googleapis\.com|fonts\.googleapis\.com|code\.jquery\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|maxcdn\.bootstrapcdn\.com)\//gi,
    (_m, a, q, host) => `${a}=${q}https://${host}/`);

  const baseTag = `<base href="${routeBase}">`;
  // Strip receiver frame-busters (e.g. Twente: if(top!=self) top.location.replace(...))
  // — they would kick the iframe out to the direct upstream origin, which is often
  // firewalled (err_timed_out). Inside our same-origin route this check is hostile.
  s = s.replace(/<script>[^<]*top\s*!=\s*self[^<]*<\/script>\s*/gi, '');
  s = s.replace(/if\s*\(\s*top\s*!=\s*self\s*\)\s*top\.location\.replace\([^)]*\)\s*;?/gi, '');
  // Apply the JS rewrites to INLINE script blocks too (external .js files already go
  // through rewriteIfJs). Covers inline frame-buster variants, inline ws:// builds and
  // inline root-absolute /~~ fetches.
  s = s.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_m, attrs, code) => `<script${attrs}>${rewriteJs(code)}</script>`);
  // BINGSI-Fix 12.10.26 (Audio-Knack-Resync): Receiver wie Twente erstellen ihren
  // ScriptProcessor mit 4096 Samples (85,3 ms Callback-Block). WS-Stream-Frames kommen
  // aber im Median nur alle ~106-125 ms -> periodisch Ring-Underflow -> E>=3 ->
  // Hard-Resync-Sturm (Fa bis 75/s) -> hoerbares Knacken/"Audio geht nicht".
  // Wir halbieren die Blockgroesse auf 2048 (42,7 ms < Median-Gap): Underflows brechen
  // ein, Fa faellt ca. Faktor 4 (gemessen 75.9 -> 19.0 pro 30 s im Test-Chromium).
  // Das Inline-Script muss VOR allen Receiver-Scripts laufen: deshalb direkt nach <head>.
  const spWrap = `<script>(function(){if(!window.AudioContext||!AudioContext.prototype.createScriptProcessor)return;var o=AudioContext.prototype.createScriptProcessor;AudioContext.prototype.createScriptProcessor=function(bs,ic,oc){if(bs===4096){bs=2048}return o.call(this,bs,ic,oc)}})();</script>`;
  if (/<head[^>]*>/i.test(s)) s = s.replace(/<head[^>]*>/i, (m2) => m2 + baseTag + spWrap);
  else s = baseTag + spWrap + s;
  return s;
}

// Rewrite receiver JavaScript: their audio/waterfall WebSocket endpoints are built as
//   new WebSocket("ws://" + window.location.host + "/~~stream")
// Inside our HTTPS page this breaks twice: ws:// is mixed content (browser blocks it)
// and /~~stream at origin root is not routed — our relay lives under
// /worldmapp/exit-api/~~stream. Point the constructed URLs at wss:// + our prefix.
function rewriteJs(body) {
  let s = body.toString('utf8');
  // 1) Receiver JS opens XHR/EventSource/WebSocket on ROOT-absolute /~~ control paths
  //    (e.g. var url="/~~labels?..."; new EventSource("/~~miscs")). <base href> does
  //    not apply to root-absolute URLs, so rewrite every "/~~..." string literal onto
  //    our relay prefix (HTTP/WS relay handles them via the sdr_rcv cookie).
  s = s.replace(/(["'])\/~~([a-z])/g, (_m, q, c) => `${q}/worldmapp/exit-api/~~${c}`);
  // 2) Audio/waterfall WebSocket is built as "ws://"+location.host+<path>: on our HTTPS
  //    page ws:// is mixed content and gets blocked — flip the scheme to wss:// (same
  //    host serves TLS via nginx; the path is already prefixed by step 1).
  s = s.replace(/(['"])ws:\/\/\1(?=\s*\+\s*(window\.)?location\.host)/g, (_m, q) => `${q}wss://${q}`);
  // 3) Neutralize ANY top/parent navigation inside receiver code (frame-busters,
  //    "if (top!=self) ..." variants, breakouts). Because our proxy serves the frame
  //    same-origin, sandbox CANNOT block top-navigation (same-origin frames may always
  //    navigate top per HTML spec). So we rewrite the navigation targets themselves:
  //    top.location / parent.location become self.location — an "escape" just reloads
  //    the receiver INSIDE the frame, it can never leave.
  s = s.replace(/\b(?:top|parent)\s*\.\s*(?:document\.)?location\b/gi, 'self.location');
  return s;
}

function rewriteIfJs(status, ctype, body, id, recv) {
  // BINGSI-Fix 13.10.26d (PhantomSDR/Vite): CSS-Chunks referenzieren Assets als
  // url(/assets/...) — root-absolute, landen sonst auf exit-matrix.net (404,
  // z.B. background-CCypv3cy.jpg). Mappe url()-Referenzen auf die Proxy-Route.
  if (status === 200 && /text\/css/i.test(ctype || '') && id && recv) {
    const routeBase = `/worldmapp/exit-api/sdr/r/${id}/p${recv.port || 80}/`;
    let css = body.toString('utf8');
    css = css.replace(/url\(\s*(["']?)\/(?!\/|worldmapp\/exit-api)([^)"']*)\1\s*\)/g,
      (_m, q, p) => `url(${q}${routeBase}${p}${q})`);
    return css;
  }
  if (status === 200 && /javascript|ecmascript/i.test(ctype || '')) {
    if (id && recv) {
      // receiver-aware JS pass: strip upstream-absolute origins (same rule 4 as in
      // rewriteHtml) so even JS-built redirects resolve via <base href> and stay
      // inside the proxy route.
      const routeBase = `/worldmapp/exit-api/sdr/r/${id}/p${recv.port || 80}/`;
      const upOrigin = `${recv.proto || 'http'}://${recv.host.toLowerCase()}${recv.port && recv.port !== 80 ? ':' + recv.port : ''}`;
      const httpsOrigin = `https://${recv.host.toLowerCase()}${recv.port && recv.port !== 443 ? ':' + recv.port : ''}`;
      let s = body.toString('utf8');
      for (const org of [upOrigin, httpsOrigin]) {
        s = s.split(org + '/').join(routeBase).split(org).join(routeBase.replace(/\/$/, ''));
      }
      // BINGSI-Fix 12.10.26 (PhantomSDR): SSE/XHR/WS-Endpunkte als Root-Pfade
      // ("/waterfall", "/audio?v=", "/events", "/chat", "/users", "/mobile",
      // "/socket.io"). Root-absolute URLs ignorieren <base href> -> sie laufen auf
      // exit-matrix.net-Root (404). Mappe die String-Literale auf die Proxy-Route;
      // xu()/URL-Builds haengen nur Query-Parameter an, der Pfad bleibt korrekt.
      s = s.replace(/(["\'])\/(waterfall|audio|events|chat|users|mobile|socket\.io|site_information\.json|wf-message\.json|api\/dxspots)(\?[^"\']*)?\1/g,
        (_m2, q, p, qs) => `${q}${routeBase}${p}${qs || ''}${q}`);
      // BINGSI-Fix 13.10.26e (NovaSDR/Vite): root-absolute fetch()/EventSource()-
      // Literale, z.B. fetch("/server-info.json"), fetch("/api/receivers"),
      // fetch("/NovaSDR-presets.json"). <base href> greift nicht -> exit-matrix.net-
      // Root (404). Mappe die Pfadliterale auf die Proxy-Route.
      s = s.replace(/((?:fetch|EventSource)\(\s*)(["'])\/(?!\/|worldmapp\/exit-api)([^"')]+)\2/g,
        (_m3, fn, q, p) => `${fn}${q}${routeBase}${p}${q}`);
      // BINGSI-Fix 13.10.26c: gleiche Endpunkte in TEMPLATE-LITERALN (Backticks),
      // z.B. jo(){return`/api/dxspots?limit=30${...}`}.
      s = s.replace(/`\/(waterfall|audio|events|chat|users|mobile|socket\.io|site_information\.json|wf-message\.json|api\/dxspots)((\?|&)[^`]*)?`/g,
        (_m2, p, qs) => '`' + routeBase + p + (qs || '') + '`');
      // BINGSI-Fix 13.10.26 (Bug C, PhantomSDR/Vite): Vite dynamic imports bauen
      // "/"+t -> import("/assets/App-*.js") im JS. Root-absolute Pfade ignorieren
      // <base href> -> exit-matrix.net/assets/... = 404, App bleibt bei
      // "WebSDR is loading ... connecting to receiver" haengen. Mappe /assets/-
      // String-Literale auf die Proxy-Route (gleiche Logik wie HTML-Regel in
      // rewriteHtml, hier fuer JS-gebildete URLs).
      s = s.replace(/(["\'])\/(assets\/[^"\']*)\1/g,
        (_m2, q, p) => `${q}${routeBase}${p}${q}`);
      // BINGSI-Fix 13.10.26b: Vite-Preload-Helper baut URLs als h=function(t){return"/"+t}
      // (base "/"). Auch das muss auf die Proxy-Route zeigen. Exakt dieses Muster
      // ersetzen (nur in receiver-aware JS, generisches "/"+x bleibt unangetastet).
      s = s.replace(/(\w)=function\((\w)\)\{return"\/"\+\2\}/g,
        (_m2, v, pn) => `${v}=function(${pn}){return"${routeBase}"+${pn}}`);
      s = rewriteJs(s);
      return Buffer.from(s, 'utf8');
    }
    return Buffer.from(rewriteJs(body), 'utf8');
  }
  return body;
}

// ---- Route: /sdr/r/<id>/p<port>/<rest> --------------------------------------
export function sdrRouteProxy(req, res, match) {
  const { id, recv, port, rest } = match;
  const qi = req.url.indexOf('?');
  const target = `${recv.proto || 'http'}://${recv.host}:${port}${rest}${qi >= 0 ? req.url.slice(qi) : ''}`;
  fetchUpstream(target, (status, ctype, body, rawEnc) => {
    if (!rawEnc && status === 200 && /text\/html/i.test(ctype)) {
      res.writeHead(200, sdrHeaders(id, 'public, max-age=30'));
      res.end(Buffer.from(rewriteHtml(body, id, recv), 'utf8'));
      return;
    }
    const hdrs = { 'Content-Type': fixMime(ctype, req.url), 'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store' };
    if (rawEnc) hdrs['Content-Encoding'] = rawEnc;
    res.writeHead(status, hdrs);
    res.end(rawEnc ? body : rewriteIfJs(status, fixMime(ctype, req.url), body, id, recv));
  });
}

// ---- Route: /sdr/fetch?id=<id>&u=<abs-url> ----------------------------------
export function sdrProxy(req, res, params) {
  const id = params.get('id') || '';
  const raw = params.get('u') || '';
  const recv = receiverFor(id);
  if (!recv) { res.writeHead(400, { 'Content-Type': 'text/plain' }); res.end('unknown receiver'); return; }
  const target = allowedUpstream(id, raw);
  if (!target) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('upstream not allowlisted'); return; }
  fetchUpstream(target.toString(), (status, ctype, body, rawEnc) => {
    if (!rawEnc && status === 200 && /text\/html/i.test(ctype)) {
      res.writeHead(200, sdrHeaders(id, 'public, max-age=30'));
      res.end(Buffer.from(rewriteHtml(body, id, recv), 'utf8'));
      return;
    }
    const hdrs = { 'Content-Type': fixMime(ctype, target.pathname), 'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store' };
    if (rawEnc) hdrs['Content-Encoding'] = rawEnc;
    res.writeHead(status, hdrs);
    res.end(rawEnc ? body : rewriteIfJs(status, fixMime(ctype, target.pathname), body));
  });
}

// ---- Route: /~~<path> — receiver's root-level data/control paths -------------
// The receiver JS hardcodes these at the ORIGIN ROOT (e.g. GET /~~labels,
// EventSource /~~miscs, WebSocket /~~stream). nginx hands them to us verbatim;
// the active receiver comes from the sdr_rcv cookie set when a page was opened.
function cookieReceiver(req) {
  const m = new RegExp(`(?:^|;\\s*)${SDR_COOKIE}=([a-zA-Z0-9.-]+)`).exec(req.headers.cookie || '');
  if (!m) return null;
  let id = m[1];
  let r = receiverFor(id);
  if (!r) {
    const m2 = /^(.*-p\d+)-p\d+$/.exec(id);
    if (m2) r = receiverFor(m2[1]);
  }
  return r || null;
}

export function sdrRelayHttp(req, res) {
  const recv = cookieReceiver(req);
  if (!recv) { res.writeHead(409, { 'Content-Type': 'text/plain' }); res.end('no active WebSDR receiver (open a receiver page first)'); return; }
  const target = `${recv.proto || 'http'}://${recv.host}:${recv.port || 80}${req.url}`;
  // SSE (EventSource /~~miscs and friends) must stream: pipe raw, no buffering.
  if (req.url.startsWith('/~~miscs') || (req.headers.accept || '').includes('text/event-stream')) {
    const u = new URL(target);
    const upReq = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/event-stream', 'Referer': `http://${u.host}/` },
      timeout: 0,
    }, (upRes) => {
      res.writeHead(upRes.statusCode || 502, {
        'Content-Type': upRes.headers['content-type'] || 'text/event-stream',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      });
      upRes.pipe(res);
      upRes.on('error', () => { try { res.end(); } catch {} });
      res.on('close', () => upReq.destroy());
    });
    upReq.on('timeout', () => upReq.destroy(new Error('upstream timeout')));
    upReq.on('error', () => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain' }); } try { res.end('upstream unreachable'); } catch {} });
    upReq.end();
    return;
  }
  fetchUpstream(target, (status, ctype, body) => {
    res.writeHead(status, { 'Content-Type': ctype, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  });
}

// WebSocket upgrade relay: raw TCP pipe to receiver after rewriting Host/Origin.
// This carries /~~stream (audio) and the waterfall binary feed.
export function sdrRelayWs(req, socket, head) {
  // BINGSI-Fix 12.10.26 (PhantomSDR): WS kann auch als Proxy-Route kommen
  // (/sdr/r/<id>/p<port>/waterfall|audio|...). Dann Receiver aus der Route nehmen
  // und den Upgrade-Pfad auf den Upstream-Rest kuerzen; Cookie nicht noetig.
  let restPath = req.url;
  let recv = null;
  const rm = /^\/worldmapp\/exit-api\/sdr\/r\/([a-zA-Z0-9.-]+)\/p(\d+)(\/.*)$/.exec(req.url || '');
  if (rm) {
    recv = receiverFor(rm[1]);
    if (recv && Number(rm[2]) !== (recv.port || 80)) recv = null;
    if (recv) restPath = rm[3];
  }
  // BINGSI 2026-11-01: ID-Schema <host>-p<port> OHNE /p<port>/-Segment — hier MUSS
  // restPath auf den Upstream-Rest gekuerzt werden (sonst schickt das Relay
  // /sdr/r/<id>/~~stream an den Empfaenger-Server, der das nicht kennt -> Verbindungsabbruch).
  const rm2 = /^\/worldmapp\/exit-api\/sdr\/r\/([a-zA-Z0-9.-]+-p\d+)(\/.*)$/.exec(req.url || '');
  if (rm2) {
    recv = receiverFor(rm2[1]);
    if (recv) restPath = rm2[2];
  }
  if (!recv) recv = cookieReceiver(req);
  console.log(JSON.stringify({dbg: "sdr-relay", u: req.url, recv: recv ? recv.host + ":" + (recv.port || 80) : null, rest: String(restPath).slice(0, 60)}));
  if (recv && restPath.startsWith('/worldmapp/exit-api/')) {
    // BINGSI 2026-11-01: Cookie-Routing-Fall — Prefix strippen, sonst bekommt der
    // Empfaenger-Server /worldmapp/exit-api/~~stream statt /~~stream und bricht ab.
    restPath = restPath.slice('/worldmapp/exit-api'.length);
  }
  if (!recv) { socket.destroy(); return; }
  const hostHeader = `${recv.host}:${recv.port || 80}`;
  const routeReq = Object.assign({}, req, { url: restPath });
  req = routeReq;
  const lines = [`GET ${req.url} HTTP/1.1`];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const key = req.rawHeaders[i];
    let val = req.rawHeaders[i + 1];
    if (/^host$/i.test(key)) val = hostHeader;
    else if (/^origin$/i.test(key)) val = `http://${hostHeader}`;
    else if (/^connection$/i.test(key)) val = 'Upgrade';
    lines.push(`${key}: ${val}`);
  }
  if (!lines.slice(1).some((l) => /^origin:/i.test(l))) lines.push(`Origin: http://${hostHeader}`);
  if (!lines.slice(1).some((l) => /^user-agent:/i.test(l))) lines.push('User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0');
  const rawReq = lines.join(String.fromCharCode(13,10)) + String.fromCharCode(13,10) + String.fromCharCode(13,10);
  // BINGSI-Fix 11.10.26: manche Receiver zwingen HTTPS (301/308 auf https://). Upgrade per
  // Plaintext versuchen; bei Redirect einmalig per tls.connect auf Port 443 wiederholen.
  // BINGSI-Fix 12.10.26: startRelay schrieb den Upgrade-Request ein ZWEITES Mal in den
  // Upstream (Plaintext-Pfad: Request wurde schon bei connect geschrieben) ->
  // Protokollverletzung, Receiver brach direkt nach 101 ab -> kein Audio.
  // Jetzt: kein zweites write; only pipe. Der 101-Header vom Plaintext-Pfad bleibt
  // gepuffert und wird via unshift an den Client durchgereicht.
  const startRelay = (up) => {
    socket.pipe(up);
    up.pipe(socket);
  };
  const tryPlaintext = () => {
    const probe = net.connect(recv.port || 80, recv.host, () => {
      probe.write(rawReq);
      let buf = Buffer.alloc(0);
      probe.once('data', function onFirst(chunk) {
        buf = Buffer.concat([buf, chunk]);
        const m = /^HTTP\/1\.1 (\d{3})[^\r\n]*/.exec(buf.toString('latin1'));
        const code = m ? parseInt(m[1], 10) : 0;
        if ((code === 301 || code === 308) && /location:\s*https:\/\//i.test(buf.toString('latin1'))) {
          probe.removeAllListeners('close'); // BINGSI-Fix 11.10.26: sonst feuert kill() und toetet den Switch
          probe.destroy();
          const tlsUp = tls.connect({ host: recv.host, servername: recv.host, port: 443, rejectUnauthorized: false }, () => {
            tlsUp.on('close', kill);
            // BINGSI-Fix 13.10.26 (srr-76): nach 308->https Upgrade muss der rawReq auf dem
            // TLS-Socket ERNEUT geschrieben werden — der Plaintext-Probe, an den er ging,
            // wurde zerstoert. Ohne re-write sieht der Upstream NIE den Upgrade-Request
            // -> 101 ja, aber 0 Frames Audio/Wasserfall (exakt das srr-76-Symptom).
            tlsUp.write(rawReq);
            startRelay(tlsUp);
          });
          tlsUp.on('error', () => { try { socket.destroy(); } catch {} });
          return;
        }
        // Normalfall: Upgrade hat geklappt (101) oder Fehlerseite — Puffer nicht verlieren.
        probe.removeListener('data', onFirst);
        startRelay(probe);
        if (buf.length) probe.unshift(buf);
      });
    });
    return probe;
  };
  // BINGSI 02.11.26: https-Receivers (proto: https, z.B. :443-Extras) MUESSEN per
  // TLS verbunden werden — Plaintext an :443 quittiert der TLS-Server mit 400.
  const tryTls = () => {
    const tlsUp = tls.connect({ host: recv.host, servername: recv.host, port: recv.port || 443, rejectUnauthorized: false }, () => {
      tlsUp.on('close', kill);
      tlsUp.write(rawReq);
      startRelay(tlsUp);
    });
    tlsUp.on('error', () => { try { socket.destroy(); } catch {} });
    return tlsUp;
  };
  const upstream = (recv.proto === 'https') ? tryTls() : tryPlaintext();
  const kill = () => { try { socket.destroy(); } catch {} try { upstream.destroy(); } catch {} };
  upstream.on('error', kill);
  socket.on('error', kill);
  upstream.on('close', kill);
  socket.on('close', kill);
}

// ---- receiver allowlist — generated by /opt/worldmonitor/scripts/generate_sdr_config.py (websdr.org feed, ALL receivers) ----
const RECEIVERS = {
  'websdr-ewi-utwente-nl-p8901': { host: 'websdr.ewi.utwente.nl', port: 8901 },
  'na5b-com-p8901': { host: 'NA5B.com', port: 8901 },
  'sdr-websdrmaasbree-nl-p8901': { host: 'sdr.websdrmaasbree.nl', port: 8901 },
  'websdr1-sdrutah-org-p8901': { host: 'websdr1.sdrutah.org', port: 8901 },
  'websdr1-kfsdr-com-p8901': { host: 'websdr1.kfsdr.com', port: 8901 },
  'eshail-batc-org-uk-p8901': { host: 'eshail.batc.org.uk', port: 8901 },
  'websdr-k3fef-com-p8901': { host: 'websdr.k3fef.com', port: 8901 },
  '80m-radiorubka-org-p8903': { host: '80m.radiorubka.org', port: 8903 },
  'ham-websdrbordeaux-fr-p8000': { host: 'ham.websdrbordeaux.fr', port: 8000 },
  'il38-ddns-net-p8901': { host: 'il38.ddns.net', port: 8901 },
  'websdr-srr-76-ru-p8091': { host: 'websdr.srr-76.ru', port: 8091 },
  'sdr-r9a-ru-p80': { host: 'sdr.r9a.ru', port: 80 },
  'us2-pitunnel-com-p54605': { host: 'us2.pitunnel.com', port: 54605 },
  'appr-org-br-p8911': { host: 'appr.org.br', port: 8911 },
  'es4o-ee-p8901': { host: 'es4o.ee', port: 8901 },
  '85-173-189-23-p8901': { host: '85.173.189.23', port: 8901 },
  'websdr-so8oo-net-p8091': { host: 'websdr.so8oo.net', port: 8091 },
  'websdr-is0grb-it-p8901': { host: 'websdr.is0grb.it', port: 8901 },
  '3-radiorubka-org-p80': { host: '3.radiorubka.org', port: 80 },
  'sdr-shbrg-nl-p9002': { host: 'sdr.shbrg.nl', port: 9002 },
  'sdrgeorgia-sytes-net-p8902': { host: 'sdrgeorgia.sytes.net', port: 8902 },
  'ra0sms-websdr-ru-p8902': { host: 'ra0sms-websdr.ru', port: 8902 },
  'sv3gcb-ddns-net-p8905': { host: 'sv3gcb.ddns.net', port: 8905 },
  'websdr-rn4wa-ru-p80': { host: 'websdr.rn4wa.ru', port: 80 },
  'dk0te-inf-dhbw-ravensburg-de-p8901': { host: 'dk0te.inf.dhbw-ravensburg.de', port: 8901 },
  'radio-sdr-dyndns-org-p8901': { host: 'radio-sdr.dyndns.org', port: 8901 },
  'sdr-22dx-ru-p8901': { host: 'sdr.22dx.ru', port: 8901 },
  'sdr-websdrmaasbree-nl-p8902': { host: 'sdr.websdrmaasbree.nl', port: 8902 },
  'salamisdr22-ddns-net-p8906': { host: 'salamisdr22.ddns.net', port: 8906 },
  'websdr-heppen-be-p8901': { host: 'websdr.heppen.be', port: 8901 },
  'websdr-afunk-hs-esslingen-de-p80': { host: 'websdr.afunk.hs-esslingen.de', port: 80 },
  'py7nmcaruarupe-ddns-net-p81': { host: 'py7nmcaruarupe.ddns.net', port: 81 },
  'lu5dnpwebsdr-sytes-net-p8901': { host: 'lu5dnpwebsdr.sytes.net', port: 8901 },
  'websdr-sk4ko-com-p8901': { host: 'websdr.sk4ko.com', port: 8901 },
  'websdr-printf-cc-p8901': { host: 'websdr.printf.cc', port: 8901 },
  'websdr-camras-nl-p8901': { host: 'websdr.camras.nl', port: 8901 },
  'kj6eo-com-p8901': { host: 'kj6eo.com', port: 8901 },
  'sdr-kf5jmd-com-p8901': { host: 'sdr.kf5jmd.com', port: 8901 },
  'sv1btlham-no-ip-org-p8901': { host: 'sv1btlham.no-ip.org', port: 8901 },
  'sdr-homeip-net-p8901': { host: 'sdr.homeip.net', port: 8901 },
  'g0xbuwebsdr-ddns-net-p8901': { host: 'g0xbuwebsdr.ddns.net', port: 8901 },
  'websdr-78dx-ru-p8901': { host: 'websdr.78dx.ru', port: 8901 },
  'slc2meters-sdrutah-org-p8901': { host: 'slc2meters.sdrutah.org', port: 8901 },
  'sdr-websdrmaasbree-nl-p8905': { host: 'sdr.websdrmaasbree.nl', port: 8905 },
  '142-44-211-133-p8091': { host: '142.44.211.133', port: 8091 },
  '9a1cra-ddns-net-p8902': { host: '9a1cra.ddns.net', port: 8902 },
  'roma4-ddns-net-p80': { host: 'roma4.ddns.net', port: 80 },
  'websdr-yo3ggx-ro-p8765': { host: 'websdr.yo3ggx.ro', port: 8765 },
  'lu3dj-ddns-net-p8080': { host: 'lu3dj.ddns.net', port: 8080 },
  'websdr-k1ra-us-p8901': { host: 'websdr.k1ra.us', port: 8901 },
  'vu24dx-ddns-net-p8901': { host: 'vu24dx.ddns.net', port: 8901 },
  '99-37-194-166-p9002': { host: '99.37.194.166', port: 9002 },
  'hackgreensdr-org-p8901': { host: 'hackgreensdr.org', port: 8901 },
  'lu6flz-no-ip-org-p7999': { host: 'lu6flz.no-ip.org', port: 7999 },
  '185-199-176-46-p8901': { host: '185.199.176.46', port: 8901 },
  'orlandia-sdr-net-br-p9001': { host: 'orlandia.sdr.net.br', port: 9001 },
  'pu3alk-com-br-p9001': { host: 'pu3alk.com.br', port: 9001 },
  'hackgreensdr-org-p8902': { host: 'hackgreensdr.org', port: 8902 },
  'stream-sdr48-ru-p8901': { host: 'stream.sdr48.ru', port: 8901 },
  '9a7aof-ddns-net-p8905': { host: '9a7aof.ddns.net', port: 8905 },
  'freebands-websdrbordeaux-fr-p9000': { host: 'freebands.websdrbordeaux.fr', port: 9000 },
  'sebagolakesdr-us-p8901': { host: 'sebagolakesdr.us', port: 8901 },
  'vu2cpl-ddns-net-p8901': { host: 'vu2cpl.ddns.net', port: 8901 },
  'vhf-goonhilly-batc-org-uk-p8902': { host: 'vhf-goonhilly.batc.org.uk', port: 8902 },
  'vik-for-more-biz-p8071': { host: 'vik.for-more.biz', port: 8071 },
  'sdrhc3-ddns-net-p8901': { host: 'sdrhc3.ddns.net', port: 8901 },
  'websdr-republicaoa6-com-p8091': { host: 'websdr.republicaoa6.com', port: 8091 },
  'na5b-com-p8905': { host: 'na5b.com', port: 8905 },
  'phantomsdr-no-ip-org-p8900': { host: 'phantomsdr.no-ip.org', port: 8900 },
  'sv2hnh-no-ip-org-p8901': { host: 'sv2hnh.no-ip.org', port: 8901 },
  'sdr-ge-p8901': { host: 'sdr.ge', port: 8901 },
  'websdr-imorozov-info-p8901': { host: 'websdr.imorozov.info', port: 8901 },
  'sv3yy1-no-ip-org-p8901': { host: 'sv3yy1.no-ip.org', port: 8901 },
  'sdr-websdrmaasbree-nl-p8909': { host: 'sdr.websdrmaasbree.nl', port: 8909 },
  '44-31-241-13-p8901': { host: '44.31.241.13', port: 8901 },
  '2360-ddns-me-p8901': { host: '2360.ddns.me', port: 8901 },
  'hamradio-sv2yj-live-p8901': { host: 'hamradio.sv2yj.live', port: 8901 },
  'hamradio-sv2yj-live-p9002': { host: 'hamradio.sv2yj.live', port: 9002 },
  'pu5asf-ddns-net-p8901': { host: 'pu5asf.ddns.net', port: 8901 },
  'sy9cgz-ddns-net-p8901': { host: 'sy9cgz.ddns.net', port: 8901 },
  'home-k1htv-us-p8901': { host: 'home.k1htv.us', port: 8901 },
  'websdr-electrosystem-ru-p8081': { host: 'websdr.electrosystem.ru', port: 8081 },
  'n8mdp-ddns-net-p8904': { host: 'n8mdp.ddns.net', port: 8904 },
  'link-radiopaulafm-com-p20002': { host: 'link.radiopaulafm.com', port: 20002 },
  'sv2czf-ddns-me-p8901': { host: 'sv2czf.ddns.me', port: 8901 },
  'websdr-is0grb-it-p8902': { host: 'websdr.is0grb.it', port: 8902 },
  'websdr-viewdns-net-p8073': { host: 'websdr.viewdns.net', port: 8073 },
  'websdr-is0grb-it-p8903': { host: 'websdr.is0grb.it', port: 8903 },
  'jimjackii-no-ip-org-p8091': { host: 'jimjackii.no-ip.org', port: 8091 },
  'remoteradio-changeip-org-p8073': { host: 'remoteradio.changeip.org', port: 8073 },
  'g0xbuwebsdr-ddns-net-p8902': { host: 'g0xbuwebsdr.ddns.net', port: 8902 },
  'rem-esp-spdns-org-p8901': { host: 'rem-esp.spdns.org', port: 8901 },
  'sv4bfb-ddns-net-p80': { host: 'sv4bfb.ddns.net', port: 80 },
  'garypaucha-ddns-net-p8901': { host: 'garypaucha.ddns.net', port: 8901 },
  'itajai-sdr-net-br-p8901': { host: 'itajai.sdr.net.br', port: 8901 },
  'wessex-hopto-org-p8902': { host: 'wessex.hopto.org', port: 8902 },
  'sdr-codedv-com-p8091': { host: 'sdr.codedv.com', port: 8091 },
  'varadero1000-ddns-net-p8901': { host: 'varadero1000.ddns.net', port: 8901 },
  '217-155-0-218-p80': { host: '217.155.0.218', port: 80 },
  'sdr-osthessenfunk-de-p80': { host: 'sdr.osthessenfunk.de', port: 80 },
  'sv1cmg-no-ip-org-p80': { host: 'sv1cmg.no-ip.org', port: 80 },
  'cb0mtl-selfhost-eu-p8080': { host: 'cb0mtl.selfhost.eu', port: 8080 },
  'sv2srx-hopto-org-p8901': { host: 'sv2srx.hopto.org', port: 8901 },
  'rnd-websdr-pro-p80': { host: 'rnd.websdr.pro', port: 80 },
  'roma2sdr-ddns-net-p80': { host: 'roma2sdr.ddns.net', port: 80 },
  'sv3gcb-ddns-net-p8906': { host: 'sv3gcb.ddns.net', port: 8906 },
  'lu1jgu-ddns-net-p8080': { host: 'lu1jgu.ddns.net', port: 8080 },
  'na5b-com-p8902': { host: 'NA5B.com', port: 8902 },
  'sdrlouvetel-com-br-p80': { host: 'sdrlouvetel.com.br', port: 80 },
  'websdr-pa0nvy-nl-p8901': { host: 'websdr.pa0nvy.nl', port: 8901 },
  '44-31-241-12-p8901': { host: '44.31.241.12', port: 8901 },
  'websdr-ce3waq-cl-p8091': { host: 'websdr.ce3waq.cl', port: 8091 },
  'makrisv2amk-ddns-net-p9001': { host: 'makrisv2amk.ddns.net', port: 9001 },
  'alfredomarcondes-sdr-net-br-p37001': { host: 'alfredomarcondes.sdr.net.br', port: 37001 },
  'sdr-websdrmaasbree-nl-p8908': { host: 'sdr.websdrmaasbree.nl', port: 8908 },
  'rbzsdr-ddns-net-p9000': { host: 'rbzsdr.ddns.net', port: 9000 },
  'paraibuna-websdr-com-br-p8901': { host: 'paraibuna.websdr.com.br', port: 8901 },
  'ub3aww-ru-p8888': { host: 'ub3aww.ru', port: 8888 },
  'websdr-lz2kac-org-p8901': { host: 'websdr.lz2kac.org', port: 8901 },
  '185-199-176-46-p8092': { host: '185.199.176.46', port: 8092 },
  'websdr2-kfsdr-com-p8902': { host: 'websdr2.kfsdr.com', port: 8902 },
  '84-25-81-186-p8080': { host: '84.25.81.186', port: 8080 },
  'sv0xbs-ddns-net-p8901': { host: 'sv0xbs.ddns.net', port: 8901 },
  'itajai-sdr-net-br-p8083': { host: 'itajai.sdr.net.br', port: 8083 },
  'stafford-160m-net-p8082': { host: 'stafford.160m.net', port: 8082 },
  'sdr20-ddns-net-p9000': { host: 'sdr20.ddns.net', port: 9000 },
  '186-4-161-166-p8091': { host: '186.4.161.166', port: 8091 },
  'websdr-ddns-com-br-p8080': { host: 'websdr.ddns.com.br', port: 8080 },
  'kb5avy-hopto-org-p8906': { host: 'kb5avy.hopto.org', port: 8906 },
  'websdr-dynv6-net-p8901': { host: 'websdr.dynv6.net', port: 8901 },
  'websdr-housing-salleurl-edu-p8901': { host: 'websdr.housing.salleurl.edu', port: 8901 },
  '89-242-7-86-p80': { host: '89.242.7.86', port: 80 },
  '2600-8807-50c0-b-3b0-5b9d-f87f-bc1-p8903': { host: '[2600:8807:50c0:b:3b0:5b9d:f87f:bc1]', port: 8903 },
  '91-201-190-4-p8901': { host: '91.201.190.4', port: 8901 },
  'sixmetersct-ddns-net-p20553': { host: 'SIXMETERSCT.DDNS.NET', port: 20553 },
  'stafford-160m-net-p8081': { host: 'stafford.160m.net', port: 8081 },
  'crapoca-websdr-com-br-p8901': { host: 'crapoca.websdr.com.br', port: 8901 },
  'pu2swx-ddns-net-p8901': { host: 'pu2swx.ddns.net', port: 8901 },
  'phermosa-dyndns-org-p8901': { host: 'phermosa.dyndns.org', port: 8901 },
  'websdr-pi2ehv-ampr-org-p8901': { host: 'websdr.pi2ehv.ampr.org', port: 8901 },
  'kiwisdr1-sdrutah-org-p8073': { host: 'kiwisdr1.sdrutah.org', port: 8073, proto: 'http' },
  'kiwisdr4-sdrutah-org-p8076': { host: 'kiwisdr4.sdrutah.org', port: 8076, proto: 'http' },
  'kiwisdr6-sdrutah-org-p8078': { host: 'kiwisdr6.sdrutah.org', port: 8078, proto: 'http' },
  'eshail-batc-org-uk-p443': { host: 'eshail.batc.org.uk', port: 443, proto: 'https' },
  'sdr-exit-matrix-local': { host: 'sdr.exit-matrix.net', port: 80, proto: 'http' },
  '90-187-72-177-p8073': { host: '90.187.72.177', port: 8073, proto: 'http' },
  'dk0te-dhbw-ravensburg-de-p8073': { host: 'dk0te.dhbw-ravensburg.de', port: 8073, proto: 'http' },
  'www-dxcluster-world-p8074': { host: 'www.dxcluster.world', port: 8074, proto: 'http' },
  'cb0mtl-selfhost-eu-p80': { host: 'cb0mtl.selfhost.eu', port: 80, proto: 'http' },
  'sdr-packetradio-at-p8901': { host: 'sdr.packetradio.at', port: 8901, proto: 'http' },
  'db0hal-dyndns-org-p8074': { host: 'db0hal.dyndns.org', port: 8074, proto: 'http' },
  '201-217-131-106-p7900': { host: '201.217.131.106', port: 7900, proto: 'http' },
  'aubjpla-myddns-me-p8073': { host: 'aubjpla.myddns.me', port: 8073, proto: 'http' },
  'websdr-dk0od-de-p8073': { host: 'websdr.dk0od.de', port: 8073, proto: 'http' },
  'saopaulo-websdr-com-br-p8901': { host: 'saopaulo.websdr.com.br', port: 8901, proto: 'http' },
  '1-websdr-jestok-com-p443': { host: '1.websdr.jestok.com', port: 443, proto: 'https' },
  'websdr-fvzr-ch-p8901': { host: 'websdr.fvzr.ch', port: 8901, proto: 'http' },
  'openwebrx-bgl4twrsd8ih9jyd-myfritz-net-p8074': { host: 'openwebrx.bgl4twrsd8ih9jyd.myfritz.net', port: 8074, proto: 'http' },
  'sdrpt-ddns-net-p8073': { host: 'sdrpt.ddns.net', port: 8073, proto: 'http' },
  'sdr-alaro-ovh-p443': { host: 'sdr.alaro.ovh', port: 443, proto: 'https' },
  'hgdyn-spdns-org-p8099': { host: 'hgdyn.spdns.org', port: 8099, proto: 'http' },
  'rx-kd0bqs-com-p443': { host: 'rx.kd0bqs.com', port: 443, proto: 'https' },
  'websdr-tkrahn-net-p8073': { host: 'websdr.tkrahn.net', port: 8073, proto: 'http' },
  'tecnorama-homeip-net-p8095': { host: 'tecnorama.homeip.net', port: 8095, proto: 'http' },
  'oh6kk-dy-fi-p8073': { host: 'oh6kk.dy.fi', port: 8073, proto: 'http' },
  'yo9hzn-net-communication-ro-p8073': { host: 'yo9hzn.net-communication.ro', port: 8073, proto: 'http' },
  'sdr2-justjakob-de-p80': { host: 'sdr2.justjakob.de', port: 80, proto: 'http' },
  'yd3rdw-cloudns-asia-p8073': { host: 'yd3rdw.cloudns.asia', port: 8073, proto: 'http' },
  'ta2om-mywire-org-p8073': { host: 'ta2om.mywire.org', port: 8073, proto: 'http' },
  'sdr-gudynas-lt-p2052': { host: 'sdr.gudynas.lt', port: 2052, proto: 'http' },
  'f4hux-freeboxos-fr-p18073': { host: 'f4hux.freeboxos.fr', port: 18073, proto: 'http' },
  '5-154-110-148-p8073': { host: '5.154.110.148', port: 8073, proto: 'http' },
  'radarmaarssen-nl-p8073': { host: 'radarmaarssen.nl', port: 8073, proto: 'http' },
  'sdr-merle-io-p443': { host: 'sdr.merle.io', port: 443, proto: 'https' },
  'sdr-n7rix-com-p443': { host: 'sdr.n7rix.com', port: 443, proto: 'https' },
  '90-187-0-205-p8073': { host: '90.187.0.205', port: 8073, proto: 'http' },
  '5-154-110-148-p8074': { host: '5.154.110.148', port: 8074, proto: 'http' },
  'sdr-hahnenkamm-de-p8073': { host: 'sdr-hahnenkamm.de', port: 8073, proto: 'http' },
  'ea3rkeuhf-sytes-net-p80': { host: 'ea3rkeuhf.sytes.net', port: 80, proto: 'http' },
  'remoteradio-myddns-me-p8077': { host: 'remoteradio.myddns.me', port: 8077, proto: 'http' },
  'on0llv-on6ll-be-p8073': { host: 'on0llv.on6ll.be', port: 8073, proto: 'http' },
  '44-31-61-202-p80': { host: '44.31.61.202', port: 80, proto: 'http' },
  'noradio86-ddns-net-p8073': { host: 'noradio86.ddns.net', port: 8073, proto: 'http' },
  'sdrvalencia-com-p80': { host: 'sdrvalencia.com', port: 80, proto: 'http' },
  'g0xbuwebsdr-ddns-net-p8073': { host: 'g0xbuwebsdr.ddns.net', port: 8073, proto: 'http' },
  'sdr-sp6mn-pl-p443': { host: 'sdr.sp6mn.pl', port: 443, proto: 'https' },
  'sdr-oe3xsa-at-p8073': { host: 'sdr.oe3xsa.at', port: 8073, proto: 'http' },
  'hb9fbs-dyndns-org-p8073': { host: 'hb9fbs.dyndns.org', port: 8073, proto: 'http' },
  'websdr-pi6ehv-ampr-org-p8073': { host: 'websdr.pi6ehv.ampr.org', port: 8073, proto: 'http' },
  'altstetten-ddns-net-p8074': { host: 'altstetten.ddns.net', port: 8074, proto: 'http' },
  'sv3smg-ddns-net-p8073': { host: 'sv3smg.ddns.net', port: 8073, proto: 'http' },
  '3-websdr-jestok-com-p443': { host: '3.websdr.jestok.com', port: 443, proto: 'https' },
  'hb9re-ddns-net-p8080': { host: 'hb9re.ddns.net', port: 8080, proto: 'http' },
  '9a4am-ddns-net-p8073': { host: '9a4am.ddns.net', port: 8073, proto: 'http' },
  'prairiesky-ddns-net-p8073': { host: 'prairiesky.ddns.net', port: 8073, proto: 'http' },
  'sdr-l0c4l-net-p8073': { host: 'sdr.l0c4l.net', port: 8073, proto: 'http' },
  'f1riv-freeboxos-fr-p8073': { host: 'f1riv.freeboxos.fr', port: 8073, proto: 'http' },
  'rx-oh6ah-fi-p8073': { host: 'rx.oh6ah.fi', port: 8073, proto: 'http' },
  'sdr-22dx-ru-p8073': { host: 'sdr.22dx.ru', port: 8073, proto: 'http' },
  'hgdyn-servebeer-com-p51789': { host: 'hgdyn.servebeer.com', port: 51789, proto: 'http' },
  'rtl1-it9ioe-radio-p50060': { host: 'rtl1.it9ioe.radio', port: 50060, proto: 'http' },
  'lx0bce-rl-lu-p8073': { host: 'lx0bce.rl.lu', port: 8073, proto: 'http' },
  '80-96-123-202-p8073': { host: '80.96.123.202', port: 8073, proto: 'http' },
  'watou-on4ipr-be-p8073': { host: 'watou.on4ipr.be', port: 8073, proto: 'http' },
  'websdr-golem-linux-it-p80': { host: 'websdr.golem.linux.it', port: 80, proto: 'http' },
  'kwrx-oberehueb-duckdns-org-p443': { host: 'kwrx.oberehueb.duckdns.org', port: 443, proto: 'https' },
  'dobrich-ham-eu-p8073': { host: 'dobrich-ham.eu', port: 8073, proto: 'http' },
  'nanteswebrx-mooo-com-p8585': { host: 'nanteswebrx.mooo.com', port: 8585, proto: 'http' },
  '62-197-214-59-p8074': { host: '62.197.214.59', port: 8074, proto: 'http' },
  'websdr-pi1dft-ampr-org-p443': { host: 'websdr.pi1dft.ampr.org', port: 443, proto: 'https' },
  'sdrbcn-duckdns-org-p8080': { host: 'sdrbcn.duckdns.org', port: 8080, proto: 'http' },
  'sdrsevilla-hopto-org-p8073': { host: 'sdrsevilla.hopto.org', port: 8073, proto: 'http' },
  'websdr-ok1pkr-radio-p443': { host: 'websdr.ok1pkr.radio', port: 443, proto: 'https' },
  'websdr-cbfunk-live-de-p80': { host: 'websdr.cbfunk-live.de', port: 80, proto: 'http' },
  'websdr-dynv6-net-p8900': { host: 'websdr.dynv6.net', port: 8900, proto: 'http' },
  'ds0dnx-de-p8073': { host: 'ds0dnx.de', port: 8073, proto: 'http' },
  'tsc-radio-ddns-net-p80': { host: 'tsc-radio.ddns.net', port: 80, proto: 'http' },
  'iz1mlt-ddns-net-p8074': { host: 'iz1mlt.ddns.net', port: 8074, proto: 'http' },
  'dnx833-ramoip-de-p8013': { host: 'dnx833.ramoip.de', port: 8013, proto: 'http' },
  'dh9fg-dynv6-net-p5000': { host: 'dh9fg.dynv6.net', port: 5000, proto: 'http' },
  'f1uqr-freeboxos-fr-p8073': { host: 'f1uqr.freeboxos.fr', port: 8073, proto: 'http' },
  'owrx-x26-de-p443': { host: 'owrx.x26.de', port: 443, proto: 'https' },
  'webrx-sk3gk-se-p8074': { host: 'webrx.sk3gk.se', port: 8074, proto: 'http' },
  'openwebrx-kiwihasenberg-ch-p443': { host: 'openwebrx.kiwihasenberg.ch', port: 443, proto: 'https' },
  'pe1byw-ddns-net-p58073': { host: 'pe1byw.ddns.net', port: 58073, proto: 'http' },
  'sdr-dyne-family-p443': { host: 'sdr.dyne.family', port: 443, proto: 'https' },
  'sdr-gz-duckdns-org-p8073': { host: 'sdr-gz.duckdns.org', port: 8073, proto: 'http' },
  'sdr-atvin-nl-p8073': { host: 'sdr.atvin.nl', port: 8073, proto: 'http' },
  'sdr-dzindzik-com-p443': { host: 'sdr.dzindzik.com', port: 443, proto: 'https' },
  'home-gettoweb-de-p8073': { host: 'home.gettoweb.de', port: 8073, proto: 'http' },
  'ppp-ok2it-com-p8073': { host: 'ppp.ok2it.com', port: 8073, proto: 'http' },
  '2-235-247-14-p4480': { host: '2.235.247.14', port: 4480, proto: 'http' },
  'francedmr-ddns-net-p8073': { host: 'francedmr.ddns.net', port: 8073, proto: 'http' },
  'sdrvu-remotemsi-com-p443': { host: 'sdrvu.remotemsi.com', port: 443, proto: 'https' },
  'www-m0cko-duckdns-org-p80': { host: 'www.m0cko.duckdns.org', port: 80, proto: 'http' },
  'han-kg7oow-com-p8074': { host: 'han.kg7oow.com', port: 8074, proto: 'http' },
  'sdr-frank-ipoac-nl-p443': { host: 'sdr-frank.ipoac.nl', port: 443, proto: 'https' },
  'www-avia-city-p80': { host: 'www.avia.city', port: 80, proto: 'http' },
  'redbaron92-goip-de-p80': { host: 'redbaron92.goip.de', port: 80, proto: 'http' },
  'raveheart-goip-de-p8073': { host: 'raveheart.goip.de', port: 8073, proto: 'http' },
  'hym-sytes-net-p8073': { host: 'hym.sytes.net', port: 8073, proto: 'http' },
  'openwebrx-soundsofatc-com-p80': { host: 'openwebrx.soundsofatc.com', port: 80, proto: 'http' },
  'sdrwifi-gaialabs-ch-p443': { host: 'sdrwifi.gaialabs.ch', port: 443, proto: 'https' },
  'or6rdgnhaty0yo55-myfritz-net-p88': { host: 'or6rdgnhaty0yo55.myfritz.net', port: 88, proto: 'http' },
  'weathergeek-synology-me-p8073': { host: 'weathergeek.synology.me', port: 8073, proto: 'http' },
  'sdr-lifoy-it-p8073': { host: 'sdr.lifoy.it', port: 8073, proto: 'http' },
  'ea8djfsdr-ddns-net-p8090': { host: 'ea8djfsdr.ddns.net', port: 8090, proto: 'http' },
  'freedmr-ddnss-de-p8073': { host: 'freedmr.ddnss.de', port: 8073, proto: 'http' },
  'websdrkatwijk-testerdetest-nl-p80': { host: 'websdrkatwijk.testerdetest.nl', port: 80, proto: 'http' },
  'pd1nl-ddns-net-p8073': { host: 'pd1nl.ddns.net', port: 8073, proto: 'http' },
  'sdr-k4gso-com-p8073': { host: 'sdr.k4gso.com', port: 8073, proto: 'http' },
  'vpn14585-unicoip-org-p22528': { host: 'vpn14585.unicoip.org', port: 22528, proto: 'http' },
  'site-ok1kky-cz-p8082': { host: 'site.ok1kky.cz', port: 8082, proto: 'http' },
  'w2ndg-mynetgear-com-p8073': { host: 'w2ndg.mynetgear.com', port: 8073, proto: 'http' },
  'owrx-fackinel-com-p443': { host: 'owrx.fackinel.com', port: 443, proto: 'https' },
  'openwebrx-zl3bcj-duckdns-org-p443': { host: 'openwebrx.zl3bcj.duckdns.org', port: 443, proto: 'https' },
  'vhfsdr-gb0snb-com-p8074': { host: 'vhfsdr.gb0snb.com', port: 8074, proto: 'http' },
  '185-175-11-145-p8073': { host: '185.175.11.145', port: 8073, proto: 'http' },
  'in91np-ddns-net-p8073': { host: 'in91np.ddns.net', port: 8073, proto: 'http' },
  'sdr-radarc-org-p443': { host: 'sdr.radarc.org', port: 443, proto: 'https' },
  'kudlov-ok1hz-cz-p8073': { host: 'kudlov.ok1hz.cz', port: 8073, proto: 'http' },
  'sdrpa3bbl-duckdns-org-p1500': { host: 'sdrpa3bbl.duckdns.org', port: 1500, proto: 'http' },
  'www-w5sat-com-p80': { host: 'www.w5sat.com', port: 80, proto: 'http' },
  'yo6kxq-go-ro-p80': { host: 'yo6kxq.go.ro', port: 80, proto: 'http' },
  'openwebrx-vhelectronics-com-p443': { host: 'openwebrx.vhelectronics.com', port: 443, proto: 'https' },
  'owrxbreezand-duckdns-org-p80': { host: 'owrxbreezand.duckdns.org', port: 80, proto: 'http' },
  'owrx-manilasdr-net-p80': { host: 'owrx.manilasdr.net', port: 80, proto: 'http' },
  'loganswl-hopto-org-p8070': { host: 'loganswl.hopto.org', port: 8070, proto: 'http' },
  '94-159-134-215-p8073': { host: '94.159.134.215', port: 8073, proto: 'http' },
  'oe8hsf-ddns-net-p80': { host: 'oe8hsf.ddns.net', port: 80, proto: 'http' },
  'sdr-noip-pl-p8073': { host: 'sdr.noip.pl', port: 8073, proto: 'http' },
  'sp6pwt-club-p443': { host: 'sp6pwt.club', port: 443, proto: 'https' },
  'sv6syq-ddns-net-p8073': { host: 'sv6syq.ddns.net', port: 8073, proto: 'http' },
  'webrx-ddns-net-p80': { host: 'webrx.ddns.net', port: 80, proto: 'http' },
  'rrc1258-2621952-freeddns-it-p8073': { host: 'rrc1258-2621952.freeddns.it', port: 8073, proto: 'http' },
  'vosrx-nl-p443': { host: 'vosrx.nl', port: 443, proto: 'https' },
  'dojavnik-bhdroid-eu-p443': { host: 'dojavnik.bhdroid.eu', port: 443, proto: 'https' },
  'local-ir6t-com-p8073': { host: 'local.ir6t.com', port: 8073, proto: 'http' },
  'f1ubl-ddns-net-p8073': { host: 'f1ubl.ddns.net', port: 8073, proto: 'http' },
  'runcer-ddns-net-p8073': { host: 'runcer.ddns.net', port: 8073, proto: 'http' },
  'ea3hub-sytes-net-p8073': { host: 'ea3hub.sytes.net', port: 8073, proto: 'http' },
  'newton-zando-ro-p8073': { host: 'newton.zando.ro', port: 8073, proto: 'http' },
  '95-165-144-131-p8073': { host: '95.165.144.131', port: 8073, proto: 'http' },
  'lip-sdr-nerdytools-org-p8073': { host: 'lip-sdr.nerdytools.org', port: 8073, proto: 'http' },
  'nc-home-tgws-de-p8473': { host: 'nc-home.tgws.de', port: 8473, proto: 'http' },
  '186-13-27-90-p8073': { host: '186.13.27.90', port: 8073, proto: 'http' },
  's4wmv4hovyls5ebz-myfritz-net-p8076': { host: 's4wmv4hovyls5ebz.myfritz.net', port: 8076, proto: 'http' },
  'owrxp-ng5p-com-p443': { host: 'owrxp.ng5p.com', port: 443, proto: 'https' },
  'vhf-es4rvn-ee-p8073': { host: 'vhf.es4rvn.ee', port: 8073, proto: 'http' },
  'sdr-acuanticopower-com-p443': { host: 'sdr.acuanticopower.com', port: 443, proto: 'https' },
  'f4erg-hd-free-fr-p8073': { host: 'f4erg.hd.free.fr', port: 8073, proto: 'http' },
  '108-65-60-159-p8073': { host: '108.65.60.159', port: 8073, proto: 'http' },
  'gids-nl-p8073': { host: 'gids.nl', port: 8073, proto: 'https' },
  '81-143-239-74-p8073': { host: '81.143.239.74', port: 8073, proto: 'http' },
  '99-237-71-151-p80': { host: '99.237.71.151', port: 80, proto: 'http' },
  'websdr-pi1utr-hamnet-nl-p8073': { host: 'websdr.pi1utr.hamnet.nl', port: 8073, proto: 'http' },
  'sp2sdk-pl-p443': { host: 'sp2sdk.pl', port: 443, proto: 'https' },
  '217-8-127-112-p48': { host: '217.8.127.112', port: 48, proto: 'http' },
  'cx4ae-dyndns-org-p8073': { host: 'cx4ae.dyndns.org', port: 8073, proto: 'http' },
  'arascatania-ns0-it-p8073': { host: 'arascatania.ns0.it', port: 8073, proto: 'http' },
  'sdr-we6k-com-p443': { host: 'sdr.we6k.com', port: 443, proto: 'https' },
  'paxton-sdr-km6iau-net-p443': { host: 'paxton.sdr.km6iau.net', port: 443, proto: 'https' },
  'sdr-radiogalena-org-p443': { host: 'sdr.radiogalena.org', port: 443, proto: 'https' },
  'sdrtoyb-ddns-net-p8074': { host: 'sdrtoyb.ddns.net', port: 8074, proto: 'http' },
  'sdrmanlay-ddns-net-p8073': { host: 'sdrmanlay.ddns.net', port: 8073, proto: 'http' },
  '44-5-5-125-p8073': { host: '44.5.5.125', port: 8073, proto: 'http' },
  'sdr1-pmr-si-p443': { host: 'sdr1.pmr.si', port: 443, proto: 'https' },
  'choco69-synology-me-p8076': { host: 'choco69.synology.me', port: 8076, proto: 'http' },
  '72-170-239-252-p8082': { host: '72.170.239.252', port: 8082, proto: 'http' },
  'faraon-ath-cx-p8073': { host: 'faraon.ath.cx', port: 8073, proto: 'http' },
  'sdrkrsk-ru-p8073': { host: 'sdrkrsk.ru', port: 8073, proto: 'http' },
  'ea4hxe-ddns-net-p8073': { host: 'ea4hxe.ddns.net', port: 8073, proto: 'http' },
  '89-43-209-120-p80': { host: '89.43.209.120', port: 80, proto: 'http' },
  'owr-mine-nu-p443': { host: 'owr.mine.nu', port: 443, proto: 'https' },
  'ub3aww-ru-p8073': { host: 'ub3aww.ru', port: 8073, proto: 'https' },
  '109-115-114-179-p80': { host: '109.115.114.179', port: 80, proto: 'http' },
  '179-27-116-122-p8073': { host: '179.27.116.122', port: 8073, proto: 'http' },
  'sdrsalto-ddns-net-p8073': { host: 'sdrsalto.ddns.net', port: 8073, proto: 'http' },
  'openwebrx-taild7742-ts-net-p443': { host: 'openwebrx.taild7742.ts.net', port: 443, proto: 'https' },
  'romasdr-ddns-net-p8073': { host: 'romasdr.ddns.net', port: 8073, proto: 'http' },
  'sdr-planetadelta-com-p443': { host: 'sdr.planetadelta.com', port: 443, proto: 'https' },
  'sdr-pulsraider-com-p443': { host: 'sdr.pulsraider.com', port: 443, proto: 'https' },
  'hirrkhq05e1w02ak-myfritz-net-p8073': { host: 'hirrkhq05e1w02ak.myfritz.net', port: 8073, proto: 'http' },
  'websdr-sonyleiden-nl-p8073': { host: 'websdr.sonyleiden.nl', port: 8073, proto: 'http' },
  'pix24-ru-p443': { host: 'pix24.ru', port: 443, proto: 'https' },
  '109-202-205-254-p8080': { host: '109.202.205.254', port: 8080, proto: 'http' },
  'iu2mch-duckdns-org-p8073': { host: 'iu2mch.duckdns.org', port: 8073, proto: 'http' },
  'sdr-sputnikweb-org-p443': { host: 'sdr.sputnikweb.org', port: 443, proto: 'https' },
  'iq1zw-ddns-net-p42154': { host: 'iq1zw.ddns.net', port: 42154, proto: 'http' },
  '146-158-106-247-p8073': { host: '146.158.106.247', port: 8073, proto: 'http' },
  'ea7kqr-tailed5f6-ts-net-p443': { host: 'ea7kqr.tailed5f6.ts.net', port: 443, proto: 'https' },
  'websdr-vu2tum-com-p443': { host: 'websdr.vu2tum.com', port: 443, proto: 'https' },
  'ulft-vosrx-nl-p443': { host: 'ulft.vosrx.nl', port: 443, proto: 'https' },
  'sdr-wilsonfabrication-com-p443': { host: 'sdr.wilsonfabrication.com', port: 443, proto: 'https' },
  'openwebrx-nl-p443': { host: 'openwebrx.nl', port: 443, proto: 'https' },
  'tagilsdr-ru-p443': { host: 'tagilsdr.ru', port: 443, proto: 'https' },
  'websdr-do1tob-de-p443': { host: 'websdr.do1tob.de', port: 443, proto: 'https' },
  'gz62-synology-me-p80': { host: 'gz62.synology.me', port: 80, proto: 'http' },
  '6k2fsu-tplinkdns-com-p7373': { host: '6k2fsu.tplinkdns.com', port: 7373, proto: 'http' },
  'vk2sky-openwebrx-duckdns-org-p8073': { host: 'vk2sky-openwebrx.duckdns.org', port: 8073, proto: 'http' },
  'sdr-ea1faq-com-p8073': { host: 'sdr.ea1faq.com', port: 8073, proto: 'http' },
  '179-27-116-246-p8073': { host: '179.27.116.246', port: 8073, proto: 'http' },
  'sdr-sp9ipz-pl-p443': { host: 'sdr.sp9ipz.pl', port: 443, proto: 'https' },
  'sdr-hcstecnologia-net-br-p80': { host: 'sdr.hcstecnologia.net.br', port: 80, proto: 'http' },
  'yu1ado-duckdns-org-p443': { host: 'yu1ado.duckdns.org', port: 443, proto: 'http' },
  'sdr-tarnowo-podgorne-tt2-pl-p443': { host: 'sdr-tarnowo-podgorne.tt2.pl', port: 443, proto: 'https' },
  'radio2-nkpa-co-uk-p443': { host: 'radio2.nkpa.co.uk', port: 443, proto: 'https' },
  '138-118-215-154-p8073': { host: '138.118.215.154', port: 8073, proto: 'http' },
  'sdr-k2aam-us-p80': { host: 'sdr.k2aam.us', port: 80, proto: 'http' },
  '185-138-197-168-p8073': { host: '185.138.197.168', port: 8073, proto: 'http' },
  '90-120-31-37-p8073': { host: '90.120.31.37', port: 8073, proto: 'http' },
  'sdrbahia-com-ar-p443': { host: 'sdrbahia.com.ar', port: 443, proto: 'https' },
  'jorgecasa-mycrestron-com-p8073': { host: 'jorgecasa.mycrestron.com', port: 8073, proto: 'http' },
  '9v1kg-bpmsg-com-p8074': { host: '9v1kg.bpmsg.com', port: 8074, proto: 'http' },
  'laradiocb-ddns-me-p8073': { host: 'laradiocb.ddns.me', port: 8073, proto: 'http' },
  'gtrproject-ddns-net-p8073': { host: 'gtrproject.ddns.net', port: 8073, proto: 'http' },
  'db0blg-de-p8073': { host: 'db0blg.de', port: 8073, proto: 'http' },
  'sdrkosutnjak-321-rs-p8073': { host: 'sdrkosutnjak.321.rs', port: 8073, proto: 'http' },
  'vu3knb-co-in-p443': { host: 'vu3knb.co.in', port: 443, proto: 'https' },
  '44-31-61-216-p8073': { host: '44.31.61.216', port: 8073, proto: 'http' },
  'crapoca-websdr-com-br-p8073': { host: 'crapoca.websdr.com.br', port: 8073, proto: 'http' },
  'sdr-666777123-xyz-p443': { host: 'sdr.666777123.xyz', port: 443, proto: 'https' },
  'sdrsanmarino-freeddns-org-p8073': { host: 'sdrsanmarino.freeddns.org', port: 8073, proto: 'http' },
  'sdr-nico-ninja-p8443': { host: 'sdr.nico.ninja', port: 8443, proto: 'https' },
  'openwebrx-sq6ncc-eu-p80': { host: 'openwebrx.sq6ncc.eu', port: 80, proto: 'http' },
  'sdr-serpuhov-ru-p443': { host: 'sdr-serpuhov.ru', port: 443, proto: 'https' },
  'www-g6pnh-duckdns-org-p80': { host: 'www.g6pnh.duckdns.org', port: 80, proto: 'http' },
  'lppt-aerotower-pt-p8073': { host: 'lppt.aerotower.pt', port: 8073, proto: 'http' },
  'sdr-vanish125-netcraze-pro-p443': { host: 'sdr.vanish125.netcraze.pro', port: 443, proto: 'https' },
  'vlaardingen3d-nl-p8080': { host: 'vlaardingen3d.nl', port: 8080, proto: 'http' },
  'f1riq-freeboxos-fr-p443': { host: 'f1riq.freeboxos.fr', port: 443, proto: 'https' },
  'home-kyletcreasey-me-p7777': { host: 'home.kyletcreasey.me', port: 7777, proto: 'http' },
  'sdr-autumnishere-dev-p443': { host: 'sdr.autumnishere.dev', port: 443, proto: 'https' },
  'rtlsdr-yo3bn-ro-p443': { host: 'rtlsdr.yo3bn.ro', port: 443, proto: 'https' },
  'sv9tnf-ham-gd-p8073': { host: 'sv9tnf.ham.gd', port: 8073, proto: 'http' },
  'smolsdr-mercusysddns-com-p80': { host: 'smolsdr.mercusysddns.com', port: 80, proto: 'http' },
  '49-12-212-22-p32736': { host: '49.12.212.22', port: 32736, proto: 'http' },
  '174-182-115-194-p8073': { host: '174.182.115.194', port: 8073, proto: 'http' },
  'fullerton-w6mfb-com-p443': { host: 'fullerton.w6mfb.com', port: 443, proto: 'https' },
  'sv3aqo-zapto-org-p80': { host: 'sv3aqo.zapto.org', port: 80, proto: 'http' },
  'openwebrx-db0fhr-de-p443': { host: 'openwebrx.db0fhr.de', port: 443, proto: 'https' },
  'ce3mro-radioaficion-pro-p443': { host: 'ce3mro.radioaficion.pro', port: 443, proto: 'https' },
  'w5cqu-homeip-net-p8073': { host: 'w5cqu.homeip.net', port: 8073, proto: 'http' },
  'strato88-duckdns-org-p8073': { host: 'strato88.duckdns.org', port: 8073, proto: 'http' },
  'ec5m-ddns-net-p443': { host: 'ec5m.ddns.net', port: 443, proto: 'https' },
  'pendrol-zapto-org-p80': { host: 'pendrol.zapto.org', port: 80, proto: 'http' },
  'on4lfesdr-duckdns-org-p8073': { host: 'on4lfesdr.duckdns.org', port: 8073, proto: 'http' },
  'owrx-jalbert-app-p443': { host: 'owrx.jalbert.app', port: 443, proto: 'https' },
  'sdr-swiss-artg-ch-p8088': { host: 'sdr.swiss-artg.ch', port: 8088, proto: 'http' },
  '9a3zi-ddns-net-p8073': { host: '9a3zi.ddns.net', port: 8073, proto: 'http' },
  'sdr2-pmr-si-p443': { host: 'sdr2.pmr.si', port: 443, proto: 'https' },
  'sdr-on1ms-online-p443': { host: 'sdr.on1ms.online', port: 443, proto: 'https' },
  'bmbm-home-com-p8073': { host: 'bmbm-home.com', port: 8073, proto: 'http' },
  'shed-nepeanshed-org-au-p8073': { host: 'shed.nepeanshed.org.au', port: 8073, proto: 'http' },
  'sdrsjriopreto-ddns-net-p8073': { host: 'sdrsjriopreto.ddns.net', port: 8073, proto: 'http' },
  'websdr-pi1fld-hamnet-nl-p443': { host: 'websdr.pi1fld.hamnet.nl', port: 443, proto: 'https' },
  'rannu-sdr-ee-p443': { host: 'rannu.sdr.ee', port: 443, proto: 'https' },
  '185-230-119-204-p8073': { host: '185.230.119.204', port: 8073, proto: 'http' },
  'sdr-n9oh-com-p443': { host: 'sdr.n9oh.com', port: 443, proto: 'https' },
  'sdr01-ionic1k-net-p80': { host: 'sdr01.ionic1k.net', port: 80, proto: 'http' },
  'sz5rds-ddns-net-p8073': { host: 'sz5rds.ddns.net', port: 8073, proto: 'http' },
  'dg7lan-mooo-com-p8443': { host: 'dg7lan.mooo.com', port: 8443, proto: 'https' },
  'aro99-homeip-net-p5573': { host: 'aro99.homeip.net', port: 5573, proto: 'http' },
  'ea5hkx-myqnapcloud-com-p8073': { host: 'ea5hkx.myqnapcloud.com', port: 8073, proto: 'https' },
  '191-240-174-37-p80': { host: '191.240.174.37', port: 80, proto: 'http' },
  'sdrchapeco-ddns-net-p8181': { host: 'sdrchapeco.ddns.net', port: 8181, proto: 'http' },
  'owrx-cooper-davis-net-p443': { host: 'owrx.cooper-davis.net', port: 443, proto: 'https' },
  'laurelnhardy-ddns-net-p8073': { host: 'laurelnhardy.ddns.net', port: 8073, proto: 'https' },
  'webrx-sytes-net-p443': { host: 'webrx.sytes.net', port: 443, proto: 'https' },
  '136-243-0-21-p8073': { host: '136.243.0.21', port: 8073, proto: 'http' },
  'websdr-dl8ldn-de-p443': { host: 'websdr.dl8ldn.de', port: 443, proto: 'https' },
  'openwebrx-fja4-com-p443': { host: 'openwebrx.fja4.com', port: 443, proto: 'https' },
  'magyarfrn-ddns-net-p8073': { host: 'magyarfrn.ddns.net', port: 8073, proto: 'http' },
  'iz6kcq-duckdns-org-p8074': { host: 'iz6kcq.duckdns.org', port: 8074, proto: 'http' },
  'owrx-anteniarski-pl-p443': { host: 'owrx.anteniarski.pl', port: 443, proto: 'https' },
  '93-47-89-55-p8073': { host: '93.47.89.55', port: 8073, proto: 'http' },
  'sdr-plus-i6iqx-it-p443': { host: 'sdr-plus.i6iqx.it', port: 443, proto: 'https' },
  'sdr-ssergeym-ru-p443': { host: 'sdr.ssergeym.ru', port: 443, proto: 'https' },
  'sdr-surrealservers-net-p443': { host: 'sdr.surrealservers.net', port: 443, proto: 'https' },
  'sdr-s59ekl-si-p443': { host: 'sdr.s59ekl.si', port: 443, proto: 'https' },
  '3dlifeitalia-hopto-org-p8073': { host: '3dlifeitalia.hopto.org', port: 8073, proto: 'http' },
  'sdr-wireless-access-de-p9078': { host: 'sdr.wireless-access.de', port: 9078, proto: 'https' },
  'rnestoe-myddns-me-p8073': { host: 'rnestoe.myddns.me', port: 8073, proto: 'http' },
  'hydra-cloud-synology-me-p8073': { host: 'hydra-cloud.synology.me', port: 8073, proto: 'https' },
  'sdr-kilohertz021-org-p443': { host: 'sdr.kilohertz021.org', port: 443, proto: 'https' },
  '46-232-212-142-p8074': { host: '46.232.212.142', port: 8074, proto: 'http' },
  'openwebrx-iv3hqc-it-p443': { host: 'openwebrx.iv3hqc.it', port: 443, proto: 'https' },
  '95-165-144-131-p8074': { host: '95.165.144.131', port: 8074, proto: 'http' },
  'sdr-dot-mk-p443': { host: 'sdr.dot.mk', port: 443, proto: 'https' },
  'wfbck3rpsegstbxn-myfritz-net-p8076': { host: 'wfbck3rpsegstbxn.myfritz.net', port: 8076, proto: 'http' },
  'radio-naskulsdr-blog-p80': { host: 'radio.naskulsdr.blog', port: 80, proto: 'http' },
  'hallmann-selfhost-eu-p9999': { host: 'hallmann.selfhost.eu', port: 9999, proto: 'http' },
  'sv3dvo-ddns-net-p443': { host: 'sv3dvo.ddns.net', port: 443, proto: 'https' },
  'matrixrijswijk-fixip-org-p8073': { host: 'matrixrijswijk.fixip.org', port: 8073, proto: 'http' },
  'sdr4-pmr-si-p443': { host: 'sdr4.pmr.si', port: 443, proto: 'https' },
  'sdr-ixitxachitl-com-p443': { host: 'sdr.ixitxachitl.com', port: 443, proto: 'https' },
  'sdr-oa4ejg-net-p80': { host: 'sdr.oa4ejg.net', port: 80, proto: 'http' },
  'sdr-rko-lt-p443': { host: 'sdr.rko.lt', port: 443, proto: 'https' },
  'ce3mxm-radioaficion-pro-p80': { host: 'ce3mxm.radioaficion.pro', port: 80, proto: 'http' },
  'sdr-vhf-lt-p443': { host: 'sdr.vhf.lt', port: 443, proto: 'https' },
  'sdr-zikerfy-online-p443': { host: 'sdr.zikerfy.online', port: 443, proto: 'https' },
  'sdr-ellievision-net-p443': { host: 'sdr.ellievision.net', port: 443, proto: 'https' },
  'sdr-on-vek-io-p443': { host: 'sdr.on.vek.io', port: 443, proto: 'https' },
  'sdrcurico-ddns-net-p8073': { host: 'sdrcurico.ddns.net', port: 8073, proto: 'http' },
  'sdr-naranetwork-com-p443': { host: 'sdr.naranetwork.com', port: 443, proto: 'https' },
  'openwebrx-dl-local-de-p443': { host: 'openwebrx.dl-local.de', port: 443, proto: 'https' },
  'losgallinas-ddns-net-p8073': { host: 'losgallinas.ddns.net', port: 8073, proto: 'http' },
  'greno-myddns-me-p8088': { host: 'greno.myddns.me', port: 8088, proto: 'http' },
  '82-165-1-21-p8073': { host: '82.165.1.21', port: 8073, proto: 'http' },
  'satcom-systems-ddns-net-p8073': { host: 'satcom-systems.ddns.net', port: 8073, proto: 'http' },
  'sdr-furrysdr-de-p443': { host: 'sdr.furrysdr.de', port: 443, proto: 'https' },
  'rx-rt15-su-p443': { host: 'rx.rt15.su', port: 443, proto: 'https' },
  '77-91-196-82-p8073': { host: '77.91.196.82', port: 8073, proto: 'http' },
  'hirolin-duckdns-org-p8074': { host: 'hirolin.duckdns.org', port: 8074, proto: 'http' },
  '136-185-17-232-p8073': { host: '136.185.17.232', port: 8073, proto: 'http' },
  'receiver-i140201mb-net-p443': { host: 'receiver.i140201mb.net', port: 443, proto: 'https' },
  'sdrmacedonia-duckdns-org-p443': { host: 'sdrmacedonia.duckdns.org', port: 443, proto: 'https' },
  'ivopenwebrx-de-p443': { host: 'ivopenwebrx.de', port: 443, proto: 'https' },
  'sdr-grmljavina-net-p443': { host: 'sdr.grmljavina.net', port: 443, proto: 'https' },
  'websdr-polecam-org-p8073': { host: 'websdr.polecam.org', port: 8073, proto: 'http' },
  'openwebrxplus-8wuf4fgvsjmf5pyc-myfritz-net-p8073': { host: 'openwebrxplus.8wuf4fgvsjmf5pyc.myfritz.net', port: 8073, proto: 'http' },
  'thunder76-keenetic-pro-p8075': { host: 'thunder76.keenetic.pro', port: 8075, proto: 'http' },
  'sdr-henry-lan64-de-p443': { host: 'sdr.henry.lan64.de', port: 443, proto: 'https' },
  'hf2-owrx-uk-p443': { host: 'hf2.owrx.uk', port: 443, proto: 'https' },
  'receiver-elaptic-dev-p443': { host: 'receiver.elaptic.dev', port: 443, proto: 'https' },
  'sdr-labre-pe-org-br-p80': { host: 'sdr.labre-pe.org.br', port: 80, proto: 'http' },
  'tuner-nyannode-netcraze-link-p80': { host: 'tuner.nyannode.netcraze.link', port: 80, proto: 'http' },
  'rx-siritech-net-p443': { host: 'rx.siritech.net', port: 443, proto: 'https' },
  'hf3-owrx-uk-p443': { host: 'hf3.owrx.uk', port: 443, proto: 'https' },
  'vhf1-owrx-uk-p443': { host: 'vhf1.owrx.uk', port: 443, proto: 'https' },
  'yo2cps-go-ro-p8073': { host: 'yo2cps.go.ro', port: 8073, proto: 'http' },
  '77-95-41-82-p8073': { host: '77.95.41.82', port: 8073, proto: 'http' },
  'sdr-kruen-app-p443': { host: 'sdr.kruen.app', port: 443, proto: 'https' },
  'hamnetberlin-duckdns-org-p4038': { host: 'hamnetberlin.duckdns.org', port: 4038, proto: 'http' },
  'jacksdr-ddns-net-p8073': { host: 'jacksdr.ddns.net', port: 8073, proto: 'https' },
  'k7bux-serveminecraft-net-p8073': { host: 'k7bux.serveminecraft.net', port: 8073, proto: 'http' },
  'maxmountainstation-ddns-net-p443': { host: 'maxmountainstation.ddns.net', port: 443, proto: 'https' },
  'sdr-1-giarel-li-p443': { host: 'sdr-1.giarel.li', port: 443, proto: 'https' },
  'ea1rcr-org-p443': { host: 'ea1rcr.org', port: 443, proto: 'https' },
  'wrhnet-co-uk-p8074': { host: 'wrhnet.co.uk', port: 8074, proto: 'http' },
  'vk5hw-duckdns-org-p8073': { host: 'vk5hw.duckdns.org', port: 8073, proto: 'http' },
  '84-24-2-232-p8073': { host: '84.24.2.232', port: 8073, proto: 'http' },
  'sdr-ea5kao-ampr-org-p443': { host: 'sdr.ea5kao.ampr.org', port: 443, proto: 'https' },
  'sdr-ta3hx-ampr-org-p443': { host: 'sdr.ta3hx.ampr.org', port: 443, proto: 'https' },
  'www-kd5oh-net-p8073': { host: 'www.kd5oh.net', port: 8073, proto: 'http' },
  'vhf-f4mzi-fr-p443': { host: 'vhf.f4mzi.fr', port: 443, proto: 'https' },
  'pulsardx-nl-p443': { host: 'pulsardx.nl', port: 443, proto: 'https' },
  'sdr-radioandorra-org-p80': { host: 'sdr.radioandorra.org', port: 80 },
  'websdr-fi-p8080': { host: 'websdr.fi', port: 8080 },
};
export { RECEIVERS };
