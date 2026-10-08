#!/usr/bin/env bash
# ============================================================================
# Unattended installer for Workshop & CTF All in One (aigw-workshop-ctf).
#
# Supported hosts (auto-detected from /etc/os-release):
#   - Amazon Linux 2023           (dnf)
#   - Ubuntu 22.04 / 24.04, Debian (apt)
#   x86_64 and aarch64.
#
# What it does:
#   1. Installs Docker Engine + Compose + Buildx (skipped if already there)
#   2. Clones/updates the repo and starts the app with `docker compose`
#   3. Installs Caddy and publishes the app on HTTPS (443) with a self-signed
#      certificate; the app itself is only reachable on 127.0.0.1:3001
#
# Usage (as root, or as a user with sudo):
#   sudo ./install.sh
#   curl -fsSL <raw-url>/install.sh | sudo -E bash          # remote
#   GITHUB_TOKEN=ghp_xxx sudo -E ./install.sh               # private repo
#
# Re-running is safe: it pulls the latest code and rebuilds; ./data is kept.
#
# Configuration (environment variables, all optional):
#   GITHUB_TOKEN    Token with read access. REQUIRED while the repo is private.
#                   Never written to disk: it is only sent as an HTTP header.
#   REPO_URL        default https://github.com/ns-ifranzoni/aigw-workshop-ctf.git
#   BRANCH          default main
#   APP_DIR         default /opt/aigw-workshop-ctf
#   APP_PORT        default 3001
#   DOMAIN          Public hostname/IP shown in the final message and used as
#                   the default TLS name. Auto-detected on EC2.
#   ENABLE_PROXY    1 (default) = Caddy on 80/443; 0 = skip Caddy and publish
#                   the app directly on 0.0.0.0:APP_PORT
#   HTTP_MODE       redirect (default) = port 80 redirects to HTTPS;
#                   plain = port 80 serves the app over HTTP
#   SYSTEM_UPGRADE  0 (default) | 1 = also run a full OS package upgrade
#
# BEFORE running on EC2: open inbound TCP 80 and 443 in the Security Group.
# ============================================================================
set -euo pipefail

# ---- CONFIG ---------------------------------------------------------------
REPO_URL="${REPO_URL:-https://github.com/ns-ifranzoni/aigw-workshop-ctf.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/aigw-workshop-ctf}"
APP_PORT="${APP_PORT:-3001}"
DOMAIN="${DOMAIN:-}"
ENABLE_PROXY="${ENABLE_PROXY:-1}"
HTTP_MODE="${HTTP_MODE:-redirect}"
SYSTEM_UPGRADE="${SYSTEM_UPGRADE:-0}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
# ----------------------------------------------------------------------------

log()  { printf '==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '    [WARN] %s\n' "$*" >&2; }
die()  { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

case "${1:-}" in
  -h|--help) sed -n '2,/^# =====/p' "$0" | sed 's/^# \{0,1\}//' ; exit 0 ;;
esac

# ---- privileges -----------------------------------------------------------
if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  command -v sudo >/dev/null 2>&1 || die "Run as root or install sudo."
  SUDO="sudo -E"
fi
as_root() { $SUDO "$@"; }

# Non-interactive package managers (no debconf / needrestart prompts)
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1
# Unattended: git must fail instead of asking for a username/password
export GIT_TERMINAL_PROMPT=0

# ---- OS / architecture detection -------------------------------------------
[ -r /etc/os-release ] || die "Cannot detect the OS (/etc/os-release missing)."
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  amzn)
    [ "${VERSION_ID:-}" = "2023" ] || die "Only Amazon Linux 2023 is supported (found ${VERSION_ID:-unknown})."
    FAMILY="al2023" ;;
  ubuntu|debian)
    FAMILY="apt" ;;
  *) die "Unsupported OS '${ID:-unknown}'. Supported: Amazon Linux 2023, Ubuntu, Debian." ;;
