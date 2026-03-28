# TLS Rehearsal Operator Checklist

Step-by-step checklist for running the Caddy/TLS path on a Hetzner rehearsal VM
with a real domain. This extends the no-DNS rehearsal that already passed
(see `docs/beta/hetzner-rehearsal-run-2026-03-27.md`).

**What this proves beyond the no-DNS run:** real ACME certificate issuance,
HTTP-to-HTTPS redirect, and browser-verifiable TLS -- the last untested piece of
the single-node production deployment path.

---

## Pre-requisites

### Domain

Pick a subdomain you control. Recommendations:

| Subdomain              | When to use                       |
|------------------------|-----------------------------------|
| `beta.clawback.dev`    | If clawback.dev is acquired       |
| `demo.clawback.app`    | If clawback.app is the primary    |
| `staging.clawback.app` | Longer-lived staging environment  |

The subdomain must not already be pointed at another service.

### DNS

Create an **A record** pointing the chosen subdomain to the VM's public IPv4
address. Set TTL low for the rehearsal:

| Record | Name                | Value            | TTL  |
|--------|---------------------|------------------|------|
| A      | `beta.clawback.dev` | `<VM_PUBLIC_IP>` | 300  |

Where to set it: your domain registrar's DNS panel, or Cloudflare / Route 53 /
whatever manages the zone. If using Cloudflare, **disable the orange-cloud
proxy** (set to DNS-only / grey cloud) so Caddy can complete the ACME challenge
directly.

### Firewall

The VM must accept inbound traffic on:

