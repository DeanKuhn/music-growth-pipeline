-- longitudinal_analysis.sql
-- Longitudinal analysis: listener growth over the tracked window.
-- Queries run against dbt mart models built on top of weekly artist_snapshots,
-- grouped by size_band (listener-count based) rather than the retired
-- mainstream/indie chart-page split — see CLAUDE.md and docs/findings.md.


-- QUERY 1: Overall growth rate by size_band

select
    size_band,
    size_band_sort,
    count(*) as artist_count,
    round(avg(total_pct_growth), 2) as avg_pct_growth,
    round(
        percentile_cont(0.5) within group (order by total_pct_growth)::numeric, 2
    ) as median_pct_growth,
    round(
        percentile_cont(0.9) within group (order by total_pct_growth)::numeric, 2
    ) as p90_pct_growth

from {{ ref('artist_growth_summary') }}
where weeks_tracked >= 6
group by size_band, size_band_sort
order by size_band_sort;


-- QUERY 2: Week-over-week aggregate listener growth by size_band

select
    snapshot_date,
    size_band,
    total_listeners,
    artist_count,
    listener_delta,
    listener_pct_change

from {{ ref('weekly_growth_by_size_band') }}
order by size_band, snapshot_date;


-- QUERY 3: Fastest-growing smaller artists (size_band_sort <= 4, i.e. under
-- 250k starting listeners — the same small/large boundary used elsewhere)

select
    artist_name,
    min_page,
    starting_count as listeners_start,
    ending_count as listeners_latest,
    total_listener_delta,
    total_pct_growth,
    round(avg_weekly_pct_change, 2) as avg_weekly_pct_change,
    weeks_tracked

from {{ ref('artist_growth_summary') }}
where size_band_sort <= 4
    and weeks_tracked >= 6
    and starting_count > 5000
order by total_pct_growth desc
limit 25;


-- QUERY 4: Growth rate by genre
-- Finding: EDM artists show the highest median growth rate, while classical
-- and metal artists show the lowest. Genre may be a stronger predictor of
-- growth velocity than chart position alone.

select
    genre,
    artist_count,
    avg_total_pct_growth,
    median_total_pct_growth,
    avg_weekly_pct_change,
    avg_listeners

from {{ ref('genre_growth') }}
order by median_total_pct_growth