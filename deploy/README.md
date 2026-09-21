# Production deploy assets

Dedicated File → Factory Studio demo on its own EC2, intended as
**https://dashboard.datab.at**. Modeled on `plyworks-backend/deploy`: Ubuntu
host, nginx + certbot by hand, systemd for concierge, GitHub Actions SSH that
`git reset --hard` and builds **on the box**.

Every push to **`dashboard-v2-demo`** deploys (plus `workflow_dispatch`). `dev`
does not. After review, the workflow file must live at
[`.github/workflows/deploy.yaml`](../.github/workflows/deploy.yaml). If an
OAuth-app push rejects a new workflow, keep a copy as `deploy.yaml.disabled`
and copy it into `.github/workflows/` from a PAT, as Plyworks did.

This is a **new host** — not the Plyworks or Simple Parts box. Fill the instance
id, Elastic IP, and DNS row below once the instance exists.

## Configuration

| | value |
|---|---|
| Checkout | `/opt/dashboard/hackaton26-frontend` |
| Deploy branch | `dashboard-v2-demo` |
| Environment file | `/etc/dashboard/concierge.env` (`root:ubuntu`, `0640`) |
| Service | `dashboard-concierge.service` → uvicorn on `127.0.0.1:8000` |
| Web root | `/opt/dashboard/hackaton26-frontend/app/dist` |
| Auth | nginx Basic auth (`/etc/nginx/.htpasswd`); the SPA login is a fixture |
| Flask stand-ins | BoxOut `http://13.51.80.211`, Simple Parts `http://13.63.222.45`, Plyworks `http://13.51.215.205` (WAITING BFF) |
| Instance / EIP | _TBD_ |
| DNS | `dashboard.datab.at` → EIP (_TBD_) |

The nginx config is recorded as [`nginx-dashboard.conf`](nginx-dashboard.conf),
but it is **not** copied by the deploy — see [nginx](#nginx) below.

## Secrets

Repository-level secrets (no `environment:` on the workflow):

| Secret | Value |
|---|---|
| `EC2_HOST` | Elastic IP of the dashboard box |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | private key PEM for the host |
| `CONCIERGE_ENV_B64` | `base64 -w0 concierge.env` — see [`concierge.env.example`](concierge.env.example) |

Flask Basic-auth passwords for the **outbound** nginx proxies live in
`/etc/nginx/snippets/dashboard-proxy-*.conf` on the host, not in
`CONCIERGE_ENV_B64` and never in a `VITE_` variable.

### Rotating concierge.env

The environment file is the deploy's source of truth, so **never edit the host
in place** — the next deploy overwrites it.

```bash
scp -i <key.pem> ubuntu@<EC2_HOST>:/etc/dashboard/concierge.env ./concierge.env
$EDITOR concierge.env
base64 -w0 concierge.env          # macOS: base64 -b0 concierge.env
gh secret set CONCIERGE_ENV_B64 --repo bauzwilling/hackaton26-frontend
gh workflow run "Deploy dashboard" --ref dashboard-v2-demo
shred -u concierge.env            # macOS: rm -P concierge.env
```

Until `CONCIERGE_ENV_B64` is set, the workflow leaves `/etc/dashboard` alone and
the unit's `EnvironmentFile=-` falls back to a gitignored `.env` in the
checkout (`config.py` `load_dotenv`). systemd values win once the file exists.

## nginx

[`nginx-dashboard.conf`](nginx-dashboard.conf) is the starting site config
(port 80). Install it by hand, then let certbot add TLS after DNS exists:

```bash
sudo cp deploy/nginx-dashboard.conf /etc/nginx/sites-available/dashboard
sudo ln -sf /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/dashboard
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d dashboard.datab.at
```

**The deploy workflow does not install it.** nginx is the only thing serving the
site, certbot rewrites this file in place on renewal, and a syntax error in a
reloaded config takes everything down.

After certbot has written the TLS block, recapture the live file into
`deploy/nginx-dashboard.conf` so the repo matches the box.

> **Never syntax-check this file with a synthetic main config**, e.g.
> `nginx -t -c /tmp/main.conf` where that config wraps this one in a bare
> `http {}` with no `user` directive. nginx chowns its temp paths during a
> config test, so a userless test config silently changes
> `/var/lib/nginx/body` to `nobody:root`. Recover with:
>
> ```bash
> sudo chown www-data:root /var/lib/nginx/body && sudo chmod 700 /var/lib/nginx/body
> ```

Outbound Flask Basic auth (optional includes created by [`provision.sh`](provision.sh)):

```bash
# one line each, e.g.  proxy_set_header Authorization "Basic …";
sudoedit /etc/nginx/snippets/dashboard-proxy-boxout.conf
sudoedit /etc/nginx/snippets/dashboard-proxy-parts.conf
sudoedit /etc/nginx/snippets/dashboard-proxy-plyworks.conf
sudo nginx -t && sudo systemctl reload nginx
```

## Health and recovery

| Endpoint | Meaning |
|---|---|
| `GET /healthz` | uvicorn is up (no Anthropic call) |

`/healthz` is exposed unauthenticated so the deploy poll and monitoring can
probe it. Without an exact-match `location =` block it falls through to the SPA
fallback and answers `200` with `index.html`.

The deploy polls loopback `/healthz` after restarting and fails the run if it
never answers, but it does **not** roll back. On a bad release, recover by hand:

```bash
cd /opt/dashboard/hackaton26-frontend
git fetch origin dashboard-v2-demo
git reset --hard <good-sha>
cd app && npm ci --ignore-scripts && npm run build
sudo systemctl restart dashboard-concierge
```

Previous copies of the service unit are kept under `/var/backups/dashboard/`
before each deploy replaces it.

Logs: `sudo journalctl -u dashboard-concierge -f`.

## First boot

[`provision.sh`](provision.sh) installs packages, swap, Node 22, a venv, clones
`dashboard-v2-demo`, and leaves nginx/certbot/secrets for a follow-up. It is
**not** run by GitHub Actions.

On the host, register a read-only deploy key (`~/.ssh/id_ed25519`) on
`bauzwilling/hackaton26-frontend` before cloning.

## What the workflow does

`appleboy/ssh-action` (same as Plyworks):

1. `git fetch` + `reset --hard origin/dashboard-v2-demo`
2. `venv/bin/pip install -r requirements.txt`
3. `cd app && npm ci --ignore-scripts && npm run build`
4. Render `/etc/dashboard/concierge.env` from `CONCIERGE_ENV_B64` if set
5. Install `dashboard-concierge.service`, restart, poll `http://127.0.0.1:8000/healthz`
