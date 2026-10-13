{{ config(materialized='table') }}

with base as (

    select * from {{ ref('int_artist_base') }}

),

-- Fixed panel: only artists whose series starts on the first week of the
panel as (

    select artist_id
    from {{ ref('api_artist_timeseries') }}
    group by artist_id
    having min(snapshot_date) = (
        select min(snapshot_date) from {{ ref('api_artist_timeseries') }}
    )

),

primary_genre as (

    select
        ga.artist_id,
        (array_agg(g.genre order by ga.rank_in_genre))[1] as genre
    from {{ ref('stg_genre_artists') }} ga
    join {{ ref('stg_genres') }} g using (genre_id)
    group by ga.artist_id

),

-- One row per artist per cohort they belong to. Adding a cohort type here is
-- the only change needed — the aggregation below is written once.
membership as (

    select artist_id, 'all' as cohort_type, 'all' as cohort_key
    from base join panel using (artist_id)

    union all

    select artist_id, 'size_band' as cohort_type, size_band as cohort_key
    from base join panel using (artist_id)

    union all

    select pg.artist_id, 'genre' as cohort_type, pg.genre as cohort_key
    from primary_genre pg
    join base using (artist_id)
    join panel using (artist_id)

),

observations as (

    select
        m.cohort_type,
        m.cohort_key,
        ts.snapshot_date,
        ts.listeners_indexed,
        ts.listener_pct_change
    from membership m
    join {{ ref('api_artist_timeseries') }} ts using (artist_id)

),

aggregated as (

    select
        cohort_type,
        cohort_key,
        snapshot_date,

        count(*) as artist_count,

        round(percentile_cont(0.25) within group (
            order by listeners_indexed)::numeric, 2) as p25_indexed,
        round(percentile_cont(0.50) within group (
            order by listeners_indexed)::numeric, 2) as median_indexed,
        round(percentile_cont(0.75) within group (
            order by listeners_indexed)::numeric, 2) as p75_indexed,

        -- Median of the week-over-week changes, not the change in the median:
        -- the two differ, and this one answers "what did a typical artist do
        -- this week". Null in week 1, where no artist has a previous week.
        round(percentile_cont(0.50) within group (
            order by listener_pct_change)::numeric, 2) as median_pct_change

    from observations
    group by cohort_type, cohort_key, snapshot_date

    -- Small genres produce a median that jumps around on a chart. Filter here
    -- so the x-axis stays contiguous once week_number is assigned below.
    having count(*) >= {{ var('min_cohort_size', 20) }}

),

final as (

    select
        cohort_type,
        cohort_key,
        snapshot_date,

        -- Numbered per cohort, not copied from the artist series: artists
        -- seeded at different times disagree on which week a date is.
        dense_rank() over (
            partition by cohort_type, cohort_key order by snapshot_date
        ) as week_number,

        artist_count,
        p25_indexed,
        median_indexed,
        p75_indexed,
        median_pct_change

    from aggregated

)

select * from final
