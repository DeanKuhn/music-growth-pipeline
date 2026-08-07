with growth as (

    select * from {{ ref('listener_growth') }}

),

base as (

    select * from {{ ref('int_artist_base') }}

),

chart_position as (

    select * from {{ ref('artist_chart_position') }}

),

summary as (

    select
        b.artist_id,
        b.artist_name,
        b.size_band,
        b.size_band_sort,
        cp.min_page,

        -- Take the first and last observation by date, not min()/max().
        -- Last.fm occasionally revises listener counts downward, and max()
        -- would silently report a stale peak as the current value.
        (array_agg(g.listeners order by g.snapshot_date asc))[1]
            as starting_count,

        (array_agg(g.listeners order by g.snapshot_date desc))[1]
            as ending_count,

        avg(g.listener_pct_change) as average_listener_pct,

        count(g.snapshot_date) as weeks_tracked

    from growth g
    join base b on g.artist_id = b.artist_id
    left join chart_position cp on g.artist_id = cp.artist_id
    group by b.artist_id, b.artist_name, b.size_band, b.size_band_sort, cp.min_page

),

final as (

    select
        artist_id,
        artist_name,
        size_band,
        size_band_sort,
        min_page,
        starting_count,
        ending_count,
        ending_count - starting_count as total_listener_delta,

        round(
            (ending_count - starting_count)::numeric /
            nullif(starting_count, 0) * 100, 2
        ) as total_pct_growth,

        average_listener_pct,
        weeks_tracked

    from summary

)

select * from final
