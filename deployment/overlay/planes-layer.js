/* OSM-Overlay Erweiterung: OpenSky live aircraft (keyless anonymous tier, EU-region).
   Zivile flugzeuge als triangle-marker, aktualisiert alle 30s. */
(function () {
  if (window.__wmPlanesLayer) return;
  window.__wmPlanesLayer = true;
  var LAYER = 'wm-planes', SRC = 'wm-planes-src';

  // 30.10. (r34) militär-erkennung (keyless): bekannte militär-callsign-
  // präfixe (AMC/NATO/Luftwaffe/RAF/Armée de l'air/…) + adsb-typ-keywords.
  // Nur für den PROTEST-fokus-filter (polizei- und militärbewegungen), die
  // normalansicht bleibt unzensiert.
  var MIL_PREFIXES = ['RCH','CFC','CTM','GAF','IFO','RRR','ASCOT','NATO','IAM','BAF','NAVY','USN','USAF','MMF','SPAR','PAT','JK','TGA','AME','EVAC'];
  var MIL_TYPE_KEYS = ['HERC','GALAXY','MRTT','RAFALE','TYPH','TYPHOON','TORNADO','AWACS','SENTINEL','POSY','EUROHAWK','GLOBALHAWK','REAPER','ATL2','F16','F35','MIRAGE'];
  function isMil(cs, typ) {
    var c = String(cs || '').toUpperCase();
    for (var i = 0; i < MIL_PREFIXES.length; i++) if (c.indexOf(MIL_PREFIXES[i]) === 0) return 1;
    var t = String(typ || '').toUpperCase();
    for (var j = 0; j < MIL_TYPE_KEYS.length; j++) if (t.indexOf(MIL_TYPE_KEYS[j]) !== -1) return 1;
    return 0;
  }
  var milOnly = false;
  var lastFc = { type: 'FeatureCollection', features: [] };

  function fc(states) {
    var feats = states.map(function (s) {
      // OpenSky state vector: [icao24, callsign, origin_country, time_position, last_contact,
      //  longitude, latitude, baro_altitude, on_ground, velocity, true_track, ...]
      var onGround = s[8];
      var lat = s[6], lon = s[5], track = s[10] || 0;
      if (onGround || lat == null || lon == null) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { callsign: (s[1] || '').trim(), country: s[2] || '', alt: s[7] || 0, track: track, mil: isMil(s[1], null) }
      };
    }).filter(Boolean);
    return { type: 'FeatureCollection', features: feats };
  }

  function push(host, fcin) {
    try {
      lastFc = fcin;
      var feats = milOnly ? (fcin.features || []).filter(function (f) { return f.properties && f.properties.mil; }) : fcin.features;
      var fc = { type: 'FeatureCollection', features: feats };
      var src = host.mapInstance.getSource(SRC);
      if (src) { src.setData(fc); return; }
      host.mapInstance.addSource(SRC, { type: 'geojson', data: fc });
      // flugzeug-icon als triangle:
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">' +
        '<path d="M12 2 L14 10 L22 13 L14 14 L12 22 L10 14 L2 13 L10 10 Z" fill="#ffffff" stroke="rgba(15,25,35,.9)" stroke-width="1.6"/></svg>';
      var img = new Image();
      img.onload = function () {
        if (!host.mapInstance.hasImage('wm-plane-icon')) {
          host.mapInstance.addImage('wm-plane-icon', img);
        }
        host.mapInstance.addLayer({
          id: LAYER, type: 'symbol', source: SRC,
          layout: {
            'icon-image': 'wm-plane-icon',
            'icon-size': 0.7,
            'icon-rotate': ['get', 'track'],
            'icon-allow-overlap': true
          },
          minzoom: 4
        });
        host.mapInstance.on('click', LAYER, function (e) {
          var f = e.features[0]; if (!f) return;
          var p = f.properties;
          if (window.maplibregl) {
            new maplibregl.Popup({ closeButton: false, offset: 8 })
              .setLngLat(f.geometry.coordinates)
              .setHTML('<div style="font:11px/1.4 monospace;color:#e8f4f0;background:#0a0e0c;padding:6px 8px;border-radius:4px"><b style="color:#ffffff">' + (p.callsign || 'aircraft') + '</b><br>' + (p.country || '') + '<br>Höhe: ' + Math.round(p.alt || 0) + ' m</div>')
              .addTo(e.target);
          }
        });
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch (e) { console.warn('[planes]', e.message); }
  }

  // 30.10. (r31) adaptive poll: 429 (opensky-tagesbudget) → 300s statt 30s;
  // der nginx-proxy cache-t 429 bereits 300s serverseitig — der client
  // entlastet damit zusaetzlich und die karte behaelt die letzten daten.
  var pollMs = 30000;

  // 30.10. (r31) ADS-B-zweitquelle: der vps betriebt lokal VirtualRadar
  // (:8082, keyless, kein fremd-limit). Regionale live-flugzeuge werden in
  // die opensky-features gemergt (opensky gewinnt pro callsign, ads-b
  // ergaenzt). Ausfall von ads-b ist still — opensky bleibt allein weiter
  // funktionieren.
  function adsbFeatures(json) {
    var list = (json && json.ac) || [];
    var feats = list.map(function (a) {
      var lat = a.Lat, lon = a.Long;
      if (lat == null || lon == null) return null;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { callsign: (a.Call || a.Icao || '').trim(), country: 'ADS-B lokal', alt: (a.Alt || 0) * 0.3048, track: a.Trak || 0, mil: isMil(a.Call, a.Type) }
      };
    }).filter(Boolean);
    return feats;
  }

  // 30.10. (r34e) adsb.fi (open data, keyless): DBFlags&1 = MILITÄR — echte
  // militär-bewegungen (statt nur callsign-raterei). Abfrage um das
  // karten-center (250nm), alles same-origin via proxy.
  function adsbFiFeatures(json) {
    var list = (json && json.aircraft) || [];
    var feats = list.filter(function (a) {
      return typeof a.lat === 'number' && typeof a.lon === 'number' && ((a.dbFlags || 0) & 1);
    }).map(function (a) {
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
        properties: { callsign: (a.flight || a.r || '').trim(), country: 'Militär (ADS-B)', alt: (a.alt_baro === 'ground' ? 0 : (a.alt_baro || 0)), track: a.mag_heading || 0, typ: a.t || '', mil: 1 }
      };
    });
    return feats;
  }
  function fetchAdsbFi(m) {
    var c = m.getCenter();
    var url = '/worldmapp/adsbfi/v2/lat/' + c.lat.toFixed(3) + '/lon/' + c.lng.toFixed(3) + '/dist/250';
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return adsbFiFeatures(j); }).catch(function () { return []; });
  }

  function load(host) {
    // EU-weite opensky-bbox (anonymous tier limitiert):
    fetch('/worldmapp/opensky/states/all?lamin=35&lomin=-15&lamax=60&lomax=25')
      .then(function (r) {
        if (r.status === 429) { pollMs = 300000; return null; }
        pollMs = 30000;
        return r.json();
      })
      .then(function (d) {
        var base = (d && d.states) ? fc(d.states).features : [];
        Promise.all([fetchAdsbFi(m), fetch('/worldmapp/adsb').then(function (r2) { return r2.ok ? r2.json() : null; }).catch(function () { return null; })])
          .then(function (parts) {
            var fi = parts[0] || [];
            var ad = parts[1];
            var extra = fi.concat(ad ? adsbFeatures(ad) : []);
            var seen = {};
            base.forEach(function (f) { if (f.properties.callsign) seen[f.properties.callsign.toUpperCase()] = 1; });
            extra = extra.filter(function (f) {
              var c = (f.properties.callsign || '').toUpperCase();
              if (c && seen[c]) return false;
              if (c) seen[c] = 1;
              return true;
            });
            push(host, { type: 'FeatureCollection', features: base.concat(extra) });
          })
          .catch(function () { push(host, { type: 'FeatureCollection', features: base }); });
      })
      .catch(function () {});
  }

  var iv = setInterval(function () {
    var host = window.__wmMapHost;
    if (host && host.mapInstance) {
      clearInterval(iv);
      load(host);
      (function cycle() { setTimeout(function () { load(host); cycle(); }, pollMs); })();
    }
  }, 3000);

  // r34 API fuer den PROTEST-fokus (cortege-mapmode): militaer-only umschalten
  window.wmPlanesAPI = {
    setMilOnly: function (on) {
      milOnly = !!on;
      var h = window.__wmMapHost;
      if (!h || !h.mapInstance) return;
      // r34c: erste umschaltung ohne lastFc → die aktuelle source-data via
      // getData() holen (maplibre-v3-offizieller weg; src._data existiert
      // nicht — bewiesen durch 'err' im r32-e2e). asynchron, daher callback.
      if (!lastFc.features || !lastFc.features.length) {
        var srcNow = h.mapInstance.getSource(SRC);
        if (srcNow && typeof srcNow.getData === 'function') {
          srcNow.getData().then(function (d) {
            if (d && d.features && d.features.length) { lastFc = d; push(h, d); }
            else load(h);
          }).catch(function () { load(h); });
          return;
        }
      }
      if (lastFc.features && lastFc.features.length) push(h, lastFc);
      else load(h);
    },
    isMilOnly: function () { return milOnly; }
  };
})();
