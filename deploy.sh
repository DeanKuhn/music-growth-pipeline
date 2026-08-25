#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-ubuntu@music.deanslist.dev}"
KEY="${DEPLOY_KEY:-~/.ssh/bibbas-server.pem}"

echo "Deploying to $HOST..."

ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/music-growth-pipeline
git pull --ff-only
cd web
npm install --production
npm run build
sudo systemctl restart music-web
echo "Deploy complete — checking service..."
sleep 2
systemctl is-active music-web
REMOTE

echo "Done."
