# music-growth-pipeline

## Project Goal
Analyze whether chart appearances correlate with listener count growth for smaller independent artists using Last.fm data. Portfolio project targeting DE/DA/MLE roles — primary purpose is demonstrating SQL and data engineering competency.

## Tech Stack
| Layer | Tool |
|---|---|
| Ingestion & transformation | Python |
| Primary storage | Postgres (cloud: Neon) |
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
| Longitudinal analysis | Pending (needs weeks of snapshots) |

## Environment
- Python runs in WSL (.venv), not Windows PowerShell
- Database is hosted on Neon (cloud Postgres) — connection string in .env as DATABASE_URL
- API key stored in .env as LASTFM_API_KEY
- Both secrets are also stored as GitHub Actions secrets for the automated workflow

## File Guide
| File | Purpose |
|---|---|
| `audit_script.py` | One-time API audit — documents what Last.fm endpoints return and why the pipeline is designed the way it is |
| `schema.sql` | DDL for all four tables — run once to set up the database |
| `seed_artists.py` | Seeds artists and weekly_charts from chart.getTopArtists. Accepts --start and --end page args (default 500-2000). Pages 1-50 already seeded as mainstream baseline. |
| `snapshot_artists.py` | Calls artist.getInfo for each unseeded artist, inserts into artist_snapshots. Run weekly via GitHub Actions. |
| `analysis.sql` | Three cross-sectional queries comparing mainstream (pages 1-50) vs indie (pages 500-2000) artists |
| `.github/workflows/weekly_snapshot.yml` | GitHub Action — runs snapshot_artists.py every Sunday at 9am UTC |

## Schema
```
artists              — artist metadata (name, mbid, created_at)
weekly_charts        — chart appearance records (artist_id, rank, page, snapshot_date)
artist_snapshots     — listener/playcount snapshots over time (artist_id, listeners, playcount, snapshot_date)
tags                 — genre/tag associations (unused so far)
```

## API Audit Findings
- `artist.getInfo` — returns cumulative all-time listener + playcount. No time series built in; must snapshot repeatedly.
- `chart.getTopArtists` — current global chart only (no historical date param). 10,000 artists, 2,000 pages. Deep pages = smaller/indie artists.
- Weekly charts are per-user only (`user.getWeeklyArtistChart`), not global.

## Current Data
- 7,755 artists total: 250 mainstream (pages 1-50) + 7,505 indie (pages 500-2000)
- 7,751 artist snapshots taken 2026-04-27
- Longitudinal data collection started 2026-04-27 — weekly snapshots accumulating via GitHub Actions

## Cross-Sectional Findings (2026-04-27)
- Mainstream artists average 3.6M listeners vs indie 348K (~10x)
- Plays-per-listener ratio: mainstream median 74.76 vs indie 17.69 (~4x gap, consistent across full distribution)
- Listener count distributions do not overlap — indie P90 (782K) is below mainstream P25 (2.3M)
- Caveat: mainstream artists have older catalogues, so accumulated playcounts may partly explain the ratio gap

## Longitudinal Analysis Plan
After several weeks of weekly snapshots:
- Compare listener growth rates by chart page tier
- Correlate chart rank with week-over-week listener change
- Identify fastest-growing artists in the indie tier

## Portfolio Context
- Companion projects: WGU-DSAII-Project (TSP/genetic algorithm), Market-Cynic-Pipeline (Yahoo Finance + Reddit sentiment)
- This project's explicit gap to close: SQL depth and data engineering fundamentals
