-- Narrow serving table for GET /api/genres. Exists so that route can read
-- the api/ layer like every other endpoint instead of reaching into
-- genre_stats/genre_growth directly, which would break the "API never
-- queries the marts" rule (see CLAUDE.md's dbt/models/api/ entry).
--
-- genre_stats and genre_growth disagree on population: genre_stats covers
-- every genre with >=1 artist; genre_growth requires weeks_tracked >= 6 and
-- drops genres under 50 qualifying artists. The left join means small/new
-- genres appear with growth columns null rather than vanishing outright.

{{
    config(
        materialized='table',
        indexes=[
            {'columns': ['genre_id'], 'unique': True},
            {'columns': ['genre'], 'unique': True},
        ]
    )
}}

with stats as (

    select * from {{ ref('genre_stats') }}

),

growth as (

    select * from {{ ref('genre_growth') }}

),

final as (

    select
        s.genre_id,
        s.genre,
        s.artist_count,
        s.avg_listeners,
        s.avg_plays_per_listener,
        s.small_count,
        s.large_count,

        g.avg_total_pct_growth,
        g.median_total_pct_growth,
        g.avg_weekly_pct_change as growth_avg_weekly_pct_change

    from stats s
    left join growth g on s.genre = g.genre

)

select * from final
