with snapshots as (

    select
        artist_id,
        snapshot_date,
        listeners,
        lag(listeners) over (
            partition by artist_id
            order by snapshot_date
            ) as previous_listeners
    from {{ ref('stg_artist_snapshots') }}
    where snapshot_date != '2026-04-27'

),

final as (

    select
        artist_id,
        snapshot_date,
        listeners,
        previous_listeners,
        listeners - previous_listeners as listener_delta,
        round(
            (listeners - previous_listeners)::numeric /
            nullif(previous_listeners, 0) * 100, 2
        ) as listener_pct_change
    from snapshots

)

select * from final
