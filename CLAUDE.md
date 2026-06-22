# music-growth-pipeline

## Project Goal
Analyze whether chart appearances correlate with listener count growth for smaller independent artists using Last.fm data. Portfolio project targeting DE/DA/MLE roles — primary purpose is demonstrating SQL and data engineering competency.

## Tech Stack
| Layer | Tool |
|---|---|
| Ingestion & transformation | Python |
| Primary storage | Postgres (cloud: Neon) |
| Transformation layer | dbt (dbt-postgres) |
| Analytical queries | SQL (analysis.sql) |
| Data source | Last.fm API (key auth, read-only) |
| Automation | GitHub Actions (weekly cron) |

## Status Tracker
| Item | Status |
|---|---|
| Last.fm account + API key | Done |
| GitHub repo | Done |
| Virtual environment (.venv, WSL) | Done |
| API audit (audit_script.py) | Done |
| Schema design (schema.sql) | Done |
| Artist seeder (seed_artists.py) | Done |
| Snapshot job (snapshot_artists.py) | Done |
| Cross-sectional analysis (analysis.sql) | Done |
| GitHub Actions weekly automation | Done |
| Genre + similarity data (seed scripts + schema) | Done |
| dbt staging models (all 6 source tables) | Done |
| dbt mart models (artist_tiers, genre_stats, artist_similarity_network) | Done |
| dbt mart models (listener_growth, artist_growth_summary, weekly_growth_by_tier, genre_growth) | Done |
| Longitudinal analysis (longitudinal_analysis.sql) | Done |
| Portfolio stats pipeline (generate_stats.py → pipeline_stats.json → deanslist.dev) | Done |
| Power BI report (live Postgres connection, overview + artist drillthrough pages) | Done |

## Environment
- Python runs in WSL (.venv), not Windows PowerShell
- Database is hosted on Neon (cloud Postgres) — connection string in .env as DATABASE_URL
- API key stored in .env as LASTFM_API_KEY
- Both secrets are also stored as GitHub Actions secrets for the automated workflow

## File Guide
| File | Purpose |
|---|---|
| `audit_script.py` | One-time API audit — documents what Last.fm endpoints return and why the pipeline is designed the way it is |
| `schema.sql` | DDL for all tables — run once to set up the database |
| `seed_artists.py` | Seeds artists and weekly_charts from chart.getTopArtists. Accepts --start and --end page args (default 500-2000). Pages 1-50 already seeded as mainstream baseline. |
| `seed_genre_artists.py` | Seeds 15 genres × 500 artists into genres and genre_artists via tag.getTopArtists. Also upserts new artists into artists table. |
| `seed_similar_artists.py` | Queries top ~2,000 indie artists, calls artist.getSimilar (limit=20) for each, inserts into artist_similarities. One-time run. |
| `snapshot_artists.py` | Calls artist.getInfo for all artists, inserts into artist_snapshots. Run weekly via GitHub Actions. |
| `analyses/analysis.sql` | Three cross-sectional queries comparing mainstream (pages 1-50) vs indie (pages 500-2000) artists |
| `analyses/longitudinal_analysis.sql` | Four longitudinal queries: growth by tier, WoW trend by tier, fastest-growing indie artists, growth by genre |
| `models/staging/` | dbt staging models — one per source table, light renaming only |
| `models/marts/artist_tiers.sql` | Classifies each artist as mainstream (page ≤50) or indie based on min chart page |
| `models/marts/genre_stats.sql` | Per-genre summary: artist count, avg listeners, plays-per-listener, tier breakdown |
| `models/marts/artist_similarity_network.sql` | Enriched similarity pairs with both artists' tier and a cross_tier/same_tier flag |
| `models/marts/listener_growth.sql` | Week-over-week listener delta per artist using LAG window function |
| `models/marts/artist_growth_summary.sql` | One row per artist: total growth, avg weekly %, weeks tracked — joins listener_growth + artist_tiers |
| `models/marts/weekly_growth_by_tier.sql` | Aggregate WoW listener growth per tier per week — the time-series view of the core finding |
| `models/marts/genre_growth.sql` | Per-genre growth summary: avg and median total pct growth, avg weekly pct change |
| `generate_stats.py` | Queries mart models, writes data/pipeline_stats.json for portfolio. Run automatically after each weekly snapshot. |
| `data/pipeline_stats.json` | Output of generate_stats.py — fetched by deanslist.dev at build time to display live stats |
| `.github/workflows/weekly_snapshot.yml` | GitHub Action — runs snapshot → dbt run → generate_stats.py → git push every Sunday at 9am UTC |

## Schema
```
artists              — artist metadata (name, mbid, created_at)
weekly_charts        — chart appearance records (artist_id, rank, page, snapshot_date)
artist_snapshots     — listener/playcount snapshots over time (artist_id, listeners, playcount, snapshot_date)
genres               — genre/tag list (id, genre)
genre_artists        — artist-to-genre associations with rank within each genre
artist_similarities  — similar artist pairs with similarity score, fetched via artist.getSimilar
```

## API Audit Findings
- `artist.getInfo` — returns cumulative all-time listener + playcount. No time series built in; must snapshot repeatedly.
- `chart.getTopArtists` — current global chart only (no historical date param). 10,000 artists, 2,000 pages. Deep pages = smaller/indie artists.
- Weekly charts are per-user only (`user.getWeeklyArtistChart`), not global.

## Current Data
- ~24,770 artists in artists table total: ~7,751 with chart entries (used for tier analysis), remainder seeded via genre tags
- 7,751 chart artists: 250 mainstream (pages 1-50) + 7,501 indie (pages 500-2000)
- 8 weekly snapshots: 2026-04-27 through 2026-06-14 (7 weeks of clean longitudinal data from 2026-05-10)
- Longitudinal data collection started 2026-04-27 — weekly snapshots via GitHub Actions

## Cross-Sectional Findings (2026-04-27)
- Mainstream artists average 3.6M listeners vs indie 348K (~10x)
- Plays-per-listener ratio: mainstream median 74.76 vs indie 17.69 (~4x gap, consistent across full distribution)
- Listener count distributions do not overlap — indie P90 (782K) is below mainstream P25 (2.3M)
- Caveat: mainstream artists have older catalogues, so accumulated playcounts may partly explain the ratio gap

## Longitudinal Findings (2026-05-10 to 2026-06-14, 7 weeks)
- Underground artists (pages 1000+) have median 7-week growth of 2.20% vs mainstream 1.55% — growth rate increases as chart page depth increases
- P90 growth for underground artists (9.16%) is 3x higher than mainstream (2.75%), showing a fat tail of fast-movers
- Both tiers grow ~0.2% per week in aggregate; mainstream adds more listeners in absolute terms due to larger base
- Fastest-growing indie artists (100-400% over 7 weeks) are concentrated in pages 1500+; growth patterns split between viral spikes and steady acceleration
- EDM has the highest median genre growth rate; classical and metal are slowest
- Caveat: Last.fm listener counts are cumulative all-time, so they can only increase — "growth" reflects new scrobblers, not active monthly listeners

## Portfolio Context
- Companion projects: WGU-DSAII-Project (TSP/genetic algorithm), Market-Cynic-Pipeline (Yahoo Finance + Reddit sentiment)
- This project's explicit gap to close: SQL depth and data engineering fundamentals
