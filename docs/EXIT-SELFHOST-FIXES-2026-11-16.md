# EXIT self-host fixes (2026-11-16)

Follow-up to the 2026-11-15 document. Same audit bar: measured, not claimed.

## 1) Frontend overlay runtime now in-tree (`deployment/overlay/`)

The live dashboard does not run from the built bundles alone: 49 `wm-*.js`
runtime overlays (map-mode embeds like RADAR/SDR/WEATHER/WINDY/GODSEYE/
TESSERA/WID/PULSE, layer/protest/webcam fixes, custom tabs, panel guards),
plus `exit.js`, `exit.css`, `exit-dashboard.{js,css}`, `status.html`,
`dashboard-status.html` and the regional API service `deployment/exit-api.mjs`
(port 46124: SDR receiver page routes, TV proxy, webcam tile endpoint,
brief integration) exist ONLY as runtime files on the host — until now the
repo could not reproduce the actual frontend behavior.

Sanitization before publishing (per file):
- Person references in code comments generalized (given name → "operator").
  Only comment prose changed: localStorage keys, selectors, data-* hooks and
  all other code paths verified byte-identical before/after substitution.
- Secret scan (GitHub personal-access-token prefixes, API_KEY assignments, AKIA, PRIVATE KEY, token values,
  RFC1918 addresses, callsigns): only `process.env.*_KEY` references — no
  values. Server-side keys stay in runtime.env, never in frontend files.

## 2) Map-mode menu: single WINDY entry

`wm-embed-maps.js` carried a legacy `WINDY ↗` external-link button from the
pre-v7 era. The Windy embed mode (`wm-windy-map-v7.js`, header note: the
standalone link/tab was obsolete by design) duplicated it. Removed the
relict entry (`LINKS = []`), bumped `?v=` across all seven dashboard HTMLs
and regenerated `.gz`/`.br` twins of the HTMLs themselves — gzip_static had
been serving a stale compressed sibling (ident/br = new, gzip = old).
Acceptance: `?v=20261116-r2` in the DECODED body via {identity, br, gzip}
against both instances.

## 3) Receiver sweep re-measured (16.11.)

489 unique receiver routes over the public proxy: 447 HTTP 200 in the
parallel burst; the 42 defects re-probed serially one by one — 2 recovered
(parallel-burst transient, documented class), final **449/489**, matching
the 2026-11-15 figure. Remaining 40 are third-party origins (TCP-dead,
Cloudflare 530, operator-side 403/502/503), none proxy-side.

## 4) ADS-B bridge v7 cold-start expectation

First cycle after a restart fetches all 16 centers × 2 sources at once,
which trips an HTTP 429 and pauses the primary source for 180 s: cycle 1
measures ~850 aircraft, cycle 2 (≈6 min later) ~2,800 (2,644 adsb.lol +
141 ads.fi). Verify on cycle 2, not on the cold boot line.

## 5) r50/r1 — protest-2D leak gate + full runtime overlay publish (16.11. evening)

- 2D protest leak: the 3D protest DOM dots (`#wm-protests-3d`) survived renderer
  switches and painted globe-anchored markers over the flat map (only visible once
  hardware WebGL returned after the reboot). Fix: globe gate in `osm-overlay.js`
  `reproj()` (`__wmGlobeActive !== true` hides the wrap). Red->green verified on
  both instances (old overlay reproduces the leak via route-revert; r50 shows
  deck + querySourceFeatures=74 protest features, 0 new pageerrors — the
  pre-existing `getSource` switch errors occur with old and new overlay alike).
- Fork backfill: `deployment/overlay/` was missing `osm-overlay.js` plus 17
  dashboard-referenced runtime overlays. All published sanitized (person mentions
  in comment prose only, code byte-identical), 18/18 raw readback OK.
- r1 `wm-mobile-deck-unlock.js`: mobile/touch/narrow contexts never reach the deck
  renderer (upstream isMobile heuristic: pointer coarse / hover none /
  max-width 1024 / innerWidth<=1024), so WebView devices showed the SVG emergency
  map in 2D despite hardware WebGL. The shim flattens those three media queries,
  pins `userAgentData.mobile=false` and `innerWidth>=1280`, but only for
  `wv)`-UA WebViews (our APK) — regular phone browsers keep the lightweight mode.
  Both instances + fork; Android TV stick re-verified via CDP (deck renderer, 71
  protest features, overlay tag `?v=20261116-r1`).
