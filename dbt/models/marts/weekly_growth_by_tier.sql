with growth as (

    select * from {{ ref('listener_growth') }}

),

tiers as (

    select * from {{ ref('artist_tiers') }}

),

weekly_totals as (

    select
        g.snapshot_date,
        t.tier,
        sum(g.listeners) as total_listeners,
        count(distinct g.artist_id) as artist_count

    from growth g
    join tiers t on g.artist_id = t.artist_id
    group by g.snapshot_date, t.tier

),

with_lag as (

    select
        snapshot_date,
        tier,
        total_listeners,
        artist_count,
        lag(total_listeners) over (
            partition by tier
            order by snapshot_date
        ) as previous_total_listeners
    from weekly_totals

),

final as (

    select
        snapshot_date,
        tier,
        total_listeners,
        artist_count,
        previous_total_listeners,
        total_listeners - previous_total_listeners as listener_delta,
        round(
            (total_listeners - previous_total_listeners):: numeric /
            nullif(previous_total_listeners, 0) * 100, 2
        ) as listener_pct_change
    from with_lag

)

select * from final