# music-growth-pipeline

## Project Goal
Analyze whether chart appearances correlate with listener count growth for smaller independent artists using Last.fm data. Portfolio project targeting DE/DA/MLE roles — the explicit gap to close is SQL depth and data engineering fundamentals.

## Tech Stack
Python ingestion → Postgres (Neon) → dbt (dbt-postgres) → SQL analyses. Source: Last.fm API (key auth, read-only). Automation: GitHub Actions weekly cron. Power BI report on a live Postgres connection.

## Environment
- Python runs in WSL (`.venv`), not Windows PowerShell
- `.env` holds `DATABASE_URL` (Neon) and `LASTFM_API_KEY`; both are also GitHub Actions secrets
- Node/npm for `web/` must be WSL-native (`~/.nvm`), not the Windows install reached via `/mnt/c/Program Files/nodejs/` interop — that install's process isn't reachable from WSL's network namespace, so `npm run dev` starts but `localhost:3000` is unreachable. Same failure class as the Python/PowerShell note above.
- **The repo must live on WSL's native filesystem** (e.g. `~/code/music-growth-pipeline`), not `/mnt/c/...`. `npm install` on the 9p-mounted Windows drive throws `ENOTEMPTY`/`ENOENT` mid-extraction unpredictably. If both a `/mnt/c/...` and a `~/code/...` copy exist, the `~/code` one is authoritative — check `git log`/file timestamps before trusting either.

## Repo Layout
```
pipeline/  Python ingestion (shared db.py/lastfm.py, seeds, snapshot, stats)
dbt/       dbt project — dbt_project.yml, models/, analyses/, tests/, seeds/, macros/, snapshots/
sql/       schema.sql + migrations/
docs/      findings.md, webapp-implementation-plan.md
data/      pipeline_stats.json (root-level: deanslist.dev fetches this path)
web/       Next.js app — App Router, TS, all 8 API routes built (Stage C complete)
```
- Run Python from the repo root: `python pipeline/snapshot_artists.py`. Imports resolve because the script's own directory goes on `sys.path`; `.env` is found by walking up from the file, so running from inside `pipeline/` also works.
- dbt needs `--project-dir dbt` (or `cd dbt` first). Paths inside `dbt_project.yml` are relative to it and unchanged.

## Where the work is
The pipeline (ingestion, marts, analyses, weekly automation, Power BI) is complete. Current work is the public web app — see `docs/webapp-implementation-plan.md` for Stages A–E.

