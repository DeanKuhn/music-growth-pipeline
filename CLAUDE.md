# music-growth-pipeline

## Project Goal
Analyze whether chart appearances correlate with listener count growth for smaller independent artists using Last.fm data. Portfolio project targeting DE/DA/MLE roles — the explicit gap to close is SQL depth and data engineering fundamentals.

## Tech Stack
Python ingestion → Postgres (Neon) → dbt (dbt-postgres) → SQL analyses. Source: Last.fm API (key auth, read-only). Automation: GitHub Actions weekly cron. Power BI report on a live Postgres connection.

## Environment
- Python runs in WSL (`.venv`), not Windows PowerShell
- `.env` holds `DATABASE_URL` (Neon) and `LASTFM_API_KEY`; both are also GitHub Actions secrets

## Repo Layout
```
pipeline/  Python ingestion (shared db.py/lastfm.py, seeds, snapshot, stats)
dbt/       dbt project — dbt_project.yml, models/, analyses/, tests/, seeds/, macros/, snapshots/
sql/       schema.sql + migrations/
docs/      findings.md, webapp-implementation-plan.md
data/      pipeline_stats.json (root-level: deanslist.dev fetches this path)
web/       Next.js app — not yet created
```
- Run Python from the repo root: `python pipeline/snapshot_artists.py`. Imports resolve because the script's own directory goes on `sys.path`; `.env` is found by walking up from the file, so running from inside `pipeline/` also works.
- dbt needs `--project-dir dbt` (or `cd dbt` first). Paths inside `dbt_project.yml` are relative to it and unchanged.

## Where the work is
The pipeline (ingestion, marts, analyses, weekly automation, Power BI) is complete. Current work is the public web app — see `docs/webapp-implementation-plan.md` for Stages A–E.

**Now:** Stage A5b, the `dbt/models/api/` serving layer. `api_artist_timeseries` and `api_artist_profile` are built (2/7). Remaining: `api_artist_search`, `api_cohort_weekly`, `api_artist_similar`, `api_leaderboard`, `api_pipeline_health`. Stages C/D/E (Next.js, frontend, Vercel) not started.

## File Guide
Only entries with something non-obvious about them. Everything else is named for what it does.

| File | Note |
|---|---|
| `pipeline/db.py` | **Shared** — `get_conn()`, `get_or_create_artist()`. All seed scripts import this; do not reimplement the upsert. |
| `pipeline/lastfm.py` | **Shared** — `get(params, timeout=10)`, `BASE_URL`, `COMMON_PARAMS`. Stage B rate limiting/retry lands here. |
| `pipeline/seed_artists.py` | **Chart is fully seeded** (pages 1-2000 = all 10,000 artists); nothing below page 2000 exists. Accepts `--start`/`--end`. |
| `pipeline/seed_genre_artists.py` | **No argparse and no dry-run** — running it calls the API and writes immediately. Inserts are `ON CONFLICT DO NOTHING`, so a stray run is harmless but not free. |
| `pipeline/seed_similar_artists.py` | Only queries *charted* artists. Resumable via `NOT EXISTS`. This one-directional design explains Issue #5. |
| `pipeline/snapshot_artists.py` | Anchors the snapshot date to the current week's Sunday (`week_anchor()`); `--date YYYY-MM-DD` pins it when resuming an interrupted run. |
| `pipeline/generate_stats.py` | Writes `data/pipeline_stats.json` at the **repo root**, resolved via `REPO_ROOT` — not relative to the script. deanslist.dev depends on that path. |
| `sql/schema.sql` | Idempotent, safe to re-run. `sql/migrations/` holds one-offs that would be meaningless on a fresh DB. |
| `dbt/models/api/` | Serving layer — narrow, pre-joined, pre-indexed tables read by the app's route handlers. **Never query the marts from the API.** |
| `dbt/models/api/api_artist_timeseries.sql` | Series starts 2026-05-10 (`var('series_start_date')`) — see Data History. |
| `dbt/models/intermediate/int_artist_base.sql` | Computes `is_display_safe` from the `PROFANITY_PATTERN` env var. Without it set, the Jinja fails open and every name is marked safe. |
| `.github/workflows/weekly_snapshot.yml` | Sundays 9am UTC: snapshot → dbt run → generate_stats → git push. |
| `docs/findings.md` | Full findings + data-quality log. Read it before writing portfolio copy or touching cohort logic. |

## Schema
```
artists              — artist metadata (name, mbid, created_at)
weekly_charts        — chart appearances (artist_id, rank, page, snapshot_date)
artist_snapshots     — listener/playcount over time (artist_id, listeners, playcount, snapshot_date)
genres               — genre/tag list
genre_artists        — artist-to-genre with rank within genre
artist_similarities  — similar pairs + score, from artist.getSimilar
tags                 — per-artist tags with weight. EMPTY — Stage B.
```
- Extensions: `pg_trgm` (fuzzy search); `unaccent` (build-time normalisation only — it is STABLE, not IMMUTABLE, so it cannot appear in an index expression).
- Key index: `ux_artists_name_norm` on `lower(btrim(name))` — makes duplicate names impossible and is the conflict target for `db.get_or_create_artist`.

## API Constraints
- `artist.getInfo` returns cumulative all-time listeners/playcount — no built-in time series, so we snapshot repeatedly.
- `chart.getTopArtists` is the current global chart only (no date param). 10,000 artists / 2,000 pages; deep pages = indie.
- Global weekly charts don't exist — `user.getWeeklyArtistChart` is per-user only.

## Current Data (2026-08-03)
- **22,207 artists**; 9,808 charted (250 mainstream pages 1-50, 9,558 indie pages 51-2000); **12,399 unranked** — seeded via genre tags or the similarity graph, below the top 10,000, so they have listener history but no chart position.
- 15 snapshot dates 2026-04-27 → 2026-08-02; 21,717 artists have all 13 of the true weekly runs.
- `weekly_charts` holds two snapshot_dates: 2026-04-27 (pages 1-50, 500-2000) and 2026-07-31 (pages 51-499). 192 artists appear on two pages — the chart shifted between scrapes.
- ~53 MB of Neon's ~0.5 GiB free tier.

## Data History — read before aggregating
The first two snapshot dates are **not** weekly runs and must be excluded from anything aggregated across artists:
- `2026-04-27` — 7,751 artists, all charted; a different population than later weeks.
- `2026-05-03` — 4,487 artists, **disjoint** from 04-27; only artists seeded in between.
- `2026-05-10` onward — first runs over a stable ~21.7k population.

Known consequence: `listener_growth.sql` drops only the global min date, so the 7,751 artists with an 04-27 row get one 13-day delta labelled as a week at 05-10. Narrow (one week, one cohort); slightly affects `average_listener_pct`. Not fixed — changing it would move published numbers.

## Findings — headline only
Median total growth falls monotonically with artist size, by **starting**-listener quintile: 2.67% / 2.46% / 2.10% / 1.76% / 1.71% (smallest → largest, 13 weeks, 22,201 artists). Verified 2026-08-03 and published in README. The earlier "growth increases with chart page depth" claim is **retracted** — do not restate it. Caveat on everything: listener counts are cumulative all-time, so "growth" means new scrobblers, not active listeners. Full detail and the open data-quality issues live in `docs/findings.md`.
