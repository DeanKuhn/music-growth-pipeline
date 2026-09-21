#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$HOME/music-growth-pipeline"
LOG_FILE="$REPO_DIR/logs/weekly_snapshot.log"
mkdir -p "$(dirname "$LOG_FILE")"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== Weekly snapshot started at $(date -u) ==="

cd "$REPO_DIR"

# Load environment
set -a
source .env
set +a

# Compute snapshot date (anchored to current week's Sunday)
SNAPSHOT_DATE=$(python3 -c "
import sys; sys.path.insert(0, 'pipeline')
from snapshot_artists import week_anchor
print(week_anchor().isoformat())
")
echo "Snapshot date: $SNAPSHOT_DATE"

# 1. Snapshot artists
python3 pipeline/snapshot_artists.py --date "$SNAPSHOT_DATE"

# 2. dbt run
dbt run --project-dir dbt

# 3. Generate portfolio stats
python3 pipeline/generate_stats.py

# 4. Commit and push stats if changed
git add data/pipeline_stats.json
if ! git diff --staged --quiet; then
  git commit -m "chore: update pipeline stats (snapshot $SNAPSHOT_DATE)"
  git pull --rebase
  git push
  echo "Stats committed and pushed."
else
  echo "No stats changes to commit."
fi

# 5. Restart web app so it picks up fresh data
sudo systemctl restart music-web

echo "=== Weekly snapshot completed at $(date -u) ==="
