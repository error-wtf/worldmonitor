from pathlib import Path
import secrets,subprocess,os,shutil
root=Path('/opt/worldmonitor');conf=Path('/etc/worldmonitor');conf.mkdir(exist_ok=True,mode=0o750)
subprocess.run(['useradd','--system','--home-dir','/var/lib/worldmonitor','--create-home','--shell','/usr/sbin/nologin','worldmonitor'],capture_output=True)
subprocess.run(['chgrp','worldmonitor',str(conf)],check=True)
state=Path('/var/lib/worldmonitor');state.mkdir(exist_ok=True)
def write(p,s,mode=0o644):
 p=Path(p);p.write_text(s);p.chmod(mode)
if not (conf/'runtime.env').exists():
 token=secrets.token_hex(32);redis=secrets.token_hex(32);session=secrets.token_hex(32);relay=secrets.token_hex(32)
 write(conf/'runtime.env',f'LOCAL_API_PORT=46123\nLOCAL_API_MODE=docker\nLOCAL_API_CLOUD_FALLBACK=false\nLOCAL_API_RESOURCE_DIR=/opt/worldmonitor\nLOCAL_API_DATA_DIR=/var/lib/worldmonitor\nLOCAL_API_TOKEN={token}\nWM_SESSION_SECRET={session}\nUPSTASH_REDIS_REST_URL=http://127.0.0.1:8079\nUPSTASH_REDIS_REST_TOKEN={redis}\nUPSTASH_ALLOW_INSECURE_HTTP=true\nSRH_TOKEN={redis}\nSRH_CONNECTION_STRING=redis://127.0.0.1:6381\nWS_RELAY_URL=http://127.0.0.1:3004\nRELAY_SHARED_SECRET={relay}\nWORLDMONITOR_RELAY_KEY={relay}\nAPI_BASE_URL=http://127.0.0.1:46125\n',0o600)
else:
 token=dict(x.split('=',1) for x in (conf/'runtime.env').read_text().splitlines())['LOCAL_API_TOKEN']
# Dedicated cache: never shares the physics Redis instance.
write(conf/'redis.conf','bind 127.0.0.1\nport 6381\nprotected-mode yes\nmaxmemory 384mb\nmaxmemory-policy allkeys-lru\ndir /var/lib/worldmonitor\ndbfilename worldmonitor.rdb\nsave 300 1\n')
for path,old,new in [('docker/redis-rest-proxy.mjs',"server.listen(PORT, '0.0.0.0'","server.listen(PORT, '127.0.0.1'"),('scripts/ais-relay.cjs','server.listen(PORT, () =>','server.listen(PORT, \'127.0.0.1\', () =>')]:
 p=root/path;s=p.read_text();p.write_text(s.replace(old,new))
def unit(name,cmd,extra='',memory='768M'):
 write('/etc/systemd/system/'+name+'.service',f'''[Unit]
Description=EXIT MATRIX {name}
After=network-online.target worldmonitor-redis.service
Wants=network-online.target
[Service]
Type=simple
User=worldmonitor
Group=worldmonitor
WorkingDirectory=/opt/worldmonitor
EnvironmentFile=/etc/worldmonitor/runtime.env
Environment=NODE_OPTIONS=--max-old-space-size=512
{extra}
ExecStart={cmd}
Restart=on-failure
RestartSec=8
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/worldmonitor
MemoryMax={memory}
[Install]
WantedBy=multi-user.target
''')
unit('worldmonitor-redis','/usr/bin/redis-server /etc/worldmonitor/redis.conf',memory='512M')
unit('worldmonitor-redis-rest','/usr/bin/node /opt/worldmonitor/docker/redis-rest-proxy.mjs','Environment=PORT=8079',memory='512M')
unit('worldmonitor-api','/usr/bin/node /opt/worldmonitor/src-tauri/sidecar/local-api-server.mjs',memory='1200M')
unit('worldmonitor-relay','/usr/bin/node /opt/worldmonitor/scripts/ais-relay.cjs','Environment=PORT=3004',memory='900M')
unit('worldmonitor-regional','/usr/bin/node /opt/worldmonitor/deployment/exit-api.mjs',memory='512M')
subprocess.run(['chown','-R','worldmonitor:worldmonitor',str(state)],check=True)
# Private ingress supplies the transport token while blocking native administration.
write('/etc/nginx/conf.d/worldmonitor-internal.conf',f'''server {{
 listen 127.0.0.1:46125;
 server_name localhost;
 root /opt/worldmonitor/dist;
 location ^~ /api/local- {{ return 403; }}
 location /api/ {{
  proxy_pass http://127.0.0.1:46123;
  proxy_set_header Host $host;
  proxy_set_header Origin http://localhost;
  proxy_set_header X-WorldMonitor-Local-Token "{token}";
  proxy_set_header X-Real-IP $remote_addr;
  proxy_read_timeout 120s;
 }}
}}
''',0o600)
# Only app-specific paths are added. Existing root files keep priority.
write('/etc/nginx/snippets/worldmonitor.conf','''
location = /worldmapp { return 302 /worldmapp/; }
location = /worldmapp/ { root /opt/worldmonitor/deployment; rewrite ^ /index.html break; add_header Cache-Control "no-cache"; }
location ~ ^/worldmapp/(exit\\.(js|css)|status\\.html|source\\.tar\\.gz)$ { root /opt/worldmonitor/deployment; rewrite ^/worldmapp/(.*)$ /$1 break; }
location /worldmapp/exit-api/ { proxy_pass http://127.0.0.1:46124/; proxy_read_timeout 130s; }
location /worldmapp/ { alias /opt/worldmonitor/dist/; index dashboard.html; try_files $uri $uri/ /worldmapp/dashboard.html; }
location ^~ /api/local- { return 403; }
location /api/ {
 proxy_pass http://127.0.0.1:46125;
 proxy_set_header Host $host;
 proxy_set_header X-Real-IP $remote_addr;
 proxy_read_timeout 120s;
 add_header X-Content-Type-Options nosniff always;
}
location /data/ { alias /opt/worldmonitor/dist/data/; }
location /map-styles/ { alias /opt/worldmonitor/dist/map-styles/; }
location /textures/ { alias /opt/worldmonitor/dist/textures/; }
location /fonts/ { alias /opt/worldmonitor/dist/fonts/; }
location = /worldmonitor-source { return 302 /worldmapp/source.tar.gz; }
''')
# Snapshot config before adding include, only to the HTTPS exit-matrix vhost.
p=Path('/etc/nginx/sites-available/default');s=p.read_text();marker='    include /etc/nginx/snippets/ssz-mcp.conf;'
if 'include /etc/nginx/snippets/worldmonitor.conf;' not in s:
 if marker not in s:raise RuntimeError('Expected vhost marker absent; stop before mutation')
 shutil.copy2(p,conf/'nginx-default.before-worldmonitor')
 p.write_text(s.replace(marker,marker+'\n    include /etc/nginx/snippets/worldmonitor.conf;',1))
subprocess.run(['nginx','-t'],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
for name in ['worldmonitor-redis','worldmonitor-redis-rest','worldmonitor-api','worldmonitor-relay','worldmonitor-regional']:
 subprocess.run(['systemctl','enable','--now',name],check=True)
subprocess.run(['systemctl','reload','nginx'],check=True)
print('World Monitor services and Nginx configured')
