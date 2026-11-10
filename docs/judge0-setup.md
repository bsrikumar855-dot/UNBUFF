# Judge0 setup guide (code judging for DSA)

UNBLUFF runs and judges student code only inside **Judge0**, a separate sandboxed service you operate. Until it exists and passes the
smoke test, production reports code Run/Submit as "unavailable" and no DSA result counts. This guide takes you from a blank server to
`EXECUTION_PROVIDER_VERIFIED=true`.

> **Status:** written from Judge0's own published instructions (v1.13.1, the current CE release) and from how this repository's adapter
> talks to it. It has **not** been run end to end on a real server by the author, so treat the first run as a test and expect to adjust.
> Judge0 facts below come from its changelog, API docs and `judge0.conf`; where something may differ on your server it says so.

## What you are building

```
students ──▶ UNBLUFF backend (Render) ──HTTPS + token──▶ Judge0 server (your VM)
                                                          ├─ API + workers (privileged containers, sandboxed runs)
                                                          ├─ PostgreSQL, Redis
                                                          └─ Caddy (TLS), firewall
```

The backend adapter (`backend/src/code/judge0.ts`) sends a program with `base64_encoded`, polls `GET /submissions/{token}` and never
asks Judge0 to enable network access. It discovers languages from `GET /languages` by name, so language ids are never hard-coded.

## 0. Decide and budget

- **A server of its own.** Judge0 runs privileged containers; a sandbox escape would reach the host. Put nothing else on it
  (no database with other data, no other apps).
- **Size:** start with 2 vCPU and 4 GB RAM and 20 GB disk (an estimate for a beta of tens of students; measure and resize).
  Typical monthly cost of such a VM is roughly USD 10 to 25 depending on provider (estimate, check current prices).
- **A domain name** you can point at it (for HTTPS), e.g. `judge.<your-domain>`.
- **Not possible on:** the free Render tier, WSL2, Docker Desktop, or managed container hosts that cannot give the host **cgroup v1**
  (Judge0 1.13.1 needs it). You need a plain Linux VM whose boot settings you control (DigitalOcean, Hetzner, AWS EC2, GCP Compute Engine,
  Azure VM, etc.).
- **Alternative with no server:** a hosted Judge0 (judge0.com / RapidAPI plans) speaks the same API. The adapter would work with a different
  `JUDGE0_URL` and token, but check that the provider's URL is https and that the plan's limits fit your usage.

## 1. Create the server

1. Create an **Ubuntu 22.04** VM (Judge0 recommends it). Add your SSH key; disable password login.
2. Point a DNS **A record** for `judge.<your-domain>` at the VM's public IP.
3. Firewall (cloud firewall and/or `ufw`): allow **22** (SSH, ideally only from your IP), **80** and **443** (Caddy). Do **not** expose Judge0's own port
   **2358** publicly; Caddy reaches it on localhost.

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 2. Switch the host to cgroup v1 (required for Judge0 1.13.1)

From Judge0's changelog for Ubuntu 22.04:

```bash
sudo nano /etc/default/grub
# add systemd.unified_cgroup_hierarchy=0 inside the value of GRUB_CMDLINE_LINUX, e.g.
# GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
sudo update-grub
sudo reboot
```

After the reboot confirm it took effect: `stat -fc %T /sys/fs/cgroup` should print `tmpfs` (cgroup v1), not `cgroup2fs`.
If it prints `cgroup2fs`, Judge0 will fail with isolate/cgroup errors; fix this before going on.

## 3. Install Docker

Follow Docker's official instructions for Ubuntu ("Install Docker Engine" and the Compose plugin), then check `docker compose version`.

## 4. Download and configure Judge0

```bash
cd ~
wget https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip
sudo apt-get install -y unzip && unzip judge0-v1.13.1.zip && cd judge0-v1.13.1
openssl rand -hex 16     # use once for REDIS_PASSWORD
openssl rand -hex 16     # use once for POSTGRES_PASSWORD
openssl rand -hex 32     # use once for AUTHN_TOKEN (this is the secret UNBLUFF will send)
nano judge0.conf
```

In `judge0.conf` set at least:

| Setting | Value | Why |
| --- | --- | --- |
| `REDIS_PASSWORD` | the first random value | queue password |
| `POSTGRES_PASSWORD` | the second random value | database password |
| `AUTHN_TOKEN` | the third random value | **Without it, anyone who reaches the server can run code.** The header is `X-Auth-Token` unless you also set `AUTHN_HEADER`. |
| `JUDGE0_TELEMETRY_ENABLE` | `false` | optional; telemetry is on by default |

Keep the three values in your password manager; the token goes into Render later (a secret: never commit it).

