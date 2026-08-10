# Stage B: Ingestion Scale-Up

## Context

The pipeline (ingestion, marts, analyses, weekly automation, Power BI) and the web app (Stages A, C, D, E) are all complete and live at `music.deanslist.dev`. The only remaining work per `docs/webapp-implementation-plan.md` is **Stage B — ingestion scale-up to ~50k artists**, the data-engineering-fundamentals section this whole portfolio project exists to demonstrate.

Data check (verified live against the DB, 2026-08-07, not just from docs):
- 22,207 total artists, 22,201 with ≥1 snapshot, 15 weekly snapshot dates (2026-04-27 → 2026-08-02). DB size 145 MB (up from 53 MB noted 2026-08-03 in the docs — still far under the 0.5 GiB free tier, but growing faster than that estimate assumed).
- Chart backfill is **already done** — pages 1-2000 (all 10,000 chart slots) are seeded; `docs/webapp-implementation-plan.md`'s Stage B table still lists "chart pages 51-499" as a line item, but that's stale — its own revision-notes preamble and `docs/findings.md`'s build log both already say this is complete. Drop it from scope.
- Genre coverage: 6,829/22,207 (30.8%). `tags` table is empty. `pipeline/seed_genre_artists.py` only covers 15 hardcoded genres.
- Similarity: only 1,986/9,808 charted artists have outgoing edges; 7,822 charted artists still missing them. Uncharted artists (12,399 today) get **zero** outgoing edges by construction — `pipeline/seed_similar_artists.py`'s population query only joins `weekly_charts`.
- `pipeline/snapshot_artists.py` is fully sequential (no thread pool, no rate limiter, minimal retry, single commit at the very end) — not viable as-is once the population roughly doubles.
- `weekly_charts` has no unique constraint, so any re-run over the same page range duplicates rows.
- `.github/workflows/weekly_snapshot.yml` has no timeout, no concurrency guard, and one job (a snapshot failure means `dbt run`/stats never execute that week).

User decisions locked in for this plan:
1. **Expand similarity seeding beyond the original doc's scope** — cover uncharted (tag/geo-seeded) artists too, not just the 7,822 charted gap, so most of Stage B's new population isn't permanently blank on "similar artists."
2. **Full Stage B in one pass**, sequenced **B2 → B3 → B1 → B4** — close the `weekly_charts` constraint and build the concurrency/retry infrastructure *before* the new ~40-70k-artist ingestion volume hits it, then wrap with workflow changes.

**Ownership stays as the original plan set it: the user writes the Python/SQL for Stage B, guided step by step — this is the DE-fundamentals code that goes in the portfolio.** Treat this plan as the walkthrough spec, not as work to execute unprompted.

---

## B2 — `weekly_charts` unique constraint

1. Confirm no existing duplicates: `SELECT artist_id, page, rank, snapshot_date, count(*) FROM weekly_charts GROUP BY 1,2,3,4 HAVING count(*) > 1;` (expect 0 rows).
2. If any exist, dedupe via a `sql/migrations/002_dedupe_weekly_charts.sql` following the pattern in `sql/migrations/001_dedupe_artists.sql` (row_number() partition, delete rn > 1).
3. Add to `sql/schema.sql`, matching its existing `CREATE ... IF NOT EXISTS` style:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS ux_weekly_charts
       ON weekly_charts (artist_id, page, rank, snapshot_date);
   ```
   No `CONCURRENTLY` needed at 145 MB.
4. Update `pipeline/seed_artists.py`'s insert to add `ON CONFLICT (artist_id, page, rank, snapshot_date) DO NOTHING` so a re-run is a safe no-op against the new constraint.

**Effort:** ~1 hour.

---

## B3 — Concurrency refactor of `pipeline/snapshot_artists.py`

Current file is a plain `for` loop: one `artist.getInfo` call per artist, one `INSERT` per row, `conn.commit()` only once at the very end of `__main__`, and no rate limiting or retry logic beyond log-and-skip. Not viable once the worklist roughly doubles.

**Design — HTTP in threads, DB writes stay single-threaded and batched:**

- **Token bucket** (new, in `pipeline/lastfm.py`): refill 4.0 tokens/s, capacity 5, `threading.Lock`-guarded `acquire()`. This is the actual throttle — Last.fm's informal ~5 req/s guidance.
- **`ThreadPoolExecutor(max_workers=10)`** — workers exist only to hide ~200ms of per-request latency, not to exceed the bucket's ceiling. Thread-local `requests.Session` with `HTTPAdapter(pool_maxsize=10)` per worker.
- **Retry/backoff** — new `get_with_retry()` wrapper in `pipeline/lastfm.py`: 3 attempts, jittered exponential backoff, honors `Retry-After`. Retry on HTTP `{429, 500, 502, 503, 504}` and Last.fm error codes `{8, 11, 16, 29}`. **Never retry code 6** (not found) — raise a dedicated `ArtistNotFoundError` instead.
- **Dead-artist tracking** — new columns `artists.last_error_code INTEGER`, `artists.last_error_at TIMESTAMPTZ` (migration + `sql/schema.sql`). `snapshot()`'s worklist query excludes `last_error_code = 6` so a persistently-dead name isn't retried every week forever.
- **Batched writes** — main thread drains `as_completed()`, buffers into ~500-row batches, writes via `psycopg2.extras.execute_values` with `ON CONFLICT (artist_id, snapshot_date) DO NOTHING`, `conn.commit()` per batch (not once at the end). Dead-artist updates batched the same way.
- **Critical correctness rule to flag explicitly while pairing on this:** only the main thread ever touches `cur`/`conn`. Worker functions return plain tuples — `psycopg2` connections are not thread-safe, and this is the easiest mistake to make refactoring the existing loop.
- `pipeline/lastfm.py`'s `BASE_URL` is already `https://` — no change needed there (the original doc's note is stale).