esac

case "$(uname -m)" in
  x86_64)        ARCH_GO="amd64"; ARCH_RAW="x86_64"  ;;
  aarch64|arm64) ARCH_GO="arm64"; ARCH_RAW="aarch64" ;;
  *) die "Unsupported architecture: $(uname -m)" ;;
esac
log "Detected ${PRETTY_NAME:-$ID} (${ARCH_RAW}) -> package family: ${FAMILY}"

case "$HTTP_MODE" in redirect|plain) ;; *) die "HTTP_MODE must be 'redirect' or 'plain'." ;; esac

# ---- helpers ---------------------------------------------------------------
# Latest release tag of a GitHub repo (e.g. "v2.10.1"), API first, redirect fallback
latest_tag() {
  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/$1/releases/latest" 2>/dev/null \
         | grep -m1 '"tag_name"' | cut -d'"' -f4 || true)"
  if [ -z "$tag" ]; then
    tag="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$1/releases/latest" \
           | sed -n 's#.*/tag/##p' || true)"
  fi
  [ -n "$tag" ] || die "Could not determine the latest release of $1."
  echo "$tag"
}

# true if $1 >= $2 (dotted versions)
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

# git wrapper: sends the token as an HTTP header so it never lands in
# .git/config (the repo is copied into the Docker image) or in `ps`.
GIT_AUTH=()
if [ -n "$GITHUB_TOKEN" ]; then
  GIT_AUTH=(-c "http.extraHeader=Authorization: Basic $(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')")
fi
git_gh() { as_root git "${GIT_AUTH[@]}" "$@"; }

# ---- 1. base packages ------------------------------------------------------
log "1/7 Installing base packages"
if [ "$FAMILY" = "apt" ]; then
  APT=(apt-get -o DPkg::Lock::Timeout=300 -yq)
  as_root "${APT[@]}" update
  [ "$SYSTEM_UPGRADE" = "1" ] && as_root "${APT[@]}" upgrade
  as_root "${APT[@]}" install ca-certificates curl gnupg git tar gzip iproute2
else
  # AL2023 ships curl-minimal; installing 'curl' would conflict with it
  [ "$SYSTEM_UPGRADE" = "1" ] && as_root dnf upgrade -y
  as_root dnf install -y git tar gzip iproute
fi

# ---- 2. Docker -------------------------------------------------------------
log "2/7 Installing Docker Engine + Compose + Buildx"
PLUGIN_DIR="/usr/local/lib/docker/cli-plugins"
if ! command -v docker >/dev/null 2>&1; then
  if [ "$FAMILY" = "apt" ]; then
    as_root install -m 0755 -d /etc/apt/keyrings
    as_root curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
    as_root chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
      | as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
    as_root "${APT[@]}" update
    as_root "${APT[@]}" install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    as_root dnf install -y docker
  fi
else
  info "Docker already installed, skipping."
fi
as_root systemctl enable --now docker

# Let the invoking (non-root) user run docker after their next login
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  as_root usermod -aG docker "$SUDO_USER" || true
fi

# Compose / Buildx plugins: from the distro repo on apt, from GitHub on AL2023
as_root mkdir -p "$PLUGIN_DIR"
if ! as_root docker compose version >/dev/null 2>&1; then
  info "Installing Docker Compose plugin"
  as_root curl -fsSL -o "$PLUGIN_DIR/docker-compose" \
    "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH_RAW}"
  as_root chmod +x "$PLUGIN_DIR/docker-compose"
fi
if ! as_root docker buildx version >/dev/null 2>&1; then
  info "Installing Docker Buildx plugin"
  BUILDX_TAG="$(latest_tag docker/buildx)"
  as_root curl -fsSL -o "$PLUGIN_DIR/docker-buildx" \
    "https://github.com/docker/buildx/releases/download/${BUILDX_TAG}/buildx-${BUILDX_TAG}.linux-${ARCH_GO}"
  as_root chmod +x "$PLUGIN_DIR/docker-buildx"