Limits: UNBLUFF sends its own per-run limits (2 s CPU, 128 MB by default for the practice problems), which must not exceed Judge0's
maximums. Judge0's defaults (2 s CPU, 128 MB memory) match. After the first start, `GET /config_info` (needs the token header) shows the
effective limits.

Optionally restrict who may call the API: Judge0 supports `ALLOW_IP` in `judge0.conf` (added in v1.6.0). Use it only if your backend host has fixed outbound IPs (Render
shows them for paid plans); otherwise rely on the token.

## 5. Start it

```bash
sudo docker compose up -d db redis
sleep 10
sudo docker compose up -d
sudo docker compose ps         # server and workers should be "running"
curl -s -H "X-Auth-Token: <AUTHN_TOKEN>" http://127.0.0.1:2358/languages | head -c 300
```

You should see a JSON list of languages. Without the header you should get an authentication error. If the worker logs mention `box.c` or
cgroups, see Troubleshooting.

## 6. Put HTTPS in front (Caddy)

The backend refuses a non-HTTPS `JUDGE0_URL` in production. Install Caddy (official apt instructions at caddyserver.com) and set `/etc/caddy/Caddyfile`:

```
judge.<your-domain> {
    reverse_proxy 127.0.0.1:2358
}
```

Then `sudo systemctl reload caddy`. Caddy obtains and renews the certificate itself (DNS must already point at the server, ports 80 and 443 open).
Check from your own computer: `curl -s -H "X-Auth-Token: <token>" https://judge.<your-domain>/languages | head -c 200`.

## 7. Connect UNBLUFF and run the smoke test

On your computer, from `backend/`:

```bash
EXECUTION_PROVIDER=judge0 \
JUDGE0_URL=https://judge.<your-domain> \
JUDGE0_AUTH_TOKEN=<AUTHN_TOKEN> \
npm run smoke:judge0
```

It lists the service's languages, runs `2 + 3` in each of Python, JavaScript, C++ and Java inside the sandbox, expects `5`, and checks that
broken C++ and Java report a compilation error. The token is never printed. Exit code 0 means every required check passed. If a language the
product offers is missing on your server, the product simply does not show it (language ids are matched by name, e.g. "Python (3.x)",
"JavaScript (Node.js …)", "C++ (GCC …)", "Java (OpenJDK …)").

## 8. Turn it on in production

In Render (Environment): `EXECUTION_PROVIDER=judge0`, `JUDGE0_URL=https://judge.<your-domain>`, `JUDGE0_AUTH_TOKEN=<token>` (secret).
Deploy, then open a practice problem on the live site, press Run on a sample, then Submit a correct solution.
Only when that works end to end set **`EXECUTION_PROVIDER_VERIFIED=true`** (that flag is yours to set; a smoke pass does not set it). Until it is `true`,
judged submissions are excluded from analytics because a stand-in cannot be told apart from a real service.

Confirm with `npm run preflight -- <your production env>`: the "judging off" warning should be gone.

## 9. Keeping it healthy

- **Monitoring:** an uptime check on `https://judge.<your-domain>/languages` with the token header (or any monitor that can send a header), plus your normal VM disk/CPU alerts.
- **Capacity:** the backend queues and polls with a deadline (`CODE_JUDGE_DEADLINE_MS`, default 60 s). If students wait too long at peak times, give the VM more CPU and
  run more workers (see Judge0's documentation for scaling workers).
- **Disk:** Judge0 keeps submissions in its database; clear old ones now and then (or resize the disk).
- **Updates:** follow Judge0 releases; read the changelog before upgrading (the cgroup requirement changed between major versions).
- **Security:** keep the OS patched; keep SSH key-only; never reuse the token elsewhere; rotate it by editing `AUTHN_TOKEN`, restarting Judge0, and updating Render.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Workers fail with cgroup / isolate errors | The host is still on cgroup v2. Redo step 2 and reboot; newer systemd (256+) may need an extra flag; use Ubuntu 22.04 as Judge0 advises. |
| `box.c ... cannot be created`, null results | The worker is not privileged. Make sure `privileged: true` is set for the server and worker services in `docker-compose.yml` (the release file has it). |
| Every request returns 401/403 | Token mismatch. The header name is `X-Auth-Token` unless you set `AUTHN_HEADER`; if you renamed it, also set `JUDGE0_AUTH_HEADER` in the backend. |
| `JUDGE0_URL must use https in production` | The backend refuses plain http. Finish step 6. |
| Smoke test can list languages but runs time out | The worker is not running or is starved; `docker compose ps`, `docker compose logs worker`, and check CPU/RAM. |
| Run works but Submit says unavailable | `EXECUTION_PROVIDER_VERIFIED` is not `true`, or the question has no hidden suite (company catalogue questions never have one). |
