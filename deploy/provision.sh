#!/usr/bin/env bash
# OS-level provisioning for a dedicated File → Factory Studio EC2.
#
# Modeled on plyworks-backend/deploy/provision.sh.
# Stops short of anything needing a secret, a password or DNS: the environment
# file, the Basic-auth password, and certbot are left to a follow-up step.
#
# Idempotent — safe to re-run.

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

step() { printf '\n===== %s =====\n' "$1"; }

step "apt update"
sudo add-apt-repository -y universe
sudo apt-get update -y

step "Packages"
sudo apt-get install -y \
  -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
  git curl nginx apache2-utils certbot python3-certbot-nginx \
  python3 python3-venv python3-pip

python3 --version

step "Node 22"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

step "Swap"
# t3.small-class RAM is tight once nginx, uvicorn, and an npm build share the box.
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
swapon --show
free -m | head -3

step "Config directory"
sudo install -d -m 0755 /etc/dashboard
sudo install -d -m 0755 /etc/nginx/snippets

step "Checkout"
# The repo is private, so the host authenticates with a read-only deploy key
# (~/.ssh/id_ed25519, registered on the repo) over SSH.
REPO_SSH="git@github.com:bauzwilling/hackaton26-frontend.git"
BRANCH="dashboard-v2-demo"
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null
sort -u "$HOME/.ssh/known_hosts" -o "$HOME/.ssh/known_hosts"
sudo install -d -o ubuntu -g ubuntu /opt/dashboard
if [ -d /opt/dashboard/hackaton26-frontend/.git ]; then
  git -C /opt/dashboard/hackaton26-frontend remote set-url origin "$REPO_SSH"
  git -C /opt/dashboard/hackaton26-frontend fetch origin "$BRANCH"
  git -C /opt/dashboard/hackaton26-frontend checkout "$BRANCH"
  git -C /opt/dashboard/hackaton26-frontend reset --hard "origin/$BRANCH"
else
  git clone -b "$BRANCH" "$REPO_SSH" /opt/dashboard/hackaton26-frontend
fi
git -C /opt/dashboard/hackaton26-frontend log --oneline -1

step "nginx outbound-auth snippets"
for name in boxout parts plyworks; do
  src="/opt/dashboard/hackaton26-frontend/deploy/snippets/dashboard-proxy-${name}.conf"
  dest="/etc/nginx/snippets/dashboard-proxy-${name}.conf"
  if [ ! -f "$dest" ]; then
    sudo cp "$src" "$dest"
  fi
done

step "Python venv"
if [ ! -d /opt/dashboard/venv ]; then
  sudo python3 -m venv /opt/dashboard/venv
  sudo chown -R ubuntu:ubuntu /opt/dashboard/venv
fi
/opt/dashboard/venv/bin/pip install --upgrade pip
/opt/dashboard/venv/bin/pip install -r /opt/dashboard/hackaton26-frontend/requirements.txt
/opt/dashboard/venv/bin/uvicorn --version

step "Frontend build"
cd /opt/dashboard/hackaton26-frontend/app
npm ci --ignore-scripts
npm run build

step "Done"
echo "Provisioning complete. Remaining (need secrets/DNS):"
echo "  - /etc/dashboard/concierge.env   (ANTHROPIC_API_KEY)"
echo "  - htpasswd for Basic auth"
echo "  - nginx site + certbot (needs the DNS A record)"
echo "  - outbound Flask Basic auth in /etc/nginx/snippets/dashboard-proxy-*.conf"
echo "  - systemd: sudo cp deploy/dashboard-concierge.service /etc/systemd/system/"
echo "             sudo systemctl daemon-reload && sudo systemctl enable --now dashboard-concierge"
