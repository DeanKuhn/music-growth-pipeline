# Findings & Data-Quality Log

Detail behind the summaries in CLAUDE.md. Not loaded into agent context by default.

## Cross-Sectional Findings (2026-04-27)
- Mainstream artists average 3.6M listeners vs indie 348K (~10x)
- Plays-per-listener ratio: mainstream median 74.76 vs indie 17.69 (~4x gap, consistent across full distribution)
- Listener count distributions do not overlap — indie P90 (782K) is below mainstream P25 (2.3M)
- Caveat: mainstream artists have older catalogues, so accumulated playcounts may partly explain the ratio gap

## Longitudinal Findings
- ⚠ **Retracted:** "growth increases with chart page depth" (underground 2.20% vs mainstream 1.55%, 2026-05-10 to 2026-06-14). Does not survive the full-tier fix — see Issue #1. Do not restate in portfolio copy.
- **Replacement finding — published in README 2026-08-03. Use this.** Median total growth falls monotonically with artist size, by **starting**-listener quintile: 2.67% / 2.46% / 2.10% / 1.76% / 1.71% (smallest → largest, 4,441/4,440 artists each). Window 2026-05-10 → 2026-08-02, 13 snapshots, 22,201 artists (the 6 short of 22,207 have no snapshot in-window or a zero starting count). Avg growth 7.61% / 4.32% / 3.07% / 2.47% / 2.07%; P90 16.88% / 10.24% / 6.53% / 5.03% / 3.96%. No gaps or reversals.
  - Quintiles cut on **starting** listeners, not latest — cutting on latest lets fast growers migrate upward and flattens the gradient (it yields 2.52 / 2.45 / 2.13 / 1.79 / 1.74).
  - ⚠ These supersede the figures first recorded here (2.60 / 2.51 / 2.16 / 1.81 / 1.79). Neither the starting- nor latest-listener cut reproduces those exactly, and the original query was not saved, so its population or window differed slightly. The direction, monotonicity, and magnitude are unaffected. Query is saved at `dbt/analyses/growth_by_listener_quintile.sql` — rerun it before republishing these numbers.
- P90 growth for underground artists (9.16%) is 3x higher than mainstream (2.75%) — a fat tail of fast-movers
- Both tiers grow ~0.2% per week in aggregate; mainstream adds more listeners in absolute terms due to larger base
- Fastest-growing indie artists (100-400% over 7 weeks) concentrate in pages 1500+; split between viral spikes and steady acceleration
- EDM has the highest median genre growth rate; classical and metal are slowest
- Caveat: Last.fm listener counts are cumulative all-time and can only increase — "growth" reflects new scrobblers, not active monthly listeners

## Data-Quality Issues (all re-measured 2026-08-03)

1. **Open — needs a narrative decision, not more analysis.** Tier medians are indie 3.31%, mainstream 2.76%, **unranked 1.39%** — non-monotonic, so the chart-depth claim stays retracted. The listener-quintile cut above is monotonic and is the recommended replacement. Decide whether to publish it and close this.
2. **Fix built, not yet applied.** `unranked` spans 1 → 5,540,679 listeners (median 122k, *below* indie's 322k), confirming it is an observation gap, not a size band. `int_artist_base` already ships `listener_percentile` and `size_band`. Remaining work is a design decision: `api_cohort_weekly` must cohort on `size_band`, never `tier`.
3. **Open (Stage B).** Similarity coverage is an inverted U, not a decline with depth: pages 1-250 = **0.1%**, 251-750 = 26.6%, 751-1250 = 31.0%, 1251-1750 = 17.4%, 1751-2000 = 12.4%, unranked = 0%. Only 1,986 of 9,808 charted artists have outgoing edges; 7,822 still need seeding.
4. **Open (Stage B).** Genre coverage 6,829 of 22,207 (30.8%). `tags` is still empty (0 rows).
5. **Resolved (2026-08-03).** 8,930 artists lack chart/genre/outgoing-similarity rows, but **7,766 (87%) are the _target_ of a similarity edge** — created by `pipeline/seed_similar_artists.py` as the far side of a pair, with no outgoing edge because that script only queries charted artists. Expected behaviour. Leaves 1,164 true orphans, consistent with the `pipeline/seed_genre_artists.py` partial-failure hypothesis. Harmless.
6. **Fixed (2026-08-03).** `pipeline/snapshot_artists.py` now anchors to the current week's Sunday via `week_anchor()` instead of `date.today()`, with `--date` to pin a resumed run. A run crossing UTC midnight no longer splits the population across two snapshot dates. Unblocks Stage B concurrency.

## Completed Build Log
Stages A1-A6 of the web app (2026-07-31 → 2026-08-03): pg_trgm/unaccent extensions + 4 indexes, `tags` DDL reconciled; deduped 3,045 artist rows and extracted shared `pipeline/db.py`/`pipeline/lastfm.py`; `artist_tiers` left join and chart pages 51-499 backfilled; marts materialized as tables with `int_artist_base` built; `app_readonly` role created and verified. A4 (genre backfill via `artist.getTopTags`) was deferred to Stage B.
