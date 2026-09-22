#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-bibba@music.deanslist.dev}"

echo "Deploying to $HOST..."

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/music-growth-pipeline
git pull --ff-only
echo "Deploy complete."
REMOTE

echo "Done."
