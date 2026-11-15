# EXIT self-host fixes (2026-11-15)

Two production defects in the self-host stack were diagnosed and fixed, plus
the native installer is included in-tree for the first time.

## 1) deployment/sdr-proxy.mjs — receiver pages 502 through the proxy

The upstream page fetch used Node's default TLS verification, while the
WebSocket relay in the same file already tolerated receiver certificates.
Hobby WebSDR receivers frequently ship mismatched or self-signed certificates,
so their receiver pages returned 502 through the proxy while the audio path
worked.

Fix: `rejectUnauthorized: false` on the page fetch (parity with the WS relay).
The receiver allowlist itself is unchanged; a redirect leaving the allowlisted
origin is still refused.

## 2) deployment/adsblol-sbs-bridge-v7.py (new) — collapsed aircraft feed

Public ADS-B aggregator APIs now reject radius queries above 250 NM with
HTTP 403 and the body `radius exceeds 250 NM`. The previous world-sweep design
(dist/5000, one request per world region) therefore collapsed to a single thin
fallback source (~770 aircraft instead of thousands).

v7 rasterizes the busy world with 16 centers x 250 NM across two sources,
5-minute cycles, exponential backoff preserved. Interfaces unchanged:
`:32001` SBS stream, `:32002` aircraft.json.

## 3) deployment/setup-native.py — native installer (now in-tree)

Installs the service stack (redis + REST shim, api, relay, regional/exit-api)
and the nginx integration for a native (non-Docker) host:

- generates ALL credentials at runtime (`secrets.token_hex(32)`), writes
  runtime.env with mode 0600 — no embedded secrets in the repo
- binds every service and the internal ingress to 127.0.0.1
- systemd hardening: NoNewPrivileges, ProtectSystem=strict, ProtectHome,
  PrivateTmp, MemoryMax per unit
- nginx include is only added when the expected vhost marker exists and
  otherwise aborts before any mutation (fail-closed)

## Verification (measured, not claimed)

- Receiver route sweep: 449/489 routes HTTP 200; the remaining 40 are
  third-party receivers that are offline or misconfigured at their origin
  (TCP-unreachable, Cloudflare 530, operator-side 403/502/503) — none of them
  are proxy-side defects.
- Merged ADS-B feed after the bridge fix: ~3,000+ aircraft per cycle on both
  primary and fallback sources, zero rate-limit responses across cycles.
- Installer audit: no secrets, no private endpoints, no credentials in the
  repository; everything sensitive is generated locally at install time.
