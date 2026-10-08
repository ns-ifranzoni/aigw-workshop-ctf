# Netskope AI Gateway — Workshop & CTF

Self-hosted portal for running a Netskope AI Gateway workshop and Capture-the-Flag,
all in one container: participant chat (secured vs. direct routing), challenges,
leaderboard, prompt library and an admin panel.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- `git`

## Install

```bash
git clone https://github.com/ns-ifranzoni/aigw-workshop-ctf.git
cd aigw-workshop-ctf
docker compose up -d --build
```

The first build compiles native dependencies and takes a couple of minutes.

### Install on a server (Amazon Linux 2023 / Ubuntu)

`install.sh` does an unattended install on a fresh **Amazon Linux 2023** or
**Ubuntu/Debian** host (auto-detected, x86_64 and arm64). It installs Docker,
deploys the app and publishes it on **HTTPS (443)** through Caddy with a
self-signed certificate; the app itself only listens on `127.0.0.1:3001`.

Open inbound TCP **80** and **443** in the Security Group first, then, on the server:

```bash
# While the repository is private, a GitHub token with read access is required
# (fine-grained: Contents = Read; classic: scope "repo").
export GITHUB_TOKEN=<your-token>

curl -fsSL -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/ns-ifranzoni/aigw-workshop-ctf/main/install.sh -o install.sh
sudo GITHUB_TOKEN="$GITHUB_TOKEN" bash install.sh
```

When it finishes it prints the URL (`https://<public-dns>`). The browser warns
about the self-signed certificate once; the connection is still encrypted.

> **Set the admin password immediately.** The admin account has no password
> until someone sets it, so whoever opens the portal first claims it. Keep the
> Security Group restricted to your own IP until you have done so.

Optional environment variables (all have defaults):

| Variable | Default | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | — | Read access to the repo (needed while it is private). Sent as an HTTP header, never written to disk |
| `BRANCH` | `main` | Branch to deploy |
| `APP_DIR` | `/opt/aigw-workshop-ctf` | Install location (`data/` lives inside it) |
| `APP_PORT` | `3001` | Internal app port |
| `DOMAIN` | auto-detected on EC2 | Hostname/IP shown in the final message |
| `ENABLE_PROXY` | `1` | `0` skips Caddy and publishes the app on `0.0.0.0:APP_PORT` |
| `HTTP_MODE` | `redirect` | `plain` serves the app over HTTP on port 80 instead of redirecting to HTTPS |
| `SYSTEM_UPGRADE` | `0` | `1` also runs a full OS package upgrade |

Pass them with `sudo`, e.g. `sudo GITHUB_TOKEN="$GITHUB_TOKEN" BRANCH=main bash install.sh`.

> On EC2 the public IP and DNS name change when the instance is stopped and
> started. Attach an **Elastic IP** if you point your own DNS name at it.

## Access

Open **http://localhost:3001** and log in.

The default admin username is **`ADMIN-2026`**. It ships **without a password**:
the first time you sign in with it, the portal asks you to set one. There is no
default admin password to change or leak.

The admin **API token** (used for `/api-docs` and the admin API) is likewise
generated per install, not shipped with the code. Read or rotate it in
**Admin → Admins → View / copy API token**.

On first login the **setup wizard** walks you through the Netskope tenant,
AI Gateway URL and API token. You can skip it and configure later from
**Admin → Settings**.

## Updating

Use **Admin → About → Update now** in the portal — it pulls the latest code
from GitHub and restarts the container in place. No terminal needed.

> Only when the base image or dependencies change (rare) do you need a manual
> rebuild: `git pull && docker compose up -d --build`.

**Servers installed with `install.sh`:** while the repository is private, the
in-app **Update now** cannot reach GitHub. Update from the host instead; it
pulls the latest code, rebuilds and keeps `data/`:

```bash
export GITHUB_TOKEN=<your-token>
curl -fsSL -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/ns-ifranzoni/aigw-workshop-ctf/main/install.sh -o install.sh
sudo GITHUB_TOKEN="$GITHUB_TOKEN" bash install.sh
```

## Data & persistence

The SQLite database lives in `./data` on the host (bind-mounted into the
container), so it survives updates and container recreation. Back it up by
copying `data/data.db`.

## Useful commands

```bash
docker compose logs -f          # follow logs
docker compose restart          # restart
docker compose down             # stop & remove the container (data is kept in ./data)
```

## Configuration

- **Port:** edit the `ports` mapping in `docker-compose.yml` (default `3001:3001`).
- **Netskope tenant / gateway / API token:** configured in-app via the setup
  wizard or Admin → Settings — no `.env` file required.

## API docs

Interactive OpenAPI docs are served at **http://localhost:3001/api-docs**
(authenticate with an admin API token).
