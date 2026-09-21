# Architecture & Reference

Deep reference for the music-growth-pipeline. CLAUDE.md has the short version.

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

- Extensions: `pg_trgm` (fuzzy search); `unaccent` (build-time normalisation only — STABLE, not IMMUTABLE, cannot appear in an index expression).
- Key index: `ux_artists_name_norm` on `lower(btrim(name))` — makes duplicate names impossible and is the conflict target for `db.get_or_create_artist`.

## API constraints

- `artist.getInfo` returns cumulative all-time listeners/playcount — no built-in time series, so we snapshot repeatedly.
- `chart.getTopArtists` is the current global chart only (no date param). 10,000 artists / 2,000 pages; deep pages = indie.
- Global weekly charts don't exist — `user.getWeeklyArtistChart` is per-user only.

## Current data (2026-08-03)

- **37,436 artists**; 9,808 charted (250 in pages 1-50, 9,558 in pages 51-2000); **27,628 unranked** — seeded via genre tags or the similarity graph.
- 15 snapshot dates 2026-04-27 → 2026-08-02; 37,435 artists have all 13 of the true weekly runs.
- `weekly_charts` holds two snapshot_dates: 2026-04-27 (pages 1-50, 500-2000) and 2026-07-31 (pages 51-499). 192 artists appear on two pages — the chart shifted between scrapes.
- Postgres self-hosted on Hetzner (no storage limit).

## Data history — read before aggregating

The first two snapshot dates are **not** weekly runs and must be excluded from anything aggregated across artists:

- `2026-04-27` — 7,751 artists, all charted; a different population than later weeks.
- `2026-05-03` — 4,487 artists, **disjoint** from 04-27; only artists seeded in between.
- `2026-05-10` onward — first runs over a stable ~21.7k population.

Known consequence: `listener_growth.sql` drops only the global min date, so the 7,751 artists with an 04-27 row get one 13-day delta labelled as a week at 05-10. Narrow (one week, one cohort); slightly affects `average_listener_pct`. Not fixed — changing it would move published numbers.

## Portfolio stats block

`pipeline/generate_stats.py` publishes `growth_by_size_quintile` (median 2.67 / 2.46 / 2.10 / 1.76 / 1.71), computed inline against `stg_artist_snapshots` bounded at `SERIES_START_DATE = '2026-05-10'` so it reproduces the README exactly.

**Do not recompute from `artist_growth_summary`** — that mart's window yields 2.77 / 2.52 / …, numbers the README doesn't contain. The earlier `growth_by_tier` block contradicted the README and was removed 2026-08-05; see Issue #1 in `docs/findings.md`. `min_page` was dropped from `top_growing_artists` at the same time.

## File guide

Only entries with something non-obvious about them.

| File | Note |
|---|---|
| `pipeline/db.py` | **Shared** — `get_conn()`, `get_or_create_artist()`. All seed scripts import this; do not reimplement the upsert. |
| `pipeline/lastfm.py` | **Shared** — `get(params, timeout=10)`, `BASE_URL`, `COMMON_PARAMS`. Stage B rate limiting/retry lands here. |
| `pipeline/seed_artists.py` | Chart is fully seeded (pages 1-2000 = all 10,000 artists). Accepts `--start`/`--end`. |
| `pipeline/seed_genre_artists.py` | No argparse and no dry-run — running it calls the API and writes immediately. Inserts are `ON CONFLICT DO NOTHING`. |
| `pipeline/seed_similar_artists.py` | Only queries *charted* artists. Resumable via `NOT EXISTS`. One-directional by design. |
| `pipeline/snapshot_artists.py` | Anchors snapshot date to current week's Sunday (`week_anchor()`); `--date YYYY-MM-DD` pins it when resuming. |
| `pipeline/generate_stats.py` | Writes `data/pipeline_stats.json` at **repo root** via `REPO_ROOT`. deanslist.dev depends on that path. |
| `sql/schema.sql` | Idempotent, safe to re-run. `sql/migrations/` holds one-offs meaningless on a fresh DB. |
| `dbt/models/api/` | Serving layer — narrow, pre-joined, pre-indexed tables. **Never query the marts from the API.** |
| `dbt/models/api/api_artist_timeseries.sql` | Series starts 2026-05-10 (`var('series_start_date')`). |
| `dbt/macros/profanity.sql` | Reads `PROFANITY_PATTERN`. Provides `is_display_safe()` / `display_name()`; **fails build** if env var unset (override: `--vars 'allow_unfiltered_names: true'`). |
| `dbt/models/intermediate/int_artist_base.sql` | Applies profanity macros once at source: emits `display_name` and `<id>-redacted` slug. |
| `dbt/models/api/api_artist_similar.sql` | Symmetrises one-directional similarity edges (max score wins). 14,325 artists show neighbours vs 1,982 without. |
| `dbt/models/api/api_leaderboard.sql` | Requires full 13-week window and ≥1,000 starting listeners. |
| `dbt/models/api/api_pipeline_health.sql` | Freshness from `latest_snapshot_date`, not dbt run time. |
| `dbt/models/api/api_cohort_weekly.sql` | Cohorts on `size_band`, never `tier`. Fixed panel — artists whose series starts at window's first week. |
| `dbt/models/api/api_artist_search.sql` | Excludes unsafe artists. Index opclasses (`gin_trgm_ops`, `text_pattern_ops`) interpolated inside `columns` strings. |
| `dbt/models/api/api_genres.sql` | Left-joins `genre_growth` onto `genre_stats`. Growth columns nullable (needs `weeks_tracked >= 6` and ≥50 artists). |
| `web/src/lib/db.ts` | Exports `sql` (postgres.js) and `assertReadonlyRole()`. |
| `web/src/lib/rate-limit.ts` | `withRateLimit()` wraps every route: `assertReadonlyRole()` first (fails closed), then `getLimiter()` (Upstash or in-memory fallback, fails open). |
| `web/src/lib/queries.ts` | Single source of truth for all SQL. Neither pages nor routes inline queries. |
| `web/src/lib/api.ts` | Server-only. Typed functions calling `queries.ts` + `coerceNumericStrings`. No self-fetch. |
| `web/src/lib/api-types.ts` | Client-safe. Types, `ApiError`, `coerceNumericStrings`. Import from here in client components, not `api.ts`. |
| `web/src/lib/validation.ts` | Frozen whitelists from dbt output. `limitSchema` uses `.optional().default()`, not `.catch()`. `searchQuerySchema` rejects `%`/`_`. |
| `deploy.sh` | SSHes into Hetzner (`bibba@music.deanslist.dev`), pulls, builds, restarts systemd. `DEPLOY_HOST` overridable. |
| `weekly_snapshot.sh` | Snapshot → dbt → generate_stats → git push → restart web. Crontab Sundays 9am UTC. Logs to `logs/`. |

## Where the work is

The pipeline (ingestion, marts, analyses, weekly automation, Power BI) is complete. Web app Stages A, C, D, E are complete. Deployed on Hetzner behind Caddy. Next up: Stage B (ingestion scale-up). See `docs/webapp-implementation-plan.md` for full stage details.
