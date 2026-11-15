#!/usr/bin/env python3
"""ADS-B Multi-Source SBS-Bridge v7 — 250NM-Raster nach adsb.lol-API-Schnitt.

Lektion v6->v7 (15.11.2026): adsb.lol hat die v2-API gedrosselt — jeder
dist>250-Request antwortet instant 403 mit Body "radius exceeds 250 NM"
(dist/5000, das Fundament von v6, ist damit TOT; Counter-Beweis: dist/250
liefert 200 mit ~730 aircraft). v7 rastered die belebte Welt mit 16 Zentren
x 250 NM (~460 km) und fragt BEIDE Quellen je Zentrum (merge by hex, first
wins). Interfaces unverändert zu v5/v6:
  :32001 SBS-Stream (readsb-Protokoll, push an verbundene Clients)
  :32002 /aircraft.json (readsb-artiges JSON, provider/type Felder)
"""
import socket, threading, time, urllib.request, urllib.error, json, queue

LISTEN_PORT = 32001
POLL_INTERVAL = 300          # 5 Min: 16 Zentren x 2 Quellen = 32 Requests/Zyklus
READSB_JSON = "/run/readsb/aircraft.json"
NUM_WORKERS = 2

# 250-NM-Raster (~460 km) ueber die belebte Welt (Europa/NA/Asien/Pazifik/ME):
WORLD_CENTERS = [
    (52.0, 1.0),       # UK / Benelux / N-Frankreich
    (46.0, 11.0),      # Alpen / Norditalien / S-Europa
    (40.0, -3.5),      # Iberia / Marokko-Rand
    (43.7, -79.4),     # Toronto / Ost-Kanada
    (39.5, -76.5),     # US-East (DC/Baltimore/NYC-Rand)
    (41.0, -87.5),     # US-Midwest (Chicago/Detroit)
    (33.0, -97.0),     # US-South (Dallas/Austin)
    (34.5, -118.5),    # US-West (LA/Vegas/San Diego)
    (25.3, 55.3),      # Golf / Naher Osten (DXB/Doha)
    (19.1, 72.9),      # West-Indien (Mumbai)
    (35.5, 137.0),     # Japan (Nagoya/Osaka/Tokyo-Rand)
    (23.5, 113.5),     # Sued-China (Kanton/Shenzhen/HK-Rand)
    (1.3, 104.0),      # Singapore / SEA
    (-33.9, 151.2),    # Sydney / Oz-East
    (-23.5, -46.6),    # Sao Paulo / BR
    (9.0, 18.0),       # Zentral-Afrika
]

SOURCES = [
    ("adsb.lol", "https://api.adsb.lol/v2/lat/{la}/lon/{lo}/dist/250"),
    ("adsb.fi",  "https://opendata.adsb.fi/api/v2/lat/{la}/lon/{lo}/dist/250"),
]

_lock = threading.Lock()
_sbs_lines = []
_clients = []
_backoff = {}
_center_cache = {}    # (la, lo) -> (timestamp, {hexid: ac}) — letzte erfolgreiche Daten, 10 Min gueltig
_seen_map = {}        # hexid -> epoch des ERFOLGREICHEN Fetches (nicht der Abrufzeit)
_provider_map = {}    # hexid -> Quellname
_rl = threading.Semaphore(2)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
EMPTY_STREAK_BACKOFF = 3
EMPTY_BACKOFF_SEC = 900
_cycle_start = 0.0


