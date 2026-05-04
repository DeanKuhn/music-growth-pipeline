# music-growth-pipeline

A data engineering portfolio project analyzing listener patterns for independent artists using the Last.fm API. Built to demonstrate SQL depth, pipeline design, and data engineering fundamentals.

## Research Question

Do smaller independent artists (ranked pages 500–2000 on the Last.fm global chart) have meaningfully different listener engagement patterns than mainstream artists (pages 1–50)? And over time, does chart position correlate with listener growth? Do genre and artist similarity network position play a role?

## Why This Design

Last.fm's `chart.getTopArtists` endpoint returns a current global ranking paginated across 2,000 pages. Pages 1–50 contain household names; pages 500–2000 contain smaller independent artists with real but modest audiences — an interesting population for engagement analysis.

Since the API only returns cumulative all-time stats (no built-in time series), the pipeline snapshots each artist weekly and builds its own longitudinal dataset. Cross-sectional analysis is available immediately; longitudinal analysis accumulates over time.

## Tech Stack

| Layer | Tool |
|---|---|
| Data source | Last.fm API (read-only, key auth) |
| Ingestion | Python |
| Storage | Postgres (hosted on Neon) |
| Transformation layer | dbt (dbt-postgres) |
| Analytical queries | SQL |
| Automation | GitHub Actions (weekly cron) |

## Schema

```
artists
  id, name, mbid, created_at

weekly_charts
  id, artist_id → artists, rank, page, snapshot_date

artist_snapshots
  id, artist_id → artists, listeners, playcount, snapshot_date

genres
  id, genre, fetched_at

genre_artists
  id, genre_id → genres, artist_id → artists, rank_in_genre, fetched_at

artist_similarities
  id, artist_id → artists, similar_artist_id → artists, similar_name,
  similar_mbid, similarity_score, fetched_at
```

## Pipeline

```
chart.getTopArtists (pages 1–50 and 500–2000)
        ↓
    seed_artists.py  →  artists + weekly_charts

tag.getTopArtists (15 genres × 500 artists)
        ↓
    seed_genre_artists.py  →  genres + genre_artists

artist.getSimilar (top ~2,000 indie artists, limit 20 each)
        ↓
    seed_similar_artists.py  →  artist_similarities

artist.getInfo (all artists, weekly)
        ↓
    snapshot_artists.py  →  artist_snapshots
        ↓  (runs weekly via GitHub Actions)

raw tables
        ↓
    dbt staging models  →  stg_artists, stg_artist_snapshots,
                           stg_weekly_charts, stg_genres,
                           stg_genre_artists, stg_artist_similarities
        ↓
    dbt mart models  →  artist_tiers, genre_stats,
                        artist_similarity_network
```

## dbt Models

**Staging** — one model per source table, light renaming only. Defined in `models/staging/`.

**Marts:**

| Model | Description |
|---|---|
| `artist_tiers` | Classifies each artist as `mainstream` (min chart page ≤ 50) or `indie` |
| `genre_stats` | Per-genre summary: artist count, avg listeners, plays-per-listener ratio, mainstream vs indie breakdown |
| `artist_similarity_network` | Enriched similarity pairs with both artists' tier and a `cross_tier` / `same_tier` flag |

## Key Findings (Snapshot: 2026-04-27)

Cross-sectional analysis comparing 250 mainstream artists (pages 1–50) vs 7,505 indie artists (pages 500–2000):

**Listener counts**
| Tier | Median listeners | P90 listeners |
|---|---|---|
| Mainstream | 3,323,634 | 5,887,602 |
| Indie | 240,361 | 782,674 |

The distributions do not overlap — the top 10% of indie artists (782K) fall well below the bottom 25% of mainstream artists (2.3M).

**Plays-per-listener ratio** (total plays ÷ total listeners)
| Tier | P25 | Median | P75 |
|---|---|---|---|
| Mainstream | 48.64 | 74.76 | 112.77 |
| Indie | 11.31 | 17.69 | 29.08 |

The mainstream median ratio (74.76) is ~4x higher than indie (17.69), consistent across the full distribution. Mainstream P25 (48.64) exceeds indie P75 (29.08).

*Caveat: mainstream artists have older catalogues on average, so accumulated playcounts likely contribute to the ratio gap alongside genuine engagement differences.*

**Genre breakdown (top 5 by avg listeners)**
| Genre | Avg listeners | Avg plays/listener | Mainstream | Indie |
|---|---|---|---|---|
| alternative | 1,878,778 | 41.83 | 64 | 167 |
| rock | 1,819,865 | 36.95 | 59 | 178 |
| pop | 1,635,383 | 55.79 | 81 | 152 |
| indie | 1,540,312 | 40.12 | 59 | 180 |
| hip-hop | 1,347,606 | 42.54 | 56 | 174 |

Pop shows the highest plays-per-listener ratio despite ranking third in avg listeners — pop fans replay more.

## Setup

**Prerequisites:** Python 3.12+, PostgreSQL, a Last.fm API key, a Neon account (or any Postgres instance)

```bash
# Clone and set up environment (WSL/Linux)
git clone https://github.com/your-username/music-growth-pipeline
cd music-growth-pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure credentials
cp .env.example .env
# Edit .env: add LASTFM_API_KEY and DATABASE_URL

# Apply schema
psql $DATABASE_URL -f schema.sql

# Seed artists (pages 500-2000 by default)
python seed_artists.py

# Seed mainstream baseline
python seed_artists.py --start 1 --end 50

# Take initial snapshot
python snapshot_artists.py

# Seed genre and similarity data (one-time)
python seed_genre_artists.py
python seed_similar_artists.py

# Run dbt models
dbt run
```

## Automation

A GitHub Action runs `snapshot_artists.py` every Sunday at 9am UTC. Required GitHub secrets: `LASTFM_API_KEY`, `DATABASE_URL`.

## What's Next

- **Longitudinal analysis** — after several weeks of snapshots, compare week-over-week listener growth rates by chart tier and correlate chart rank with growth velocity
- **Similarity network analysis** — do indie artists with more cross-tier connections (similar to mainstream artists) grow faster?
- **Genre growth patterns** — which genres produce the fastest-growing indie artists?