**Runtime at 50k:** 50,000 ÷ 4.0 req/s ≈ 3h28m — under GitHub Actions' 6h cap but thin once retries count, which is why B4's timeout/catch-up trigger matter.

**Verification:**
- Dry run with a capped worklist (temporary `LIMIT` or a `--limit` flag): confirm request pacing ≤5/s from log timestamps, batched (not per-row) commits.
- Kill mid-run, restart with the same `--date`, confirm the anti-join worklist picks up only remaining artists and final `artist_snapshots` count matches `artists` count exactly (no dupes — already enforced by the existing unique constraint, but confirm no gaps either).
- Force a synthetic 429/500 and a code-6 case, confirm backoff and the never-retry rule in logs and in `artists.last_error_code`.
- `pytest` + `responses`: token-bucket math with a fake clock, retry sequences, don't-retry-on-6 rule.

**Effort:** 1.5-2 days including tests.

---

## B1 — New ingestion sources

Sequenced tags → geo → similarity expansion.

### B1a. Tag-based genre expansion (15 → ~150 genres)

`pipeline/seed_genre_artists.py` currently: hardcoded 15-genre list, no argparse, no dry-run (writes immediately — flagged in CLAUDE.md), `tag.getTopArtists limit=500`, crude `time.sleep(0.5)` throttling.

1. Replace the hardcoded list with `chart.getTopTags` (paginated, `limit=100`) to discover the top ~150 tags. **Confirm the exact response shape and pagination behavior via a manual curl first** — unlike `tag.getTopArtists`, this method isn't used anywhere in the codebase yet.
2. Add `argparse`: `--limit` (tag count), `--dry-run` (fetch + log, no writes), `--tag-limit` (existing per-tag artist cap). Closes the gap CLAUDE.md's File Guide already flags.
3. Swap the bare `time.sleep(0.5)` for B3's token bucket / `get_with_retry`.
4. Normalize tag names (`.strip().lower()`) before insert — `chart.getTopTags` may return casing variants of the existing 15 hardcoded genres, and `genres.genre` has no normalized-lookup index the way `artists.name` does.
5. Keep the existing per-genre commit and `ON CONFLICT DO NOTHING` pattern — both already correct.

**Verification:** `--dry-run --limit 150` logs ~150 tags with no writes; post-run, `genre_artists` coverage rises well past 6,829; `SELECT genre, count(*) FROM genres GROUP BY lower(genre) HAVING count(*) > 1` returns 0.

### B1b. Geo-based backfill (new script + schema)

No existing geo infrastructure. New tables mirroring `genres`/`genre_artists` exactly:

```sql
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    country TEXT NOT NULL UNIQUE,
    fetched_at DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS country_artists (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL REFERENCES countries(id),
    artist_id INTEGER NOT NULL REFERENCES artists(id),
    rank_in_country INTEGER NOT NULL,
    fetched_at DATE NOT NULL,
    UNIQUE (country_id, artist_id)
);
CREATE INDEX IF NOT EXISTS ix_country_artists_artist ON country_artists(artist_id);
```

New `pipeline/seed_country_artists.py`, structurally copied from B1a's *post-cleanup* version (argparse/dry-run/token-bucket already in place, so this is copy-adapt, not copy-then-fix-twice). ~50 countries, diverse by region for the "growth by region" analysis value. **Confirm `geo.getTopArtists`'s accepted country-name spelling and per-page cap via a manual curl smoke test on 3-4 countries before running the full list** — not yet used anywhere in the codebase.

