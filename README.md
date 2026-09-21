# music-growth-pipeline

**Do smaller artists grow their listener base faster than larger ones?**
A data pipeline + dbt project + public web app built on Last.fm data to find out — and a portfolio piece demonstrating SQL depth and data engineering fundamentals.

[![Live Site](https://img.shields.io/badge/live_site-music.deanslist.dev-8b5cf6)](https://music.deanslist.dev)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-18-336791?logo=postgresql&logoColor=white)
![dbt](https://img.shields.io/badge/dbt-postgres-FF694B?logo=dbt&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![Hetzner](https://img.shields.io/badge/hosting-Hetzner-D50C2D)

## The Finding

Across 21,732 artists tracked over 17 weekly snapshots, **median listener growth falls monotonically with starting audience size**:

| Quintile (smallest → largest) | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---|---|---|---|---|
| Median growth | **3.14%** | 2.76% | 2.36% | 2.01% | **1.96%** |

No reversals at any step. Smaller artists also carry a fatter upside tail — P90 growth in Q1 (19.61%) is over 4× Q5 (4.46%). Explore the full breakdown by artist, genre, and size band on the [live site](https://music.deanslist.dev).

*Caveat: Last.fm listener counts are cumulative all-time — "growth" means new scrobblers, not active monthly listeners.*

## Architecture

```mermaid
flowchart LR
    A[Last.fm API] -->|Python| B[(Postgres)]
    B -->|dbt staging + marts| C[(Serving layer)]
    C --> D[Next.js app<br/>music.deanslist.dev]
    C --> E[Power BI report]
    F[Cron<br/>weekly] -.triggers.-> A
```

The API only returns cumulative all-time stats, so the pipeline snapshots each artist weekly and builds a longitudinal dataset via dbt. The web app and Power BI report read from a narrow, pre-joined serving layer — never directly from the marts.

## Tech Stack

| Layer | Tool |
|---|---|
| Data source | Last.fm API (read-only, key auth) |
| Ingestion | Python |
| Storage | Postgres (self-hosted) |
| Transformation | dbt (dbt-postgres) |
| Automation | Cron (weekly, on-server) |
| Reporting | Power BI (live Postgres connection) |
| Web app | Next.js 15 (App Router, TypeScript) |
| Hosting | Hetzner Cloud behind Caddy (auto-HTTPS), deployed via `deploy.sh` |

## Data

- **37,435 artists** — 9,808 charted (seeded from Last.fm's top 10,000), 27,628 unranked (seeded via genre tags and the similarity graph)
- **17 weekly snapshots** (2026-05-10 onward, stable population)
- Artists are classified by `size_band` (listener-count buckets from `<10k` to `1M+`), not chart position

## Repository Layout

```
pipeline/   Python ingestion — shared db.py / lastfm.py, seed scripts,
            weekly snapshot job, portfolio stats generator
dbt/        dbt project — models/, analyses/, tests/, seeds/, macros/
sql/        schema.sql (idempotent) + migrations/
docs/       Findings log, web app implementation plan
data/       pipeline_stats.json (consumed by deanslist.dev at build time)
web/        Next.js app — live at music.deanslist.dev
```

## Setup

```bash
git clone https://github.com/your-username/music-growth-pipeline
cd music-growth-pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # add LASTFM_API_KEY and DATABASE_URL
psql $DATABASE_URL -f sql/schema.sql

python pipeline/seed_artists.py              # pages 500-2000
python pipeline/seed_artists.py --start 1 --end 50   # mainstream baseline
python pipeline/snapshot_artists.py
python pipeline/seed_genre_artists.py
python pipeline/seed_similar_artists.py

dbt run --project-dir dbt
```

## Automation

A cron job on the Hetzner server runs every Sunday at 9 AM UTC (`weekly_snapshot.sh`):
1. `snapshot_artists.py` — snapshots all artists
2. `dbt run` — rebuilds all models
3. `generate_stats.py` — writes `data/pipeline_stats.json`
4. `git push` — commits the updated stats JSON
5. Restarts the web app

[music.deanslist.dev](https://music.deanslist.dev) reads live from Postgres and reflects new snapshots after the weekly job (bounded by a 1-hour response cache). The app runs on Hetzner behind Caddy with auto-HTTPS; deploy with `./deploy.sh`.

## What's Next

- **Deeper longitudinal data** — snapshots continue accumulating weekly; more weeks will strengthen findings and surface longer-term trends
- **Similarity network vs growth** — do smaller artists with more cross-band connections grow faster? Currently limited by sparse similarity data for the highest-growth artists