fi
as_root docker --version
as_root docker compose version
COMPOSE_VER="$(as_root docker compose version --short 2>/dev/null | sed 's/^v//')"

# ---- 3. repository ---------------------------------------------------------
log "3/7 Fetching the project (${BRANCH})"
# Pre-flight: fail early with a precise reason instead of a git prompt
if ! git_gh ls-remote --exit-code --heads "$REPO_URL" "$BRANCH" >/dev/null 2>&1; then
  if [ -z "$GITHUB_TOKEN" ]; then
    die "Cannot read $REPO_URL and GITHUB_TOKEN is empty. The repo is private: export GITHUB_TOKEN, and if you use sudo pass it explicitly:  sudo GITHUB_TOKEN=\"\$GITHUB_TOKEN\" bash install.sh"
  fi
  API_REPO="$(printf '%s' "$REPO_URL" | sed -E 's#^https://github.com/##; s#\.git$##')"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
          -H "Authorization: Bearer $GITHUB_TOKEN" "https://api.github.com/repos/${API_REPO}" || true)"
  case "$CODE" in
    401) die "GitHub rejected GITHUB_TOKEN (HTTP 401): it is invalid, expired or revoked." ;;
    403) die "GitHub denied access (HTTP 403): the token lacks permission, or the org requires SSO authorization for it." ;;
    404) die "Repository not visible with this token (HTTP 404). Give it read access to ${API_REPO} (fine-grained: Contents=Read; classic: scope 'repo')." ;;
    200) die "The token can read the repository but git could not reach branch '$BRANCH' (BRANCH=$BRANCH)." ;;
    *)   die "Cannot reach GitHub (HTTP ${CODE:-none}). Check outbound network access from this host." ;;
  esac
fi
if [ ! -d "$APP_DIR/.git" ]; then
  as_root mkdir -p "$(dirname "$APP_DIR")"
  git_gh clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR" \
    || die "Clone failed. If the repository is private, set GITHUB_TOKEN with read access."
else
  info "Repo already present at $APP_DIR, updating"
  as_root git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git_gh -C "$APP_DIR" fetch origin "$BRANCH"
  as_root git -C "$APP_DIR" checkout "$BRANCH"
  as_root git -C "$APP_DIR" merge --ff-only "origin/$BRANCH" \
    || die "Cannot fast-forward $APP_DIR (local changes?). Fix it or remove the folder and re-run."
fi
as_root git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

# ---- 4. port binding -------------------------------------------------------
log "4/7 Configuring the port binding"
cd "$APP_DIR"
SERVICE="$(as_root docker compose config --services | head -n1)"
[ -n "$SERVICE" ] || die "Could not read the service name from docker-compose.yml."
OVERRIDE="$APP_DIR/docker-compose.override.yml"
if [ "$ENABLE_PROXY" = "1" ]; then
  # Docker-published ports bypass host firewalls (ufw/firewalld), so keep the
  # app on loopback and let Caddy be the only public entry point.
  # Done with an override file so the tracked docker-compose.yml stays clean
  # and later `git pull`s never conflict.
  if version_ge "${COMPOSE_VER:-0}" "2.24.0"; then
    as_root tee "$OVERRIDE" >/dev/null <<EOF
# Generated by install.sh - keeps the app reachable only through Caddy.
services:
  ${SERVICE}:
    ports: !override
      - "127.0.0.1:${APP_PORT}:${APP_PORT}"
EOF
    if ! grep -qx 'docker-compose.override.yml' "$APP_DIR/.git/info/exclude" 2>/dev/null; then
      echo 'docker-compose.override.yml' | as_root tee -a "$APP_DIR/.git/info/exclude" >/dev/null
    fi
    info "Published as 127.0.0.1:${APP_PORT} (loopback only)."
  else
    warn "Docker Compose ${COMPOSE_VER} < 2.24: cannot use an override; the app stays published on 0.0.0.0:${APP_PORT}."
  fi
