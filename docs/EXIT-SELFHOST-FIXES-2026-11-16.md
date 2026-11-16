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
- Person references in code comments generalized ("Lino" → "operator").
  Only comment prose changed: localStorage keys, selectors, data-* hooks and
  all other code paths verified byte-identical before/after substitution.
- Secret scan (ghp_, API_KEY assignments, AKIA, PRIVATE KEY, token values,
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
