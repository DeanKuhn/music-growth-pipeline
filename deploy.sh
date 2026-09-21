#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-bibba@music.deanslist.dev}"

echo "Deploying to $HOST..."

ssh "$HOST" 'bash -s' <<'REMOTE'
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