else
  as_root rm -f "$OVERRIDE"
  info "Proxy disabled: app published on 0.0.0.0:${APP_PORT} (plain HTTP)."
fi

# ---- 5. build & start ------------------------------------------------------
log "5/7 Building and starting the container (this can take a few minutes)"
as_root docker compose up -d --build

# ---- 6. Caddy --------------------------------------------------------------
if [ "$DOMAIN" = "" ]; then
  # EC2 metadata (IMDSv2); silently ignored elsewhere
  IMDS_TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
                -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' --max-time 3 2>/dev/null || true)"
  if [ -n "$IMDS_TOKEN" ]; then
    for path in public-hostname public-ipv4; do
      DOMAIN="$(curl -fsS -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" --max-time 3 \
                "http://169.254.169.254/latest/meta-data/$path" 2>/dev/null || true)"
      [ -n "$DOMAIN" ] && break
    done
  fi
  [ -n "$DOMAIN" ] || DOMAIN="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$DOMAIN" ] || DOMAIN="<this-server-address>"
fi

if [ "$ENABLE_PROXY" = "1" ]; then
  log "6/7 Installing and configuring Caddy (reverse proxy + HTTPS)"
  if ! command -v caddy >/dev/null 2>&1; then
    CADDY_TAG="$(latest_tag caddyserver/caddy)"
    TMP_DIR="$(mktemp -d)"
    curl -fsSL -o "$TMP_DIR/caddy.tar.gz" \
      "https://github.com/caddyserver/caddy/releases/download/${CADDY_TAG}/caddy_${CADDY_TAG#v}_linux_${ARCH_GO}.tar.gz"
    tar -xzf "$TMP_DIR/caddy.tar.gz" -C "$TMP_DIR" caddy
    as_root install -m 0755 "$TMP_DIR/caddy" /usr/bin/caddy
    rm -rf "$TMP_DIR"
  else
    info "Caddy already installed, skipping download."
  fi

  getent group caddy >/dev/null || as_root groupadd --system caddy
  id caddy >/dev/null 2>&1 || as_root useradd --system --gid caddy --create-home \
    --home-dir /var/lib/caddy --shell /usr/sbin/nologin --comment "Caddy web server" caddy

  as_root tee /etc/systemd/system/caddy.service >/dev/null <<'EOF'
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
Restart=on-abnormal
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
  as_root systemctl daemon-reload

  # Let's Encrypt refuses *.compute.amazonaws.com and bare IPs, so use Caddy's
  # internal CA (self-signed). default_sni makes IP-based visits (no SNI) work.
  # 127.0.0.1 instead of "localhost": the app listens on IPv4 loopback only.
  if [ "$HTTP_MODE" = "plain" ]; then
    HTTP_BLOCK="reverse_proxy 127.0.0.1:${APP_PORT}"
  else
    HTTP_BLOCK='redir https://{host}{uri} permanent'
  fi
  SNI_LINE=""
  case "$DOMAIN" in "<"*) ;; *) SNI_LINE="    default_sni ${DOMAIN}" ;; esac

  as_root mkdir -p /etc/caddy
  as_root tee /etc/caddy/Caddyfile >/dev/null <<EOF
{
${SNI_LINE}
}

:80 {
    ${HTTP_BLOCK}
}

