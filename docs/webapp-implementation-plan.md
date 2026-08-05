# Plan: Public interactive artist-growth app + ingestion scale-up

> ## PROGRESS — last updated 2026-08-05
>
> **Stage D is COMPLETE.** All routes built and verified against the live DB via a real `next build` + `next start`: `/` (search-first landing with live `/api/stats` tiles), `/artist/[slug]` (stat tiles, growth chart with log toggle, genre/tier/similar comparison tabs indexed to 100 with a p25–p75 band, percentile callout, similar-artists table, genre chips, "show the SQL" disclosures, insufficient-data state for `weeks_tracked < 3`), `/leaderboards` (slice_type × slice_key via searchParams, no client JS needed), `/genres` + `/genres/[g]`, `/how-it-works` (architecture diagram, dbt DAG with deep links to specific repo files, live freshness widget off `/api/stats`, methodology/caveats), and a global `not-found.tsx` with fuzzy suggestions. Recharts for charts; one categorical palette (validated colorblind-safe) shared across light/dark via CSS custom properties keyed off `prefers-color-scheme` and a `data-theme` override.
>
> **Two real bugs found during Stage D build verification, both pre-existing from Stage C (never caught because Stage C's own verification was manual endpoint curls, not a full `next build` typecheck):**
> 1. `src/app/api/artists/[slug]/compare/route.ts` had a TS type error (`rows.some((r: { median_indexed: ... }) => ...)` didn't match the tagged-template's actual `Record<string, any>[]` return type) — `npm run build` failed to compile. Fixed by dropping the narrower inline type.
> 2. **Postgres bigint/numeric columns arrive from `@neondatabase/serverless` as JSON strings**, not JS numbers (precision-safety default) — every `api_*` numeric column (`latest_listeners`, `total_pct_growth`, `weeks_tracked`, etc.) hits the frontend as e.g. `"8384268"`. Silent almost everywhere due to JS's arithmetic-operator auto-coercion, but `.toFixed()` calls (chart tooltips) threw outright. Fixed with `coerceNumericStrings()` in `web/src/lib/api.ts` — a recursive walk that converts any string matching `/^-?\d+(\.\d+)?$/` back to a number, applied to every server-fetched response and to the client-side search fetch in `SearchBar.tsx`. Date strings and slugs don't match the pattern, so they pass through untouched.
>
> **React 18 → 19 upgrade, forced by adding real pages.** Stage C was API-routes-only (edge functions, no React rendering), so it never exercised Next 15's App Router page-rendering path. The moment Stage D added actual pages, `next build` failed prerendering `/404` with `<Html> should not be imported outside of pages/_document` — a known Next 15 / React 18 incompatibility in its internal error-page renderer. Fixed by bumping `react`/`react-dom`/`@types/react`/`@types/react-dom` to `^19.0.0`; no code changes needed beyond the version bump.
>
> **Known framework limitation, not a bug — verify on Vercel during Stage E:** a dynamically-rendered page that calls `notFound()` at request time (as `/artist/[slug]` does for an unknown artist) serves the correct not-found UI but with an HTTP 200 status when self-hosted via `next start` — confirmed by isolating it against a minimal repro (`notFound()` called in a build-time-static route correctly returns 404; the same call in a per-request dynamic route returns 200). This is a documented Next.js App Router streaming-SSR limitation: response headers flush before the thrown error is caught. Mitigated for now with `robots: {index: false}` on `not-found.tsx` so crawlers don't index it regardless of status code; Vercel's edge network is reported to correct this for framework-native not-found signals, but that needs confirming against the actual deployment, not assumed from this self-hosted test.
>
> **Stage C is COMPLETE.** `web/` (Next.js 15 App Router, TS) built and fully verified against the live DB with the real `app_readonly` role. All 8 endpoints live: `GET /api/artists/[slug]`, `.../timeseries`, `.../similar`, `.../compare?vs=genre|tier|similar`, `GET /api/search`, `/api/leaderboards`, `/api/genres`, `/api/stats`. `db.ts`/`rate-limit.ts`/`validation.ts`/`cache.ts`/`errors.ts` in `web/src/lib/` are the shared helpers every route composes. Next work is Stage D (frontend).
>
> **New serving-layer model, not in the original A4 list:** `dbt/models/api/api_genres.sql` (+ `schema.yml` entry) — built during Stage C because the plan's original `/api/genres` spec queried `genre_stats`/`genre_growth` marts directly, which CLAUDE.md forbids for the API layer. Left-joins `genre_growth` onto `genre_stats` on `genre`; nullable growth columns by design (growth needs `weeks_tracked >= 6` and ≥50 qualifying artists, a stricter population than "has ≥1 artist"). Needs `dbt build --project-dir dbt --select api_genres` (with `PROFANITY_PATTERN` exported) if working from a DB snapshot older than 2026-08-05.
>
> **Two real bugs caught by the plan's own Stage C verification checklist, both fixed in `web/src/lib/validation.ts`:**
> 1. `limitSchema` used `.catch(fallback)`, which silently swallowed *any* invalid limit (including out-of-range, e.g. `?limit=99999`) into the default instead of 400ing. Now `.optional().default(fallback)` — missing param still defaults, but a present-and-invalid one fails validation.
> 2. `searchQuerySchema` didn't reject `%`/`_` (SQL LIKE metacharacters). `q` is interpolated into `name_norm LIKE ${q} || '%'`, so `q='%'` degraded toward a full scan instead of just failing to match — exactly the "not a slow query" case the checklist calls out. Added a `.refine()` rejecting both characters outright.
>
> **A genuine security incident, not a test artifact:** `DATABASE_URL_READONLY` was pasted from the Neon dashboard as the **`neondb_owner`** connection string, not `app_readonly`'s — `db.ts`'s existing guard (`DATABASE_URL_READONLY === DATABASE_URL`) only catches byte-identical strings and didn't catch a *different* owner-authenticated string. Verified via `psql`: the app could INSERT and DELETE against `artists` while "read-only." One test row was inserted and deleted during diagnosis, both via the mistakenly-owner-privileged connection — cleaned up immediately, no other tables touched. Fixed by pointing `.env.local` at the actual `app_readonly` string, **and** hardened `db.ts` with `assertReadonlyRole()` (queries `current_user`, memoized per warm instance, wired into `withRateLimit` so every route fails closed with a 500 if the connected role isn't `app_readonly`) so a future credential mix-up can't silently grant write access again.
>
> **Dev environment note:** `web/` must be developed from inside WSL's own filesystem (e.g. `~/code/music-growth-pipeline`), not `/mnt/c/...`. Two independent WSL/Windows interop failures came from working on the Windows-mounted drive: (1) `node`/`npm` resolving to the Windows-native install via PATH interop, whose process wasn't reachable from WSL's network namespace — fixed by installing Node LTS natively via `nvm` (`~/.nvm`); (2) `npm install` on the 9p-mounted `/mnt/c` drive threw `ENOTEMPTY`/`ENOENT` mid-extraction — fixed by moving the whole repo to native ext4. Same class of issue CLAUDE.md already flags for Python (`.venv` must run in WSL, not PowerShell) — now applies to Node too. **If a `/mnt/c/users/bibba/code/music-growth-pipeline` copy still exists alongside `~/code/music-growth-pipeline`, treat the `~/code` one as authoritative** — it has the validation/db/rate-limit fixes above; the `/mnt/c` copy was only used transiently to paste a corrected `.env.local` value and should not be edited further.
>
> **Stage A is COMPLETE.** All of A0–A5 plus the `api/` serving layer are built, tested, and verified against the live DB.
>
> **Grants verified 2026-08-05** — the footgun in the Security section is closed. Connecting as `app_readonly` after the latest `dbt build`: all 7 `api_*` tables and all 7 marts are selectable (14 relations, row counts as listed below), a write attempt is rejected with `permission denied for schema public`, and both role-level guardrails are live (`statement_timeout=5s`, `idle_in_transaction_session_timeout=10s`). The declarative `+grants` config in `dbt_project.yml` is doing its job across rebuilds.
>
> **Step labels reconciled 2026-08-05.** The old note here flagged that this block's labels (A0–A3) didn't match the body's (A0–A5, with `app_readonly` under Security). Resolved by treating the body as authoritative: A0 diagnostics · A1 extensions+indexes · A2 mart coverage fixes · A3 flip to tables · A4 `api/` serving layer · A5 Neon free-tier constraints. The `app_readonly` role was pulled forward from Security to unblock A3's `+grants`, since the declarative config needs the role to exist. "A5b" in older notes means the `api/` model set, i.e. A4.
>
> **Issue #1 fixed 2026-08-05** — `pipeline/generate_stats.py` emits `growth_by_size_quintile` instead of `growth_by_tier`, so the portfolio site stops contradicting the README. `min_page` dropped from `top_growing_artists` in the same change. Details and the residual README-drift question in `docs/findings.md` Issue #1.
>
> **Done:** A0 (diagnostics) · A1 (extensions, 4 indexes, `tags` DDL) · A2 (dedupe + `pipeline/db.py`/`pipeline/lastfm.py` + `ux_artists_name_norm`, fix marts to left-join/first-last-by-date) · A3 (marts + `int_artist_base` materialized for real via `dbt build` — see verification below) · `app_readonly` role created (pulled forward from the Security section to unblock A3's `+grants`, since the declarative grants config depends on the role existing)
>
> **Verified 2026-08-03**, after finding the previous note's numbers were stale/never actually re-run:
> - Live DB previously still had every mart as a VIEW and no `int_artist_base` at all, despite `dbt/dbt_project.yml` and the model file being committed — `dbt build` had never been executed against this database. Now confirmed: `listener_growth`, `artist_tiers`, `artist_growth_summary`, `artist_similarity_network`, `genre_stats`, `weekly_growth_by_tier`, `genre_growth` are all `BASE TABLE`; `int_artist_base` exists as a view (per its `intermediate` config).
> - `artist_tiers` now has 22,207 rows (full coverage, not the old 7,751-row inner join).
> - Corrected: `int_artist_base`'s grain is artists with ≥1 snapshot = **22,201** of 22,207 (the old note's "21,732" was actually CLAUDE.md's *different* ≥6-weeks-tracked stat, copied in by mistake — the model itself was never wrong).
> - `is_display_safe` tested against the actual rendered SQL (both python-dotenv and `source .env; set -a` loading paths) — no quoting corruption from `PROFANITY_PATTERN`; 47 artists flagged unsafe (was noted as 46, off by one — plausibly a new artist since).
> - `size_band` histogram is well-distributed across all 7 bands, confirming revision 5's fix.
> - `app_readonly`: created, granted `SELECT` on all tables + `statement_timeout`/`idle_in_transaction_session_timeout`, connection string saved to `.env` as `DATABASE_URL_READONLY`. Confirmed it can read `artist_tiers` and a write attempt is rejected with `permission denied`.
>
> **Next — `dbt/models/api/` serving layer** (the body's A4):
> 1. ✅ `api_artist_timeseries`
> 2. ✅ `api_artist_profile`
> 3. ✅ `api_artist_search` — 22,154 rows (22,201 profiles minus 47 unsafe names), 5 indexes incl. `gin (name_norm gin_trgm_ops)`, verified in Neon 2026-08-05
> 4. ✅ `api_cohort_weekly` — 299 rows: `all` (1) + `size_band` (7) + `genre` (15) × 13 weeks. Cohorted on `size_band` per revision 2. Built on a **fixed panel** (artists whose series starts 2026-05-10); without it the ~470 later-seeded artists entered at indexed=100 in the final week and pulled its median down 102.11 → 102.06, which reads as a growth slowdown but is composition drift. Genres below `min_cohort_size` (20) are dropped — 15 of them survive.
> 5. ✅ `api_artist_similar` — 69,748 rows. Edges symmetrised, which lifts artists with a non-empty similar table from 1,982 to **14,325** (issue #5 was a display bug as much as a seeding gap). Capped at `max_similar_per_artist` (20).
> 6. ✅ `api_leaderboard` — 3 metrics × 8 scopes ('all' + 7 size bands) × 50. Candidates are the 21,614 artists that are display-safe, have the full 13-week window, and started above `min_leaderboard_listeners` (1,000).
> 7. ✅ `api_pipeline_health` — 1 row; freshness measured from `latest_snapshot_date`, not the dbt run.
> 8. ✅ `dbt/models/api/schema.yml` tests — 7 models covered; grain assertions as singular tests in `dbt/tests/`, plus a reusable `assert_single_row` generic in `dbt/tests/generic/`. No `dbt_utils` dependency.
>
> **Stage A5b is complete — all 7 api models built and tested (2026-08-05).** Next: Stage C.
>
> **Deferred to Stage B** (both are pure API time, ~10× cheaper after the concurrency refactor):
> - A4 genre backfill via `artist.getTopTags` → `tags` table (~22k calls)
> - Similarity re-seed for the 7,822 charted artists still missing it (~7.8k calls)
>
> **Plan revisions learned from the data — these override the text below:**
> 1. The chart is *fully seeded* (pages 1-2000 = all 10,000 artists, confirmed via `totalPages=2000`). Stage B's "chart backfill" line item is complete; all remaining growth must come from tags and geo.
> 2. **Do not build `api_cohort_weekly` on `tier`.** "unranked" is an observation gap, not a popularity band — it holds both 5.5M-listener artists and 1-listener artists. Use **listener percentile bands** instead. Keep `tier` only for the chart-depth analysis.
> 3. Neon is at 53 MB of ~0.5 GiB, not near the limit. The storage-crunch risk is ~a year further out than estimated; `CONCURRENTLY` is unnecessary at this size.
> 4. Stage A2's "handle collisions" step turned out to be unnecessary — all 36,468 duplicate snapshot rows were byte-identical, so losers were deleted rather than merged.
> 5. **`size_band` cut points, chosen from the actual listener histogram** (log-decade bands put 62.5% of artists in one bucket): `<10k` / `10k-50k` / `50k-100k` / `100k-250k` / `250k-500k` / `500k-1M` / `1M+`, keyed off each artist's *first* observation so cohort membership never drifts as an artist grows. `listener_percentile` (in `int_artist_base`) is the separate, *latest*-listeners display stat — the two are intentionally asymmetric.
> 6. `dbt run`/`dbt build` need `PROFANITY_PATTERN` exported into the shell (`env_var()` reads the process env, not `.env`) — CI's `Run dbt` step now sets it explicitly. `.env` values containing shell metacharacters (`|`, `&`, etc.) must be quoted or `source`/`set -a` mis-parses them; this silently defeated the profanity filter once already. **Resolved 2026-08-05:** it can no longer fail silently — `dbt/macros/profanity.sql` raises a compiler error when the variable is unset, so a missed export stops the build instead of marking every name safe. Redaction now happens once in `int_artist_base` (`display_name` + a `<id>-redacted` slug, so profanity never reaches a URL); API models expose `display_name` only, and `api_artist_search` drops unsafe artists outright.
>
> See `CLAUDE.md` § *Open Data-Quality Issues* for the six unresolved items.

## Context

`music-growth-pipeline` currently ends at a static JSON file: `pipeline/generate_stats.py` writes `data/pipeline_stats.json`, which deanslist.dev (Astro) fetches at build time. The analysis is done, but there is no product — nothing a stranger can use.

The goal is a live, public app at `music.deanslist.dev` where anyone can look up a band and see its longitudinal listener growth, plus how it compares to its genre, its tier, and its similar artists. It must be free to host, must not let anonymous traffic hammer a free-tier Neon database, and must be injection-proof. Secondarily, artist coverage grows from ~24,770 to ~50,000 so more searches actually hit.

Two problems found during exploration reshape the work:

1. **`dbt/models/marts/artist_tiers.sql:13` inner-joins `stg_weekly_charts`.** Only the 7,751 charted artists get a tier, and every downstream mart inherits that inner join. The other ~17,000 artists have listener history but **no profile row** — search would find them and their page would 404. This is invisible today and fatal to the app.
2. **The Last.fm chart is exhausted.** `pipeline/seed_artists.py:48` calls `chart.getTopArtists` with `limit: 5` over 2,000 pages = the entire 10,000-artist chart. Only pages 51–499 (~2,245 artists) remain unseeded. The other ~23k must come from tags and geo.

Because of (1), fixing the marts unlocks 3× the app's artist coverage with zero new ingestion — and those artists already have 14+ weeks of history, whereas newly-seeded ones would show empty charts until ~Nov 2026. **Order is A → C → D → E → B.**

## Ownership

- **You:** Stage A (SQL, dbt) and Stage B (Python ingestion) — the data-engineering work the portfolio is meant to demonstrate. I walk through each step; you write it.
- **Me:** Stages C, D, E (Next.js / TypeScript / React / deploy) — plumbing, not portfolio signal.

---

## Stage A — Database readiness *(you)*

### A0. Verify before changing

```sql
-- duplicates: ON CONFLICT (mbid) never fires when mbid IS NULL (seed_artists.py:60)
SELECT lower(btrim(name)) n, count(*) c FROM artists GROUP BY 1 HAVING count(*)>1 ORDER BY c DESC LIMIT 20;
-- the coverage gap
SELECT count(*) FROM artists a WHERE NOT EXISTS (SELECT 1 FROM weekly_charts w WHERE w.artist_id=a.id);
-- weekly_charts has no unique constraint — re-runs duplicated rows
SELECT snapshot_date, count(*) FROM weekly_charts GROUP BY 1 ORDER BY 1;
SELECT pg_size_pretty(pg_database_size(current_database()));
```

### A1. Extensions + indexes (add to `sql/schema.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_snapshots_date       ON artist_snapshots (snapshot_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_weekly_charts_artist ON weekly_charts (artist_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_genre_artists_artist ON genre_artists (artist_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_similar_target       ON artist_similarities (similar_artist_id);
```

`ix_snapshots_date` is what makes `pipeline/snapshot_artists.py`'s resumability anti-join cheap — it currently scans the whole snapshot table on every restart. Do **not** add indexes on `artist_snapshots(artist_id)` or `artist_similarities(artist_id)`; the existing UNIQUE constraints already lead on those columns.

### A2. Fix the coverage-gap marts

**`dbt/models/marts/artist_tiers.sql`** — left join, third tier, and a limit-independent rank:

```sql
left join {{ ref('stg_weekly_charts') }} wc on a.artist_id = wc.artist_id
...
case when min(wc.page) is null then 'unranked'
     when min(wc.page) <= 50   then 'mainstream'
     else 'indie' end as tier,
min((wc.page - 1) * 5 + wc.rank) as global_rank
```

`page` only means what it means because `limit=5` is hardcoded at `pipeline/seed_artists.py:48`. Deriving `global_rank` makes tiering survive a change to that limit.

**`dbt/models/marts/listener_growth.sql`** — replace the hardcoded `where snapshot_date != '2026-04-27'` with `where snapshot_date > (select min(snapshot_date) from {{ ref('stg_artist_snapshots') }})`.

**`dbt/models/marts/artist_growth_summary.sql`** — `max(g.listeners) as ending_count` is wrong the first time Last.fm revises a count downward. Take first/last by date explicitly:

```sql
(array_agg(listeners order by snapshot_date desc))[1] as ending_count,
(array_agg(listeners order by snapshot_date asc ))[1] as starting_count
```

**`dbt/models/marts/artist_similarity_network.sql`** — guard `similar_artist_id is not null`; the `unranked` tier fixes the rest.

### A3. Flip marts to tables

`dbt/dbt_project.yml` currently ends at a bare `models: music_growth:`. Replace with:

```yaml
models:
  music_growth:
    staging:
      +materialized: view
    marts:
      +materialized: table
      +grants: {select: ['app_readonly']}
    api:
      +materialized: table
      +grants: {select: ['app_readonly']}
on-run-start: "set lock_timeout = '5s'"
```

`listener_growth` runs a `LAG` over the whole snapshot table. As a view, every artist-page request re-executes that window over ~200k rows — not survivable on a 0.25 CU Neon compute. The `+grants` block is load-bearing (see Security). Do **not** use `incremental` yet: window functions aren't incremental-friendly and full rebuild takes seconds at this scale.

Per-model btree indexes via dbt's native config; the trigram index needs a `post_hook` because the native config can't express an operator class.

### A4. New `dbt/models/api/` serving layer

Narrow, pre-joined, pre-indexed tables so the API never queries the general-purpose marts. This is also the clearest "serving layer vs analytical layer" signal for a reviewer.

| Model | Grain | Notes |
|---|---|---|
| `api_artist_search` | artist | `name_norm`, `slug`, `tier`, `latest_listeners`, `is_display_safe` |
| `api_artist_profile` | artist | genres `text[]`, latest stats, growth totals, `pct_rank_in_tier`, `pct_rank_in_genre` |
| `api_artist_timeseries` | artist × week | listeners, delta, pct_change, `listeners_indexed` |
| `api_cohort_weekly` | cohort × week | `cohort_type` ('tier'\|'genre'\|'all'), `cohort_key`, median/p25/p75 indexed |
| `api_artist_similar` | artist × similar | similar artist's own growth + latest listeners |
| `api_leaderboard` | slice × rank | precomputed slices |
| `api_pipeline_health` | 1 row | artist count, weeks tracked, latest snapshot, freshness lag |

Two columns carry most of the app's value:

- **`listeners_indexed`** — each series rebased to 100 at its first observation: `round(100.0 * listeners / first_value(listeners) over (partition by artist_id order by snapshot_date), 2)`. Without this, an indie artist at 40k listeners is a flat line at the bottom of a chart scaled to a 3.3M-listener tier median.
- **`pct_rank_in_tier`** — `percent_rank() over (partition by tier order by total_pct_growth)`. Turns "grew faster than 87% of indie artists" from a per-request full scan into a column read.

`api_cohort_weekly` makes the comparison endpoint a join of two ~50-row slices instead of computing a median across thousands of artists per request.

**Search index** — pg_trgm, not full-text. Artist names are short proper nouns, often stylised (`Sigur Rós`, `$uicideboy$`); stemming adds nothing and the real failure mode is typos, which trigram similarity solves and FTS doesn't. `unaccent()` is STABLE, not IMMUTABLE, so it **cannot** be indexed directly — precompute `name_norm = lower(unaccent(btrim(name)))` as a column instead:

```sql
CREATE INDEX ix_search_trgm   ON api_artist_search USING gin (name_norm gin_trgm_ops);
CREATE INDEX ix_search_prefix ON api_artist_search (name_norm text_pattern_ops);
```

Queries under 3 chars produce no trigrams — hence the prefix index as a second path.

### A5. Neon free-tier reality

| Constraint | Mitigation |
|---|---|
| Autosuspend ~5 min, not disableable | CDN caching (Stage C) so most requests never reach Neon; explicit "waking the database" UI after 1.5 s |
| ~0.5 GiB storage | At 50k × 52 weeks ≈ 2.6M rows/yr you exceed this within ~12 months. Keep one full-grain time-series mart; plan a monthly rollup; budget $5/mo Neon Launch as the escape hatch |
| Limited compute hours | Do **not** run a 24/7 keep-alive — it would consume ~730 h/mo. Accept the cold start and design for it |

Cache your way out of the cold start rather than paying to avoid it, and make the cold-start state deliberate UI. Discussing scale-to-zero trade-offs well is worth more in an interview than hiding them.

**Effort: 1–2 days.**

---

## Stage C — API layer *(me)*

New `web/` directory, Next.js App Router.

**Postgres client: `@neondatabase/serverless` (HTTP driver).** Serverless functions can't hold a TCP pool across invocations; `pg` pays a fresh TCP+TLS handshake per cold invocation and can exhaust Neon's connection budget under burst. The HTTP driver is one `fetch` round trip, no pooler, Edge-compatible. Its only real limit — no interactive transactions — is irrelevant: every endpoint is one read-only statement.

**SQL injection.** Tagged template only:

```ts
const rows = await sql`select * from api_artist_profile where artist_id = ${id}`;
```

Never call `sql(str)` as a plain function — that executes raw SQL and is the one path to injection with this library. Identifiers and `ORDER BY` can't be parameterised, so sort keys go through a frozen whitelist map indexed by a zod enum. `LIMIT`/`OFFSET` parsed to int, clamped, passed as params. Search uses trigram operators rather than `ILIKE '%'||$1||'%'` so a user typing `%%%` can't force a full scan. Backed by an ESLint rule banning non-template `sql(` calls.

**Rate limiting: Upstash Redis free tier + `@upstash/ratelimit`**, sliding window 30 req/60 s. Vercel's persistent rate-limit rules are paid-plan only; in-memory limiting is per-instance and trivially bypassed by concurrency on a horizontally-scaled runtime. Key = SHA-256 of client IP + a server-side salt (never store raw IPs). Returns 429 with `Retry-After` + `X-RateLimit-*`. Wrapped in a `withRateLimit()` helper so no route can forget it, and **fails open** to an in-memory fallback if Upstash errors — a limiter that takes the site down is worse than none.

Third and most important layer: `ALTER ROLE app_readonly SET statement_timeout = '5s'` — set on the role, so nothing can bypass it. This caps the damage of any single request regardless of the limiter.

**Validation:** one zod schema per route parsed from `searchParams`; `limit` ≤ 100, `q` 2–64 chars, ids positive ints, enums for tier/metric/genre. 400s return a generic message — never the zod error tree, which describes the API surface.

**Caching:** data changes once a week, so cache like it. `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` on route handlers; `revalidate = 3600` plus `generateStaticParams` prerendering the top ~500 artists; `s-maxage=600` on search. This is the primary defence for both Neon cold starts and compute hours.

**Endpoints** (all read-only; there are no write endpoints, by design):

| Route | Backing table |
|---|---|
| `GET /api/search?q=` | `api_artist_search` — `name_norm % $1 or name_norm like $1\|\|'%'`, ranked exact → prefix → `similarity()` → listeners, `limit 10`. Explicit `similarity(...) > 0.3` rather than a session-level threshold |
| `GET /api/artists/[slug]` | `api_artist_profile` |
| `GET /api/artists/[slug]/timeseries` | `api_artist_timeseries` |
| `GET /api/artists/[slug]/compare?vs=genre\|tier\|similar` | `api_artist_timeseries` ⋈ `api_cohort_weekly` |
| `GET /api/artists/[slug]/similar` | `api_artist_similar` |
| `GET /api/leaderboards?slice=&limit=` | `api_leaderboard` |
| `GET /api/genres` | `genre_stats` / `genre_growth` |
| `GET /api/stats` | `api_pipeline_health` |

**Search miss** returns `{ found: false, suggestions: [...] }` — same trigram query at threshold ~0.15, `limit 5`. No live Last.fm passthrough (your decision). The UI explains *why* an artist isn't tracked, turning a dead end into a note about how the universe is seeded.

**Effort: 4–6 days.**

---

## Stage D — Frontend *(me)*

**Routes:** `/` (search-first landing) · `/artist/[slug]` · `/leaderboards` · `/genres` + `/genres/[g]` · `/how-it-works` · not-found.

**Slug format `{id}-{name-slugified}`** (e.g. `/artist/8231-black-country-new-road`) — lookups go by integer PK, URLs stay readable, and it sidesteps the duplicate-name problem entirely.

**Artist page:** header stat tiles → absolute growth chart (log toggle) → **comparison chart** (tabbed vs genre / vs tier / vs similar, all indexed to 100, cohort as a median line with a p25–p75 band) → percentile callout → similar-artists table with sparklines → genre chips → a collapsible **"show the SQL"** under every chart displaying the actual query that produced it. That last one is cheap to build and the highest-signal element on the site for a SQL-focused job hunt.

**Charts: Recharts** (MIT, composable, fastest to a live product). One categorical palette site-wide, contrast-checked in light and dark. No pie charts.

**States:** skeleton `loading.tsx` matched to final layout dimensions; a **cold-start state** that swaps to "waking up the free-tier database…" after 1.5 s; an **insufficient-data state** for `weeks_tracked < 3` ("tracking since {date}, comparisons unlock at 4 weeks") — build this early, it's the state every Stage B artist will be in for months; a not-found state with fuzzy suggestions; errors as a generic message + request ID.

**Mobile:** tiles 2-up under 640px, `ResponsiveContainer` with reduced tick density, tables collapse to cards, 44px tap targets.

**`/how-it-works` is where the job-hunt value concentrates:** architecture diagram (Last.fm → Python → Neon → dbt → serving marts → Next.js), the dbt DAG, a live freshness widget off `/api/stats`, an honest methodology-and-caveats section (cumulative listeners can only increase; chart survivorship; self-reported tags), and deep links to specific repo files so a reviewer lands on `dbt/models/marts/artist_growth_summary.sql`, not the repo root.

**Effort: 5–8 days.**

---

## Stage E — Deploy & ops *(me)*

- Vercel project, **Root Directory = `web`**. **Ignored Build Step** — `web/vercel.json` now sets `"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."` (runs with cwd = Root Directory, so `.` already scopes to `web/`) — without this the weekly `chore: update pipeline stats` commit triggers a full production rebuild every Sunday for a JSON file the app doesn't read.
- Env vars, all server-only (no `NEXT_PUBLIC_`): `DATABASE_URL_READONLY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REVALIDATE_SECRET`, `IP_HASH_SALT`.
- `music.deanslist.dev` → CNAME to `cname.vercel-dns.com`. Astro apex untouched; add a reciprocal project card linking to it.
- **Pipeline → app handshake, built but currently a no-op:** `web/src/app/api/revalidate/route.ts` exists — after `pipeline/generate_stats.py`, the workflow POSTs to `/api/revalidate?secret=…`, which calls `revalidateTag('marts')`. **Caveat (found 2026-08-05, not yet resolved):** none of the `api_*` routes read through Next's fetch/Data Cache — they hit Postgres directly and cache via a manual `Cache-Control: s-maxage=3600` header (`web/src/lib/cache.ts`) instead. `revalidateTag` only purges Next's Data Cache, so today's call has nothing to invalidate; freshness is bounded by that header's 1-hour `s-maxage`, not "seconds after the pipeline finishes." Deliberately not refactoring the 8 verified routes onto Next's cache system to make the tag real — the risk isn't worth it for a once-a-week dataset. Endpoint is wired up now so it starts doing real work the day a route opts into fetch-tag caching, with no further workflow change needed.

**Does dbt rebuilding tables fight the live app?** Mostly no. dbt-postgres builds `model__dbt_tmp` then drops+renames inside one transaction; the rename takes `ACCESS EXCLUSIVE` momentarily. With sub-100 ms reads the worst case is a few hundred ms of added latency once a week. Two guards: `statement_timeout = '5s'` on the app role (no reader can hold a lock long enough to cause pile-up) and `lock_timeout = '5s'` for dbt (fails fast rather than blocking every queued reader). Upside: table materialization means the app serves one internally-consistent snapshot all week — nobody sees a half-rebuilt mart.

**Effort: 1–2 days.**

---

## Stage B — Ingestion scale-up to ~50k *(you, last)*

### B1. Sources (chart backfill + tags + geo; no similarity snowball)

| Source | New uniques | Notes |
|---|---|---|
| `tag.getTopArtists`, ~150 tags from `chart.getTopTags`, `limit=1000` | ~20–30k | The main lever. Also gives every artist a genre, which the "vs your genre" feature requires. Extends `pipeline/seed_genre_artists.py` from 15 genres |
| `geo.getTopArtists`, ~50 countries × 500 | ~10–15k | New script + countries table. Best source of non-Anglo artists; enables a "growth by region" analysis |
| `chart.getTopArtists` pages 51–499 | ~2,245 | Exhausts the chart. Fills the hole between pages 50 and 500 — right now there's no middle of the distribution, which weakens the "growth vs chart depth" finding |

### B2. Fix duplicates first

At `pipeline/seed_artists.py:60`, `ON CONFLICT (mbid) DO NOTHING` doesn't fire when mbid is NULL — the unique index ignores NULLs — so the insert succeeds and creates a duplicate. Scaling to 50k multiplies this, and duplicates surface directly in autocomplete. Before ingesting more:

1. Dedupe-merge on `lower(btrim(name))` where mbid is null, repointing FK rows.
2. Add a shared **`pipeline/db.py`** with one `get_or_create_artist(cur, name, mbid)` used by all seed scripts. There are currently four writers with four subtly different upsert implementations; a fifth is coming.
3. Consider `CREATE UNIQUE INDEX ux_artists_name_norm ON artists (lower(btrim(name)))` — only if the dedupe confirms no legitimately-distinct artists share a normalised name.

Also add `CREATE UNIQUE INDEX ux_weekly_charts ON weekly_charts (artist_id, page, rank, snapshot_date)` — the table has no unique constraint, so every `pipeline/seed_artists.py` re-run duplicates rows. `min(page)` masks it.

### B3. Concurrency refactor of `pipeline/snapshot_artists.py`

**HTTP in threads, DB in the main thread.** psycopg2 connections aren't safe across threads — never hand a cursor to a worker. `ThreadPoolExecutor(max_workers=10)` performs *only* `artist.getInfo` and returns `(artist_id, listeners, playcount)`; the main thread drains `as_completed()` and batches.

- **Writes:** `psycopg2.extras.execute_values`, 500-row batches, commit per batch. Current code is one execute per artist and one commit at the very end — 50k round trips and a single enormous transaction that loses everything on failure.
- **Rate limiter:** shared token bucket, not `time.sleep`. Refill 4.0 tokens/s, capacity 5, guarded by a `threading.Lock`; every worker calls `acquire()` before its request. The 10 workers exist to hide ~200 ms of API latency, not to exceed Last.fm's ~5 req/s guidance — the bucket is the throttle.
- **Retry:** 3 attempts, exponential backoff with jitter, honour `Retry-After`. Retry on 429/5xx/timeouts and Last.fm codes 8/11/16/29. **Don't retry code 6 (not found)** — persist `last_error_code`/`last_error_at` on `artists` and drop persistently-dead names from the worklist. At a plausible 5–10% dead-name rate, retrying them weekly wastes 20+ minutes every run forever.
- Thread-local `requests.Session` with `HTTPAdapter(pool_maxsize=10)`. Switch `BASE_URL` (`pipeline/seed_artists.py:24` and siblings) to **https** — it's currently plain http, putting the API key on the wire in cleartext.

**Runtime at 50k:** 50,000 ÷ 4.0 req/s ≈ **3 h 28 m**. Under the 6 h cap, but thinner than it looks once retries and Neon cold starts count.

### B4. Workflow changes

**Don't shard for throughput** — a 4-way matrix means four IPs at 4 req/s each = 16 req/s against a per-key limit. To stay compliant you'd cut per-shard rate to 1 req/s and end up back at 3.5 h with 4× the complexity.

Instead, in `.github/workflows/weekly_snapshot.yml`:
- `timeout-minutes: 330` and `concurrency: {group: weekly-snapshot, cancel-in-progress: false}`.
- Split `dbt run` + `pipeline/generate_stats.py` into a **separate job with `needs: snapshot` and `if: always()`**. Today, if the snapshot times out, dbt never runs and stats go stale — the marts should rebuild on whatever data landed.
- **Pin the snapshot date.** `snapshot_date = datetime.date.today()` means a run crossing 00:00 UTC, or a Monday catch-up, writes a *second distinct snapshot_date* — fragmenting the weekly grain and silently corrupting every `LAG` in the marts. Add `--snapshot-date` defaulting to the most recent Sunday; pass it explicitly in CI.
- Add a catch-up trigger ~5 h after the first. The existing `LEFT JOIN` anti-join already makes restarts correct and idempotent — that design holds up well at scale.

**Effort: 3–5 days engineering, plus days of wall clock re-seeding and months before new artists have comparable history.**

---

## Security

**Read-only role — and its footgun:**

```sql
CREATE ROLE app_readonly LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE neondb TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
ALTER ROLE app_readonly SET statement_timeout = '5s';
ALTER ROLE app_readonly SET idle_in_transaction_session_timeout = '10s';
```

`GRANT ... ON ALL TABLES` is **point-in-time**. dbt drops and recreates every mart weekly, and the new tables carry no grant — so the app starts returning "permission denied for table api_artist_profile" every Sunday afternoon. `ALTER DEFAULT PRIVILEGES` only helps if run as the creating role. The robust fix is the declarative `+grants` config in A3, which dbt reapplies on every build.

**Never put the owner `DATABASE_URL` in Vercel.** The app gets `app_readonly` only — highest-value single control in this plan.

Other items: no permissive CORS (same-origin is the default and is correct); security headers via `next.config.js` (`frame-ancestors 'none'`, `nosniff`, `strict-origin-when-cross-origin`); catch every error, log the Postgres detail server-side, return `{error, requestId}` — raw Postgres errors name tables and columns; never `dangerouslySetInnerHTML` on artist names or search terms.

**Content safety — currently missing.** `pipeline/generate_stats.py` redacts artist names via `PROFANITY_PATTERN` before they reach the portfolio. The web app would expose **all 50,000 raw names** on a recruiter-facing site via autocomplete, leaderboards, and similar-artist tables. Port the same filter into an `is_display_safe` boolean on `api_artist_search` / `api_artist_profile` and decide deliberately whether unsafe names are hidden, redacted, or reachable by direct URL only. Last.fm's deep chart pages contain material you don't want autocompleting on a hiring manager's screen.

**Crawler load.** 50k artist URLs is 50k potential uncached DB hits from one Googlebot crawl. Sitemap covering only the top ~1,000 artists, `noindex` on pages with `weeks_tracked < 4`, conservative `robots.txt`.

**Last.fm attribution.** Their terms require attribution for displayed data and restrict commercial use. Add a visible "Data from Last.fm" credit with a link.

---

## Verification

**Stage A** — after `dbt build`:
```sql
select tier, count(*) from artist_tiers group by 1;              -- expect an 'unranked' bucket ≈ 17k
select count(*) from api_artist_profile;                          -- should ≈ artists row count, not 7,751
explain analyze select artist_id, name from api_artist_search
  where name_norm % 'radiohed' order by similarity(name_norm,'radiohed') desc limit 10;  -- expect Bitmap Index Scan on ix_search_trgm, <50ms
select artist_id, snapshot_date, count(*) from api_artist_timeseries group by 1,2 having count(*)>1;  -- expect 0 rows
```
Confirm as `app_readonly` that every `api_*` table is selectable *after* a dbt rebuild — that's the grants footgun.

**Stage C** — `npm run dev`, then: valid artist returns 200 with a populated series; `?q=%%%` and `?limit=99999` return 400, not a slow query; 40 rapid requests produce a 429 with `Retry-After`; `curl -I` shows `s-maxage=3600`; an `app_readonly` write attempt fails.

**Stage D** — Playwright smoke test on the preview deploy: search → click result → chart renders → "show SQL" expands. Manually check an artist with `weeks_tracked < 3` shows the insufficient-data state, and a nonexistent band shows suggestions.

**Stage E** — deploy to preview, verify `music.deanslist.dev` resolves and serves over HTTPS; run the weekly workflow via `workflow_dispatch` and confirm (a) Vercel does *not* rebuild, (b) the revalidate call returns 200, (c) the app shows the new snapshot date within a minute.

**Stage B** — dry-run the concurrent snapshot against 500 artists and confirm ≤5 req/s in logs, batched inserts, and that a mid-run kill followed by a restart completes without duplicate or missing rows.

**Tests to add** (repo is currently test-free — `dbt/tests/` holds only `.gitkeep`), highest value first:
1. One integration test against a Dockerised Postgres seeded with ~50 fixture artists, running the *real* endpoint SQL. Catches missing indexes and mart-shape drift — the failures that actually bite.
2. dbt tests: `unique`/`not_null` on `api_artist_profile.artist_id`, `accepted_values` on `tier`, singular test for one row per `(artist_id, snapshot_date)`. Run `dbt build` in CI.
3. pytest + `responses`: token-bucket math with a fake clock, retry behaviour including the don't-retry-code-6 rule, batch-insert path.
4. vitest: zod rejection, sort-key whitelist, slug round-trip, rate-limiter fail-open.

---

## Risks

1. **The 17k unranked artists (Stage A2) are the whole ballgame.** Skip that fix and the app has 7,751 working pages instead of 24,770.
2. **`snapshot_date = today()` fragments the weekly grain** on any long or catch-up run, silently corrupting every `LAG`. Fix before Stage B, not after.
3. **Neon free storage runs out within ~12 months** at 50k weekly snapshots with materialized marts. Budget $5/mo or plan the rollup now.
4. **Duplicate artist rows** from the mbid-NULL path will appear in autocomplete the day the app goes live.
5. **Profanity filtering doesn't carry over** from `pipeline/generate_stats.py` to the web app.
6. **Scope.** A + C + D + E is ~3 weeks of solid part-time work; Stage B adds a week plus months of wall clock before new artists have usable history.
