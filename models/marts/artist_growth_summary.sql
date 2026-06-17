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

        min(
            g.listeners) filter (where g.previous_listeners is null
        ) as starting_count,

        max(g.listeners) as ending_count,

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