:443 {
    tls internal {
        on_demand
    }
    reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
  as_root /usr/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null \
    || die "Generated Caddyfile is invalid (see /etc/caddy/Caddyfile)."
  as_root systemctl enable caddy
  as_root systemctl restart caddy

  # ufw is not enabled on stock Ubuntu cloud images, but open the ports if it is
  if command -v ufw >/dev/null 2>&1 && as_root ufw status 2>/dev/null | grep -q "Status: active"; then
    as_root ufw allow 80/tcp >/dev/null && as_root ufw allow 443/tcp >/dev/null
    info "ufw is active: allowed 80/tcp and 443/tcp."
  fi
else
  log "6/7 Skipping Caddy (ENABLE_PROXY=0)"
fi

# ---- 7. verification -------------------------------------------------------
log "7/7 Verifying the deployment"
CHECKS_OK=1

info "-- Container running? --"
if [ -n "$(as_root docker compose -f "$APP_DIR/docker-compose.yml" ps --status running -q 2>/dev/null)" ]; then
  as_root docker compose -f "$APP_DIR/docker-compose.yml" ps
  info "[OK] Container is up."
else
  info "[FAIL] No running container. Check: cd $APP_DIR && sudo docker compose logs"
  CHECKS_OK=0
fi

info "-- App answering on 127.0.0.1:${APP_PORT}? (waiting up to 120 s) --"
APP_UP=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${APP_PORT}/api/health" 2>/dev/null \
     || curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:${APP_PORT}/" 2>/dev/null; then APP_UP=1; break; fi
  sleep 2
done
if [ "$APP_UP" = "1" ]; then
  info "[OK] The app responds on port ${APP_PORT}."
else
  info "[FAIL] The app did not respond. Check: cd $APP_DIR && sudo docker compose logs"
  CHECKS_OK=0
fi

if [ "$ENABLE_PROXY" = "1" ]; then
  info "-- Caddy answering? --"
  sleep 2
  HTTPS_CODE="$(curl -ks -o /dev/null -w '%{http_code}' --max-time 8 --resolve "localhost:443:127.0.0.1" https://localhost/ || true)"
  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:80/ || true)"
  if [ "${HTTPS_CODE:-000}" != "000" ]; then
    info "[OK] https://localhost/ -> HTTP ${HTTPS_CODE} (self-signed, -k)."
  else
    info "[FAIL] HTTPS on 443 did not answer. Check: sudo systemctl status caddy ; sudo journalctl -u caddy -n 50"
    CHECKS_OK=0
  fi
  [ "${HTTP_CODE:-000}" != "000" ] && info "[OK] http://127.0.0.1:80/ -> HTTP ${HTTP_CODE}." \
    || { info "[FAIL] Port 80 did not answer."; CHECKS_OK=0; }
fi

if [ "$ENABLE_PROXY" = "1" ]; then URL="https://${DOMAIN}"; else URL="http://${DOMAIN}:${APP_PORT}"; fi

echo ""
echo "============================================================"
if [ "$CHECKS_OK" -eq 1 ]; then echo " Installation complete - all checks passed."
else echo " Installation finished with FAILED checks - see [FAIL] lines above."; fi
echo ""
echo " Open: ${URL}"
if [ "$ENABLE_PROXY" = "1" ]; then
  echo " The certificate is self-signed: the browser will warn once"
  echo " (Advanced -> Proceed). The connection is still TLS-encrypted."
fi
echo ""
echo " IMPORTANT: the admin account has no password until someone sets it."
echo " Open the URL NOW and set the admin password - whoever gets there"
echo " first claims the admin account. Until then, keep the Security Group"
echo " restricted to your own IP."
echo ""
echo " Data lives in ${APP_DIR}/data (kept across updates). Update with:"
echo "   sudo ./install.sh          # (or: cd ${APP_DIR} && git pull && sudo docker compose up -d --build)"
echo ""
echo " Useful commands:"
echo "   cd ${APP_DIR} && sudo docker compose logs -f   # app logs"
echo "   sudo docker compose -f ${APP_DIR}/docker-compose.yml ps"
[ "$ENABLE_PROXY" = "1" ] && echo "   sudo systemctl status caddy ; sudo journalctl -u caddy -f"
echo "============================================================"
[ "$CHECKS_OK" -eq 1 ]