**Now:** Stages A, C, D, and E are **complete**. Stage A: all 7 `dbt/models/api/` models built and tested, `app_readonly` grants verified against the live DB after a rebuild (2026-08-05) — plus an 8th, `api_genres`, added during Stage C. Stage C: `web/` (Next.js 15 App Router, TS) built, all 8 endpoints verified end-to-end against the live DB with the real `app_readonly` role (2026-08-05) — see `docs/webapp-implementation-plan.md`'s PROGRESS block for the two validation bugs and one credential-mixup incident found and fixed during that verification. Stage D: all routes built (landing, artist page with charts/comparisons, leaderboards, genres, how-it-works) and verified via a real `next build` + `next start` against the live DB (2026-08-05) — see the plan's PROGRESS block for a Stage-C-era type error and a Postgres-numeric-as-string bug both caught here, a forced React 18→19 bump, and a known Next.js `notFound()` status-code quirk still to re-check on the live deployment. Stage E: deployed to Vercel, live at `music.deanslist.dev` (2026-08-07) — see the plan's PROGRESS block for four real bugs found getting the deploy live (two build-time self-fetch crashes, a Vercel Deployment Protection issue that 500'd every page in production, and a `+`-in-query-string encoding bug on the leaderboard's `1M+` size band), plus real Upstash-backed rate limiting now wired in. Remaining: the `notFound()` status-code re-check, and a reciprocal project card on the Astro apex site (different repo). Next up is Stage B: ingestion scale-up.

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
| `dbt/macros/profanity.sql` | **Only** place that reads `PROFANITY_PATTERN`. Provides `is_display_safe()` / `display_name()`; **fails the build** if the env var is unset (override: `--vars 'allow_unfiltered_names: true'`). |
| `dbt/models/intermediate/int_artist_base.sql` | Applies the profanity macros once, at the source: emits `display_name` (`'[redacted]'`) and a `<id>-redacted` slug so an unsafe name never reaches a public URL. |
| `dbt/models/api/api_artist_similar.sql` | **Symmetrises** the one-directional similarity edges (max score wins), which is what makes 14,325 artists show neighbours instead of 1,982. Does not fix the seeding gap — see Issue #3. |
| `dbt/models/api/api_leaderboard.sql` | Requires the full 13-week window and ≥1,000 starting listeners, so a 3→9 listener move can't top the percentage board. |
| `dbt/models/api/api_pipeline_health.sql` | Freshness comes from `latest_snapshot_date`, not the dbt run — a rebuild over failed ingestion must still read as stale. |
| `dbt/models/api/api_cohort_weekly.sql` | Cohorts on `size_band`, never `tier`. Built on a **fixed panel** of artists whose series starts at the window's first week — otherwise later-seeded artists enter at indexed=100 and depress that week's median. |
| `dbt/models/api/api_artist_search.sql` | Excludes unsafe artists entirely — they must not autocomplete. Index opclasses (`gin_trgm_ops`, `text_pattern_ops`) ride inside the `columns` strings; dbt has no opclass field but interpolates them verbatim. |
| `dbt/models/api/api_genres.sql` | Added during Stage C, not in the original A4 list — left-joins `genre_growth` onto `genre_stats` so `/api/genres` never has to query those marts directly. Growth columns nullable by design (genre_growth needs `weeks_tracked >= 6` and ≥50 qualifying artists, a stricter population than genre_stats). |
| `web/src/lib/db.ts` | Exports `sql` (the `neon()` tagged-template client) and `assertReadonlyRole()` — the latter queries `current_user` once per warm instance and throws if it isn't `app_readonly`, catching a wrong-but-different `DATABASE_URL_READONLY` that the byte-equality check above it can't. Called from `rate-limit.ts`, not here directly. |
| `web/src/lib/rate-limit.ts` | `withRateLimit()` wraps every route: calls `assertReadonlyRole()` first (fails **closed** — 500, unlike the limiter below) then `getLimiter()`. `getLimiter()` returns an `@upstash/ratelimit` + `@upstash/redis`-backed limiter (shared across instances) when `UPSTASH_REDIS_REST_URL`/`TOKEN` are set, otherwise falls back to the in-memory sliding-window limiter (per-instance only, fails **open** on error). |
| `web/src/lib/api.ts` | `getBaseUrl()` prefers `SITE_URL` (the public custom domain) over `VERCEL_URL` for pages' self-fetch of their own `/api/*` routes — `VERCEL_URL` always resolves to a `*.vercel.app` hostname, which Vercel's Deployment Protection blocks by default (custom domains are exempt), so every self-fetching page 500'd until this was added. `getLeaderboard()`/`search()` must `encodeURIComponent` every query param going into this self-fetch URL — an unencoded `+` (e.g. the `1M+` size band) round-trips through `URLSearchParams` as a space. |
| `web/src/app/api/revalidate/route.ts` | Secret-gated (`REVALIDATE_SECRET`), called by the weekly workflow after `generate_stats.py`. Calls `revalidateTag('marts')`, but as of 2026-08-07 that's a no-op in practice — no route reads through Next's fetch/Data Cache, they cache via a manual `Cache-Control` header instead (see `lib/cache.ts`), so there's nothing for the tag to invalidate yet. Freshness is bounded by that header's `s-maxage` (1 hour), not "seconds after the pipeline runs." Wired up now so it starts doing real work the day a route opts into fetch-tag caching. |
| `web/vercel.json` | `ignoreCommand` skips a Vercel rebuild when the only diff is outside `web/` (e.g. the weekly `chore: update pipeline stats` commit) — runs with cwd = Root Directory, so the check is scoped to `web/` implicitly. |
| `web/src/lib/validation.ts` | Frozen whitelists (`SIZE_BANDS`, `TIERS`, etc.) built from actual dbt model output, not plan prose. `limitSchema` must stay `.optional().default()`, not `.catch()` — `.catch()` silently swallows out-of-range input into the fallback instead of 400ing, which is how `?limit=99999` slipped through undetected once already. `searchQuerySchema` rejects `%`/`_` since `q` is interpolated into a `LIKE` pattern. |
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
- **37,436 artists**; 9,808 charted (250 in pages 1-50, 9,558 in pages 51-2000); **27,628 unranked** — seeded via genre tags or the similarity graph, below the top 10,000, so they have listener history but no chart position. (Previously 113k — 76k similarity-only orphans with no snapshots were pruned 2026-08-11; backup in `data/orphan_artists_backup.json`.)
- 15 snapshot dates 2026-04-27 → 2026-08-02; 37,435 artists have all 13 of the true weekly runs.
- `weekly_charts` holds two snapshot_dates: 2026-04-27 (pages 1-50, 500-2000) and 2026-07-31 (pages 51-499). 192 artists appear on two pages — the chart shifted between scrapes.
- ~386 MB of Neon's ~0.5 GiB free tier.

## Data History — read before aggregating
The first two snapshot dates are **not** weekly runs and must be excluded from anything aggregated across artists:
- `2026-04-27` — 7,751 artists, all charted; a different population than later weeks.
- `2026-05-03` — 4,487 artists, **disjoint** from 04-27; only artists seeded in between.
- `2026-05-10` onward — first runs over a stable ~21.7k population.

Known consequence: `listener_growth.sql` drops only the global min date, so the 7,751 artists with an 04-27 row get one 13-day delta labelled as a week at 05-10. Narrow (one week, one cohort); slightly affects `average_listener_pct`. Not fixed — changing it would move published numbers.

## Portfolio stats block
`pipeline/generate_stats.py` publishes `growth_by_size_quintile` (median 2.67 / 2.46 / 2.10 / 1.76 / 1.71), computed inline against `stg_artist_snapshots` bounded at `SERIES_START_DATE = '2026-05-10'` so it reproduces the README exactly. **Do not recompute it from `artist_growth_summary`** — that mart's window yields 2.77 / 2.52 / … , numbers the README doesn't contain. The earlier `growth_by_tier` block contradicted the README and was removed 2026-08-05; see Issue #1 in `docs/findings.md`. `min_page` was dropped from `top_growing_artists` at the same time — it sat next to a fastest-growers list and implied the retracted page-depth claim.

## Findings — headline only
Median total growth falls monotonically with artist size, by **starting**-listener quintile: 2.67% / 2.46% / 2.10% / 1.76% / 1.71% (smallest → largest, 13 weeks, 22,201 artists). Verified 2026-08-03 and published in README. The earlier "growth increases with chart page depth" claim is **retracted** — do not restate it. Caveat on everything: listener counts are cumulative all-time, so "growth" means new scrobblers, not active listeners. Full detail and the open data-quality issues live in `docs/findings.md`.
