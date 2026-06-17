-- longitudinal_analysis.sql
-- Longitudinal analysis: listener growth over 7 weeks (2026-05-10 to 2026-06-14)
-- Queries run against dbt mart models built on top of weekly artist_snapshots.
-- 24,770 artists tracked. Mainstream = pages 1-50 (250 artists), Indie = pages 51+ (24,520 artists).


-- QUERY 1: Overall growth rate by tier
-- Finding: underground artists (pages 1000+) grow at nearly 3x the median rate
-- of mainstream artists. Growth rate increases as chart page depth increases,
-- suggesting smaller artists are accumulating listeners faster in percentage terms.

select
    tier,
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
group by tier
order by tier;


-- QUERY 2: Week-over-week aggregate listener growth by tier
-- Finding: both tiers grow at roughly 0.2% per week in aggregate. Mainstream
-- artists add more listeners in absolute terms due to their larger base,
-- while indie artists grow faster on a per-artist percentage basis.

select
    snapshot_date,
    tier,
    total_listeners,
    artist_count,
    listener_delta,
    listener_pct_change

from {{ ref('weekly_growth_by_tier') }}
order by tier, snapshot_date;


-- QUERY 3: Fastest-growing indie artists (7-week period)
-- Finding: the fastest-growing artists are concentrated in the deepest chart
-- pages (1000+), with several growing 100-400% over 7 weeks. Growth patterns
-- vary — some spike then decelerate (viral moment), others show steady acceleration.

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
where tier = 'indie'
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