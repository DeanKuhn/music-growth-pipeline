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

1. **Resolved (2026-08-05).** Took option 1 below.

   The problem: the weekly workflow ran on 2026-08-02 (commit `27c9aa6`) and pushed a `data/pipeline_stats.json` containing a three-tier `growth_by_tier` block — **indie 3.42% · mainstream 2.76% · unranked 1.42%**. deanslist.dev fetches that file and rebuilds nightly at 3:30am UTC, so those tiers were on the public site, and they **contradicted the README**: the site showed the *smallest* cohort (`unranked`, median listeners 122k, below indie's 322k) growing *slowest*, against the README's monotonic size-quintile finding. Compounding it, `unranked` is not a size band at all but an observation gap (see Issue #2) — presenting it as a peer of indie/mainstream implied a hierarchy that doesn't exist.

   **Fix applied.** `pipeline/generate_stats.py` now emits `growth_by_size_quintile` in place of `growth_by_tier`, reproducing `dbt/analyses/growth_by_listener_quintile.sql` inline against `stg_artist_snapshots` bounded at `SERIES_START_DATE = '2026-05-10'`. Output matches the published README figures exactly: median 2.67 / 2.46 / 2.10 / 1.76 / 1.71, with `band_min`/`band_max` carried through so the site can label rows by listener range rather than by quintile number.

   ⚠ **Do not compute this from `artist_growth_summary`.** It's the tempting shortcut — the mart already has `starting_count` and `total_pct_growth`, so it's a one-line `ntile(5)` — but it inherits `listener_growth`'s window, which keeps the 05-03 snapshot and the 04-27→05-10 13-day delta labelled as a week. It yields 2.77 / 2.52 / 2.14 / 1.79 / 1.77: same direction and monotonicity, but numbers the README doesn't contain, which is a milder version of the bug being fixed here.

   Also dropped in the same change: `min_page` on the `top_growing_artists` rows. It was chart-page depth sitting next to a fastest-growers list, one inference away from the retracted page-depth claim. The list is still filtered to indie artists with >5,000 starting listeners — site copy must say so, or a reader assumes it spans all 22k.

   **Residual, not yet decided.** The README publishes *frozen* numbers verified 2026-08-03; the site now recomputes weekly and will drift (2.67 → 2.68 → …). Not a contradiction — direction and monotonicity are stable — but the site should render the window (`2026-05-10 → {latest_snapshot}, recomputed weekly`) so a reader knows why it doesn't match the README to two decimals.
2. **Resolved (2026-08-07).** `unranked` spanned 1 → 5,540,679 listeners (median 122k, *below* indie's 322k), confirming it was an observation gap, not a size band. `api_cohort_weekly` already cohorted on `size_band`, never `tier`; see Issue #7 for the project-wide follow-through that removed `tier` entirely.
3. **Open (Stage B).** Similarity coverage is an inverted U, not a decline with depth: pages 1-250 = **0.1%**, 251-750 = 26.6%, 751-1250 = 31.0%, 1251-1750 = 17.4%, 1751-2000 = 12.4%, unranked = 0%. Only 1,986 of 9,808 charted artists have outgoing edges; 7,822 still need seeding. **Display side mitigated 2026-08-05:** `api_artist_similar` unions both edge directions, so 14,325 artists now show a similar-artists table instead of 1,982. The seeding gap itself is unchanged — symmetrising redistributes the edges we have, it does not create new ones.
4. **Open (Stage B).** Genre coverage 6,829 of 22,207 (30.8%). `tags` is still empty (0 rows).
5. **Resolved (2026-08-03).** 8,930 artists lack chart/genre/outgoing-similarity rows, but **7,766 (87%) are the _target_ of a similarity edge** — created by `pipeline/seed_similar_artists.py` as the far side of a pair, with no outgoing edge because that script only queries charted artists. Expected behaviour. Leaves 1,164 true orphans, consistent with the `pipeline/seed_genre_artists.py` partial-failure hypothesis. Harmless.
6. **Fixed (2026-08-03).** `pipeline/snapshot_artists.py` now anchors to the current week's Sunday via `week_anchor()` instead of `date.today()`, with `--date` to pin a resumed run. A run crossing UTC midnight no longer splits the population across two snapshot dates. Unblocks Stage B concurrency.
7. **Resolved (2026-08-07).** `tier` (`mainstream`/`indie`/`unranked`, derived from Last.fm chart page depth) removed project-wide — dbt marts, API layer, web UI, and README — and replaced with `size_band` (listener-count based) as the sole size classification. Chart position reflects recent scrobble activity, not listener count, so a well-known artist could show as `indie` or `unranked` while a currently-buzzing small artist charted high; this had already prompted the `size_band` cohort fix in Issue #2, but `tier` remained live everywhere else. Raw chart-position data (`min_page`, `global_rank`) is preserved in the renamed `artist_chart_position` mart, just no longer packaged as a classification. README's cross-sectional section (previously a mainstream-vs-indie comparison) was recomputed by `size_band`: the old framing implied a monotone ~4x engagement gap between two groups, but the full 7-band breakdown shows plays-per-listener is U-shaped, not monotone — it dips through the middle bands and rises at both the smallest and largest ends.

## Completed Build Log
Stages A1-A6 of the web app (2026-07-31 → 2026-08-03): pg_trgm/unaccent extensions + 4 indexes, `tags` DDL reconciled; deduped 3,045 artist rows and extracted shared `pipeline/db.py`/`pipeline/lastfm.py`; `artist_tiers` left join and chart pages 51-499 backfilled; marts materialized as tables with `int_artist_base` built; `app_readonly` role created and verified. A4 (genre backfill via `artist.getTopTags`) was deferred to Stage B.
