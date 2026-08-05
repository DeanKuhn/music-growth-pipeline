{{
    config(
        materialized='table',
        indexes=[
            {'columns': ['artist_id'], 'unique': True},
            {'columns': ['slug'], 'unique': True},
            {'columns': ['size_band']},
        ]
    )
}}

with base as (

    select * from {{ ref('int_artist_base') }}

),

series as (

    select
        artist_id,
        count(*) as weeks_tracked,
        min(snapshot_date) as series_start_date,
        max(snapshot_date) as series_end_date,

        (array_agg(listeners order by snapshot_date asc))[1]
            as starting_listeners,
        (array_agg(listeners order by snapshot_date desc))[1]
            as latest_listeners,
        (array_agg(playcount order by snapshot_date desc))[1]
            as latest_playcount,

        avg(listener_pct_change) as avg_weekly_pct_change

    from {{ ref('api_artist_timeseries') }}
    group by artist_id

),

growth as (

    select
        artist_id,
        weeks_tracked,
        series_start_date,
        series_end_date,
        starting_listeners,
        latest_listeners,
        latest_playcount,
        round(avg_weekly_pct_change, 2) as avg_weekly_pct_change,

        latest_listeners - starting_listeners as total_listener_delta,

        case when weeks_tracked >= 2 then
            round(
                (latest_listeners - starting_listeners)::numeric /
                nullif(starting_listeners, 0) * 100, 2
            )
        end as total_pct_growth

    from series

),

artist_genres as (

    select
        ga.artist_id,
        array_agg(g.genre order by ga.rank_in_genre) as genres,
        (array_agg(g.genre order by ga.rank_in_genre))[1] as primary_genre
    from {{ ref('stg_genre_artists') }} ga
    join {{ ref('stg_genres') }} g using (genre_id)
    group by ga.artist_id

),

joined as (

    select
        b.artist_id,
        b.display_name,
        b.mbid,
        b.name_norm,
        b.slug,
        b.is_display_safe,

        t.tier,
        t.min_page,
        t.global_rank,

        b.size_band,
        b.size_band_sort,
        b.listener_percentile,

        coalesce(ag.genres, array[]::text[]) as genres,
        ag.primary_genre,

        g.weeks_tracked,
        g.series_start_date,
        g.series_end_date,
        g.starting_listeners,
        g.latest_listeners,
        g.latest_playcount,
        g.total_listener_delta,
        g.total_pct_growth,
        g.avg_weekly_pct_change

    from base b
    left join {{ ref('artist_tiers') }} t using (artist_id)
    left join growth g using (artist_id)
    left join artist_genres ag using (artist_id)

),

-- Ranked within size_band, not tier. "unranked" is an observation gap that
-- spans the full listener range, so a percentile against it is meaningless.
ranked as (

    select
        artist_id,
        round(percent_rank() over (
            partition by size_band order by total_pct_growth
        )::numeric, 4) as pct_rank_in_size_band,
        round(percent_rank() over (
            partition by primary_genre order by total_pct_growth
        )::numeric, 4) as pct_rank_in_genre
    from joined
    where total_pct_growth is not null

),

final as (

    select
        j.*,
        r.pct_rank_in_size_band,
        case when j.primary_genre is not null
             then r.pct_rank_in_genre end as pct_rank_in_genre
    from joined j
    left join ranked r using (artist_id)

)

select * from final
