#!/usr/bin/env bash
# One-time (and safe to re-run) setup of the TalloCPA n8n server on an Oracle
# Always Free Ubuntu 24.04 Arm VM. Run from the folder holding this script,
# docker-compose.yml and Caddyfile:   bash setup.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Swap (keeps n8n/Postgres from being OOM-killed)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Security updates + fail2ban"
sudo apt-get update -y
sudo apt-get install -y fail2ban unattended-upgrades openssl

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

echo "==> OS firewall: allow 80/443 (Oracle images reject new inbound by default)"
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    # Insert just above Oracle's catch-all REJECT so the rule actually takes effect.
    pos=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    sudo iptables -I INPUT "${pos:-1}" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
done
sudo netfilter-persistent save

echo "==> Secrets (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
  chmod 600 .env
  echo "    Created .env — BACK UP N8N_ENCRYPTION_KEY somewhere safe (password manager)."
fi
grep -q '^N8N_ENCRYPTION_KEY=.\+' .env || { echo "N8N_ENCRYPTION_KEY is empty in .env"; exit 1; }
grep -q '^POSTGRES_PASSWORD=.\+' .env || { echo "POSTGRES_PASSWORD is empty in .env"; exit 1; }

echo "==> Start Caddy + n8n + Postgres"
sudo docker compose up -d
sudo docker compose ps

domain=$(grep '^N8N_DOMAIN=' .env | cut -d= -f2)
echo
echo "Done. Open https://${domain} to create the n8n owner account."
echo "If HTTPS fails: check the DNS A record and the VCN security list (ports 80, 443)."
