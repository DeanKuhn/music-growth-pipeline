# music-growth-pipeline

## Project Goal
Analyze whether chart appearances correlate with listener count growth for smaller independent artists using Last.fm data. Portfolio project targeting DE/DA/MLE roles — primary purpose is demonstrating SQL and data engineering competency.

## Tech Stack
| Layer | Tool |
|---|---|
| Ingestion & transformation | Python |
| Primary storage | Postgres |
| Analytical queries | DuckDB (optional layer) |
| Data source | Last.fm API (key auth, read-only) |

## Status Tracker
| Item | Status |
|---|---|
| Last.fm account + API key | Done |
| GitHub repo (music-growth-pipeline) | Done |
| Virtual environment (.venv) | Done |
| API audit (audit_script.py) | Done |
| Schema design | Next |
| Ingestion pipeline | Pending |
| Transformation layer | Pending |
| Analytical queries | Pending |

## API Audit Findings
- `artist.getInfo` — returns cumulative all-time listener + playcount. No time series built in; must snapshot repeatedly.
- `chart.getTopArtists` — current global chart only (no historical date param). 10,000 artists, 2,000 pages. Deep pages = smaller/indie artists.
- Weekly charts are per-user only (`user.getWeeklyArtistChart`), not global. Data goes back to 2005.

## Planned Pipeline
1. **Seed** `artists` table from `chart.getTopArtists` pages 500–2000 (targets smaller artists)
2. **Weekly snapshot job**: call `artist.getInfo` per artist, insert row into `artist_snapshots` with timestamp
3. **After N weeks**: run correlation analysis between chart rank and listener growth

## MVP (immediately viable)
Cross-sectional analysis: do chart-featured artists have statistically different listener distributions than non-featured ones? Doable with a single snapshot — no waiting required. Build this first while longitudinal data accumulates.

## Planned Schema
```
artists              — artist metadata (name, mbid, tags)
weekly_charts        — chart appearance records (rank, page, snapshot date)
artist_snapshots     — longitudinal listener/playcount over time
tags                 — (optional) genre/tag associations
```
Schema design comes before any pipeline code.

## Backup Plan
If longitudinal data proves too coarse: pivot fully to cross-sectional analysis (the MVP above).

## Portfolio Context
- Companion projects: WGU-DSAII-Project (TSP/genetic algorithm), Market-Cynic-Pipeline (Yahoo Finance + Reddit sentiment)
- This project's explicit gap to close: SQL depth and data engineering fundamentals