def fetch_one(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except Exception:
        return None


CACHE_TTL = 600
THIN_REGION_AC = 40
DIST_MAX = 250   # adsb.lol UND adsb.fi caps: >250 => 403 "radius exceeds 250 NM"


def fetch_center(la, lo, out):
    """EIN Zentrum abfragen; beide Quellen je 250 NM, merge by hex (first wins)."""
    merged = {}
    for src_name, tmpl in SOURCES:
        if time.time() < _backoff.get(src_name, 0):
            continue
        with _rl:
            data = None
            try:
                req = urllib.request.Request(tmpl.format(la=la, lo=lo),
                    headers={"User-Agent": UA, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=15) as r:
                    data = json.load(r)
            except urllib.error.HTTPError as e:
                if e.code in (403, 429):
                    streak = rate_streak.get(src_name, 0) + 1
                    rate_streak[src_name] = streak
                    delay = min(RATE_LIMIT_BACKOFF, 180 * (2 ** min(streak - 1, 3)))
                    _backoff[src_name] = time.time() + delay
                    log("source %s: HTTP %d (%d in a row) -> paused %ds" % (src_name, e.code, streak, delay))
                continue
            except Exception:
                continue
        if data is None:
            continue
        acs = data.get("ac") or data.get("aircraft") or []
        got = {}
        for a in acs:
            hexid = str(a.get("hex", "")).lower()
            # hex mit 7+ Zeichen = ICAO24 mit Zusatzbits (military/other) — NICHT verwerfen.
            if hexid and 6 <= len(hexid) <= 8:
                got[hexid] = a
        if not got:
            empty_streak[src_name] = empty_streak.get(src_name, 0) + 1
            if empty_streak[src_name] >= EMPTY_STREAK_BACKOFF:
                _backoff[src_name] = time.time() + EMPTY_BACKOFF_SEC
                empty_streak[src_name] = 0
                log("source %s: %d empty answers -> backing off %ds" % (src_name, EMPTY_STREAK_BACKOFF, EMPTY_BACKOFF_SEC))
            continue
        empty_streak[src_name] = 0
        rate_streak[src_name] = 0
        for hexid, a in got.items():
            if hexid not in merged:
                a["_src"] = src_name
                merged[hexid] = a
    if merged:
        fetched_at = time.time()
        log("center (%s,%s): merged %d aircraft" % (la, lo, len(merged)))
        _center_cache[(la, lo)] = (fetched_at, merged)
        for hexid, a in merged.items():
            _seen_map[hexid] = fetched_at
            _provider_map[hexid] = a.get("_src") or "unknown"
        for hexid, a in merged.items():
            if hexid not in out:
                out[hexid] = a
        return len(merged)
    cached = _center_cache.get((la, lo))
    if cached and time.time() - cached[0] < CACHE_TTL:
        for hexid, a in cached[1].items():
            if hexid not in out:
                out[hexid] = a
    return 0


_cycle_offset = [0]

MIN_REQUEST_GAP = 2.5
RATE_LIMIT_BACKOFF = 900
_last_request_at = [0.0]
empty_streak = {}
rate_streak = {}
_stats = {"cycles": 0, "centers_ok": 0, "centers_cached": 0, "centers_failed": 0,
          "aircraft": 0, "sources": {}, "cycle_seconds": 0.0}

_gap_lock = threading.Lock()


def _throttle():
    with _gap_lock:
        gap = MIN_REQUEST_GAP - (time.time() - _last_request_at[0])
        if gap > 0:
            time.sleep(gap)
        _last_request_at[0] = time.time()


def log(msg):
    print("%s bridge: %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


def fetch_all():
    out = {}
    q = queue.Queue()
    for la, lo in WORLD_CENTERS:
        q.put((la, lo))
    ok = [0]
    def worker():
        while True:
            try:
                la, lo = q.get_nowait()
            except queue.Empty:
                return
            _throttle()
            n = fetch_center(la, lo, out)
            if n:
                ok[0] += 1
    ths = [threading.Thread(target=worker, daemon=True) for _ in range(NUM_WORKERS)]
    for t in ths: t.start()
    for t in ths: t.join(timeout=240)
    now = time.time()
    cached_count = 0
    for (cla, clo), (ts, got) in list(_center_cache.items()):
        if now - ts < CACHE_TTL:
            cached_count += 1
            for hexid, a in got.items():
                if hexid not in out:
                    out[hexid] = a
    sources = {}
    for hexid in out:
        src = _provider_map.get(hexid, "cache")
        sources[src] = sources.get(src, 0) + 1
    _stats["cycles"] += 1
    _stats["centers_ok"] = len(WORLD_CENTERS)
    _stats["centers_cached"] = cached_count
    _stats["aircraft"] = len(out)
    _stats["sources"] = sources
    _stats["cycle_seconds"] = round(now - _cycle_start, 1)
    ages = [now - _seen_map.get(h, now) for h in out]
    fresh = sum(1 for a in ages if a <= 120)
    log("cycle %d: %d/%d centers live (%d cached <=%ds), %d aircraft (%d fresh <=120s), %.1fs, sources=%s"
        % (_stats["cycles"], ok[0], len(WORLD_CENTERS), cached_count, CACHE_TTL, len(out), fresh,
           _stats["cycle_seconds"], sources))
    return out


def local_icaos():
    try:
        with open(READSB_JSON) as f:
            d = json.load(f)
        return set(str(a.get("hex", "")).lower() for a in d.get("aircraft", []))
    except Exception:
        return set()


def epoch_to_sbs_ts(epoch):
    t = time.gmtime(epoch)
    ms = int((epoch % 1) * 1000)
    return (time.strftime("%Y/%m/%d", t), time.strftime("%H:%M:%S", t) + ".%03d" % ms)


def build_sbs(ac_map, local):
    now = time.time()
    d, t = epoch_to_sbs_ts(now)
    lines = []
    for icao, a in ac_map.items():
        if icao in local:
            continue
        lat, lon = a.get("lat"), a.get("lon")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        if not (-84 < lat < 84) or (lat == 0 and lon == 0):
            continue
        if lat < -79 and abs(lon) in (64.0, 128.0):
            continue
        alt = a.get("alt_baro")
        alt = 0 if alt == "ground" else alt if isinstance(alt, (int, float)) else (a.get("alt_geom") or 0)
        trk = a.get("track") or 0
        vr = a.get("baro_rate") or 0
        gspd = a.get("gs") or 0
        callsign = str(a.get("flight", "")).strip()
        seen = a.get("seen_pos", 0)
        obs = now - float(seen) if isinstance(seen, (int, float)) else now
        dd, tt = epoch_to_sbs_ts(obs)
        lines.append("MSG,3,1,1,%s,1,%s,%s,%s,%s,%s,%d,%d,%d,%.5f,%.5f,%d,,0,,0,0" % (
            icao.upper(), dd, tt, dd, tt, callsign, int(alt), int(gspd), int(trk), lat, lon, int(vr)))
    return lines


def poller():
    global _sbs_lines, _cycle_start
    while True:
        try:
            _cycle_start = time.time()
            ac_map = fetch_all()
            local = local_icaos()
            lines = build_sbs(ac_map, local)
            with _lock:
                if len(lines) >= max(200, int(len(_sbs_lines) * 0.3)) or not _sbs_lines:
                    _sbs_lines = lines
            with _lock:
                clients = list(_clients)
            payload = ("\n".join(lines) + "\n").encode()
            dead = []
            for c in clients:
                try:
                    c.sendall(payload)
                except Exception:
                    dead.append(c)
            for c in dead:
                try: c.close()
                except Exception: pass
                with _lock:
                    if c in _clients: _clients.remove(c)
        except Exception:
            pass
        time.sleep(POLL_INTERVAL)


def client_handler(conn):
    with _lock:
        _clients.append(conn)
        snapshot = list(_sbs_lines)
    try:
        conn.sendall(("\n".join(snapshot) + "\n").encode())
        while True:
            time.sleep(30)
    except Exception:
        pass
    finally:
        try: conn.close()
        except Exception: pass
        with _lock:
            if conn in _clients: _clients.remove(conn)


def sbs_to_aircraft_json(lines):
    ac = []
    for line in lines:
        p = line.split(',')
        if len(p) >= 17 and p[14] and p[15]:
            try:
                la, lo = float(p[14]), float(p[15])
            except ValueError:
                continue
            try:
                alt = int(p[11]) if p[11] else 0
                spd = int(p[12]) if p[12] else 0
                trk = int(p[13]) if p[13] else 0
                vr = int(p[16]) if p[16] else 0
            except ValueError:
                alt, spd, trk, vr = 0, 0, 0, 0
            hx = p[4].lower()
            fetched = _seen_map.get(hx)
            seen_pos = int(max(0.0, time.time() - fetched)) if fetched is not None else 9999
            ac.append({"hex": hx, "flight": p[10].strip(), "lat": la, "lon": lo,
                       "alt_baro": alt, "gs": spd, "track": trk, "baro_rate": vr,
                       "seen_pos": seen_pos, "seen": seen_pos,
                       "provider": _provider_map.get(hx, "unknown"), "type": "adsb_api"})
    return {"now": time.time(), "aircraft": ac}


def json_server():
    import http.server

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.startswith("/aircraft.json"):
                with _lock:
                    lines = list(_sbs_lines)
                body = json.dumps(sbs_to_aircraft_json(lines)).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 32002), H)
    srv.serve_forever()


def server():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", LISTEN_PORT))
    srv.listen(5)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=client_handler, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    threading.Thread(target=poller, daemon=True).start()
    threading.Thread(target=json_server, daemon=True).start()
    server()
