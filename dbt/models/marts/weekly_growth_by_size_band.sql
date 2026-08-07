with growth as (

    select * from {{ ref('listener_growth') }}

),

bands as (

    select * from {{ ref('int_artist_base') }}

),

weekly_totals as (

    select
        g.snapshot_date,
        b.size_band,
        sum(g.listeners) as total_listeners,
        count(distinct g.artist_id) as artist_count

    from growth g
    join bands b on g.artist_id = b.artist_id
    group by g.snapshot_date, b.size_band

),

with_lag as (

    select
        snapshot_date,
        size_band,
        total_listeners,
        artist_count,
        lag(total_listeners) over (
            partition by size_band
            order by snapshot_date
        ) as previous_total_listeners
    from weekly_totals

),

final as (

    select
        snapshot_date,
        size_band,
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
