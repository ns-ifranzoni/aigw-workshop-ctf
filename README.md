# Netskope AI Gateway — Workshop & CTF

Self-hosted portal for running a Netskope AI Gateway workshop and Capture-the-Flag,
all in one container: participant chat (secured vs. direct routing), challenges,
leaderboard, prompt library and an admin panel.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- `git`

## Install

```bash
git clone https://github.com/ns-ifranzoni/aigwworkshopctf.git
cd aigwworkshopctf
docker compose up -d --build
```

The first build compiles native dependencies and takes a couple of minutes.

## Access

Open **http://localhost:3001** and log in.

The default admin username is **`ADMIN-2026`**. It ships **without a password**:
the first time you sign in with it, the portal asks you to set one. There is no
default admin password to change or leak.

On first login the **setup wizard** walks you through the Netskope tenant,
AI Gateway URL and API token. You can skip it and configure later from
**Admin → Settings**.

## Updating

Use **Admin → About → Update now** in the portal — it pulls the latest code
from GitHub and restarts the container in place. No terminal needed.

> Only when the base image or dependencies change (rare) do you need a manual
> rebuild: `git pull && docker compose up -d --build`.

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