| Port | Protocol | Why                                              |
|------|----------|--------------------------------------------------|
| 80   | TCP      | ACME HTTP-01 challenge (Let's Encrypt validation) |
| 443  | TCP      | HTTPS traffic                                    |
| 443  | UDP      | HTTP/3 (QUIC) -- optional but exposed by Caddy   |
| 22   | TCP      | SSH access (already open from no-DNS run)         |

Hetzner's default firewall allows all inbound. If you added a restrictive
firewall via the Hetzner console or `hcloud`, ensure 80 and 443 are open.

### Hetzner VM

Already proven from the no-DNS run:

- cpx31, ubuntu-24.04, location ash
- Docker and Compose installed via cloud-init
- Repo synced and production stack builds successfully
- All services reach healthy, acceptance passes 17/17

You can reuse the same provisioning path:

```bash
HCLOUD_TOKEN=... ./scripts/provision-hetzner-rehearsal.sh
```

Or create a fresh VM and run acceptance without TLS first to confirm the
baseline, then layer TLS on top.

---

## Environment Variables

### TLS-specific variables

These two variables control Caddy's behavior and the control-plane's
CORS/cookie origin:

```bash
CLAWBACK_DOMAIN=beta.clawback.dev
CONSOLE_ORIGIN=https://beta.clawback.dev
```

**How they interact:**

- `CLAWBACK_DOMAIN` is injected into the Caddyfile as the server block hostname.
  Caddy sees a real domain (not `localhost`) and automatically enables ACME with
  Let's Encrypt, obtaining a TLS certificate for that hostname.
- `CONSOLE_ORIGIN` must be `https://<CLAWBACK_DOMAIN>`. The control-plane uses
  it for CORS headers and cookie domain. If this is wrong, browser requests will
  fail with CORS errors or cookies won't attach.
- `CONTROL_PLANE_INTERNAL_URL` stays `http://control-plane:3001` -- this is
  container-to-container and does not go through Caddy.

### Full .env for the TLS case

Start from `.env.prod.example` and set at minimum:

```bash
# -- Required secrets (generate with: openssl rand -hex 24) --
POSTGRES_PASSWORD=<random>
MINIO_ROOT_PASSWORD=<random>
OPENCLAW_GATEWAY_TOKEN=<random>
COOKIE_SECRET=<random-32-chars>
CLAWBACK_RUNTIME_API_TOKEN=<random>
CLAWBACK_APPROVAL_SURFACE_SECRET=<random>

# -- Model provider --
OPENAI_API_KEY=sk-...

# -- TLS / domain --
CLAWBACK_DOMAIN=beta.clawback.dev
CONSOLE_ORIGIN=https://beta.clawback.dev

# -- Internal plumbing (do not change) --
CONTROL_PLANE_INTERNAL_URL=http://control-plane:3001
```

---

## Caddy Behavior

### What Caddy does automatically

- Obtains a TLS certificate from Let's Encrypt via the ACME HTTP-01 challenge
  (serves a token on port 80, Let's Encrypt verifies it, then issues the cert)
- Redirects all HTTP (port 80) requests to HTTPS (port 443)
- Renews the certificate before expiry (typically 30 days before the 90-day
  Let's Encrypt expiry)
- Stores certificates in the `caddy-data` Docker volume

### First boot timing

On first start with a new domain, expect a 5-15 second delay before the site
serves HTTPS. During this window:

- Port 443 may return a TLS handshake error or connection refused
- Caddy logs will show the ACME negotiation in progress
- Once the cert is issued, HTTPS works immediately

### If DNS is not ready yet

Caddy will attempt the ACME challenge and fail because Let's Encrypt cannot
reach port 80 at the domain. Caddy retries with exponential backoff. You do
**not** need to restart Caddy after fixing DNS -- it will retry on its own.
However, if you want to force an immediate retry:

```bash
docker compose -f docker-compose.prod.yml restart caddy
```

### Certificate persistence

The `caddy-data` volume holds issued certificates. As long as this volume
survives across `docker compose down` / `up` cycles, Caddy will not re-request
certificates. If you prune the volume, Caddy will obtain a fresh cert on next
start.

---

## Operator Checklist

### 1. Provision VM

```bash
HCLOUD_TOKEN=... ./scripts/provision-hetzner-rehearsal.sh
```

Record the public IP from the output.

**Verify:**

```bash
ssh root@<VM_IP> 'docker --version && docker compose version'
```

### 2. Set DNS A record

In your DNS provider, create:

```
beta.clawback.dev  A  <VM_IP>  TTL=300
```

**Verify propagation (run from your local machine):**

```bash
dig +short beta.clawback.dev
# Expected: <VM_IP>
```

If using a new subdomain, propagation usually takes 1-5 minutes with a low TTL.
Wait until `dig` returns the correct IP before proceeding.

### 3. Open firewall ports

If you added a Hetzner firewall, ensure ports 80 and 443 are open. With the
default (no firewall), skip this step.

**Verify (from local machine):**

```bash
nc -zv <VM_IP> 80   # should report open or connection refused (not timeout)
nc -zv <VM_IP> 443
```

A "connection refused" is fine at this stage -- it means the port is reachable
but nothing is listening yet. A timeout means the firewall is blocking.

### 4. Prepare .env on the VM

SSH into the VM and create the `.env` file in the repo directory:

```bash
ssh root@<VM_IP>
cd /root/clawback
cp .env.prod.example .env
# Edit .env: set all required secrets and the TLS variables
```

Key values to set:

```bash
CLAWBACK_DOMAIN=beta.clawback.dev
CONSOLE_ORIGIN=https://beta.clawback.dev
```

### 5. Start the stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

### 6. Watch Caddy obtain the certificate

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Look for:

- `"msg":"using ACME account"` -- Caddy is starting the ACME flow
- `"msg":"successfully downloaded available certificate chains"` -- cert issued
- `"msg":"certificate obtained successfully"` -- done

If you see `"msg":"challenge failed"` with an HTTP error, DNS is not resolving
or port 80 is blocked. Check steps 2 and 3.

### 7. Verify TLS from your local machine

```bash
# HTTPS responds with valid cert
curl -I https://beta.clawback.dev
# Expected: HTTP/2 200 (or 302 redirect to /login)

# HTTP redirects to HTTPS
curl -I http://beta.clawback.dev
# Expected: HTTP/1.1 301 or 308, Location: https://beta.clawback.dev/

# Certificate details
openssl s_client -connect beta.clawback.dev:443 -servername beta.clawback.dev </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates
# Expected: issuer contains "Let's Encrypt", dates are valid
```

### 8. Verify application health

```bash
# Control-plane health (from the VM, since 3001 is 127.0.0.1-only)
ssh root@<VM_IP> 'curl -s http://127.0.0.1:3001/healthz'
ssh root@<VM_IP> 'curl -s http://127.0.0.1:3001/readyz'

# Console via public HTTPS
curl -s -o /dev/null -w '%{http_code}' https://beta.clawback.dev/login
# Expected: 200
```

### 9. Bootstrap and smoke test

1. Open `https://beta.clawback.dev/setup` in a browser
2. Create the first admin account
3. Log in and confirm the dashboard loads over HTTPS

Optional scripted verification:

```bash
CONTROL_PLANE_URL=https://beta.clawback.dev ./scripts/public-try-verify.sh
```

---

## After the Run

### Record results

Copy the run note template and fill it in:

```bash
cp docs/beta/hetzner-rehearsal-run-note-template.md \
   docs/beta/hetzner-tls-rehearsal-run-YYYY-MM-DD.md
```

Additional fields to record for a TLS run:

- Domain used
- Time from stack start to cert issuance
- Whether HTTP-to-HTTPS redirect worked
- Certificate issuer and expiry from `openssl s_client`
- Any ACME failures and how they resolved

### Destroy the VM

```bash
./scripts/destroy-hetzner-rehearsal.sh --server <SERVER_ID>
```

Or if you used `--destroy-on-success` during provisioning, it is already gone.

DNS cleanup: remove or update the A record so it does not point at a dead IP.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Caddy logs: `challenge failed` | DNS not resolving to VM IP, or port 80 blocked | Verify `dig` returns correct IP; check firewall |
| `curl: (35) SSL connect error` | Caddy still obtaining cert | Wait 15-30s and retry; check caddy logs |
| HTTPS works but browser shows cert warning | Caddy fell back to self-signed (ACME failed) | Check caddy logs for ACME errors; fix DNS/firewall and restart caddy |
| Console loads but API calls fail (CORS) | `CONSOLE_ORIGIN` does not match the actual URL | Ensure `CONSOLE_ORIGIN=https://<CLAWBACK_DOMAIN>` and restart control-plane |
| `too many certificates already issued` | Let's Encrypt rate limit (5 per week per domain) | Use a different subdomain or wait; consider Let's Encrypt staging for repeated tests |
| Port 80 timeout from local machine | Hetzner firewall or cloud firewall blocking | Check `hcloud firewall list` and ensure rules allow 80/443 inbound |
