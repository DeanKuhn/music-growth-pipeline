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
| **Web app — Stage A1**: pg_trgm/unaccent extensions, 4 indexes, `tags` DDL reconciled | Done (2026-07-31) |
| **Web app — Stage A2**: deduped 3,045 artist rows, shared `db.py`/`lastfm.py`, `ux_artists_name_norm` | Done (2026-07-31) |
| **Web app — Stage A3**: `artist_tiers` left join, chart pages 51-499 backfilled (chart now complete) | Done (2026-07-31) |
| **Web app — Stage A4**: genre backfill via artist.getTopTags → `tags` table | Deferred to Stage B |
| **Web app — Stage A5**: marts as tables + `models/api/` serving layer | Next |
| **Web app — Stage A6**: `app_readonly` role | Not started |
| **Web app — Stages C/D/E**: Next.js app, frontend, Vercel deploy | Not started |

## Environment
- Python runs in WSL (.venv), not Windows PowerShell
- Database is hosted on Neon (cloud Postgres) — connection string in .env as DATABASE_URL
- API key stored in .env as LASTFM_API_KEY
- Both secrets are also stored as GitHub Actions secrets for the automated workflow

## File Guide
| File | Purpose |
|---|---|
| `audit_script.py` | One-time API audit — documents what Last.fm endpoints return and why the pipeline is designed the way it is |
| `schema.sql` | DDL for all tables + indexes + extensions — idempotent, safe to re-run |
| `migrations/` | One-off data migrations that would be meaningless on a fresh DB (`001_dedupe_artists.sql`) |
| `plans/webapp-implementation-plan.md` | Full plan for the public web app + 50k expansion (Stages A–E) |
| `db.py` | **Shared** — `get_conn()` and `get_or_create_artist()`. All seed scripts import this; do not reimplement the upsert. |
| `lastfm.py` | **Shared** — `get(params, timeout=10)`, `BASE_URL`, `COMMON_PARAMS`. Stage B rate limiting/retry lands here. |
| `seed_artists.py` | Seeds artists and weekly_charts from chart.getTopArtists. Accepts --start/--end page args. **Chart fully seeded (pages 1-2000 = all 10,000 artists); nothing below page 2000 exists.** |
| `seed_genre_artists.py` | Seeds 15 genres × 500 artists into genres and genre_artists via tag.getTopArtists. Also upserts new artists into artists table. |
| `seed_similar_artists.py` | Calls artist.getSimilar (limit=20) for every charted artist in the page range, inserts into artist_similarities. Resumable via NOT EXISTS guard. Default --start 1 --end 2000. |
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
tags                 — per-artist Last.fm tags with weight (artist_id, tag, tag_count). EMPTY — to be filled in Stage B.
```
Extensions: `pg_trgm` (fuzzy artist search), `unaccent` (build-time name normalisation only — it is STABLE, not IMMUTABLE, so it cannot appear in an index expression).
Key index: `ux_artists_name_norm` on `lower(btrim(name))` — makes duplicate artist names impossible and is the conflict target for `db.get_or_create_artist`.

## API Audit Findings
- `artist.getInfo` — returns cumulative all-time listener + playcount. No time series built in; must snapshot repeatedly.
- `chart.getTopArtists` — current global chart only (no historical date param). 10,000 artists, 2,000 pages. Deep pages = smaller/indie artists.
- Weekly charts are per-user only (`user.getWeeklyArtistChart`), not global.

## Current Data (as of 2026-07-31)
- **22,207 artists** (was 24,783 before deduping 3,045 duplicate rows; +469 from re-seeds since)
- **9,808 charted artists** across the complete chart (pages 1-2000 = all 10,000 chart rows)
  - 250 mainstream (pages 1-50) · 9,558 indie (pages 51-2000)
  - 192 artists appear on two pages — chart shifted between the April and July scrapes
- **12,399 "unranked"** artists — seeded via genre tags or the similarity graph, below the top 10,000. They have listener history but no chart position.
- 14 weekly snapshots, 2026-04-27 → 2026-07-26. 21,732 artists have ≥6 weeks tracked.
- `weekly_charts` holds two snapshot_dates: 2026-04-27 (pages 1-50, 500-2000) and 2026-07-31 (pages 51-499)
- DB size ~53 MB of Neon's ~0.5 GiB free tier

## Cross-Sectional Findings (2026-04-27)
- Mainstream artists average 3.6M listeners vs indie 348K (~10x)
- Plays-per-listener ratio: mainstream median 74.76 vs indie 17.69 (~4x gap, consistent across full distribution)
- Listener count distributions do not overlap — indie P90 (782K) is below mainstream P25 (2.3M)
- Caveat: mainstream artists have older catalogues, so accumulated playcounts may partly explain the ratio gap

## Longitudinal Findings (2026-05-10 to 2026-06-14, 7 weeks)
- Underground artists (pages 1000+) have median 7-week growth of 2.20% vs mainstream 1.55% — growth rate increases as chart page depth increases (⚠ see Open Data-Quality Issue #1 — this does not survive the full-tier fix and should not be restated in portfolio copy)
- P90 growth for underground artists (9.16%) is 3x higher than mainstream (2.75%), showing a fat tail of fast-movers
- Both tiers grow ~0.2% per week in aggregate; mainstream adds more listeners in absolute terms due to larger base
- Fastest-growing indie artists (100-400% over 7 weeks) are concentrated in pages 1500+; growth patterns split between viral spikes and steady acceleration
- EDM has the highest median genre growth rate; classical and metal are slowest
- Caveat: Last.fm listener counts are cumulative all-time, so they can only increase — "growth" reflects new scrobblers, not active monthly listeners

## Open Data-Quality Issues (2026-07-31)
These were found while building the web app and are **not yet resolved**:

1. **The "growth increases with chart depth" finding does not survive the tier fix.** With all 22,207 artists now tiered, medians are: indie 3.41%, mainstream 2.61%, **unranked 1.55%**. Artists *below* the chart grow slowest, so the relationship is not monotonic. Two candidate explanations — selection effect (charting at all implies momentum) vs a genuine inverted-U. Unresolved; the README/portfolio claim should not be restated until it is.
2. **"unranked" is an observation gap, not a popularity tier.** It mixes 282 artists larger than the median mainstream artist with 6,794 below indie's 25th percentile. Do not use `tier` as the app's comparison cohort — use listener percentile bands, which are well-defined for every artist.
3. **Similarity coverage is biased by chart depth**: 49.7% of artists at pages 500-749 have similarity data vs 12.4% at pages 1750-1999. Caused by the old `ORDER BY listeners DESC LIMIT 2000` seed query (now fixed). 7,822 charted artists still need seeding — deferred to Stage B.
4. **Genre coverage is only ~26%** (6,544 of 22,207). The "compare vs your genre" feature needs the `tags` backfill first.
5. **1,305 artists have no chart row, no genre row, and no similarity edge** — origin unexplained; likely `seed_genre_artists.py` inserting the artist then swallowing a failure on the `genre_artists` insert.
6. **`snapshot_date = date.today()`** in `snapshot_artists.py` will fragment the weekly grain on any long or catch-up run. Must be fixed before the Stage B concurrency work.

## Portfolio Context
- Companion projects: WGU-DSAII-Project (TSP/genetic algorithm), Market-Cynic-Pipeline (Yahoo Finance + Reddit sentiment)
- This project's explicit gap to close: SQL depth and data engineering fundamentals