**Verification:** `countries` ~50 rows; `country_artists` coverage; `artists` growth roughly matches estimate once tag overlap is accounted for.

### B1c. Similarity-seeding expansion (the scope decision)

`pipeline/seed_similar_artists.py`'s population query currently `JOIN`s `weekly_charts`, structurally excluding every uncharted artist. Rewrite to a `LEFT JOIN` covering all artists, charted-first ordering preserved:

```sql
SELECT a.id, a.name, a.mbid
FROM artists a
LEFT JOIN weekly_charts wc ON a.id = wc.artist_id
WHERE NOT EXISTS (
    SELECT 1 FROM artist_similarities s WHERE s.artist_id = a.id
)
GROUP BY a.id, a.name, a.mbid
ORDER BY
    (wc.artist_id IS NULL) ASC,          -- charted first
    min(coalesce((wc.page - 1) * 5 + wc.rank, 999999))
LIMIT %s
```

Replace `--start`/`--end` (chart-page range, no longer meaningful) with `--limit` (batch size cap) and an optional `--charted-only` flag for a targeted re-run if ever needed. Swap the bare `time.sleep(0.2)` for B3's token bucket / retry logic — this script is about to be pointed at a much larger population.

**Volume flag:** this roughly **doubles** the original doc's estimate — 7,822 (charted gap) plus uncharted artists (12,399 today, growing by ~40-70k from B1a+B1b) pushes this to an estimated **40-50k+ `artist.getSimilar` calls**, another ~3 hours at the B3 token-bucket rate. **This is a one-off/periodic manual script run, not something to wire into `weekly_snapshot.yml`** — run in capped batches via `--limit` (checkpointed safely by the existing `NOT EXISTS` resumability) rather than one unbounded multi-hour foreground session.

**Verification:** `count(distinct artist_id)` on `artist_similarities` climbs toward the full population; a query joining against `weekly_charts` with `NOT EXISTS` now returns >0 rows (previously always 0 by construction).

**Effort for B1 overall:** 3-4 days engineering (B1a ~1 day, B1b ~1 day, B1c ~1 day), plus separate multi-hour backfill wall-clock time (can run in background/overnight).

