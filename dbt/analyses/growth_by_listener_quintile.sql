{% set series_start_date = var('series_start_date', '2026-05-10') %}

with bounded as (

    select artist_id, listeners, snapshot_date
    from {{ ref('stg_artist_snapshots') }}
    where snapshot_date >= date '{{ series_start_date }}'

),

agg as (

    select
        artist_id,
        count(distinct snapshot_date) as weeks_tracked,
        (array_agg(listeners order by snapshot_date asc))[1]
            as starting_listeners,
        (array_agg(listeners order by snapshot_date desc))[1]
            as latest_listeners
    from bounded
    group by artist_id

),

growth as (

    select
        artist_id,
        starting_listeners,
        latest_listeners,
        100.0 * (latest_listeners - starting_listeners) / starting_listeners
            as total_pct_growth,
        ntile(5) over (order by starting_listeners) as listener_quintile
    from agg
    where starting_listeners > 0

)

select
    listener_quintile,
    count(*)                    as artists,
    min(starting_listeners)     as band_min,
    max(starting_listeners)     as band_max,
    round(avg(total_pct_growth)::numeric, 2) as avg_pct_growth,
    round(percentile_cont(0.5)
        within group (order by total_pct_growth)::numeric, 2)
        as median_pct_growth,
    round(percentile_cont(0.9)
        within group (order by total_pct_growth)::numeric, 2)
        as p90_pct_growth
from growth
group by listener_quintile
order by listener_quintile