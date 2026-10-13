{{ config(materialized='table') }}

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