**B1c actual result (2026-08-09):** ran to completion — 35,726 artists processed, `artist_similarities` went from 1,986 → 39,495 source artists / 788,324 rows. Bigger side effect than estimated: `artist.getSimilar` results introduce brand-new artists via `get_or_create_artist`, and this alone pulled `artists` from 39,685 → 113,408 (+73,723). DB size hit 309 MB (60% of Neon's 512 MB free tier), and a weekly snapshot over the full 113,408 population would need ~7.9 hours — over GitHub Actions' 360-minute hard cap. See the population-scoping section below for the fix.

---

## Population scoping (post-B1c)

**Decision:** the 73,723 artists discovered purely as `getSimilar` targets are not snapshotted weekly. They stay in the DB (so "similar artists" sections still show real names) but don't get their own growth tracking unless independently seeded.

**Tracked-population definition**, used in both `snapshot_artists.py`'s worklist and `seed_similar_artists.py`'s source-selection query:
```sql
EXISTS (SELECT 1 FROM weekly_charts wc WHERE wc.artist_id = a.id)
OR EXISTS (SELECT 1 FROM genre_artists ga WHERE ga.artist_id = a.id)
OR EXISTS (SELECT 1 FROM country_artists ca WHERE ca.artist_id = a.id)
OR EXISTS (SELECT 1 FROM artist_snapshots s WHERE s.artist_id = a.id)
```
The last clause (`artist_snapshots` history) exists to preserve continuity for 4,962 pre-session artists that were seeded via the old similarity graph (before this session) and already have real growth history — 4,957 of them have the full 13 weeks (2026-05-10 → 2026-08-02). Cutting them would stall complete trajectories for no engineering benefit; the extra `OR EXISTS` is trivial.

Verified live: tracked population is 37,436 artists (~2.6h weekly runtime at 4 req/s) and the `seed_similar_artists.py` source query, with the same filter applied, returns only 190 tracked artists still missing outgoing edges — bounded, so a future periodic re-run won't recurse into the satellite population and re-explode it.

No `artists` or `artist_similarities` rows were deleted — this only scopes which artists get pulled into future `snapshot_artists.py` and `seed_similar_artists.py` runs.

---

## B4 — Workflow changes (`.github/workflows/weekly_snapshot.yml`)

Current file: single job, no timeout, no concurrency group, one cron trigger, `--date` not passed explicitly.

Originally sized against a ~50k-artist estimate (`timeout-minutes: 330`, a catch-up cron 5h later to cover the gap to GitHub's 360-min cap). With the population now scoped to ~37,436 tracked artists (~2.6h expected), that time pressure is gone — revised below.

1. **`timeout-minutes: 180`** — comfortable buffer over the ~2.6h estimate, no longer needs to hug GitHub's 360-min ceiling.
2. **`concurrency: {group: weekly-snapshot, cancel-in-progress: false}`** at the workflow level — prevents a manual dispatch or the catch-up trigger overlapping the scheduled run.
3. **Split into two jobs**: `snapshot` (checkout → pipeline/snapshot_artists.py) and `rebuild` (`needs: snapshot`, `if: always()` → dbt run → generate_stats → revalidate → commit/push). Today a snapshot failure means dbt/stats never run at all that week, even though B3's batched commits may have landed a useful partial update.
4. **Pin the snapshot date explicitly**, computed once and passed to both jobs via `outputs` (belt-and-suspenders — `week_anchor()` already self-heals across midnight/catch-up runs, resolved 2026-08-03 — but this guarantees both jobs and a human reading the log agree on one literal date rather than trusting two Python processes' clocks).
5. **Catch-up trigger** — second `schedule` cron ~5h after the first (`0 14 * * 0`). No longer load-bearing for time budget (180-min single-job window already covers the ~2.6h estimate), but kept as cheap insurance for a bad-day retry — already-idempotent `NOT EXISTS`/`ON CONFLICT` design makes this a safe no-op if the primary run finished cleanly, or a resumption if it didn't.

**Verification:** `workflow_dispatch` run confirms both jobs execute and `rebuild` still runs if `snapshot` is forced to fail; confirm the catch-up cron shows as a fast no-op after a normal Sunday, not a full re-fetch.

**Effort:** 0.5-1 day.

---

## Effort summary & sequencing

| Order | Item | Effort |
|---|---|---|
| 1 | B2 — `weekly_charts` constraint | ~1 hour |
| 2 | B3 — concurrency refactor + tests | 1.5-2 days |
| 3 | B1a — tag genre expansion | ~1 day |
| 4 | B1b — geo backfill | ~1 day |
| 5 | B1c — similarity expansion | ~1 day + hours of backfill runtime |
| 6 | Population scoping (post-B1c) | ~1-2 hours |
| 7 | B4 — workflow changes | 0.5-1 day |

**Total: ~5-6 days engineering**, plus separate wall-clock backfill time and months before newly-seeded artists accumulate comparable weekly history.

## Risks

1. ~~B1's added volume (~40-70k new artists, then ~40-50k similarity calls) roughly doubles the weekly snapshot population~~ — **realized and resolved**: B1c's actual growth (+73,723 artists) was well past this estimate, fixed via population scoping (see above) rather than by making the weekly snapshot job itself bigger.
2. ~~`chart.getTopTags` and `geo.getTopArtists` pagination/params aren't yet confirmed from code~~ — resolved during B1a/B1b: both smoke-tested live; `chart.getTopTags` caps at ~100 unique tags regardless of paging, `geo.getTopArtists` needs exact ISO 3166 short names (`Korea, Republic of`, `Viet Nam`, `Russian Federation`), not casual ones.
3. Tag/country name collisions — normalize in Python before insert; neither new table has a normalized unique index like `artists` does. (Resolved: `seed_genre_artists.py` lowercases/dedupes before insert.)
4. The similarity expansion is large enough to be its own multi-hour operation — must stay out of `weekly_snapshot.yml`, run manually in capped batches. (Confirmed: full B1c run took ~32 hours wall-clock.)
5. `last_error_code`/`last_error_at` must land in B3 before B1's population growth, or the first snapshot over the enlarged population re-discovers every dead artist from scratch weekly. (Resolved, landed in B3.)
6. Neon storage — re-check `pg_database_size` after B1 completes; the "~year out" estimate predates both the 145 MB (vs. 53 MB) current reading and B1's population growth. **Realized**: hit 309 MB (60% of the 512 MB free tier) after B1c. Population scoping caps future *snapshot* growth to the tracked population, but the 113,408-row `artists`/788k-row `artist_similarities` tables themselves aren't shrinking — worth re-checking `pg_database_size` again after a few weeks of the new scoped snapshot cadence to see the actual growth curve before deciding whether a Neon plan upgrade is needed.
