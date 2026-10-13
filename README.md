# music-growth-pipeline

A data pipeline + dbt project + public web app built on Last.fm data, tracking listener growth for artists over time.

[![Live Site](https://img.shields.io/badge/live_site-music.deanslist.dev-8b5cf6)](https://music.deanslist.dev)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-18-336791?logo=postgresql&logoColor=white)
![dbt](https://img.shields.io/badge/dbt-postgres-FF694B?logo=dbt&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![Hetzner](https://img.shields.io/badge/hosting-Hetzner-D50C2D)

## The Finding

Across 37,430 artists measured over the same 10-week window (2026-08-09 → 2026-10-11), **median listener growth falls as starting audience size rises**, and the **smallest artists have the fattest right tail**:

| Starting-listener quintile (smallest → largest) | Q1 | Q2 | Q3 | Q4 | Q5 |
|---|---|---|---|---|---|
| Median growth | **0.77%** | 0.66% | 0.61% | 0.59% | 0.59% |
| Average growth | **1.59%** | 1.26% | 1.11% | 0.93% | 0.80% |
| P90 growth | **3.36%** | 2.91% | 2.57% | 2.02% | 1.60% |

The 21,717 artists tracked since 2026-05-10 (23 weeks) show the same pattern, more strongly: median 3.99% → 2.45%, P90 24.56% → 5.62%. Every artist is compared over an identical window — an earlier version of this table mixed 10- and 23-week histories and reported the opposite (see Issue #9 in `docs/findings.md`). Explore the full breakdown by artist, genre, and size band on the [live site](https://music.deanslist.dev).

## Architecture

```mermaid
flowchart LR
    A[Last.fm API] -->|Python| B[(Postgres)]
    B -->|dbt staging + marts| C[(Serving layer)]
    C --> D[Static site<br/>Caddy file_server]
    C --> E[Power BI report]
    F[Cron<br/>weekly] -.triggers.-> A
    D --> G[music.deanslist.dev]
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
| Web app | HTML / Tailwind CSS / vanilla JS |
| Hosting | Hetzner Cloud behind Caddy (auto-HTTPS, static file_server) |

## Data

- **37,435 artists** — 9,808 charted (seeded from Last.fm's top 10,000), 27,628 unranked (seeded via genre tags and the similarity graph)
- **Weekly snapshots** from 2026-05-10 onward (21.7k artists; expanded to 37.4k on 2026-08-09)
- Artists are classified by `size_band` (listener-count buckets from `<10k` to `1M+`), not chart position

## Repository Layout

```
pipeline/   Python ingestion — shared db.py / lastfm.py, seed scripts,
            weekly snapshot job, portfolio stats generator
dbt/        dbt project — models/, analyses/, tests/, seeds/, macros/
sql/        schema.sql (idempotent) + migrations/
docs/       Findings log, web app implementation plan
data/       pipeline_stats.json (consumed by deanslist.dev at build time)
web/        Static site — HTML, Tailwind CSS, vanilla JS
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
4. `export_json.py` — exports serving-layer data as JSON for the static site
5. `git push` — commits the updated stats JSON

[music.deanslist.dev](https://music.deanslist.dev) is served by Caddy as a static site and reflects new data after the weekly export. Deploy with `./deploy.sh`.

## What's Next

- **Deeper longitudinal data** — snapshots continue accumulating weekly; more weeks will strengthen findings and surface longer-term trends
- **Similarity network vs growth** — do smaller artists with more cross-band connections grow faster? Currently limited by sparse similarity data for the highest-growth artists
