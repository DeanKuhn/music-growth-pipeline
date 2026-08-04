with growth as (

    select * from {{ ref('listener_growth') }}

),

tiers as (

    select * from {{ ref('artist_tiers') }}

),

summary as (

    select
        t.artist_id,
        t.artist_name,
        t.tier,
        t.min_page,

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
    join tiers t on g.artist_id = t.artist_id
    group by t.artist_id, t.artist_name, t.tier, t.min_page

),

final as (

    select
        artist_id,
        artist_name,
        tier,
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

